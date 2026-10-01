/**
 * Pure task-timer state helpers. No side effects — safe to use anywhere.
 *
 * The timer is timestamp-driven, never counter-driven: elapsed time is always
 * derived from `startedAt` / `pausedAt` / `actualDurationSeconds` on the task,
 * so re-renders, navigation, page refreshes and backgrounded tabs cannot drift
 * or reset the measurement. Only meaningful transitions (Start, Pause, Resume,
 * Finish) write to the repository.
 *
 * State model (the existing `status` field is the source of truth — pause is a
 * sub-state of `in_progress`, not a separate status):
 *
 *   pending ──Start──▶ in_progress (running: startedAt set)
 *                         │  ▲
 *                      Pause  Resume
 *                         ▼  │
 *                       in_progress (paused: pausedAt set, startedAt unset)
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
