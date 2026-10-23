-- 011 — Persistent knowledge candidate reservoir and discovery telemetry.
--
-- WHY THIS EXISTS
--   Migrations 009 and 010 gave Curiosity a durable publication snapshot table
--   (`curiosity_briefings`), an operator editorial override table
--   (`curiosity_content`), and an identity-aware publication ledger
--   (`curiosity_seen`). Discovered candidates from Wikimedia, Wikidata and open
--   reference sources, however, lived only in process memory during a single run.
--
--   This migration introduces `curiosity_candidates` as a dedicated, persistent
--   knowledge reservoir strictly separated from `curiosity_seen` (publication
--   history), together with `curiosity_discovery_state` (pagination cursors) and
--   `curiosity_discovery_runs` (low-stock replenishment and validation metrics).
--
-- WHAT IT DOES NOT TOUCH
--   `curiosity_content`, `curiosity_briefings`, `curiosity_seen`, `curiosity_jobs`,
--   all lease RPCs, and every user data table (`tasks`, `projects`, `goals`,
--   `learnings`, `daily_wellbeing`, `app_settings`, etc.) remain untouched.
--
-- BACKWARD COMPATIBILITY
--   If a deployment has not yet applied this migration, the candidate store
--   detects the missing relation (HTTP 404 / PGRST205 / 42P01), degrades cleanly
--   to the built-in curated seed + live discovery without throwing, and records a
--   note on the discovery summary. Existing snapshots and daily publishing
--   continue uninterrupted.
--
-- HOW TO RUN IT
--   Supabase Dashboard → SQL Editor → paste and run, OR `supabase db push` on a
--   linked project. Every statement is idempotent and safe to re-run.

-- =============================================================================
-- 1. Persistent candidate reservoir
-- =============================================================================

create table if not exists curiosity_candidates (
  id text primary key check (length(btrim(id)) > 0),
  -- Stable upstream entity or source identifier (e.g. Wikidata QID `Q9316`,
  -- MediaWiki page key, Open Library work key, or canonical curated slug).
  entity_id text not null check (length(btrim(entity_id)) > 0),
  canonical_url text not null check (canonical_url ~* '^https?://\S+$'),
  category text not null check (category in (
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
    'developer-radar'
  )),
  subcategory text,
  title text not null check (length(btrim(title)) > 0),
  description text not null check (length(btrim(description)) > 0),
  significance text,
  -- Attribution and licence metadata required for open-source and reference works.
  source_name text not null check (length(btrim(source_name)) > 0),
  attribution text,
  license text,
  -- Variant spellings, transliterations and alternate titles for deduplication.
  aliases text[] not null default '{}',
  normalized_identity text not null check (length(btrim(normalized_identity)) > 0),
  fingerprint text not null check (length(btrim(fingerprint)) > 0),
  signature text,
  subjects text[] not null default '{}',
  -- Historical / relevant event date fields (month/day indexed separately for
  -- fast calendar lookups including February 29 in leap years).
  event_year integer,
  event_year_label text,
  event_month smallint check (event_month is null or (event_month between 1 and 12)),
  event_day smallint check (event_day is null or (event_day between 1 and 31)),
  event_date_precision text not null default 'none' check (
    event_date_precision in ('exact', 'month-year', 'year', 'approximate', 'disputed', 'none')
  ),
  calendar_note text,
  -- Compact structured card fields when needed for publishing (never whole dumps).
  payload jsonb not null default '{}',
  validation_status text not null default 'pending' check (
    validation_status in ('valid', 'rejected', 'pending', 'needs-review')
  ),
  validation_notes text[] not null default '{}',
  eligible boolean not null default false,
  discovered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Month and day must either both be present and form a real calendar day
  -- (including Feb 29), or both be null when only a year/period is known.
  constraint curiosity_candidates_month_day_valid check (
    (event_month is null and event_day is null)
    or (
      event_month is not null
      and event_day is not null
      and (
        (event_month in (1, 3, 5, 7, 8, 10, 12) and event_day <= 31)
        or (event_month in (4, 6, 9, 11) and event_day <= 30)
        or (event_month = 2 and event_day <= 29)
      )
    )
  ),
  -- Only validated records may ever become eligible for daily publication.
  constraint curiosity_candidates_eligible_valid check (
    not eligible or validation_status = 'valid'
  )
);

-- Idempotent cross-run uniqueness: re-discovering the same upstream entity or
-- normalized identity inside a category updates metadata rather than duplicating.
create unique index if not exists curiosity_candidates_category_entity_uidx
  on curiosity_candidates (category, entity_id);

