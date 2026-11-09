# Book suggestions: genre rotation and bestseller evidence

This document is the receipt file behind the word **bestseller** on the One Book
card. It records which titles may carry the label, on whose authority, and how
strong that authority actually is — and, just as importantly, which titles may
not.

## The rule

A recommendation may be labelled a bestseller only when the entry carries a
`bestseller` record with a named source. Three kinds are allowed, and they are not
interchangeable:

| `kind` | what it claims | what the card prints | how many |
| --- | --- | --- | --- |
| `list-entry` | A **dated** appearance on a named list — the list, the date of that particular list, and the position when it is known. | `The New York Times · Paperback Trade Fiction · #2 · 15 August 2009` | 7 |
| `list-year` | The title is recorded on a named list **in a given year**, but no dated appearance is held. | `The New York Times · Hardcover Nonfiction · 2011 · year-level record, no dated list entry verified` | 14 |
| `publisher-stated` | The only support is the publisher's own copy ("#1 New York Times bestseller", "Sunday Times Top 10 bestseller"). Real as a claim by a named party, weaker than an independent list, and attached to no date. | `Avery (publisher's own record) · #1 New York Times bestseller` | 13 |

Field rules, enforced by `hasVerifiedBestseller()`:

| field | required | meaning |
| --- | --- | --- |
| `source` | always | For `list-entry` / `list-year`: the body that published the list (`The New York Times`). For `publisher-stated`: the publisher making the claim. Not a retailer, not a blog, not "widely reported". |
| `kind` | always | One of the three above. |
| `list` | `list-entry`, `list-year` | Which list, e.g. `Hardcover Nonfiction`. |
| `period` | `list-entry` only | The **date of the list** the title appeared on, e.g. `13 February 2010`. Never a bare year: a four-digit year here is refused outright rather than printed as a weekly appearance. |
| `year` | `list-year` only | The year of the recorded appearance. Refused on the other two kinds, and refused together with `period`, so a record cannot be ambiguous about whether a dated entry was ever checked. |
| `rank` | optional | Only when the position is known. |
| `url` | optional | A page a reader can check. |

`hasVerifiedBestseller()` is the **single** definition shared by the publisher's
selection gate (`bestsellerEligibleEntries`), by `genreSpread()` and by
`invalidBookFields` in `lib/curiosity/job.ts`. A claim that fails it is treated as
no evidence at all: no line on the card, no eligibility for publication. Selection
requires evidence; **validation does not** — a snapshot published before this rule,
a reused card and the curated fallback are legitimate evidence-free records, and
refusing them would blank a page a reader has already seen.

## What the pool actually holds

**53 entries**: 25 authored, 28 on the genre shelf. **18 genre values**, including
`other` (an entry without a genre stays publishable — `genreOf()` reads a missing
value as `other`).

**34 carry evidence** — 7 `list-entry`, 14 `list-year`, 13 `publisher-stated`.
**19 carry none** and cannot be chosen for a new card.

## Verification status

### Verified: dated list entries (7)

These name the list, the date of that list and, where known, the position. The date
is the list's date, not the book's publication date.

| Title | List | Rank | List date | Basis |
| --- | --- | --- | --- | --- |
| Range: Why Generalists Triumph in a Specialized World | Combined Print & E-Book Nonfiction | — | 16 June 2019 | Open Library `nyt:` subject record for the edition |
| The Immortal Life of Henrietta Lacks | Hardcover Nonfiction | #5 | 13 February 2010 | The New York Times list of that date |
| The Da Vinci Code | Hardcover Fiction | #1 | 6 April 2003 | The New York Times list of that date |
| The Girl with the Dragon Tattoo | Paperback Trade Fiction | #2 | 15 August 2009 | The New York Times list archive for 15 August 2009 |
| A Gentleman in Moscow | Hardcover Fiction | — | 25 September 2016 | Open Library `nyt:` subject record for the edition |
| Normal People | Combined Print & E-Book Fiction | — | 5 May 2019 | Open Library `nyt:` subject record for the edition |
| Braiding Sweetgrass | Paperback Nonfiction | #14 | 31 January 2020 | [SUNY ESF news record](https://www.esf.edu/news/2020/news-kimmerer-best-seller-02052020.php) (the record's `url`) |

Only one of these carries a `url`; the rest are recorded without a link, which is
the honest default rather than a made-up one.

### Partially verified: year-level records (14)

The status and the board are corroborated by publisher or contemporaneous
reporting, but **no dated entry and no ranking week is held**. These are stored as
`list-year`, print their year, and print the words *year-level record, no dated
list entry verified*. A bare year is never presented as a weekly appearance.

