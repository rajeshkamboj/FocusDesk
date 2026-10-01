/**
 * Headless checks for the Review selectors' date semantics.
 *
 * The rule under test: `scheduledDate` says when work was *planned*,
 * `completedAt` says when it *actually happened*. Daily Review answers
 * "what happened on this day", so completed work is classified by
 * `completedAt`; planned-but-unfinished work stays classified by
 * `scheduledDate`.
 *
 * Pure functions only — no DOM, no React, no storage.
 * Run: npx tsx scripts/verify-review-stats.ts
 *
 * Timestamps are built with `combineDateTime`, which composes a *local*
 * instant, so the suite is meaningful in any timezone. To prove the
 * local-calendar-day handling (and not an accidental UTC string compare)
 * run it in both directions, e.g.:
 *   TZ=Asia/Kolkata npx tsx scripts/verify-review-stats.ts
 *   TZ=America/New_York npx tsx scripts/verify-review-stats.ts
 */
import { addDays, combineDateTime, todayISO } from '../lib/dates';
import {
  dailyReviewStats,
  focusedSeconds,
  monthlyReviewStats,
  weeklyReviewStats,
} from '../lib/selectors';
import { emptyData } from '../lib/store/defaults';
import type { AppData, Task } from '../lib/types';

const today = todayISO();
const yesterday = addDays(today, -1);
const tomorrow = addDays(today, 1);

/** A local-time instant on `date`, e.g. at('2026-10-01', '18:00'). */
const at = (date: string, time: string) => combineDateTime(date, time);

let failures = 0;
function ok(cond: boolean, msg: string) {
  if (cond) {
    console.log('✓', msg);
  } else {
    failures += 1;
    console.error('FAIL:', msg);
  }
}

let counter = 0;
function task(overrides: Partial<Task> & { title: string }): Task {
  counter += 1;
  return {
    id: `task-${counter}`,
    status: 'created',
    priority: 'medium',
    createdAt: at(today, '09:00'),
    tags: [],
    postponementCount: 0,
    archived: false,
    ...overrides,
  };
}

const dataWith = (...tasks: Task[]): AppData => ({ ...emptyData(), tasks });
const ids = (tasks: Task[]) => tasks.map((t) => t.id).sort();
const has = (tasks: Task[], id: string) => tasks.some((t) => t.id === id);

/* ------------------------------------------------------------------ */
/* A. Scheduled today + completed today                                */
/* ------------------------------------------------------------------ */
{
  const a = task({ title: 'Planned and finished today', scheduledDate: today, status: 'completed', completedAt: at(today, '18:00') });
  const stats = dailyReviewStats(dataWith(a), today);
  ok(has(stats.completed, a.id), 'A: a task scheduled today and completed today appears in today\u2019s completed list');
  ok(stats.completed.length === 1, 'A: it is counted once in "Tasks completed"');
  ok(dailyReviewStats(dataWith(a), yesterday).completed.length === 0, 'A: it does not leak into yesterday\u2019s completed list');
}

/* ------------------------------------------------------------------ */
/* B. Scheduled yesterday + completed today                            */
/* ------------------------------------------------------------------ */
{
  const b = task({ title: 'Carried over, finished today', scheduledDate: yesterday, status: 'completed', completedAt: at(today, '10:15') });
  const stats = dailyReviewStats(dataWith(b), today);
  ok(has(stats.completed, b.id), 'B: a task scheduled yesterday but completed today appears in today\u2019s completed list');
  ok(stats.completed.length === 1, 'B: "Tasks completed" counts it for the day it was actually finished');
  ok(!has(dailyReviewStats(dataWith(b), yesterday).completed, b.id), 'B: it is not counted on the day it was merely planned');
  ok(!has(stats.incomplete, b.id), 'B: a finished task never shows under "Not completed"');
}

/* ------------------------------------------------------------------ */
/* C. Scheduled today + completed tomorrow                             */
/* ------------------------------------------------------------------ */
{
  const c = task({ title: 'Slipped to tomorrow', scheduledDate: today, status: 'completed', completedAt: at(tomorrow, '09:40') });
  ok(!has(dailyReviewStats(dataWith(c), today).completed, c.id), 'C: a task completed tomorrow is absent from today\u2019s completed list');
  ok(dailyReviewStats(dataWith(c), today).completed.length === 0, 'C: today\u2019s "Tasks completed" does not count future work');
  ok(has(dailyReviewStats(dataWith(c), tomorrow).completed, c.id), 'C: it appears in tomorrow\u2019s completed list instead');
}

