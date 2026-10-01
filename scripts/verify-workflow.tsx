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
  const { AuthProvider } = await import('../components/auth/auth-provider');
  const { DataProvider, useData } = await import('../components/data/data-provider');
  const { todayISO, addDays, startOfWeek, endOfWeek, isoWeekKey } = await import('../lib/dates');
  const { weeklyReviewStats } = await import('../lib/selectors');
  const { elapsedActiveSeconds, isTimerPaused, isTimerRunning } = await import('../lib/timer');

  let ctx: ReturnType<typeof useData> | null = null;
  const Probe = () => { ctx = useData(); return null; };
  const mount = async () => {
    const el = document.createElement('div'); document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => {
      root.render(React.createElement(AuthProvider, null, React.createElement(DataProvider, null, React.createElement(Probe))));
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    return root;
  };
  const c = () => ctx!;
  const ok = (cond: boolean, msg: string) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } console.log('✓', msg); };
  const run = (fn: () => Promise<unknown>) => act(async () => { await fn(); });
  const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

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

  /* ------------------------------------------------------------------ */
  /* Task timer — estimated vs actual time                               */
  /* ------------------------------------------------------------------ */

  const makeTask = async (title: string, estimatedDuration?: number) => {
    let created!: { id: string };
    await run(async () => {
      created = (await c().actions.addTask({ title, scheduledDate: today, status: 'today', estimatedDuration })) as { id: string };
    });
    return c().data.tasks.find((t) => t.id === created.id)!;
  };
  const get = (id: string) => c().data.tasks.find((t) => t.id === id)!;

  const timed = await makeTask('Timed work', 30);
  ok(timed.estimatedDuration === 30, 'Timer 1: task created with a 30-minute estimate');

  await run(() => c().actions.startTask(timed.id));
  ok(isTimerRunning(get(timed.id)) && get(timed.id).startedAt !== undefined, 'Timer 2-3: Start → in progress with startedAt, timer running');

  await wait(1100);
  ok(elapsedActiveSeconds(get(timed.id)) >= 1, 'Timer: elapsed grows from timestamps (not a counter)');

  // Refresh (full unmount + remount) while the timer runs.
  await act(async () => root.unmount());
  ctx = null;
  root = await mount();
  ok(isTimerRunning(get(timed.id)) && elapsedActiveSeconds(get(timed.id)) >= 1, 'Timer 4-5: running timer continues from the correct elapsed time after reload');

  await wait(1100);
  await run(() => c().actions.pauseTask(timed.id));
  const afterPause = get(timed.id);
  ok(isTimerPaused(afterPause) && (afterPause.actualDurationSeconds ?? 0) >= 2, 'Timer 6: Pause preserves accumulated time');
  const frozen = afterPause.actualDurationSeconds ?? 0;

  await wait(1100);
  ok(Math.floor(elapsedActiveSeconds(get(timed.id))) === frozen, 'Timer 7: paused time does not accumulate');

  await run(() => c().actions.resumeTask(timed.id));
  ok(isTimerRunning(get(timed.id)) && Math.floor(elapsedActiveSeconds(get(timed.id))) >= frozen, 'Timer 8-9: Resume continues from the previous elapsed time');

  await wait(1100);
  await run(() => c().actions.finishTask(timed.id));
  const finished = get(timed.id);
  ok(finished.status === 'completed' && finished.completedAt !== undefined, 'Timer 10+12: Finish → completed with completedAt stored');
  ok(finished.startedAt === undefined && finished.pausedAt === undefined, 'Timer: Finish stops the timer');
  ok((finished.actualDurationSeconds ?? 0) >= frozen + 1, `Timer 10: actual_duration_seconds stored (${finished.actualDurationSeconds}s)`);
  ok(finished.estimatedDuration === 30, 'Timer 11: estimate remains 30 minutes (never overwritten)');

  // Manual completion without the timer: works, and records no actual duration.
  const manual = await makeTask('Manually completed');
  await run(() => c().actions.completeTask(manual.id));
  const manualDone = get(manual.id);
  ok(manualDone.status === 'completed' && manualDone.completedAt !== undefined, 'Timer 15: manual completion still works (completedAt set)');
  ok(manualDone.actualDurationSeconds === undefined, 'Timer: manual completion leaves actual duration empty');

  // Manual completion of a RUNNING task preserves whatever time is available.
  const interrupted = await makeTask('Interrupted', 15);
  await run(() => c().actions.startTask(interrupted.id));
  await wait(1100);
  await run(() => c().actions.completeTask(interrupted.id));
  const interruptedDone = get(interrupted.id);
  ok(interruptedDone.status === 'completed' && (interruptedDone.actualDurationSeconds ?? 0) >= 1
     && interruptedDone.estimatedDuration === 15, 'Timer 14: completing an in-progress task keeps its timing info and estimate');

  // Reopening a completed task clears the timer fields but keeps the record.
  await run(() => c().actions.reopenTask(timed.id));
  const reopened = get(timed.id);
  ok(reopened.status !== 'completed' && reopened.startedAt === undefined && reopened.pausedAt === undefined
     && (reopened.actualDurationSeconds ?? 0) === (finished.actualDurationSeconds ?? 0), 'Timer 14: reopened task is safe (timer cleared, record kept)');

  // Everything (including timing data) survives another full reload.
  await act(async () => root.unmount());
  ctx = null;
  root = await mount();
  const persistedTimed = get(timed.id);
  ok(persistedTimed.actualDurationSeconds === finished.actualDurationSeconds && persistedTimed.estimatedDuration === 30
     && get(manual.id).actualDurationSeconds === undefined, 'Timer 19: timing data persists across reload/logout');

  await act(async () => root.unmount());
  console.log('\nWorkflow verified.');
  process.exit(0);
}
main();
