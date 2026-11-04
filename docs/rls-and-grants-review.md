# RLS and grants review — read-only report

**Status: report only. No SQL in this document has been executed, and none of it is
applied by a migration in this repository.** Every finding below comes from reading
`supabase/schema.sql`, `supabase/migrations/*.sql` and the client code. **I have not
queried the live database**, so the "as committed" column is a claim about the
repository, not about production. Where the two can differ, that is called out.

Date: 2026-11-04 · Scope: the five requirement areas delivered in this cycle
(task context copy, Projects & Goals view toggle, Speak Better B2–C2, Literature
discovery, Science discovery) plus the pre-existing Curiosity pipeline they build on.

---

## 1. What is committed today

### 1.1 User data tables (`tasks`, `projects`, `goals`, …)

`supabase/schema.sql` creates `goals`, `projects`, `tasks`, `inbox_items`, `ideas`,
`daily_priorities`, `weekly_priorities`, `monthly_priorities`, `task_history` and
`app_settings` with **no RLS**, no policies and no `user_id` column. Its own header
says so: *"single-user personal app … Adjust RLS policies once auth is added."*

Later migrations add `user_id` to their own new tables and enable RLS with four
own-row policies each (`auth.uid() = user_id`) for `wellbeing_days` (004),
`subtasks` (005), `timer_sessions` (006), `milestones` (007) and
`project_milestones` (008). `docs/phase6-bulk-delete-audit.md` states that "every
table has RLS enabled with 4 own-row policies" — that is true of the tables those
migrations create, and **not** automatically true of the ten tables in
`schema.sql`, which no migration re-declares.

**Consequence:** `SupabaseRepository` filters `.eq('user_id', …)` on every
read/update/delete and stamps `user_id` on every insert
(`lib/store/supabase-repository.ts`). That is an application-level filter. In
PostgREST it is **not** a security boundary: any holder of the publishable key, with
a valid session, can read another user's rows by not sending the filter — unless RLS
is enabled on the table in the live database.

**Whether it is enabled in production cannot be determined from this repository.** The
repository does not contain the SQL that would have enabled it on those ten tables, so
either it was applied out of band in the SQL editor, or it is not applied. This is the
single most important thing to check, and it is check §3.1.

### 1.2 Curiosity tables (009, 010, 011)

| Table | RLS | Policies committed | Posture |
| --- | --- | --- | --- |
| `curiosity_content` | enabled | `select using (true)` | public read, no write policy |
| `curiosity_briefings` | enabled | `select using (true)` | public read, no write policy |
| `curiosity_seen` | enabled | `select using (true)` | public read, no write policy |
| `curiosity_jobs` | enabled | `select using (true)` **and** `revoke all … from anon, authenticated` | deliberately closed; reachable only via two SECURITY DEFINER functions |
| `curiosity_candidates` | enabled | `select using (true)` | public read, no write policy |
| `curiosity_discovery_state` | enabled | `select using (true)` | public read, no write policy |
| `curiosity_discovery_runs` | enabled | `select using (true)` | public read, no write policy |

Writes are intended to come only from the service-role key held by the server. Both
new discovery collections follow exactly that posture: `payload` and licence fields on
`curiosity_candidates` are written by `SupabaseCandidateStore` with
`SUPABASE_SECRET_KEY`, and the scheduled jobs read that key from GitHub Actions
secrets — never from a `NEXT_PUBLIC_*` variable and never in a client bundle (§3.4).

`curiosity_jobs` is the one table where the commit does more than rely on the absence
of a write policy: it explicitly revokes all privileges from `anon` and `authenticated`
and revokes `EXECUTE` on both lease functions from `public, anon, authenticated`,
granting them only to `service_role`. **That is the correct pattern and should be the
template for anything server-only added later.**

### 1.3 Tables added in this cycle

**None.** Speak Better progress is `localStorage` only
(`pace.speakBetter.progress.v1`); the view toggle is `localStorage`
(`pace.viewMode.*`); task-context copy is a clipboard action with no persistence.
Literature and Science discovery added no table, no column, no policy and no grant —
they write into `curiosity_candidates`, `curiosity_discovery_state` and
`curiosity_discovery_runs` through the existing code path.

*This was a deliberate design choice to keep a content feature away from an open
grant review — see `docs/speak-better-levels.md` §Storage.*

