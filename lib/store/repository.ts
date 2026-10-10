/**
 * Data-access layer.
 *
 * The UI never talks to a specific backend. It talks to an `AppRepository`,
 * which is currently backed by browser storage and will later be backed by
 * Supabase/PostgreSQL (see supabase-repository.ts and supabase/schema.sql).
 */

import type {
  ExistingProjectPlanImportResult,
  ProjectPlanImportResult,
  ResolvedExistingProjectImport,
  ResolvedProjectPlan,
} from '../project-plan';
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

/**
 * CRUD contract for one collection.
 *
 * `deleteMany` is the bulk counterpart of `delete` — exactly these rows are
 * removed and nothing else, with the same per-record semantics. An empty id
 * list deletes nothing and writes nothing. Ids that do not (or no longer)
 * exist are ignored: a bulk delete is therefore safe to retry, and safe
 * against another tab having deleted the same record first. Deletion is
 * always the real removal of the rows — never a hide, a filter or a state
 * edit — and on Supabase every request stays scoped to the signed-in user.
 */
export interface EntityRepository<T, C> {
  list(): Promise<T[]>;
  create(input: C): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
  deleteMany(ids: string[]): Promise<void>;
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
 * deleted), and a milestone can never move to another project. `deleteMany`
 * carries exactly that contract: detach all listed milestones' tasks, then
 * remove the milestone rows — and nothing else.
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

  /* ------------------------------------------------------------------ */
  /* Bulk deletion (Phase 6 — Bulk Select & Delete)                      */
  /*                                                                     */
  /* Each method is the batched form of an existing single-record        */
  /* delete, with exactly its semantics — no new cascade rules:          */
  /*                                                                     */
  /*   - empty id list = no-op (no reads, no writes, no requests);       */
  /*   - unknown / already-deleted ids are ignored, so a partial         */
  /*     failure is safe to retry and a stale tab can't double-delete;   */
  /*   - on Supabase every request stays `user_id = <me> AND id IN(…)`,  */
  /*     chunked at 200 ids per request. PostgREST has no cross-table    */
  /*     transaction, so multi-table operations run children-aware in    */
  /*     the order the single-record paths already use; a mid-sequence   */
  /*     failure leaves a consistent SUPERSET (some selected rows may     */
  /*     still exist — never half a row, never a foreign record touched) */
  /*     and the caller re-reads the affected lists.                     */
  /*   - on LocalRepository each operation is ONE whole-store write, so  */
  /*     other tabs observe it atomically.                               */
  /* ------------------------------------------------------------------ */

  /**
   * Permanently removes exactly the listed task rows, together with the rows
   * that belong to them alone: their subtasks and their recorded timer
   * sessions (the same cascade DataProvider.deleteTask performs for one task).
   * Surviving tasks that had a deleted task as their broken-down parent lose
   * only that link. The tasks' projects, project milestones and goals are
   * never touched.
   */
  deleteTasks(ids: string[]): Promise<void>;
  /**
   * Removes the listed projects and, per this app's architecture, every
   * milestone belonging to them (detaching the milestones' tasks first).
   * Tasks are NEVER deleted — they survive, detached from the removed
   * projects and milestones, exactly as the single-project delete detaches
   * them. Goals are never touched.
   */
  deleteProjects(ids: string[]): Promise<void>;
  /**
   * Bulk form of `projectMilestones.delete`: removes exactly the listed
   * milestone rows; tasks that used them survive with `projectMilestoneId`
   * cleared. On Supabase, refuses to run before migration 008 is applied,
   * like the single delete.
   */
  deleteProjectMilestones(ids: string[]): Promise<void>;
  /**
   * Removes exactly the listed goal rows. Linked projects and tasks are NEVER
   * deleted — they survive, detached from the removed goals (their
   * `goalId` links are cleared).
   */
  deleteGoals(ids: string[]): Promise<void>;

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

  /**
   * Create the records of a validated FocusDesk project plan
   * (Goal → Project → ProjectMilestone → Task → child Task). See lib/project-plan.ts.
   *
   * The opposite of `importData` in every way that matters:
   *
   *  - **Additive.** It only ever inserts. No existing goal, project, task,
   *    project milestone or learning is updated or deleted — the plan's
   *    temporary ids are replaced by freshly generated ones, so it cannot even
   *    address an existing record.
   *  - **All or nothing.** The plan is expected to be validated already; the
   *    repository re-checks its references, then writes. Local storage does it
   *    in one write. Supabase has no cross-table transaction over PostgREST,
   *    so it inserts parents-first in batches per task depth and, if any request
   *    fails, compensates only this import's attempted fresh IDs, descendants
   *    first. A cleanup failure is reported explicitly and surviving ancestors
   *    are retained — this is not server-side transactional atomicity.
   *
   * Records are written as the authenticated user, through the same paths as
   * every other write, so Row Level Security applies unchanged.
   */
  importProjectPlan(plan: ResolvedProjectPlan): Promise<ProjectPlanImportResult>;

  /**
   * Add a validated plan to an existing project (Phase 5 — "Add to Existing
   * Project"). See lib/project-plan.ts → resolveExistingProjectImport.
   *
   * Creates new project milestones and new tasks inside the target project —
   * and nothing else. The target project, its goal relationship, its existing
   * milestones and every existing task are never updated or deleted, and the
   * plan's goal and project are source metadata only: they are never created.
   * Milestones the user mapped to existing ones are reused by id (never
   * modified); the rest are created after the project's existing milestones,
   * in the imported order. Every task is new and bound to the target project.
   *
   * Same guarantees as `importProjectPlan`: validated before the first write;
   * atomic locally (one write), compensated on Supabase (parents-first batches,
   * reverse-depth deletion of this import's attempted fresh IDs, explicit
   * cleanup-failure reporting). Records are written as the signed-in user,
   * so Row Level Security applies unchanged.
   */
  importProjectPlanIntoExistingProject(
    resolved: ResolvedExistingProjectImport,
  ): Promise<ExistingProjectPlanImportResult>;
}
