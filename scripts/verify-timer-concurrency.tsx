/**
 * Headless check of CONCURRENT task timers.
 *
 * FocusDesk tracks real work, and real work overlaps: Task A in VS Code,
 * Task B in Arena.ai and Task C (a book) genuinely run at the same time. So
 * any number of task timers may run simultaneously, and starting one must
 * never stop, pause, replace or switch another — through any entry point:
 * a task row's Start, a task row's Resume, the row's "Start (in progress)"
 * menu item, the Timer Dock, Focus Mode, or Today's Priority.
 *
 * There is deliberately no concurrency guard left in the codebase, so this
 * script also asserts the *absence* of the old "Another task is in progress"
 * dialog on every path that used to raise it.
 *
 * The real components are rendered in jsdom, so each path is exercised the
 * way the user meets it. The app is mounted once and kept mounted, because
 * remounting is a page reload — and a reload deliberately pauses every
 * still-running session (unchanged recovery behaviour, asserted at the end).
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
  const { AppRouterContext } = await import('next/dist/shared/lib/app-router-context.shared-runtime');
  const { AuthProvider } = await import('../components/auth/auth-provider');
  const { DataProvider, useData } = await import('../components/data/data-provider');
  const { UIProvider, useUI } = await import('../components/ui/ui-provider');
  const { PriorityCard } = await import('../components/today/priority-card');
  const { TaskRow } = await import('../components/tasks/task-row');
  const { TimerDock } = await import('../components/layout/timer-dock');
  const { FocusMode } = await import('../components/layout/focus-mode');
  const { todayISO } = await import('../lib/dates');
  const { dailyPriorityTimerTaskId } = await import('../lib/selectors');
  const { elapsedActiveSeconds, isTimerPaused, isTimerRunning, runningTimerTasks } = await import('../lib/timer');
  type Task = import('../lib/types').Task;

  let ctx: ReturnType<typeof useData> | null = null;
  let ui: ReturnType<typeof useUI> | null = null;
  const Probe = () => { ctx = useData(); ui = useUI(); return null; };
  const c = () => ctx!;
  const u = () => ui!;
  const get = (id: string) => c().data.tasks.find((t) => t.id === id)!;

  const router = {
    push: () => {}, replace: () => {}, prefetch: () => Promise.resolve(),
    back: () => {}, forward: () => {}, refresh: () => {},
  } as unknown as import('next/dist/shared/lib/app-router-context.shared-runtime').AppRouterInstance;

  /** Priority card, the Timer Dock, Focus Mode and one row per task under test. */
  const Harness = ({ taskIds }: { taskIds: string[] }) => {
    const { data } = useData();
    return React.createElement(AppRouterContext.Provider, { value: router },
      React.createElement('div', { id: 'priority-slot' }, React.createElement(PriorityCard)),
      React.createElement('div', { id: 'dock-slot' }, React.createElement(TimerDock)),
      React.createElement('div', { id: 'focus-slot' }, React.createElement(FocusMode)),
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
    ctx = null; ui = null;
  };

  const run = (fn: () => Promise<unknown>) => act(async () => { await fn(); });
  const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
  const rowText = (id: string) => document.querySelector(`#row-${id}`)?.textContent ?? '';
  const priorityText = () => document.querySelector('#priority-slot')?.textContent ?? '';
  const dockText = () => document.querySelector('#dock-slot')?.textContent ?? '';
  const focusText = () => document.querySelector('#focus-slot')?.textContent ?? '';

  const clickEl = async (el: Element | null, what: string) => {
    if (!el) throw new Error(`no element to click: ${what}`);
    await act(async () => {
      el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
  };
  const clickIn = (scope: string, selector: string, what: string) =>
    clickEl(document.querySelector(`${scope} ${selector}`), what);
  /** Click a button by its visible text inside `scope`. */
  const clickText = async (scope: string, text: string) => {
    const buttons = Array.from(document.querySelectorAll(`${scope} button`));
    const match = buttons.find((b) => (b.textContent ?? '').includes(text));
    await clickEl(match ?? null, `button containing “${text}” in ${scope}`);
  };

  /** The old guard's dialog must never appear again, anywhere. */
  const anyBlockDialog = () => (document.body.textContent ?? '').includes('Another task is in progress');
  const runningIds = () => runningTimerTasks(c().data.tasks).map((t) => t.id).sort();
  const sorted = (ids: string[]) => [...ids].sort();

  const ok = (cond: boolean, msg: string) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } console.log('✓', msg); };

  /* ------------------------------------------------------------------ */
  /* Unit level: the helper reports EVERY running task, never just one   */
  /* ------------------------------------------------------------------ */
  const base = {
    title: 'x', priority: 'medium' as const, createdAt: new Date().toISOString(),
    tags: [], postponementCount: 0, archived: false,
  };
  const notStarted: Task = { ...base, id: 'n', status: 'created' };
  const runA: Task = { ...base, id: 'a', status: 'in_progress', startedAt: new Date().toISOString() };
  const runB: Task = { ...base, id: 'b', status: 'in_progress', startedAt: new Date().toISOString() };
  const pausedT: Task = { ...base, id: 'p', status: 'in_progress', pausedAt: new Date().toISOString(), actualDurationSeconds: 26 };
  const completed: Task = { ...base, id: 'c', status: 'completed', completedAt: new Date().toISOString() };
  const archivedRunning: Task = { ...base, id: 'z', status: 'in_progress', startedAt: new Date().toISOString(), archived: true };

  ok(runningTimerTasks([notStarted, pausedT, completed]).length === 0,
     'Unit: not-started, paused and completed tasks are not running');
  ok(runningTimerTasks([runA, runB, pausedT, completed]).map((t) => t.id).join() === 'a,b',
     'Unit: every running task is reported — two at once, not one');
  ok(runningTimerTasks([archivedRunning]).length === 0, 'Unit: archived tasks stay out of the running set');

  /* ------------------------------------------------------------------ */
  /* Live app: one priority + several normal tasks, one mount throughout  */
  /* ------------------------------------------------------------------ */
  await mountApp([]);
  const today = todayISO();
  let priority!: { id: string };
  await run(async () => { priority = await c().actions.setDailyPriority('Ship the release'); });
  const ids: string[] = [];
  for (const title of ['Task A', 'Task B', 'Task C', 'Task D', 'Task E']) {
    await run(async () => { ids.push((await c().actions.addTask({ title, scheduledDate: today, status: 'today' })).id); });
  }
  const [taskA, taskB, taskC, taskD, taskE] = ids;
  const priorityTaskId = dailyPriorityTimerTaskId(priority.id);
  await mountApp(ids);

  /* ------------------------------------------------------------------ */
  /* 1. A → B → C : three timers started without pausing the previous     */
  /* ------------------------------------------------------------------ */
  await clickIn(`#row-${taskA}`, 'button[aria-label="Start task"]', 'Start A');
  ok(isTimerRunning(get(taskA)) && !anyBlockDialog(), '1: Task A started');

  await clickIn(`#row-${taskB}`, 'button[aria-label="Start task"]', 'Start B');
  ok(!anyBlockDialog(), '1: starting B while A runs shows NO "Another task is in progress" dialog');
  ok(isTimerRunning(get(taskB)), '1: Task B started');
  ok(isTimerRunning(get(taskA)), '1: Task A is STILL running — B did not stop it');

  await clickIn(`#row-${taskC}`, 'button[aria-label="Start task"]', 'Start C');
  ok(!anyBlockDialog(), '1: starting C while A and B run shows no dialog');
  ok(sorted(runningIds()).join() === sorted([taskA, taskB, taskC]).join(),
     '1: A = running, B = running, C = running — three independent timers');
  ok(rowText(taskA).includes('Working') && rowText(taskB).includes('Working') && rowText(taskC).includes('Working'),
     '1: all three rows read "Working"');

  /* Each timer accumulates on its own. */
  await wait(1100);
  ok(elapsedActiveSeconds(get(taskA)) >= 1 && elapsedActiveSeconds(get(taskB)) >= 1 && elapsedActiveSeconds(get(taskC)) >= 1,
     '1: every running timer accumulates time independently');

  /* ------------------------------------------------------------------ */
  /* Timer Dock shows all of them at once                                 */
  /* ------------------------------------------------------------------ */
  ok(dockText().includes('Task A') && dockText().includes('Task B') && dockText().includes('Task C'),
     'Dock: all three running timers are listed simultaneously');

  /* ------------------------------------------------------------------ */
  /* 2. Pausing B must not affect A or C                                  */
  /* ------------------------------------------------------------------ */
  const aBeforePause = elapsedActiveSeconds(get(taskA));
  await clickIn(`#row-${taskB}`, 'button[aria-label="Pause timer"]', 'Pause B');
  ok(isTimerPaused(get(taskB)), '2: B = paused');
  ok(isTimerRunning(get(taskA)) && isTimerRunning(get(taskC)), '2: A = running, C = running — unaffected by pausing B');
  ok(sorted(runningIds()).join() === sorted([taskA, taskC]).join(), '2: exactly A and C remain running');
  const bFrozen = get(taskB).actualDurationSeconds ?? 0;
  await wait(1100);
  ok((get(taskB).actualDurationSeconds ?? 0) === bFrozen, '2: B\u2019s accumulated time is frozen while paused');
  ok(elapsedActiveSeconds(get(taskA)) > aBeforePause, '2: A kept accumulating across B\u2019s pause');

  /* Resuming B from its row must not touch A or C either. */
  await clickIn(`#row-${taskB}`, 'button[aria-label="Resume timer"]', 'Resume B');
  ok(!anyBlockDialog(), '2: resuming B while A and C run shows no dialog');
  ok(sorted(runningIds()).join() === sorted([taskA, taskB, taskC]).join(),
     '2: Resume brings B back alongside the still-running A and C');
  ok((get(taskB).actualDurationSeconds ?? 0) >= bFrozen, '2: B resumed from its accumulated time, nothing lost');

  /* ------------------------------------------------------------------ */
  /* 3. Finishing C must not affect A or B                                */
  /* ------------------------------------------------------------------ */
  await clickIn(`#row-${taskC}`, 'button[aria-label="Finish task"]', 'Finish C');
  ok(get(taskC).status === 'completed' && (get(taskC).actualDurationSeconds ?? 0) >= 1,
     '3: C is completed with its own recorded duration');
  ok(sorted(runningIds()).join() === sorted([taskA, taskB]).join(), '3: A and B are still running after C finished');

  /* ------------------------------------------------------------------ */
  /* 4. Daily Priority starts next to the running tasks — no modal        */
  /* ------------------------------------------------------------------ */
  ok(priorityText().includes('Start Priority'), '4: the Priority card offers Start Priority');
  await clickText('#priority-slot', 'Start Priority');
  ok(!anyBlockDialog(), '4: Start Priority while two tasks run shows NO dialog');
  ok(isTimerRunning(get(priorityTaskId)), '4: the Daily Priority timer is running');
  ok(isTimerRunning(get(taskA)) && isTimerRunning(get(taskB)),
     '4: the already-running tasks are untouched by the Priority timer');
  ok(sorted(runningIds()).join() === sorted([taskA, taskB, priorityTaskId]).join(),
     '4: Existing tasks = running, Daily Priority task = running');
  ok(c().toasts.every((t) => !t.message.includes('before starting another timer')),
     '4: no "finish or pause" toast was raised');

  /* The same through the service layer directly (the old guard lived here). */
  await run(() => c().actions.pauseTask(priorityTaskId));
  let resumedPriority: Task | null = null;
  await run(async () => { resumedPriority = await c().actions.startDailyPriorityTimer(priority.id); });
  ok(resumedPriority !== null && isTimerRunning(get(priorityTaskId)),
     '4: startDailyPriorityTimer resolves to a running task while others run (never null)');
  ok(isTimerRunning(get(taskA)) && isTimerRunning(get(taskB)), '4: and still leaves A and B running');

  /* ------------------------------------------------------------------ */
  /* 5. Focus Mode does not stop background timers                        */
  /* ------------------------------------------------------------------ */
  await act(async () => { u().startFocus({ type: 'task', id: taskD, title: 'Task D' }); });
  ok(focusText().includes('Task D'), '5: Focus Mode opened on Task D');
  await clickText('#focus-slot', 'Start');
  ok(!anyBlockDialog(), '5: starting a Focus Mode timer shows no dialog');
  ok(isTimerRunning(get(taskD)), '5: the Focus Mode task timer started');
  ok(isTimerRunning(get(taskA)) && isTimerRunning(get(taskB)) && isTimerRunning(get(priorityTaskId)),
     '5: every background timer remains running — Focus Mode stopped nothing');

  await clickText('#focus-slot', 'Pause');
  ok(isTimerPaused(get(taskD)), '5: Focus Mode pause affects only its own task');
  ok(isTimerRunning(get(taskA)) && isTimerRunning(get(taskB)), '5: background timers still running after a Focus Mode pause');
  await clickText('#focus-slot', 'Resume');
  ok(isTimerRunning(get(taskD)) && isTimerRunning(get(taskA)) && isTimerRunning(get(taskB)),
     '5: Focus Mode resume starts next to the active timers');
  await act(async () => { u().stopFocus(); });

  /* ------------------------------------------------------------------ */
  /* 6. The row's "Start (in progress)" menu item follows the same rule   */
  /* ------------------------------------------------------------------ */
  await clickIn(`#row-${taskE}`, 'button[aria-label="Task actions"]', 'open Task E menu');
  await clickText(`#row-${taskE}`, 'Start (in progress)');
  ok(!anyBlockDialog() && isTimerRunning(get(taskE)), '6: the menu Start path also starts a concurrent timer');
  ok(runningTimerTasks(c().data.tasks).length === 5,
     '6: five timers (A, B, D, E, Priority) run at the same time');
  ok(dockText().includes('Task A') && dockText().includes('Task B') && dockText().includes('Task D')
     && dockText().includes('Task E') && dockText().includes('Ship the release'),
     'Dock: all five concurrent timers are listed simultaneously');

  /* ------------------------------------------------------------------ */
  /* 7. The manual scenario, end to end: A keeps accumulating throughout  */
  /* ------------------------------------------------------------------ */
  const aMidpoint = elapsedActiveSeconds(get(taskA));
  await run(() => c().actions.pauseTask(taskB));
  await run(() => c().actions.finishTask(taskE));
  await wait(1100);
  ok(isTimerRunning(get(taskA)), '7: A is still running after B was paused and E finished');
  ok(elapsedActiveSeconds(get(taskA)) > aMidpoint,
     '7: A continued accumulating time throughout the whole session');
  ok(isTimerPaused(get(taskB)) && get(taskB).status === 'in_progress', '7: B stayed paused, not stopped');
  ok(get(taskE).status === 'completed', '7: E stayed completed');

  /* ------------------------------------------------------------------ */
  /* 8. Recovery is unchanged: a reload still pauses every running timer  */
  /* ------------------------------------------------------------------ */
  const aBeforeReload = get(taskA).actualDurationSeconds ?? 0;
  await mountApp(ids);
  ok(runningTimerTasks(c().data.tasks).length === 0,
     '8: reload recovers every running session as paused (existing recovery, unchanged)');
  ok(isTimerPaused(get(taskA)) && (get(taskA).actualDurationSeconds ?? 0) >= aBeforeReload,
     '8: A is paused at its last durable checkpoint with its time intact');
  ok(isTimerPaused(get(taskD)) && isTimerPaused(get(priorityTaskId)),
     '8: the Focus Mode task and the Priority recovered as paused too');

  /* And several can be restarted again side by side after the reload. */
  await clickIn(`#row-${taskA}`, 'button[aria-label="Resume timer"]', 'Resume A');
  await clickIn(`#row-${taskD}`, 'button[aria-label="Resume timer"]', 'Resume D');
  ok(!anyBlockDialog() && isTimerRunning(get(taskA)) && isTimerRunning(get(taskD)),
     '8: after a reload two timers resume side by side with no dialog');

  ok(!anyBlockDialog(), 'The "Another task is in progress" dialog never appeared at any point');

  await unmountApp();
  console.log('\nConcurrent task timers verified.');
  process.exit(0);
}
main();
