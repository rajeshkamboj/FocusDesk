/**
 * Headless check of the Active Timer Dock.
 *
 * The dock is a presentation layer over the existing authoritative timer
 * state: it must list exactly the tasks whose persisted timer is running or
 * paused, mirror every start/pause/resume/finish/cancel transition made
 * through the normal DataProvider actions, list any number of concurrently
 * running timers, and keep its collapsed preference in localStorage.
 *
 * The real component is rendered in jsdom against the real DataProvider, so
 * the dock is asserted the way the user meets it. Navigation is observed
 * through a stubbed Next app router (the dock only ever pushes a route).
 * Run: npx tsx scripts/verify-timer-dock.tsx  (requires jsdom)
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
  const { UIProvider } = await import('../components/ui/ui-provider');
  const { TimerDock } = await import('../components/layout/timer-dock');
  const { dailyPriorityTimerTaskId } = await import('../lib/selectors');
  const { isTimerPaused, isTimerRunning } = await import('../lib/timer');

  let ctx: ReturnType<typeof useData> | null = null;
  const Probe = () => { ctx = useData(); return null; };
  const c = () => ctx!;
  const get = (id: string) => c().data.tasks.find((t) => t.id === id)!;

  const pushed: string[] = [];
  const router = {
    push: (href: string) => { pushed.push(href); },
    replace: () => {}, prefetch: () => Promise.resolve(), back: () => {}, forward: () => {}, refresh: () => {},
  } as unknown as import('next/dist/shared/lib/app-router-context.shared-runtime').AppRouterInstance;

  const Harness = () =>
    React.createElement(AppRouterContext.Provider, { value: router },
      React.createElement('div', { id: 'dock-slot' }, React.createElement(TimerDock)),
      React.createElement(Probe));

  let root: ReturnType<typeof createRoot> | null = null;
  const mountApp = async () => {
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
              React.createElement(Harness)))),
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
  const dockText = () => document.querySelector('#dock-slot')?.textContent ?? '';
  const click = async (selector: string) => {
    const el = document.querySelector(`#dock-slot ${selector}`);
    if (!el) throw new Error(`no element for ${selector}`);
    await act(async () => {
      el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
  };
  const ok = (cond: boolean, msg: string) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } console.log('✓', msg); };

  /* ------------------------------------------------------------------ */
  /* Membership: only running/paused timers appear                       */
  /* ------------------------------------------------------------------ */
  await mountApp();
  ok(dockText() === '', 'Empty app: the dock renders nothing');

  let idA!: string, idB!: string;
  await run(async () => { idA = (await c().actions.addTask({ title: 'Build FocusDesk' })).id; });
  await run(async () => { idB = (await c().actions.addTask({ title: 'PatientScure' })).id; });
  ok(dockText() === '', 'Never-started tasks do not appear in the dock');

  await run(() => c().actions.startTask(idA));
  ok(dockText().includes('Active timers') && dockText().includes('Build FocusDesk') && dockText().includes('00:0'),
     'Start: the running task appears with a live stopwatch');
  ok(!dockText().includes('PatientScure'), 'A task that was never started stays out of the dock');

  /* Pause via the dock's own control — it reuses the normal action. */
  await click(`button[aria-label="Pause timer for Build FocusDesk"]`);
  ok(isTimerPaused(get(idA)), 'Dock Pause: the task is paused through the normal pauseTask action');
  await run(() => c().actions.updateTask(idA, { actualDurationSeconds: 26 }));
  ok(dockText().includes('00:26'), 'Paused: the dock shows the frozen accumulated time (00:26)');

  /* ------------------------------------------------------------------ */
  /* Multiple timers: any number running, any number paused              */
  /* ------------------------------------------------------------------ */
  await run(() => c().actions.startTask(idB));
  ok(dockText().includes('Build FocusDesk') && dockText().includes('PatientScure'),
     'Both the paused and the newly running task are listed');
  const text = dockText();
  ok(text.indexOf('PatientScure') < text.indexOf('Build FocusDesk'), 'Ordering: the running task is listed first');

  /* Resume adds a timer; it never stops or replaces the one already running. */
  await click(`button[aria-label="Resume timer for Build FocusDesk"]`);
  ok(isTimerRunning(get(idA)) && isTimerRunning(get(idB)),
     'Dock Resume while another timer runs: both run side by side');
  ok(c().toasts.every((t) => !t.message.includes('before resuming another timer')),
     'No blocking toast is raised — concurrent timers are normal');

  /* Pausing one leaves the other running. */
  await click(`button[aria-label="Pause timer for PatientScure"]`);
  ok(isTimerRunning(get(idA)) && isTimerPaused(get(idB)),
     'Dock Pause affects only its own task; the other keeps running');

  /* ------------------------------------------------------------------ */
  /* Leaving the timer states removes the row                            */
  /* ------------------------------------------------------------------ */
  await run(() => c().actions.finishTask(idA));
  ok(!dockText().includes('Build FocusDesk'), 'Finish: the completed task disappears from the dock');
  await run(() => c().actions.cancelTask(idB));
  ok(dockText() === '', 'Cancel: the last active timer leaves and the dock renders nothing');

  /* ------------------------------------------------------------------ */
  /* Navigation: a row click pushes the owning screen                    */
  /* ------------------------------------------------------------------ */
  let idC!: string;
  await run(async () => { idC = (await c().actions.addTask({ title: 'Write review' })).id; });
  await run(() => c().actions.startTask(idC));
  await click(`button[title="Write review"]`);
  ok(pushed.at(-1) === '/tasks', 'Clicking a normal task row navigates to /tasks');

  await run(() => c().actions.pauseTask(idC));
  let priorityId!: string;
  await run(async () => { priorityId = (await c().actions.setDailyPriority('Ship the release')).id; });
  await run(async () => { await c().actions.startDailyPriorityTimer(priorityId); });
  ok(isTimerRunning(get(dailyPriorityTimerTaskId(priorityId))) && dockText().includes('Ship the release'),
     'A daily priority timer appears in the dock like any other timer task');
  await click(`button[title="Ship the release"]`);
  ok(pushed.at(-1) === '/today', 'Clicking a priority timer row navigates to /today');

  /* ------------------------------------------------------------------ */
  /* Collapse / expand with a remembered preference                      */
  /* ------------------------------------------------------------------ */
  await click('button[aria-label="Collapse active timers"]');
  ok(dockText().includes('2 timers') && !dockText().includes('Ship the release'),
     'Collapsed: only a tiny count pill remains (2 timers)');
  ok(dom.window.localStorage.getItem('pace.timerDock.collapsed') === '1', 'The collapsed preference is stored');
  await click('button[aria-label^="Expand active timers"]');
  ok(dockText().includes('Ship the release') && dom.window.localStorage.getItem('pace.timerDock.collapsed') === '0',
     'Expanded again, and the preference is updated');

  /* ------------------------------------------------------------------ */
  /* Reload: the dock mirrors the recovered persisted state              */
  /* ------------------------------------------------------------------ */
  await mountApp();
  ok(isTimerPaused(get(dailyPriorityTimerTaskId(priorityId))) && isTimerPaused(get(idC)),
     'Reload: closing the app left the running session paused (existing recovery)');
  ok(dockText().includes('Ship the release') && dockText().includes('Write review'),
     'Reload: the dock lists the recovered paused sessions');

  await unmountApp();
  console.log('\nActive Timer Dock verified.');
  process.exit(0);
}
main();
