/**
 * Phase 3 — Learnings rename + Project Milestones, verified headlessly.
 *
 * Exercises the real code paths, never a copy of them:
 *   - LocalRepository over an in-memory StorageLike (old/new `pace.db.v1`);
 *   - SupabaseRepository + the real supabase-js SDK against a fake PostgREST
 *     at the fetch boundary (an unmigrated and a migrated schema) — no request
 *     can reach a real Supabase project;
 *   - DataProvider + the real screens/forms in jsdom.
 *
 * The numbered sections match the Phase 3 test list (1–13; 14–16 are the
 * build, TypeScript and existing-suite runs).
 *
 * Run: npm i --no-save jsdom tsx && npx tsx scripts/verify-learnings-project-milestones.tsx
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = dom.window; g.document = dom.window.document; g.localStorage = dom.window.localStorage;
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
const md5 = (text: string) => createHash('md5').update(text).digest('hex');
const rejects = async (run: () => Promise<unknown>): Promise<Error | null> => {
  try {
    await run();
    return null;
  } catch (error) {
    return error as Error;
  }
};

/** A fresh, isolated "localStorage". */
const memoryStore = () => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
};

/**
 * A tiny PostgREST stand-in: tables with a fixed column set, `eq` filters,
 * `order`, `limit`, insert/update/delete/upsert — and PostgREST's real error
 * codes for a missing table (PGRST205), an unknown column in a query (42703)
 * or in a write body (PGRST204). Every request is logged.
 */
function fakePostgrest(schema: Record<string, string[]>) {
  const tables = new Map(Object.entries(schema).map(([name, cols]) => [name, { columns: new Set(cols), rows: [] as Row[] }]));
  const log: { method: string; table: string; query: URLSearchParams; body?: unknown }[] = [];
  const err = (status: number, code: string, message: string) => Response.json({ code, details: null, hint: null, message }, { status });
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const table = url.pathname.replace(/^\/rest\/v1\//, '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    log.push({ method, table, query: url.searchParams, body });
    const t = tables.get(table);
    if (!t) return err(404, 'PGRST205', `Could not find the table 'public.${table}' in the schema cache`);

    let select = '*';
    let order: { col: string; asc: boolean } | null = null;
    let limit: number | null = null;
    const filters: [string, string][] = [];
    for (const [k, v] of url.searchParams) {
      if (k === 'select') select = v;
      else if (k === 'order') order = { col: v.split('.')[0], asc: !v.includes('.desc') };
      else if (k === 'limit') limit = Number(v);
      else if (k === 'columns' || k === 'on_conflict') continue;
      else if (v.startsWith('eq.')) filters.push([k, v.slice(3)]);
      else throw new Error(`fake PostgREST: unsupported filter ${k}=${v}`);
    }
    const selected = select === '*' ? [] : select.split(',');
    const unknown = [...selected, ...filters.map(([k]) => k), ...(order ? [order.col] : [])].find((c) => !t.columns.has(c));
    if (unknown) return err(400, '42703', `column ${table}.${unknown} does not exist`);
    const matches = (r: Row) => filters.every(([k, v]) => String(r[k]) === v);

    if (method === 'GET') {
      let rows = t.rows.filter(matches);
      if (order) {
        const { col, asc } = order;
        rows = [...rows].sort((a, b) => ((a[col] as number) < (b[col] as number) ? -1 : (a[col] as number) > (b[col] as number) ? 1 : 0) * (asc ? 1 : -1));
      }
      if (limit !== null) rows = rows.slice(0, limit);
      return Response.json(rows.map((r) => (select === '*' ? { ...r } : Object.fromEntries(selected.map((c) => [c, r[c] ?? null])))));
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
      t.rows = t.rows.filter((r) => !matches(r));
      return new Response(null, { status: 204 });
    }
    throw new Error(`fake PostgREST: unsupported method ${method}`);
  };
  return { tables, log, fetch: fetchImpl };
}

