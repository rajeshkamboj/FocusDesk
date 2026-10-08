/**
 * Phase 6 — Bulk Select & Safe Bulk Delete, verified headlessly.
 *
 * Exercises the real code paths, never a copy of them:
 *   - LocalRepository / SupabaseRepository bulk aggregates and the generic
 *     EntityRepository.deleteMany (real datastore state compared before and
 *     after — written JSON and recorded HTTP requests, never in-memory lies);
 *   - the real supabase-js SDK against a fake PostgREST at the fetch boundary
 *     (a migrated and an unmigrated schema, >200-id chunking, per-request
 *     user scoping, injected mid-flight failure + retry) — no request can
 *     reach a real Supabase project;
 *   - DataProvider + the real Tasks / Projects / Goals screens in jsdom:
 *     select mode, filter-aware select-all, the confirm dialog's exact
 *     wording and live counts, Cancel proving zero writes byte-for-byte,
 *     confirm proving the store truth (detach counts, cascades, single
 *     write, one write for a 90-task delete), open-timer settle + bookmark
 *     drop, and the no-hijack contract (row click, edit menu, timer
 *     controls, milestone move up/down all still work).
 *
 * Fake-PostgREST note: like the Phase 4/5 fakes it stores plain rows, but it
 * ALSO models the audited referential behaviour of the real schema (FK
 * cascades and SET NULL on DELETE, per supabase/schema.sql + migrations
 * 005/006/008) so state assertions match what PostgreSQL would leave behind.
 * The real cascade SQL itself is proven against a real engine by
 * scripts/verify-project-milestones-sql.ts — the fake only mirrors it here.
 *
 * Run: npm i --no-save jsdom tsx && npx tsx scripts/verify-bulk-delete.tsx
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = dom.window; g.document = dom.window.document; g.localStorage = dom.window.localStorage;
g.self = dom.window;
g.IS_REACT_ACT_ENVIRONMENT = true;

type Row = Record<string, unknown>;

let failures = 0;
const ok = (cond: unknown, msg: string) => {
  if (cond) console.log('✓', msg);
  else {
    failures += 1;
    console.error('FAIL:', msg);
  }
};
const section = (title: string) => console.log(`\n— ${title} —`);
const rejects = async (run: () => Promise<unknown>): Promise<Error | null> => {
  try {
    await run();
    return null;
  } catch (error) {
    return error as Error;
  }
};

/** A fresh, isolated "localStorage" that counts its writes. */
const memoryStore = () => {
  const map = new Map<string, string>();
  const store = {
    map,
    /** How many times anything was persisted — proof of a single atomic write. */
    writes: 0,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { store.writes += 1; map.set(k, v); },
    removeItem: (k: string) => void map.delete(k),
  };
  return store;
};

/**
 * A tiny PostgREST stand-in (same shape the Phase 4/5 scripts use) plus the
 * audited foreign-key behaviour on DELETE:
 *   - tasks      → subtasks deleted, timer_sessions deleted, children's parent_task_id nulled
 *   - projects   → its project_milestones deleted, tasks/monthly_priorities.project_id nulled
 *   - goals      → tasks/projects/monthly_priorities.goal_id nulled
 *   - project_milestones → tasks.project_milestone_id nulled
 * Cascades fire for exactly the rows the request matched (user scope included),
 * mirroring what PostgreSQL does per row.
 */
