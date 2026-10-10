/**
 * Headless check of Active Timer → Task navigation & highlight.
 *
 * Clicking an active timer must take the user to THAT task in the Tasks view
 * (by stable id, never by title), make sure the current filters/search don't
 * hide it — clearing only the ones that do — scroll it into view, move focus
 * to it, and flash it briefly in red. It is pure view navigation: no timer may
 * be started, stopped, paused or edited, and the document must never unload
 * (an unload fires pagehide/beforeunload, which pauses every running timer).
 *
 * The real TimerDock and TasksScreen are rendered in jsdom against the real
 * DataProvider. Next's app router is stubbed the way it behaves: `push`
 * changes the client URL without a document load, and `history.replaceState`
 * is synced back into `useSearchParams` (Next patches it to do exactly that).
 *
 * Covered: a target far down a long list; conflicting tab/project/search with
 * a non-conflicting goal filter, custom sort and bulk selection preserved;
 * repeat clicks; every one of several concurrent (running + paused) timers;
 * an earlier day's priority; today's priority (still /today); missing,
 * deleted (e.g. in another tab) and archived targets; a cold deep link that
 * arrives before the data has loaded; and the mobile flow (collapsed dock,
 * reduced motion). Timer state is compared in memory AND in storage.
 *
 * Run: npx tsx scripts/verify-timer-navigation.tsx  (requires jsdom)
 */
import { JSDOM, VirtualConsole } from 'jsdom';

const jsdomErrors: string[] = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (e) => { jsdomErrors.push(String(e?.message ?? e)); });
const dom = new JSDOM('<!doctype html><div id="root"></div>', {
  url: 'http://localhost/today',
  pretendToBeVisual: true, // real requestAnimationFrame
  virtualConsole,
});
const g = globalThis as Record<string, unknown>;
g.window = dom.window; g.document = dom.window.document; g.localStorage = dom.window.localStorage;
g.navigator = dom.window.navigator;
g.HTMLElement = dom.window.HTMLElement;
g.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
g.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
g.IS_REACT_ACT_ENVIRONMENT = true;

/* Unload detection: any of these firing during navigation is a hard failure. */
let unloadEvents = 0;
dom.window.addEventListener('pagehide', () => { unloadEvents += 1; }, true);
dom.window.addEventListener('beforeunload', () => { unloadEvents += 1; }, true);

/* jsdom has no layout: record scrollIntoView calls instead. */
const scrolls: { taskId: string | null; opts: ScrollIntoViewOptions | boolean | undefined }[] = [];
dom.window.HTMLElement.prototype.scrollIntoView = function (this: HTMLElement, opts?: ScrollIntoViewOptions | boolean) {
  scrolls.push({ taskId: this.getAttribute('data-task-id'), opts });
};