| Title | List | Rank | Year |
| --- | --- | --- | --- |
| Thinking, Fast and Slow | Hardcover Nonfiction | — | 2011 |
| Factfulness | Hardcover Nonfiction | — | 2018 |
| The Martian | Paperback Fiction | #1 | 2014 |
| Ready Player One | Hardcover Fiction | — | 2011 |
| Where the Crawdads Sing | Hardcover Fiction | #1 | 2019 |
| The Silent Patient | Hardcover Fiction | #1 | 2019 |
| Gone Girl | Hardcover Fiction | #1 | 2012 |
| All the Light We Cannot See | Hardcover Fiction | #1 | 2014 |
| The Nightingale | Hardcover Fiction | #1 | 2015 |
| Steve Jobs | Hardcover Nonfiction | #1 | 2011 |
| Educated | Hardcover Nonfiction | #1 | 2018 |
| Becoming | Hardcover Nonfiction | #1 | 2018 |
| Born a Crime | Hardcover Nonfiction | — | 2016 |
| The Lean Startup | Hardcover Advice & Misc. | #2 | 2011 |

The `#1` and `#2` marks in this table are the strongest claim available for those
titles; they are **not** attached to a date, and the card says so. Where even the
position was uncertain, the rank is left out.

### Downgraded to the publisher's claim (13)

Nine New York Times claims and four Sunday Times claims exist only in publisher
copy. They are stored as `publisher-stated`, name the publisher as the source,
carry **no list date and no year**, and print as "*Source* (publisher's own
record)".

| Title | Publisher | Claim on the record |
| --- | --- | --- |
| Sapiens | Harper | New York Times bestseller |
| Guns, Germs, and Steel | W. W. Norton | New York Times bestseller |
| Project Hail Mary | Ballantine Books | #1 New York Times bestseller |
| Circe | Little, Brown | #1 New York Times bestseller |
| The Name of the Wind | DAW Books | New York Times bestseller |
| The Sixth Extinction: An Unnatural History | Henry Holt | New York Times bestseller |
| The Body Keeps the Score | Penguin | #1 New York Times bestseller (the claim attaches to the October 2020 paperback) |
| Zero to One | Crown Business | #1 New York Times bestseller |
| Atomic Habits | Avery | #1 New York Times bestseller |
| A Short History of Nearly Everything | Transworld Publishers | Sunday Times bestseller |
| SPQR: A History of Ancient Rome | Profile Books | Sunday Times Top 10 bestseller |
| The Silk Roads: A New History of the World | Bloomsbury Publishing | Sunday Times bestseller |
| Entangled Life | The Bodley Head | Sunday Times bestseller |

The UK trade lists are not publicly queryable the way the New York Times lists are,
so for the Sunday Times rows the cover or the publisher's page *is* the record. It
is real, it is attributed, and it is not an independent list entry.

## Corrected in this pass

Three records did not survive source review and were corrected rather than left to
drift. Each is now a dated `list-entry`, and the old value is recorded here so the
change can be audited.

| Title | Was | Is | Why |
| --- | --- | --- | --- |
| The Girl with the Dragon Tattoo | `Paperback Fiction`, 2008 | `Paperback Trade Fiction`, **15 August 2009**, #2 | The US paperback (Vintage) appeared in 2009; 2008 is the Knopf hardcover year and carries no list citation. The New York Times Paperback Trade Fiction list of 15 August 2009 places the book at No. 2, one place behind the list leader. |
| Normal People | `Paperback Fiction`, 2019 | `Combined Print & E-Book Fiction`, **5 May 2019** | The 2019 US edition (Hogarth) was a hardcover; the paperback followed in 2020. A "Paperback Fiction 2019" listing is therefore unsupportable, while the Open Library `nyt:` subject record for the edition names the combined print and e-book board. |
| The Lean Startup | `Hardcover Nonfiction`, 2011 | `Hardcover Advice & Misc.`, 2011, #2 | The New York Times ran advice as its own board at the time, and the book debuted at No. 2 on it. 2011 is supported, so it stays — as a year-level record, since no dated entry is held. |

## Downgraded in this pass

Ten records were reviewed because they carried only a year while wearing the
`list-entry` label. Each one was checked against the strongest source available;
none produced a dated entry, so none keeps one. Their outcomes:

| Title | Outcome | Record now |
| --- | --- | --- |
| Range: Why Generalists Triumph in a Specialized World | **Upgraded** — a dated edition record exists | `list-entry`, 16 June 2019 |
| Thinking, Fast and Slow | Status corroborated, no dated entry | `list-year`, 2011 |
| The Martian | Status corroborated, no dated entry | `list-year`, 2014, #1 |
| Ready Player One | Status corroborated, no dated entry | `list-year`, 2011 |
| The Nightingale | Status corroborated, no dated entry | `list-year`, 2015, #1 |
| Steve Jobs | Status corroborated, no dated entry | `list-year`, 2011, #1 |
| Sapiens | Only the publisher's word for the board | `publisher-stated`, Harper |
| Guns, Germs, and Steel | Only the publisher's word for the board | `publisher-stated`, W. W. Norton |
| The Sixth Extinction | Publisher says "a New York Times bestseller"; no board, no rank, no date | `publisher-stated`, Henry Holt |
| Zero to One | Only the publisher's word for the board | `publisher-stated`, Crown Business |

The nine remaining year-only records were converted to `list-year` in the same
pass, for the same reason: Factfulness, Where the Crawdads Sing, The Silent
Patient, Gone Girl, All the Light We Cannot See, Educated, Becoming, Born a Crime
and The Lean Startup.

## Previously removed, and still without a claim

- **The Daily Stoic — claim removed.** It carried a New York Times Hardcover
  Nonfiction listing dated 2017. The book was published in October 2016, and no
  dated list entry could be established: the available evidence is publisher copy
  of the "bestselling" kind, and the companion *Daily Stoic Journal* is described
  by its publisher as an instant **WSJ** bestseller. The book stays in the pool
  with its history; it is simply not eligible for a new card.
- **The 19 entries without evidence** — including eighteen of the authored
  twenty-five — carry no record, are never described as bestsellers, and keep
  whatever history they already produced. They were re-read in this pass as well:
  several are widely *called* bestsellers in conversation (Four Thousand Weeks,
  The Art of Learning), but none has a checkable record here, so none carries the
  label.

## The record, as stored

| Title | Genre | Source | Kind | List | Rank | Period or year | Link |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Range: Why Generalists Triumph in a Specialized World | Personal development | The New York Times | list-entry | Combined Print & E-Book Nonfiction | — | 16 June 2019 | — |
| The Immortal Life of Henrietta Lacks | Popular non-fiction | The New York Times | list-entry | Hardcover Nonfiction | #5 | 13 February 2010 | — |
| The Da Vinci Code | Thriller | The New York Times | list-entry | Hardcover Fiction | #1 | 6 April 2003 | — |
| The Girl with the Dragon Tattoo | Crime | The New York Times | list-entry | Paperback Trade Fiction | #2 | 15 August 2009 | — |
| A Gentleman in Moscow | Literary fiction | The New York Times | list-entry | Hardcover Fiction | — | 25 September 2016 | — |
| Normal People | Literary fiction | The New York Times | list-entry | Combined Print & E-Book Fiction | — | 5 May 2019 | — |
| Braiding Sweetgrass | Popular non-fiction | The New York Times | list-entry | Paperback Nonfiction | #14 | 31 January 2020 | [link](https://www.esf.edu/news/2020/news-kimmerer-best-seller-02052020.php) |
| Thinking, Fast and Slow | Psychology | The New York Times | list-year | Hardcover Nonfiction | — | 2011 | — |
| Factfulness | Popular non-fiction | The New York Times | list-year | Hardcover Nonfiction | — | 2018 | — |
| The Martian | Science fiction | The New York Times | list-year | Paperback Fiction | #1 | 2014 | — |
| Ready Player One | Science fiction | The New York Times | list-year | Hardcover Fiction | — | 2011 | — |
| Where the Crawdads Sing | Mystery | The New York Times | list-year | Hardcover Fiction | #1 | 2019 | — |
| The Silent Patient | Thriller | The New York Times | list-year | Hardcover Fiction | #1 | 2019 | — |
| Gone Girl | Thriller | The New York Times | list-year | Hardcover Fiction | #1 | 2012 | — |
| All the Light We Cannot See | Historical fiction | The New York Times | list-year | Hardcover Fiction | #1 | 2014 | — |
| The Nightingale | Historical fiction | The New York Times | list-year | Hardcover Fiction | #1 | 2015 | — |
| Steve Jobs | Biography | The New York Times | list-year | Hardcover Nonfiction | #1 | 2011 | — |
| Educated | Autobiography | The New York Times | list-year | Hardcover Nonfiction | #1 | 2018 | — |
| Becoming | Autobiography | The New York Times | list-year | Hardcover Nonfiction | #1 | 2018 | — |
| Born a Crime | Autobiography | The New York Times | list-year | Hardcover Nonfiction | — | 2016 | — |
| The Lean Startup | Business | The New York Times | list-year | Hardcover Advice & Misc. | #2 | 2011 | — |
| A Short History of Nearly Everything | Popular non-fiction | Transworld Publishers | publisher-stated | Sunday Times bestseller | — | — | — |
| Sapiens | History | Harper | publisher-stated | New York Times bestseller | — | — | — |
| Guns, Germs, and Steel | History | W. W. Norton | publisher-stated | New York Times bestseller | — | — | — |
| Project Hail Mary | Science fiction | Ballantine Books | publisher-stated | #1 New York Times bestseller | — | — | — |
| Circe | Fantasy | Little, Brown | publisher-stated | #1 New York Times bestseller | — | — | — |
| The Name of the Wind | Fantasy | DAW Books | publisher-stated | New York Times bestseller | — | — | — |
| SPQR: A History of Ancient Rome | History | Profile Books | publisher-stated | Sunday Times Top 10 bestseller | — | — | — |
| The Silk Roads: A New History of the World | History | Bloomsbury Publishing | publisher-stated | Sunday Times bestseller | — | — | — |
| The Sixth Extinction: An Unnatural History | Science | Henry Holt | publisher-stated | New York Times bestseller | — | — | — |
| Entangled Life | Science | The Bodley Head | publisher-stated | Sunday Times bestseller | — | — | — |
| The Body Keeps the Score | Psychology | Penguin | publisher-stated | #1 New York Times bestseller | — | — | — |
| Zero to One | Business | Crown Business | publisher-stated | #1 New York Times bestseller | — | — | — |
| Atomic Habits | Personal development | Avery | publisher-stated | #1 New York Times bestseller | — | — | — |

