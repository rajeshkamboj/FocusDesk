-- Pace — Supabase/PostgreSQL schema (single-user personal app).
-- Run in the Supabase SQL editor. Adjust RLS policies once auth is added.

create table if not exists goals (
  id text primary key,
  name text not null,
  description text,
  deadline date,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists projects (
  id text primary key,
  name text not null,
  description text,
  goal_id text references goals(id) on delete set null,
  deadline date,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id text primary key,
  title text not null,
  description text,
  status text not null default 'created',
  priority text not null default 'medium',
  project_id text references projects(id) on delete set null,
  goal_id text references goals(id) on delete set null,
  parent_task_id text references tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  scheduled_date date,
  due_date date,
  completed_at timestamptz,
  estimated_duration integer,
  actual_duration integer,
  -- Task timer (actual time tracking). estimated_duration is never overwritten.
  started_at timestamptz,
  paused_at timestamptz,
  actual_duration_seconds integer,
  reminder timestamptz,
  notes text,
  tags text[] not null default '{}',
  recurrence text,
  postponement_count integer not null default 0,
  archived boolean not null default false
);
create index if not exists tasks_scheduled_idx on tasks (scheduled_date);
create index if not exists tasks_due_idx on tasks (due_date);

create table if not exists inbox_items (
  id text primary key,
  title text not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists ideas (
  id text primary key,
  title text not null,
  description text,
  created_at timestamptz not null default now(),
  archived boolean not null default false
);

-- Milestones (learning timeline) are created by
-- supabase/migrations/007_milestones.sql.

create table if not exists daily_priorities (
  id text primary key,
  date date not null,
  title text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  due_date date,
  postponement_count integer not null default 0
);

create table if not exists weekly_priorities (
  id text primary key,
  week text not null,
  title text not null,
  "primary" boolean not null default false,
  completed boolean not null default false,
  completed_at timestamptz
);

create table if not exists monthly_priorities (
  id text primary key,
  month text not null,
  title text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  goal_id text references goals(id) on delete set null,
  project_id text references projects(id) on delete set null
);

create table if not exists task_history (
  id text primary key,
  task_id text not null,
  type text not null,
  at timestamptz not null default now(),
  note text
);
create index if not exists task_history_task_idx on task_history (task_id);

create table if not exists app_settings (
  id text primary key,
  data jsonb not null default '{}'
);
insert into app_settings (id, data) values ('singleton', '{}') on conflict do nothing;

-- Daily well-being (Today page) lives in its own user-scoped table and is
-- created by supabase/migrations/004_daily_wellbeing.sql.

-- IMPORTANT: enable RLS and add policies tied to auth.uid() before exposing
-- real data. The anon key is public; without auth, anyone with the URL can
-- read/write these tables.
