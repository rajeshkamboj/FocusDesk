<div align="center">
  <img src="public/icons/icon.svg" alt="Pace app icon" width="72" />
  <h1>Pace</h1>
  <p><strong>A calmer way to make meaningful progress.</strong></p>
  <p>Choose what matters today, give it your attention, and end the day with an honest picture of what moved forward.</p>
  <p>
    <a href="#the-pace-workflow">Explore the workspace</a>
    &nbsp; · &nbsp;
    <a href="#get-started">Get started</a>
  </p>
</div>

---

> **What is the one thing that matters most today?**
>
> Pace helps you answer that question—and keep the rest of your life and work in view without letting it take over the day.

## The Pace workflow

Capture what is on your mind. Decide what matters. Focus on one thing at a time. Review the day without judgment.

| **01 · Start with clarity** | **02 · Keep work connected** |
| --- | --- |
| Choose a daily priority and build a realistic task list around it. A simple progress view keeps the day in sight. | Capture loose thoughts in your Inbox, then shape them into tasks, projects, milestones, and goals when you are ready. |
| **03 · Protect your focus** | **04 · Reflect honestly** |
| Settle into full-screen Focus Mode and use a task timer to record focused time. Pause and pick up where you left off. | Daily, weekly, and monthly reviews bring together completed work, priorities, and focused time—with no scores or guilt. |

## More than a task list

Keep ideas parked until they are ready to become work. Build a personal timeline of things you have learned. When you want a change of pace, open **Curiosity** for a fresh daily mix of spoken English, history, mythology, science, reading, and brain teasers.

Your Calendar brings scheduled tasks, deadlines, priorities, and focused time into one view. Optional daily well-being check-ins and browser reminders help support the routine around the work.

## Made to feel like yours

- **Start with a blank slate.** Your priorities, tasks, projects, and goals are yours to define—nothing is pre-filled.
- **Work your way.** Use Pace on desktop or mobile, switch between light and dark themes, and install it as a progressive web app.
- **Keep your data in reach.** Browser storage works out of the box. Optional Supabase storage and JSON export/import are available when you want them.
- **Choose your reminders.** Browser notifications can surface priorities, deadlines, task reminders, and review prompts. Delivery depends on browser support and whether the app is running in the background.

## Project plan import

In **Settings → Data → Import Project Plan**, paste or upload a
`focusdesk-project-plan` **version 1** JSON file and review it before confirming.
Create new projects, or add milestones/tasks to one existing project with exact
normalized milestone-name reuse. Existing records are never overwritten.

Tasks can include recursive **`subtasks`**: full, independently editable/timed
tasks persisted through `parentTaskId`, not just checklist text. Both import
previews show the hierarchy and top-level/subtask/total counts; Projects shows
parent-child task indentation. Limits are 2,000 total tasks (including children),
20 task levels, 100 projects, 500 milestones and 5 MiB of UTF-8 JSON. Existing v1
plans without subtasks remain supported.

See the [format, examples, safety and verification notes](docs/focusdesk-project-plan-v1.md)
and the [nested example fixture](fixtures/focusdesk-project-plan-v1.json).
No new migration was added: the checked-in task parent column is reused. Verify
live schema/FK/RLS using the deployment checks in the format doc. Supabase
milestone plans still require migration 008; imports use authenticated,
user-scoped writes with compensating rollback, not a cross-table transaction.

## Curiosity content automation

The **Curiosity** tab publishes on a schedule, not per visitor. One Thing Worth
Knowing, A Few Minutes of Literature and Learn Something change at **00:00
Asia/Kolkata**; One Book changes **every three days** and pulls its cover, edition
count, publisher and first-publication year from the Open Library Search and Covers
APIs at publish time. Nothing is generated while you read: a render reads the
published day, and the pool in `lib/curiosity/content/` (22 / 24 / 24 / 25 entries,
each with an id, an eligibility date and a source link) is what a card shows when a
live feed is unavailable. **A source outage never leaves an empty card:** each of the
three live cards falls back to a curated shelf in this repository (12 AI-background
explainers, 12 developer tools, 9 dated history entries), every fallback is labelled
on the card — *curated*, *curated reading*, *From the archive — not an event of this
date* — and the cause is recorded for the admin panel instead of being shown to a
reader.

