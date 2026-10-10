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
  checkpointTimingPatch,
  elapsedActiveSeconds,
  interruptedTimerPatch,
  isTimerPaused,
  isTimerRunning,
  openTimerSession,
  pauseTimingPatch,
  runningTimerTasks,
  sessionCreditedSeconds,
  settleTimingPatch,
  timerSessionInput,
  type OpenTimerSession,
} from '@/lib/timer';
import {
  ProjectMilestoneError,
  nextProjectMilestonePosition,
  resolveTaskMilestone,
} from '@/lib/project-milestones';
import { assertTaskHierarchyChange } from '@/lib/task-hierarchy';
import type {
  ExistingProjectPlanImportResult,
  ProjectPlanImportResult,
  ResolvedExistingProjectImport,
  ResolvedProjectPlan,
} from '@/lib/project-plan';
import type {
  AppData,
  AppDataImport,
  DailyPriority,
  Goal,
  GoalInput,
  Idea,
  Learning,
  LearningInput,
  InboxItem,
  MonthlyPriority,
  Project,
  ProjectInput,
  ProjectMilestone,
  ProjectMilestoneInput,
  ProjectMilestonePatch,
  Settings,
  Subtask,
  SubtaskInput,
  Task,
  TaskInput,
  TaskStatus,
  TimerSession,
  WeeklyPriority,
  WellbeingDay,
  WellbeingHabit,
  ISODate,
} from '@/lib/types';
import { emptyData } from '@/lib/store/defaults';
import {
  announceTab,
  createTabId,
  otherTabAlive,
  releaseTab,
  PRESENCE_HEARTBEAT_MS,
} from '@/lib/store/tab-presence';

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
  addSubtask(parentTaskId: string, title: string): Promise<Subtask | null>;
  updateSubtask(id: string, patch: Pick<Subtask, 'title' | 'completed'>): Promise<boolean>;
  deleteSubtask(id: string): Promise<boolean>;
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

  /* Bulk deletion (Phase 6 — Bulk Select & Delete). The batched form of the
   * single deletes above with exactly their semantics: the listed rows are
   * permanently removed; the rows the app already removes with a task (its
   * subtasks and its recorded timer sessions) go with it; and everything the
   * single paths only detach — tasks when a project, milestone or goal goes,
   * projects and tasks when a goal goes — survives, detached, NEVER deleted.
   * An empty selection is a no-op. If the store rejects the operation these
   * actions re-read the affected lists, show a toast AND rethrow, so the
   * screen can keep the selection for a safe retry (the repository ignores
   * rows a partial failure already removed). */
  deleteTasks(ids: string[]): Promise<void>;
  deleteProjects(ids: string[]): Promise<void>;
  deleteProjectMilestones(ids: string[]): Promise<void>;
  deleteGoals(ids: string[]): Promise<void>;

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

  /* Learnings (learning timeline — formerly "Milestones") */
  addLearning(input: LearningInput): Promise<Learning>;
  updateLearning(id: string, patch: Partial<Learning>): Promise<void>;
  deleteLearning(id: string): Promise<void>;

  /* Project milestones (Goal → Project → ProjectMilestone → Task) */
  /** Appended after the project's last milestone. Rejects a blank name or an unknown project. */
  addProjectMilestone(input: ProjectMilestoneInput): Promise<ProjectMilestone>;
  updateProjectMilestone(id: string, patch: ProjectMilestonePatch): Promise<void>;
  /** Deletes the milestone only: its tasks stay in the project without a milestone. */
  deleteProjectMilestone(id: string): Promise<void>;
  /** `orderedIds` must be exactly the project's milestone ids, in the new order. */
  reorderProjectMilestones(projectId: string, orderedIds: string[]): Promise<void>;

  /* Daily well-being */
  /**
   * Check or uncheck one of the four well-being check-ins for a day —
   * today by default, or a past day when correcting history from Review.
   * Editing another day never touches today's record.
   */
  toggleWellbeing(habit: WellbeingHabit, date?: ISODate): Promise<void>;

  /* Settings & data */
  updateSettings(patch: Partial<Settings>): Promise<void>;
  exportData(): Promise<AppData>;
  /** Accepts current and pre-Phase-3 exports. Rejects (throws) without changing anything when the file is inconsistent. */
  importData(data: AppDataImport): Promise<void>;
  backupNow(): Promise<void>;
  restoreBackup(): Promise<void>;

  /* Project plan import (ChatGPT JSON — see lib/project-plan.ts) */
  /**
   * Create the records of an already validated plan:
   * Goal → Project → ProjectMilestone → Task.
   *
   * Additive by construction — nothing that already exists (Learnings, goals,
   * projects, tasks, project milestones) is read, changed or deleted. Validate
   * first with `reviewProjectPlanText` and let the user confirm the preview;
   * this only writes. Throws a `ProjectPlanError` when the write could not be
   * completed, in which case nothing was kept.
   */
  importProjectPlan(plan: ResolvedProjectPlan): Promise<ProjectPlanImportResult>;

  /**
   * Add the records of an already validated plan to an existing project
   * (Phase 5 — "Add to Existing Project"): new project milestones and new
   * tasks only.
   *
   * Additive by construction — the target project, its goal relationship, its
   * existing milestones and every existing task stay exactly as they are, and
   * the plan's goal and project are source metadata only (never created).
   * Resolve and preview first with `resolveExistingProjectImport` and
   * `existingProjectImportPreview`; this only writes. Throws a
   * `ProjectPlanError` when the write could not be completed, in which case
   * nothing was kept.
   */
  importProjectPlanIntoExistingProject(resolved: ResolvedExistingProjectImport): Promise<ExistingProjectPlanImportResult>;
}