function fakePostgrest(schema: Record<string, string[]>) {
  const tables = new Map(Object.entries(schema).map(([name, cols]) => [name, { columns: new Set(cols), rows: [] as Row[] }]));
  const log: { method: string; table: string; query: URLSearchParams; body?: unknown }[] = [];
  const server = {
    tables,
    log,
    /** Set to make matching requests fail with a 500 (query included for chunk-targeting). */
    fail: null as null | ((method: string, table: string, query: URLSearchParams) => boolean),
    fetch: null as unknown as (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  };
  const err = (status: number, code: string, message: string) =>
    Response.json({ code, details: null, hint: null, message }, { status });

  const rows = (name: string) => tables.get(name)?.rows ?? [];
  const FK: Record<string, (deleted: Row[]) => void> = {
    tasks: (deleted) => {
      const ids = new Set(deleted.map((r) => String(r.id)));
      const t = tables.get('subtasks');
      if (t) t.rows = t.rows.filter((r) => !ids.has(String(r.parent_task_id)));
      const s = tables.get('timer_sessions');
      if (s) s.rows = s.rows.filter((r) => !ids.has(String(r.task_id)));
      for (const r of rows('tasks')) if (r.parent_task_id !== null && ids.has(String(r.parent_task_id))) r.parent_task_id = null;
    },
    projects: (deleted) => {
      const ids = new Set(deleted.map((r) => String(r.id)));
      const m = tables.get('project_milestones');
      if (m) {
        const goneMilestones = m.rows.filter((r) => ids.has(String(r.project_id)));
        m.rows = m.rows.filter((r) => !ids.has(String(r.project_id)));
        FK.project_milestones(goneMilestones);
      }
      for (const r of rows('tasks')) if (r.project_id !== null && ids.has(String(r.project_id))) r.project_id = null;
      for (const r of rows('monthly_priorities')) if (r.project_id !== null && ids.has(String(r.project_id))) r.project_id = null;
    },
    goals: (deleted) => {
      const ids = new Set(deleted.map((r) => String(r.id)));
      for (const r of rows('tasks')) if (r.goal_id !== null && ids.has(String(r.goal_id))) r.goal_id = null;
      for (const r of rows('projects')) if (r.goal_id !== null && ids.has(String(r.goal_id))) r.goal_id = null;
      for (const r of rows('monthly_priorities')) if (r.goal_id !== null && ids.has(String(r.goal_id))) r.goal_id = null;
    },
    project_milestones: (deleted) => {
      const ids = new Set(deleted.map((r) => String(r.id)));
      for (const r of rows('tasks')) if (r.project_milestone_id !== null && ids.has(String(r.project_milestone_id))) r.project_milestone_id = null;
    },
  };

  server.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const table = url.pathname.replace(/^\/rest\/v1\//, '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    log.push({ method, table, query: url.searchParams, body });
    const t = tables.get(table);
    if (!t) return err(404, 'PGRST205', `Could not find the table 'public.${table}' in the schema cache`);
    if (server.fail && server.fail(method, table, url.searchParams)) return err(500, 'XX000', 'injected failure');

    let select = '*';
    let order: { col: string; asc: boolean } | null = null;
    let limit: number | null = null;
    const eqFilters: [string, string][] = [];
    const inFilters: [string, string[]][] = [];
    for (const [k, v] of url.searchParams) {
      if (k === 'select') select = v;
      else if (k === 'order') order = { col: v.split('.')[0], asc: !v.includes('.desc') };
      else if (k === 'limit') limit = Number(v);
      else if (k === 'columns' || k === 'on_conflict') continue;
      else if (v.startsWith('eq.')) eqFilters.push([k, v.slice(3)]);
      else if (v.startsWith('in.')) inFilters.push([k, v.slice(3).replace(/^\(|\)$/g, '').split(',')]);
      else throw new Error(`fake PostgREST: unsupported filter ${k}=${v}`);
    }
    const selected = select === '*' ? [] : select.split(',');
    const filterColumns = [...eqFilters.map(([k]) => k), ...inFilters.map(([k]) => k)];
    const unknown = [...selected, ...filterColumns, ...(order ? [order.col] : [])].find((c) => !t.columns.has(c));
    if (unknown) return err(400, '42703', `column ${table}.${unknown} does not exist`);
    const matches = (r: Row) =>
      eqFilters.every(([k, v]) => String(r[k]) === v) && inFilters.every(([k, values]) => values.includes(String(r[k])));

    if (method === 'GET') {
      let found = t.rows.filter(matches);
      if (order) {
        const { col, asc } = order;
        found = [...found].sort((a, b) => ((a[col] as number) < (b[col] as number) ? -1 : (a[col] as number) > (b[col] as number) ? 1 : 0) * (asc ? 1 : -1));
      }
      if (limit !== null) found = found.slice(0, limit);
      return Response.json(found.map((r) => (select === '*' ? { ...r } : Object.fromEntries(selected.map((c) => [c, r[c] ?? null])))));
    }
    const bodyRows: Row[] = Array.isArray(body) ? body : body ? [body] : [];
    const badColumn = bodyRows.flatMap((r) => Object.keys(r)).find((c) => !t.columns.has(c));
    if (badColumn) return err(400, 'PGRST204', `Could not find the '${badColumn}' column of '${table}' in the schema cache`);
    if (method === 'POST') {
      const upsert = (new Headers(init?.headers).get('prefer') ?? '').includes('merge-duplicates');
      for (const r of bodyRows) {
        const at = t.rows.findIndex((x) => x.id === r.id && (!('user_id' in r) || x.user_id === r.user_id));
        if (at !== -1 && !upsert) return err(409, '23505', 'duplicate key value violates unique constraint');
        if (at !== -1) t.rows[at] = { ...t.rows[at], ...r };
        else t.rows.push({ ...r });
      }
      return new Response(null, { status: 201 });
    }
    if (method === 'PATCH') {
      for (const r of t.rows) if (matches(r)) Object.assign(r, bodyRows[0]);
      return new Response(null, { status: 204 });
    }
    if (method === 'DELETE') {
      const doomed = t.rows.filter(matches);
      t.rows = t.rows.filter((r) => !matches(r));
      FK[table]?.(doomed);
      return new Response(null, { status: 204 });
    }
    throw new Error(`fake PostgREST: unsupported method ${method}`);
  };
  return server;
}

/** ids passed to `.in()` — parsed straight back out of the recorded request. */
const inIds = (query: URLSearchParams, column: string) => {
  const raw = query.get(column);
  if (!raw || !raw.startsWith('in.')) return null;
  return raw.slice(4).replace(/^\(|\)$/g, '').split(',').filter((v) => v !== '');
};

async function main() {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { act } = React;
  const { createClient } = await import('@supabase/supabase-js');
  const { LocalRepository, STORAGE_KEY } = await import('../lib/store/local-repository');
  const { SupabaseRepository, PROJECT_MILESTONES_TABLE } = await import('../lib/store/supabase-repository');
  const { normalizeAppData } = await import('../lib/store/normalize');

  type AppData = import('../lib/types').AppData;

  /* ================================================================ */
  /* Fixtures: the world the bulk tools operate on                      */
  /* ================================================================ */
  const C = (i: number) => `2026-10-0${1 + (i % 7)}T09:00:00.000Z`;
  const task = (id: string, extra: Partial<Record<string, unknown>> = {}): Row => ({
    id,
    title: `Task ${id}`,
    status: 'pending',
    priority: 'medium',
    tags: [],
    postponementCount: 0,
    archived: false,
    createdAt: C(id.length),
    ...extra,
  });
  const NOW = Date.now();

  /** One project with 90 tasks + 2 milestones, one more project, 2 goals, a broken-down parent, a running timer. */
  const world = () =>
    ({
      goals: [
        { id: 'g1', name: 'Sikhizm 90 Days Growth', status: 'active', createdAt: C(1) },
        { id: 'g2', name: 'Fitness', status: 'active', createdAt: C(2) },
      ],
      projects: [
        { id: 'p1', name: 'Sikhizm 90 Days', goalId: 'g1', status: 'active', createdAt: C(3), taskIds: [] },
        { id: 'p2', name: 'Side Project', status: 'active', createdAt: C(4), taskIds: [] },
      ],
      projectMilestones: [
        { id: 'm1', projectId: 'p1', name: 'Foundation', position: 0, createdAt: C(5) },
        { id: 'm2', projectId: 'p1', name: 'Backend', position: 1, createdAt: C(6) },
        { id: 'm3', projectId: 'p2', name: 'Launch', position: 0, createdAt: C(7) },
      ],
      tasks: [
        // 90 tasks in p1, alternating milestones; the first has children + sessions.
        ...Array.from({ length: 90 }, (_, i) =>
          task(`t${i + 1}`, {
            projectId: 'p1',
            projectMilestoneId: i % 2 === 0 ? 'm1' : 'm2',
            ...(i === 0 ? { actualDurationSeconds: 120 } : {}),
            ...(i === 2 ? { description: 'Detail text for t3' } : {}),
            // t2 runs a real timer (started 42s ago) — the delete must settle it.
            ...(i === 1 ? { status: 'in_progress', startedAt: new Date(NOW - 42_000).toISOString() } : {}),
          }),
        ),
        task('t91', { goalId: 'g1' }),
        task('t92', { goalId: 'g2' }),
        task('t93', { parentTaskId: 't1' }), // broken-down child of t1
        task('t94', { projectId: 'p2', projectMilestoneId: 'm3' }),
        task('t95'),
      ],
      subtasks: [
        { id: 's1', parentTaskId: 't1', title: 'sub one', completed: false, createdAt: C(1) },
        { id: 's2', parentTaskId: 't1', title: 'sub two', completed: true, createdAt: C(2) },
        { id: 's3', parentTaskId: 't91', title: 'sub of 91', completed: false, createdAt: C(3) },
      ],
      timerSessions: [
        { id: 'ses1', taskId: 't1', startedAt: C(1), endedAt: C(2), durationSeconds: 60 },
        { id: 'ses2', taskId: 't1', startedAt: C(3), endedAt: C(4), durationSeconds: 60 },
        { id: 'ses3', taskId: 't2', startedAt: C(5), endedAt: C(6), durationSeconds: 30 },
        { id: 'ses4', taskId: 't95', startedAt: C(7), endedAt: C(1), durationSeconds: 45 },
      ],
      inbox: [],
      ideas: [],
      learnings: [],
      dailyPriorities: [],
      weeklyPriorities: [],
      monthlyPriorities: [{ id: 'mp1', month: '2026-10', title: 'Ship p1', goalId: 'g1', projectId: 'p1', completed: false }],
      wellbeingDays: [],
      taskHistory: [],
    }) as unknown as Partial<AppData>;

  const freshLocal = () => {
    const store = memoryStore();
    const seeded = JSON.stringify(normalizeAppData(world() as never));
    store.setItem(STORAGE_KEY, seeded);
    return { store, repo: new LocalRepository(store) };
  };
  const readStore = (store: ReturnType<typeof memoryStore>) => normalizeAppData(JSON.parse(store.map.get(STORAGE_KEY)!) as never);

  /* ================================================================ */
  /* A. LocalRepository — aggregates, one write, real datastore state  */
  /* ================================================================ */
  section('A1–A2. Generic deleteMany on a collection');
  {
    const { store, repo } = freshLocal();
    const w0 = store.writes; // 1 from the seeding itself
    await repo.tasks.deleteMany([]);
    ok(store.writes === w0, 'A1: an empty selection performs no write at all');
    await repo.tasks.deleteMany(['does-not-exist']);
    ok(store.writes === w0, 'A1: ids that match nothing perform no write (retry/idempotent safe)');
    await repo.tasks.deleteMany(['t94', 't95', 't94']);
    ok(store.writes === w0 + 1, 'A1: a matching bulk delete is ONE store write');
    let data = readStore(store);
    ok(!data.tasks.some((t) => t.id === 't94' || t.id === 't95'), 'A1: exactly the listed task rows are gone');
    ok(data.subtasks.length === 3 && data.timerSessions.length === 4, 'A2: generic deleteMany removed ONLY those rows — no hidden cascade');
    ok(data.projects.length === 2 && data.goals.length === 2 && data.projectMilestones.length === 3, 'A2: no other entity was touched');
  }

  section('A3. Bulk task delete — tasks + their subtasks + their runs, one write');
  {
    const { store, repo } = freshLocal();
    const w0 = store.writes;
    await repo.deleteTasks(['t1', 't2']);
    ok(store.writes === w0 + 1, 'A3: deleting 2 tasks (with subtasks and 3 session rows) is ONE whole-store write');
    const data = readStore(store);
    ok(!data.tasks.some((t) => t.id === 't1' || t.id === 't2'), 'A3: the selected task rows are permanently deleted');
    ok(!data.subtasks.some((s) => s.id === 's1' || s.id === 's2'), 'A3: the deleted tasks’ subtask rows are deleted with them (existing behavior)');
    ok(data.subtasks.some((s) => s.id === 's3'), 'A3: subtasks of a non-selected task survive');
    ok(data.timerSessions.length === 1 && data.timerSessions[0].id === 'ses4', 'A3: the deleted tasks’ timer-session rows are deleted with them');
    const child = data.tasks.find((t) => t.id === 't93')!;
    ok(child.parentTaskId === undefined, 'A3: the surviving broken-down child loses only the deleted parent link (SET NULL mirror)');
    ok(data.projects.length === 2 && data.goals.length === 2 && data.projectMilestones.length === 3, 'A3: NO project, milestone or goal is deleted by a bulk task delete');
    ok(data.tasks.filter((t) => t.projectId === 'p1').length === 88, 'A3: the remaining 88 project tasks are untouched');
  }

  section('A4. Bulk milestone delete — detach tasks, remove rows');
  {
    const { store, repo } = freshLocal();
    const w0 = store.writes;
    await repo.deleteProjectMilestones(['m1', 'm1', 'ghost']);
    ok(store.writes === w0 + 1, 'A4: ONE write; duplicate and unknown ids add nothing');
    const data = readStore(store);
    ok(!data.projectMilestones.some((m) => m.id === 'm1'), 'A4: the milestone rows are deleted');
    ok(data.projectMilestones.some((m) => m.id === 'm2'), 'A4: an unselected milestone of the same project survives');
    ok(data.tasks.length === 95, 'A4: every task survived — bulk milestone delete never deletes tasks');
    ok(
      data.tasks.filter((t) => t.projectMilestoneId === undefined).length === 49,
      'A4: all 45 tasks that used m1 are detached exactly like the single-milestone delete (49 total lose the field incl. the 4 never linked)',
    );
    ok(data.tasks.filter((t) => t.projectMilestoneId === 'm2').length === 45, 'A4: the m2 tasks keep their link');
  }

  section('A5. Bulk project delete — project + its milestones, tasks detached, goal kept');
  {
    const { store, repo } = freshLocal();
    const projectsBefore = JSON.stringify(readStore(store).projects.filter((p) => p.id === 'p2'));
    const w0 = store.writes;
    await repo.deleteProjects(['p1']);
    ok(store.writes === w0 + 1, 'A5: project + its milestones + task detach is ONE write');
    const data = readStore(store);
    ok(!data.projects.some((p) => p.id === 'p1'), 'A5: the project row is deleted');
    ok(
      !data.projectMilestones.some((m) => m.projectId === 'p1') && data.projectMilestones.length === 1,
      'A5: the project milestones are deleted with it (existing architecture), other projects’ milestones untouched',
    );
    ok(data.tasks.length === 95, 'A5: NOT one of the 90 project tasks was deleted');
    const ex = data.tasks.find((t) => t.id === 't1')!;
    ok(ex.projectId === undefined && ex.projectMilestoneId === undefined, 'A5: its tasks are detached from the project AND from the milestones');
    ok(JSON.stringify(data.projects.filter((p) => p.id === 'p2')) === projectsBefore, 'A5: the other project is byte-identical');
    ok(data.goals.some((goal) => goal.id === 'g1'), 'A5: the Goal is NOT deleted');
  }

  section('A6. Bulk goal delete — detach-only, never deletes projects or tasks');
  {
    const { store, repo } = freshLocal();
    const w0 = store.writes;
    await repo.deleteGoals(['g1']);
    ok(store.writes === w0 + 1, 'A6: ONE write for goal rows + project link + task link changes');
    const data = readStore(store);
    ok(!data.goals.some((goal) => goal.id === 'g1'), 'A6: the goal row is deleted');
    ok(data.goals.length === 1 && data.goals[0].id === 'g2', 'A6: only the selected goal is gone');
    ok(data.projects.length === 2 && data.projects.find((p) => p.id === 'p1')!.goalId === undefined, 'A6: the linked project survives, detached');
    ok(data.tasks.length === 95 && data.tasks.find((t) => t.id === 't91')!.goalId === undefined, 'A6: the linked task survives, detached (storage matches memory)');
    ok(data.monthlyPriorities.every((m) => m.goalId !== 'g1'), 'A6: no dangling goal reference is left in storage');
  }

  section('A7. Repeat deletes are silent no-ops');
  {
    const { store, repo } = freshLocal();
    await repo.deleteTasks(['t95']);
    const w1 = store.writes;
    await repo.deleteTasks(['t95']);
    ok(store.writes === w1 && (await repo.tasks.list()).length === 94, 'A7: deleting an already-deleted id does nothing — safe retry');
  }

  /* ================================================================ */
  /* B. SupabaseRepository — scoped, chunked, ordered, recoverable     */
  /* ================================================================ */
  const USER = 'test-user';
  const OTHER = 'someone-else';
  const legacySchema = {
    subtasks: ['id', 'user_id', 'parent_task_id', 'title', 'completed', 'sort_order', 'created_at'],
    inbox_items: ['id', 'user_id', 'title', 'note', 'created_at'],
    ideas: ['id', 'user_id', 'title', 'description', 'created_at', 'archived'],
    daily_priorities: ['id', 'user_id', 'date', 'title', 'completed', 'completed_at', 'due_date', 'postponement_count'],
    weekly_priorities: ['id', 'user_id', 'week', 'title', 'primary', 'completed', 'completed_at'],
    monthly_priorities: ['id', 'user_id', 'month', 'title', 'completed', 'completed_at', 'goal_id', 'project_id'],
    wellbeing_days: ['id', 'user_id', 'date', 'jogging', 'nitnem_morning', 'nitnem_evening', 'nitnem_night'],
    timer_sessions: ['id', 'user_id', 'task_id', 'started_at', 'ended_at', 'duration_seconds'],
    tasks: ['id', 'user_id', 'title', 'description', 'status', 'priority', 'project_id', 'goal_id', 'parent_task_id', 'created_at', 'scheduled_date', 'due_date', 'completed_at', 'estimated_duration', 'actual_duration', 'started_at', 'paused_at', 'actual_duration_seconds', 'reminder', 'notes', 'tags', 'recurrence', 'postponement_count', 'archived'],
    projects: ['id', 'user_id', 'name', 'description', 'goal_id', 'deadline', 'status', 'created_at'],
    goals: ['id', 'user_id', 'name', 'description', 'deadline', 'status', 'created_at'],
    milestones: ['id', 'user_id', 'title', 'category', 'description', 'date', 'created_at'],
    task_history: ['id', 'user_id', 'task_id', 'type', 'at', 'note'],
    app_settings: ['id', 'user_id', 'data'],
  };
  const migratedSchema = {
    ...legacySchema,
    tasks: [...legacySchema.tasks, 'project_milestone_id'],
    project_milestones: ['id', 'user_id', 'project_id', 'name', 'description', 'target_date', 'position', 'created_at'],
  };
  let clients = 0;
  const supabaseFor = (schema: Record<string, string[]>) => {
    const server = fakePostgrest(schema);
    clients += 1;
    const client = createClient('https://test.supabase.co', 'test-publishable-key', {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: `verify-phase6-${clients}` },
      global: { fetch: server.fetch as typeof fetch },
    });
    return { server, repo: new SupabaseRepository(client, USER) };
  };
  const rowTask = (id: string, extra: Row = {}): Row => ({
    id, user_id: USER, title: `Task ${id}`, description: null, status: 'pending', priority: 'medium',
    project_id: null, goal_id: null, parent_task_id: null, created_at: C(1), scheduled_date: null, due_date: null,
    completed_at: null, estimated_duration: null, actual_duration: null, started_at: null, paused_at: null,
    actual_duration_seconds: null, reminder: null, notes: null, tags: [], recurrence: null,
    postponement_count: 0, archived: false, project_milestone_id: null,
    ...extra,
  });
  /**
   * Seed the fake with the same shape of world, plus one fully separate row
   * per table for another user. Ids are PRIMARY KEYs — two users can never
   * share one — so the foreign rows use their own ids; what is verified is
   * that no request ever touches them.
   */
  const seedSupabase = (server: ReturnType<typeof fakePostgrest>, taskCount = 250) => {
    server.tables.get('goals')!.rows.push(
      { id: 'g1', user_id: USER, name: 'Sikhizm', deadline: null, status: 'active', description: null, created_at: C(1) },
      { id: 'g-theirs', user_id: OTHER, name: 'Their goal', deadline: null, status: 'active', description: null, created_at: C(1) },
    );
    server.tables.get('projects')!.rows.push(
      { id: 'p1', user_id: USER, name: 'Sikhizm 90', goal_id: 'g1', deadline: null, status: 'active', description: null, created_at: C(2) },
      { id: 'p2', user_id: USER, name: 'Other', goal_id: null, deadline: null, status: 'active', description: null, created_at: C(3) },
      { id: 'p-theirs', user_id: OTHER, name: 'Their project', goal_id: 'g-theirs', deadline: null, status: 'active', description: null, created_at: C(2) },
    );
    server.tables.get('project_milestones')?.rows.push(
      { id: 'm1', user_id: USER, project_id: 'p1', name: 'Foundation', description: null, target_date: null, position: 0, created_at: C(4) },
      { id: 'm-theirs', user_id: OTHER, project_id: 'p-theirs', name: 'Their milestone', description: null, target_date: null, position: 0, created_at: C(4) },
    );
    const tasks = Array.from({ length: taskCount }, (_, i) => rowTask(`bulk-${i}`, { project_id: 'p1', project_milestone_id: 'm1', goal_id: 'g1' }));
    tasks.push(
      rowTask('child-1', { parent_task_id: 'bulk-0' }),
      rowTask('untouched'),
      rowTask('t-theirs', { user_id: OTHER, project_id: 'p-theirs', goal_id: 'g-theirs', project_milestone_id: undefined, ...(server.tables.has('project_milestones') ? { project_milestone_id: 'm-theirs' } : {}) }),
    );
    server.tables.get('tasks')!.rows.push(...tasks);
    server.tables.get('subtasks')!.rows.push(
      { id: 's1', user_id: USER, parent_task_id: 'bulk-0', title: 'a', completed: false, sort_order: 0, created_at: C(5) },
      { id: 's2', user_id: USER, parent_task_id: 'bulk-1', title: 'b', completed: false, sort_order: 1, created_at: C(6) },
      { id: 's-theirs', user_id: OTHER, parent_task_id: 't-theirs', title: 'theirs', completed: false, sort_order: 2, created_at: C(7) },
    );
    server.tables.get('timer_sessions')!.rows.push(
      { id: 'ses1', user_id: USER, task_id: 'bulk-0', started_at: C(1), ended_at: C(2), duration_seconds: 60 },
      { id: 'ses-theirs', user_id: OTHER, task_id: 't-theirs', started_at: C(1), ended_at: C(2), duration_seconds: 60 },
    );
    // Other user's rows, snapshotted for byte-comparison after every operation.
    return {
      theirs: Object.fromEntries([...server.tables].map(([name, t]) => [name, JSON.stringify(t.rows.filter((r) => r.user_id === OTHER))])),
    };
  };

  section('B8. Supabase bulk task delete — chunked, scoped, FK truth');
  {
    const { server, repo } = supabaseFor(migratedSchema);
    const { theirs: theirsBefore } = seedSupabase(server, 250);
    const doomed = Array.from({ length: 250 }, (_, i) => `bulk-${i}`);
    await repo.deleteTasks(doomed);
    const deletes = server.log.filter((r) => r.method === 'DELETE' && r.table === 'tasks');
    ok(deletes.length === 2, 'B8: 250 ids become exactly 2 DELETE requests (chunking at 200)');
    const sentIds = deletes.flatMap((r) => inIds(r.query, 'id') ?? []);
    ok(sentIds.length === 250 && doomed.every((id) => sentIds.includes(id)), 'B8: the two chunks carry exactly the selected ids, no more');
    ok(server.log.every((r) => r.query.get('user_id') === `eq.${USER}`), 'B8: EVERY request (read or write) is scoped to the signed-in user — never unscoped');
    const t = server.tables.get('tasks')!;
    ok(!t.rows.some((r) => r.user_id === USER && r.id?.toString().startsWith('bulk-')), 'B8: all 250 own task rows are really gone from the table');
    ok(Object.entries(server.tables).every(([name, tb]) => JSON.stringify((tb as { rows: Row[] }).rows.filter((r) => r.user_id === OTHER)) === theirsBefore[name]), 'B8: every other-user row in every table is byte-identical');
    ok(server.tables.get('subtasks')!.rows.filter((r) => r.user_id === USER).length === 0, 'B8: subtask rows cascade away with the task (fake models the 005 FK; real SQL proven by verify-project-milestones-sql.ts)');
    ok(server.tables.get('timer_sessions')!.rows.filter((r) => r.user_id === USER).length === 0, 'B8: recorded runs cascade away (006 FK)');
    ok(server.tables.get('subtasks')!.rows.length === 1 && server.tables.get('timer_sessions')!.rows.length === 1, 'B8: the other user’s own subtask and session survive — the DELETE matched only mine');
    ok(t.rows.find((r) => r.id === 'child-1')!.parent_task_id === null, 'B8: surviving child task keeps existing with parent_task_id nulled (SET NULL FK)');
    ok(server.tables.get('projects')!.rows.length === 3 && server.tables.get('goals')!.rows.length === 2, 'B8: NO project or goal row was deleted');
    ok(server.log.filter((r) => r.method !== 'GET').every((r) => r.table === 'tasks'), 'B8: the bulk task delete writes to the tasks table and nothing else');
    const before = server.log.length;
    await repo.deleteTasks([]);
    ok(server.log.length === before, 'B8: empty selection sends no request at all');
  }

  section('B9. Supabase bulk milestone delete — detach first, delete after, gated');
  {
    const { server, repo } = supabaseFor(migratedSchema);
    const { theirs: theirsBefore } = seedSupabase(server, 3);
    const at = server.log.length;
    await repo.deleteProjectMilestones(['m1']);
    const after = server.log.slice(at);
    const patchIdx = after.findIndex((r) => r.method === 'PATCH' && r.table === 'tasks');
    const delIdx = after.findIndex((r) => r.method === 'DELETE' && r.table === PROJECT_MILESTONES_TABLE);
    ok(patchIdx !== -1 && delIdx > patchIdx, 'B9: detach PATCH strictly before the milestone DELETE — a mid-way failure can never leave a task pointing at a gone row');
    const patch = after[patchIdx]; const del = after[delIdx];
    ok(patch.query.get('project_milestone_id') === 'in.(m1)' && JSON.stringify(patch.body) === JSON.stringify({ project_milestone_id: null }), 'B9: the detach is an `IN`-scoped null-update, exactly the single-milestone contract batched');
    ok(del.query.get('id') === 'in.(m1)' && del.query.get('user_id') === `eq.${USER}`, 'B9: milestone delete is user-scoped and id-matched — never unscoped');
    ok(server.tables.get('tasks')!.rows.filter((r) => r.user_id === USER).every((r) => r.project_milestone_id === null), 'B9: every own task with that milestone is detached');
    ok(!server.tables.get('project_milestones')!.rows.some((r) => r.user_id === USER), 'B9: the milestone row is really gone');
    ok(Object.entries(server.tables).every(([name, tb]) => JSON.stringify((tb as { rows: Row[] }).rows.filter((r) => r.user_id === OTHER)) === theirsBefore[name]), 'B9: the other user’s milestone (and every other row of theirs) is byte-identical — RLS honored at request scope');
    ok(server.log.slice(at).filter((r) => r.method === 'DELETE' && (r.table === 'tasks' || r.table === 'projects' || r.table === 'goals')).length === 0, 'B9: no task, project or goal DELETE was ever attempted');
  }

  section('B10–B11. Supabase bulk project delete — milestones with the project, tasks detached, goal kept');
  {
    const { server, repo } = supabaseFor(migratedSchema);
    const { theirs: theirsBefore } = seedSupabase(server, 3);
    const goalsBefore = JSON.stringify(server.tables.get('goals')!.rows);
    const at = server.log.length;
    await repo.deleteProjects(['p1']);
    const writes = server.log.slice(at).filter((r) => r.method !== 'GET');
    const milestoneDelete = writes.findIndex((r) => r.method === 'DELETE' && r.table === 'project_milestones');
    const projectDelete = writes.findIndex((r) => r.method === 'DELETE' && r.table === 'projects');
    ok(milestoneDelete !== -1 && projectDelete > milestoneDelete, 'B10: the doomed project’s milestones are deleted before the project row itself');
    ok(writes.every((r) => ['tasks', 'project_milestones', 'projects'].includes(r.table)), 'B10: only the three relevant tables are written');
    const t = server.tables.get('tasks')!;
    ok(t.rows.filter((r) => r.user_id === USER).every((r) => r.project_id !== 'p1' && r.project_milestone_id !== 'm1'), 'B10: own tasks survive with project AND milestone links cleared');
    ok(t.rows.filter((r) => r.user_id === USER && String(r.id).startsWith('bulk-')).length === 3, 'B10: the 90-tasks-worth of rows are NOT deleted — detach only');
    ok(!server.tables.get('project_milestones')!.rows.some((r) => r.user_id === USER), 'B10: the project milestones are really gone');
    ok(!server.tables.get('projects')!.rows.some((r) => r.user_id === USER && r.id === 'p1'), 'B10: the project row is really gone');
    ok(JSON.stringify(server.tables.get('goals')!.rows) === goalsBefore, 'B11: the Goal is NOT deleted — not one goal request was written');
    ok(Object.entries(server.tables).every(([name, tb]) => JSON.stringify((tb as { rows: Row[] }).rows.filter((r) => r.user_id === OTHER)) === theirsBefore[name]), 'B11: not one of the other user’s rows changed — their project, milestone, task and links all persist');
  }

  section('B12. Supabase bulk goal delete — one DELETE, links fall by FK, nothing else touched');
  {
    const { server, repo } = supabaseFor(migratedSchema);
    const { theirs: theirsBefore } = seedSupabase(server, 3);
    const at = server.log.length;
    await repo.deleteGoals(['g1']);
    const writes = server.log.slice(at).filter((r) => r.method !== 'GET');
    ok(writes.length === 1 && writes[0].method === 'DELETE' && writes[0].table === 'goals' && writes[0].query.get('id') === 'in.(g1)', 'B12: exactly one user-scoped DELETE on goals — no other table written');
    ok(!server.tables.get('goals')!.rows.some((r) => r.user_id === USER && r.id === 'g1'), 'B12: the goal row is gone');
    ok(server.tables.get('goals')!.rows.some((r) => r.id === 'g-theirs'), 'B12: the other user’s goal survives');
    ok(Object.entries(server.tables).every(([name, tb]) => JSON.stringify((tb as { rows: Row[] }).rows.filter((r) => r.user_id === OTHER)) === theirsBefore[name]), 'B12: all of the other user’s rows are byte-identical');
    const t = server.tables.get('tasks')!;
    ok(t.rows.filter((r) => r.user_id === USER).every((r) => r.goal_id !== 'g1') && t.rows.filter((r) => r.user_id === USER).length === 5, 'B12: own tasks SURVIVE (still 5 rows), just detached');
    ok(server.tables.get('projects')!.rows.some((r) => r.user_id === USER && r.id === 'p1'), 'B12: the linked project survives, detached (SET NULL FK)');
  }

  section('B13. Unmigrated schema (no 008) — refuses exactly like the single paths');
  {
    const { server, repo } = supabaseFor(legacySchema);
    seedSupabase(server, 3);
    const error = await rejects(() => repo.deleteProjectMilestones(['m1']));
    ok(error instanceof Error && /not been applied/.test(error.message), 'B13: bulk milestone delete refuses with the same not-migrated error as the single delete');
    ok(server.log.filter((r) => r.method !== 'GET').length === 0, 'B13: the refusal sent no write request at all');
    await repo.deleteProjects(['p1']);
    ok(server.log.filter((r) => r.method === 'DELETE' && r.table === 'projects').length === 1, 'B13: project bulk delete degrades exactly like the single path — projects only, no milestone-table requests');
    ok(server.tables.get('tasks')!.rows.filter((r) => r.user_id === USER).every((r) => r.project_id !== 'p1'), 'B13: tasks still lose the project link (base FK) — nothing points into the deleted rows');
  }

  section('B14. Partial failure — honest, retryable, never worse than a superset');
  {
    const { server, repo } = supabaseFor(migratedSchema);
    seedSupabase(server, 250);
    server.fail = (method, table, query) => method === 'DELETE' && table === 'tasks' && (inIds(query, 'id') ?? []).includes('bulk-201');
    const error = await rejects(() => repo.deleteTasks(Array.from({ length: 250 }, (_, i) => `bulk-${i}`)));
    ok(error !== null, 'B14: the failed second chunk propagates an error to the caller');
    const t = server.tables.get('tasks')!;
    ok(!t.rows.some((r) => r.user_id === USER && String(r.id).startsWith('bulk-') && Number(String(r.id).slice(5)) < 200), 'B14: the FIRST chunk really is deleted — no fake transaction is claimed');
    ok(t.rows.some((r) => r.id === 'bulk-210'), 'B14: the second chunk is still there — the store keeps a consistent SUPERSET, never half a row');
    server.fail = null;
    await repo.deleteTasks(Array.from({ length: 50 }, (_, i) => `bulk-${200 + i}`));
    ok(!t.rows.some((r) => r.user_id === USER && String(r.id).startsWith('bulk-')), 'B14: retrying with the survivor ids completes the job (unknown ids ignored)');
  }

  /* ================================================================ */
  /* C. Multi-tab safety (LocalRepository over one shared store)       */
  /* ================================================================ */
  section('C15. A stale tab cannot resurrect deleted rows');
  {
    const store = memoryStore();
    store.setItem(STORAGE_KEY, JSON.stringify(normalizeAppData({
      goals: [], projects: [], projectMilestones: [],
      tasks: [task('a1'), task('a2'), task('a3'), task('a4')],
      subtasks: [], timerSessions: [], inbox: [], ideas: [], learnings: [],
      dailyPriorities: [], weeklyPriorities: [], monthlyPriorities: [], wellbeingDays: [], taskHistory: [],
    } as never)));
    const tabA = new LocalRepository(store);
    const tabB = new LocalRepository(store);
    await tabA.deleteTasks(['a1', 'a2']); // tabB loaded before this write and never re-synced its public snapshot
    await tabB.tasks.deleteMany(['a1', 'a3']); // stale-tab bulk delete: a1 is a ghost, a3 real
    const err1 = await rejects(() => tabB.tasks.update('a1', { title: 'resurrected' }));
    ok(err1 !== null && /Record not found/.test(err1.message), 'C15: the stale tab’s write on a deleted row fails instead of reviving it');
    const created = await tabB.tasks.create({ title: 'fresh', priority: 'medium', status: 'pending' } as never);
    const final = readStore(store).tasks.map((x) => x.id).sort();
    ok(JSON.stringify(final) === JSON.stringify([created.id, 'a4'].sort()), 'C15: the shared store is exactly [a4, fresh] — tab A’s bulk delete survived tab B’s later write (MERGE, no resurrection of a1/a2)');
    ok(!final.includes('a3'), 'C15: the stale tab’s bulk delete still removed the row that genuinely existed');
  }

  /* ================================================================ */
  /* D. The real UI: DataProvider + Tasks/Projects/Goals screens       */
  /* ================================================================ */
  section('D. UI (jsdom)');
  const { AuthProvider } = await import('../components/auth/auth-provider');
  const { DataProvider, useData } = await import('../components/data/data-provider');
  const { TasksScreen } = await import('../components/tasks/tasks-screen');
  const { ProjectsScreen } = await import('../components/projects/projects-screen');
  const { GoalsScreen } = await import('../components/goals/goals-screen');

  let ctx: ReturnType<typeof useData> | null = null;
  const Probe = () => { ctx = useData(); return null; };
  const c = () => ctx!;
  let root: import('react-dom/client').Root | null = null;
  const mount = async (node: React.ReactNode) => {
    if (root) await act(async () => root!.unmount());
    document.body.innerHTML = '';
    const el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
    ctx = null;
    await act(async () => {
      root!.render(React.createElement(AuthProvider, null,
        React.createElement(DataProvider, null, React.createElement(React.Fragment, null, node, React.createElement(Probe)))));
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    return el;
  };
  // A real user press: mousedown (what the menu's click-outside listens to),
  // then click. Both inside act(), like the Phase 4/5 harnesses.
  const click = async (element: Element | null | undefined, what: string) => {
    if (!element) throw new Error(`Missing UI control: ${what}`);
    await act(async () => {
      element.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 20));
    });
  };
  const typeInto = async (element: HTMLInputElement | null, value: string) => {
    if (!element) throw new Error('Missing text field');
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(element, value);
      element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 20));
    });
  };
  const pressEscape = async () => {
    await act(async () => {
      dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise((r) => setTimeout(r, 20));
    });
  };
  const button = (text: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  const bodyText = () => document.body.textContent ?? '';
  const persisted = () => new LocalRepository(dom.window.localStorage).exportData();
  /** Finds a selection checkbox by its exact accessible description (state-tolerant). */
  const checkboxFor = (described: string) =>
    Array.from(document.querySelectorAll('button[role="checkbox"]')).find((b) =>
      [`Select ${described}`, `Deselect ${described}`, `Select all ${described}`, `Deselect all ${described}`].includes(b.getAttribute('aria-label') ?? ''),
    );
  const selectAllCheckbox = () => document.querySelector('button[role="checkbox"][aria-label^="Select all"], button[role="checkbox"][aria-label^="Deselect all"]');
  const raw = () => dom.window.localStorage.getItem(STORAGE_KEY);

  // Seed this browser's local store with the same world, then replace the
  // window's storage with a counting shim (LocalRepository resolves
  // window.localStorage lazily at repository construction — i.e. at mount).
  const nativeStorage = dom.window.localStorage;
  nativeStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeAppData(world() as never)));
  let uiWrites = 0;
  const resetWrites = () => { uiWrites = 0; };
  Object.defineProperty(dom.window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => nativeStorage.getItem(k),
      setItem: (k: string, v: string) => { if (k === STORAGE_KEY) uiWrites += 1; nativeStorage.setItem(k, v); },
      removeItem: (k: string) => nativeStorage.removeItem(k),
    },
  });

  await mount(React.createElement(TasksScreen));
  ok(c().ready, 'D0: the provider loaded the seeded world');
  ok(bodyText().includes('Task t1') && bodyText().includes('95 tasks in view'), 'D0: the tasks screen shows all 95 tasks');

  section('D16. Select mode, filter-aware select-all, no hijacking');
  {
    await click(button('Select'), 'Select button');
    ok(!!selectAllCheckbox(), 'D16: entering select mode reveals the row checkboxes and the select-all strip');
    ok(bodyText().includes('Nothing selected'), 'D16: the bar starts with a zero count');

    // The row's own interactions keep working while selecting.
    const titleButton = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Task t3') && b.getAttribute('aria-expanded') !== null);
    ok(titleButton !== undefined, 'D16: the expandable summary button exists (row interaction intact)');
    await click(titleButton, 'row summary');
    ok(bodyText().includes('Nothing selected'), 'D16: clicking a row (expand details) does NOT toggle selection');
    await click(document.querySelector('button[aria-label="Task actions"]'), 'row menu');
    ok(bodyText().includes('Edit\u2026'), 'D16: the row edit menu still opens in select mode');
    await click(document.body, 'close menu');

    // Filter first, then select-all: it counts and selects only the matches.
    await typeInto(document.querySelector('input[placeholder="Search tasks\u2026"]'), 'Task t9');
    ok(bodyText().includes('7 tasks match the current filters'), 'D16: the bar counts and NAMES the current filters (t9, t90–t95)');
    await click(selectAllCheckbox(), 'select all');
    ok(bodyText().includes('7 tasks selected'), 'D16: select-all picks exactly the filtered 7, nothing beyond them');
    ok(checkboxFor('"Task t91" for bulk actions')?.getAttribute('aria-checked') === 'true', 'D16: visible filtered rows read as checked (aria-checked)');

    // Clearing the filter keeps the selection (ids, not a view snapshot).
    await typeInto(document.querySelector('input[placeholder="Search tasks\u2026"]'), '');
    ok(bodyText().includes('7 tasks selected'), 'D16: clearing filters keeps the selection — count unchanged');
    await click(button('Clear'), 'clear');
    ok(bodyText().includes('Nothing selected'), 'D16: Clear empties the whole selection');
  }

  section('D17. Cancel proves nothing happened — byte-for-byte');
  {
    // Start t2's timer through the real action: a seeded running task is
    // settled at load on purpose (only this tab may settle its own runs), so
    // a live open session has to be started, not faked, for this test.
    await act(async () => { await c().actions.startTask('t2'); });
    ok(bodyText().includes('Working'), 'D17: t2 is genuinely timed right now (row shows Working)');
    resetWrites();
    const before = raw();
    await click(checkboxFor('"Task t1" for bulk actions'), 't1 checkbox');
    await click(checkboxFor('"Task t2" for bulk actions'), 't2 checkbox');
    ok(!bodyText().includes('Edit task'), 'D17: selecting checkboxes opens no editor');
    await click(checkboxFor('"Task t93" for bulk actions'), 't93 checkbox');
    ok(bodyText().includes('3 tasks selected'), 'D17: three rows selected (t2 runs a timer)');
    await click(button('Delete selected (3)'), 'delete button');
    ok(bodyText().includes('Delete 3 tasks?'), 'D17: the dialog names the count in its title');
    ok(bodyText().includes('This will permanently delete:'), 'D17: explicit deletion-scope heading');
    ok(bodyText().includes('\u2022 3 tasks'), 'D17: bullet counts the tasks');
    ok(bodyText().includes('2 subtasks that hang off them'), 'D17: the subtask cascade of the existing behavior is spelled out with counts');
    ok(bodyText().includes('have a running timer') || bodyText().includes('has a running timer'), 'D17: the dialog warns that a selected task runs a timer');
    ok(bodyText().includes('will NOT be deleted'), 'D17: dialog says what is NOT deleted');
    ok(checkboxFor('"Task t1" for bulk actions')?.getAttribute('aria-checked') === 'true', 'D17: rows stay visible and checked behind the dialog');
    await click(button('Cancel'), 'cancel');
    ok(raw() === before, 'D17: Cancel changed NOTHING in the store — byte-identical');
    ok(uiWrites === 0, 'D17: Cancel sent zero writes');
    ok(bodyText().includes('3 tasks selected'), 'D17: Cancel keeps the selection (retry stays one click away)');
  }

  section('D18. Confirm deletes for real — store truth, single write, timer dropped');
  {
    resetWrites();
    await click(button('Delete selected (3)'), 'delete button');
    await click(button('Delete 3 tasks'), 'confirm delete');
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    ok(uiWrites === 1, `D18: a 3-task bulk delete with subtasks + sessions + detach is ONE localStorage write (got ${uiWrites})`);
    const data = await persisted();
    ok(!data.tasks.some((t) => t.id === 't1' || t.id === 't2' || t.id === 't93'), 'D18: the selected task rows are permanently deleted from the store');
    ok(data.tasks.length === 92, 'D18: exactly 3 of 95 rows are gone');
    ok(!data.subtasks.some((s) => s.id === 's1' || s.id === 's2'), 'D18: t1\u2019s subtasks are deleted with it (preserved existing behavior)');
    ok(data.subtasks.some((s) => s.id === 's3'), 'D18: an unrelated subtask survives');
    ok(data.timerSessions.length === 1 && data.timerSessions[0].id === 'ses4', 'D18: t1/t2\u2019s recorded runs are deleted; no orphan focused time remains');
    ok(!data.tasks.some((t) => t.parentTaskId === 't1'), 'D18: the broken-down child row is gone too (t93 was selected) — and nothing else points at a deleted task');
    ok(!data.timerSessions.some((x) => x.taskId === 't2'), 'D18: the deleted running task left no open/orphan session row behind');
    ok(data.projects.length === 2 && data.goals.length === 2 && data.projectMilestones.length === 3, 'D18: no project, milestone or goal was deleted');
    ok(c().toasts.some((t) => t.message.includes('3 tasks deleted')), 'D18: success toast with the count');
    ok(checkboxFor('"Task t1" for bulk actions') === undefined, 'D18: the deleted rows vanish from the list');
    ok(!bodyText().includes('Working'), 'D18: the running timer is gone from the UI — settled and dropped, never re-persisted');
    ok(bodyText().includes('Nothing selected'), 'D18: selection cleared after success');
  }

  section('D19. Bulk confirm happens even with confirmTaskDeletion off');
  {
    const settings = c().data.settings;
    await act(async () => { await c().actions.updateSettings({ general: { ...settings.general, confirmTaskDeletion: false } }); });
    resetWrites();
    const before = raw();
    await click(checkboxFor('"Task t94" for bulk actions'), 't94 checkbox');
    await click(button('Delete selected (1)'), 'delete button');
    ok(bodyText().includes('Delete 1 task?'), 'D19: the bulk delete STILL confirms even though settings.general.confirmTaskDeletion is false');
    await click(button('Cancel'), 'cancel');
    ok(raw() === before, 'D19: cancel again: nothing stored');
    await act(async () => { await c().actions.updateSettings({ general: { ...settings.general, confirmTaskDeletion: true } }); });
  }

  section('D20. Escape / Done leave select mode');
  {
    await pressEscape();
    ok(!selectAllCheckbox() && button('Select') !== undefined, 'D20: Escape exits select mode (checkboxes gone, Select back)');
    await click(button('Select'), 'select again');
    ok(bodyText().includes('Nothing selected'), 'D20: re-entering starts from an empty selection');
    await click(checkboxFor('"Task t95" for bulk actions'), 't95');
    await click(button('Done'), 'done');
    ok(!selectAllCheckbox(), 'D20: Done exits select mode too');
    await click(button('Select'), 'select again');
    ok(bodyText().includes('Nothing selected'), 'D20: leaving and re-entering clears like Escape does');
    await click(button('Done'), 'done');
  }

  section('D21. Projects screen — bulk project delete detaches with the right words');
  {
    await mount(React.createElement(ProjectsScreen));
    resetWrites();
    await click(button('Select'), 'select mode');
    const p1Card = Array.from(document.querySelectorAll('div.rounded-2xl')).find((d) => d.textContent?.includes('Sikhizm 90 Days'));
    await click(p1Card?.querySelector('button[aria-label="Expand project"]'), 'expand p1');
    ok(!!checkboxFor('milestone \"Foundation\" for bulk actions'), 'D21: milestone rows get their own selection checkboxes');
    await click(checkboxFor('project \"Sikhizm 90 Days\" for bulk actions'), 'p1 checkbox');
    await click(checkboxFor('milestone \"Foundation\" for bulk actions'), 'm1 checkbox — redundant with its selected project');
    const p2Card = Array.from(document.querySelectorAll('div.rounded-2xl')).find((d) => d.textContent?.includes('Side Project'));
    await click(p2Card?.querySelector('button[aria-label="Expand project"]'), 'expand p2');
    await click(checkboxFor('milestone \"Launch\" for bulk actions'), 'm3 checkbox — a standalone milestone of a kept project');
    ok(bodyText().includes('3 items selected'), 'D21: projects and milestones share one selection');
    await click(button('Delete selected (3)'), 'delete');
    ok(bodyText().includes('Delete 1 project and 1 milestone?'), 'D21: combined title; the redundant milestone is not counted twice');
    ok(bodyText().includes('\u2022 3 project milestones (1 you selected, 2 belonging to the selected projects)'), 'D21: exact milestone accounting');
    ok(bodyText().includes('The 89 tasks inside them will NOT be deleted'), 'D21: every affected task counted, promised to survive detached');
    ok(bodyText().includes('Goals will NOT be deleted'), 'D21: the Goal is promised kept');
    await click(button('Delete 1 project (+3 milestones)'), 'confirm');
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    const data = await persisted();
    ok(!data.projects.some((p) => p.id === 'p1'), 'D21: the project row is deleted');
    ok(data.projectMilestones.length === 0, 'D21: p1\u2019s 2 milestones and the standalone m3 are gone, and nothing else');
    ok(data.tasks.length === 92, 'D21: NOT one task was deleted');
    ok(data.tasks.every((t) => t.projectId !== 'p1' && t.projectMilestoneId !== 'm1' && t.projectMilestoneId !== 'm2'), 'D21: every link into the deleted rows is cleared');
    const t94 = data.tasks.find((t) => t.id === 't94')!;
    ok(t94.projectId === 'p2' && t94.projectMilestoneId === undefined, 'D21: the standalone milestone\u2019s task kept its project, lost only the deleted milestone');
    ok(data.goals.some((goal) => goal.id === 'g1'), 'D21: the Goal survives');
    ok(c().toasts.some((t) => t.message.includes('1 project deleted')), 'D21: success toast');
    ok(uiWrites === 2, `D21: milestones-then-projects = two atomic whole-store writes (got ${uiWrites}); the redundant m1 id never double-wrote`);
  }

  section('D22. Goals screen — detach-only wording and behavior');
  {
    await mount(React.createElement(GoalsScreen));
    resetWrites();
    await click(button('Select'), 'select mode');
    await click(checkboxFor('goal \"Fitness\" for bulk actions'), 'g2 checkbox');
    await click(button('Delete selected (1)'), 'delete');
    ok(bodyText().includes('Delete 1 goal?'), 'D22: count in the title');
    ok(bodyText().includes('1 task linked to them will NOT be deleted'), 'D22: live detach count — t92 survives, just detached');
    await click(button('Cancel'), 'cancel');
    await click(checkboxFor('goal \"Fitness\" for bulk actions'), 'unselect g2');
    await click(checkboxFor('goal \"Sikhizm 90 Days Growth\" for bulk actions'), 'g1 checkbox');
    await click(button('Delete selected (1)'), 'delete');
    await click(button('Delete 1 goal'), 'confirm');
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    const data = await persisted();
    ok(!data.goals.some((goal) => goal.id === 'g1') && data.goals.length === 1 && data.goals[0].id === 'g2', 'D22: the confirmed goal is deleted; the cancelled selection was untouched');
    ok(data.tasks.length === 92 && data.tasks.every((t) => t.goalId !== 'g1'), 'D22: no task deleted; goal links cleared in the store');
    ok(data.projects.length === 1 && data.projects[0].id === 'p2', 'D22: no project was deleted by a goal delete');
    ok(uiWrites === 1, `D22: goal bulk delete = one atomic write (got ${uiWrites})`);
    ok(c().toasts.some((t) => t.message.includes('1 goal deleted')), 'D22: success toast');
  }

  await new Promise((r) => setTimeout(r, 100));
  if (root) await act(async () => root!.unmount());

  console.log(failures === 0 ? '\nALL PHASE 6 ASSERTIONS PASSED' : `\n${failures} ASSERTION(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().then(null, (error) => {
  console.error('HARNESS ERROR:', error);
  process.exit(1);
});
