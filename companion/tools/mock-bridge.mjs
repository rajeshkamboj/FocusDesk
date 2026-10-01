#!/usr/bin/env node
/**
 * Focus Widget bridge — reference implementation / simulator (dev tool).
 *
 * This is *not* the widget. It is a tiny Node.js stand-in for the loopback
 * bridge that the real companion ships (`companion/src-tauri/src/bridge.rs`),
 * so the FocusDesk side of the feature can be developed, tested and debugged on
 * any machine — with no Rust toolchain and no Windows.
 *
 * It speaks exactly the same protocol (see lib/focus-widget/protocol.ts):
 *
 *   GET  /focus/v1/health
 *   GET  /focus/v1/session               (debug)
 *   POST /focus/v1/session               {"session": {…}|null, "attached": bool}
 *   GET  /focus/v1/commands?since=N&wait=20
 *
 * Usage:
 *   node companion/tools/mock-bridge.mjs                 # watch + log the session
 *   node companion/tools/mock-bridge.mjs --port 8787
 *   node companion/tools/mock-bridge.mjs --origins http://localhost:3000,https://app.example.com
 *
 * While it runs, type one of these and press Enter to send a command to the PWA:
 *   pause | resume | finish | show | quit
 */

import http from 'node:http';
import { URL, pathToFileURL } from 'node:url';
import process from 'node:process';

export const PROTOCOL_VERSION = 1;
export const DEFAULT_PORT = 8787;
export const DEFAULT_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

const MAX_WAIT_SECONDS = 25;

/**
 * The Access-Control-Allow-Origin value for a request, or null when the caller
 * must be refused.
 *
 *  - browser request from an allow-listed origin  → echo that origin
 *  - browser request from anywhere else           → null (403, and the browser
 *    withholds the response anyway)
 *  - no Origin header at all (curl, a test, …)    → '*' — the bridge only ever
 *    listens on loopback, so this is a local, non-browser client
 */
function resolveAllowOrigin(origin, allowed) {
  if (!origin) return '*';
  if (allowed.includes('*') || allowed.includes(origin)) return origin;
  return null;
}