/* ------------------------------------------------------------------ */
/* D. The completed count is driven by completedAt                     */
/* ------------------------------------------------------------------ */
{
  const d1 = task({ title: 'Unscheduled, done today', status: 'completed', completedAt: at(today, '08:05') });
  const d2 = task({ title: 'Deadline only, done today', dueDate: addDays(today, 9), status: 'completed', completedAt: at(today, '13:00') });
  const d3 = task({ title: 'Deadline today, done yesterday', scheduledDate: yesterday, dueDate: today, status: 'completed', completedAt: at(yesterday, '20:00') });
  const stats = dailyReviewStats(dataWith(d1, d2, d3), today);
  ok(stats.completed.length === 2, 'D: today\u2019s count is 2 (unscheduled + deadline-only task), the third was finished yesterday');
  ok(has(stats.completed, d1.id), 'D: a task with no scheduledDate still counts as today\u2019s work when completedAt is today');
  ok(has(stats.completed, d2.id), 'D: a task with only a deadline counts as today\u2019s work when completedAt is today');
  ok(!has(stats.completed, d3.id), 'D: a deadline is not a work date — due today, finished yesterday is not today\u2019s completion');
  ok(has(dailyReviewStats(dataWith(d1, d2, d3), yesterday).completed, d3.id), 'D: the yesterday-completed task is reported on yesterday');
}

/* ------------------------------------------------------------------ */
/* E. Completed without a completedAt (legacy records)                 */
/* ------------------------------------------------------------------ */
{
  const e1 = task({ title: 'Legacy completed, scheduled today', scheduledDate: today, status: 'completed' });
  const e2 = task({ title: 'Legacy completed, unscheduled', status: 'completed' });
  const todayStats = dailyReviewStats(dataWith(e1, e2), today);
  ok(has(todayStats.completed, e1.id), 'E: a completed task with no completedAt keeps its old behaviour on its scheduled day');
  ok(!has(todayStats.completed, e2.id) && !has(dailyReviewStats(dataWith(e1, e2), tomorrow).completed, e2.id),
     'E: with no completedAt and no scheduledDate, no completion date is invented');
  ok(has(todayStats.incomplete, e2.id) === false, 'E: an unscheduled legacy record is not forced into any day\u2019s "Not completed"');
}

/* ------------------------------------------------------------------ */
/* F. Ordering: completedAt descending                                 */
/* ------------------------------------------------------------------ */
{
  const early = task({ title: 'Morning', scheduledDate: yesterday, status: 'completed', completedAt: at(today, '08:30'), createdAt: at(yesterday, '09:00') });
  const late = task({ title: 'Evening', status: 'completed', completedAt: at(today, '21:45'), createdAt: at(yesterday, '10:00') });
  const midday = task({ title: 'Afternoon', scheduledDate: today, status: 'completed', completedAt: at(today, '14:00'), createdAt: at(yesterday, '11:00') });
  const legacy = task({ title: 'No timestamp', scheduledDate: today, status: 'completed', createdAt: at(yesterday, '08:00') });
  const ordered = dailyReviewStats(dataWith(late, legacy, early, midday), today).completed.map((t) => t.id);
  ok(ordered.join(',') === [late.id, midday.id, early.id, legacy.id].join(','),
     'F: completed tasks are ordered by completedAt descending, most recent first (null timestamp last)');
}

/* ------------------------------------------------------------------ */
/* G. Focused time comes from the tasks actually completed that day    */
/* ------------------------------------------------------------------ */
{
  const timed = task({ title: 'Timed, finished today', scheduledDate: yesterday, status: 'completed', completedAt: at(today, '17:20'), actualDurationSeconds: 25 * 60 });
  const untimed = task({ title: 'Untimed, finished today', status: 'completed', completedAt: at(today, '19:00') });
  const otherDay = task({ title: 'Timed, finished yesterday', scheduledDate: today, status: 'completed', completedAt: at(yesterday, '16:00'), actualDurationSeconds: 60 * 60 });
  const open = task({ title: 'Still running', scheduledDate: today, status: 'in_progress', actualDurationSeconds: 15 * 60 });
  const stats = dailyReviewStats(dataWith(timed, untimed, otherDay, open), today);
  ok(stats.focusedSeconds === 25 * 60, 'G: today\u2019s focused time is the sum of tasks completed today (25 min), not of tasks scheduled today');
  ok(stats.focusedSeconds === focusedSeconds(stats.completed), 'G: the total equals the sum of the completed list it displays');
  ok(dailyReviewStats(dataWith(timed, untimed, otherDay, open), yesterday).focusedSeconds === 60 * 60, 'G: yesterday keeps only the focus spent yesterday');
}

