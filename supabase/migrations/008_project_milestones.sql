-- Migration 008: Project Milestones
--
-- ======================================================================
--  PREPARED IN PHASE 3 — NOT APPLIED TO PRODUCTION.
--  Do not run this against the live database before the planned rollout
--  (Phase 4). The app does not need it to keep working: it detects that
--  the table/column are missing and keeps Project Milestones switched off
--  (Settings → Data shows "Waiting for database migration 008").
-- ======================================================================
--
-- WHAT IT ADDS — purely additive. No existing table, column, row, policy or
-- index is altered, renamed, dropped, rewritten or backfilled.
--   1. table `project_milestones` — structure inside one project:
--        Goal → Project → ProjectMilestone → Task
--   2. nullable column `tasks.project_milestone_id`. Every existing task
--      stays NULL, which means "no milestone".
--
-- NOT THE `milestones` TABLE. `milestones` (migration 007) holds the personal
-- learning timeline, shown as "Learnings" since Phase 3. This migration does
-- not touch, reference or rename it, and its rows are never copied here.
--
-- ORDERING is `position` only (0, 1, 2… within a project), rewritten by the
-- app's reorder operation — never created_at, target_date or name. (Same idea
-- as subtasks.sort_order; the column is named `position` here to match the
-- domain field.)
--
-- TARGET DATE is a real `date` (YYYY-MM-DD) — unlike learnings, whose dates
-- are deliberately partial text.
--
-- INTEGRITY
--   * project_id → projects(id) ON DELETE CASCADE: a milestone cannot outlive
--     its project (the subtasks → tasks pattern).
--   * tasks.project_milestone_id → project_milestones(id) ON DELETE SET NULL:
--     deleting a milestone keeps its tasks; they only lose the link.
--   * "a task's milestone belongs to the task's project" is enforced by the
--     app (lib/project-milestones.ts). Optional database enforcement is
--     sketched, disabled, at the end of this file.
--
-- SECURITY — identical to every other table: user_id NOT NULL DEFAULT
-- auth.uid(), RLS enabled, four own-row policies on auth.uid() = user_id.
-- Nothing here widens access or needs a service-role key.
--
-- Safe to run more than once (IF NOT EXISTS / DROP POLICY IF EXISTS guards).
-- Applying it briefly locks `tasks` while the column, foreign key and index
-- are added; on a personal-sized table that is instant.

create table if not exists project_milestones (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text not null references projects (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  description text,
  target_date date,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now()
);

create index if not exists project_milestones_user_project_position_idx
  on project_milestones (user_id, project_id, position);

alter table project_milestones enable row level security;

drop policy if exists "project_milestones_select_own" on project_milestones;
create policy "project_milestones_select_own" on project_milestones
  for select using (auth.uid() = user_id);

drop policy if exists "project_milestones_insert_own" on project_milestones;
create policy "project_milestones_insert_own" on project_milestones
  for insert with check (auth.uid() = user_id);

drop policy if exists "project_milestones_update_own" on project_milestones;
create policy "project_milestones_update_own" on project_milestones
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "project_milestones_delete_own" on project_milestones;
create policy "project_milestones_delete_own" on project_milestones
  for delete using (auth.uid() = user_id);

-- Tasks: optional link to one milestone of their own project.
alter table tasks
  add column if not exists project_milestone_id text
    references project_milestones (id) on delete set null;

-- Serves the ON DELETE SET NULL lookup and "tasks of this milestone".
create index if not exists tasks_project_milestone_idx
  on tasks (project_milestone_id);

-- ----------------------------------------------------------------------
-- READ-ONLY CHECKS after applying (Phase 4)
-- ----------------------------------------------------------------------
--   select count(*) from milestones;                     -- Learnings: still 56
--   -- re-run the sorted-id MD5 query of the Phase 3 rollback point:
--   -- expected 3722577b5cbaf446809164a602d2b81c (learning ids untouched)
--   select relrowsecurity from pg_class where relname = 'project_milestones';  -- true
--   select policyname from pg_policies where tablename = 'project_milestones'; -- 4 rows
--   select count(*) from tasks where project_milestone_id is not null;         -- 0
--
-- ----------------------------------------------------------------------
-- OPTIONAL, NOT ENABLED: database-level enforcement of the same-project rule
-- ----------------------------------------------------------------------
-- The least invasive option is a composite foreign key (the column list on
-- SET NULL needs PostgreSQL 15+):
--
--   alter table project_milestones
--     add constraint project_milestones_id_project_key unique (id, project_id);
--   alter table tasks
--     add constraint tasks_project_milestone_same_project_fkey
--     foreign key (project_milestone_id, project_id)
--     references project_milestones (id, project_id)
--     on delete set null (project_milestone_id);
--
-- With MATCH SIMPLE a task is checked only while both columns are set, so a
-- project change must clear the milestone in the same UPDATE — which the app
-- already does. Similarly, insert/update policies could additionally require
-- `exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid())`;
-- the existing tables rely on unguessable ids for that property instead, and
-- this migration follows them.
--
-- ----------------------------------------------------------------------
-- ROLLBACK (manual — removes only what this migration created, and only
-- makes sense while no project-milestone data needs keeping)
-- ----------------------------------------------------------------------
--   alter table tasks drop column if exists project_milestone_id;
--   drop table if exists project_milestones;
-- The app falls back on its own (feature hidden) once these are gone; reload
-- open tabs. The `milestones` (Learnings) table is unaffected either way.
