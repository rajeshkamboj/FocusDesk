/**
 * Supabase/PostgreSQL repository.
 *
 * Talks to Supabase's PostgREST endpoint with the public anon key only — the
 * same contract as `LocalRepository`. It activates automatically when
 * `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set.
 *
 * The expected schema lives in `supabase/schema.sql` plus the migrations in
 * `supabase/migrations/`.
 *
 * SCHEMA THAT MAY NOT EXIST YET
 * -----------------------------
 * Project Milestones need migration 008 (`project_milestones` table and
 * `tasks.project_milestone_id`). Until it has been applied this repository
 * must behave exactly as before, so it asks the database once — a read-only,
 * user-scoped `select … limit 1` per object — and while the answer is "not
 * there" it never selects, inserts or updates the new table or column:
 * `projectMilestones.list()` is empty, task writes leave the column out, and
 * milestone writes are refused with a clear message. See
 * `supportsProjectMilestones()`.
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
  LearningCategory,
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
import type { SupabaseClient } from '@supabase/supabase-js';
import { emptyData, defaultSettings } from './defaults';
import { normalizeAppData } from './normalize';
import {
  ProjectMilestoneError,
  assertProjectMilestonesConsistent,
  planProjectMilestoneOrder,
  projectMilestonesFor,
} from '../project-milestones';
import { ProjectPlanError, buildExistingProjectPlanRecords, buildProjectPlanRecords } from '../project-plan';
import type {
  ExistingProjectPlanImportResult,
  ProjectPlanImportResult,
  ResolvedExistingProjectImport,
  ResolvedProjectPlan,
} from '../project-plan';
import type {
  AppRepository,
  DailyPriorityInput,
  EntityRepository,
  InboxItemInput,
  IdeaInput,
  MonthlyPriorityInput,
  ProjectMilestoneRepository,
  WeeklyPriorityInput,
} from './repository';

/* ------------------------------------------------------------------ */
/* Row mapping (domain camelCase ⇄ database snake_case)                */
/* ------------------------------------------------------------------ */

type Row = Record<string, unknown>;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

const taskMap = {
  toRow: (t: Task): Row => ({
    id: t.id,
    title: t.title,
    description: t.description ?? null,
    status: t.status,
    priority: t.priority,
    project_id: t.projectId ?? null,
    // Migration 008. Stripped from every write while the column does not
    // exist yet (see SupabaseRepository.prepareTaskRow).
    project_milestone_id: t.projectMilestoneId ?? null,
    goal_id: t.goalId ?? null,
    parent_task_id: t.parentTaskId ?? null,
    created_at: t.createdAt,
    scheduled_date: t.scheduledDate ?? null,
    due_date: t.dueDate ?? null,
    completed_at: t.completedAt ?? null,
    estimated_duration: t.estimatedDuration ?? null,
    actual_duration: t.actualDuration ?? null,
    started_at: t.startedAt ?? null,
    paused_at: t.pausedAt ?? null,
    actual_duration_seconds: t.actualDurationSeconds ?? null,
    reminder: t.reminder ?? null,
    notes: t.notes ?? null,
    tags: t.tags,
    recurrence: t.recurrence ?? null,
    postponement_count: t.postponementCount,
    archived: t.archived,
  }),
  fromRow: (r: Row): Task => ({
    id: String(r.id),
    title: String(r.title ?? ''),
    description: str(r.description),
    status: (r.status as Task['status']) ?? 'created',
    priority: (r.priority as Task['priority']) ?? 'medium',
    projectId: str(r.project_id),
    projectMilestoneId: str(r.project_milestone_id),
    goalId: str(r.goal_id),
    parentTaskId: str(r.parent_task_id),
    createdAt: String(r.created_at ?? new Date().toISOString()),
    scheduledDate: str(r.scheduled_date),
    dueDate: str(r.due_date),
    completedAt: str(r.completed_at),
    estimatedDuration: num(r.estimated_duration),
    actualDuration: num(r.actual_duration),
    // Timer columns are part of the persisted session — they must be read
    // back, otherwise a running/paused timer would be lost on reload (and
    // every read-modify-write update would wipe the columns in the database).
    startedAt: str(r.started_at),
    pausedAt: str(r.paused_at),
    actualDurationSeconds: num(r.actual_duration_seconds),
    reminder: str(r.reminder),
    notes: str(r.notes),
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    recurrence: str(r.recurrence),
    postponementCount: num(r.postponement_count) ?? 0,
    archived: bool(r.archived),
  }),
};

const projectMap = {
  toRow: (p: Project): Row => ({
    id: p.id,
    name: p.name,
    description: p.description ?? null,
    goal_id: p.goalId ?? null,
    deadline: p.deadline ?? null,
    status: p.status,
    created_at: p.createdAt,
  }),
  fromRow: (r: Row): Project => ({
    id: String(r.id),
    name: String(r.name ?? ''),
    description: str(r.description),
    goalId: str(r.goal_id),
    deadline: str(r.deadline),
    status: (r.status as Project['status']) ?? 'active',
    createdAt: String(r.created_at ?? new Date().toISOString()),
  }),
};

const goalMap = {
  toRow: (g: Goal): Row => ({
    id: g.id,
    name: g.name,
    description: g.description ?? null,
    deadline: g.deadline ?? null,
    status: g.status,
    created_at: g.createdAt,
  }),
  fromRow: (r: Row): Goal => ({
    id: String(r.id),
    name: String(r.name ?? ''),
    description: str(r.description),
    deadline: str(r.deadline),
    status: (r.status as Goal['status']) ?? 'active',
    createdAt: String(r.created_at ?? new Date().toISOString()),
  }),
};

const inboxMap = {
  toRow: (i: InboxItem): Row => ({
    id: i.id,
    title: i.title,
    note: i.note ?? null,
    created_at: i.createdAt,
  }),
  fromRow: (r: Row): InboxItem => ({
    id: String(r.id),
    title: String(r.title ?? ''),
    note: str(r.note),
    createdAt: String(r.created_at ?? new Date().toISOString()),
  }),
};

