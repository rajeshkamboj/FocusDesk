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

import type { Task } from './types';

/** The task's timer is currently accumulating time. */
export function isTimerRunning(task: Task): boolean {
  return task.status === 'in_progress' && task.startedAt !== undefined;
}

/** The task's timer is paused (worked time preserved, not accumulating). */
export function isTimerPaused(task: Task): boolean {
  return task.status === 'in_progress' && task.startedAt === undefined && task.pausedAt !== undefined;
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
