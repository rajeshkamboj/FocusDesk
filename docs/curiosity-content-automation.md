# Curiosity content automation

How the Curiosity tab gets its daily content, who publishes it, where the record
lives, and what an operator has to do — nothing, or one of three equivalent things.

Read this file before changing anything under `lib/curiosity/`. The prior document,
[`curiosity-expansion-audit.md`](./curiosity-expansion-audit.md), covers the card
inventory and two rules that still hold: no content arrays inside client components,
and a shape change to a published payload must not be shipped against an old snapshot.
Its conclusion that the tab needed no CMS and no schema change is superseded here.

---

## 1. What changes, and when

| Card | Cadence | Content origin |
| --- | --- | --- |
| One Thing Worth Knowing | daily, 00:00 Asia/Kolkata | pool of 22 (`lib/curiosity/content/one-things.ts`) |
| A Few Minutes of Literature | daily, same moment | pool of 24 (`literature.ts`) |
| Learn Something | daily, same moment | pool of 24 (`learn-something.ts`) |
| One Book | **every 3 days** | pool of 25 (`books.ts`) + Open Library lookup at publish time |
| What's New in AI | daily, same moment | six vendor/newsroom RSS feeds |
| Developer Radar | daily, same moment | GitHub Search API (`api.github.com`) |
| Today in History | daily, same moment | curated dated corpus, else Wikipedia's `onthisday` feed |
| Brain Sharpener, Speak Better, Mythology, Chemistry, Physics, Biology | daily, same moment | fixed corpora, offset rotation (no pool, no ledger) |

"The day" is the Asia/Kolkata calendar day, computed in `schedule.ts` with a fixed
UTC+05:30 offset — India has no daylight saving, so the offset never shifts. The
scheduler therefore fires at **18:30 UTC**, which is 00:00 IST year-round, and the
cron line `30 18 * * *` is the only schedule in the project. A device in another
time zone never sees a different day: the app requests a date, the server answers with
whatever snapshot belongs to it, and a not-yet-published date falls back to the pool
rotation for that date rather than an empty card.

Content is **never** generated per render or per visitor. A render reads a published
snapshot (or the deterministic pool rotation for that date); only the publisher
touches the network. `verify` check 6 measures this: 40 renders of a published day
make 0 source calls.

## 2. The publisher

`lib/curiosity/job.ts` → `runCuriosityRefresh({ scope, force, offline, trigger, now, fetchImpl })`.
It is the only module that writes the store and the only one that makes an outbound
request for publication. One call:

1. computes the publication date, then asks the store for a **lease**
   (`curiosity_acquire_lease` in Postgres, a `wx` lock file on disk). A run that cannot
   claim it returns `status: 'busy'` and writes nothing, so two schedulers — or a
   scheduler and an admin clicking a button — cannot interleave a publish;
2. re-reads the state *under* the lease, so a predecessor's commit is visible;
3. publishes the book first, if it is due, then the daily cards, as **one** snapshot
   write — never half a day;
4. appends the ledger rows and the run log.

The invariants that make this safe to run repeatedly:

* **A day is published at most once.** The snapshot is keyed by `(kind, date_key)` and
  an upsert on that key means a late, duplicated or retried run overwrites only its own
  day. `already-published` is the reason reported, not an error.
* **Re-publishing today does not reshuffle today.** With `force`, the daily picks are
  reused from the existing snapshot and only the live sections are refreshed; no new
  ledger rows are written. A reader looking at the page does not watch the article
  change underneath them. (`New book now` is the deliberate exception: it exists to
  swap the book, and it says so.)
* **The book never re-rolls within its own day.** Same reason.
* **A failure keeps the last good content.** If Open Library does not answer, the
  previous recommendation stays published and the interval clock does not move (it is
  measured from the last *successful* publish), so the next scheduled run retries. If a
  news feed returns nothing, the section keeps the items from the last successful day
  and the snapshot records `aiWorld: source returned nothing; kept the N item(s) from
  <date>`. The page header prints the count — "*N* section(s) showing fallback text
  because a source did not answer" — while the verbatim note stays in the status payload,
  so a reader sees that something degraded without the card claiming the list is fresh.