const ideaMap = {
  toRow: (i: Idea): Row => ({
    id: i.id,
    title: i.title,
    description: i.description ?? null,
    created_at: i.createdAt,
    archived: i.archived,
  }),
  fromRow: (r: Row): Idea => ({
    id: String(r.id),
    title: String(r.title ?? ''),
    description: str(r.description),
    createdAt: String(r.created_at ?? new Date().toISOString()),
    archived: bool(r.archived),
  }),
};

/**
 * Learnings keep living in the `milestones` table.
 *
 * Phase 3 renamed the feature, not the data: the live table, its 56 rows,
 * their ids and their partial dates stay exactly as they are, and a later,
 * separately planned migration may rename the table. Until then this
 * constant is the only place the app spells the old name.
 */
export const LEARNINGS_TABLE = 'milestones';

/** Migration 008. Never read or written until `supportsProjectMilestones()`. */
export const PROJECT_MILESTONES_TABLE = 'project_milestones';

const learningMap = {
  toRow: (m: Learning): Row => ({
    id: m.id,
    title: m.title,
    category: m.category,
    description: m.description ?? null,
    // Stored as text, not `date`: the value is deliberately partial
    // ('2025', '2025-08', '2025-08-14') and a date column would invent a day.
    date: m.date,
    created_at: m.createdAt,
  }),
  fromRow: (r: Row): Learning => ({
    id: String(r.id),
    title: String(r.title ?? ''),
    category: (str(r.category) as LearningCategory) ?? 'other',
    description: str(r.description),
    date: String(r.date ?? ''),
    createdAt: String(r.created_at ?? new Date().toISOString()),
  }),
};

const projectMilestoneMap = {
  toRow: (m: ProjectMilestone): Row => ({
    id: m.id,
    project_id: m.projectId,
    name: m.name,
    description: m.description ?? null,
    target_date: m.targetDate ?? null,
    position: m.position,
    created_at: m.createdAt,
  }),
  fromRow: (r: Row): ProjectMilestone => ({
    id: String(r.id),
    projectId: String(r.project_id ?? ''),
    name: String(r.name ?? ''),
    description: str(r.description),
    targetDate: str(r.target_date),
    position: num(r.position) ?? 0,
    createdAt: String(r.created_at ?? new Date().toISOString()),
  }),
};

const dailyPriorityMap = {
  toRow: (d: DailyPriority): Row => ({
    id: d.id,
    date: d.date,
    title: d.title,
    completed: d.completed,
    completed_at: d.completedAt ?? null,
    due_date: d.dueDate ?? null,
    postponement_count: d.postponementCount ?? 0,
  }),
  fromRow: (r: Row): DailyPriority => ({
    id: String(r.id),
    date: String(r.date ?? ''),
    title: String(r.title ?? ''),
    completed: bool(r.completed),
    completedAt: str(r.completed_at),
    dueDate: str(r.due_date),
    postponementCount: num(r.postponement_count) ?? 0,
  }),
};

const weeklyPriorityMap = {
  toRow: (w: WeeklyPriority): Row => ({
    id: w.id,
    week: w.week,
    title: w.title,
    primary: w.primary,
    completed: w.completed,
    completed_at: w.completedAt ?? null,
  }),
  fromRow: (r: Row): WeeklyPriority => ({
    id: String(r.id),
    week: String(r.week ?? ''),
    title: String(r.title ?? ''),
    primary: bool(r.primary),
    completed: bool(r.completed),
    completedAt: str(r.completed_at),
  }),
};

const monthlyPriorityMap = {
  toRow: (m: MonthlyPriority): Row => ({
    id: m.id,
    month: m.month,
    title: m.title,
    completed: m.completed,
    completed_at: m.completedAt ?? null,
    goal_id: m.goalId ?? null,
    project_id: m.projectId ?? null,
  }),
  fromRow: (r: Row): MonthlyPriority => ({
    id: String(r.id),
    month: String(r.month ?? ''),
    title: String(r.title ?? ''),
    completed: bool(r.completed),
    completedAt: str(r.completed_at),
    goalId: str(r.goal_id),
    projectId: str(r.project_id),
  }),
};

const wellbeingDayMap = {
  toRow: (w: WellbeingDay): Row => ({
    id: w.id,
    date: w.date,
    jogging: w.jogging,
    nitnem_morning: w.nitnemMorning,
    nitnem_evening: w.nitnemEvening,
    nitnem_night: w.nitnemNight,
  }),
  fromRow: (r: Row): WellbeingDay => ({
    id: String(r.id),
    date: String(r.date ?? ''),
    jogging: bool(r.jogging),
    nitnemMorning: bool(r.nitnem_morning),
    nitnemEvening: bool(r.nitnem_evening),
    nitnemNight: bool(r.nitnem_night),
  }),
};

const subtaskMap = {
  toRow: (s: Subtask): Row => ({
    id: s.id,
    parent_task_id: s.parentTaskId,
    title: s.title,
    completed: s.completed,
    sort_order: s.position,
    created_at: s.createdAt,
  }),
  fromRow: (r: Row): Subtask => ({
    id: String(r.id),
    parentTaskId: String(r.parent_task_id ?? ''),
    title: String(r.title ?? ''),
    completed: bool(r.completed),
    position: num(r.sort_order) ?? 0,
    createdAt: String(r.created_at ?? new Date().toISOString()),
  }),
};

/**
 * Timer sessions: one row per continuous run of a task timer. Deliberately
 * flat — the day a session belongs to is derived in the client (local
 * calendar days), never stored, so a session that spans midnight stays the
 * single run it actually was.
 */
