/**
 * Review visual analytics — chart accuracy, honesty and accessibility checks.
 *
 * What this suite is for: the two Review charts are only trustworthy if they
 * render *the same numbers the Review already prints*, and if the awkward cases
 * (a day with no recorded time, a task whose project was deleted, a run that
 * crosses midnight) are shown truthfully instead of smoothed away.
 *
 * Pure accounting checks run first against `focusedTimeInRange`; the DOM checks
 * then mount the real Weekly and Monthly Review components and read the bars
 * back out of the rendered chart, so a chart that draws the wrong number fails
 * even when the selector underneath is right.
 *
 * Optional tooling:  npm i --no-save --package-lock=false jsdom tsx
 * Run: npx tsx scripts/verify-review-charts.tsx
 * Recommended in three zones (the midnight split is a local-day question):
 *   TZ=Asia/Kolkata npx tsx scripts/verify-review-charts.tsx
 *   TZ=America/New_York npx tsx scripts/verify-review-charts.tsx
 *   TZ=Pacific/Chatham npx tsx scripts/verify-review-charts.tsx
 *
 * jsdom local storage and fabricated data only; Supabase is forcibly unset.
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  addDays,
  combineDateTime,
  compactFocusedTime,
  endOfMonth,
  formatFocusedTime,
  formatSecondsDetailed,
  startOfMonth,
  startOfWeek,
  todayISO,
} from '../lib/dates';
import { focusedTimeInRange } from '../lib/selectors';
import { emptyData } from '../lib/store/defaults';
import type { AppData, Project, Task, TimerSession } from '../lib/types';

process.env.NEXT_PUBLIC_SUPABASE_URL = '';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = '';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = '';

let checks = 0;
function check(value: unknown, message: string) {
  assert.ok(value, message);
  checks += 1;
  console.log('✓', message);
}

const at = combineDateTime;
const task = (id: string, patch: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  status: 'planned',
  priority: 'medium',
  createdAt: at('2026-09-01', '09:00'),
  archived: false,
  postponementCount: 0,
  tags: [],
  ...patch,
});
const project = (id: string, patch: Partial<Project> = {}): Project => ({
  id,
  name: `Project ${id}`,
  status: 'active',
  createdAt: at('2026-09-01', '09:00'),
  ...patch,
});
const session = (id: string, taskId: string, start: string, end: string, seconds?: number): TimerSession => ({
  id,
  taskId,
  startedAt: start,
  endedAt: end,
  durationSeconds: seconds ?? Math.round((Date.parse(end) - Date.parse(start)) / 1000),
});

/* ------------------------------------------------------------------ */
/* The fixture week                                                    */
/* ------------------------------------------------------------------ */

// Anchored on the real current week so the assertions hold in every timezone
// (the components navigate from `startOfWeek(todayISO())` themselves).
const monday = startOfWeek(todayISO());
const day = (offset: number) => addDays(monday, offset);

const tasks: Task[] = [
  task('alpha', { projectId: 'p1' }),
  task('beta', { projectId: 'p1' }),
  task('gamma', { projectId: 'p2' }),
  task('delta', { projectId: 'p2' }),
  task('loose'), // never assigned to a project
  task('orphan', { projectId: 'deleted-project' }), // project no longer exists
  task('archived', { projectId: 'p1', archived: true }),
];

const sessions: TimerSession[] = [
  session('mon-am', 'alpha', at(day(0), '09:00'), at(day(0), '09:45')), // 2700
  session('mon-pm', 'alpha', at(day(0), '14:00'), at(day(0), '14:15')), //  900
  session('midnight', 'beta', at(day(0), '23:40'), at(day(1), '00:20'), 2400), // 1200 / 1200
  session('odd-seconds', 'loose', at(day(1), '13:00'), at(day(1), '13:01'), 95), // 95 — proves the
  //   labels are not silently rounded to whole minutes
  session('wed', 'gamma', at(day(2), '11:00'), at(day(2), '11:30')), //   1800
  session('thu-run', 'delta', at(day(3), '10:00'), at(day(3), '10:10')), //  600
  session('thu-resume', 'delta', at(day(3), '10:30'), at(day(3), '10:40')), // 600 — 20 min paused gap
  session('fri-loose', 'loose', at(day(4), '16:00'), at(day(4), '16:05')), // 300
  session('fri-orphan', 'orphan', at(day(4), '17:00'), at(day(4), '17:06')), // 360
  session('left-edge', 'alpha', at(day(-1), '23:00'), at(day(0), '00:30'), 5400), // 1800 lands on Monday
  session('right-edge', 'gamma', at(day(6), '23:30'), at(day(7), '00:30'), 3600), // 1800 lands on Sunday
  session('zero', 'alpha', at(day(5), '09:00'), at(day(5), '09:00')), //  0 — ignored
  session('archived-run', 'archived', at(day(5), '10:00'), at(day(5), '11:00')), // excluded
];

