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

/**
 * True when the book carries a usable evidence record.
 *
 * `publisher-stated` is accepted because it is a real, checkable claim by the
 * publisher — but the card prints it as weaker than an independent list, and this
 * function is not allowed to upgrade it.
 */
export function hasVerifiedBestseller(book: BookCandidate): boolean {
  const evidence: BestsellerEvidence | undefined = book.bestseller;
  if (!evidence) return false;
  if (!evidence.source || evidence.source.trim().length < 2) return false;
  if (evidence.kind !== 'list-entry' && evidence.kind !== 'publisher-stated') return false;
  /*
    A list entry is only a list entry if it can name the list and the period it
    belongs to. Without both, the record is an unverified assertion wearing the
    stronger label — exactly the failure this field exists to prevent — so it is
    treated as no evidence at all. `publisher-stated` deliberately needs neither:
    it claims only that a named publisher says so, and the card prints it that way.
  */
  if (evidence.kind === 'list-entry') {
    if (!evidence.list || evidence.list.trim().length < 2) return false;
    if (!evidence.period || evidence.period.trim().length < 2) return false;
  }
  return true;
}

/** The line the card prints under the title. Never invents a rank or a period. */
export function bestsellerEvidenceLine(book: BookCandidate): string | null {
  if (!hasVerifiedBestseller(book)) return null;
  const evidence = book.bestseller!;
  const parts = [
    evidence.kind === 'publisher-stated' ? `${evidence.source} (publisher's own record)` : evidence.source,
    evidence.list,
    evidence.rank,
    evidence.period,
  ].filter(Boolean);
  return parts.join(' · ');
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
