# Pace — Personal Execution System

A calm, installable (PWA) personal task system built with **Next.js (App Router) · TypeScript · Tailwind CSS**, ready for **GitHub → Vercel → Supabase**.

It asks — never tells — *What is the ONE thing that matters most today?*
The app ships with **zero predefined content**: you create every project, goal, task, idea and priority.

> Note: this repository also contains unrelated PatientScure content (`content ready json/`, `json importer/`, `Project-Overview.md`). The app ignores those files.

## Sections
Today · Inbox · Tasks · Projects · Goals · Calendar · Review (daily / weekly / monthly planning) · Ideas · Settings
Plus: Focus Mode (🔥 Start Priority), a quiet task timer (start/pause/finish — stores actual time next to the estimate), global quick capture (**Ctrl + Shift + Space**), postponement tracking, task history, light/dark/system theme and JSON export/import.

### Focused time
The Calendar shows **focused time** per day (with an optional per-task breakdown) and a two-line monthly summary. It is exactly *the amount of time recorded by FocusDesk task timers* — not a claim about every minute you worked, which is why it is never called "work hours".

It is attributed from **timer sessions**: one record per continuous run of the timer, between a Start/Resume and the next Pause/Finish. A task's `actualDurationSeconds` stays what it always was — its lifetime total — so a task worked 45 min on Monday and 30 min on Tuesday reports 45 m and 30 m on the right days instead of 1 h 15 m on both. A run that crosses midnight is stored as the single run it was and split across the two local calendar days when read, so nothing is double counted. Paused time is never part of a run, and closing the app stops a run at the same durable checkpoint the task itself recovers to.

## Local setup
```bash
npm install
cp .env.example .env.local   # optional — leave empty to use browser storage
npm run dev                  # http://localhost:3000
```

## Environment variables
| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase **public anon** key |

If either is missing, data is stored in the browser (`localStorage`). **Never** put the service-role key into any `NEXT_PUBLIC_*` variable or into frontend code.

## Build
```bash
npm run lint
npm run build && npm start
```

## Deployment (Vercel)
1. Push to GitHub and import the repo in Vercel (framework: Next.js, defaults are fine).
2. Add the two environment variables above (optional).
3. Deploy.

## Supabase setup
1. Create a project, open the SQL editor and run `supabase/schema.sql`.
2. Apply the idempotent migrations in `supabase/migrations/` in order for both new and existing databases. In particular, `003_task_timer.sql` adds task-timer columns, `004_daily_wellbeing.sql` creates the user-scoped `wellbeing_days` table, `005_task_subtasks.sql` creates the user-scoped `subtasks` table with RLS, and `006_timer_sessions.sql` creates the user-scoped `timer_sessions` table that makes daily focused time possible (the migration explains why the pre-existing columns could not answer it). Time recorded before that migration has no day information anywhere, so it is deliberately not backfilled — daily focused time starts accumulating from the first run recorded afterwards.
   `007_milestones.sql` creates the `milestones` table that backs the **Learnings** timeline (the feature was renamed in Phase 3; the table keeps its name). `008_project_milestones.sql` adds Project Milestones — it is **prepared but not yet applied to production**; until it runs, the app detects the missing table/column and simply keeps Project Milestones switched off (Settings → Data shows the status). See *Learnings & Project Milestones* below.
3. Copy the project URL and anon key into the env vars.
4. **Before real use, enable Row Level Security and add auth-based policies.** The anon key is public, and the schema ships without auth because v1 is single-user. The app switches to `SupabaseRepository` automatically when the variables are set.

## Architecture
```
app/                  routes (thin wrappers)
components/<feature>/ screens + feature components
components/ui/        reusable UI kit
components/data/      DataProvider — service layer (all writes + task history)
lib/types.ts          data model
lib/store/            repository interface, LocalRepository, SupabaseRepository
lib/selectors.ts      pure derived stats (review, progress)
lib/project-plan.ts   the ChatGPT project-plan format: parse, validate, resolve, preview
docs/                 format documentation (focusdesk-project-plan-v1.md)
fixtures/             sample plans used by the checks and the preview — never imported into production
public/sw.js, manifest.webmanifest, icons/   PWA
```
The UI only talks to `useData()`. Backends implement `AppRepository`, so you can swap storage without touching the UI. Future AI features (plan my day, break down, summarize week) can be added as services on top of the same layer.