const timerSessionMap = {
  toRow: (s: TimerSession): Row => ({
    id: s.id,
    task_id: s.taskId,
    started_at: s.startedAt,
    ended_at: s.endedAt,
    duration_seconds: Math.max(0, Math.floor(s.durationSeconds)),
  }),
  fromRow: (r: Row): TimerSession => ({
    id: String(r.id),
    taskId: String(r.task_id ?? ''),
    startedAt: String(r.started_at ?? new Date().toISOString()),
    endedAt: String(r.ended_at ?? r.started_at ?? new Date().toISOString()),
    durationSeconds: num(r.duration_seconds) ?? 0,
  }),
};

const historyMap = {
  toRow: (h: TaskHistoryEntry): Row => ({
    id: h.id,
    task_id: h.taskId,
    type: h.type,
    at: h.at,
    note: h.note ?? null,
  }),
  fromRow: (r: Row): TaskHistoryEntry => ({
    id: String(r.id),
    taskId: String(r.task_id ?? ''),
    type: (r.type as TaskHistoryEntry['type']) ?? 'created',
    at: String(r.at ?? new Date().toISOString()),
    note: str(r.note),
  }),
};

/* ------------------------------------------------------------------ */
/* REST plumbing                                                       */
/* ------------------------------------------------------------------ */

class RestCollection<T extends { id: string }, C> implements EntityRepository<T, C> {
  constructor(
    private readonly http: SupabaseHttpClient,
    private readonly table: string,
    private readonly map: { toRow: (item: T) => Row; fromRow: (row: Row) => T },
    private readonly make: (input: C) => T,
    private readonly listOrder?: { column: string; ascending: boolean },
    /** Last chance to adjust a row before it is written (e.g. drop a column that does not exist yet). */
    private readonly prepareRow: (row: Row) => Row | Promise<Row> = (row) => row,
  ) {}

  async list(): Promise<T[]> {
    const rows = await this.http.get(this.table, {}, this.listOrder);
    return rows.map(this.map.fromRow);
  }

  async create(input: C): Promise<T> {
    const item = this.make(input);
    await this.http.post(this.table, await this.prepareRow(this.map.toRow(item)));
    return item;
  }

  async update(id: string, patch: Partial<T>): Promise<T> {
    const rows = await this.http.get(this.table, { id });
    if (rows.length === 0) throw new Error(`Record not found: ${id}`);
    const current = this.map.fromRow(rows[0]);
    const next = { ...current, ...patch };
    await this.http.patch(this.table, id, await this.prepareRow(this.map.toRow(next)));
    return next;
  }

  async delete(id: string): Promise<void> {
    await this.http.delete(this.table, id);
  }

  /**
   * Bulk form of `delete`: removes exactly the listed rows of the signed-in
   * user, chunked so one huge selection never becomes one huge URL. Unknown
   * ids match nothing and are ignored, which keeps retries and stale-tab
   * repeats harmless. An empty selection sends no request at all.
   */
  async deleteMany(ids: string[]): Promise<void> {
    for (let start = 0; start < ids.length; start += BULK_DELETE_BATCH) {
      await this.http.deleteMany(this.table, ids.slice(start, start + BULK_DELETE_BATCH));
    }
  }
}

/**
 * PostgREST/PostgreSQL error codes meaning "that table or column does not
 * exist (yet)": PGRST205 / 42P01 — unknown table; 42703 — unknown column in a
 * query; PGRST204 — unknown column in a write body.
 */
const MISSING_SCHEMA_CODES = new Set(['PGRST205', '42P01', '42703', 'PGRST204']);

class SupabaseHttpClient {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
  ) {}

  private owned(row: Row): Row {
    return { ...row, user_id: this.userId };
  }

  /**
   * Read-only, user-scoped existence check: true when `columns` of `table`
   * can be selected, false when PostgREST reports the table/column missing.
   * Anything else (network, permissions…) throws and is not cached.
   */
  async hasColumns(table: string, columns: string): Promise<boolean> {
    const { error } = await this.client.from(table).select(columns).eq('user_id', this.userId).limit(1);
    if (!error) return true;
    if (MISSING_SCHEMA_CODES.has(String(error.code ?? ''))) return false;
    throw new Error(`Supabase read from ${table} failed: ${error.message}`);
  }

  /**
   * Partial update of every own row matching `filters` (only the given columns
   * change). A filter value may be a list — `IN (...)` — which is what makes
   * bulk referential fixes (detach N milestones' tasks) one request instead
   * of N.
   */
  async patchWhere(table: string, filters: Record<string, string | string[]>, body: Row): Promise<void> {
    let query = this.client.from(table).update(body).eq('user_id', this.userId);
    for (const [column, value] of Object.entries(filters)) {
      query = Array.isArray(value) ? query.in(column, value) : query.eq(column, value);
    }
    const { error } = await query;
    if (error) throw new Error(`Supabase update of ${table} failed: ${error.message}`);
  }

  async get(
    table: string,
    filters: Record<string, string | string[]> = {},
    order?: { column: string; ascending: boolean },
  ): Promise<Row[]> {
    let query = this.client.from(table).select('*').eq('user_id', this.userId);
    for (const [column, value] of Object.entries(filters)) {
      query = Array.isArray(value) ? query.in(column, value) : query.eq(column, value);
    }
    if (order) query = query.order(order.column, { ascending: order.ascending });
    const { data, error } = await query;
    if (error) throw new Error(`Supabase read from ${table} failed: ${error.message}`);
    return (data ?? []) as Row[];
  }

  async post(table: string, body: Row | Row[]): Promise<void> {
    const rows = Array.isArray(body) ? body.map((row) => this.owned(row)) : this.owned(body);
    const { error } = await this.client.from(table).insert(rows);
    if (error) throw new Error(`Supabase insert into ${table} failed: ${error.message}`);
  }

  async patch(table: string, id: string, body: Row): Promise<void> {
    const { error } = await this.client
      .from(table)
      .update(this.owned(body))
      .eq('user_id', this.userId)
      .eq('id', id);
    if (error) throw new Error(`Supabase update of ${table} failed: ${error.message}`);
  }

  async delete(table: string, id: string): Promise<void> {
    const { error } = await this.client
      .from(table)
      .delete()
      .eq('user_id', this.userId)
      .eq('id', id);
    if (error) throw new Error(`Supabase delete from ${table} failed: ${error.message}`);
  }

  async clear(table: string): Promise<void> {
    const { error } = await this.client.from(table).delete().eq('user_id', this.userId);
    if (error) throw new Error(`Supabase clear of ${table} failed: ${error.message}`);
  }

  /**
   * Delete exactly these rows of the signed-in user — never a whole table.
   * Used to undo a project-plan import that failed halfway, so a refused plan
   * leaves the database as it was.
   */
  async deleteMany(table: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await this.client.from(table).delete().eq('user_id', this.userId).in('id', ids);
    if (error) throw new Error(`Supabase delete from ${table} failed: ${error.message}`);
  }

  async upsert(table: string, body: Row): Promise<void> {
    const { error } = await this.client.from(table).upsert(this.owned(body));
    if (error) throw new Error(`Supabase upsert into ${table} failed: ${error.message}`);
  }
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const NOT_MIGRATED_MESSAGE =
  'Project milestones are not available yet: the database migration supabase/migrations/008_project_milestones.sql has not been applied.';

