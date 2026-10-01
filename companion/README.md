# FocusDesk Focus Widget — Windows companion (experimental)

A tiny, movable, **always-on-top** Windows window that shows the task FocusDesk is
timing, and lets you **Pause**, **Resume** and **Finish** it without switching
back to the browser.

```
┌───────────────────────────────┐
│ 🎯 FOCUS                    ✕ │
│                               │
│ Write FocusDesk documentation │
│ Personal · 60 min estimate    │
│                               │
│ 24:18                         │
│                               │
│ [  ❚❚ Pause  ] [  ✓ Finish  ] │
│ Running · connected to FocusDesk │
└───────────────────────────────┘
```

> **Experimental branch.** Nothing here touches the existing FocusDesk PWA: the
> app keeps working exactly as before when the companion is not installed, not
> running, or on a different port.

## Why Tauri

The requirement was a *lightweight* companion, and the architecture rule was to
keep the existing FocusDesk PWA unchanged. Tauri 2 fits both:

| | Tauri 2 | Electron |
|---|---|---|
| Installer size | ~3 MB | ~80 MB+ |
| Runtime | Windows WebView2 (already on Windows 10/11) | bundled Chromium |
| Always-on-top / tray / multi-monitor | native window APIs | native-ish |
| Changes needed in the Next.js app | one headless React component + one lib folder | same |

**No restructuring of FocusDesk was required.** The companion is completely
separate (its own `package.json`, no shared dependencies, no build coupling); the
only thing the two share is the small JSON protocol in
`lib/focus-widget/protocol.ts` and `src-tauri/src/bridge.rs`.

## Architecture

```
┌──────────────────────────────┐          ┌────────────────────────────────────┐
│ FocusDesk PWA (unchanged)    │          │ FocusDesk Focus Widget (this app)  │
│                              │          │                                    │
│ components/data/…            │          │  widget window (no chrome, on top) │
│   └─ useData()  ← source of  │          │    ├─ get_widget_state   (IPC)     │
│        truth for tasks/timer │          │    ├─ widget_command     (IPC)     │
│                              │          │    └─ drag_window / dismiss_widget │
│ components/focus-widget/…    │          │                                    │
│   └─ FocusWidgetLink (head-  │          │  Rust core                         │
│      less; publishes state,  │  HTTP    │    ├─ session.rs  mirrors the timer│
│      applies widget commands)│ ───────▶ │    ├─ bridge.rs   loopback server  │
│                              │ 127.0.0.1│    └─ config / logging / tray      │
└──────────────────────────────┘          └────────────────────────────────────┘
             ▲                                              │
             │   GET /focus/v1/commands (long-poll)          │
             └──────────────────────────────────────────────┘
```

**Source of truth: the PWA.** The companion never stores tasks, never talks to
Supabase and never runs its own timer.

1. You press **Start** in FocusDesk → the task becomes `in_progress` exactly as
   before (`startedAt` is stamped).
2. `FocusWidgetLink` (a headless component mounted in the app shell) notices the
   active task and **pushes a snapshot** to `POST http://127.0.0.1:<port>/focus/v1/session`.
3. The companion shows the window, stores the snapshot and derives the elapsed
   time from the *same* timestamps the PWA persists:
   `elapsed = accumulatedSeconds + (now − startedAt)`.
   That formula exists three times — `lib/timer.ts`, `src-tauri/src/session.rs`
   (unit-tested) and `companion/src/main.js` — and always yields the same value
   because there is no independent counter anywhere.
4. Pressing **Pause / Resume / Finish** in the widget queues a command
   (Tauri IPC → Rust queue). The PWA picks it up with a long-poll and applies it
   through the *existing* `useData()` actions (`pauseTask`, `resumeTask`,
   `finishTask`), so task history, optimistic updates, rollback and persistence
   all behave exactly like an in-app click.
5. Finishing (from either side) clears the session → the widget hides itself.

### Protocol (v1)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/focus/v1/health` | `{ ok, app, protocol, version, visible }` — connection probe, no preflight |
| `POST` | `/focus/v1/session` | `{ session: {…} \| null, attached?, reason? }` — snapshot push (JSON ⇒ CORS preflight) |
| `GET` | `/focus/v1/commands?since=N&wait=20` | long-poll; returns commands with `id > since` |
| `GET` | `/focus/v1/session` | current mirrored state — handy for debugging |

`companion/tools/mock-bridge.mjs` is a Node implementation of exactly this
protocol, used by `scripts/verify-focus-widget.tsx` and usable for PWA-only
development on machines without Rust.

## Running it locally

### 1. Run FocusDesk as usual

```bash
npm install
npm run dev            # http://localhost:3000
```

### 2. Run the companion (developer mode)