/* ------------------------------------------------------------------ */
/* Local calendar day, never a UTC date string                         */
/* ------------------------------------------------------------------ */
{
  const lateNight = task({ title: 'Late night', status: 'completed', completedAt: at(today, '23:30') });
  const earlyMorning = task({ title: 'Early morning', status: 'completed', completedAt: at(today, '00:30') });
  const stats = dailyReviewStats(dataWith(lateNight, earlyMorning), today);
  ok(has(stats.completed, lateNight.id), 'TZ: work finished at 23:30 local belongs to the local day even when UTC has already rolled over');
  ok(has(stats.completed, earlyMorning.id), 'TZ: work finished at 00:30 local belongs to the local day even when UTC is still on the previous day');
  ok(stats.completed.length === 2, 'TZ: both end-of-day extremes stay on the same local calendar day');
}

/* ------------------------------------------------------------------ */
/* Unchanged: incomplete, cancelled, postponed, archived               */
/* ------------------------------------------------------------------ */
{
  const openToday = task({ title: 'Planned today, still open', scheduledDate: today, status: 'today' });
  const openTomorrow = task({ title: 'Planned tomorrow', scheduledDate: tomorrow, status: 'planned' });
  const doneElsewhere = task({ title: 'Scheduled today, done tomorrow', scheduledDate: today, status: 'completed', completedAt: at(tomorrow, '11:00') });
  const cancelledToday = task({ title: 'Cancelled today', scheduledDate: today, status: 'cancelled' });
  const cancelledYesterday = task({ title: 'Cancelled yesterday', scheduledDate: yesterday, status: 'cancelled' });
  const archived = task({ title: 'Archived, done today', scheduledDate: today, status: 'completed', completedAt: at(today, '12:00'), archived: true });

  const stats = dailyReviewStats(
    { ...dataWith(openToday, openTomorrow, doneElsewhere, cancelledToday, cancelledYesterday, archived),
      taskHistory: [
        { id: 'h1', taskId: openToday.id, type: 'postponed', at: at(today, '09:30') },
        { id: 'h2', taskId: openToday.id, type: 'postponed', at: at(yesterday, '09:30') },
        { id: 'h3', taskId: openToday.id, type: 'created', at: at(today, '08:00') },
      ] },
    today,
  );
  ok(ids(stats.incomplete).join(',') === openToday.id, 'Unchanged: "Not completed" still lists only open tasks planned for the day');
  ok(!has(stats.incomplete, doneElsewhere.id), 'Unchanged: a task already finished is not listed as incomplete on its planned day');
  ok(ids(stats.cancelled).join(',') === cancelledToday.id, 'Unchanged: cancelled tasks are still grouped by their scheduled day');
  ok(stats.postponedCount === 1, 'Unchanged: postponements are still counted from task history on that calendar day');
  ok(stats.completed.length === 0, 'Unchanged: archived tasks never count as completed work, and nothing else here was finished today');
}

/* ------------------------------------------------------------------ */
/* H. Weekly and Monthly Review keep their existing behaviour          */
/* ------------------------------------------------------------------ */
{
  // Weekly keys off the scheduled week (falling back to completedAt only when
  // a task has no scheduledDate) — that behaviour is deliberately untouched.
  const scheduledThisWeek = task({ title: 'Scheduled this week, finished next month', scheduledDate: today, status: 'completed', completedAt: at(addDays(today, 40), '10:00') });
  const scheduledNextMonth = task({ title: 'Scheduled next month, finished today', scheduledDate: addDays(today, 40), status: 'completed', completedAt: at(today, '10:00') });
  const weekData = dataWith(scheduledThisWeek, scheduledNextMonth);
  const week = weeklyReviewStats(weekData, addDays(today, -3), addDays(today, 3));
  ok(ids(week.completed).join(',') === scheduledThisWeek.id, 'H: weekly review still classifies completed work by its scheduled week');
  ok(weeklyReviewStats(weekData, addDays(today, 38), addDays(today, 44)).completed.length === 1,
     'H: weekly review still reports the same task in the week it was planned for');

  // Monthly keys off the month of completedAt — also untouched.
  const doneThisMonth = task({ title: 'Finished this month', status: 'completed', completedAt: at(today, '10:00'), actualDurationSeconds: 10 * 60 });
  const doneNextMonth = task({ title: 'Scheduled today, finished next month', scheduledDate: today, status: 'completed', completedAt: at(addDays(today, 40), '10:00') });
  const month = monthlyReviewStats(dataWith(doneThisMonth, doneNextMonth), today.slice(0, 7));
  ok(ids(month.completed).join(',') === doneThisMonth.id, 'H: monthly review still classifies completed work by the month of completedAt');
  ok(month.focusedSeconds === 10 * 60, 'H: monthly focused time is unchanged');
}

if (failures > 0) {
  console.error(`\n${failures} review-stats check(s) failed.`);
  process.exit(1);
}
console.log('\nReview date semantics verified.');
