/**
 * "Take me to this task" navigation — the contract between the Active Timer
 * Dock (which only builds a URL) and the Tasks screen (which consumes it).
 *
 * The target travels as a one-shot query parameter, `/tasks?focus=<task id>`,
 * always identified by the task's stable id, never by its title. The Tasks
 * screen strips the parameter again as soon as it has acted on it, so a reload
 * or Back/Forward never replays the flash, and clicking the same timer twice
 * still produces a fresh navigation.
 *
 * TIMER SAFETY: this is view navigation only. Callers must use the Next client
 * router (`router.push`) — never `window.location` or a plain `<a href>` — so
 * the document is never unloaded: an unload fires `pagehide`/`beforeunload`,
 * which deliberately pauses every running timer. Nothing here reads or writes
 * any timer field.
 */

import { dailyPriorityTimerTaskId, isDailyPriorityTimerTaskId } from './selectors';
import { TASK_FILTERS, type TaskFilterKey, type TaskFilterState } from './task-filters';
import type { DailyPriority, ID, ISODate } from './types';

export const TASK_FOCUS_PARAM = 'focus';

/** Visible red highlight lifetime; matches the `task-flash` animation in globals.css. */
export const TASK_FLASH_MS = 1800;

/** Attribute every TaskRow carries so a row can be found by stable task id. */
export const TASK_ROW_ID_ATTRIBUTE = 'data-task-id';

/** `/tasks?focus=<id>` — the Tasks view, targeted at one task. */
export function taskFocusHref(taskId: ID): string {
  return `/tasks?${new URLSearchParams({ [TASK_FOCUS_PARAM]: taskId }).toString()}`;
}

/**
 * Where an active timer should take the user.
 *
 * Today's priority timer Task is shown on its Today card (and deliberately
 * hidden from the Tasks list), so it keeps going to `/today`. Every other timer
 * — ordinary tasks and the timer Tasks of *earlier* days' priorities, which
 * the Tasks list does show — goes to that exact task in the Tasks view.
 */
export function activeTimerHref(taskId: ID, dailyPriorities: DailyPriority[], today: ISODate): string {
  if (isDailyPriorityTimerTaskId(taskId)) {
    const isTodaysPriority = dailyPriorities.some((p) => p.date === today && dailyPriorityTimerTaskId(p.id) === taskId);
    if (isTodaysPriority) return '/today';
  }
  return taskFocusHref(taskId);
}

/**
 * The rendered row for `taskId` inside `root`. Compares the attribute value
 * directly instead of building a CSS selector, so ids containing `:` or quotes
 * (priority timer ids do) need no escaping.
 */
export function findTaskRowElement(root: ParentNode, taskId: ID): HTMLElement | null {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(`[${TASK_ROW_ID_ATTRIBUTE}]`))) {
    if (el.getAttribute(TASK_ROW_ID_ATTRIBUTE) === taskId) return el;
  }
  return null;
}

/** A short sentence naming exactly the filters that were cleared, or null for none. */
export function clearedFiltersMessage(cleared: TaskFilterKey[], previous: TaskFilterState): string | null {
  if (cleared.length === 0) return null;
  const names = cleared.map((key) => {
    if (key === 'filter') {
      const label = TASK_FILTERS.find((f) => f.id === previous.filter)?.label ?? previous.filter;
      return `the “${label}” filter`;
    }
    if (key === 'projectFilter') return 'the project filter';
    if (key === 'goalFilter') return 'the goal filter';
    return 'the search';
  });
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `Cleared ${list} to show this task`;
}
