# CURIOSITY EXPANSION — AUDIT

**Status: audit only at the time of writing — since approved and implemented; see the addendum at the end.**
**Base:** `main` @ `93f8eae` (PR #37 merged). Working branch: `arena/f0e7d042-focusdesk` (branched from that commit; `main` untouched).
**Scope asked for:** Speak Better, Mythology — Character of the Day, Chemistry of the Day, Physics of the Day.

> Naming note: the app spells the tab **Curiosity** (`/curiosity`, nav label `Curiosity`; `/curious` permanently redirects). This doc uses the app's spelling.

---

## 0. Surface area (exact)

| File | Lines | Role |
| --- | --- | --- |
| `app/curiosity/page.tsx` | 15 | Server entry. `dynamic = 'force-dynamic'`; `getDailyBriefing(new Date().toISOString().slice(0,10))` → `<CuriosityScreen briefing={…} />`. |
| `app/api/curiosity/route.ts` | 9 | `GET /api/curiosity?date=YYYY-MM-DD`, strict date validation, returns the same briefing JSON. Used only by the client at date rollover. |
| `components/curiosity/curiosity-screen.tsx` | 498 | `'use client'`. Every card renderer + all page layout. |
| `components/curiosity/daily-quote.tsx` | 55 | "A thought for today" panel. Re-exported by `components/today/daily-quote.tsx`, so **Today** uses it too. |
| `lib/curiosity/types.ts` | 59 | `CuriosityBriefing` + item types. |
| `lib/curiosity/content.ts` | 399 | All author-written editorial arrays + `dailyEditorial(date)`. |
| `lib/curiosity/server.ts` | 131 | Live source fetchers, merge, `unstable_cache`. |
| `scripts/verify-daily-content.tsx` | — | 366-day determinism + required-field assertions over `dailyEditorial` and `getDailyQuote`. |

Indirect: `components/layout/nav.ts` (tab), `next.config.ts` (`/curious` redirect), `components/ui/card.tsx` (`Card`, `EmptyState`), `components/layout/page-header.tsx` (`SectionTitle`), `components/ui/icons.tsx`.

---

## 1. Data model (current)

`CuriosityBriefing` is a **named-field object, not a card list**:

```ts
{ date, aiWorld: CuriosityNewsItem[], developerRadar: DeveloperDiscovery[],
  book, oneThing, learning,            // anonymous structural shapes
  history: HistoryEvent | null, literature: LiteratureItem, sharpener: BrainSharpener }
```

Named item interfaces exist only for the richer types (`HistoryEvent`, `LiteratureItem`, `BrainSharpener`, plus `CuriosityNewsItem`, `DeveloperDiscovery`). `book` / `oneThing` / `learning` are inline shapes. There is **no** `id`, `category`, `kind`, `order` or `renderer` field anywhere.

## 2. How cards are generated, stored, fetched

Three sources, no CMS, **nothing persisted** (no Supabase table, no localStorage, no settings row):

1. **Static editorial** — `lib/curiosity/content.ts`. Selection is pure arithmetic:
   `day = floor(Date.parse(date+'T00:00:00Z')/86_400_000)` → `safeDay = abs(day)` → `arr[safeDay % arr.length]`.
   Cycle lengths: books 3, oneThings 3, lessons 3, literature 8, sharpeners 6 → **the whole editorial mix repeats every 24 days**. History is different: `historyEvents` holds 9 hardcoded "Month Day" entries (one of which — the Gutenberg Bible — is deliberately filtered out of selection at `content.ts:395`, so it is currently unreachable).
2. **Live network** (`lib/curiosity/server.ts`, 6s timeout, all failures degrade to empty): AI World = 6 first-party RSS feeds (≤10 items); Developer Radar = GitHub search API (≤3); History fallback = Wikipedia *on this day / selected* when no curated entry matches the date.
3. **Cache** — `getDailyBriefing` wraps `buildBriefing(date)` in `unstable_cache` under key **`curiosity:v7`** + date, `revalidate: 3600`, tag `curiosity:v7:${date}`. Bumping that literal is how the cache is invalidated on content/shape changes.

The quote is separate: `lib/quotes.ts`, computed in the browser via `getDailyQuote(useLocalDate(...))`.

**Important invariant:** `content.ts` is imported only by `server.ts` and the verify script, so the editorial corpus never ships to the client. `curiosity-screen.tsx` imports **types only**.

## 3. Ordering

No ordering metadata at all. Order is hardcoded JSX order inside one `div.space-y-7` (`curiosity-screen.tsx:328`), with three fixed two-column pairs:

1. Thought for Today — full width
2. Today in History — full width
3. AI World — full width
4. Developer Radar ‖ One Thing Worth Knowing — `grid gap-7 lg:grid-cols-2` (`:369`)
5. Literature ‖ One Book — same (`:419`)
6. Brain Sharpener ‖ Learn Something — same (`:459`)

## 4. Responsive layout / grid

- Page: `mx-auto max-w-5xl px-5 py-8 sm:px-8 lg:px-10 lg:py-12` (`:314`).
- Column: single column, `space-y-7`; pairing only from `lg:` (`lg:grid-cols-2`). No `md:`/`xl:` usage on this page.
- Card: `<Card>` = `rounded-2xl border border-line bg-surface shadow-card`; `SectionCard` adds `flex h-full min-w-0 flex-col p-4 sm:p-6`. Columns are equal width; the `h-full` + `flex-col` pairing is what makes the two cards in a row match heights.
- `min-w-0` is already applied to flex children (good for long words/URLs); no `overflow-x-auto` anywhere on this page, and no table/definition-list patterns yet.
- The headless mobile audit (`scripts/verify-mobile-layout.tsx`) covers Today, Tasks, Inbox, Review, Calendar, Settings, Projects, Goals, Ideas — **Curiosity is not in its screen list**, so this page has no automated width guard today.

## 5. Does the architecture support categories/sections?

Only visually. Sections exist as JSX comments (`/* 1. Today in History */` …) plus the `label` prop on `SectionCard`, which renders through `SectionTitle` (`<h2>`, 11px uppercase). There is no section/category model, no registry, no switch on a `kind` field. Card titles are `<h2>`; item titles inside cards are `<h3>`.

That means: adding *content* is cheap, adding *grouping* is new-but-small, adding *pages* would be a redesign (explicitly out of scope).

## 6. Smallest architecture for the four new types

**Keep the briefing object; add fields. Keep static TS content; keep day-index selection. Add lightweight labels. Do not add pages, routes, tabs or a CMS layer.**

1. `lib/curiosity/types.ts` — add four item shapes + a `CuriosityCategory` union:
   - `SpeakBetterLesson`: `id, situation, words: { word, englishMeaning, hindiMeaning, nuance, examples: string[], confusableWith? }[3–5], dialogue: { speaker, line }[], challenge: string, tags?`.
   - `MythCharacter`: `id, name, tradition, pantheon, family: { relation, name, note? }[], relationships: string[], sources: string[]` (scriptures/traditions), `timeline: { when, event }[]`, `story`, `lesserKnown: string[]`, `variants?: { tradition, difference }[]`, and evidence-tagged claims: `{ layer: 'textual' | 'traditional' | 'analysis' | 'inference', text }[]`.
   - `ChemistryConcept` / `PhysicsConcept`: `id, topic, simple, deeper?, equation?, everyday, surprising, question` (chemistry) and `id, topic, simple, deeper?, everyday, surprising, question` (physics). One shared `ScienceConcept`-shaped renderer, two types so copy stays honest about equations.
   - Extend `CuriosityBriefing` with `speakBetter`, `mythology`, `chemistry`, `physics` (non-null, since they are static).
2. `lib/curiosity/content.ts` — add four arrays next to the existing ones and four lines in `dailyEditorial`. **Add a per-category offset** (`(safeDay + OFFSET) % arr.length`) so the new cycles don't move in lockstep with the 3/3/3/8/6 mix. If the file crosses ~600–800 lines, split to `lib/curiosity/content/{speak-better,mythology,science}.ts` and keep `content.ts` as the aggregator — this changes no import site.
3. `lib/curiosity/server.ts` — `dailyEditorial` already spreads into the briefing, so only the `unstable_cache` key literal changes (`curiosity:v7` → `v8`), otherwise an hour of stale briefings would render without the new fields.
4. `components/curiosity/curiosity-screen.tsx` — three new renderers (`SpeakBetterSection`, `MythologySection`, `ScienceConceptSection` reused twice), one tiny `SectionGroup` label (styled `SectionTitle` + hairline `border-t`, **not** a Card), and five placement lines in the existing `space-y-7` column. If the file passes ~700 lines, extract renderers to `components/curiosity/sections/*.tsx`; pure refactor, no behaviour change.
5. Optional: 2–3 icons in `components/ui/icons.tsx` (speech / myth / flask-atom marks). Reusing `IconCuriosity`/`IconLightbulb` costs nothing and is the smaller change.

**Placement (minimal disruption to existing cards):**

```
A thought for today            (unchanged, full width)
— DIVIDER: Daily highlights —  (label only)
Today in History               (unchanged, full width)
AI World                       (unchanged, full width)
Developer Radar ‖ One Thing    (unchanged pairing)
— DIVIDER: Speak better —
Speak Better                   (full width — comparison rows + dialogue + challenge)
— DIVIDER: Mythology —
Mythology · Character of the Day (full width; body = 1 col on mobile,
                                  lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]
                                  with family tree + timeline in the right column,
                                  long detail behind a disclosure toggle)
— DIVIDER: Science —
Chemistry ‖ Physics            (new pair, existing lg:grid-cols-2 pattern, h-full)
— DIVIDER: Reading, radar & practice — (or no divider; these are the existing cards)
Literature ‖ One Book          (unchanged pairing)
Brain Sharpener ‖ Learn Someth(unchanged pairing)
```

This is a **hybrid**: new *card types* rendered into the *existing* grid, grouped by *section labels* — not four new pages, not four cards appended at the bottom, and not four heavy containers.

## 7. Database / schema changes

**None.** Curiosity is stateless and derived from `date`; it never touches `AppData`, the repositories, RLS, migrations, `supabase/schema.sql`, or any table. `lib/store/*` and `supabase/migrations/*` are untouched by this feature. Voice-first interaction, if it later records practice attempts or streaks, is the only thing that would ever need storage — explicitly out of scope for this expansion.

## 8. Files likely to change

| File | Change |
| --- | --- |
| `lib/curiosity/types.ts` | 4 new item shapes + `CuriosityBriefing` fields |
| `lib/curiosity/content.ts` | 4 new static arrays + `dailyEditorial` additions (+ offsets); optional split into `content/*` |
| `lib/curiosity/server.ts` | cache key `v7` → `v8` (one literal) |
| `components/curiosity/curiosity-screen.tsx` | 3 renderers, group label component, placement |
| `components/ui/icons.tsx` | optional icons |
| `scripts/verify-daily-content.tsx` | assertions for the new fields (see §10) |
| `app/curiosity/page.tsx`, `app/api/curiosity/route.ts`, `nav.ts`, `next.config.ts`, `lib/store/*`, `supabase/*` | **unchanged** |

## 9. Risks

1. **Client bundle leak (highest).** If any new content array is imported into `curiosity-screen.tsx` (a client component), the entire editorial corpus ships to the browser. Keep every content import server-side and pass values through `briefing`.
2. **Stale cache.** Forgetting the `curiosity:v7` → `v8` bump means new sections vanish for up to an hour and the page can look broken during preview review.
3. **Determinism.** `scripts/verify-daily-content.tsx` asserts `dailyEditorial(date)` is reproducible and differs from the next day. Any `Math.random()`, `Date.now()` or map-iteration-order selection breaks the "same briefing all day" promise and that test.
4. **Mobile width.** The three density risks are the Speak Better word rows, Hindi (Devanagari) text, and a family tree. Devanagari in `font-mono` (used by Brain Sharpener for given-info) can fall back to tofu on some systems — use the default sans for Hindi, `break-words`, and prefer definition-style rows over `<table>`; wrap any intrinsically wide block in `overflow-x-auto` locally, never on the page.
5. **Mobile height.** Mythology is the one card that can become very long. Keep the daily surface finite and scannable: story + timeline visible, "lesser-known facts", tradition variants and analysis behind the existing disclosure pattern (`Button variant="secondary" size="sm"` + `aria-expanded`/`aria-controls`, as in `BrainSharpenerSection`).
6. **Half-empty pairs.** Chemistry ‖ Physics must both always render (they will, being static) — otherwise an odd `lg:grid-cols-2` child stretches and `h-full` equalisation looks wrong. Existing optional cards already guard with conditionals; keep that discipline.
7. **Heading semantics.** `SectionTitle` is `<h2>`, item titles `<h3>`. New section group labels should be visually-styled `<p>`/`<div>` dividers, not headings, to avoid renumbering the document outline.
8. **Existing cards must not move or restyle.** Keep the current `SectionCard` API, `space-y-7`, `gap-7`, `h-full`, the `Today in History` unavailable-fallback branch, the AI-World/Radar empty states and their "up to 10"/"up to 3" labels, and the `key={date-sharpener.id}` remount that resets the solution toggle.
9. **Content honesty for Mythology.** The four evidence layers must be structurally enforced (a `layer` field on each claim), not a prose convention, or speculation will drift into the scriptural voice. This is a *type* decision, not a UI one.
10. **No automated guard for this page.** `verify-mobile-layout.tsx` does not render Curiosity. Add it to that script's screen list (it is imported by name and rendered with a briefing fixture) as the cheapest regression net — otherwise mobile correctness is manual.
11. **Preview environment.** `app/curiosity/page.tsx` is `force-dynamic` and fetches external feeds; in preview those may be blocked, degrading AI World / Developer Radar / Wikipedia history to their existing empty states. All new content is static, so the new sections will render regardless — which makes the preview a fair test of this feature.
12. **Philosophy drift.** The expansion must not become a feed: one Speak Better lesson, one myth character, one chemistry concept, one physics concept per day, in the same finite briefing. No "load more", no archives in this change.

## 10. How to test (when implementation is approved)

- Extend `scripts/verify-daily-content.tsx`: for 366 consecutive dates assert each new field exists with its required sub-parts (3–5 Speak Better words each carrying English + Hindi + nuance; myth timeline non-empty and every claim carrying one of the four layers; chemistry/physics with all six fields), assert determinism across repeated calls, and assert variety (the new categories do not repeat only once every 24 days by choice — measure actual distinct counts, e.g. ≥ N distinct myth characters per year).
- `npm run build` + `npx tsx scripts/verify-mobile-layout.tsx` after adding Curiosity to that script.
- Manual preview: 320/360/390/430px and desktop, both themes; check Devanagari rendering, tree/timeline overflow, and that the four existing card groups are pixel-unchanged.

## 11. Recommendation

**Hybrid, as in §6:** new *card types* + new *data fields*, placed into the *existing* single-column grid with lightweight *section labels*; full width for Speak Better and Mythology, a paired two-column row for Chemistry ‖ Physics, and the existing cards left exactly where they are. No new pages, no tabs, no CMS, no schema change, no redesign of the page shell or its philosophy.

## 12. Daily content without a CMS

- Author content as typed static modules under `lib/curiosity/content/`, aggregated by `content.ts`; selected by `(safeDay + perCategoryOffset) % length`. Same mechanism as today, so the daily briefing stays deterministic, offline-safe, reviewable in a PR, and free of infrastructure.
- **Scale by adding entries, not by adding on-screen items.** Seed counts worth aiming for so a reader does not see a repeat before ~2 months: Speak Better ~30 lessons, Mythology ~30 characters (mix of Indian/subcontinental and world traditions, one character per day), Chemistry ~30, Physics ~30. Repeats after that are acceptable in a *daily briefing* and are how the current 24-day mix already behaves.
- Optional-but-cheap field-level guardrails: `satisfies` types + the verify script for cross-field invariants (word count range, exactly-one-layer-per-claim, non-empty timeline). A JSON file is only worth it if non-developers must edit content later; a database/CMS is not justified by any requirement in this brief.
- Keep the future voice path open at zero cost now: give each Speak Better lesson a stable `id` and store its `challenge` as plain text, so a later `speechSynthesis` read-aloud or `SpeechRecognition` answer check can target it without restructuring the content.

---

**Nothing has been implemented. Awaiting approval on:** (a) the hybrid structure in §6/§11, (b) the evidence-layer typing for Mythology in §9.9, (c) seed counts in §12, (d) whether to add Curiosity to `verify-mobile-layout.tsx`.

---

## Addendum — what was actually built (post-approval)

The audit was approved with three answers: seed **12 entries per category** (not ~30), keep Mythology **balanced** between subcontinental and world traditions, and deliver as **two reviewable commits** rather than two PRs (this session is pinned to one branch, and GitHub allows one PR per branch).

Built on `arena/f0e7d042-focusdesk`, `main` untouched at `93f8eae`:

| Commit | Contents |
| --- | --- |
| `616ed2b` | Speak Better + Mythology (12 lessons, 12 characters) |
| `0b66f12` | Chemistry + Physics (12 concepts each) |
| `325ed96` | copy pass on the section hints |
| — | **Biology of the Day**, added afterwards at the user's request on the same architecture |

Decisions taken during implementation that differ from, or refine, the plan above:

1. **`ScienceConcept` is the shared shape** — `{ id, topic, simple, deeper?, equation?, connection, surprising, question }`. One `connection` field, labelled “Everyday connection” on chemistry and biology and “Real-world connection” on physics; chemistry, physics and biology are three aliases of the same type, kept as separate briefing fields so each subject's content file and card label stay honest. The first draft used `everyday`/`realWorld`, which made the shared type impossible — the honest fix was one field with a per-card label, not a union.
2. **Biology joined the Science group as a third card**, so that row became `lg:grid-cols-3` (≈296px per card at the page's 5xl max width) instead of a pair. Chemistry and Physics render through the identical component with identical labels — the only change to them is the track width. Nothing in Speak Better, Mythology, the pre-existing nine cards, the API route, the nav or the store was touched.
3. **Four independent day offsets** (`+5`, `+2`, `+7`, `+11`, `+3`) keep the rotations from advancing in lockstep, and the `unstable_cache` key was bumped for every shape change — `v7 → v8 → v9 → v10`. Forgetting it is the one failure mode that looks like a bug in the browser and not in the code.
4. **The evidence-layer labels are structural**, as recommended in §9.9: `layer` is required on every mythology claim, the legend is printed in the card, and the verify script refuses a character that cites no text or labels no claim as analysis/inference.
5. **Verification grew two guards**: `verify-daily-content.tsx` now renders the real screen and asserts all nine original cards still appear in their original order with the new sections between them, and `verify-mobile-layout.tsx` renders Curiosity (empty and populated) at 320/360/390/430 and 1024/1280/1536.
