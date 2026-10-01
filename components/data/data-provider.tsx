'use client';

/**
 * Application service layer.
 *
 * The provider owns all write operations (including task history logging),
 * keeps a single in-memory snapshot of the data and persists every change
 * through the repository abstraction. Components consume it via `useData()`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { addDays, todayISO } from '@/lib/dates';
import { useAuth } from '@/components/auth/auth-provider';
import { createRepository, repositoryKind, type AppRepository } from '@/lib/store';
import { dailyPriorityTimerTaskId, isOpenTask } from '@/lib/selectors';
import {
  blockingTimerTask,
  checkpointTimingPatch,
  elapsedActiveSeconds,
  interruptedTimerPatch,
  isTimerPaused,
  isTimerRunning,
  pauseTimingPatch,
  settleTimingPatch,
} from '@/lib/timer';
import type {
  AppData,
  DailyPriority,
  Goal,
  GoalInput,
  Idea,
  InboxItem,
  MonthlyPriority,
  Project,
  ProjectInput,
  Settings,
  Task,
  TaskInput,
  TaskStatus,
  WeeklyPriority,
  WellbeingDay,
  WellbeingHabit,
  ISODate,
} from '@/lib/types';
import { emptyData } from '@/lib/store/defaults';

const BACKUP_KEY = 'pace.backup.v1';
const TIMER_CHECKPOINT_INTERVAL_MS = 10_000;

export interface Toast {
  id: number;
  message: string;
}

export interface WeeklyPriorityInputLocal {
  week: string;
  title: string;
  primary?: boolean;
}

export interface MonthlyPriorityInputLocal {
  month: string;
  title: string;
  goalId?: string;
  projectId?: string;
}

export type InboxConversion = 'task' | 'someday' | 'project' | 'goal' | 'idea';

export interface DataActions {
  /* Tasks */
  addTask(input: TaskInput): Promise<Task>;
  updateTask(id: string, patch: Partial<Task>): Promise<void>;
  deleteTask(id: string): Promise<void>;
  completeTask(id: string): Promise<void>;
  reopenTask(id: string): Promise<void>;
  /** Start (or restart) the task timer — status becomes in_progress. */
  startTask(id: string): Promise<void>;
  /** Pause the running timer, preserving the time accumulated so far. */
  pauseTask(id: string): Promise<void>;
  /** Resume a paused timer, continuing from the accumulated time. */
  resumeTask(id: string): Promise<void>;
  /** Stop the timer, store actualDurationSeconds and mark the task completed. */
  finishTask(id: string): Promise<void>;
  cancelTask(id: string): Promise<void>;
  /** Defer a task (increments postponement count). */
  postponeTask(id: string, to: ISODate | 'tomorrow' | 'someday', note?: string): Promise<void>;
  /** Plan/reschedule a task onto a date (or unschedule it). */
  moveTaskToDate(id: string, date?: ISODate): Promise<void>;
  setTaskDeadline(id: string, dueDate?: ISODate): Promise<void>;
  setTaskProject(id: string, projectId?: string): Promise<void>;
  breakDownTask(id: string, titles: string[], scheduledDate?: ISODate): Promise<Task[]>;

  /* Daily priorities */
  setDailyPriority(title: string, date?: ISODate): Promise<DailyPriority>;
  /** Start or resume the normal Task timer associated with a daily priority. */
  startDailyPriorityTimer(id: string): Promise<Task | null>;
  updateDailyPriority(id: string, patch: Partial<DailyPriority>): Promise<void>;
  toggleDailyPriority(id: string): Promise<void>;
  deleteDailyPriority(id: string): Promise<void>;

  /* Weekly priorities */
  addWeeklyPriority(input: WeeklyPriorityInputLocal): Promise<WeeklyPriority>;
  updateWeeklyPriority(id: string, patch: Partial<WeeklyPriority>): Promise<void>;
  toggleWeeklyPriority(id: string): Promise<void>;
  deleteWeeklyPriority(id: string): Promise<void>;

  /* Monthly priorities */
  addMonthlyPriority(input: MonthlyPriorityInputLocal): Promise<MonthlyPriority>;
  updateMonthlyPriority(id: string, patch: Partial<MonthlyPriority>): Promise<void>;
  toggleMonthlyPriority(id: string): Promise<void>;
  deleteMonthlyPriority(id: string): Promise<void>;

  /* Projects & goals */
  addProject(input: ProjectInput): Promise<Project>;
  updateProject(id: string, patch: Partial<Project>): Promise<void>;
  deleteProject(id: string): Promise<void>;
  addGoal(input: GoalInput): Promise<Goal>;
  updateGoal(id: string, patch: Partial<Goal>): Promise<void>;
  deleteGoal(id: string): Promise<void>;

  /* Inbox */
  addInboxItem(title: string, note?: string): Promise<InboxItem>;
  deleteInboxItem(id: string): Promise<void>;
  convertInboxItem(id: string, kind: InboxConversion, extra?: Partial<TaskInput>): Promise<void>;

  /* Ideas */
  addIdea(input: { title: string; description?: string }): Promise<Idea>;
  updateIdea(id: string, patch: Partial<Idea>): Promise<void>;
  archiveIdea(id: string, archived?: boolean): Promise<void>;
  deleteIdea(id: string): Promise<void>;
  promoteIdea(id: string, kind: 'task' | 'project' | 'goal' | 'someday', extra?: Partial<TaskInput>): Promise<void>;

  /* Daily well-being */
  /** Check or uncheck one of today's four well-being check-ins. */
  toggleWellbeing(habit: WellbeingHabit): Promise<void>;

  /* Settings & data */
  updateSettings(patch: Partial<Settings>): Promise<void>;
  exportData(): Promise<AppData>;
  importData(data: AppData): Promise<void>;
  backupNow(): Promise<void>;
  restoreBackup(): Promise<void>;
}

