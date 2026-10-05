/**
 * Local persistence repository.
 *
 * Backed by `localStorage` behind a tiny key-value `StorageLike` interface so it
 * can also run in tests/Node with a shim. Mirrors exactly the contract that the
 * Supabase repository implements — swapping backends does not touch the UI.
 */

import type {
  AppData,
  DailyPriority,
  Goal,
  GoalInput,
  InboxItem,
  Idea,
  Milestone,
  MilestoneInput,
  MonthlyPriority,
  Project,
  ProjectInput,
  Settings,
  Subtask,
  SubtaskInput,
  Task,
  TaskHistoryEntry,
  TaskInput,
  TimerSession,
  TimerSessionInput,
  WeeklyPriority,
  WellbeingDay,
  WellbeingDayInput,
} from '../types';
import { emptyData } from './defaults';
import type {
  AppRepository,
  DailyPriorityInput,
  EntityRepository,
  InboxItemInput,
  IdeaInput,
  MonthlyPriorityInput,
  WeeklyPriorityInput,
} from './repository';

export const STORAGE_KEY = 'pace.db.v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    /* storage unavailable (private mode, etc.) */
  }
  return null;
}

export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

/** In-memory storage used when the browser blocks localStorage. */
function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

class Collection<T extends { id: string; createdAt?: string }, C>
  implements EntityRepository<T, C>
{
  constructor(
    private readonly db: () => AppData,
    private readonly key: keyof AppData,
    private readonly persist: () => void,
    private readonly make: (input: C) => T,
    private readonly touch: (item: T, patch: Partial<T>) => T = (item, patch) => ({ ...item, ...patch }),
  ) {}

  async list(): Promise<T[]> {
    return [...(this.db()[this.key] as unknown as T[])];
  }

  async create(input: C): Promise<T> {
    const item = this.make(input);
    (this.db()[this.key] as unknown as T[]).push(item);
    this.persist();
    return item;
  }

  async update(id: string, patch: Partial<T>): Promise<T> {
    const list = this.db()[this.key] as unknown as T[];
    const idx = list.findIndex((x) => x.id === id);
    if (idx === -1) throw new Error(`Record not found: ${id}`);
    const next = this.touch(list[idx], patch);
    list[idx] = next;
    this.persist();
    return next;
  }

  async delete(id: string): Promise<void> {
    const data = this.db();
    (data[this.key] as unknown as T[]) = (data[this.key] as unknown as T[]).filter((x) => x.id !== id);
    this.persist();
  }
}

export class LocalRepository implements AppRepository {
  readonly kind = 'local' as const;

  private data: AppData;
  private readonly storage: StorageLike;

  tasks: EntityRepository<Task, TaskInput>;
  subtasks: EntityRepository<Subtask, SubtaskInput>;
  projects: EntityRepository<Project, ProjectInput>;
  goals: EntityRepository<Goal, GoalInput>;
  inbox: EntityRepository<InboxItem, InboxItemInput>;
  ideas: EntityRepository<Idea, IdeaInput>;
  milestones: EntityRepository<Milestone, MilestoneInput>;
  dailyPriorities: EntityRepository<DailyPriority, DailyPriorityInput>;
  weeklyPriorities: EntityRepository<WeeklyPriority, WeeklyPriorityInput>;
  monthlyPriorities: EntityRepository<MonthlyPriority, MonthlyPriorityInput>;
  wellbeingDays: EntityRepository<WellbeingDay, WellbeingDayInput>;
  timerSessions: EntityRepository<TimerSession, TimerSessionInput>;

