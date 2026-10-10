# FocusDesk — Product Effectiveness Audit

**Date:** 2026-10-09 · **Scope:** `main` @ `6eaeef0` · Audit only — no application code, schema, or data was modified.

This audit inspects the shipped codebase to answer three questions:

- **Execution:** Am I completing the work I plan?
- **Focus:** Is my time going towards important goals?
- **Outcomes:** Are my goals and milestones actually progressing?

Method: every claim below is grounded in the actual source (`lib/types.ts`, `lib/selectors.ts`, `lib/store/*`, `components/**`, `supabase/*`). Existing features were verified before any gap was called a gap.

---

## 1. What the app already does (verified in code)

| Area | What exists today | Where |
|---|---|---|
| Today / daily priorities | "ONE thing that matters most today" card with Focus Mode + dedicated priority timer; tasks for today grouped by Priority / Other / Optional; day progress segments (done/total %); planned-minutes total; approaching-deadline banner; link into Daily Review | `components/today/*` |
| Tasks | Filters: All / Today / Upcoming / Unscheduled / Someday / Completed / Cancelled, plus project & goal dropdowns, free-text search (title/notes/tags), 8 sort orders (deadline, scheduled, priority, created × asc/desc), bulk select + safe bulk delete with explicit consequence dialog | `components/tasks/tasks-screen.tsx` |
| Goals / Projects / Milestones | Goal → Project → ProjectMilestone → Task hierarchy, enforced in app + Postgres FKs; per-project and per-goal completion progress bars (done/total tasks); per-project focused-time totals; status lifecycle (active / on_hold / completed / archived); bulk delete with detach semantics | `components/projects/*`, `components/goals/*`, `lib/project-milestones.ts` |
| Timer / focused time | Per-task start/pause/resume/finish persisted as durable timestamps; one `timer_sessions` row per continuous run, split across local days on read (midnight-safe, pause-excluding); running timers recover after app close; global Timer Dock + PiP; Focus Mode for one thing at a time | `lib/timer.ts`, `lib/selectors.ts`, `components/layout/timer-dock.tsx` |
| Habits / reviews | Fixed 4-item well-being check-in (Jogging + 3× Nitnem) — deliberately *not* a habit tracker; Daily review with the honest yes/no question and recovery actions (move, reschedule, set deadline, break down, someday, cancel); Weekly review (stats + primary weekly priority); Monthly review (priorities linked to goal/project with real progress) | `components/today/wellbeing-card.tsx`, `components/review/*` |
| Analytics / progress | Daily stats (completed, postponed, cancelled, priority done, focused time); weekly stats (same + daily-priority ratio + projects worked on with focused seconds); monthly stats (completed, project progress, **repeatedly-postponed tasks ≥3×**, focused time); Calendar with per-day focused time + per-task breakdown and monthly focused time / days worked | `lib/selectors.ts`, `components/review/*`, `components/calendar/calendar-screen.tsx` |
| Postponement / overdue visibility | `postponementCount` tracked per task and per daily priority; ≥3× badge on task rows and recovery prompt in daily review; overdue deadline badge ("Overdue", red) on task rows; `overdueTasks()` selector exists in `lib/selectors.ts` | `lib/selectors.ts:382`, `components/tasks/task-row.tsx:84` |
| Data quality | Single `useData()` service layer over `LocalRepository` / `SupabaseRepository`; idempotent migrations 002–008; JSON export/import (backup + additive project-plan import with full validation and preview); local-first fallback when env vars absent | `lib/store/*`, `lib/project-plan.ts` |
| Mobile | Installable PWA; bottom nav (Today / Tasks / Inbox / + / More); one-tap capture from anywhere via `+` button (keyboard shortcut `Ctrl+Shift+Space` on desktop); timer dock collapsed by default on small screens; filters stacked to avoid horizontal scroll | `components/layout/mobile-nav.tsx`, `components/layout/quick-add.tsx` |

**Notably absent (verified, not assumed):** no voice input anywhere (grep for speech APIs returns nothing), no Kanban/grid view (single list view), no saved/named task views (filter state is ephemeral React state), no "last worked on" timestamp on projects, no weekly *focused-time-by-day* series (weekly review reports focused time only for *completed* tasks).

---

## 2. Evaluation against the three outcomes

### Execution — "Am I completing the work I plan?" → **Mostly answered**
Daily review, progress segments, postponed/cancelled counts and the ≥3×-postponed warning answer this well at day and week granularity. The one structural hole: `overdueTasks()` exists but is **never rendered anywhere** — overdue *scheduled* tasks (as opposed to deadline-overdue) get no cross-screen surface; they silently sit in "All". Automatic carry-forward partially masks this by moving them to today (if the setting is on).

