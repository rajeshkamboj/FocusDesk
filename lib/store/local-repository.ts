/**
 * Local persistence repository.
 *
 * Backed by `localStorage` behind a tiny key-value `StorageLike` interface so it
 * can also run in tests/Node with a shim. Mirrors exactly the contract that the
 * Supabase repository implements — swapping backends does not touch the UI.
 *
 * MULTI-TAB SAFETY
 * ----------------
 * localStorage is shared by every tab on the origin, but each tab builds its
 * own in-memory copy of the database. A write therefore has to be a *merge*
 * into the newest stored state, never a replay of the copy this tab loaded
 * with — otherwise the last tab to write silently erases everything the other
 * tabs did since it opened.
 *
 * Every read and every mutation goes through `current()`, which re-reads the
 * stored string whenever it differs from the one this repository last saw
 * (`lastRaw`). Mutations then apply to that fresh object and only the changed
 * record differs when it is written back. Two tabs timing two different tasks
 * can checkpoint each other's neighbours indefinitely without either losing an
 * update.
 *
 * DATA SHAPE MIGRATIONS
 * ---------------------
 * There is no version number in `pace.db.v1`; every read goes through
 * `normalizeAppData` (./normalize.ts), the single migration path. Pre-Phase-3
 * data keeps the learning timeline under `milestones` — it is read as
 * `learnings` without being written back, and the next ordinary write simply
 * stores the current shape. Nothing is ever dropped on the way.
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
import { emptyData } from './defaults';
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
    // Sync first, so `make` (and any reference check inside it) sees the
    // newest stored state rather than this tab's last snapshot.
    const list = this.db()[this.key] as unknown as T[];
    const item = this.make(input);
    list.push(item);
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

/**
 * Project Milestones in local storage, with the referential behaviour the
 * `project_milestones` foreign keys give PostgreSQL (migration 008):
 *   - a milestone needs an existing project and never moves to another one;
 *   - deleting a milestone clears `projectMilestoneId` on its tasks in the
 *     same write (ON DELETE SET NULL) — the tasks themselves are kept.
 * `peek` reads the already-synced state without re-reading storage, so a
 * check can never swap the object a mutation is being applied to.
 */
class LocalProjectMilestones implements ProjectMilestoneRepository {
  private readonly rows: Collection<ProjectMilestone, ProjectMilestoneInput>;

  constructor(
    private readonly db: () => AppData,
    private readonly peek: () => AppData,
    private readonly persist: () => void,
  ) {
    this.rows = new Collection<ProjectMilestone, ProjectMilestoneInput>(
      db,
      'projectMilestones',
      persist,
      (input) => {
        if (!this.peek().projects.some((p) => p.id === input.projectId)) {
          throw new ProjectMilestoneError('That project no longer exists.');
        }
        return {
          id: createId(),
          projectId: input.projectId,
          name: input.name.trim(),
          description: input.description?.trim() || undefined,
          targetDate: input.targetDate || undefined,
          position: input.position ?? 0,
          createdAt: nowISO(),
        };
      },
      // Only name, description, target date and position can change — never id or project.
      (milestone, patch) => {
        if (patch.projectId !== undefined && patch.projectId !== milestone.projectId) {
          throw new ProjectMilestoneError('A milestone cannot move to another project.');
        }
        const next = { ...milestone };
        if (patch.name !== undefined) next.name = patch.name.trim();
        if ('description' in patch) next.description = patch.description;
        if ('targetDate' in patch) next.targetDate = patch.targetDate;
        if (patch.position !== undefined) next.position = patch.position;
        return next;
      },
    );
  }

  list(): Promise<ProjectMilestone[]> {
    return this.rows.list();
  }

  create(input: ProjectMilestoneInput): Promise<ProjectMilestone> {
    return this.rows.create(input);
  }

  update(id: string, patch: Partial<ProjectMilestone>): Promise<ProjectMilestone> {
    return this.rows.update(id, patch);
  }

  async delete(id: string): Promise<void> {
    const data = this.db();
    data.tasks = data.tasks.map((t) => (t.projectMilestoneId === id ? { ...t, projectMilestoneId: undefined } : t));
    data.projectMilestones = data.projectMilestones.filter((m) => m.id !== id);
    this.persist();
  }

  async listForProject(projectId: string): Promise<ProjectMilestone[]> {
    return projectMilestonesFor(this.db().projectMilestones, projectId);
  }