create unique index if not exists curiosity_candidates_category_identity_uidx
  on curiosity_candidates (category, normalized_identity);

-- Fast calendar lookup for Today in History (`MM-DD` by priority category).
create index if not exists curiosity_candidates_history_date_idx
  on curiosity_candidates (category, event_month, event_day)
  where eligible = true;

-- Fast eligible pool enumeration and low-stock counts per category.
create index if not exists curiosity_candidates_category_eligible_idx
  on curiosity_candidates (category, updated_at desc)
  where eligible = true;

create index if not exists curiosity_candidates_url_idx
  on curiosity_candidates (canonical_url);

create index if not exists curiosity_candidates_aliases_idx
  on curiosity_candidates using gin (aliases);

create index if not exists curiosity_candidates_subjects_idx
  on curiosity_candidates using gin (subjects);

comment on table curiosity_candidates is
  'Persistent validated candidate library for Curiosity discovery. Kept strictly separate from curiosity_seen (publication history).';

-- =============================================================================
-- 2. Discovery cursor state (bounded pagination across scheduled runs)
-- =============================================================================

create table if not exists curiosity_discovery_state (
  cursor_key text primary key check (length(btrim(cursor_key)) > 0),
  category text not null,
  continue_token text,
  etag text,
  last_checked_at timestamptz not null default now()
);

comment on table curiosity_discovery_state is
  'Continuation cursors and conditional cache tokens so scheduled discovery advances cleanly page by page.';

-- =============================================================================
-- 3. Discovery & pool-maintenance run telemetry
-- =============================================================================

create table if not exists curiosity_discovery_runs (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  trigger text not null default 'cron' check (trigger in ('cron', 'admin', 'cli', 'publish-replenish')),
  categories_checked text[] not null default '{}',
  low_stock_categories text[] not null default '{}',
  eligible_counts jsonb not null default '{}',
  new_discovered integer not null default 0 check (new_discovered >= 0),
  duplicate_rejections integer not null default 0 check (duplicate_rejections >= 0),
  validation_failures integer not null default 0 check (validation_failures >= 0),
  source_failures integer not null default 0 check (source_failures >= 0),
  cooldown_relaxations integer not null default 0 check (cooldown_relaxations >= 0),
  notes text[] not null default '{}'
);

create index if not exists curiosity_discovery_runs_ran_at_idx
  on curiosity_discovery_runs (ran_at desc);

comment on table curiosity_discovery_runs is
  'Operational telemetry for knowledge-pool replenishment: eligible counts, duplicates rejected, validation failures, source errors and low-stock alerts.';

-- =============================================================================
-- 4. Row Level Security (same read-public / service-role-write posture as 009)
-- =============================================================================

alter table curiosity_candidates enable row level security;
alter table curiosity_discovery_state enable row level security;
alter table curiosity_discovery_runs enable row level security;

drop policy if exists "curiosity_candidates_read" on curiosity_candidates;
create policy "curiosity_candidates_read" on curiosity_candidates for select using (true);

drop policy if exists "curiosity_discovery_runs_read" on curiosity_discovery_runs;
create policy "curiosity_discovery_runs_read" on curiosity_discovery_runs for select using (true);

drop policy if exists "curiosity_discovery_state_read" on curiosity_discovery_state;
create policy "curiosity_discovery_state_read" on curiosity_discovery_state for select using (true);

-- =============================================================================
-- CHECKS after applying (read-only)
-- =============================================================================
--   select relname, relrowsecurity
--     from pg_class
--    where relname in ('curiosity_candidates', 'curiosity_discovery_state', 'curiosity_discovery_runs');
--
--   select category, count(*) filter (where eligible) as eligible, count(*) as total
--     from curiosity_candidates
--    group by category
--    order by category;
--
--   select ran_at, trigger, new_discovered, duplicate_rejections, validation_failures,
--          source_failures, low_stock_categories
--     from curiosity_discovery_runs
--    order by ran_at desc
--    limit 5;
--
--   -- publication ledger and snapshots remain separate and intact:
--   select count(*) from curiosity_seen;
--   select count(*) from curiosity_briefings;
--
-- =============================================================================
-- ROLLBACK (removes only objects created by 011; published snapshots untouched)
-- =============================================================================
--   drop table if exists curiosity_discovery_runs;
--   drop table if exists curiosity_discovery_state;
--   drop table if exists curiosity_candidates;