### Focus — "Is my time going towards important goals?" → **Partially answered**
Focused time is measured rigorously (sessions, day attribution) and attributed per task and per *completed-task-per-project* in weekly/monthly review and Calendar. What is missing is **time attributed to open work by goal/project over a period** — e.g. "this week I spent 6 h on Goal X vs 1 h on everything else." `timer_sessions` carry `taskId`, and tasks carry `projectId`/`goalId`, so this is computable today — but nothing computes it. The weekly review's `projectsWorkedOn` only counts *completed* tasks' lifetime totals, which overstates the week (a task finished this week after 3 weeks of work credits its whole total to this week).

### Outcomes — "Are my goals and milestones actually progressing?" → **Weakest**
Progress bars show done/total tasks per goal and project — a static fraction. There is no notion of *movement*: no last-activity signal on projects/goals/milestones, no milestone-level progress (a milestone is deliberately minimal — no status, no completion figure), and no warning when a project with a deadline hasn't had a completion or timer session in N days. Project deadline display is a neutral date string unless it's in the future (then merely orange text).

---

## 3. Specific assessments requested

### a) Outcome-oriented dashboard — **unnecessary as a new screen; useful as an upgrade of Today**
Today already *is* the dashboard: priority, progress %, planned minutes, deadline warnings, end-of-day review link. A separate dashboard screen would duplicate it and violate the "no redundant dashboards" constraint. The real gap is narrower: Today shows *approaching* deadlines but not **overdue scheduled tasks** and not **stalled projects** (see (c)). Add those two compact warning strips to Today instead of a new screen. **Priority: essential (as an extension of Today), unnecessary (as a separate dashboard).** No schema change.

### b) Weekly execution & focused-time analytics — **mostly exists; two precise gaps**
Weekly review already has completed/postponed/cancelled, daily-priority ratio, and per-project rows. Gaps:
1. **Focused time per day of the week** — `focusedSecondsByDay()` already exists and is used by Calendar; the weekly review simply doesn't call it. One selector + a plain text/row list (not a chart) closes it.
2. **Focused time per project/goal for the week** — computable from `timerSessions` × task links; currently the per-project figure uses completed tasks' lifetime totals (misleading, see Focus above).

**Priority: essential (gap 2 is what makes "is my time going to important goals" answerable).** No schema change; low risk; reuses verified selectors.

### c) Overdue / stalled project warnings — **verified gap**
- Overdue *scheduled* tasks: selector exists (`overdueTasks`), rendered nowhere. Task rows show "Overdue" only for `dueDate`, and only inside a list you happen to open.
- Stalled projects: nothing exists. A project is stalled if it is `active`, has open tasks, and has had no task completion and no timer session in N days (both signals are already recorded: `completedAt` and `timer_sessions.endedAt`). Deadline-at-risk ("deadline in 14 days, 20% done") is also computable from existing fields.

**User benefit: high** — this is the only one of the three outcome questions the app cannot currently answer without manual inspection. **Complexity: low-medium** (pure selectors + a warning section on Today and/or Projects). **Risks: false positives** (deliberately paused projects — mitigated because `on_hold` status exists and excludes them; N should be conservative, e.g. 14 days). **Existing data: sufficient.** No schema change. **Priority: essential.**

### d) Better task filters / saved views — **useful later**
Current filters cover status, schedule, project, goal, search, and 8 sorts — strong for a single-user app. Verified gaps: no filter by **overdue** (selector exists, no UI tab), no filter by **postponed ≥3×** (data exists), no saved/named filter combinations (state resets every visit). The first two are one-line filter additions; saved views are a small persisted-state feature. **Priority: useful later** — add "Overdue" and "Stalled (postponed 3×+)" filter tabs now-adjacent, defer saved views until the need is felt. No schema change (saved views could live in `app_settings` JSON if ever added).

### e) Task grid / Kanban view — **unnecessary**
The app has no status columns worth kanban-ing: its statuses are a planning lifecycle (`created → planned → today → in_progress → completed`), not a board workflow, and Today already presents the operative slice grouped by priority. Drag-and-drop adds maintenance and mobile fragility without changing any decision. A grid of task cards adds no information over the current row list. **Priority: unnecessary.**

### f) Faster task capture, eventually voice-first — **partially exists; voice is worth doing later**
Capture is already fast: one global modal (1 interaction on mobile via the `+` FAB, one shortcut on desktop), title-only, lands in Inbox. Verified gap: **no voice input anywhere**. Browser SpeechRecognition (or a small dictation button in Quick Add) is a self-contained addition — one component, no schema, degrades gracefully where unsupported. It genuinely reduces mobile friction (typing on a phone is the slowest step in the loop). **Priority: useful later** (capture is already good; voice is a comfort improvement, not a decision improvement). No schema change.

