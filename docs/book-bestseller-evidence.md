# Book suggestions: genre rotation and bestseller evidence

This document is the receipt file behind the word **bestseller** on the One Book
card. It records which titles may carry the label, on whose authority, and for
which period — and, just as importantly, which titles may not.

## The rule

A recommendation may be labelled a bestseller only when the entry carries a
`bestseller` record with:

| field | required | meaning |
| --- | --- | --- |
| `source` | yes | For `list-entry`: the body that published the list (`The New York Times`). For `publisher-stated`: the publisher making the claim. Not a retailer, not a blog, not "widely reported". |
| `kind` | yes | `list-entry` — the title appeared on a named, dated list. `publisher-stated` — the publisher's own page or cover says so. Weaker, and printed as weaker. |
| `list` | required for `list-entry` | Which list, e.g. `Hardcover Nonfiction`. |
| `period` | required for `list-entry` | The period the listing belongs to. Never guessed, never the publication year standing in for a list date. |
| `rank` | optional | Only when the position is known. |
| `url` | optional | A page a reader can check. |

`hasVerifiedBestseller()` enforces this structure, and it is the **single**
definition shared by the publisher's selection gate (`bestsellerEligibleEntries`)
and by `invalidBookFields` in `lib/curiosity/job.ts`. A `list-entry` that cannot
name a list and a period is treated as no evidence at all, so a marketing sentence
cannot be promoted into a ranking by mislabelling it.

Selection requires evidence; **validation does not**. A snapshot published before
this rule, a reused card and the curated fallback are legitimate evidence-free
records, and refusing them would blank a page a reader has already seen. Those
cards simply never print the word.

## Titles that carry evidence

**34 of the 53 entries** carry a usable record — **7 from the authored shelf** and
**27 from the genre shelf**. Thirty are dated `list-entry` records; four are
`publisher-stated`.

The pool has **18 genre values**, including `other` (entries whose genre is not
assigned stay publishable — `genreOf()` reads a missing value as `other`).

