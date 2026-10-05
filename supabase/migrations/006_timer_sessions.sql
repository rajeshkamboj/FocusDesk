-- Migration: timer sessions — daily attribution of focused time
--
-- WHY THIS IS NECESSARY
-- ---------------------
-- Before this migration the only persisted timer data lived on `tasks`:
--
--   started_at              start of the CURRENT run only (moved forward by
--                           every checkpoint, cleared on pause/finish)
--   paused_at               when the task was last paused
--   actual_duration_seconds the task's LIFETIME total across every run
--
-- None of those can say how much of a task's time was spent on a given day.
-- `actual_duration_seconds` is a single running total with no day dimension,
-- `started_at` only ever describes the run in progress, and `task_history`
-- records workflow events (created/scheduled/completed/postponed/…), never
-- timer runs. A task worked 45 minutes on Monday and 30 minutes on Tuesday
-- therefore stores exactly one number — 75 minutes — and reporting it per day
-- would show 1h 15m on both days.
--
-- So the data was NOT sufficient, and the smallest structure that fixes it is
-- one row per continuous run of the timer: the segment between a Start/Resume
-- and the next Pause/Finish. Summing those runs for a task reproduces
-- `actual_duration_seconds` exactly, so nothing is duplicated and no existing
-- number changes meaning.
--
-- WHAT IS DELIBERATELY NOT HERE
-- -----------------------------
-- * No `date` column. A run that starts at 23:40 and ends at 00:20 belongs to
--   two local calendar days; storing a single day would force a wrong answer
--   at write time. The client splits a run across local days when reading
--   (lib/selectors.ts → sessionSecondsByDay), so midnight is handled exactly
--   once, in the user's own timezone.
-- * No duplicate of `estimated_duration`, `actual_duration`,
--   `actual_duration_seconds` or `completed_at`. Those keep their current
--   meaning and their current behaviour; this table is additive and is read
--   only for day attribution.
-- * No status/`is_open` column. A page that dies mid-run is recovered by the
--   app stopping the task at its last durable checkpoint, and the checkpoint
--   wrote this row at that same second — so a leftover row is already closed
--   at the right place and time FocusDesk was unavailable is never counted.
--
-- SECURITY
-- --------
-- Follows the pattern of 004_daily_wellbeing.sql / 005_task_subtasks.sql:
-- every row carries `user_id`, RLS is enabled and every policy is scoped to
-- `auth.uid() = user_id`, so one user can never read or write another user's
-- sessions. `task_id` cascades, so deleting a task removes its runs with it.
--
-- Safe to run repeatedly (IF NOT EXISTS / DROP POLICY IF EXISTS guards). It
-- creates one new table, two indexes and four policies. No existing table,
-- column, policy, trigger or row is altered or deleted.

create table if not exists timer_sessions (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id text not null references tasks (id) on delete cascade,
  -- When this run of the timer began.
  started_at timestamptz not null,
  -- When it stopped; while it is still running, the last durable checkpoint.
  ended_at timestamptz not null,
  -- Active seconds credited by this run. Paused time is never included.
  duration_seconds integer not null default 0 check (duration_seconds >= 0)
);

-- Reading a day or a month is a range scan over the user's runs.
create index if not exists timer_sessions_user_started_idx
  on timer_sessions (user_id, started_at);

-- Reading one task's runs (per-task breakdown, task deletion).
create index if not exists timer_sessions_user_task_idx
  on timer_sessions (user_id, task_id, started_at);

alter table timer_sessions enable row level security;

drop policy if exists "timer_sessions_select_own" on timer_sessions;
create policy "timer_sessions_select_own" on timer_sessions
  for select using (auth.uid() = user_id);

drop policy if exists "timer_sessions_insert_own" on timer_sessions;
create policy "timer_sessions_insert_own" on timer_sessions
  for insert with check (auth.uid() = user_id);

drop policy if exists "timer_sessions_update_own" on timer_sessions;
create policy "timer_sessions_update_own" on timer_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "timer_sessions_delete_own" on timer_sessions;
create policy "timer_sessions_delete_own" on timer_sessions
  for delete using (auth.uid() = user_id);

-- NOTE ON EXISTING DATA
-- ---------------------
-- Time recorded before this migration has no day information anywhere in the
-- database, so it is intentionally NOT backfilled: inventing a day for it
-- would be a guess, and spreading a lifetime total over days would be the
-- very double counting this table exists to prevent. Those tasks keep their
-- `actual_duration_seconds` and keep displaying it exactly as before; daily
-- focused time simply starts accumulating from the first run recorded after
-- this migration is applied.
