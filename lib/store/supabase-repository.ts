/**
 * Supabase/PostgreSQL repository.
 *
 * Talks to Supabase's PostgREST endpoint with the public anon key only — the
 * same contract as `LocalRepository`. It activates automatically when
 * `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set.
 *
 * The expected schema lives in `supabase/schema.sql`.
 */

import type {
  AppData,
  DailyPriority,
  Goal,
  GoalInput,
  InboxItem,
  Idea,
  MonthlyPriority,
  Project,
  ProjectInput,
  Settings,
  Task,
  TaskHistoryEntry,
  TaskInput,
  WeeklyPriority,
  WellbeingDay,
  WellbeingDayInput,
} from '../types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { emptyData, defaultSettings } from './defaults';
import type {
  AppRepository,
  DailyPriorityInput,
  EntityRepository,
  InboxItemInput,
  IdeaInput,
  MonthlyPriorityInput,
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
    goalId: str(r.goal_id),
    parentTaskId: str(r.parent_task_id),
    createdAt: String(r.created_at ?? new Date().toISOString()),
    scheduledDate: str(r.scheduled_date),
    dueDate: str(r.due_date),
    completedAt: str(r.completed_at),
    estimatedDuration: num(r.estimated_duration),
    actualDuration: num(r.actual_duration),
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
  ) {}

  async list(): Promise<T[]> {
    const rows = await this.http.get(this.table);
    return rows.map(this.map.fromRow);
  }

  async create(input: C): Promise<T> {
    const item = this.make(input);
    await this.http.post(this.table, this.map.toRow(item));
    return item;
  }

  async update(id: string, patch: Partial<T>): Promise<T> {
    const rows = await this.http.get(this.table, { id });
    if (rows.length === 0) throw new Error(`Record not found: ${id}`);
    const current = this.map.fromRow(rows[0]);
    const next = { ...current, ...patch };
    await this.http.patch(this.table, id, this.map.toRow(next));
    return next;
  }

  async delete(id: string): Promise<void> {
    await this.http.delete(this.table, id);
  }
}

class SupabaseHttpClient {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
  ) {}

  private owned(row: Row): Row {
    return { ...row, user_id: this.userId };
  }

  async get(
    table: string,
    filters: Record<string, string> = {},
    order?: { column: string; ascending: boolean },
  ): Promise<Row[]> {
    let query = this.client.from(table).select('*').eq('user_id', this.userId);
    for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
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

  async upsert(table: string, body: Row): Promise<void> {
    const { error } = await this.client.from(table).upsert(this.owned(body));
    if (error) throw new Error(`Supabase upsert into ${table} failed: ${error.message}`);
  }
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class SupabaseRepository implements AppRepository {
  readonly kind = 'supabase' as const;

  private readonly http: SupabaseHttpClient;

  tasks: EntityRepository<Task, TaskInput>;
  projects: EntityRepository<Project, ProjectInput>;
  goals: EntityRepository<Goal, GoalInput>;
  inbox: EntityRepository<InboxItem, InboxItemInput>;
  ideas: EntityRepository<Idea, IdeaInput>;
  dailyPriorities: EntityRepository<DailyPriority, DailyPriorityInput>;
  weeklyPriorities: EntityRepository<WeeklyPriority, WeeklyPriorityInput>;
  monthlyPriorities: EntityRepository<MonthlyPriority, MonthlyPriorityInput>;
  wellbeingDays: EntityRepository<WellbeingDay, WellbeingDayInput>;

  constructor(client: SupabaseClient, userId: string) {
    this.http = new SupabaseHttpClient(client, userId);

    this.tasks = new RestCollection(this.http, 'tasks', taskMap, (input) => ({
      id: uuid(),
      title: input.title.trim(),
      description: input.description?.trim() || undefined,
      status: input.status ?? 'created',
      priority: input.priority ?? 'medium',
      projectId: input.projectId || undefined,
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
    }));

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
    const [tasks, projects, goals, inbox, ideas, dailyPriorities, weeklyPriorities, monthlyPriorities, taskHistory, wellbeingDays, settings] =
      await Promise.all([
        this.tasks.list(),
        this.projects.list(),
        this.goals.list(),
        this.inbox.list(),
        this.ideas.list(),
        this.dailyPriorities.list(),
        this.weeklyPriorities.list(),
        this.monthlyPriorities.list(),
        this.taskHistory.list(),
        this.wellbeingDays.list(),
        this.settings.get(),
      ]);
    return { tasks, projects, goals, inbox, ideas, dailyPriorities, weeklyPriorities, monthlyPriorities, taskHistory, wellbeingDays, settings };
  }

  async importData(data: AppData): Promise<void> {
    const base = emptyData();
    const payload: AppData = {
      tasks: data.tasks ?? [],
      projects: data.projects ?? [],
      goals: data.goals ?? [],
      inbox: data.inbox ?? [],
      ideas: data.ideas ?? [],
      dailyPriorities: data.dailyPriorities ?? [],
      weeklyPriorities: data.weeklyPriorities ?? [],
      monthlyPriorities: data.monthlyPriorities ?? [],
      taskHistory: data.taskHistory ?? [],
      wellbeingDays: data.wellbeingDays ?? [],
      settings: {
        general: { ...base.settings.general, ...data.settings?.general },
        notifications: { ...base.settings.notifications, ...data.settings?.notifications },
        appearance: { ...base.settings.appearance, ...data.settings?.appearance },
      },
    };

    await Promise.all([
      this.http.clear('tasks'),
      this.http.clear('projects'),
      this.http.clear('goals'),
      this.http.clear('inbox_items'),
      this.http.clear('ideas'),
      this.http.clear('daily_priorities'),
      this.http.clear('weekly_priorities'),
      this.http.clear('monthly_priorities'),
      this.http.clear('task_history'),
      this.http.clear('wellbeing_days'),
    ]);

    const bulk = (table: string, rows: Row[]) => (rows.length > 0 ? this.http.post(table, rows) : Promise.resolve());

    await Promise.all([
      bulk('tasks', payload.tasks.map(taskMap.toRow)),
      bulk('projects', payload.projects.map(projectMap.toRow)),
      bulk('goals', payload.goals.map(goalMap.toRow)),
      bulk('inbox_items', payload.inbox.map(inboxMap.toRow)),
      bulk('ideas', payload.ideas.map(ideaMap.toRow)),
      bulk('daily_priorities', payload.dailyPriorities.map(dailyPriorityMap.toRow)),
      bulk('weekly_priorities', payload.weeklyPriorities.map(weeklyPriorityMap.toRow)),
      bulk('monthly_priorities', payload.monthlyPriorities.map(monthlyPriorityMap.toRow)),
      bulk('task_history', payload.taskHistory.map(historyMap.toRow)),
      bulk('wellbeing_days', payload.wellbeingDays.map(wellbeingDayMap.toRow)),
    ]);
    await this.settings.save(payload.settings);
  }
}

export const supabaseDefaults = defaultSettings;
