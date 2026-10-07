/**
 * Pure task-timer state helpers. No side effects — safe to use anywhere.
 *
 * The timer is timestamp-driven, never counter-driven: elapsed time is derived
 * from `startedAt` / `pausedAt` / `actualDurationSeconds` on the task. The
 * persisted task fields are also periodically checkpointed while a session is
 * running, so a browser termination without an unload event can recover to the
 * last reliably stored second instead of treating an old `startedAt` as live.
 *
 * State model (the existing `status` field is the source of truth — pause is a
 * sub-state of `in_progress`, not a separate status):
 *
 *   pending ──Start──▶ in_progress (running: startedAt set)
 *                         │  ▲
 *                      Pause  Resume
 *                         ▼  │
 *                       in_progress (paused: startedAt unset, pausedAt set)
 *                         │
 *                      Finish
 *                         ▼
 *                      completed (actualDurationSeconds finalized)
 */

import type { ID, ISODateTime, Task, TimerSessionInput } from './types';

/** The task's timer is currently accumulating time. */
export function isTimerRunning(task: Task): boolean {
  return task.status === 'in_progress' && task.startedAt !== undefined;
}

/** The task's timer is paused (worked time preserved, not accumulating). */
export function isTimerPaused(task: Task): boolean {
  return task.status === 'in_progress' && task.startedAt === undefined && task.pausedAt !== undefined;
}

/**
 * Every task whose timer is currently running.
 *
 * Timers are independent: starting one never stops, pauses, replaces or
 * switches another. Task A in VS Code, Task B in Arena.ai and Task C (a book)
 * can genuinely run at the same time, so this returns a list rather than
 * answering "which single task owns the timer". Archived tasks are excluded
 * everywhere timers are surfaced, so they are excluded here too.
 *
 * There is deliberately no "blocking timer" query: no code path may refuse to
 * start a timer because another one is running.
 */
export function runningTimerTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.archived && isTimerRunning(t));
}

/**
 * Active working seconds accumulated so far (live, unrounded).
 *
 *  - running: previous segments (`actualDurationSeconds`) + the current segment
 *    (now − `startedAt`)
 *  - paused: everything accumulated up to the pause (`actualDurationSeconds`)
 */
export function elapsedActiveSeconds(task: Task, nowMs: number = Date.now()): number {
  const accumulated = task.actualDurationSeconds ?? 0;
  if (isTimerRunning(task) && task.startedAt) {
    const started = Date.parse(task.startedAt);
    if (!Number.isNaN(started)) return accumulated + Math.max(0, (nowMs - started) / 1000);
  }
  return accumulated;
}

/**
 * Persist a safe checkpoint of a running segment using the same existing task
 * fields. Whole seconds are folded into `actualDurationSeconds`; `startedAt`
 * moves forward by only those credited seconds, preserving any fractional
 * remainder so checkpoints never progressively discard time.
 */
export function checkpointTimingPatch(task: Task, nowMs: number = Date.now()): Partial<Task> {
  if (!isTimerRunning(task) || !task.startedAt) return {};
  const startedMs = Date.parse(task.startedAt);
  if (Number.isNaN(startedMs)) return {};

  const accumulated = task.actualDurationSeconds ?? 0;
  const total = elapsedActiveSeconds(task, nowMs);
  const checkpointedSeconds = Math.floor(total);
  const creditedMilliseconds = Math.max(0, (checkpointedSeconds - accumulated) * 1000);

  return {
    actualDurationSeconds: checkpointedSeconds,
    startedAt: new Date(Math.max(startedMs, Math.min(nowMs, startedMs + creditedMilliseconds))).toISOString(),
  };
}

/** Freeze a running timer at `now`, retaining the normal paused sub-state. */
export function pauseTimingPatch(task: Task, nowMs: number = Date.now()): Partial<Task> {
  if (!isTimerRunning(task)) return {};
  return {
    startedAt: undefined,
    pausedAt: new Date(nowMs).toISOString(),
    actualDurationSeconds: Math.floor(elapsedActiveSeconds(task, nowMs)),
  };
}

