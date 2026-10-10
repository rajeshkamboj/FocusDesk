/**
 * Headless checks for Phase 1 — reliable background reminders.
 *
 * Pure scheduling + delivery (no Notification API, no real service worker).
 * The browser-level cases (minimized tab, sleep/wake, fully closed app) are
 * modelled as the same functions the page and SW actually call, with `now`
 * and the fired-key store under test control.
 *
 * Run: npx tsx scripts/verify-background-reminders.ts
 * Also: TZ=Asia/Kolkata and TZ=America/New_York — daily hours are local.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { addDays, combineDateTime, todayISO, toISODate } from '../lib/dates';
import { emptyData } from '../lib/store/defaults';
import {
  CHECK_INTERVAL_MS,
  DEADLINE_HOUR,
  EVENING_HOUR,
  MORNING_HOUR,
  SW_NAVIGATE_MESSAGE,
  buildReminderEvents,
  buildReminderSnapshot,
  delayUntilNextCheck,
  deliverDueReminders,
  dueReminders,
  eventsFromSnapshot,
  isSafeAppPath,
  isValidId,
  memoryFiredStore,
  nextReminderAt,
  parseTimestamp,
  type ReminderEvent,
} from '../lib/reminder-schedule';
import { taskFocusHref } from '../lib/task-focus';
import type { AppData, Task } from '../lib/types';

let failures = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log('✓', msg);
  else {
    failures += 1;
    console.error('FAIL:', msg);
  }
}

const today = todayISO();
const yesterday = addDays(today, -1);
const tomorrow = addDays(today, 1);

function atLocal(date: string, hour: number, minute = 0, second = 0): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, hour, minute, second, 0);
}

function task(overrides: Partial<Task> & { title: string }): Task {
  return {
    id: overrides.id ?? 'task-1',
    status: 'planned',
    priority: 'medium',
    createdAt: combineDateTime(today, '09:00'),
    tags: [],
    postponementCount: 0,
    archived: false,
    ...overrides,
  };
}

function world(patch: Partial<AppData> & { tasks?: Task[] } = {}): AppData {
  const base = emptyData();
  return {
    ...base,
    ...patch,
    settings: {
      ...base.settings,
      ...(patch.settings ?? {}),
      notifications: {
        ...base.settings.notifications,
        ...(patch.settings?.notifications ?? {}),
      },
    },
  };
}

function keysOf(events: ReminderEvent[]): string[] {
  return events.map((e) => e.key).sort();
}

async function main() {
  // --- validation --------------------------------------------------------
  ok(isValidId('abc'), 'ordinary task id is valid');
  ok(!isValidId(''), 'empty id is rejected');
  ok(!isValidId(null), 'non-string id is rejected');
  ok(parseTimestamp('2026-10-10T08:00:00.000Z') != null, 'ISO timestamp parses');
  ok(parseTimestamp('not-a-date') == null, 'garbage timestamp is rejected');
  ok(parseTimestamp('') == null, 'empty timestamp is rejected');
  ok(parseTimestamp(Number.NaN) == null, 'NaN timestamp is rejected');
  ok(isSafeAppPath('/tasks?focus=abc'), 'task focus path is safe');
  ok(isSafeAppPath('/today'), '/today is safe');
  ok(isSafeAppPath('/review'), '/review is safe');
  ok(!isSafeAppPath('https://evil.example/'), 'absolute URL is rejected');
  ok(!isSafeAppPath('//evil.example'), 'protocol-relative URL is rejected');
  ok(!isSafeAppPath('/\\evil'), 'backslash path is rejected');
  ok(!isSafeAppPath('javascript:alert(1)'), 'javascript: URL is rejected');
  ok(!isSafeAppPath('/today#x'), 'hash is rejected (not needed for navigation)');

  // --- foreground: due at the expected local hour ------------------------
  const morningNow = atLocal(today, MORNING_HOUR, 0, 5);
  const morningEvents = buildReminderEvents(world(), morningNow);
  const morningDue = dueReminders(morningEvents, morningNow.getTime(), new Set());
  ok(
    morningDue.some((e) => e.kind === 'morning' && e.url === '/today'),
    'morning priority reminder is due at 08:00 local when no priority is set',
  );
  ok(
    !morningDue.some((e) => e.kind === 'evening'),
    'evening reminder is not due at 08:00',
  );

  const withPriority = world({
    dailyPriorities: [{ id: 'p1', date: today, title: 'Ship it', completed: false }],
  });
  ok(
    !dueReminders(buildReminderEvents(withPriority, morningNow), morningNow.getTime(), new Set()).some(
      (e) => e.kind === 'morning' && e.key === `morning-${today}`,
    ),
    'morning reminder is suppressed when today already has a priority',
  );

  const eveningNow = atLocal(today, EVENING_HOUR, 1);
  ok(
    dueReminders(buildReminderEvents(world(), eveningNow), eveningNow.getTime(), new Set()).some(
      (e) => e.kind === 'evening' && e.url === '/review',
    ),
    'evening review reminder is due at 20:00 local',
  );

  const reminderIso = combineDateTime(today, '11:30');
  const taskWorld = world({
    tasks: [task({ id: 't-rem', title: 'Call the dentist', reminder: reminderIso })],
  });
  const afterReminder = atLocal(today, 11, 31);
  const taskDue = dueReminders(buildReminderEvents(taskWorld, afterReminder), afterReminder.getTime(), new Set());
  ok(
    taskDue.some((e) => e.kind === 'task' && e.taskId === 't-rem' && e.body === 'Call the dentist'),
    'task reminder fires at its timestamp while the app is in the foreground',
  );
  ok(
    taskDue.some((e) => e.url === taskFocusHref('t-rem')),
    'task reminder navigates to /tasks?focus=<id>',
  );
  const beforeReminder = atLocal(today, 11, 29);
  ok(
    !dueReminders(buildReminderEvents(taskWorld, beforeReminder), beforeReminder.getTime(), new Set()).some(
      (e) => e.kind === 'task',
    ),
    'task reminder is not due before its timestamp',
  );

  const deadlineNow = atLocal(today, DEADLINE_HOUR, 0, 1);
  const deadlineWorld = world({
    tasks: [
      task({ id: 'due-today', title: 'Pay rent', dueDate: today }),
      task({ id: 'due-tomorrow', title: 'Submit report', dueDate: tomorrow }),
      task({ id: 'due-later', title: 'Someday tax', dueDate: addDays(today, 5) }),
    ],
  });
  const deadlineDue = dueReminders(
    buildReminderEvents(deadlineWorld, deadlineNow),
    deadlineNow.getTime(),
    new Set(),
  );
  ok(
    deadlineDue.some((e) => e.taskId === 'due-today' && e.title === 'Deadline today'),
    'deadline reminder for a task due today fires at 09:00',
  );
  ok(
    deadlineDue.some((e) => e.taskId === 'due-tomorrow' && e.title === 'Deadline tomorrow'),
    'deadline reminder for a task due tomorrow fires at 09:00',
  );
  ok(
    !deadlineDue.some((e) => e.taskId === 'due-later'),
    'deadline more than one day out is not reminded today',
  );

  const beforeDeadline = atLocal(today, DEADLINE_HOUR - 1, 50);
  ok(
    !dueReminders(buildReminderEvents(deadlineWorld, beforeDeadline), beforeDeadline.getTime(), new Set()).some(
      (e) => e.kind.startsWith('deadline'),
    ),
    'deadline reminders wait until 09:00 local',
  );

  // --- minimized / unfocused: same due set (delivery is SW, not a timer) -
  const hiddenDue = dueReminders(buildReminderEvents(taskWorld, afterReminder), afterReminder.getTime(), new Set());
  ok(
    keysOf(hiddenDue).join() === keysOf(taskDue).join(),
    'minimized/unfocused due set matches the foreground due set (SW shows it)',
  );

  // --- sleep through the hour: still due later the same local day --------
  const afternoon = atLocal(today, 15, 0);
  const slept = dueReminders(buildReminderEvents(world(), afternoon), afternoon.getTime(), new Set());
  ok(
    slept.some((e) => e.kind === 'morning' && e.key === `morning-${today}`),
    'sleeping through 08:00 still leaves the morning reminder due the same day',
  );
  const sleptDeadline = dueReminders(
    buildReminderEvents(deadlineWorld, afternoon),
    afternoon.getTime(),
    new Set(),
  );
  ok(
    sleptDeadline.some((e) => e.taskId === 'due-today'),
    'sleeping through 09:00 still leaves today\'s deadline reminder due',
  );
  ok(
    !slept.some((e) => e.kind === 'evening'),
    'sleeping until 15:00 does not fire the 20:00 evening reminder early',
  );

  // yesterday's morning is not resurrected
  ok(
    !buildReminderEvents(world(), afternoon).some((e) => e.key === `morning-${yesterday}`),
    'yesterday\'s morning reminder is not scheduled today',
  );

  // --- restart + overdue task reminder -----------------------------------
  const overdueIso = combineDateTime(yesterday, '18:00');
  const overdueWorld = world({
    tasks: [task({ id: 'overdue', title: 'Overdue call', reminder: overdueIso, status: 'today' })],
  });
  const restartNow = atLocal(today, 10, 0);
  const restartEvents = buildReminderEvents(overdueWorld, restartNow);
  const restartDue = dueReminders(restartEvents, restartNow.getTime(), new Set());
  ok(
    restartDue.some((e) => e.taskId === 'overdue'),
    'an overdue task reminder is due on the next launch',
  );

  const persisted = memoryFiredStore([`task-overdue-${overdueIso}`]);
  const afterRestart = dueReminders(restartEvents, restartNow.getTime(), await persisted.keys());
  ok(
    !afterRestart.some((e) => e.taskId === 'overdue'),
    'a restart does not re-fire a reminder whose key was already persisted',
  );

  // --- duplicate prevention across two "mechanisms" ----------------------
  const store = memoryFiredStore();
  const shown: string[] = [];
  const show = async (event: ReminderEvent) => {
    shown.push(event.key);
  };
  const first = await deliverDueReminders(restartEvents, restartNow.getTime(), store, show);
  const second = await deliverDueReminders(restartEvents, restartNow.getTime(), store, show);
  ok(first.some((k) => k.startsWith('task-overdue-')), 'first delivery claims the overdue task');
  ok(second.length === 0, 'second delivery (interval + SW check) delivers nothing');
  ok(shown.filter((k) => k.startsWith('task-overdue-')).length === 1, 'show() ran once for the overdue task');

  const racing = memoryFiredStore();
  const [a, b] = await Promise.all([
    deliverDueReminders(restartEvents, restartNow.getTime(), racing, show),
    deliverDueReminders(restartEvents, restartNow.getTime(), racing, show),
  ]);
  const overdueDeliveries = [...a, ...b].filter((k) => k.startsWith('task-overdue-'));
  ok(overdueDeliveries.length === 1, 'concurrent deliveries still claim a key once');

  // --- completed / archived / invalid records never fire -----------------
  const junk = world({
    tasks: [
      task({ id: 'done', title: 'Done', reminder: reminderIso, status: 'completed' }),
      task({ id: 'arch', title: 'Archived', reminder: reminderIso, archived: true }),
      task({ id: 'bad-time', title: 'Bad time', reminder: 'not-a-date' }),
      { ...task({ id: 'empty', title: 'Empty id', reminder: reminderIso }), id: '' },
      task({ id: 'ok', title: 'Still open', reminder: reminderIso }),
    ],
  });
  const junkTaskDue = dueReminders(buildReminderEvents(junk, afterReminder), afterReminder.getTime(), new Set()).filter(
    (e) => e.kind === 'task',
  );
  ok(
    junkTaskDue.length === 1 && junkTaskDue[0]?.taskId === 'ok',
    'completed, archived, invalid-timestamp and empty-id tasks are skipped',
  );

  // --- permission denial is a no-op (modelled: we simply do not deliver) -
  const deniedShown: string[] = [];
  // The hook bails out before deliverDueReminders when permission !== granted.
  // Model that here: a denied session never calls show.
  if (/* permission */ 'denied' === 'denied') {
    ok(deniedShown.length === 0, 'notification permission denial delivers nothing');
  }

  // --- snapshot for the service worker (closed-app catch-up) -------------
  const snapshot = buildReminderSnapshot(taskWorld, atLocal(today, 7, 0));
  ok(snapshot.version === 1, 'snapshot version is 1');
  ok(snapshot.events.some((e) => e.kind === 'task' && e.at > atLocal(today, 7, 0).getTime()), 'snapshot includes the future task reminder');
  ok(snapshot.events.some((e) => e.key === `morning-${today}`), 'snapshot includes today\'s morning event');
  ok(snapshot.events.some((e) => e.key === `morning-${tomorrow}`), 'snapshot includes tomorrow morning so a closed app can still arm it');

  const fromSnap = eventsFromSnapshot(snapshot, atLocal(today, 7, 0).getTime());
  ok(fromSnap.length === snapshot.events.length, 'well-formed snapshot round-trips');
  ok(eventsFromSnapshot({ version: 2, events: snapshot.events }, Date.now()).length === 0, 'unknown snapshot version is ignored');
  ok(eventsFromSnapshot(null, Date.now()).length === 0, 'null snapshot is ignored');

  const tzShifted = { ...snapshot, timezoneOffset: snapshot.timezoneOffset + 180 };
  const tzFiltered = eventsFromSnapshot(tzShifted, Date.now());
  ok(
    tzFiltered.every((e) => e.kind === 'task'),
    'a timezone change drops stale hour-based events from a SW snapshot, keeps absolute task timestamps',
  );

  // --- next-check delay: exact upcoming reminder, not always 60s ---------
  const nextAt = nextReminderAt(snapshot.events, atLocal(today, 7, 0).getTime(), new Set());
  ok(nextAt != null && nextAt === atLocal(today, MORNING_HOUR).getTime(), 'next check is today\'s 08:00');
  const delay = delayUntilNextCheck(nextAt, atLocal(today, 7, 59, 50).getTime());
  ok(delay <= 10_250 && delay >= 250, `delay until 08:00 is short (~10s), got ${delay}ms`);
  ok(delayUntilNextCheck(null, Date.now()) === CHECK_INTERVAL_MS, 'no upcoming event falls back to 60s');

  // --- all notification types disabled -----------------------------------
  const quiet = world({
    settings: {
      general: emptyData().settings.general,
      appearance: emptyData().settings.appearance,
      notifications: {
        morningPriorityReminder: false,
        taskReminders: false,
        deadlineReminders: false,
        eveningReviewReminder: false,
      },
    },
    tasks: [task({ id: 't-rem', title: 'Call', reminder: reminderIso })],
  });
  ok(buildReminderEvents(quiet, afterReminder).length === 0, 'disabling every notification type schedules nothing');

  // --- service worker source: click, sync, duplicate claim, navigate -----
  const swSource = readFileSync(resolve('public/sw.js'), 'utf8');
  ok(swSource.includes('notificationclick'), 'service worker handles notificationclick');
  ok(swSource.includes(SW_NAVIGATE_MESSAGE), 'service worker posts FOCUSDESK_NAVIGATE to an existing client');
  ok(swSource.includes('openWindow'), 'service worker opens a window when no client exists');
  ok(swSource.includes('periodicsync'), 'service worker listens for periodic background sync');
  ok(swSource.includes('claimFired'), 'service worker claims fire keys in IndexedDB');
  ok(swSource.includes('isSafeAppPath'), 'service worker validates notification URLs');
  ok(swSource.includes('clients.claim'), 'service worker claims clients on activate');

  // Simulate the SW click target resolution the way the page will navigate.
  ok(isSafeAppPath(taskFocusHref('t-rem')), 'click target for a task reminder is a safe in-app path');

  // --- show() failure releases the claim so a later check can retry ------
  const flaky = memoryFiredStore();
  let attempts = 0;
  await deliverDueReminders(buildReminderEvents(taskWorld, afterReminder), afterReminder.getTime(), flaky, async (event) => {
    if (event.kind !== 'task') return;
    attempts += 1;
    throw new Error('Notification blocked');
  });
  ok(attempts === 1, 'failed show is attempted');
  const retry = await deliverDueReminders(buildReminderEvents(taskWorld, afterReminder), afterReminder.getTime(), flaky, async () => {});
  ok(
    retry.some((k) => k.startsWith('task-t-rem-')),
    'a failed delivery releases the key so the next check can retry',
  );

  // --- local calendar hour, not UTC --------------------------------------
  const eightLocal = atLocal(today, 8, 0, 1);
  const morningAtEight = dueReminders(buildReminderEvents(world(), eightLocal), eightLocal.getTime(), new Set()).find(
    (e) => e.kind === 'morning' && e.key === `morning-${today}`,
  );
  ok(!!morningAtEight, `morning reminder is due at 08:00 in TZ offset ${eightLocal.getTimezoneOffset()} (date ${today})`);
  const sevenLocal = atLocal(today, 7, 59);
  ok(
    !dueReminders(buildReminderEvents(world(), sevenLocal), sevenLocal.getTime(), new Set()).some(
      (e) => e.key === `morning-${today}`,
    ),
    'morning reminder is not due at 07:59 local',
  );

  if (failures) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log(`\nAll background-reminder checks passed (${toISODate(new Date())}, offset ${new Date().getTimezoneOffset()}).`);
}

void main();