/**
 * `project_milestones`, gated on migration 008. Until the schema exists,
 * reads are empty and writes are refused before any request is made.
 */
class SupabaseProjectMilestones implements ProjectMilestoneRepository {
  private readonly rows: RestCollection<ProjectMilestone, ProjectMilestoneInput>;

  constructor(
    private readonly http: SupabaseHttpClient,
    private readonly available: () => Promise<boolean>,
  ) {
    this.rows = new RestCollection(
      http,
      PROJECT_MILESTONES_TABLE,
      projectMilestoneMap,
      (input) => ({
        id: uuid(),
        projectId: input.projectId,
        name: input.name.trim(),
        description: input.description?.trim() || undefined,
        targetDate: input.targetDate || undefined,
        position: input.position ?? 0,
        createdAt: new Date().toISOString(),
      }),
      { column: 'position', ascending: true },
    );
  }

  private async requireSchema(): Promise<void> {
    if (!(await this.available())) throw new ProjectMilestoneError(NOT_MIGRATED_MESSAGE);
  }

  async list(): Promise<ProjectMilestone[]> {
    if (!(await this.available())) return [];
    return this.rows.list();
  }

  async create(input: ProjectMilestoneInput): Promise<ProjectMilestone> {
    await this.requireSchema();
    return this.rows.create(input);
  }

  /** Only name, description, target date and position can change — never id or project. */
  async update(id: string, patch: Partial<ProjectMilestone>): Promise<ProjectMilestone> {
    await this.requireSchema();
    if (patch.projectId !== undefined) {
      const current = (await this.http.get(PROJECT_MILESTONES_TABLE, { id }))[0];
      if (current && patch.projectId !== current.project_id) {
        throw new ProjectMilestoneError('A milestone cannot move to another project.');
      }
    }
    const allowed: Partial<ProjectMilestone> = {};
    if (patch.name !== undefined) allowed.name = patch.name.trim();
    if ('description' in patch) allowed.description = patch.description;
    if ('targetDate' in patch) allowed.targetDate = patch.targetDate;
    if (patch.position !== undefined) allowed.position = patch.position;
    return this.rows.update(id, allowed);
  }

  /**
   * Clears the link on the milestone's tasks first (the tasks are kept),
   * then deletes it. The ON DELETE SET NULL foreign key does the same in the
   * database; doing it explicitly keeps both backends' behaviour identical.
   */
  async delete(id: string): Promise<void> {
    await this.requireSchema();
    await this.http.patchWhere('tasks', { project_milestone_id: id }, { project_milestone_id: null });
    await this.http.delete(PROJECT_MILESTONES_TABLE, id);
  }

  /**
   * Bulk form of `delete`, same contract per milestone: the tasks that used
   * any listed milestone are detached first (`IN (...)` per chunk), then the
   * milestone rows are deleted. Detach-before-delete means a failure midway
   * can only ever leave MORE links pointing at still-existing milestones —
   * never a task pointing at a row that is gone. Gated on migration 008 like
   * every other write here.
   */
  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.requireSchema();
    for (let start = 0; start < ids.length; start += BULK_DELETE_BATCH) {
      const chunk = ids.slice(start, start + BULK_DELETE_BATCH);
      await this.http.patchWhere('tasks', { project_milestone_id: chunk }, { project_milestone_id: null });
      await this.http.deleteMany(PROJECT_MILESTONES_TABLE, chunk);
    }
  }

  async listForProject(projectId: string): Promise<ProjectMilestone[]> {
    if (!(await this.available())) return [];
    const rows = await this.http.get(PROJECT_MILESTONES_TABLE, { project_id: projectId }, { column: 'position', ascending: true });
    return projectMilestonesFor(rows.map(projectMilestoneMap.fromRow), projectId);
  }

  /** Only rows whose position actually changes are written. */
  async reorder(projectId: string, orderedIds: string[]): Promise<ProjectMilestone[]> {
    await this.requireSchema();
    const current = await this.listForProject(projectId);
    const plan = planProjectMilestoneOrder(current, projectId, orderedIds);
    const byId = new Map(current.map((m) => [m.id, m]));
    for (const { id, position } of plan) {
      if (byId.get(id)?.position !== position) {
        await this.http.patchWhere(PROJECT_MILESTONES_TABLE, { id, project_id: projectId }, { position });
      }
    }
    return this.listForProject(projectId);
  }
}

export class SupabaseRepository implements AppRepository {
  readonly kind = 'supabase' as const;

  private readonly http: SupabaseHttpClient;

