/**
 * Headless check of daily and monthly focused time.
 *
 * Focused time answers one question: how long did FocusDesk's task timers
 * actually run on a given day? It must never be a task's lifetime total
 * (`actualDurationSeconds`) reported again on every day the task was touched,
 * and it must never count a second twice.
 *
 * The month summary answers the complementary question: how much timer time
 * was completed in a month, and on how many distinct local dates? It sums the
 * completed tasks' own `actualDurationSeconds` (so Start/Pause/Resume
 * accumulation and pre-session data both count) and counts distinct local
 * `completedAt` dates — never `scheduledDate`.
 *
 * Part A exercises the pure attribution helpers directly (midnight crossing,
 * DST, rounding). Part B drives the real DataProvider + LocalRepository
 * through the full lifecycle — start, pause, resume, close/reopen, finish,
 * across several days and several tasks — and asserts what the Calendar
 * would show.
 *
 * Run: npm i --no-save jsdom tsx && npx tsx scripts/verify-focused-time.tsx
 * Worth running in more than one timezone, since days are LOCAL days:
 *   TZ=Asia/Kolkata     npx tsx scripts/verify-focused-time.tsx
 *   TZ=America/New_York npx tsx scripts/verify-focused-time.tsx
 *   TZ=Pacific/Chatham  npx tsx scripts/verify-focused-time.tsx
 */
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = dom.window; g.document = dom.window.document; g.localStorage = dom.window.localStorage;
g.IS_REACT_ACT_ENVIRONMENT = true;

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log('✓', msg);
  else { failures += 1; console.error('FAIL:', msg); }
};

