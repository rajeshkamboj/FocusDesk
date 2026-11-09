/**
 * One Book — what may be recommended, and in what order.
 *
 * THE RULE THIS MODULE EXISTS FOR
 * "Bestseller" is a claim about an external record, not a mood. A title may be
 * recommended only when a `BestsellerEvidence` names the body that recognised it.
 * Popularity signals — Goodreads counts, Amazon ratings, catalogue presence,
 * social-media conversation — are deliberately impossible to express here: there
 * is no field for them, so they cannot be promoted into evidence by accident.
 *
 * ROTATION
 * A book still changes every three days (the scheduling code is untouched). The
 * pool it draws from is now genre-spread, and two rules keep the spread visible:
 * the same author does not follow itself, and neither does the same genre, while
 * an alternative exists. Both are applied as a filter over the eligible pool, so
 * the existing date-rotation and repeat ledger do the rest.
 *
 * Nothing here fetches, writes or stores anything.
 */

import type { BookCandidate, BookGenre, BestsellerEvidence } from './types';
import type { CuriosityPoolEntry } from './types';
import { BOOK_GENRE_LABELS } from './types';

/** The primary surname or first author, for the "same author twice" rule. */
export function authorKey(author: string): string {
  const first = author.split(/,| and | & /i)[0]?.trim() ?? author.trim();
  const parts = first.split(/\s+/).filter(Boolean);
  return (parts[parts.length - 1] ?? first).toLowerCase().replace(/[^a-z'-]/g, '');
}

export function genreOf(book: BookCandidate): BookGenre {
  return book.genre ?? 'other';
}

/** At least two non-space characters — enough to name something. */
function hasText(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length >= 2;
}

/** A bare year is not a dated list appearance; `list-year` exists for those. */
const BARE_YEAR = /^\d{4}$/;

/**
 * True when the book carries a usable evidence record.
 *
 * Three kinds, three different tests — the asymmetry is the point:
 *
 *  - `list-entry` must name the list **and** a dated appearance, and that date
 *    must not be a bare year. A year wearing the `list-entry` label is exactly the
 *    conflation this module exists to stop, so it is refused rather than printed
 *    as though the book had been on a specific week's list.
 *  - `list-year` must name the list and carry a plausible integer year, and must
 *    not also carry `period`: if both are present the record is ambiguous about
 *    whether an appearance was ever checked, and ambiguity is refused.
 *  - `publisher-stated` needs neither list nor date, because it claims only that a
 *    named publisher says so — and it must carry neither, since a date would turn
 *    the publisher's sentence into a list appearance nobody verified.
 *
 * Anything else is treated as no evidence at all, which means no bestseller claim
 * on the card and no eligibility for publication.
 */
export function hasVerifiedBestseller(book: BookCandidate): boolean {
  const evidence: BestsellerEvidence | undefined = book.bestseller;
  if (!evidence) return false;
  if (!hasText(evidence.source)) return false;

  switch (evidence.kind) {
    case 'list-entry':
      if (!hasText(evidence.list)) return false;
      if (!hasText(evidence.period)) return false;
      if (BARE_YEAR.test(evidence.period.trim())) return false;
      if (evidence.year !== undefined) return false;
      return true;
    case 'list-year': {
      if (!hasText(evidence.list)) return false;
      const year = evidence.year;
      if (year === undefined || !Number.isInteger(year) || year < 1800 || year > 2200) return false;
      if (evidence.period !== undefined) return false;
      return true;
    }
    case 'publisher-stated':
      if (evidence.period !== undefined || evidence.year !== undefined) return false;
      return true;
    default:
      return false;
  }
}

/** Printed after a year-level record, so the year never reads as a list week. */
export const YEAR_LEVEL_SUFFIX = 'year-level record, no dated list entry verified';

/**
 * The line the card prints under the title. Never invents a rank or a date.
 *
 * A dated entry prints its date. A year-level record prints its year and then says
 * in as many words that no dated entry was verified. A publisher's claim says
 * whose claim it is.
 */
export function bestsellerEvidenceLine(book: BookCandidate): string | null {
  if (!hasVerifiedBestseller(book)) return null;
  const evidence = book.bestseller!;
  if (evidence.kind === 'publisher-stated') {
    const claim = [evidence.source + " (publisher's own record)", evidence.list, evidence.rank].filter(Boolean);
    return claim.join(' · ');
  }
  const parts = [evidence.source, evidence.list, evidence.rank];
  if (evidence.kind === 'list-year') {
    parts.push(`${evidence.year}`, YEAR_LEVEL_SUFFIX);
  } else {
    parts.push(evidence.period);
  }
  return parts.filter(Boolean).join(' · ');
}

export interface BookRotationContext {
  /** Genre of the last published recommendation, when the store has one. */
  genre?: BookGenre;
  /** Author of the last published recommendation. */
  author?: string;
}

/**
 * The entries a date may choose from.
 *
 * An entry without evidence is *not deleted* — it stays in the pool, keeps any
 * historical record it already produced, and is simply ineligible to be published
 * again. That is the difference between retiring a candidate and destroying data.
 */
export function bestsellerEligibleEntries<T extends BookCandidate>(
  entries: readonly CuriosityPoolEntry<T>[],
  context: BookRotationContext = {},
): CuriosityPoolEntry<T>[] {
  const eligible = entries.filter((entry) => {
    if (entry.status === 'retired' || entry.status === 'draft') return false;
    return hasVerifiedBestseller(entry.item);
  });
  if (eligible.length === 0) return [];

  const recentAuthor = context.author ? authorKey(context.author) : '';
  const withoutSameAuthor = recentAuthor
    ? eligible.filter((entry) => authorKey(entry.item.author) !== recentAuthor)
    : eligible;
  const authorPool = withoutSameAuthor.length ? withoutSameAuthor : eligible;

  const recentGenre = context.genre;
  const withoutSameGenre = recentGenre
    ? authorPool.filter((entry) => genreOf(entry.item) !== recentGenre)
    : authorPool;
  return withoutSameGenre.length ? withoutSameGenre : authorPool;
}

/** How many entries exist per genre, for the operator panel and the docs. */
export function genreSpread(entries: readonly CuriosityPoolEntry<BookCandidate>[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    if (!hasVerifiedBestseller(entry.item)) continue;
    const label = BOOK_GENRE_LABELS[genreOf(entry.item)];
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return counts;
}