* **One section is exempt from that rule, on purpose.** "Today in History" is not
  carried over. A news item is labelled with its own date, so yesterday's entry is
  still a true statement today; yesterday's anniversary under a "Today in History"
  heading would be a false one. That card shows its unavailable state instead.
* **Nothing is invented when a source is down.** Degradation is recorded per section on
  the snapshot, surfaced in `GET /api/curiosity/refresh?action=status` and listed in
  Settings.

### The seen ledger

`curiosity_seen` (and `state.seen` in the file store) records `(category, content_id,
shown_on)` for the three rotating daily cards and the book — the five fixed-corpus cards
and the history event do not rotate, so they are not tracked. Selection prefers an entry
that has not been shown in the last 30 days; when every entry is exhausted the oldest
candidate is chosen, so the pool cycles instead of repeating back-to-back. Four rows
per day, 400 kept.

## 3. The content pool

Content lives in version control, which is the maintenance answer for a pool this size:
`lib/curiosity/content/*.ts`, one export per card, each entry shaped as

```ts
{
  id: 'one-thing-mercator',          // stable; it is what the ledger stores
  category: 'one-thing',
  availableFrom: '2024-01-01',       // never eligible before this day
  provenance: 'curated',             // 'curated' | 'source-checked'
  tags: ['maps', 'geometry'],
  source: { url: 'https://…', name: 'Wikipedia · Mercator projection', attribution?: '…' },
  item: { /* the fields the card renders */ },
}
```

`provenance` is an honesty field, not a comment: `source-checked` is reserved for text
whose wording was compared against the linked source while writing it. `attribution` is
carried through to the card wherever a source's licence asks for it (MDN, Wikipedia's
CC BY-SA note, "brief excerpt" for quoted poems).

Adding an item is: write the entry, choose an `id` nobody used, set `availableFrom` to
the day you are committing, and run `npm run curiosity:verify`. Longer pools delay
repeats — that is the whole rotation policy, so pools grow rather than the algorithm
changing. The shapes of the five fixed-corpus items are listed in
[`curiosity-expansion-audit.md`](./curiosity-expansion-audit.md) §6; the four
pool-backed shapes are in `lib/curiosity/types.ts`.

### Database override (optional)

`curiosity_content` lets an operator pause, retag or re-date an item without a deploy.
It is **not** a CMS: the app never writes it, and nothing in the UI edits it. The pool
the publisher uses is the authored pool merged over the rows by `id`:

* a row with the same `id` and `status = 'retired'` removes that authored item;
* a valid row with a new `id` adds an item;
* a row whose `payload` does not satisfy the card's required fields is dropped, not
  rendered — a typo in the table can neither blank a card nor shift the rotation.

`npm run curiosity:refresh -- --backfill-pool` seeds the table from the authored pool
(needs the service-role key; upserts on `id`, never deletes). Reads use the
publishable key, because the table is world-readable by design.

## 4. Where the published record lives

Two backends, one contract (`lib/curiosity/state.ts`), chosen automatically:

* **Supabase** — when `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` both exist.
  Tables from `supabase/migrations/009_curiosity_content.sql`:
  `curiosity_briefings` (one row per `(kind, date_key)` for `daily` and `book`),
  `curiosity_seen` (ledger), `curiosity_content` (pool overrides), `curiosity_jobs`
  (the lease plus `last_result` / `last_error` / `last_finished_at`). RLS allows
  `select` to everyone and **no** write to `anon`/`authenticated`: writes come only
  from the server-side publisher with the service-role key, so a caller who reaches the
  refresh endpoint without a credential can trigger a fetch but can never forge a day
  of content. `curiosity_acquire_lease` / `curiosity_release_lease` are `security
  definer` functions granted to `service_role` only. **No existing table, column,
  policy or trigger is touched**, and no user data is stored in any of these tables.
