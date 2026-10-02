-- Migration: lightweight task checklist subtasks
--
-- Subtasks are separate from tasks: they have no scheduling, priority or timer
-- fields and never contribute to task/review counts. `sort_order` preserves the
-- order created within each parent task.
--
-- Safe to run repeatedly. This only creates the new table/index/policies; it
-- does not alter, migrate or delete existing task data.

create table if not exists subtasks (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  parent_task_id text not null references tasks (id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  completed boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);

create index if not exists subtasks_user_parent_order_idx
  on subtasks (user_id, parent_task_id, sort_order, created_at, id);

alter table subtasks enable row level security;

drop policy if exists "subtasks_select_own" on subtasks;
create policy "subtasks_select_own" on subtasks
  for select using (auth.uid() = user_id);

drop policy if exists "subtasks_insert_own" on subtasks;
create policy "subtasks_insert_own" on subtasks
  for insert with check (auth.uid() = user_id);

drop policy if exists "subtasks_update_own" on subtasks;
create policy "subtasks_update_own" on subtasks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "subtasks_delete_own" on subtasks;
create policy "subtasks_delete_own" on subtasks
  for delete using (auth.uid() = user_id);
