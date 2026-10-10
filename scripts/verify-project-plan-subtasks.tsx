/**
 * Native nested plan tasks — pure rules, both repositories, rollback, preview
 * and the actual Projects hierarchy/TaskRow controls through DataProvider.
 * Supabase SDK requests terminate at the strict in-memory PostgREST boundary
 * below. No live database, credentials or production data are used.
 *
 * Run: npm i --no-save --package-lock=false jsdom tsx
 *      npx tsx scripts/verify-project-plan-subtasks.tsx
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import type { AppData, Project, ProjectMilestone, Task } from '../lib/types';
import type { PendingTask, ResolvedProjectPlan } from '../lib/project-plan';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document, self: dom.window,
  localStorage: dom.window.localStorage, FileReader: dom.window.FileReader,
  File: dom.window.File, Blob: dom.window.Blob, IS_REACT_ACT_ENVIRONMENT: true,
});

type Row = Record<string, unknown>;
const USER = '00000000-0000-4000-8000-00000000000a';
const OTHER = '00000000-0000-4000-8000-00000000000b';
const NOW = '2026-10-10T12:00:00.000Z';
const target: Project = { id: 'existing-project', name: 'Target Project', goalId: 'existing-goal', description: 'Keep me', status: 'active', deadline: '2027-01-01', createdAt: NOW };
const existingMilestone: ProjectMilestone = { id: 'existing-milestone', projectId: target.id, name: '  FoUnDaTiOn  ', description: 'Keep this too', targetDate: '2026-12-01', position: 4, createdAt: NOW };
const existingTask: Task = { id: 't-parent', title: 'Existing task untouched', projectId: target.id, projectMilestoneId: existingMilestone.id, status: 'planned', priority: 'low', tags: ['keep'], createdAt: NOW, notes: 'Do not replace', actualDurationSeconds: 123, postponementCount: 2, archived: false };
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const envelope = (body: Row): Row => ({ format: 'focusdesk-project-plan', version: 1, ...body });
const nested = () => envelope({
  name: 'Hierarchy test',
  goal: { id: 'g-source', name: 'Imported goal' },
  projects: [{ id: 'p-source', name: 'Imported Project', milestones: [
    { id: 'm-foundation', name: 'Foundation', tasks: [{
      id: 't-parent', title: 'Parent task', description: 'Parent description', priority: 'high',
      subtasks: [
        { id: 't-a', title: 'Child A', description: 'Child description', status: 'planned', priority: 'high',
          scheduledDate: '2026-10-12', dueDate: '2026-10-20', estimatedDuration: 30, notes: 'Child notes', tags: ['website', 'conversion'],
          subtasks: [{ id: 't-grand', title: 'Grandchild', status: 'completed', priority: 'low', dueDate: '2026-10-21' }],
        },
        { id: 't-b', title: 'Child B' },
      ],
    }] },
    { id: 'm-delivery', name: 'Delivery', tasks: [{ title: 'Delivery parent', subtasks: [{ title: 'Delivery child' }] }] },
  ], tasks: [{ title: 'Project parent', subtasks: [{ title: 'Project child' }] }] }],
  tasks: [{ title: 'Standalone parent', subtasks: [{ title: 'Standalone child' }] }],
});
const parentRaw = (input: ReturnType<typeof nested>) => (input.projects as Row[])[0].milestones as Row[];
const childrenRaw = (input: ReturnType<typeof nested>) => (((parentRaw(input)[0].tasks as Row[])[0]).subtasks as Row[]);
const chain = (levels: number) => {
  let task: Row = { title: `Level ${levels}` };
  for (let level = levels - 1; level >= 1; level--) task = { title: `Level ${level}`, subtasks: [task] };
  return task;
};

function memoryStore() {
  const map = new Map<string, string>();
  return {
    writes: 0, fail: false,
    getItem: (key: string) => map.get(key) ?? null,
    setItem(key: string, value: string) {
      this.writes++;
      if (this.fail) throw new Error('injected quota failure');
      map.set(key, value);
    },
    removeItem: (key: string) => void map.delete(key),
  };
}

const taskColumns = ['id', 'user_id', 'title', 'description', 'status', 'priority', 'project_id', 'project_milestone_id', 'goal_id', 'parent_task_id', 'created_at', 'scheduled_date', 'due_date', 'completed_at', 'estimated_duration', 'actual_duration', 'started_at', 'paused_at', 'actual_duration_seconds', 'reminder', 'notes', 'tags', 'recurrence', 'postponement_count', 'archived'];

/**
 * A stricter fake than a row bag: batches are atomic, requests are user-scoped,
 * children require an ALREADY PERSISTED parent (not one in the same batch),
 * and parent/project/milestone foreign keys must resolve consistently. This
 * verifies request sequencing, not the live deployment's RLS configuration.
 */
