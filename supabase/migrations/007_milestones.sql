-- Migration: Milestones (learning timeline)
--
-- One row per thing first picked up — a tool, framework, platform, extension
-- or idea — shown newest-first on the Milestones tab.
--
-- `date` is TEXT, not DATE, on purpose. A milestone remembers only as much as
-- the user actually remembers: 'YYYY', 'YYYY-MM' or 'YYYY-MM-DD'. A date
-- column would silently invent a day for "sometime in 2024", and the UI would
-- then display a precision that was never claimed. The CHECK constraint keeps
-- the text to those three shapes, so sorting the raw string still works.
--
-- Security: follows the app's existing Supabase pattern — every row carries
-- `user_id`, RLS is enabled, and each policy is scoped to auth.uid() = user_id.
--
-- Safe to run repeatedly (IF NOT EXISTS / DROP POLICY IF EXISTS guards).

create table if not exists milestones (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  category text not null default 'other',
  description text,
  date text not null check (date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'),
  created_at timestamptz not null default now()
);

create index if not exists milestones_user_date_idx
  on milestones (user_id, date desc);

alter table milestones enable row level security;

drop policy if exists "milestones_select_own" on milestones;
create policy "milestones_select_own" on milestones
  for select using (auth.uid() = user_id);

drop policy if exists "milestones_insert_own" on milestones;
create policy "milestones_insert_own" on milestones
  for insert with check (auth.uid() = user_id);

drop policy if exists "milestones_update_own" on milestones;
create policy "milestones_update_own" on milestones
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "milestones_delete_own" on milestones;
create policy "milestones_delete_own" on milestones
  for delete using (auth.uid() = user_id);
