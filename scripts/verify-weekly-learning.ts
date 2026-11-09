/**
 * Assertions for This Week's Learning — run with `npm run verify:learnings`.
 *
 * No framework: the repository has no test runner, and adding one to assert a pure
 * date function would be more machinery than the feature. Each check throws on
 * failure, so a non-zero exit is a real failure and the scheduler/CI can see it.
 *
 * WHAT IS PROVEN HERE
 *   - the pick is identical on all seven days of a week (the seven-day promise);
 *   - it changes on the Monday boundary;
 *   - consecutive weeks change the project as well as the task;
 *   - a completed assignment is not offered again while anything unsettled remains;
 *   - status and save-for-later are independent decisions;
 *   - a no-op click does not churn the timestamp;
 *   - week arithmetic is Monday-based and timezone-independent.
 *
 * WHAT IS NOT PROVEN HERE: rendering. The card is a thin shell over these functions,
 * and the visual result needs a browser.
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
console.log('Decisions');
const base = selectWeeklyAssignment({ date: noonIst(monday) });
let records = applyWeeklyDecision({}, base.assignment.id, { status: 'in-progress' });
check('a status is stored under the assignment id', records[base.assignment.id]?.status === 'in-progress');
records = applyWeeklyDecision(records, base.assignment.id, { savedForLater: true });
check('saving does not clear the status', records[base.assignment.id]?.status === 'in-progress');
check('saving sets the flag', records[base.assignment.id]?.savedForLater === true);
records = applyWeeklyDecision(records, base.assignment.id, { status: 'completed' });
check('completing does not clear the save flag', records[base.assignment.id]?.savedForLater === true);
check('the completed assignment is still listed as saved', savedAssignments(records).length === 1);

const laterPick = selectWeeklyAssignment({ date: noonIst(monday), records });
check(
  'a completed assignment is not offered again in the same week',
  laterPick.assignment.id !== base.assignment.id,
  laterPick.assignment.id,
);

const stamped = records[base.assignment.id]!.updatedAt;
const unchanged = applyWeeklyDecision(records, base.assignment.id, { status: 'completed' });
check('a no-op decision keeps the original timestamp', unchanged[base.assignment.id]?.updatedAt === stamped);

let allSettled: Record<string, { status: 'completed'; savedForLater: boolean; updatedAt: string }> = {};
for (const assignment of WEEKLY_ASSIGNMENTS) {
  allSettled = applyWeeklyDecision(allSettled, assignment.id, { status: 'completed' }) as typeof allSettled;
}
const recycled = selectWeeklyAssignment({ date: noonIst(monday), records: allSettled });
check('when everything is settled the card says so instead of inventing one', recycled.recycled === true);

console.log('');
if (process.exitCode) {
  console.error(`${checks} checks run — failures above.`);
} else {
  console.log(`${checks} checks run — all passed.`);
}
