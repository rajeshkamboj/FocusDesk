# Curiosity & Learnings expansion — what changed, and how to ship it

Five features landed on one branch, additively, without touching a published
snapshot, a user's progress, or an existing route:

1. **Speak Better** — live vocabulary discovery with an editorial gate.
2. **Mythology + Historical** — a renamed, classification-aware, cross-tradition
   section with nine long-form figures.
3. **Science** — exactly two educational levels, foundation first.
4. **One Book** — genre rotation and evidence-backed bestseller labels.
5. **Learnings** — This Week's Learning, with four progress states and Save for Later.

This document is the operating manual: what each change is, what it writes, what it
does not touch, how to verify it, how to roll it back, and what remains unproven.

---

## 1. Speak Better: discovery with a human gate

### Architecture

```
scheduled job (GitHub Actions, 11:55 UTC)
  → discover   Datamuse anchors (`ml=<word>`): related, teachable words
  → enrich     Wiktionary (definitions) + Free Dictionary (definitions)
  → band       Datamuse frequency (`md=f`) mapped to B2/C1 by a stated table
  → gate       editorial gloss required; Devanagari Hindi required; length, duplicates,
               stop words, published-word and lesson-id repeat checks
  → approve    candidate row in `curiosity_candidates` (category `speak-better`)
  → publish    the daily job reads the reservoir; authored curriculum is the fallback
```

The app never calls a lexical API. `lib/discovery/vocabulary/*` is imported only by
`scripts/discover-vocabulary.ts` and the verifiers.

### The gate is the feature

A discovered word is published only when all of these hold:

- a lexical source answered and its data was used;
- a measured frequency maps onto B2 or C1;
- an editor has written a gloss for it in
  `lib/curiosity/content/speak-better-vocabulary.ts` — English meaning, Hindi
  meaning in Devanagari, nuance, three examples, a common mistake, collocations.

A word without a gloss is stored as `needs-review` and can never be shown. Growing
the curriculum means writing glosses; it does not mean loosening the gate.

### What a discovered lesson carries

`origin: 'discovered'` and a `discovery` record: approval date, each source with
license and status (`ok` / `failed`), how the band was decided, the measured
frequency, the gloss revision, and the checks that passed. The card prints this
behind a disclosure, so a reader can always tell an edited gloss from an authored
lesson.

### Failure behaviour

| Failure | What happens |
| --- | --- |
| Datamuse down | other anchors skipped; the run reports the failure; nothing approved |
| Wiktionary/Free Dictionary down | candidate is not approved; notes say which source failed |
| No frequency score | no band estimate → not approved (band is never guessed) |
| Migration 012 missing | writes refused, run exits 2, authored curriculum keeps publishing |
| Every source down | run exits 3; the scheduler notices |
| Reader's word already known | `liveAlternatives` supplies another unpublished word |

---

## 2. Mythology + Historical

- Section renamed in the UI, the catalog label and the nav hint. **No id, text or
  rotation position of the original 24 entries changed** — they are labelled by id
  in `lib/curiosity/mythology-catalog.ts`, applied at export.
- Two new optional fields on `MythCharacter`: `classification`
  (`mythological | religious | historical | legendary | literary`) and `historicity`
  (`documented | debated | legendary | textual-only`). They are separate because the
  combination is the point: a Sikh Guru is `religious` + `documented`, never
  "mythological".
- Two more optional fields, added when the audit found that one sentence about
  labelling was being printed under the heading "What is contested":
  `classificationNote` (why the entry carries the classification it does) and
  `datingNote` (what is uncertain about the *dates*, as opposed to the existence).
  "What is contested" now appears only where scholarship or traditions genuinely
  disagree.
- Ten new long-form entries in `content/mythology-historical.ts`: Guru Nanak,
  Guru Gobind Singh, Ashoka, Mahavira, Socrates, Hatshepsut, Mirabai, Enheduanna,
  Marcus Aurelius, and Milarepa — the first Buddhist figure in the section (the
  tradition was registered in `MYTH_TRADITIONS`, but no figure belonged to it).
  Each carries background, turning points, contributions, significance, references,
  and a contested note where the record is genuinely unsettled.
- `mahavira` and `mirabai` were recorded as `historicity: 'debated'`. Their
  *existence* is not the debated question — their dates and biographical detail
  are — so both are now `documented`, with a `datingNote` that says exactly which
  years are conventional and which are argued.
