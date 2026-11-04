# Knowledge Workflow Modernization — Science, Puzzles, Literature Rights & Speak Better

This document records an implementation pass over the Curiosity daily card. It is written
to be checkable: every claim here is either a file path you can open or a harness you can
run. Where something is **not** proven — most importantly live reachability of the
external APIs — it says so instead of implying otherwise.

Base: `main` at `824e1b1`. No schema change, no new table, no new dependency, no new
paid service, and no new required secret.

---

## 1. What was actually wrong

The audit in `docs/live-content-modernization-audit.md` listed four content problems that
this pass fixes. (Its fifth point — the failing discovery workflow — was resolved
separately on 2026-11-04 and is *not* re-diagnosed here.)

| Card | Before | After |
|---|---|---|
| Physics / Chemistry / Biology | One of 18 curated concepts per subject, or a Wikipedia category item. No journal, no preprint, no freshness, no way to tell a reviewed paper from a press release. | Ranked research from OpenAlex, Crossref, Europe PMC and arXiv, stored in the existing candidate reservoir, with a provenance badge and the reason for selection printed on the card. Curated concepts remain the labelled fallback. |
| Brain Sharpener | Exactly 6 puzzles, `safeDay % 6`. | 15 authored puzzles + 8 procedural generator families (133 distinct puzzle instances over a year, all 8 categories, all 5 difficulty levels), each re-verified from its own seed before publication. Attempts are tracked locally. |
| Literature | 24 authored entries with **no licence field**, some reproducing in-copyright translations. Discovered literature existed but only reached a separate shelf, never the card. | Every entry states a rights basis on the card; two entries are link-only (no text, an original note and a link instead). Discovered, licence-checked literature now reaches the daily card first, with curated entries as the fallback. |
| Speak Better | 32 lessons, daily rotation over the twelve A2–B1 lessons. Portuguese-level vocabulary for a professional learner. | Daily card is B2 or C1, with a C2 lesson one day in five. A reader whose published lesson is entirely known gets a published alternative with new words, and the card says why. A2–B1 stays as the library on-ramp and the stated fallback. |

---

## 2. Science discovery

### Sources and their terms

