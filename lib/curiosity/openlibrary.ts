import { BOOK_COVER_PLACEHOLDER } from './constants';
import type { BookCandidate, BookRecommendation, CuriosityPoolEntry } from './types';
import { isHttpUrl } from './sources';

/**
 * Open Library: the catalogue side of One Book.
 *
 * The pool (`content/books.ts`) says which book is worth reading and why. This
 * module asks the catalogue what it actually knows about that book — a cover, a
 * first publication year, how many editions, whether a scan exists to read.
 *
 * Four rules, taken from Open Library’s own usage guidance
 * (https://openlibrary.org/developers/api):
 *
 *  1. **One request per recommendation**, three days apart. The publish job asks
 *     for exactly the record it is about to show; nothing here crawls, and there
 *     is no per-page-view call.
 *  2. **Identify the app.** A `User-Agent` naming FocusDesk, plus a contact
 *     address from `OPENLIBRARY_CONTACT_EMAIL` when the operator sets one —
 *     Open Library triples its rate limit for identified traffic and needs a
 *     way to reach you before it blocks you.
 *  3. **Cache the answer.** The resolved record is stored with the published
 *     snapshot (`state.ts`) and reused for the whole three-day interval, which is
 *     the "cache responses whenever possible" instruction applied literally.
 *  4. **Covers by cover id only.** `covers.openlibrary.org/b/id/{id}` is the
 *     un-throttled path and the one their docs point public pages at; the
 *     ISBN-based paths are rate-limited and deliberately unused. The image itself
 *     is hot-linked from their host rather than copied into this repository, so
 *     their attribution and takedown handling stay in one place.
 *
 * And one rule of our own: a field the catalogue did not return is left off the
 * card. Nothing here synthesises a year, a publisher, a rating or an
 * availability claim, and a lookup that matches no record produces the curated
 * card plus a note saying so.
 */

export const OPEN_LIBRARY_SEARCH_URL = 'https://openlibrary.org/search.json';
export const OPEN_LIBRARY_RECORD_BASE = 'https://openlibrary.org';
export const INTERNET_ARCHIVE_ITEM_BASE = 'https://archive.org/details';
export const SOURCE_TIMEOUT_MS = 8_000;

/** `-M` is the size their covers documentation suggests for a display slot. */
export const COVER_SIZE = 'M' as const;

export const OPEN_LIBRARY_FIELDS = [
  'key',
  'title',
  'first_publish_year',
  'edition_count',
  'publisher',
  'cover_i',
  'ia',
  'subject',
].join(',');

/**
 * The app identity sent to Open Library. `OPENLIBRARY_CONTACT_EMAIL` is optional
 * and read only on the server — it is a contact address for *their* rate-limit
 * warnings, never a credential, and it is not exposed to the browser.
 */
export function openLibraryUserAgent(): string {
  const contact = (process.env.OPENLIBRARY_CONTACT_EMAIL ?? process.env.NEXT_PUBLIC_APP_CONTACT_EMAIL ?? '').trim();
  return contact
    ? `FocusDesk/0.1 (Curiosity daily book; ${contact})`
    : 'FocusDesk/0.1 (Curiosity daily book; https://github.com/rajeshkamboj/FocusDesk)';
}

export function coverUrlFor(coverId: number): string {
  return `https://covers.openlibrary.org/b/id/${coverId}-${COVER_SIZE}.jpg`;
}

/** The placeholder shown when there is no cover, or when the cover fails to load. */
export const COVER_PLACEHOLDER = BOOK_COVER_PLACEHOLDER;

export function openLibraryRecordUrl(key: string): string {
  return key.startsWith('http') ? key : `${OPEN_LIBRARY_RECORD_BASE}${key.startsWith('/') ? '' : '/'}${key}`;
}

type OpenLibraryDoc = {
  key?: string;
  title?: string;
  first_publish_year?: number;
  edition_count?: number;
  publisher?: string[];
  cover_i?: number;
  ia?: string[];
  subject?: string[];
};

export type BookLookupResult =
  /** Open Library answered and the work record was matched. */
  | { status: 'resolved'; book: BookRecommendation; raw: OpenLibraryDoc }
  /** Open Library answered; nothing in the catalogue matched this candidate. */
  | { status: 'unresolved'; book: BookRecommendation; note: string }
  /** Open Library could not be reached or refused. Keep the last published book. */
  | { status: 'failed'; error: string };

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Does a catalogue title describe the same book we recommended?
 *
 * Open Library records are works, not editions: the preferred title may be the
 * first edition’s (“The Psychology of Everyday Things” for the book everyone now
 * buys as “The Design of Everyday Things”), and later editions append subtitles.
 * So a match is allowed to be equal, to contain the curated title, or to be
 * contained by it — and nothing else. Substring matching in one direction only
 * would let a “Study Guide for …” record stand in for the book itself.
 */
export function titlesMatch(curated: string, found: string | undefined): boolean {
  if (!found) return false;
  const a = normalize(curated);
  const b = normalize(found);
  if (!a || !b) return false;
  const head = (value: string) => value.split(' ')[0];
  return a === b || a.startsWith(b) || b.startsWith(a) || head(a) === head(b);
}