* **File** — otherwise, at `.curiosity/state.json` (`CURIOSITY_STATE_FILE` overrides).
  Atomic write-then-rename, a lock file for the lease, `GET`-able with `cat`. This is
  what makes the feature work with zero credentials, and it is why `.curiosity/` is
  git-ignored. On a single long-lived host it survives restarts; it does not survive a
  rebuild of an immutable image, and it is not shared between instances — use Supabase
  where either matters.

Either way `read()` never throws: a missing, corrupt or un-migrated record reads as
"nothing published yet", which sends the page to the authored rotation instead of an
error page. The store's `kind` and `location` are echoed by
`GET /api/curiosity/refresh?action=status` and printed in Settings, so "which backend is
answering, and where" is always one question away.

## 5. Scheduling — three entry points, one code path

All three call `POST /api/curiosity/refresh?scope=all` at `30 18 * * *`, and all three
are optional because the app also self-heals on render (§6). Pick one.

| | Where | Needs | Notes |
| --- | --- | --- | --- |
| **Vercel Cron** | `vercel.json` | `CURIOSITY_CRON_SECRET` in project env | zero extra infrastructure if the app is already on Vercel. One line: `{"crons":[{"path":"/api/curiosity/refresh?scope=all","schedule":"30 18 * * *"}]}`. Check your plan's cron allowance; Vercel's scheduler can delay a run, which is harmless because the job is idempotent per day. |
| **GitHub Actions** | `.github/workflows/curiosity-daily.yml` | repo secrets `FOCUSDESK_URL`, `CURIOSITY_CRON_SECRET` | Works with any host. Retries twice, fails the run on a non-200, and has a `workflow_dispatch` form (`scope`, `force`) for a manual push. GitHub suspends scheduled workflows on repos without activity in 60 days — the run log in Settings tells you if that happened. |
| **Supabase pg_cron** | the commented block at the end of migration 009 | `pg_cron` enabled, `app.curiosity_cron_secret` set via `alter database … set`, plus an Edge Function (`supabase/functions/curiosity-refresh`) or pg_net to make the call | Keeps the schedule next to the data. The Edge Function is a thin caller: it reads `APP_URL` and `CURIOSITY_CRON_SECRET` as function secrets and passes the app's status through. It contains no content logic, so redeploying it can never change what is published. |

Self-hosting without any of those: `npm run curiosity:refresh` from a shell crontab
(`30 18 * * * cd /srv/focusdesk && npx tsx scripts/curiosity-refresh.ts --trigger=cron`,
or `0 0 * * *` on a box whose clock is already IST). It exits 1 only when the run
*failed*, so the cron mail is the alarm; `--status`, `--scope`, `--force`, `--offline`
and `--at=<iso>` exist for operators.

The endpoint accepts exactly two credentials: `Authorization: Bearer
$CURIOSITY_CRON_SECRET` (compared with `timingSafeEqual`), or a signed-in app user's own
access token verified through Supabase Auth. In production with neither configured it
answers 503 rather than running unauthenticated; outside production it allows a local
dev request. `trigger` is recorded as `cron` only for the shared secret, `admin`
otherwise, and the Settings panel echoes it so a working button can never be mistaken
for proof that the external schedule is locked down.

## 6. "No manual visit required" and the render-time catch-up

A render does not create content — but `catchUpOnRender` means a deployment whose cron
was suspended for three days does not show a three-day-old briefing: the first request
after a missed schedule fires one idempotent publish for the current day, and only for
the current day (a reader asking for a past date never triggers a write). It is a
safety net, rate-limited by the lease and by the fact that a published day is a no-op.
Set `CURIOSITY_AUTO_PUBLISH=off` once you have proven your scheduler, and the schedule
becomes the only writer. `verify` check 6 asserts both halves of that.

## 7. Open Library, and its usage rules

One `search.json` query per book publish — never one per candidate, never a crawl:

