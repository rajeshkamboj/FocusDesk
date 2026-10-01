# Pace — Personal Execution System

A calm, installable (PWA) personal task system built with **Next.js (App Router) · TypeScript · Tailwind CSS**, ready for **GitHub → Vercel → Supabase**.

It asks — never tells — *What is the ONE thing that matters most today?*
The app ships with **zero predefined content**: you create every project, goal, task, idea and priority.

> Note: this repository also contains unrelated PatientScure content (`content ready json/`, `json importer/`, `Project-Overview.md`). The app ignores those files.

## Sections
Today · Inbox · Tasks · Projects · Goals · Calendar · Review (daily / weekly / monthly planning) · Ideas · Settings
Plus: Focus Mode (🔥 Start Priority), a quiet task timer (start/pause/finish — stores actual time next to the estimate), global quick capture (**Ctrl + Shift + Space**), postponement tracking, task history, light/dark/system theme and JSON export/import.

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
2. For an existing database, apply the idempotent migrations in `supabase/migrations/` (`003_task_timer.sql` adds the task-timer columns, `004_daily_wellbeing.sql` adds the `wellbeing_days` table used by the Today page's Daily well-being section, with RLS scoped to `auth.uid()`).
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
public/sw.js, manifest.webmanifest, icons/   PWA
```
The UI only talks to `useData()`. Backends implement `AppRepository`, so you can swap storage without touching the UI. Future AI features (plan my day, break down, summarize week) can be added as services on top of the same layer.

## PWA installation
Open the deployed site in Chrome or Edge and click **Install** in the address bar. To launch it when Windows starts, press `Win + R`, type `shell:startup`, and put the installed app's shortcut there.

## Workflow check
`scripts/verify-workflow.tsx` runs the full workflow headlessly (priority → tasks → complete → move to tomorrow → postponement count → deadline → weekly stats → next week's priority → persistence):
```bash
npm i --no-save jsdom tsx && npx tsx scripts/verify-workflow.tsx
```

`scripts/verify-review-stats.ts` checks the Review date semantics in isolation — completed work is dated by `completedAt` (when the work actually happened), planned work by `scheduledDate` (when it was meant to happen). No DOM needed, and it is worth running in more than one timezone since completion is matched on the **local** calendar day:
```bash
npx tsx scripts/verify-review-stats.ts
TZ=Asia/Kolkata npx tsx scripts/verify-review-stats.ts
TZ=America/New_York npx tsx scripts/verify-review-stats.ts
```

## Known limitations (v1)
- Reminders fire only while the app is open. Background push needs a backend.
- Supabase mode has no auth or sync conflict handling yet, so it's single-user only.
- Recurrence is in the data model but has no UI yet.