  tasks: EntityRepository<Task, TaskInput>;
  subtasks: EntityRepository<Subtask, SubtaskInput>;
  projects: EntityRepository<Project, ProjectInput>;
  goals: EntityRepository<Goal, GoalInput>;
  inbox: EntityRepository<InboxItem, InboxItemInput>;
  ideas: EntityRepository<Idea, IdeaInput>;
  learnings: EntityRepository<Learning, LearningInput>;
  projectMilestones: ProjectMilestoneRepository;
  dailyPriorities: EntityRepository<DailyPriority, DailyPriorityInput>;
  weeklyPriorities: EntityRepository<WeeklyPriority, WeeklyPriorityInput>;
  monthlyPriorities: EntityRepository<MonthlyPriority, MonthlyPriorityInput>;
  wellbeingDays: EntityRepository<WellbeingDay, WellbeingDayInput>;
  timerSessions: EntityRepository<TimerSession, TimerSessionInput>;

  /** Memoized answer of the migration-008 probe; reset when the probe fails. */
  private projectMilestoneSchema: Promise<boolean> | null = null;

  constructor(client: SupabaseClient, userId: string) {
    this.http = new SupabaseHttpClient(client, userId);

    this.tasks = new RestCollection(
      this.http,
      'tasks',
      taskMap,
      (input) => ({
        id: input.id ?? uuid(),
        title: input.title.trim(),
        description: input.description?.trim() || undefined,
        status: input.status ?? 'created',
        priority: input.priority ?? 'medium',
        projectId: input.projectId || undefined,
        projectMilestoneId: input.projectMilestoneId || undefined,
        goalId: input.goalId || undefined,
        parentTaskId: input.parentTaskId || undefined,
        createdAt: new Date().toISOString(),
        scheduledDate: input.scheduledDate,
        dueDate: input.dueDate,
        estimatedDuration: input.estimatedDuration,
        reminder: input.reminder,
        notes: input.notes?.trim() || undefined,
        tags: input.tags ?? [],
        postponementCount: 0,
        archived: false,
      }),
      undefined,
      (row) => this.prepareTaskRow(row),
    );

    this.subtasks = new RestCollection(
      this.http,
      'subtasks',
      subtaskMap,
      (input) => ({
        id: uuid(),
        parentTaskId: input.parentTaskId,
        title: input.title.trim(),
        completed: false,
        position: input.position ?? 0,
        createdAt: new Date().toISOString(),
      }),
      { column: 'sort_order', ascending: true },
    );

    this.projects = new RestCollection(this.http, 'projects', projectMap, (input) => ({
      id: uuid(),
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      goalId: input.goalId || undefined,
      deadline: input.deadline,
      status: input.status ?? 'active',
      createdAt: new Date().toISOString(),
    }));

    this.goals = new RestCollection(this.http, 'goals', goalMap, (input) => ({
      id: uuid(),
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      deadline: input.deadline,
      status: input.status ?? 'active',
      createdAt: new Date().toISOString(),
    }));

    this.inbox = new RestCollection(this.http, 'inbox_items', inboxMap, (input) => ({
      id: uuid(),
      title: input.title.trim(),
      note: input.note?.trim() || undefined,
      createdAt: new Date().toISOString(),
    }));

    this.ideas = new RestCollection(this.http, 'ideas', ideaMap, (input) => ({
      id: uuid(),
      title: input.title.trim(),
      description: input.description?.trim() || undefined,
      createdAt: new Date().toISOString(),
      archived: false,
    }));

    this.learnings = new RestCollection(this.http, LEARNINGS_TABLE, learningMap, (input) => ({
      id: uuid(),
      title: input.title.trim(),
      category: input.category ?? 'other',
      description: input.description?.trim() || undefined,
      date: input.date,
      createdAt: new Date().toISOString(),
    }));

    this.projectMilestones = new SupabaseProjectMilestones(this.http, () => this.supportsProjectMilestones());

    this.dailyPriorities = new RestCollection(this.http, 'daily_priorities', dailyPriorityMap, (input) => ({
      id: uuid(),
      date: input.date,
      title: input.title.trim(),
      completed: false,
    }));

    this.weeklyPriorities = new RestCollection(this.http, 'weekly_priorities', weeklyPriorityMap, (input) => ({
      id: uuid(),
      week: input.week,
      title: input.title.trim(),
      primary: input.primary ?? false,
      completed: false,
    }));

    this.monthlyPriorities = new RestCollection(this.http, 'monthly_priorities', monthlyPriorityMap, (input) => ({
      id: uuid(),
      month: input.month,
      title: input.title.trim(),
      completed: false,
      goalId: input.goalId || undefined,
      projectId: input.projectId || undefined,
    }));

    this.wellbeingDays = new RestCollection(this.http, 'wellbeing_days', wellbeingDayMap, (input) => ({
      id: uuid(),
      date: input.date,
      jogging: input.jogging ?? false,
      nitnemMorning: input.nitnemMorning ?? false,
      nitnemEvening: input.nitnemEvening ?? false,
      nitnemNight: input.nitnemNight ?? false,
    }));

    this.timerSessions = new RestCollection(
      this.http,
      'timer_sessions',
      timerSessionMap,
      (input) => ({
        id: uuid(),
        taskId: input.taskId,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        durationSeconds: Math.max(0, Math.floor(input.durationSeconds)),
      }),
      { column: 'started_at', ascending: true },
    );
  }

  /**
   * Has migration 008 been applied? Asked once per repository with two
   * read-only, user-scoped probes (the new table and the new tasks column);
   * both must exist. A definite answer is remembered; an unexpected failure
   * (network, permissions) is thrown and not remembered, so the next call
   * asks again. Reload the app after applying the migration.
   */
  supportsProjectMilestones(): Promise<boolean> {
    if (!this.projectMilestoneSchema) {
      const probe = Promise.all([
        this.http.hasColumns(PROJECT_MILESTONES_TABLE, 'id'),
        this.http.hasColumns('tasks', 'project_milestone_id'),
      ]).then(([table, column]) => table && column);
      this.projectMilestoneSchema = probe;
      probe.catch(() => {
        if (this.projectMilestoneSchema === probe) this.projectMilestoneSchema = null;
      });
    }
    return this.projectMilestoneSchema;
  }

