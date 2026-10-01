/**
 * Headless check of the single-timer rule (spec §33 timer + Priority focus).
 *
 * One question decides whether a task may start its timer: is another task
 * *actively running* a session? A paused session is `in_progress` too, but it
 * holds no clock — it must not block. Priority timers and normal tasks answer
 * that question identically, because both ask `blockingTimerTask`.
 *
 * The real components are rendered in jsdom, so the "Another task is in
 * progress" dialog is asserted the way the user meets it. The app is mounted
 * once and kept mounted, because remounting is a page reload — and a reload
 * deliberately pauses any still-running session.
 * Run: npx tsx scripts/verify-timer-concurrency.tsx  (requires jsdom)
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
  const { UIProvider } = await import('../components/ui/ui-provider');
  const { PriorityCard } = await import('../components/today/priority-card');
  const { TaskRow } = await import('../components/tasks/task-row');
  const { todayISO } = await import('../lib/dates');
  const { dailyPriorityTimerTaskId } = await import('../lib/selectors');
  const { blockingTimerTask, isTimerPaused, isTimerRunning } = await import('../lib/timer');
  type Task = import('../lib/types').Task;

  let ctx: ReturnType<typeof useData> | null = null;
  const Probe = () => { ctx = useData(); return null; };
  const c = () => ctx!;
  const get = (id: string) => c().data.tasks.find((t) => t.id === id)!;

  /** Today's priority card plus one row per task under test, live from app data. */
  const Harness = ({ taskIds }: { taskIds: string[] }) => {
    const { data } = useData();
    return React.createElement('div', null,
      React.createElement('div', { id: 'priority-slot' }, React.createElement(PriorityCard)),
      ...taskIds.map((id) => {
        const task = data.tasks.find((t) => t.id === id);
        return React.createElement('div', { id: `row-${id}`, key: id },
          task ? React.createElement(TaskRow, { task, showDate: false }) : null);
      }),
      React.createElement(Probe));
  };

  let root: ReturnType<typeof createRoot> | null = null;
  const mountApp = async (taskIds: string[]) => {
    await unmountApp();
    const el = document.createElement('div');
    document.body.appendChild(el);
    const r = createRoot(el);
    root = r;
    await act(async () => {
      r.render(
        React.createElement(AuthProvider, null,
          React.createElement(UIProvider, null,
            React.createElement(DataProvider, null,
              React.createElement(Harness, { taskIds })))),
      );
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  };
  /** Closing the app: the pagehide handler pauses running sessions, then teardown. */
  const unmountApp = async () => {
    if (!root) return;
    const r = root;
    root = null;
    await act(async () => { dom.window.dispatchEvent(new dom.window.Event('pagehide')); });
    await act(async () => { r.unmount(); });
    ctx = null;
  };

  const run = (fn: () => Promise<unknown>) => act(async () => { await fn(); });
  const rowText = (id: string) => document.querySelector(`#row-${id}`)?.textContent ?? '';
  const priorityText = () => document.querySelector('#priority-slot')?.textContent ?? '';
  const clickStart = async (id: string) => {
    const el = document.querySelector(`#row-${id} button[aria-label="Start task"]`);
    if (!el) throw new Error(`no Start button rendered for task ${id}`);
    await act(async () => {
      el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
  };
  const blocked = (id: string) => rowText(id).includes('Another task is in progress');
  /** Close the warning the way the user does — it stays open until dismissed. */
  const dismissBlock = async (id: string) => {
    const buttons = Array.from(document.querySelectorAll(`#row-${id} [role="dialog"] button`));
    const gotIt = buttons.find((b) => (b.textContent ?? '').includes('Got it'));
    if (!gotIt) throw new Error(`no dismiss button in the blocking dialog of task ${id}`);
    await act(async () => {
      gotIt.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  };

  const ok = (cond: boolean, msg: string) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } console.log('✓', msg); };

  /* ------------------------------------------------------------------ */
  /* The four workflow states, at the level of the persisted timer fields */
  /* ------------------------------------------------------------------ */
  const base = {
    id: 'x', title: 'x', priority: 'medium' as const, createdAt: new Date().toISOString(),
    tags: [], postponementCount: 0, archived: false,
  };
  const notStarted = { ...base, status: 'created' as const };
  const running = { ...base, status: 'in_progress' as const, startedAt: new Date().toISOString() };
  const paused = { ...base, status: 'in_progress' as const, pausedAt: new Date().toISOString(), actualDurationSeconds: 26 };
  const completed = { ...base, status: 'completed' as const, completedAt: new Date().toISOString() };
  ok(blockingTimerTask([notStarted]) === undefined && blockingTimerTask([completed]) === undefined
     && blockingTimerTask([paused]) === undefined && blockingTimerTask([running])?.id === 'x',
     'Only a RUNNING timer blocks: not-started, paused and completed never do');
  ok(blockingTimerTask([paused, running], 'other')?.id === 'x' && blockingTimerTask([running], 'x') === undefined,
     'The guard ignores the task being started and finds the other running session');

  /* ------------------------------------------------------------------ */
  /* Live app: one priority + six normal tasks, one mount throughout      */
  /*                                                                      */
  /* Each "click Start" needs a task that has never been timed: a paused    */
  /* row offers Resume, a running row offers Pause. Tasks are all created   */
  /* up front because mounting the app is a page reload, and a reload       */
  /* deliberately pauses any still-running session.                        */
  /* ------------------------------------------------------------------ */
  await mountApp([]);
  const today = todayISO();
  let priority!: { id: string };
  await run(async () => { priority = await c().actions.setDailyPriority('Ship the release'); });
  const ids: string[] = [];
  for (const title of ['Normal A', 'Normal B', 'Normal C', 'Normal D', 'Normal E', 'Normal F']) {
    await run(async () => { ids.push((await c().actions.addTask({ title, scheduledDate: today, status: 'today' })).id); });
  }
  const [taskA, taskB, taskC, taskD, taskE, taskF] = ids;
  const priorityTaskId = dailyPriorityTimerTaskId(priority.id);
  await mountApp(ids);

  /* A. Running normal task blocks another normal task ------------------ */
  await run(() => c().actions.startTask(taskA));
  ok(isTimerRunning(get(taskA)) && rowText(taskA).includes('Working'), 'A: Normal A is running (startedAt set)');
  ok(blockingTimerTask(c().data.tasks, taskB)?.id === taskA, 'A: the running task is the one reported as blocking');
  await clickStart(taskB);
  ok(blocked(taskB) && rowText(taskB).includes('\u201cNormal A\u201d is currently in progress'),
     'A: starting another task while one runs shows the "Another task is in progress" dialog naming it');
  ok(!isTimerRunning(get(taskB)), 'A: the blocked task did not start a second timer');
  await dismissBlock(taskB);
  ok(!blocked(taskB), 'A: the warning is dismissed and does not linger');

  /* B. Paused normal task does NOT block ------------------------------- */
  await run(() => c().actions.pauseTask(taskA));
  ok(isTimerPaused(get(taskA)) && get(taskA).startedAt === undefined, 'B: Normal A is paused (startedAt cleared, pausedAt set)');
  await clickStart(taskB);
  ok(!blocked(taskB), 'B: a paused task does NOT trigger the "Another task is in progress" dialog');
  ok(isTimerRunning(get(taskB)), 'B: Normal B started its own timer while Normal A stays paused');
  ok(isTimerPaused(get(taskA)) && !isTimerRunning(get(taskA)), 'B: the paused task was left alone');

  /* C. Running Priority blocks a normal task --------------------------- */
  await run(() => c().actions.pauseTask(taskB));
  let priorityTask!: Task | null;
  await run(async () => { priorityTask = await c().actions.startDailyPriorityTimer(priority.id); });
  ok(priorityTask !== null && isTimerRunning(get(priorityTaskId)) && priorityText().includes('Working'),
     'C: the Priority timer is running');
  await clickStart(taskC);
  ok(blocked(taskC) && rowText(taskC).includes('\u201cShip the release\u201d is currently in progress'),
     'C: a RUNNING Priority blocks a normal task from starting');
  ok(!isTimerRunning(get(taskC)), 'C: the normal task did not start');
  await dismissBlock(taskC);

  /* D. Paused Priority does NOT block a normal task -------------------- */
  await run(() => c().actions.pauseTask(priorityTaskId));
  ok(isTimerPaused(get(priorityTaskId)) && priorityText().includes('Resume Priority'),
     'D: the Priority timer is paused and offers "Resume Priority"');
  await clickStart(taskC);
  ok(!blocked(taskC), 'D: a PAUSED Priority does NOT trigger the "Another task is in progress" dialog');
  ok(isTimerRunning(get(taskC)), 'D: Normal C started while the Priority stays paused');

  /* The same rule on the Priority side (the guard inside the data layer) */
  let blockedPriority: Task | null = null;
  await run(async () => { blockedPriority = await c().actions.startDailyPriorityTimer(priority.id); });
  ok(blockedPriority === null && isTimerRunning(get(taskC)),
     'Symmetric: a RUNNING normal task blocks Start Priority');
  await run(() => c().actions.pauseTask(taskC));
  let allowedPriority: Task | null = null;
  await run(async () => { allowedPriority = await c().actions.startDailyPriorityTimer(priority.id); });
  ok(allowedPriority !== null && isTimerRunning(get(priorityTaskId)),
     'Symmetric: a PAUSED normal task does not block Start Priority');

  /* E. Reload with a paused Priority ---------------------------------- */
  await run(() => c().actions.pauseTask(priorityTaskId));
  const frozenPriority = get(priorityTaskId).actualDurationSeconds ?? 0;
  await mountApp(ids);
  ok(isTimerPaused(get(priorityTaskId)) && get(priorityTaskId).startedAt === undefined
     && get(priorityTaskId).actualDurationSeconds === frozenPriority,
     'E: reload keeps the Priority paused with its accumulated time (never re-armed as running)');
  ok(blockingTimerTask(c().data.tasks, taskD) === undefined, 'E: after reload the paused Priority blocks nothing');
  await clickStart(taskD);
  ok(!blocked(taskD) && isTimerRunning(get(taskD)), 'E: after reload, a normal task starts next to the paused Priority');

  /* F. Reload with a paused normal task -------------------------------- */
  await run(() => c().actions.pauseTask(taskD));
  const frozenD = get(taskD).actualDurationSeconds ?? 0;
  await mountApp(ids);
  ok(isTimerPaused(get(taskD)) && get(taskD).actualDurationSeconds === frozenD,
     'F: reload keeps the normal task paused with its accumulated time');
  ok(blockingTimerTask(c().data.tasks, taskE) === undefined, 'F: after reload the paused task blocks nothing');
  await clickStart(taskE);
  ok(!blocked(taskE) && isTimerRunning(get(taskE)), 'F: after reload, another task starts next to the paused one');

  /* The reported regression, verbatim ---------------------------------- */
  await run(() => c().actions.finishTask(taskE));
  await run(() => c().actions.updateTask(priorityTaskId, { actualDurationSeconds: 26 }));
  ok(priorityText().includes('Paused 00:26') && priorityText().includes('Resume Priority'),
     'Regression setup: the Priority reads "Paused 00:26" with a "Resume Priority" button');
  await clickStart(taskF);
  ok(!blocked(taskF), 'Regression: Start on another task shows NO "Another task is in progress" dialog');
  ok(isTimerRunning(get(taskF)), 'Regression: the other task starts its timer normally');

  /* A running task is still the single active one, and closing/reopening
     hands the session to the existing recovery (paused) — which then
     blocks nothing, and never comes back as running. */
  ok(blockingTimerTask(c().data.tasks, taskA)?.id === taskF, 'A running task remains the single active session');
  await mountApp(ids);
  ok(isTimerPaused(get(taskF)) && get(taskF).startedAt === undefined,
     'Reload: closing the app left the running session paused, never running again');
  ok(blockingTimerTask(c().data.tasks, taskA) === undefined, 'Reload: a session recovered as paused blocks nothing');

  await unmountApp();
  console.log('\nTimer concurrency verified.');
  process.exit(0);
}
main();
