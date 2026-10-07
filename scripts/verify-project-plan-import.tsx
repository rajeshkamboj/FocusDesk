/**
 * Phase 4 — the ChatGPT project plan importer, verified headlessly.
 *
 * Exercises the real code paths, never a copy of them:
 *   - lib/project-plan.ts for parsing, validation, resolution and preview;
 *   - LocalRepository over an in-memory StorageLike;
 *   - SupabaseRepository + the real supabase-js SDK against a fake PostgREST
 *     at the fetch boundary (an unmigrated and a migrated schema, and a
 *     deliberately failing insert to prove the rollback) — no request can
 *     reach a real Supabase project;
 *   - DataProvider + the real Settings screen and importer modal in jsdom;
 *   - fixtures/focusdesk-project-plan-v1.json, read from disk.
 *
 * The numbered assertions match the Phase 4 test list (1–24).
 *
 * Run: npm i --no-save jsdom tsx && npx tsx scripts/verify-project-plan-import.tsx
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = dom.window; g.document = dom.window.document; g.localStorage = dom.window.localStorage;
// The importer reads a chosen file with FileReader, and the result panel links
// to /projects with next/link (which reaches for `self`). Both are ordinary
// browser globals that jsdom provides on its window but not on Node's.
g.self = dom.window;
g.FileReader = dom.window.FileReader;
g.File = dom.window.File;
g.Blob = dom.window.Blob;
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
 * A tiny PostgREST stand-in: tables with a fixed column set, `eq`/`in`
 * filters, `order`, `limit`, insert/update/delete/upsert, PostgREST's real
 * error codes for a missing table or column — and a `fail` hook so one request
 * can be made to fail on purpose. Every request is logged.
 */
