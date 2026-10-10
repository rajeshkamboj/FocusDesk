/**
 * Pure reminder scheduling.
 *
 * The page, the service worker (via a snapshot) and the tests all agree on
 * *what* should fire and *when*. Nothing here touches the DOM, IndexedDB or
 * the Notification API — those live in lib/notifications.ts and public/sw.js.
 *
 * Scheduling rules (deliberately close to the original in-session checker):
 *   - Morning priority: 08:00 local, only if today has no daily priority.
 *   - Evening review:   20:00 local.
 *   - Deadline:         09:00 local, for open tasks due today ("today") or
 *                       tomorrow ("tomorrow"). One fire key per task+dueDate,
 *                       so a task is never reminded twice for the same deadline.
 *   - Task reminder:    the task's own ISO timestamp, open tasks only.
 *
 * The old 60-minute upper bound on morning/evening is gone on purpose: if the
 * machine slept through the hour, the reminder is due the rest of that local
 * day (and still only once, via the fire key). Yesterday's daily reminders
 * are not resurrected.
 */

import { addDays, parseISODate, toISODate } from './dates';
import { isOpenTask } from './selectors';
import { taskFocusHref } from './task-focus';
import type { AppData, ISODate } from './types';

export const MORNING_HOUR = 8;
export const EVENING_HOUR = 20;
export const DEADLINE_HOUR = 9;

export const NOTIFICATION_ICON = '/icons/icon-192.png';
export const CHECK_INTERVAL_MS = 60_000;

/** Legacy localStorage key — still read so a restart never re-fires old keys. */
export const FIRED_STORAGE_KEY = 'pace.notifications.fired.v1';

export const NOTIFICATION_DB = 'pace.notifications.v1';
export const NOTIFICATION_DB_VERSION = 1;
export const FIRED_STORE = 'fired';
export const META_STORE = 'meta';
export const SCHEDULE_META_KEY = 'schedule';

export const SW_NAVIGATE_MESSAGE = 'FOCUSDESK_NAVIGATE';
export const SW_CHECK_MESSAGE = 'FOCUSDESK_REMINDER_CHECK';
export const PERIODIC_SYNC_TAG = 'focusdesk-reminders';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ID_LENGTH = 200;
const MAX_URL_LENGTH = 500;
const MAX_KEY_LENGTH = 400;
const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 400;
const MIN_TIMESTAMP = Date.UTC(2000, 0, 1);

export type ReminderKind =
  | 'morning'
  | 'evening'
  | 'task'
  | 'deadline-today'
  | 'deadline-tomorrow';

export interface ReminderEvent {
  key: string;
  kind: ReminderKind;
  /** Epoch milliseconds in the user's local zone (Date.getTime()). */
  at: number;
  title: string;
  body: string;
  /** Same-origin app path, e.g. `/tasks?focus=…`. */
  url: string;
  tag: string;
  taskId?: string;
}

export interface ReminderSnapshot {
  version: 1;
  timezoneOffset: number;
  writtenAt: number;
  events: ReminderEvent[];
}

export interface NotificationSettings {
  morningPriorityReminder: boolean;
  taskReminders: boolean;
  deadlineReminders: boolean;
  eveningReviewReminder: boolean;
}

export function isValidId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= MAX_ID_LENGTH && !id.includes('\0');
}

export function isIsoDate(value: unknown): value is ISODate {
  return typeof value === 'string' && ISO_DATE.test(value);
}

/**
 * Parse a reminder timestamp. Rejects non-finite values and absurd years so a
 * corrupt record cannot schedule a notification decades away (or in 1970).
 */
export function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return null;
  const max = Date.now() + 10 * 365 * 24 * 60 * 60 * 1000;
  if (t < MIN_TIMESTAMP || t > max) return null;
  return t;
}

/**
 * Same-origin in-app path only. Used both when building events and when the
 * service worker handles a notification click — never trust `data.url`.
 */
export function isSafeAppPath(url: unknown): url is string {
  if (typeof url !== 'string' || url.length === 0 || url.length > MAX_URL_LENGTH) return false;
  if (!url.startsWith('/')) return false;
  if (url.startsWith('//') || url.includes('\\') || url.includes('://')) return false;
  try {
    const parsed = new URL(url, 'https://focusdesk.local');
    if (parsed.origin !== 'https://focusdesk.local') return false;
    if (parsed.username || parsed.password) return false;
    if (parsed.hash) return false;
    return parsed.pathname.startsWith('/');
  } catch {
    return false;
  }
}