  /* ------------------------------------------------------------------ */
  /* Bulk deletion (Phase 6) — contracts in ./repository.ts.             */
  /* PostgREST gives no cross-table transaction, so nothing here pretends */
  /* to be atomic: each statement is individually user-scoped and         */
  /* id-matched, statements run in the same order the single-record       */
  /* deletes already use, and a failure midway leaves a consistent        */
  /* SUPERSET — some selected rows still there, never a foreign row       */
  /* touched, never half a row gone. The provider re-reads affected lists */
  /* so the screen shows the truth and the user can retry the rest.       */
  /* ------------------------------------------------------------------ */

  /**
   * One `DELETE FROM tasks WHERE user_id = me AND id IN (…)` per chunk. The
   * rows that belong to a task alone — its subtasks and its recorded timer
   * runs — disappear with it through the database's own `ON DELETE CASCADE`
   * foreign keys (migrations 005, 006), and surviving children's
   * `parent_task_id` is cleared by the `SET NULL` key, exactly as it already
   * works for the single-task delete. No new request surface is needed to
   * match that guarantee; projects, milestones and goals are untouched.
   */
  async deleteTasks(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.tasks.deleteMany(ids);
  }

  /**
   * Detach-then-delete per milestone, batched — delegates to the gated
   * milestone collection so the migration-008 refusal is the same as the
   * single delete's.
   */
  async deleteProjectMilestones(ids: string[]): Promise<void> {
    await this.projectMilestones.deleteMany(ids);
  }

  /**
   * A project's milestones never outlive it. With migration 008 applied the
   * app removes them explicitly — detach their tasks, delete them, then
   * delete the projects — so both backends and a pre-008 database all behave
   * the same way the single-project delete does. Tasks are never deleted;
   * their `project_id` links are cleared by the base `SET NULL` foreign key.
   * Goals are never touched.
   */
  async deleteProjects(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    if (await this.supportsProjectMilestones()) {
      const doomed = new Set(ids);
      const ownedMilestoneIds = (await this.projectMilestones.list())
        .filter((m) => doomed.has(m.projectId))
        .map((m) => m.id);
      if (ownedMilestoneIds.length > 0) await this.projectMilestones.deleteMany(ownedMilestoneIds);
    }
    await this.projects.deleteMany(ids);
  }

  /**
   * Deletes the goal rows; the database's `ON DELETE SET NULL` foreign keys
   * detach every project and task that pointed at them — the same
   * detach-not-delete behaviour as the single-goal delete. Projects and tasks
   * are never deleted here.
   */
  async deleteGoals(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.goals.deleteMany(ids);
  }

  /**
   * Before migration 008 the tasks table has no project_milestone_id column,
   * and PostgREST rejects a body naming an unknown column — so it is left out
   * of the row entirely. Leaving a column out of an UPDATE never changes it.
   *
   * If the probe itself fails (network, permissions on the new table), the
   * column is left out too: task writes must never depend on the new
   * feature. The UI keeps milestones hidden in that case, so nothing is lost.
   * (Exports and imports stay strict and fail instead of guessing.)
   */
  private async prepareTaskRow(row: Row): Promise<Row> {
    const available = await this.supportsProjectMilestones().catch((error: unknown) => {
      console.error('Could not check for migration 008; writing the task without project_milestone_id', error);
      return false;
    });
    if (available) return row;
    const legacyRow = { ...row };
    delete legacyRow.project_milestone_id;
    return legacyRow;
  }

  taskHistory = {
    list: async (taskId?: string): Promise<TaskHistoryEntry[]> => {
      const rows = await this.http.get(
        'task_history',
        taskId ? { task_id: taskId } : {},
        { column: 'at', ascending: false },
      );
      return rows.map(historyMap.fromRow);
    },
    add: async (entry: Omit<TaskHistoryEntry, 'id' | 'at'> & { at?: string }): Promise<TaskHistoryEntry> => {
      const record: TaskHistoryEntry = {
        id: uuid(),
        taskId: entry.taskId,
        type: entry.type,
        at: entry.at ?? new Date().toISOString(),
        note: entry.note,
      };
      await this.http.post('task_history', historyMap.toRow(record));
      return record;
    },
  };

  settings = {
    get: async (): Promise<Settings> => {
      const rows = await this.http.get('app_settings', { id: 'singleton' });
      const data = rows[0]?.data as Partial<Settings> | undefined;
      const base = emptyData().settings;
      return {
        general: { ...base.general, ...data?.general },
        notifications: { ...base.notifications, ...data?.notifications },
        appearance: { ...base.appearance, ...data?.appearance },
      };
    },
    save: async (patch: Partial<Settings>): Promise<Settings> => {
      const current = await this.settings.get();
      const next: Settings = {
        general: { ...current.general, ...patch.general },
        notifications: { ...current.notifications, ...patch.notifications },
        appearance: { ...current.appearance, ...patch.appearance },
      };
      await this.http.upsert('app_settings', { id: 'singleton', data: next });
      return next;
    },
  };