| Source | What it is used for | Terms honoured in code |
|---|---|---|
| [OpenAlex](https://api.openalex.org) | Primary discovery for all three disciplines | CC0 metadata; `mailto` contact sent when configured; `per-page` capped at 25; one bounded query per discipline per run |
| [Crossref](https://api.crossref.org) | DOI verification, licence and venue enrichment | Open metadata; `mailto` contact; verification limited to the top 3 records per discipline per run |
| [Europe PMC](https://www.ebi.ac.uk/europepmc/webservices/rest/search) | Biology, including preprints | Free REST, no key; `resultType=core`; one request per run |
| [arXiv](https://export.arxiv.org/api/query) | Physics and chemistry preprints | CC0 metadata; **3 s minimum between requests** (a hard requirement, not politeness); preprints always labelled as such |

Host spacing and timeouts live in `lib/discovery/http.ts` (`HOST_MIN_INTERVAL_MS`), next to
the existing Gutenberg/Wikimedia intervals, so every source is subject to the same
budget, retry and backoff path.

### The pipeline, in the order it runs

1. **Fetch** — `lib/discovery/sources/{openalex,crossref,europepmc,arxiv}.ts`. Each adapter
   is isolated; a thrown error becomes one `failed` report line, never a lost run. A
   source's rotation cursor advances only when it actually answered, so an outage does not
   silently skip a query window (`lib/discovery/science-run.ts`).
2. **Collapse** — DOI-first. Two sources describing one paper become one row, and the
   peer-reviewed version wins over the preprint of the same DOI, filling gaps from the
   duplicate rather than discarding it.
3. **Gate** — `rejectionForRecord` refuses undated records, records outside the 60-day
   window, non-article types, errata, editorials, and anything without a resolvable link.
   A date that cannot round-trip (`2026-02-30`) is refused rather than re-dated to 2 March.
4. **Rank** — a stated 100-point weighting: freshness 30, venue selectivity 20, citations
   15, relevance 15, provenance 15, substance 5. The basis is stored on the row, so the
   card can print *why* today's paper is today's paper.
5. **Verify** — the top records per discipline have their DOI checked against Crossref.
   A title mismatch rejects the record. An unreachable registry does **not**: it is
   recorded as "could not be checked" and the claim is not upgraded.
6. **Persist** — through the existing `curiosity_candidates` reservoir, with the existing
   validation, dedupe, near-duplicate signature and idempotent upsert. The row carries
   `payload.science.provenance`, `significanceBasis`, `publishedOn` and `rights`.
7. **Publish** — the daily publisher (`curiosity-daily.yml`, unchanged) reads the reservoir
   and prefers a research row that is still inside its freshness window, ranked
   `research = 1000 + significance score` against `wikipedia = 100` and `curated = 10`.

### What the card is allowed to say

- A preprint is labelled a preprint and says it has not been peer-reviewed. Crossref's own
  type may only ever *demote* a review claim, never create one.
- An abstract is quoted only when the source stated an open licence
  (`abstractRights`); otherwise the card shows metadata and a link.
- If no qualified record exists today, the card shows a curated concept and says so
  ("no qualified recent research record in the library; showing … instead"). It never
  presents a curated topic as a new discovery.

### Switching it off

`CURIOSITY_SCIENCE_SOURCES` (see `.env.example`):

- unset or empty → all four adapters run
- `off` → all four are reported `disabled`; the publisher falls back to curated cards
- `openalex,europepmc` → only those two run

`OPENALEX_CONTACT_EMAIL` is optional and falls back to `WIKIMEDIA_CONTACT_EMAIL`.

### Running and scheduling

```bash
npm run discover:science -- --sources=openalex,europepmc --disciplines=biology --max=4
npm run discover:science -- --verify=off      # skip Crossref DOI checks
```

`.github/workflows/curiosity-science-discovery.yml` runs at `11:40 UTC` daily, between the
literature run (11:20) and the publish (18:30). It uses the same runner secrets the other
Curiosity jobs already use. Exit code 3 means every source failed; the job goes red rather
than reporting a green no-op.

---

## 3. Brain Sharpener

`lib/curiosity/puzzles.ts`:

- **Authored bank** — 15 puzzles across 8 categories, each with a hint, a worked solution
  and a verified answer.
- **Generators** — 8 families (number sequences, modular arithmetic, probability, knights
  and knaves, unit conversion, multi-step reasoning, warm-up arithmetic, weighted
  averages). Each produces a deterministic puzzle from a seed.
- **Verification** — `verifyPuzzle` re-derives a generated puzzle from *every* generator at
  the puzzle's seed and compares the answer, the problem text and the worked solution. A
  puzzle whose answer cannot be reproduced never reaches a pool let alone a card. This is
  what makes it safe to generate puzzles at all.
- **Selection** — `selectDailyPuzzle` prefers puzzles the reader has not attempted, then
  puzzles not published recently, then the day's rotated category and difficulty.

Attempts live in `lib/curiosity/sharpener-progress.ts` under the versioned key
`pace.sharpener.progress.v1`. There is no table and no migration: the ledger is additive
(first attempt, last attempt, count, solved date), survives old and corrupt documents, and
degrades to an in-memory session when storage is blocked. "Try another challenge" and
"Mark as solved" are on the card.

---

## 4. Literature rights

Every id in `lib/curiosity/content/literature.ts` has an entry in
`LITERATURE_RIGHTS_BY_ID` giving a rights status, a one-sentence basis, and — where it
differs — a jurisdiction note. `withLiteratureRights` attaches those to the card.

Two shapes exist and the publisher's validator enforces them:

| `excerptKind` | Card shows | Validator requires |
|---|---|---|
| `public-domain-passage` | the quoted passage | a non-empty `passage` |
| `link-only` | an original context note, the rights basis, and a link | `context` + `rights`, and **no** `passage` |

`lit-rilke-letter-four` and `lit-basho-narrow-road` are link-only: the underlying work may
be public domain, but the translation the source quotes is not, so no text is reproduced.

Discovered literature (Gutenberg, Standard Ebooks, Wikisource) now reaches the daily card
ahead of the curated pool (`rank` 100 vs 1) — but only when a licence-checked, eligible
candidate exists. Otherwise the card shows a curated reading and says the library had no
eligible discovered work today.

---

## 5. Speak Better

- `selectDailyLesson` (`lib/curiosity/speak-better-daily.ts`) publishes from the B2 and C1
  bands, with a C2 lesson one day in five (deterministic from `dayNumber`, so the schedule
  is reproducible and testable). An empty C2 band degrades to a B2–C1 day and says so.
- `refineForReader` is the browser half: it swaps the published lesson only when **every**
  one of its words is already marked known *and* another published lesson has at least one
  new word. A learning state never triggers a swap, and nothing is invented — the
  alternatives come from the same published curriculum.
- The level is printed as "curated level" (`levelLabel`) because no dictionary API assigns
  CEFR levels per sense; saying "B2" without that qualifier would imply a source that does
  not exist.
- **One entry point.** There is no Speak Better item in the navigation any more. The full
  practice library (search, level filters, seen/known/saved/review tracking) opens from the
  daily card, lazily loaded, and the retired `/speak-better` route redirects to
  `/curiosity#speak-better`. Lessons, ledger keys and stored progress are untouched.
- **Dictionary enrichment** (`lib/discovery/enrichment/`): Wiktionary supplies an English
  part of speech and a short definition (CC BY-SA 4.0, attributed and linked); Datamuse
  supplies association lists labelled "Often appears with" (CC BY 4.0). Hindi meaning,
  nuance, examples, common mistake, register and CEFR stay authorial — `enrichLesson`
  writes only `word.dictionary` and never an authored field. A failed lookup ships the
  authored lesson with `enrichment.status: 'unavailable'` and a note on the card.

---

## 6. What is proven, and what is not

| Claim | How it is proven |
|---|---|
| Adapters parse the four live response shapes correctly | `npm run verify:science` — fixtures copied from the documented payloads, injected through `fetchImpl` |
| A preprint can never print as peer-reviewed | `verify:science` checks 4, 8, 12; `curiosity:verify` and `verify:daily-knowledge` check the publisher's validator rejects it |
| One source failing does not lose the day | `verify:science` check 11 |
| Every published puzzle's answer is reproducible | `verify:daily-knowledge` checks 1–3; `curiosity:content` re-verifies every puzzle reachable across 366 days |
| A link-only work never quotes text | `verify:daily-knowledge` check 4; `curiosity:verify` audits all 24 entries |
| The daily card stays in B2/C1 with an occasional C2 day | `verify:daily-knowledge` check 5; `curiosity:content` across 366 days |
| Enrichment never rewrites authored content | `verify:science` check 13 |
| Attempts need no table and never delete history | `verify:daily-knowledge` check 7 |

**Not proven here:** that `api.openalex.org`, `api.crossref.org`, Europe PMC, arXiv,
Wiktionary or Datamuse are reachable from your environment, or that their response shapes
have not changed since these fixtures were written. Every harness stubs the network on
purpose. Live behaviour is what `npm run discover:science` and the scheduled workflow
report — read their output, not this document, before believing a live integration works.

---

## 7. Rollback

Each piece is independently switchable:

- `CURIOSITY_SCIENCE_SOURCES=off` — curated science cards, no network
- `CURIOSITY_ENRICHMENT=off` — authored Speak Better lessons with no dictionary block
- Remove the workflow file — no scheduled science discovery (the card falls back exactly
  as it did before, with a degraded note)
- The puzzle bank, rights map and selection modules are additive; reverting their imports
  in `lib/curiosity/job.ts` restores the previous behaviour without touching stored data.
  No schema was changed, so no data migration is implied in either direction.
