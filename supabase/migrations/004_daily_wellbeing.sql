-- Migration: Daily well-being
--
-- Adds the tiny, deliberately non-gamified well-being section shown on the
-- Today page: two habits with four daily check-ins (Jogging, and Nitnem in
-- the Morning / Evening / Night).
--
-- One row per user per day. A row is only created once the user checks
-- something, so a fresh day simply has no row — nothing is "missed" or
-- carried over. Rows are kept as the day passes, which gives a plain,
-- query-free history without any analytics layer.
--
-- Security: the table follows the app's existing Supabase pattern — every
-- row carries `user_id`, Row Level Security is enabled and each policy is
-- scoped to `auth.uid() = user_id`, so one user can never read or write
-- another user's well-being data. The unique index guarantees a single
-- record per user per day (so two quick taps cannot create duplicates).
--
-- Safe to run repeatedly (IF NOT EXISTS / DROP POLICY IF EXISTS guards).
-- No existing table, policy or piece of data is touched.

create table if not exists wellbeing_days (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  jogging boolean not null default false,
  nitnem_morning boolean not null default false,
  nitnem_evening boolean not null default false,
  nitnem_night boolean not null default false
);

create unique index if not exists wellbeing_days_user_date_idx
  on wellbeing_days (user_id, date);

alter table wellbeing_days enable row level security;

drop policy if exists "wellbeing_days_select_own" on wellbeing_days;
create policy "wellbeing_days_select_own" on wellbeing_days
  for select using (auth.uid() = user_id);

drop policy if exists "wellbeing_days_insert_own" on wellbeing_days;
create policy "wellbeing_days_insert_own" on wellbeing_days
  for insert with check (auth.uid() = user_id);

drop policy if exists "wellbeing_days_update_own" on wellbeing_days;
create policy "wellbeing_days_update_own" on wellbeing_days
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "wellbeing_days_delete_own" on wellbeing_days;
create policy "wellbeing_days_delete_own" on wellbeing_days
  for delete using (auth.uid() = user_id);