export interface DataContextValue {
  ready: boolean;
  data: AppData;
  repoKind: 'local' | 'supabase';
  /**
   * Whether Project Milestones can be used. Always true on local storage; on
   * Supabase only once migration 008 has been applied. The UI hides every
   * milestone control while this is false.
   */
  projectMilestonesEnabled: boolean;
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

/**
 * Project milestones plus whether the backend supports them. A failed probe
 * must never stop the rest of the app from loading — the feature then just
 * stays hidden until the next reload.
 */
async function loadProjectMilestones(repo: AppRepository): Promise<{ enabled: boolean; list: ProjectMilestone[] }> {
  try {
    if (!(await repo.supportsProjectMilestones())) return { enabled: false, list: [] };
    return { enabled: true, list: await repo.projectMilestones.list() };
  } catch (error) {
    console.error('Could not load project milestones', error);
    return { enabled: false, list: [] };
  }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [data, setData] = useState<AppData>(emptyData());
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [projectMilestonesEnabled, setProjectMilestonesEnabled] = useState(false);
  const repoKind = repositoryKind();
  const repoRef = useRef<AppRepository | null>(null);
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  /**
   * This page's identity in the cross-tab presence registry.
   *
   * Used for exactly one decision: whether a task still marked running was
   * left behind by a page that died (recover it) or is being timed right now
   * by another open FocusDesk tab (leave it alone). It grants no ownership —
   * every tab may run as many timers as it likes.
   */
  const tabIdRef = useRef<string>(createTabId());

  // The well-being record the user last touched per date (kept alongside the
  // optimistic state) and one queue per date that serializes its writes.
  const wellbeingRef = useRef<Map<ISODate, WellbeingDay>>(new Map());
  const wellbeingQueueRef = useRef<Map<ISODate, Promise<void>>>(new Map());

  /**
   * The run of the timer each running task is currently writing into.
   *
   * Sessions are a *recording* of the existing timer, never a second timer:
   * the bookmark holds only where the run began and what the task's total was
   * at that moment, so the credited duration is always derived from the same
   * `actualDurationSeconds` the rest of the app uses. Nothing here changes
   * when a timer starts, pauses, resumes or finishes — it only writes down
   * what already happened, so it can be attributed to the right calendar day.
   */
  const openSessionRef = useRef(new Map<string, OpenTimerSession>());
  const sessionWriteQueueRef = useRef(new Map<string, Promise<unknown>>());

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
    // A different repository means different records: any run bookmarked
    // against the previous one must never be written into this one. The
    // sessions themselves are already durable on the backend they belong to,
    // closed at their last checkpoint.
    openSessionRef.current.clear();
    sessionWriteQueueRef.current.clear();

    (async () => {
      try {
        const [storedTasks, subtasks, projects, goals, inbox, ideas, learnings, milestoneFeature, dailyPriorities, weeklyPriorities, monthlyPriorities, taskHistory, wellbeingDays, timerSessions, settings] =
          await Promise.all([
            repo.tasks.list(),
            repo.subtasks.list(),
            repo.projects.list(),
            repo.goals.list(),
            repo.inbox.list(),
            repo.ideas.list(),
            repo.learnings.list(),
            loadProjectMilestones(repo),
            repo.dailyPriorities.list(),
            repo.weeklyPriorities.list(),
            repo.monthlyPriorities.list(),
            repo.taskHistory.list(),
            repo.wellbeingDays.list(),
            repo.timerSessions.list(),
            repo.settings.get(),
          ]);
        if (cancelled) return;
        // Any still-running session belongs to the previous page instance. A
        // pagehide write normally paused it precisely; if termination skipped
        // that write, stop at the task's last persisted timer checkpoint.
        //
        // Unless another FocusDesk tab is alive: then those timers are not
        // leftovers at all, they are running right now in that tab. Recovering
        // them here would pause another tab's tasks, which no tab may ever do,
        // so this page adopts the running state as-is instead.
        const anotherTabIsLive = otherTabAlive(tabIdRef.current);
        const tasks = anotherTabIsLive
          ? storedTasks
          : await Promise.all(
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
          subtasks,
          projects,
          goals,
          inbox,
          ideas,
          learnings,
          projectMilestones: milestoneFeature.list,
          dailyPriorities,
          weeklyPriorities,
          monthlyPriorities,
          taskHistory,
          wellbeingDays,
          // Sessions recorded by previous runs of the app. Any session that
          // belonged to a timer still marked running above was already closed
          // at its last durable checkpoint, exactly where
          // `interruptedTimerPatch` stops the task — so recovery never
          // invents, loses or double counts a second.
          timerSessions,
          settings,
        };
        wellbeingRef.current = new Map(wellbeingDays.map((w) => [w.date, w]));
        dataRef.current = loaded;
        setData(loaded);
        setProjectMilestonesEnabled(milestoneFeature.enabled);
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

  const patchSubtaskState = useCallback((subtask: Subtask) => {
    const subtasks = dataRef.current.subtasks.some((item) => item.id === subtask.id)
      ? dataRef.current.subtasks.map((item) => (item.id === subtask.id ? subtask : item))
      : [...dataRef.current.subtasks, subtask];
    dataRef.current = { ...dataRef.current, subtasks };
    setData((d) => ({
      ...d,
      subtasks: d.subtasks.some((item) => item.id === subtask.id)
        ? d.subtasks.map((item) => (item.id === subtask.id ? subtask : item))
        : [...d.subtasks, subtask],
    }));
  }, []);

  /**
   * Apply one pure change to both the ref (read by the next action right
   * away) and React state — used where back-to-back actions must see each
   * other's result, e.g. two milestones added in a row get distinct positions.
   */
  const applyDataChange = useCallback((change: (d: AppData) => AppData) => {
    dataRef.current = change(dataRef.current);
    setData(change);
  }, []);

  const removeSubtaskState = useCallback((id: string) => {
    dataRef.current = { ...dataRef.current, subtasks: dataRef.current.subtasks.filter((item) => item.id !== id) };
    setData((d) => ({ ...d, subtasks: d.subtasks.filter((item) => item.id !== id) }));
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
    dataRef.current = {
      ...dataRef.current,
      tasks: dataRef.current.tasks.filter((t) => t.id !== id)
        .map((t) => t.parentTaskId === id ? { ...t, parentTaskId: undefined } : t),
      subtasks: dataRef.current.subtasks.filter((subtask) => subtask.parentTaskId !== id),
    };
    setData((d) => ({
      ...d,
      tasks: d.tasks.filter((t) => t.id !== id)
        .map((t) => t.parentTaskId === id ? { ...t, parentTaskId: undefined } : t),
      subtasks: d.subtasks.filter((subtask) => subtask.parentTaskId !== id),
    }));
  }, []);

  /** Replace (or add) one timer session in the local snapshot. */
  const applySessionState = useCallback((session: TimerSession) => {
    const merge = (list: TimerSession[]) =>
      list.some((s) => s.id === session.id)
        ? list.map((s) => (s.id === session.id ? session : s))
        : [...list, session];
    dataRef.current = { ...dataRef.current, timerSessions: merge(dataRef.current.timerSessions) };
    setData((d) => ({ ...d, timerSessions: merge(d.timerSessions) }));
  }, []);

  const removeSessionsForTask = useCallback((taskId: string) => {
    const keep = (list: TimerSession[]) => list.filter((s) => s.taskId !== taskId);
    dataRef.current = { ...dataRef.current, timerSessions: keep(dataRef.current.timerSessions) };
    setData((d) => ({ ...d, timerSessions: keep(d.timerSessions) }));
  }, []);

  /** Replace (or add) one day's well-being record in the local snapshot. */
  const applyWellbeing = useCallback((record: WellbeingDay) => {
    wellbeingRef.current.set(record.date, record);
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
  const subtaskWriteQueueRef = useRef(new Map<string, Promise<Subtask>>());
  const subtaskSeqRef = useRef(new Map<string, number>());
  const subtaskPositionRef = useRef(new Map<string, number>());
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

  /** Let queued writes of these tasks (e.g. timer checkpoints) land first. */
  const settleTaskWrites = useCallback(async (tasks: Task[]) => {
    await Promise.all(tasks.map((t) => taskWriteQueueRef.current.get(t.id)?.catch(() => undefined)));
  }, []);

  /** Re-read project milestones after a partially failed multi-step change. */
  const refreshProjectMilestones = useCallback(async () => {
    try {
      const list = await repo().projectMilestones.list();
      applyDataChange((d) => ({ ...d, projectMilestones: list }));
    } catch {
      /* keep the current state */
    }
  }, [applyDataChange]);

  /**
   * Re-read the given lists from the store after a bulk delete that may have
   * been PARTIALLY applied (Supabase has no cross-table transaction — see
   * lib/store/repository.ts). The screen then shows what the database
   * actually holds, not this tab's stale opinion, and a retry of the kept
   * selection only sees the rows that genuinely survived.
   */
  const resyncPartial = useCallback(
    async (read: (r: AppRepository) => Promise<Partial<AppData>>) => {
      try {
        const fresh = await read(repo());
        applyDataChange((d) => ({ ...d, ...fresh }));
      } catch {
        /* the store could not be re-read either — keep what is on screen */
      }
    },
    [applyDataChange],
  );

  const persistSubtaskUpdate = useCallback(
    (id: string, patch: Pick<Subtask, 'title' | 'completed'>): Promise<Subtask> => {
      const previous = subtaskWriteQueueRef.current.get(id);
      const write = (previous ? previous.catch(() => undefined) : Promise.resolve(undefined))
        .then(() => repo().subtasks.update(id, patch));
      subtaskWriteQueueRef.current.set(id, write);
      void write.then(
        () => { if (subtaskWriteQueueRef.current.get(id) === write) subtaskWriteQueueRef.current.delete(id); },
        () => { if (subtaskWriteQueueRef.current.get(id) === write) subtaskWriteQueueRef.current.delete(id); },
      );
      return write;
    },
    [],
  );

  /* ---------------------------------------------------------------- */
  /* Timer sessions                                                   */
  /* ---------------------------------------------------------------- */

  /** Keep a task's session writes in order (create before update, always). */
  const queueSessionWrite = useCallback((taskId: string, write: () => Promise<void>) => {
    const previous = sessionWriteQueueRef.current.get(taskId);
    const next = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(write);
    sessionWriteQueueRef.current.set(taskId, next);
    void next.then(
      () => { if (sessionWriteQueueRef.current.get(taskId) === next) sessionWriteQueueRef.current.delete(taskId); },
      (error: unknown) => {
        if (sessionWriteQueueRef.current.get(taskId) === next) sessionWriteQueueRef.current.delete(taskId);
        // A lost session write costs day attribution, never recorded time:
        // `actualDurationSeconds` is written separately and stays correct.
        console.error('Could not record the timer session', error);
      },
    );
    return next;
  }, []);

  /**
   * Write the open run's progress using the task's authoritative total.
   *
   * Called on every checkpoint and whenever the timer stops. The row is
   * created lazily, on the first whole second credited, so a Start that is
   * immediately undone leaves nothing behind — matching the task, which also
   * credits nothing in that case.
   */
  const recordTimerSession = useCallback(
    (taskId: string, taskTotalSeconds: number, options: { close?: boolean; direct?: boolean } = {}) => {
      const open = openSessionRef.current.get(taskId);
      if (!open) return;
      const duration = sessionCreditedSeconds(open, taskTotalSeconds);
      if (options.close) openSessionRef.current.delete(taskId);
      if (open.id === undefined && duration <= 0) return;
      if (!options.close && open.writtenSeconds === duration) return;
      open.writtenSeconds = duration;

      const input = timerSessionInput(open, duration);
      const write = async () => {
        const repository = repoRef.current;
        if (!repository) return;
        if (open.id === undefined) {
          const created = await repository.timerSessions.create(input);
          open.id = created.id;
          applySessionState(created);
        } else {
          const updated = await repository.timerSessions.update(open.id, {
            endedAt: input.endedAt,
            durationSeconds: input.durationSeconds,
          });
          applySessionState(updated);
        }
      };

      // `direct` is the unload path: LocalRepository persists synchronously
      // inside create/update, which is the most reliable write a closing page
      // gets. Everything else goes through the per-task queue.
      if (options.direct) {
        void write().catch((error: unknown) => console.error('Could not record the timer session', error));
        return;
      }
      void queueSessionWrite(taskId, write);
    },
    [applySessionState, queueSessionWrite],
  );

  /** Begin recording a run that just started/resumed at `startedAt`. */
  const beginTimerSession = useCallback((task: Task, startedAt: string) => {
    if (openSessionRef.current.has(task.id)) return;
    openSessionRef.current.set(task.id, openTimerSession(task, startedAt));
  }, []);

  const nextSubtaskSeq = useCallback((id: string) => {
    const n = (subtaskSeqRef.current.get(id) ?? 0) + 1;
    subtaskSeqRef.current.set(id, n);
    return n;
  }, []);
  const isLatestSubtaskSeq = useCallback((id: string, seq: number) => {
    return (subtaskSeqRef.current.get(id) ?? 0) === seq;
  }, []);

  const applySubtaskPatch = useCallback(
    async (id: string, patch: Pick<Subtask, 'title' | 'completed'>): Promise<boolean> => {
      const before = dataRef.current.subtasks.find((subtask) => subtask.id === id);
      if (!before) return false;
      const normalized = {
        ...patch,
        ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      };
      if (normalized.title !== undefined && normalized.title.length === 0) return false;
      const seq = nextSubtaskSeq(id);
      patchSubtaskState({ ...before, ...normalized });
      try {
        const updated = await persistSubtaskUpdate(id, normalized);
        if (isLatestSubtaskSeq(id, seq)) patchSubtaskState(updated);
        return true;
      } catch (error) {
        if (isLatestSubtaskSeq(id, seq)) patchSubtaskState(before);
        notify('Could not update subtask — please try again');
        console.error('Subtask update failed', error);
        return false;
      }
    },
    [isLatestSubtaskSeq, nextSubtaskSeq, notify, patchSubtaskState, persistSubtaskUpdate],
  );

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
    const startedAt = new Date().toISOString();
    const updated = await applyTaskPatch(
      id,
      { status: 'in_progress', startedAt, pausedAt: undefined },
      'Could not start the timer — please try again',
    );
    // Record the run only once the timer really started: a rejected write
    // leaves no session, just as it leaves no elapsed time.
    if (updated) beginTimerSession(updated, startedAt);
    return updated;
  }, [applyTaskPatch, beginTimerSession]);

  const resumeTimerForTask = useCallback(async (id: string): Promise<Task | null> => {
    const before = dataRef.current.tasks.find((t) => t.id === id);
    if (!before || !isTimerPaused(before)) return null;
    const startedAt = new Date().toISOString();
    const updated = await applyTaskPatch(
      id,
      { startedAt, pausedAt: undefined },
      'Could not resume the timer — please try again',
    );
    // A resume is a new run, so the time between pause and resume belongs to
    // no day at all — which is exactly what "paused time is not counted" means.
    if (updated) beginTimerSession(updated, startedAt);
    return updated;
  }, [applyTaskPatch, beginTimerSession]);

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
      // The same checkpoint, written to the run that is recording it: the
      // session and the task always stop on the same second.
      if (patch.actualDurationSeconds !== undefined) {
        recordTimerSession(task.id, patch.actualDurationSeconds);
      }
    },
    [isLatestTaskSeq, nextTaskSeq, patchTaskState, persistTaskUpdate, recordTimerSession],
  );

  const checkpointRunningTasks = useCallback(() => {
    const nowMs = Date.now();
    // Archived tasks are excluded from the dock, from reporting and from the
    // running set, so they must not be checkpointed either — otherwise an
    // archived task left running would keep accruing time nothing displays.
    for (const task of runningTimerTasks(dataRef.current.tasks)) {
      checkpointRunningTask(task, nowMs);
    }
  }, [checkpointRunningTask]);

  /**
   * Announce this page while it is open, so a tab that opens later can tell a
   * live FocusDesk window from an app that died with timers running. Runs
   * independently of `ready`: a tab still loading is already alive.
   */
  useEffect(() => {
    const selfId = tabIdRef.current;
    announceTab(selfId);
    const id = window.setInterval(() => announceTab(selfId), PRESENCE_HEARTBEAT_MS);
    return () => {
      window.clearInterval(id);
      releaseTab(selfId);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(checkpointRunningTasks, TIMER_CHECKPOINT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [checkpointRunningTasks, ready]);

  /**
   * A run ends exactly when its task stops running — whichever path stopped
   * it: Pause, Finish, manual complete, cancel, reschedule, postpone, reopen,
   * a daily priority being ticked off, or a failed write rolling the task
   * back. Deriving the close from the task state instead of repeating it in
   * every action means the two can never drift apart, and the final duration
   * is read from the task's own settled `actualDurationSeconds`.
   */
  useEffect(() => {
    if (openSessionRef.current.size === 0) return;
    for (const taskId of [...openSessionRef.current.keys()]) {
      const task = data.tasks.find((t) => t.id === taskId);
      if (task && isTimerRunning(task)) continue;
      recordTimerSession(taskId, task?.actualDurationSeconds ?? 0, { close: true });
    }
  }, [data.tasks, recordTimerSession]);

  /** Persist a pause before the page becomes unavailable; never tied to visibility. */
  const pauseRunningTasksOnExit = useCallback(() => {
    const repository = repoRef.current;
    if (!repository) return;
    const nowMs = Date.now();

    // Same set the checkpoint uses, so an archived task is never settled with
    // a burst of time no checkpoint ever recorded.
    for (const task of runningTimerTasks(dataRef.current.tasks)) {
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

      // Close the run with the same final second the pause just stored. The
      // state-driven safety net below cannot help here — a closing page never
      // renders again — so this write has to happen inline.
      recordTimerSession(task.id, patch.actualDurationSeconds ?? task.actualDurationSeconds ?? 0, {
        close: true,
        direct: repository.kind === 'local',
      });
    }
  }, [isLatestTaskSeq, nextTaskSeq, patchTaskState, persistTaskUpdate, recordTimerSession]);

  useEffect(() => {
    let closing = false;
    const onPageExit = () => {
      if (closing) return;
      closing = true;
      // Stop announcing before pausing: a tab that reopens immediately must
      // see this page as gone, so its timers are recovered rather than adopted.
      releaseTab(tabIdRef.current);
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
        // Throws before any write for an invalid parent/project or milestone.
        assertTaskHierarchyChange(undefined, input, dataRef.current.tasks);
        const task = await repo().tasks.create(resolveTaskMilestone(undefined, input, dataRef.current.projectMilestones));
        setData((d) => ({ ...d, tasks: [...d.tasks, task] }));
        await logHistory(task.id, 'created');
        if (task.scheduledDate) await logHistory(task.id, 'scheduled', `Scheduled for ${task.scheduledDate}`);
        return task;
      },

      addSubtask: async (parentTaskId, title) => {
        const cleanTitle = title.trim();
        if (!cleanTitle || !dataRef.current.tasks.some((task) => task.id === parentTaskId)) return null;
        const siblings = dataRef.current.subtasks.filter((subtask) => subtask.parentTaskId === parentTaskId);
        const lastPosition = siblings.reduce((max, subtask) => Math.max(max, subtask.position), -1);
        const position = Math.max(lastPosition, subtaskPositionRef.current.get(parentTaskId) ?? -1) + 1;
        subtaskPositionRef.current.set(parentTaskId, position);
        const input: SubtaskInput = { parentTaskId, title: cleanTitle, position };
        try {
          const created = await repo().subtasks.create(input);
          patchSubtaskState(created);
          return created;
        } catch (error) {
          notify('Could not add subtask — please try again');
          console.error('Subtask creation failed', error);
          return null;
        }
      },

      updateSubtask: async (id, patch) => applySubtaskPatch(id, patch),

      deleteSubtask: async (id) => {
        if (!dataRef.current.subtasks.some((subtask) => subtask.id === id)) return false;
        try {
          await repo().subtasks.delete(id);
          removeSubtaskState(id);
          return true;
        } catch (error) {
          notify('Could not delete subtask — please try again');
          console.error('Subtask deletion failed', error);
          return false;
        }
      },

      updateTask: async (id, patch) => {
        const before = dataRef.current.tasks.find((t) => t.id === id);
        // A milestone outside the resulting project is rejected; a project
        // change clears a milestone that does not belong to the new project.
        const safePatch = resolveTaskMilestone(before, patch, dataRef.current.projectMilestones);
        assertTaskHierarchyChange(before, safePatch, dataRef.current.tasks);
        const updated = await repo().tasks.update(id, safePatch);
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
        const childSubtasks = dataRef.current.subtasks.filter((subtask) => subtask.parentTaskId === id);
        await Promise.all(childSubtasks.map((subtask) => repo().subtasks.delete(subtask.id)));
        // The task's recorded runs go with it, so a deleted task never leaves
        // orphaned focused time on a calendar day. (Supabase cascades too;
        // this keeps local storage and the in-memory snapshot in step.)
        openSessionRef.current.delete(id);
        const sessions = dataRef.current.timerSessions.filter((session) => session.taskId === id);
        await Promise.all(sessions.map((session) => repo().timerSessions.delete(session.id)));
        await repo().tasks.delete(id);
        removeSessionsForTask(id);
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
        const before = dataRef.current.tasks.find((t) => t.id === id);
        const patch = resolveTaskMilestone<Partial<Task>>(before, { projectId }, dataRef.current.projectMilestones);
        assertTaskHierarchyChange(before, patch, dataRef.current.tasks);
        const updated = await repo().tasks.update(id, patch);
        patchTaskState(updated);
        await logHistory(id, 'project_changed');
      },

      breakDownTask: async (id, titles, scheduledDate) => {
        const parent = dataRef.current.tasks.find((t) => t.id === id);
        if (!parent) return [];
        // The pieces stay where the parent is: same project, same milestone
        // (if that milestone still exists in that project).
        const projectMilestoneId = dataRef.current.projectMilestones.some(
          (m) => m.id === parent.projectMilestoneId && m.projectId === parent.projectId,
        )
          ? parent.projectMilestoneId
          : undefined;
        const created: Task[] = [];
        for (const title of titles) {
          const t = await repo().tasks.create({
            title,
            priority: parent.priority,
            projectId: parent.projectId,
            projectMilestoneId,
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
          // Exactly the same rule as a task row's Start button: none. The
          // priority's timer is an ordinary task timer, so it starts next to
          // whatever else is already running and stops nothing.
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

      toggleWellbeing: async (habit, date = todayISO()) => {
        // The day's latest known record, whether it is already loaded or was
        // just created by an earlier tap that is still being written.
        const known =
          wellbeingRef.current.get(date) ??
          dataRef.current.wellbeingDays.find((w) => w.date === date) ??
          null;
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

        // Writes are queued per day, so two quick taps on the same day can
        // never create two records for it — and edits on one day can never
        // overwrite another day's record.
        const previous = wellbeingQueueRef.current.get(date) ?? Promise.resolve();
        const queued = previous.then(async () => {
          const target = wellbeingRef.current.get(date);
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
            const latest = wellbeingRef.current.get(date);
            if (latest === target) {
              applyWellbeing(saved);
            } else if (latest) {
              // A newer tap is on its way — keep its state, adopt the real id.
              wellbeingRef.current.set(date, { ...latest, id: saved.id });
            }
          } catch (error) {
            console.error('Could not save the well-being check-in', error);
            notify('Could not save that check-in — please try again');
            // Resync from the repository so the UI never keeps a state the
            // backend rejected.
            try {
              const days = await r.wellbeingDays.list();
              wellbeingRef.current = new Map(days.map((w) => [w.date, w]));
              setData((d) => ({ ...d, wellbeingDays: days }));
            } catch {
              /* keep the current state */
            }
          }
        });
        // Safety net: the queue must never stall on an unexpected failure.
        const queue = queued.catch((error) => console.error('Well-being write failed', error));
        wellbeingQueueRef.current.set(date, queue);
        await queue;
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
        // Unchanged for tasks: they are kept and simply lose the project link.
        // The project's milestones cannot outlive it, so they are deleted
        // first — each delete also clears that milestone from its tasks.
        const milestoneIds = new Set(dataRef.current.projectMilestones.filter((m) => m.projectId === id).map((m) => m.id));
        const inMilestone = (t: Task) => t.projectMilestoneId !== undefined && milestoneIds.has(t.projectMilestoneId);
        try {
          await settleTaskWrites(dataRef.current.tasks.filter(inMilestone));
          for (const milestoneId of milestoneIds) await repo().projectMilestones.delete(milestoneId);
          await repo().projects.delete(id);
        } catch (error) {
          console.error('Project deletion failed', error);
          notify('Could not delete the project — please try again');
          await refreshProjectMilestones();
          return;
        }
        applyDataChange((d) => ({
          ...d,
          projects: d.projects.filter((p) => p.id !== id),
          projectMilestones: d.projectMilestones.filter((m) => m.projectId !== id),
          tasks: d.tasks.map((t) =>
            t.projectId === id || inMilestone(t)
              ? { ...t, projectId: t.projectId === id ? undefined : t.projectId, projectMilestoneId: inMilestone(t) ? undefined : t.projectMilestoneId }
              : t,
          ),
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

      addLearning: async (input) => {
        const created = await repo().learnings.create(input);
        setData((d) => ({ ...d, learnings: [created, ...d.learnings] }));
        return created;
      },

      updateLearning: async (id, patch) => {
        const updated = await repo().learnings.update(id, patch);
        setData((d) => ({ ...d, learnings: d.learnings.map((l) => (l.id === updated.id ? updated : l)) }));
      },

      deleteLearning: async (id) => {
        await repo().learnings.delete(id);
        setData((d) => ({ ...d, learnings: d.learnings.filter((l) => l.id !== id) }));
      },

      addProjectMilestone: async (input) => {
        const name = input.name.trim();
        if (!name) throw new ProjectMilestoneError('Give the milestone a name.');
        if (!dataRef.current.projects.some((p) => p.id === input.projectId)) {
          throw new ProjectMilestoneError('That project no longer exists.');
        }
        const created = await repo().projectMilestones.create({
          projectId: input.projectId,
          name,
          description: input.description?.trim() || undefined,
          targetDate: input.targetDate || undefined,
          position: nextProjectMilestonePosition(dataRef.current.projectMilestones, input.projectId),
        });
        applyDataChange((d) => ({ ...d, projectMilestones: [...d.projectMilestones, created] }));
        return created;
      },

      updateProjectMilestone: async (id, patch) => {
        const allowed: ProjectMilestonePatch = {};
        if (patch.name !== undefined) {
          const name = patch.name.trim();
          if (!name) throw new ProjectMilestoneError('Give the milestone a name.');
          allowed.name = name;
        }
        if ('description' in patch) allowed.description = patch.description?.trim() || undefined;
        if ('targetDate' in patch) allowed.targetDate = patch.targetDate || undefined;
        const updated = await repo().projectMilestones.update(id, allowed);
        applyDataChange((d) => ({ ...d, projectMilestones: d.projectMilestones.map((m) => (m.id === updated.id ? updated : m)) }));
      },

      deleteProjectMilestone: async (id) => {
        // Tasks are never deleted here — they stay in the project with no milestone.
        await settleTaskWrites(dataRef.current.tasks.filter((t) => t.projectMilestoneId === id));
        await repo().projectMilestones.delete(id);
        applyDataChange((d) => ({
          ...d,
          projectMilestones: d.projectMilestones.filter((m) => m.id !== id),
          tasks: d.tasks.map((t) => (t.projectMilestoneId === id ? { ...t, projectMilestoneId: undefined } : t)),
        }));
      },

      reorderProjectMilestones: async (projectId, orderedIds) => {
        const ordered = await repo().projectMilestones.reorder(projectId, orderedIds);
        const byId = new Map(ordered.map((m) => [m.id, m]));
        applyDataChange((d) => ({ ...d, projectMilestones: d.projectMilestones.map((m) => byId.get(m.id) ?? m) }));
      },

      /* ---------------- Bulk deletion (Phase 6) ---------------- */

      deleteTasks: async (ids) => {
        if (ids.length === 0) return;
        const doomed = new Set(ids);
        const targets = dataRef.current.tasks.filter((t) => doomed.has(t.id));
        // Timer safety before touching the store: queued per-task writes
        // (checkpoints) must not race the delete, and the open-run bookmarks
        // are dropped so the state-driven close effect can never try to
        // record a "final" session row onto a task whose row is about to
        // disappear. A running timer is discarded with its task — its time
        // was only ever attributed through that task anyway.
        await settleTaskWrites(targets);
        for (const t of targets) openSessionRef.current.delete(t.id);
        try {
          await repo().deleteTasks(ids);
        } catch (error) {
          console.error('Bulk task deletion failed', error);
          notify('Could not delete all selected tasks — the list was re-read; try again');
          await resyncPartial(async (r) => {
            const [tasks, subtasks, timerSessions] = await Promise.all([
              r.tasks.list(),
              r.subtasks.list(),
              r.timerSessions.list(),
            ]);
            return { tasks, subtasks, timerSessions };
          });
          throw error;
        }
        // Mirror what the store now holds: the selected tasks plus the rows
        // that belong to them alone — subtasks and recorded timer runs — are
        // gone, and surviving broken-down tasks lose only the deleted parent
        // link (the SET NULL the Supabase foreign key applies the same way).
        applyDataChange((d) => ({
          ...d,
          tasks: d.tasks
            .filter((t) => !doomed.has(t.id))
            .map((t) => (t.parentTaskId && doomed.has(t.parentTaskId) ? { ...t, parentTaskId: undefined } : t)),
          subtasks: d.subtasks.filter((s) => !doomed.has(s.parentTaskId)),
          timerSessions: d.timerSessions.filter((s) => !doomed.has(s.taskId)),
        }));
        if (targets.length > 0) {
          notify(`${targets.length} ${targets.length === 1 ? 'task' : 'tasks'} deleted`);
        }
      },

      deleteProjects: async (ids) => {
        if (ids.length === 0) return;
        const doomed = new Set(ids);
        const targets = dataRef.current.projects.filter((p) => doomed.has(p.id));
        // Milestones cannot outlive their project, so the aggregate removes
        // them too — and their tasks must survive detached. Tasks linked to a
        // doomed project or milestone keep existing, but a queued timer
        // checkpoint should not race the detach writes, so those rows are
        // settled first (the single-project delete's care for milestone
        // tasks, extended to every task losing a link).
        const doomedMilestones = new Set(
          dataRef.current.projectMilestones.filter((m) => doomed.has(m.projectId)).map((m) => m.id),
        );
        const losesLink = (t: Task) =>
          (t.projectId !== undefined && doomed.has(t.projectId)) ||
          (t.projectMilestoneId !== undefined && doomedMilestones.has(t.projectMilestoneId));
        try {
          await settleTaskWrites(dataRef.current.tasks.filter(losesLink));
          await repo().deleteProjects(ids);
        } catch (error) {
          console.error('Bulk project deletion failed', error);
          notify('Could not delete all selected projects — the lists were re-read; try again');
          await resyncPartial(async (r) => {
            const [projects, tasks, projectMilestones] = await Promise.all([
              r.projects.list(),
              r.tasks.list(),
              r.projectMilestones.list(),
            ]);
            return { projects, tasks, projectMilestones };
          });
          throw error;
        }
        applyDataChange((d) => ({
          ...d,
          projects: d.projects.filter((p) => !doomed.has(p.id)),
          projectMilestones: d.projectMilestones.filter((m) => !doomed.has(m.projectId)),
          tasks: d.tasks.map((t) =>
            losesLink(t)
              ? {
                  ...t,
                  projectId: t.projectId !== undefined && doomed.has(t.projectId) ? undefined : t.projectId,
                  projectMilestoneId:
                    t.projectMilestoneId !== undefined && doomedMilestones.has(t.projectMilestoneId)
                      ? undefined
                      : t.projectMilestoneId,
                }
              : t,
          ),
        }));
        if (targets.length > 0) {
          notify(`${targets.length} ${targets.length === 1 ? 'project' : 'projects'} deleted`);
        }
      },

      deleteProjectMilestones: async (ids) => {
        if (ids.length === 0) return;
        const doomed = new Set(ids);
        const targets = dataRef.current.projectMilestones.filter((m) => doomed.has(m.id));
        // Tasks are never deleted here — they stay in their project with no
        // milestone, exactly like the single-milestone delete; its queued
        // writes settle before the batch runs.
        try {
          await settleTaskWrites(
            dataRef.current.tasks.filter((t) => t.projectMilestoneId !== undefined && doomed.has(t.projectMilestoneId)),
          );
          await repo().deleteProjectMilestones(ids);
        } catch (error) {
          console.error('Bulk milestone deletion failed', error);
          notify('Could not delete all selected milestones — the lists were re-read; try again');
          await resyncPartial(async (r) => {
            const [projectMilestones, tasks] = await Promise.all([r.projectMilestones.list(), r.tasks.list()]);
            return { projectMilestones, tasks };
          });
          throw error;
        }
        applyDataChange((d) => ({
          ...d,
          projectMilestones: d.projectMilestones.filter((m) => !doomed.has(m.id)),
          tasks: d.tasks.map((t) =>
            t.projectMilestoneId !== undefined && doomed.has(t.projectMilestoneId)
              ? { ...t, projectMilestoneId: undefined }
              : t,
          ),
        }));
        if (targets.length > 0) {
          notify(`${targets.length} ${targets.length === 1 ? 'milestone' : 'milestones'} deleted`);
        }
      },

      deleteGoals: async (ids) => {
        if (ids.length === 0) return;
        const doomed = new Set(ids);
        const targets = dataRef.current.goals.filter((g) => doomed.has(g.id));
        try {
          await repo().deleteGoals(ids);
        } catch (error) {
          console.error('Bulk goal deletion failed', error);
          notify('Could not delete all selected goals — the lists were re-read; try again');
          await resyncPartial(async (r) => {
            const [goals, projects, tasks] = await Promise.all([r.goals.list(), r.projects.list(), r.tasks.list()]);
            return { goals, projects, tasks };
          });
          throw error;
        }
        // Only the goal rows disappear. Projects and tasks survive detached —
        // and the LocalRepository aggregate cleared the dangling references
        // in the store itself (matching what the Supabase foreign keys do at
        // the database level), so the snapshot simply mirrors it.
        applyDataChange((d) => ({
          ...d,
          goals: d.goals.filter((g) => !doomed.has(g.id)),
          projects: d.projects.map((p) => (p.goalId !== undefined && doomed.has(p.goalId) ? { ...p, goalId: undefined } : p)),
          tasks: d.tasks.map((t) => (t.goalId !== undefined && doomed.has(t.goalId) ? { ...t, goalId: undefined } : t)),
        }));
        if (targets.length > 0) {
          notify(`${targets.length} ${targets.length === 1 ? 'goal' : 'goals'} deleted`);
        }
      },

      updateSettings: async (patch) => {
        const updated = await repo().settings.save(patch);
        setData((d) => ({ ...d, settings: updated }));
      },

      exportData: async () => repo().exportData(),

      importData: async (payload) => {
        // An import replaces every record, so no in-flight run can still be
        // recording into the data that is being thrown away.
        openSessionRef.current.clear();
        await repo().importData(payload);
        const fresh = await repo().exportData();
        dataRef.current = fresh;
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
          await actions.importData(JSON.parse(raw) as AppDataImport);
          notify('Backup restored');
        } catch (error) {
          // An inconsistent backup is refused before anything changes — say why.
          notify(error instanceof ProjectMilestoneError ? error.message : 'Backup could not be restored');
        }
      },

      importProjectPlan: async (plan) => {
        // Settle any in-flight task write first: the snapshot the created
        // records are merged into must not be overtaken by a timer checkpoint.
        await settleTaskWrites(dataRef.current.tasks);
        const created = await repo().importProjectPlan(plan);
        applyDataChange((d) => ({
          ...d,
          goals: [...d.goals, ...created.goals],
          projects: [...d.projects, ...created.projects],
          projectMilestones: [...d.projectMilestones, ...created.projectMilestones],
          tasks: [...d.tasks, ...created.tasks],
        }));
        return created;
      },

      importProjectPlanIntoExistingProject: async (resolved) => {
        // Settle any in-flight task write first, exactly like importProjectPlan.
        await settleTaskWrites(dataRef.current.tasks);
        const created = await repo().importProjectPlanIntoExistingProject(resolved);
        // Only new milestones and tasks exist — the target project, its goal
        // and everything already in it are not part of the result, so the
        // state merge cannot touch them.
        applyDataChange((d) => ({
          ...d,
          projectMilestones: [...d.projectMilestones, ...created.projectMilestones],
          tasks: [...d.tasks, ...created.tasks],
        }));
        return created;
      },
    }),
    [addTaskState, applyDataChange, applySubtaskPatch, applyTaskPatch, applyWellbeing, createFromTitle, logHistory, notify, patchSubtaskState, patchTaskState, refreshProjectMilestones, removeSessionsForTask, removeSubtaskState, removeTaskState, resyncPartial, resumeTimerForTask, settleTaskWrites, startTimerForTask],
  );

  const value = useMemo<DataContextValue>(
    () => ({ ready, data, repoKind, projectMilestonesEnabled, toasts, notify, dismissToast, actions }),
    [ready, data, repoKind, projectMilestonesEnabled, toasts, notify, dismissToast, actions],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
