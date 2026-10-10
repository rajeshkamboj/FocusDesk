# Review Visual Analytics

Implemented 2026-10-10 on `arena/59d0adcf-focusdesk`, based on latest fetched `origin/main` (`d5995b3`). No merge, migration, production-data access, runtime dependency, or lockfile change.

## Scope

Two charts were added **inside the existing Review tab**. No new route, no new nav item, no dashboard screen, and no change to any existing Review figure.

| | What | Where |
|---|---|---|
| **Chart 1 — Daily Focus Time** | Vertical bars, one per local calendar day | **Weekly** Review, replacing the "By day" text rows |
| **Chart 2 — Focus Time by Project** | Horizontal bars, share of the period | **Weekly** and **Monthly** Review, replacing the Weekly "By project" text rows and added as one new Monthly card |

The **Daily tab was deliberately left alone.** A session-based chart there would sit a few lines below the existing "Completed · N · *X* focused" label, which is built from *completed tasks' lifetime totals* — the two numbers would routinely disagree, and changing that label is outside "preserve all existing Review summaries". See *Two figures, one screen* below. Adding it later is a two-line change once that decision is made.

## Behaviour

### Chart 1 — Daily Focus Time (Weekly)

- Seven bars, one per day, Monday → Sunday, in the order the local calendar week runs. **Days with no recorded time are drawn as an empty slot on a baseline with a `0` label** — never omitted, because a week is seven days long whether or not the timer ran.
- The scale is the week's tallest day; every recorded day is clamped to a 3% hairline so a single minute is never drawn as nothing.
- Each column prints its own value (`0`, `<1m`, `45m`, `1h20`, `2h`) above the bar and its weekday initial below. **Nothing is encoded by colour alone** — the number is always there, at every width.
- The chart is given `total` by its caller and never sums its own data, so it cannot drift from the section total above it.
- Bars read `focusedTimeInRange(...).byDay`, which is already zero-filled and already reconciled: the Phase 1 suite proves `sum(byDay) === sum(byProject) === sum(byGoal) === sum(byTask) === seconds`.

### Chart 2 — Focus Time by Project (Weekly + Monthly)

- One row per project with recorded time, largest first, plus an explicit **"No project"** row. Rows with zero seconds are not drawn at all.
- Bar length is the **share of the period total** — the same number printed beside it — so the length and the text always agree and the longest bar is never misread as "all my time".
- Attribution is **session-based**, never from `Task.actualDurationSeconds`. A task worked across four weeks contributes the four chunks it actually recorded, not its lifetime total four times over.
- The row total (`Total recorded`) equals the section total.

### Honesty rules carried over unchanged

Saved timer sessions only — paused gaps excluded, unfinished work included, archived and deleted tasks excluded. Runs are split at local midnight, so a run crossing into Monday contributes to Monday. On-hold projects and Someday tasks keep their real recorded time. Uncheckpointed live time is **not** inferred (the Calendar shows it; Review deliberately does not), so the charts stay consistent with the Review summary they sit under. The pre-migration-006 limitation and "first available session is not a migration date" disclosures are untouched.

### Two new, small honesty additions

1. **`PeriodFocusedTime.orphanedTaskCount`** (additive field, one line in `focusedTimeInRange`). The "No project" row has always mixed three different things: tasks never assigned, daily-priority timer tasks, and tasks whose project was deleted. The count lets the chart say which: *"'No project' includes 1 task whose project no longer exists. The recorded time is real — only the link is missing, so it cannot be attributed back."* No project row is invented for a deleted project id.
2. **Monthly states plainly that its two figures differ.** The new card says *"This is not the same figure as 'Focused time' above, which counts each month-completed task's whole recorded time — including time spent in earlier months."* On the preview fixture that is **7h 10m** (sessions) against **10h** (lifetime totals of completed tasks).

## Dependency decision — none added

`package.json` and `package-lock.json` are byte-identical. Both charts are `<div>`s with percentage widths, the same technique `ProgressBar` and `ProgressSegments` already use.

The case against a chart library is not aesthetic:

- **Cost.** `recharts@3.10.1` (latest) pulls `@reduxjs/toolkit`, `react-redux`, `reselect`, `immer`, `es-toolkit`, `victory-vendor` (a d3 bundle), `decimal.js-light`, `eventemitter3`, `use-sync-external-store` and `react-is` — roughly **20 MB unpacked** and a Redux store in the render path — to draw seven bars and a handful of rows, in a UI that currently has none of it.
- **It would disable the project's own layout gate.** `scripts/verify-mobile-layout.tsx` resolves compiled Tailwind declarations on real DOM elements. A library renders `<svg>` whose geometry comes from attributes and `viewBox`, which that script does not model, so the Review audit would start passing without measuring anything. Worse: `ResponsiveContainer` depends on `ResizeObserver` (stubbed as a no-op there) and `getBoundingClientRect` (zeros in jsdom), so **in every existing headless script the chart would render nothing at all** and the DOM assertions would silently lose coverage.
- **Accessibility is hand-written either way.** A library's default output has no accessible names. Building the bars as a list of labelled rows gives that for free.

Revisit only if a future requirement needs zoomable timelines, brushable ranges or stacked multi-series.

## Verification performed

All final commands below exited 0.

| Check | Result |
|---|---|
| `verify-review-charts.tsx` (**new**) | 61 assertions, each in Asia/Kolkata, America/New_York and Pacific/Chatham (183 total) |
| `verify-phase1-execution-time.tsx` | 38 assertions × 3 timezones |
| `verify-review-stats.ts` | Passed in all three timezones |
| `verify-focused-time.tsx` | Passed in all three timezones |
| `verify-mobile-layout.tsx` | Passed; Review charts now asserted present and measured at 320/360/390/430px |
| `verify-workflow.tsx` | Passed |
| `verify-bulk-delete.tsx` | Passed |
| `verify-phase7-completion-date.tsx` | Passed |
| `verify-timer-concurrency.tsx` | Passed |
| `verify-timer-dock.tsx` | Passed |
| `verify-timer-navigation.tsx` | Passed |
| `verify-multi-tab.tsx` | Passed |
| `verify-learnings-project-milestones.tsx` | Passed |
| `verify-project-plan-import.tsx` | Passed |
| `verify-project-plan-add-to-existing.tsx` | Passed |
| `verify-project-milestones-sql.ts` | Passed (PGlite; no SQL was changed) |
| `verify-priority-input.tsx` | Passed |
| `verify-daily-content.tsx` | Passed |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed, 0 errors; two pre-existing warnings in `public/sw.js` |
| `npm run build` | Passed, production build with Supabase disabled |
| `git diff --check` | Passed |
| Production-build HTTP smoke checks | `/review` returned 200 |

`verify-learnings-backup.ts` takes an export file argument and was not run; it is unrelated to this phase.

### Focused tests

The new suite (`scripts/verify-review-charts.tsx`) is split into what the charts are *given* and what they *render*, so a chart that draws the wrong number fails even when the selector underneath is right:

- seven day buckets in Monday → Sunday order; **zero day present with a `0`**;
- a paused gap excluded (two runs of 10 min either side of a 20-min pause = 20 min, not 40);
- runs entering and leaving the week clipped at the boundary, not dropped or doubled;
- bars, project rows, goal rows and the section total all reconcile to the same number;
- the unassigned row keeps unlinked work *and* work whose project was deleted, and no row is invented for a deleted project id;
- a 95-second run proves labels are not silently rounded to whole minutes;
- exact midnight split (20/20), exact weekly total and exact project totals, asserted only when the fixture week contains no DST transition (the conservation checks run either way);
- no saved sessions → seven zero bars and **no** project rows, never a history back-filled from lifetime totals;
- DOM: bar count and date keys, every bar printing its own value, the `sr-only` sentence carrying seconds-level precision, the chart announcing "6 of 7 days", the orphaned-task disclosure, share percentages, week navigation recomputing both charts, and the previous week showing the 1h that belongs to it;
- Monthly: its own total, both figures-differ sentences, and the empty-month notice;
- the pre-existing disclosures (migration 006, "not a migration date", current-links attribution, "By goal") are still on screen.

### Mobile layout

Because the page-level audit proves nothing overflows but cannot prove a bar label is legible, the new checks name the gap explicitly:

1. **The charts must actually be on screen** when the Review tabs are audited (`Review · Weekly renders all seven day bars`).
2. **One column must fit its label.** A 320px phone gives the Review page 280px after `px-5`, the card spends 16px a side on `p-4`, and six 4px gaps sit between seven columns — a budget of 32px per column. The measured column is **21px**. A wider label format would fail this rather than silently wrap.

The `min-w-0` that would have let the sizer treat a column as shrinkable was deliberately **not** used, so the floor it measures is real.