---

## 2. Tables by required access

| Table | Public read (anon) | Authenticated read | Authenticated write | Server-only |
| --- | --- | --- | --- | --- |
| `curiosity_content`, `curiosity_briefings`, `curiosity_candidates`, `curiosity_discovery_runs` | **yes** — editorial content, identical for everyone | read | none | write |
| `curiosity_seen` | **yes** (current) — publication history; see note | read | none | write |
| `curiosity_discovery_state` | **no** — internal cursors and ETags | no | no | write |
| `curiosity_jobs` | **no** (already revoked) | no | no | write, via SECURITY DEFINER only |
| `tasks`, `projects`, `goals`, `inbox_items`, `ideas`, `*_priorities`, `task_history`, `app_settings` | **no** | own rows only | own rows only | — |
| `wellbeing_days`, `subtasks`, `timer_sessions`, `milestones`, `project_milestones` | **no** | own rows only | own rows only | — |

**Note on `curiosity_seen`:** it is "the same content every reader sees"
(009's rationale), but with the identity columns from 010 it now also records *what
this deployment published and when*. That is not per-user data and there is no
`user_id`, so a public read exposes publication history, not reader behaviour. Low
sensitivity. Keep as is unless the deployment is multi-tenant, in which case it
should follow the same reviewed path as the rest.

**`curiosity_discovery_state` is the one clear over-exposure in the committed
posture.** It holds cursor keys, continuation tokens and ETags. It is not secret in a
way that leaks credentials, but it tells a reader exactly which sources are being
walked and where, it is not needed by any client code (grep: nothing under `app/` or
`components/` reads it), and it is written only by the service role. Making it
server-only is a one-line change.

---

## 3. Findings, in priority order

### 3.1 BLOCKER — RLS on the ten tables in `schema.sql` cannot be confirmed from the repo

**Risk:** if RLS is not enabled in production on `tasks`, `projects`, `goals`,
`inbox_items`, `ideas`, `*_priorities`, `task_history` or `app_settings`, then the
publishable key is a full read/write grant on every user's data. The application's
`.eq('user_id', …)` filter is bypassable by anyone who has the key — which is
everyone, because it ships in the browser bundle.

**Check (read-only), run in the Supabase SQL editor:**

```sql
select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
 order by c.relrowsecurity, c.relname;
```

Every row for a table holding user data should read `rls_enabled = true`. A `false`
here is the whole of this report's risk in one column.

### 3.2 MEDIUM — default `anon`/`authenticated` grants

Supabase grants `anon` and `authenticated` broad table privileges by default on
`public` tables, and RLS is then the only thing filtering rows. That is safe **only if**
RLS is enabled everywhere. Since 3.1 cannot be confirmed, the grants should be checked
and, where a table has no policy at all, revoked — because a table with grants and no
RLS is open, and a table with grants, RLS enabled and no policy is closed by policy
but still carries an unnecessary privilege.

**Check (read-only):**

```sql
select table_schema, table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privs
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee in ('anon', 'authenticated')
 group by 1, 2, 3
 order by 2, 3;
```

**Remediation SQL — NOT executed, needs separate review before anyone runs it.**
Written for the *server-only* tables only, where the intent is unambiguous:

```sql
-- Server-only: nothing client-side reads or writes these.
revoke all on table curiosity_discovery_state from anon, authenticated;
revoke all on table curiosity_jobs          from public, anon, authenticated;
```

**Remediation SQL for the user-data tables — do not run this as written.** Revoking
`select`/`update`/`delete` from `authenticated` would break the app, because
`SupabaseRepository` relies on the authenticated role. The correct sequence is the
opposite one: **enable RLS and add own-row policies first**, verify, and only then
consider narrow grants.

```sql
-- NOT TO BE RUN WITHOUT REVIEW. Template only: the live columns of these tables are
-- not in this repository (no migration adds `user_id` to them), so `user_id` must be
-- confirmed present and populated before any policy below would be correct.
-- alter table tasks enable row level security;
-- create policy "tasks_select_own" on tasks for select using (auth.uid() = user_id);
-- create policy "tasks_insert_own" on tasks for insert with check (auth.uid() = user_id);
-- create policy "tasks_update_own" on tasks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- create policy "tasks_delete_own" on tasks for delete using (auth.uid() = user_id);
```

The reason this is a template and not a migration: a policy on a column that does not
exist in production, or that is null on legacy rows, silently hides every row. That is
a data-loss-shaped bug, not a security fix, and it is not something to ship inside a
feature PR. It belongs in its own reviewed change with a rollback note, and it must be
tested against a copy of the real schema. `scripts/verify-project-milestones-sql.ts`
already runs PGlite against a real schema and is the right place for that test.

### 3.3 LOW — `curiosity_discovery_state` is publicly readable and no client needs it

Covered by the first remediation statement above. Low severity, trivial fix, no
behavioural impact: no client code reads it.

### 3.4 VERIFIED — no server secret reaches the client bundle

Checked rather than assumed:

- `SUPABASE_SECRET_KEY` is read only in `lib/curiosity/{content-db,state,reservoir}.ts`
  and `lib/discovery/persist.ts` — all server-side modules, none imported from a
  client component or from `app/` page code that ships to the browser.
- The browser client (`lib/supabase/client.ts`) takes only
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- The new scheduled jobs read the service-role key from **GitHub Actions secrets**
  (`secrets.SUPABASE_SECRET_KEY`) and pass it through the job's `env`, never a
  committed file; the workflows log no environment.
- `verify-curiosity-automation.tsx` already asserts that no server-only name appears
  under `.next/static`, and it still passes on this branch.

### 3.5 VERIFIED — the new discovery code cannot be used as an unauthenticated write path

The discovery adapters and run helpers are imported by exactly two entry points:
`scripts/discover-literature.ts` and `scripts/discover-science.ts`, both run from GitHub
Actions. No route handler, server action or component imports them —
`scripts/verify-discovery.tsx` walks `app/` and `components/` and fails if one does.
So there is no HTTP surface through which a third party can cause a reservoir write.

The one authenticated write surface that already existed, `/api/curiosity/refresh`, is
unchanged by this work; it authenticates with a bearer `CURIOSITY_CRON_SECRET` and
falls back to a user-session check (`lib/curiosity/refresh-auth.ts`).

### 3.6 NOT A FINDING — the discovery run log is public

`curiosity_discovery_runs` records counts, notes and per-source statuses. It contains
no credentials, no reader data and no URL bearing a key (the HTTP client's
`redactUrl` strips query strings before any note is written). Public read is
consistent with the Curiosity telemetry it sits beside.

---

## 4. Impact on the restored Curiosity pipeline

**None from anything recommended above.** The pipeline reads
`curiosity_content`, `curiosity_briefings` and `curiosity_seen` with the publishable
key and writes with the service-role key. The two statements in §3.2 touch
`curiosity_discovery_state` and `curiosity_jobs`:

- `curiosity_discovery_state`: the app never reads it; the scheduled discovery job
  reads and writes it with the **service role**, which bypasses RLS and grants. So
  revoking from `anon`/`authenticated` cannot affect a run. Production discovery run
  #13 (`curiosity_discovery_runs`) is unaffected.
- `curiosity_jobs`: already revoked today; the pipeline reaches it only through the two
  SECURITY DEFINER functions granted to `service_role`.

The template in §3.2 for user tables would, if applied, change nothing in the Curiosity
path — it touches neither the `curiosity_*` tables nor the lease.

---

## 5. What was NOT done

- **No SQL was executed.** No `psql`, no Supabase client call, no `supabase db push`.
- **No policy or grant was changed** in this repository, in any migration, or in any
  feature branch.
- **The live database was not inspected.** Every "as committed" statement is about
  files in this repository. Where production can differ — and §3.1 says it can — that
  is stated rather than assumed.
- **No attempt was made to derive production grants from the application's behaviour.**
  The app's `user_id` filters would work identically whether or not RLS exists, so
  behaviour is not evidence of policy.

## 6. Recommended order of operations

1. Run check §3.1. Nothing else matters until its answer is known.
2. If any user-data table shows `rls_enabled = false`: treat it as an incident, enable
   RLS in a maintenance window, and only then add own-row policies against the real
   column list — after a PGlite rehearsal and with a rollback plan.
3. Apply the two server-only revokes in §3.2 (no behaviour change, no migration needed
   to keep the app working).
4. Re-run check §3.2 to confirm the grants now match §2.
5. Decide, as a product question, whether `curiosity_seen` should stay public-read.
