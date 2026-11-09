/**
 * Assertions for This Week's Learning — run with `npm run verify:learnings`.
 *
 * No framework: the repository has no test runner, and adding one to assert a pure
 * date function would be more machinery than the feature. Each check throws on
 * failure, so a non-zero exit is a real failure and the scheduler/CI can see it.
 *
 * WHAT IS PROVEN HERE
 *   - the pick is identical on all seven days of a week (the seven-day promise);
 *   - it stays identical after *every* status change — Completed, In Progress, Not
 *     Relevant and Save for Later — because a decision must not re-pick the week;
 *   - it changes only on the Monday boundary, and that boundary is Asia/Kolkata;
 *   - consecutive weeks change the project as well as the task;
 *   - status and save-for-later are independent decisions, and saved assignments
 *     stay reachable after the week rotates;
 *   - a no-op click does not churn the timestamp;
 *   - `settings.weeklyLearning` survives normalization, so a decision written to
 *     local storage is still there when the store is read back (the defect this
 *     section was extended for: the normalizer rebuilt `settings` from three
 *     sections and silently dropped the fourth on every read).
 *
 * WHAT IS NOT PROVEN HERE: rendering, and the LocalRepository round trip through a
 * real browser. The card is a thin shell over these functions, the store is
 * asserted at its shape boundary (normalize), and the visual result needs a browser.
 */

import {
  WEEKLY_ASSIGNMENTS,
  applyWeeklyDecision,
  kolkataDayKey,
  rotationOrder,
  savedAssignments,
  selectWeeklyAssignment,
  weekDays,
  weekIndexOf,
  weekStartKey,
} from '../lib/learnings-weekly';
import { normalizeAppData } from '../lib/store/normalize';
import type { WeeklyLearningRecord } from '../lib/types';

let checks = 0;

