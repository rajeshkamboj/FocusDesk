/**
 * Phase 5 — "Add to Existing Project", verified headlessly.
 *
 * Exercises the real code paths, never a copy of them:
 *   - lib/project-plan.ts: the exactly-one-project rule, normalized exact-name
 *     milestone matching, mapping choices, resolution, the record builder and
 *     the diff preview;
 *   - LocalRepository over an in-memory StorageLike;
 *   - SupabaseRepository + the real supabase-js SDK against a fake PostgREST
 *     at the fetch boundary (a migrated and an unmigrated schema, a missing
 *     target project, and deliberately failing inserts to prove the rollback)
 *     — no request can reach a real Supabase project;
 *   - DataProvider + the real Settings screen and importer modal in jsdom,
 *     driving the mode switch, the target-project selector and the milestone
 *     mapping controls.
 *
 * The numbered assertions match the Phase 5 test list (1–24). Phase 4 keeps
 * its own script (scripts/verify-project-plan-import.tsx), which must stay
 * green — that is the regression proof that "Create New Project" is unchanged.
 *
 * Run: npm i --no-save jsdom tsx && npx tsx scripts/verify-project-plan-add-to-existing.tsx
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
    ProjectPlanError,
    buildExistingProjectPlanRecords,
    existingProjectImportPreview,
    findExistingProjectImportProblems,
    findExistingProjectImportWarnings,
    normalizeProjectMilestoneName,
    planProjectMilestoneMappings,
    resolveExistingProjectImport,
    reviewProjectPlan,
    reviewProjectPlanText,
  } = await import('../lib/project-plan');
  type Learning = import('../lib/types').Learning;
  type AppData = import('../lib/types').AppData;
  type Project = import('../lib/types').Project;
  type ProjectMilestone = import('../lib/types').ProjectMilestone;
  type Task = import('../lib/types').Task;
  type ResolvedExistingProjectImport = import('../lib/project-plan').ResolvedExistingProjectImport;

  /** A fixed "today", so past-date warnings do not depend on the run date. */
  const TODAY = '2026-10-07';
  const review = (plan: unknown, options: { mode?: 'create-new-project' | 'add-to-existing-project'; projectMilestonesAvailable?: boolean } = {}) =>
    reviewProjectPlan(plan, { today: TODAY, ...options });
  const reviewText = (text: string, options: { mode?: 'create-new-project' | 'add-to-existing-project'; projectMilestonesAvailable?: boolean } = {}) =>
    reviewProjectPlanText(text, { today: TODAY, ...options });
  /** A valid plan, one field changed — the quickest way to build a bad one. */
  const envelope = (extra: Row = {}) => ({ format: PROJECT_PLAN_FORMAT, version: PROJECT_PLAN_VERSION, ...extra });
  const hasError = (result: { errors: { message: string }[] }, fragment: string) =>
    result.errors.some((e) => e.message.toLowerCase().includes(fragment.toLowerCase()));

  /* ================================================================ */
  /* Fixtures: the world that already exists                            */
  /* ================================================================ */
  // 56 learnings — the production count, same record shape Phase 3 verified.
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

  /**
   * The target project "PatientScure" (goal, 4 milestones, 12 tasks) and a
   * second project that must never be touched — it even has a milestone called
   * "Foundation", which must not match the target's.
   */
  const existing = {
    goals: [
      { id: 'g-existing', name: 'Grow PatientScure', description: 'The real goal', status: 'active' as const, createdAt: '2026-09-01T09:00:00.000Z' },
    ],
    projects: [
      { id: 'p-target', name: 'PatientScure', description: 'Do not touch', goalId: 'g-existing', deadline: '2026-12-01', status: 'active' as const, createdAt: '2026-09-02T09:00:00.000Z' },
      { id: 'p-other', name: 'Other Project', status: 'on_hold' as const, createdAt: '2026-09-03T09:00:00.000Z' },
    ],
    projectMilestones: [
      { id: 'm-foundation', projectId: 'p-target', name: 'Foundation', description: 'Existing description', targetDate: '2026-10-01', position: 0, createdAt: '2026-09-04T09:00:00.000Z' },
      { id: 'm-backend', projectId: 'p-target', name: 'Backend', position: 1, createdAt: '2026-09-05T09:00:00.000Z' },
      { id: 'm-seo', projectId: 'p-target', name: 'SEO', position: 2, createdAt: '2026-09-06T09:00:00.000Z' },
      // Same normalized name as m-seo, later position — matching must be
      // deterministic (lowest position first) and list both.
      { id: 'm-seo-again', projectId: 'p-target', name: 'seo', targetDate: '2027-01-01', position: 3, createdAt: '2026-09-07T09:00:00.000Z' },
      // Same name as the target's "Foundation" but another project — never a match.
      { id: 'm-other-foundation', projectId: 'p-other', name: 'Foundation', position: 0, createdAt: '2026-09-08T09:00:00.000Z' },
    ],
    tasks: [
      // A duplicate of an imported title — the import must still create a new task.
      { id: 't-existing-1', title: 'Configure WordPress API', status: 'in_progress' as const, priority: 'high' as const, projectId: 'p-target', projectMilestoneId: 'm-foundation', createdAt: '2026-09-09T09:00:00.000Z', tags: ['keep'], postponementCount: 0, archived: false },
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `t-existing-${i + 2}`, title: `Existing task ${i + 2}`, status: 'created' as const, priority: 'medium' as const,
        projectId: 'p-target' as const, ...(i % 3 === 0 ? { projectMilestoneId: 'm-backend' as const } : {}),
        createdAt: `2026-09-${String(10 + i).padStart(2, '0')}T09:00:00.000Z`, tags: [], postponementCount: 0, archived: false,
      })),
      // A timed task — its timer state must survive byte-identically.
      { id: 't-timed', title: 'Existing timed task', status: 'in_progress' as const, priority: 'high' as const, projectId: 'p-target', createdAt: '2026-09-21T09:00:00.000Z', actualDurationSeconds: 1234, startedAt: '2026-10-07T08:00:00.000Z', tags: [], postponementCount: 2, archived: false },
      { id: 't-other-1', title: 'Other project task', status: 'created' as const, priority: 'low' as const, projectId: 'p-other', projectMilestoneId: 'm-other-foundation', createdAt: '2026-09-22T09:00:00.000Z', tags: [], postponementCount: 0, archived: false },
      { id: 't-other-2', title: 'Another other task', status: 'created' as const, priority: 'low' as const, projectId: 'p-other', createdAt: '2026-09-23T09:00:00.000Z', tags: [], postponementCount: 0, archived: false },
    ],
  };
  const existingTaskIds = existing.tasks.map((t) => t.id);
  const existingMilestoneIds = existing.projectMilestones.map((m) => m.id);

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
    fingerprint(data.projects.filter((p) => p.id === 'p-target' || p.id === 'p-other')) === before.projects &&
    fingerprint(data.projectMilestones.filter((m) => existingMilestoneIds.includes(m.id))) === before.milestones &&
    fingerprint(data.tasks.filter((t) => existingTaskIds.includes(t.id))) === before.tasks;

  /**
   * The plan under test: one goal, one project, five milestones (three match
   * the target's by normalized name, two are new), seven milestone tasks, one
   * project-level task, one joined by reference, one root task.
   */
  const planJson = envelope({
    name: 'PatientScure Development Plan',
    goal: { id: 'g-plan', name: 'Build and grow PatientScure', deadline: '2026-12-31' },
    projects: [{
      id: 'p-plan',
      name: 'PatientScure Website',
      description: 'Marketing site plus the WordPress REST integration.',
      deadline: '2026-12-31',
      status: 'active',
      milestones: [
        { id: 'm1', name: 'Foundation', targetDate: '2026-10-15', description: 'Imported description — must NOT overwrite the existing milestone', tasks: [
          { id: 't1', title: 'Set up project structure', dueDate: '2026-10-10', priority: 'high' },
          { id: 't2', title: 'Configure WordPress API', dueDate: '2026-10-14' },
        ] },
        { id: 'm2', name: 'Backend', tasks: [{ id: 't3', title: 'Wire the REST API' }] },
        { id: 'm3', name: 'SEO', tasks: [{ id: 't4', title: 'Configure sitemap' }] },
        { id: 'm4', name: 'Launch', targetDate: '2027-01-31', tasks: [{ id: 't5', title: 'Prepare the launch checklist' }] },
        { id: 'm5', name: 'Analytics', tasks: [{ id: 't6', title: 'Add privacy-friendly analytics' }] },
      ],
      tasks: [
        { id: 't7', title: 'Renew the domain registration', dueDate: '2026-11-01' },
        { id: 't8', title: 'Prepare the launch checklist', milestoneId: 'm4' },
      ],
    }],
    tasks: [{ id: 't9', title: 'Review documentation', scheduledDate: '2026-10-09' }],
  });
  const targetProject: Project = JSON.parse(JSON.stringify(existing.projects[0]));
  const targetMilestones: ProjectMilestone[] = JSON.parse(JSON.stringify(existing.projectMilestones.filter((m) => m.projectId === 'p-target')));
  const targetTasks: Task[] = JSON.parse(JSON.stringify(existing.tasks.filter((t) => t.projectId === 'p-target')));

  /** The default resolution of the plan against the target project. */
  const resolveDefault = (choices: Record<string, string> = {}) =>
    resolveExistingProjectImport(review(planJson, { mode: 'add-to-existing-project' }), targetProject, targetMilestones, existing.tasks, choices);

  section('Fixture');
  ok(learningsFixture.length === 56 && new Set(learningsFixture.map((l) => l.id)).size === 56, 'Fixture: 56 learnings with 56 unique ids (the production count)');
  ok(existing.tasks.filter((t) => t.projectId === 'p-target').length === 12, 'Fixture: the target project has 12 existing tasks');
  ok(targetMilestones.length === 4 && targetMilestones.map((m) => m.position).join() === '0,1,2,3', 'Fixture: the target project has 4 existing milestones at positions 0–3');

  /* ================================================================ */
  /* 18/19. Validation: exactly one source project                       */
  /* ================================================================ */
  section('18/19. Add-to-existing validation: exactly one source project');
  {
    ok(review(planJson, { mode: 'add-to-existing-project' }).ok, '18: the plan validates in add-to-existing mode');
    const zero = review(envelope({ tasks: [{ title: 'Loose task' }] }), { mode: 'add-to-existing-project' });
    ok(!zero.ok && hasError(zero, 'exactly one project') && hasError(zero, 'none'), '19: zero source projects is refused');
    const two = review(envelope({ projects: [{ name: 'A' }, { name: 'B', tasks: [{ title: 'T' }] }] }), { mode: 'add-to-existing-project' });
    ok(!two.ok && hasError(two, 'exactly one project') && hasError(two, '2'), '18: more than one source project is refused, naming the count');
    ok(review(envelope({ projects: [{ name: 'A' }, { name: 'B', tasks: [{ title: 'T' }] }] })).ok,
      '18 (regression): the same plan is valid in create-new-project mode');
    ok(review(envelope({ tasks: [{ title: 'Loose task' }] })).ok,
      '19 (regression): a tasks-only plan stays valid in create-new-project mode');
    const rootWarn = review(envelope({ projects: [{ id: 'p1', name: 'S' }], tasks: [{ title: 'R' }] }), { mode: 'add-to-existing-project' });
    ok(rootWarn.ok && !rootWarn.warnings.some((w) => /sit in Tasks on its own/.test(w.message)),
      '19: the "sits in Tasks on its own" warning is suppressed in add-to-existing mode (root tasks become project-level tasks)');
    const noGoal = review(envelope({ projects: [{ id: 'p1', name: 'S', tasks: [{ title: 'T' }] }] }), { mode: 'add-to-existing-project' });
    ok(noGoal.ok && !noGoal.warnings.some((w) => /no goal/.test(w.message)),
      '19: the "no goal" warning is suppressed in add-to-existing mode (the plan goal is metadata only)');
    const bad = reviewText('{ "format": "focusdesk-project-plan", "version": 1, ', { mode: 'add-to-existing-project' });
    ok(!bad.ok && hasError(bad, 'not valid JSON'), '20: invalid JSON is refused in add-to-existing mode too');
  }

  /* ================================================================ */
  /* 6. Normalized exact-name matching                                   */
  /* ================================================================ */
  section('6. Milestone matching: normalized exact name, never fuzzy');
  {
    ok(normalizeProjectMilestoneName('  SEO  ') === 'seo', '6: trimming and case normalization');
    ok(normalizeProjectMilestoneName('SEO   Optimization') === 'seo optimization', '6: repeated whitespace collapses to one space');
    ok(normalizeProjectMilestoneName('SEO') !== normalizeProjectMilestoneName('SEO Optimization'),
      '6: "SEO" and "SEO Optimization" are NOT the same milestone — no fuzzy matching');
    const plan = review(planJson, { mode: 'add-to-existing-project' }).plan!;
    const mappings = planProjectMilestoneMappings(plan, 'p-target', existing.projectMilestones);
    ok(mappings.length === 5 && mappings.map((m) => m.name).join('|') === 'Foundation|Backend|SEO|Launch|Analytics',
      '6: every imported milestone is mapped, in the imported order');
    const byName = new Map(mappings.map((m) => [m.name, m]));
    ok(byName.get('Foundation')!.matches.map((m) => m.id).join() === 'm-foundation'
       && byName.get('Foundation')!.decision === 'use-existing' && byName.get('Foundation')!.existingMilestoneId === 'm-foundation',
      '6: "Foundation" matches the existing milestone and recommends Use existing');
    ok(byName.get('SEO')!.matches.map((m) => m.id).join() === 'm-seo,m-seo-again',
      '6: both existing "SEO"/"seo" milestones are listed as matches (existing names are normalized too)');
    ok(byName.get('SEO')!.existingMilestoneId === 'm-seo',
      '6: with several matches the default is the first in position order — deterministic, never a guess');
    ok(byName.get('Launch')!.matches.length === 0 && byName.get('Launch')!.decision === 'create-new'
       && byName.get('Analytics')!.decision === 'create-new',
      '6: milestones with no match default to Create new');
    ok(mappings.every((m) => m.matches.every((match) => match.projectId === undefined || true)) &&
       byName.get('Foundation')!.matches.every((m) => !['m-other-foundation'].includes(m.id)),
      '6: a milestone of ANOTHER project with the same name is never a match');
    ok(byName.get('Foundation')!.taskCount === 2 && byName.get('Launch')!.taskCount === 2 && byName.get('Analytics')!.taskCount === 1,
      '6: each mapping counts the imported tasks nested under it (a reference by milestoneId counts too)');
  }

  /* ================================================================ */
  /* 7/9. Mapping choices                                                */
  /* ================================================================ */
  section('7/9. The user resolves the mappings');
  {
    const explicit = resolveDefault({ m3: 'm-seo-again' });
    ok(explicit.mappings.find((m) => m.tempId === 'm3')!.existingMilestoneId === 'm-seo-again',
      '7: an existing milestone can be selected explicitly (the second "seo" match)');
    const forced = resolveDefault({ m1: 'create-new' });
    const foundation = forced.mappings.find((m) => m.tempId === 'm1')!;
    ok(foundation.decision === 'create-new' && foundation.existingMilestoneId === undefined,
      '9: Create New can be chosen even for an exact name match (a second "Foundation" is intentional)');
    const threw = (() => { try { resolveDefault({ m1: 'm-other-foundation' }); return null; } catch (e) { return e as Error; } })();
    ok(threw instanceof ProjectPlanError && /not a name match/.test(threw.message),
      '21: a mapping to another project’s milestone is refused — a mapping can never leave the target project');
    const two = review(envelope({
      projects: [{ id: 'p1', name: 'S', milestones: [
        { id: 'a', name: 'Foundation', tasks: [{ title: 'One' }] },
        { id: 'b', name: ' foundation ', tasks: [{ title: 'Two' }] },
      ] }],
    }), { mode: 'add-to-existing-project' });
    const resolvedTwo = resolveExistingProjectImport(two, targetProject, targetMilestones, existing.tasks);
    ok(resolvedTwo.mappings.every((m) => m.decision === 'use-existing' && m.existingMilestoneId === 'm-foundation'),
      '7: two imported milestones may default to the same existing milestone');
    ok(findExistingProjectImportWarnings(resolvedTwo).length === 1
       && /both use the existing milestone/.test(findExistingProjectImportWarnings(resolvedTwo)[0]),
      '7: …and the preview warns that their tasks will share it, so the user can switch one to Create new');
    ok(findExistingProjectImportWarnings(resolveDefault()).length === 0, '7: no warning when every mapping is unambiguous');
  }

  /* ================================================================ */
  /* Resolution, preview, integrity (pure)                               */
  /* ================================================================ */
  section('Resolution and preview (pure)');
  {
    const resolved = resolveDefault();
    ok(resolved.mode === 'add-to-existing-project' && resolved.targetProject.id === 'p-target', 'Resolve: the target project is carried, never written');
    ok(resolved.sourceProject.name === 'PatientScure Website' && resolved.sourceGoal?.name === 'Build and grow PatientScure',
      'Resolve: the plan’s project and goal are kept as source metadata only');
    ok(resolved.planName === 'PatientScure Development Plan', 'Resolve: the plan name is kept for the preview');
    ok(resolved.positionBase === 4, 'Resolve: positionBase is the first position after the existing milestones (max 3 + 1)');
    ok(JSON.stringify(resolved.counts) === JSON.stringify({ newMilestones: 2, reusedMilestones: 3, milestoneTasks: 7, projectLevelTasks: 1, rootTasks: 1, newTasks: 9, parentTasks: 9, subtasks: 0 }),
      'Resolve: the counts are 2 new + 3 reused milestones, 7 milestone tasks, 1 project-level, 1 root, 9 new tasks');
    ok(resolved.existing.milestones === 4 && resolved.existing.tasks === 12, 'Resolve: the existing-data summary counts the target’s own records');
    const preview = existingProjectImportPreview(resolved);
    ok(preview.targetProject.name === 'PatientScure' && preview.sourceProject.name === 'PatientScure Website'
       && preview.sourceGoal?.name === 'Build and grow PatientScure',
      'Preview: TARGET PROJECT and SOURCE PLAN are both shown, goal included');
    ok(preview.rootTasks.length === 1 && preview.rootTasks[0].title === 'Review documentation'
       && preview.projectLevelTasks.length === 1 && preview.projectLevelTasks[0].title === 'Renew the domain registration',
      '15: the preview separates the root task (→ project-level) from the project-level task');
    ok(preview.milestones.find((m) => m.mapping.tempId === 'm1')!.tasks.length === 2
       && preview.milestones.find((m) => m.mapping.tempId === 'm4')!.tasks.length === 2,
      'Preview: milestone rows carry their tasks, including the one joined by milestoneId');

    const crossProject: ResolvedExistingProjectImport = {
      ...resolveDefault(),
      mappings: resolveDefault().mappings.map((m) => (m.tempId === 'm1' ? { ...m, decision: 'use-existing' as const, existingMilestoneId: 'm-other-foundation' } : m)),
    };
    ok(findExistingProjectImportProblems(crossProject, existing.projectMilestones).some((p) => /does not belong to project/.test(p)),
      '21: a mapping to another project’s milestone is an integrity problem');
    const threw = (() => { try { buildExistingProjectPlanRecords(crossProject, { newId: createId, now: () => 'x' }, targetMilestones); return null; } catch (e) { return e as Error; } })();
    ok(threw instanceof ProjectPlanError && /nothing was created/i.test(threw.message),
      '21: the builder refuses it before anything is built — a cross-project milestone reference cannot occur');
    const dangling: ResolvedExistingProjectImport = {
      ...resolveDefault(),
      tasks: [...resolveDefault().tasks, { tempId: 't-x', projectTempId: 'p-plan', projectMilestoneTempId: 'm-nope', title: 'X', status: 'created', priority: 'medium', tags: [] }],
    };
    ok(findExistingProjectImportProblems(dangling, existing.projectMilestones).some((p) => /not in the plan/.test(p)),
      '21: a task referring to a milestone outside the plan is an integrity problem');
  }

  /* ================================================================ */
  /* 10–17, 21. The record builder (pure)                                */
  /* ================================================================ */
  section('10–17. Building the records');
  {
    const resolved = resolveDefault();
    const built = buildExistingProjectPlanRecords(resolved, { newId: createId, now: () => '2026-10-07T10:00:00.000Z' }, targetMilestones);
    ok(built.projectMilestones.length === 2 && built.tasks.length === 9, '1: the builder produces exactly 2 new milestones and 9 new tasks — no goal, no project');
    ok(built.idOf.get('p-plan') === 'p-target', '2: the source project’s temporary id maps to the TARGET project’s real id');
    ok(built.idOf.get('m1') === 'm-foundation' && built.idOf.get('m3') === 'm-seo', '7: reused milestones keep their real ids in the map');

    const launch = built.projectMilestones.find((m) => m.name === 'Launch')!;
    const analytics = built.projectMilestones.find((m) => m.name === 'Analytics')!;
    ok(launch.projectId === 'p-target' && launch.position === 4 && analytics.position === 5,
      '11: new milestones are appended after the existing ones (4, 5), in the imported order');
    ok(launch.targetDate === '2027-01-31' && launch.description === undefined && launch.createdAt === '2026-10-07T10:00:00.000Z',
      '10: a new milestone is created correctly (own fields, fresh id, one shared timestamp)');
    ok(UUID.test(launch.id) && UUID.test(analytics.id) && launch.id !== 'm4', '10: new milestones get fresh FocusDesk ids, never the temporary ones');

    const byTitle = new Map(built.tasks.map((t) => [t.title, t]));
    ok(built.tasks.every((t) => t.projectId === 'p-target'), '14/15: every new task belongs to the target project');
    ok(byTitle.get('Set up project structure')!.projectMilestoneId === 'm-foundation'
       && byTitle.get('Wire the REST API')!.projectMilestoneId === 'm-backend'
       && byTitle.get('Configure sitemap')!.projectMilestoneId === 'm-seo',
      '12: tasks under a reused milestone point at the EXISTING milestone id');
    ok(byTitle.get('Prepare the launch checklist')!.projectMilestoneId === launch.id
       && byTitle.get('Add privacy-friendly analytics')!.projectMilestoneId === analytics.id,
      '13: tasks under a new milestone point at the NEW milestone id');
    ok(byTitle.get('Renew the domain registration')!.projectMilestoneId === undefined
       && byTitle.get('Review documentation')!.projectMilestoneId === undefined,
      '14/15: the project-level task and the ROOT task both become project-level tasks (no milestone)');
    ok(built.tasks.filter((t) => t.title === 'Prepare the launch checklist').length === 2,
      '17: a duplicate title inside the plan still creates two new tasks');
    ok(built.tasks.every((t) => t.goalId === undefined && t.postponementCount === 0 && t.archived === false && UUID.test(t.id)),
      '10: the fields a plan cannot set keep their defaults; every task gets a fresh id');
    ok(findProjectMilestoneProblems({ projects: [targetProject], projectMilestones: [...targetMilestones, ...built.projectMilestones], tasks: built.tasks }).length === 0,
      '21: the built records satisfy the app-wide project-milestone invariant (no cross-project reference can occur)');

    // The existing milestone is reused, not modified: the builder never emits it.
    ok(!built.projectMilestones.some((m) => m.id === 'm-foundation') && !built.idOf.has('m-foundation'),
      '8: a reused milestone is not rebuilt — the existing record cannot be overwritten');
  }

  /* ================================================================ */
  /* 1–5, 8, 16, 17, 20, 22. Local storage                               */
  /* ================================================================ */
  section('1–5, 8, 16, 17, 20, 22. Local storage: add to the existing project');
  let localResult: Awaited<ReturnType<LocalRepository['importProjectPlanIntoExistingProject']>>;
  {
    const store = memoryStore();
    store.setItem(STORAGE_KEY, JSON.stringify(legacyBlob()));
    const repo = new LocalRepository(store);
    const writesBefore = store.writes;
    const rawBefore = store.getItem(STORAGE_KEY);

    localResult = await repo.importProjectPlanIntoExistingProject(resolveDefault());
    ok(localResult.projectMilestones.length === 2 && localResult.tasks.length === 9, '1/22: the local import adds 2 milestones and 9 tasks to the existing project');
    ok(store.writes === writesBefore + 1, '1/22: the whole import was written to storage in exactly one write (atomic for local storage)');

    const data = await repo.exportData();
    ok(unchanged(data), '3/4/8/16: the learnings, the goal, BOTH projects, all 5 existing milestones and all 14 existing tasks are byte-identical');
    ok(data.projects.length === 2 && data.goals.length === 1, '2/5: no project was duplicated and the imported goal was NOT created');
    ok(data.projects.find((p) => p.id === 'p-target')!.description === 'Do not touch'
       && data.projects.find((p) => p.id === 'p-target')!.goalId === 'g-existing'
       && data.projects.find((p) => p.id === 'p-target')!.deadline === '2026-12-01',
      '3: the target project’s fields (name, description, deadline, status, goal) are unchanged');
    ok(data.projectMilestones.find((m) => m.id === 'm-foundation')!.description === 'Existing description'
       && data.projectMilestones.find((m) => m.id === 'm-foundation')!.targetDate === '2026-10-01'
       && data.projectMilestones.find((m) => m.id === 'm-foundation')!.position === 0,
      '8: the reused milestone is unchanged — the imported description/targetDate/position did NOT overwrite it');
    ok(data.tasks.find((t) => t.id === 't-timed')!.actualDurationSeconds === 1234
       && data.tasks.find((t) => t.id === 't-timed')!.postponementCount === 2,
      '16: an existing task, including its timer state, is untouched');
    ok(data.tasks.filter((t) => t.title === 'Configure WordPress API').length === 2,
      '17: the duplicate title exists twice — the existing task AND a new task; nothing was merged');
    const newRoot = data.tasks.find((t) => t.title === 'Review documentation')!;
    ok(newRoot.projectId === 'p-target' && newRoot.projectMilestoneId === undefined,
      '15: the root task became a project-level task of the target project');
    ok(data.projectMilestones.filter((m) => m.projectId === 'p-target').map((m) => m.position).sort((a, b) => a - b).join() === '0,1,2,3,4,5',
      '11: the target now holds its 4 original milestones (positions untouched) plus the 2 new ones at 4 and 5');
    ok(findProjectMilestoneProblems({ projects: data.projects, projectMilestones: data.projectMilestones, tasks: data.tasks }).length === 0,
      '21: the whole database still satisfies the project-milestone invariant');

    // A target project that is gone is refused, with nothing written.
    const missing = { ...resolveDefault(), targetProject: { ...targetProject, id: 'p-gone', name: 'Gone' } };
    const refused = await rejects(() => repo.importProjectPlanIntoExistingProject(missing));
    ok(refused instanceof ProjectPlanError && /no longer exists/.test(refused.message), '20: a missing target project is refused with a readable error');
    ok(store.writes === writesBefore + 1 && (await repo.exportData()).projects.length === 2, '20: the refusal wrote nothing');

    // An inconsistent hand-built import is refused, with nothing written.
    const crossProject: ResolvedExistingProjectImport = {
      ...resolveDefault(),
      mappings: resolveDefault().mappings.map((m) => (m.tempId === 'm1' ? { ...m, decision: 'use-existing' as const, existingMilestoneId: 'm-other-foundation' } : m)),
    };
    const refused2 = await rejects(() => repo.importProjectPlanIntoExistingProject(crossProject));
    ok(refused2 instanceof ProjectPlanError && /nothing was created/i.test(refused2.message), '21: a cross-project mapping is refused by the repository');
    ok(store.writes === writesBefore + 1, '21: the refusal wrote nothing');
    ok(rawBefore !== store.getItem(STORAGE_KEY), '20: storage was rewritten by the successful import (and only by it)');
  }

  /* ================================================================ */
  /* 20, 23, 24. Supabase                                               */
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
      auth: { persistSession: false, autoRefreshToken: false, storageKey: `verify-phase5-${clients}` },
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
    server.tables.get('goals')!.rows.push({ id: 'g-existing', user_id: USER, name: 'Grow PatientScure', description: 'The real goal', deadline: null, status: 'active', created_at: '2026-09-01T09:00:00.000Z' });
    server.tables.get('projects')!.rows.push(
      { id: 'p-target', user_id: USER, name: 'PatientScure', description: 'Do not touch', goal_id: 'g-existing', deadline: '2026-12-01', status: 'active', created_at: '2026-09-02T09:00:00.000Z' },
      { id: 'p-other', user_id: USER, name: 'Other Project', description: null, goal_id: null, deadline: null, status: 'on_hold', created_at: '2026-09-03T09:00:00.000Z' },
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
      server.tables.get('project_milestones')!.rows.push(
        { id: 'm-foundation', user_id: USER, project_id: 'p-target', name: 'Foundation', description: 'Existing description', target_date: '2026-10-01', position: 0, created_at: '2026-09-04T09:00:00.000Z' },
        { id: 'm-backend', user_id: USER, project_id: 'p-target', name: 'Backend', description: null, target_date: null, position: 1, created_at: '2026-09-05T09:00:00.000Z' },
        { id: 'm-seo', user_id: USER, project_id: 'p-target', name: 'SEO', description: null, target_date: null, position: 2, created_at: '2026-09-06T09:00:00.000Z' },
        { id: 'm-seo-again', user_id: USER, project_id: 'p-target', name: 'seo', description: null, target_date: '2027-01-01', position: 3, created_at: '2026-09-07T09:00:00.000Z' },
        { id: 'm-other-foundation', user_id: USER, project_id: 'p-other', name: 'Foundation', description: null, target_date: null, position: 0, created_at: '2026-09-08T09:00:00.000Z' },
      );
    }
    return {
      learnings: JSON.stringify(server.tables.get('milestones')!.rows),
      goals: JSON.stringify(server.tables.get('goals')!.rows),
      projects: JSON.stringify(server.tables.get('projects')!.rows),
      tasks: JSON.stringify(server.tables.get('tasks')!.rows),
      milestones: server.tables.has('project_milestones') ? JSON.stringify(server.tables.get('project_milestones')!.rows) : '[]',
    };
  };

  section('1–5, 8, 12–17, 23. Supabase with migration 008');
  {
    const { server, repo } = supabaseFor(migratedSchema);
    const snapshot = seed(server);
    const at = server.log.length;
    const created = await repo.importProjectPlanIntoExistingProject(resolveDefault());
    const requests = server.log.slice(at);
    const inserts = requests.filter((r) => r.method === 'POST').map((r) => r.table);

    ok(inserts.every((t) => t === PROJECT_MILESTONES_TABLE || t === 'tasks') && inserts.indexOf(PROJECT_MILESTONES_TABLE) < inserts.indexOf('tasks'),
      `23: only project_milestones and tasks are inserted, parents-first (${[...new Set(inserts)].join(' → ')})`);
    ok(!inserts.includes('goals') && !inserts.includes('projects'),
      '2/5: no goal and no project row is ever written — the imported goal is not created, the project is not duplicated');
    ok(requests.filter((r) => r.method === 'PATCH').length === 0 && requests.filter((r) => r.method === 'DELETE').length === 0,
      '3/4/8/16: the import issued no UPDATE and no DELETE — nothing existing could have been modified');
    ok(server.tables.get('milestones')!.rows.length === 56 && JSON.stringify(server.tables.get('milestones')!.rows) === snapshot.learnings,
      '20: the 56 learning rows are byte-identical afterwards');
    ok(JSON.stringify(server.tables.get('goals')!.rows) === snapshot.goals
       && JSON.stringify(server.tables.get('projects')!.rows) === snapshot.projects,
      '3/4: the existing goal and both projects are byte-identical');
    ok(JSON.stringify(server.tables.get('project_milestones')!.rows.filter((r) => r.id === 'm-foundation')) === JSON.stringify([{
      id: 'm-foundation', user_id: USER, project_id: 'p-target', name: 'Foundation', description: 'Existing description',
      target_date: '2026-10-01', position: 0, created_at: '2026-09-04T09:00:00.000Z',
    }]), '8: the reused milestone is byte-identical — the imported description/targetDate did not overwrite it');
    ok(JSON.stringify(server.tables.get('tasks')!.rows.filter((r) => r.id === 't-timed')) === JSON.stringify([{
      id: 't-timed', user_id: USER, title: 'Existing timed task', description: null, status: 'in_progress', priority: 'high',
      project_id: 'p-target', goal_id: null, parent_task_id: null, created_at: '2026-09-21T09:00:00.000Z',
      scheduled_date: null, due_date: null, completed_at: null, estimated_duration: null, actual_duration: null,
      started_at: null, paused_at: null, actual_duration_seconds: null, reminder: null, notes: null,
      tags: [], recurrence: null, postponement_count: 2, archived: false,
    }]), '16: the existing timed task is byte-identical');

    const inserted = requests.filter((r) => r.method === 'POST').flatMap((r) => (Array.isArray(r.body) ? r.body : [r.body]) as Row[]);
    ok(inserted.length === 2 + 9 && inserted.every((row) => row.user_id === USER),
      '23: all 11 inserted rows carry the signed-in user’s id — never one from the JSON');
    ok(requests.every((r) => (r.method === 'POST'
      ? (Array.isArray(r.body) ? r.body : [r.body]).every((row: Row) => row.user_id === USER)
      : r.query.get('user_id') === `eq.${USER}`)),
      '23: every request is scoped to the authenticated user, so RLS applies as usual');

    const milestoneRows = server.tables.get('project_milestones')!.rows.filter((r) => r.project_id === 'p-target' && !['m-foundation', 'm-backend', 'm-seo', 'm-seo-again'].includes(String(r.id)));
    ok(milestoneRows.length === 2 && milestoneRows.every((r) => UUID.test(String(r.id))), '10/23: two new milestones with generated ids belong to the target project');
    ok(milestoneRows.slice().sort((a, b) => Number(a.position) - Number(b.position)).map((r) => `${r.name}@${r.position}`).join('|') === 'Launch@4|Analytics@5',
      '11/23: the new milestones sit at positions 4 and 5, after the existing ones (which keep 0–3)');

    const taskRows = server.tables.get('tasks')!.rows.filter((r) => !existingTaskIds.includes(String(r.id)));
    ok(taskRows.length === 9 && taskRows.every((r) => r.project_id === 'p-target'), '14/15/23: all 9 new tasks carry the target project’s id');
    const row = (title: string) => taskRows.find((r) => r.title === title)!;
    ok(row('Set up project structure').project_milestone_id === 'm-foundation'
       && row('Wire the REST API').project_milestone_id === 'm-backend'
       && row('Configure sitemap').project_milestone_id === 'm-seo',
      '12/23: tasks under reused milestones point at the existing milestone ids');
    const launchRow = milestoneRows.find((r) => r.name === 'Launch')!;
    ok(row('Prepare the launch checklist').project_milestone_id === launchRow.id,
      '13/23: tasks under a new milestone point at the new milestone id');
    ok(row('Renew the domain registration').project_milestone_id === null
       && row('Review documentation').project_milestone_id === null,
      '14/15/23: the project-level task and the root task are stored with a null milestone');
    ok(taskRows.filter((r) => r.title === 'Configure WordPress API').length === 1
       && server.tables.get('tasks')!.rows.filter((r) => r.title === 'Configure WordPress API').length === 2,
      '17/23: the duplicate title exists twice — the existing row and a new row; nothing was merged');
    ok(created.projectMilestones.length === 2 && created.tasks.length === 9, '23: the repository returns the records it wrote');
    ok(findProjectMilestoneProblems({
      projects: (await repo.projects.list()),
      projectMilestones: (await repo.projectMilestones.list()),
      tasks: (await repo.tasks.list()),
    }).length === 0, '21/23: reading the database back satisfies the project-milestone invariant');
    ok(writes(server.log, LEARNINGS_TABLE).length === 0, '20/23: nothing was ever written to the learnings table');
  }

  section('20. Supabase: a missing or foreign target project is refused');
  {
    const { server, repo } = supabaseFor(migratedSchema);
    seed(server);
    // Somebody else's project, with the very id the resolved import would name.
    server.tables.get('projects')!.rows.push({ id: 'p-foreign', user_id: OTHER, name: 'PatientScure', description: null, goal_id: null, deadline: null, status: 'active', created_at: '2026-01-01T00:00:00.000Z' });
    const at = server.log.length;
    const foreign = { ...resolveDefault(), targetProject: { ...targetProject, id: 'p-foreign' } };
    const refused = await rejects(() => repo.importProjectPlanIntoExistingProject(foreign));
    ok(refused instanceof ProjectPlanError && /does not exist/.test(refused.message),
      '20: a target project that belongs to another user is refused (the read is user-scoped)');
    ok(writes(server.log.slice(at)).length === 0, '20: the refusal happened before any write request');
    const missing = { ...resolveDefault(), targetProject: { ...targetProject, id: 'p-gone', name: 'Gone' } };
    const refused2 = await rejects(() => repo.importProjectPlanIntoExistingProject(missing));
    ok(refused2 instanceof ProjectPlanError && writes(server.log.slice(at)).length === 0, '20: a deleted target project is refused with zero writes');
    ok(server.tables.get('projects')!.rows.find((r) => r.id === 'p-foreign')!.user_id === OTHER, '20: the other user’s project is untouched');
  }

  section('23. Supabase without migration 008');
  {
    const { server, repo } = supabaseFor(legacySchema);
    seed(server);
    ok((await repo.supportsProjectMilestones()) === false, '23: the capability probe reports Project Milestones as unavailable');
    const at = server.log.length;
    const refused = await rejects(() => repo.importProjectPlanIntoExistingProject(resolveDefault()));
    ok(refused instanceof ProjectPlanError && /008_project_milestones.sql/.test(refused.message),
      '23: an import that would create milestones is refused, naming the migration');
    ok(writes(server.log.slice(at)).length === 0, '23: the refusal happened before any write request');
    ok(server.tables.get('milestones')!.rows.length === 56 && server.tables.get('projects')!.rows.length === 2, '23: the database is untouched');

    // A plan with no milestones still adds its tasks to the existing project.
    const plain = review(envelope({
      projects: [{ id: 'p1', name: 'PatientScure Website', tasks: [{ title: 'Set up' }, { title: 'Ship' }] }],
    }), { mode: 'add-to-existing-project' });
    const at2 = server.log.length;
    const created = await repo.importProjectPlanIntoExistingProject(
      resolveExistingProjectImport(plain, targetProject, [], existing.tasks),
    );
    ok(created.projectMilestones.length === 0 && created.tasks.length === 2, '23: a milestone-free plan still adds its tasks on an unmigrated database');
    const taskInserts = server.log.slice(at2).filter((r) => r.method === 'POST' && r.table === 'tasks');
    ok(taskInserts.length === 1 && (taskInserts[0].body as Row[]).every((r) => !('project_milestone_id' in r) && r.project_id === 'p-target'),
      '23: task inserts leave the missing column out entirely and carry the target project (the fake rejects unknown columns like PostgREST)');
    ok(server.tables.get('milestones')!.rows.length === 56, '23: the learnings table is still untouched');
  }

  section('24. Supabase: a failed write is undone');
  {
    const { server, repo } = supabaseFor(migratedSchema);
    const snapshot = seed(server);
    server.fail = (method, table) => method === 'POST' && table === 'tasks';
    const originalError = console.error;
    console.error = () => {};
    let error: Error | null = null;
    try {
      error = await rejects(() => repo.importProjectPlanIntoExistingProject(resolveDefault()));
    } finally {
      console.error = originalError;
    }
    ok(error instanceof ProjectPlanError && /nothing was kept/.test(error.message), '24: a failed import reports that nothing was kept, with the reason');
    ok(server.tables.get('tasks')!.rows.length === 14, '24: no task row survived the failure');
    ok(server.tables.get('project_milestones')!.rows.length === 5
       && JSON.stringify(server.tables.get('project_milestones')!.rows.find((r) => r.id === 'm-foundation')) === JSON.stringify({
         id: 'm-foundation', user_id: USER, project_id: 'p-target', name: 'Foundation', description: 'Existing description',
         target_date: '2026-10-01', position: 0, created_at: '2026-09-04T09:00:00.000Z',
       }), '24: the milestones this import created were rolled back, and the existing ones are byte-identical');
    const deletes = server.log.filter((r) => r.method === 'DELETE');
    ok(deletes.length === 2 && deletes.map((r) => r.table).join() === `tasks,${PROJECT_MILESTONES_TABLE}`
       && deletes.every((r) => r.query.get('user_id') === `eq.${USER}` && (r.query.get('id') ?? '').startsWith('in.')),
      '24: the rollback deleted only this import’s own rows, by id and scoped to the user');
    ok(JSON.stringify(server.tables.get('milestones')!.rows) === snapshot.learnings
       && JSON.stringify(server.tables.get('tasks')!.rows) === snapshot.tasks
       && JSON.stringify(server.tables.get('projects')!.rows) === snapshot.projects,
      '24: the learnings, the pre-existing tasks and the projects are byte-identical after the rollback');
    server.fail = null;

    // A failure on the milestone insert itself leaves nothing behind either.
    server.fail = (method, table) => method === 'POST' && table === PROJECT_MILESTONES_TABLE;
    const atFail = server.log.length;
    console.error = () => {};
    try {
      error = await rejects(() => repo.importProjectPlanIntoExistingProject(resolveDefault()));
    } finally {
      console.error = originalError;
    }
    ok(error instanceof ProjectPlanError && /nothing was kept/.test(error.message), '24: a failed milestone insert is reported as nothing kept');
    ok(server.tables.get('project_milestones')!.rows.length === 5 && server.tables.get('tasks')!.rows.length === 14,
      '24: no milestone and no task row survived it');
    ok(server.log.slice(atFail).filter((r) => r.method === 'POST' && r.table === 'tasks').length === 0,
      '24: the task insert was never attempted after the milestone failure (parents-first)');
    server.fail = null;
    const retry = await repo.importProjectPlanIntoExistingProject(resolveDefault());
    ok(retry.tasks.length === 9, '24: the repository still works normally after a rolled-back import');
  }

  /* ================================================================ */
  /* 1, 6–15, 20. The real UI: Settings → Data → Import Project Plan      */
  /* ================================================================ */
  const { AuthProvider } = await import('../components/auth/auth-provider');
  const { DataProvider, useData } = await import('../components/data/data-provider');
  const { SettingsScreen } = await import('../components/settings/settings-screen');

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
  const choose = async (element: HTMLSelectElement | null, value: string, what: string) => {
    if (!element) throw new Error(`Missing select: ${what}`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value')!.set!.call(element, value);
      element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 20));
    });
  };
  const button = (text: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  const bodyText = () => document.body.textContent ?? '';
  const persisted = () => new LocalRepository(dom.window.localStorage).exportData();
  const planArea = () => document.querySelector('textarea[aria-label="Project plan JSON"]') as HTMLTextAreaElement | null;
  const targetSelect = () => document.querySelector('select[aria-label="Target project"]') as HTMLSelectElement | null;
  const mappingSelect = (name: string) =>
    document.querySelector(`select[aria-label="Mapping for milestone “${name}”"]`) as HTMLSelectElement | null;
  const addButton = () => button('Add to project') ?? button('Adding…');

  section('1, 6–15, 20. The importer UI: mode → target → plan → mapping → import');
  dom.window.localStorage.clear();
  dom.window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyBlob()));
  await mount(React.createElement(SettingsScreen));
  ok(c().ready && c().data.projects.length === 2 && c().data.projectMilestones.length === 5, '1: Settings loads with the existing projects and milestones');

  // Snapshots taken BEFORE the import. The provider recovers an interrupted
  // timer on load (startedAt → pausedAt), so "unchanged" is measured against
  // the mounted state and storage, not against the raw fixture.
  const stateFingerprints = () => {
    const d = c().data;
    return {
      learnings: fingerprint(d.learnings),
      goals: fingerprint(d.goals.filter((g) => g.id === 'g-existing')),
      projects: fingerprint(d.projects.filter((p) => p.id === 'p-target' || p.id === 'p-other')),
      milestones: fingerprint(d.projectMilestones.filter((m) => existingMilestoneIds.includes(m.id))),
      tasks: fingerprint(d.tasks.filter((t) => existingTaskIds.includes(t.id))),
    };
  };
  const storedFingerprints = async () => {
    const d = await persisted();
    return {
      learnings: fingerprint(d.learnings),
      goals: fingerprint(d.goals.filter((g) => g.id === 'g-existing')),
      projects: fingerprint(d.projects.filter((p) => p.id === 'p-target' || p.id === 'p-other')),
      milestones: fingerprint(d.projectMilestones.filter((m) => existingMilestoneIds.includes(m.id))),
      tasks: fingerprint(d.tasks.filter((t) => existingTaskIds.includes(t.id))),
    };
  };
  const sameFingerprints = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const beforeState = stateFingerprints();
  const beforeStored = await storedFingerprints();

  await click(button('Import Project Plan'), 'Import Project Plan');
  ok(bodyText().includes('Import project plan') && planArea() !== null, '1: the importer opens');
  ok(button('Create New Project') !== undefined && button('Add to Existing Project') !== undefined,
    '1: the mode switch offers Create New Project and Add to Existing Project');
  ok(button('Import plan') !== null && button('Import plan')!.hasAttribute('disabled'), '1 (regression): Create New Project is the default mode, Import disabled before a plan');

  // Switch to Add to Existing Project.
  await click(button('Add to Existing Project'), 'Add to Existing Project');
  ok(targetSelect() !== null, '1: the target-project selector appears');
  ok(addButton()!.hasAttribute('disabled'), '1: Add is disabled before a target project is chosen');
  await typeInto(planArea(), JSON.stringify(planJson));
  ok(addButton()!.hasAttribute('disabled'), '1: Add stays disabled without a target project, even with a valid plan');
  ok(bodyText().includes('Choose a project above'), '1: the preview asks for the target project first');

  // Choose the target project.
  await choose(targetSelect(), 'p-target', 'Target project');
  const rawBefore = dom.window.localStorage.getItem(STORAGE_KEY);
  ok(bodyText().includes('Target project') && bodyText().includes('PatientScure')
     && bodyText().includes('Source plan') && bodyText().includes('PatientScure Website'),
    '1: the preview shows TARGET PROJECT and SOURCE PLAN');
  ok(bodyText().includes('existing project goal will be preserved') && bodyText().includes('Build and grow PatientScure')
     && bodyText().includes('will not be created or applied'),
    '5: the preview states the goal behavior — the existing goal is preserved, the plan’s goal is not created');
  ok(bodyText().includes('4 existing milestones') && bodyText().includes('12 existing tasks')
     && bodyText().includes('No existing task, milestone, project or goal will be modified'),
    '1: the preview’s "Existing data" box states what remains unchanged');
  ok(bodyText().includes('root task') && bodyText().includes('project-level task'),
    '15: the preview labels the root task → project-level task');
  ok(bodyText().includes('Every task is created new') && bodyText().includes('same title'),
    '17: the preview states that duplicate titles still create new tasks');
  ok(mappingSelect('Foundation') !== null && mappingSelect('Launch') !== null && mappingSelect('SEO') !== null,
    '6: every imported milestone has a mapping control');
  ok(mappingSelect('Foundation')!.value === 'm-foundation' && mappingSelect('Backend')!.value === 'm-backend',
    '6: exact normalized-name matches default to Use existing');
  ok(mappingSelect('SEO')!.value === 'm-seo', '6: the first match in position order is the default');
  ok(mappingSelect('Launch')!.value === 'create-new' && mappingSelect('Analytics')!.value === 'create-new',
    '6: unmatched milestones default to Create new');
  ok(Array.from(mappingSelect('SEO')!.options).map((o) => o.textContent).join('|') === 'Create new milestone|Use existing: SEO|Use existing: seo',
    '7: every name match is offered when several existing milestones share a name');
  ok(!addButton()!.hasAttribute('disabled'), '1: Add becomes available once the plan is valid and mapped');
  ok(dom.window.localStorage.getItem(STORAGE_KEY) === rawBefore, '20: parsing, validation, target selection and preview performed ZERO writes');

  // Flip Foundation to Create new — the user can always choose.
  await choose(mappingSelect('Foundation')!, 'create-new', 'Mapping for milestone “Foundation”');
  ok(mappingSelect('Foundation')!.value === 'create-new', '9: Use Existing → Create New can be flipped for an exact-name match');
  ok(bodyText().includes('Create new milestone — appended after the project’s existing milestones'),
    '9: the mapping row explains the consequence of the choice');
  ok(dom.window.localStorage.getItem(STORAGE_KEY) === rawBefore, '20: changing a mapping still performs ZERO writes');

  // Import.
  await click(addButton(), 'Add to project');
  await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
  ok(bodyText().includes('Added to PatientScure'), '1: the result screen names the target project');
  ok(bodyText().includes('Milestones added') && bodyText().includes('Tasks added'), '1: the result reports what was added');
  {
    const data = c().data;
    ok(data.projects.length === 2 && data.goals.length === 1, '2/5: the app state has no new project and no new goal');
    ok(data.projects.find((p) => p.id === 'p-target')!.description === 'Do not touch'
       && data.projects.find((p) => p.id === 'p-target')!.goalId === 'g-existing',
      '3/4: the target project and its goal relationship are unchanged in the app state');
    ok(sameFingerprints(stateFingerprints(), beforeState), '3/4/8/16: every pre-existing record is byte-identical in the app state');
    const own = data.projectMilestones.filter((m) => m.projectId === 'p-target');
    ok(own.length === 7 && own.filter((m) => existingMilestoneIds.includes(m.id)).length === 4,
      '10/11: the target has its 4 original milestones plus 3 new ones (Foundation was flipped to Create new)');
    ok(own.filter((m) => !existingMilestoneIds.includes(m.id)).map((m) => `${m.name}@${m.position}`).sort().join('|') === 'Analytics@6|Foundation@4|Launch@5',
      '11: the new milestones sit at 4, 5, 6 in the imported order, after the untouched 0–3');
    const newTasks = data.tasks.filter((t) => !existingTaskIds.includes(t.id));
    ok(newTasks.length === 9 && newTasks.every((t) => t.projectId === 'p-target'), '12–15: 9 new tasks, all bound to the target project');
    const newFoundation = own.find((m) => m.name === 'Foundation' && !existingMilestoneIds.includes(m.id))!;
    ok(newTasks.find((t) => t.title === 'Set up project structure')!.projectMilestoneId === newFoundation.id,
      '13: the task under the flipped milestone points at the NEW "Foundation"');
    ok(newTasks.find((t) => t.title === 'Configure sitemap')!.projectMilestoneId === 'm-seo'
       && newTasks.find((t) => t.title === 'Wire the REST API')!.projectMilestoneId === 'm-backend',
      '12: tasks under reused milestones point at the existing milestone ids');
    ok(newTasks.find((t) => t.title === 'Review documentation')!.projectMilestoneId === undefined
       && newTasks.find((t) => t.title === 'Renew the domain registration')!.projectMilestoneId === undefined,
      '14/15: the root task and the project-level task have no milestone');
    ok(newTasks.filter((t) => t.title === 'Configure WordPress API').length === 1
       && data.tasks.filter((t) => t.title === 'Configure WordPress API').length === 2,
      '17: the duplicate title exists twice — nothing was merged or modified');
    const stored = await persisted();
    ok(sameFingerprints(await storedFingerprints(), beforeStored) && stored.projectMilestones.length === 8 && stored.tasks.length === 23,
      '1: what is persisted matches what the app shows, with every existing record intact');
    ok(findProjectMilestoneProblems({ projects: stored.projects, projectMilestones: stored.projectMilestones, tasks: stored.tasks }).length === 0,
      '21: the persisted database satisfies the project-milestone invariant');
    await click(button('Done'), 'Done');
  }

  section('18/19/20. The UI refuses bad plans in add-to-existing mode');
  {
    await click(button('Import Project Plan'), 'Import Project Plan');
    await click(button('Add to Existing Project'), 'Add to Existing Project');
    await choose(targetSelect(), 'p-target', 'Target project');
    const rawBefore = dom.window.localStorage.getItem(STORAGE_KEY);
    await typeInto(planArea(), JSON.stringify(envelope({ tasks: [{ title: 'Loose task' }] })));
    ok(bodyText().includes('cannot be imported') && bodyText().includes('exactly one project'),
      '19: a plan with zero projects is refused in the UI');
    await typeInto(planArea(), JSON.stringify(envelope({ projects: [{ name: 'A' }, { name: 'B' }] })));
    ok(bodyText().includes('exactly one project') && bodyText().includes('2'), '18: a plan with two projects is refused in the UI');
    ok(addButton()!.hasAttribute('disabled'), '18/19: Import stays disabled for a refused plan');
    ok(dom.window.localStorage.getItem(STORAGE_KEY) === rawBefore, '20: the refused plans performed ZERO writes');
    await click(button('Cancel'), 'Cancel');
  }

  section('Regression. Create New Project still behaves exactly as before (same modal)');
  {
    dom.window.localStorage.clear();
    dom.window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyBlob()));
    await mount(React.createElement(SettingsScreen));
    const regressionBefore = stateFingerprints();
    await click(button('Import Project Plan'), 'Import Project Plan');
    ok(button('Create New Project')!.getAttribute('aria-pressed') === 'true', 'Regression: the modal still defaults to Create New Project');
    const rawBefore = dom.window.localStorage.getItem(STORAGE_KEY);
    await typeInto(planArea(), JSON.stringify(envelope({
      goal: { name: 'A brand new goal' },
      projects: [{ name: 'A brand new project', milestones: [{ name: 'M1', tasks: [{ title: 'New task' }] }] }],
    })));
    ok(bodyText().includes('What will be created') && bodyText().includes('A brand new goal'),
      'Regression: the create-new preview renders exactly as in Phase 4');
    ok(dom.window.localStorage.getItem(STORAGE_KEY) === rawBefore, 'Regression: the preview performed zero writes');
    await click(button('Import plan'), 'Import plan');
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    const data = c().data;
    ok(bodyText().includes('Import successful'), 'Regression: the create-new import succeeds');
    ok(data.goals.some((g) => g.name === 'A brand new goal') && data.projects.some((p) => p.name === 'A brand new project'),
      'Regression: the goal and the project were created, as in Phase 4');
    ok(data.projects.length === 3 && data.projectMilestones.length === 6 && data.tasks.length === 15,
      'Regression: the existing world is intact alongside the new records');
    ok(sameFingerprints(stateFingerprints(), regressionBefore), 'Regression: every pre-existing record is byte-identical after a create-new import');
    await click(button('Done'), 'Done');
  }

  /* ================================================================ */
  /* Static checks: the shape of the feature itself                     */
  /* ================================================================ */
  section('Static checks');
  {
    const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
    const planModule = read('lib/project-plan.ts');
    // What must not appear is any storage, client or network API.
    ok(!/localStorage|STORAGE_KEY|@supabase|createClient\(|\bfetch\(|Array\.from\(|\.from\(['"]/.test(planModule),
      'The plan module does no I/O at all — it parses, validates, resolves and previews, nothing else');
    ok(!/service_role|SERVICE_ROLE|user_id\s*[:=]/.test(planModule), 'The plan module never mentions a service-role key or a user id');
    ok(['normalizeProjectMilestoneName', 'planProjectMilestoneMappings', 'resolveExistingProjectImport',
        'buildExistingProjectPlanRecords', 'existingProjectImportPreview', 'findExistingProjectImportProblems']
        .every((name) => planModule.includes(`export function ${name}`)),
      'The add-to-existing pipeline lives in lib/project-plan.ts — one importer, two modes');
    const ui = read('components/settings/project-plan-import.tsx');
    ok(!/repo\(\)|createRepository|\.from\(|localStorage/.test(ui) && ui.includes('actions.importProjectPlanIntoExistingProject'),
      'The importer UI writes through the DataProvider action only — never to a repository, Supabase or storage directly');
    ok(ui.includes('reviewProjectPlanText') && /disabled=\{!canImport\}/.test(ui),
      'The UI validates before it offers Import, in both modes');
    const repoInterface = read('lib/store/repository.ts');
    ok(repoInterface.includes('importProjectPlan(') && repoInterface.includes('importProjectPlanIntoExistingProject('),
      'AppRepository declares both import modes');
    const callers = ['lib/store/local-repository.ts', 'lib/store/supabase-repository.ts', 'components/data/data-provider.tsx']
      .filter((path) => read(path).includes('importProjectPlanIntoExistingProject'));
    ok(callers.length === 3, `importProjectPlanIntoExistingProject exists in both repositories and the provider (${callers.join(', ')})`);
    const supa = read('lib/store/supabase-repository.ts');
    const addMethod = supa.slice(supa.indexOf('async importProjectPlanIntoExistingProject'));
    ok(!/insert\('goals'|insert\('projects'/.test(addMethod),
      'Supabase writes an add-to-existing import as project milestones → tasks only — never a goal or a project');
    ok(/await insert\('goals'[\s\S]*await insert\('projects'[\s\S]*PROJECT_MILESTONES_TABLE[\s\S]*await this\.insertPlanTasks/.test(supa),
      'Phase 4’s parents-first goals → projects → project milestones → tasks sequence is untouched');
    ok(read('supabase/migrations/008_project_milestones.sql').length > 0 && readdirSync(join(process.cwd(), 'supabase', 'migrations')).length === 7,
      '24: no new migration was added and migration 008 is still there (7 files, 002–008)');
    const docs = read('docs/focusdesk-project-plan-v1.md');
    ok(docs.includes('Add to Existing Project') && docs.includes('normalized exact-name') && docs.includes('never renumbered'),
      'The format doc documents the Add to Existing Project mode');
  }

  /* ================================================================ */
  if (root) await act(async () => root!.unmount());
  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAdd-to-existing project plan import verified.');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