---

## 4. Data quality & reliability of metrics

- **Focused time is trustworthy and precisely scoped.** Sessions record credited active seconds; pauses end sessions; midnight spans split proportionally; the sum of a task's sessions never exceeds its total. Documented limitation: time recorded before migration 006 has no day information and is deliberately not backfilled — daily focused time starts from the first post-migration session. Historical *per-day* analytics before that date are impossible by design; monthly totals still work from `completedAt` + `actualDurationSeconds`.
- **Completion dates are reliable** (`completed_at` migration 002; legacy completed tasks without it fall back to scheduled date — documented, never invented).
- **Known systematic bias (fixable in Phase 1):** weekly/monthly "focused seconds" and per-project focused time derive from *completed* tasks' lifetime totals, so long-running tasks over-credit the completion week. The sessions table is the unbiased source and already exists.
- Local and Supabase repositories share one normalize path (`normalizeAppData`), idempotent and lossless across legacy formats. Export/import is a genuine escape hatch.
- **Conclusion:** all metrics proposed in §5 are calculable from existing tables. **No schema or migration changes are required for anything recommended below.**

---

## 5. Recommended implementation phases (max three, nothing implemented now)

> Each item: what exists → gap → benefit → complexity/risk → data sufficiency → priority → schema impact.

### Phase 1 — Make Today answer all three questions (essential)
1. **Overdue & stalled warnings on Today.** Exists: `overdueTasks()` selector, deadline banner, postponement badges. Gap: never surfaced. Benefit: nothing planned-then-slipped stays invisible. Complexity: low (selector + small section). Risk: false positives → exclude `on_hold` projects and `someday` tasks; conservative thresholds. Data: sufficient. **No schema change.**
2. **Weekly focused time by goal/project in Weekly Review, from `timer_sessions`.** Exists: sessions table, day attribution, `sessionSecondsByDay`. Gap: weekly review uses completed-task lifetime totals (biased). Benefit: directly answers "is my time going to important goals?" Complexity: low-medium (new pure selector `focusedSecondsByProjectInRange` + list rows, no charts). Risk: low. Data: sufficient post-migration-006; show "recorded since …" honestly before it. **No schema change.**
3. **"Overdue" and "Stalled (3×+)" tabs in Tasks filters.** Exists: all data and selectors. Gap: two filter branches. Complexity: trivial. **No schema change.**

### Phase 2 — Project/milestone movement signals (essential, small)
4. **Last-activity + at-risk line on project cards.** Exists: `completedAt`, sessions, deadline, progress. Gap: no movement signal. Benefit: outcome question answered at a glance on Projects; supports stall decisions (hold / descope / recommit). Complexity: low (derive "last completion / last focus session" per project; "deadline in N days, X% done"). Risk: keep it textual, no scores. Data: sufficient. **No schema change.**
5. **Milestone progress counts in the milestone section headers** (done/total tasks per milestone — milestones deliberately have no status field, and should stay that way). Complexity: trivial. **No schema change.**

### Phase 3 — Capture comfort (useful later)
6. **Voice input in Quick Add** (SpeechRecognition where supported, hidden otherwise). Benefit: fastest capture on mobile. Complexity: medium (browser API variance, permissions UX); risk: keep as progressive enhancement only, never a second capture path. Data: n/a. **No schema change.** Defer "voice-first" beyond dictation until Phase 1–2 prove their value.

### Explicitly rejected (per constraints and evidence)
- Separate outcome/analytics dashboard screen — duplicates Today/Review.
- Kanban/grid views — no decision benefit, mobile drag-and-drop cost.
- Charts, streaks, scores, gamification — decorative; the codebase's "facts, no judgment" stance is a strength.
- A general habit tracker — duplicates the deliberately fixed well-being check-ins.
- Any schema/migration work — nothing recommended needs it. (Note: migration 008 for Project Milestones is prepared but not yet applied to production; that is an ops step, not new work.)

---

## 6. Interaction-cost spot check (mobile)

| Common action | Interactions today |
|---|---|
| Capture a thought | 1 tap (`+`) → type → Enter = **3** |
| Set today's priority | Open Today (1) → type → Set = **3** |
| Complete a task | Open Today/Tasks (1) → tap checkbox = **2** |
| Start focus timer on a task | Tasks (1) → row timer button (1) = **2** |
| Move a task to tomorrow | Row → ⋯ menu → Postpone → tomorrow = **4** |
| Review the week | More (1) → Review (1) → Weekly tab (1) = **3** |

Capture and daily execution are already at or near the floor; the only >3-tap flow (postpone) is intentionally deliberate. Voice (Phase 3) would bring capture to 2.

---

**Audit complete. No code, schema, or data was changed. Awaiting approval before any implementation.**
