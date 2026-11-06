# Speak Better — B2, C1 and C2

The **Speak Better** practice library adds three difficulty bands to the original
A2–B1 corpus: **B2** (Upper Intermediate), **C1** (Advanced) and **C2**
(Proficiency).

It has **one home**: the Speak Better card on the Curiosity page. The card publishes
the day's lesson; the practice library — every lesson, every level, search, and the
word-tracking controls — opens from that card behind an "Open the practice library"
button, loaded on demand. There is no Speak Better item in the navigation.

`/speak-better` still resolves, but only as a redirect to
`/curiosity#speak-better`: the standalone page and its sidebar entry were retired
once the lessons became part of the Curiosity daily experience. Nothing was moved out
of storage and no progress key changed.

## What did not change

The **ids and wording of the original twelve A2–B1 lessons are unchanged**, and
those lessons remain in the curriculum as the library's on-ramp and as the
publisher's final fallback. Progress keys (`lessonId:word`) therefore keep
resolving for every record a reader already has.

What the daily card publishes has since changed: it now selects from B2 and C1, with
a C2 lesson one day in five (`lib/curiosity/speak-better-daily.ts`). See
[docs/knowledge-workflow-modernization.md](knowledge-workflow-modernization.md) §5
for that selection and for the reader-level refinement.

Progress is stored under keys derived from the lesson id (`lessonId:word`). Because
the A2–B1 ids are untouched, adding three bands cannot invalidate any existing
record — and since this is the first version of the ledger, nothing is reset.

## Structure

| File | Purpose |
| --- | --- |
| `lib/curiosity/types.ts` | `SpeakBetterLevel`, the four tracking states, and the optional depth fields on a word |
| `lib/curiosity/content/speak-better.ts` | the original A2–B1 corpus (unchanged, marked `level: 'A2-B1'`) |
| `lib/curiosity/content/speak-better-b2.ts` | 8 B2 lessons |
| `lib/curiosity/content/speak-better-c1.ts` | 6 C1 lessons |
| `lib/curiosity/content/speak-better-c2.ts` | 5 C2 lessons |
| `lib/curiosity/speak-better.ts` | curriculum composition, level counts, word ids, search and filtering |
| `lib/curiosity/speak-better-progress.ts` | the pure progress ledger: normalize, mark seen, set state, summarise |
| `lib/curiosity/speak-better-store.ts` | the browser layer: storage plus `useSyncExternalStore` subscription |
| `components/curiosity/speak-better-library.tsx` | the practice library, mounted inside the Curiosity card |
| `components/curiosity/sections/speak-better.tsx` | the daily card and the disclosure that opens the library |
| `next.config.ts` | the `/speak-better` → `/curiosity#speak-better` redirect (307) |

Content is **one typed data file per band**, not a growing component and not a
hardcoded array inside the UI. A twenty-word entry and a five-word one use the
same type; every depth field is optional, so an A2–B1 lesson never renders an
empty heading.

## What an entry carries

- Word or expression, English definition, Hindi meaning (Devanagari, `lang="hi"`)
- Nuance — what the word implies that its near-synonym does not
- Two contextual examples, drawn from a real situation
- **B2 and above additionally:** pronunciation guidance (with IPA and a spoken
  approximation), common collocations, the *common mistake* learners actually
  make at that level, the near-synonym it is confused with *and the line between
  them*, and a register note for natural conversational use
- A short dialogue and one practical speaking challenge per lesson

The corpus is written for adults using English at work: meetings, clients,
audits, contracts, appraisals, negotiations. `scripts/verify-speak-better.tsx`
asserts that at least twenty lessons are grounded in professional situations.

## Tracking

Four states per word: **Seen**, **Known**, **Saved**, **Review later**.

- *Seen* is recorded when a lesson is opened — not on page load, which would claim
  the reader had met thirty-two lessons by arriving.
- Seeing a word again never moves `firstSeenAt` and never overwrites a state the
  reader chose.
- Known / Saved / Review later are toggles. Turning one off returns the word to
  *Seen*: the reader has still met it, and silently forgetting that would be a
  reset of their history by the back door.

## Search and filtering

Difficulty (All / A2–B1 / B2 / C1 / C2) and a free-text query compose, and the
query runs over everything a reader can read: the word, the English meaning, the
**Hindi gloss** (so typing `सिखाना` finds the teach/learn lesson), the nuance, the
pronunciation, collocations, the common mistake, examples and the dialogue. A
fourth filter shows only lessons containing a word in one tracking state.

## Storage

`localStorage` under the single versioned key `pace.speakBetter.progress.v1`.

**There is no migration and no new table.** A `speak_better_progress` table would
need a user-scoped RLS policy, a grant review (the anon-grant audit is still open)
and a backfill question; none of that should ride along with a content feature.
The reader is total instead:

- a document with an unknown *state* drops that one entry, never the ledger;
- an entry missing `lessonId`, `word` or `level` is repaired from its own id, and
  the band is inferred from the lesson-id prefix (`b2-`, `c1-`, `c2-`, otherwise
  A2–B1);
- a corrupt or non-JSON payload loads as an empty ledger and is replaced by the
  next write;
- a browser that refuses storage (private mode, quota) reports it, and the screen
  says the progress is session-only rather than implying a durable save.

## Hindi rendering

Every Hindi gloss carries `lang="hi"` so the right font and voice are selected,
and the text wraps (`break-words`) so a long gloss cannot overflow a narrow card.
`scripts/verify-speak-better.tsx` asserts that every gloss contains Devanagari
(`\u0900–\u097F`) rather than a transliteration.

## Verifying

```bash
npm run verify:speak-better     # 22 checks
npm run curiosity:content       # the existing daily-content harness, unchanged
```

The Speak Better harness covers content completeness per level, non-repetition,
the untouched A2–B1 rotation, word identity, difficulty and Hindi search, state
filtering, the four tracking states, persistence and its failure modes, migration
compatibility (unknown state, corrupt payload, lean entry, pre-versioned
document), the unchanged A2–B1 progress keys, `markLessonSeen` idempotence, Hindi
markup, and the absence of any per-visit fetching. No browser, database or network
is needed.