/**
 * Recover a running timer left behind by a terminated or reloaded page.
 *
 * An unload handler normally persists a precise pause. If the browser ended
 * the page before that write completed, `startedAt` is the start of the
 * uncheckpointed remainder and `actualDurationSeconds` is the last durable
 * whole-second checkpoint. Stop there; never count the time FocusDesk was
 * unavailable.
 */
export function interruptedTimerPatch(task: Task): Partial<Task> {
  if (!isTimerRunning(task) || !task.startedAt) return {};
  const startedMs = Date.parse(task.startedAt);
  if (Number.isNaN(startedMs)) {
    return { startedAt: undefined, pausedAt: new Date().toISOString() };
  }
  return {
    startedAt: undefined,
    pausedAt: new Date(startedMs).toISOString(),
  };
}

/**
 * Timing patch that finalizes/preserves whatever timing information exists
 * when a task leaves `in_progress` (Finish, manual complete, cancel,
 * reschedule…). Returns an empty patch for tasks that were never timed.
 */
export function settleTimingPatch(task: Task, nowMs: number = Date.now()): Partial<Task> {
  if (task.status !== 'in_progress') return {};
  if (isTimerRunning(task)) {
    return {
      startedAt: undefined,
      pausedAt: undefined,
      actualDurationSeconds: Math.floor(elapsedActiveSeconds(task, nowMs)),
    };
  }
  if (isTimerPaused(task)) {
    // Already accumulated at pause time — just release the pause marker.
    return { startedAt: undefined, pausedAt: undefined };
  }
  return {};
}

/* ------------------------------------------------------------------ */
/* Timer sessions — day attribution, built on the same timestamps      */
/* ------------------------------------------------------------------ */

/**
 * The run of the timer a task is currently writing into.
 *
 * This is the only piece of session state kept in memory. It is a bookmark,
 * not a second timer: the authoritative numbers still come from the task's
 * own `startedAt` / `actualDurationSeconds`, and `baseSeconds` is simply what
 * the task's total already was when this run began. Credited session time is
 * therefore always `task.actualDurationSeconds − baseSeconds`, which can
 * never exceed the task total and can never be counted twice.
 *
 * It is deliberately not persisted: a page that dies mid-run is recovered by
 * `interruptedTimerPatch`, which stops the task at its last durable
 * checkpoint — and the session row was written by that same checkpoint, so
 * both land on exactly the same second.
 */
export interface OpenTimerSession {
  taskId: ID;
  /** When this run of the timer began. */
  startedAt: ISODateTime;
  /** `actualDurationSeconds` the task already held when the run began. */
  baseSeconds: number;
  /** Row id, once the run has credited at least one whole second. */
  id?: ID;
  /** Duration last written, so unchanged checkpoints write nothing. */
  writtenSeconds?: number;
}

/** Open a session bookmark for a run that just started at `startedAt`. */
export function openTimerSession(task: Task, startedAt: ISODateTime): OpenTimerSession {
  return { taskId: task.id, startedAt, baseSeconds: Math.max(0, Math.floor(task.actualDurationSeconds ?? 0)) };
}

/**
 * Whole seconds this run has credited, given the task's current total.
 * Clamped at zero so a rollback or an out-of-order write can never produce a
 * negative session.
 */
export function sessionCreditedSeconds(open: OpenTimerSession, taskTotalSeconds: number): number {
  return Math.max(0, Math.floor(taskTotalSeconds) - open.baseSeconds);
}

/**
 * The row for an open run at its current credited duration.
 *
 * `endedAt` is anchored to `startedAt + duration`, not to the wall clock:
 * a run is continuous by construction (a pause ends it), so the credited
 * interval is exactly `[startedAt, startedAt + duration]`. Anchoring keeps
 * the stored span and the stored duration identical, which is what makes
 * splitting a midnight-crossing run across two days exact.
 */
export function timerSessionInput(open: OpenTimerSession, durationSeconds: number): TimerSessionInput {
  const startedMs = Date.parse(open.startedAt);
  const duration = Math.max(0, Math.floor(durationSeconds));
  const endedAt = Number.isNaN(startedMs)
    ? open.startedAt
    : new Date(startedMs + duration * 1000).toISOString();
  return { taskId: open.taskId, startedAt: open.startedAt, endedAt, durationSeconds: duration };
}