Prerequisites: [Rust](https://rustup.rs) (≥ 1.77) and, on Windows, the
[Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
with *Desktop development with C++*, plus WebView2 (pre-installed on Windows 11
and current Windows 10).

```bash
cd companion
npm install            # only fetches the Tauri CLI
npm run dev            # tauri dev — builds and opens the widget window
```

Start a task in FocusDesk and the widget appears. `npm run dev` prints the Rust
log; the same lines are written to
`%APPDATA%\com.focusdesk.focuswidget\widget.log`.

### 3. Opening the widget without starting a task

The companion also runs in the system tray (🎯). **Show focus widget** brings it
back if you closed it while a task is still running; **Quit** exits the app.

## Building the Windows executable

```bash
cd companion
npm install
npm run build          # tauri build → NSIS installer + .exe
```

Outputs:

- `companion/src-tauri/target/release/focusdesk-focus-widget.exe` — the app
- `companion/src-tauri/target/release/bundle/nsis/FocusDesk Focus Widget_0.1.0_x64-setup.exe` — installer

The bundler asks for WebView2 at install time (`downloadBootstrapper`, silent).
To build without the installer, add `--no-bundle`.

> Building requires a Windows host (or a Windows CI runner). Cross-compiling from
> Linux/macOS for Windows is possible but fiddly (`cargo-xwin`), so the
> recommended path is a Windows machine or a GitHub Actions `windows-latest` job.

## Configuration

Created on first run at
`%APPDATA%\com.focusdesk.focuswidget\config.json`:

```json
{
  "port": 8787,
  "allowedOrigins": ["http://localhost:3000", "http://127.0.0.1:3000"],
  "staleAfterSeconds": 8
}
```

- **`allowedOrigins`** — must contain the origin FocusDesk is served from. Add
  your deployed URL (e.g. `https://focusdesk.vercel.app`) if you use the hosted
  PWA. `"*"` accepts any origin; only do that for local experiments.
- **`port`** — must match the PWA's `NEXT_PUBLIC_FOCUS_WIDGET_PORT`
  (default `8787`).

For `tauri dev`, the same values can be overridden with the environment
variables `FOCUSDESK_WIDGET_PORT` and `FOCUSDESK_WIDGET_ORIGINS` (comma
separated) instead of editing the file.

## Security notes

- The bridge binds **127.0.0.1 only** — nothing on the network can reach it.
- The PWA is the only writer. Writes are `application/json`, which forces a CORS
  preflight; the bridge answers preflights only for allow-listed origins, so an
  arbitrary website cannot push a fake session or read the command stream.
  (Chrome's Private Network Access preflight is answered too.)
- The widget's own buttons use **Tauri IPC**, not HTTP — only the companion
  process can queue commands, and the bridge queue is bounded (32 entries).
- Only public task fields are transferred (`title`, `projectName`, timer
  timestamps, estimate). **No Supabase credentials, no service-role key, no
  session token**: the companion never talks to Supabase.
- Putting the service-role key in a desktop client remains impossible by design;
  the companion has no Supabase code at all.
- No RLS change, no schema change, no new API surface. `supabase/schema.sql` and
  the migrations are untouched.
- If Supabase mode ever gains per-user RLS, revisit this: the bridge is a local
  trust boundary and should then verify that the browser origin it is talking to
  is the user's own FocusDesk instance.

## Widget behaviour

| Event | Result |
|---|---|
| Task started in FocusDesk | widget appears (only if hidden **and** not user-dismissed) |
| Paused in FocusDesk | widget shows `Paused` + frozen time, button becomes *Resume* |
| Resumed | widget ticks again from the same accumulated time |
| Finished in FocusDesk or from the widget | widget hides, session cleared |
| Widget closed by the user (✕ / Esc) | **task untouched** — no pause, no finish. It reappears on the next Start/Resume, or from the tray |
| FocusDesk tab closed / reloaded | widget keeps showing the task, buttons disabled until FocusDesk is back |
| FocusDesk has no active task | widget shows `--:--` / "No task is running" (normally it is hidden) |

Window properties: borderless (no browser chrome), always-on-top, movable by its
header (`drag_window` IPC — no `data-tauri-drag-region`, which would need extra
window permissions), position and size remembered via `tauri-plugin-window-state`,
`skipTaskbar: true`, off-screen positions are re-centred (multi-monitor safe),
and showing the widget never steals focus (`focus: false`, no `set_focus`).

## What this deliberately does **not** do

No Pomodoro, no sounds, no motivational messages, no screen/website tracking, no
analytics, no notifications, no activity monitoring, no multiple widgets, no
settings screen, and **no Windows-startup integration** — the last one is
explicitly deferred until the widget itself has proven reliable.

## Tests

```bash
# Rust: session/timer mirroring, dismissal rules, command queue, CORS rules
cd companion/src-tauri && cargo test

# End-to-end: real DataProvider + FocusWidgetLink against the Node reference bridge
cd .. && npm i --no-save jsdom tsx && npx tsx scripts/verify-focus-widget.tsx
```

## Limitations

- The timer keeps running in the PWA only while FocusDesk is open. If the PWA is
  closed, the widget shows the task and elapsed time but cannot pause or finish
  it (buttons disabled). A background syncer is out of scope for this experiment.
- Starting a *new* task while the PWA is closed therefore also does not reach the
  widget until the app is open again.
- Loopback ports are per-machine: two users on one machine would share 8787.
- Windows-only window behaviour (`skipTaskbar`, tray) is what this branch targets;
  it compiles for Linux/macOS but is untested there.
- The `.ico`/PNG icons are generated from `public/icons/icon-192.png` by
  `python3 companion/tools/make-icons.py` (committed, so builds do not need Python).