- The card prints classification, historicity, period and both notes, then the
  extended layers only when present. Existing entries render exactly as before plus
  the badge. `curiosity:content` now counts 34 myth characters.

Content rule enforced by `verify-daily-content`: narrative figures keep the
reference-panel shape (family ≥ 4, timeline ≥ 4); documented figures must carry a
background paragraph and ≥ 2 checkable references, and their family panel may be
thin because the record is thin. Nothing is invented to satisfy a layout.

---

## 3. Science: two levels, foundation first

- `ScienceEducationLevel = 'foundation' | 'undergraduate'`. There is no third value,
  so "Advanced Research" is not hidden — it is unrepresentable.
- Foundation is the default and is what `briefing.chemistry/physics/biology`
  publish. Curated and encyclopedia concepts are stamped `foundation`
  (`levelBasis: 'derived-from-record'`).
- Research records are stamped `undergraduate` and reachable only through
  `briefing.scienceLevels.undergraduate`, behind the selector.
- A discipline with no qualified undergraduate record today renders an empty card
  that says so, rather than borrowing a foundation card under the wrong label.
- `invalidDailyFields` now enforces the level of each set: foundation cards must be
  foundation-level; undergraduate cards must be research records with provenance and
  a source URL.
- Historical snapshots that stored only `chemistry/physics/biology` keep working:
  they are foundation by definition.

---

## 4. One Book: genres and evidence

- `BOOK_GENRES` (15) + `BookGenre`; `genre` is optional so an old snapshot without
  one still validates.
- `BestsellerEvidence` requires a named source and a kind. The label is rendered
  only from that field, and the evidence line is printed beside it.
- Selection: `bestsellerEligibleEntries` → no consecutive author → no consecutive
  genre → existing date rotation. Cadence unchanged (a book every three days).
- The pool is 53 entries (25 authored + 28 genre shelf) across 18 genre values, and
  34 carry usable evidence — 7 authored and 27 shelf, of which 30 are dated
  `list-entry` records and 4 are `publisher-stated`. Selection, validation and the
  card all read the same definition; see `docs/book-bestseller-evidence.md`.
- Entries without evidence are retained, not deleted, and simply cannot be chosen
  for a new card.

---

## 5. Learnings: This Week's Learning

- New corpus of 18 assignments across six projects (Sikhizm, PatientScure, PixlDot,
  UI/UX, LatestPunjabiMovies, AI), each ending in a checkable outcome.
- Selection is a pure function of the week: Monday-based, Asia/Kolkata, hashed by
  corpus rotation. The same week gives the same assignment on every device, and only
  a new week changes it. **Seven-day stability is a property of the function, not of
  a stored record.**
- Four states: Not started / In progress / Completed / Not relevant, plus Save for
  Later. **A status never changes which assignment the week is about** — the earlier
  implementation filtered Completed and Not relevant out of the eligible pool, so the
  first click on a decision re-picked the week and "Completed this week" could never
  be reached. `selectWeeklyAssignment()` now takes `records` only for call-site
  compatibility and does not read it; a new week is the only re-pick. Saved
  assignments stay visible after the week rolls over.
- Storage: `settings.weeklyLearning.records`, i.e. inside `app_settings.data` on
  Supabase and `pace.db.v1` locally. **No new table, no new column, no migration.**
  Older builds ignore the key; older snapshots lack it and read as empty.
- The store's normalizer rebuilds `settings` section by section, and it used to
  rebuild only `general`, `notifications` and `appearance` — so `weeklyLearning` was
  written by the UI and then dropped on the next read (and on `importData()`). It is
  now normalized and validated like the others: unknown statuses fall back to
  `not-started`, records that are not objects are dropped, an unparseable
  `updatedAt` becomes empty, and a backup with no such key reads as `{ records: {} }`.
  `npm run verify:learnings` asserts the round trip, including a legacy backup.

---

## Database changes

One migration, additive, supplied as SQL and **not executed here**:

`supabase/migrations/012_vocabulary_candidates.sql`

- widens the `curiosity_candidates.category` CHECK to admit `speak-better`;
- finds the existing inline constraint by definition and replaces it, so a
  differently-named constraint is not silently left in place;
- documents the table and the `entity_id` convention (`word:<word>`) in comments;
- creates no table, alters no row, drops nothing.

