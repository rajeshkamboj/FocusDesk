/**
 * Verification: the Today screen's "Completed today" list is driven by the
 * completion timestamp, not by the planned date.
 * Run with: npx tsx scripts/verify-today-completed-date.tsx
 *
 * Reproduces the reported bug — a task scheduled for today but finished on an
 * earlier day appeared under "Completed today" — and pins the rule the app now
 * uses everywhere (`completedTasksOn`, shared with the Daily Review):
 *
 * 1. Scheduled today + completed earlier  → NOT in "Completed today".
 * 2. Scheduled for another day + finished today → IS in "Completed today".
 * 3. Never scheduled + finished today     → IS in "Completed today".
 * 4. Scheduled for a future day + finished today → IS in "Completed today".
 * 5. Scheduled today + completed today    → IS in "Completed today".
 * 6. Completed with no usable timestamp (legacy/imported) → reported on its
 *    scheduled day; no completion date is invented.
 * 7. Completed on another day and scheduled for that day → not today's.
 * 8. Cancelled, archived and still-open tasks never appear in the list.
 * 9. "Today's progress" N completed agrees with the list, and the total is the
 *    union of "planned today" and "finished today" (a task in both counts once).
 * 10. The list is exactly what the Daily Review reports for the same day.
 */

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.localStorage = dom.window.localStorage;
g.self = dom.window; // next/link's useIntersection reads `self`
g.IS_REACT_ACT_ENVIRONMENT = true;

