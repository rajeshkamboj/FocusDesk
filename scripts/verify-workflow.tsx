/**
 * Headless end-to-end check of the core workflow (spec §33), exercising the
 * real DataProvider + LocalRepository. Run: npx tsx scripts/verify-workflow.tsx
 * (requires jsdom installed).
 */
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = dom.window; g.document = dom.window.document; g.localStorage = dom.window.localStorage;
g.IS_REACT_ACT_ENVIRONMENT = true;

async function main() {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { act } = React;
  const { DataProvider, useData } = await import('../components/data/data-provider');
  const { todayISO, addDays, startOfWeek, endOfWeek, isoWeekKey } = await import('../lib/dates');
  const { weeklyReviewStats } = await import('../lib/selectors');

  let ctx: ReturnType<typeof useData> | null = null;
  const Probe = () => { ctx = useData(); return null; };
  const mount = async () => {
    const el = document.createElement('div'); document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => { root.render(React.createElement(DataProvider, null, React.createElement(Probe))); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    return root;
  };
  const c = () => ctx!;
  const ok = (cond: boolean, msg: string) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } console.log('✓', msg); };
  const run = (fn: () => Promise<unknown>) => act(async () => { await fn(); });

  const today = todayISO(), tomorrow = addDays(today, 1);
  let root = await mount();
  ok(c().ready && c().data.tasks.length === 0 && c().data.projects.length === 0, 'App starts empty — nothing hard-coded');

  await run(() => c().actions.setDailyPriority('Ship the release'));
  ok(c().data.dailyPriorities.find((p) => p.date === today)?.title === 'Ship the release', 'Daily priority set');

  const proj = await (async () => { let p; await run(async () => { p = await c().actions.addProject({ name: 'My project' }); }); return p!; })() as { id: string };
  const ids: string[] = [];
  for (const [title, projectId] of [['A', proj.id], ['B', undefined], ['C', undefined]] as const) {
    await run(async () => { const t = await c().actions.addTask({ title, projectId, scheduledDate: today, status: 'today' }); ids.push(t.id); });
  }
  ok(c().data.tasks.filter((t) => t.scheduledDate === today).length === 3, 'Three tasks for today (one with project, two without)');

  await run(() => c().actions.completeTask(ids[0]));
  await run(() => c().actions.completeTask(ids[1]));
  await run(() => c().actions.toggleDailyPriority(c().data.dailyPriorities[0].id));
  ok(c().data.tasks.filter((t) => t.status === 'completed').length === 2, 'Two tasks completed, one remains');

  await run(() => c().actions.postponeTask(ids[2], 'tomorrow'));
  const moved = c().data.tasks.find((t) => t.id === ids[2])!;
  ok(moved.scheduledDate === tomorrow && c().data.tasks.length === 3, 'Unfinished task moved to tomorrow (not duplicated)');
  ok(moved.postponementCount === 1, 'Postponement count increased to 1');

  await run(() => c().actions.setTaskDeadline(ids[2], addDays(today, 5)));
  ok(c().data.tasks.find((t) => t.id === ids[2])!.dueDate === addDays(today, 5), 'Deadline set, separate from scheduled date');

  const w = weeklyReviewStats(c().data, startOfWeek(today), endOfWeek(today));
  ok(w.completed.length === 2 && w.postponedCount >= 1 && w.completedDailyPriorities === 1, 'Weekly review shows completed/postponed/priority stats');

  const nextWeek = isoWeekKey(addDays(today, 7));
  await run(() => c().actions.addWeeklyPriority({ week: nextWeek, title: 'Next week focus', primary: true }));
  ok(c().data.taskHistory.some((h) => h.type === 'postponed'), 'Task history recorded');

  await act(async () => root.unmount());
  ctx = null;
  root = await mount();
  const d = c().data;
  ok(d.tasks.length === 3 && d.projects.length === 1 && d.weeklyPriorities.some((p) => p.week === nextWeek && p.primary)
     && d.tasks.find((t) => t.id === ids[2])!.postponementCount === 1, 'Everything persisted across reload');
  await act(async () => root.unmount());
  console.log('\nWorkflow verified.');
  process.exit(0);
}
main();