  constructor(storage: StorageLike | null = browserStorage()) {
    this.storage = storage ?? memoryStorage();
    this.data = this.read();

    const persist = () => this.write();

    this.tasks = new Collection<Task, TaskInput>(
      () => this.data,
      'tasks',
      persist,
      (input) => ({
        id: input.id ?? createId(),
        title: input.title.trim(),
        description: input.description?.trim() || undefined,
        status: input.status ?? 'created',
        priority: input.priority ?? 'medium',
        projectId: input.projectId || undefined,
        goalId: input.goalId || undefined,
        parentTaskId: input.parentTaskId || undefined,
        createdAt: nowISO(),
        scheduledDate: input.scheduledDate,
        dueDate: input.dueDate,
        estimatedDuration: input.estimatedDuration,
        reminder: input.reminder,
        notes: input.notes?.trim() || undefined,
        tags: input.tags ?? [],
        postponementCount: 0,
        archived: false,
      }),
      (task, patch) => ({
        ...task,
        ...patch,
        title: patch.title !== undefined ? patch.title.trim() : task.title,
        tags: patch.tags ?? task.tags,
      }),
    );

    this.subtasks = new Collection<Subtask, SubtaskInput>(
      () => this.data,
      'subtasks',
      persist,
      (input) => ({
        id: createId(),
        parentTaskId: input.parentTaskId,
        title: input.title.trim(),
        completed: false,
        position: input.position ?? 0,
        createdAt: nowISO(),
      }),
      (subtask, patch) => ({
        ...subtask,
        ...patch,
        title: patch.title !== undefined ? patch.title.trim() : subtask.title,
      }),
    );

    this.projects = new Collection<Project, ProjectInput>(
      () => this.data,
      'projects',
      persist,
      (input) => ({
        id: createId(),
        name: input.name.trim(),
        description: input.description?.trim() || undefined,
        goalId: input.goalId || undefined,
        deadline: input.deadline,
        status: input.status ?? 'active',
        createdAt: nowISO(),
      }),
    );

    this.goals = new Collection<Goal, GoalInput>(
      () => this.data,
      'goals',
      persist,
      (input) => ({
        id: createId(),
        name: input.name.trim(),
        description: input.description?.trim() || undefined,
        deadline: input.deadline,
        status: input.status ?? 'active',
        createdAt: nowISO(),
      }),
    );

    this.inbox = new Collection<InboxItem, InboxItemInput>(
      () => this.data,
      'inbox',
      persist,
      (input) => ({
        id: createId(),
        title: input.title.trim(),
        note: input.note?.trim() || undefined,
        createdAt: nowISO(),
      }),
    );

    this.ideas = new Collection<Idea, IdeaInput>(
      () => this.data,
      'ideas',
      persist,
      (input) => ({
        id: createId(),
        title: input.title.trim(),
        description: input.description?.trim() || undefined,
        createdAt: nowISO(),
        archived: false,
      }),
    );

    this.milestones = new Collection<Milestone, MilestoneInput>(
      () => this.data,
      'milestones',
      persist,
      (input) => ({
        id: createId(),
        title: input.title.trim(),
        category: input.category ?? 'other',
        description: input.description?.trim() || undefined,
        date: input.date,
        createdAt: nowISO(),
      }),
    );

    this.dailyPriorities = new Collection<DailyPriority, DailyPriorityInput>(
      () => this.data,
      'dailyPriorities',
      persist,
      (input) => ({
        id: createId(),
        date: input.date,
        title: input.title.trim(),
        completed: false,
        dueDate: undefined,
        postponementCount: 0,
      }),
    );

    this.weeklyPriorities = new Collection<WeeklyPriority, WeeklyPriorityInput>(
      () => this.data,
      'weeklyPriorities',
      persist,
      (input) => ({
        id: createId(),
        week: input.week,
        title: input.title.trim(),
        primary: input.primary ?? false,
        completed: false,
      }),
    );

    this.monthlyPriorities = new Collection<MonthlyPriority, MonthlyPriorityInput>(
      () => this.data,
      'monthlyPriorities',
      persist,
      (input) => ({
        id: createId(),
        month: input.month,
        title: input.title.trim(),
        completed: false,
        goalId: input.goalId || undefined,
        projectId: input.projectId || undefined,
      }),
    );

    this.wellbeingDays = new Collection<WellbeingDay, WellbeingDayInput>(
      () => this.data,
      'wellbeingDays',
      persist,
      (input) => ({
        id: createId(),
        date: input.date,
        jogging: input.jogging ?? false,
        nitnemMorning: input.nitnemMorning ?? false,
        nitnemEvening: input.nitnemEvening ?? false,
        nitnemNight: input.nitnemNight ?? false,
      }),
    );

    this.timerSessions = new Collection<TimerSession, TimerSessionInput>(
      () => this.data,
      'timerSessions',
      persist,
      (input) => ({
        id: createId(),
        taskId: input.taskId,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        durationSeconds: Math.max(0, Math.floor(input.durationSeconds)),
      }),
      (session, patch) => ({
        ...session,
        ...patch,
        durationSeconds:
          patch.durationSeconds !== undefined
            ? Math.max(0, Math.floor(patch.durationSeconds))
            : session.durationSeconds,
      }),
    );
  }