function fakePostgrest({ parents = true, milestones = true } = {}) {
  const columns = new Map<string, Set<string>>([
    ['goals', new Set(['id', 'user_id', 'name', 'description', 'deadline', 'status', 'created_at'])],
    ['projects', new Set(['id', 'user_id', 'name', 'description', 'goal_id', 'deadline', 'status', 'created_at'])],
    ['tasks', new Set(taskColumns.filter((c) => (parents || c !== 'parent_task_id') && (milestones || c !== 'project_milestone_id')))],
  ]);
  if (milestones) columns.set('project_milestones', new Set(['id', 'user_id', 'project_id', 'name', 'description', 'target_date', 'position', 'created_at']));
  const tables = new Map([...columns.keys()].map((name) => [name, [] as Row[]]));
  const log: { method: string; table: string; query: URLSearchParams; rows: Row[] }[] = [];
  const server = {
    tables, log, nullified: [] as string[],
    loseResponseForTitle: null as string | null,
    fail: null as null | ((method: string, table: string, rows: Row[]) => boolean),
    fetch: null as unknown as typeof fetch,
  };
  const error = (status: number, code: string, message: string) => Response.json({ code, message, details: null, hint: null }, { status });
  server.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const table = url.pathname.replace('/rest/v1/', '');
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const rows: Row[] = Array.isArray(body) ? body : body ? [body] : [];
    log.push({ method, table, query: url.searchParams, rows });
    if (!tables.has(table)) return error(404, 'PGRST205', 'Missing table');
    const known = columns.get(table)!;
    const select = url.searchParams.get('select') ?? '*';
    if (select !== '*' && select.split(',').some((c) => !known.has(c))) return error(400, '42703', 'Missing column');
    if (rows.some((row) => Object.keys(row).some((c) => !known.has(c)))) return error(400, 'PGRST204', 'Missing write column');
    if (server.fail?.(method, table, rows)) return error(500, 'XX000', 'injected nested write failure');
    const matches = (row: Row) => [...url.searchParams].every(([key, value]) => {
      if (['select', 'order', 'limit', 'columns'].includes(key)) return true;
      if (value.startsWith('eq.')) return String(row[key]) === value.slice(3);
      if (value.startsWith('in.')) return value.slice(3).replace(/^\(|\)$/g, '').split(',').includes(String(row[key]));
      throw new Error(`Unsupported filter: ${key}=${value}`);
    });
    const current = tables.get(table)!;
    if (method === 'GET') {
      assert.equal(url.searchParams.get('user_id'), `eq.${USER}`, 'Every read must be user-scoped');
      let found = current.filter(matches);
      const order = url.searchParams.get('order');
      if (order) found = [...found].sort((a, b) => Number(a[order.split('.')[0]]) - Number(b[order.split('.')[0]]));
      const limit = url.searchParams.get('limit');
      if (limit) found = found.slice(0, Number(limit));
      return Response.json(found.map((row) => select === '*' ? row : Object.fromEntries(select.split(',').map((c) => [c, row[c] ?? null]))));
    }
    if (method === 'POST') {
      assert(rows.every((row) => row.user_id === USER), 'Writes carry the authenticated user');
      for (const row of rows) {
        if (current.some((r) => r.id === row.id)) return error(409, '23505', 'Duplicate primary key');
        const own = (name: string, id: unknown) => tables.get(name)?.find((r) => r.id === id && r.user_id === USER);
        if (table === 'projects' && row.goal_id && !own('goals', row.goal_id)) return error(409, '23503', 'Missing goal');
        if (table === 'project_milestones' && !own('projects', row.project_id)) return error(409, '23503', 'Missing milestone project');
        if (table === 'tasks') {
          if (row.project_id && !own('projects', row.project_id)) return error(409, '23503', 'Missing task project');
          if (row.project_milestone_id && own('project_milestones', row.project_milestone_id)?.project_id !== row.project_id) return error(409, '23503', 'Wrong milestone project');
          if (row.parent_task_id) {
            const parent = own('tasks', row.parent_task_id);
            if (!parent) return error(409, '23503', 'Parent was not persisted before its child');
            assert.equal(parent.project_id, row.project_id, 'Children stay in the parent project');
            assert.equal(parent.project_milestone_id, row.project_milestone_id, 'Imported children inherit the milestone');
          }
        }
      }
      current.push(...clone(rows));
      if (server.loseResponseForTitle && rows.some((row) => row.title === server.loseResponseForTitle)) {
        server.loseResponseForTitle = null;
        throw new Error('injected lost response after commit');
      }
      return new Response(null, { status: 201 });
    }
    assert.equal(url.searchParams.get('user_id'), `eq.${USER}`, 'Deletes and patches must be user-scoped');
    if (method === 'DELETE') {
      assert(url.searchParams.get('id'), 'Rollback must identify its own rows, never clear a table');
      const ids = new Set(current.filter(matches).map((row) => row.id));
      tables.set(table, current.filter((row) => !ids.has(row.id)));
      if (table === 'tasks') {
        for (const task of tables.get('tasks')!) if (ids.has(task.parent_task_id)) {
          server.nullified.push(String(task.id));
          task.parent_task_id = null; // Existing ON DELETE SET NULL behavior.
        }
      }
      return new Response(null, { status: 204 });
    }
    if (method === 'PATCH') {
      for (const row of current) if (matches(row)) Object.assign(row, rows[0]);
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected ${method} ${table}`);
  };
  tables.get('goals')!.push({ id: 'existing-goal', user_id: USER, name: 'Existing goal', status: 'active', created_at: NOW });
  tables.get('projects')!.push({ id: target.id, user_id: USER, name: target.name, description: target.description, goal_id: target.goalId, status: target.status, deadline: target.deadline, created_at: NOW }, { id: 'foreign-project', user_id: OTHER, name: 'Other user', status: 'active', created_at: NOW });
  tables.get('tasks')!.push({ id: existingTask.id, user_id: USER, title: existingTask.title, status: existingTask.status, priority: existingTask.priority, project_id: target.id, project_milestone_id: milestones ? existingMilestone.id : undefined, parent_task_id: null, tags: existingTask.tags, actual_duration_seconds: 123, notes: existingTask.notes, created_at: NOW, archived: false, postponement_count: 2 });
  if (milestones) tables.get('project_milestones')!.push({ id: existingMilestone.id, user_id: USER, project_id: target.id, name: existingMilestone.name, description: existingMilestone.description, target_date: existingMilestone.targetDate, position: existingMilestone.position, created_at: NOW });
  return server;
}

async function main() {
  const React = await import('react');
  const { act } = React;
  const { createRoot } = await import('react-dom/client');
  const { createClient } = await import('@supabase/supabase-js');
  const { LocalRepository, STORAGE_KEY } = await import('../lib/store/local-repository');
  const { SupabaseRepository } = await import('../lib/store/supabase-repository');
  const plan = await import('../lib/project-plan');
  const { taskHierarchyRows, assertTaskHierarchyChange } = await import('../lib/task-hierarchy');
  const { findProjectMilestoneProblems } = await import('../lib/project-milestones');
  const review = (input: unknown) => plan.reviewProjectPlan(input, { today: '2026-10-10' });
  const valid = (input: unknown) => {
    const reviewed = review(input);
    assert(reviewed.ok, JSON.stringify(reviewed.errors));
    return reviewed;
  };
  const resolved = valid(nested()).plan!;
  const forExisting = (source = valid(nested()), choices = {}) => plan.resolveExistingProjectImport(source, target, [existingMilestone], [existingTask], choices);
  const seedLocal = async (storage = memoryStore()) => {
    const repo = new LocalRepository(storage);
    await repo.importData({
      goals: [{ id: 'existing-goal', name: 'Existing goal', status: 'active', createdAt: NOW }], projects: [clone(target)],
      projectMilestones: [clone(existingMilestone)], tasks: [clone(existingTask)],
      subtasks: [{ id: 'checklist', parentTaskId: existingTask.id, title: 'Existing checklist', completed: false, position: 0, createdAt: NOW }],
      timerSessions: [{ id: 'session', taskId: existingTask.id, startedAt: NOW, endedAt: NOW, durationSeconds: 123 }],
      learnings: [{ id: 'learning', title: 'Keep this learning', category: 'other', date: '2026-10-01', createdAt: NOW }],
    });
    return { repo, storage, before: await repo.exportData() };
  };
  const assertUnchanged = (before: AppData, after: AppData) => {
    for (const key of Object.keys(before) as (keyof AppData)[]) {
      if (key === 'settings') { assert.deepEqual(after.settings, before.settings); continue; }
      const previous = before[key] as { id: string }[];
      const ids = new Set(previous.map((row) => row.id));
      assert.deepEqual((after[key] as { id: string }[]).filter((row) => ids.has(row.id)), previous, `${key}: all pre-existing records are byte-identical`);
    }
  };
  const checkTasks = (tasks: Task[], existingProject = false) => {
    assert.equal(tasks.length, 10);
    const byTitle = (title: string) => { const task = tasks.find((t) => t.title === title); assert(task, title); return task; };
    for (const [child, parent] of [['Child A', 'Parent task'], ['Child B', 'Parent task'], ['Grandchild', 'Child A'], ['Delivery child', 'Delivery parent'], ['Project child', 'Project parent'], ['Standalone child', 'Standalone parent']]) {
      const c = byTitle(child), p = byTitle(parent);
      assert.equal(c.parentTaskId, p.id);
      assert.equal(c.projectId, p.projectId);
      assert.equal(c.projectMilestoneId, p.projectMilestoneId);
      assert(tasks.indexOf(p) < tasks.indexOf(c), 'Repository results remain parent-first');
    }
    assert.equal(byTitle('Parent task').parentTaskId, undefined);
    assert.notEqual(byTitle('Parent task').id, existingTask.id, 'Temporary ID matching an existing task cannot overwrite it');
    assert.equal(tasks.filter((t) => t.parentTaskId).length, 6);
    assert.deepEqual(tasks.map((t) => t.title), resolved.tasks.map((t) => t.title), 'Stable preorder and sibling ordering');
    const child = byTitle('Child A');
    assert.equal(child.description, 'Child description');
    assert.equal(child.status, 'planned'); assert.equal(child.priority, 'high');
    assert.equal(child.scheduledDate, '2026-10-12'); assert.equal(child.dueDate, '2026-10-20');
    assert.equal(child.estimatedDuration, 30); assert.equal(child.notes, 'Child notes');
    assert.deepEqual(child.tags, ['website', 'conversion']);
    assert.equal(byTitle('Child B').status, 'created'); assert.equal(byTitle('Child B').priority, 'medium');
    assert.equal(byTitle('Grandchild').completedAt, byTitle('Grandchild').createdAt);
    if (existingProject) assert(tasks.every((t) => t.projectId === target.id));
    else assert.equal(byTitle('Standalone child').projectId, undefined);
    return byTitle;
  };

  let passes = 0, failures = 0;
  const test = async (name: string, run: () => void | Promise<void>) => {
    try { await run(); passes++; console.log('✓', name); }
    catch (error) { failures++; console.error('FAIL:', name, error); }
  };

  await test('Legacy v1 fixture (52 tasks) remains valid with unchanged defaults', () => {
    const legacy = valid(JSON.parse(readFileSync('fixtures/focusdesk-project-plan-v1-no-subtasks.json', 'utf8')));
    assert.equal(legacy.counts.tasks, 52); assert.equal(legacy.counts.parentTasks, 52); assert.equal(legacy.counts.subtasks, 0);
    assert(legacy.plan!.tasks.every((t) => t.parentTaskTempId === undefined));
    assert.equal(valid(envelope({ tasks: [{ title: 'Plain task', parentTaskId: null }] })).plan!.tasks[0].status, 'created');
    const extras = valid(envelope({ goal: { name: 'Legacy goal', parentTaskId: 'extra' }, projects: [{ name: 'Legacy project', parent_task_id: 'extra' }] }));
    assert.equal(extras.warnings.filter((issue) => issue.message.includes('Unsupported field')).length, 2);
  });
  await test('One child, siblings, multiple levels and optional empty subtasks', () => {
    assert.equal(valid(envelope({ tasks: [{ title: 'Parent', subtasks: [{ title: 'Only child' }] }] })).counts.tasks, 2);
    assert.equal(valid(envelope({ tasks: [{ title: 'Parent', subtasks: [] }] })).counts.tasks, 1);
    const reviewed = valid(nested());
    assert.deepEqual(reviewed.counts, { goals: 1, projects: 1, projectMilestones: 2, tasks: 10, parentTasks: 4, subtasks: 6 });
    assert.equal(reviewed.plan!.tasks[2].parentTaskTempId, 't-a');
    assert.equal(reviewed.plan!.tasks[3].parentTaskTempId, 't-parent');
  });
  await test('Updated example fixture has real nested children and 55 total tasks', async () => {
    const example = valid(JSON.parse(readFileSync('fixtures/focusdesk-project-plan-v1.json', 'utf8')));
    assert.equal(example.counts.tasks, 55); assert.equal(example.counts.subtasks, 3); assert.equal(example.counts.parentTasks, 52);
    const repo = new LocalRepository(memoryStore());
    const created = await repo.importProjectPlan(example.plan!);
    const shell = created.tasks.find((t) => t.title === 'Create the Tauri shell workspace')!;
    assert(shell.parentTaskId); assert.equal(created.tasks.find((t) => t.title === 'Verify the shell builds locally')!.parentTaskId, shell.id);
  });
  await test('Documented complete JSON example validates with the advertised hierarchy and counts', () => {
    const docs = readFileSync('docs/focusdesk-project-plan-v1.md', 'utf8');
    const example = docs.split('## 2. Complete example')[1].split('```json\n')[1].split('```')[0];
    const reviewed = valid(JSON.parse(example));
    assert.equal(reviewed.counts.tasks, 11); assert.equal(reviewed.counts.parentTasks, 8); assert.equal(reviewed.counts.subtasks, 3);
  });
  await test('Every ordinary task field, normalization and warnings work on children', () => {
    const input = nested(); const child = childrenRaw(input)[0];
    child.status = 'In Progress'; child.priority = 'HIGH'; child.scheduledDate = '2026-10-08'; child.dueDate = '2026-10-07';
    const reviewed = valid(input);
    assert.equal(reviewed.plan!.tasks[1].status, 'in_progress'); assert.equal(reviewed.plan!.tasks[1].priority, 'high');
    assert(reviewed.warnings.some((issue) => issue.path.includes('.subtasks[0]') && issue.message.includes('in the past')));
    assert(reviewed.warnings.some((issue) => issue.path.includes('.subtasks[0]') && issue.message.includes('after its')));
  });
  await test('Malformed/missing subtask titles, objects, arrays and optional fields are rejected with paths', () => {
    for (const child of [{}, { title: '' }, { title: '  ' }, { title: 4 }, null, [], { title: 'C', subtasks: {} }, { title: 'C', tags: [' '] }, { title: 'C', estimatedDuration: 0 }, { title: 'C', description: 3 }, { title: 'C', notes: false }]) {
      const reviewed = review(envelope({ tasks: [{ title: 'Parent', subtasks: [child] }] }));
      assert.equal(reviewed.ok, false, JSON.stringify(child));
      assert(reviewed.errors.some((issue) => issue.path.includes('subtasks[0]')));
    }
    assert.equal(review(envelope({ tasks: [{ title: 'P', subtasks: 'bad' }] })).ok, false);
  });
  await test('Invalid child dates, statuses and priorities are never defaulted into a successful import', () => {
    for (const fields of [{ scheduledDate: '2026-02-30' }, { dueDate: '2026-10' }, { dueDate: '2026-10-20T00:00:00Z' }, { dueDate: '0000-01-01' }, { status: 'blocked' }, { priority: 'critical' }, { status: 3 }, { priority: false }]) {
      const reviewed = review(envelope({ tasks: [{ title: 'Parent', subtasks: [{ title: 'Child', ...fields }] }] }));
      assert.equal(reviewed.ok, false, JSON.stringify(fields));
      assert(reviewed.errors.some((issue) => issue.path === 'tasks[0].subtasks[0]'));
    }
    assert(plan.isValidPlanDate('2000-02-29')); assert(!plan.isValidPlanDate('2100-02-29'));
    assert(plan.isValidPlanDate('0004-02-29')); assert(!plan.isValidPlanDate('0001-02-29'));
  });
  await test('Duplicate supplied/generated IDs are rejected across the whole hierarchy', () => {
    for (const id of ['t-parent', 'g-source', 'p-source', 'm-foundation', 't-a']) {
      const input = nested(); childrenRaw(input)[1].id = id;
      assert(review(input).errors.some((issue) => issue.message.includes('used twice')));
    }
    assert.equal(review(envelope({ tasks: [{ title: 'Auto', subtasks: [{ id: '#t0', title: 'Conflicting supplied ID' }] }] })).ok, false);
  });
  await test('Children cannot override parent project/milestone or reference existing parents', () => {
    for (const fields of [{ projectId: 'other-project' }, { milestoneId: 'm-delivery' }, { parentTaskId: existingTask.id }, { parent_task_id: existingTask.id }, { parentTaskTempId: 't-parent' }]) {
      const input = nested(); Object.assign(childrenRaw(input)[0], fields);
      assert.equal(review(input).ok, false, JSON.stringify(fields));
    }
    const cross = nested(); (cross.projects as Row[]).push({ id: 'p-other', name: 'Other' });
    childrenRaw(cross)[0].projectId = 'p-other'; assert.equal(review(cross).ok, false);
    const root = nested(); ((root.tasks as Row[])[0].subtasks as Row[])[0].projectId = 'p-source';
    assert.equal(review(root).ok, false, 'Standalone child cannot acquire a project its parent lacks');
    const redundant = nested(); childrenRaw(redundant)[0].projectId = 'p-source'; childrenRaw(redundant)[0].milestoneId = 'm-foundation';
    assert.equal(valid(redundant).plan!.tasks[1].projectMilestoneTempId, 'm-foundation');
  });
  await test('Limits include descendants; 20 levels pass, 21 and extremely deep trees fail safely', () => {
    assert.equal(valid(envelope({ tasks: [chain(plan.PROJECT_PLAN_LIMITS.taskDepth)] })).counts.tasks, 20);
    for (const levels of [21, 20000]) {
      const reviewed = review(envelope({ tasks: [chain(levels)] }));
      assert.equal(reviewed.ok, false); assert(reviewed.errors.some((issue) => issue.message.includes('20 levels')));
    }
    const input = envelope({ tasks: [{ title: 'Root', subtasks: Array.from({ length: 1999 }, (_, i) => ({ title: `Child ${i}` })) }] });
    assert.equal(valid(input).counts.tasks, 2000);
    (input.tasks as Row[]).push({ title: 'Overflow' }); assert(review(input).errors.some((issue) => issue.message.includes('including all subtasks')));
    const cyclic: Row = { title: 'Cycle' }; cyclic.subtasks = [cyclic];
    assert(review(envelope({ tasks: [cyclic] })).errors.some((issue) => issue.message.includes('cyclic')));
  });
  await test('5 MiB UTF-8 limit applies before parsing, not just character count', () => {
    const oversized = 'é'.repeat(Math.floor(plan.PROJECT_PLAN_LIMITS.bytes / 2) + 1);
    assert(oversized.length < plan.PROJECT_PLAN_LIMITS.bytes);
    const reviewed = plan.reviewProjectPlanText(oversized);
    assert.equal(reviewed.ok, false); assert(reviewed.errors[0].message.includes('5 MiB'));
  });
  await test('Builders rewrite every parent to real IDs, preserve fields, and sort unordered resolved tasks safely', () => {
    let id = 0;
    const built = plan.buildProjectPlanRecords(resolved, { newId: () => `real-${++id}`, now: () => NOW });
    checkTasks(built.tasks);
    assert.equal(built.tasks[1].parentTaskId, built.idOf.get('t-parent'));
    assert.equal(built.tasks[2].parentTaskId, built.idOf.get('t-a'));
    assert.equal(findProjectMilestoneProblems(built).length, 0);
    const unordered = clone(resolved); unordered.tasks.reverse();
    const reordered = plan.buildProjectPlanRecords(unordered, { newId: () => `real-${++id}`, now: () => NOW });
    for (const task of reordered.tasks) if (task.parentTaskId) assert(reordered.tasks.findIndex((p) => p.id === task.parentTaskId) < reordered.tasks.indexOf(task));
  });
  await test('Hand-built resolved imports cannot bypass missing-parent, cycle, cross-project, field or duplicate-ID checks', async () => {
    const mutations: ((p: ResolvedProjectPlan) => void)[] = [
      (p) => { p.tasks[1].parentTaskTempId = 'existing-task'; },
      (p) => { p.tasks[0].parentTaskTempId = p.tasks[2].tempId; },
      (p) => { p.tasks[1].projectTempId = undefined; },
      (p) => { p.tasks[1].projectMilestoneTempId = 'm-delivery'; },
      (p) => { p.tasks[1].title = ' '; },
      (p) => { p.tasks[1].priority = 'critical' as PendingTask['priority']; },
      (p) => { p.tasks[1].dueDate = '2026-02-30'; },
      (p) => { p.tasks[1].tempId = p.projects[0].tempId; },
    ];
    for (const mutate of mutations) {
      const input = clone(resolved); mutate(input);
      const { repo, storage } = await seedLocal(); const raw = storage.getItem(STORAGE_KEY), writes = storage.writes;
      await assert.rejects(() => repo.importProjectPlan(input), /nothing was created/);
      assert.equal(storage.writes, writes); assert.equal(storage.getItem(STORAGE_KEY), raw);
      const existing = forExisting(); existing.tasks = input.tasks;
      await assert.rejects(() => repo.importProjectPlanIntoExistingProject(existing), /nothing was created/);
      assert.equal(storage.writes, writes); assert.equal(storage.getItem(STORAGE_KEY), raw);
    }
  });
  await test('Preview trees contain each descendant exactly once and count all milestone tasks', () => {
    const reviewed = valid(nested()), preview = reviewed.preview!;
    const first = preview.projects[0].milestones[0].tasks;
    assert.equal(first.length, 1); assert.equal(first[0].subtasks.length, 2); assert.equal(first[0].subtasks[0].subtasks[0].title, 'Grandchild');
    assert.equal(plan.countPreviewTasks(first), 4);
    const lines = plan.projectPlanTreeLines(preview);
    assert(lines.some((line) => line.includes('Foundation — 4 tasks')));
    for (const title of resolved.tasks.map((t) => t.title)) assert.equal(lines.filter((line) => line.includes(title)).length, 1, title);
    const addPreview = plan.existingProjectImportPreview(forExisting());
    assert.equal(plan.countPreviewTasks(addPreview.milestones[0].tasks), 4);
    assert.equal(addPreview.milestones[0].tasks[0].subtasks[0].subtasks[0].title, 'Grandchild');
    assert.equal(addPreview.counts.newTasks, 10); assert.equal(addPreview.counts.subtasks, 6);
    assert.equal(addPreview.counts.milestoneTasks, 6); assert.equal(addPreview.counts.projectLevelTasks, 2); assert.equal(addPreview.counts.rootTasks, 2);
  });

  await test('Local create-new: one atomic write, persistent hierarchy after reload, existing records untouched', async () => {
    const { repo, storage, before } = await seedLocal(); const writes = storage.writes;
    const created = await repo.importProjectPlan(resolved); checkTasks(created.tasks);
    assert.equal(storage.writes, writes + 1);
    const after = await new LocalRepository(storage).exportData(); assertUnchanged(before, after);
    assert.deepEqual(after.tasks.filter((t) => created.tasks.some((newTask) => newTask.id === t.id)), clone(created.tasks));
    assert.equal(after.subtasks.length, 1, 'Imported descendants are full tasks, not checklist items');
  });
  await test('Local add-to-existing: same project, reused milestone and new milestone; no second goal/project', async () => {
    for (const forceNew of [false, true]) {
      const { repo, storage, before } = await seedLocal(); const writes = storage.writes;
      const input = forExisting(valid(nested()), forceNew ? { 'm-foundation': 'create-new' } : {});
      const created = await repo.importProjectPlanIntoExistingProject(input); const byTitle = checkTasks(created.tasks, true);
      assert.equal(storage.writes, writes + 1);
      assert.equal(created.projectMilestones.length, forceNew ? 2 : 1);
      assert.equal(created.projectMilestones[0].position, 5);
      if (!forceNew) assert.equal(byTitle('Grandchild').projectMilestoneId, existingMilestone.id);
      else assert.notEqual(byTitle('Grandchild').projectMilestoneId, existingMilestone.id);
      const after = await new LocalRepository(storage).exportData(); assertUnchanged(before, after);
      assert.equal(after.projects.length, before.projects.length); assert.equal(after.goals.length, before.goals.length);
    }
  });
  await test('Local storage failure rolls back BOTH persisted and in-memory state in both modes', async () => {
    for (const mode of ['new', 'existing']) {
      const { repo, storage, before } = await seedLocal(); const raw = storage.getItem(STORAGE_KEY);
      storage.fail = true;
      await assert.rejects(() => mode === 'new' ? repo.importProjectPlan(resolved) : repo.importProjectPlanIntoExistingProject(forExisting()), /nothing was kept.*browser storage/);
      assert.equal(storage.getItem(STORAGE_KEY), raw); assert.deepEqual(await repo.exportData(), before);
      storage.fail = false;
      const retry = mode === 'new' ? await repo.importProjectPlan(resolved) : await repo.importProjectPlanIntoExistingProject(forExisting());
      assert.equal(retry.tasks.length, 10);
    }
  });
  await test('Child edits/completion remain independent; deleting a parent clears only direct child links', async () => {
    const { repo, before } = await seedLocal(); const created = await repo.importProjectPlan(resolved); const byTitle = checkTasks(created.tasks);
    const parent = byTitle('Parent task'), child = byTitle('Child A'), grand = byTitle('Grandchild');
    const edited = await repo.tasks.update(child.id, { title: 'Edited child', notes: 'New notes' });
    assert.equal(edited.parentTaskId, parent.id);
    await repo.tasks.update(parent.id, { status: 'completed', completedAt: NOW });
    assert.equal((await repo.tasks.list()).find((t) => t.id === child.id)!.status, 'planned');
    await repo.tasks.delete(parent.id);
    const tasks = await repo.tasks.list(); assert(!tasks.some((t) => t.id === parent.id));
    assert.equal(tasks.find((t) => t.id === child.id)!.parentTaskId, undefined);
    assert.equal(tasks.find((t) => t.id === grand.id)!.parentTaskId, child.id);
    assertUnchanged(before, await repo.exportData());
  });
  await test('Hierarchy view survives filtered parents and corrupt legacy cycles without losing tasks', () => {
    const built = plan.buildProjectPlanRecords(resolved, { newId: (() => { let i = 0; return () => `id-${++i}`; })(), now: () => NOW });
    const rows = taskHierarchyRows(built.tasks);
    assert.equal(rows.length, 10); assert.equal(rows.find((r) => r.task.title === 'Grandchild')!.depth, 2);
    assert.equal(taskHierarchyRows(built.tasks.filter((t) => t.title === 'Grandchild'))[0].depth, 0);
    const corrupt = clone(built.tasks.slice(0, 3)); corrupt[0].parentTaskId = corrupt[2].id;
    assert.equal(taskHierarchyRows(corrupt).length, 3);
    assert.throws(() => assertTaskHierarchyChange(built.tasks[1], { projectId: 'foreign' }, built.tasks), /same project/);
    assert.throws(() => assertTaskHierarchyChange(built.tasks[0], { parentTaskId: built.tasks[2].id }, built.tasks), /ancestor/);
    const legacy = { ...built.tasks[1], projectId: 'legacy-other-project' };
    assert.doesNotThrow(() => assertTaskHierarchyChange(legacy, { projectId: legacy.projectId, title: 'Only a title edit' }, [built.tasks[0], legacy]));
  });

  let clientNumber = 0;
  const supabaseFor = (options = {}) => {
    const server = fakePostgrest(options);
    const client = createClient('https://test.supabase.co', 'test-publishable-key', {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: `subtasks-test-${++clientNumber}` },
      global: { fetch: server.fetch },
    });
    return { server, repo: new SupabaseRepository(client, USER) };
  };
  const snapshot = (server: ReturnType<typeof fakePostgrest>) => clone(Object.fromEntries(server.tables));
  const writes = (server: ReturnType<typeof fakePostgrest>) => server.log.filter((request) => request.method !== 'GET');
  const assertServerUnchanged = (before: Record<string, Row[]>, server: ReturnType<typeof fakePostgrest>) => {
    for (const [table, previous] of Object.entries(before)) {
      const ids = new Set(previous.map((row) => row.id));
      assert.deepEqual(server.tables.get(table)!.filter((row) => ids.has(row.id)), previous, table);
    }
  };
  await test('Supabase SDK create-new: persisted real parent IDs, parent-first requests and read mapping', async () => {
    const { repo, server } = supabaseFor(); const before = snapshot(server);
    const created = await repo.importProjectPlan(resolved); checkTasks(created.tasks);
    const inserts = writes(server).filter((request) => request.method === 'POST' && request.table === 'tasks');
    assert.equal(inserts.length, 3); assert.equal(inserts[0].rows.length, 4); assert.equal(inserts[1].rows.length, 5); assert.equal(inserts[2].rows.length, 1);
    const readBack = (await repo.tasks.list()).filter((t) => created.tasks.some((newTask) => newTask.id === t.id));
    for (const task of created.tasks) assert.deepEqual(readBack.find((t) => t.id === task.id)?.parentTaskId, task.parentTaskId);
    assert.equal(readBack.find((t) => t.title === 'Child A')!.notes, 'Child notes');
    assertServerUnchanged(before, server);
  });
  await test('Supabase SDK add-to-existing: reuse/create-new choices, no goal/project writes and reload associations', async () => {
    for (const forceNew of [false, true]) {
      const { repo, server } = supabaseFor(); const before = snapshot(server);
      const imported = await repo.importProjectPlanIntoExistingProject(forExisting(valid(nested()), forceNew ? { 'm-foundation': 'create-new' } : {}));
      const byTitle = checkTasks(imported.tasks, true);
      assert.equal(imported.projectMilestones.length, forceNew ? 2 : 1);
      if (!forceNew) assert.equal(byTitle('Grandchild').projectMilestoneId, existingMilestone.id);
      assert(writes(server).every((request) => request.table !== 'projects' && request.table !== 'goals'));
      const stored = await repo.tasks.list();
      assert.equal(stored.find((t) => t.id === byTitle('Grandchild').id)!.parentTaskId, byTitle('Child A').id);
      assertServerUnchanged(before, server);
    }
  });
  await test('Supabase: a nested write failure undoes children before parents in BOTH modes, leaving no orphans', async () => {
    for (const mode of ['new', 'existing']) {
      for (const failedTitle of ['Child A', 'Grandchild']) {
        const { repo, server } = supabaseFor(); const before = snapshot(server);
        server.fail = (method, table, rows) => method === 'POST' && table === 'tasks' && rows.some((row) => row.title === failedTitle);
        await assert.rejects(() => mode === 'new' ? repo.importProjectPlan(resolved) : repo.importProjectPlanIntoExistingProject(forExisting()), /nothing was kept/);
        assert.deepEqual(snapshot(server), before); assert.equal(server.nullified.length, 0, 'Children must be deleted before their parents');
        const deletes = server.log.filter((r) => r.method === 'DELETE'); assert(deletes.length > 0);
        assert(deletes.every((r) => r.query.get('user_id') === `eq.${USER}` && r.query.get('id')!.startsWith('in.')));
        assert(deletes.every((r) => !r.query.get('id')!.includes(existingTask.id) && !r.query.get('id')!.includes(existingMilestone.id)));
      }
    }
  });
  await test('Supabase: 200-row boundaries never place a child before a persisted parent; later batch failure fully rolls back', async () => {
    const batchPlan = valid(envelope({ projects: [{ name: 'Batch project', tasks: Array.from({ length: 201 }, (_, i) => ({ title: `Parent ${i}`, subtasks: [{ title: `Child ${i}`, subtasks: [{ title: `Grand ${i}` }] }] })) }] })).plan!;
    for (const fail of [false, true]) {
      const { repo, server } = supabaseFor(); const before = snapshot(server);
      if (fail) server.fail = (method, table, rows) => method === 'POST' && table === 'tasks' && rows.some((row) => row.title === 'Child 200');
      if (fail) {
        await assert.rejects(() => repo.importProjectPlan(batchPlan), /nothing was kept/);
        assert.deepEqual(snapshot(server), before); assert.equal(server.nullified.length, 0);
      } else {
        const created = await repo.importProjectPlan(batchPlan); assert.equal(created.tasks.length, 603);
        assert.equal(server.log.filter((r) => r.method === 'POST' && r.table === 'tasks').length, 6);
      }
    }
  });
  await test('Supabase: cleanup failure is reported honestly and ancestors remain so surviving children are not orphaned', async () => {
    const { repo, server } = supabaseFor(); const before = snapshot(server);
    server.fail = (method, table, rows) => (method === 'POST' && table === 'tasks' && rows.some((row) => row.title === 'Grandchild')) || (method === 'DELETE' && table === 'tasks');
    const errorLog = console.error; console.error = () => {};
    try { await assert.rejects(() => repo.importProjectPlan(resolved), /cleanup could not finish.*parents were kept/); }
    finally { console.error = errorLog; }
    assertServerUnchanged(before, server);
    assert(server.tables.get('tasks')!.length > before.tasks.length);
    for (const task of server.tables.get('tasks')!) if (task.parent_task_id) assert(server.tables.get('tasks')!.some((p) => p.id === task.parent_task_id));
    assert.equal(server.nullified.length, 0);
  });
  await test('Supabase: lost response AFTER a descendant batch committed still cleans up every attempted ID', async () => {
    for (const mode of ['new', 'existing']) {
      const { repo, server } = supabaseFor(); const before = snapshot(server);
      server.loseResponseForTitle = 'Grandchild';
      await assert.rejects(() => mode === 'new' ? repo.importProjectPlan(resolved) : repo.importProjectPlanIntoExistingProject(forExisting()), /nothing was kept/);
      assert.deepEqual(snapshot(server), before);
      assert.equal(server.nullified.length, 0, 'Compensate the committed grandchild before its ancestors');
    }
  });
  await test('Supabase: unavailable parent column is refused before any write, in both modes', async () => {
    for (const mode of ['new', 'existing']) {
      const { repo, server } = supabaseFor({ parents: false }); const before = snapshot(server);
      await assert.rejects(() => mode === 'new' ? repo.importProjectPlan(resolved) : repo.importProjectPlanIntoExistingProject(forExisting()), /parent_task_id is missing/);
      assert.equal(writes(server).length, 0); assert.deepEqual(snapshot(server), before);
    }
  });
  await test('Supabase: nested project/task-only plans still work without migration 008', async () => {
    const input = valid(envelope({ projects: [{ id: 'p-source', name: 'Plain', tasks: [{ title: 'Parent', subtasks: [{ title: 'Child' }] }] }] }));
    for (const mode of ['new', 'existing']) {
      const { repo, server } = supabaseFor({ milestones: false });
      const imported = mode === 'new' ? await repo.importProjectPlan(input.plan!) : await repo.importProjectPlanIntoExistingProject(plan.resolveExistingProjectImport(input, target, [], [existingTask]));
      assert.equal(imported.tasks[1].parentTaskId, imported.tasks[0].id);
      assert(server.log.filter((r) => r.method === 'POST' && r.table === 'tasks').every((r) => r.rows.every((row) => !('project_milestone_id' in row))));
    }
  });
  await test('Supabase: tampered parent/milestone mappings and foreign/deleted targets fail without writes', async () => {
    for (const mutation of ['parent', 'duplicate', 'wrong-source', 'renamed-match', 'foreign-target']) {
      const { repo, server } = supabaseFor(); const input = forExisting();
      if (mutation === 'parent') input.tasks = clone(input.tasks).map((t, i) => i === 1 ? { ...t, parentTaskTempId: existingTask.id + '-not-imported' } : t);
      if (mutation === 'duplicate') input.tasks = clone(input.tasks).map((t, i) => i === 1 ? { ...t, tempId: input.mappings[0].tempId } : t);
      if (mutation === 'wrong-source') input.tasks = clone(input.tasks).map((t, i) => i === 1 ? { ...t, projectTempId: 'not-source' } : t);
      if (mutation === 'renamed-match') server.tables.get('project_milestones')![0].name = 'Changed after preview';
      if (mutation === 'foreign-target') input.targetProject = { ...target, id: 'foreign-project' };
      const before = snapshot(server);
      await assert.rejects(() => repo.importProjectPlanIntoExistingProject(input), /nothing was created/);
      assert.equal(writes(server).length, 0); assert.deepEqual(snapshot(server), before);
    }
  });

  // Real browser component tests, using the same local DataProvider actions as
  // the application. UI globals were registered before importing ReactDOM.
  const { AuthProvider } = await import('../components/auth/auth-provider');
  const { DataProvider, useData } = await import('../components/data/data-provider');
  const { ProjectPlanImportModal } = await import('../components/settings/project-plan-import');
  const { ProjectsScreen } = await import('../components/projects/projects-screen');
  let ctx: ReturnType<typeof useData> | null = null;
  const Probe = () => { ctx = useData(); return null; };
  const c = () => { assert(ctx); return ctx; };
  let root: import('react-dom/client').Root | null = null;
  const mount = async (node: React.ReactNode) => {
    if (root) await act(async () => root!.unmount());
    document.body.innerHTML = '<div id="root"></div>';
    root = createRoot(document.getElementById('root')!);
    await act(async () => {
      root!.render(React.createElement(AuthProvider, null, React.createElement(DataProvider, null, node, React.createElement(Probe))));
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
  };
  const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  const click = async (element: Element | undefined | null) => {
    assert(element, 'UI control exists');
    await act(async () => { element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 20)); });
  };
  const typePlan = async (input: unknown) => {
    const area = document.querySelector('textarea[aria-label="Project plan JSON"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')!.set!.call(area, JSON.stringify(input));
      area.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 20));
    });
  };
  const choose = async (selector: string, value: string) => {
    const select = document.querySelector<HTMLSelectElement>(selector); assert(select);
    await act(async () => { select.value = value; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  };
  const seedBrowser = async () => {
    const { before } = await seedLocal(); dom.window.localStorage.clear(); dom.window.localStorage.setItem(STORAGE_KEY, JSON.stringify(before)); return before;
  };
  const assertTreeUI = () => {
    const rows = [...document.querySelectorAll<HTMLLIElement>('ul[aria-label="Imported task hierarchy"] > li')];
    const tree = document.querySelector<HTMLUListElement>('ul[aria-label="Imported task hierarchy"]')!;
    assert(parseInt(tree.style.minWidth) >= Math.max(...rows.map((row) => parseInt(row.style.paddingLeft))) + 200);
    const row = (title: string) => { const found = rows.find((r) => r.textContent?.includes(title)); assert(found, title); return found; };
    assert.equal(parseInt(row('Child A').style.paddingLeft), parseInt(row('Parent task').style.paddingLeft) + 14);
    assert.equal(parseInt(row('Grandchild').style.paddingLeft), parseInt(row('Child A').style.paddingLeft) + 14);
    assert(row('Child A').textContent!.includes('Child description'));
    assert(row('Child A').textContent!.includes('scheduled 2026-10-12') && row('Child A').textContent!.includes('due 2026-10-20'));
    assert(row('Child A').textContent!.includes('High priority') && row('Child A').textContent!.includes('30 min estimated'));
    assert(document.querySelector('[aria-label="Task counts"]')!.textContent!.includes('4 top-level tasks · 6 subtasks · 10 total tasks'));
  };
  await test('Create-new UI previews every nested level, fields and totals; invalid children disable confirmation; cancel writes nothing', async () => {
    const before = await seedBrowser(), raw = dom.window.localStorage.getItem(STORAGE_KEY); let closed = 0;
    await mount(React.createElement(ProjectPlanImportModal, { open: true, onClose: () => { closed++; } }));
    await typePlan(nested()); assertTreeUI(); assert(!button('Import plan')!.disabled);
    assert.equal(dom.window.localStorage.getItem(STORAGE_KEY), raw);
    const bad = nested(); childrenRaw(bad)[0].title = ' '; await typePlan(bad);
    assert(button('Import plan')!.disabled); assert(document.body.textContent!.includes('subtasks[0]'));
    await typePlan(envelope({ tasks: [chain(20)] }));
    assert(document.querySelector('ul[aria-label="Imported task hierarchy"]')!.textContent!.includes('Level 20'));
    const deepTree = document.querySelector<HTMLUListElement>('ul[aria-label="Imported task hierarchy"]')!;
    const deepest = [...deepTree.querySelectorAll<HTMLLIElement>('li')].find((row) => row.textContent!.includes('Level 20'))!;
    assert(parseInt(deepTree.style.minWidth) >= parseInt(deepest.style.paddingLeft) + 200);
    await typePlan(nested()); await click(button('Cancel')); assert.equal(closed, 1);
    assert.equal(dom.window.localStorage.getItem(STORAGE_KEY), raw); assertUnchanged(before, c().data);
  });
  await test('Create-new UI persists the hierarchy through the real DataProvider action and reports all tasks', async () => {
    const before = await seedBrowser(); await mount(React.createElement(ProjectPlanImportModal, { open: true, onClose: () => {} }));
    await typePlan(nested()); await click(button('Import plan'));
    assert(document.body.textContent!.includes('Import successful'));
    const imported = c().data.tasks.filter((t) => !before.tasks.some((old) => old.id === t.id)); checkTasks(imported);
    assertUnchanged(before, c().data); assertUnchanged(before, await new LocalRepository(dom.window.localStorage).exportData());
  });
  await test('Add-to-existing UI previews parent relationships and exact-name reuse, respects create-new override, preserves all existing data', async () => {
    const before = await seedBrowser(), raw = dom.window.localStorage.getItem(STORAGE_KEY);
    await mount(React.createElement(ProjectPlanImportModal, { open: true, onClose: () => {} }));
    await click(button('Add to Existing Project')); await choose('select[aria-label="Target project"]', target.id);
    await typePlan(nested()); assertTreeUI(); assert(document.body.textContent!.includes('existing project — unchanged'));
    const mapping = 'select[aria-label="Mapping for milestone “Foundation”"]';
    assert.equal(document.querySelector<HTMLSelectElement>(mapping)!.value, existingMilestone.id);
    await choose(mapping, 'create-new'); assert.equal(dom.window.localStorage.getItem(STORAGE_KEY), raw);
    await click(button('Add to project'));
    assert(document.body.textContent!.includes('Added to Target Project'));
    const imported = c().data.tasks.filter((t) => !before.tasks.some((old) => old.id === t.id)); const byTitle = checkTasks(imported, true);
    assert.notEqual(byTitle('Grandchild').projectMilestoneId, existingMilestone.id);
    assert.equal(c().data.projects.length, before.projects.length); assert.equal(c().data.goals.length, before.goals.length);
    assertUnchanged(before, c().data);
  });
  await test('Large preview offers Show all rather than discarding descendants beyond 300 rows', async () => {
    await seedBrowser(); await mount(React.createElement(ProjectPlanImportModal, { open: true, onClose: () => {} }));
    await typePlan(envelope({ tasks: [{ title: 'Large root', subtasks: Array.from({ length: 350 }, (_, i) => ({ title: `Leaf ${i}` })) }] }));
    assert(!document.querySelector('ul[aria-label="Imported task hierarchy"]')!.textContent!.includes('Leaf 349'));
    await click([...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Show all')));
    assert(document.querySelector('ul[aria-label="Imported task hierarchy"]')!.textContent!.includes('Leaf 349'));
    assert(document.querySelector('[aria-label="Task counts"]')!.textContent!.includes('1 top-level task · 350 subtasks · 351 total tasks'));
  });
  await test('Projects renders real task hierarchy; ordinary child edits, completion, safe project edits and parent deletion stay consistent', async () => {
    const before = await seedBrowser();
    await new LocalRepository(dom.window.localStorage).importProjectPlan(resolved);
    await mount(React.createElement(ProjectsScreen));
    await click([...document.querySelectorAll('button[aria-label="Expand project"]')].find((b) => b.parentElement?.parentElement?.textContent?.includes('Imported Project')));
    const taskRow = (title: string) => {
      const task = c().data.tasks.find((t) => t.title === title)!; assert(task);
      const row = document.querySelector(`[data-task-id="${task.id}"]`); assert(row, title); return { row, task };
    };
    const parent = taskRow('Parent task').task, child = taskRow('Child A').task, grand = taskRow('Grandchild').task;
    assert.equal(taskRow('Child A').row.closest('[data-task-depth]')!.getAttribute('data-task-depth'), '1');
    assert.equal(taskRow('Grandchild').row.closest('[data-task-depth]')!.getAttribute('data-task-depth'), '2');
    assert(taskRow('Grandchild').row.textContent!.includes('Subtask of: Child A'));
    await act(async () => { await c().actions.updateTask(child.id, { notes: 'Edited notes' }); await c().actions.completeTask(parent.id); });
    assert.equal(c().data.tasks.find((t) => t.id === child.id)!.status, 'planned');
    await act(async () => { await assert.rejects(() => c().actions.updateTask(child.id, { projectId: target.id }), /same project/); });
    await act(async () => { await c().actions.deleteTask(parent.id); });
    assert.equal(c().data.tasks.find((t) => t.id === child.id)!.parentTaskId, undefined);
    assert.equal(c().data.tasks.find((t) => t.id === grand.id)!.parentTaskId, child.id);
    const stored = await new LocalRepository(dom.window.localStorage).exportData();
    assert.equal(stored.tasks.find((t) => t.id === child.id)!.parentTaskId, undefined);
    assertUnchanged(before, stored);
  });

  await test('Projects supports the full 20-level boundary, with readable level markers for capped phone indentation', async () => {
    await seedBrowser();
    const source = valid(envelope({ projects: [{ name: 'Deep Project', tasks: [chain(20)] }] }));
    await new LocalRepository(dom.window.localStorage).importProjectPlan(source.plan!);
    await mount(React.createElement(ProjectsScreen));
    await click([...document.querySelectorAll('button[aria-label="Expand project"]')].find((b) => b.parentElement?.parentElement?.textContent?.includes('Deep Project')));
    const rows = [...document.querySelectorAll<HTMLElement>('[data-task-depth]')];
    assert.equal(rows.length, 20);
    assert.equal(rows[19].dataset.taskDepth, '19');
    assert(rows[19].textContent!.includes('Task level 20'));
    assert(rows[19].textContent!.includes('Subtask of: Level 19'));
    assert(rows[19].style.paddingLeft.includes('min('), 'Indentation cannot consume the entire phone width');
  });

  if (root) await act(async () => root!.unmount());
  console.log(`\nNative project-plan subtasks: ${passes} cases passed, ${failures} failed. No live Supabase writes.`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((error) => { console.error(error); process.exit(1); });