async function main() {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { act } = React;
  const { AppRouterContext } = await import('next/dist/shared/lib/app-router-context.shared-runtime');
  const { SearchParamsContext, PathnameContext } = await import('next/dist/shared/lib/hooks-client-context.shared-runtime');
  const { AuthProvider } = await import('../components/auth/auth-provider');
  const { DataProvider, useData } = await import('../components/data/data-provider');
  const { UIProvider } = await import('../components/ui/ui-provider');
  const { TimerDock } = await import('../components/layout/timer-dock');
  const { TasksScreen } = await import('../components/tasks/tasks-screen');
  const { addDays, todayISO } = await import('../lib/dates');
  const { dailyPriorityTimerTaskId } = await import('../lib/selectors');
  const { isTimerPaused, isTimerRunning } = await import('../lib/timer');
  const { taskFocusHref, TASK_FLASH_MS } = await import('../lib/task-focus');
  const { STORAGE_KEY } = await import('../lib/store/local-repository');
  type Task = import('../lib/types').Task;

  const ok = (cond: boolean, msg: string) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } console.log('✓', msg); };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  let ctx: ReturnType<typeof useData> | null = null;
  const Probe = () => { ctx = useData(); return null; };
  const c = () => ctx!;
  const get = (id: string) => c().data.tasks.find((t) => t.id === id)!;

  /* ---- Router stub with Next's client-navigation semantics ---- */
  const pushed: string[] = [];
  let setHref: ((href: string) => void) | null = null;
  const currentHref = () => `${dom.window.location.pathname}${dom.window.location.search}`;
  const clientNavigate = (href: string) => {
    dom.window.history.pushState(null, '', href); // no document load
    setHref?.(currentHref());
  };
  const router = {
    push: (href: string) => { pushed.push(href); clientNavigate(href); },
    replace: (href: string) => { dom.window.history.replaceState(null, '', href); },
    prefetch: () => Promise.resolve(), back: () => {}, forward: () => {}, refresh: () => {},
  } as unknown as import('next/dist/shared/lib/app-router-context.shared-runtime').AppRouterInstance;
  // Next patches replaceState so useSearchParams follows it; mirror that.
  const nativeReplaceState = dom.window.history.replaceState.bind(dom.window.history);
  let replaceStateCalls = 0;
  dom.window.history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
    replaceStateCalls += 1;
    nativeReplaceState(data, unused, url);
    setHref?.(currentHref());
  };

  const Harness = () => {
    const [href, set] = React.useState(currentHref);
    setHref = set;
    const url = new URL(href, 'http://localhost');
    const search = url.search;
    const params = React.useMemo(() => new URLSearchParams(search), [search]);
    return React.createElement(AppRouterContext.Provider, { value: router },
      React.createElement(PathnameContext.Provider, { value: url.pathname },
        React.createElement(SearchParamsContext.Provider, { value: params },
          React.createElement('div', { id: 'dock-slot' }, React.createElement(TimerDock)),
          React.createElement('main', { id: 'page' },
            url.pathname === '/tasks'
              ? React.createElement(TasksScreen)
              : React.createElement('p', { id: 'other-page' }, `Page ${url.pathname}`)),
          React.createElement(Probe))));
  };

  let root: ReturnType<typeof createRoot> | null = null;
  const mountApp = async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const r = createRoot(el);
    root = r;
    await act(async () => {
      r.render(
        React.createElement(AuthProvider, null,
          React.createElement(UIProvider, null,
            React.createElement(DataProvider, null, React.createElement(Harness)))));
    });
    await act(async () => { await sleep(40); });
  };
  /** Closing the app (a real unload): pagehide fires on purpose here. */
  const unmountApp = async () => {
    if (!root) return;
    const r = root; root = null;
    await act(async () => { dom.window.dispatchEvent(new dom.window.Event('pagehide')); });
    await act(async () => { r.unmount(); });
    document.body.innerHTML = '';
    ctx = null; setHref = null;
  };

  const run = (fn: () => Promise<unknown>) => act(async () => { await fn(); });
  const settle = (ms = 80) => act(async () => { await sleep(ms); }); // a few animation frames
  const fire = async (el: Element | null, what: string) => {
    if (!el) throw new Error(`no element: ${what}`);
    await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); });
    await settle();
  };
  const clickDockRow = (title: string) => fire(document.querySelector(`#dock-slot button[title="${title}"]`), `dock row ${title}`);
  const page = () => document.querySelector('#page')!;
  const buttonByText = (text: string) =>
    Array.from(page().querySelectorAll('button')).find((b) => b.textContent?.trim() === text) ?? null;
  const setControl = async (el: HTMLInputElement | HTMLSelectElement | null, value: string, what: string) => {
    if (!el) throw new Error(`no control: ${what}`);
    const proto = el instanceof dom.window.HTMLSelectElement ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
      el.dispatchEvent(new dom.window.Event(el instanceof dom.window.HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    });
    await settle(20);
  };
  const searchInput = () => page().querySelector<HTMLInputElement>('input[placeholder="Search tasks…"]');
  const sortSelect = () => page().querySelector<HTMLSelectElement>('select[aria-label="Sort tasks"]');
  const scopeSelects = () => Array.from(page().querySelectorAll<HTMLSelectElement>('select')).filter((s) => s.getAttribute('aria-label') !== 'Sort tasks');
  const activeTab = () => Array.from(page().querySelectorAll('button[aria-pressed="true"]')).map((b) => b.textContent?.trim()).find((t) => t !== 'Done');
  const rowEl = (id: string) => Array.from(page().querySelectorAll<HTMLElement>('[data-task-id]')).find((el) => el.getAttribute('data-task-id') === id) ?? null;
  const flashRows = () => Array.from(page().querySelectorAll('[data-task-flash]')).map((f) => f.closest('[data-task-id]')?.getAttribute('data-task-id'));
  const toastTexts = () => c().toasts.map((t) => t.message);
  const status = () => page().querySelector('[role="status"]')?.textContent ?? '';

  /**
   * Timer identity that is invariant under the provider's periodic checkpoint
   * (which moves startedAt forward by exactly the seconds it folds into
   * actualDurationSeconds): status, pause marker, and the running segment's
   * effective origin. Any start/stop/pause/resume/edit changes it.
   */
  const timerSig = (t: Task) => JSON.stringify([
    t.id, t.status, t.pausedAt ?? null,
    t.startedAt ? Date.parse(t.startedAt) - (t.actualDurationSeconds ?? 0) * 1000 : `paused:${t.actualDurationSeconds ?? 0}`,
  ]);
  const memorySigs = () => c().data.tasks.filter((t) => t.status === 'in_progress').map(timerSig).sort().join('|');
  const storedSigs = () => {
    const db = JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY) ?? '{}') as { tasks?: Task[] };
    return (db.tasks ?? []).filter((t) => t.status === 'in_progress').map(timerSig).sort().join('|');
  };

  /* ================================================================== */
  /* Fixture: a long list, projects/goals, several concurrent timers    */
  /* ================================================================== */
  await mountApp();
  const today = todayISO();
  let g1!: string, g2!: string, p1!: string, p2!: string;
  await run(async () => { g1 = (await c().actions.addGoal({ name: 'Health' })).id; });
  await run(async () => { g2 = (await c().actions.addGoal({ name: 'Career' })).id; });
  await run(async () => { p1 = (await c().actions.addProject({ name: 'Home', goalId: g1 })).id; });
  await run(async () => { p2 = (await c().actions.addProject({ name: 'Work', goalId: g2 })).id; });
  for (let i = 0; i < 56; i++) {
    await run(() => c().actions.addTask({
      title: `Filler ${String(i).padStart(2, '0')}`,
      scheduledDate: addDays(today, i % 12),
      projectId: i % 3 === 0 ? p1 : undefined,
    }));
  }
  const ids: Record<string, string> = {};
  const add = async (key: string, input: Parameters<ReturnType<typeof useData>['actions']['addTask']>[0]) => {
    await run(async () => { ids[key] = (await c().actions.addTask(input)).id; });
  };
  await add('target', { title: 'Quarterly report', projectId: p2, scheduledDate: addDays(today, 40) });
  await add('x', { title: 'Selected task', projectId: p2, scheduledDate: today });
  await add('a', { title: 'Write chapter', scheduledDate: addDays(today, 20) });
  await add('b', { title: 'Code review', scheduledDate: addDays(today, 25) });
  await add('cPaused', { title: 'Read book', scheduledDate: addDays(today, 30) });
  let oldPriorityId!: string, todayPriorityId!: string;
  await run(async () => { oldPriorityId = (await c().actions.setDailyPriority('Old priority', addDays(today, -3))).id; });
  await run(async () => { todayPriorityId = (await c().actions.setDailyPriority('Today priority')).id; });
  ids.old = dailyPriorityTimerTaskId(oldPriorityId);
  ids.todayPri = dailyPriorityTimerTaskId(todayPriorityId);

  await run(() => c().actions.startTask(ids.target));
  await run(() => c().actions.startTask(ids.a));
  await run(() => c().actions.startTask(ids.b));
  await run(() => c().actions.startTask(ids.cPaused));
  await run(() => c().actions.pauseTask(ids.cPaused));
  await run(async () => { await c().actions.startDailyPriorityTimer(oldPriorityId); });
  await run(async () => { await c().actions.startDailyPriorityTimer(todayPriorityId); });
  await settle();
  const running = () => c().data.tasks.filter((t) => !t.archived && isTimerRunning(t)).length;
  const paused = () => c().data.tasks.filter((t) => !t.archived && isTimerPaused(t)).length;
  ok(running() === 5 && paused() === 1, 'Fixture: 5 timers running concurrently and 1 paused');

  const baselineMemory = memorySigs();
  const baselineStored = storedSigs();
  ok(baselineMemory === baselineStored && baselineMemory.split('|').length === 6, 'Fixture: in-memory and stored timer state agree');
  const assertTimersUntouched = (when: string) => {
    ok(memorySigs() === baselineMemory, `${when}: every timer is exactly as it was (in memory)`);
    ok(storedSigs() === baselineStored, `${when}: every timer is exactly as it was (in storage)`);
    ok(running() === 5 && paused() === 1, `${when}: still 5 running + 1 paused`);
    ok(unloadEvents === 0, `${when}: no pagehide/beforeunload fired (client-side navigation only)`);
  };

  /* ================================================================== */
  /* 1. From another page to a task far down the list                   */
  /* ================================================================== */
  ok(dom.window.location.pathname === '/today' && document.querySelector('#other-page') !== null, 'Start on another page (/today)');
  scrolls.length = 0;
  await clickDockRow('Quarterly report');
  ok(pushed.at(-1) === taskFocusHref(ids.target), 'Dock click pushes /tasks?focus=<stable task id> (client-side)');
  ok(dom.window.location.pathname === '/tasks', 'The Tasks view is shown');
  const order = Array.from(page().querySelectorAll('[data-task-id]')).map((el) => el.getAttribute('data-task-id'));
  ok(order.indexOf(ids.target) >= 55, `The target is far down the list (row ${order.indexOf(ids.target) + 1} of ${order.length})`);
  ok(scrolls.length === 1 && scrolls[0].taskId === ids.target, 'Exactly the target row is scrolled into view');
  const opts = scrolls[0].opts as ScrollIntoViewOptions;
  ok(opts?.block === 'center' && opts?.behavior === 'smooth', 'Scrolled with centred alignment, smoothly (no reduced-motion preference)');
  ok(document.activeElement === rowEl(ids.target), 'Focus moves to the target row (keyboard / screen reader)');
  ok(flashRows().length === 1 && flashRows()[0] === ids.target, 'The red flash is on the target row only');
  ok(page().querySelector('[data-task-flash]')!.className.includes('task-flash'), 'The flash uses the task-flash style');
  ok(dom.window.location.search === '', 'The one-shot ?focus parameter is stripped (replaceState, no reload)');
  ok(status().includes('Showing task “Quarterly report”'), 'The outcome is announced politely to screen readers');
  ok(toastTexts().length === 0, 'No filters needed clearing, so no message');
  assertTimersUntouched('After navigating to the far task');

  await settle(TASK_FLASH_MS + 150);
  ok(flashRows().length === 0, `The flash removes itself after ~${TASK_FLASH_MS}ms`);

  /* ================================================================== */
  /* 2. Already on Tasks, with filters that hide the target             */
  /* ================================================================== */
  await fire(buttonByText('Select'), 'Select');
  await fire(page().querySelector('[aria-label="Select \\"Selected task\\" for bulk actions"]'), 'select X');
  ok(page().textContent!.includes('1 task selected'), 'Bulk select mode on, one task selected');
  await setControl(sortSelect(), 'priority-asc', 'sort');
  await fire(buttonByText('Today'), 'Today tab');
  await setControl(scopeSelects()[0], p1, 'project');
  await setControl(scopeSelects()[1], g2, 'goal'); // the target's goal — not a conflict
  await setControl(searchInput(), 'filler', 'search');
  ok(rowEl(ids.target) === null, 'Tab "Today" + project "Home" + search "filler" hide the target');

  scrolls.length = 0;
  await clickDockRow('Quarterly report');
  ok(activeTab() === 'All', 'The conflicting "Today" tab was reset to All');
  ok(scopeSelects()[0].value === '', 'The conflicting project filter was cleared');
  ok(searchInput()!.value === '', 'The conflicting search was cleared');
  ok(scopeSelects()[1].value === g2, 'The non-conflicting goal filter was kept');
  ok(sortSelect()!.value === 'priority-asc', 'The sort order was kept');
  ok(buttonByText('Done') !== null && page().textContent!.includes('1 task selected'), 'Select mode and the selection were kept');
  ok(toastTexts().includes('Cleared the “Today” filter, the project filter and the search to show this task'),
     'A brief message names exactly what was cleared');
  ok(scrolls.length === 1 && scrolls[0].taskId === ids.target && flashRows()[0] === ids.target, 'The target is then scrolled to and flashed');
  assertTimersUntouched('After clearing conflicting filters');

  /* Normal filtering still works afterwards. */
  await setControl(searchInput(), 'quarterly', 'search');
  ok(rowEl(ids.target) !== null && rowEl(ids.a) === null, 'Ordinary search keeps working after the navigation');
  await setControl(searchInput(), '', 'search');

  /* 3. Clicking the same timer again replays it. */
  const firstFlash = page().querySelector('[data-task-flash]');
  scrolls.length = 0;
  await clickDockRow('Quarterly report');
  const secondFlash = page().querySelector('[data-task-flash]');
  ok(scrolls.length === 1 && scrolls[0].taskId === ids.target, 'A repeat click scrolls to the task again');
  ok(secondFlash !== null && secondFlash !== firstFlash, 'A repeat click restarts the flash (fresh element)');

  /* ================================================================== */
  /* 4. Every concurrent timer, running and paused                       */
  /* ================================================================== */
  for (const [key, title] of [['a', 'Write chapter'], ['b', 'Code review'], ['cPaused', 'Read book'], ['old', 'Old priority']] as const) {
    scrolls.length = 0;
    await clickDockRow(title);
    ok(pushed.at(-1) === taskFocusHref(ids[key]), `${title}: navigates by id to /tasks?focus=…`);
    ok(scrolls.length === 1 && scrolls[0].taskId === ids[key] && flashRows()[0] === ids[key], `${title}: its own row is scrolled to and flashed`);
    assertTimersUntouched(`${title}`);
  }
  ok(toastTexts().some((m) => m === 'Cleared the goal filter to show this task'),
     'Tasks outside the active goal filter clear only that filter');

  /* ================================================================== */
  /* 5. Today's priority still goes to Today                             */
  /* ================================================================== */
  scrolls.length = 0;
  await clickDockRow('Today priority');
  ok(pushed.at(-1) === '/today' && dom.window.location.pathname === '/today', "Today's priority timer navigates to /today");
  ok(scrolls.length === 0, 'Nothing is scrolled on the Today route');
  assertTimersUntouched("After today's priority click");

  /* ================================================================== */
  /* 6. Missing / deleted / archived targets                            */
  /* ================================================================== */
  await run(async () => { router.push('/tasks'); });
  await settle();
  await setControl(searchInput(), 'abc', 'search');
  const toastsBefore = toastTexts().length;
  scrolls.length = 0;
  await run(async () => { router.push(taskFocusHref('no-such-task')); });
  await settle();
  ok(toastTexts().slice(toastsBefore).includes('That task is no longer in your task list'), 'Unknown id: a calm "no longer in your list" message');
  ok(scrolls.length === 0 && flashRows().length === 0, 'Unknown id: nothing scrolled or flashed');
  ok(searchInput()!.value === 'abc', 'Unknown id: filters left untouched');
  ok(dom.window.location.search === '', 'Unknown id: the parameter is still stripped');

  let deletedId!: string, archivedId!: string;
  await run(async () => { deletedId = (await c().actions.addTask({ title: 'Doomed' })).id; });
  await run(async () => { archivedId = (await c().actions.addTask({ title: 'Shelved' })).id; });
  await run(() => c().actions.deleteTask(deletedId)); // e.g. deleted in another tab
  await run(() => c().actions.updateTask(archivedId, { archived: true }));
  for (const [label, id] of [['Deleted', deletedId], ['Archived', archivedId]] as const) {
    const before = toastTexts().length;
    scrolls.length = 0;
    await run(async () => { router.push(taskFocusHref(id)); });
    await settle();
    ok(toastTexts().slice(before).includes('That task is no longer in your task list') && scrolls.length === 0,
       `${label} task: graceful message, no scroll, no error`);
  }
  assertTimersUntouched('After missing-target cases');
  ok(!jsdomErrors.some((e) => /navigation/i.test(e)), 'No document navigation was ever attempted');
  ok(replaceStateCalls > 0, 'The URL was edited in place with history.replaceState');

  /* ================================================================== */
  /* 7. Cold deep link: the URL arrives before the data has loaded       */
  /* ================================================================== */
  await unmountApp(); // a real close: pagehide pauses sessions (existing recovery)
  dom.window.history.pushState(null, '', taskFocusHref(ids.target));
  scrolls.length = 0;
  await mountApp();
  await settle();
  ok(scrolls.some((s) => s.taskId === ids.target) && flashRows()[0] === ids.target,
     'Deep link on a fresh load: waits for the data, then scrolls to and flashes the task');
  ok(!toastTexts().includes('That task is no longer in your task list'), 'Deep link on a fresh load is never misreported as missing while loading');

  /* ================================================================== */
  /* 8. Mobile: collapsed dock by default, reduced motion               */
  /* ================================================================== */
  await unmountApp();
  dom.window.localStorage.removeItem('pace.timerDock.collapsed');
  (dom.window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = (q: string) => ({
    matches: q.includes('max-width: 640px') || q.includes('prefers-reduced-motion: reduce'),
    media: q, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
  dom.window.history.pushState(null, '', '/today');
  await mountApp();
  const mobileMemory = memorySigs();
  const pill = document.querySelector('#dock-slot button[aria-label^="Expand active timers"]');
  ok(pill !== null && document.querySelector('#dock-slot button[title="Write chapter"]') === null, 'Mobile: the dock starts collapsed to a pill');
  await fire(pill, 'expand pill');
  unloadEvents = 0;
  scrolls.length = 0;
  await clickDockRow('Write chapter');
  ok(dom.window.location.pathname === '/tasks' && scrolls.length === 1 && scrolls[0].taskId === ids.a, 'Mobile: the expanded dock row navigates and scrolls to the task');
  ok((scrolls[0].opts as ScrollIntoViewOptions).behavior === 'auto', 'Reduced motion: the scroll jumps instead of animating');
  ok(flashRows()[0] === ids.a, 'Reduced motion: the (static) highlight is still shown');
  const flashEl = page().querySelector('[data-task-flash]')!;
  ok(/\babsolute\b/.test(flashEl.className) && /\binset-0\b/.test(flashEl.className) && /pointer-events-none/.test(flashEl.className),
     'The highlight is an overlay: no layout shift, never intercepts taps');
  ok(memorySigs() === mobileMemory && unloadEvents === 0, 'Mobile: timers untouched, no unload');

  /* ================================================================== */
  /* 9. The preview fixture loads and behaves as the manual steps say   */
  /* ================================================================== */
  const fs = await import('node:fs');
  const path = await import('node:path');
  const fixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'fixtures/focusdesk-timer-navigation-preview.json'), 'utf8'));
  await run(() => c().actions.importData(fixture));
  await settle();
  ok(paused() === 6 && running() === 0, 'Preview fixture: imports with 6 paused timers (resume them from the dock)');
  await fire(document.querySelector('#dock-slot button[aria-label="Resume timer for Write chapter"]'), 'resume');
  await fire(document.querySelector('#dock-slot button[aria-label="Resume timer for Code review"]'), 'resume');
  ok(running() === 2 && paused() === 4, 'Preview fixture: two timers resumed from the dock run side by side');
  const fixtureSigs = memorySigs();
  await run(async () => { router.push('/today'); });
  await settle();
  scrolls.length = 0;
  await clickDockRow('Quarterly report — far down the list');
  const fixtureOrder = Array.from(page().querySelectorAll('[data-task-id]')).map((el) => el.getAttribute('data-task-id'));
  const fixtureIndex = fixtureOrder.indexOf('nav-quarterly-report');
  ok(fixtureIndex >= fixtureOrder.length - 3 && scrolls[0]?.taskId === 'nav-quarterly-report',
     `Preview fixture: the far target (row ${fixtureIndex + 1} of ${fixtureOrder.length}) is scrolled to`);
  ok(memorySigs() === fixtureSigs && unloadEvents === 0, 'Preview fixture: navigation left its timers untouched');

  root = null; // leave without a second pagehide
  console.log('\nActive timer navigation & highlight verified.');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