function fakePostgrest(schema: Record<string, string[]>) {
  const tables = new Map(Object.entries(schema).map(([name, cols]) => [name, { columns: new Set(cols), rows: [] as Row[] }]));
  const log: { method: string; table: string; query: URLSearchParams; body?: unknown }[] = [];
  const server = {
    tables,
    log,
    /** Set to make matching requests fail with a 500, e.g. to test a rollback. */
    fail: null as null | ((method: string, table: string) => boolean),
    fetch: null as unknown as (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  };
  const err = (status: number, code: string, message: string) =>
    Response.json({ code, details: null, hint: null, message }, { status });

  server.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const table = url.pathname.replace(/^\/rest\/v1\//, '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    log.push({ method, table, query: url.searchParams, body });
    const t = tables.get(table);
    if (!t) return err(404, 'PGRST205', `Could not find the table 'public.${table}' in the schema cache`);
    if (server.fail && server.fail(method, table)) return err(500, 'XX000', 'injected failure');

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
  return server;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { act } = React;
  const { createClient } = await import('@supabase/supabase-js');
  const { LocalRepository, STORAGE_KEY, createId } = await import('../lib/store/local-repository');
  const { SupabaseRepository, LEARNINGS_TABLE, PROJECT_MILESTONES_TABLE } = await import('../lib/store/supabase-repository');
  const { defaultSettings } = await import('../lib/store/defaults');
  const { LEARNING_SEED } = await import('../lib/learnings-seed');
  const { parseLearnings } = await import('../lib/learnings-import');
  const { findProjectMilestoneProblems } = await import('../lib/project-milestones');
  const {
    PROJECT_PLAN_FORMAT,
    PROJECT_PLAN_VERSION,
    PROJECT_PLAN_LIMITS,
    ProjectPlanError,
    buildProjectPlanRecords,
    findProjectPlanNameClashes,
    findProjectPlanProblems,
    isProjectPlanPayload,
    previewOf,
    projectPlanTreeLines,
    reviewProjectPlan,
    reviewProjectPlanText,
    stripCodeFence,
  } = await import('../lib/project-plan');
  type Learning = import('../lib/types').Learning;
  type AppData = import('../lib/types').AppData;
  type ResolvedProjectPlan = import('../lib/project-plan').ResolvedProjectPlan;

  /** A fixed "today", so past-date warnings do not depend on the run date. */
  const TODAY = '2026-10-07';
  const review = (plan: unknown, options: { projectMilestonesAvailable?: boolean } = {}) =>
    reviewProjectPlan(plan, { today: TODAY, ...options });
  const reviewText = (text: string, options: { projectMilestonesAvailable?: boolean } = {}) =>
    reviewProjectPlanText(text, { today: TODAY, ...options });
  /** A valid plan, one field changed — the quickest way to build a bad one. */
  const envelope = (extra: Row = {}) => ({ format: PROJECT_PLAN_FORMAT, version: PROJECT_PLAN_VERSION, ...extra });
  const hasError = (result: { errors: { message: string }[] }, fragment: string) =>
    result.errors.some((e) => e.message.toLowerCase().includes(fragment.toLowerCase()));

  /* ================================================================ */
  /* Fixtures: the world that already exists                            */
  /* ================================================================ */
  // 49 learnings from the real starter timeline plus 7 more — the production
  // count of 56, with the same record shape Phase 3 verified.
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
  const learningsFixture: Learning[] = [...fromSeed, ...more].map((l, i) => {
    const rec: Record<string, unknown> = { id: learningId(i), title: l.title, category: l.category ?? 'other' };
    if (l.description) rec.description = l.description;
    rec.date = l.date;
    rec.createdAt = new Date(Date.UTC(2026, 9, 1, 8, 0, i)).toISOString();
    return rec as unknown as Learning;
  });

  /** The records that must survive every import in this file untouched. */
  const existing = {
    goals: [{ id: 'g-existing', name: 'Existing goal', status: 'active' as const, createdAt: '2026-09-01T09:00:00.000Z' }],
    projects: [
      { id: 'p-existing', name: 'Existing Project', description: 'Do not touch', goalId: 'g-existing', deadline: '2026-12-01', status: 'active' as const, createdAt: '2026-09-02T09:00:00.000Z' },
      { id: 'p-clash', name: 'Cambuz PDF Reader', status: 'active' as const, createdAt: '2026-09-03T09:00:00.000Z' },
    ],
    projectMilestones: [
      { id: 'm-existing', projectId: 'p-existing', name: 'Existing milestone', targetDate: '2026-11-01', position: 0, createdAt: '2026-09-04T09:00:00.000Z' },
    ],
    tasks: [
      { id: 't-existing', title: 'Existing task', status: 'created' as const, priority: 'medium' as const, projectId: 'p-existing', projectMilestoneId: 'm-existing', createdAt: '2026-09-05T09:00:00.000Z', tags: ['keep'], postponementCount: 0, archived: false },
      { id: 't-timed', title: 'Existing timed task', status: 'in_progress' as const, priority: 'high' as const, createdAt: '2026-09-06T09:00:00.000Z', actualDurationSeconds: 1234, startedAt: '2026-10-07T08:00:00.000Z', tags: [], postponementCount: 2, archived: false },
    ],
  };

  const legacyBlob = (extra: Record<string, unknown> = {}) => ({
    tasks: JSON.parse(JSON.stringify(existing.tasks)),
    subtasks: [],
    projects: JSON.parse(JSON.stringify(existing.projects)),
    goals: JSON.parse(JSON.stringify(existing.goals)),
    inbox: [],
    ideas: [],
    learnings: JSON.parse(JSON.stringify(learningsFixture)),
    projectMilestones: JSON.parse(JSON.stringify(existing.projectMilestones)),
    dailyPriorities: [],
    weeklyPriorities: [],
    monthlyPriorities: [],
    taskHistory: [],
    wellbeingDays: [],
    timerSessions: [],
    settings: defaultSettings,
    ...extra,
  });

  /** Fingerprints, so "unchanged" is proved rather than assumed. */
  const fingerprint = <T,>(list: T[]) => md5(JSON.stringify([...list].sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1))));
  const before = {
    learnings: fingerprint(learningsFixture),
    goals: fingerprint(existing.goals),
    projects: fingerprint(existing.projects),
    milestones: fingerprint(existing.projectMilestones),
    tasks: fingerprint(existing.tasks),
  };
  /** Only the records that existed before the import, however many were added. */
  const unchanged = (data: Pick<AppData, 'learnings' | 'goals' | 'projects' | 'projectMilestones' | 'tasks'>) =>
    fingerprint(data.learnings) === before.learnings &&
    fingerprint(data.goals.filter((g) => g.id === 'g-existing')) === before.goals &&
    fingerprint(data.projects.filter((p) => p.id === 'p-existing' || p.id === 'p-clash')) === before.projects &&
    fingerprint(data.projectMilestones.filter((m) => m.id === 'm-existing')) === before.milestones &&
    fingerprint(data.tasks.filter((t) => t.id === 't-existing' || t.id === 't-timed')) === before.tasks;

  section('Fixture');
  ok(learningsFixture.length === 56 && new Set(learningsFixture.map((l) => l.id)).size === 56, 'Fixture: 56 learnings with 56 unique ids (the production count)');
  ok(createId() !== createId() && UUID.test(createId()), 'Fixture: the app\u2019s own id generator produces unique UUIDs');

  /* ================================================================ */
  /* 1–8. The format: valid plans                                       */
  /* ================================================================ */
  section('1. A simple project import is valid');
  {
    const result = review(envelope({ projects: [{ name: 'Kitchen rebuild', tasks: [{ title: 'Order the sink' }] }] }));
    ok(result.ok && result.errors.length === 0, '1: a project with one task validates');
    ok(result.counts.projects === 1 && result.counts.tasks === 1 && result.counts.goals === 0 && result.counts.projectMilestones === 0,
       '1: the counts are 0 goals / 1 project / 0 milestones / 1 task');
    ok(result.plan!.tasks[0].status === 'created' && result.plan!.tasks[0].priority === 'medium',
       '1: an unstated status and priority default to created / medium');
    ok(result.warnings.every((w) => /no goal|no milestone/i.test(w.message)) && result.warnings.length === 2,
       '1: the only warnings are the missing goal and the milestone-less task');
  }

  section('2. Goal \u2192 Project \u2192 Milestone \u2192 Task');
  {
    const result = review(envelope({
      goal: { name: 'Build PatientScure', description: 'Grow it', deadline: '2026-12-31' },
      projects: [{
        id: 'p1',
        name: 'PatientScure Website',
        deadline: '2026-12-31',
        status: 'active',
        milestones: [{ id: 'm1', name: 'Foundation', targetDate: '2026-10-15', tasks: [{ id: 't1', title: 'Set up project structure', dueDate: '2026-10-10' }] }],
        tasks: [{ title: 'General project task' }],
      }],
    }));
    ok(result.ok, '2: the full hierarchy validates');
    const built = buildProjectPlanRecords(result.plan!, { newId: createId, now: () => '2026-10-07T10:00:00.000Z' });
    ok(built.goals.length === 1 && built.projects.length === 1 && built.projectMilestones.length === 1 && built.tasks.length === 2,
       '2: it resolves to 1 goal, 1 project, 1 milestone, 2 tasks');
    ok(built.projects[0].goalId === built.goals[0].id, '2: the project is linked to the imported goal');
    ok(built.projectMilestones[0].projectId === built.projects[0].id, '2: the milestone is linked to its project');
    const inMilestone = built.tasks.find((t) => t.title === 'Set up project structure')!;
    const direct = built.tasks.find((t) => t.title === 'General project task')!;
    ok(inMilestone.projectMilestoneId === built.projectMilestones[0].id && inMilestone.projectId === built.projects[0].id,
       '2: a milestone task carries both its milestone and its project');
    ok(direct.projectId === built.projects[0].id && direct.projectMilestoneId === undefined,
       '3: a project task outside a milestone has the project and no milestone');
    ok(built.tasks.every((t) => t.goalId === undefined), '2: tasks are not given a goalId the plan never asked for');
    ok(built.goals[0].deadline === '2026-12-31' && built.projects[0].deadline === '2026-12-31' && built.projectMilestones[0].targetDate === '2026-10-15' && inMilestone.dueDate === '2026-10-10',
       '2: every date survives exactly as written');
    ok(findProjectMilestoneProblems({ projects: built.projects, projectMilestones: built.projectMilestones, tasks: built.tasks }).length === 0,
       '2: the created records satisfy the app-wide project-milestone invariant');
  }

  section('4. Tasks with no project');
  {
    const result = review(envelope({ tasks: [{ title: 'Review documentation' }, { title: 'Call the dentist', priority: 'high', dueDate: '2026-11-02' }] }));
    ok(result.ok && result.counts.tasks === 2 && result.counts.projects === 0, '4: a plan of loose tasks only is valid');
    const built = buildProjectPlanRecords(result.plan!, { newId: createId, now: () => '2026-10-07T10:00:00.000Z' });
    ok(built.tasks.every((t) => t.projectId === undefined && t.projectMilestoneId === undefined), '4: they get no project and no milestone');
    ok(built.tasks[1].priority === 'high' && built.tasks[1].dueDate === '2026-11-02', '4: their fields are kept');
    ok(result.preview!.tasks.length === 2 && result.preview!.projects.length === 0, '4: the preview lists them under "tasks without a project"');
  }

  section('5–7. Several projects, several milestones, positions from the JSON order');
  {
    const result = review(envelope({
      projects: [
        { id: 'a', name: 'Project A', milestones: [
          { name: 'A one', targetDate: '2027-05-01' },                       // later date, first position
          { name: 'A two', targetDate: '2026-11-01' },
          { name: 'A three' },
        ], tasks: [{ title: 'A loose task' }] },
        { id: 'b', name: 'Project B', milestones: [{ name: 'B one' }, { name: 'B two' }] },
      ],
      projectMilestones: [{ projectId: 'a', name: 'A four (flat)' }, { projectId: 'b', name: 'B three (flat)' }],
    }));
    ok(result.ok && result.counts.projects === 2 && result.counts.projectMilestones === 7,
       '5: two projects validate, with their five nested milestones plus the two flat ones');
    const positions = (project: string) => result.plan!.projectMilestones.filter((m) => m.projectTempId === project).map((m) => [m.name, m.position]);
    ok(JSON.stringify(positions('a')) === JSON.stringify([['A one', 0], ['A two', 1], ['A three', 2], ['A four (flat)', 3]]),
       '7: positions follow the JSON order (0,1,2,3) \u2014 never the target dates, which are the other way round');
    ok(JSON.stringify(positions('b')) === JSON.stringify([['B one', 0], ['B two', 1], ['B three (flat)', 2]]),
       '7: each project numbers its own milestones from 0');
    const preview = result.preview!;
    ok(preview.projects[0].milestones.map((m) => m.name).join('|') === 'A one|A two|A three|A four (flat)'
       && preview.projects[0].tasks.length === 1 && preview.projects[1].milestones.length === 3,
       '6: the preview keeps the milestones in that order, per project');
    const lines = projectPlanTreeLines(preview);
    ok(lines[0] === 'Project A' && lines.includes('Project B') && lines.includes('└── A loose task')
       && lines.includes('├── A four (flat) — 0 tasks'),
       '6: the text tree shows both projects, their milestones (nested and flat) and the loose project task');
  }

  section('8. Temporary ids are import-only');
  {
    const plan = review(envelope({
      projects: [{
        id: 'p1',
        name: 'Site',
        milestones: [{ id: 'm1', name: 'Foundation', tasks: [{ id: 't1', title: 'In the milestone' }] }],
        tasks: [{ id: 't2', title: 'Joined by reference', milestoneId: 'm1' }, { title: 'No id at all' }],
      }],
    })).plan!;
    const built = buildProjectPlanRecords(plan, { newId: createId, now: () => '2026-10-07T10:00:00.000Z' });
    const ids = [...built.projects.map((r) => r.id), ...built.projectMilestones.map((r) => r.id), ...built.tasks.map((r) => r.id)];
    ok(ids.every((id) => UUID.test(id)) && new Set(ids).size === ids.length, '8: every record gets a fresh FocusDesk UUID');
    ok(!ids.some((id) => ['p1', 'm1', 't1', 't2'].includes(id)), '8: no temporary id becomes a primary key');
    ok(built.idOf.get('m1') === built.projectMilestones[0].id && built.idOf.get('p1') === built.projects[0].id,
       '8: the temporary \u2192 real map covers projects and milestones');
    const joined = built.tasks.find((t) => t.title === 'Joined by reference')!;
    ok(joined.projectMilestoneId === built.idOf.get('m1') && joined.projectId === built.idOf.get('p1'),
       '8: a reference by temporary id resolves to the real milestone and project');
    ok(built.tasks.find((t) => t.title === 'In the milestone')!.projectMilestoneId === built.idOf.get('m1'),
       '8: a task nested in a milestone needs no id at all');
    ok(built.tasks.every((t) => t.createdAt === '2026-10-07T10:00:00.000Z'), '8: one import shares one creation timestamp');
  }

  function hasWarnings(result: { warnings: { message: string }[] }) {
    return result.warnings.length > 0;
  }

  /* ================================================================ */
  /* 9–15. The format: refused plans                                    */
  /* ================================================================ */
  section('9. Invalid JSON');
  {
    ok(!reviewText('{ "format": "focusdesk-project-plan", ').ok && hasError(reviewText('{ "format": '), 'not valid JSON'), '9: truncated JSON is refused');
    ok(!reviewText('').ok && hasError(reviewText(''), 'paste a project plan'), '9: an empty paste is refused without being called invalid JSON');
    ok(!reviewText('[]').ok && hasError(reviewText('[]'), 'must be a JSON object'), '9: a JSON array is refused');
    ok(reviewText('```json\n' + JSON.stringify(envelope({ tasks: [{ title: 'Fenced' }] })) + '\n```').ok, '9: Markdown fences are stripped, not treated as invalid JSON');
    ok(stripCodeFence('```json\n{"a":1}\n```') === '{"a":1}', '9: stripCodeFence removes the wrapper only');
  }

  section('Envelope: format and version');
  {
    ok(!review({ version: 1, projects: [] }).ok && hasError(review({ version: 1 }), 'must be \u201cfocusdesk-project-plan\u201d'), 'Envelope: a missing format is refused');
    ok(!review({ format: 'focusdesk-plan', version: 1 }).ok, 'Envelope: a wrong format string is refused');
    ok(!review(envelope({ version: '1', tasks: [{ title: 'x' }] })).ok && hasError(review(envelope({ version: '1' })), 'must be the number 1'), 'Envelope: version "1" as a string is refused');
    ok(!review({ format: PROJECT_PLAN_FORMAT, tasks: [{ title: 'x' }] }).ok, 'Envelope: a missing version is refused');
    ok(!review(envelope({ version: 2, tasks: [{ title: 'x' }] })).ok && hasError(review(envelope({ version: 2 })), 'understands version 1 only'), 'Envelope: a future version is refused, not guessed at');
    const exportPayload = { tasks: [], projects: [], learnings: [], settings: {} };
    const refused = review(exportPayload);
    ok(!refused.ok && hasError(refused, 'looks like a FocusDesk data export'), 'Envelope: a data export is recognised and pointed at Import (JSON)');
    ok(isProjectPlanPayload(envelope({})) === true && isProjectPlanPayload(exportPayload) === false && isProjectPlanPayload(null) === false,
       'Envelope: isProjectPlanPayload tells a plan from a backup');
    ok(!review(envelope({ milestones: [{ title: 'React.js', date: '2025-02' }] })).ok && hasError(review(envelope({ milestones: [] })), 'means Learnings'),
       '17: a top-level `milestones` array is refused rather than read as Learnings or Project Milestones');
    const unknown = review(envelope({ generatedBy: 'ChatGPT', tasks: [{ title: 'x', owner: 'me' }] }));
    ok(unknown.ok && unknown.warnings.some((w) => w.message.includes('generatedBy')) && unknown.warnings.some((w) => w.message.includes('owner')),
       'Envelope: unsupported fields are reported as warnings and ignored');
    ok(review(envelope({ tasks: [{ title: 'x', goalId: 'g1' }] })).errors.some((e) => e.message.includes('goalId')), 'Envelope: goalId is an error, not a silently dropped field');
  }

  section('10. Missing required fields');
  {
    ok(!review(envelope({ projects: [{ description: 'no name' }] })).ok && hasError(review(envelope({ projects: [{}] })), 'project needs \u201cname\u201d'), '10: a project without a name is refused');
    ok(!review(envelope({ projects: [{ name: 'Site', tasks: [{ description: 'no title' }] }] })).ok && hasError(review(envelope({ projects: [{ name: 'S', tasks: [{}] }] })), 'task needs \u201ctitle\u201d'), '10: a task without a title is refused');
    ok(!review(envelope({ projects: [{ name: 'Site', milestones: [{ name: '   ' }] }] })).ok, '10: a blank milestone name is refused');
    ok(!review(envelope({ goal: { description: 'no name' } })).ok && hasError(review(envelope({ goal: {} })), 'goal needs \u201cname\u201d'), '10: a goal without a name is refused');
    ok(!review(envelope({ projects: [] })).ok && hasError(review(envelope({})), 'would create nothing'), '10: an empty plan is refused');
    ok(!review(envelope({ projects: ['not an object'] })).ok && hasError(review(envelope({ projects: ['x'] })), 'must be a JSON object'), '10: a project that is not an object is refused');
    ok(!review(envelope({ projects: [{ name: 'S', tasks: 'nope' }] })).ok && hasError(review(envelope({ projects: [{ name: 'S', tasks: 'x' }] })), '\u201ctasks\u201d must be an array'), '10: tasks that are not an array are refused');
    ok(!review(envelope({ projects: [{ name: 'S', tasks: [{ title: 'x', tags: 'one' }] }] })).ok, '10: tags that are not an array are refused');
    ok(!review(envelope({ projects: [{ name: 'S', tasks: [{ title: 'x', tags: ['fine', '  '] }] }] })).ok, '10: a blank tag is refused');
    ok(!review(envelope({ projects: [{ name: 'S', tasks: [{ title: 'x', estimatedDuration: 1.5 }] }] })).ok, '10: a fractional estimate is refused');
    ok(!review(envelope({ projects: [{ name: 'S', tasks: [{ title: 'x', estimatedDuration: 0 }] }] })).ok, '10: a zero estimate is refused');
    ok(review(envelope({ projects: [{ name: 'S', tasks: [{ title: 'x', estimatedDuration: 45, tags: ['build'], notes: 'n' }] }] })).ok, '10: the supported task fields all validate');
  }

  section('11. Invalid dates');
  {
    const bad = ['2026-2-30', '30/12/2026', '2026-10-10T00:00:00Z', 'next friday', '2026-13-01', '2026-02-30', '2026-10'];
    for (const value of bad) {
      const result = review(envelope({ projects: [{ name: 'S', deadline: value }] }));
      ok(!result.ok && hasError(result, 'not a date FocusDesk can store'), `11: project deadline "${value}" is refused`);
    }
    ok(!review(envelope({ projects: [{ name: 'S', milestones: [{ name: 'M', targetDate: '2026-11-31' }] }] })).ok, '11: 31 November is refused (November has 30 days)');
    ok(review(envelope({ projects: [{ name: 'S', milestones: [{ name: 'M', targetDate: '2028-02-29' }] }] })).ok, '11: 29 February 2028 is accepted (a leap year)');
    ok(!review(envelope({ projects: [{ name: 'S', milestones: [{ name: 'M', targetDate: '2027-02-29' }] }] })).ok, '11: 29 February 2027 is refused');
    const past = review(envelope({ projects: [{ name: 'S', deadline: '2020-01-02', tasks: [{ title: 'T', dueDate: '2020-01-01' }] }] }));
    ok(past.ok && past.warnings.some((w) => w.message.includes('in the past')), '11/13: a past date is a warning, not an error');
    const scheduled = review(envelope({ tasks: [{ title: 'T', scheduledDate: '2026-12-01', dueDate: '2026-11-01' }] }));
    ok(scheduled.ok && scheduled.warnings.some((w) => w.message.includes('after its')), '13: a task scheduled after its deadline warns');
    ok(review(envelope({ projects: [{ name: 'S', tasks: [{ title: 'T', dueDate: '2026-12-01' }] }] })).plan!.tasks[0].dueDate === '2026-12-01',
       '11: a valid date is stored verbatim (no timezone shift, no Date object)');
  }

  section('12. Invalid statuses and priorities');
  {
    for (const value of ['wip', 'done', 'ACTIVE!', 'in-progress-but-not']) {
      const result = review(envelope({ projects: [{ name: 'S', status: value as never }] }));
      ok(!result.ok && hasError(result, 'Supported values'), `12: project status ${JSON.stringify(value)} is refused, listing the supported ones`);
    }
    for (const value of [2, true, {}, ['active']]) {
      const result = review(envelope({ projects: [{ name: 'S', status: value as never }] }));
      ok(!result.ok && hasError(result, 'must be a string'), `12: project status ${JSON.stringify(value)} (not a string) is refused`);
    }
    ok(!review(envelope({ tasks: [{ title: 'T', status: 'todo' }] })).ok && hasError(review(envelope({ tasks: [{ title: 'T', status: 'todo' }] })), 'created, planned, today'), '12: task status "todo" is refused');
    ok(!review(envelope({ tasks: [{ title: 'T', priority: 'urgent' }] })).ok, '12: priority "urgent" is refused');
    ok(!review(envelope({ goal: { name: 'G', status: 'paused' } })).ok, '12: goal status "paused" is refused');
    ok(review(envelope({ projects: [{ name: 'S', status: 'On Hold' }] })).plan!.projects[0].status === 'on_hold', '12: "On Hold" and "on-hold" map to on_hold');
    ok(review(envelope({ tasks: [{ title: 'T', status: 'In Progress', priority: 'HIGH' }] })).plan!.tasks[0].status === 'in_progress', '12: status matching is case-insensitive');
    const completed = review(envelope({ tasks: [{ title: 'Done already', status: 'completed' }] }));
    ok(completed.ok && completed.warnings.some((w) => w.message.includes('dated the day of the import')), '12: importing a completed task warns about its date');
    const built = buildProjectPlanRecords(completed.plan!, { newId: createId, now: () => '2026-10-07T10:00:00.000Z' });
    ok(built.tasks[0].completedAt === '2026-10-07T10:00:00.000Z' && built.tasks[0].postponementCount === 0 && built.tasks[0].archived === false,
       '12: a completed task gets completedAt; the fields a plan cannot set keep their defaults');
  }

  section('13–15. Broken references, duplicate ids, cross-project milestones');
  {
    const broken = review(envelope({ projects: [{ id: 'p1', name: 'S', tasks: [{ title: 'T', milestoneId: 'm9' }] }] }));
    ok(!broken.ok && hasError(broken, 'does not exist in this plan'), '13: a task pointing at a milestone that is not there is refused');
    const brokenProject = review(envelope({ tasks: [{ title: 'T', projectId: 'p9' }] }));
    ok(!brokenProject.ok && hasError(brokenProject, 'does not exist in this plan'), '13: a task pointing at a project that is not there is refused');
    const flatOrphan = review(envelope({ projectMilestones: [{ projectId: 'p9', name: 'M' }] }));
    ok(!flatOrphan.ok, '13: a flat milestone pointing at a project that is not there is refused');
    const flatNoProject = review(envelope({ projects: [{ id: 'p1', name: 'S' }], projectMilestones: [{ name: 'M' }] }));
    ok(!flatNoProject.ok && hasError(flatNoProject, 'must say which project'), '13: a flat milestone with no projectId is refused');
    const forwardReference = review(envelope({
      tasks: [{ title: 'Early task', projectId: 'p2', milestoneId: 'm2' }],
      projects: [{ id: 'p2', name: 'Later project', milestones: [{ id: 'm2', name: 'Later milestone' }] }],
    }));
    ok(forwardReference.ok && forwardReference.plan!.tasks[0].projectMilestoneTempId === 'm2', '13: a reference to a record defined later in the file still resolves');

    const duplicate = review(envelope({ projects: [{ id: 'p1', name: 'A' }, { id: 'p1', name: 'B' }] }));
    ok(!duplicate.ok && hasError(duplicate, 'used twice'), '14: two projects sharing a temporary id are refused');
    const duplicateCrossKind = review(envelope({
      projects: [{ id: 'x1', name: 'A', milestones: [{ id: 'x1', name: 'M' }] }],
    }));
    ok(!duplicateCrossKind.ok && hasError(duplicateCrossKind, 'used twice'), '14: an id reused across kinds (project and milestone) is refused');
    const duplicateTask = review(envelope({ projects: [{ name: 'A', tasks: [{ id: 't', title: 'one' }, { id: 't', title: 'two' }] }] }));
    ok(!duplicateTask.ok, '14: two tasks sharing a temporary id are refused');
    ok(review(envelope({ projects: [{ name: 'A' }, { name: 'B' }] })).ok, '14: projects without ids never collide (internal keys are unique)');
    ok(review(envelope({ projects: [{ id: '#p0', name: 'A' }, { name: 'B' }] })).ok, '14: a plan that uses an internal-looking id itself is still unambiguous');
    ok(!review(envelope({ projects: [{ id: 'x'.repeat(65), name: 'A' }] })).ok && hasError(review(envelope({ projects: [{ id: 'x'.repeat(65), name: 'A' }] })), 'too long'), '14: an absurdly long temporary id is refused');

    const crossProject = review(envelope({
      projects: [
        { id: 'p1', name: 'Site', milestones: [{ id: 'm1', name: 'Foundation' }] },
        { id: 'p2', name: 'App', tasks: [{ title: 'T', milestoneId: 'm1' }] },
      ],
    }));
    ok(!crossProject.ok && hasError(crossProject, 'different project than milestone'), '15: a task carrying a milestone of another project is refused');
    const crossNested = review(envelope({
      projects: [{ id: 'p1', name: 'Site', milestones: [{ id: 'm1', name: 'Foundation', tasks: [{ title: 'T', projectId: 'p2' }] }] }, { id: 'p2', name: 'App' }],
    }));
    ok(!crossNested.ok && hasError(crossNested, 'names another'), '15: a nested task naming a different project is refused');
    const crossMilestone = review(envelope({
      projects: [{ id: 'p1', name: 'Site', milestones: [
        { id: 'm1', name: 'Foundation', tasks: [{ title: 'T', milestoneId: 'm2' }] },
        { id: 'm2', name: 'Launch' },
      ] }],
    }));
    ok(!crossMilestone.ok && hasError(crossMilestone, 'names another'), '15: a task inside one milestone naming a different one is refused');
    const looseMilestone = review(envelope({
      projects: [{ id: 'p1', name: 'Site', milestones: [{ id: 'm1', name: 'Foundation' }] }],
      tasks: [{ title: 'T', milestoneId: 'm1' }],
    }));
    ok(!looseMilestone.ok && hasError(looseMilestone, 'has no project'), '15: a top-level task with a milestone but no project is refused');
    const conflictingMilestone = review(envelope({
      projects: [{ id: 'p1', name: 'Site', milestones: [{ id: 'm1', projectId: 'p2', name: 'Foundation' }] }, { id: 'p2', name: 'App' }],
    }));
    ok(!conflictingMilestone.ok && hasError(conflictingMilestone, 'names another'), '15: a nested milestone naming a different project is refused');

    const redundant = review(envelope({
      projects: [{ id: 'p1', name: 'Site', milestones: [{ id: 'm1', name: 'Foundation', tasks: [{ title: 'T', projectId: 'p1', milestoneId: 'm1' }] }] }],
    }));
    ok(redundant.ok && redundant.warnings.length >= 2 && redundant.plan!.tasks[0].projectTempId === 'p1' && redundant.plan!.tasks[0].projectMilestoneTempId === 'm1',
       '15: a redundant but agreeing projectId/milestoneId warns and changes nothing');
  }

  section('Limits and the milestone capability');
  {
    const manyProjects = review(envelope({ projects: Array.from({ length: PROJECT_PLAN_LIMITS.projects + 1 }, (_, i) => ({ name: `P${i}` })) }));
    ok(!manyProjects.ok && hasError(manyProjects, 'at most'), `Limits: more than ${PROJECT_PLAN_LIMITS.projects} projects is refused`);
    const manyTasks = review(envelope({ tasks: Array.from({ length: PROJECT_PLAN_LIMITS.tasks + 1 }, (_, i) => ({ title: `T${i}` })) }));
    ok(!manyTasks.ok && hasError(manyTasks, 'at most'), `Limits: more than ${PROJECT_PLAN_LIMITS.tasks} tasks is refused`);
    const gated = review(envelope({ projects: [{ name: 'S', milestones: [{ name: 'M' }] }] }), { projectMilestonesAvailable: false });
    ok(!gated.ok && hasError(gated, '008_project_milestones.sql'), 'Capability: a plan with milestones is refused when the backend cannot store them');
    ok(review(envelope({ projects: [{ name: 'S', tasks: [{ title: 'T' }] }] }), { projectMilestonesAvailable: false }).ok, 'Capability: a plan without milestones is unaffected');
    ok(gated.plan === undefined && gated.counts.projects === 0, 'Capability: a refused plan exposes no records to write');
  }

  section('Integrity rules on a hand-built plan');
  {
    const orphan: ResolvedProjectPlan = {
      goals: [], projects: [], tasks: [],
      projectMilestones: [{ tempId: 'm1', projectTempId: 'p1', name: 'Orphan', position: 0 }],
    };
    ok(findProjectPlanProblems(orphan).length === 1, 'Rule: a milestone whose project is missing from the plan is detected');
    const crossTask: ResolvedProjectPlan = {
      goals: [],
      projects: [{ tempId: 'p1', name: 'A', status: 'active' }, { tempId: 'p2', name: 'B', status: 'active' }],
      projectMilestones: [{ tempId: 'm1', projectTempId: 'p1', name: 'M', position: 0 }],
      tasks: [{ tempId: 't1', projectTempId: 'p2', projectMilestoneTempId: 'm1', title: 'T', status: 'created', priority: 'medium', tags: [] }],
    };
    ok(findProjectPlanProblems(crossTask).some((p) => p.includes('not in the same project')), 'Rule: a task carrying another project\u2019s milestone is detected');
    const threw = (() => { try { buildProjectPlanRecords(crossTask, { newId: createId, now: () => 'x' }); return null; } catch (e) { return e as Error; } })();
    ok(threw !== null && /nothing was created|refused/i.test(threw.message), 'Rule: building records from an inconsistent plan throws before anything is written');
    ok(findProjectPlanProblems({ goals: [], projects: [], projectMilestones: [], tasks: [] }).length === 0, 'Rule: an empty plan has no integrity problems');
  }

  section('Preview, tree and duplicate names');
  {
    const plan = review(envelope({
      goal: { name: 'Build PatientScure' },
      projects: [
        { name: 'Project A', milestones: [
          { name: 'Milestone 1', tasks: [{ title: 'Task' }, { title: 'Task 2' }] },
          { name: 'Milestone 2', tasks: [{ title: 'Task 3' }] },
        ], tasks: [{ title: 'Unassigned project task' }] },
        { name: 'Project B', milestones: [{ name: 'Milestone 1', tasks: [{ title: 'Task 4' }] }] },
      ],
    })).plan!;
    const preview = previewOf(plan, 'The plan');
    ok(preview.counts.goals === 1 && preview.counts.projects === 2 && preview.counts.projectMilestones === 3 && preview.counts.tasks === 5,
       'Preview: the counts are 1 goal, 2 projects, 3 milestones, 5 tasks');
    ok(preview.projects[0].milestones[0].tasks.length === 2 && preview.projects[0].tasks.length === 1 && preview.projects[1].milestones[0].tasks.length === 1,
       'Preview: tasks sit under the right milestone, and the loose one under its project');
    const lines = projectPlanTreeLines(preview);
    ok(lines[0] === 'Goal: Build PatientScure' && lines[1].startsWith('├── Project A') && lines[2].startsWith('│   ├── Milestone 1')
       && lines.some((l) => l.includes('└── Unassigned project task')) && lines.some((l) => l === '└── Project B'),
       'Preview: the text tree matches the documented hierarchy');
    ok(findProjectPlanNameClashes(plan, existing.projects).map((c) => c.name).join() === '', 'Duplicates: no clash with the existing projects here');
    const clashing = review(envelope({ projects: [{ name: ' cambuz pdf reader ' }, { name: 'Brand new' }] })).plan!;
    const clashes = findProjectPlanNameClashes(clashing, existing.projects);
    ok(clashes.length === 1 && clashes[0].name === 'cambuz pdf reader' && clashes[0].existingId === 'p-clash',
       '14: an existing project with the same name (trimmed, case-insensitive) is reported, with its id');
    ok(buildProjectPlanRecords(clashing, { newId: createId, now: () => 'x' }).projects[0].name === 'cambuz pdf reader',
       '14: the clash is reported, never merged \u2014 a new project is still created (name trimmed)');
  }

  /* ================================================================ */
  /* The fixture, read from disk                                        */
  /* ================================================================ */
  const fixtureText = readFileSync(join(process.cwd(), 'fixtures', 'focusdesk-project-plan-v1.json'), 'utf8');
  const fixtureJson = JSON.parse(fixtureText) as Row;
  const fixtureReview = review(fixtureJson);

  section('22. fixtures/focusdesk-project-plan-v1.json');
  {
    ok(fixtureReview.ok && fixtureReview.errors.length === 0, '22: the fixture validates with no errors');
    const counts = fixtureReview.counts;
    ok(counts.goals === 1 && counts.projects === 1 && counts.projectMilestones === 7 && counts.tasks === 52,
       `22: the fixture holds 1 goal, 1 project, 7 milestones and 52 tasks (got ${counts.goals}/${counts.projects}/${counts.projectMilestones}/${counts.tasks})`);
    ok(fixtureReview.plan!.projectMilestones.map((m) => m.name).join('|') ===
       'Foundation|PDF Engine|Reader UI|Search & Navigation|Performance|Testing|Release',
       '22: the seven milestones are the documented ones, in order');
    ok(fixtureReview.plan!.projectMilestones.map((m) => m.position).join() === '0,1,2,3,4,5,6', '22: positions run 0..6');
    const tasks = fixtureReview.plan!.tasks;
    ok(tasks.filter((t) => t.projectTempId === undefined).length === 2, '22: two tasks have no project');
    ok(tasks.filter((t) => t.projectTempId !== undefined && t.projectMilestoneTempId === undefined).length === 2, '22: two tasks sit in the project with no milestone');
    ok(tasks.some((t) => t.projectMilestoneTempId === 'm7' && t.title === 'Prepare the launch-day checklist'),
       '22: one project-level task joins its milestone by temporary id (m7 \u2192 Release)');
    ok(tasks.filter((t) => t.description !== undefined).length >= 8 && tasks.some((t) => (t.tags ?? []).length > 0) && tasks.some((t) => t.notes !== undefined)
       && tasks.some((t) => t.estimatedDuration !== undefined) && tasks.some((t) => t.status === 'completed') && tasks.some((t) => t.status === 'someday')
       && tasks.some((t) => t.priority === 'high') && tasks.some((t) => t.priority === 'low') && tasks.some((t) => t.scheduledDate !== undefined),
       '22: the fixture exercises descriptions, tags, notes, estimates, statuses, priorities and both dates');
    ok(fixtureReview.warnings.length > 0 && fixtureReview.warnings.every((w) => !/cannot|refused/i.test(w.message)), '22: it produces warnings only');
    const lines = projectPlanTreeLines(fixtureReview.preview!);
    ok(lines[0].startsWith('Goal: Ship Cambuz PDF Reader') && lines.some((l) => l.includes('└── Cambuz PDF Reader')) && lines.some((l) => l === 'Tasks without a project'),
       '22: the fixture renders as the documented tree');
  }

  /* ================================================================ */
  /* 16, 20, 22, 23. Local storage                                      */
  /* ================================================================ */
  section('16/20. Local storage: a plan import adds records and changes nothing');
  let localImported: Awaited<ReturnType<LocalRepository['importProjectPlan']>>;
  {
    const store = memoryStore();
    store.setItem(STORAGE_KEY, JSON.stringify(legacyBlob()));
    const repo = new LocalRepository(store);
    const writesBefore = store.writes;
    const rawBefore = store.getItem(STORAGE_KEY);

    localImported = await repo.importProjectPlan(fixtureReview.plan!);
    ok(localImported.goals.length === 1 && localImported.projects.length === 1 && localImported.projectMilestones.length === 7 && localImported.tasks.length === 52,
       '16: the fixture created 1 goal, 1 project, 7 milestones and 52 tasks');
    ok(store.writes === writesBefore + 1, '16: the whole plan was written to storage in exactly one write (atomic for local storage)');

    const data = await repo.exportData();
    ok(unchanged(data), '16/20: the existing learnings, goal, projects, milestone and tasks are byte-identical afterwards');
    ok(data.learnings.length === 56 && fingerprint(data.learnings) === before.learnings, '20: the 56 learnings are untouched');
    ok(data.goals.length === 2 && data.projects.length === 3 && data.projectMilestones.length === 8 && data.tasks.length === 54,
       '16: the database now holds old + new, nothing replaced');

    const goal = localImported.goals[0];
    const project = localImported.projects[0];
    ok(project.goalId === goal.id && localImported.projectMilestones.every((m) => m.projectId === project.id),
       '21 (local): the goal \u2192 project \u2192 milestone foreign keys point at the imported records');
    ok(localImported.projectMilestones.every((m) => UUID.test(m.id)) && localImported.tasks.every((t) => UUID.test(t.id)),
       '16 (local): ids are real FocusDesk ids, not the plan\u2019s temporary ones');
    const byTitle = new Map(localImported.tasks.map((t) => [t.title, t]));
    const release = localImported.projectMilestones.find((m) => m.name === 'Release')!;
    ok(byTitle.get('Prepare the launch-day checklist')!.projectMilestoneId === release.id,
       '8 (local): the task that referenced "m7" now carries the real Release milestone id');
    ok(localImported.projectMilestones.map((m) => m.position).join() === '0,1,2,3,4,5,6' && localImported.projectMilestones.every((m, i) => m.position === i),
       '7 (local): milestone positions follow the JSON order');
    ok(byTitle.get('Renew the Apple Developer account before signing starts')!.projectId === undefined
       && byTitle.get('Renew the Apple Developer account before signing starts')!.projectMilestoneId === undefined,
       '4 (local): a top-level task has neither a project nor a milestone');
    ok(byTitle.get('Decide whether Cambuz is free, paid or both')!.projectId === project.id
       && byTitle.get('Decide whether Cambuz is free, paid or both')!.projectMilestoneId === undefined,
       '23 (local): a project task with no milestone keeps its project and stays valid');
    ok(findProjectMilestoneProblems({ projects: data.projects, projectMilestones: data.projectMilestones, tasks: data.tasks }).length === 0,
       '22 (local): the whole database still satisfies the project-milestone invariant');
    ok(byTitle.get('Choose the app name and clear trademark conflicts')!.completedAt === byTitle.get('Choose the app name and clear trademark conflicts')!.createdAt,
       '12 (local): a task imported as completed carries a completedAt');
    ok(rawBefore !== store.getItem(STORAGE_KEY) && JSON.parse(store.getItem(STORAGE_KEY)!).learnings.length === 56,
       '20 (local): storage was rewritten with the new records and the same 56 learnings');

    // An inconsistent plan handed straight to the repository is refused.
    const orphan: ResolvedProjectPlan = {
      goals: [], projects: [],
      projectMilestones: [{ tempId: 'm1', projectTempId: 'p-nope', name: 'Orphan', position: 0 }],
      tasks: [],
    };
    const failed = await rejects(() => repo.importProjectPlan(orphan));
    ok(failed instanceof ProjectPlanError && /nothing was created/i.test(failed.message), '20: an inconsistent plan is refused with a readable error');
    const dataAfter = await repo.exportData();
    ok(unchanged(dataAfter) && dataAfter.projectMilestones.length === 8, '20: the refused import wrote nothing at all');
  }

  /* ================================================================ */
  /* 17–19. Exports keep learnings and project milestones apart         */
  /* ================================================================ */
  section('17–19. Export compatibility is unchanged by the importer');
  {
    // A pre-Phase-3 export: the timeline under `milestones`, and no project
    // milestones anywhere (so no task carries one either).
    const legacy = legacyBlob({
      learnings: undefined,
      projectMilestones: undefined,
      milestones: JSON.parse(JSON.stringify(learningsFixture)),
      tasks: JSON.parse(JSON.stringify(existing.tasks.map(({ projectMilestoneId: _drop, ...t }) => t))),
    });
    const repo = new LocalRepository(memoryStore());
    await repo.importData(legacy);
    const data = await repo.exportData();
    ok(data.learnings.length === 56 && fingerprint(data.learnings) === before.learnings && data.projectMilestones.length === 0,
       '17: an old export\u2019s `milestones` still import as 56 learnings and zero project milestones');

    const modern = new LocalRepository(memoryStore());
    await modern.importData(legacyBlob());
    const modernData = await modern.exportData();
    ok(modernData.learnings.length === 56 && modernData.projectMilestones.length === 1, '18/19: a new export keeps `learnings` and `projectMilestones` apart');

    await modern.importProjectPlan(fixtureReview.plan!);
    const exported = await modern.exportData();
    ok(exported.learnings.length === 56 && fingerprint(exported.learnings) === before.learnings, '18: a plan import leaves the exported `learnings` exactly as they were');
    ok(exported.projectMilestones.length === 8 && exported.projectMilestones.some((m) => m.id === 'm-existing') && exported.projectMilestones.some((m) => m.name === 'Release'),
       '19: the exported `projectMilestones` holds the existing one plus the seven imported ones');
    ok(!('milestones' in exported) && !JSON.stringify(exported).includes('"milestones":'), '19: no export ever grows a `milestones` key');
    ok(exported.learnings.every((l) => !('projectId' in l) && !('position' in l)), '17: a learning is never shaped like a project milestone');

    const refused = reviewText(JSON.stringify(exported));
    ok(!refused.ok && hasError(refused, 'data export'), '16: pasting a FocusDesk export into the plan importer is refused with a pointer to Import (JSON)');
    ok(isProjectPlanPayload(exported) === false && isProjectPlanPayload(fixtureJson) === true, '16: the two payloads are told apart by `format` alone');
  }

  /* ================================================================ */
  /* 21, 24. Supabase                                                   */
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
      auth: { persistSession: false, autoRefreshToken: false, storageKey: `verify-phase4-${clients}` },
      global: { fetch: server.fetch as typeof fetch },
    });
    return { server, repo: new SupabaseRepository(client, USER) };
  };
  const writes = (log: { method: string; table: string }[], table?: string) =>
    log.filter((r) => r.method !== 'GET' && (!table || r.table === table));
  /** Seed the database with the world that already exists. */
  const seed = (server: ReturnType<typeof fakePostgrest>) => {
    server.tables.get('milestones')!.rows.push(...learningsFixture.map((l) => ({
      id: l.id, user_id: USER, title: l.title, category: l.category, description: l.description ?? null, date: l.date, created_at: l.createdAt,
    })));
    server.tables.get('goals')!.rows.push({ id: 'g-existing', user_id: USER, name: 'Existing goal', description: null, deadline: null, status: 'active', created_at: '2026-09-01T09:00:00.000Z' });
    server.tables.get('projects')!.rows.push(
      { id: 'p-existing', user_id: USER, name: 'Existing Project', description: 'Do not touch', goal_id: 'g-existing', deadline: '2026-12-01', status: 'active', created_at: '2026-09-02T09:00:00.000Z' },
      { id: 'p-clash', user_id: USER, name: 'Cambuz PDF Reader', description: null, goal_id: null, deadline: null, status: 'active', created_at: '2026-09-03T09:00:00.000Z' },
    );
    server.tables.get('tasks')!.rows.push(...existing.tasks.map((t) => ({
      id: t.id, user_id: USER, title: t.title, description: null, status: t.status, priority: t.priority,
      project_id: t.projectId ?? null, goal_id: null, parent_task_id: null, created_at: t.createdAt,
      scheduled_date: null, due_date: null, completed_at: null, estimated_duration: null, actual_duration: null,
      started_at: null, paused_at: null, actual_duration_seconds: null, reminder: null, notes: null,
      tags: t.tags, recurrence: null, postponement_count: t.postponementCount, archived: t.archived,
      ...(t.projectMilestoneId ? { project_milestone_id: t.projectMilestoneId } : {}),
    })));
    if (server.tables.has('project_milestones')) {
      server.tables.get('project_milestones')!.rows.push({
        id: 'm-existing', user_id: USER, project_id: 'p-existing', name: 'Existing milestone', description: null,
        target_date: '2026-11-01', position: 0, created_at: '2026-09-04T09:00:00.000Z',
      });
    }
    return {
      learnings: JSON.stringify(server.tables.get('milestones')!.rows),
      goals: JSON.stringify(server.tables.get('goals')!.rows),
      projects: JSON.stringify(server.tables.get('projects')!.rows),
      tasks: JSON.stringify(server.tables.get('tasks')!.rows),
      milestones: server.tables.has('project_milestones') ? JSON.stringify(server.tables.get('project_milestones')!.rows) : '[]',
    };
  };

  section('21/24. Supabase with migration 008: correct foreign keys, under RLS');
  {
    const { server, repo } = supabaseFor(migratedSchema);
    const snapshot = seed(server);
    ok((await repo.supportsProjectMilestones()) === true, '21: migration 008 is detected');

    const at = server.log.length;
    const created = await repo.importProjectPlan(fixtureReview.plan!);
    const requests = server.log.slice(at);
    const inserts = requests.filter((r) => r.method === 'POST').map((r) => r.table);

    ok(inserts.indexOf('goals') < inserts.indexOf('projects') && inserts.indexOf('projects') < inserts.indexOf('project_milestones')
       && inserts.indexOf('project_milestones') < inserts.indexOf('tasks'),
       `21: rows are inserted parents-first (${inserts.join(' \u2192 ')})`);
    ok(requests.filter((r) => r.method === 'PATCH').length === 0 && requests.filter((r) => r.method === 'DELETE').length === 0,
       '20: the import issued no UPDATE and no DELETE \u2014 nothing existing could have been modified');
    ok(server.tables.get('milestones')!.rows.length === 56 && JSON.stringify(server.tables.get('milestones')!.rows) === snapshot.learnings,
       '20: the 56 learning rows are byte-identical afterwards');
    ok(JSON.stringify(server.tables.get('goals')!.rows.filter((r) => r.id === 'g-existing')) === JSON.stringify([{ id: 'g-existing', user_id: USER, name: 'Existing goal', description: null, deadline: null, status: 'active', created_at: '2026-09-01T09:00:00.000Z' }])
       && server.tables.get('projects')!.rows.some((r) => r.id === 'p-existing' && r.description === 'Do not touch')
       && server.tables.get('tasks')!.rows.some((r) => r.id === 't-timed' && r.postponement_count === 2),
       '16/20: the existing goal, project and timed task are unchanged');
    ok(JSON.stringify(server.tables.get('project_milestones')!.rows.find((r) => r.id === 'm-existing')) === JSON.stringify({
      id: 'm-existing', user_id: USER, project_id: 'p-existing', name: 'Existing milestone', description: null,
      target_date: '2026-11-01', position: 0, created_at: '2026-09-04T09:00:00.000Z',
    }), '20: the existing project milestone is unchanged');

    const inserted = requests.filter((r) => r.method === 'POST').flatMap((r) => (Array.isArray(r.body) ? r.body : [r.body]) as Row[]);
    ok(inserted.length === 1 + 1 + 7 + 52 && inserted.every((row) => row.user_id === USER),
       '19/24: all 61 inserted rows carry the signed-in user\u2019s id \u2014 never one from the JSON');
    ok(requests.every((r) => (r.method === 'POST'
      ? (Array.isArray(r.body) ? r.body : [r.body]).every((row: Row) => row.user_id === USER)
      : r.query.get('user_id') === `eq.${USER}`)),
       '24: every request is scoped to the authenticated user, so RLS applies as usual');

    const goalRow = server.tables.get('goals')!.rows.find((r) => r.name === 'Ship Cambuz PDF Reader to real readers')!;
    const projectRow = server.tables.get('projects')!.rows.find((r) => r.name === 'Cambuz PDF Reader' && r.id !== 'p-clash')!;
    const milestoneRows = server.tables.get('project_milestones')!.rows.filter((r) => r.project_id === projectRow.id);
    const taskRows = server.tables.get('tasks')!.rows.filter((r) => r.project_id === projectRow.id);
    ok(projectRow.goal_id === goalRow.id, '21: the imported project\u2019s goal_id is the imported goal');
    ok(milestoneRows.length === 7 && milestoneRows.every((r) => UUID.test(String(r.id))), '21: seven milestones with generated ids belong to the project');
    ok(milestoneRows.slice().sort((a, b) => Number(a.position) - Number(b.position)).map((r) => r.name).join('|') ===
       'Foundation|PDF Engine|Reader UI|Search & Navigation|Performance|Testing|Release'
       && milestoneRows.map((r) => Number(r.position)).sort((a, b) => a - b).join() === '0,1,2,3,4,5,6',
       '7/21: milestone positions are 0..6 in the JSON order');
    ok(taskRows.length === 50 && taskRows.every((r) => {
      const milestoneId = r.project_milestone_id;
      if (milestoneId === null || milestoneId === undefined) return true;
      return milestoneRows.some((m) => m.id === milestoneId);
    }), '22: every task\u2019s project_milestone_id belongs to a milestone of the same project');
    ok(taskRows.filter((r) => r.project_milestone_id === null).length === 2, '23: the two project tasks with no milestone are stored with a null milestone');
    ok(taskRows.length === 50 && server.tables.get('tasks')!.rows.filter((r) => r.project_id === null && r.id !== 't-timed').length === 2,
       '4: the two tasks without a project are stored with a null project');
    const checklist = taskRows.find((r) => r.title === 'Prepare the launch-day checklist')!;
    const releaseRow = milestoneRows.find((r) => r.name === 'Release')!;
    ok(checklist.project_milestone_id === releaseRow.id, '8: the temporary id "m7" became the real Release milestone id');
    ok(created.tasks.length === 52 && created.tasks.every((t) => t.createdAt === created.goals[0].createdAt), '21: the repository returns the records it wrote, sharing one timestamp');

    const readBack = await repo.exportData();
    ok(readBack.learnings.length === 56 && fingerprint(readBack.learnings) === before.learnings, '20: reading the database back shows the same 56 learnings');
    ok(readBack.projects.length === 3 && readBack.goals.length === 2 && readBack.projectMilestones.length === 8 && readBack.tasks.length === 54,
       '21: the repository reads back old + new records through the ordinary path');
    ok(readBack.tasks.find((t) => t.title === 'Continuous vertical scroll view')?.projectMilestoneId ===
       readBack.projectMilestones.find((m) => m.name === 'Reader UI')?.id,
       '21: a task\u2019s milestone survives the round trip through the database');
    ok(writes(server.log, LEARNINGS_TABLE).length === 0, '20: nothing was ever written to the learnings table');
  }

  section('24. Supabase without migration 008');
  {
    const { server, repo } = supabaseFor(legacySchema);
    seed(server);
    ok((await repo.supportsProjectMilestones()) === false, '24: the capability probe reports Project Milestones as unavailable');
    const at = server.log.length;
    const refused = await rejects(() => repo.importProjectPlan(fixtureReview.plan!));
    ok(refused instanceof ProjectPlanError && /008_project_milestones.sql/.test(refused.message), '24: a plan with milestones is refused, naming the migration');
    ok(writes(server.log.slice(at)).length === 0, '24: the refusal happened before any write request');
    ok(server.tables.get('milestones')!.rows.length === 56 && server.tables.get('projects')!.rows.length === 2, '24: the database is untouched');

    const plain = review(envelope({ projects: [{ name: 'Website', tasks: [{ title: 'Set up' }, { title: 'Ship' }] }] })).plan!;
    const at2 = server.log.length;
    const created = await repo.importProjectPlan(plain);
    ok(created.projects.length === 1 && created.tasks.length === 2, '24: a plan without milestones still imports on an unmigrated database');
    ok(writes(server.log.slice(at2)).every((r) => !JSON.stringify(r.body).includes('project_milestone_id')),
       '24: task inserts leave the missing column out entirely (the fake rejects unknown columns like PostgREST)');
    ok(server.tables.get('milestones')!.rows.length === 56, '24: the learnings table is still untouched');
  }

  section('20/21. Supabase: a failed write is undone');
  {
    const { server, repo } = supabaseFor(migratedSchema);
    const snapshot = seed(server);
    server.fail = (method, table) => method === 'POST' && table === 'tasks';
    const originalError = console.error;
    console.error = () => {};
    let error: Error | null = null;
    try {
      error = await rejects(() => repo.importProjectPlan(fixtureReview.plan!));
    } finally {
      console.error = originalError;
    }
    ok(error instanceof ProjectPlanError && /nothing was kept/.test(error.message), '20: a failed import reports that nothing was kept, with the reason');
    ok(server.tables.get('tasks')!.rows.length === 2, '20: no task row survived the failure');
    ok(server.tables.get('project_milestones')!.rows.length === 1 && JSON.stringify(server.tables.get('project_milestones')!.rows.find((r) => r.id === 'm-existing')) ===
       JSON.stringify({ id: 'm-existing', user_id: USER, project_id: 'p-existing', name: 'Existing milestone', description: null, target_date: '2026-11-01', position: 0, created_at: '2026-09-04T09:00:00.000Z' }),
       '20: the milestones this import created were rolled back, and the existing one was not');
    ok(server.tables.get('projects')!.rows.length === 2 && server.tables.get('goals')!.rows.length === 1, '20: the project and goal it created were rolled back too');
    const deletes = server.log.filter((r) => r.method === 'DELETE');
    ok(deletes.length === 3 && deletes.every((r) => r.query.get('user_id') === `eq.${USER}` && (r.query.get('id') ?? '').startsWith('in.')),
       '24: the rollback deleted only this import\u2019s own rows, by id and scoped to the user');
    ok(deletes.map((r) => r.table).join() === `${PROJECT_MILESTONES_TABLE},projects,goals`, '20: the rollback removed children before parents');
    ok(JSON.stringify(server.tables.get('milestones')!.rows) === snapshot.learnings && JSON.stringify(server.tables.get('tasks')!.rows) === snapshot.tasks,
       '20: the learnings and the pre-existing tasks are byte-identical after the rollback');
    server.fail = null;
    const retry = await repo.importProjectPlan(review(envelope({ projects: [{ name: 'After the failure', tasks: [{ title: 'Works again' }] }] })).plan!);
    ok(retry.projects.length === 1 && (await repo.tasks.list()).some((t) => t.title === 'Works again'), '20: the repository still works normally after a rolled-back import');
  }

  section('24. Supabase: another user\u2019s rows are out of reach');
  {
    const { server, repo } = supabaseFor(migratedSchema);
    seed(server);
    // Somebody else's project, with the very name the plan uses.
    server.tables.get('projects')!.rows.push({ id: 'p-other', user_id: OTHER, name: 'Cambuz PDF Reader', description: null, goal_id: null, deadline: null, status: 'active', created_at: '2026-01-01T00:00:00.000Z' });
    const created = await repo.importProjectPlan(review(envelope({ projects: [{ name: 'Cambuz PDF Reader', tasks: [{ title: 'Mine' }] }] })).plan!);
    const otherRow = server.tables.get('projects')!.rows.find((r) => r.id === 'p-other')!;
    ok(otherRow.user_id === OTHER && otherRow.name === 'Cambuz PDF Reader', '24: the other user\u2019s project is untouched');
    ok(created.projects[0].id !== 'p-other' && server.tables.get('tasks')!.rows.find((r) => r.title === 'Mine')!.user_id === USER,
       '24: the import created its own project and task for the signed-in user');
    ok((await repo.projects.list()).every((p) => p.id !== 'p-other'), '24: reads stay inside the user\u2019s own rows');
  }

  /* ================================================================ */
  /* 11, 12, 14, 15. The real UI: Settings \u2192 Data \u2192 Import Project Plan  */
  /* ================================================================ */
  const { AuthProvider } = await import('../components/auth/auth-provider');
  const { DataProvider, useData } = await import('../components/data/data-provider');
  const { SettingsScreen } = await import('../components/settings/settings-screen');
  const { ProjectPlanImportModal } = await import('../components/settings/project-plan-import');

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
  const click = async (element: Element | null | undefined, what: string) => {
    if (!element) throw new Error(`Missing UI control: ${what}`);
    await act(async () => {
      element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 20));
    });
  };
  const typeInto = async (element: HTMLTextAreaElement | HTMLInputElement | null, value: string) => {
    if (!element) throw new Error('Missing text field');
    const proto = 'value' in element && element.tagName === 'INPUT'
      ? dom.window.HTMLInputElement.prototype
      : dom.window.HTMLTextAreaElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, value);
      element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 20));
    });
  };
  const button = (text: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  const bodyText = () => document.body.textContent ?? '';
  const persisted = () => new LocalRepository(dom.window.localStorage).exportData();
  const planArea = () => document.querySelector('textarea[aria-label="Project plan JSON"]') as HTMLTextAreaElement | null;
  const importButton = () => button('Import plan') ?? button('Importing\u2026');

  const smallPlan = JSON.stringify(envelope({
    name: 'UI test plan',
    goal: { name: 'Launch the reader' },
    projects: [{
      id: 'p1',
      name: 'Reader UI Project',
      deadline: '2027-01-15',
      milestones: [
        { id: 'm1', name: 'First milestone', targetDate: '2026-11-01', tasks: [{ title: 'Build the toolbar', dueDate: '2026-10-30', priority: 'high' }] },
        { id: 'm2', name: 'Second milestone', tasks: [{ title: 'Build the sidebar' }, { title: 'Build the status bar' }] },
      ],
      tasks: [{ title: 'Write the release notes' }],
    }],
    tasks: [{ title: 'Renew the certificate' }],
  }));

  section('11/12. The importer UI: parse \u2192 validate \u2192 preview \u2192 confirm \u2192 import');
  dom.window.localStorage.clear();
  dom.window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyBlob()));
  await mount(React.createElement(SettingsScreen));
  ok(c().ready && c().projectMilestonesEnabled && c().data.learnings.length === 56, '11: Settings loads with the 56 learnings and Project Milestones available');
  ok(button('Import Project Plan') !== undefined, '11: Settings \u2192 Data offers "Import Project Plan"');

  // 16. A plan fed to the *export* importer is refused before it can replace anything.
  {
    const rawBefore = dom.window.localStorage.getItem(STORAGE_KEY);
    const file = new dom.window.File([fixtureText], 'plan.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 60));
    });
    ok(c().toasts.some((t) => /project plan/i.test(t.message)), '16: Import (JSON) recognises a project plan and points at the right importer');
    ok(dom.window.localStorage.getItem(STORAGE_KEY) === rawBefore, '16: \u2026and replaced nothing while doing so');
    ok(c().data.projects.length === 2 && c().data.learnings.length === 56, '16: the data on screen is unchanged');
  }

  await click(button('Import Project Plan'), 'Import Project Plan');
  ok(bodyText().includes('Import project plan') && planArea() !== null, '11: the importer opens with a place to paste JSON');
  ok(importButton()!.hasAttribute('disabled'), '11: Import is disabled before anything is pasted');

  // 9/10. Invalid JSON: shown, refused, and nothing written.
  {
    const rawBefore = dom.window.localStorage.getItem(STORAGE_KEY);
    await typeInto(planArea(), '{ "format": "focusdesk-project-plan", "version": 1, ');
    ok(bodyText().includes('cannot be imported') && bodyText().includes('not valid JSON'), '9: invalid JSON is reported as soon as it is pasted');
    ok(importButton()!.hasAttribute('disabled'), '9: Import stays disabled');
    await typeInto(planArea(), JSON.stringify(envelope({ projects: [{ name: 'Site', milestones: [{ name: 'M', tasks: [{ title: '  ' }] }] }] })));
    ok(bodyText().includes('task needs \u201ctitle\u201d'), '10: a missing task title is reported with its place in the plan');
    await typeInto(planArea(), JSON.stringify(envelope({ projects: [{ name: 'Site', deadline: '2026-02-30' }] })));
    ok(bodyText().includes('not a date FocusDesk can store'), '11: an impossible date is reported');
    ok(dom.window.localStorage.getItem(STORAGE_KEY) === rawBefore, '20: an invalid plan performs zero writes \u2014 storage is byte-identical');
    ok(c().data.projects.length === 2 && c().data.projectMilestones.length === 1 && c().data.tasks.length === 2, '20: and the app state never saw a partial import');
  }

  // 12. The preview of a valid plan.
  await typeInto(planArea(), smallPlan);
  ok(bodyText().includes('Launch the reader') && bodyText().includes('What will be created'), '12: the preview shows the goal and the hierarchy');
  ok(bodyText().includes('Reader UI Project') && bodyText().includes('First milestone') && bodyText().includes('Build the toolbar')
     && bodyText().includes('Write the release notes') && bodyText().includes('Tasks without a project') && bodyText().includes('Renew the certificate'),
     '12: projects, milestones, their tasks, the loose project task and the project-less tasks are all listed');
  {
    const counts = Array.from(document.querySelectorAll('p')).map((p) => p.textContent).filter((t) => /^(Projects?|Project Milestones?|Tasks?|Goals?)$/.test(t ?? ''));
    ok(counts.length >= 3, `12: the preview shows the counts (${counts.join(', ')})`);
    ok(bodyText().includes('2 tasks') && bodyText().includes('1 task'), '12: each milestone shows how many tasks it holds');
    ok(bodyText().includes('deadline 2027-01-15') && bodyText().includes('due 2026-10-30') && bodyText().includes('target 2026-11-01'),
       '12: the dates are shown, so the user sees exactly what will be stored');
    ok(bodyText().includes('no goal') === false && bodyText().includes('Worth knowing before you import'), '13: warnings are listed under their own heading');
    ok(!importButton()!.hasAttribute('disabled'), '12: Import becomes available once the plan validates');
  }

  // 14. A duplicate project name asks before creating a second project.
  {
    const clashing = JSON.stringify(envelope({ projects: [{ name: 'Cambuz PDF Reader', tasks: [{ title: 'Second attempt' }] }] }));
    await typeInto(planArea(), clashing);
    ok(bodyText().includes('An existing project with this name already exists') && bodyText().includes('imported as new'),
       '14: an existing project with the same name is reported');
    await click(importButton(), 'Import plan');
    ok(bodyText().includes('Create as new') && bodyText().includes('does not merge projects'), '14: the user is asked to choose before anything is written');
    ok(c().data.projects.length === 2, '14: nothing was created while the question was open');
    await click(button('Keep'), 'Keep (cancel)');
    ok(c().data.projects.length === 2 && bodyText().includes('Create as new') === false, '14: cancelling leaves the database exactly as it was');
    await click(importButton(), 'Import plan');
    await click(button('Create as new'), 'Create as new');
    const data = c().data;
    ok(data.projects.length === 3 && data.projects.filter((p) => p.name === 'Cambuz PDF Reader').length === 2, '14: "Create as new" makes a second project');
    const original = data.projects.find((p) => p.id === 'p-clash')!;
    ok(original.createdAt === '2026-09-03T09:00:00.000Z' && original.status === 'active' && !('deadline' in original && original.deadline !== undefined),
       '14/20: the existing project was not modified in any way');
    ok(bodyText().includes('Import successful'), '15: the result is reported');
    await click(button('Import another plan'), 'Import another plan');
  }

  // 15. The full plan, imported through the UI.
  {
    await typeInto(planArea(), fixtureText);
    ok(bodyText().includes('Ship Cambuz PDF Reader to real readers') && !importButton()!.hasAttribute('disabled'), '11: the fixture previews and can be imported');
    const sizes = { projects: c().data.projects.length, milestones: c().data.projectMilestones.length, tasks: c().data.tasks.length, goals: c().data.goals.length };
    await click(importButton(), 'Import plan');
    // The fixture's project shares its name with the one created above, so the
    // importer asks again — and only the answer writes anything.
    ok(button('Create as new') !== undefined && c().data.projects.length === sizes.projects,
       '14: the fixture is asked about too, and nothing is written before the answer');
    await click(button('Create as new'), 'Create as new');
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    const data = c().data;
    ok(data.goals.length === sizes.goals + 1 && data.projects.length === sizes.projects + 1
       && data.projectMilestones.length === sizes.milestones + 7 && data.tasks.length === sizes.tasks + 52,
       '15: the app state holds the goal, the project, its 7 milestones and all 52 tasks');
    ok(bodyText().includes('Import successful') && bodyText().includes('Goal created') && bodyText().includes('Project created')
       && bodyText().includes('52') && bodyText().includes('Tasks created'),
       '15: the result screen reports what was created, with the counts');
    ok(bodyText().includes('Imported projects') && bodyText().includes('7 milestones') && bodyText().includes('Open Projects'),
       '15: the result names the imported projects and links to them');
    ok(bodyText().includes('2 of the new tasks have no project'), '15: the result mentions the tasks that have no project');
    ok(data.learnings.length === 56 && fingerprint(data.learnings) === before.learnings, '20: the 56 learnings survived the UI import unchanged');
    const stored = await persisted();
    ok(stored.tasks.length === data.tasks.length && stored.projectMilestones.length === data.projectMilestones.length && stored.learnings.length === 56,
       '15: what is persisted matches what the app shows');
    ok(findProjectMilestoneProblems({ projects: stored.projects, projectMilestones: stored.projectMilestones, tasks: stored.tasks }).length === 0,
       '22: the persisted database satisfies the project-milestone invariant');
    const release = stored.projectMilestones.find((m) => m.name === 'Release')!;
    const project = stored.projects.find((p) => p.id === release.projectId)!;
    ok(project.name === 'Cambuz PDF Reader' && project.id !== 'p-clash' && stored.projects.filter((p) => p.name === 'Cambuz PDF Reader').length === 3,
       '14: the imported project is its own record, alongside the two that were already called that');
    ok(stored.tasks.find((t) => t.title === 'Prepare the launch-day checklist')?.projectMilestoneId === release.id && release.projectId === project.id,
       '22: a task imported through the UI carries a milestone of its own project');
    ok(stored.tasks.find((t) => t.title === 'Continuous vertical scroll view')?.priority === 'high'
       && stored.tasks.find((t) => t.title === 'Read the PDF 2.0 specification chapter on object streams')?.projectId === undefined
       && stored.tasks.find((t) => t.title === 'Build a corpus of 50 sample PDFs')?.tags.join() === 'qa',
       '8: priority, project-less tasks and tags all arrive as written');
    const importedGoal = stored.goals.find((g2) => g2.name === 'Ship Cambuz PDF Reader to real readers');
    ok(importedGoal !== undefined && project.goalId === importedGoal.id && importedGoal.id !== 'g-existing',
       '5: the goal was created and the imported project points at it');
    ok(stored.tasks.find((t) => t.id === 't-timed')?.actualDurationSeconds === 1234 && stored.tasks.find((t) => t.id === 't-timed')?.postponementCount === 2,
       '20: an existing task, including its timer state, is untouched');
    await click(button('Done'), 'Done');
    ok(planArea() === null && button('Import Project Plan') !== undefined, '11: the modal closes and Settings is still itself');
  }

  section('24. The importer modal on its own (unmigrated backend)');
  {
    dom.window.localStorage.clear();
    await mount(React.createElement(ProjectPlanImportModal, { open: true, onClose: () => {} }));
    ok(planArea() !== null, '24: the modal renders standalone');
    await typeInto(planArea(), JSON.stringify(envelope({ projects: [{ name: 'Solo', tasks: [{ title: 'Only a task' }] }] })));
    const solo = c().data.projects.length;
    await click(importButton(), 'Import plan');
    ok(c().data.projects.length === solo + 1 && bodyText().includes('Import successful'), '24: a plan with no milestones imports through the provider');
    ok(c().data.learnings.length === 0 && c().data.tasks.length === 1, '24: only the plan\u2019s own records were created');
  }

  /* ================================================================ */
  /* Static checks: the shape of the feature itself                     */
  /* ================================================================ */
  section('Static checks');
  {
    const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
    const planModule = read('lib/project-plan.ts');
    // `supabase/migrations/008…` is spelled in a refusal message; what must not
    // appear is any storage, client or network API.
    ok(!/localStorage|STORAGE_KEY|@supabase|createClient\(|\bfetch\(|Array\.from\(|\.from\(['"]/.test(planModule),
       'The plan module does no I/O at all — it parses, validates and resolves, nothing else');
    ok(!/service_role|SERVICE_ROLE|user_id\s*[:=]/.test(planModule), 'The plan module never mentions a service-role key or a user id');
    const callers = ['lib/store/repository.ts', 'lib/store/local-repository.ts', 'lib/store/supabase-repository.ts', 'components/data/data-provider.tsx', 'components/settings/project-plan-import.tsx']
      .filter((path) => read(path).includes('importProjectPlan'));
    ok(callers.length === 5, `importProjectPlan exists in the interface, both repositories, the provider and the UI (${callers.join(', ')})`);
    const ui = read('components/settings/project-plan-import.tsx');
    ok(!/repo\(\)|createRepository|\.from\(|localStorage/.test(ui) && ui.includes('actions.importProjectPlan'),
       'The importer UI writes through the DataProvider action only — never to a repository, Supabase or storage directly');
    ok(ui.includes('reviewProjectPlanText') && /disabled=\{!canImport\}/.test(ui), 'The UI validates before it offers Import, and Import stays disabled until the plan is valid');
    ok(read('components/settings/settings-screen.tsx').includes('isProjectPlanPayload'),
       'Settings \u2192 Data \u2192 Import (JSON) recognises a project plan and refuses it instead of replacing the database');
    ok(!read('lib/store/supabase-repository.ts').includes('importProjectPlan') || /await insert\('goals'[\s\S]*await insert\('projects'[\s\S]*PROJECT_MILESTONES_TABLE[\s\S]*await insert\('tasks'/.test(read('lib/store/supabase-repository.ts')),
       'Supabase writes a plan parents-first: goals \u2192 projects \u2192 project milestones \u2192 tasks');
    ok(read('supabase/migrations/008_project_milestones.sql').length > 0 && readdirSync(join(process.cwd(), 'supabase', 'migrations')).length === 7,
       '25: no new migration was added and migration 008 is still there (7 files, 002\u2013008)');
  }

  /* ================================================================ */
  if (root) await act(async () => root!.unmount());
  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nProject plan importer verified.');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
