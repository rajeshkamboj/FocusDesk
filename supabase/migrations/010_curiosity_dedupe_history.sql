-- 010 — Publication-history identity for the anti-repetition layer.
--
-- WHY THIS EXISTS
--   `curiosity_seen` recorded three facts per publication: card, content id and
--   day. Three facts are enough to avoid showing *the same id* twice, and not
--   enough to avoid anything else. The audit behind this change found four ways
--   the same content came back anyway:
--
--     • the same article arriving from two feeds under two URLs (no URL identity);
--     • the same item under a re-worded title (no normalized title);
--     • the same paragraph edited slightly and republished (no text fingerprint);
--     • the same subject on two related cards, e.g. a concept as Chemistry and
--       then as Physics (no subject keys, and no row for most cards at all).
--
--   It also found that only ten of the fourteen cards were ever written to this
--   table (the category CHECK below), so history, AI World, Developer Radar and
--   the quote had no durable memory whatsoever.
--
-- WHAT IT CHANGES
--   Adds identity columns to `curiosity_seen`, widens the category CHECK to the
--   full card key set, and adds the indexes the selection service queries. It
--   does **not** touch `curiosity_content`, `curiosity_briefings`,
--   `curiosity_jobs`, any function, any policy, or any user table.
--
-- IS A MIGRATION REQUIRED?
--   Strictly: yes for the new behaviour; no for the app to keep working. The
--   store detects a pre-010 table (a 400 on the enriched projection or insert),
--   falls back to the three original columns and the original ten categories, and
--   keeps publishing. On that fallback the four new cards have no durable history
--   and duplicate detection is id-only, which is exactly the old behaviour — the
--   publisher records the degradation on the run rather than pretending otherwise.
--
-- HOW TO RUN IT
--   Supabase → SQL editor, or `supabase db push`. Then redeploy (the store caches
--   its capability probe per process). Re-running is safe: every statement is
--   idempotent and converges on the same shape.
--
-- =============================================================================
-- 1. Identity columns
-- =============================================================================
-- All nullable, because rows written before this migration are real history and
-- must not be rewritten. A null `signature` means "published before near-duplicate
-- detection existed", and the selection layer treats it as unknown rather than as
-- a non-match.

alter table curiosity_seen add column if not exists title text;
alter table curiosity_seen add column if not exists url text;
alter table curiosity_seen add column if not exists fingerprint text;
alter table curiosity_seen add column if not exists signature text;
alter table curiosity_seen add column if not exists subjects text[] not null default '{}';
alter table curiosity_seen add column if not exists source text;
alter table curiosity_seen add column if not exists version text;

comment on column curiosity_seen.title is
  'The item title at publication, normalized by the selector for duplicate-title detection.';
comment on column curiosity_seen.url is
  'Canonical URL the reader was sent to. Globally unique within the cooldown window.';
comment on column curiosity_seen.fingerprint is
  'Stable hash of normalized title + body. The same content under a new title is still the same fingerprint.';
comment on column curiosity_seen.signature is
  'Compact hashed word-shingle signature, compared with Jaccard similarity to catch re-worded repeats.';
comment on column curiosity_seen.subjects is
  'Entity/subject keys (mythology:character:athena, science:concept:photosynthesis, …) used for cross-card exclusion.';
comment on column curiosity_seen.source is
  'Source attribution as shown to the reader (publisher, Wikipedia article, Open Library).';
comment on column curiosity_seen.version is
  'Content version: changes when the wording changes, stable when only the fetch time changes.';

-- =============================================================================
-- 2. Widen the category CHECK
-- =============================================================================
-- 009 created the check inline, so PostgreSQL named it `curiosity_seen_category_check`.
-- Drop it by name if it is there and add the full set; both steps are guarded so a
-- deployment that has already run this file, or one whose constraint has a different
-- name, still converges.

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
     where rel.relname = 'curiosity_seen'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%category%'
  loop
    execute format('alter table curiosity_seen drop constraint %I', constraint_name);
  end loop;
end $$;

alter table curiosity_seen
  add constraint curiosity_seen_category_check
  check (category in (
    -- the four pool-backed cards
    'one-thing', 'literature', 'learn-something', 'book',
    -- the fixed corpora
    'speak-better', 'mythology', 'chemistry', 'physics', 'biology', 'sharpener',
    -- the cards that previously had no durable history at all
    'quote', 'history', 'ai-world', 'developer-radar'
  ));

-- =============================================================================
-- 3. Indexes the selector reads
-- =============================================================================
-- The primary key (category, content_id, shown_on) is already the duplicate guard:
-- two concurrent runs cannot insert the same publication twice, and a retry is a
-- no-op. These indexes are for the read side — "when was this URL/title/fingerprint
-- last seen?" — which runs once per candidate per day.

create index if not exists curiosity_seen_shown_on_idx
  on curiosity_seen (shown_on desc);

create index if not exists curiosity_seen_fingerprint_idx
  on curiosity_seen (fingerprint)
  where fingerprint is not null;

create index if not exists curiosity_seen_url_idx
  on curiosity_seen (url)
  where url is not null;

-- Subject arrays are small (≤ 24) and the selector asks "which rows contain this
-- key", so a GIN index pays for itself as the ledger approaches a year.
create index if not exists curiosity_seen_subjects_idx
  on curiosity_seen using gin (subjects);

-- =============================================================================
-- CHECKS after applying (read-only)
-- =============================================================================
--   -- columns exist (7 rows)
--   select column_name from information_schema.columns
--    where table_name = 'curiosity_seen' order by ordinal_position;
--
--   -- the wider CHECK accepts every card key: each insert should succeed, then be
--   -- removed. Replace the date with a day that has no publication.
--   insert into curiosity_seen (category, content_id, shown_on)
--   values ('quote', 'probe-quote', '1999-01-01'),
--          ('history', 'probe-history', '1999-01-01'),
--          ('ai-world', 'probe-news', '1999-01-01'),
--          ('developer-radar', 'probe-repo', '1999-01-01');
--   delete from curiosity_seen where shown_on = '1999-01-01';
--
--   -- the ledger is still world-readable and world-writable by nobody:
--   select policyname, cmd from pg_policies where tablename = 'curiosity_seen';
--
--   -- existing history is intact, not rewritten:
--   select count(*), min(shown_on), max(shown_on) from curiosity_seen;
--
-- ROLLBACK
--   alter table curiosity_seen drop constraint if exists curiosity_seen_category_check;
--   alter table curiosity_seen add constraint curiosity_seen_category_check
--     check (category in ('one-thing','literature','learn-something','book',
--                         'speak-better','mythology','chemistry','physics',
--                         'biology','sharpener'));
--   drop index if exists curiosity_seen_subjects_idx;
--   drop index if exists curiosity_seen_url_idx;
--   drop index if exists curiosity_seen_fingerprint_idx;
--   drop index if exists curiosity_seen_shown_on_idx;
--   alter table curiosity_seen
--     drop column if exists title,
--     drop column if exists url,
--     drop column if exists fingerprint,
--     drop column if exists signature,
--     drop column if exists subjects,
--     drop column if exists source,
--     drop column if exists version;
--
--   (Dropping the columns deletes the new identity metadata from history. The
--    snapshot table and the published days are untouched either way; export the
--    table first if the ledger matters.)
