/**
 * Focus Widget bridge client.
 *
 * Headless, framework-free (except for one optional typing import) helper that
 * keeps the optional Windows companion in sync with the FocusDesk PWA.
 *
 * It is deliberately defensive: every failure is swallowed. If the companion is
 * not installed, not running, or on a different port, FocusDesk behaves exactly
 * as before — the feature is inert and nothing is written anywhere.
 *
 * The PWA is always the source of truth:
 *  - it *pushes* the active task snapshot (derived from persisted timestamps);
 *  - it *pulls* widget commands and applies them through the existing
 *    `useData()` actions — the same code path the in-app buttons use, so
 *    history logging, optimistic updates and rollback all keep working.
 */

import {
  FOCUS_WIDGET_PROTOCOL_VERSION,
  focusWidgetBaseUrl,
  isFocusWidgetEnabled,
  type FocusWidgetCommand,
  type FocusWidgetCommandsResponse,
  type FocusWidgetHealth,
  type FocusWidgetSession,
  type FocusWidgetSessionPayload,
} from './protocol';

export type FocusWidgetSource = () => FocusWidgetSession | null;
export type FocusWidgetCommandHandler = (command: FocusWidgetCommand) => void | Promise<void>;

export interface FocusWidgetBridgeOptions {
  /** Override the loopback base URL (testing). */
  baseUrl?: string;
  /** Force-disable the bridge (env `NEXT_PUBLIC_FOCUS_WIDGET_ENABLED=false`). */
  enabled?: boolean;
  /** Re-send cadence while a task runs; rebases the widget clock (ms). */
  keepAliveMs?: number;
  /** How long a command may sit in the queue before the PWA ignores it (ms). */
  commandMaxAgeMs?: number;
  /** Diagnostics sink (defaults to a no-op — the app stays quiet). */
  log?: (...args: unknown[]) => void;
}

/**
 * Retry cadence for reaching the companion. The first probes are quick so a
 * companion that starts a moment later is picked up almost immediately; the cap
 * keeps a machine without the companion from probing in a tight loop (a failed
 * probe is a local `connect()` on a closed port — cheap, but not free).
 */
const PROBE_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 10_000];
const REQUEST_TIMEOUT_MS = 4_000;
const POLL_TIMEOUT_MS = 25_000; // must exceed the server-side long-poll hold
const POLL_WAIT_S = 20;

function sessionKey(session: FocusWidgetSession | null): string {
  if (!session) return 'none';
  return [
    session.sessionId,
    session.state,
    session.startedAt ?? '',
    session.pausedAt ?? '',
    session.accumulatedSeconds,
    session.title,
  ].join('|');
}

const noop = () => {};

