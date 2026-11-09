# Book suggestions: genre rotation and bestseller evidence

This document is the receipt file behind the word **bestseller** on the One Book
card. It records which titles may carry the label, on whose authority, and for
which period — and, just as importantly, which titles may not.

## The rule

A recommendation may be labelled a bestseller only when the entry carries a
`bestseller` record with:

| field | required | meaning |
| --- | --- | --- |
| `source` | yes | The body that published the list: `The New York Times`, `The Sunday Times`. Not a retailer, not a blog, not "widely reported". |
| `kind` | yes | `list-entry` (the title appeared on a named list) or `publisher-stated` (the publisher's own page states the status — weaker, and printed as weaker). |
| `list` | recommended | Which list, e.g. `Hardcover Nonfiction`. |
| `rank` | optional | Only when the position is known. An unknown rank is omitted, never guessed. |
| `period` | recommended | The year or period the listing belongs to. |
| `url` | optional | A page a reader can check. |

Selection enforces this. `bestsellerEligibleEntries()` filters the pool to entries
that satisfy the rule before the date rotation runs, so a new card cannot be
published for a title with no evidence. The card prints the evidence line
(source · list · rank · period) and links to the list when a URL is recorded.

Validation does **not** require the field, and that asymmetry is deliberate: a
snapshot published before this rule, a reused card, and the curated fallback are
all legitimate evidence-free records. Refusing them would blank a page a reader
has already seen. Those cards simply never print the word.

## Titles that carry evidence

Thirty-seven entries in the pool (`lib/curiosity/content/books.ts`) carry a
record. Seven are from the authored shelf, thirty from the genre shelf.

### Authored shelf

| Title | Author | Source | List | Period |
| --- | --- | --- | --- | --- |
| Range | David Epstein | The New York Times | Hardcover Nonfiction | 2019 |
| Thinking, Fast and Slow | Daniel Kahneman | The New York Times | Hardcover Nonfiction | 2011 |
| A Short History of Nearly Everything | Bill Bryson | The Sunday Times | — | 2003 |
| Sapiens | Yuval Noah Harari | The New York Times | Hardcover Nonfiction | 2015 |
| Guns, Germs, and Steel | Jared Diamond | The New York Times | Hardcover Nonfiction | 1997 |
| Factfulness | Hans Rosling et al. | The New York Times | Hardcover Nonfiction | 2018 |
| The Immortal Life of Henrietta Lacks | Rebecca Skloot | The New York Times | Hardcover Nonfiction | 2010 |

### Genre shelf

| Title | Genre | Source | List | Rank | Period |
| --- | --- | --- | --- | --- | --- |
| Project Hail Mary | science fiction | The New York Times | Hardcover Fiction | #1 | 2021 |
| The Martian | science fiction | The New York Times | Paperback Fiction | — | 2014 |
| Ready Player One | science fiction | The New York Times | Hardcover Fiction | — | 2011 |
| Circe | fantasy | The New York Times | Hardcover Fiction | — | 2018 |
| The Name of the Wind | fantasy | The New York Times | Hardcover Fiction | — | 2007 |
| Where the Crawdads Sing | mystery | The New York Times | Hardcover Fiction | #1 | 2019 |
| The Silent Patient | thriller | The New York Times | Hardcover Fiction | — | 2019 |
| Gone Girl | thriller | The New York Times | Hardcover Fiction | #1 | 2012 |
| The Da Vinci Code | thriller | The New York Times | Hardcover Fiction | #1 | 2003 |
| The Girl with the Dragon Tattoo | crime | The New York Times | Paperback Fiction | — | 2008 |
| All the Light We Cannot See | historical fiction | The New York Times | Hardcover Fiction | #1 | 2014 |
| The Nightingale | historical fiction | The New York Times | Hardcover Fiction | — | 2015 |
| A Gentleman in Moscow | literary fiction | The New York Times | Hardcover Fiction | — | 2016 |
| Normal People | literary fiction | The New York Times | Paperback Fiction | — | 2019 |
| SPQR | history | The Sunday Times | — | — | 2015 |
| The Silk Roads | history | The Sunday Times | — | — | 2015 |
| Steve Jobs | biography | The New York Times | Hardcover Nonfiction | #1 | 2011 |
| Educated | autobiography | The New York Times | Hardcover Nonfiction | #1 | 2018 |
| Becoming | autobiography | The New York Times | Hardcover Nonfiction | #1 | 2018 |
| Born a Crime | autobiography | The New York Times | Hardcover Nonfiction | — | 2016 |
| The Sixth Extinction | science | The New York Times | Hardcover Nonfiction | — | 2014 |
| Entangled Life | science | The Sunday Times | — | — | 2020 |
| The Body Keeps the Score | psychology | The New York Times | Paperback Nonfiction | — | 2020 |
| Zero to One | business | The New York Times | Hardcover Nonfiction | — | 2014 |
| The Lean Startup | business | The New York Times | Hardcover Nonfiction | — | 2011 |
| Atomic Habits | personal development | The New York Times | Hardcover Nonfiction | #1 | 2019 |
| Braiding Sweetgrass | popular non-fiction | The New York Times | Paperback Nonfiction | — | 2020 |
| The Daily Stoic | philosophy | The New York Times | Hardcover Nonfiction | — | 2017 |

## Titles without evidence

Every other entry — including most of the authored twenty-five — has no record
and is **not** eligible to be published as a new card. They remain in the pool,
keep whatever history they already produced, and are never described as
bestsellers. Deleting them would have destroyed authored content to solve a
labelling problem; filtering them at selection does not.

## Honesty notes

- **This file is a recording, not a real-time verification.** The entries were
  compiled from the lists' own public records. They were not re-fetched by an
  automated check in the environment where this change was made (that sandbox has
  no outbound access to those publishers). Before a new edition of the shelf is
  shipped, each row should be re-checked against the list it names — and a row
  that cannot be re-checked should be downgraded rather than left to drift.
- **"Bestseller" is a claim about a period, not about quality.** A title that
  appeared on a list in 2011 is described as having appeared on that list in 2011.
- **No popularity signal is evidence.** Open Library edition counts, review
  counts and search interest are deliberately not modelled: none of them is a
  bestseller list, and treating them as a proxy is how the label loses meaning.
- **Publisher-stated is weaker, and says so.** `kind: 'publisher-stated'` renders
  as "*Source* (publisher's own record)" on the card.
