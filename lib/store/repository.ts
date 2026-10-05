/**
 * Data-access layer.
 *
 * The UI never talks to a specific backend. It talks to an `AppRepository`,
 * which is currently backed by browser storage and will later be backed by
 * Supabase/PostgreSQL (see supabase-repository.ts and supabase/schema.sql).
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

/** CRUD contract for one collection. */
export interface EntityRepository<T, C> {
  list(): Promise<T[]>;
  create(input: C): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}

export interface DailyPriorityInput {
  date: string;
  title: string;
}

export interface WeeklyPriorityInput {
  week: string;
  title: string;
  primary?: boolean;
}

export interface MonthlyPriorityInput {
  month: string;
  title: string;
  goalId?: string;
  projectId?: string;
}

export interface InboxItemInput {
  title: string;
  note?: string;
}

export interface IdeaInput {
  title: string;
  description?: string;
}

export interface AppRepository {
  readonly kind: 'local' | 'supabase';

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
  /**
   * Continuous runs of the task timer. Written only by the timer lifecycle in
   * DataProvider; read to attribute focused time to calendar days.
   */
  timerSessions: EntityRepository<TimerSession, TimerSessionInput>;

  taskHistory: {
    list(taskId?: string): Promise<TaskHistoryEntry[]>;
    add(entry: Omit<TaskHistoryEntry, 'id' | 'at'> & { at?: string }): Promise<TaskHistoryEntry>;
  };

  settings: {
    get(): Promise<Settings>;
    save(patch: Partial<Settings>): Promise<Settings>;
  };

  /** Full JSON export for backup / transfer. */
  exportData(): Promise<AppData>;
  /** Replace all data from a previously exported payload. */
  importData(data: AppData): Promise<void>;
}
