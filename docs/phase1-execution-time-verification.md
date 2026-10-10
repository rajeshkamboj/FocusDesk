# Phase 1 — Execution & Time Accuracy

Implemented 2026-10-10 on `arena/13fdae23-focusdesk`, based on latest fetched `origin/main` (`6eaeef0`). Arena fixes the session branch; no other branch or `main` was changed. No merge, migration, production-data access, runtime dependency, or lockfile change.

## Behavior

- Today surfaces overdue **scheduled** work, separate from missed deadlines. A task with both dates overdue appears once with “deadline also overdue.” Warnings omit on-hold projects and Someday tasks. Active projects with open work and 14+ local days without a recorded completion/session are prompted for review. Creation is the baseline when no activity exists; running timers suppress stalls. These are recorded-activity prompts, not claims about work outside the app.
- Weekly Review now attributes saved session seconds inside the selected local week, split at midnight by the existing Calendar helper. It includes unfinished work and excludes paused gaps; current task/project/goal links drive attribution. A valid direct task goal takes precedence over the project goal. Unassigned rows prevent dropped time. On-hold/Someday work retains its real recorded time; only warnings exclude it. Archived/deleted tasks follow the Calendar's existing exclusion policy. Concurrent timers sum recorded seconds, not unique wall-clock time.
- Daily rows, project/goal breakdowns and an explicit pre-migration-006 history limitation appear within Weekly Review. First available session is not presented as a migration date. Live uncheckpointed seconds are deliberately not inferred.
- Overdue and Postponed 3×+ filters compose with existing search, project/goal scope, sorts, selection and bulk-delete flows. Filters remain ephemeral; no saved views. On-hold tasks remain available in explicit task filters (they are excluded from Today nudges).
- Existing weekly completion/cancellation/postponement counts and their date semantics are intentionally unchanged. Daily/Monthly Review and Calendar calculations are unchanged; this phase does not reconcile their differing historical time semantics.

## Verification performed

All final commands below exited 0:

| Check | Result |
| --- | --- |
| `verify-phase1-execution-time.tsx` | 38 assertions each in Asia/Kolkata, America/New_York and Pacific/Chatham (114 total) |
| `verify-focused-time.tsx` | Passed in all three timezones |
| `verify-workflow.tsx` | Passed; weekly-time expectation now reconciles to saved sessions |
| `verify-bulk-delete.tsx` | Passed |
| `verify-review-stats.ts` | Passed |
| `verify-phase7-completion-date.tsx` | Passed |
| `verify-timer-concurrency.tsx` | Passed |
| `verify-multi-tab.tsx` | Passed |
| `verify-timer-dock.tsx` | Passed |
| `verify-learnings-project-milestones.tsx` | Passed |
| `verify-project-plan-import.tsx` | Passed |
| `verify-project-plan-add-to-existing.tsx` | Passed |
| `verify-priority-input.tsx` | Passed |
| `verify-daily-content.tsx` | Passed |
| `verify-mobile-layout.tsx` | Passed with populated warning/session fixtures and compiled CSS; phone widths 320/360/390/430 plus desktop |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed, 0 errors; two existing warnings in `public/sw.js` |
| `npm run build` | Passed, production build with Supabase disabled |
| `git diff --check` | Passed |
| Production-build HTTP smoke checks | `/today`, `/tasks`, `/review` returned 200; Tasks also accepted a preview-style Host header |

Focused tests cover week start/end inclusion/exclusion, midnight splits, rounding, DST and year boundaries, paused gaps, open/completed tasks, project/goal reassignment and precedence, unassigned/dangling links, legacy totals without sessions, exact 14-day stalls, on-hold/Someday exclusions, zero-length sessions, repeated postponements, warning deduplication, week navigation, composed filters/sorting, selection and bulk deletion/cancellation.

Tests use local jsdom storage and fake backends, never production. Existing optional `jsdom`/`tsx` tooling was installed without changing package manifests or lockfiles. Build log and scratch baseline checkout are outside the repository.

### Pre-existing issues, separately verified

- Unmodified latest `main` fails two assertions in `verify-mobile-layout.tsx`: it counts the already-existing sort select as a scope select. Confirmed by building a separate archive of `origin/main` and running its unchanged script. Those test assumptions are corrected; the sort width is now checked independently. The old seven-filter assertion was also updated for this phase's nine filters. No application layout was changed to satisfy stale assertions.
- Lint's two unused-event warnings in `public/sw.js` exist on baseline `main` and remain unchanged.
- `npm ci` reported seven high-severity dependency advisories on the existing lockfile. No dependency remediation was attempted in this scoped phase.
- No final regression failures remain. There is no browser engine installed in the sandbox, so the jsdom/compiled-CSS mobile check is **not** browser visual or accessibility certification. Manual preview testing remains pending. No production test was performed.

## Manual preview testing

The live preview serves the production build on port 3000, bound to `0.0.0.0`, with **Supabase disabled**. Changes here persist only in that preview origin's browser storage. Do not use a signed-in production account or import test data into production.

For a reproducible sample, download `fixtures/focusdesk-phase1-preview.json` and, **only in the isolated preview**, use Settings → Data → Import (JSON). This replaces preview-local data, so export any preview data first if needed. The fixture is inert and is never auto-imported. It disables automatic carry-forward; otherwise that existing feature legitimately moves overdue schedules to today.

The fixture is relative to 2026-10-10; view **Weekly Review, Oct 5–11, 2026**, using Asia/Kolkata browser timezone:

- Recorded total: **1h 20m** (4,800 seconds), not either legacy task's 10-hour lifetime total.
- Days: Mon 40m, Tue 10m, Wed 10m, Thu 15m, Fri 5m, Sat/Sun 0 recorded.
- Projects: recorded-focus project 1h; held project 15m; Someday-only project 5m.
- Goals: Important work 1h 15m; Personal 5m.
- Previous week includes only the Sunday 10-minute part of the Sunday/Monday crossing.

On Today (2026-10-10), expect two overdue schedules, one separate deadline-only warning, and one stalled-project prompt. The dual-overdue task must appear once. Held and Someday work must not be nudged. If testing later, dates and stall eligibility naturally advance; use the focused automated fixtures for fixed-date boundary assertions.

Also test:

1. Change the stalled project to On Hold: its stalled prompt disappears. Record a timer session or complete a task in it: it ceases to be stalled.
2. Tasks → Overdue / Postponed 3×+: combine search, project/goal scopes and each sort. Select matching rows; cancel deletion and verify no change, then delete disposable rows and verify only the selection and its sessions disappear.
3. Start, pause, wait, resume, pause a task. Weekly totals include both active runs, not the waiting gap. Untimed completion adds no focused time. A running timer's uncheckpointed remainder is not yet in this saved-session view.
4. Reassign a timed task to a different project/direct goal: weekly attribution follows current relationships without increasing the total.
5. Navigate to a week with no sessions: see “0 min recorded,” the no-work-inference notice and migration-006 limitation, not fabricated legacy history.
6. Check 320–430px phone widths: warning text wraps; task filters scroll inside their strip; time rows and the disclosure are keyboard/touch accessible. Check desktop as well.

Stop after manual testing for approval. Nothing has been merged.