## Learnings & Project Milestones
Two different things that used to share a word:

- **Learnings** (`/learnings`, formerly "Milestones") — the personal learning timeline: when a tool, framework or idea was first picked up, with honest partial dates (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`). Code: `Learning` in `lib/types.ts`, `lib/learnings*.ts`, `components/learnings/`. In Supabase the records still live in the `milestones` table (`LEARNINGS_TABLE` in `lib/store/supabase-repository.ts`); nothing in the data changed. `/milestones` redirects to `/learnings`.
- **Project Milestones** — structure inside a project: **Goal → Project → ProjectMilestone → Task**. A task may have no milestone; if it has one, the milestone belongs to the task's own project. That is enforced three times over: in the app (`lib/project-milestones.ts`), in the local repository, and in PostgreSQL by foreign keys — `(project_id, user_id) → projects (id, user_id)` so a milestone can only sit in a project its owner owns, and `(project_milestone_id, project_id) → project_milestones (id, project_id)` so a task can only carry a milestone of its own project. Deleting a milestone keeps its tasks and clears their link; deleting a project removes its milestones and, as before, keeps its tasks. Order is manual (`position`). Shown inside each project on the Projects screen and as a "Milestone" field in the task form.

Compatibility: old local data (`pace.db.v1`), old device backups (`pace.backup.v1`) and old JSON exports keep the timeline under `milestones`; they are read as Learnings by `lib/store/normalize.ts` — the single, idempotent, lossless migration path — and never as Project Milestones. New exports contain `learnings` and `projectMilestones` only.

## Import a project plan (ChatGPT JSON)
**Settings → Data → Import Project Plan** turns a plan you generated in ChatGPT into real records — a whole **Goal → Project → Project Milestone → Task** tree instead of dozens of hand-typed tasks. The format is `focusdesk-project-plan` version 1; it is documented in full (structure, rules, invalid examples and a copy-paste prompt for ChatGPT) in [`docs/focusdesk-project-plan-v1.md`](docs/focusdesk-project-plan-v1.md), and a realistic sample plan lives in `fixtures/focusdesk-project-plan-v1.json` (used by the checks and for previewing — never imported into production).

```jsonc
{ "format": "focusdesk-project-plan", "version": 1,
  "goal": { "name": "Ship Cambuz PDF Reader" },
  "projects": [{ "name": "Cambuz PDF Reader", "deadline": "2027-03-31",
    "milestones": [{ "id": "m1", "name": "Foundation", "targetDate": "2026-10-20",
      "tasks": [{ "title": "Set up the project structure", "dueDate": "2026-10-09", "priority": "high" }] }],
    "tasks": [{ "title": "Decide the pricing model" }] }],
  "tasks": [{ "title": "A task with no project" }] }
```

The flow is paste (or choose a file) → parse → validate → **preview** → confirm → import → result. Nothing is written until you press Import, and the preview shows the counts, the whole hierarchy, every date and any warning.

The importer has two modes:

- **Create New Project** — creates the plan's goal, projects, project milestones and tasks.
- **Add to Existing Project** — adds the plan's milestones and tasks to one project you already have. The preview is a diff: imported milestones whose normalized name exactly matches an existing milestone of that project are *reused* (never modified — you can always choose "Create new" instead), new milestones are appended after the existing ones, and every task is created new inside the target project (the plan's top-level tasks become project-level tasks). The target project, its goal, its existing milestones and its existing tasks are never touched, and the plan's goal and project are metadata only — they are never created. See the "Add to Existing Project" section of the format doc.

It is deliberately the opposite of *Import (JSON)*, which replaces the database:

- **Additive only.** The format has no update and no delete. Existing goals, projects, tasks, project milestones, learnings, priorities and timer sessions are untouched; a plan can only create new records. Each entry point also recognises the other's payload and refuses it, so a plan can never be fed to the restoring import (or a backup to the plan importer).
- **Validated as a whole first.** A missing name or title, a malformed or impossible date, an unsupported status, an unknown or duplicate temporary id, a milestone in a project that is not in the plan, or a task carrying a milestone of *another* project refuses the entire plan. Warnings (no goal, a past deadline, a task with no milestone, a field FocusDesk does not have) are shown and change nothing.
- **All or nothing.** Local storage writes a plan in one store operation. Supabase has no cross-table transaction over PostgREST, so records go in parents-first — goals → projects → project milestones → tasks — in whole batches, and if any request fails the rows that did land are deleted again and the failure is reported rather than presented as a success.
- **Temporary ids stay temporary.** An `id` in a plan only expresses a relationship (`milestoneId`, `projectId`); the repository mints real FocusDesk ids with the app's own generator and rewrites every reference through the map, so a plan cannot choose, collide with or address an existing record.
- **Import as new, never merged.** A project whose name already exists is reported and you are asked to confirm; FocusDesk creates a second project and leaves the existing one exactly as it was. A plan's goal is always created new — it is never matched to an existing goal by name.
- **Milestone positions come from the JSON order** (0, 1, 2 …), never from a date or a name.
- **Authenticated, RLS-respecting writes** through `useData().actions.importProjectPlan` → `AppRepository.importProjectPlan`, as the signed-in user. No API key, no service-role key, no SQL from the browser, and no AI service is called — you generate the JSON in ChatGPT yourself.

Code: `lib/project-plan.ts` (format, validation, resolution, preview — pure, no I/O), `importProjectPlan` in `lib/store/repository.ts` and both repositories, `components/settings/project-plan-import.tsx` (the UI).

## PWA installation
Open the deployed site in Chrome or Edge and click **Install** in the address bar. To launch it when Windows starts, press `Win + R`, type `shell:startup`, and put the installed app's shortcut there.

## Workflow check
`scripts/verify-workflow.tsx` runs the full workflow headlessly (priority → tasks → complete → move to tomorrow → postponement count → deadline → weekly stats → next week's priority → persistence):
```bash
npm i --no-save jsdom tsx && npx tsx scripts/verify-workflow.tsx
```

`scripts/verify-focused-time.tsx` checks daily focused time end to end — midnight crossing, pause/resume, close/reopen, several runs per task, several tasks per day, and what the Calendar renders. Days are **local** days, so run it in more than one timezone:
```bash
npm i --no-save jsdom tsx && npx tsx scripts/verify-focused-time.tsx
TZ=Asia/Kolkata     npx tsx scripts/verify-focused-time.tsx
TZ=America/New_York npx tsx scripts/verify-focused-time.tsx
```

`scripts/verify-priority-input.tsx` checks the Today's Priority field: the mobile sizing contract (border-box, 100% width, ~48px touch height, 14–16px padding, responsive font), the single-border/single-focus rule, and that focus → type → submit still works. It also reads the compiled stylesheet, so run a build first:
```bash
npm run build && npx tsx scripts/verify-priority-input.tsx
```

`scripts/verify-mobile-layout.tsx` is a headless layout audit. It reads the compiled Tailwind stylesheet out of `.next/`, resolves every class on every rendered element for a given viewport width (honouring the `sm:`/`md:`/`lg:` media blocks and stylesheet source order), and runs a CSS intrinsic-sizing pass — `min` and `max-content` per element, combined with the real flex/grid rules — over every screen in both its empty and populated state. It fails if any page forces the document wider than 320 / 360 / 390 / 430px, and prints the chain of elements that explains the excess. It also asserts the things that must stay true: no global `overflow-x: hidden`, the Tasks filter strip scrolls inside itself rather than scrolling the page, the empty state is not vertically centred, and the desktop widths and paddings are unchanged. Run a build first:
```bash
npm run build && npx tsx scripts/verify-mobile-layout.tsx
WIDTHS=300,320 npx tsx scripts/verify-mobile-layout.tsx   # probe other widths
```
Text is measured from a per-character advance table, not a real font, so text-derived numbers are estimates — it is precise about declared widths, padding, gaps and the flex/grid rules, which is where layout overflow actually comes from.

`scripts/verify-review-stats.ts` checks the Review date semantics in isolation — completed work is dated by `completedAt` (when the work actually happened), planned work by `scheduledDate` (when it was meant to happen). No DOM needed, and it is worth running in more than one timezone since completion is matched on the **local** calendar day:
```bash
npx tsx scripts/verify-review-stats.ts
TZ=Asia/Kolkata npx tsx scripts/verify-review-stats.ts
TZ=America/New_York npx tsx scripts/verify-review-stats.ts
```

`scripts/verify-multi-tab.tsx` checks that two tabs sharing one browser never overwrite each other. Two repositories over one storage are driven through the races that matter — two tabs timing different tasks, a stale tab writing after the other has moved on, a pause in one tab while the other keeps running, four timers checkpointing in turn — and the result is always re-read through a third, fresh repository, so it asserts what is actually persisted rather than what either tab believes. It also checks that opening a second tab does not pause the first tab's timers, while a tab that really closed still has its session recovered:
```bash
npm i --no-save jsdom tsx && npx tsx scripts/verify-multi-tab.tsx
```

`scripts/verify-learnings-project-milestones.tsx` checks the Phase 3 work end to end: old `milestones` data and exports loading as Learnings (record-for-record, partial dates untouched), new exports, idempotent local migration, the Supabase repository against a fake PostgREST both **before** migration 008 (no request ever names the new table/column in a write) and after it, the project/milestone/task invariant, milestone deletion, the task form's milestone selector, the project view and the `/milestones` redirect:
```bash
npm i --no-save jsdom tsx && npx tsx scripts/verify-learnings-project-milestones.tsx
```

`scripts/verify-project-milestones-sql.ts` runs `schema.sql`, migrations 002–007 and then 008 (twice) on an in-memory PostgreSQL (PGlite — never Supabase) and checks structure, idempotency, RLS isolation between two users, the delete behaviour, and that the learning rows are untouched. The integrity rules are probed **as the table owner as well as under RLS**, because foreign key checks bypass RLS — that is the only way to prove the constraint, not the policy, refuses a milestone hung on another user's project or on a different project than its task's. It also pins the two rules that are easy to get wrong: deleting a project must never leave a task pointing at a milestone that no longer exists, and a refused run must create nothing at all:
```bash
npm i --no-save @electric-sql/pglite tsx && npx tsx scripts/verify-project-milestones-sql.ts
```

`scripts/verify-project-plan-import.tsx` checks the Phase 4 project-plan importer end to end: the format itself (every valid and invalid shape — envelope, required names and titles, dates, statuses, temporary ids, broken / duplicate / cross-project references, size limits, the migration-008 gate), the resolution into records (positions from the JSON order, references rewritten to real ids, defaults a plan cannot set), `LocalRepository` (one atomic write, existing records byte-identical afterwards, a refused plan writing nothing), `SupabaseRepository` against a fake PostgREST both before and after migration 008 (parents-first inserts, correct foreign keys, every row scoped to the signed-in user, no write to the learnings table, and a **failed insert rolled back** so nothing is kept), export compatibility (`milestones` still means Learnings, `learnings` and `projectMilestones` stay apart), and the real Settings screen and importer modal in jsdom (parse → validate → preview → duplicate-name question → import → result), plus `fixtures/focusdesk-project-plan-v1.json` read from disk:
```bash
npm i --no-save jsdom tsx && npx tsx scripts/verify-project-plan-import.tsx
```

`scripts/verify-project-plan-add-to-existing.tsx` checks the Phase 5 "Add to Existing Project" mode end to end: the exactly-one-project rule, normalized exact-name milestone matching (never fuzzy), the user's mapping choices, new-milestone positions after the existing ones, task/root-task placement, the zero-writes guarantee for invalid plans, `LocalRepository` and `SupabaseRepository` (only new milestones and tasks are ever written — no goal or project row is touched — and a failed insert is rolled back), the unchanged-records fingerprints before and after, and the real modal in jsdom (mode switch → target project → mapping preview → flip a mapping → import → result):
```bash
npm i --no-save jsdom tsx && npx tsx scripts/verify-project-plan-add-to-existing.tsx
```

`scripts/verify-learnings-backup.ts` checks a real export file read-only (count, ids MD5, byte-identical round trip through the Phase 3 code):
```bash
npx tsx scripts/verify-learnings-backup.ts path/to/pace-export.json
```

Install the optional tools in one command — a later `npm i --no-save` removes packages installed by an earlier one: `npm i --no-save jsdom tsx @electric-sql/pglite`.

## Known limitations (v1)
- Reminders fire only while the app is open. Background push needs a backend.
- Supabase mode has no auth or sync conflict handling yet, so it's single-user only.
- Another tab's changes are merged safely on write, but a tab shows them only after a reload — there is no live cross-tab UI refresh.
- Recurrence is in the data model but has no UI yet.