The counts at the top of this document are asserted by the regression suite, so the
table and the corpus cannot drift apart silently.

## Regression tests

`npm run curiosity:books` (`scripts/verify-curiosity-books.ts`, 65 checks) asserts,
against the real pool, the real `buildRecommendation()` and the real card:

- every entry's `bestseller`, `genre`, `audience` and `expect` survive construction
  into the published `BookRecommendation` (the defect that made this file
  necessary: the function returned a fixed field list, so the record stopped at the
  pool entry);
- all 34 evidenced cards print the evidence heading, the source, the list, and the
  date or year they carry; `list-year` cards print the year-level caveat and no
  date; `publisher-stated` cards print the weaker wording and no date;
- the pool holds exactly 7 dated, 14 year-level and 13 publisher-stated records, and
  every evidenced record is exactly one of the three kinds;
- the three corrected records carry their corrected classification (Dragon Tattoo:
  Paperback Trade Fiction, 15 August 2009, #2; Normal People: Combined Print &
  E-Book Fiction, 5 May 2019; Lean Startup: Hardcover Advice & Misc., 2011, #2,
  year-level);
- a book without evidence renders no heading, no line and not even the word;
- `hasVerifiedBestseller()` refuses a `list-entry` without a list, without a date,
  or with a bare year standing in for one; refuses a `list-year` without a year,
  with an impossible year, with a period as well, or without a list; refuses a
  `publisher-stated` record carrying a year or a period; refuses a one-character
  source and an unknown kind — while still accepting a complete `list-year` and a
  plain `publisher-stated` record;
- a refused record prints nothing and renders no evidence block, so insufficient
  evidence never produces a claim;
- a snapshot published before these fields existed still renders, and claims
  nothing it does not carry.

## Honesty notes

- **This file is a recording, not a live re-verification.** The New York Times rows
  were compiled from the lists' own public records; the publisher-stated rows are
  the publishers' claims and are labelled as such. The runs were **not** re-fetched
  by an automated check in the environment where these changes were made (the
  sandbox has no outbound access to those publishers). Before a new edition of the
  shelf ships, each `list-entry` row should be re-checked against the list it names.
- **One row has a URL.** The card's link appears only when a URL is present; the
  absence of a link is the honest default rather than a broken one.
- **A year is not a week.** `list-year` exists so that a title whose listing year is
  known, but whose dated entry is not, can still be recommended without the card
  implying a specific week the list never carried in this repository.
- **"Bestseller" is a claim about a period, not about quality.** A title that
  appeared on a list in 2011 is described as having appeared on that list in 2011.
- **No popularity signal is evidence.** Open Library edition counts, review counts
  and search interest are deliberately not modelled: none of them is a bestseller
  list, and treating them as a proxy is how the label loses meaning.