const data: AppData = {
  ...emptyData(),
  projects: [project('p1'), project('p2')],
  tasks,
  timerSessions: sessions,
};

/**
 * True when every local day in the fixture week is exactly 24h long. The
 * midnight split distributes a run in proportion to wall-clock overlap, so the
 * exact per-day split for a crossing run is only a fixed number when no DST
 * transition sits inside the week. The conservation checks hold either way.
 */
const dstFree = [-1, 0, 1, 2, 3, 4, 5, 6, 7].every(
  (offset) =>
    Date.parse(at(day(offset + 1), '00:00')) - Date.parse(at(day(offset), '00:00')) === 86_400_000,
);

/* ------------------------------------------------------------------ */
/* 1. What the charts are given                                        */
/* ------------------------------------------------------------------ */

function accounting() {
  console.log('\n— Chart data (pure) —');
  const period = focusedTimeInRange(data, monday, day(6));

  // 2700 + 900 + 1200 (midnight) + 1800 (left edge) = 6600 on Monday when the
  // week is DST-free; the other days are fixed regardless.
  check(period.byDay.length === 7, 'Chart 1 receives exactly seven day buckets — one bar per day');
  check(
    period.byDay.every((entry, index) => entry.date === day(index)),
    'Day buckets are in Monday → Sunday local order',
  );
  check(
    period.byDay[5].date === day(5) && period.byDay[5].seconds === 0,
    'A day with only a zero-length run and an archived run is present as a zero bar, not missing',
  );
  check(
    period.byDay[3].seconds === 1200,
    'Two runs either side of a 20-minute pause contribute 20 minutes — the paused gap is excluded',
  );
  check(
    period.byDay[2].seconds === 1800 && period.byDay[6].seconds > 0,
    'A run leaving the week is clipped at the Sunday boundary rather than dropped or doubled',
  );

  const dayTotal = period.byDay.reduce((sum, entry) => sum + entry.seconds, 0);
  check(
    dayTotal === period.seconds,
    `The bars sum to the period total (${period.seconds}s) — the chart cannot disagree with the Review summary`,
  );

  const p1 = period.byProject.find((row) => row.project?.id === 'p1');
  const p2 = period.byProject.find((row) => row.project?.id === 'p2');
  const unassigned = period.byProject.find((row) => !row.project);
  check(p1 !== undefined && p2 !== undefined && unassigned !== undefined, 'Chart 2 has project rows and an unassigned row');
  check(
    period.byProject.reduce((sum, row) => sum + row.seconds, 0) === period.seconds,
    'Project rows reconcile exactly to the same total — no time is dropped or double counted',
  );
  check(
    unassigned!.seconds === 755,
    'Unassigned row keeps unlinked work (300s + 95s) and work whose project was deleted (360s)',
  );
  check(
    period.orphanedTaskCount === 1,
    'The deleted-project task is reported as orphaned so the "No project" row can say so',
  );
  check(
    period.byProject[0].seconds >= period.byProject[1].seconds,
    'Project rows are sorted largest first',
  );
  check(
    !period.byProject.some((row) => row.project?.id === 'deleted-project'),
    'No project row is invented for a project id that no longer exists',
  );
  check(
    period.byProject.some((row) => row.seconds > 0) &&
      period.byProject.every((row) => row.seconds > 0),
    'Only projects with recorded seconds get a bar — an empty bar is never drawn',
  );

  if (dstFree) {
    check(
      period.byDay[0].seconds === 6600 && period.byDay[1].seconds === 1295,
      'DST-free week: a run crossing midnight splits 20 min / 20 min across the two days',
    );
    check(
      period.seconds === 6600 + 1295 + 1800 + 1200 + 660 + 0 + 1800,
      'DST-free week: the exact weekly total is conserved across every edge case',
    );
    check(p1!.seconds === 7800 && p2!.seconds === 4800, 'DST-free week: project totals are exact');
  }

  const empty = focusedTimeInRange({ ...data, timerSessions: [] }, monday, day(6));
  check(
    empty.seconds === 0 && empty.byDay.length === 7 && empty.byDay.every((d) => d.seconds === 0),
    'No saved sessions: seven zero bars, never a fabricated history from lifetime totals',
  );
  check(empty.byProject.length === 0, 'No saved sessions: no project rows are drawn at all');

  // The month containing the fixture week. Assertions here avoid subset
  // arithmetic on the range itself (the week may straddle two months, which
  // would make "month ⊇ week" false), and instead check the properties the
  // Monthly chart relies on.
  const month = focusedTimeInRange(data, startOfMonth(monday), endOfMonth(monday));
  check(
    month.seconds > 0 && month.byProject.length >= 2,
    'The same selector drives the Monthly chart over a month range',
  );
  check(
    month.orphanedTaskCount === 1 && month.byProject.some((row) => !row.project),
    'The Monthly chart keeps the unassigned row and the orphaned-task count',
  );
  check(
    month.byProject.reduce((sum, row) => sum + row.seconds, 0) === month.seconds,
    'The Monthly chart rows reconcile to the Monthly total',
  );
}

