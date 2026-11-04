/**
 * Server side of the Literature and Science shelves.
 *
 * Reads the reservoir once per page render (a plain Supabase/file read, never an
 * outbound call to a third-party source), selects today's shelf and — crucially —
 * **degrades to an empty list** rather than to an error. The Curiosity page then
 * keeps its existing authored cards, so a reader with no network, an unmigrated
 * database or an empty reservoir sees exactly what they see today.
 *
 * `unstable_cache`-style memoisation is deliberately not used: the reservoir is
 * already read through Next's fetch cache where it can be, and a per-render read of
 * one table is cheaper than the invalidation problem a cache would add.
 */

import { getCandidateStore, type CandidateStore } from '../curiosity/reservoir';
import type { KnowledgeCandidate } from '../curiosity/types';
import type { KnowledgeCollection } from './collection';
import {
  orderShelfForDate,
  selectShelf,
  type CollectionShelfEntry,
} from './shelf';

export type { CollectionShelfEntry };

export interface CollectionShelf {
  collection: 'literature';
  date: string;
  entries: CollectionShelfEntry[];
  /** How many eligible records exist, per source — shown as a quiet provenance line. */
  sourceCounts: Record<string, number>;
  /** Populated when the reservoir could not be read; the UI then shows the fallback. */
  note?: string;
}

function summariseSources(candidates: readonly KnowledgeCandidate[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const candidate of candidates) {
    counts[candidate.sourceName] = (counts[candidate.sourceName] ?? 0) + 1;
  }
  return counts;
}

export async function getCollectionShelf(
  collection: 'literature',
  date: string,
  options: { store?: CandidateStore; limit?: number; recentIds?: readonly string[] } = {},
): Promise<CollectionShelf> {
  const empty: CollectionShelf = { collection, date, entries: [], sourceCounts: {} };
  let candidates: KnowledgeCandidate[];
  try {
    const store = options.store ?? getCandidateStore();
    candidates = await store.readAll();
  } catch {
    return { ...empty, note: 'The discovery library could not be read, so today’s curated picks are shown instead.' };
  }
  if (!Array.isArray(candidates) || candidates.length === 0) return empty;

  const eligible = candidates.filter((candidate) => candidate.eligible && candidate.validationStatus === 'valid');
  const shelf = selectShelf({
    collection,
    date,
    candidates: eligible,
    recentIds: options.recentIds,
    limit: options.limit,
  });
  const ofCollection = eligible.filter((candidate) => candidate.payload?.collection === collection);
  return {
    collection,
    date,
    // Sorting after selection keeps the *set* stable for a date and the *order*
    // spread across works, so the same shelf never appears in the same sequence
    // two days running.
    entries: orderShelfForDate(shelf, date),
    sourceCounts: summariseSources(ofCollection),
  };
}

/**
 * The shelves for one date. Shaped as an object rather than a bare array so a
 * second collection can be added without changing every caller.
 */
export async function getDiscoveryShelves(
  date: string,
  options: { store?: CandidateStore } = {},
): Promise<{ literature: CollectionShelf }> {
  return { literature: await getCollectionShelf('literature', date, options) };
}

/** Exported for the docs and the harness: where a collection's records live. */
export function collectionTable(collection: KnowledgeCollection): string {
  return collection === 'literature'
    ? 'curiosity_candidates (category book, literature)'
    : 'curiosity_candidates';
}