async function main() {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { act } = React;
  const { AuthProvider } = await import('../components/auth/auth-provider');
  const { DataProvider, useData } = await import('../components/data/data-provider');
  const { UIProvider } = await import('../components/ui/ui-provider');
  const { CalendarScreen } = await import('../components/calendar/calendar-screen');
  const { addDays, combineDateTime, todayISO, toISODate, monthKey, formatFocusedTime } = await import('../lib/dates');
  const {
    focusedSecondsByDay,
    focusedTimeInMonth,
    focusedTimeOnDate,
    sessionSecondsByDay,
  } = await import('../lib/selectors');
  const { isTimerPaused, isTimerRunning } = await import('../lib/timer');
  type Task = import('../lib/types').Task;
  type TimerSession = import('../lib/types').TimerSession;

  const today = todayISO();
  const yesterday = addDays(today, -1);
  const at = (date: string, time: string) => combineDateTime(date, time);

  /* ================================================================== */
  /* Part A — pure attribution                                          */
  /* ================================================================== */
  console.log('\n— Attribution (pure) —');

  const session = (startedAt: string, endedAt: string, durationSeconds: number): TimerSession => ({
    id: `s-${startedAt}-${endedAt}`, taskId: 't', startedAt, endedAt, durationSeconds,
  });

  // 1. A run entirely inside one day.
  {
    const map = sessionSecondsByDay(session(at(today, '09:00'), at(today, '09:45'), 45 * 60));
    ok(map.size === 1 && map.get(today) === 45 * 60, 'Case 1: a run inside one day lands on that day only');
  }

  // 2. A run across midnight is divided between the two days it touched.
  {
    const start = at(yesterday, '23:40');
    const end = at(today, '00:20');
    const duration = Math.round((Date.parse(end) - Date.parse(start)) / 1000);
    const map = sessionSecondsByDay(session(start, end, duration));
    ok(map.size === 2 && map.get(yesterday) === 20 * 60 && map.get(today) === 20 * 60,
       'Case 2: a run across midnight splits 20m / 20m between the two local days');
    ok((map.get(yesterday) ?? 0) + (map.get(today) ?? 0) === duration,
       'Case 2: the split sums back to exactly the recorded duration');
  }

  // A run spanning several whole days keeps every second, and only the days
  // it actually touched.
  {
    const start = at(addDays(today, -2), '22:00');
    const end = at(today, '02:00');
    const duration = Math.round((Date.parse(end) - Date.parse(start)) / 1000);
    const map = sessionSecondsByDay(session(start, end, duration));
    const total = [...map.values()].reduce((a, b) => a + b, 0);
    ok(total === duration && map.size === 3, 'A multi-day run is spread over exactly the days it touched, losing nothing');
  }

  // Degenerate input must never invent or lose time.
  {
    ok(sessionSecondsByDay(session(at(today, '10:00'), at(today, '10:00'), 0)).size === 0,
       'A zero-length run contributes nothing');
    const broken = sessionSecondsByDay(session(at(today, '10:00'), 'not-a-date', 600));
    ok(broken.get(today) === 600, 'A damaged ended_at falls back to startedAt + duration');
  }

  // 9/10. Several runs, several tasks, one day — added, never overwritten.
  {
    const sessions: TimerSession[] = [
      { id: 'a1', taskId: 'A', startedAt: at(today, '09:00'), endedAt: at(today, '09:30'), durationSeconds: 30 * 60 },
      { id: 'a2', taskId: 'A', startedAt: at(today, '11:00'), endedAt: at(today, '11:15'), durationSeconds: 15 * 60 },
      { id: 'b1', taskId: 'B', startedAt: at(today, '14:00'), endedAt: at(today, '15:00'), durationSeconds: 60 * 60 },
    ];
    const byDay = focusedSecondsByDay(sessions);
    ok(byDay.get(today) === 105 * 60, 'Cases 9 & 10: several runs and several tasks on one day are summed');
  }

  /* ================================================================== */
  /* Part A2 — month summary (pure)                                     */
  /* ================================================================== */
  console.log('\n— Month summary (pure) —');

  const monthTask = (id: string, completedLocal: string, seconds?: number, extra: Partial<Task> = {}): Task => ({
    id,
    title: id,
    status: 'completed',
    priority: 'medium',
    createdAt: completedLocal,
    tags: [],
    postponementCount: 0,
    archived: false,
    completedAt: completedLocal,
    actualDurationSeconds: seconds,
    ...extra,
  });
  const october = '2026-10';

  // A completed task with recorded time contributes its accumulated total —
  // with no timer_sessions rows at all (data recorded before that table
  // existed must still count).
  {
    const m = focusedTimeInMonth({ tasks: [monthTask('a', at('2026-10-02', '14:00'), 1800)] }, october);
    ok(m.seconds === 1800 && m.daysWorked === 1,
       'A completed task with actualDurationSeconds contributes its focused time, with no session rows');
  }

  // Five completions on one date are ONE worked day; different dates count
  // separately.
  {
    const m = focusedTimeInMonth({
      tasks: [
        monthTask('a', at('2026-10-02', '10:00'), 1800),
        monthTask('b', at('2026-10-04', '09:00'), 600),
        monthTask('c', at('2026-10-04', '15:00'), 300),
        monthTask('d', at('2026-10-04', '18:00'), 120),
      ],
    }, october);
    ok(m.seconds === 2820 && m.daysWorked === 2,
       'Several completions on one date count as one day worked; other dates count separately');
  }

  // Month boundary: neighbouring months never leak in.
  {
    const data = {
      tasks: [
        monthTask('a', at('2026-10-02', '10:00'), 1800),
        monthTask('sep', at('2026-09-28', '10:00'), 7200),
        monthTask('nov', at('2026-11-03', '10:00'), 3600),
      ],
    };
    const oct = focusedTimeInMonth(data, october);
    ok(oct.seconds === 1800 && oct.daysWorked === 1, 'October counts only October completions');
    ok(focusedTimeInMonth(data, '2026-09').seconds === 7200, 'September activity stays in September');
    ok(focusedTimeInMonth(data, '2026-11').seconds === 3600, 'November activity stays in November');
  }

  // completedAt decides the month — never scheduledDate.
  {
    const m = focusedTimeInMonth(
      { tasks: [monthTask('a', at('2026-10-04', '10:00'), 900, { scheduledDate: '2026-09-30' })] },
      october,
    );
    ok(m.seconds === 900 && m.daysWorked === 1,
       'A task scheduled in September but completed in October belongs to October (completedAt, not scheduledDate)');
    ok(focusedTimeInMonth({ tasks: [monthTask('a', at('2026-10-04', '10:00'), 900, { scheduledDate: '2026-09-30' })] }, '2026-09').seconds === 0,
       '…and September does not count it');
  }

  // Local calendar dates, never UTC slices of completedAt: a completion at
  // 23:30 local on Oct 31 is an October day even where its UTC instant is
  // Nov 1; a completion at 00:30 local on Nov 1 is November even where its
  // UTC instant is still Oct 31.
  {
    const data = {
      tasks: [
        monthTask('late', at('2026-10-31', '23:30'), 600),
        monthTask('early', at('2026-11-01', '00:30'), 300),
      ],
    };
    const oct = focusedTimeInMonth(data, october);
    ok(oct.seconds === 600 && oct.daysWorked === 1,
       'A completion at 23:30 local on Oct 31 belongs to October (local date, not UTC)');
    ok(focusedTimeInMonth(data, '2026-11').seconds === 300 && focusedTimeInMonth(data, '2026-11').daysWorked === 1,
       'A completion at 00:30 local on Nov 1 belongs to November (local date, not UTC)');
  }

  // Only completed, non-archived tasks count.
  {
    const m = focusedTimeInMonth({
      tasks: [
        monthTask('open', at('2026-10-02', '10:00'), 1800, { status: 'in_progress' }),
        monthTask('archived', at('2026-10-02', '11:00'), 600, { archived: true }),
        monthTask('broken', 'not-a-timestamp', 999),
      ],
    }, october);
    ok(m.seconds === 0 && m.daysWorked === 0,
       'Open, archived and damaged records contribute nothing');
  }

  // A completion without the timer still marks its day as worked — with 0
  // focused seconds, and never its planned/estimated duration.
  {
    const m = focusedTimeInMonth(
      { tasks: [monthTask('notimed', at('2026-10-02', '10:00'), undefined, { estimatedDuration: 45 })] },
      october,
    );
    ok(m.seconds === 0 && m.daysWorked === 1,
       'A completion without the timer counts as a worked day with 0 focused seconds — never the estimate');
  }

  /* ================================================================== */
  /* Part B — the real timer lifecycle                                  */
  /* ================================================================== */
  console.log('\n— Lifecycle (DataProvider + LocalRepository) —');

  let ctx: ReturnType<typeof useData> | null = null;
  const Probe = () => { ctx = useData(); return null; };
  const c = () => ctx!;
  const get = (id: string) => c().data.tasks.find((t) => t.id === id)!;
  const run = (fn: () => Promise<unknown>) => act(async () => { await fn(); });
  const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

  let root: ReturnType<typeof createRoot> | null = null;
  let host: HTMLElement | null = null;
  const openApp = async (withCalendar = false) => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    host = el;
    const r = createRoot(el);
    root = r;
    await act(async () => {
      r.render(React.createElement(AuthProvider, null,
        React.createElement(UIProvider, null,
          React.createElement(DataProvider, null,
            React.createElement(React.Fragment, null,
              React.createElement(Probe),
              withCalendar ? React.createElement(CalendarScreen) : null)))));
    });
    await wait(20);
  };
  /** Closing the app: pagehide pauses running sessions, then teardown. */
  const closeApp = async () => {
    if (!root) return;
    const r = root;
    root = null;
    await act(async () => { dom.window.dispatchEvent(new dom.window.Event('pagehide')); });
    await wait(10);
    await act(async () => { r.unmount(); });
    host?.remove();
    host = null;
    ctx = null;
  };

  const dayTotal = (date: string) => focusedTimeOnDate(c().data, date, Date.now()).seconds;
  const sessionsFor = (taskId: string) => c().data.timerSessions.filter((s) => s.taskId === taskId);
  const sessionTotal = (taskId: string) => sessionsFor(taskId).reduce((sum, s) => sum + s.durationSeconds, 0);

  await openApp();
  ok(c().ready && c().data.timerSessions.length === 0, 'App starts with no recorded runs');

  /* --- 3 & 4: pause, resume, and paused time never counted ---------- */
  let taskA!: Task;
  await run(async () => { taskA = await c().actions.addTask({ title: 'Task A', scheduledDate: today, status: 'today' }); });

  await run(() => c().actions.startTask(taskA.id));
  ok(isTimerRunning(get(taskA.id)), 'Timer started');
  await wait(1100);
  await run(() => c().actions.pauseTask(taskA.id));

  const afterFirstPause = get(taskA.id).actualDurationSeconds ?? 0;
  ok(isTimerPaused(get(taskA.id)) && afterFirstPause >= 1, `Case 3: pause records the run (${afterFirstPause}s)`);
  ok(sessionsFor(taskA.id).length === 1 && sessionTotal(taskA.id) === afterFirstPause,
     'Case 3: exactly one run recorded, equal to the task total');
  ok(dayTotal(today) === afterFirstPause, "Case 3: today's focused time equals the recorded run");

  // Paused time must not be counted: wait while paused, nothing may grow.
  await wait(1200);
  ok(dayTotal(today) === afterFirstPause && sessionTotal(taskA.id) === afterFirstPause,
     'Paused time is not counted — neither by the task nor by the day');

  await run(() => c().actions.resumeTask(taskA.id));
  await wait(1100);
  await run(() => c().actions.pauseTask(taskA.id));
  const afterResume = get(taskA.id).actualDurationSeconds ?? 0;
  ok(afterResume > afterFirstPause, `Case 3: resume adds to the recorded time (${afterFirstPause}s → ${afterResume}s)`);
  ok(sessionsFor(taskA.id).length === 2, 'Case 9: resume opened a second run rather than extending the first');
  ok(sessionTotal(taskA.id) === afterResume && dayTotal(today) === afterResume,
     'Case 9: the runs sum to the task total exactly once — no double counting');

  /* --- 7 & 8: close and reopen the app during a session ------------- */
  await run(() => c().actions.startTask(taskA.id));
  await wait(1100);
  await closeApp();
  await openApp();
  const recovered = get(taskA.id);
  ok(isTimerPaused(recovered), 'Case 7: reopening recovers the interrupted session as paused');
  ok((recovered.actualDurationSeconds ?? 0) >= afterResume, 'Case 7: no recorded time is lost by closing the app');
  ok(sessionTotal(taskA.id) === (recovered.actualDurationSeconds ?? 0),
     'Case 8: the recovered runs still sum to exactly the task total');
  const afterReopen = recovered.actualDurationSeconds ?? 0;
  ok(dayTotal(today) === afterReopen, "Case 7: today's focused time survives close/reopen");

  // The app being closed is not working time.
  await wait(1200);
  ok(dayTotal(today) === afterReopen, 'Case 8: a recovered session never keeps accumulating after recovery');

  /* --- 5 & 6: completed vs still-open tasks ------------------------- */
  await run(() => c().actions.startTask(taskA.id));
  await wait(1100);
  await run(() => c().actions.finishTask(taskA.id));
  const finished = get(taskA.id);
  ok(finished.status === 'completed' && (finished.actualDurationSeconds ?? 0) > afterReopen,
     'Case 5: finishing after several sessions keeps the whole recorded time');
  ok(sessionTotal(taskA.id) === (finished.actualDurationSeconds ?? 0),
     'Case 5: a completed task retains its runs, still summing to its total');
  ok(dayTotal(today) === (finished.actualDurationSeconds ?? 0),
     "Case 5: the completed task's time stays on the day it happened");

  let taskOpen!: Task;
  await run(async () => { taskOpen = await c().actions.addTask({ title: 'Still open', scheduledDate: today, status: 'today' }); });
  await run(() => c().actions.startTask(taskOpen.id));
  await wait(1100);
  await run(() => c().actions.pauseTask(taskOpen.id));
  const openSeconds = get(taskOpen.id).actualDurationSeconds ?? 0;
  ok(get(taskOpen.id).status === 'in_progress' && openSeconds >= 1,
     'Case 6: an incomplete task still contributes its focused time');
  ok(dayTotal(today) === (finished.actualDurationSeconds ?? 0) + openSeconds,
     'Case 10: two tasks on the same day are added together');

  /* --- 4: the same task worked on another day ----------------------- */
  // Backdate one run by a day: the same task, a different day. This is the
  // case `actualDurationSeconds` alone can never express.
  const firstRun = sessionsFor(taskA.id)[0];
  await run(async () => {
    const repoData = await c().actions.exportData();
    const moved = repoData.timerSessions.map((s) =>
      s.id === firstRun.id
        ? { ...s, startedAt: at(yesterday, '10:00'), endedAt: at(yesterday, '10:00:00').slice(0, 19) }
        : s,
    );
    // Re-anchor endedAt to startedAt + duration so the record stays coherent.
    const fixed = moved.map((s) =>
      s.id === firstRun.id
        ? { ...s, endedAt: new Date(Date.parse(at(yesterday, '10:00')) + s.durationSeconds * 1000).toISOString() }
        : s,
    );
    await c().actions.importData({ ...repoData, timerSessions: fixed });
  });

  const movedSeconds = firstRun.durationSeconds;
  const taskTotal = get(taskA.id).actualDurationSeconds ?? 0;
  ok(dayTotal(yesterday) === movedSeconds,
     `Case 4: yesterday shows only the run that happened yesterday (${movedSeconds}s)`);
  ok(dayTotal(today) === taskTotal - movedSeconds + openSeconds,
     "Case 4: today shows only today's runs — the task total is not repeated on both days");
  ok(dayTotal(yesterday) + dayTotal(today) === taskTotal + openSeconds,
     'Case 4: the two days add up to the recorded total exactly once');
  ok(dayTotal(yesterday) !== taskTotal,
     'The day total is NOT the task lifetime total (the bug this feature exists to avoid)');

  /* --- Breakdown and month summary ---------------------------------- */
  const breakdown = focusedTimeOnDate(c().data, today, Date.now());
  ok(breakdown.byTask.length === 2 && breakdown.byTask.every((e) => e.seconds > 0),
     'The day breakdown lists one line per task that was timed that day');
  ok(breakdown.byTask.reduce((sum, e) => sum + e.seconds, 0) === breakdown.seconds,
     'The breakdown adds up to the day headline');
  ok(breakdown.byTask[0].seconds >= breakdown.byTask[1].seconds, 'The breakdown is ordered by time spent');

  const month = focusedTimeInMonth(c().data, monthKey(today));
  ok(month.daysWorked === 1,
     'Month summary counts one day worked — the day the task was completed (completedAt), not every day it ran');
  ok(month.seconds === taskTotal,
     'Month summary sums the completed task’s accumulated Start/Pause/Resume total exactly once');
  ok(formatFocusedTime(4 * 3600 + 37 * 60) === '4h 37m' && formatFocusedTime(48 * 60) === '48 min',
     'Focused time reuses the existing duration formatting');

  /* --- Live session: running time is attributed, not double counted -- */
  await run(() => c().actions.startTask(taskOpen.id));
  await wait(1100);
  const liveDay = dayTotal(today);
  const liveTaskSeconds = focusedTimeOnDate(c().data, today, Date.now()).byTask
    .find((e) => e.task.id === taskOpen.id)?.seconds ?? 0;
  ok(liveDay > breakdown.seconds, 'A running timer is reflected in the day total while it runs');
  ok(liveTaskSeconds >= openSeconds + 1, 'The running task shows its live time');
  await run(() => c().actions.pauseTask(taskOpen.id));
  const settled = get(taskOpen.id).actualDurationSeconds ?? 0;
  ok(sessionTotal(taskOpen.id) === settled,
     'After the pause, the recorded runs match the task total — the live estimate was not written twice');
  ok(Math.abs(dayTotal(today) - liveDay) <= 1, 'Pausing does not jump the day total (no double counting)');

  /* --- Existing semantics must be untouched ------------------------- */
  let untimed!: Task;
  await run(async () => { untimed = await c().actions.addTask({ title: 'Never timed', estimatedDuration: 30, scheduledDate: today, status: 'today' }); });
  await run(() => c().actions.completeTask(untimed.id));
  ok(get(untimed.id).actualDurationSeconds === undefined && get(untimed.id).estimatedDuration === 30
     && get(untimed.id).completedAt !== undefined,
     'estimated duration / actual duration / completed_at keep their existing behaviour');
  ok(sessionsFor(untimed.id).length === 0, 'A task completed without the timer records no run');

  /* --- Deleting a task takes its runs with it ----------------------- */
  const beforeDelete = c().data.timerSessions.length;
  const doomedRuns = sessionsFor(taskOpen.id).length;
  ok(doomedRuns > 0, 'The task about to be deleted has recorded runs');
  await run(() => c().actions.deleteTask(taskOpen.id));
  ok(c().data.timerSessions.length === beforeDelete - doomedRuns
     && c().data.timerSessions.every((s) => s.taskId !== taskOpen.id),
     'Deleting a task removes its recorded runs — no orphaned focused time');

  /* --- Everything survives a reload --------------------------------- */
  const persistedToday = dayTotal(today);
  const persistedYesterday = dayTotal(yesterday);
  await closeApp();
  await openApp();
  ok(dayTotal(today) === persistedToday && dayTotal(yesterday) === persistedYesterday,
     'Per-day focused time persists across a reload');
  ok(toISODate(new Date()) === today, 'Sanity: the suite ran within a single local day');
  await closeApp();

  /* ================================================================== */
  /* Part C — what the Calendar actually shows                          */
  /* ================================================================== */
  console.log('\n— Calendar —');
  await openApp(true);

  const dayBlock = host!.querySelector('[data-focused-day]');
  ok(dayBlock !== null, 'The selected day shows a FOCUSED TIME block');
  const dayText = dayBlock?.textContent ?? '';
  ok(/focused time/i.test(dayText), 'The block is labelled "Focused time", never "Work hours"');
  ok(dayText.includes(formatFocusedTime(dayTotal(today))),
     `The headline shows the day's recorded time (${formatFocusedTime(dayTotal(today))})`);
  ok(dayText.includes('Time recorded by FocusDesk task timers.'),
     'The block says plainly what it measures — no claim about every minute worked');
  ok(dayBlock?.querySelectorAll('li').length === focusedTimeOnDate(c().data, today, Date.now()).byTask.length,
     'The optional per-task breakdown is rendered, one line per task');

  const monthBlock = host!.querySelector('[data-focused-month]');
  const monthText = monthBlock?.textContent ?? '';
  const monthStats = focusedTimeInMonth(c().data, monthKey(today));
  ok(monthBlock !== null && /Focused time/.test(monthText) && /Days worked/.test(monthText),
     'The month summary shows "Focused time" and "Days worked"');
  ok(monthText.includes(formatFocusedTime(monthStats.seconds)) && monthText.includes(String(monthStats.daysWorked)),
     `The month summary matches the data (${formatFocusedTime(monthStats.seconds)}, ${monthStats.daysWorked} days)`);

  const body = host!.textContent ?? '';
  ok(!/streak|score|badge|rank|productivity/i.test(body),
     'No streaks, scores, badges, rankings or productivity gamification');
  ok(!/work hours/i.test(body), 'Nothing is labelled "work hours"');
  ok(host!.querySelectorAll('nav a, [role="tab"]').length === 0, 'No new navigation tab was added');

  await closeApp();
}

main()
  .then(() => {
    if (failures > 0) {
      console.error(`\n${failures} check(s) failed`);
      process.exit(1);
    }
    console.log('\nAll focused-time checks passed');
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
