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
| What's New in AI | daily, same moment | eight first-party AI newsrooms (RSS/Atom); previously published real news when live is empty |
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
  AI news comes back empty, the section keeps the items already published for an earlier
  day — real items, original dates, labelled *Cached* — and the snapshot records
  `aiWorld: nothing usable from the live source (…); kept the N item(s) published for
  <date>, with their original dates`. The page header prints the count — "*N* section(s)
  showing fallback text
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

### What the store is allowed to claim

Every read of the published record — page, status endpoint, admin panel — carries the
store's `durability`, and the words are chosen so that a successful write cannot be
mistaken for persistence:

| | Means |
| --- | --- |
| `shared` | Supabase. Every instance and every restart reads the same row. Only true once migration 009 is applied; it is **not** applied here, so this deployment does not have it. |
| `single-host` | A file on a disk this process may write. Survives a restart of this machine; another instance, or a redeploy onto a different one, will not see it. |
| `instance-only` | The filesystem was read-only (the normal Vercel case: `/var/task` is read-only and `/tmp` is per-instance), so the record moved to `${tmpdir}/focusdesk-curiosity` and will vanish with the instance. |
| `unproven` | Nothing has been written from this process yet, so it has not had to discover whether its directory is writable. |

The file store never reports `shared`, and no UI element implies that a published day is
visible to other instances. `location` says so too — when a relocation happens it reads
`… · ephemeral: moved there because EROFS on /var/task` rather than quietly pointing at a
path that no longer exists.

## 5. Scheduling — one publisher, three ways to call it

Exactly one of these should be enabled, because two schedulers on one endpoint buy
nothing: the lease serialises them and the day is published once either way. All of them
call `POST /api/curiosity/refresh?scope=all` at `30 18 * * *`, and all are optional in
the sense that the app also self-heals on render (§6) — but without one of them the
briefing only turns over when somebody opens the page.

| | Where | Needs | Notes |
| --- | --- | --- | --- |
| **GitHub Actions** (the one this repository ships) | `.github/workflows/curiosity-daily.yml` | repo secrets `FOCUSDESK_URL`, `CURIOSITY_CRON_SECRET` | Works with any host. Retries twice for a cold start, fails the run unless the response body says `published`/`already-published`/`partial`, then reads `action=status` back and checks that today's snapshot exists in the store. A `workflow_dispatch` form (`scope`, `force`) exists for a manual push. GitHub suspends scheduled workflows on repos with no activity in 60 days — the run log in Settings tells you if that happened. |
| **Vercel Cron** | — | not usable against this endpoint | Vercel's scheduler sends a bare `GET` with no custom headers, so it cannot present `Authorization: Bearer $CURIOSITY_CRON_SECRET`. The alternative — the secret in a query string — is refused on purpose: URLs land in access logs and in browser history. `vercel.json` therefore declares **no** `crons`, and a run configured there would answer 401 every night. If Vercel's cron is ever the only option, the endpoint it needs is a separate one guarded by `VERCEL_CRON`-style header verification, which is not implemented here. |
| **Supabase pg_cron** | the commented block at the end of migration 009 | `pg_cron` enabled, `app.curiosity_cron_secret` set via `alter database … set`, plus an Edge Function (`supabase/functions/curiosity-refresh`) or pg_net to make the call | Keeps the schedule next to the data, and needs migration 009 to be applied. The Edge Function is a thin caller: it reads `APP_URL` and `CURIOSITY_CRON_SECRET` as function secrets and passes the app's status through. It contains no content logic, so redeploying it can never change what is published. |
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
eight first-party feeds (`AI_WORLD_FEEDS` in `sources.ts`: OpenAI, Anthropic, Google
DeepMind, Google AI, Hugging Face, Microsoft AI, Meta AI, Higgsfield), and no LLM
generates published text. `CURIOSITY_AI_FEEDS="Name|https://…/feed.xml"` adds an operator
verified feed without a deploy; an entry without a name, without an absolute `http(s)`
URL, or pointing at a host already read is ignored rather than fetched. If someone later
wants generated content, it must be a separate documented dependency with its own key and
its own `provenance` marker — the pool exists so that the tab never needs any generator to
have something to show, and the AI card is allowed to be honestly empty instead (see §11).