/* ------------------------------------------------------------------ */
/* 2. What the charts actually render                                  */
/* ------------------------------------------------------------------ */

async function ui() {
  console.log('\n— Rendered charts (jsdom) —');
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
  const g = globalThis as Record<string, unknown>;
  g.window = dom.window;
  g.document = dom.window.document;
  g.localStorage = dom.window.localStorage;
  g.self = dom.window;
  g.IS_REACT_ACT_ENVIRONMENT = true;

  const React = await import('react');
  const { act } = React;
  const { createRoot } = await import('react-dom/client');
  const { AuthProvider } = await import('../components/auth/auth-provider');
  const { DataProvider } = await import('../components/data/data-provider');
  const { UIProvider } = await import('../components/ui/ui-provider');
  const { WeeklyReview } = await import('../components/review/weekly-review');
  const { MonthlyReview } = await import('../components/review/monthly-review');

  let root: ReturnType<typeof createRoot> | undefined;
  const mount = async (node: React.ReactNode) => {
    if (root) await act(async () => root!.unmount());
    dom.window.localStorage.clear();
    dom.window.localStorage.setItem('pace.db.v1', JSON.stringify(data));
    document.body.innerHTML = '<div id="root"></div>';
    root = createRoot(document.getElementById('root')!);
    await act(async () => {
      root!.render(
        <AuthProvider>
          <DataProvider>
            <UIProvider>{node}</UIProvider>
          </DataProvider>
        </AuthProvider>,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
  };

  const click = async (element: Element | undefined | null) => {
    assert.ok(element, 'UI control exists');
    await act(async () => {
      element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  };

  const bars = (chart: Element | null) =>
    chart ? Array.from(chart.querySelectorAll('[data-focus-bar]')) : [];

  /* -- Weekly ------------------------------------------------------- */
  await mount(<WeeklyReview />);
  const total = document.querySelector('[data-weekly-focused-total]')?.textContent ?? '';
  const period = focusedTimeInRange(data, monday, day(6));

  check(
    total === formatFocusedTime(period.seconds),
    `The Review total is unchanged by the charts (${total})`,
  );

  const dayChart = document.querySelector('[data-focus-by-day-chart]');
  check(dayChart !== null, 'Chart 1 renders inside the existing Weekly focused-time section');
  const dayBars = bars(dayChart);
  check(dayBars.length === 7, `Chart 1 has seven bars, one per day (${dayBars.length})`);
  check(
    dayBars.map((b) => b.getAttribute('data-focus-bar')).join(',') ===
      [0, 1, 2, 3, 4, 5, 6].map((i) => day(i)).join(','),
    'Chart 1 bars are keyed by local date in Monday → Sunday order',
  );

  // Every bar carries its own printed number — nothing is encoded by colour,
  // height or position alone.
  const dayLabels = dayBars.map((b) => b.querySelector('span[aria-hidden="true"]')?.textContent ?? '');
  check(
    dayLabels.every((label) => label.length > 0),
    'Every bar prints its own value — the chart never relies on colour alone',
  );
  check(
    dayLabels[5] === '0',
    'A zero-focus day prints "0" instead of vanishing from the chart',
  );
  check(
    dayLabels.filter((label) => label === '0').length === 1,
    'Exactly one day reads zero, matching the fixture (zero-length run + archived run)',
  );
  if (dstFree) {
    check(
      dayLabels[0] === compactFocusedTime(6600) && dayLabels[1] === compactFocusedTime(1295),
      `DST-free week: bar labels show the exact split (${dayLabels[0]} / ${dayLabels[1]})`,
    );
  }

  // Accessible content: the visible text is decorative, the sr-only sentence
  // is what a screen reader gets, and it names the exact seconds.
  const srText = dayBars.map((b) => b.querySelector('.sr-only')?.textContent ?? '');
  check(
    srText.every((text) => text.length > 0),
    'Every bar exposes an sr-only sentence — the chart is readable without sight of the bars',
  );
  check(
    srText[5].includes('no recorded focused time'),
    'The zero bar says so in words, not just with an empty column',
  );
  check(
    srText[1].includes(' sec'),
    'The sr-only label keeps seconds-level precision ("21 min 35 sec"), not just rounded minutes',
  );
  if (dstFree) {
    check(
      srText[0].includes(formatSecondsDetailed(6600)),
      `The sr-only label carries the detailed value (${formatSecondsDetailed(6600)})`,
    );
  }
  const dayChartLabel = dayChart?.getAttribute('aria-label') ?? '';
  check(
    dayChartLabel.includes('6 of 7'),
    'The chart announces how many of the seven days have recorded time',
  );

  const projectChart = document.querySelector('[data-focus-by-project-chart]');
  check(projectChart !== null, 'Chart 2 renders inside the existing Weekly focused-time section');
  const projectBars = bars(projectChart);
  check(
    projectBars.length === 3,
    `Chart 2 has one row per project plus the unassigned row (${projectBars.length})`,
  );
  const projectText = projectChart?.textContent ?? '';
  check(
    projectText.includes('Project p1') && projectText.includes('Project p2'),
    'Chart 2 names the projects it is showing',
  );
  check(
    projectText.includes('No project'),
    'Chart 2 keeps an explicit "No project" row rather than dropping unlinked time',
  );
  check(
    document.body.textContent?.includes('whose project no longer exists') === true &&
      document.body.textContent?.includes('1 task whose project no longer exists') === true,
    'Chart 2 discloses that the unassigned row contains a task whose project was deleted',
  );
  check(
    (projectChart?.parentElement?.textContent ?? '').includes(formatFocusedTime(period.seconds)),
    'Chart 2 prints a total equal to the section total',
  );
  const shares = Array.from(projectChart?.querySelectorAll('li') ?? []).map((li) =>
    Number(/·\s*(\d+)%/.exec(li.textContent ?? '')?.[1] ?? -1),
  );
  check(
    shares.length === 3 && shares.every((s) => s > 0),
    `Each row prints its share of the total (${shares.join('% / ')}%)`,
  );

  // The honesty copy is preserved: the charts must not quietly claim more than
  // the saved sessions can prove.
  const body = () => document.body.textContent ?? '';
  check(body().includes('migration 006'), 'The pre-migration-006 history limitation is still disclosed');
  check(body().includes('not a migration date'), 'First available session is still not presented as a migration date');
  check(body().includes('current task/project/goal links'), 'Current-links (not historical) attribution is still disclosed');
  check(body().includes('By goal'), 'The By goal breakdown is untouched');

  // Week navigation must recompute both charts, not leave stale bars behind.
  // One week back holds exactly the Sunday half of the run that crossed into
  // Monday — the clipping has to be visible in the bars, not just in the total.
  await click(document.querySelector('[aria-label="Previous week"]'));
  const prevBars = bars(document.querySelector('[data-focus-by-day-chart]'));
  check(prevBars.length === 7, 'Navigating a week back still renders seven bars');
  check(
    prevBars[6].querySelector('span[aria-hidden="true"]')?.textContent === compactFocusedTime(3600),
    'The Sunday of the earlier week shows the 1h that belongs to it — the crossing run is split, not duplicated',
  );
  check(
    document.querySelector('[data-weekly-focused-total]')?.textContent === formatFocusedTime(3600),
    `The earlier week totals exactly the part of the crossing run inside it (${formatFocusedTime(3600)})`,
  );

  // Two weeks back there is nothing at all.
  await click(document.querySelector('[aria-label="Previous week"]'));
  check(
    document.querySelector('[data-weekly-focused-total]')?.textContent === '0 min recorded',
    'A week with no recorded time reports 0 min recorded — no fabricated history',
  );
  check(
    document.querySelector('[data-focus-by-project-chart]') === null,
    'With nothing recorded, Chart 2 draws no rows instead of empty bars',
  );
  check(
    bars(document.querySelector('[data-focus-by-day-chart]')).every(
      (b) => b.querySelector('span[aria-hidden="true"]')?.textContent === '0',
    ),
    'Every bar in an empty week reads 0',
  );
  await click(document.querySelector('[aria-label="Next week"]'));
  await click(document.querySelector('[aria-label="Next week"]'));
  check(
    document.querySelector('[data-focus-by-day-chart]') !== null &&
      bars(document.querySelector('[data-focus-by-day-chart]')).length === 7 &&
      document.querySelector('[data-focus-by-project-chart]') !== null,
    'Navigating back to the fixture week restores both charts',
  );

  /* -- Monthly ------------------------------------------------------ */
  await mount(<MonthlyReview />);
  const monthPeriod = focusedTimeInRange(data, startOfMonth(todayISO()), endOfMonth(todayISO()));
  check(
    document.querySelector('[data-monthly-focused-total]')?.textContent ===
      formatFocusedTime(monthPeriod.seconds),
    `The Monthly chart total equals its own selector total (${formatFocusedTime(monthPeriod.seconds)})`,
  );
  check(
    document.querySelector('[data-focus-by-project-chart]') !== null,
    'Chart 2 renders on the Monthly tab for the displayed month',
  );
  check(
    (document.body.textContent ?? '').includes('This is not the same figure as'),
    'Monthly states plainly that this figure differs from the completion-based "Focused time" above',
  );
  check(
    (document.body.textContent ?? '').includes('including time spent in earlier months'),
    'Monthly explains why the two figures differ, rather than leaving two numbers unexplained',
  );
  check(
    (document.querySelector('[data-focus-by-project-chart]')?.textContent ?? '').includes('No project'),
    'Monthly keeps the unassigned row too',
  );

  await click(document.querySelector('[aria-label="Previous month"]'));
  check(
    document.querySelector('[data-monthly-focused-total]')?.textContent === '0 min recorded',
    'An earlier month with no sessions reports 0 min recorded',
  );
  check(
    (document.body.textContent ?? '').includes('This does not mean no work was done'),
    'The empty month keeps the no-inference notice',
  );

  /* -- A week with no sessions at all ------------------------------- */
  await mount(<WeeklyReview />);
  const noSessions: AppData = { ...data, timerSessions: [] };
  dom.window.localStorage.setItem('pace.db.v1', JSON.stringify(noSessions));
  await act(async () => {
    root!.unmount();
    document.body.innerHTML = '<div id="root"></div>';
    root = createRoot(document.getElementById('root')!);
    root!.render(
      <AuthProvider>
        <DataProvider>
          <UIProvider>
            <WeeklyReview />
          </UIProvider>
        </DataProvider>
      </AuthProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  check(
    bars(document.querySelector('[data-focus-by-day-chart]')).length === 7 &&
      document.querySelector('[data-weekly-focused-total]')?.textContent === '0 min recorded',
    'Chart 1 still renders its seven empty slots with no session history',
  );
  check(
    (document.body.textContent ?? '').includes('migration 006') &&
      (document.body.textContent ?? '').includes('No saved focused time in this week'),
    'No session history is disclosed honestly and never back-filled from lifetime totals',
  );

  await act(async () => root!.unmount());
  dom.window.close();
}

accounting();
ui()
  .then(() => console.log(`\nReview charts: ${checks} checks passed (${process.env.TZ ?? 'system timezone'}).`))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
