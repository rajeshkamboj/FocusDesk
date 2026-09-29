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
import { createRepository, repositoryKind, type AppRepository } from '@/lib/store';
import { isOpenTask } from '@/lib/selectors';
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
  ISODate,
} from '@/lib/types';
import { emptyData } from '@/lib/store/defaults';

const BACKUP_KEY = 'pace.backup.v1';

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
  startTask(id: string): Promise<void>;
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
  const [data, setData] = useState<AppData>(emptyData());
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const repoKind = repositoryKind();
  const repoRef = useRef<AppRepository | null>(null);
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

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
    const repo = createRepository();
    repoRef.current = repo;

    (async () => {
      try {
        const [tasks, projects, goals, inbox, ideas, dailyPriorities, weeklyPriorities, monthlyPriorities, taskHistory, settings] =
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
            repo.settings.get(),
          ]);
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
          settings,
        };
        setData(loaded);
        setReady(true);

        // Automatic carry-forward: unfinished past tasks move to today.
        if (settings.general.automaticCarryForward) {
          const today = todayISO();
          const stale = tasks.filter(
            (t) => isOpenTask(t) && t.scheduledDate !== undefined && t.scheduledDate < today,
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
      } catch {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [notify]);

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
    setData((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === task.id ? task : t)) }));
  }, []);

  const removeTaskState = useCallback((id: string) => {
    setData((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) }));
  }, []);

  const repo = () => {
    if (!repoRef.current) throw new Error('Repository not ready');
    return repoRef.current;
  };

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
        const updated = await repo().tasks.update(id, {
          status: 'completed',
          completedAt: new Date().toISOString(),
        });
        patchTaskState(updated);
        await logHistory(id, 'completed');
      },

      reopenTask: async (id) => {
        const before = dataRef.current.tasks.find((t) => t.id === id);
        const status: TaskStatus =
          before?.scheduledDate === todayISO() ? 'today' : before?.scheduledDate ? 'planned' : 'created';
        const updated = await repo().tasks.update(id, { status, completedAt: undefined });
        patchTaskState(updated);
        await logHistory(id, 'reopened');
      },

      startTask: async (id) => {
        const updated = await repo().tasks.update(id, { status: 'in_progress' });
        patchTaskState(updated);
      },

      cancelTask: async (id) => {
        const updated = await repo().tasks.update(id, { status: 'cancelled' });
        patchTaskState(updated);
        await logHistory(id, 'cancelled');
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
          return updated;
        }
        const created = await repo().dailyPriorities.create({ date: day, title: title.trim() });
        setData((d) => ({ ...d, dailyPriorities: [...d.dailyPriorities, created] }));
        return created;
      },

      updateDailyPriority: async (id, patch) => {
        const updated = await repo().dailyPriorities.update(id, patch);
        setData((d) => ({ ...d, dailyPriorities: d.dailyPriorities.map((p) => (p.id === updated.id ? updated : p)) }));
      },

      toggleDailyPriority: async (id) => {
        const before = dataRef.current.dailyPriorities.find((p) => p.id === id);
        if (!before) return;
        const completed = !before.completed;
        const updated = await repo().dailyPriorities.update(id, {
          completed,
          completedAt: completed ? new Date().toISOString() : undefined,
        });
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
    [createFromTitle, logHistory, notify, patchTaskState, removeTaskState],
  );

  const value = useMemo<DataContextValue>(
    () => ({ ready, data, repoKind, toasts, notify, dismissToast, actions }),
    [ready, data, repoKind, toasts, notify, dismissToast, actions],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
