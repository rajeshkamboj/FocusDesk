/**
 * Headless checks for task ordering inside the Projects view.
 *
 * Rules under test (lib/selectors.ts → projectTasksInOrder):
 *  - active/incomplete tasks keep their existing order and position;
 *  - completed tasks come after them, most recently completed first, by the
 *    stored `completedAt` (not createdAt, not array insertion order);
 *  - completed tasks with a missing/invalid `completedAt` go after every
 *    completed task with a valid timestamp;
 *  - milestone grouping is unchanged: each milestone section (and the
 *    "No milestone" section) receives its tasks in the same order.
 *
 * Pure functions only — no DOM, no React, no storage.
 * Run: npx tsx scripts/verify-project-task-order.ts
 */
import { projectTasksInOrder, uncompletedTasksFirst } from '../lib/selectors';
import type { Task, TaskStatus } from '../lib/types';

let failures = 0;
let passes = 0;
function ok(condition: boolean, label: string) {
  if (condition) {
    passes += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label}`);
  }
}

function task(
  id: string,
  opts: { status?: TaskStatus; completedAt?: string; createdAt?: string; projectMilestoneId?: string } = {},
): Task {
  return {
    id,
    title: id,
    status: opts.status ?? 'planned',
    priority: 'medium',
    projectId: 'p1',
    projectMilestoneId: opts.projectMilestoneId,
    createdAt: opts.createdAt ?? '2026-10-01T08:00:00.000Z',
    completedAt: opts.completedAt,
    postponementCount: 0,
    archived: false,
  } as Task;
}

const ids = (tasks: Task[]) => tasks.map((t) => t.id).join(',');

console.log('Completed tasks on different days sort newest-first');
{
  const input = [
    task('done-oct1', { status: 'completed', completedAt: '2026-10-01T09:00:00.000Z' }),
    task('done-oct3', { status: 'completed', completedAt: '2026-10-03T18:30:00.000Z' }),
    task('done-oct2', { status: 'completed', completedAt: '2026-10-02T08:15:00.000Z' }),
  ];
  // Insertion order is oldest-first, deliberately the reverse of the answer.
  ok(ids(projectTasksInOrder(input)) === 'done-oct3,done-oct2,done-oct1', 'newest completedAt comes first, then older days');
}

console.log('Same-day completions order by time of day');
{
  const input = [
    task('morning', { status: 'completed', completedAt: '2026-10-05T07:00:00.000Z' }),
    task('evening', { status: 'completed', completedAt: '2026-10-05T21:00:00.000Z' }),
  ];
  ok(ids(projectTasksInOrder(input)) === 'evening,morning', 'same calendar day is ordered by the full timestamp');
}

console.log('Missing / invalid completedAt goes after valid timestamps');
{
  const input = [
    task('no-ts-old', { status: 'completed', createdAt: '2026-09-01T00:00:00.000Z' }),
    task('valid-old', { status: 'completed', completedAt: '2026-10-01T09:00:00.000Z' }),
    task('garbage', { status: 'completed', completedAt: 'not-a-date', createdAt: '2026-09-20T00:00:00.000Z' }),
    task('valid-new', { status: 'completed', completedAt: '2026-10-04T09:00:00.000Z' }),
    task('no-ts-new', { status: 'completed', createdAt: '2026-09-15T00:00:00.000Z' }),
  ];
  const result = ids(projectTasksInOrder(input));
  ok(result.startsWith('valid-new,valid-old,'), `both valid completions lead, newest first (got ${result})`);
  const tail = result.split(',').slice(2);
  ok(tail.length === 3 && tail.includes('garbage') && tail.includes('no-ts-old') && tail.includes('no-ts-new'),
    'missing/invalid completions are all placed after valid ones');
  // Among the unknown-timestamp group, the tie-break is createdAt newest first.
  const unknown = projectTasksInOrder(input).filter((t) => !t.completedAt || Number.isNaN(Date.parse(t.completedAt)));
  ok(ids(unknown) === 'garbage,no-ts-new,no-ts-old', 'unknown-timestamp group falls back to createdAt, newest first');
}

console.log('Active tasks keep their order and position');
{
  const input = [
    task('active-b', { status: 'planned' }),
    task('done-x', { status: 'completed', completedAt: '2026-10-02T00:00:00.000Z' }),
    task('active-a', { status: 'today' }),
    task('active-c', { status: 'in_progress' }),
    task('done-y', { status: 'completed', completedAt: '2026-10-06T00:00:00.000Z' }),
    task('incomplete', { status: 'incomplete' }),
  ];
  const sorted = projectTasksInOrder(input);
  const active = sorted.filter((t) => t.status !== 'completed').map((t) => t.id);
  ok(active.join(',') === 'active-b,active-a,active-c,incomplete', 'active tasks are unchanged and in original relative order');
  ok(ids(sorted.filter((t) => t.status === 'completed')) === 'done-y,done-x', 'completed tasks are newest-first');
  ok(sorted.slice(0, 4).every((t) => t.status !== 'completed') && sorted.slice(4).every((t) => t.status === 'completed'),
    'all active tasks precede all completed tasks');
  ok(ids(input) === 'active-b,done-x,active-a,active-c,done-y,incomplete', 'input array is not mutated');
}

console.log('Milestone grouping is unchanged');
{
  const milestoneOf = (tasks: Task[], milestoneId: string | undefined) =>
    tasks.filter((t) => t.projectMilestoneId === milestoneId);
  const input = [
    task('m1-done-old', { status: 'completed', completedAt: '2026-10-01T10:00:00.000Z', projectMilestoneId: 'm1' }),
    task('m2-active', { status: 'planned', projectMilestoneId: 'm2' }),
    task('m1-active', { status: 'planned', projectMilestoneId: 'm1' }),
    task('direct-done-new', { status: 'completed', completedAt: '2026-10-07T10:00:00.000Z' }),
    task('m1-done-new', { status: 'completed', completedAt: '2026-10-08T10:00:00.000Z', projectMilestoneId: 'm1' }),
    task('direct-active', { status: 'planned' }),
    task('m2-done', { status: 'completed', completedAt: '2026-10-03T10:00:00.000Z', projectMilestoneId: 'm2' }),
  ];
  // Exactly what the Projects view does: order the project's tasks once, then
  // ProjectMilestoneSections filters per milestone and TaskList re-applies
  // uncompletedTasksFirst (which must not disturb the order just established).
  const ordered = projectTasksInOrder(input);
  const m1 = uncompletedTasksFirst(milestoneOf(ordered, 'm1')).map((t) => t.id);
  const m2 = uncompletedTasksFirst(milestoneOf(ordered, 'm2')).map((t) => t.id);
  const direct = uncompletedTasksFirst(ordered.filter((t) => !t.projectMilestoneId)).map((t) => t.id);
  ok(m1.join(',') === 'm1-active,m1-done-new,m1-done-old', `milestone 1 keeps grouping, active first, completed newest-first (got ${m1.join(',')})`);
  ok(m2.join(',') === 'm2-active,m2-done', 'milestone 2 keeps grouping and order');
  ok(direct.join(',') === 'direct-active,direct-done-new', '"No milestone" group keeps grouping and order');
}

console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
