# Curiosity repetition audit and anti-repetition upgrade

_Audit of the Curiosity pipeline as it existed at `7cd0d58`, what was changed, how it is
tested, and what is still not guaranteed._

The one-sentence summary: **repetition is now bounded by recorded, per-card windows and
the bound is enforced by one shared selection service — it is not eliminated.** Several
authored pools are smaller than their window (see [Remaining limitations](#8-remaining-limitations)),
and when a pool is exhausted the pipeline repeats the least-recently used item instead of
publishing an empty card. Every such relaxation is written onto the day's own record.

---

## 1. What was audited

| Area | Files read |
| --- | --- |
| Card generators and pools | `lib/curiosity/content.ts`, `lib/curiosity/pool.ts`, `lib/curiosity/content/*.ts` (mythology, chemistry, physics, biology, speak-better, literature, books, learn-something, one-things, ai-background, radar-fallback), `lib/quotes.ts` |
| Publishing and storage | `lib/curiosity/job.ts`, `state.ts`, `content-db.ts`, `server.ts`, `schedule.ts`, `sources.ts`, `origins.ts`, `refresh-auth.ts`, `constants.ts` |
| Read path | `app/api/curiosity/route.ts`, `app/api/curiosity/refresh/route.ts`, `app/curiosity/page.tsx`, `components/curiosity/*` |
| Schema history | `supabase/migrations/001…009`, `supabase/migrations/010_curiosity_dedupe_history.sql` |
| Scheduling | `.github/workflows/curiosity-daily.yml`, `vercel.json`, `docs/curiosity-content-automation.md`, `scripts/curiosity-refresh.ts` |
| Tests | `scripts/verify-curiosity-automation.tsx`, `scripts/verify-daily-content.tsx`, `scripts/check-curiosity-links.mjs` |

### 1.1 How each card was actually produced

Four different mechanisms were in use, and only one of them had any memory:

1. **Deterministic rotation over an authored pool** — One Thing, Literature, Learn
   Something, One Book, Speak Better, Brain Sharpener, Mythology, the three science cards.
   The pick was `(dayNumber + per-card offset) % pool.length`. It never repeated until the
   pool wrapped, and then it repeated on a fixed period equal to the pool size. A pool of
   12 therefore came round every 12 days, for ever, and a pool of 22 every 22 days.
2. **Live fetch with an authored fallback** — History (Wikipedia selected anniversaries),
   AI World (publisher RSS), Developer Radar (GitHub + feeds). None of the three wrote to
   the publication ledger, so the same article, event or repository could return on
   consecutive days; the only protection was the RSS window and the order of the feed.
3. **Client-side rotation** — A Thought for Today was `DAILY_QUOTES[dayNumber % 51]`
   computed in the browser. It had no id, no ledger row, no attribution check, and it
   repeated every 51 days by construction.
4. **Database-authored rows merged over the authored pool** (`curiosity_content`) — an
   operator could retire or add pool items, but did not affect deduplication.

The publication ledger (`curiosity_seen`) existed and was written **only by the four
pool-backed cards**. Its category `CHECK` in `009_curiosity_content.sql` enumerated ten
categories, and its rows were `(category, id, shown_on)`. That is enough to avoid the same
id twice and not enough to avoid anything else: no URL, no normalized title, no text
fingerprint, no subject, no source, no version — and no rows at all for History, AI World,
Developer Radar or the quote.

### 1.2 The four failure modes found

1. **Same article, two URLs** (AI World): feed links carry `utm_*`, `fbclid`, `ref`; the
   same story arrived twice under different query strings and was published twice.
2. **Same item, re-titled** (one-thing / literature / news): title comparisons were exact
   strings, so case, punctuation, a leading article or a trailing "— Part II" defeated them.
3. **Same text, lightly edited** (authored pools, news summaries): nothing compared bodies,
   so a re-worded paragraph was indistinguishable from new content.
4. **Same subject, two cards** (chemistry → physics): each card rotated independently, so
   a concept could appear on a sibling card within days.

And a fifth, structural one: **no row for ten of fourteen cards**, so after a redeploy, a
store reset or a manual refresh the "fresh" set was empty and the rotation started over.

---

## 2. The shared anti-repetition layer

New modules, deliberately small and dependency-free:

| Module | Responsibility |
| --- | --- |
| `lib/curiosity/dedupe.ts` | Text/URL/title normalization, fingerprints (sha256, 32 hex), shingle signatures (MinHash-style sample, 28 hashes), Jaccard similarity, author/subject normalization |
| `lib/curiosity/catalog.ts` | The 14 cards, their windows, subject groups and hard floors — the single registry |
| `lib/curiosity/candidates.ts` | `ContentCandidate` and one builder per card: stable id, title, canonical text, URL, source, subject keys |
| `lib/curiosity/history.ts` | `PublicationRecord`, JSON ⇄ `SeenRecord` translation, the identity index, age pruning (1 095 days), `lastUseOf` |
| `lib/curiosity/selection.ts` | `selectCandidate` / `selectMany` — the only place that decides what may be published |
| `lib/curiosity/wikimedia.ts`, `discovery.ts` | Wikimedia/Wikidata discovery with retries, quality gates, attribution and a per-process cache |

### 2.1 Identity of an item

Every candidate carries all of these, and every one of them is checked:

| Key | Built from | Scope |
| --- | --- | --- |
| `id:` | card + stable item id (pool id, QID, article URL, `year + title hash`) | global, 365 days |
| `url:` | URL with tracking parameters removed, host lower-cased, `www` stripped, parameters sorted | global, 365 days |
| `title:` | Unicode-folded, punctuation-stripped, leading article removed | global, 365 days |
| `fp:` | sha256 of normalized title + body | global, 365 days |
| `sub:` | subject keys (see below), prefixed with the card's subject group | per group |

A re-titled item matches `fp:`. A re-worded item matches the **signature** check. An edited
old item with the same id is a duplicate, not a discovery — `contentVersion` is recorded so
"new" and "edited" never collapse into each other.

Near-duplicate detection: each body becomes a set of 28 hashed shingles (10 single-word
hashes + 18 three-word hashes). Sampling the *smallest* hashes rather than the first ones is
what makes an edit in the middle of a paragraph detectable. Jaccard ≥ `0.3` is a
near-duplicate. That threshold is calibrated on the shipped corpus: a sentence-level edit
scores ≈ 0.37; the highest score between any two *different* authored items is 0.10.

### 2.2 Subject groups and windows

| Card | Exact window | Subject window | Near-dup window | Subject group |
| --- | --- | --- | --- | --- |
| A Thought for Today | 365 | 90 | 365 | reading |
| Today in History | 365 | 365 | disabled¹ | news |
| AI World | 365 | 60 | 365 | news |
| Developer Radar | 365 | 60 | 365 | standalone |
| One Thing Worth Knowing | 365 | 60 | 365 | ideas |
| Learn Something | 365 | 60 | 365 | ideas |
| Speak Better | 365 | 120 | 365 | practice |
| A Few Minutes of Literature | 365 | 120 | 365 | reading |
| One Book | 365 | 90 | 365 | reading |
| Brain Sharpener | 365 | 120 | 365 | practice |
| Mythology | 180 | 180 | 180 | mythology |
| Chemistry / Physics / Biology | 90 | 90 | 180 | science |

Cross-card windows: a subject already used by a *different* card in the same group is
blocked for **30 days**. Within one run, subjects are also reserved as they are chosen, so
two cards cannot take the same subject on the same day.

¹ History opts out of near-duplicate text matching (`nearDuplicateDays: 0`) on purpose.
Two *different* anniversaries can share a template sentence ("…was published in…"), and
their identity is the event's own year, title, URL and date, all of which are still checked.
This was found by the test suite (see case 8), not by inspection.

### 2.3 The relaxation ladder (never silently bypassed)

A pool smaller than its window cannot honour the window. Instead of quietly ignoring it —
the old behaviour, and the reason content repeated — the selector tries, in order:

1. **strict** — every key inside its window;
2. **identity** — subject windows relaxed, identity (id/URL/title/fingerprint) still enforced;
3. **floor** — identity relaxed to `hardFloorFor(poolSize)` days (1 item → 1 day, 12 → 7 days);
4. **none** — the least-recently used item, chosen only if the pool cannot otherwise fill
   the card, and only if the card's policy allows relaxation at all.

Each step emits a warning naming the pool size and the window that had to give, and the
warnings are persisted on the day (`meta.degraded`). History has `allowRelaxation: false`
because an anniversary that is not today's must never be substituted silently; it falls back
to a *labelled* archive entry instead.

### 2.4 Storage and migration

The ledger stays where it was: `curiosity_seen` for the database store, the `seen` array in
the state file for the file store. No second content store was introduced.

- `supabase/migrations/010_curiosity_dedupe_history.sql` adds nullable `title`, `url`,
  `fingerprint`, `signature`, `subjects text[]`, `source`, `version`; widens the category
  `CHECK` from ten to fourteen card keys; adds indexes on `shown_on desc`, `fingerprint`,
  `url` (partial) and `subjects` (GIN); and ends with read-only verification queries and a
  rollback block.
- The migration is **required for the new behaviour and not required for the app to keep
  running**. The store probes for the new shape, falls back to three columns and ten
  categories on a pre-010 table, and records the degradation on the run. On that fallback
  the four previously-unrecorded cards have no durable history — exactly the old behaviour,
  stated rather than hidden.
- Rows written before the migration are left untouched. A null `signature` means "published
  before near-duplicate detection existed" and is treated as unknown, not as a non-match.
- Retention is 1 095 days, pruned by age, not by cooldown: expiry of a window makes an item
  eligible again, it does not delete its record (`verify-curiosity-dedupe` case 12).

---

## 3. Publishing flow (unchanged in shape, stricter in order)

```
read state ─▶ load DB pool ─▶ [lease] ─▶ fetch live candidates
          ─▶ select per card (cooldowns, subjects, near-dups)
          ─▶ validate payload (non-empty, fields, URLs)
          ─▶ write snapshot + ledger rows atomically
          ─▶ [release lease]
```

- **Fetch before select**, and selection runs against the ledger read under the lease.
- **Validation before the write.** `invalidDailyFields` refuses an empty card, a missing
  field or a non-http(s) URL; a failure inside the mutator leaves the previous snapshot
  byte-identical (tested).
- **Ledger and snapshot are written together** in `state.ts` (`persist()` writes the ledger
  first, then the snapshot; a ledger write failure degrades to the snapshot alone and says so).
- **Single-flight lease** means two overlapping cron runs cannot both publish. The second
  reports `busy` or `already-published`.
- **Same-day rerun is a re-check, not a second discovery.** Today's own ledger rows are
  excluded from the cooldown index, so a forced run reproduces the same ids and writes no
  new rows.
- **Live sections never go empty**: live → previous snapshot's items (`cached`) → authored
  shelf (`curated`), with the transition named on the run. Cached items keep their original
  dates and links and are never presented as newly discovered.

---

## 4. Discovery (Wikimedia / Wikidata)

- **Sciences** (`discovery.ts`): one Wikipedia category per discipline per day, rotating
  through configured subfields; category members are listed, unsuitable/disambiguation
  titles dropped, up to 20 leads fetched in one batched API call. A lead must be ≥ 320
  characters and ≥ 3 sentences to become a concept; text is split into *simple / deeper /
  everyday connection / surprising detail* and **cited back to the article with
  CC BY-SA 4.0 attribution**, which is rendered under the card.
- **Concepts** carry Wikidata QIDs and aliases when resolvable, which is what prevents the
  same idea returning under a variant name (e.g. "salt" and "sodium chloride").
- **Mythology** (`discoverMythologyQueue`): one tradition category per day, returned as an
  **authoring queue** of figures the corpus does not yet cover, printed in the run detail.
  It never becomes card content: a card needs a story, family, timeline and
  evidence-labelled claims, and none of those can be assembled honestly from a lead.
- **Attribution**: every discovered item names its source and licence; curated items keep
  their authored source names. No entity is invented to fill a slot.

### 4.1 External dependencies, environment and rate limits

| Variable | Purpose |
| --- | --- |
| `CURIOSITY_CRON_SECRET` | Bearer credential for `POST /api/curiosity/refresh` |
| `CURIOSITY_STORE` | `supabase` or `file` |
| `CURIOSITY_STATE_FILE` | Path for the file store |
| `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_*` | Database store credentials |
| `CURIOSITY_AUTO_PUBLISH` | Enables catch-up publishing on render |
| `CURIOSITY_WIKIMEDIA` | `off` disables all Wikimedia/Wikidata discovery |
| `WIKIMEDIA_CONTACT_EMAIL` | Contact address placed in the descriptive `User-Agent` |
| `OPENLIBRARY_CONTACT_EMAIL` | Contact for the Open Library lookup |

Requests per daily run: 1 anniversaries call, 1 Wikipedia listing + 1 batched leads call per
science discipline (3), 1 mythology category call, ≤ 2 Wikidata calls for the chosen
character, 6 RSS feeds, ≤ 2 GitHub calls, 1 Open Library search — roughly **20 requests a
day**, plus the optional operator probe. Wikimedia's API etiquette asks for a descriptive
`User-Agent` with contact information, serial rather than bursty access, and honouring
`Retry-After`; all three are implemented (`wikimediaJson` retries 429/408/5xx twice,
honours `Retry-After`, and never throws). Discovery results are cached per process per day,
so a same-day re-run makes no new calls.

---

## 5. Per-card audit

`Risk` describes the behaviour **before** this change; `Window` the enforced minimum.

| Card | Source | Prior repetition risk | Fix | Window | Fallback |
| --- | --- | --- | --- | --- | --- |
| **A Thought for Today** | `lib/quotes.ts` (74 quotes) | Repeated every 51 days, chosen in the browser, never recorded | Published through the ledger like any card; identity = normalized text + author; 74 quotes | 365 | Least-recent quote, warned |
| **Today in History** | Wikipedia selected anniversaries; 9 authored archive events | No ledger; the same anniversary returned yearly; archive entries could masquerade as today's | Event id = year + title fingerprint (archive picks add a `history-archive-` prefix, so a labelled archive item can never be taken for a live anniversary); `forThisDate` records which one it is; near-dup disabled (see ¹) | 365 | Verified → labelled archive → least-recent archive repeat, warning recorded |
| **AI World** | 6 publisher RSS feeds; 12 authored background items | Same article under tracking URLs; same story re-titled; 3 items a day with no memory | Canonical URL + normalized title + fingerprint + `article:` subject; live → cached → curated precedence | 365 | Previous snapshot's items labelled `cached`; else curated shelf |
| **Developer Radar** | GitHub trending + feeds; 12 authored shelf tools | The same repositories appeared for days while trending | Repository full name + canonical URL identity, with `repo:` subject | 365 | Cached, then curated shelf |
| **One Thing Worth Knowing** | authored pool (22) | 22-day fixed cycle | Ledger + fingerprint + near-duplicate body check; title identity | 365 | Least recent, warned |
| **Speak Better** | authored lessons (12) | 12-day cycle; a lesson revisited as "new" after a redeploy | Lesson id + focus + word list; each target word is a subject key | 365 | Least recent, warned |
| **A Few Minutes of Literature** | authored pool (24) | 24-day cycle | Work + author identity, author subject key (so the same author does not monopolise the reading group) | 365 | Least recent, warned |
| **One Book** | authored pool (25) + Open Library | 3-day interval, 75-day cycle; an edition change looked like a new book | Pool id + work title + Open Library key; `work:` and `author:` subjects shared with Literature | 365 | Least recent, warned; failed lookup keeps the previous book |
| **Brain Sharpener** | authored puzzles (12) | 12-day cycle | Puzzle id + normalized question + answer | 365 | Least recent, warned |
| **Mythology · Character of the Day** | authored corpus (**24**) + Wikidata enrichment + Wikimedia authoring queue | 24-day cycle; a character returning under a variant name; one tradition dominating | Character id + Wikidata QID + alternate names as subjects; 12 figures added across 12 traditions; entity enrichment records QID/aliases | 180 | Least recent, warned |
| **Chemistry / Physics / Biology of the Day** | authored corpus (**18 each**) + Wikipedia discovery | 18-day cycle (was 12); the same concept on two science cards; a concept returning under a synonym | Concept id + QID + aliases + normalized topic; all three cards share a subject group; discovery adds fresh, cited concepts | 90 | Least recent, warned; discovery falls back to the authored corpus |

Pool sizes after the change: mythology 24, chemistry/physics/biology 18 each, speak-better
12, sharpeners 12, literature 24, books 25, learn-something 24, one-thing 22, quotes 74, AI
background 12, radar shelf 12.

---

## 6. Test coverage

`npm run curiosity:dedupe` — 14 checks in `scripts/verify-curiosity-dedupe.ts`, mapped to
the twelve required cases:

| Required case | Check | What it asserts |
| --- | --- | --- |
| Duplicate URLs and ids | 1 | Canonical URL and stable id both reject a repeat; `utm_*`, scheme, `www`, fragment and parameter order collapse to one identity |
| Duplicate titles, different formatting | 2 | Case, punctuation, leading article and whitespace normalized before comparison |
| Identical content, changed wording or markup | 3 | Shingle signatures catch a re-worded paragraph; an edited item with the same id is a duplicate; unrelated text still passes |
| Similar subjects across cards | 4 | The same concept is refused on a sibling science card for 30 days, allowed after, and refused within one run by reservation |
| Cooldown enforcement | 5 | 365/180/90/30-day windows enforced, with age and window recorded on the rejection |
| Pool exhaustion | 6 | A pool smaller than its window falls back in a recorded order, oldest first; an empty pool is refused rather than blank |
| Source timeouts, malformed responses | 7 | Two attempts, a named reason, no throw; authored corpus fills the cards and the failure is on the run |
| Scheduled reruns and concurrency | 8 | A retried run is idempotent at snapshot and ledger; two overlapping runs produce exactly one publication |
| Persistence across deployments | 9 | History lives in the store; a fresh store object reads it; the next day avoids everything published the day before |
| Snapshot preservation on fetch failure | 10 | A throwing mutator leaves the previous snapshot byte-identical; the read path still serves it; an empty card fails validation before the write |
| Correct attribution | 11 | Candidates carry a named source and URL; discovered science text carries its article and licence; the ledger keeps attribution |
| History retained after cooldown expiry | 12 | Records outlive their window, become eligible again, and are pruned by a three-year retention rule rather than by the cooldown |
| (extra) A Thought for Today | 13 | The quote is selected through the same ledger and cannot repeat on the next day |
| (extra) Ledger shape | 14 | The persisted row is the same shape the selector reads, so no translation layer can drift |

`npm run curiosity:verify` — 19 integration checks in
`scripts/verify-curiosity-automation.tsx`: Kolkata-midnight rotation, the book interval,
degraded feeds, twelve consecutive days with twelve distinct items in every daily category
plus ledger uniqueness, same-day rerun idempotency, zero source calls on the read path, the
Supabase harness (lease, upsert, ignore-duplicates, pre-migration fallback), offline
publishing, feed parsing, GitHub rate-limit handling, fourteen days of history provenance,
payload validation, read-only state path, durability reporting, workflow pinning and the
"no server-only name in the client bundle" check.

`npm run curiosity:content` — 366 assertions in `scripts/verify-daily-content.tsx`: every
daily selection over a simulated year, every claim label, every Devanagari meaning, and the
full rendered page (all nine original cards plus the four newer sections, in order).

### 6.1 Results

```
npx tsc --noEmit                                   → clean
npm run lint                                       → clean
npm run curiosity:content                          → PASS 366 daily selections
npm run curiosity:dedupe                           → 14/14 pass
npm run curiosity:verify                           → 19/19 pass
npm run build                                      → 15 routes built, no errors
```

---

## 7. Deployment steps

1. **Review the migration.** `supabase/migrations/010_curiosity_dedupe_history.sql` only
   touches `curiosity_seen`: seven nullable columns, a widened `CHECK`, four indexes,
   column comments. No user table, no function, no policy, no data rewrite.
2. **Apply it** (Supabase SQL editor or `supabase db push`). Every statement is idempotent.
3. **Redeploy** so the store re-probes its capability (the probe is cached per process).
4. **Verify** with the read-only queries at the bottom of the migration; `select count(*),
   max(shown_on) from curiosity_seen;` should start at the first publish after deploy.
5. **Trigger once** with `POST /api/curiosity/refresh` (`Authorization: Bearer $CURIOSITY_CRON_SECRET`,
   optional `{"scope":"daily","force":true}`) and read `?action=status`.
6. **Rollback**: drop the four indexes and seven columns (the block is in the migration).
   The app keeps working either way — it degrades to id-only, ten-category history.

No change to the publishing schedule: the GitHub Actions workflow
(`30 18 * * *`, `--retry 2`, then a status read) remains the only external publisher, and
`vercel.json` still declares no cron.

---

## 8. Remaining limitations

- **Bounded, not eliminated.** Six fixed-corpora cards (One Thing 22, Speak Better 12,
  Literature 24, One Book 25, Brain Sharpener 12, Learn Something 24) and the 74-quote card
  are smaller than their 365-day window, and the two live cards' fallback shelves hold 12
  items each. With the windows enforced, those cards cannot avoid repeating for ever; what
  changed is that repetition is now the *last* option, goes to the least-recently used item,
  and is recorded on the day. With 22 items a card revisits an item roughly every three
  weeks *only if* nothing widens the pool — the authored corpora are meant to keep growing.
- **The quote pool is 74 items.** Even with the ledger, a 365-day window cannot be met; the
  quote is now recorded and chosen least-recently instead of on a fixed 51-day clock.
- **Near-duplicate detection is lexical.** It catches rewording and markup changes, not a
  genuinely different telling of the same story in unrelated words. Subject keys are the
  backstop.
- **Discovery is a supplement, not a supply.** A category listing yields few pages that pass
  the quality gate; on a bad day discovery contributes nothing and the authored corpus
  carries the card (with the reason on the run).
- **Mythology stays authored by design.** The authoring queue names figures to research; it
  does not publish them. Fabrication risk outweighs pool size here.
- **Cross-card subject keys are authored.** A subject only blocks another card if a builder
  emits it; a new card added without subject keys will only get identity-level protection.
- **Wikimedia and GitHub are best-effort.** Rate limits, outages and category churn are
  handled by retries and fallbacks, not by guarantees.