export function isValidReminderKey(key: unknown): key is string {
  return typeof key === 'string' && key.length > 0 && key.length <= MAX_KEY_LENGTH && !key.includes('\0');
}

/** Local calendar instant for `date` at `hour`:00:00.000. */
export function localDateAt(date: ISODate, hour: number, minute = 0): number {
  const d = parseISODate(date);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

function taskUrl(taskId: string): string {
  const href = taskFocusHref(taskId);
  return isSafeAppPath(href) ? href : '/tasks';
}

/**
 * Upcoming (and currently due) reminder events for `now`.
 *
 * Daily events are generated for today and tomorrow so a snapshot written in
 * the evening still has something for the service worker to fire the next
 * morning if the page is gone. Deadline events use today's 09:00 (existing
 * key scheme) plus tomorrow's 09:00 for tasks that would first become due
 * then; the earliest unfired copy of each key wins.
 */
export function buildReminderEvents(
  data: Pick<AppData, 'tasks' | 'dailyPriorities' | 'settings'>,
  now: Date,
): ReminderEvent[] {
  const settings: NotificationSettings = data.settings?.notifications ?? {
    morningPriorityReminder: false,
    taskReminders: false,
    deadlineReminders: false,
    eveningReviewReminder: false,
  };

  const today = toISODate(now);
  const tomorrow = addDays(today, 1);
  const events: ReminderEvent[] = [];

  if (settings.morningPriorityReminder) {
    for (const date of [today, tomorrow]) {
      const hasPriority = data.dailyPriorities.some((p) => p.date === date);
      if (hasPriority) continue;
      events.push({
        key: `morning-${date}`,
        kind: 'morning',
        at: localDateAt(date, MORNING_HOUR),
        title: "What's your #1 priority today?",
        body: "Set today's priority in FocusDesk.",
        url: '/today',
        tag: `morning-${date}`,
      });
    }
  }

  if (settings.eveningReviewReminder) {
    for (const date of [today, tomorrow]) {
      events.push({
        key: `evening-${date}`,
        kind: 'evening',
        at: localDateAt(date, EVENING_HOUR),
        title: 'Daily review',
        body: 'Take a moment to review your day in FocusDesk.',
        url: '/review',
        tag: `evening-${date}`,
      });
    }
  }

  if (settings.taskReminders) {
    for (const task of data.tasks) {
      if (!isValidId(task.id) || !task.reminder || !isOpenTask(task)) continue;
      const at = parseTimestamp(task.reminder);
      if (at == null) continue;
      const body = truncate((task.title || 'A task reminder').trim() || 'A task reminder', MAX_BODY_LENGTH);
      events.push({
        key: `task-${task.id}-${task.reminder}`,
        kind: 'task',
        at,
        title: 'Task reminder',
        body,
        url: taskUrl(task.id),
        tag: `task-${task.id}`,
        taskId: task.id,
      });
    }
  }

  if (settings.deadlineReminders) {
    for (const scanDate of [today, tomorrow]) {
      const at = localDateAt(scanDate, DEADLINE_HOUR);
      const soon = addDays(scanDate, 1);
      for (const task of data.tasks) {
        if (!isValidId(task.id) || !isOpenTask(task) || !isIsoDate(task.dueDate)) continue;
        let kind: ReminderKind | null = null;
        let title = '';
        if (task.dueDate === scanDate) {
          kind = 'deadline-today';
          title = 'Deadline today';
        } else if (task.dueDate === soon) {
          kind = 'deadline-tomorrow';
          title = 'Deadline tomorrow';
        }
        if (!kind) continue;
        const body = truncate((task.title || 'A deadline').trim() || 'A deadline', MAX_BODY_LENGTH);
        events.push({
          key: `deadline-${task.id}-${task.dueDate}`,
          kind,
          at,
          title,
          body,
          url: taskUrl(task.id),
          tag: `deadline-${task.id}-${task.dueDate}`,
          taskId: task.id,
        });
      }
    }
  }

  return dedupeByKey(events).filter(isWellFormedEvent);
}

/** Keep the earliest occurrence of each fire key. */
export function dedupeByKey(events: ReminderEvent[]): ReminderEvent[] {
  const map = new Map<string, ReminderEvent>();
  for (const event of events) {
    const prev = map.get(event.key);
    if (!prev || event.at < prev.at) map.set(event.key, event);
  }
  return [...map.values()].sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
}

export function isWellFormedEvent(event: ReminderEvent): boolean {
  return (
    isValidReminderKey(event.key) &&
    Number.isFinite(event.at) &&
    typeof event.title === 'string' &&
    event.title.length > 0 &&
    event.title.length <= MAX_TITLE_LENGTH &&
    typeof event.body === 'string' &&
    event.body.length <= MAX_BODY_LENGTH &&
    isSafeAppPath(event.url) &&
    typeof event.tag === 'string' &&
    event.tag.length > 0 &&
    event.tag.length <= MAX_KEY_LENGTH &&
    (event.taskId === undefined || isValidId(event.taskId))
  );
}

export function dueReminders(
  events: ReminderEvent[],
  nowMs: number,
  fired: ReadonlySet<string>,
): ReminderEvent[] {
  if (!Number.isFinite(nowMs)) return [];
  return events.filter((event) => isWellFormedEvent(event) && event.at <= nowMs && !fired.has(event.key));
}

export function nextReminderAt(
  events: ReminderEvent[],
  nowMs: number,
  fired: ReadonlySet<string>,
): number | null {
  let next: number | null = null;
  for (const event of events) {
    if (!isWellFormedEvent(event) || fired.has(event.key) || event.at <= nowMs) continue;
    if (next == null || event.at < next) next = event.at;
  }
  return next;
}

export function delayUntilNextCheck(nextAt: number | null, nowMs: number, max = CHECK_INTERVAL_MS): number {
  if (nextAt == null || !Number.isFinite(nextAt)) return max;
  const wait = nextAt - nowMs;
  if (wait <= 0) return 250;
  return Math.max(250, Math.min(max, wait));
}

export function buildReminderSnapshot(
  data: Pick<AppData, 'tasks' | 'dailyPriorities' | 'settings'>,
  now: Date,
): ReminderSnapshot {
  return {
    version: 1,
    timezoneOffset: now.getTimezoneOffset(),
    writtenAt: now.getTime(),
    events: buildReminderEvents(data, now),
  };
}

export function eventsFromSnapshot(snapshot: unknown, nowMs: number): ReminderEvent[] {
  if (!snapshot || typeof snapshot !== 'object') return [];
  const rec = snapshot as Partial<ReminderSnapshot>;
  if (rec.version !== 1 || !Array.isArray(rec.events)) return [];
  if (typeof rec.timezoneOffset === 'number' && rec.timezoneOffset !== new Date(nowMs).getTimezoneOffset()) {
    // Offset changed since the snapshot was written. Daily hour-based events
    // are stale; the page will rebuild. The SW still delivers absolute task
    // timestamps, which are timezone-independent instants.
    return rec.events.filter((event) => event && event.kind === 'task' && isWellFormedEvent(event));
  }
  return rec.events.filter((event): event is ReminderEvent => !!event && isWellFormedEvent(event));
}

export function notificationOptions(event: ReminderEvent): NotificationOptions {
  return {
    body: event.body,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_ICON,
    tag: event.tag,
    data: {
      url: event.url,
      key: event.key,
      kind: event.kind,
      taskId: event.taskId ?? null,
    },
  };
}

export interface FiredStore {
  claim(key: string): Promise<boolean>;
  release(key: string): Promise<void>;
  keys(): Promise<Set<string>>;
}

export function memoryFiredStore(initial?: Iterable<string>): FiredStore & { raw: Set<string> } {
  const set = new Set(initial);
  return {
    raw: set,
    async claim(key) {
      if (!isValidReminderKey(key) || set.has(key)) return false;
      set.add(key);
      return true;
    },
    async release(key) {
      set.delete(key);
    },
    async keys() {
      return new Set(set);
    },
  };
}

/**
 * Deliver every currently-due event at most once. `show` is the only side
 * effect — tests inject a spy; the app injects the Notification API / SW.
 */
export async function deliverDueReminders(
  events: ReminderEvent[],
  nowMs: number,
  store: FiredStore,
  show: (event: ReminderEvent) => Promise<void> | void,
): Promise<string[]> {
  const fired = await store.keys();
  const due = dueReminders(events, nowMs, fired);
  const delivered: string[] = [];
  for (const event of due) {
    const claimed = await store.claim(event.key);
    if (!claimed) continue;
    try {
      await show(event);
      delivered.push(event.key);
    } catch {
      await store.release(event.key);
    }
  }
  return delivered;
}