| Title | Genre | Source | Kind | List | Rank | Period | Link |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Range: Why Generalists Triumph in a Specialized World | Personal development | The New York Times | list-entry | Hardcover Nonfiction | — | 2019 | — |
| Thinking, Fast and Slow | Psychology | The New York Times | list-entry | Hardcover Nonfiction | — | 2011 | — |
| A Short History of Nearly Everything | Popular non-fiction | Transworld Publishers | publisher-stated | Sunday Times bestseller | — | — | — |
| Sapiens | History | The New York Times | list-entry | Hardcover Nonfiction | — | 2015 | — |
| Guns, Germs, and Steel | History | The New York Times | list-entry | Hardcover Nonfiction | — | 1997 | — |
| Factfulness | Popular non-fiction | The New York Times | list-entry | Hardcover Nonfiction | — | 2018 | — |
| The Immortal Life of Henrietta Lacks | Popular non-fiction | The New York Times | list-entry | Hardcover Nonfiction | — | 2010 | — |
| Project Hail Mary | Science fiction | The New York Times | list-entry | Hardcover Fiction | #1 | 2021 | — |
| The Martian | Science fiction | The New York Times | list-entry | Paperback Fiction | — | 2014 | — |
| Ready Player One | Science fiction | The New York Times | list-entry | Hardcover Fiction | — | 2011 | — |
| Circe | Fantasy | The New York Times | list-entry | Hardcover Fiction | — | 2018 | — |
| The Name of the Wind | Fantasy | The New York Times | list-entry | Hardcover Fiction | — | 2007 | — |
| Where the Crawdads Sing | Mystery | The New York Times | list-entry | Hardcover Fiction | #1 | 2019 | — |
| The Silent Patient | Thriller | The New York Times | list-entry | Hardcover Fiction | — | 2019 | — |
| Gone Girl | Thriller | The New York Times | list-entry | Hardcover Fiction | #1 | 2012 | — |
| The Da Vinci Code | Thriller | The New York Times | list-entry | Hardcover Fiction | #1 | 2003 | — |
| The Girl with the Dragon Tattoo | Crime | The New York Times | list-entry | Paperback Fiction | — | 2008 | — |
| All the Light We Cannot See | Historical fiction | The New York Times | list-entry | Hardcover Fiction | #1 | 2014 | — |
| The Nightingale | Historical fiction | The New York Times | list-entry | Hardcover Fiction | — | 2015 | — |
| A Gentleman in Moscow | Literary fiction | The New York Times | list-entry | Hardcover Fiction | — | 2016 | — |
| Normal People | Literary fiction | The New York Times | list-entry | Paperback Fiction | — | 2019 | — |
| SPQR: A History of Ancient Rome | History | Profile Books | publisher-stated | Sunday Times Top 10 bestseller | — | — | — |
| The Silk Roads: A New History of the World | History | Bloomsbury Publishing | publisher-stated | Sunday Times bestseller | — | — | — |
| Steve Jobs | Biography | The New York Times | list-entry | Hardcover Nonfiction | #1 | 2011 | — |
| Educated | Autobiography | The New York Times | list-entry | Hardcover Nonfiction | #1 | 2018 | — |
| Becoming | Autobiography | The New York Times | list-entry | Hardcover Nonfiction | #1 | 2018 | — |
| Born a Crime | Autobiography | The New York Times | list-entry | Hardcover Nonfiction | — | 2016 | — |
| The Sixth Extinction: An Unnatural History | Science | The New York Times | list-entry | Hardcover Nonfiction | — | 2014 | — |
| Entangled Life | Science | The Bodley Head | publisher-stated | Sunday Times bestseller | — | — | — |
| The Body Keeps the Score | Psychology | The New York Times | list-entry | Paperback Nonfiction | — | 2020 | — |
| Zero to One | Business | The New York Times | list-entry | Hardcover Nonfiction | — | 2014 | — |
| The Lean Startup | Business | The New York Times | list-entry | Hardcover Nonfiction | — | 2011 | — |
| Atomic Habits | Personal development | The New York Times | list-entry | Hardcover Nonfiction | #1 | 2019 | — |
| Braiding Sweetgrass | Popular non-fiction | The New York Times | list-entry | Paperback Nonfiction | — | 2020 | [link](https://www.esf.edu/news/2020/news-kimmerer-best-seller-02052020.php) |

## Corrections made in the release-readiness pass

Three claims did not survive review and were changed rather than left to drift:

1. **The Daily Stoic — claim removed.** It carried a New York Times Hardcover
   Nonfiction listing dated 2017. The book was published in October 2016, and no
   dated list entry could be established: the available evidence is publisher copy
   of the "bestselling" kind, and the companion *Daily Stoic Journal* is described
   by its publisher as an instant **WSJ** bestseller. The book remains in the pool
   with its history; it is simply not eligible for a new card.
2. **The four Sunday Times titles — reclassified from `list-entry` to
   `publisher-stated`.** *A Short History of Nearly Everything*, *SPQR*, *The Silk
   Roads* and *Entangled Life* are described on their covers and publisher pages as
   Sunday Times bestsellers (for *SPQR*, specifically a Top 10 bestseller). That is
   a real claim by a named party and it is **not** an independently recorded list
   entry, so it is now stored as `publisher-stated`, with the publisher named as the
   source and **no period**. The publication year was doing the work of a list date
   before and has been removed.
3. **Braiding Sweetgrass — evidence linked.** Its New York Times Paperback
   Nonfiction appearance in 2020 is documented by a public record (the College of
   Environmental Science and Forestry's own news item), which is now the record's
   `url`.

## Titles without evidence

Every other entry — including eighteen of the authored twenty-five — has no record
and is **not** eligible to be published as a new card. They remain in the pool,
keep whatever history they already produced, and are never described as
bestsellers.

## Regression tests

`npm run curiosity:books` (`scripts/verify-curiosity-books.ts`) asserts, against
the real pool, the real `buildRecommendation()` and the real card:

- every entry's `bestseller`, `genre`, `audience` and `expect` survive
  construction into the published `BookRecommendation` (the defect that made this
  file necessary: the function returned a fixed field list, so the record stopped
  at the pool entry);
- all 34 evidenced cards print the evidence heading, the source, the list, the
  rank and the period, and `publisher-stated` cards print the weaker wording;
- a book without evidence renders no heading, no line and not even the word;
- `hasVerifiedBestseller()` refuses a `list-entry` that cannot name its list and
  period, a one-character source, and an unknown kind — while still accepting a
  `publisher-stated` record, which needs neither;
- a snapshot published before these fields existed still renders, and claims
  nothing it does not carry.

## Honesty notes

- **This file is a recording, not a live re-verification.** The New York Times rows
  were compiled from the lists' own public records; the Sunday Times rows are the
  publishers' claims and are labelled as such. The runs were **not** re-fetched by
  an automated check in the environment where these changes were made (that sandbox
  has no outbound access to those publishers). Before a new edition of the shelf
  ships, each `list-entry` row should be re-checked against the list it names.
- **Only one row has a URL.** The card's "See the list" link appears only when a URL
  is present; the absence of a link is the honest default rather than a broken one.
- **"Bestseller" is a claim about a period, not about quality.** A title that
  appeared on a list in 2011 is described as having appeared on that list in 2011.
- **No popularity signal is evidence.** Open Library edition counts, review counts
  and search interest are deliberately not modelled: none of them is a bestseller
  list, and treating them as a proxy is how the label loses meaning.
- **Publisher-stated is weaker, and says so.** `kind: 'publisher-stated'` renders as
  "*Source* (publisher's own record)" on the card.
