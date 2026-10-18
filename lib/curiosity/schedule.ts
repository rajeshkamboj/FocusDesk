/**
 * Curiosity publication schedule — the pure half of the automation.
 *
 * Everything that decides *when* content changes and *which* rotation step a
 * given day is lives here, because it has to be testable without a server, a
 * cron runner or a network. Nothing in this file reads state, hits the
 * database or fetches a source.
 *
 * ## The one clock that matters
 *
 * A day of Curiosity content is a day in **Asia/Kolkata**, not a UTC day and
 * not the reader's device day. `publicationDate()` is the only function the
 * rest of the feature uses to answer "which day are we publishing?", and
 * `dayNumber()` is the rotation step derived from it. Because both go through
 * the same zone, a briefing published at 00:00 IST and one read at 23:59 IST
 * agree on the date, and the two do not drift when the reader's laptop is on a
 * different clock.
 *
 * Asia/Kolkata is UTC+05:30 with no daylight saving, so the local midnight
 * lands on the same UTC minute every day of the year: 18:30 UTC. That is the
 * minute every scheduler in this repository is configured for.
 */

/** The publication time zone. Content changes at midnight here. */
export const PUBLICATION_TIME_ZONE = 'Asia/Kolkata';

/**
 * Daily cron expression for schedulers whose clock is UTC.
 * `30 18 * * *` = 00:00 Asia/Kolkata. India has no DST, so this never shifts.
 */
export const DAILY_CRON_UTC = '30 18 * * *';

/** The same instant expressed for a server already running on Asia/Kolkata. */
export const DAILY_CRON_IST = '0 0 * * *';

/** One Book changes every three days, not every day. */
export const BOOK_INTERVAL_DAYS = 3;

/**
 * Rotation epoch. Every pool advances from this day forward, so a given date
 * always maps to the same step (see `dayNumber`). It is an anchor, not a
 * launch date: moving it would re-shuffle every reader's history for past
 * dates, which is exactly what the verify script guards against.
 */
export const ROTATION_EPOCH = '2026-01-01';

/** UTC offset of the publication zone, in minutes — kept for documentation/tests. */
const PUBLICATION_ZONE_OFFSET_MINUTES = 5 * 60 + 30;

export const MS_PER_MINUTE = 60_000;
export const MS_PER_DAY = 86_400_000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return false;
  // Rejects 2026-02-30 and friends, which Date.parse happily rolls over.
  return new Date(parsed).toISOString().slice(0, 10) === value;
}

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: PUBLICATION_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * The publication day that `now` falls in, as `YYYY-MM-DD` in Asia/Kolkata.
 *
 * `en-CA` is picked because it formats ISO-like `YYYY-MM-DD`; the time zone is
 * what does the actual work.
 */
export function publicationDate(now: Date = new Date()): string {
  const parts = dateFormatter.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const value = `${get('year')}-${get('month')}-${get('day')}`;
  return isIsoDate(value) ? value : new Date(now.getTime() + PUBLICATION_ZONE_OFFSET_MINUTES * MS_PER_MINUTE).toISOString().slice(0, 10);
}

/** Whole days from `ROTATION_EPOCH` to `date`. Negative for dates before it. */
export function dayNumber(date: string): number {
  if (!isIsoDate(date)) throw new RangeError(`Not an ISO date: ${date}`);
  return Math.floor(Date.parse(`${date}T00:00:00Z`) - Date.parse(`${ROTATION_EPOCH}T00:00:00Z`)) / MS_PER_DAY;
}

/** The inverse of `dayNumber`, for building fixtures and for the verify script. */
export function dateFromDayNumber(day: number): string {
  return new Date(Date.parse(`${ROTATION_EPOCH}T00:00:00Z`) + day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** `date` + `days`, in whole days (calendar arithmetic on the date key). */
export function addPublicationDays(date: string, days: number): string {
  return dateFromDayNumber(dayNumber(date) + days);
}

/** Whole days from `from` to `to`; positive when `to` is later. */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/**
 * Is a *daily* publish due for `now`?
 *
 * Due means exactly one thing: the snapshot on record is not the snapshot for
 * today's publication day. There is no time-of-day test here on purpose — the
 * scheduler fires at 00:00 IST, so by the time a reader opens the app the day
 * key has already turned over, and a job that started late (a cold boot, a
 * skipped runner, a paused project) should still publish rather than wait for
 * "tomorrow's" window. `force` is the administrative override.
 */
export function isDailyDue(now: Date, lastPublishedDate: string | null | undefined, options: { force?: boolean } = {}): boolean {
  if (options.force) return true;
  if (!lastPublishedDate) return true;
  return lastPublishedDate !== publicationDate(now);
}

/**
 * Is a new *One Book* due? Three whole publication days must have passed since
 * the one on record, so the recommendation never changes twice in one day and
 * never changes early because a refresh was triggered by hand.
 */
export function isBookDue(
  now: Date,
  lastPublishedDate: string | null | undefined,
  options: { force?: boolean; intervalDays?: number } = {},
): boolean {
  const interval = options.intervalDays ?? BOOK_INTERVAL_DAYS;
  if (options.force || !lastPublishedDate) return true;
  return daysBetween(lastPublishedDate, publicationDate(now)) >= interval;
}

/** Minutes remaining in the current publication day — used for cache lifetimes. */
export function minutesUntilNextPublicationDay(now: Date = new Date()): number {
  const offset = PUBLICATION_ZONE_OFFSET_MINUTES * MS_PER_MINUTE;
  const local = new Date(now.getTime() + offset);
  const endOfDay = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1);
  return Math.max(1, Math.ceil((endOfDay - local.getTime()) / MS_PER_MINUTE));
}

/**
 * How long a rendered briefing may be served before the store is read again.
 *
 * Capped so a deployment that is restarted near midnight still notices the new
 * day quickly, and floored so a busy page never polls the store per request.
 */
export function briefingCacheSeconds(now: Date = new Date()): number {
  return Math.min(300, Math.max(30, minutesUntilNextPublicationDay(now)));
}

/** "18 Oct 2026, 00:03" — an instant, read in the publication zone. */
export function formatPublicationInstant(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return iso;
  return new Date(time).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: PUBLICATION_TIME_ZONE,
  });
}

/** "Wed, 21 Oct 2026" — the day a card changes, for the settings panel and the page footer. */
export function formatPublicationDate(date: string): string {
  if (!isIsoDate(date)) return date;
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