/** AbortSignal that fires after `ms` (falls back for engines without `AbortSignal.timeout`). */
function timeoutSignal(ms: number): AbortSignal {
  const extended = AbortSignal as typeof AbortSignal & { timeout?: (value: number) => AbortSignal };
  if (typeof extended.timeout === 'function') return extended.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export class FocusWidgetBridge {
  private readonly baseUrl: string;
  private readonly enabled: boolean;
  private readonly keepAliveMs: number;
  private readonly commandMaxAgeMs: number;
  private readonly log: (...args: unknown[]) => void;

  private source: FocusWidgetSource | null = null;
  private commandHandler: FocusWidgetCommandHandler | null = null;

  private started = false;
  private connected = false;
  private probeFailures = 0;
  private nextProbeAt = 0;
  private incompatible = false;

  private lastKey: string | null = null;
  private lastSentAt = 0;

  private since = 0;
  private polling = false;
  private pollAbort: AbortController | null = null;
  private keepAlive: ReturnType<typeof setInterval> | null = null;
  private removeLifecycle: (() => void) | null = null;

  constructor(options: FocusWidgetBridgeOptions = {}) {
    this.baseUrl = options.baseUrl ?? focusWidgetBaseUrl();
    this.enabled = options.enabled ?? isFocusWidgetEnabled();
    this.keepAliveMs = options.keepAliveMs ?? 5_000;
    this.commandMaxAgeMs = options.commandMaxAgeMs ?? 120_000;
    this.log = options.log ?? noop;
  }

  /** Begin watching. Safe to call more than once. */
  start(): void {
    if (!this.enabled || this.started) return;
    this.started = true;
    this.attachLifecycleHooks();
    this.keepAlive = setInterval(() => this.push(), this.keepAliveMs);
    this.push(true);
  }

  /** Register the function that produces the current snapshot on demand. */
  setSource(source: FocusWidgetSource | null): void {
    this.source = source;
    this.push();
  }

  /** Register the handler that applies widget commands to FocusDesk state. */
  setCommandHandler(handler: FocusWidgetCommandHandler | null): void {
    this.commandHandler = handler;
  }

  /**
   * Push the current snapshot.
   *
   *  - a changed session identity is sent straight away;
   *  - an unchanged running session is re-sent only every `keepAliveMs`
   *    (it rebases the widget clock, which is otherwise timestamp-derived);
   *  - "no active task" is sent once — no idle chatter.
   */
  push(force = false): void {
    if (!this.started) return;
    const session = this.source?.() ?? null;
    const key = sessionKey(session);
    const now = Date.now();
    if (!force) {
      if (session === null) {
        if (key === this.lastKey) return; // already told the companion: nothing active
      } else if (key === this.lastKey && now - this.lastSentAt < this.keepAliveMs) {
        return;
      }
    }
    void this.send(session, key);
  }

  /** Tell the companion the PWA is going away. The session itself stays. */
  detach(reason = 'pagehide'): void {
    if (!this.started || !this.connected) return;
    const session = this.source?.() ?? null;
    if (!session) return;
    this.postJson('/session', { session, attached: false, reason } satisfies FocusWidgetSessionPayload, true);
    this.stopPolling();
  }

  /** Stop everything (used on unmount / tests). */
  dispose(): void {
    this.started = false;
    this.stopPolling();
    this.removeLifecycle?.();
    this.removeLifecycle = null;
    if (this.keepAlive) clearInterval(this.keepAlive);
    this.keepAlive = null;
    this.source = null;
    this.commandHandler = null;
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                        */
  /* ---------------------------------------------------------------- */

  private attachLifecycleHooks(): void {
    if (typeof window === 'undefined') return;
    const onHide = () => this.detach('pagehide');
    window.addEventListener('pagehide', onHide);
    this.removeLifecycle = () => window.removeEventListener('pagehide', onHide);
  }

  private async send(session: FocusWidgetSession | null, key: string): Promise<void> {
    const ok = await this.ensureConnected();
    if (!ok) return;
    const payload: FocusWidgetSessionPayload = {
      session,
      attached: true,
      reason: session ? 'snapshot' : this.lastKey && this.lastKey !== 'none' ? 'session-ended' : 'idle',
    };
    const sent = await this.postJson('/session', payload, false);
    if (!sent) return;
    this.lastKey = key;
    this.lastSentAt = Date.now();
    if (session) this.ensurePolling();
    else this.stopPolling();
  }

  /** Probe the companion, honouring backoff. Never throws. */
  private async ensureConnected(): Promise<boolean> {
    if (this.connected) return true;
    if (this.incompatible) return false;
    if (Date.now() < this.nextProbeAt) return false;

    const health = await this.fetchJson<FocusWidgetHealth>('/health', REQUEST_TIMEOUT_MS);
    if (!health || health.ok !== true) {
      this.probeFailures += 1;
      const delay = PROBE_BACKOFF_MS[Math.min(this.probeFailures - 1, PROBE_BACKOFF_MS.length - 1)];
      this.nextProbeAt = Date.now() + delay;
      return false;
    }
    if (health.protocol !== FOCUS_WIDGET_PROTOCOL_VERSION) {
      this.incompatible = true;
      this.log(
        `[focus-widget] companion speaks protocol ${health.protocol}, this app speaks ${FOCUS_WIDGET_PROTOCOL_VERSION} — skipping`,
      );
      return false;
    }
    this.connected = true;
    this.probeFailures = 0;
    this.log('[focus-widget] connected to companion', health.version);
    this.afterReconnect();
    return true;
  }

  /** A fresh page (or a restarted companion) must not replay stale commands. */
  private afterReconnect(): void {
    this.since = 0;
    this.lastKey = null;
  }

  private ensurePolling(): void {
    if (this.polling || this.incompatible) return;
    this.polling = true;
    void this.pollLoop();
  }

  private stopPolling(): void {
    this.polling = false;
    this.pollAbort?.abort();
    this.pollAbort = null;
  }

  private async pollLoop(): Promise<void> {
    while (this.polling && this.started) {
      try {
        const controller = new AbortController();
        this.pollAbort = controller;
        const response = await this.fetchJson<FocusWidgetCommandsResponse>(
          `/commands?since=${this.since}&wait=${POLL_WAIT_S}`,
          POLL_TIMEOUT_MS,
          controller.signal,
        );
        if (!this.polling) break;
        if (!response) {
          await this.backoffSleep();
          continue;
        }
        if (typeof response.nextSince === 'number') this.since = response.nextSince;
        for (const command of response.commands ?? []) this.dispatch(command);
      } catch (error) {
        if (!this.polling) break;
        this.log('[focus-widget] command poll failed', error);
        await this.backoffSleep();
      }
    }
    if (this.pollAbort) this.pollAbort = null;
  }

  private dispatch(command: FocusWidgetCommand): void {
    if (!this.commandHandler) return;
    if (command.taskId !== (this.source?.() ?? null)?.taskId) return; // not the active session
    const age = Date.now() - Date.parse(command.createdAt);
    if (Number.isFinite(age) && age > this.commandMaxAgeMs) return; // stale, ignore
    try {
      void this.commandHandler(command);
    } catch (error) {
      this.log('[focus-widget] command handler failed', error);
    }
  }

  private async backoffSleep(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  /**
   * JSON GET. No custom headers → no CORS preflight. Returns null on any
   * failure (companion missing, CORS rejection, timeout, bad JSON).
   */
  private async fetchJson<T>(path: string, timeoutMs: number, external?: AbortSignal): Promise<T | null> {
    try {
      const signal = external ?? timeoutSignal(timeoutMs);
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit',
        signal,
      });
      if (!response.ok) return null;
      return (await response.json()) as T;
    } catch (error) {
      if (external?.aborted) throw error; // keep the abort signal working
      return null;
    }
  }

  /** JSON POST — forces a CORS preflight, so only allow-listed origins may write. */
  private async postJson(path: string, body: FocusWidgetSessionPayload, keepalive: boolean): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit',
        keepalive,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: timeoutSignal(REQUEST_TIMEOUT_MS),
      });
      return response.ok;
    } catch (error) {
      this.log('[focus-widget] could not reach the companion', error);
      return false;
    }
  }
}