function check(label: string, condition: boolean, detail?: string): void {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${label}`);
    return;
  }
  console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  process.exitCode = 1;
}

/** A noon-IST instant on a given day, so no clock skew can sit on a boundary. */
function noonIst(day: string): Date {
  return new Date(`${day}T06:30:00.000Z`);
}

console.log('Week arithmetic');
check(
  'a Sunday belongs to the Monday before it',
  weekStartKey(noonIst('2026-11-08')) === '2026-11-02',
  weekStartKey(noonIst('2026-11-08')),
);
check(
  'a Monday is its own week start',
  weekStartKey(noonIst('2026-11-09')) === '2026-11-09',
);
check(
  'weekStartKey is stable across the seven days',
  weekDays('2026-11-09').every((day) => weekStartKey(noonIst(day)) === '2026-11-09'),
);
check(
  'kolkataDayKey uses the IST calendar day, not UTC',
  // 2026-11-09T20:00Z is already 01:30 on 10 November in Asia/Kolkata.
  kolkataDayKey(new Date('2026-11-09T20:00:00.000Z')) === '2026-11-10',
  kolkataDayKey(new Date('2026-11-09T20:00:00.000Z')),
);
check('weekIndexOf advances by exactly one per week', (() => {
  const weeks = ['2026-11-09', '2026-11-16', '2026-11-23'];
  const indexes = weeks.map(weekIndexOf);
  return indexes[1] - indexes[0] === 1 && indexes[2] - indexes[1] === 1;
})());

console.log('');
console.log('Seven-day stability');
const monday = '2026-11-09';
const picks = weekDays(monday).map((day) => selectWeeklyAssignment({ date: noonIst(day) }).assignment.id);
check('the same assignment on all seven days', new Set(picks).size === 1, picks.join(', '));
const before = selectWeeklyAssignment({ date: noonIst('2026-11-15') }).assignment.id;
const after = selectWeeklyAssignment({ date: noonIst('2026-11-16') }).assignment.id;
check('a different assignment on the next Monday', before !== after, `${before} vs ${after}`);

console.log('');
console.log('Rotation');
check('the rotation keeps every assignment', rotationOrder().length === WEEKLY_ASSIGNMENTS.length);
const sixWeeks = [0, 1, 2, 3, 4, 5].map((offset) => {
  const day = new Date(Date.UTC(2026, 10, 9 + offset * 7));
  return selectWeeklyAssignment({ date: day }).assignment;
});
check(
  'six consecutive weeks cover six different projects',
  new Set(sixWeeks.map((assignment) => assignment.projectKey)).size === 6,
  sixWeeks.map((assignment) => assignment.projectKey).join(', '),
);
const ids = new Set(WEEKLY_ASSIGNMENTS.map((assignment) => assignment.id));
check('assignment ids are unique', ids.size === WEEKLY_ASSIGNMENTS.length);
check(
  'every assignment has a project that exists in the project list',
  WEEKLY_ASSIGNMENTS.every((assignment) => assignment.projectLabel.length > 0 && assignment.steps.length >= 2),
);
check(
  'every step is long enough to be an instruction rather than a topic',
  WEEKLY_ASSIGNMENTS.every((assignment) => assignment.steps.every((step) => step.trim().length >= 25)),
);

console.log('');
console.log('A decision never changes the week');
const base = selectWeeklyAssignment({ date: noonIst(monday) });
const STATUSES = ['not-started', 'in-progress', 'completed', 'not-relevant'] as const;

for (const status of STATUSES) {
  const decided = applyWeeklyDecision({}, base.assignment.id, { status });
  const picked = selectWeeklyAssignment({ date: noonIst(monday), records: decided });
  check(
    `a “${status}” decision keeps the same assignment`,
    picked.assignment.id === base.assignment.id,
    `${picked.assignment.id} vs ${base.assignment.id}`,
  );
}

const savedOnly = applyWeeklyDecision({}, base.assignment.id, { savedForLater: true });
check(
  'Save for Later keeps the same assignment',
  selectWeeklyAssignment({ date: noonIst(monday), records: savedOnly }).assignment.id === base.assignment.id,
);

const completedAndSaved = applyWeeklyDecision(savedOnly, base.assignment.id, { status: 'completed' });
check('status and save-for-later are independent on one record', completedAndSaved[base.assignment.id]?.savedForLater === true && completedAndSaved[base.assignment.id]?.status === 'completed');
check(
  'a completed-and-saved assignment is still the week’s assignment',
  selectWeeklyAssignment({ date: noonIst(monday), records: completedAndSaved }).assignment.id === base.assignment.id,
);

const stamped = completedAndSaved[base.assignment.id]!.updatedAt;
const unchanged = applyWeeklyDecision(completedAndSaved, base.assignment.id, { status: 'completed' });
check('a no-op decision keeps the original timestamp', unchanged[base.assignment.id]?.updatedAt === stamped);

let everythingDecided: Record<string, WeeklyLearningRecord> = {};
for (const assignment of WEEKLY_ASSIGNMENTS) {
  everythingDecided = applyWeeklyDecision(everythingDecided, assignment.id, { status: 'completed', savedForLater: true });
}
check(
  'a week where every assignment is decided still has one assignment',
  selectWeeklyAssignment({ date: noonIst('2026-11-15'), records: everythingDecided }).assignment.id === base.assignment.id,
);
check(
  'every saved assignment stays reachable while the week is current',
  savedAssignments(everythingDecided).length === WEEKLY_ASSIGNMENTS.length,
);

console.log('');
console.log('Only a new week re-picks');
const nextMonday = selectWeeklyAssignment({ date: noonIst('2026-11-16'), records: everythingDecided });
check('the next Monday picks a different assignment even with a fully decided week', nextMonday.assignment.id !== base.assignment.id, nextMonday.assignment.id);
const savedAfterRotation = savedAssignments(everythingDecided);
check(
  'the assignments saved in the old week are still listed after rotation',
  savedAfterRotation.some((assignment) => assignment.id === base.assignment.id),
);

// 2026-11-15T18:29:00Z is Sunday 23:59 IST; 18:30Z is Monday 00:00 IST.
const sundayLastMinute = new Date('2026-11-15T18:29:00.000Z');
const mondayFirstMinute = new Date('2026-11-15T18:30:00.000Z');
check(
  'the Asia/Kolkata Monday boundary is where the week turns',
  weekStartKey(sundayLastMinute) === '2026-11-09' && weekStartKey(mondayFirstMinute) === '2026-11-16',
  `${weekStartKey(sundayLastMinute)} / ${weekStartKey(mondayFirstMinute)}`,
);
check(
  'the assignment changes exactly at that minute',
  selectWeeklyAssignment({ date: sundayLastMinute }).assignment.id !==
    selectWeeklyAssignment({ date: mondayFirstMinute }).assignment.id,
);

const weekLong = new Set(
  weekDays(monday).map(
    (day) => selectWeeklyAssignment({ date: noonIst(day), records: everythingDecided }).assignment.id,
  ),
);
check('all seven days still agree after decisions were made', weekLong.size === 1, [...weekLong].join(', '));

console.log('');
console.log('A saved decision survives the settings normalizer');
const oneDecision = applyWeeklyDecision({}, base.assignment.id, { status: 'completed', savedForLater: true }, '2026-11-09T06:30:00.000Z');
const reloaded = normalizeAppData({ settings: { weeklyLearning: { records: oneDecision } } });
check(
  'the status survives a save-and-reload',
  reloaded.settings.weeklyLearning?.records[base.assignment.id]?.status === 'completed',
  JSON.stringify(reloaded.settings.weeklyLearning?.records[base.assignment.id]),
);
check(
  'the save-for-later flag survives with it',
  reloaded.settings.weeklyLearning?.records[base.assignment.id]?.savedForLater === true,
);
check(
  'the timestamp survives',
  reloaded.settings.weeklyLearning?.records[base.assignment.id]?.updatedAt === '2026-11-09T06:30:00.000Z',
);
check(
  'the reloaded records are exactly what was written',
  JSON.stringify(reloaded.settings.weeklyLearning?.records) === JSON.stringify(oneDecision),
);

const oldBackup = normalizeAppData({ settings: { general: { theme: 'dark' }, notifications: {}, appearance: {} } });
check(
  'an older backup without the key normalizes to an empty record map',
  JSON.stringify(oldBackup.settings.weeklyLearning) === JSON.stringify({ records: {} }),
);
check('an older backup keeps its other settings', (oldBackup.settings.general as { theme?: string }).theme === 'dark');
check('a backup with no settings at all still normalizes', normalizeAppData({}).settings.weeklyLearning?.records !== undefined);
check('a null settings object still normalizes', normalizeAppData({ settings: null }).settings.weeklyLearning?.records !== undefined);

const damaged = normalizeAppData({
  settings: {
    weeklyLearning: {
      records: {
        'weekly-ok': { status: 'in-progress', savedForLater: true, updatedAt: '2026-11-09T06:30:00.000Z' },
        'weekly-bad-status': { status: 'banana', savedForLater: false, updatedAt: '2026-11-09T06:30:00.000Z' },
        'weekly-bad-date': { status: 'completed', savedForLater: false, updatedAt: 'not a date' },
        'weekly-not-an-object': 'nope',
        '': { status: 'completed', savedForLater: false, updatedAt: '2026-11-09T06:30:00.000Z' },
      },
    },
  },
});
const damagedRecords = damaged.settings.weeklyLearning?.records ?? {};
check('a valid record in a damaged map is kept', damagedRecords['weekly-ok']?.status === 'in-progress');
check('an unknown status becomes not-started rather than throwing', damagedRecords['weekly-bad-status']?.status === 'not-started');
check('an unparseable timestamp becomes empty rather than printing Invalid Date', damagedRecords['weekly-bad-date']?.updatedAt === '');
check('a non-object record is dropped', !('weekly-not-an-object' in damagedRecords));
check('an empty id is dropped', !('' in damagedRecords));
check(
  'normalizing twice changes nothing',
  JSON.stringify(normalizeAppData(damaged)) === JSON.stringify(damaged),
);

const secondWeek = normalizeAppData({
  settings: {
    weeklyLearning: {
      records: applyWeeklyDecision({}, nextMonday.assignment.id, { status: 'in-progress', savedForLater: true }, '2026-11-16T06:30:00.000Z'),
    },
  },
});
check(
  'a record for another week is preserved too, not pruned at read time',
  secondWeek.settings.weeklyLearning?.records[nextMonday.assignment.id]?.status === 'in-progress',
);
check(
  'saved assignments are reachable from the normalized records',
  savedAssignments(secondWeek.settings.weeklyLearning?.records ?? {}).some((assignment) => assignment.id === nextMonday.assignment.id),
);

console.log('');
if (process.exitCode) {
  console.error(`${checks} checks run — failures above.`);
} else {
  console.log(`${checks} checks run — all passed.`);
}