  async exportData(): Promise<AppData> {
    const [tasks, subtasks, projects, goals, inbox, ideas, learnings, projectMilestones, dailyPriorities, weeklyPriorities, monthlyPriorities, taskHistory, wellbeingDays, timerSessions, settings] =
      await Promise.all([
        this.tasks.list(),
        this.subtasks.list(),
        this.projects.list(),
        this.goals.list(),
        this.inbox.list(),
        this.ideas.list(),
        this.learnings.list(),
        this.projectMilestones.list(),
        this.dailyPriorities.list(),
        this.weeklyPriorities.list(),
        this.monthlyPriorities.list(),
        this.taskHistory.list(),
        this.wellbeingDays.list(),
        this.timerSessions.list(),
        this.settings.get(),
      ]);
    return { tasks, subtasks, projects, goals, inbox, ideas, learnings, projectMilestones, dailyPriorities, weeklyPriorities, monthlyPriorities, taskHistory, wellbeingDays, timerSessions, settings };
  }

  async importData(data: AppDataImport): Promise<void> {
    // Same normalization as local storage: a pre-Phase-3 export's `milestones`
    // become learnings (rows of the `milestones` table) — never project milestones.
    const payload = normalizeAppData(data);

    // Every check happens before the first delete, so a refused import
    // leaves the database exactly as it was.
    assertProjectMilestonesConsistent(payload);
    const milestoneSchema = await this.supportsProjectMilestones();
    if (!milestoneSchema && (payload.projectMilestones.length > 0 || payload.tasks.some((t) => t.projectMilestoneId))) {
      throw new ProjectMilestoneError(`Import refused — nothing was changed. This file contains project milestones. ${NOT_MIGRATED_MESSAGE}`);
    }

    await this.http.clear('subtasks');
    await this.http.clear('timer_sessions');
    if (milestoneSchema) await this.http.clear(PROJECT_MILESTONES_TABLE);
    await Promise.all([
      this.http.clear('tasks'),
      this.http.clear('projects'),
      this.http.clear('goals'),
      this.http.clear('inbox_items'),
      this.http.clear('ideas'),
      this.http.clear(LEARNINGS_TABLE),
      this.http.clear('daily_priorities'),
      this.http.clear('weekly_priorities'),
      this.http.clear('monthly_priorities'),
      this.http.clear('task_history'),
      this.http.clear('wellbeing_days'),
    ]);

    const bulk = (table: string, rows: Row[]) => (rows.length > 0 ? this.http.post(table, rows) : Promise.resolve());
    const taskRows = await Promise.all(payload.tasks.map((t) => this.prepareTaskRow(taskMap.toRow(t))));

    // Inserted parents-first so every foreign key already has its target:
    // goals → projects → project milestones → tasks → subtasks / timer sessions.
    await Promise.all([
      bulk('goals', payload.goals.map(goalMap.toRow)),
      bulk('inbox_items', payload.inbox.map(inboxMap.toRow)),
      bulk('ideas', payload.ideas.map(ideaMap.toRow)),
      bulk(LEARNINGS_TABLE, payload.learnings.map(learningMap.toRow)),
      bulk('daily_priorities', payload.dailyPriorities.map(dailyPriorityMap.toRow)),
      bulk('weekly_priorities', payload.weeklyPriorities.map(weeklyPriorityMap.toRow)),
      bulk('task_history', payload.taskHistory.map(historyMap.toRow)),
      bulk('wellbeing_days', payload.wellbeingDays.map(wellbeingDayMap.toRow)),
    ]);
    await bulk('projects', payload.projects.map(projectMap.toRow));
    await Promise.all([
      milestoneSchema ? bulk(PROJECT_MILESTONES_TABLE, payload.projectMilestones.map(projectMilestoneMap.toRow)) : Promise.resolve(),
      bulk('monthly_priorities', payload.monthlyPriorities.map(monthlyPriorityMap.toRow)),
    ]);
    await bulk('tasks', taskRows);
    await Promise.all([
      bulk('subtasks', payload.subtasks.map(subtaskMap.toRow)),
      bulk('timer_sessions', payload.timerSessions.map(timerSessionMap.toRow)),
    ]);
    await this.settings.save(payload.settings);
  }

  /**
   * Add a validated project plan (Goal → Project → ProjectMilestone → Task).
   *
   * Only ever INSERTs, always as `this.userId`, so Row Level Security applies
   * exactly as it does to a record created through the UI: a plan cannot name
   * an owner, and it cannot reach another user's rows or an existing record of
   * this user (its temporary ids are replaced by freshly generated ones).
   *
   * ATOMICITY. PostgREST has no cross-table transaction, so this is the honest
   * next best thing:
   *
   *  1. every record is built and re-checked *before* the first request;
   *  2. inserts go parents-first — goals → projects → project milestones →
   *     tasks — in whole batches, one request each, so a foreign key always
   *     has its target and a failed request inserted nothing at all;
   *  3. if any request fails, the rows this import did create are deleted in
   *     reverse order and the failure is reported.
   *
   * The result is that a refused or failed plan leaves the database as it was,
   * and the caller is told the truth either way — including the rare case
   * where the undo itself could not finish, which is named explicitly rather
   * than swallowed.
   */
  async importProjectPlan(plan: ResolvedProjectPlan): Promise<ProjectPlanImportResult> {
    const { goals, projects, projectMilestones, tasks } = buildProjectPlanRecords(plan, {
      newId: uuid,
      now: () => new Date().toISOString(),
    });

    const milestoneSchema = await this.supportsProjectMilestones();
    if (!milestoneSchema && (projectMilestones.length > 0 || tasks.some((t) => t.projectMilestoneId))) {
      throw new ProjectPlanError(`Import refused — nothing was created. This plan contains project milestones. ${NOT_MIGRATED_MESSAGE}`);
    }

    /** Tables this import has written to, with the ids that really landed. */
    const written: { table: string; ids: string[] }[] = [];
    const insert = (table: string, rows: Row[], ids: string[]) => this.insertImportRows(written, table, rows, ids);

    try {
      await insert('goals', goals.map(goalMap.toRow), goals.map((g) => g.id));
      await insert('projects', projects.map(projectMap.toRow), projects.map((p) => p.id));
      if (milestoneSchema) {
        await insert(
          PROJECT_MILESTONES_TABLE,
          projectMilestones.map(projectMilestoneMap.toRow),
          projectMilestones.map((m) => m.id),
        );
      }
      // Same guard as every other task write: the column is left out entirely
      // when migration 008 is not there yet.
      const taskRows = await Promise.all(tasks.map((t) => this.prepareTaskRow(taskMap.toRow(t))));
      await insert('tasks', taskRows, tasks.map((t) => t.id));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const left = await this.undoProjectPlanImport(written);
      throw new ProjectPlanError(
        left.length === 0
          ? `Import failed — nothing was kept. ${reason}`
          : `Import failed, and ${left.length} of its records could not be removed again (${left.join(', ')}). ${reason}`,
      );
    }

    return { goals, projects, projectMilestones, tasks };
  }