## 9. Verifying it

```bash
npm run curiosity:verify                                  # 22 lifecycle + reliability checks
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
shows exactly that; **(6)** renders make no source calls, the catch-up rules hold, every
scheduler entry point says `30 18 * * *` while `vercel.json` stays cron-free, and the
endpoint fails closed; **(7)** a restart reads back the identical snapshot, and a run
that cannot take the lease writes nothing.

**(8)** drives the Supabase store against a scripted PostgREST boundary — the same
technique `verify-daily-content.tsx` uses for the app's own repository — covering lease
acquisition and release, `(kind, date_key)` upserts, the ledger, read/write key
separation, and an un-migrated database degrading quietly. **(9–18)** are the production
reliability cases: total source outage (every card populated, labelled and explained);
feed parsing (RSS and Atom, CDATA and entities, self-closing links, wrong content types,
malformed XML, the recency window, one dead host not blocking the rest); GitHub errors
(403/429 named as rate limits with their `Retry-After`, 5xx and non-JSON distinguished,
incomplete or unsafe rows dropped, repeats collapsed) and the admin probe; fourteen days
of history cards, each either verified for its date or an archive entry that says so; a
coverless record rendering the local placeholder; validation before the write, with a
failure inside the lease leaving the previous snapshot byte-identical; a read-only
filesystem; durability never overstated; one publisher and no credential in a committed
file; and an audit of the whole curated corpus — ids, links, provenance, prose, rotation.
**(20)** publishes the two science levels: Foundation is the default card in all three
disciplines, a qualified research record reaches Undergraduate with its DOI, peer-review
status and link intact, the three disciplines are counted and explained independently,
stale (61+ days), low-significance (below 35) and invalid records are refused with a
specific reason, an empty or unreadable library says so instead of showing a blank card, a
record survives the candidate store round trip and publication, and the rendered page
offers exactly two levels with Foundation first. **(21)** takes the AI card offline the day
after a good publish: the day still publishes, the card keeps exactly the previous day's
stories with their original publication dates under *cached — original dates kept*, the
snapshot records `sections.aiWorld = 'cached'` and the reason, the day is not reported
complete, and no curated explainer is substituted in. **(22)** reproduces the 2026-11-11 refusal from the stored shape that caused it, proves a
valid legacy Physics or Biology record is completed from its own provenance and publishes
with its DOI, date, peer-review status and link intact, proves an already-stamped record is
left alone, refuses curated, foundation-marked, unknown-level, link-less, DOI-less,
press-release and concept-less rows by name, keeps expired and rejected rows out of the
lane, and verifies that a real validation failure answers 422 (and a storage fault 503)
while the published snapshot is untouched. **(19)** confirms nothing outside Curiosity
changed, against `git merge-base HEAD origin/main`.

Results of the run performed for the no-curated-AI-World change (sandbox, no outbound
network): `npx tsc --noEmit` clean, `eslint lib components app` clean, `next build` clean,
`verify-curiosity-automation.tsx` **PASS — 22 checks plus the Supabase and "unrelated
files" wiring reports**, `verify-daily-content.tsx` PASS (366 daily selections),
`curiosity:dedupe`, `curiosity:books` (65 checks), `curiosity:reservoir` (10 checks),
`curiosity:history` (11 checks), `verify:discovery`, `verify:science`,
`verify:daily-knowledge` and `verify:learnings` (43 checks) all exit 0.
`npm run curiosity:links` was executed and reported honestly that this machine has no
egress: **125 URLs, 0 ok, 125 unreachable, 0 dead** — every request failed at the network
layer, which is the expected output for a sandbox and the reason the check exists. The dev
server and the browser were **not** driven for this change; the rendered pages were checked
through `renderToStaticMarkup` inside the harness instead (check 9 renders the outage page,
check 13 the coverless book card), so no claim is made here about a live deployment.
`action=probe` now covers eleven sources — the eight registry feeds plus GitHub, Wikipedia
and Open Library — and is asserted structurally (check 11), not against the live network.
`verify-mobile-layout.tsx` needs `jsdom`, which the repository does not list as a
dependency; it was installed with `npm install --no-save jsdom` for this run and is the
one thing about that check worth fixing separately.

**Not verified here, and you must verify it once in your environment**: a live Open
Library response (the scripted payload is a real captured shape, but this sandbox has no
egress to `openlibrary.org`), a live RSS/GitHub/Wikipedia fetch, migration 009 (and, for
the repetition windows, 010) applied to a project, the Edge Function deployed, the Actions
workflow running on a schedule, and `npm run curiosity:links` — which needs a machine that
can reach the cited URLs, pool entries and curated shelves alike.

Three of the eight AI feeds were fetched and confirmed as dated RSS/Atom during this change
(OpenAI, Google AI, Higgsfield) through a page-reading tool rather than the app's `fetch`;
the other five (Anthropic, DeepMind, Hugging Face, Microsoft AI, Meta AI) keep their
long-standing URLs with no fresh verification note. Re-run
`curl -s <deployment>/api/curiosity/refresh?action=probe | jq` from the deployment before
trusting any of them, and treat a feed that answers `text/html` as moved rather than fixed
by guesswork.

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
* **A publish was refused?** → read `failure.kind` in the response body, not just the
  status: `invalid-content` (422) means the content failed validation and the `problems`
  array names the section, the expected value, the actual value and the candidate id;
  `no-eligible-content` (409) means nothing was eligible; `storage` (503) means retry;
  `upstream` (502) means a source or the discovery job failed. The previous day's
  snapshot is untouched in every case. See §12.
* **Undergraduate card missing for a discipline?** → `action=status` reports
  `science.disciplines.<discipline>` with `stored / usable / qualified`, how many records
  were completed from legacy metadata (`normalized`) and any `rejected` codes with their
  reasons. Nothing needs re-seeding: the next science discovery run rewrites the row with
  a full concept.
* **Stuck "busy" forever?** Should not happen — leases expire (5–15 minutes, clamped in
  SQL). `select * from curiosity_jobs` shows the lease and the last result; clearing
  `lease_token` is safe while no run is in flight.
* **Reset local state** → delete `.curiosity/state.json`. The page still renders: the
  pool and the curated shelves are the fallback dataset, and the next publish
  repopulates the store.
* **Which content is on screen right now?** → the label on each card (*curated*,
  *Cached*, *temporarily unavailable*, *From the archive*). Settings → Data shows the same
  thing per section (`Cards`), the last attempt and its result, the store's durability, the
  scheduler's last success and last failure, the AI World feed registry with each feed's
  reported state, and the science counts by discipline and level. `action=status` returns
  all of it as JSON.
* **Turn the production scheduler on** (nothing in this repository can do this for
  you; it needs the deployment's UI): ① set `CURIOSITY_CRON_SECRET` in the Vercel
  project environment to a long random value (`openssl rand -hex 32`) and redeploy;
  ② in GitHub → Settings → Secrets and variables → Actions add `CURIOSITY_CRON_SECRET`
  with the same value and `FOCUSDESK_URL` with the app's origin; ③ run
  *Curiosity daily publish* once from the Actions tab with `force` ticked. It must
  print `Publish result: published` and then `Confirmed: <today> is published, store
  …`. If step ① is skipped the endpoint answers 503 in production and only the
  render-time catch-up turns the day over.

## 11. When a source is down: fallback, not an empty card

No card is ever empty because a source failed. That is a design rule, not a hope: the
publisher walks a fixed chain per section and stops at the first link that has content.

1. **Today's live content.** Whatever the feeds, `api.github.com` or Wikipedia produced
   for this day, validated (URL shape, parseable date, inside the 45-day window,
   deduplicated).
2. **The last content that did answer** — kept with its own dates and links, so the card
   is stale but every sentence in it is still true. It is never relabelled as today's.
3. **This repository's curated shelf**, which exists so that step 2 can be skipped
   entirely on a fresh deploy with no egress:

   | Card | Shelf | Size | How it is labelled |
   | --- | --- | --- | --- |
   | Developer Radar | `content/radar-fallback.ts` — established open-source tools, described by what they do | 12, three a day | `origin: 'curated'`, no "recently updated" claim, card header reads *curated* |
   | Today in History | the dated `historyEvents` corpus, rotated when nothing is verified for the day | 9 | `forThisDate: false` and the card states *From the archive — not an event of this date* |
   | One Book | the curated recommendation, without catalogue fields | 25 | `source: 'curated'`; no cover, no year, no edition count unless Open Library returned them |

   Rotations are keyed to the publication day, so consecutive days never show the same
   three items and each shelf cycles in four days.

**What's New in AI is not on that shelf.** The card publishes news or it says it cannot:

| Step | What it is | How it is labelled |
| --- | --- | --- |
| 1 | an item fetched from a first-party AI newsroom today, dated, deduplicated, inside the 45-day window | `origin: 'live'`, its own publication date and publisher |
| 2 | the items already published for an earlier day — real news, real dates, unchanged | `origin: 'cached'`, card header reads *Cached*, `sections.aiWorld = 'cached'`, and the snapshot records `kept the N item(s) published for <date>, with their original dates` |
| 3 | articles stored by the last discovery run in `curiosity_candidates` | `origin: 'cached'`, same labelling, said to come from the reservoir |
| 4 | nothing usable | `sections.aiWorld = 'unavailable'`, empty card, header reads *temporarily unavailable*, empty-state sentence: *Fresh AI news is temporarily unavailable* |

Two details make step 2 real rather than aspirational:

* The cache is read from the **last day that was published** (`state.daily.payload`), not
  from today's snapshot. Reading the same-day payload meant the branch could only fire
  during a forced re-run of the same day — which is exactly when the day's picks are
  reused anyway — so on any new day the card fell straight through to *unavailable*. That
  was the bug, and this is the fix.
* The origin is **recorded at publish time** in `payload.sectionOrigins`, then read by the
  status endpoint, the Settings panel and the card. It used to be re-derived from the items
  at render time, and a carried-over story still carries `origin: 'live'` from the day it
  was fetched — so a cached day printed the same “up to 10” label as a fresh one. Recorded
  origin, honest label; snapshots published before this field existed keep the derived
  behaviour.

`content/ai-background.ts` still exists — the 12 evergreen explainers are used as reference
material elsewhere and are asserted by `curiosity:verify` (check 18) — but nothing in the
publish path can reach it, `selectAiWorldArticles` cannot emit it, and `invalidDailyFields`
refuses any AI World item whose `origin` is `background`. Three explainers standing in for
the news is what made the card read as news when it was not; an honest empty card is the
replacement.

### What counts as AI news

* **Publisher** — the post must come from the publisher's own newsroom or changelog, never
  an aggregator and never an encyclopedia. `curiosity:verify` check 10 asserts the registry
  covers OpenAI, Anthropic, Google DeepMind, Google AI, Hugging Face, Microsoft AI, Meta AI
  and Higgsfield, that every URL is `https`, that none is a `wikipedia.org` page, and that
  every topic tag (`models`, `products`, `agents`, `media`, `coding`, `research`,
  `industry`) is carried by at least one feed.
* **Verified URLs only.** An entry carries `verifiedAt`/`verifiedNote` when the URL was
  fetched and confirmed to return a dated RSS/Atom document. Currently verified that way:
  OpenAI `news/rss.xml`, Google AI (the `blog.google/technology/ai/rss/` path redirects to
  `blog.google/innovation-and-ai/technology/ai/rss/`), and Higgsfield's
  `creator-hub/changelog/rss.xml` — the feed Higgsfield's own `llms.txt` publishes. The
  Anthropic, DeepMind, Hugging Face, Microsoft AI and Meta AI URLs are the long-standing
  registry entries and are **not** covered by a fresh verification note; when one of them
  moves, the probe reports *answered with text/html, not a feed* or *HTTP 4xx* and the card
  loses that publisher rather than inventing a replacement.
* **Freshness and quality** — `NEWS_RECENCY_DAYS = 45`, `MIN_TITLE_CHARS = 16`,
  `MAX_AI_WORLD_ARTICLES = 10`, deduplicated by canonical URL then by title, ordered by
  publication date. Ten is a ceiling, not a target: a quiet week publishes four items and
  says nothing about it, because four real stories is the honest answer.

The history card is the one section that is never *carried over*: yesterday's anniversary
under "Today in History" would be a false statement rather than a stale one, so an
unverified day gets an archive entry that says what it is.

Every substitution is recorded on the snapshot — `aiWorld: nothing usable from the live
source (none of the 8 first-party AI feeds could be reached from this server (…)); fresh AI
news is temporarily unavailable — no live item, no previously published article and
nothing in the reservoir` — which is what makes the day auditable afterwards. A reader sees a
label; nobody has to open a console to learn that a card is fallback content, and nobody
has to read this file to learn why.

### Why a fallback publication still counts as a successful publish

`status: "published"` means a valid day was written: every card that has an honest
answer carries one, each item passed validation, and the snapshot says per card where the
content came from. It does not claim the live sources were reached — that is what `degraded`
is for, and what the Settings panel's per-card line shows. A run that could not produce a
valid payload reports `failed` and leaves the previous day in place, so "published" never
has to be discounted.

The one card that may be legitimately empty is AI World: when nothing live, nothing
previously published and nothing in the reservoir is usable, the card renders its
unavailable state and the snapshot carries the reason. `daily.complete` therefore does not
require `aiWorld.length > 0` — it requires no degradation, a Radar card and a history card.
Requiring an AI item would reward padding the card, which is exactly what the curated
fallback used to do. The Settings panel distinguishes the two cases in words: *every card
has content except AI World* versus *some cards used fallback*.

### Reading the causes

```bash
npm run curiosity:refresh -- --status     # degraded: [...] on the published day
curl -s localhost:3000/api/curiosity/refresh?action=probe | jq   # per-source reachability
```

Causes are phrased by the code that saw them: *could not be reached* (a deployment or
network problem — a sandbox, CI runner, firewall or locked-down container all produce
this), *answered 403 and is rate limited* (anonymous GitHub search allows ten requests a
minute; the note carries `Retry-After`), *answered with text/html, not a feed* (the URL
moved), and *answered but listed nothing* (a quiet day, waiting is the fix). The probe is
admin-only because it is the one read path allowed to touch the network, and it measures
reachability from the server that publishes, not from a browser.

## 12. When a publish is refused: the 2026-11-11 outage

On 2026-11-09 (run 24) the daily publish succeeded. On 2026-11-10 (run 25) and
2026-11-11 (run 26) it failed, the second time with HTTP 502 and this message:

```
refusing to publish 2026-11-11: scienceLevels.undergraduate.physics is undergraduate-level;
scienceLevels.undergraduate.biology is undergraduate-level. The last published content is unchanged.
```

The published snapshot was preserved both times — that part of the design worked. What
failed was the **content selection feeding it**, and the diagnosis is worth writing down
because the shape of the bug is repeatable.

### Root cause

Two different things had to be true at once:

1. **Records stored before the two-level field existed.** `scienceDraftFromRecord()` now
   writes `payload.concept.educationLevel = 'undergraduate'`, but rows written before that
   field was added carry `payload.science` (peer-reviewed, fresh, scored) and a concept
   with a provenance label and a link — and no `educationLevel`. Those rows are still in
   `curiosity_candidates`, and they are still inside the 60-day freshness window.
2. **A publisher that trusted the payload and not the card.** The undergraduate pick
   filtered on `category`, `eligible`, `validationStatus` and `payload.science`, then took
   `candidateToScienceConcept()` — which returns a stored concept **verbatim**. Nothing
   checked that the concept it published was stamped for the lane it was going into.

So the day's payload contained an undergraduate card whose `educationLevel` was absent;
`invalidDailyFields()` correctly refused it; and because validation is all-or-nothing for
the day, nothing was written.

Why the runs differ: run 24 executed the code before the two-level structure existed
(`33064b5`, no undergraduate lane at all, so no level rule to violate), while runs 25 and
26 executed the two-level code (`0ea3272`) against the same reservoir. The failure is not
a random one — with those two rows present, every publish fails until the selection or the
data changes.

### The fix: hydration, not tolerance

`lib/curiosity/science-levels.ts` now has `hydrateResearchCandidate()`, which every
undergraduate pick passes through, and `selectUndergraduate()`, which reports what
happened. The level is **derived from the record's own provenance**, never assumed:

| Stored row | Result |
| --- | --- |
| `payload.science` says peer-reviewed/preprint, concept has topic + summary + link, no `educationLevel` | accepted; `educationLevel: 'undergraduate'`, `levelBasis: 'derived-from-record'`, missing `provenanceLabel`/`publishedOn`/`research` completed from the same record |
| already `educationLevel: 'undergraduate'` | accepted unchanged (`normalized: false`) |
| concept marked `foundation` | refused: `marked-foundation` |
| concept `origin: 'curated'` or `'wikipedia'` | refused: `explainer-not-research` |
| unknown level value | refused: `unknown-education-level` |
| `payload.science` missing, or provenance is a press release / announcement | refused: `no-research-metadata` / `unsupported-provenance` |
| no `payload.concept` at all | refused: `no-concept-payload` (re-run discovery; a card is not assembled from a title) |
| no topic/summary, or no usable link, or no publication date | refused: `incomplete-concept` |

Every accepted record keeps its own DOI, venue, authors, publication date, peer-review
status, source link and score: hydration **completes** metadata, it does not rewrite it.
Nothing is deleted or reset — the stored rows are untouched; only the in-memory card is
normalised.

Strict separation is unchanged, and is now stated where it is enforced: the foundation
lane refuses anything marked `undergraduate` as well as anything with
`origin: 'research'`, and the validator still refuses a foundation card under the
undergraduate label or a research record in the foundation lane.

### The publisher's last line

A card that cannot satisfy the undergraduate rules is now **withheld from the day with a
recorded reason**, instead of taking the whole day down with it:

```
science physics: withheld the undergraduate card for doi-… — is undergraduate-level
(expected undergraduate, was missing); cites its source (expected an http(s) link, was missing)
```

That is not a bypass. `invalidDailyFields()` still runs and still refuses the payload;
both it and the guard call the same `undergraduateConceptProblems()` rules, so the two
cannot disagree. If the guard misses something, validation fails the day exactly as before.

### Failure classification

A refused publish used to be 502 for every cause, which is why the run log could not say
whether to retry, fix data, or wait for a source. The response now carries a `failure`
object and a matching status:

| Kind | Status | Meaning | Operator action |
| --- | --- | --- | --- |
| `invalid-content` | 422 | the content this run produced failed validation | fix the data or the code; nothing was written |
| `no-eligible-content` | 409 | nothing was eligible (pools excluded everything) | investigate the library, not the transport |
| `storage` | 503 | the state store refused a read or write | retry; check the database or the volume |
| `upstream` | 502 | a source or the science discovery job failed | wait, or fix the source |
| `internal` | 500 | an unexpected error | a bug |

```json
{
  "status": "failed",
  "detail": "Refresh failed [invalid-content]: refusing to publish 2026-11-11: …",
  "failure": {
    "kind": "invalid-content",
    "status": 422,
    "code": "invalid_content",
    "problems": [
      {
        "section": "scienceLevels.undergraduate.physics",
        "field": "scienceLevels.undergraduate.physics is undergraduate-level",
        "expected": "undergraduate",
        "actual": "missing",
        "candidateId": "doi-10.1000/physics-legacy",
        "reason": "only a research record may be published in the undergraduate lane"
      }
    ]
  }
}
```

The human `detail` sentence keeps its old format — tests and operators match it — and now
carries the kind in brackets. The run log records the same classification, so Settings
answers "why did the schedule stop advancing?" without a log search.

## Repetition

Every card now goes through one selection service before it can be published, with a
recorded, per-card window (365 days for an exact repeat, 180 for a mythology character, 90
for a science concept, 30 for a recurring subject on a sibling card). The history that makes
those windows enforceable is the same `curiosity_seen` ledger this document already
describes, extended by `010_curiosity_dedupe_history.sql` to carry title, canonical URL,
text fingerprint, shingle signature, subject keys and source.

Two consequences are worth knowing when reading a run:

- A repeated item is the **last** option, not the first. The selector prefers never-published
  candidates, then the least-recently used one, and records which window had to give on the
  day's `degraded` list. A card is never left empty to honour a window.
- A same-day re-run is a re-check, not a second discovery: it reproduces the same ids and
  writes no new ledger rows.

```bash
npm run curiosity:dedupe    # 14 checks: identity, cooldowns, exhaustion, concurrency, persistence
npm run curiosity:content   # the full-page render and every authored claim
```

The per-card audit, the window table, the migration steps and the remaining limitations are
in [`curiosity-repetition-audit.md`](./curiosity-repetition-audit.md).