  async reorder(projectId: string, orderedIds: string[]): Promise<ProjectMilestone[]> {
    const data = this.db();
    const plan = new Map(planProjectMilestoneOrder(data.projectMilestones, projectId, orderedIds).map((p) => [p.id, p.position]));
    data.projectMilestones = data.projectMilestones.map((m) => {
      const position = plan.get(m.id);
      return position === undefined || position === m.position ? m : { ...m, position };
    });
    this.persist();
    return projectMilestonesFor(data.projectMilestones, projectId);
  }
}

export class LocalRepository implements AppRepository {
  readonly kind = 'local' as const;

  private data: AppData;
  private readonly storage: StorageLike;
  /**
   * The exact string this repository last read from or wrote to storage.
   *
   * It is the revision marker that makes multi-tab writes safe: if the stored
   * string still equals this one, nothing has changed since we last looked and
   * the in-memory copy is current. If it differs, another tab (or another
   * FocusDesk window) has written, and we re-read before touching anything.
   */
  private lastRaw: string | null = null;

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

  constructor(storage: StorageLike | null = browserStorage()) {
    this.storage = storage ?? memoryStorage();
    this.data = this.read();

    const persist = () => this.write();
    // Every collection reads through `current()`, so each create/update/delete
    // is applied to the newest persisted state rather than to the snapshot
    // this tab happened to load with. See `sync()`.
    const db = () => this.current();
    const peek = () => this.data;

    this.tasks = new Collection<Task, TaskInput>(
      db,
      'tasks',
      persist,
      (input) => this.checkTaskMilestone({
        id: input.id ?? createId(),
        title: input.title.trim(),
        description: input.description?.trim() || undefined,
        status: input.status ?? 'created',
        priority: input.priority ?? 'medium',
        projectId: input.projectId || undefined,
        projectMilestoneId: input.projectMilestoneId || undefined,
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
      (task, patch) => this.checkTaskMilestone({
        ...task,
        ...patch,
        title: patch.title !== undefined ? patch.title.trim() : task.title,
        tags: patch.tags ?? task.tags,
      }, task),
    );

    this.subtasks = new Collection<Subtask, SubtaskInput>(
      db,
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
      db,
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
      db,
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
      db,
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
      db,
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

    this.learnings = new Collection<Learning, LearningInput>(
      db,
      'learnings',
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

    this.projectMilestones = new LocalProjectMilestones(db, peek, persist);

    this.dailyPriorities = new Collection<DailyPriority, DailyPriorityInput>(
      db,
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
      db,
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
      db,
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
      db,
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
      db,
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

  supportsProjectMilestones(): Promise<boolean> {
    return Promise.resolve(true);
  }

  /**
   * What PostgreSQL's foreign key on tasks.project_milestone_id does for
   * Supabase, plus the same-project rule: checked only when a write changes
   * the milestone or the project, against the state just synced from storage
   * — so a stale tab cannot attach a task to a milestone another tab deleted.
   */
  private checkTaskMilestone(next: Task, previous?: Task): Task {
    if (!next.projectMilestoneId) return next;
    if (previous && previous.projectMilestoneId === next.projectMilestoneId && previous.projectId === next.projectId) return next;
    const milestone = this.data.projectMilestones.find((m) => m.id === next.projectMilestoneId);
    if (!milestone) throw new ProjectMilestoneError('That milestone no longer exists.');
    if (milestone.projectId !== next.projectId) throw new ProjectMilestoneError('That milestone belongs to a different project.');
    return next;
  }

  /** Stored string → current shape. See ./normalize.ts (the only migration path). */
  private parse(raw: string | null): AppData {
    if (!raw) return emptyData();
    try {
      return normalizeAppData(JSON.parse(raw));
    } catch {
      return emptyData();
    }
  }

  private read(): AppData {
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(STORAGE_KEY);
    } catch {
      /* storage unavailable — fall back to an empty world */
    }
    this.lastRaw = raw;
    return this.parse(raw);
  }

  /**
   * Adopt another tab's writes before we touch the database.
   *
   * localStorage is shared by every tab on the origin, but each tab holds its
   * own in-memory copy. Without this, a tab that loaded ten minutes ago would
   * serialize *its* copy on the next write and silently erase everything the
   * other tabs did in between — the whole database, not just the record being
   * changed.
   *
   * Re-reading is cheap and skipped entirely when the stored string is
   * byte-identical to the one we last saw, which is the common case: a tab
   * working alone never re-parses.
   */
  private sync(): void {
    let raw: string | null;
    try {
      raw = this.storage.getItem(STORAGE_KEY);
    } catch {
      return; // storage unreadable — keep operating on what we have
    }
    if (raw === this.lastRaw) return;
    this.data = this.parse(raw);
    this.lastRaw = raw;
  }

  /** The database as it exists right now, including other tabs' writes. */
  private current(): AppData {
    this.sync();
    return this.data;
  }

  /**
   * Persist the database.
   *
   * Callers always mutate the object returned by `current()`, so what is
   * written here is the newest persisted state plus this one change — a merge,
   * never a blind replacement of another tab's work.
   */
  private write(): void {
    try {
      const raw = JSON.stringify(this.data);
      this.storage.setItem(STORAGE_KEY, raw);
      this.lastRaw = raw;
    } catch {
      /* quota exceeded — keep working in memory */
    }
  }

  taskHistory = {
    list: async (taskId?: string): Promise<TaskHistoryEntry[]> => {
      const all = [...this.current().taskHistory].sort((a, b) => (a.at < b.at ? 1 : -1));
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
      this.current().taskHistory.push(record);
      this.write();
      return record;
    },
  };

  settings = {
    get: async (): Promise<Settings> => ({ ...this.current().settings }),
    save: async (patch: Partial<Settings>): Promise<Settings> => {
      const data = this.current();
      data.settings = {
        general: { ...data.settings.general, ...patch.general },
        notifications: { ...data.settings.notifications, ...patch.notifications },
        appearance: { ...data.settings.appearance, ...patch.appearance },
      };
      this.write();
      return { ...data.settings };
    },
  };

  async exportData(): Promise<AppData> {
    return JSON.parse(JSON.stringify(this.current())) as AppData;
  }

  async importData(data: AppDataImport): Promise<void> {
    // A private deep copy: the stored state is exactly what gets written, and
    // later in-place mutations never reach the caller's object.
    const next = normalizeAppData(JSON.parse(JSON.stringify(data ?? {})));
    assertProjectMilestonesConsistent(next);
    this.data = next;
    this.write();
  }

  /**
   * Add a validated project plan (Goal → Project → ProjectMilestone → Task).
   *
   * Every record is built first — with real ids from this repository's own
   * `createId`, references rewritten through the plan's temporary ids — and
   * only then appended to the freshly synced database and written **once**.
   * Local storage therefore gives a plan import what PostgreSQL would: it
   * either happened completely or not at all, and nothing that was already
   * stored (the Learnings included) is touched.
   */
  async importProjectPlan(plan: ResolvedProjectPlan): Promise<ProjectPlanImportResult> {
    const { goals, projects, projectMilestones, tasks } = buildProjectPlanRecords(plan, {
      newId: createId,
      now: nowISO,
    });

    // Sync first: append to the newest stored state, never to this tab's
    // snapshot, so a plan imported while another tab writes loses nothing.
    const data = this.current();
    data.goals.push(...goals);
    data.projects.push(...projects);
    data.projectMilestones.push(...projectMilestones);
    data.tasks.push(...tasks);
    this.write();

    return { goals, projects, projectMilestones, tasks };
  }

  /**
   * Add a validated plan to an existing project (Phase 5): new project
   * milestones and new tasks only.
   *
   * The target project is re-checked against freshly stored data (it may have
   * been deleted since the preview), records are built with this repository's
   * own `createId`, and everything is appended to the freshly synced database
   * and written **once** — so local storage gives this import the same
   * all-or-nothing guarantee as `importProjectPlan`, and nothing that was
   * already stored (the target project, its goal, its milestones and tasks,
   * the Learnings included) is touched.
   */
  async importProjectPlanIntoExistingProject(
    resolved: ResolvedExistingProjectImport,
  ): Promise<ExistingProjectPlanImportResult> {
    const data = this.current();
    const target = data.projects.find((p) => p.id === resolved.targetProject.id);
    if (!target) {
      throw new ProjectPlanError(
        `Import refused — nothing was created. The project “${resolved.targetProject.name}” no longer exists.`,
      );
    }
    const { projectMilestones, tasks } = buildExistingProjectPlanRecords(resolved, {
      newId: createId,
      now: nowISO,
    }, data.projectMilestones);

    data.projectMilestones.push(...projectMilestones);
    data.tasks.push(...tasks);
    this.write();

    return { projectMilestones, tasks };
  }
}