/** Start a bridge stand-in. Returns handles used by tools and tests. */
export function createBridgeServer(options = {}) {
  const allowedOrigins = options.allowedOrigins ?? DEFAULT_ORIGINS;
  const log = options.log ?? (() => {});
  const state = {
    session: null,
    attached: false,
    lastSeenAt: null,
    commands: [],
    nextId: 1,
    pollers: new Set(),
    /** How many snapshots the PWA has posted (used by tests to prove it is quiet when idle). */
    posts: 0,
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const origin = req.headers.origin;
    const allowOrigin = resolveAllowOrigin(origin, allowedOrigins);

    const cors = (extra = {}) => {
      const headers = { vary: 'Origin', ...extra };
      if (allowOrigin) {
        headers['access-control-allow-origin'] = allowOrigin;
        headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
        headers['access-control-allow-headers'] = 'content-type';
        headers['access-control-allow-private-network'] = 'true';
        headers['access-control-max-age'] = '600';
      }
      return headers;
    };

    if (req.method === 'OPTIONS') {
      res.writeHead(allowOrigin ? 204 : 403, cors());
      res.end();
      return;
    }

    if (url.pathname === '/focus/v1/health') {
      res.writeHead(200, cors({ 'content-type': 'application/json' }));
      res.end(JSON.stringify({ ok: true, app: 'focusdesk-focus-widget', protocol: PROTOCOL_VERSION, version: 'mock' }));
      return;
    }

    if (url.pathname === '/focus/v1/session' && req.method === 'GET') {
      if (!allowOrigin) {
        res.writeHead(403, cors());
        res.end();
        return;
      }
      res.writeHead(200, cors({ 'content-type': 'application/json' }));
      res.end(JSON.stringify({ session: state.session, attached: state.attached, lastSeenAt: state.lastSeenAt }));
      return;
    }

    if (url.pathname === '/focus/v1/session' && req.method === 'POST') {
      // Writes are JSON, which means a preflight — the browser only sends the
      // real request if this origin is allow-listed.
      if (!allowOrigin) {
        res.writeHead(403, cors());
        res.end();
        return;
      }
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          res.writeHead(400, cors({ 'content-type': 'application/json' }));
          res.end(JSON.stringify({ ok: false, error: 'invalid json' }));
          return;
        }
        state.posts += 1;
        const previous = state.session;
        if (parsed.session === null || parsed.session === undefined) {
          state.session = null;
          state.commands = [];
        } else {
          state.session = parsed.session;
          state.lastSeenAt = new Date().toISOString();
          state.attached = parsed.attached !== false;
        }
        const changed = JSON.stringify(previous) !== JSON.stringify(state.session);
        if (changed || parsed.reason === 'session-ended') {
          log(
            state.session
              ? `[bridge] ${state.session.state} · "${state.session.title}" · ${state.session.elapsedSeconds}s`
              : '[bridge] no active task — widget would hide',
          );
        }
        res.writeHead(200, cors({ 'content-type': 'application/json' }));
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    if (url.pathname === '/focus/v1/commands' && req.method === 'GET') {
      if (!allowOrigin) {
        res.writeHead(403, cors());
        res.end();
        return;
      }
      const since = Number.parseInt(url.searchParams.get('since') ?? '0', 10) || 0;
      const waitSeconds = Math.min(Number.parseFloat(url.searchParams.get('wait') ?? '0') || 0, MAX_WAIT_SECONDS);
      let settled = false;

      const respond = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        state.pollers.delete(wake);
        const pending = state.commands.filter((command) => command.id > since);
        res.writeHead(200, cors({ 'content-type': 'application/json' }));
        res.end(JSON.stringify({ commands: pending, nextSince: state.nextId - 1 }));
      };
      const wake = () => respond();
      const timer = setTimeout(respond, waitSeconds * 1000);

      const ready = state.commands.some((command) => command.id > since);
      if (ready || waitSeconds <= 0) {
        respond();
        return;
      }
      state.pollers.add(wake);
      req.on('close', () => {
        settled = true;
        clearTimeout(timer);
        state.pollers.delete(wake);
      });
      return;
    }

    res.writeHead(404, cors({ 'content-type': 'application/json' }));
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
  });

  /** Queue a command for the PWA (what the widget's buttons do over Tauri IPC). */
  function enqueue(type, taskId) {
    const target = taskId ?? state.session?.taskId;
    if (!target) return null;
    const command = { id: state.nextId++, type, taskId: target, createdAt: new Date().toISOString() };
    state.commands.push(command);
    for (const wake of [...state.pollers]) {
      try {
        wake();
      } catch {
        /* a poller that already answered is harmless */
      }
    }
    log(`[bridge] -> ${type} ${target}`);
    return command;
  }

  function listen(port = DEFAULT_PORT) {
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => resolve(server.address().port));
    });
  }

  function close() {
    return new Promise((resolve) => server.close(() => resolve()));
  }

  return { server, state, enqueue, listen, close, allowedOrigins };
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const args = { port: DEFAULT_PORT, origins: DEFAULT_ORIGINS };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--port') args.port = Number.parseInt(argv[i + 1], 10);
    if (argv[i] === '--origins') args.origins = argv[i + 1].split(',').map((s) => s.trim()).filter(Boolean);
  }
  return args;
}

const isCli = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  const args = parseArgs(process.argv.slice(2));
  const bridge = createBridgeServer({
    allowedOrigins: args.origins,
    log: (message) => console.log(message),
  });
  console.log('Focus Widget bridge simulator (mock — the real one ships inside the Tauri companion)');
  console.log('Type: pause | resume | finish | show | quit');
  const port = await bridge.listen(args.port);
  console.log(`listening on http://127.0.0.1:${port}/focus/v1  (allowed origins: ${args.origins.join(', ')})`);
  console.log('Open FocusDesk with the port configured (NEXT_PUBLIC_FOCUS_WIDGET_PORT) and start a task.');

  if (process.stdin.isTTY) {
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      const input = chunk.trim();
      if (input === 'quit') process.exit(0);
      if (input === 'show') {
        console.log(bridge.state.session ? 'session is active' : 'no active session');
        return;
      }
      if (['pause', 'resume', 'finish'].includes(input)) bridge.enqueue(input);
    });
  }

  const timer = setInterval(() => {
    const session = bridge.state.session;
    if (!session) return;
    const elapsed =
      session.state === 'running' && session.startedAt
        ? session.accumulatedSeconds + (Date.now() - Date.parse(session.startedAt)) / 1000
        : session.accumulatedSeconds;
    const total = Math.floor(elapsed);
    const clock = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    process.stdout.write(
      `\r[widget] ${session.state === 'running' ? '▶' : '⏸'} ${clock}  ${session.title.slice(0, 42).padEnd(42)}`,
    );
  }, 1000);
  timer.unref?.();
}
