/** Phase 1: pure date/accounting checks plus real UI filter/delete regressions.
 * Existing optional test tooling: npm i --no-save --package-lock=false jsdom tsx
 * Run with TZ=Asia/Kolkata, America/New_York and Pacific/Chatham.
 * Browser storage and fake data only; Supabase configuration is forcibly unset.
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { addDays, combineDateTime, startOfWeek, todayISO } from '../lib/dates';
import { focusedTimeInRange, overdueTasks, repeatedlyPostponedTasks, sessionSecondsByDay, stalledProjects, weeklyReviewStats } from '../lib/selectors';
import { emptyData } from '../lib/store/defaults';
import type { AppData, Goal, Project, Task, TimerSession } from '../lib/types';

process.env.NEXT_PUBLIC_SUPABASE_URL = '';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = '';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = '';
let checks = 0;
function check(value: unknown, message: string) { assert.ok(value, message); checks++; console.log('✓', message); }
const at = combineDateTime;
const task = (id: string, patch: Partial<Task> = {}): Task => ({ id, title: `Task ${id}`, status: 'planned', priority: 'medium', createdAt: at('2026-09-01', '09:00'), archived: false, postponementCount: 0, tags: [], ...patch });
const project = (id: string, patch: Partial<Project> = {}): Project => ({ id, name: `Project ${id}`, status: 'active', createdAt: at('2026-09-01', '09:00'), ...patch });
const goal = (id: string): Goal => ({ id, name: `Goal ${id}`, status: 'active', createdAt: at('2026-09-01', '09:00') });
const session = (id: string, taskId: string, start: string, end: string, seconds?: number): TimerSession => ({ id, taskId, startedAt: start, endedAt: end, durationSeconds: seconds ?? Math.round((Date.parse(end) - Date.parse(start)) / 1000) });
const sum = (entries: { seconds: number }[]) => entries.reduce((total, entry) => total + entry.seconds, 0);
const from = '2026-10-05', to = '2026-10-11';

function accounting() {
  const data: AppData = { ...emptyData(), projects: [project('p1', { goalId: 'g1' }), project('hold', { status: 'on_hold', goalId: 'g1' })], goals: [goal('g1'), goal('g2')], tasks: [
    task('open', { projectId: 'p1', status: 'in_progress', pausedAt: at(from, '10:00'), actualDurationSeconds: 99999 }),
    task('direct', { projectId: 'p1', goalId: 'g2', status: 'completed', scheduledDate: '2026-09-01', completedAt: at(from, '18:00'), actualDurationSeconds: 88888 }),
    task('unassigned'), task('daily-priority-timer:test'), task('hold', { projectId: 'hold' }), task('someday', { status: 'someday', goalId: 'g2' }),
    task('archived', { archived: true }), task('missing-links', { projectId: 'gone', goalId: 'gone' }),
    task('legacy', { status: 'completed', scheduledDate: from, actualDurationSeconds: 77777 }),
  ], timerSessions: [
    session('left', 'open', at(addDays(from, -1), '23:40'), at(from, '00:20')),
    session('run', 'open', at(from, '09:00'), at(from, '09:30')),
    session('resume', 'open', at(from, '11:00'), at(from, '11:15')),
    session('right', 'direct', at(to, '23:40'), at(addDays(to, 1), '00:20')),
    session('free', 'unassigned', at(from, '12:00'), at(from, '12:05')),
    session('priority', 'daily-priority-timer:test', at(from, '13:00'), at(from, '13:02')),
    session('hold', 'hold', at(from, '14:00'), at(from, '14:03')),
    session('someday', 'someday', at(from, '15:00'), at(from, '15:04')),
    session('missing-links', 'missing-links', at(from, '16:00'), at(from, '16:01')),
    session('ignored-archived', 'archived', at(from, '17:00'), at(from, '18:00')),
    session('ignored-deleted', 'deleted', at(from, '17:00'), at(from, '18:00')),
    session('before', 'open', at(addDays(from, -1), '23:00'), at(from, '00:00')),
    session('after', 'open', at(addDays(to, 1), '00:00'), at(addDays(to, 1), '01:00')),
    session('zero', 'open', at(from, '19:00'), at(from, '19:00')),
    session('invalid', 'open', 'invalid', 'invalid', 500),
  ] };
  const period = focusedTimeInRange(data, from, to);
  const expected = (20 + 30 + 15 + 20 + 5 + 2 + 3 + 4 + 1) * 60;
  check(period.seconds === expected, 'Exact weekly session total: midnight edges clipped, paused gaps excluded, lifetime totals ignored');
  check(period.byDay.length === 7 && period.byDay[0].seconds === 80 * 60 && period.byDay[6].seconds === 20 * 60, 'Monday through Sunday local buckets, zero recorded days included');
  check(sum(period.byDay) === expected && sum(period.byProject) === expected && sum(period.byGoal) === expected && sum(period.byTask) === expected, 'Every breakdown reconciles exactly to underlying session seconds');
  check(period.byProject.find((entry) => entry.project?.id === 'p1')?.seconds === 85 * 60, 'Open and completed tasks both attribute to current project');
  check(period.byGoal.find((entry) => entry.goal?.id === 'g1')?.seconds === 68 * 60 && period.byGoal.find((entry) => entry.goal?.id === 'g2')?.seconds === 24 * 60, 'Inherited project goal and direct task goal precedence, no double-counting');
  check(period.byProject.find((entry) => !entry.project)?.seconds === 12 * 60 && period.byGoal.find((entry) => !entry.goal)?.seconds === 8 * 60, 'No-project/no-goal rows retain priority timers and dangling links');
  check(period.byProject.some((entry) => entry.project?.id === 'hold') && period.byTask.some((entry) => entry.task.status === 'someday'), 'On-hold and Someday exclusions do not erase real recorded time');
  check(focusedTimeInRange({ ...data, tasks: data.tasks.map((t) => t.id === 'open' ? { ...t, goalId: 'deleted-goal' } : t) }, from, to).byGoal.find((entry) => entry.goal?.id === 'g1')?.seconds === 68 * 60, 'Missing direct goal falls back to current project goal');
  const moved = focusedTimeInRange({ ...data, projects: [project('p1', { goalId: 'g2' }), data.projects[1]], tasks: data.tasks.map((t) => t.id === 'direct' ? { ...t, projectId: 'hold' } : t) }, from, to);
  check(moved.byGoal.find((entry) => entry.goal?.id === 'g2')?.seconds === 89 * 60 && moved.byProject.find((entry) => entry.project?.id === 'hold')?.seconds === 23 * 60, 'Reparenting uses current goal and project links');
  const weekly = weeklyReviewStats(data, from, to);
  check(weekly.focusedSeconds === expected && weekly.completed.length === 1 && weekly.completed[0].id === 'legacy', 'Weekly time changes without altering existing completion-count semantics');
  const historical = focusedTimeInRange({ ...data, timerSessions: [] }, from, to);
  check(historical.seconds === 0 && historical.byDay.every((day) => day.seconds === 0) && historical.firstAvailableSessionDate === undefined, 'Legacy lifetime totals never fabricate session history');
  for (const boundary of ['2026-03-02', '2026-10-26', '2026-12-28']) {
    const end = addDays(boundary, 6);
    const startAt = at(addDays(boundary, -1), '23:30'), endAt = at(addDays(end, 1), '00:30');
    const run = session('span', 'open', startAt, endAt);
    const actual = focusedTimeInRange({ ...data, timerSessions: [run] }, boundary, end);
    const expectedSeconds = (Date.parse(at(addDays(end, 1), '00:00')) - Date.parse(at(boundary, '00:00'))) / 1000;
    check(actual.seconds === expectedSeconds && sum(actual.byDay) === actual.seconds, `DST/year boundary ${boundary}: local week conserves every second`);
  }
  const rounding = session('rounding', 'open', at(from, '23:59'), at(addDays(from, 1), '00:01'), 61);
  check(sum(focusedTimeInRange({ ...data, timerSessions: [rounding] }, from, to).byDay) === 61, 'Midnight rounding conserves authoritative credited seconds');
  const raw = data.timerSessions.filter((s) => data.tasks.some((t) => t.id === s.taskId && !t.archived)).reduce((total, s) => total + [...sessionSecondsByDay(s)].filter(([date]) => date >= from && date <= to).reduce((n, [, seconds]) => n + seconds, 0), 0);
  check(raw === period.seconds, 'Independent raw-session reconciliation matches weekly selector');
}

function warnings() {
  const date = '2026-10-19';
  const data: AppData = { ...emptyData(), projects: [project('old'), project('new', { createdAt: at('2026-10-06', '00:00') }), project('hold', { status: 'on_hold' }), project('empty'), project('completed', { status: 'completed' }), project('someday'), project('recent'), project('boundary'), project('running')], tasks: [
    task('old', { projectId: 'old', scheduledDate: '2026-10-18', postponementCount: 3 }),
    task('new', { projectId: 'new' }), task('hold', { projectId: 'hold', scheduledDate: '2026-10-18' }), task('completed', { projectId: 'completed' }),
    task('someday', { projectId: 'someday', status: 'someday', scheduledDate: '2026-10-18', postponementCount: 8 }),
    task('recent', { projectId: 'recent' }), task('recent-done', { projectId: 'recent', status: 'completed', completedAt: at('2026-10-06', '00:30') }),
    task('boundary', { projectId: 'boundary' }), task('running', { projectId: 'running', status: 'in_progress', startedAt: at(date, '09:00') }),
    task('today', { scheduledDate: date, postponementCount: 2 }), task('future', { scheduledDate: addDays(date, 1), postponementCount: 4 }),
    task('done', { scheduledDate: '2026-10-18', status: 'completed', postponementCount: 9 }), task('cancelled', { scheduledDate: '2026-10-18', status: 'cancelled', postponementCount: 9 }), task('archive', { scheduledDate: '2026-10-18', archived: true, postponementCount: 9 }),
  ], timerSessions: [session('exact14', 'boundary', at('2026-10-05', '00:00'), at('2026-10-05', '00:30'))] };
  check(stalledProjects(data, date).map((s) => s.project.id).sort().join(',') === 'boundary,old', 'Stalls: exact 14-day threshold, creation fallback, recent completion/session and running suppression; hold/Someday/empty/completed excluded');
  check(stalledProjects(data, date).find((s) => s.project.id === 'boundary')?.inactiveDays === 14, '14-day inactivity counted on local dates, not UTC slices');
  const recentRun = session('recent-run', 'old', at('2026-10-06', '00:00'), at('2026-10-06', '00:30'));
  check(!stalledProjects({ ...data, timerSessions: [...data.timerSessions, recentRun] }, date).some((s) => s.project.id === 'old'), '13-day-old saved run suppresses stall even on unfinished/paused work');
  const parked = task('parked', { projectId: 'old', status: 'someday' });
  const archived = task('archived-activity', { projectId: 'old', archived: true });
  check(stalledProjects({ ...data, tasks: [...data.tasks, parked, archived], timerSessions: [...data.timerSessions,
    session('parked-run', parked.id, at(date, '09:00'), at(date, '09:30')),
    session('archive-run', archived.id, at(date, '09:00'), at(date, '09:30')),
    session('zero-run', 'old', at(date, '09:00'), at(date, '09:00')),
  ] }, date).some((s) => s.project.id === 'old'), 'Someday, archived and zero-second activity do not hide stalled open work');
  check(overdueTasks(data.tasks, date).map((t) => t.id).sort().join(',') === 'hold,old', 'Overdue filter is scheduled-date-only and excludes today, future, Someday, completed/cancelled/archived');
  check(repeatedlyPostponedTasks(data.tasks).map((t) => t.id).sort().join(',') === 'future,old', 'Postponed filter includes exactly open tasks with 3+ postponements');
}

async function ui() {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
  const g = globalThis as Record<string, unknown>;
  g.window = dom.window; g.document = dom.window.document; g.localStorage = dom.window.localStorage; g.self = dom.window; g.IS_REACT_ACT_ENVIRONMENT = true;
  const React = await import('react');
  const { act } = React;
  const { createRoot } = await import('react-dom/client');
  const { AuthProvider } = await import('../components/auth/auth-provider');
  const { DataProvider } = await import('../components/data/data-provider');
  const { UIProvider } = await import('../components/ui/ui-provider');
  const { TasksScreen } = await import('../components/tasks/tasks-screen');
  const { TodayScreen } = await import('../components/today/today-screen');
  const { WeeklyReview } = await import('../components/review/weekly-review');
  const today = todayISO(), monday = startOfWeek(today);
  const data: AppData = { ...emptyData(), goals: [goal('ui')], projects: [project('stalled'), project('hold', { status: 'on_hold' }), project('linked', { goalId: 'ui' })], tasks: [
    task('alpha', { title: 'Schedule and deadline', scheduledDate: addDays(today, -2), dueDate: addDays(today, -1), postponementCount: 3 }),
    task('beta', { title: 'Schedule only', scheduledDate: addDays(today, -1), dueDate: addDays(today, 10), postponementCount: 4, projectId: 'linked' }),
    task('gamma', { title: 'Deadline only', dueDate: addDays(today, -1) }),
    task('held', { title: 'Hidden held warning', projectId: 'hold', scheduledDate: addDays(today, -2), dueDate: addDays(today, -1) }),
    task('someday', { title: 'Hidden Someday warning', status: 'someday', scheduledDate: addDays(today, -2), dueDate: addDays(today, -1), postponementCount: 10 }),
    task('stalled', { projectId: 'stalled' }),
  ], timerSessions: [session('ui', 'beta', at(monday, '09:00'), at(monday, '09:30'))] };
  data.settings.general.automaticCarryForward = false;
  let root: ReturnType<typeof createRoot> | undefined;
  const mount = async (node: React.ReactNode) => {
    if (root) await act(async () => root!.unmount());
    dom.window.localStorage.clear(); dom.window.localStorage.setItem('pace.db.v1', JSON.stringify(data));
    document.body.innerHTML = '<div id="root"></div>'; root = createRoot(document.getElementById('root')!);
    await act(async () => root!.render(<AuthProvider><DataProvider><UIProvider>{node}</UIProvider></DataProvider></AuthProvider>));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
  };
  const click = async (element: Element | undefined | null) => {
    assert.ok(element, 'UI control exists');
    await act(async () => { element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 10)); });
  };
  const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  const input = async (selector: string, value: string, select = false) => {
    const element = document.querySelector(selector)!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(select ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype, 'value')!.set!.call(element, value);
      element.dispatchEvent(new dom.window.Event(select ? 'change' : 'input', { bubbles: true }));
    });
  };
  await mount(<TodayScreen />);
  const header = document.querySelector('header')!.textContent!;
  check(header.split('Schedule and deadline').length === 2 && header.includes('deadline also overdue'), 'Today shows dual-overdue task once with explicit deadline distinction');
  check(header.includes('Overdue schedules · 2') && header.includes('Deadline only') && !header.includes('Hidden held warning') && !header.includes('Hidden Someday warning'), 'Today separates deadline-only warnings, excludes held/Someday nudges');
  check(header.includes('Projects to revisit · 1'), 'Today renders compact stalled project summary');
  await mount(<WeeklyReview />);
  check(document.querySelector('[data-weekly-focused-total]')?.textContent === '30 min' && document.body.textContent?.includes('Goal ui'), 'Weekly Review renders session total and project/goal rows');
  check(document.body.textContent?.includes('migration 006') && document.body.textContent?.includes('not a migration date'), 'Weekly Review discloses missing historical daily data honestly');
  await click(document.querySelector('[aria-label="Previous week"]'));
  check(document.querySelector('[data-weekly-focused-total]')?.textContent === '0 min recorded' && document.body.textContent?.includes('does not mean no work'), 'Week navigation recomputes totals and empty recorded history');
  await mount(<TasksScreen />);
  await click(button('Overdue'));
  check(document.body.textContent?.includes('3 tasks in view') && !document.body.textContent?.includes('Hidden Someday warning'), 'Overdue UI reuses selector (held tasks remain available for explicit review)');
  await input('input[placeholder="Search tasks…"]', 'Schedule');
  check(document.body.textContent?.includes('2 tasks in view'), 'Search composes with Overdue filter');
  await input('select[aria-label="Sort tasks"]', 'scheduled-desc', true);
  const titles = [...document.querySelectorAll('span')].filter((s) => ['Schedule only', 'Schedule and deadline'].includes(s.textContent!)).map((s) => s.textContent);
  check(titles.indexOf('Schedule only') < titles.indexOf('Schedule and deadline'), 'Existing sorting composes with Overdue filter');
  await click(button('Select'));
  await click(document.querySelector('button[role="checkbox"][aria-label^="Select all"]'));
  await click(button('Delete selected (2)'));
  check(document.querySelector('[role="dialog"]')?.textContent?.includes('2 tasks') && document.querySelector('[role="dialog"]')?.textContent?.includes('recorded focus session'), 'Filtered select-all and delete consequence counts still include session cascades');
  const before = dom.window.localStorage.getItem('pace.db.v1');
  await click([...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent?.trim() === 'Cancel'));
  check(dom.window.localStorage.getItem('pace.db.v1') === before, 'Bulk delete cancellation writes nothing');
  await click(button('Delete selected (2)'));
  await click([...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent?.trim() === 'Delete 2 tasks'));
  const after = JSON.parse(dom.window.localStorage.getItem('pace.db.v1')!);
  check(!after.tasks.some((t: Task) => ['alpha', 'beta'].includes(t.id)) && after.tasks.some((t: Task) => t.id === 'held') && after.timerSessions.length === 0, 'Bulk delete removes only filtered selection and its sessions, leaving hidden tasks untouched');
  await mount(<TasksScreen />);
  await click(button('Postponed 3×+'));
  check(document.body.textContent?.includes('2 tasks in view') && !document.body.textContent?.includes('Hidden Someday warning'), 'Postponed 3×+ UI excludes parked work');
  const scopes = [...document.querySelectorAll('select')];
  const projectSelect = scopes.find((s) => s.options[0].textContent === 'All projects')!;
  await act(async () => { projectSelect.value = 'linked'; projectSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  check(document.body.textContent?.includes('1 task in view') && document.body.textContent?.includes('Schedule only'), 'Project scope composes with Postponed 3×+');
  const goalSelect = scopes.find((s) => s.options[0].textContent === 'All goals')!;
  await act(async () => { goalSelect.value = 'ui'; goalSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  check(document.body.textContent?.includes('1 task in view'), 'Inherited goal scope composes with Postponed 3×+');
  await click(button('Select'));
  await click(document.querySelector('button[role="checkbox"][aria-label^="Select all"]'));
  await click(button('Delete selected (1)'));
  await click([...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent?.trim() === 'Delete 1 task'));
  check(JSON.parse(dom.window.localStorage.getItem('pace.db.v1')!).tasks.some((t: Task) => t.id === 'alpha'), 'Postponed filtered bulk delete leaves postponed tasks outside current project/goal scope untouched');
  await act(async () => root!.unmount()); dom.window.close();
}

accounting(); warnings();
ui().then(() => console.log(`\nPhase 1: ${checks} checks passed (${process.env.TZ ?? 'system timezone'}).`)).catch((error) => { console.error(error); process.exit(1); });
