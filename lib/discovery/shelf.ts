/**
 * Selecting what Literature and Science may show *today*.
 *
 * This is the last stage of the shared pipeline: candidates → eligibility →
 * a small, stable, deduplicated set for one date. It is deliberately pure — no
 * network, no storage, no clock of its own — so the same inputs always produce the
 * same shelf and the harness can assert it.
 *
 * Rules, in order:
 *
 *  1. **Eligibility is not negotiable.** A record must be `validationStatus: 'valid'`
 *     and `eligible: true`. In practice that means its rights were verified, which
 *     is the licensing review's single invariant.
 *  2. **No repeats within the window.** A work shown in the last N days is skipped
 *     while alternatives exist — the same anti-repetition idea Curiosity already
 *     uses, applied per collection.
 *  3. **One work, one shelf.** The same concept arriving from Wikipedia and Wikidata
 *     (same `entityId`), or the same book from Gutenberg and Standard Ebooks (same
 *     normalized title + author) collapses to one entry, so a reader never sees the
 *     same thing twice on one screen.
 *  4. **Diversity across kinds.** For Science, a research abstract, a textbook and a
 *     mission image are different *kinds* of reading; the shelf prefers one of each
 *     before doubling up.
 *  5. **Fallback is data, not an error.** When nothing is eligible, the caller keeps
 *     whatever it published before — the existing authored content is never
 *     replaced by an empty state.
 */

import type { KnowledgeCandidate } from '../curiosity/types';
import { normalizeTitle } from '../curiosity/dedupe';
import { collectionOfCandidate, type KnowledgeCollection } from './collection';

export interface CollectionShelfEntry {
  id: string;
  title: string;
  description: string;
  url: string;
  sourceName: string;
  attribution: string;
  license?: string;
  kind: string;
  /** `payload.caveat` for research records — always shown, never optional. */
  caveat?: string;
  rights: string;
  subjects: string[];
  author?: string;
  language?: string;
  publicationDetails?: string;
  discoveredAt?: string;
  quality?: string;
}

export interface ShelfOptions {
  collection: Extract<KnowledgeCollection, 'literature' | 'science'>;
  date: string;
  candidates: readonly KnowledgeCandidate[];
  /** Ids shown recently, most recent first. */
  recentIds?: readonly string[];
  /** Window, in days, during which a repeated work is avoided. */
  windowDays?: number;
  limit?: number;
}

/** The reader-facing projection of a stored record. */
export function toShelfEntry(candidate: KnowledgeCandidate): CollectionShelfEntry | null {
  const payload = candidate.payload ?? {};
  const url = candidate.canonicalUrl;
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const kind = typeof payload.kind === 'string' ? payload.kind : 'record';
  return {
    id: candidate.id,
    title: candidate.title,
    description: candidate.description,
    url,
    sourceName: candidate.sourceName,
    attribution: candidate.attribution ?? `Source: ${candidate.sourceName}.`,
    license: candidate.license,
    kind,
    caveat: typeof payload.caveat === 'string' ? payload.caveat : undefined,
    rights: typeof payload.rights === 'string' ? payload.rights : 'unknown',
    subjects: Array.isArray(candidate.subjects) ? candidate.subjects.slice(0, 6) : [],
    author: typeof payload.author === 'string' ? payload.author : undefined,
    language: typeof payload.language === 'string' ? payload.language : undefined,
    publicationDetails: typeof payload.publicationDetails === 'string' ? payload.publicationDetails : undefined,
    discoveredAt: candidate.discoveredAt,
    quality: typeof payload.quality === 'string' ? payload.quality : undefined,
  };
}

/** A cross-source identity for one *work*, as opposed to one record. */
export function workIdentity(candidate: KnowledgeCandidate): string {
  // A stable entity id (a QID, an ebook id, a page id) is authoritative.
  if (candidate.entityId) {
    const tail = candidate.entityId.split(':').pop() ?? candidate.entityId;
    const entity = tail.trim().toLowerCase();
    if (entity) return `entity:${entity}`;
  }
  const payload = candidate.payload ?? {};
  const isbn = typeof payload.isbn === 'string' ? payload.isbn.replace(/[^0-9Xx]/g, '') : '';
  if (isbn) return `isbn:${isbn}`;
  const title = normalizeTitle(candidate.title.split(' — ')[0]);
  const author = normalizeTitle(typeof payload.author === 'string' ? payload.author : '');
  return `title:${title}|${author}`;
}

export function selectShelf(options: ShelfOptions): CollectionShelfEntry[] {
  const limit = Math.max(1, Math.min(options.limit ?? (options.collection === 'literature' ? 3 : 4), 8));
  const recent = new Set(options.recentIds ?? []);

  const pool = options.candidates
    .filter((candidate) => collectionOfCandidate(candidate) === options.collection)
    .filter((candidate) => candidate.eligible && candidate.validationStatus === 'valid')
    .filter((candidate) => Boolean(candidate.canonicalUrl));

  // Prefer unseen works, then fall back to everything, rather than showing nothing.
  const fresh = pool.filter((candidate) => !recent.has(candidate.id));
  const ordered = [...fresh, ...pool.filter((candidate) => recent.has(candidate.id))];

  const byWork = new Set<string>();
  const byKind = new Set<string>();
  const picked: KnowledgeCandidate[] = [];
  const deferred: KnowledgeCandidate[] = [];

  // Pass 1: one work, one kind, first come.
  for (const candidate of ordered) {
    const work = workIdentity(candidate);
    if (byWork.has(work)) continue;
    const kind = typeof candidate.payload?.kind === 'string' ? candidate.payload.kind : 'record';
    if (byKind.has(kind)) {
      deferred.push(candidate);
      continue;
    }
    byWork.add(work);
    byKind.add(kind);
    picked.push(candidate);
    if (picked.length >= limit) break;
  }

  // Pass 2: fill the remaining places with other kinds.
  for (const candidate of deferred) {
    if (picked.length >= limit) break;
    const work = workIdentity(candidate);
    if (byWork.has(work)) continue;
    byWork.add(work);
    picked.push(candidate);
  }

  return picked
    .map(toShelfEntry)
    .filter((entry): entry is CollectionShelfEntry => entry !== null);
}

/**
 * A deterministic, evenly spread ordering key.
 *
 * The shelf must be stable for a given date — a reader who refreshes at 12:05 and
 * again at 23:50 sees the same three books — but must also rotate across days.
 * Hashing the date together with the work identity gives both, using the same
 * hash the reservoir already uses for its dedupe fingerprints.
 */
export function shelfScore(date: string, workId: string): number {
  let hash = 2_166_136_261;
  const input = `${date}|${workId}`;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash % 1_000_003;
}

/** Order a shelf deterministically for one date. */
export function orderShelfForDate(entries: readonly CollectionShelfEntry[], date: string): CollectionShelfEntry[] {
  return [...entries].sort((a, b) => {
    const delta = shelfScore(date, a.id) - shelfScore(date, b.id);
    return delta !== 0 ? delta : a.id.localeCompare(b.id);
  });
}