  /**
   * Remove what a failed plan import did create, children first. Returns the
   * tables whose rows could not be deleted, so the caller can say so plainly
   * instead of claiming a clean rollback.
   */
  private async undoProjectPlanImport(written: { table: string; ids: string[] }[]): Promise<string[]> {
    const failed: string[] = [];
    for (const entry of [...written].reverse()) {
      for (let start = 0; start < entry.ids.length; start += PLAN_INSERT_BATCH) {
        try {
          await this.http.deleteMany(entry.table, entry.ids.slice(start, start + PLAN_INSERT_BATCH));
        } catch (error) {
          console.error(`Could not undo the project-plan insert into ${entry.table}`, error);
          failed.push(entry.table);
          break;
        }
      }
    }
    return [...new Set(failed)];
  }

  /**
   * Insert whole batches, parents first, recording exactly what landed so a
   * rollback can remove it. Shared by both plan imports.
   */
  private async insertImportRows(
    written: { table: string; ids: string[] }[],
    table: string,
    rows: Row[],
    ids: string[],
  ): Promise<void> {
    for (let start = 0; start < rows.length; start += PLAN_INSERT_BATCH) {
      const end = start + PLAN_INSERT_BATCH;
      await this.http.post(table, rows.slice(start, end));
      // Recorded only once the request succeeded: a rejected batch inserted
      // nothing, so `written` is exactly what a rollback has to remove.
      const entry = written.find((w) => w.table === table) ?? { table, ids: [] };
      if (!written.includes(entry)) written.push(entry);
      entry.ids.push(...ids.slice(start, end));
    }
  }

  /**
   * Add a validated plan to an existing project (Phase 5 — "Add to Existing
   * Project"). Creates new project milestones and new tasks inside the target
   * project — and nothing else.
   *
   * Only ever INSERTs, always as `this.userId`, so Row Level Security applies
   * exactly as it does to a record created through the UI. The target project
   * is re-read (user-scoped) before anything is written: a project that does
   * not exist — or belongs to someone else — is refused, and no goal or project
   * rows are ever written, so the target project, its goal relationship and its
   * existing milestones and tasks cannot change.
   *
   * ATOMICITY — the same honest shape as `importProjectPlan`: everything is
   * built and re-checked first; inserts go parents-first (project milestones
   * → tasks) in whole batches; if any request fails, exactly the rows this
   * import created are deleted again, children first, and the failure is
   * reported.
   */
  async importProjectPlanIntoExistingProject(
    resolved: ResolvedExistingProjectImport,
  ): Promise<ExistingProjectPlanImportResult> {
    // User-scoped read: a foreign or deleted project id reads as empty.
    const targets = await this.http.get('projects', { id: resolved.targetProject.id });
    if (targets.length === 0) {
      throw new ProjectPlanError(
        `Import refused — nothing was created. The project “${resolved.targetProject.name}” does not exist.`,
      );
    }

    const needsMilestones = resolved.mappings.some((m) => m.decision === 'create-new');
    const milestoneSchema = await this.supportsProjectMilestones();
    if (needsMilestones && !milestoneSchema) {
      throw new ProjectPlanError(
        `Import refused — nothing was created. This plan adds project milestones. ${NOT_MIGRATED_MESSAGE}`,
      );
    }
    const existingMilestones = milestoneSchema
      ? (await this.http.get(PROJECT_MILESTONES_TABLE, { project_id: resolved.targetProject.id }, { column: 'position', ascending: true }))
          .map(projectMilestoneMap.fromRow)
      : [];

    const { projectMilestones, tasks } = buildExistingProjectPlanRecords(resolved, {
      newId: uuid,
      now: () => new Date().toISOString(),
    }, existingMilestones);

    /** Tables this import has written to, with the ids that really landed. */
    const written: { table: string; ids: string[] }[] = [];
    const insert = (table: string, rows: Row[], ids: string[]) => this.insertImportRows(written, table, rows, ids);

    try {
      if (projectMilestones.length > 0) {
        await insert(
          PROJECT_MILESTONES_TABLE,
          projectMilestones.map(projectMilestoneMap.toRow),
          projectMilestones.map((m) => m.id),
        );
      }
      // Same guard as every other task write: the column is left out entirely
      // when migration 008 is not there yet.
      const taskRows = await Promise.all(tasks.map((t) => this.prepareTaskRow(taskMap.toRow(t))));
      await insert('tasks', taskRows, tasks.map((t) => t.id));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const left = await this.undoProjectPlanImport(written);
      throw new ProjectPlanError(
        left.length === 0
          ? `Import failed — nothing was kept. ${reason}`
          : `Import failed, and ${left.length} of its records could not be removed again (${left.join(', ')}). ${reason}`,
      );
    }

    return { projectMilestones, tasks };
  }
}

/** Rows per request when writing a project plan: big enough to be few requests, small enough to stay well inside any PostgREST body limit. */
const PLAN_INSERT_BATCH = 200;

/** Ids per DELETE/detach request for bulk operations — same sizing logic as PLAN_INSERT_BATCH, applied to URL filters. */
const BULK_DELETE_BATCH = 200;

export const supabaseDefaults = defaultSettings;