export interface DataContextValue {
  ready: boolean;
  data: AppData;
  repoKind: 'local' | 'supabase';
  toasts: Toast[];
  notify: (message: string) => void;
  dismissToast: (id: number) => void;
  actions: DataActions;
}

const DataContext = createContext<DataContextValue | null>(null);

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}

let toastCounter = 0;

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [data, setData] = useState<AppData>(emptyData());
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const repoKind = repositoryKind();
  const repoRef = useRef<AppRepository | null>(null);
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // The well-being record the user last touched (kept alongside the optimistic
  // state) and a queue that serializes its writes.
  const wellbeingRef = useRef<WellbeingDay | null>(null);
  const wellbeingQueueRef = useRef<Promise<void>>(Promise.resolve());

  const notify = useCallback((message: string) => {
    const id = ++toastCounter;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /* ---------------------------------------------------------------- */
  /* Load                                                             */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;
    const repo = createRepository(user?.id);
    repoRef.current = repo;

    (async () => {
      try {
        const [storedTasks, projects, goals, inbox, ideas, dailyPriorities, weeklyPriorities, monthlyPriorities, taskHistory, wellbeingDays, settings] =
          await Promise.all([
            repo.tasks.list(),
            repo.projects.list(),
            repo.goals.list(),
            repo.inbox.list(),
            repo.ideas.list(),
            repo.dailyPriorities.list(),
            repo.weeklyPriorities.list(),
            repo.monthlyPriorities.list(),
            repo.taskHistory.list(),
            repo.wellbeingDays.list(),
            repo.settings.get(),
          ]);
        if (cancelled) return;
        // Any still-running session belongs to the previous page instance. A
        // pagehide write normally paused it precisely; if termination skipped
        // that write, stop at the task's last persisted timer checkpoint.
        const tasks = await Promise.all(
          storedTasks.map(async (task) => {
            const patch = interruptedTimerPatch(task);
            if (Object.keys(patch).length === 0) return task;
            try {
              return await repo.tasks.update(task.id, patch);
            } catch (error) {
              console.error('Could not persist interrupted timer recovery', error);
              return { ...task, ...patch };
            }
          }),
        );
        if (cancelled) return;
        const loaded: AppData = {
          tasks,
          projects,
          goals,
          inbox,
          ideas,
          dailyPriorities,
          weeklyPriorities,
          monthlyPriorities,
          taskHistory,
          wellbeingDays,
          settings,
        };
        wellbeingRef.current = wellbeingDays.find((w) => w.date === todayISO()) ?? null;
        setData(loaded);
        setReady(true);

        // Automatic carry-forward: unfinished past tasks move to today.
        // In-progress timer tasks (including sessions recovered as paused above)
        // keep their original schedule and accumulated time.
        if (settings.general.automaticCarryForward) {
          const today = todayISO();
          const stale = tasks.filter(
            (t) =>
              isOpenTask(t) &&
              t.status !== 'in_progress' &&
              t.scheduledDate !== undefined &&
              t.scheduledDate < today,
          );
          for (const t of stale) {
            const updated = await repo.tasks.update(t.id, { scheduledDate: today, status: 'today' });
            await repo.taskHistory.add({ taskId: t.id, type: 'postponed', note: 'Carried forward to today' });
            if (!cancelled) {
              setData((d) => ({ ...d, tasks: d.tasks.map((x) => (x.id === updated.id ? updated : x)) }));
            }
          }
          if (stale.length > 0 && !cancelled) {
            notify(stale.length === 1 ? '1 task carried forward to today' : `${stale.length} tasks carried forward to today`);
          }
        }
      } catch (error) {
        console.error('Could not load application data', error);
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [notify, user?.id]);

  /* ---------------------------------------------------------------- */
  /* Helpers                                                          */
  /* ---------------------------------------------------------------- */

  const logHistory = useCallback(
    async (taskId: string, type: Parameters<AppRepository['taskHistory']['add']>[0]['type'], note?: string) => {
      await repoRef.current?.taskHistory.add({ taskId, type, note });
      const all = await repoRef.current?.taskHistory.list();
      if (all) setData((d) => ({ ...d, taskHistory: all }));
    },
    [],
  );

  const patchTaskState = useCallback((task: Task) => {
    const tasks = dataRef.current.tasks.some((t) => t.id === task.id)
      ? dataRef.current.tasks.map((t) => (t.id === task.id ? task : t))
      : [...dataRef.current.tasks, task];
    dataRef.current = { ...dataRef.current, tasks };
    setData((d) => ({
      ...d,
      tasks: d.tasks.some((t) => t.id === task.id)
        ? d.tasks.map((t) => (t.id === task.id ? task : t))
        : [...d.tasks, task],
    }));
  }, []);

  const addTaskState = useCallback((task: Task) => {
    if (dataRef.current.tasks.some((t) => t.id === task.id)) {
      patchTaskState(task);
      return;
    }
    dataRef.current = { ...dataRef.current, tasks: [...dataRef.current.tasks, task] };
    setData((d) => ({
      ...d,
      tasks: d.tasks.some((t) => t.id === task.id) ? d.tasks : [...d.tasks, task],
    }));
  }, [patchTaskState]);

  const removeTaskState = useCallback((id: string) => {
    dataRef.current = { ...dataRef.current, tasks: dataRef.current.tasks.filter((t) => t.id !== id) };
    setData((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) }));
  }, []);

  /** Replace (or add) one day's well-being record in the local snapshot. */
  const applyWellbeing = useCallback((record: WellbeingDay) => {
    wellbeingRef.current = record;
    setData((d) => ({
      ...d,
      wellbeingDays: d.wellbeingDays.some((w) => w.date === record.date)
        ? d.wellbeingDays.map((w) => (w.date === record.date ? record : w))
        : [...d.wellbeingDays, record],
    }));
  }, []);

  const repo = () => {
    if (!repoRef.current) throw new Error('Repository not ready');
    return repoRef.current;
  };

  // Timer transitions and checkpoints for one task must reach the repository
  // in order (especially for Supabase requests that can resolve out of order).
  const taskWriteQueueRef = useRef(new Map<string, Promise<Task>>());
  const priorityTimerStartRef = useRef(new Map<string, Promise<Task | null>>());
  const persistTaskUpdate = useCallback((id: string, patch: Partial<Task>): Promise<Task> => {
    const previous = taskWriteQueueRef.current.get(id);
    const write = (previous ? previous.catch(() => undefined) : Promise.resolve(undefined))
      .then(() => repo().tasks.update(id, patch));
    taskWriteQueueRef.current.set(id, write);
    void write.then(
      () => { if (taskWriteQueueRef.current.get(id) === write) taskWriteQueueRef.current.delete(id); },
      () => { if (taskWriteQueueRef.current.get(id) === write) taskWriteQueueRef.current.delete(id); },
    );
    return write;
  }, []);

  /**
   * Serializes task writes: every mutation gets a per-task sequence number and
   * a server response is only applied (or rolled back) while it is still the
   * newest one. Rapid Start/Pause/Finish clicks can therefore never apply a
   * stale response on top of a newer state.
   */
  const taskSeqRef = useRef(new Map<string, number>());
  const nextTaskSeq = useCallback((id: string) => {
    const n = (taskSeqRef.current.get(id) ?? 0) + 1;
    taskSeqRef.current.set(id, n);
    return n;
  }, []);
  const isLatestTaskSeq = useCallback((id: string, seq: number) => {
    return (taskSeqRef.current.get(id) ?? 0) === seq;
  }, []);

  /**
   * Optimistically apply `patch` to a task, persist it and reconcile with the
   * repository's response. On failure the task is rolled back and a toast is
   * shown — the UI never keeps a state the backend rejected.
   */
  const applyTaskPatch = useCallback(
    async (id: string, patch: Partial<Task>, failureMessage: string): Promise<Task | null> => {
      const before = dataRef.current.tasks.find((t) => t.id === id);
      if (!before) return null;
      const seq = nextTaskSeq(id);
      patchTaskState({ ...before, ...patch });
      try {
        const updated = await persistTaskUpdate(id, patch);
        if (isLatestTaskSeq(id, seq)) patchTaskState(updated);
        return updated;
      } catch (error) {
        if (isLatestTaskSeq(id, seq)) patchTaskState(before);
        notify(failureMessage);
        console.error('Task update failed', error);
        return null;
      }
    },
    [isLatestTaskSeq, nextTaskSeq, notify, patchTaskState, persistTaskUpdate],
  );

  const startTimerForTask = useCallback(async (id: string): Promise<Task | null> => {
    const before = dataRef.current.tasks.find((t) => t.id === id);
    if (!before || before.status === 'completed' || before.status === 'cancelled') return null;
    if (isTimerRunning(before)) return before;
    return applyTaskPatch(
      id,
      { status: 'in_progress', startedAt: new Date().toISOString(), pausedAt: undefined },
      'Could not start the timer — please try again',
    );
  }, [applyTaskPatch]);

  const resumeTimerForTask = useCallback(async (id: string): Promise<Task | null> => {
    const before = dataRef.current.tasks.find((t) => t.id === id);
    if (!before || !isTimerPaused(before)) return null;
    return applyTaskPatch(
      id,
      { startedAt: new Date().toISOString(), pausedAt: undefined },
      'Could not resume the timer — please try again',
    );
  }, [applyTaskPatch]);

  const checkpointRunningTask = useCallback(
    (task: Task, nowMs: number) => {
      const patch = checkpointTimingPatch(task, nowMs);
      if (Object.keys(patch).length === 0 ||
          (patch.startedAt === task.startedAt && patch.actualDurationSeconds === task.actualDurationSeconds)) return;

      const seq = nextTaskSeq(task.id);
      patchTaskState({ ...task, ...patch });
      void persistTaskUpdate(task.id, patch).then((updated) => {
        if (isLatestTaskSeq(task.id, seq)) patchTaskState(updated);
      }).catch((error: unknown) => {
        // Keep the live in-memory timer moving. The next checkpoint or unload
        // can retry; reopening will fall back to the last durable checkpoint.
        console.error('Timer checkpoint failed', error);
      });
    },
    [isLatestTaskSeq, nextTaskSeq, patchTaskState, persistTaskUpdate],
  );

  const checkpointRunningTasks = useCallback(() => {
    const nowMs = Date.now();
    for (const task of dataRef.current.tasks) {
      if (isTimerRunning(task)) checkpointRunningTask(task, nowMs);
    }
  }, [checkpointRunningTask]);

  useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(checkpointRunningTasks, TIMER_CHECKPOINT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [checkpointRunningTasks, ready]);

  /** Persist a pause before the page becomes unavailable; never tied to visibility. */
  const pauseRunningTasksOnExit = useCallback(() => {
    const repository = repoRef.current;
    if (!repository) return;
    const nowMs = Date.now();

    for (const task of dataRef.current.tasks) {
      if (!isTimerRunning(task)) continue;
      const patch = pauseTimingPatch(task, nowMs);
      const paused = { ...task, ...patch };
      const seq = nextTaskSeq(task.id);
      patchTaskState(paused);

      // Local storage writes synchronously inside update(), which is the most
      // reliable unload path. Supabase gets a queued best-effort request; the
      // periodic checkpoints above remain the crash-safe fallback.
      const update = repository.kind === 'local'
        ? repository.tasks.update(task.id, patch)
        : persistTaskUpdate(task.id, patch);
      void update.then((updated) => {
        if (isLatestTaskSeq(task.id, seq)) patchTaskState(updated);
      }).catch((error: unknown) => {
        console.error('Could not pause timer while closing FocusDesk', error);
      });
    }
  }, [isLatestTaskSeq, nextTaskSeq, patchTaskState, persistTaskUpdate]);

  useEffect(() => {
    let closing = false;
    const onPageExit = () => {
      if (closing) return;
      closing = true;
      pauseRunningTasksOnExit();
    };
    const onPageShow = () => { closing = false; };
    // Hidden is not closed: checkpoint, but deliberately keep the timer running.
    const onVisibilityChange = () => checkpointRunningTasks();

    window.addEventListener('pagehide', onPageExit);
    window.addEventListener('beforeunload', onPageExit);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', onPageExit);
      window.removeEventListener('beforeunload', onPageExit);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [checkpointRunningTasks, pauseRunningTasksOnExit]);

  /** Shared creation helper used by inbox conversion and idea promotion. */
  const createFromTitle = useCallback(
    async (
      kind: 'task' | 'someday' | 'project' | 'goal' | 'idea',
      title: string,
      description?: string,
      extra?: Partial<TaskInput>,
    ) => {
      const r = repo();
      if (kind === 'task' || kind === 'someday') {
        const task = await r.tasks.create({
          title,
          description,
          status: kind === 'someday' ? 'someday' : undefined,
          ...extra,
        });
        setData((d) => ({ ...d, tasks: [...d.tasks, task] }));
        await logHistory(task.id, 'created');
        return;
      }
      if (kind === 'project') {
        const project = await r.projects.create({ name: title, description });
        setData((d) => ({ ...d, projects: [...d.projects, project] }));
        return;
      }
      if (kind === 'goal') {
        const goal = await r.goals.create({ name: title, description });
        setData((d) => ({ ...d, goals: [...d.goals, goal] }));
        return;
      }
      const idea = await r.ideas.create({ title, description });
      setData((d) => ({ ...d, ideas: [idea, ...d.ideas] }));
    },
    [logHistory],
  );

  /* ---------------------------------------------------------------- */
  /* Actions                                                          */
  /* ---------------------------------------------------------------- */

  const actions = useMemo<DataActions>(
    () => ({
      addTask: async (input) => {
        const task = await repo().tasks.create(input);
        setData((d) => ({ ...d, tasks: [...d.tasks, task] }));
        await logHistory(task.id, 'created');
        if (task.scheduledDate) await logHistory(task.id, 'scheduled', `Scheduled for ${task.scheduledDate}`);
        return task;
      },

      updateTask: async (id, patch) => {
        const before = dataRef.current.tasks.find((t) => t.id === id);
        const updated = await repo().tasks.update(id, patch);
        patchTaskState(updated);
        if (!before) return;
        if (patch.scheduledDate !== undefined && patch.scheduledDate !== before.scheduledDate) {
          await logHistory(
            id,
            before.scheduledDate ? 'rescheduled' : 'scheduled',
            patch.scheduledDate ? `Scheduled for ${patch.scheduledDate}` : 'Unscheduled',
          );
        }
        if (patch.dueDate !== undefined && patch.dueDate !== before.dueDate) {
          await logHistory(id, 'deadline_changed', patch.dueDate ? `Deadline ${patch.dueDate}` : 'Deadline removed');
        }
        if (patch.projectId !== undefined && patch.projectId !== before.projectId) {
          await logHistory(id, 'project_changed');
        }
        if (patch.status !== undefined && patch.status !== before.status) {
          if (patch.status === 'completed') await logHistory(id, 'completed');
          else if (before.status === 'completed') await logHistory(id, 'reopened');
          else if (patch.status === 'cancelled') await logHistory(id, 'cancelled');
        }
      },

      deleteTask: async (id) => {
        await repo().tasks.delete(id);
        removeTaskState(id);
      },

      completeTask: async (id) => {
        const before = dataRef.current.tasks.find((t) => t.id === id);
        if (!before) return;
        // Optimistic update: mark completed immediately in the UI using the
        // browser clock. The persisted value (via the repo) wins once the
        // update returns; on failure we roll back and surface a toast.
        // When the task is being timed, whatever time is accumulated is
        // finalized into actualDurationSeconds first.
        const updated = await applyTaskPatch(
          id,
          {
            status: 'completed',
            // Only stamp completedAt when transitioning from a non-completed
            // state so rapid toggle/untoggle doesn't stack stale timestamps.
            completedAt: before.status === 'completed' ? before.completedAt : new Date().toISOString(),
            ...settleTimingPatch(before),
          },
          'Could not mark task complete — please try again',
        );
        if (updated && before.status !== 'completed') await logHistory(id, 'completed');
      },

      reopenTask: async (id) => {
        const before = dataRef.current.tasks.find((t) => t.id === id);
        if (!before) return;
        const status: TaskStatus =
          before.scheduledDate === todayISO() ? 'today' : before.scheduledDate ? 'planned' : 'created';
        // Reopening stops any timer but keeps the recorded actual duration —
        // it is the total time spent on the task so far.
        const updated = await applyTaskPatch(
          id,
          { status, completedAt: undefined, startedAt: undefined, pausedAt: undefined },
          'Could not reopen task — please try again',
        );
        if (updated && before.status === 'completed') await logHistory(id, 'reopened');
      },

      startTask: async (id) => {
        // Shared timer transition used by normal tasks and daily priorities.
        await startTimerForTask(id);
      },

      pauseTask: async (id) => {
        const before = dataRef.current.tasks.find((t) => t.id === id);
        if (!before || !isTimerRunning(before)) return;
        const now = Date.now();
        // Freeze the accumulated active time; paused time is not work time.
        await applyTaskPatch(
          id,
          {
            startedAt: undefined,
            pausedAt: new Date(now).toISOString(),
            actualDurationSeconds: Math.floor(elapsedActiveSeconds(before, now)),
          },
          'Could not pause the timer — please try again',
        );
      },

      resumeTask: async (id) => {
        await resumeTimerForTask(id);
      },

      finishTask: async (id) => {
        const before = dataRef.current.tasks.find((t) => t.id === id);
        if (!before || before.status !== 'in_progress') return;
        const now = Date.now();
        // Stop the timer, store the actual active working time (never the
        // estimate) and complete the task through the existing mechanism.
        const updated = await applyTaskPatch(
          id,
          {
            status: 'completed',
            completedAt: new Date(now).toISOString(),
            ...settleTimingPatch(before, now),
          },
          'Could not complete task — please try again',
        );
        // The guard above guarantees this was an in_progress task.
        if (updated) await logHistory(id, 'completed');
      },

      cancelTask: async (id) => {
        const before = dataRef.current.tasks.find((t) => t.id === id);
        if (!before) return;
        const updated = await applyTaskPatch(
          id,
          { status: 'cancelled', ...settleTimingPatch(before) },
          'Could not cancel task — please try again',
        );
        if (updated) await logHistory(id, 'cancelled');
      },

      postponeTask: async (id, to, note) => {
        const before = dataRef.current.tasks.find((t) => t.id === id);
        if (!before) return;
        const target: Partial<Task> =
          to === 'someday'
            ? { status: 'someday', scheduledDate: undefined }
            : to === 'tomorrow'
              ? { status: 'planned', scheduledDate: addDays(todayISO(), 1) }
              : { status: to === todayISO() ? 'today' : 'planned', scheduledDate: to };
        const updated = await repo().tasks.update(id, {
          ...target,
          // Leaving in_progress settles any running timer safely.
          ...settleTimingPatch(before),
          postponementCount: before.postponementCount + 1,
        });
        patchTaskState(updated);
        await logHistory(
          id,
          'postponed',
          note ?? (to === 'someday' ? 'Moved to Someday' : to === 'tomorrow' ? 'Moved to tomorrow' : `Moved to ${to}`),
        );
      },

      moveTaskToDate: async (id, date) => {
        const before = dataRef.current.tasks.find((t) => t.id === id);
        if (!before) return;
        const hadPlan = before.scheduledDate !== undefined;
        const updated = await repo().tasks.update(id, {
          scheduledDate: date,
          status:
            date === undefined
              ? before.status === 'completed' || before.status === 'cancelled'
                ? before.status
                : 'created'
              : date === todayISO()
                ? 'today'
                : before.status === 'completed' || before.status === 'cancelled'
                  ? before.status
                  : 'planned',
          // Leaving in_progress settles any running timer safely.
          ...settleTimingPatch(before),
          ...(hadPlan ? { postponementCount: before.postponementCount + 1 } : {}),
        });
        patchTaskState(updated);
        await logHistory(
          id,
          hadPlan ? 'rescheduled' : 'scheduled',
          date ? `Scheduled for ${date}` : 'Unscheduled',
        );
      },

      setTaskDeadline: async (id, dueDate) => {
        const updated = await repo().tasks.update(id, { dueDate });
        patchTaskState(updated);
        await logHistory(id, 'deadline_changed', dueDate ? `Deadline ${dueDate}` : 'Deadline removed');
      },

      setTaskProject: async (id, projectId) => {
        const updated = await repo().tasks.update(id, { projectId });
        patchTaskState(updated);
        await logHistory(id, 'project_changed');
      },

      breakDownTask: async (id, titles, scheduledDate) => {
        const parent = dataRef.current.tasks.find((t) => t.id === id);
        if (!parent) return [];
        const created: Task[] = [];
        for (const title of titles) {
          const t = await repo().tasks.create({
            title,
            priority: parent.priority,
            projectId: parent.projectId,
            goalId: parent.goalId,
            parentTaskId: parent.id,
            scheduledDate: scheduledDate ?? parent.scheduledDate,
            status: scheduledDate === todayISO() || (!scheduledDate && parent.scheduledDate === todayISO()) ? 'today' : scheduledDate || parent.scheduledDate ? 'planned' : 'created',
          });
          created.push(t);
          await logHistory(t.id, 'created', `Broken down from "${parent.title}"`);
        }
        setData((d) => ({ ...d, tasks: [...d.tasks, ...created] }));
        return created;
      },

      setDailyPriority: async (title, date) => {
        const day = date ?? todayISO();
        const existing = dataRef.current.dailyPriorities.find((p) => p.date === day);
        if (existing) {
          const updated = await repo().dailyPriorities.update(existing.id, { title: title.trim() });
          setData((d) => ({ ...d, dailyPriorities: d.dailyPriorities.map((p) => (p.id === updated.id ? updated : p)) }));
          const timerTask = dataRef.current.tasks.find((t) => t.id === dailyPriorityTimerTaskId(existing.id));
          if (timerTask) await applyTaskPatch(timerTask.id, { title: updated.title }, 'Could not update the priority timer task');
          return updated;
        }
        const created = await repo().dailyPriorities.create({ date: day, title: title.trim() });
        setData((d) => ({ ...d, dailyPriorities: [...d.dailyPriorities, created] }));
        return created;
      },

      startDailyPriorityTimer: async (id) => {
        const pendingStart = priorityTimerStartRef.current.get(id);
        if (pendingStart) return pendingStart;

        const starting = (async (): Promise<Task | null> => {
          const priority = dataRef.current.dailyPriorities.find((p) => p.id === id);
          if (!priority || priority.completed) return null;

          // DailyPriority is its own planning record, not a Task. Give it one
          // stable, app-owned Task row so its focus session uses the exact same
          // startedAt/pausedAt/actualDurationSeconds lifecycle as every task.
          const taskId = dailyPriorityTimerTaskId(priority.id);
          // Same single-timer rule as a task row's Start button: only a
          // *running* session blocks. A paused task (normal or priority) has
          // released the timer and must not stop this one from starting.
          const otherActiveTask = blockingTimerTask(dataRef.current.tasks, taskId);
          if (otherActiveTask) {
            notify(`Finish or pause “${otherActiveTask.title}” before starting another timer`);
            return null;
          }
          let task = dataRef.current.tasks.find((t) => t.id === taskId);
          if (!task) {
            task = await repo().tasks.create({
              id: taskId,
              title: priority.title,
              priority: 'high',
              status: 'created',
            });
            addTaskState(task);
          } else if (task.title !== priority.title) {
            const renamed = await applyTaskPatch(task.id, { title: priority.title }, 'Could not update the priority timer task');
            if (!renamed) return null;
            task = renamed;
          }

          if (task.status === 'completed') {
            const status: TaskStatus = task.scheduledDate === todayISO() ? 'today' : task.scheduledDate ? 'planned' : 'created';
            const reopened = await applyTaskPatch(
              task.id,
              { status, completedAt: undefined, startedAt: undefined, pausedAt: undefined },
              'Could not reopen the priority timer task',
            );
            if (!reopened) return null;
            task = reopened;
          }
          return startTimerForTask(task.id);
        })();
        priorityTimerStartRef.current.set(id, starting);
        try {
          return await starting;
        } finally {
          if (priorityTimerStartRef.current.get(id) === starting) priorityTimerStartRef.current.delete(id);
        }
      },

      updateDailyPriority: async (id, patch) => {
        const updated = await repo().dailyPriorities.update(id, patch);
        setData((d) => ({ ...d, dailyPriorities: d.dailyPriorities.map((p) => (p.id === updated.id ? updated : p)) }));
        if (patch.title !== undefined) {
          const timerTask = dataRef.current.tasks.find((t) => t.id === dailyPriorityTimerTaskId(id));
          if (timerTask && timerTask.title !== updated.title) {
            await applyTaskPatch(timerTask.id, { title: updated.title }, 'Could not update the priority timer task');
          }
        }
      },

      toggleDailyPriority: async (id) => {
        const before = dataRef.current.dailyPriorities.find((p) => p.id === id);
        if (!before) return;
        const completed = !before.completed;
        const completedAt = completed ? new Date().toISOString() : undefined;
        const timerTask = dataRef.current.tasks.find((t) => t.id === dailyPriorityTimerTaskId(id));

        // The priority itself remains in daily_priorities, but any elapsed time
        // lives only on its associated normal Task record. Keep both lifecycle
        // states in sync without introducing priority-specific timer fields.
        if (completed && timerTask && timerTask.status !== 'completed') {
          const now = completedAt ? Date.parse(completedAt) : Date.now();
          const finalized = await applyTaskPatch(
            timerTask.id,
            {
              status: 'completed',
              completedAt,
              ...settleTimingPatch(timerTask, now),
            },
            'Could not finish the priority timer — please try again',
          );
          if (!finalized) return;
          await logHistory(timerTask.id, 'completed');
        } else if (!completed && timerTask?.status === 'completed') {
          const status: TaskStatus = timerTask.scheduledDate === todayISO() ? 'today' : timerTask.scheduledDate ? 'planned' : 'created';
          const reopened = await applyTaskPatch(
            timerTask.id,
            { status, completedAt: undefined, startedAt: undefined, pausedAt: undefined },
            'Could not reopen the priority timer — please try again',
          );
          if (!reopened) return;
          await logHistory(timerTask.id, 'reopened');
        }

        const updated = await repo().dailyPriorities.update(id, { completed, completedAt });
        setData((d) => ({ ...d, dailyPriorities: d.dailyPriorities.map((p) => (p.id === updated.id ? updated : p)) }));
      },

      deleteDailyPriority: async (id) => {
        await repo().dailyPriorities.delete(id);
        setData((d) => ({ ...d, dailyPriorities: d.dailyPriorities.filter((p) => p.id !== id) }));
      },

      addWeeklyPriority: async (input) => {
        const created = await repo().weeklyPriorities.create(input);
        setData((d) => {
          let list = d.weeklyPriorities;
          if (created.primary) {
            list = list.map((p) => (p.week === created.week && p.id !== created.id ? { ...p, primary: false } : p));
          }
          return { ...d, weeklyPriorities: [...list, created] };
        });
        return created;
      },

      updateWeeklyPriority: async (id, patch) => {
        const updated = await repo().weeklyPriorities.update(id, patch);
        setData((d) => {
          let list = d.weeklyPriorities.map((p) => (p.id === updated.id ? updated : p));
          if (updated.primary) {
            list = list.map((p) => (p.week === updated.week && p.id !== updated.id ? { ...p, primary: false } : p));
          }
          return { ...d, weeklyPriorities: list };
        });
      },

      toggleWeeklyPriority: async (id) => {
        const before = dataRef.current.weeklyPriorities.find((p) => p.id === id);
        if (!before) return;
        const completed = !before.completed;
        const updated = await repo().weeklyPriorities.update(id, {
          completed,
          completedAt: completed ? new Date().toISOString() : undefined,
        });
        setData((d) => ({ ...d, weeklyPriorities: d.weeklyPriorities.map((p) => (p.id === updated.id ? updated : p)) }));
      },

      deleteWeeklyPriority: async (id) => {
        await repo().weeklyPriorities.delete(id);
        setData((d) => ({ ...d, weeklyPriorities: d.weeklyPriorities.filter((p) => p.id !== id) }));
      },

      addMonthlyPriority: async (input) => {
        const created = await repo().monthlyPriorities.create(input);
        setData((d) => ({ ...d, monthlyPriorities: [...d.monthlyPriorities, created] }));
        return created;
      },

      updateMonthlyPriority: async (id, patch) => {
        const updated = await repo().monthlyPriorities.update(id, patch);
        setData((d) => ({ ...d, monthlyPriorities: d.monthlyPriorities.map((p) => (p.id === updated.id ? updated : p)) }));
      },

      toggleMonthlyPriority: async (id) => {
        const before = dataRef.current.monthlyPriorities.find((p) => p.id === id);
        if (!before) return;
        const completed = !before.completed;
        const updated = await repo().monthlyPriorities.update(id, {
          completed,
          completedAt: completed ? new Date().toISOString() : undefined,
        });
        setData((d) => ({ ...d, monthlyPriorities: d.monthlyPriorities.map((p) => (p.id === updated.id ? updated : p)) }));
      },

      deleteMonthlyPriority: async (id) => {
        await repo().monthlyPriorities.delete(id);
        setData((d) => ({ ...d, monthlyPriorities: d.monthlyPriorities.filter((p) => p.id !== id) }));
      },

      toggleWellbeing: async (habit) => {
        const date = todayISO();
        // Today's record, whether it is already loaded or was just created by
        // an earlier tap that is still being written.
        const known =
          wellbeingRef.current?.date === date
            ? wellbeingRef.current
            : (dataRef.current.wellbeingDays.find((w) => w.date === date) ?? null);
        const toggled: WellbeingDay = known
          ? { ...known }
          : {
              id: `pending-${date}`,
              date,
              jogging: false,
              nitnemMorning: false,
              nitnemEvening: false,
              nitnemNight: false,
            };
        toggled[habit] = !toggled[habit];
        // Optimistic: the checkmark responds immediately, the write follows.
        applyWellbeing(toggled);

        // Writes are queued per day, so two quick taps on a fresh day can never
        // create two records for the same date.
        wellbeingQueueRef.current = wellbeingQueueRef.current
          .then(async () => {
            const target = wellbeingRef.current;
            if (!target || target.date !== date) return;
            const r = repo();
            const flags = {
              jogging: target.jogging,
              nitnemMorning: target.nitnemMorning,
              nitnemEvening: target.nitnemEvening,
              nitnemNight: target.nitnemNight,
            };
            try {
              const saved = target.id.startsWith('pending-')
                ? await r.wellbeingDays.create({ date, ...flags })
                : await r.wellbeingDays.update(target.id, flags);
              if (wellbeingRef.current === target) {
                applyWellbeing(saved);
              } else if (wellbeingRef.current) {
                // A newer tap is on its way — keep its state, adopt the real id.
                wellbeingRef.current = { ...wellbeingRef.current, id: saved.id };
              }
            } catch (error) {
              console.error('Could not save the well-being check-in', error);
              notify('Could not save that check-in — please try again');
              // Resync from the repository so the UI never keeps a state the
              // backend rejected.
              try {
                const days = await r.wellbeingDays.list();
                wellbeingRef.current = days.find((w) => w.date === date) ?? null;
                setData((d) => ({ ...d, wellbeingDays: days }));
              } catch {
                /* keep the current state */
              }
            }
          })
          // Safety net: the queue must never stall on an unexpected failure.
          .catch((error) => console.error('Well-being write failed', error));
        await wellbeingQueueRef.current;
      },

      addProject: async (input) => {
        const created = await repo().projects.create(input);
        setData((d) => ({ ...d, projects: [...d.projects, created] }));
        return created;
      },

      updateProject: async (id, patch) => {
        const updated = await repo().projects.update(id, patch);
        setData((d) => ({ ...d, projects: d.projects.map((p) => (p.id === updated.id ? updated : p)) }));
      },

      deleteProject: async (id) => {
        await repo().projects.delete(id);
        setData((d) => ({
          ...d,
          projects: d.projects.filter((p) => p.id !== id),
          tasks: d.tasks.map((t) => (t.projectId === id ? { ...t, projectId: undefined } : t)),
        }));
      },

      addGoal: async (input) => {
        const created = await repo().goals.create(input);
        setData((d) => ({ ...d, goals: [...d.goals, created] }));
        return created;
      },

      updateGoal: async (id, patch) => {
        const updated = await repo().goals.update(id, patch);
        setData((d) => ({ ...d, goals: d.goals.map((g) => (g.id === updated.id ? updated : g)) }));
      },

      deleteGoal: async (id) => {
        await repo().goals.delete(id);
        setData((d) => ({
          ...d,
          goals: d.goals.filter((g) => g.id !== id),
          tasks: d.tasks.map((t) => (t.goalId === id ? { ...t, goalId: undefined } : t)),
          projects: d.projects.map((p) => (p.goalId === id ? { ...p, goalId: undefined } : p)),
        }));
      },

      addInboxItem: async (title, note) => {
        const created = await repo().inbox.create({ title, note });
        setData((d) => ({ ...d, inbox: [created, ...d.inbox] }));
        return created;
      },

      deleteInboxItem: async (id) => {
        await repo().inbox.delete(id);
        setData((d) => ({ ...d, inbox: d.inbox.filter((i) => i.id !== id) }));
      },

      convertInboxItem: async (id, kind, extra) => {
        const item = dataRef.current.inbox.find((i) => i.id === id);
        if (!item) return;
        await createFromTitle(kind, item.title, item.note, extra);
        await repo().inbox.delete(id);
        setData((d) => ({ ...d, inbox: d.inbox.filter((i) => i.id !== id) }));
        notify('Converted');
      },

      addIdea: async (input) => {
        const created = await repo().ideas.create(input);
        setData((d) => ({ ...d, ideas: [created, ...d.ideas] }));
        return created;
      },

      updateIdea: async (id, patch) => {
        const updated = await repo().ideas.update(id, patch);
        setData((d) => ({ ...d, ideas: d.ideas.map((i) => (i.id === updated.id ? updated : i)) }));
      },

      archiveIdea: async (id, archived = true) => {
        const updated = await repo().ideas.update(id, { archived });
        setData((d) => ({ ...d, ideas: d.ideas.map((i) => (i.id === updated.id ? updated : i)) }));
      },

      deleteIdea: async (id) => {
        await repo().ideas.delete(id);
        setData((d) => ({ ...d, ideas: d.ideas.filter((i) => i.id !== id) }));
      },

      promoteIdea: async (id, kind, extra) => {
        const idea = dataRef.current.ideas.find((i) => i.id === id);
        if (!idea) return;
        await createFromTitle(kind, idea.title, idea.description, extra);
        await repo().ideas.delete(id);
        setData((d) => ({ ...d, ideas: d.ideas.filter((i) => i.id !== id) }));
        notify('Promoted');
      },

      updateSettings: async (patch) => {
        const updated = await repo().settings.save(patch);
        setData((d) => ({ ...d, settings: updated }));
      },

      exportData: async () => repo().exportData(),

      importData: async (payload) => {
        await repo().importData(payload);
        const fresh = await repo().exportData();
        setData(fresh);
        notify('Data imported');
      },

      backupNow: async () => {
        const payload = await repo().exportData();
        try {
          window.localStorage.setItem(BACKUP_KEY, JSON.stringify(payload));
          notify('Backup saved on this device');
        } catch {
          notify('Could not save backup — storage is full');
        }
      },

      restoreBackup: async () => {
        try {
          const raw = window.localStorage.getItem(BACKUP_KEY);
          if (!raw) {
            notify('No backup found on this device');
            return;
          }
          await actions.importData(JSON.parse(raw) as AppData);
          notify('Backup restored');
        } catch {
          notify('Backup could not be restored');
        }
      },
    }),
    [addTaskState, applyTaskPatch, applyWellbeing, createFromTitle, logHistory, notify, patchTaskState, removeTaskState, resumeTimerForTask, startTimerForTask],
  );

  const value = useMemo<DataContextValue>(
    () => ({ ready, data, repoKind, toasts, notify, dismissToast, actions }),
    [ready, data, repoKind, toasts, notify, dismissToast, actions],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
