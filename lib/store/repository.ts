/**
 * Data-access layer.
 *
 * The UI never talks to a specific backend. It talks to an `AppRepository`,
 * which is currently backed by browser storage and will later be backed by
 * Supabase/PostgreSQL (see supabase-repository.ts and supabase/schema.sql).
 */

import type {
  AppData,
  AppDataImport,
  DailyPriority,
  Goal,
  GoalInput,
  InboxItem,
  Idea,
  Learning,
  LearningInput,
  MonthlyPriority,
  Project,
  ProjectInput,
  ProjectMilestone,
  ProjectMilestoneInput,
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

/**
 * Project Milestones: CRUD plus the two project-scoped operations the UI and
 * future importers need. Ordering is by `position` only.
 *
 * Referential behaviour is the same on every backend: deleting a milestone
 * clears `projectMilestoneId` on the tasks that used it (tasks are never
 * deleted), and a milestone can never move to another project.
 */
export interface ProjectMilestoneRepository extends EntityRepository<ProjectMilestone, ProjectMilestoneInput> {
  /** One project's milestones in manual order. */
  listForProject(projectId: string): Promise<ProjectMilestone[]>;
  /**
   * Persist a new manual order for one project. `orderedIds` must be exactly
   * that project's milestone ids; each gets position = its index (0..n-1).
   */
  reorder(projectId: string, orderedIds: string[]): Promise<ProjectMilestone[]>;
}

export interface AppRepository {
  readonly kind: 'local' | 'supabase';

  tasks: EntityRepository<Task, TaskInput>;
  subtasks: EntityRepository<Subtask, SubtaskInput>;
  projects: EntityRepository<Project, ProjectInput>;
  goals: EntityRepository<Goal, GoalInput>;
  inbox: EntityRepository<InboxItem, InboxItemInput>;
  ideas: EntityRepository<Idea, IdeaInput>;
  /**
   * The learning timeline (formerly "Milestones"). In Supabase it is still
   * backed by the `milestones` table; only the application name changed.
   */
  learnings: EntityRepository<Learning, LearningInput>;
  /** Milestones inside projects. Unrelated to `learnings`. */
  projectMilestones: ProjectMilestoneRepository;
  /**
   * Whether this backend can store Project Milestones right now. Local
   * storage always can. Supabase can once
   * supabase/migrations/008_project_milestones.sql has been applied; until
   * then the repository never reads or writes the new table or column, so this
   * build runs unchanged against the current database.
   */
  supportsProjectMilestones(): Promise<boolean>;
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

  /** Full JSON export for backup / transfer (`learnings` + `projectMilestones`). */
  exportData(): Promise<AppData>;
  /**
   * Replace all data from a previously exported payload. Pre-Phase-3 exports
   * (learning timeline under `milestones`) are accepted and read as learnings.
   * Inconsistent project-milestone references are refused before anything is
   * replaced.
   */
  importData(data: AppDataImport): Promise<void>;
}