```
GET https://openlibrary.org/search.json?q=title:"<title>" author:"<first author>"
    &limit=5&fields=key,title,author,author_key,first_publish_year,latest_publish_year,
    publisher,number_of_pages,edition_count,cover_i,alternative_title,ia
User-Agent: FocusDesk/0.1 (+https://github.com/rajeshkamboj/FocusDesk; contact: <email>)
```

`OPENLIBRARY_CONTACT_EMAIL` (or `NEXT_PUBLIC_APP_CONTACT_EMAIL`) supplies that contact
address; their guidance asks for an identifying User-Agent, and 3 req/s is the
identified limit against 1 req/s anonymous. One request every three days is inside
either. `429`/`403` are treated as "do not push" — the run reports `failed` and keeps
the previous book rather than retrying blindly.

The volume is bounded structurally rather than by a rate limiter: a book record is
published at most once per publication day — `force` cannot re-roll the current day, so
even an operator pressing "New book now" repeatedly, or a workflow re-run in a loop,
costs at most one catalogue call per day.

* **Cover**: `https://covers.openlibrary.org/b/id/{cover_i}-M.jpg`, hot-linked from the
  card's `src`. Their covers documentation says explicitly *do not crawl the cover API*;
  the app never fetches covers server-side, so no IP-based cover limit (100 requests per
  5 minutes for lookups by anything other than a cover id) can be hit — and the
  `-M` size is used rather than `-L`, which can require a second redirect-following
  request. Mid-size JPEGs are metadata-scale thumbnails of a book cover, used with the
  record link next to them. When `cover_i` is missing, or the image fails in the
  browser, the card falls back to `public/images/curiosity/book-cover-placeholder.svg`
  (a local drawing, no `alt` text pretending to be a cover).
* **Metadata**: only `title`, `author`, `first_publish_year`, `edition_count`,
  `publisher`, `number_of_pages`, `alternative_title` and `ia` from that response are
  shown, each *only when present* — the card renders no year, no edition count and no
  "X editions" line that the record did not supply. Every optional field is treated as
  possibly absent, because Open Library does not guarantee them.
* **Synopsis and "why worth reading" come from the curated pool**, never from a model or
  a review scrape. The only text the lookup can add is a publication-year suffix, and
  only when the record's `first_publish_year` is at least two years back. There are no
  ratings, no review quotes and no availability claims: `ia` produces a
  `https://archive.org/details/<id>` "read a scanned copy" link *only* when the record
  lists that identifier, phrased as "Open Library lists a scanned copy; reading or
  borrowing depends on the holding library". The card links to the matched
  `/works/OL…W` record.
* **Copyright**: public-domain works are quoted as short excerpts with the translator and
  the source named; nothing in the pool reproduces a copyrighted text.

## 8. Credentials

Nothing is required to run Curiosity. The full set:

| Variable | Required for | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | normal app auth (already in `.env.example`) | the publishable key is public by design |
| `SUPABASE_SECRET_KEY` | durable multi-instance content, `--backfill-pool` | service-role, server-side only, never a `NEXT_PUBLIC_*` variable. Without it the store is the file |
| `CURIOSITY_CRON_SECRET` | Vercel/Actions/pg_cron calling the endpoint | unset in production ⇒ endpoint 503s to anonymous callers, admin path still works |
| `CURIOSITY_STORE`, `CURIOSITY_STATE_FILE` | choosing / relocating the store | `file` forces the file store even with a database present |
| `CURIOSITY_AUTO_PUBLISH` | turning the render-time safety net off | `off` = schedule only |
| `OPENLIBRARY_CONTACT_EMAIL` | a polite User-Agent for Open Library | optional, recommended |

There is **no paid AI API in this design and no fake integration**: the AI news card is
six feeds (`sources.ts` constants: OpenAI, Anthropic, Google DeepMind, Hugging Face,
Microsoft AI, Meta AI), and no LLM generates published text. If someone later wants
generated content, it must be a separate documented dependency with its own key and its
own `provenance` marker — the pool and the fallback exist so that the tab never needs
any generator to have something to show.

