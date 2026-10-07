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
-- WHAT IT ADDS — additive only. No existing table, column, row, policy or
-- index is altered, renamed, dropped, rewritten or backfilled.
--   1. table `project_milestones` — structure inside one project:
--        Goal → Project → ProjectMilestone → Task
--   2. nullable column `tasks.project_milestone_id`. Every existing task
--      stays NULL, which means "no milestone".
--   3. one additive UNIQUE constraint on `projects (id, user_id)`, needed
--      by the ownership foreign key below. See "WHY …" underneath — it
--      cannot fail, cannot reject an existing row and changes no behaviour.
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
-- ----------------------------------------------------------------------
-- INTEGRITY — enforced by the database, not just by the app
-- ----------------------------------------------------------------------
-- A. OWNERSHIP. A project milestone must belong to a project owned by the
--    same user. A plain `project_id → projects(id)` foreign key proves the
--    project exists, but not that it is *this* user's project (foreign key
--    checks run as the table owner, so RLS does not guard them). The
--    composite key closes that:
--        (project_id, user_id) → projects (id, user_id)   ON DELETE CASCADE
--    ON DELETE CASCADE also delivers "deleting a project deletes its
--    milestones" — the same shape as subtasks → tasks.
--
-- B. SAME PROJECT. A task's milestone must belong to the task's project:
--        tasks (project_milestone_id, project_id)
--          → project_milestones (id, project_id)         ON DELETE SET NULL
--    ON DELETE SET NULL keeps the tasks when a milestone is deleted; only
--    the link is cleared (the column list form needs PostgreSQL 15+).
--    This key and the one in C are both MATCH SIMPLE, the PostgreSQL
--    default, so a task with no milestone — or with no project at all —
--    is never checked.
--    A project change must therefore clear the milestone in the *same*
--    UPDATE, which the app already does (lib/project-milestones.ts →
--    resolveTaskMilestone; every task write sends the whole row). The one
--    combination the database still allows is documented under "WHAT THE
--    DATABASE STILL ALLOWS" below, with the alternatives that were measured
--    and rejected.
--
-- C. NO DANGLING LINKS. `tasks` keeps the plain single-column key as well:
--        tasks (project_milestone_id) → project_milestones (id)
--                                                          ON DELETE SET NULL
--    It is not redundant. MATCH SIMPLE makes the composite key above blind
--    to any row whose project_id is NULL, and deleting a project nulls
--    tasks.project_id *before* the milestone cascade has cleared the link —
--    so with the composite key alone the cleanup finds no matching row and
--    the task is left pointing at a milestone that no longer exists. The
--    single-column key matches on the milestone id whatever project_id says,
--    so the link is always cleared. Measured both ways against PostgreSQL;
--    the dangling row only appears without this key.
--
-- SECURITY — identical to every other table: user_id NOT NULL DEFAULT
-- auth.uid(), RLS enabled, four own-row policies on auth.uid() = user_id.
-- Nothing here widens access or needs a service-role key. Ownership is now
-- additionally enforced by foreign key A above.
--
-- ----------------------------------------------------------------------
-- WHY `projects (id, user_id) UNIQUE` — and why it is safe
-- ----------------------------------------------------------------------
-- A composite foreign key needs a matching unique key on the referenced
-- table, so foreign key A needs `projects (id, user_id)` to be unique.
--   * It can never fail. `projects.id` is already the primary key, so any
--     pair containing it is unique by definition; there is no row, existing
--     or future, that could violate it. Adding it therefore cannot reject
--     data and cannot leave the migration half-applied.
--   * It changes nothing. The primary key stays the primary key, every
--     existing foreign key keeps referencing `projects (id)`, and no query
--     needs rewriting. It adds one btree index, i.e. a little extra write
--     cost on a table this app writes rarely.
--   * It is the smallest thing that works. The alternatives are a trigger
--     or a policy sub-select on every write, both of which cost more at
--     run time and both of which duplicate what a foreign key already does.
-- The same reasoning covers `project_milestones (id, project_id)`: `id` is
-- that table's primary key, so the pair is unique for free.
--
-- Safe to run more than once: IF NOT EXISTS / DROP POLICY IF EXISTS guards,
-- and every constraint addition sits in a DO block that checks pg_constraint
-- first (`alter table … add constraint` has no IF NOT EXISTS). Nothing is
-- dropped.
--
-- LOCKING: briefly ACCESS EXCLUSIVE on `projects` (unique constraint), on
-- `project_milestones` (creation) and on `tasks` (column, foreign key,
-- index). On a personal-sized database that is instantaneous. For a large
-- `projects` table, build the index CONCURRENTLY first and then attach it
-- (see the note at the end of that step).

