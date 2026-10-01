/**
 * Focus Widget bridge protocol (v1) — shared contract between the FocusDesk PWA
 * and the optional Windows companion ("Focus Widget").
 *
 * The PWA owns the task state. The companion is a *renderer* of that state and
 * a *remote control* for it: it never stores tasks, never runs its own clock of
 * record and never writes to a database. All timing shown by the widget is
 * derived from the same persisted timestamps the PWA uses (`startedAt`,
 * `pausedAt`, `actualDurationSeconds` — see `lib/timer.ts`), so the two can not
 * drift apart.
 *
 * Transport: loopback HTTP on 127.0.0.1. The PWA is always the client.
 *
 *   PWA  ──GET  /focus/v1/health──────────────▶  bridge   (probe; no preflight)
 *   PWA  ──POST /focus/v1/session─────────────▶  bridge   (snapshot or null)
 *   PWA  ──GET  /focus/v1/commands?since=N────▶  bridge   (long-poll, JSON CORS)
 *
 *   widget ──Tauri IPC (invoke/events)────────▶  bridge Rust side
 *
 * Security notes:
 *  - Only the public task fields needed to render the widget are sent.
 *  - Writes use `application/json`, which forces a CORS preflight; the bridge
 *    only answers origins from its allow-list, so a random website cannot push
 *    a fake session (and cannot read the command stream either).
 *  - No Supabase credentials, no service-role key and no user session token are
 *    ever sent to the companion. The companion does not talk to Supabase.
 */

export const FOCUS_WIDGET_PROTOCOL_VERSION = 1;

/** Default loopback port; overridable on both sides via configuration. */
export const DEFAULT_FOCUS_WIDGET_PORT = 8787;

export const FOCUS_WIDGET_PATH = '/focus/v1';

/** Timer sub-state of a task that is `in_progress` (mirrors lib/timer.ts). */
export type FocusWidgetRunState = 'running' | 'paused';

/** Everything the widget needs to render one active task. */
export interface FocusWidgetSession {
  protocol: number;
  /** One timed task at a time, so the task id doubles as the session id. */
  sessionId: string;
  taskId: string;
  title: string;
  projectName?: string;
  state: FocusWidgetRunState;
  /** Present while running — the same timestamp the PWA timer measures from. */
  startedAt?: string;
  /** Present while paused. */
  pausedAt?: string;
  /** `task.actualDurationSeconds` — time accumulated in earlier segments. */
  accumulatedSeconds: number;
  /** `elapsedActiveSeconds(task)` at `sentAt` — the PWA's own number. */
  elapsedSeconds: number;
  /** Estimated effort in minutes, when the task has one. */
  estimatedMinutes?: number;
  /** When the PWA produced this snapshot (ISO-8601, UTC). */
  sentAt: string;
}

export type FocusWidgetCommandType = 'pause' | 'resume' | 'finish';

/** A request from the widget, to be applied by the PWA through `useData()`. */
export interface FocusWidgetCommand {
  id: number;
  type: FocusWidgetCommandType;
  taskId: string;
  createdAt: string;
}

export interface FocusWidgetAttachment {
  /** False when the PWA told the bridge it is going away (pagehide/unload). */
  attached: boolean;
  /** ISO timestamp of the last snapshot the bridge received. */
  lastSeenAt?: string;
}

export interface FocusWidgetHealth {
  ok: true;
  app: string;
  protocol: number;
  version: string;
  /** False when the widget window is currently hidden (user closed it). */
  visible?: boolean;
}

export type FocusWidgetSessionPayload = {
  session: FocusWidgetSession | null;
  /** Omitted means "attached" (a plain snapshot push). */
  attached?: boolean;
  /** Free-form, for the bridge log: 'pagehide' | 'task-finished' | … */
  reason?: string;
};

export interface FocusWidgetCommandsResponse {
  commands: FocusWidgetCommand[];
  nextSince: number;
}

/** Read the configured bridge port (public env — never a secret). */
export function focusWidgetPort(): number {
  const raw = process.env.NEXT_PUBLIC_FOCUS_WIDGET_PORT;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0 && parsed < 65536) return parsed;
  return DEFAULT_FOCUS_WIDGET_PORT;
}

/** Allow the whole feature to be switched off at build time. */
export function isFocusWidgetEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FOCUS_WIDGET_ENABLED !== 'false';
}

export function focusWidgetBaseUrl(port: number = focusWidgetPort()): string {
  return `http://127.0.0.1:${port}${FOCUS_WIDGET_PATH}`;
}