/** Deterministic pick among matching records: the one with the most editions. */
export function pickWorkRecord(docs: OpenLibraryDoc[], candidate: BookCandidate): OpenLibraryDoc | null {
  const matching = docs.filter((doc) => titlesMatch(candidate.title, doc.title) || titlesMatch(stripSubtitle(candidate.title), doc.title));
  if (!matching.length) return null;
  return [...matching].sort((a, b) => (b.edition_count ?? 0) - (a.edition_count ?? 0) || String(a.key).localeCompare(String(b.key)))[0] ?? null;
}

const stripSubtitle = (title: string) => title.split(':')[0].trim();

/** Two publishers, alphabetically, so the same record always renders the same line. */
function publishersOf(list: string[] | undefined): { publisher?: string; note?: string } {
  if (!list?.length) return {};
  const sorted = [...new Set(list.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const shown = sorted.slice(0, 2).join(' · ');
  return {
    publisher: shown,
    note: sorted.length > 2 ? `Open Library lists ${sorted.length} publishers for this work.` : undefined,
  };
}

/** A scan exists in the Internet Archive; whether it is readable or borrowable is their holding library's decision. */
function previewOf(ids: string[] | undefined): { url?: string; note?: string } {
  if (!ids?.length) return {};
  const id = [...ids].sort()[0];
  if (!id) return {};
  const url = `${INTERNET_ARCHIVE_ITEM_BASE}/${id}`;
  return isHttpUrl(url) ? { url, note: 'Open Library lists a scanned copy; reading or borrowing depends on the holding library.' } : {};
}

export function buildRecommendation(entry: CuriosityPoolEntry<BookCandidate>, doc: OpenLibraryDoc | null): BookRecommendation {
  const candidate = entry.item;
  const publishers = publishersOf(doc?.publisher);
  const preview = previewOf(doc?.ia);
  const key = doc?.key;
  return {
    id: entry.id,
    // The curated title is what we chose to recommend, so it is what the heading
    // says. The catalogue title can be a first-edition variant.
    title: candidate.title,
    author: candidate.author,
    synopsis: candidate.synopsis,
    why: candidate.why,
    url: key ? openLibraryRecordUrl(key) : (candidate.url ?? openLibraryRecordUrl('/search?q=' + encodeURIComponent(candidate.title))),
    source: key ? 'openlibrary' : 'curated',
    sourceName: key ? 'Open Library' : 'FocusDesk editorial',
    openLibraryKey: key,
    coverAvailable: typeof doc?.cover_i === 'number' ? true : key ? false : undefined,
    coverUrl: typeof doc?.cover_i === 'number' && doc.cover_i > 0 ? coverUrlFor(doc.cover_i) : undefined,
    firstPublishYear: typeof doc?.first_publish_year === 'number' && doc.first_publish_year > 0 ? doc.first_publish_year : undefined,
    publisher: publishers.publisher,
    publishersNote: publishers.note,
    editionCount: typeof doc?.edition_count === 'number' && doc.edition_count > 0 ? doc.edition_count : undefined,
    previewUrl: preview.url,
    previewNote: preview.note,
    subjects: candidate.subjects,
  };
}

export function searchUrl(candidate: BookCandidate): string {
  // `author` is used as a filter only: Open Library's search index does not
  // reliably return an author name in `fields`, so the curated author stays the
  // card's author and the filter simply narrows which work we accept.
  const query = `title:"${candidate.title}" author:"${candidate.author.split(',')[0].trim()}"`;
  return `${OPEN_LIBRARY_SEARCH_URL}?${new URLSearchParams({ q: query, fields: OPEN_LIBRARY_FIELDS, limit: '5' }).toString()}`;
}

/**
 * Resolve one curated candidate into a publishable card.
 *
 * Returns `failed` only when the catalogue could not be consulted at all — that
 * is the case in which the caller keeps the previously published book, so a
 * temporary Open Library outage can never blank the card.
 */
export async function lookupBook(
  entry: CuriosityPoolEntry<BookCandidate>,
  options: { fetchImpl?: typeof fetch; now?: () => Date } = {},
): Promise<BookLookupResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = searchUrl(entry.item);
  try {
    const response = await fetchImpl(url, {
      headers: { accept: 'application/json', 'user-agent': openLibraryUserAgent() },
      signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
    });
    if (!response.ok) return { status: 'failed', error: `Open Library search returned ${response.status}` };
    const data = (await response.json()) as { docs?: OpenLibraryDoc[] };
    const docs = Array.isArray(data.docs) ? data.docs : [];
    const doc = pickWorkRecord(docs, entry.item);
    const fetchedAt = (options.now?.() ?? new Date()).toISOString();
    if (!doc?.key) {
      return {
        status: 'unresolved',
        note: 'No Open Library work record matched this title; the card shows only what FocusDesk wrote.',
        book: { ...buildRecommendation(entry, null), fetchedAt },
      };
    }
    return { status: 'resolved', raw: doc, book: { ...buildRecommendation(entry, doc), fetchedAt } };
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
  }
}
