/*
 * Focus Widget frontend.
 *
 * Plain JavaScript on purpose: it runs inside the Tauri webview with the global
 * API enabled (`withGlobalTauri`), so the companion needs no bundler and no
 * frontend dependencies. Everything it displays comes from the Rust side
 * (`get_widget_state`), which mirrors what the FocusDesk PWA published — the
 * widget owns neither tasks nor time.
 *
 * Elapsed time is derived from the timestamps FocusDesk stores
 * (`startedAt` + `accumulatedSeconds`), exactly like `elapsedActiveSeconds()`
 * in lib/timer.ts and `SessionSnapshot::elapsed_seconds()` in Rust, so the
 * widget clock and the FocusDesk timer can never disagree.
 */

(function () {
  'use strict';

  const tauri = window.__TAURI__ || {};
  const invoke = tauri.core && tauri.core.invoke;

  const POLL_VISIBLE_MS = 300;
  const POLL_HIDDEN_MS = 2000;
  const PENDING_TIMEOUT_MS = 6000;

  const el = {
    titlebar: document.getElementById('titlebar'),
    close: document.getElementById('close'),
    title: document.getElementById('title'),
    meta: document.getElementById('meta'),
    clock: document.getElementById('clock'),
    toggle: document.getElementById('toggle'),
    toggleGlyph: document.getElementById('toggle-glyph'),
    toggleLabel: document.getElementById('toggle-label'),
    finish: document.getElementById('finish'),
    status: document.getElementById('status'),
  };

  /** Last `WidgetStateView` received from Rust. */
  let view = null;
  /** A command that has been sent but not yet reflected in FocusDesk. */
  let pending = null;
  let pendingSentAt = 0;

  /* ---------------------------------------------------------------- */
  /* Derived state                                                     */
  /* ---------------------------------------------------------------- */

  /** Mirror of `elapsedActiveSeconds()` in lib/timer.ts. */
  function elapsedSeconds(session) {
    const accumulated = Number(session.accumulatedSeconds) || 0;
    if (session.state === 'running' && session.startedAt) {
      const started = Date.parse(session.startedAt);
      if (!Number.isNaN(started)) {
        return accumulated + Math.max(0, (Date.now() - started) / 1000);
      }
    }
    return accumulated;
  }

  function formatClock(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    const mm = String(minutes).padStart(2, '0');
    const ss = String(secs).padStart(2, '0');
    return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  function formatEstimate(minutes) {
    if (!minutes || minutes <= 0) return '';
    if (minutes < 60) return `${minutes} min estimate`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours} h estimate` : `${hours} h ${rest} min estimate`;
  }

  function pendingMatches(session) {
    if (!pending) return true;
    if (pending === 'finish') return session === null;
    if (!session) return false;
    return pending === 'pause' ? session.state === 'paused' : session.state === 'running';
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  function render() {
    const session = view && view.session ? view.session : null;

    if (!pendingMatches(session) && Date.now() - pendingSentAt > PENDING_TIMEOUT_MS) {
      pending = null; // FocusDesk never confirmed — stop pretending
    } else if (pendingMatches(session)) {
      pending = null;
    }

    const online = Boolean(view && view.online) && Boolean(session);
    const busy = pending !== null;

    el.title.textContent = session ? session.title : 'No task is running';
    el.meta.textContent = session
      ? [session.projectName, formatEstimate(session.estimatedMinutes)].filter(Boolean).join(' · ')
      : '';

    el.clock.textContent = session ? formatClock(elapsedSeconds(session)) : '--:--';
    el.clock.className = 'clock' + (session && session.state === 'paused' ? ' paused' : '') + (online ? '' : ' offline');

    const paused = Boolean(session) && session.state === 'paused';
    el.toggleLabel.textContent = paused ? 'Resume' : 'Pause';
    el.toggleGlyph.textContent = paused ? '▶' : '❚❚';

    el.toggle.disabled = !online || busy;
    el.finish.disabled = !online || busy;
    el.toggle.className = 'button secondary' + (busy && pending !== 'finish' ? ' busy' : '');
    el.finish.className = 'button primary' + (busy && pending === 'finish' ? ' busy' : '');

    if (busy) {
      el.status.textContent = pending === 'finish' ? 'Finishing in FocusDesk…' : 'Waiting for FocusDesk…';
      el.status.className = 'status';
      return;
    }

    if (!view) {
      el.status.textContent = 'Connecting to FocusDesk…';
      el.status.className = 'status';
      return;
    }

    if (!session) {
      el.status.textContent = `No active task · waiting on 127.0.0.1:${view.bridgePort}`;
      el.status.className = 'status';
      return;
    }

    if (!online) {
      el.status.textContent = `FocusDesk not connected · port ${view.bridgePort} — open the app to pause or finish`;
      el.status.className = 'status offline';
      return;
    }

    el.status.textContent = paused ? 'Paused · connected to FocusDesk' : 'Running · connected to FocusDesk';
    el.status.className = 'status';
  }

  /* ---------------------------------------------------------------- */
  /* Data                                                              */
  /* ---------------------------------------------------------------- */

  async function refresh() {
    if (!invoke) return;
    try {
      view = await invoke('get_widget_state');
    } catch (error) {
      // The window is closing, or the command is unavailable — keep the last view.
      return;
    }
    render();
  }

  let pollTimer = null;
  function schedulePoll() {
    if (pollTimer) {
      clearTimeout(pollTimer);
    }
    const hidden = document.visibilityState === 'hidden';
    pollTimer = setTimeout(async () => {
      await refresh();
      schedulePoll();
    }, hidden ? POLL_HIDDEN_MS : POLL_VISIBLE_MS);
  }

  /* ---------------------------------------------------------------- */
  /* Actions                                                           */
  /* ---------------------------------------------------------------- */

  async function sendCommand(command) {
    if (!invoke || pending) return;
    pending = command;
    pendingSentAt = Date.now();
    render();
    try {
      await invoke('widget_command', { command });
    } catch (error) {
      pending = null;
      render();
      return;
    }
    // Show the confirmation as soon as FocusDesk has applied it.
    await refresh();
  }

  el.toggle.addEventListener('click', () => {
    const session = view && view.session;
    if (!session) return;
    void sendCommand(session.state === 'paused' ? 'resume' : 'pause');
  });

  el.finish.addEventListener('click', () => {
    void sendCommand('finish');
  });

  el.close.addEventListener('click', () => {
    if (invoke) void invoke('dismiss_widget');
  });

  /* Move the window by dragging the title bar (handled in Rust). */
  el.titlebar.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || event.target === el.close) return;
    if (invoke) void invoke('drag_window');
  });

  /* A small utility should not need the keyboard, but Esc = hide is natural. */
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && invoke) void invoke('dismiss_widget');
  });

  /* No WebView context menu inside a native-looking widget. Builds with
     devtools (debug) can still open them with Ctrl+Shift+I. */
  document.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('dragstart', (event) => event.preventDefault());

  /* The clock ticks locally; FocusDesk remains the source of truth because the
     value is recomputed from the timestamps on every render. */
  setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    render();
  }, 1000);

  /* Refresh immediately when the window becomes visible again (the Rust side
     shows it when a task starts). */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void refresh();
      schedulePoll();
    }
  });

  if (!invoke) {
    el.status.textContent = 'Tauri API unavailable — run this inside the companion window';
    el.status.className = 'status offline';
    return;
  }

  void refresh();
  schedulePoll();
})();