### Rollout

1. Apply 012 in the Supabase SQL Editor (or `supabase db push`).
2. Run `npx tsx scripts/discover-vocabulary.ts --status-only` to confirm the store
   reads.
3. Enable `.github/workflows/vocabulary-discovery.yml` (or trigger it manually).
4. Nothing else changes at deploy time: the publisher reads the reservoir on its
   next run and falls back to the authored curriculum until then.

### Rollback

```sql
delete from curiosity_candidates where category = 'speak-better';
alter table curiosity_candidates drop constraint if exists curiosity_candidates_category_check;
-- then re-add the 011 list (see the migration's rollback block)
```

Published lessons live in briefing snapshots and per-reader progress lives on the
device, so a rollback removes candidates, not anyone's history.

---

## Integrations

| Touched | How |
| --- | --- |
| `lib/curiosity/job.ts` | speak-better live-first selection; science level split; book evidence gate; stricter validation of both |
| `lib/curiosity/reservoir.ts` | mythology seed descriptions summarised to the reservoir's 1800-char limit (full prose untouched) |
| `lib/discovery/collection.ts`, `server.ts` | `vocabulary` collection writing through the existing reservoir |
| `lib/store/*repository.ts` | settings merge preserves `weeklyLearning` |
| `.github/workflows/vocabulary-discovery.yml` | new scheduled job, same secrets as the other Curiosity jobs |
| `package.json` | `discover:vocabulary`, `verify:learnings` |

Not touched: routes, navigation, auth, the daily publisher's schedule, any user data
table, any existing migration.

---

## Verification: what was actually run

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0, no warnings |
| `npm run build` | exit 0, 15 routes |
| `npm run curiosity:content` | exit 0 — 366 daily selections, 34 myth characters, 18/18/18 science concepts, page renders all sections in order |
| `npm run curiosity:reservoir` | exit 0 |
| `npm run curiosity:verify` | exit 0 — 18 checks incl. credential scan |
| `npm run curiosity:dedupe` | exit 0 — 14 checks |
| `npm run curiosity:history` | exit 0 — 11 checks |
| `npm run verify:speak-better` | exit 0 — 26 checks |
| `npm run verify:discovery` | exit 0 — 53 checks |
| `npm run verify:science` | exit 0 — 14 checks |
| `npm run verify:daily-knowledge` | exit 0 — 8 checks |
| `npm run verify:learnings` | exit 0 — 43 checks (extended: decision stability + the settings round trip) |
| `npm run curiosity:books` | exit 0 — 27 checks (new: evidence pass-through, no-claim rendering, validation) |
| `npx tsx scripts/discover-vocabulary.ts --offline` | exit 0, approves nothing, says why |
| `npm run curiosity:links` | exit 1 — every URL unreachable from this sandbox; the script says so itself. Not a content failure, but **unverified**. |

### Not verified here

- **Live vocabulary discovery.** No outbound access to Datamuse, Wiktionary or Free
  Dictionary in this environment. The pipeline's parsing and gating are covered by
  fixtures; a real run has not been executed.
- **The vocabulary workflow.** Written to the same pattern as the science and
  literature workflows, but never executed on GitHub.
- **Migration 012 against a real database.** The SQL was not applied anywhere.
- **Visual rendering of the new cards.** `curiosity:content` asserts the server HTML
  contains the sections, order, level labels and classification badge; nobody has
  looked at the page in a browser at 320px.
- **Supabase settings round-trip for `weeklyLearning`.** The local settings path is
  exercised; the Supabase path is a mechanical merge of the same shape.

---

## Risk assessment

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| 012 not applied | high until run | vocabulary silent, nothing breaks | run exits 2; publisher falls back; documented here |
| Dubious discovered word approved | low | quality | editorial gloss is mandatory; frequency band stated; provenance printed |
| Bestseller label wrong | low | credibility | source + period recorded; selection refuses evidence-free titles; file lists every claim |
| Historical figure mislabelled | low | trust, offence | classification and historicity separate; documented figures never labelled mythological |
| Weekly pick changes mid-week | very low | small annoyance | pure function of the Monday key; 20 assertions cover it |
| Learnings settings lost on new device | medium | minor | stored server-side for signed-in users; local otherwise — same as every other setting |
| Third science level reappears | low | requirement breach | union has two members; verifier asserts no third label is rendered |
