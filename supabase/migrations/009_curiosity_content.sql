-- 009 — Curiosity content pool, published snapshots and the job lease.
--
-- WHY THIS EXISTS
--   The Curiosity tab used to derive every card from the date at request time, so
--   "daily" content was really "whatever the first visitor got, refreshed hourly by
--   a cache". This schema turns it into a published record: content has an id and a
--   publication day, the day's briefing is stored once, and a rotation ledger keeps
--   yesterday from becoming today.
--
-- WHAT IT DOES NOT TOUCH
--   No existing table, column, policy or trigger is altered. User data
--   (tasks/projects/goals/learnings/wellbeing/settings) is untouched, and these
--   tables are not user-scoped: a daily briefing is the same for every reader of
--   this instance, so there is no user_id column and no per-user data is ever
--   written here. Re-running this file is safe; it converges on the same shape.
--
-- HOW TO RUN IT
--   Supabase → SQL editor, or `supabase db push` with a linked project. Then
--   restart the app: until these tables exist the publisher writes to the file
--   store instead and the app renders the built-in pool, so applying the migration
--   at any point — including never — leaves Curiosity working.
--
-- =============================================================================
-- 1. The content pool
-- =============================================================================
-- Optional authoring surface. The authored corpus in lib/curiosity/content/*.ts is
-- the source of truth for a deployment without a database; these rows are merged
-- over it by id, which is how an item is retired, re-dated or added without a
-- deploy. `backfill` in scripts/curiosity-refresh.ts seeds this table from the
-- authored pool so the two start identical.

create table if not exists curiosity_content (
  id text primary key check (length(btrim(id)) > 0),
  category text not null check (category in ('one-thing', 'literature', 'learn-something', 'book')),
  -- 'draft' is invisible to the rotation, 'retired' removes an item from future
  -- days without deleting its history in curiosity_seen.
  status text not null default 'published' check (status in ('draft', 'published', 'retired')),
  -- First publication day in Asia/Kolkata. A date, not a timestamptz, because the
  -- day is the unit the rotation works in; `published_at` records the moment.
  available_from date not null default ((now() at time zone 'Asia/Kolkata')::date),
  published_at timestamptz not null default now(),
  title text not null,
  -- The card payload, exactly as `CuriosityBriefing` consumes it. Kept as jsonb
  -- rather than one column per field because the four categories have different
  -- shapes and the app validates them on read.
  payload jsonb not null,
  source_url text,
  source_name text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists curiosity_content_category_available_idx
  on curiosity_content (category, available_from desc)
  where status = 'published';

comment on table curiosity_content is
  'Optional, read-only from the app: content rows merged over the authored pool in lib/curiosity/content.';

-- =============================================================================
-- 2. Published snapshots
-- =============================================================================
-- One row per (kind, publication day). `daily` turns over every day, `book` every
-- three days; keeping them apart is what lets a failed book lookup leave the
-- recommendation on screen for another cycle instead of blanking the card.

create table if not exists curiosity_briefings (
  kind text not null check (kind in ('daily', 'book')),
  date_key date not null,
  published_at timestamptz not null default now(),
  -- Every pool id behind the row, both as a flat array (easy to query for "when
  -- was this item shown?") and as the category→id map the app renders.
  content_ids text[] not null default '{}',
  content_id_map jsonb not null default '{}',
  payload jsonb not null,
  -- Sections whose live source did not answer. The card still renders; the row
  -- records what was degraded, so "the news card has been empty since Tuesday" is
  -- answerable without reading logs.
  degraded text[] not null default '{}',
  source_trigger text check (source_trigger in ('cron', 'admin', 'cli', 'startup')),
  primary key (kind, date_key)
);

create index if not exists curiosity_briefings_kind_published_idx
  on curiosity_briefings (kind, published_at desc);

comment on table curiosity_briefings is
  'The day’s published Curiosity content. Written only by the refresh job; read by every page render.';

-- =============================================================================
-- 3. Rotation ledger
-- =============================================================================
-- Which content id was shown on which day. This is what "previously displayed
-- items are not immediately repeated" means in practice: the rotation excludes
-- ids in this table before it picks. The primary key doubles as the duplicate
-- guard — a job that runs twice in one day cannot record the same item twice, and
-- an insert retry is harmless.

create table if not exists curiosity_seen (
  category text not null check (category in ('one-thing', 'literature', 'learn-something', 'book', 'speak-better', 'mythology', 'chemistry', 'physics', 'biology', 'sharpener')),
  content_id text not null,
  shown_on date not null,
  recorded_at timestamptz not null default now(),
  primary key (category, content_id, shown_on)
);

create index if not exists curiosity_seen_category_recent_idx
  on curiosity_seen (category, shown_on desc);

comment on table curiosity_seen is
  'Publication history per category; the publisher reads it to avoid recent repeats.';

-- =============================================================================
-- 4. Job lease — overlapping runs and duplicate publications
-- =============================================================================
-- One row, one lease. A scheduled run claims it in a single upsert whose WHERE
-- clause is only satisfied when no lease is held, so two runners — cron plus a
-- manual click, or a retried workflow — cannot interleave a publish. The lease
-- expires rather than being released by a process that died, so a killed run
-- cannot wedge the schedule permanently.

create table if not exists curiosity_jobs (
  id integer primary key default 1 check (id = 1),
  lease_token text,
  lease_expires_at timestamptz,
  claimed_at timestamptz,
  last_result text,
  last_error text,
  last_finished_at timestamptz
);

insert into curiosity_jobs (id) values (1) on conflict (id) do nothing;

create or replace function curiosity_acquire_lease(lease_seconds integer default 300)
returns text
language sql
security definer
set search_path = public
as $$
  with attempt as (
    insert into curiosity_jobs as j (id, lease_token, lease_expires_at, claimed_at)
    -- Clamped both ways: a lease short enough to be useless and one long enough to
    -- hold the schedule hostage are both capped, so a mis-called argument cannot
    -- turn into a denial of the daily publish.
    values (1, md5(random()::text || clock_timestamp()::text), now() + make_interval(secs => least(greatest(coalesce(lease_seconds, 300), 5), 900)), now())
    on conflict (id) do update
      set lease_token = excluded.lease_token,
          lease_expires_at = excluded.lease_expires_at,
          claimed_at = excluded.claimed_at
      -- Claim only when nobody holds a live lease. A row whose lease expired is
      -- fair game; a live one is not, and the caller gets NULL and does nothing.
      where j.lease_token is null or j.lease_expires_at < now()
    returning j.lease_token
  )
  select lease_token from attempt;
$$;

create or replace function curiosity_release_lease(lease_token text, result text default null, error text default null)
returns boolean
language sql
security definer
set search_path = public
as $$
  -- Released by token, so a slow run that already lost its lease cannot clear the
  -- one somebody else just took.
  with released as (
    update curiosity_jobs
       set lease_token = null,
           lease_expires_at = null,
           last_result = coalesce(result, last_result),
           last_error = error,
           last_finished_at = now()
     where id = 1 and lease_token = curiosity_release_lease.lease_token
    returning 1
  )
  select exists (select 1 from released);
$$;

comment on function curiosity_acquire_lease is 'Atomic single-flight claim for the Curiosity refresh job; NULL means another run holds the lease.';

-- =============================================================================
-- 5. Row Level Security
-- =============================================================================
-- Today's briefing is not private: it is the same content every reader sees, and
-- the anon key is public by design. So the app may READ all of it and write none
-- of it. Writes come only from the server-side publisher using the service-role
-- key, which bypasses RLS and must never appear in client code or a
-- NEXT_PUBLIC_* variable. There is deliberately no policy granting insert,
-- update or delete to anon or authenticated roles: an unauthenticated visitor who
-- reaches the refresh endpoint can trigger a fetch, never forge a day of content.

alter table curiosity_content enable row level security;
alter table curiosity_briefings enable row level security;
alter table curiosity_seen enable row level security;
alter table curiosity_jobs enable row level security;

drop policy if exists "curiosity_content_read" on curiosity_content;
create policy "curiosity_content_read" on curiosity_content for select using (true);

drop policy if exists "curiosity_briefings_read" on curiosity_briefings;
create policy "curiosity_briefings_read" on curiosity_briefings for select using (true);

drop policy if exists "curiosity_seen_read" on curiosity_seen;
create policy "curiosity_seen_read" on curiosity_seen for select using (true);

drop policy if exists "curiosity_jobs_read" on curiosity_jobs;
create policy "curiosity_jobs_read" on curiosity_jobs for select using (true);

-- No write policies. `curiosity_jobs` is reachable only through the two
-- SECURITY DEFINER functions above, which run as the owner.
revoke all on curiosity_jobs from anon, authenticated;
revoke execute on function curiosity_acquire_lease(integer) from public, anon, authenticated;
revoke execute on function curiosity_release_lease(text, text, text) from public, anon, authenticated;
grant execute on function curiosity_acquire_lease(integer) to service_role;
grant execute on function curiosity_release_lease(text, text, text) to service_role;

-- =============================================================================
-- CHECKS after applying (read-only)
-- =============================================================================
--   select relrowsecurity from pg_class
--     where relname in ('curiosity_content','curiosity_briefings','curiosity_seen','curiosity_jobs');  -- 4 × true
--   select policyname, cmd from pg_policies where tablename like 'curiosity_%';                        -- 4 select policies
--   select count(*) from curiosity_briefings;                                                            -- 0 until first publish
--   select lease_token, lease_expires_at from curiosity_jobs;                                            -- null, null
--   -- the lease really is single-flight: two back-to-back calls, second is NULL
--   select curiosity_acquire_lease(30);
--   select curiosity_acquire_lease(30);
--   select curiosity_release_lease('<the token returned above>');
--   -- existing user data untouched:
--   select count(*) from tasks; select count(*) from milestones;
--
-- ROLLBACK (removes only what this file created; the app falls back to the file
-- store and the built-in pool either way)
--   drop function if exists curiosity_release_lease(text, text, text);
--   drop function if exists curiosity_acquire_lease(integer);
--   drop table if exists curiosity_jobs;
--   drop table if exists curiosity_seen;
--   drop table if exists curiosity_briefings;
--   drop table if exists curiosity_content;
--
-- =============================================================================
-- OPTIONAL: run the schedule from the database (Supabase Cron)
-- =============================================================================
-- Not applied by this migration. Enabling `pg_net` and scheduling a daily HTTP
-- call is the database-side alternative to Vercel Cron / GitHub Actions; the job
-- itself stays in the app, because that is where the sources, the pool and the
-- rendering live. Requires the project URL and the cron secret as app settings,
-- and 18:30 UTC = 00:00 Asia/Kolkata year-round:
--
--   create extension if not exists pg_cron with schema extensions;
--   create extension if not exists pg_net  with schema extensions;
--
--   select cron.schedule(
--     'focusdesk_curiosity_daily',
--     '30 18 * * *',
--     $$
--       select net.http_post(
--         url := 'https://<your-app-origin>/api/curiosity/refresh?scope=all',
--         headers := jsonb_build_object(
--           'content-type', 'application/json',
--           'authorization', 'Bearer ' || current_setting('app.curiosity_cron_secret', true)
--         )
--       );
--     $$
--   );
--
--   -- verify: select jobid, jobname, schedule from cron.job;
--   --   and:   select * from cron.job_run_details order by start_time desc limit 5;
--   -- unschedule: select cron.unschedule('focusdesk_curiosity_daily');
--
-- Keep the secret in a Supabase Vault/a settings table rather than inline in the
-- schedule text if you take this path; `current_setting('app.curiosity_cron_secret')`
-- above is the shape that keeps it out of `cron.job`.