## 9. Verifying it

```bash
npm run curiosity:verify                                  # the seven requirements
npx tsx scripts/verify-daily-content.tsx                   # the pre-existing page checks
npx tsx scripts/verify-mobile-layout.tsx                  # needs `npm run build` first
npm run curiosity:links                                    # every pool URL, from a machine with egress
npm run build && npm run lint
npm run curiosity:refresh -- --status                      # what an operator wants next
```

`scripts/verify-curiosity-automation.tsx` is deliberately not a live-network test: it
injects a scripted `fetchImpl` (deterministic Open Library, RSS, GitHub and Wikipedia
payloads) and a temp file store, and drives the real publisher. It asserts, in order:
**(1)** the day rolls at 18:30 UTC and every pool item is reachable inside a year;
**(2)** the book holds on days +1 and +2, publishes on +3 with exactly one catalogue
call, while the daily cards still advance; **(3)** a failed lookup keeps the previous
book, degraded feeds are recorded, and a corrupt store falls back instead of erroring;
**(4)** twelve consecutive days give twelve distinct items per category and one ledger
row per item, and a forced same-day re-run is a no-op; **(5)** covers, publication
lines and preview links only ever say what the record supports, and the rendered card
shows exactly that; **(6)** renders make no source calls, the catch-up rules hold, all
four scheduler entry points say `30 18 * * *`, and the endpoint fails closed;
**(7)** a restart reads back the identical snapshot, and a run that cannot take the
lease writes nothing. A final block drives the Supabase store against a scripted
PostgREST boundary — the same technique `verify-daily-content.tsx` uses for the app's
own repository — covering lease acquisition and release, `(kind, date_key)` upserts,
the ledger, read/write key separation, and an un-migrated database degrading quietly.

Results of the run performed for this change (sandbox, no outbound network): `tsc
--noEmit` clean, `eslint` clean, `next build` clean with no warnings,
`verify-curiosity-automation.tsx` **PASS, six consecutive runs**, `verify-daily-content.tsx`
PASS, `verify-mobile-layout.tsx` PASS (all mobile-layout checks), `npm run
curiosity:links` executed and reported honestly that this machine has no egress (so the
links are *not* confirmed from here — see below). Six repeats were run because the
overlap check touches a real lock file; it now signals from inside the lease instead of
polling for it, which had been a race in the test rather than in the code.

**Not verified here, and you must verify it once in your environment**: a live Open
Library response (the scripted payload is a real captured shape, but this sandbox has no
egress to `openlibrary.org`), a live RSS/GitHub/Wikipedia fetch, migration 009 applied to
a project, the Edge Function deployed, the Actions workflow running on a schedule, and
`npm run curiosity:links` — which needs a machine that can reach the 73 cited URLs.

## 10. Runbook

* **Add content** → edit the pool file, `npm run curiosity:verify`.
* **Retire content now** → set `status='retired'` on the `curiosity_content` row for that
  id (`update curiosity_content set status='retired' where id='…';`). The card changes at
  the next publish, and the ledger keeps pointing at a real row.
* **Publish today now** → Settings → Data → *Curiosity content automation* → "Publish
  today", or `npm run curiosity:refresh -- --force`.
* **Change the book only** → the same panel's "New book now" (`scope=book&force=1`).
* **Nothing published?** → `--status`. `store.location` says which backend is answering;
  `scheduler.cronSecretConfigured: false` in production means the endpoint is closed to a
  scheduler; `degraded` names the sections that fell back.
* **Stuck "busy" forever?** Should not happen — leases expire (5–15 minutes, clamped in
  SQL). `select * from curiosity_jobs` shows the lease and the last result; clearing
  `lease_token` is safe while no run is in flight.
* **Reset local state** → delete `.curiosity/state.json`. The page still renders: the
  pool is the fallback dataset, and the next publish repopulates the store.
