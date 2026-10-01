/**
 * Local-time calendar helpers.
 *
 * Dates are stored as "YYYY-MM-DD" strings so the user's local calendar day is
 * what matters — never a UTC instant shifted across midnight.
 */

import type { ISODate, MonthKey, WeekKey } from './types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Today's date in the user's local time zone. */
export function todayISO(): ISODate {
  return toISODate(new Date());
}

export function toISODate(date: Date): ISODate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseISODate(date: ISODate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(date: ISODate, amount: number): ISODate {
  const d = parseISODate(date);
  d.setDate(d.getDate() + amount);
  return toISODate(d);
}

export function addMonths(date: ISODate, amount: number): ISODate {
  const d = parseISODate(date);
  d.setMonth(d.getMonth() + amount, 1);
  return toISODate(d);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / MS_PER_DAY);
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: ISODate): ISODate {
  const d = parseISODate(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toISODate(d);
}

export function endOfWeek(date: ISODate): ISODate {
  return addDays(startOfWeek(date), 6);
}

/** ISO-8601 week key like "2026-W40". */
export function isoWeekKey(date: ISODate): WeekKey {
  const d = parseISODate(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day); // nearest Thursday
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Month key like "2026-09". */
export function monthKey(date: ISODate): MonthKey {
  return date.slice(0, 7);
}

/** First day of the month of `date`. */
export function startOfMonth(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: ISODate): ISODate {
  const d = parseISODate(startOfMonth(date));
  d.setMonth(d.getMonth() + 1, 0);
  return toISODate(d);
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function weekdayName(date: ISODate): string {
  return WEEKDAYS[parseISODate(date).getDay()];
}

export function monthName(date: ISODate): string {
  return MONTHS[parseISODate(date).getMonth()];
}

/** e.g. "Tue, Sep 29" */
export function formatShortDate(date: ISODate): string {
  const d = parseISODate(date);
  const wd = WEEKDAYS[d.getDay()].slice(0, 3);
  return `${wd}, ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

/** e.g. "Tuesday, September 29, 2026" */
export function formatLongDate(date: ISODate): string {
  const d = parseISODate(date);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "Today" / "Tomorrow" / "Yesterday" / short date. */
export function relativeDay(date: ISODate, reference: ISODate = todayISO()): string {
  const diff = daysBetween(reference, date);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return formatShortDate(date);
}

/** Format minutes as "45 min" / "1h 30m" / "2h". */
export function formatDuration(minutes?: number | null): string {
  if (minutes == null || Number.isNaN(minutes)) return '';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Compact stopwatch format for live timers (counts up, never down):
 *  - under an hour: "00:37" / "12:37"
 *  - an hour or more: "1h 24m"
 */
export function formatStopwatch(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  if (total < 3600) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Human phrasing for a stored actual duration in seconds:
 * "37 sec" / "12 min 37 sec" / "47 min" / "1h 24m".
 */
export function formatSecondsDetailed(seconds?: number | null): string {
  if (seconds == null || Number.isNaN(seconds)) return '';
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return m === 0 ? `${h}h` : `${h}h ${m}m`;
  if (m > 0) return s === 0 ? `${m} min` : `${m} min ${s} sec`;
  return `${s} sec`;
}

/** Format an ISO timestamp as local "HH:MM". */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Format an ISO timestamp for the "Completed …" line shown beneath a task.
 *  - today at 6:42 PM
 *  - yesterday at 9:05 AM
 *  - Sep 28 at 8:17 PM
 * Uses the user's local timezone. Returns an empty string if the input is
 * missing or invalid.
 */
export function formatCompletionTimestamp(iso: string | undefined, reference: ISODate = todayISO()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dateKey = toISODate(d);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (dateKey === reference) return `Completed today at ${time}`;
  if (dateKey === addDays(reference, -1)) return `Completed yesterday at ${time}`;
  return `Completed ${formatShortDate(dateKey)} at ${time}`;
}

/** "14:30"-style time on a given date → full ISO timestamp. */
export function combineDateTime(date: ISODate, time: string): string {
  const [h, m] = time.split(':').map(Number);
  const d = parseISODate(date);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.toISOString();
}

/** Today's minutes since midnight. */
export function minutesNow(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** Start of the month grid containing `date`: the Monday on/before the 1st. */
export function calendarGridStart(date: ISODate): ISODate {
  return startOfWeek(startOfMonth(date));
}