A refresh is driven by a schedule, not by visitors; a render only repairs a day the
schedule missed, idempotently and at most once a day. The production scheduler is
**GitHub Actions** (`.github/workflows/curiosity-daily.yml`), which calls the
authenticated endpoint at `30 18 * * *` (00:00 Asia/Kolkata; India has no DST), then
reads the published record back and fails the run if the body does not confirm it.
Vercel's own cron is deliberately **not** configured: it sends no custom headers, so
it cannot present the bearer secret, and the secret does not go in a query string
because URLs are logged. Supabase pg_cron plus the Edge Function in
`supabase/functions/curiosity-refresh`, or a shell crontab with
`npm run curiosity:refresh`, are equivalent alternatives on their own terms. Every run
is idempotent per publication day, single-flight under a lease, and leaves the last
successful content in place if a source fails.

Published days go to Supabase (`supabase/migrations/009_curiosity_content.sql`:
briefings, a seen-item ledger, a read-only content override table and the job lease)
when `SUPABASE_SECRET_KEY` is configured, and to `.curiosity/state.json` otherwise —
so the feature runs with zero credentials. Those two are not equal, and the app says
which one you have: the file is `single-host` (survives a restart here) or, on a
read-only deployment filesystem, `instance-only` (it moves to the temp directory and
dies with the instance), while only the database is `shared`. No existing table or user
data is touched, and migration 009 is **not** applied by this change. Settings → Data has an administrative
**Curiosity content automation** panel (publish today, new book now, eligible counts,
degraded sections, recent runs); it uses your own signed-in token, never a privileged
key.

Full design, sources, Open Library usage rules, verification results and runbook:
[docs/curiosity-content-automation.md](docs/curiosity-content-automation.md).

```bash
npm run curiosity:verify   # 19 automation + reliability checks, offline and deterministic
npm run curiosity:links    # confirm every cited source URL still resolves
npm run curiosity:refresh -- --status
```

## Required API credentials

**None to run the app or the Curiosity tab.** Optional, and only for what is noted:

- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — auth and sync.
  Public keys; only these two may be `NEXT_PUBLIC_*`.
- `SUPABASE_SECRET_KEY` — service-role, server-side only. Enables durable
  multi-instance Curiosity content and `--backfill-pool`; without it the published
  record stays on this host's disk (or this instance's temp directory), which the
  Settings panel reports as `single-host` or `instance-only` rather than pretending
  otherwise.
- `CURIOSITY_CRON_SECRET` — the shared secret a scheduler presents to
  `/api/curiosity/refresh` as `Authorization: Bearer …`. Unset in production, the
  endpoint refuses anonymous callers (the signed-in admin path still works) rather
  than publishing unattended. To enable the daily schedule: set it in the Vercel
  project environment, add the same value plus `FOCUSDESK_URL` as GitHub repository
  secrets, and run the workflow once manually — it must print `Publish result:
  published` and `Confirmed: <today> is published`. A listing in `.env.example` is
  documentation, not proof that the secret exists.
- `OPENLIBRARY_CONTACT_EMAIL` — an identifying contact for Open Library's rate-limit
  guidance. One request per book publish, once every three days.

There is no paid AI API in this feature and no half-wired integration: the news card
comes from public vendor feeds. See [`.env.example`](.env.example).

## Get started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No backend setup is needed to get started; the app uses browser storage by default. For optional Supabase configuration, see [`.env.example`](.env.example) and the [`supabase`](supabase/) directory.

### Password reset

Passwords are stored (hashed) by Supabase and can never be read back, so the
sign-in screen offers **Forgot password?** instead: it emails a time-limited
recovery link, the link returns to the app, and you choose a new password
there. Add the app's origin (for example `http://localhost:3000/**` and your
deployed origin) to **Supabase → Authentication → URL Configuration → Redirect
URLs**; otherwise the link falls back to the project's Site URL. Supabase's
default recovery email template works as-is. Expired or already-used links land
back on the sign-in screen with an explanation and a fresh request form.

---

<div align="center">
  <sub>Built for a steadier pace: one meaningful step at a time.</sub>
</div>