-- ----------------------------------------------------------------------
-- 0. Preconditions — fail before anything is created, so a rejected run
--    leaves the database exactly as it was.
-- ----------------------------------------------------------------------
do $pm008_preconditions$
declare
  server_version_number integer := current_setting('server_version_num')::integer;
begin
  if server_version_number < 150000 then
    raise exception
      'Migration 008 needs PostgreSQL 15 or newer: ON DELETE SET NULL with a column list is a PostgreSQL 15 feature. This server is %.',
      current_setting('server_version');
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'user_id'
  ) then
    raise exception
      'projects.user_id is missing. Apply the user-ownership migration (user_id NOT NULL DEFAULT auth.uid() on every table) before migration 008.';
  end if;
end
$pm008_preconditions$;

-- ----------------------------------------------------------------------
-- 1. The unique key that foreign key A references.
--    `alter table … add constraint` has no IF NOT EXISTS, hence the guard.
-- ----------------------------------------------------------------------
do $pm008_projects_unique$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.projects'::regclass
      and contype = 'u'
      and conname = 'projects_id_user_id_key'
  ) then
    alter table projects add constraint projects_id_user_id_key unique (id, user_id);
  end if;
end
$pm008_projects_unique$;
-- Large `projects` table instead (no long ACCESS EXCLUSIVE lock; cannot run
-- inside a transaction, so it replaces the DO block above rather than joining it):
--   create unique index concurrently if not exists projects_id_user_id_key on projects (id, user_id);
--   alter table projects add constraint projects_id_user_id_key unique using index projects_id_user_id_key;

-- ----------------------------------------------------------------------
-- 2. project_milestones
-- ----------------------------------------------------------------------
create table if not exists project_milestones (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text not null,
  name text not null check (length(btrim(name)) > 0),
  description text,
  target_date date,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  -- A. Ownership: the project exists *and* belongs to this row's user.
  --    Deleting the project deletes its milestones.
  constraint project_milestones_project_user_fkey
    foreign key (project_id, user_id) references projects (id, user_id) on delete cascade,
  -- Referenced by foreign key B on tasks. Unique for free: id is the primary key.
  constraint project_milestones_id_project_key unique (id, project_id)
);

-- An earlier copy of this migration may have created the table without the
-- two constraints above (create table if not exists would skip them). Add
-- anything that is missing, so re-running always converges on the same shape.
do $pm008_milestones_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.project_milestones'::regclass
      and conname = 'project_milestones_id_project_key'
  ) then
    alter table project_milestones
      add constraint project_milestones_id_project_key unique (id, project_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.project_milestones'::regclass
      and conname = 'project_milestones_project_user_fkey'
  ) then
    alter table project_milestones
      add constraint project_milestones_project_user_fkey
      foreign key (project_id, user_id) references projects (id, user_id) on delete cascade;
  end if;
end
$pm008_milestones_constraints$;

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

-- ----------------------------------------------------------------------
-- 3. Tasks: optional link to one milestone of their own project.
-- ----------------------------------------------------------------------
alter table tasks
  add column if not exists project_milestone_id text;

do $pm008_tasks_fkeys$
begin
  -- C. No dangling links: matches on the milestone id alone, whatever
  --    project_id says. Cannot reject an existing task — every one of them
  --    is NULL until the feature is used.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tasks'::regclass
      and conname = 'tasks_project_milestone_fkey'
  ) then
    alter table tasks
      add constraint tasks_project_milestone_fkey
      foreign key (project_milestone_id) references project_milestones (id) on delete set null;
  end if;

  -- B. Same project. MATCH SIMPLE (the default) means a row with a NULL
  --    project_milestone_id is never checked, so this cannot reject a
  --    single existing task either.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tasks'::regclass
      and conname = 'tasks_project_milestone_same_project_fkey'
  ) then
    alter table tasks
      add constraint tasks_project_milestone_same_project_fkey
      foreign key (project_milestone_id, project_id)
      references project_milestones (id, project_id)
      on delete set null (project_milestone_id);
  end if;
end
$pm008_tasks_fkeys$;

-- Serves the ON DELETE SET NULL lookup and "tasks of this milestone".
create index if not exists tasks_project_milestone_idx
  on tasks (project_milestone_id);