## Manual preview testing

The live preview serves the production build on port 3000, bound to `0.0.0.0`, with **Supabase disabled**. Changes persist only in that preview origin's browser storage. Do not sign in with a production account or import test data into production.

For a reproducible sample, download `fixtures/focusdesk-review-charts-preview.json` and, **only in the isolated preview**, use Settings → Data → Import (JSON). This replaces preview-local data, so export anything you want to keep first. The fixture is inert and is never auto-imported. It disables automatic carry-forward; otherwise that existing feature legitimately moves overdue schedules to today.

The fixture is relative to **2026-10-10**; view **Review → Weekly, Oct 5–11, 2026 (Week 41)** with the browser timezone set to **Asia/Kolkata**.

In the "Recorded focused time this week" card:

- **Total: 5h 40m** (20,415 seconds) — not the completed task's 10-hour lifetime total.
- **Days:** Mon `3h25` · Tue `52m` · Wed `20m` · Thu `27m` · Fri `7m` · **Sat `0`** · Sun `30m`.
- **Projects:** Project with recorded focus **4h 35m · 81%** · *Operations and Maintenance Programme — a deliberately long project name* **50 min · 15%** · **No project 15 min · 4%** (percentages sum to 100).
- **"No project" footnote:** *includes 1 task whose project no longer exists*.
- **Total recorded** under the bars: 5h 40m, matching the card header.

Also check:

1. **Saturday reads `0`, not blank.** It holds a zero-length run and an archived task's run. Both are correctly excluded and the slot is still there.
2. **Hover / focus a bar** (or read it with a screen reader): the tooltip and the `sr-only` text give the full weekday, date and seconds-exact value — e.g. Tuesday is *51 min 35 sec*, Fri is *6 min 40 sec*, while the printed label rounds to `52m` / `7m`.
3. **Press ‹ Previous week:** total becomes **1h**, and the only non-zero bar is **Sun Oct 4** — the part of the Sunday→Monday run that belongs to that week. Nothing is duplicated into Oct 5.
4. **Press ‹ again:** `0 min recorded`, seven `0` bars, no project rows, and the "does not mean no work was done" notice.
5. **Review → Monthly (October 2026):** the new card reads **7h 10m** and the "Month in review" card above it reads **Focused time 10h**. Both are correct and the card explains why they differ. The project rows are 6h 5m / 50 min / 15 min.
6. **Phone widths 320 / 360 / 390 / 430px:** every bar label stays on one line, the long project name truncates with a full title on hover, nothing scrolls sideways, and the last row clears the bottom nav.
7. **Light and dark theme:** bars use the accent token and read correctly in both; no hard-coded colours.
8. **Keyboard:** tab through the charts — the bars themselves are not focus stops (they are data, not controls), and every value is reachable as text.
9. **Start a timer now and let it checkpoint:** the bar for today grows at the next checkpoint or pause, not before. That is deliberate.

Stop after manual testing for approval. Nothing has been merged.

## Files

**New**

| File | Purpose |
|---|---|
| `components/review/focus-by-day-chart.tsx` | Chart 1. Presentational, no data access. |
| `components/review/focus-by-project-chart.tsx` | Chart 2. Presentational, no data access. |
| `scripts/verify-review-charts.tsx` | 61 checks × 3 timezones. |
| `fixtures/focusdesk-review-charts-preview.json` | Inert preview fixture; never imported by app code. |

**Modified**

| File | Change |
|---|---|
| `components/review/weekly-review.tsx` | "By day" and "By project" text rows replaced by the charts; heading, total, "By goal" list and every disclosure untouched. |
| `components/review/monthly-review.tsx` | One new "Recorded focused time this month" card; nothing existing changed. |
| `lib/selectors.ts` | `PeriodFocusedTime.orphanedTaskCount` added (one line, additive). |
| `lib/dates.ts` | `compactFocusedTime()` — the label format that fits a 32px column. |
| `scripts/verify-mobile-layout.tsx` | Review fixture extended with multi-day sessions, a long project name, unlinked work and a deleted-project task; two new Review assertions. |
| `README.md` | Focused-time section updated. |

**Not touched:** `package.json`, `package-lock.json`, `supabase/schema.sql`, `supabase/migrations/*`, `lib/types.ts` data shapes, `lib/store/*`, `lib/timer.ts`, `components/review/daily-review.tsx`, `components/review/review-screen.tsx`, `components/layout/nav.ts`.
