# Focus Desk — Live Content Modernization Audit

**Audit only. No application code, UI, content, migration, Supabase setting, secret or workflow was changed. Nothing was merged or deployed.**

- **Date:** 2026-11-04
- **Audited revision:** `origin/main` at `bdd3af1` ("Merge pull request #59")
- **Method:** full read of `lib/curiosity/*`, `lib/discovery/*`, `app/`, `components/curiosity/*`, `.github/workflows/*`, `supabase/schema.sql` + `supabase/migrations/*`, plus live GitHub Actions run history via the API, plus official documentation for every proposed source.
- **Evidence standard:** every claim below is tagged **[VERIFIED]** (code read, run history read, or official docs fetched), **[OBSERVED]** (seen in this audit's tooling but not re-confirmed at source), or **[UNKNOWN]** (no repository evidence; stated as unknown rather than guessed).

> **Note on repository history.** This clone is shallow (`git rev-list --count origin/main` = 1), so individual commits are not walkable locally. All history-level claims in this report come from the GitHub API (PR list/merge SHAs, workflow run history), not from `git log`.

---

## 1. Executive summary

Focus Desk is **less live than it appears**. The Curiosity page has real, working infrastructure — a publisher, a guard-railed selector, an anti-repetition ledger, three scheduled workflows and a populated candidate reservoir — but almost none of it is pointed at sources that produce *new knowledge*. Concretely:

1. **The daily Knowledge Pool Discovery job has failed 9 of its last 10 scheduled runs.** [VERIFIED] The failure is not a source outage: the job exits 1 because **neither `SUPABASE_*` runner secrets nor the `CURIOSITY_APP_URL` repository variable are configured**. Only one run succeeded (a manual `workflow_dispatch` on 2026-11-04), and it succeeded precisely because it took the CLI path with secrets available at that moment. So the reservoir that feeds Science and History is being replenished by hand, not by schedule.

2. **Science is not journal research.** [VERIFIED] `discoverScience()` in `lib/curiosity/discovery.ts` calls `wikipediaCategoryMembers()` over eight or nine fixed Wikipedia categories and picks pages by `dayNumber % categories.length`. There is no journal, no preprint, no press release, and **no freshness signal at all** — the `ScienceConcept` type has no publication date. "Physics of the Day" is a Wikipedia article about physics, not a discovery.

3. **Brain Sharpener is six hardcoded puzzles.** [VERIFIED] `brainSharpeners` in `lib/curiosity/content.ts` (lines 139–241) contains exactly **6** entries (3 mathematics, 3 physics), rotated by `safeDay % 6`. The same puzzle returns every six days, and the 365-day `exactDays` cooldown then forces relaxation, which the app records as a degradation rather than preventing it.

4. **The daily Science card does blend live-ish content**, [VERIFIED] which is better than a pure static list: `job.ts` lines 419/422/425 compose `curatedScience(...) + reservoirScience(...) + discovery.<discipline>.candidates`. But all three legs are ultimately authorship-or-Wikipedia, and selection is a **date-index rotation with no significance scoring** (`selection.ts` `selectCandidate` → `rotationIndex`). Nothing anywhere ranks "most important".

5. **Literature discovery exists and is properly licensed, but has never run.** [VERIFIED] `discovery-literature.yml` was merged 2026-11-04 09:19 UTC and its cron is `20 11 * * *`; at audit time (10:46 UTC) it had **0 runs** — correct, the first fire had not yet arrived. More importantly, discovered literature does not enter the *daily* card: `job.ts` picks `literature` only from the authored pool. Discovered books surface in a **separate** `LiteratureDiscoveryCard` below it via `getDiscoveryShelves()` (`lib/discovery/server.ts`).

6. **The 24 authored literature entries reproduce copyrighted text with no licence field.** [VERIFIED] `LiteratureItem` (lib/curiosity/types.ts:241) has `passage: string` and `attribution?: string` but **no licence or rights field**, and `literature.ts` contains 24 `passage:` values quoting works from Poetry Foundation, Poetry in Translation and similar sources. Sample text includes a Robert Frost poem (1916, public domain in the US) and a Rilke translation (the *translation* is under copyright). This is inconsistent with the strict rights discipline applied to discovered literature, and is the single clearest legal exposure found.

7. **Speak Better is static by design, and cannot be made live without new data.** [VERIFIED] 32 lessons across four bands in four typed files, served at `/speak-better`, with localStorage progress. The daily card rotates over the 12 A2–B1 lessons only. There is no vocabulary source, no dictionary call, no per-word seen/known ledger feeding selection.

**The short answer to your closing question** is in §9.

---

## 2. Section-by-section content inventory

Classification key: **H** hardcoded · **API** API-fetched · **RSS** feed-fetched · **AI** AI-generated · **DB** database-backed · **Hybrid**.

> No AI generation exists anywhere in the repository. [VERIFIED] There is no model call, no prompt file, no LLM dependency in `package.json`. Every "explanation" is authored by hand or assembled from a source's own sentences.

| # | Section | Classification | Where the content lives | Pool size | Refresh mechanism |
|---|---|---|---|---|---|
| A | **Speak Better** (daily card) | **H** | `lib/curiosity/content/speak-better.ts` (12) + `-b2` (9) + `-c1` (6) + `-c2` (5) | **32 lessons** | `safeDay % 12` over A2–B1 only; B2–C2 only reachable via `/speak-better` |
| B1 | **Physics of the Day** | **Hybrid**: H + API + DB | `content/physics.ts` (18) → reservoir → Wikipedia | 18 authored + reservoir + ≤20/run | `discoverSciences()` (Wikipedia) + reservoir + date rotation |
| B2 | **Chemistry of the Day** | **Hybrid**: H + API + DB | `content/chemistry.ts` (18) | 18 + reservoir + ≤20/run | same |
| B3 | **Biology of the Day** | **Hybrid**: H + API + DB | `content/biology.ts` (18) | 18 + reservoir + ≤20/run | same |
| C1 | **A Few Minutes of Literature** (daily) | **H** | `content/literature.ts` | **24 entries** | `rotationIndex(date)` over the authored pool; 365-day exact cooldown, relaxed when exhausted |
| C2 | **Literature discovery** ("More to read") | **API + DB** | `lib/discovery/sources/{gutenberg,standard-ebooks,wikisource}.ts` | unbounded (cursor) | `discovery-literature.yml` 11:20 UTC — **0 runs so far** |
| C3 | **One Book** | **API + H** | `content/books.ts` (25) → Open Library | 25 candidates | every **3 days** (`BOOK_INTERVAL_DAYS`), real API lookup |
| D | **Brain Sharpener** | **H** | `lib/curiosity/content.ts:139–241` | **6 puzzles** | `safeDay % 6` |
| E1 | **Today in History** | **Hybrid**: H + API + DB | `content/history-{sikh,indian,world}.ts` (37/29/19) + Wikimedia on-this-day | 85 seeds + live | `selectHistoryTriad()` — Sikh → Indian → World priority |
| E2 | **Mythology · Character of the Day** | **Hybrid**: H + API | `content/mythology.ts` (24) + Wikidata | 24 + live | `discoverMythologyQueue()` |
| E3 | **AI World** | **RSS + DB** | `lib/curiosity/sources.ts` `NEWS_FEEDS` (6 feeds) | 6 feeds | live RSS at publish time |
| E4 | **Developer Radar** | **API** | GitHub search API | 8/run | live at publish time |
| E5 | **One Thing / Learn Something** | **H** | `content/one-things.ts` (22), `learn-something.ts` (24) | 46 | `rotationIndex(date)` |
| E6 | **A Thought for Today** | **H** | `lib/quotes.ts` `DAILY_QUOTES` | [OBSERVED] finite list | date-derived |
| E7 | **Fallback shelves** | **H** | `content/ai-background.ts` (12), `radar-fallback.ts` (12) | 24 | static fallback only |

### 2.1 What "32 hardcoded lessons" actually means

`lib/curiosity/content/speak-better.ts` is a 679-line file of 12 lessons; the B2/C1/C2 additions are separate typed files. Each lesson carries word/expression, English definition, Hindi meaning (Devanagari), nuance, examples, collocations, common mistake, register note and a speaking challenge. **[VERIFIED]** Content quality is high; the problem is entirely **supply**, not craft.

---

## 3. Source-to-screen pipeline status

The canonical pipeline is **Source → Fetch → Validate → Rank/Filter → Generate/Transform → Persist → Schedule → Publish → Display**. Per section:

### 3.1 Speak Better
| Stage | Exists? | Operational? | Evidence |
|---|---|---|---|
| Source | Static TS file | ✅ | `content/speak-better*.ts` |
| Fetch | — | n/a | n/a |
| Validate | ✅ type-check only | ✅ | TypeScript |
| Rank/Filter | ❌ | — | no scoring; `safeDay % 12` |
| Transform | ❌ | — | none |
| Persist | ⚠️ localStorage only | ✅ for the reader, ✗ for the server | `pace.speakBetter.progress.v1` |
| Schedule | ✅ daily publish | ✅ | `curiosity-daily.yml` |
| Publish | ✅ | ✅ | snapshot into `curiosity_briefings` |
| Display | ✅ | ✅ | `sections/speak-better.tsx`, `/speak-better` |

### 3.2 Science (Physics / Chemistry / Biology)
| Stage | Exists? | Operational? | Evidence |
|---|---|---|---|
| Source | ✅ two: authored TS + Wikipedia categories | ⚠️ | `content/physics.ts`; `SCIENCE_DISCIPLINES` in `discovery.ts:60` |
| Fetch | ✅ | ⚠️ depends on `CURIOSITY_WIKIMEDIA` | `wikipediaCategoryMembers()` |
| Validate | ✅ | ✅ | `validateCandidate()` in `reservoir.ts` |
| Rank/Filter | ❌ **no significance ranking** | — | `selection.ts` has no score/weight/rank function |
| Transform | ✅ (extract → concept) | ✅ | `conceptFromLead()` |
| Persist | ✅ | ❌ **job fails** | `curiosity_candidates`; discovery workflow failing |
| Schedule | ✅ | ❌ 9/10 failures | `curiosity-discovery.yml` |
| Publish | ✅ | ✅ | `runCuriosityRefresh()` |
| Display | ✅ | ✅ | `sections/science.tsx` |

### 3.3 Literature
Two disjoint pipelines. This is important: **the daily reading experience and the discovered shelf are not the same content path.**

| Stage | Daily card (C1) | Discovered shelf (C2) |
|---|---|---|
| Source | authored TS (24) | Gutenberg / Standard Ebooks / Wikisource |
| Fetch | — | ✅ HTTP client with retry/backoff/rate limit |
| Validate | ✅ | ✅ shared gate + `catalogue` strictness |
| Rank/Filter | date rotation, cooldown | `lib/discovery/shelf.ts` `selectShelf()` — eligibility, no-repeat, one-work, kind diversity |
| Persist | `curiosity_briefings` snapshot | `curiosity_candidates` via `persistCollectionRun()` (`lib/discovery/persist.ts`) |
| Schedule | daily publish ✅ | `discovery-literature.yml` — **0 runs** |
| Display | `LiteratureSection` | `LiteratureDiscoveryCard` |

**Consequence:** even once literature discovery runs, it will **not** change "A Few Minutes of Literature". With nothing discovered, the shelf renders no markup at all and the stale authored card is what the reader sees. [VERIFIED] — asserted in `scripts/verify-discovery.tsx`.

### 3.4 Brain Sharpener
| Stage | Exists? | Operational? |
|---|---|---|
| Source | ✅ hardcoded array | ✅ |
| Everything downstream | selector + snapshot only | ✅ mechanically |
| Fresh supply | ❌ | **6-item cycle** |

### 3.5 Cross-cutting observations

- **Old content is genuinely re-dated in two places.** Not a bug — `reusing = Boolean(republishingToday)` in `job.ts:315` only ever re-publishes the *same* date, so a same-day re-run is stable rather than duplicating. [VERIFIED] That is correct behaviour and not a "new date on old content" problem.
- **The real re-dating problem is pool exhaustion.** `allowRelaxation: true` on every card means when the cooldown contradicts a small pool, the selector relaxes the window and publishes a repeat, recording it in `cooldownRelaxations`. With 6 sharpeners and a 365-day exact cooldown, relaxation is guaranteed.
- **Source failures are visible, not swallowed.** [VERIFIED] `job.ts` accumulates `degraded[]` and `discoveryNotes[]`, `origins.ts` labels each section `new | cached | curated | unavailable`, and the UI renders an `OriginTag`. This is genuinely good and should be preserved.
- **Live integrations are only fixture-tested.** [VERIFIED] `scripts/verify-discovery.tsx` (53 checks) uses recorded response shapes. The arXiv/Europe PMC/OpenAlex style sources in this report are **not implemented at all**, so nothing is unverified-but-shipped; but the three literature sources have never been executed against a live host.
- **Attribution and licensing are handled properly for discovered content, and not at all for authored literature.** [VERIFIED] `lib/discovery/collection.ts` `assertRightsEligible()` (lines 336–352) enforces a four-status rights policy in which `unknown` is never eligible. `LiteratureItem` has no licence field.

---

## 4. Existing integrations and operational status

| Integration | Where | Status | Evidence |
|---|---|---|---|
| Wikipedia / Wikimedia (Action API) | `lib/curiosity/wikimedia.ts` | **Operational, unverified against live host in this audit** | used by science + mythology discovery |
| Wikipedia REST "on this day" | `lib/curiosity/sources.ts` | **Operational** | daily publish succeeds |
| Open Library | `lib/curiosity/openlibrary.ts` | **Operational** | One Book, every 3 days |
| GitHub search API | `lib/curiosity/sources.ts` | **Operational** | Developer Radar |
| 6 AI news RSS feeds | `lib/curiosity/sources.ts:27` | **Operational** | OpenAI, Anthropic, DeepMind, Hugging Face, Microsoft, Meta |
| Project Gutenberg RDF | `lib/discovery/sources/gutenberg.ts` | **Written, never executed in production** | scheduled job has 0 runs |
| Standard Ebooks OPDS | `lib/discovery/sources/standard-ebooks.ts` | **Written, never executed** | same |
| Wikisource API | `lib/discovery/sources/wikisource.ts` | **Written, never executed** | same |
| Supabase persistence | `lib/curiosity/{state,content-db,reservoir}.ts` | **Operational when secrets present** | daily publish succeeds |
| Scheduled discovery | `.github/workflows/curiosity-discovery.yml` | **FAILING 9/10** | see §4.1 |

### 4.1 The discovery job failure, precisely

[VERIFIED] `.github/workflows/curiosity-discovery.yml` gates its real work on
`if: ${{ env.SUPABASE_SECRET_KEY != '' && env.NEXT_PUBLIC_SUPABASE_URL != '' }}`. When that gate is false it falls to the "authenticated app endpoint" step, which begins:

```
if [ -z "${APP_URL}" ]; then
  echo "::error::Neither Supabase runner secrets nor repository variable CURIOSITY_APP_URL are set."
  exit 1
```

Run `41698685264` (2026-11-03) shows exactly this: `Checkout`, `Setup Node.js`, `Install dependencies` and the CLI step were all **skipped**, the endpoint step ran and failed, total job time **3 seconds**. Nine consecutive scheduled runs have failed this way.

The one success, run `41789245411` (2026-11-04, `workflow_dispatch`, 1m34s), executed `Replenish candidate reservoir via CLI runner` successfully — i.e. the secrets exist but are only readable on a manual dispatch, or were added recently. [UNKNOWN] which; the log body could not be downloaded (the sandbox cannot reach `results-receiver.actions.githubusercontent.com`).

**This is the single highest-leverage fix in the whole audit, and it is configuration, not code.**

### 4.2 Daily publish is healthy

[VERIFIED] `curiosity-daily.yml` (`30 18 * * *` UTC = 00:00 IST): 8 consecutive `success` runs from 2026-10-27 to 2026-11-03, all `schedule`-triggered. So the *publishing* half of the pipeline works; it is the *discovery* half that is dark.

---

## 5. Evaluation of live sources

All rows below were checked against official documentation or by fetching the endpoint during this audit. Nothing here is invented; where a detail could not be confirmed it is marked.

### 5.1 Science — the core problem is **significance**, not availability

Plenty of sources are accessible. The hard part is that "newest paper" ≠ "important discovery", and a naive feed gives you press releases and incremental papers.

| Source | Subject | Access | API/RSS | Licence / terms | Update freq. | Reliability | Recommendation |
|---|---|---|---|---|---|---|---|
| **OpenAlex** | all research metadata | REST, JSON | **API**. [VERIFIED] official docs: keyless works but is metered (*no key = 10 req/s and a small daily budget*); **free key raises budget 10× and is required for cursor paging past page 1**. Honest framing: "free, and casual use needs no key". | CC0 metadata | continuous | High | **P1 — primary ranking signal.** Provides `cited_by_count`, `type`, `is_oa`, `from_publication_date`. This is the only source surveyed that gives an objective **significance** proxy. Requires a **free API key** → one new secret. |
| **Crossref** | all DOIs | REST, JSON | **API**, no key. [VERIFIED] `mailto` moves you to the polite pool. | metadata largely uncopyrighted | continuous | High | **P1 — verification layer.** Confirm a DOI is a real journal article vs preprint, and get publisher/ISSN. Pairs with OpenAlex. |
| **Europe PMC** | life sciences | REST, JSON | **API**, no key. [VERIFIED] official docs: `resultType=core` returns abstract; `sort` supports `P_PDATE_D`, `CITED`; `format=json`. | abstracts are publisher/author terms — **metadata + abstract only** | daily | High | **P1 for Biology.** Its `CITED` sort plus `pubType` is exactly what distinguishes a review from a preprint. Already prototyped in the unmerged #58 branch. |
| **arXiv** | physics, maths, CS, q-bio | REST, **Atom XML** | **API**, no key. [VERIFIED] official terms: **≤1 request / 3 s, single connection, shared across all machines**; 30,000-result cap; **metadata CC0, e-prints not redistributable**. | metadata CC0 | daily (midnight) | High | **P2 for Physics.** Explicitly a **preprint** server — must be labelled "not peer reviewed", never as a discovery. Good for breadth, weak for significance. |
| **Nature** (`https://www.nature.com/nature.rss`) | flagship journal | **RSS** | **Verified live**: fetched during audit, returned entries dated **2026-11-04**. | headlines/summaries via RSS; **link out, never reproduce** | daily | High | **P1 — high-signal feed.** ⚠️ Its "current" feed is largely **news and comment** (`d41586-*` IDs), not research letters. Must filter by DOI prefix/type. |
| **Phys.org** (`https://phys.org/rss-feed/`) | all physical sciences | **RSS** | **Verified live**: fetched during audit, entries dated **2026-11-04** with per-item category tags. | **press releases** — syndicated institutional copy | ~30+/day | High | **P2 — discovery breadth only**, must be marked as a press release and never as a finding. |
| **NASA** `images-api.nasa.gov` | mission media | REST | **API**, no key. [VERIFIED] separate from `api.nasa.gov`. | NASA media guidelines, third-party elements may differ | continuous | High | **P3 — imagery, not discovery.** Keep as-is. |
| **api.nasa.gov** | APOD, Earth, NeoWs | REST | **API**, needs key. [VERIFIED] official: **DEMO_KEY = 30 req/hr, 50 req/day per IP**; registered key 1,000/hr. | mostly public domain | daily | High | **P3.** Requires a secret; DEMO_KEY is too tight for a daily job. |
| Institution newsrooms (MIT, Stanford, Max Planck, CERN, ESA…) | research announcements | **RSS mostly** | Varies per institution; **each needs individual verification** | press-release terms | daily | Medium | **P2 — after the ranking layer exists**, as a diversity input. Do not add 20 feeds before scoring works. |

**How to identify importance rather than recency** (the requirement you emphasised) — a workable, implementable definition given only these sources:

1. **Filter**: `type:article`, `from_publication_date:<7 days>`, `is_oa:true`, and a **DOI present in Crossref** (proves journal article, not preprint).
2. **Score**: `cited_by_count` is useless for week-old papers, so use **journal-tier weight** (a small curated allow-list of high-impact journals per discipline) × **institutional signal** (OpenAlex `authorships.institutions`) × **subject match** (OpenAlex `topics`).
3. **Deduplicate**: DOI → normalized title → shingle similarity, all three already implemented in `lib/curiosity/dedupe.ts`.
4. **Caveat**: label provenance (`peer-reviewed` / `preprint` / `press-release`) on the card and never merge those labels.

Honest limitation: **citation counts cannot rank same-week papers.** Any "most important today" claim is a heuristic over journal tier and topic novelty. **Recommendation: show the heuristic's basis on the card** rather than implying an objective truth.

### 5.2 Speak Better — vocabulary

| Source | Access | API/RSS | Licence / terms | Recommendation |
|---|---|---|---|---|
| **Wiktionary REST** (`en.wiktionary.org/api/rest_v1/page/definition/{word}`) | REST, JSON | **API**, no key | **CC BY-SA 4.0** — attribution + share-alike | **P0 — best fit.** Same host and client conventions already in `lib/curiosity/wikimedia.ts`. Gives definitions, POS, examples. |
| **Free Dictionary API** (`api.dictionaryapi.dev`) | REST | **API**, no key | [OBSERVED] sources from Wiktionary, CC BY-SA; community-run, no formal SLA | P2 — convenience wrapper; prefer Wiktionary directly |
| **Merriam-Webster** (`dictionaryapi.com`) | REST | **API, requires free key** [VERIFIED] 1,000 queries/day, non-commercial, 2 reference APIs | Proprietary | **P2 — only if you accept a key + non-commercial limit.** Best learner-oriented definitions. |
| **Datamuse** (`api.datamuse.com`) | REST | **API**, no key | [OBSERVED] free, no key documented | **P1 — collocations.** Solves the "collocations" requirement specifically. |
| **Hindi meaning** | — | **No reliable free API found** | — | **P1 — keep authored.** Machine translation of nuance would be worse than the current hand-written Devanagari. This is the one place where "live" would *reduce* quality. |

**How to avoid repeats / known words:** the repository already has the pattern — `curiosity_seen` records `content_id` per day and `selectCandidate` enforces `exactDays`. Speak Better needs the same thing keyed on **word**, not lesson, plus the existing `localStorage` `known` set promoted to a server record if cross-device is wanted.

**Blunt assessment:** live dictionary lookup gives you definitions and collocations. It does **not** give you Hindi glosses, nuance-vs-near-synonym contrast, or "the mistake learners actually make at B2" — the parts that make the current 32 lessons good. A live pipeline here is a **supplement** (fresh word of the day + dictionary enrichment), not a replacement.

### 5.3 Literature

| Source | Access | Licence | Recommendation |
|---|---|---|---|
| **Project Gutenberg** | RDF per book (**already implemented**) | public domain **in the US** — jurisdiction differs | **P1 — already built; just run it, and route it into the daily card.** |
| **Standard Ebooks** | OPDS (**already implemented**) | PD in US; editorial work also PD | same |
| **Wikisource** | MediaWiki API (**already implemented**) | **per page** — CC BY-SA or PD | same; per-page rights already coded |
| **Poetry Foundation** | web only, no API | **not reusable** — most poems in copyright | **Remove or link-only.** See §6 risk R1. |
| **Wikidata / Wikipedia** | API | CC0 / CC BY-SA | P2 — good for *about the author* context |

### 5.4 Brain Sharpener

There is **no trustworthy free API for high-quality logic/maths puzzles**. Generic trivia APIs (e.g. Open Trivia DB, CC BY-SA) are multiple-choice recall — the opposite of what you asked for. **Recommendation: do not chase a live puzzle API.** Instead:

- Serve from a **curated, versioned puzzle bank** with attributes (subject, difficulty, type, expected answer, worked solution), which is what exists now — just **far larger**, and
- add a **generator family** for classes that can be procedurally produced with verified answers (e.g. modular arithmetic, probability, unit conversions, series completion), where the answer is computed rather than authored, so quality is guaranteed by construction.
- Persist attempts so a solved puzzle does not return.

This is the one area where I recommend **authored/procedural over live**, and I want to be explicit that this is a deliberate departure from your "use live sources wherever possible" instruction — because the live options are lower quality.

---

## 6. Proposed shared architecture

**Your instinct is right: reuse the existing engine.** Focus Desk already has a genuinely well-built discovery pipeline. The evidence is specific:

| Capability you asked for | Already exists | Where |
|---|---|---|
| Shared ingestion | ✅ `lib/discovery/run.ts` `runCollectionDiscovery()` | literature only |
| Subject-specific adapters | ✅ `DiscoveryAdapter` interface | `lib/discovery/sources/types.ts` |
| Quality/relevance scoring | ❌ **the only real gap** | — |
| Freshness checks | ⚠️ per-source only, no publication date in the model | `payload.dateVerified` on NASA |
| Duplicate / near-duplicate | ✅ three-level identity | `lib/curiosity/dedupe.ts`, `mergeCandidateDrafts()` |
| Credibility / licence validation | ✅ four-status rights policy | `lib/discovery/collection.ts` (`assertRightsEligible`) |
| Persistent publication history | ✅ | `curiosity_seen`, `curiosity_briefings` |
| Scheduled publishing | ✅ (literature job never run yet) | `.github/workflows/*` |
| Graceful fallback | ✅ `origins.ts` + `degraded[]` | `job.ts` |
| Source attribution | ✅ | `attribution`, licence fields on every record |
| User progress / known history | ✅ pattern exists | `curiosity_seen`; Speak Better local ledger |

**What must be added — and nothing more:**

1. **A `score` capability on candidates.** One new field in the candidate payload (`payload.significance`, a number + a stated basis) and a comparator in `selection.ts`. No schema change: `curiosity_candidates` already stores a free-form `payload` jsonb.
2. **A publication-date field** in the candidate payload, so freshness is a first-class fact rather than inferred from `updated_at`. Again no migration.
3. **A classifier for provenance** — `peer-reviewed | preprint | press-release | reference` — stored in `payload`. No migration.
4. **Science adapters**: `openalex.ts`, `crossref.ts`, `europepmc.ts`, `arxiv.ts`, and optionally an RSS adapter for Nature/Phys.org. The `arXiv`/RSS ones need an XML parser; `lib/discovery/sources/standard-ebooks.ts` already contains a working Atom parser to model on.
5. **Route discovered literature into the daily card**, rather than only the shelf below it.

**Explicitly not needed:** no new tables, no new migration for categories that already exist (physics/chemistry/biology are already in the `curiosity_candidates` CHECK from migration 011), no new dependencies for JSON APIs, and **no new secrets except one optional free OpenAlex key**.

---

## 7. Prioritized roadmap

Effort is my estimate from the code I read, not from a time study.

### P0 — make what already exists actually run

| | Item | Detail |
|---|---|---|
| **P0-1** | **Fix the discovery job's configuration** | *Problem:* 9/10 scheduled runs fail in 3s for want of `SUPABASE_*` secrets or `CURIOSITY_APP_URL`. *Outcome:* reservoir replenishes daily. *Existing code:* everything. *New code:* none. *Secrets:* none new — the same ones the daily job already uses. *Complexity:* **Low**. *Risk:* low. **This unblocks Science and History at once.** |
| **P0-2** | **Literature: first real run, then wire it into the daily card** | *Problem:* the pipeline is built but has never executed, and its output misses the daily reading card. *Outcome:* a fresh, licence-verified reading choice each day. *Existing code:* `persistCollectionRun`, `selectShelf`, `LiteratureDiscoveryCard`. *New code:* a `shelf` leg inside `job.ts`'s literature choice. *DB:* none. *Secrets:* none. *Complexity:* **Low**. *Risk:* unverified response shapes — first live run is the real test. |
| **P0-3** | **Literature licensing remediation** | *Problem:* 24 authored entries reproduce text with no licence field; several are in copyright (translations especially). *Outcome:* every passage is either public domain with a recorded basis, or replaced by a link + short original commentary. *Existing code:* `LiteratureItem` type. *DB:* none. *Complexity:* **Low–Medium** (editorial, not engineering). *Risk:* legal exposure today. **Recommend treating this as the highest-severity item in the audit.** |

### P1 — make the content genuinely *new* and *ranked*

| | Item | Detail |
|---|---|---|
| **P1-1** | **Science significance layer** | Adapters: OpenAlex (ranking) + Crossref (verification) + Europe PMC (Biology). Add `payload.significance` + `payload.publishedOn` + `payload.provenance`; score = journal tier × topic match × OA; label provenance on the card. *Existing:* `persistCollectionRun`, dedupe, rights policy, `Origins`. *New code:* 3 adapters + 1 scorer (~1 file). *DB:* none. *Secrets:* **one free OpenAlex key** (optional but recommended). *Complexity:* **High** — the ranking heuristic is the hard part and will need tuning. *Risk:* "significance" is a judgement; a bad weight produces confidently wrong picks. Mitigate by showing the basis. |
| **P1-2** | **Science freshness + dedupe across sources** | The same discovery arrives from Nature RSS, Phys.org and OpenAlex. Extend `dedupe.ts` use to DOI-first matching. *Complexity:* **Medium** (mostly already there). |
| **P1-3** | **Speak Better: live enrichment** | Add Wiktionary (word data) + Datamuse (collocations) as an *enrichment* step over an authored word list; promote `known`/`seen` from localStorage to a persisted ledger so selection can skip known words. *Existing:* `curiosity_seen` pattern, `selectCandidate`. *Secrets:* none. *Complexity:* **Medium**. *Risk:* **Hindi and nuance stay authored** — be honest that this does not remove authoring. |
| **P1-4** | **Brain Sharpener: expand the bank + add generators** | Grow 6 → 60+ authored, and add 3–4 procedural generators with computed answers. Persist attempts. *DB:* reuse `curiosity_seen`; a per-user attempts table only if cross-device matters. *Complexity:* **Medium** (content-heavy). |

### P2 — breadth

- arXiv adapter for Physics breadth, **labelled preprint**. [VERIFIED] 3s rate limit, CC0 metadata.
- Institution newsroom RSS adapters, **labelled press release**, only after scoring exists.
- AI World / Developer Radar: already live; consider replacing the 2 static fallback shelves (24 items) with cached last-good live content — `job.ts` already keeps previous items as `cached`, so this may be a no-op.

---

## 8. Risks, dependencies and unresolved questions

| # | Risk / question | Severity | Evidence | Mitigation |
|---|---|---|---|---|
| **R1** | **Copyrighted passages in authored literature** | **High** | `LiteratureItem` has no licence field; 24 `passage:` values from Poetry Foundation etc. | P0-3: audit each entry; keep only PD works (with jurisdiction noted); otherwise link-only |
| R2 | Discovery job silently dead | **High** | 9/10 failures; `exit 1` on missing config | P0-1 + an alerting step so a red run is not just a red icon |
| R3 | "Significance" is subjective | **High** | no scoring exists; citation counts useless for new papers | Show the basis on the card; never claim objective importance |
| R4 | Preprint presented as finding | **High** | arXiv is explicitly preprint; Nature RSS is largely news/comment | `provenance` enum enforced in validation |
| R5 | Source shape drift | Medium | literature adapters never run | adapters already report `failed` rather than inventing; watch first runs |
| R6 | OpenAlex metering change | Medium | [VERIFIED] keyless use is metered; key raises budget 10× | obtain free key; cache aggressively (arXiv docs also ask for caching) |
| R7 | Pool exhaustion → forced repeats | Medium | `allowRelaxation: true` everywhere; 6 sharpeners vs 365-day cooldown | enlarge pools; surface relaxation count in the status panel (already recorded) |
| R8 | Dictionary APIs are community-run | Medium | [OBSERVED] dictionaryapi.dev has no formal SLA | prefer Wiktionary directly (same host already used) |
| R9 | Hindi coverage | Medium | no free API found | keep authored |
| **Q1** | Is `CURIOSITY_APP_URL` intentionally unset, or is the repo un-deployed? | — | **UNKNOWN** — cannot determine from repo | confirm with owner; affects whether P0-1 is a 5-minute fix or a deploy task |
| **Q2** | Has `discovery-literature.yml` fired since 11:20 UTC? | — | 0 runs at 10:46 UTC | re-check after first cron |
| Q3 | Are `SUPABASE_*` runner secrets permanent or were they present only for the manual run? | — | manual run succeeded, scheduled runs skipped those steps | confirm in repo settings |
| Q4 | Is the RLS blocker from `docs/rls-and-grants-review.md` resolved? | — | that report is read-only; no evidence it was applied | verify before adding per-user data (P1-3) |

---

## 9. Direct answer to your closing question

**Which parts are genuinely live and continuously refreshed today?**

Three, and only three:

1. **AI World** — pulls six real RSS feeds at publish time. [VERIFIED]
2. **Developer Radar** — queries the GitHub search API at publish time. [VERIFIED]
3. **One Book** — a real Open Library lookup, refreshed every 3 days. [VERIFIED]

Plus the **publishing** machinery itself: `curiosity-daily.yml` has succeeded on schedule every day for the last 8 days, writing immutable dated snapshots with provenance labels. That part is genuinely dependable.

**Which parts are essentially hardcoded?**

- **Speak Better** — 32 authored lessons; daily rotation is 12 of them.
- **Brain Sharpener** — **6** puzzles on a 6-day cycle.
- **A Few Minutes of Literature** — 24 authored entries on a date rotation, never touched by the discovery pipeline.
- **One Thing / Learn Something** — 46 authored entries.
- **Physics / Chemistry / Biology** — 18 authored each, *blended* with Wikipedia category pages that carry **no publication date and no significance signal**. It looks live; it is not "a discovery".
- **Today in History** — 85 authored seeds, supplemented by Wikipedia's on-this-day feed (real, but historical, not new).
- **Mythology** — 24 authored + Wikidata.

**And one piece that is built but dark:** literature discovery (Gutenberg / Standard Ebooks / Wikisource), correctly licensed, scheduled, and never yet executed.

**The most sensible roadmap**, in one sentence of reasoning each:

**P0 first, and it is nearly free.** Fix the discovery workflow's configuration — the appliance exists and is unplugged. Simultaneously run literature discovery once for real and route its output into the *daily* card rather than a shelf below it, and remediate the copyrighted passages. These three are configuration, wiring and editorial work; together they convert two dead sections into live ones and remove the one legal exposure, with **no migration, no new secret, and no new dependency.**

**P1 next, and only then does "discovery" become true.** Add the science significance layer (OpenAlex + Crossref + Europe PMC) with an explicit provenance label and a shown basis for the ranking. Enrich Speak Better from Wiktionary/Datamuse without pretending the Hindi and nuance can be generated. Expand Brain Sharpener by authoring and by procedural generation with computed answers.

**Do not** add twenty institution feeds, an arXiv pipeline for "discoveries", or a live puzzle API before the scoring layer exists. Without ranking, more sources make the app noisier, not better — and the current selector would distribute the noise evenly by date index.

**What I would not claim:** that any of the proposed science sources will, unaided, surface "the single most valuable discovery" each day. OpenAlex citation data cannot rank same-week papers, and press releases outnumber findings. The achievable, honest target is: *a small set of genuinely recent, peer-reviewed, well-attributed items, ranked by a stated heuristic, labelled by provenance, deduplicated, and never presented as more certain than it is.* That is a real improvement over a Wikipedia article chosen by `dayNumber % 9` — and it is a target the current architecture can actually reach.

---

## Addendum — what was implemented (2026-11-04)

This audit's recommendations were implemented on the branch `arena/502ef525-focusdesk`, on
top of `824e1b1`. Nothing in the analysis above is retracted; the note here exists so a
reader of the audit knows which parts are now history.

- **P0, literature:** every one of the 24 entries now states a rights basis, and the two
  entries whose source translation is in copyright (`lit-rilke-letter-four`,
  `lit-basho-narrow-road`) are link-only — no text, an original note and a link. Discovered
  literature now reaches the daily card ahead of the curated pool.
- **P1, science:** OpenAlex, Crossref, Europe PMC and arXiv adapters, a 100-point ranking
  with a stored significance basis, dataset-first DOI collapse and Crossref DOI verification
  that can only demote a review claim. Scheduled by
  `.github/workflows/curiosity-science-discovery.yml`; the card shows a provenance badge.
- **P1, Brain Sharpener:** 15 authored puzzles plus 8 generator families, every puzzle
  re-verified from its seed before publication, with a local attempt ledger.
- **P1, Speak Better:** the daily card is B2/C1 with a C2 day one in five, a reader-level
  refinement that only chooses among published lessons, and Wiktionary/Datamuse enrichment
  that can only add an attributed gloss.
- **Not done:** no new table, no migration, no new dependency, and no claim that any of
  these live APIs were proven reachable from the dev environment — the harnesses stub the
  network deliberately. Details, terms and rollback:
  [knowledge-workflow-modernization.md](knowledge-workflow-modernization.md).