-- ----------------------------------------------------------------------
-- READ-ONLY CHECKS before applying (Phase 4)
-- ----------------------------------------------------------------------
-- All three must return 0 rows / the expected value before running this file:
--   select count(*) from milestones;                        -- Learnings: 56
--   select id from tasks where project_milestone_id is not null;            -- none
--   select conname from pg_constraint                                       -- none
--     where conrelid = 'public.projects'::regclass and contype = 'u';
--
-- READ-ONLY CHECKS after applying
-- ----------------------------------------------------------------------
--   select count(*) from milestones;                     -- Learnings: still 56
--   -- re-run the sorted-id MD5 query of the Phase 3 rollback point:
--   -- expected 3722577b5cbaf446809164a602d2b81c (learning ids untouched)
--   select relrowsecurity from pg_class where relname = 'project_milestones';  -- true
--   select policyname from pg_policies where tablename = 'project_milestones'; -- 4 rows
--   select conname, contype from pg_constraint                               -- the 4 new ones
--     where conname in ('projects_id_user_id_key',
--                       'project_milestones_project_user_fkey',
--                       'project_milestones_id_project_key',
--                       'tasks_project_milestone_fkey',
--                       'tasks_project_milestone_same_project_fkey');
--   select count(*) from tasks where project_milestone_id is not null;         -- 0
--   -- no task may ever point at a milestone that is gone:
--   select t.id from tasks t
--     left join project_milestones m on m.id = t.project_milestone_id
--     where t.project_milestone_id is not null and m.id is null;               -- 0 rows
--
-- ----------------------------------------------------------------------
-- WHAT THE DATABASE STILL ALLOWS
-- ----------------------------------------------------------------------
-- Both foreign keys on `tasks` are MATCH SIMPLE, so PostgreSQL skips the
-- check whenever a referencing column is NULL. One combination therefore
-- stays reachable at the database level: a task with a milestone *and no
-- project*. The same-project rule itself is fully enforced, and foreign key
-- C keeps the link from ever dangling. The app rejects that combination
-- outright ("Choose a project before choosing a milestone",
-- lib/project-milestones.ts), and PostgREST writes only ever come from it.
--
-- Every way of closing it in the database was measured against PostgreSQL
-- and rejected, because each one breaks a requirement of this migration
-- (scripts/verify-project-milestones-sql.ts re-measures all three, so the
-- claims stay honest):
--   * MATCH FULL on the tasks foreign key forbids the ordinary case of a
--     task that is in a project but has no milestone — MATCH FULL demands
--     all-or-none of the referencing columns, so it refuses that row.
--   * CHECK (project_milestone_id IS NULL OR project_id IS NOT NULL) breaks
--     project deletion: PostgreSQL nulls tasks.project_id before the
--     milestone cascade has cleared the link, so the CHECK sees the
--     in-between row and aborts the whole DELETE.
--   * A deferred CONSTRAINT TRIGGER fails the same way — AFTER ROW triggers
--     capture the row as it was when they were queued, not at COMMIT.
-- The one option left is a stored generated column that pairs the milestone
-- with a never-NULL project placeholder; it works, but it rewrites `tasks`
-- and adds a column the API would expose. Not worth it here — it is kept
-- ready and verified below in case that trade ever changes.
--
-- ----------------------------------------------------------------------
-- OPTIONAL, NOT ENABLED: close the last combination with a generated column
-- ----------------------------------------------------------------------
--   alter table tasks
--     add column if not exists project_milestone_key text
--       generated always as (
--         case when project_milestone_id is null then null
--              else coalesce(project_id, '') end
--       ) stored;
--   alter table tasks
--     add constraint tasks_project_milestone_needs_project_fkey
--     foreign key (project_milestone_id, project_milestone_key)
--     references project_milestones (id, project_id);
-- Together with foreign key B this rejects a milestone on a project-less
-- task as well, and project deletion still works (the cascade nulls both
-- columns of the pair at once). Costs: `tasks` is rewritten once, and the
-- column shows up in PostgREST reads. The app never writes it — generated
-- columns are read-only.
--
-- ----------------------------------------------------------------------
-- ROLLBACK (manual — removes only what this migration created, and only
-- makes sense while no project-milestone data needs keeping)
-- ----------------------------------------------------------------------
--   alter table tasks drop column if exists project_milestone_id;
--   drop table if exists project_milestones;
--   alter table projects drop constraint if exists projects_id_user_id_key;
-- The app falls back on its own (feature hidden) once these are gone; reload
-- open tabs. The `milestones` (Learnings) table is unaffected either way.