async function main() {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { act } = React;
  const { AuthProvider } = await import('../components/auth/auth-provider');
  const { UIProvider } = await import('../components/ui/ui-provider');
  const { DataProvider, useData } = await import('../components/data/data-provider');
  const { TodayScreen } = await import('../components/today/today-screen');
  const { completedTasksOn, dailyReviewStats } = await import('../lib/selectors');
  const { addDays, todayISO, toISODate } = await import('../lib/dates');
  const { STORAGE_KEY } = await import('../lib/store/local-repository');
  const { emptyData } = await import('../lib/store/defaults');
  type Task = import('../lib/types').Task;

  const today = todayISO();
  const earlier = addDays(today, -3);
  const later = addDays(today, 3);
  /** A local-time timestamp on `date` at `h:m` — never a UTC instant. */
  const at = (date: string, h: number, m: number) => {
    const d = new Date(`${date}T00:00:00`);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const onDate = (iso: string) => toISODate(new Date(iso));

  const task = (overrides: Partial<Task> & { id: string; title: string }): Task => ({
    status: 'created',
    priority: 'medium',
    createdAt: at(today, 8, 0),
    tags: [],
    postponementCount: 0,
    archived: false,
    ...overrides,
  } as Task);

  const tasks: Task[] = [
    // 1. The reported bug: planned for today, finished three days ago.
    task({ id: 'stale', title: 'STALE planned today, completed earlier', status: 'completed', scheduledDate: today, completedAt: at(earlier, 18, 30) }),
    // 5. Planned today and finished today.
    task({ id: 'planned-done', title: 'PLANNED and done today', status: 'completed', scheduledDate: today, completedAt: at(today, 9, 15) }),
    // 2. Planned for an earlier day, carried into today's work.
    task({ id: 'carry-over', title: 'CARRY-OVER finished today', status: 'completed', scheduledDate: earlier, completedAt: at(today, 14, 40) }),
    // 3. Never planned, finished today.
    task({ id: 'unplanned', title: 'UNPLANNED finished today', status: 'completed', completedAt: at(today, 16, 5) }),
    // 4. Planned for a future day, finished early.
    task({ id: 'early', title: 'EARLY finish of a future task', status: 'completed', scheduledDate: later, completedAt: at(today, 11, 0) }),
    // 6. Legacy/imported record: completed, no usable timestamp, planned today.
    task({ id: 'legacy', title: 'LEGACY no timestamp, planned today', status: 'completed', scheduledDate: today }),
    // 6b. Same, but planned for the earlier day — belongs to that day, not today.
    task({ id: 'legacy-old', title: 'LEGACY no timestamp, planned earlier', status: 'completed', scheduledDate: earlier }),
    // 7. Completed on its own scheduled day, days ago.
    task({ id: 'older', title: 'OLDER completed on its own day', status: 'completed', scheduledDate: earlier, completedAt: at(earlier, 10, 0) }),
    // 8. Cancelled and open work planned for today.
    task({ id: 'cancelled', title: 'CANCELLED planned today', status: 'cancelled', scheduledDate: today }),
    task({ id: 'open', title: 'OPEN planned today', status: 'today', scheduledDate: today }),
    // 8b. Archived completion — excluded everywhere.
    task({ id: 'archived', title: 'ARCHIVED finished today', status: 'completed', scheduledDate: today, completedAt: at(today, 7, 0), archived: true }),
  ];
  // Sanity: the fixture's completion days are what the assertions assume.
  const staleDay = onDate(tasks[0].completedAt!);
  if (staleDay !== earlier) throw new Error(`fixture broken: expected ${earlier}, got ${staleDay}`);
  if (onDate(tasks[2].completedAt!) !== today) throw new Error('fixture broken: carry-over is not completed today');

  // Seed storage before the provider reads it.
  const data = { ...emptyData(), tasks };
  dom.window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

  let ctx: ReturnType<typeof useData> | null = null;
  const Probe = () => { ctx = useData(); return null; };

  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      React.createElement(
        AuthProvider,
        null,
        React.createElement(
          UIProvider,
          null,
          React.createElement(
            DataProvider,
            null,
            React.createElement(React.Fragment, null, React.createElement(Probe), React.createElement(TodayScreen)),
          ),
        ),
      ),
    );
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });

  const ok = (cond: boolean, msg: string) => {
    if (!cond) { console.error('FAIL:', msg); process.exit(1); }
    console.log('✓', msg);
  };

  ok(ctx !== null && ctx.ready, 'Data provider loaded the seeded tasks');
  ok(ctx!.data.tasks.length === tasks.length, `All ${tasks.length} seeded tasks are live`);

  /** The rendered "Completed today" section, expanded. */
  const completedSection = (): HTMLElement | null => {
    for (const section of Array.from(document.querySelectorAll('section'))) {
      const heading = section.querySelector('h2');
      if (heading?.textContent?.trim() === 'Completed today') return section as HTMLElement;
    }
    return null;
  };

  const heading = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Completed today'));
  ok(Boolean(heading), 'The "Completed today" section is rendered');
  await act(async () => {
    heading!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 20));
  });

  const sectionText = completedSection()?.textContent ?? '';
  const shown = (title: string) => sectionText.includes(title);

  ok(!shown('STALE planned today'), 'A task scheduled today but completed on another day is NOT listed under "Completed today" (the reported bug)');
  ok(shown('PLANNED and done today'), 'A task planned today and finished today is listed');
  ok(shown('CARRY-OVER finished today'), 'A task planned for an earlier day but finished today is listed');
  ok(shown('UNPLANNED finished today'), 'An unscheduled task finished today is listed');
  ok(shown('EARLY finish of a future task'), 'A future task finished early today is listed');
  ok(shown('LEGACY no timestamp, planned today'), 'A legacy completion without a timestamp falls back to its planned day (today)');
  ok(!shown('LEGACY no timestamp, planned earlier'), 'A legacy completion planned for an earlier day is not today\'s');
  ok(!shown('OLDER completed on its own day'), 'Work completed on an earlier day is not listed');
  ok(!shown('CANCELLED planned today'), 'Cancelled work is not listed');
  ok(!shown('OPEN planned today'), 'Open work is not in the completed list');
  ok(!shown('ARCHIVED finished today'), 'Archived work is not listed');

  const count = completedSection()?.querySelector('span')?.textContent?.trim();
  ok(count === '5', `The section counter reads 5 (got "${count}")`);

  const expectedIds = ['unplanned', 'carry-over', 'early', 'planned-done', 'legacy'];
  const selectedIds = completedTasksOn(ctx!.data.tasks, today).map((t) => t.id);
  ok(
    selectedIds.length === expectedIds.length && expectedIds.every((id) => selectedIds.includes(id)),
    `completedTasksOn returns exactly the 5 tasks finished today (got ${JSON.stringify(selectedIds)})`,
  );
  ok(
    selectedIds[0] === 'unplanned' && selectedIds[1] === 'carry-over' && selectedIds[2] === 'early' && selectedIds[3] === 'planned-done',
    'Completed tasks are ordered most recently completed first, timestamp-less ones last',
  );

  const reviewIds = dailyReviewStats(ctx!.data, today).completed.map((t) => t.id);
  ok(
    reviewIds.length === selectedIds.length && reviewIds.every((id, i) => id === selectedIds[i]),
    'The Daily Review reports exactly the same completed tasks for the same day',
  );

  // Progress: planned today and still on the list (stale, planned-done, legacy,
  // open — cancelled and archived are out) plus the off-plan completions
  // (carry-over, unplanned, early) = 7; 5 of them done.
  const progress = document.querySelector('[role="progressbar"]');
  ok(
    progress?.getAttribute('aria-valuetext') === '5 of 7 tasks completed',
    `"Today's progress" reads 5 of 7 (got "${progress?.getAttribute('aria-valuetext')}")`,
  );
  ok(
    document.body.textContent?.includes('5 of 7 completed') === true,
    'The visible progress label agrees with the list',
  );

  // What the old rule did, spelled out so the regression is explicit.
  const oldRule = ctx!.data.tasks
    .filter((t) => t.scheduledDate === today && t.status === 'completed')
    .map((t) => t.id);
  ok(
    oldRule.includes('stale') && !oldRule.includes('carry-over') && !oldRule.includes('unplanned'),
    `The superseded "scheduled today" rule is what put the stale task there: ${JSON.stringify(oldRule)}`,
  );

  // The earlier day's list is the mirror image: the stale task belongs there.
  const earlierIds = completedTasksOn(ctx!.data.tasks, earlier).map((t) => t.id);
  ok(
    earlierIds.includes('stale') && earlierIds.includes('older') && earlierIds.includes('legacy-old') && !earlierIds.includes('carry-over'),
    `The day the stale task was actually finished lists it: ${JSON.stringify(earlierIds)}`,
  );

  console.log('\nAll Today-screen completion-date checks passed.');
  await act(async () => { root.unmount(); });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