async function main() {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { act } = React;
  const { createClient } = await import('@supabase/supabase-js');
  const { LocalRepository, STORAGE_KEY } = await import('../lib/store/local-repository');
  const { SupabaseRepository, LEARNINGS_TABLE } = await import('../lib/store/supabase-repository');
  const { normalizeAppData } = await import('../lib/store/normalize');
  const { defaultSettings } = await import('../lib/store/defaults');
  const { LEARNING_SEED } = await import('../lib/learnings-seed');
  const { parseLearnings } = await import('../lib/learnings-import');
  const { isValidLearningDate, precisionOf, formatLearningDate, groupLearnings } = await import('../lib/learnings');
  const { formatShortDate } = await import('../lib/dates');
  const { ProjectMilestoneError, resolveTaskMilestone, findProjectMilestoneProblems } = await import('../lib/project-milestones');
  const { goalProgress, projectProgress } = await import('../lib/selectors');
  const { NAV_ITEMS } = await import('../components/layout/nav');
  const { AuthProvider } = await import('../components/auth/auth-provider');
  const { DataProvider, useData } = await import('../components/data/data-provider');
  const { TaskFormModal } = await import('../components/tasks/task-form-modal');
  const { ProjectsScreen } = await import('../components/projects/projects-screen');
  const { LearningsScreen } = await import('../components/learnings/learnings-screen');
  type Learning = import('../lib/types').Learning;
  type Task = import('../lib/types').Task;
  type AppData = import('../lib/types').AppData;

  /* ================================================================ */
  /* Fixtures: 56 learnings exactly as the pre-Phase-3 app stored them */
  /* ================================================================ */
  // 49 come from the real starter timeline, 7 more make the production count.
  const fromSeed = parseLearnings(LEARNING_SEED).valid;
  const more = [
    { title: 'Cursor', category: 'ai-tool' as const, date: '2026-10-02', description: 'AI code editor' },
    { title: 'Claude Code', category: 'ai-tool' as const, date: '2026-10' },
    { title: 'Tailwind CSS v4', category: 'framework' as const, date: '2026-09', description: 'CSS-first config' },
    { title: 'pnpm', category: 'platform' as const, date: '2025' },
    { title: 'TypeScript strict mode', category: 'language' as const, date: '2026-08-15' },
    { title: 'Weekly review', category: 'habit' as const, date: '2026-07' },
    { title: 'Row Level Security', category: 'concept' as const, date: '2026-10-05', description: 'Supabase RLS policies' },
  ];
  const learningId = (i: number) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
  // Same key order (and missing-description shape) the old LocalRepository produced.
  const fixture: Learning[] = [...fromSeed, ...more].map((l, i) => {
    const rec: Record<string, unknown> = { id: learningId(i), title: l.title, category: l.category ?? 'other' };
    if (l.description) rec.description = l.description;
    rec.date = l.date;
    rec.createdAt = new Date(Date.UTC(2026, 9, 1, 8, 0, i)).toISOString();
    return rec as unknown as Learning;
  });
  const fingerprint = (list: Learning[]) => ({
    count: list.length,
    idsMd5: md5([...list.map((l) => l.id)].sort().join('\n')),
    recordsMd5: md5([...list].sort((a, b) => (a.id < b.id ? -1 : 1)).map((l) => JSON.stringify(l)).join('\n')),
  });
  const original = fingerprint(fixture);
  const sameRecords = (list: Learning[]) => {
    const f = fingerprint(list);
    return f.count === 56 && f.idsMd5 === original.idsMd5 && f.recordsMd5 === original.recordsMd5;
  };

  /** What the pre-Phase-3 app wrote to `pace.db.v1` (and exported verbatim). */
  const legacyBlob = (extra: Record<string, unknown> = {}) => ({
    tasks: [{ id: 't-legacy', title: 'Legacy task', status: 'created', priority: 'medium', projectId: 'p-legacy', createdAt: '2026-10-01T09:00:00.000Z', tags: [], postponementCount: 0, archived: false }],
    subtasks: [],
    projects: [{ id: 'p-legacy', name: 'Legacy project', status: 'active', createdAt: '2026-09-01T09:00:00.000Z' }],
    goals: [],
    inbox: [],
    ideas: [],
    milestones: JSON.parse(JSON.stringify(fixture)),
    dailyPriorities: [],
    weeklyPriorities: [],
    monthlyPriorities: [],
    taskHistory: [],
    wellbeingDays: [],
    timerSessions: [],
    settings: defaultSettings,
    ...extra,
  });

  section('Fixture');
  ok(fixture.length === 56 && new Set(fixture.map((l) => l.id)).size === 56, 'Fixture: 56 learnings with 56 unique ids');
  ok(fixture.every((l) => isValidLearningDate(l.date)) && ['year', 'month', 'day'].every((p) => fixture.some((l) => precisionOf(l.date) === p)),
     'Fixture: every date is a valid partial date, and all three precisions (YYYY / YYYY-MM / YYYY-MM-DD) occur');
  ok(['ai-tool', 'framework', 'platform', 'extension', 'language', 'concept', 'habit'].every((c) => fixture.some((l) => l.category === c)),
     'Fixture: the existing categories are represented');

  /* ================================================================ */
  /* 1. Existing Milestones load as Learnings                          */
  /* ================================================================ */
  section('1. Old local data loads as Learnings');
  {
    const store = memoryStore();
    const raw = JSON.stringify(legacyBlob());
    store.setItem(STORAGE_KEY, raw);
    const repo = new LocalRepository(store);
    const learnings = await repo.learnings.list();
    ok(sameRecords(learnings), `1: the 56 stored "milestones" load as 56 learnings, record-for-record identical (ids md5 ${original.idsMd5})`);
    ok(learnings.map((l) => l.id).join() === fixture.map((l) => l.id).join(), '1: their order is preserved');
    ok((await repo.projectMilestones.list()).length === 0, '1: none of them is treated as a Project Milestone');
    ok(store.getItem(STORAGE_KEY) === raw, '1: loading performs no write — storage is byte-identical until the next real change');
    ok(learnings.find((l) => l.title === 'WordPress')?.date === '2015'
       && learnings.find((l) => l.title === 'React.js')?.date === '2025-02-28'
       && learnings.some((l) => l.date === '2026-09'),
       '1: partial dates are untouched (\'2015\', \'2026-09\', \'2025-02-28\')');
  }

  /* ================================================================ */
  /* 2. Old JSON exports with `milestones` import correctly             */
  /* ================================================================ */
  section('2. Old JSON exports import as Learnings');
  {
    const oldExport = JSON.parse(JSON.stringify(legacyBlob()));
    const repo = new LocalRepository(memoryStore());
    await repo.importData(oldExport);
    const data = await repo.exportData();
    ok(sameRecords(data.learnings), '2 (local): an old export\u2019s 56 milestones import as the identical 56 learnings');
    ok(data.projectMilestones.length === 0, '2 (local): they never become Project Milestones');
    ok(data.tasks.length === 1 && data.projects.length === 1 && data.tasks[0].projectId === 'p-legacy', '2 (local): the rest of the export imports as before');
    ok(JSON.stringify(oldExport) === JSON.stringify(legacyBlob()), '2 (local): the caller\u2019s payload object is not mutated');
  }

  /* ================================================================ */
  /* 3. New exports use `learnings`                                    */
  /* ================================================================ */
  section('3. New exports use learnings + projectMilestones');
  {
    const store = memoryStore();
    store.setItem(STORAGE_KEY, JSON.stringify(legacyBlob()));
    const exported = await new LocalRepository(store).exportData();
    const text = JSON.stringify(exported);
    ok(Array.isArray(exported.learnings) && exported.learnings.length === 56, '3: the export has `learnings` (56)');
    ok(Array.isArray(exported.projectMilestones), '3: the export has `projectMilestones`');
    ok(!('milestones' in exported) && !text.includes('"milestones":'), '3: the export has no `milestones` key — no duplicate copy');
  }

  /* ================================================================ */
  /* Lossless: unknown fields and keys survive the rename              */
  /* ================================================================ */
  section('Lossless old milestones[] → learnings[]');
  {
    const withExtras = legacyBlob({ someFutureCollection: [{ id: 'x1', keep: true }] });
    (withExtras.milestones as Record<string, unknown>[])[0].importedFrom = { source: 'notes', page: 3 };
    (withExtras.milestones as Record<string, unknown>[])[1].user_id = '9f1c0000-0000-4000-8000-000000000001';
    const normalized = normalizeAppData(JSON.parse(JSON.stringify(withExtras))) as AppData & Record<string, unknown>;
    ok(JSON.stringify(normalized.learnings) === JSON.stringify(withExtras.milestones),
       'Lossless: learnings[] is exactly milestones[] — same records, same order, same fields (incl. unknown per-record fields)');
    ok(JSON.stringify(normalized.someFutureCollection) === JSON.stringify(withExtras.someFutureCollection), 'Lossless: unknown top-level keys survive');
    ok(!('milestones' in normalized), 'Lossless: the legacy key is folded in, not kept alongside');
    ok(normalized.learnings.every((l, i) => l.date === fixture[i].date && l.id === fixture[i].id), 'Lossless: no date was converted and no id changed');
    const union = normalizeAppData({ learnings: [fixture[0], fixture[1]], milestones: [{ ...fixture[1], title: 'stale copy' }, fixture[2]] });
    ok(union.learnings.map((l) => l.id).join() === [fixture[0].id, fixture[1].id, fixture[2].id].join() && union.learnings[1].title === fixture[1].title,
       'Lossless: data written by an old and a new tab side by side is merged by id (nothing lost, `learnings` wins on a clash)');
  }

  /* ================================================================ */
  /* 13. The local migration is idempotent                             */
  /* ================================================================ */
  section('13. Local migration is idempotent and non-destructive');
  {
    const once = normalizeAppData(JSON.parse(JSON.stringify(legacyBlob())));
    const twice = normalizeAppData(JSON.parse(JSON.stringify(once)));
    ok(JSON.stringify(once) === JSON.stringify(twice), '13: normalizing normalized data changes nothing');
    const store = memoryStore();
    store.setItem(STORAGE_KEY, JSON.stringify(legacyBlob()));
    const first = new LocalRepository(store);
    await first.goals.create({ name: 'Any write' }); // the first ordinary write stores the current shape
    const migrated = JSON.parse(store.getItem(STORAGE_KEY)!);
    ok(!('milestones' in migrated) && sameRecords(migrated.learnings), '13: after the first write, storage holds `learnings` (56, identical) and no `milestones`');
    const afterFirst = store.getItem(STORAGE_KEY);
    for (let i = 0; i < 3; i += 1) {
      const again = new LocalRepository(store);
      ok(sameRecords(await again.learnings.list()), `13: reload #${i + 1} still reads the same 56 learnings`);
    }
    ok(store.getItem(STORAGE_KEY) === afterFirst, '13: repeated loads leave storage byte-identical');
    const reexport = await new LocalRepository(store).exportData();
    const reimported = new LocalRepository(memoryStore());
    await reimported.importData(reexport);
    await reimported.importData(await reimported.exportData());
    ok(sameRecords(await reimported.learnings.list()), '13: export → import → export → import is stable');
  }

  /* ================================================================ */
  /* 4. The 56 records survive every path — local and Supabase         */
  /* ================================================================ */
  section('4. The 56 learning records remain unchanged');
  const USER = 'test-user';
  const legacySchema = {
    tasks: ['id', 'user_id', 'title', 'description', 'status', 'priority', 'project_id', 'goal_id', 'parent_task_id', 'created_at', 'scheduled_date', 'due_date', 'completed_at', 'estimated_duration', 'actual_duration', 'started_at', 'paused_at', 'actual_duration_seconds', 'reminder', 'notes', 'tags', 'recurrence', 'postponement_count', 'archived'],
    subtasks: ['id', 'user_id', 'parent_task_id', 'title', 'completed', 'sort_order', 'created_at'],
    projects: ['id', 'user_id', 'name', 'description', 'goal_id', 'deadline', 'status', 'created_at'],
    goals: ['id', 'user_id', 'name', 'description', 'deadline', 'status', 'created_at'],
    inbox_items: ['id', 'user_id', 'title', 'note', 'created_at'],
    ideas: ['id', 'user_id', 'title', 'description', 'created_at', 'archived'],
    milestones: ['id', 'user_id', 'title', 'category', 'description', 'date', 'created_at'],
    daily_priorities: ['id', 'user_id', 'date', 'title', 'completed', 'completed_at', 'due_date', 'postponement_count'],
    weekly_priorities: ['id', 'user_id', 'week', 'title', 'primary', 'completed', 'completed_at'],
    monthly_priorities: ['id', 'user_id', 'month', 'title', 'completed', 'completed_at', 'goal_id', 'project_id'],
    task_history: ['id', 'user_id', 'task_id', 'type', 'at', 'note'],
    wellbeing_days: ['id', 'user_id', 'date', 'jogging', 'nitnem_morning', 'nitnem_evening', 'nitnem_night'],
    timer_sessions: ['id', 'user_id', 'task_id', 'started_at', 'ended_at', 'duration_seconds'],
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
      auth: { persistSession: false, autoRefreshToken: false, storageKey: `verify-phase3-${clients}` },
      global: { fetch: server.fetch as typeof fetch },
    });
    return { server, repo: new SupabaseRepository(client, USER) };
  };
  const dbRows = fixture.map((l) => ({ id: l.id, user_id: USER, title: l.title, category: l.category, description: l.description ?? null, date: l.date, created_at: l.createdAt }));
  const writes = (log: { method: string; table: string }[], table?: string) => log.filter((r) => r.method !== 'GET' && (!table || r.table === table));
  {
    // Local: load → write → export → import → export.
    const store = memoryStore();
    store.setItem(STORAGE_KEY, JSON.stringify(legacyBlob()));
    const local = new LocalRepository(store);
    await local.projects.create({ name: 'Unrelated write' });
    const exported = await local.exportData();
    const elsewhere = new LocalRepository(memoryStore());
    await elsewhere.importData(exported);
    ok(sameRecords((await elsewhere.exportData()).learnings), '4 (local): after load, unrelated writes, export and import the 56 records are identical');

    // Supabase, today's schema: reading and exporting never writes to `milestones`.
    const { server, repo } = supabaseFor(legacySchema);
    server.tables.get('milestones')!.rows.push(...dbRows.map((r) => ({ ...r })));
    const snapshot = JSON.stringify(server.tables.get('milestones')!.rows);
    const learnings = await repo.learnings.list();
    const exportedRemote = await repo.exportData();
    ok(LEARNINGS_TABLE === 'milestones', '4 (Supabase): learnings are still read from the `milestones` table');
    ok(sameRecords(learnings) && sameRecords(exportedRemote.learnings), '4 (Supabase): the 56 rows map to 56 identical learnings (same ids, dates, fields)');
    ok(writes(server.log).length === 0, '4 (Supabase): loading + exporting issued zero writes (no INSERT/UPDATE/DELETE at all)');
    ok(JSON.stringify(server.tables.get('milestones')!.rows) === snapshot, '4 (Supabase): the milestones table is byte-identical afterwards');
  }

  /* ================================================================ */
  /* Supabase before migration 008 behaves exactly as before            */
  /* ================================================================ */
  section('Supabase without migration 008 (today\u2019s production schema)');
  {
    const { server, repo } = supabaseFor(legacySchema);
    server.tables.get('milestones')!.rows.push(...dbRows.map((r) => ({ ...r })));
    server.tables.get('projects')!.rows.push({ id: 'p1', user_id: USER, name: 'Website', status: 'active', created_at: '2026-10-01T00:00:00Z' });
    ok((await repo.supportsProjectMilestones()) === false, 'Unmigrated: the capability probe reports Project Milestones as unavailable');
    const probes = server.log.filter((r) => r.table === 'project_milestones' || r.query.get('select') === 'project_milestone_id');
    ok(probes.length === 2 && probes.every((r) => r.method === 'GET' && r.query.get('limit') === '1' && r.query.get('user_id') === `eq.${USER}`),
       'Unmigrated: the probe is two read-only, user-scoped `select … limit 1` requests');
    ok((await repo.projectMilestones.list()).length === 0, 'Unmigrated: projectMilestones.list() is empty');
    const created = await repo.tasks.create({ title: 'Works as before', projectId: 'p1' });
    await repo.tasks.update(created.id, { title: 'Still works' });
    const taskWrites = writes(server.log, 'tasks');
    ok(taskWrites.length === 2 && taskWrites.every((r) => !JSON.stringify(r.body).includes('project_milestone_id')),
       'Unmigrated: task insert/update succeed and never send project_milestone_id (the fake rejects unknown columns like PostgREST)');
    const before = server.log.length;
    const refused = await rejects(() => repo.projectMilestones.create({ projectId: 'p1', name: 'Too early' }));
    ok(refused instanceof ProjectMilestoneError && /not been applied/.test(refused.message) && server.log.length === before,
       'Unmigrated: creating a project milestone is refused with a clear message and without any request');
    const logBefore = server.log.length;
    const refusedImport = await rejects(() => repo.importData({ ...legacyBlob(), milestones: undefined, learnings: fixture, projects: [{ id: 'p1', name: 'Website', status: 'active', createdAt: '2026-10-01T00:00:00Z' }], projectMilestones: [{ id: 'm1', projectId: 'p1', name: 'Beta', position: 0, createdAt: '2026-10-01T00:00:00Z' }] }));
    ok(refusedImport instanceof ProjectMilestoneError && writes(server.log.slice(logBefore)).length === 0 && server.tables.get('milestones')!.rows.length === 56,
       'Unmigrated: importing a file with project milestones is refused before anything is deleted');
    await repo.importData(JSON.parse(JSON.stringify(legacyBlob())));
    const remoteLearnings = server.tables.get('milestones')!.rows;
    ok(remoteLearnings.length === 56 && md5(remoteLearnings.map((r) => String(r.id)).sort().join('\n')) === original.idsMd5
       && remoteLearnings.every((r) => fixture.find((l) => l.id === r.id)?.date === r.date),
       '2 (Supabase): an old export\u2019s `milestones` import into the milestones table as the same 56 learnings (ids, dates)');
    ok(!server.log.some((r) => r.table === 'project_milestones' && r.method !== 'GET'), '2 (Supabase): nothing was ever written to project_milestones');
  }

  section('Supabase when the migration-008 probe itself fails');
  {
    const server = fakePostgrest(migratedSchema);
    const realFetch = server.fetch;
    let failProbe = true;
    // A transient failure of only the probe requests (e.g. a network blip or a permissions problem on the new table).
    const flaky = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const isProbe = url.searchParams.get('limit') === '1' && (url.pathname.endsWith('/project_milestones') || url.searchParams.get('select') === 'project_milestone_id');
      if (failProbe && isProbe) return Response.json({ code: '42501', details: null, hint: null, message: 'permission denied' }, { status: 403 });
      return realFetch(input, init);
    };
    const client = createClient('https://test.supabase.co', 'test-publishable-key', {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: 'verify-phase3-flaky' },
      global: { fetch: flaky as typeof fetch },
    });
    const flakyRepo = new SupabaseRepository(client, USER);
    const originalError = console.error;
    console.error = () => {};
    try {
      ok(await rejects(() => flakyRepo.supportsProjectMilestones()) !== null, 'Probe failure: an unexpected error is reported, not mistaken for "not migrated"');
      const t = await flakyRepo.tasks.create({ title: 'Still saved' });
      ok(server.tables.get('tasks')!.rows.some((r) => r.id === t.id) && !JSON.stringify(writes(server.log, 'tasks')).includes('project_milestone_id'),
         'Probe failure: task writes still succeed (column left out, so nothing is changed)');
      ok(await rejects(() => flakyRepo.exportData()) !== null, 'Probe failure: export fails loudly instead of writing a possibly inconsistent backup');
      const beforeImport = server.log.length;
      ok(await rejects(() => flakyRepo.importData(legacyBlob())) !== null && writes(server.log.slice(beforeImport)).length === 0,
         'Probe failure: import aborts before deleting anything');
      failProbe = false;
      ok((await flakyRepo.supportsProjectMilestones()) === true, 'Probe failure: the failure is not remembered — the next check succeeds');
    } finally {
      console.error = originalError;
    }
  }

  /* ================================================================ */
  /* Supabase after migration 008                                       */
  /* ================================================================ */
  section('Supabase with migration 008 applied (simulated)');
  {
    const { server, repo } = supabaseFor(migratedSchema);
    server.tables.get('projects')!.rows.push(
      { id: 'p1', user_id: USER, name: 'Website', status: 'active', created_at: '2026-10-01T00:00:00Z' },
      { id: 'p2', user_id: USER, name: 'Book', status: 'active', created_at: '2026-10-01T00:00:00Z' },
    );
    ok((await repo.supportsProjectMilestones()) === true, 'Migrated: Project Milestones are detected as available');
    const m1 = await repo.projectMilestones.create({ projectId: 'p1', name: ' Design ', position: 0 });
    const m2 = await repo.projectMilestones.create({ projectId: 'p1', name: 'Launch', position: 1 });
    const t1 = await repo.tasks.create({ title: 'Wireframes', projectId: 'p1', projectMilestoneId: m1.id });
    ok(server.tables.get('project_milestones')!.rows.length === 2 && m1.name === 'Design'
       && server.tables.get('tasks')!.rows.find((r) => r.id === t1.id)?.project_milestone_id === m1.id,
       'Migrated: milestones and a task with project_milestone_id are written');
    ok((await repo.tasks.list()).find((t) => t.id === t1.id)?.projectMilestoneId === m1.id, 'Migrated: the task\u2019s milestone reads back');
    ok(await rejects(() => repo.projectMilestones.update(m1.id, { projectId: 'p2' })) instanceof ProjectMilestoneError, 'Migrated: a milestone cannot move to another project');
    await repo.projectMilestones.reorder('p1', [m2.id, m1.id]);
    const reorderWrites = writes(server.log, 'project_milestones').filter((r) => r.method === 'PATCH');
    ok((await repo.projectMilestones.listForProject('p1')).map((m) => m.id).join() === [m2.id, m1.id].join()
       && reorderWrites.length === 2 && reorderWrites.every((r) => r.query.get('user_id') === `eq.${USER}` && r.query.get('project_id') === 'eq.p1'),
       'Migrated: reorder rewrites positions, scoped to the user and the project');
    ok(await rejects(() => repo.projectMilestones.reorder('p1', [m1.id])) instanceof ProjectMilestoneError, 'Migrated: an incomplete reorder is refused');
    const logAt = server.log.length;
    await repo.projectMilestones.delete(m1.id);
    const del = server.log.slice(logAt);
    ok(del[0]?.method === 'PATCH' && del[0].table === 'tasks' && del[0].query.get('project_milestone_id') === `eq.${m1.id}` && del[0].query.get('user_id') === `eq.${USER}`
       && JSON.stringify(del[0].body) === '{"project_milestone_id":null}' && del[1]?.method === 'DELETE' && del[1].table === 'project_milestones',
       'Migrated: deleting a milestone first clears it from the user\u2019s tasks (only that column), then deletes it');
    ok(server.tables.get('tasks')!.rows.some((r) => r.id === t1.id && r.project_milestone_id === null), 'Migrated: the task itself is kept');

    // Import order: parents first, so every foreign key has its target.
    const payload = await repo.exportData();
    const importAt = server.log.length;
    await repo.importData(payload);
    const inserts = server.log.slice(importAt).filter((r) => r.method === 'POST').map((r) => r.table);
    ok(inserts.indexOf('projects') < inserts.indexOf('project_milestones') && inserts.indexOf('project_milestones') < inserts.indexOf('tasks'),
       `Migrated: import inserts projects → project_milestones → tasks (${inserts.filter((t) => ['projects', 'project_milestones', 'tasks'].includes(t)).join(' → ')})`);
    const remote = server.log.filter((r) => r.table !== 'app_settings' || r.method !== 'POST');
    ok(remote.every((r) => r.method === 'POST'
      ? (Array.isArray(r.body) ? r.body : [r.body]).every((row: Row) => row.user_id === USER)
      : r.query.get('user_id') === `eq.${USER}`),
       'Every request is user-scoped: reads/updates/deletes filter on user_id, inserts carry user_id');
    const inconsistent = await rejects(() => repo.importData({ ...payload, tasks: [{ ...payload.tasks[0], projectId: 'p2', projectMilestoneId: m2.id }] }));
    ok(inconsistent instanceof ProjectMilestoneError && /nothing was changed/.test(inconsistent.message), 'Migrated: an import with a cross-project task milestone is refused up front');
  }

  /* ================================================================ */
  /* Pure rules                                                         */
  /* ================================================================ */
  section('Invariant rules (lib/project-milestones.ts)');
  {
    const ms = [
      { id: 'a1', projectId: 'A', name: 'A1', position: 0, createdAt: '1' },
      { id: 'b1', projectId: 'B', name: 'B1', position: 0, createdAt: '1' },
    ];
    ok(await rejects(async () => resolveTaskMilestone(undefined, { projectId: 'A', projectMilestoneId: 'b1' }, ms)) instanceof ProjectMilestoneError, 'Rule: a milestone of another project is rejected');
    ok(await rejects(async () => resolveTaskMilestone(undefined, { projectMilestoneId: 'a1' }, ms)) instanceof ProjectMilestoneError, 'Rule: a milestone without a project is rejected');
    ok(await rejects(async () => resolveTaskMilestone(undefined, { projectId: 'A', projectMilestoneId: 'gone' }, ms)) instanceof ProjectMilestoneError, 'Rule: an unknown milestone is rejected');
    ok(resolveTaskMilestone({ projectId: 'A', projectMilestoneId: 'a1' }, { projectId: 'B' }, ms).projectMilestoneId === undefined
       && 'projectMilestoneId' in resolveTaskMilestone({ projectId: 'A', projectMilestoneId: 'a1' }, { projectId: 'B' }, ms), 'Rule: a project change clears an incompatible milestone');
    ok(!('projectMilestoneId' in resolveTaskMilestone({ projectId: 'A', projectMilestoneId: 'a1' }, { projectId: 'A', title: 'x' } as Partial<Task>, ms)), 'Rule: re-sending the same project keeps the milestone');
    ok(!('projectMilestoneId' in resolveTaskMilestone({ projectId: 'A', projectMilestoneId: 'a1' }, { title: 'x' } as Partial<Task>, ms)), 'Rule: unrelated edits do not touch the milestone');
    ok(findProjectMilestoneProblems({ projects: [{ id: 'A', name: 'A', status: 'active', createdAt: '1' }], projectMilestones: [ms[0]], tasks: [] }).length === 0
       && findProjectMilestoneProblems({ projects: [], projectMilestones: [ms[0]], tasks: [] }).length === 1, 'Rule: an orphan milestone in an import is detected');
  }

  /* ================================================================ */
  /* App level: DataProvider + UI on local storage                     */
  /* ================================================================ */
  let ctx: ReturnType<typeof useData> | null = null;
  const Probe = () => { ctx = useData(); return null; };
  const c = () => ctx!;
  const run = (fn: () => Promise<unknown>) => act(async () => { await fn(); });
  let root: import('react-dom/client').Root | null = null;
  const mount = async (extra?: React.ReactNode) => {
    if (root) await act(async () => root!.unmount());
    document.body.innerHTML = '';
    const el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
    ctx = null;
    await act(async () => {
      root!.render(React.createElement(AuthProvider, null,
        React.createElement(DataProvider, null, React.createElement(React.Fragment, null, React.createElement(Probe), extra ?? null))));
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
  };
  const click = async (element: Element | null | undefined, what: string) => {
    if (!element) throw new Error(`Missing UI control: ${what}`);
    await act(async () => {
      element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 15));
    });
  };
  const choose = async (select: HTMLSelectElement, value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value')!.set!.call(select, value);
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
  };
  const type = async (input: HTMLInputElement, value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
  };
  const fieldSelect = (label: string) =>
    Array.from(document.querySelectorAll('label')).find((l) => l.querySelector('span')?.textContent === label)?.querySelector('select') as HTMLSelectElement | undefined;
  const button = (text: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  const persisted = () => new LocalRepository(dom.window.localStorage).exportData();

  section('5–12. Project milestones through the app (DataProvider, local storage)');
  dom.window.localStorage.clear();
  dom.window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyBlob()));
  await mount();
  ok(c().ready && c().projectMilestonesEnabled, 'App: local storage always supports Project Milestones');
  ok(sameRecords(c().data.learnings), '1 (app): the app shows the 56 legacy records as learnings');

  // 12 (first half). Goal → Project → Task still works.
  let goalId = '', projectA = '', projectB = '';
  await run(async () => { goalId = (await c().actions.addGoal({ name: 'Ship v2' })).id; });
  await run(async () => { projectA = (await c().actions.addProject({ name: 'Website', goalId })).id; });
  await run(async () => { projectB = (await c().actions.addProject({ name: 'Book' })).id; });
  let plain!: Task;
  await run(async () => { plain = await c().actions.addTask({ title: 'Plain project task', projectId: projectA }); });
  ok(plain.projectId === projectA && plain.projectMilestoneId === undefined, '7: a task in a project without a milestone works');
  ok(projectProgress(c().data.tasks, projectA).total === 1 && goalProgress(c().data.tasks, c().data.projects, goalId).total === 1,
     '12: Goal → Project → Task progress works as before');

  // 5 + 6. Create project milestones.
  let m1 = '', m2 = '', mB = '';
  await run(async () => { m1 = (await c().actions.addProjectMilestone({ projectId: projectA, name: 'Design' })).id; });
  await run(async () => { m2 = (await c().actions.addProjectMilestone({ projectId: projectA, name: 'Launch', targetDate: '2026-12-01' })).id; });
  await run(async () => { mB = (await c().actions.addProjectMilestone({ projectId: projectB, name: 'Draft' })).id; });
  const msA = c().data.projectMilestones.filter((m) => m.projectId === projectA);
  ok(msA.length === 2 && msA.find((m) => m.id === m1)?.position === 0 && msA.find((m) => m.id === m2)?.position === 1,
     '5: project milestones can be created, appended in order (positions 0, 1)');
  ok(c().data.projectMilestones.find((m) => m.id === mB)?.projectId === projectB && c().data.projectMilestones.find((m) => m.id === m1)?.projectId === projectA,
     '6: each milestone belongs to its project');
  ok(await rejects(() => c().actions.addProjectMilestone({ projectId: 'no-such-project', name: 'Orphan' })) instanceof ProjectMilestoneError,
     '6: a milestone for a project that does not exist is rejected');
  ok(await rejects(() => c().actions.addProjectMilestone({ projectId: projectA, name: '   ' })) instanceof ProjectMilestoneError, '6: a blank milestone name is rejected');
  ok(await rejects(() => new LocalRepository(dom.window.localStorage).projectMilestones.update(m1, { projectId: projectB })) instanceof ProjectMilestoneError,
     '6: a milestone cannot be moved to another project');
  ok((await persisted()).projectMilestones.length === 3 && (await persisted()).learnings.length === 56, '5: milestones persist next to the untouched learnings');

  // 8. A task with a milestone.
  let inM1!: Task;
  await run(async () => { inM1 = await c().actions.addTask({ title: 'Wireframes', projectId: projectA, projectMilestoneId: m1 }); });
  ok(inM1.projectMilestoneId === m1 && (await persisted()).tasks.find((t) => t.id === inM1.id)?.projectMilestoneId === m1,
     '8: a task with a project milestone is created and persisted');

  // 9. Cross-project milestones are rejected — through the app and directly at the repository.
  const countBefore = c().data.tasks.length;
  const crossCreate = await rejects(() => c().actions.addTask({ title: 'Wrong', projectId: projectA, projectMilestoneId: mB }));
  ok(crossCreate instanceof ProjectMilestoneError && c().data.tasks.length === countBefore, '9: creating a task with another project\u2019s milestone is rejected (nothing created)');
  const crossUpdate = await rejects(() => c().actions.updateTask(inM1.id, { projectMilestoneId: mB }));
  ok(crossUpdate instanceof ProjectMilestoneError && c().data.tasks.find((t) => t.id === inM1.id)?.projectMilestoneId === m1,
     '9: assigning another project\u2019s milestone to an existing task is rejected (unchanged)');
  ok(await rejects(() => c().actions.addTask({ title: 'No project', projectMilestoneId: m1 })) instanceof ProjectMilestoneError,
     '9: a milestone without a project is rejected');
  ok(await rejects(() => new LocalRepository(dom.window.localStorage).tasks.update(inM1.id, { projectMilestoneId: mB })) instanceof ProjectMilestoneError,
     '9: the local repository itself refuses the invalid pair (the foreign-key role)');

  // 10. Changing the project clears an incompatible milestone.
  let mover!: Task;
  await run(async () => { mover = await c().actions.addTask({ title: 'Mover', projectId: projectA, projectMilestoneId: m2 }); });
  await run(() => c().actions.updateTask(mover.id, { projectId: projectA, title: 'Mover (renamed)' }));
  ok(c().data.tasks.find((t) => t.id === mover.id)?.projectMilestoneId === m2, '10: re-saving with the same project keeps the milestone');
  await run(() => c().actions.updateTask(mover.id, { projectId: projectB }));
  ok(c().data.tasks.find((t) => t.id === mover.id)?.projectMilestoneId === undefined
     && (await persisted()).tasks.find((t) => t.id === mover.id)?.projectMilestoneId === undefined,
     '10: moving the task to another project clears the incompatible milestone (memory and storage)');
  await run(() => c().actions.updateTask(mover.id, { projectId: projectA, projectMilestoneId: m2 }));
  await run(() => c().actions.setTaskProject(mover.id, undefined));
  ok(c().data.tasks.find((t) => t.id === mover.id)?.projectMilestoneId === undefined, '10: removing the project (setTaskProject) clears the milestone too');

  // Break down keeps the milestone.
  let pieces: Task[] = [];
  await run(async () => { pieces = await c().actions.breakDownTask(inM1.id, ['Sketch', 'Review']); });
  ok(pieces.length === 2 && pieces.every((t) => t.projectId === projectA && t.projectMilestoneId === m1), 'Breaking a task down keeps its project and milestone');

  // Reorder.
  await run(() => c().actions.reorderProjectMilestones(projectA, [m2, m1]));
  const reordered = (await persisted()).projectMilestones.filter((m) => m.projectId === projectA).sort((a, b) => a.position - b.position).map((m) => m.id);
  ok(reordered.join() === [m2, m1].join(), 'Reorder: positions are rewritten and persisted (Launch before Design)');
  ok(await rejects(() => c().actions.reorderProjectMilestones(projectA, [m2, mB])) instanceof ProjectMilestoneError, 'Reorder: another project\u2019s milestone cannot be pulled in');

  // 11. Deleting a milestone clears references and keeps the tasks.
  const tasksBefore = c().data.tasks.length;
  const inM1Ids = c().data.tasks.filter((t) => t.projectMilestoneId === m1).map((t) => t.id);
  await run(() => c().actions.deleteProjectMilestone(m1));
  const store11 = await persisted();
  ok(inM1Ids.length === 3 && c().data.tasks.length === tasksBefore && store11.tasks.length === tasksBefore,
     '11: deleting a milestone deletes no task');
  ok(inM1Ids.every((id) => store11.tasks.find((t) => t.id === id)?.projectMilestoneId === undefined && store11.tasks.find((t) => t.id === id)?.projectId === projectA)
     && inM1Ids.every((id) => c().data.tasks.find((t) => t.id === id)?.projectMilestoneId === undefined),
     '11: its tasks stay in the project with no milestone (memory and storage)');
  ok(!store11.projectMilestones.some((m) => m.id === m1), '11: the milestone itself is gone');

  // 12 (second half). Deleting a project keeps tasks, removes its milestones.
  let inB!: Task;
  await run(async () => { inB = await c().actions.addTask({ title: 'Chapter 1', projectId: projectB, projectMilestoneId: mB }); });
  await run(() => c().actions.deleteProject(projectB));
  const store12 = await persisted();
  ok(c().data.tasks.find((t) => t.id === inB.id)?.projectId === undefined && c().data.tasks.find((t) => t.id === inB.id)?.projectMilestoneId === undefined
     && store12.tasks.some((t) => t.id === inB.id) && store12.tasks.find((t) => t.id === inB.id)?.projectMilestoneId === undefined,
     '12: deleting a project keeps its tasks (existing behaviour) and clears their milestone');
  ok(!store12.projectMilestones.some((m) => m.projectId === projectB), '12: the deleted project\u2019s milestones are removed with it');
  ok(sameRecords(store12.learnings), '4 (app): after all of the above, the 56 learnings in storage are still identical');

  // Reload keeps everything.
  await mount();
  ok(c().data.projectMilestones.some((m) => m.id === m2) && c().data.tasks.find((t) => t.id === mover.id) !== undefined && sameRecords(c().data.learnings),
     'Reload: milestones, tasks and learnings all survive');

  // Export / import round trip through the app.
  const appExport = await c().actions.exportData();
  ok(!('milestones' in appExport) && appExport.learnings.length === 56 && appExport.projectMilestones.length === 1, '3 (app): the app\u2019s export carries learnings + projectMilestones only');
  await run(() => c().actions.importData(appExport));
  ok(c().data.projectMilestones.length === 1 && sameRecords(c().data.learnings), 'Import of a new export restores milestones and learnings');
  const badImport = await rejects(() => c().actions.importData({ ...appExport, tasks: [...appExport.tasks, { ...appExport.tasks[0], id: 'bad', projectId: undefined, projectMilestoneId: m2 }] }));
  ok(badImport instanceof ProjectMilestoneError && (await persisted()).tasks.every((t) => t.id !== 'bad'), 'An inconsistent import is refused and changes nothing');

  /* ================================================================ */
  /* 10 (UI). The task form's milestone selector                       */
  /* ================================================================ */
  section('10. Task form milestone selector');
  const formHost = () => React.createElement(TaskFormModal, { open: true, onClose: () => {} });
  await mount(formHost());
  const projectSelect = fieldSelect('Project')!;
  const milestoneSelect = () => fieldSelect('Milestone')!;
  ok(projectSelect && milestoneSelect(), 'Form: the Milestone field renders next to Project');
  ok(milestoneSelect().disabled && milestoneSelect().value === '' && milestoneSelect().options[0].textContent === 'No milestone',
     'Form: with no project the milestone select is disabled at "No milestone"');
  const extra = await (async () => { let id = ''; await run(async () => { id = (await c().actions.addProjectMilestone({ projectId: projectA, name: 'QA' })).id; }); return id; })();
  await choose(projectSelect, projectA);
  const offered = Array.from(milestoneSelect().options).map((o) => o.value);
  ok(!milestoneSelect().disabled && offered.join() === ['', m2, extra].join(),
     'Form: choosing a project offers "No milestone" plus only that project\u2019s milestones, in order');
  await choose(milestoneSelect(), extra);
  ok(milestoneSelect().value === extra, 'Form: a milestone can be chosen');
  let projectC = '';
  await run(async () => { projectC = (await c().actions.addProject({ name: 'Garden' })).id; });
  await choose(projectSelect, projectC);
  ok(milestoneSelect().value === '' && Array.from(milestoneSelect().options).length === 1, 'Form: switching project resets the milestone (the new project has none)');
  await choose(projectSelect, projectA);
  await choose(milestoneSelect(), extra);
  const titleInput = document.querySelector('input[placeholder="What needs to be done?"]') as HTMLInputElement;
  await type(titleInput, 'Made in the form');
  await click(button('Add task'), 'Add task');
  const formTask = c().data.tasks.find((t) => t.title === 'Made in the form');
  ok(formTask?.projectId === projectA && formTask.projectMilestoneId === extra, 'Form: saving stores the selected project and milestone');
  await choose(projectSelect, '');
  ok(milestoneSelect().disabled && milestoneSelect().value === '', 'Form: clearing the project disables and resets the milestone');

  /* ================================================================ */
  /* Projects screen                                                    */
  /* ================================================================ */
  section('Project view');
  await mount(React.createElement(ProjectsScreen));
  const websiteCard = Array.from(document.querySelectorAll('h3')).find((h) => h.textContent === 'Website')?.closest('.rounded-2xl');
  await click(websiteCard?.querySelector('button[aria-label="Expand project"]'), 'Expand project');
  const sections = Array.from(document.querySelectorAll('section[aria-label^="Milestone: "]')).map((s) => s.getAttribute('aria-label'));
  ok(sections.join('|') === 'Milestone: Launch|Milestone: QA', `Project view: milestones are listed in manual order (${sections.join(', ')})`);
  ok(document.querySelector('section[aria-label="Tasks without a milestone"]')?.textContent?.includes('Plain project task'),
     'Project view: tasks without a milestone are listed under "No milestone"');
  ok(document.body.textContent?.includes(`Target ${formatShortDate('2026-12-01')}`) && button('Add milestone') !== undefined && button('Add task to project') !== undefined,
     'Project view: target date, "Add milestone" and "Add task to project" are shown');
  ok(!/\d+%/.test(document.querySelector('section[aria-label="Milestone: Launch"]')?.textContent ?? ''), 'Project view: no completion percentage or status is invented for milestones');

  /* ================================================================ */
  /* Learnings UI, navigation and the old route                         */
  /* ================================================================ */
  section('Learnings screen, navigation and /milestones');
  await mount(React.createElement(LearningsScreen));
  const text = document.body.textContent ?? '';
  ok(document.querySelector('h1')?.textContent === 'Learnings' && button('New Learning') !== undefined, 'Learnings: the screen is titled "Learnings" with a "New Learning" action');
  ok(!/Milestone/i.test(Array.from(document.querySelectorAll('h1,h2,button')).map((e) => e.textContent).join(' ')), 'Learnings: no "Milestone" wording left in its headings and buttons');
  const groups = groupLearnings(c().data.learnings);
  ok(groups[0].year === 2026 && text.includes(`${groups[0].count} learnings`) && text.includes('Sometime that year'), 'Learnings: Year → Month grouping (with honest year-only bucket) is intact');
  ok(text.includes(formatLearningDate('2015')) && text.includes('28 Feb 2025') && text.includes('September 2026'), 'Learnings: partial dates display at their own precision');
  ok(text.includes('56 total'), 'Learnings: the 56 records are all shown');
  await type(document.querySelector('input[placeholder="Search…"]') as HTMLInputElement, 'React');
  const cards = Array.from(document.querySelectorAll('h3')).map((h) => h.textContent);
  const expectedHits = fixture.filter((l) => `${l.title} ${l.description ?? ''}`.toLowerCase().includes('react'));
  ok(cards.length === expectedHits.length && cards.includes('React.js') && cards.length < 56,
     `Learnings: search filters the timeline (${cards.length} of 56 match "React")`);
  const categorySelect = Array.from(document.querySelectorAll('select')).find((s) => s.querySelector('option[value="all"]')) as HTMLSelectElement;
  await type(document.querySelector('input[placeholder="Search…"]') as HTMLInputElement, '');
  await choose(categorySelect, 'habit');
  const habitTitles = Array.from(document.querySelectorAll('h3')).map((h) => h.textContent);
  ok(habitTitles.length === fixture.filter((l) => l.category === 'habit').length, 'Learnings: the category filter works');
  await choose(categorySelect, 'all');
  await click(Array.from(document.querySelectorAll('button[aria-label="Learning actions"]'))[0], 'Learning actions');
  ok(button('Edit…') !== undefined && Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.includes('Delete')), 'Learnings: edit and delete are still offered');

  const nav = NAV_ITEMS.map((i) => `${i.href}:${i.label}`);
  ok(nav.includes('/learnings:Learnings') && !nav.some((n) => /milestone/i.test(n)), 'Navigation: "Milestones" became "Learnings" (/learnings)');
  ok(nav.indexOf('/learnings:Learnings') === 7, 'Navigation: the entry keeps its place in the menu');
  const nextConfig = (await import('../next.config')).default;
  const redirects = await nextConfig.redirects!();
  ok(redirects.some((r) => r.source === '/milestones' && r.destination === '/learnings' && r.permanent === false),
     'Route: /milestones redirects to /learnings (307, so it is not cached forever)');
  ok(redirects.some((r) => r.source === '/curious' && r.destination === '/curiosity'), 'Route: the existing /curious redirect is unchanged');
  ok(existsSync(join(process.cwd(), 'app/learnings/page.tsx')) && !existsSync(join(process.cwd(), 'app/milestones')), 'Route: app/learnings exists; the old page file moved (the redirect serves /milestones)');

  /* ================================================================ */
  /* Security + one source of truth (static checks)                     */
  /* ================================================================ */
  section('Security and single source of truth');
  const sourceFiles = (dir: string): string[] => readdirSync(join(process.cwd(), dir)).flatMap((f) => {
    const p = join(dir, f);
    return statSync(join(process.cwd(), p)).isDirectory() ? sourceFiles(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
  const appSources = [...sourceFiles('app'), ...sourceFiles('components'), ...sourceFiles('lib')];
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
  ok(!appSources.some((p) => /service_role|SERVICE_ROLE/.test(read(p))), 'No service-role key or reference anywhere in app code');
  ok(appSources.filter((p) => p.startsWith('components/')).every((p) =>
       !/(getSupabaseBrowserClient\(\)|\bclient|\bsupabase)\.from\(|createClient\(|pace\.db\.v1|STORAGE_KEY/.test(read(p))),
     'No component queries Supabase tables or pace.db.v1 directly — data goes through the repository (auth-provider only signs in/out)');
  ok(appSources.filter((p) => read(p).includes('normalizeAppData(')).sort().join() === ['lib/store/local-repository.ts', 'lib/store/normalize.ts', 'lib/store/supabase-repository.ts'].join(),
     'One migration path: normalizeAppData is defined once and used only by the two repositories');
  // The *table* name, not any occurrence of the word: `lib/project-plan.ts`
  // legitimately spells 'milestones' as a field of the project-plan JSON
  // format (projects[].milestones), which has nothing to do with the table.
  const spellsTableName = (src: string) =>
    /(?:TABLE\s*=|\.from\(|\bclear\(|\bpost\(|\bget\(|\bupsert\(|\bdelete\(|\bpatchWhere\()\s*['"]milestones['"]/.test(src);
  ok(appSources.filter((p) => spellsTableName(read(p))).join() === 'lib/store/supabase-repository.ts',
     'The legacy table name `milestones` is spelled in exactly one place (LEARNINGS_TABLE)');
  ok(!/\bMilestone\b(?!s)/.test(read('lib/types.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')),
     'No ambiguous `Milestone` type remains — Learning and ProjectMilestone are distinct');

  if (root) await act(async () => root!.unmount());
  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nLearnings + Project Milestones verified.');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
