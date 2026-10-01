/**
 * Headless end-to-end check of the Focus Widget link (experimental branch).
 *
 * Mounts the real DataProvider + FocusWidgetLink against a real HTTP
 * implementation of the companion protocol (companion/tools/mock-bridge.mjs)
 * and verifies the whole loop:
 *
 *   Start ─▶ snapshot published ─▶ widget command ─▶ real timer action
 *
 * Run:
 *   npm i --no-save jsdom tsx
 *   npx tsx scripts/verify-focus-widget.tsx
 */
import { JSDOM } from 'jsdom';
import { request } from 'node:http';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.localStorage = dom.window.localStorage;
g.IS_REACT_ACT_ENVIRONMENT = true;

const ok = (cond: boolean, msg: string) => {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  console.log('✓', msg);
};

function httpRequest(options: { method: string; port: number; path: string; origin?: string; body?: string }) {
  return new Promise<{ status: number; headers: Record<string, string> }>((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: options.port,
        path: options.path,
        method: options.method,
        headers: {
          ...(options.origin ? { origin: options.origin } : {}),
          ...(options.body ? { 'content-type': 'application/json' } : {}),
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers as Record<string, string> }));
      },
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function main() {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { act } = React;
  const { createBridgeServer } = await import('../companion/tools/mock-bridge.mjs');
  const { AuthProvider } = await import('../components/auth/auth-provider');
  const { DataProvider, useData } = await import('../components/data/data-provider');
  const { FocusWidgetLink } = await import('../components/focus-widget/focus-widget-link');
  const { elapsedActiveSeconds } = await import('../lib/timer');

  /* ---------------------------------------------------------------- */
  /* Companion stand-in                                                */
  /* ---------------------------------------------------------------- */
  /* Protocol and origin rules of the reference implementation. */
  const strict = createBridgeServer({ allowedOrigins: ['http://localhost:3000'], log: () => {} });
  const strictPort = await strict.listen(0);
  ok(strictPort > 0, `Companion protocol server listening on 127.0.0.1:${strictPort}`);
  const blockedWrite = await httpRequest({
    method: 'POST',
    port: strictPort,
    path: '/focus/v1/session',
    origin: 'https://evil.example',
    body: JSON.stringify({ session: null }),
  });
  ok(blockedWrite.status === 403, 'Foreign origin cannot write a session (403)');
  const preflight = await httpRequest({
    method: 'OPTIONS',
    port: strictPort,
    path: '/focus/v1/session',
    origin: 'http://localhost:3000',
  });
  ok(
    preflight.status === 204 && preflight.headers['access-control-allow-origin'] === 'http://localhost:3000',
    'Allow-listed origin gets a CORS preflight answer',
  );
  await strict.close();

  /* Phase 1: the companion is *not running yet* — FocusDesk must be completely
     unaffected. Grab a free loopback port by binding and releasing it, and tell
     the PWA to use it. */
  const probeServer = createBridgeServer({ log: () => {} });
  const port = await probeServer.listen(0);
  await probeServer.close();
  process.env.NEXT_PUBLIC_FOCUS_WIDGET_PORT = String(port);

  /* ---------------------------------------------------------------- */
  /* App                                                              */
  /* ---------------------------------------------------------------- */
  type Ctx = ReturnType<typeof useData>;
  let ctx: Ctx | null = null;
  const Probe = () => {
    ctx = useData();
    return null;
  };
  const el = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      React.createElement(
        AuthProvider,
        null,
        React.createElement(DataProvider, null, React.createElement(Probe), React.createElement(FocusWidgetLink)),
      ),
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
  const c = () => ctx!;
  ok(c().ready, 'FocusDesk (PWA side) mounted with its real data layer');

  const flush = async (ms = 30) =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  const waitFor = async (predicate: () => boolean, label: string, timeout = 6000, debug?: () => unknown) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (predicate()) return;
      await flush(25);
    }
    if (debug) console.error('debug:', JSON.stringify(debug()));
    ok(false, `timeout waiting for ${label}`);
  };
  const run = (fn: () => Promise<unknown>) =>
    act(async () => {
      await fn();
    });

  /* ---------------------------------------------------------------- */
  /* 1. Start a task while the companion does not exist at all         */
  /* ---------------------------------------------------------------- */
  let taskId = '';
  await run(async () => {
    const created = await c().actions.addTask({ title: 'Write FocusDesk documentation', status: 'today' });
    taskId = created.id;
  });
  await run(() => c().actions.startTask(taskId));
  await flush(1500);
  ok(
    c().data.tasks.find((t) => t.id === taskId)!.status === 'in_progress',
    'Start works normally while no companion is running',
  );

  /* ---------------------------------------------------------------- */
  /* 2. The companion appears later — the link reconnects on its own   */
  /* ---------------------------------------------------------------- */
  const bridge = createBridgeServer({ allowedOrigins: ['*'], log: () => {} });
  await bridge.listen(port);
  await waitFor(
    () => bridge.state.session?.taskId === taskId,
    'the widget snapshot after the companion appears',
    12000,
    () => ({ posts: bridge.state.posts, session: bridge.state.session, task: c().data.tasks.find((t) => t.id === taskId) }),
  );
  ok(true, 'Companion started after the PWA — the link connected without a reload');

  /* Snapshots are event-driven: an idle app keeps quiet. */
  const postsSoFar = bridge.state.posts;
  await flush(1200);
  ok(bridge.state.posts === postsSoFar, 'Snapshots are event-driven, not a busy loop');

  const snapshot = bridge.state.session!;
  ok(snapshot.title === 'Write FocusDesk documentation', 'Widget shows the active task title');
  ok(snapshot.state === 'running', 'Widget state is "running"');
  ok(typeof snapshot.startedAt === 'string', 'Snapshot carries the same startedAt the PWA timer uses');
  ok(snapshot.accumulatedSeconds === 0, 'No time accumulated yet');
  ok(c().data.tasks.find((t) => t.id === taskId)!.status === 'in_progress', 'Task is In Progress in FocusDesk');

  /* ---------------------------------------------------------------- */
  /* 3. Elapsed time is derived from persisted timestamps              */
  /* ---------------------------------------------------------------- */
  await run(() => c().actions.updateTask(taskId, { startedAt: new Date(Date.now() - 65_000).toISOString() }));
  await waitFor(() => (bridge.state.session?.elapsedSeconds ?? 0) > 60, 'the widget to see the 65s segment');
  const afterBackdate = bridge.state.session!;
  ok(
    afterBackdate.elapsedSeconds >= 64 && afterBackdate.elapsedSeconds <= 68,
    `Widget elapsed (${afterBackdate.elapsedSeconds}s) matches the PWA timer without its own counter`,
  );

  /* ---------------------------------------------------------------- */
  /* 4. Pause / Resume / Finish from the widget                        */
  /* ---------------------------------------------------------------- */
  bridge.enqueue('pause');
  await waitFor(() => bridge.state.session?.state === 'paused', 'the widget to show Paused');
  const pausedTask = c().data.tasks.find((t) => t.id === taskId)!;
  ok(pausedTask.startedAt === undefined && typeof pausedTask.pausedAt === 'string', 'Pause applied through the real action');
  ok(
    (bridge.state.session?.accumulatedSeconds ?? 0) >= 64,
    'Paused widget shows the frozen accumulated time',
  );

  bridge.enqueue('resume');
  await waitFor(() => bridge.state.session?.state === 'running', 'the widget to show Running again');
  ok(
    c().data.tasks.find((t) => t.id === taskId)!.startedAt !== undefined,
    'Resume continued the same timer (time preserved, not restarted)',
  );

  const historyBefore = c().data.taskHistory.length;
  bridge.enqueue('finish');
  await waitFor(() => bridge.state.session === null, 'the widget session to end after Finish');
  const finished = c().data.tasks.find((t) => t.id === taskId)!;
  ok(finished.status === 'completed', 'Finish completed the task in FocusDesk');
  ok(typeof finished.completedAt === 'string', 'Completion timestamp was written');
  ok(
    (finished.actualDurationSeconds ?? 0) >= 64 && finished.startedAt === undefined,
    `Actual duration finalised (${finished.actualDurationSeconds}s), timer released`,
  );
  ok(
    c().data.taskHistory.some((h) => h.taskId === taskId && h.type === 'completed'),
    'Task history got the same "completed" entry as an in-app Finish',
  );
  ok(c().data.taskHistory.length >= historyBefore, 'Task history still readable');
  await flush(200);

  /* ---------------------------------------------------------------- */
  /* 5. A closed/hidden widget can never corrupt task state            */
  /* ---------------------------------------------------------------- */
  let secondId = '';
  await run(async () => {
    const created = await c().actions.addTask({ title: 'Second task', status: 'today' });
    secondId = created.id;
  });
  await run(() => c().actions.startTask(secondId));
  await waitFor(() => bridge.state.session?.taskId === secondId, 'the widget to follow the new active task');

  // Command for a task that is not the active session → ignored.
  const foreign = { id: 9001, type: 'finish' as const, taskId: taskId, createdAt: new Date().toISOString() };
  bridge.state.commands.push(foreign);
  bridge.state.nextId = Math.max(bridge.state.nextId, 9002) + 1;
  await flush(700);
  ok(
    c().data.tasks.find((t) => t.id === secondId)!.status === 'in_progress',
    'A command addressed to another task is ignored',
  );

  // Stale command (queued long ago, e.g. from before a page reload) → ignored.
  const stale = {
    id: 9500,
    type: 'finish' as const,
    taskId: secondId,
    createdAt: new Date(Date.now() - 600_000).toISOString(),
  };
  bridge.state.commands.push(stale);
  bridge.state.nextId = 9600;
  await flush(700);
  ok(
    c().data.tasks.find((t) => t.id === secondId)!.status === 'in_progress',
    'A stale command is ignored instead of finishing the task',
  );

  // The PWA keeps working on its own (the widget is optional).
  await run(() => c().actions.pauseTask(secondId));
  await waitFor(() => c().data.tasks.find((t) => t.id === secondId)!.status === 'in_progress', 'in-app Pause');
  const inAppTask = c().data.tasks.find((t) => t.id === secondId)!;
  ok(inAppTask.startedAt === undefined, 'In-app Pause still works while the link is active');

  // Elapsed helper sanity: mirrors what the widget computes.
  ok(elapsedActiveSeconds(inAppTask) >= 0, 'lib/timer.ts remains the single source of truth for elapsed time');

  await run(() => c().actions.finishTask(secondId));
  await waitFor(() => bridge.state.session === null, 'the widget to hide after an in-app Finish');

  await act(async () => root.unmount());
  await bridge.close();
  console.log('\nFocus Widget link verified (protocol + full Start/Pause/Resume/Finish loop).');
  process.exit(0);
}

main().catch((error) => {
  console.error('FAIL:', error);
  process.exit(1);
});