  private read(): AppData {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return emptyData();
      const parsed = JSON.parse(raw) as Partial<AppData>;
      const base = emptyData();
      return {
        ...base,
        ...parsed,
        settings: {
          general: { ...base.settings.general, ...parsed.settings?.general },
          notifications: { ...base.settings.notifications, ...parsed.settings?.notifications },
          appearance: { ...base.settings.appearance, ...parsed.settings?.appearance },
        },
      };
    } catch {
      return emptyData();
    }
  }

  private write(): void {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      /* quota exceeded — keep working in memory */
    }
  }

  taskHistory = {
    list: async (taskId?: string): Promise<TaskHistoryEntry[]> => {
      const all = [...this.data.taskHistory].sort((a, b) => (a.at < b.at ? 1 : -1));
      return taskId ? all.filter((h) => h.taskId === taskId) : all;
    },
    add: async (entry: Omit<TaskHistoryEntry, 'id' | 'at'> & { at?: string }): Promise<TaskHistoryEntry> => {
      const record: TaskHistoryEntry = {
        id: createId(),
        taskId: entry.taskId,
        type: entry.type,
        at: entry.at ?? nowISO(),
        note: entry.note,
      };
      this.data.taskHistory.push(record);
      this.write();
      return record;
    },
  };

  settings = {
    get: async (): Promise<Settings> => ({ ...this.data.settings }),
    save: async (patch: Partial<Settings>): Promise<Settings> => {
      this.data.settings = {
        general: { ...this.data.settings.general, ...patch.general },
        notifications: { ...this.data.settings.notifications, ...patch.notifications },
        appearance: { ...this.data.settings.appearance, ...patch.appearance },
      };
      this.write();
      return { ...this.data.settings };
    },
  };

  async exportData(): Promise<AppData> {
    return JSON.parse(JSON.stringify(this.data)) as AppData;
  }

  async importData(data: AppData): Promise<void> {
    const base = emptyData();
    this.data = {
      tasks: data.tasks ?? [],
      subtasks: data.subtasks ?? [],
      projects: data.projects ?? [],
      goals: data.goals ?? [],
      inbox: data.inbox ?? [],
      ideas: data.ideas ?? [],
      milestones: data.milestones ?? [],
      dailyPriorities: data.dailyPriorities ?? [],
      weeklyPriorities: data.weeklyPriorities ?? [],
      monthlyPriorities: data.monthlyPriorities ?? [],
      taskHistory: data.taskHistory ?? [],
      wellbeingDays: data.wellbeingDays ?? [],
      timerSessions: data.timerSessions ?? [],
      settings: {
        general: { ...base.settings.general, ...data.settings?.general },
        notifications: { ...base.settings.notifications, ...data.settings?.notifications },
        appearance: { ...base.settings.appearance, ...data.settings?.appearance },
      },
    };
    this.write();
  }
}
