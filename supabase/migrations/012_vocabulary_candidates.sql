-- 012 — Vocabulary candidates: allow the `speak-better` category.
--
-- WHY THIS EXISTS
--   Migration 011 created `curiosity_candidates` with a CHECK constraint on
--   `category` that lists the categories Curiosity had at the time. Speak Better's
--   discovery pipeline writes approved vocabulary lessons into that same reservoir
--   under the category `speak-better`. Until this constraint admits it, every
--   vocabulary insert is refused by PostgreSQL — not silently dropped, refused —
--   and the publisher keeps publishing the authored curriculum.
--
--   This is the only change the pipeline needs. Approval, provenance and the audit
--   trail already live inside the row's `payload` (the full lesson, including its
--   `discovery` record: sources, frequency, gloss revision, checks passed). A
--   separate provenance column was considered and deliberately not added: it would
--   duplicate JSON that already exists, and — more importantly — a column the
--   writer does not know about is harmless, while a column the writer *assumes*
--   would break every collection on a deployment that has not run this migration.
--
-- WHAT IT DOES NOT TOUCH
--   No table is created, renamed, truncated or dropped. No row is updated or
--   deleted. `curiosity_content`, `curiosity_briefings`, `curiosity_seen`,
--   `curiosity_jobs`, `curiosity_discovery_runs` and every user data table are
--   untouched. Existing rows keep their category and their history.
--
-- BACKWARD COMPATIBILITY
--   The change is a widening: every value that was legal before is legal after.
--   If this migration has *not* been applied, the vocabulary collection reports
--   `unmigrated`, the run exits non-zero for the scheduler to notice, and the daily
--   publisher falls back to the authored Speak Better curriculum without error.
--   Nothing in the app reads `speak-better` rows unless they exist.
--
-- HOW TO RUN IT
--   Supabase Dashboard → SQL Editor → paste and run, OR `supabase db push` on a
--   linked project. Idempotent and safe to re-run.
--
-- ROLLBACK
--   Only safe while no `speak-better` rows exist:
--
--     delete from curiosity_candidates where category = 'speak-better';
--     alter table curiosity_candidates drop constraint if exists curiosity_candidates_category_check;
--     alter table curiosity_candidates add constraint curiosity_candidates_category_check
--       check (category in (
--         'sikh-history','indian-history','world-history','mythology',
--         'chemistry','physics','biology','one-thing','learn-something',
--         'literature','book','ai-world','developer-radar'
--       ));
--
--   Deleting those rows discards discovered vocabulary candidates. It does not
--   touch anything a reader has seen: published lessons live in the briefing
--   snapshots, and per-reader progress lives on the reader's device. Republishing
--   after a rollback simply uses the authored curriculum until the migration is
--   applied again.

-- =============================================================================
-- 1. Widen the category check to admit `speak-better`
-- =============================================================================

do $$
declare
  constraint_name text;
begin
  -- The constraint was written inline in 011, so PostgreSQL named it. Find
  -- whatever it is called rather than assuming `curiosity_candidates_category_check`
  -- and silently leaving the old, narrower rule in place.
  select con.conname
    into constraint_name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
   where rel.relname = 'curiosity_candidates'
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) ilike '%category%in%';

  if constraint_name is not null then
    execute format('alter table curiosity_candidates drop constraint %I', constraint_name);
  end if;

  if not exists (
    select 1
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
     where rel.relname = 'curiosity_candidates'
       and con.conname = 'curiosity_candidates_category_check'
  ) then
    alter table curiosity_candidates
      add constraint curiosity_candidates_category_check
      check (category in (
        'sikh-history',
        'indian-history',
        'world-history',
        'mythology',
        'chemistry',
        'physics',
        'biology',
        'one-thing',
        'learn-something',
        'literature',
        'book',
        'ai-world',
        'developer-radar',
        -- 012: discovered Speak Better lessons, one row per target word.
        'speak-better'
      ));
  end if;
end $$;

-- =============================================================================
-- 2. Document the new category where an operator will look for it
-- =============================================================================

comment on table curiosity_candidates is
  'Curiosity knowledge reservoir: one row per candidate per category. '
  '`speak-better` rows are approved vocabulary lessons whose audit trail '
  '(sources, measured frequency, gloss revision, checks) is stored inside payload.';

comment on column curiosity_candidates.entity_id is
  'Stable upstream identity. For category `speak-better` this is `word:<word>`, '
  'so a second discovery run cannot create a duplicate lesson for the same word.';

-- =============================================================================
-- 3. Verification (read-only; run after applying)
-- =============================================================================
--
--   -- the widened rule is in place
--   select pg_get_constraintdef(oid)
--     from pg_constraint
--    where conname = 'curiosity_candidates_category_check';
--
--   -- existing categories are untouched, and vocabulary rows can appear
--   select category, count(*), count(*) filter (where eligible) as eligible
--     from curiosity_candidates
--    group by category
--    order by category;
