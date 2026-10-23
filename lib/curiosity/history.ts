import {
  fingerprint,
  normalizeSubjects,
  normalizeTitle,
  normalizeUrl,
  signatureText,
  subjectKey,
  urlHost,
} from './dedupe';
import { policyFor, type CuriosityCardKey } from './catalog';
import type { SeenRecord } from './state';

/**
 * One publication, as the anti-repetition layer reads it.
 *
 * The record is deliberately richer than the `curiosity_seen` row that stores it
 * (category, content id, day). Everything else — the title, the canonical URL,
 * the text fingerprint, the shingle signature, the subject keys, the source —
 * is derived once at publication time and kept beside the id, because a
 * cooldown that can only compare ids cannot see the same article arrive twice
 * from two feeds, or the same subject under a new title.
 *
 * Backwards compatibility is the reason every field except `card`, `id` and `on`
 * is optional: a ledger written before this change is still a valid ledger, and
 * `fromSeenRecord` fills what it can without inventing a signature.
 */
export interface PublicationRecord {
  card: CuriosityCardKey;
  id: string;
  /** Publication day in Asia/Kolkata, `YYYY-MM-DD`. */
  on: string;
  title?: string;
  url?: string;
  /** Stable hash of the normalized title + body. */
  fingerprint?: string;
  /** Compact shingle signature, for near-duplicate detection. */
  signature?: string;
  subjects?: string[];
  source?: string;
  /** Content version of the payload at publication time. */
  version?: string;
  /** Source's own publication date, when the item is news. */
  publishedAt?: string;
}

/** The persisted form. Optional fields are omitted rather than written as nulls. */
export function toSeenRecord(record: PublicationRecord): SeenRecord {
  return {
    category: record.card,
    id: record.id,
    on: record.on,
    ...(record.title ? { title: record.title.slice(0, 400) } : {}),
    ...(record.url ? { url: record.url.slice(0, 800) } : {}),
    ...(record.fingerprint ? { fingerprint: record.fingerprint } : {}),
    ...(record.signature ? { signature: record.signature } : {}),
    ...(record.subjects?.length ? { subjects: normalizeSubjects(record.subjects).slice(0, 24) } : {}),
    ...(record.source ? { source: record.source.slice(0, 200) } : {}),
    ...(record.version ? { version: record.version.slice(0, 64) } : {}),
  };
}

/**
 * A ledger row as a publication record, filling in the identity it can.
 *
 * Rows written before the enrichment existed carry no signature; the title and
 * URL are re-derived from nothing, so those rows remain id-comparable and
 * nothing more. That is honest: a cooldown cannot retroactively know what text
 * it published. New rows are complete.
 */
export function fromSeenRecord(record: SeenRecord): PublicationRecord {
  const card = record.category as CuriosityCardKey;
  return {
    card,
    id: record.id,
    on: record.on,
    ...(record.title ? { title: record.title } : {}),
    ...(record.url ? { url: record.url } : {}),
    ...(record.fingerprint ? { fingerprint: record.fingerprint } : {}),
    ...(record.signature ? { signature: record.signature } : {}),
    ...(record.subjects?.length ? { subjects: record.subjects } : {}),
    ...(record.source ? { source: record.source } : {}),
    ...(record.version ? { version: record.version } : {}),
  };
}

/** All publication records in the state document, oldest first. */
export function publicationRecords(seen: readonly SeenRecord[]): PublicationRecord[] {
  return seen.map(fromSeenRecord);
}

/**
 * How old the ledger may get before records are dropped.
 *
 * Three years, not one: the brief requires history to survive the cooldown, and
 * a reader asking "did this appear before?" deserves a true answer longer than
 * the exclusion window it fed. The cap is a size guard, not a cooldown.
 */
export const MAX_HISTORY_AGE_DAYS = 1095;

/** Records per category kept in one state document (fourteen cards × three years). */
export const MAX_HISTORY_RECORDS = 20_000;

/** Whole days between two publication days; negative if `to` precedes `from`. */
export function daysBetweenDays(from: string, to: string): number {
  const left = Date.parse(`${from}T00:00:00Z`);
  const right = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return Number.NEGATIVE_INFINITY;
  return Math.round((right - left) / 86_400_000);
}

/**
 * The identity keys a record occupies in the index.
 *
 * - `id:` a canonical id, scoped to its card (two cards may reuse the id `book`).
 * - `url:`, `title:`, `fp:` global on purpose: the same article must not appear
 *   on AI World today and One Thing tomorrow under a label that hides the repeat.
 * - `sub:` grouped, because a subject is only "the same subject" inside a domain.
 */
export function identityKeys(record: Pick<PublicationRecord, 'card' | 'id' | 'title' | 'url' | 'fingerprint' | 'subjects'>): string[] {
  const group = policyFor(record.card)?.subjectGroup ?? 'standalone';
  const keys = [`id:${record.card}|${record.id}`];
  const url = normalizeUrl(record.url);
  if (url) keys.push(`url:${url}`);
  const title = normalizeTitle(record.title);
  if (title) keys.push(`title:${title}`);
  if (record.fingerprint) keys.push(`fp:${record.fingerprint}`);
  for (const subject of record.subjects ?? []) {
    const key = subjectKey(group, subject);
    if (key) keys.push(`sub:${key}`);
  }
  return keys;
}

export interface HistoryEntry {
  on: string;
  card: CuriosityCardKey;
}

export interface HistoryIndex {
  records: PublicationRecord[];
  /** key → (card → most recent publication day for that key). */
  lastByKey: Map<string, Map<CuriosityCardKey, string>>;
}

/**
 * Index the ledger once per publish.
 *
 * The previous pipeline scanned the whole `seen` array for every category, and
 * only remembered the last thirty days by counting distinct dates while ignoring
 * which card a record belonged to. A per-key index makes the new checks O(1) per
 * candidate and lets each key carry its own age.
 */
export function buildHistoryIndex(records: readonly PublicationRecord[]): HistoryIndex {
  const lastByKey = new Map<string, Map<CuriosityCardKey, string>>();
  for (const record of records) {
    for (const key of identityKeys(record)) {
      let perCard = lastByKey.get(key);
      if (!perCard) {
        perCard = new Map();
        lastByKey.set(key, perCard);
      }
      const existing = perCard.get(record.card);
      if (!existing || record.on > existing) perCard.set(record.card, record.on);
    }
  }
  return { records: [...records], lastByKey };
}

/** The most recent publication of `key`, whichever card wrote it. */
export function lastUseOf(index: HistoryIndex, key: string): HistoryEntry | null {
  const perCard = index.lastByKey.get(key);
  if (!perCard) return null;
  let best: HistoryEntry | null = null;
  for (const [card, on] of perCard) {
    if (!best || on > best.on) best = { card, on };
  }
  return best;
}

/** The most recent publication of `key` on one card. */
export function lastUseOn(index: HistoryIndex, key: string, card: CuriosityCardKey): string | null {
  return index.lastByKey.get(key)?.get(card) ?? null;
}

/** Records for a card (or a set of cards), newest first, within a day window. */
export function recordsWithin(index: HistoryIndex, cards: readonly CuriosityCardKey[], date: string, days: number): PublicationRecord[] {
  const wanted = new Set(cards);
  return index.records.filter((record) => wanted.has(record.card) && daysBetweenDays(record.on, date) <= days && daysBetweenDays(record.on, date) >= 0);
}

/** When an id was last published, across the whole ledger. */
export function lastPublishedFor(index: HistoryIndex, card: CuriosityCardKey, id: string): string | null {
  return lastUseOn(index, `id:${card}|${id}`, card);
}

/**
 * Drop records older than the retention window, and the oldest beyond the cap.
 *
 * Runs on every write. It never touches anything inside a cooldown: the window is
 * three years and the longest cooldown is one.
 */
export function pruneHistory(records: readonly PublicationRecord[], date: string): PublicationRecord[] {
  const kept = records.filter((record) => {
    const age = daysBetweenDays(record.on, date);
    return Number.isFinite(age) && age <= MAX_HISTORY_AGE_DAYS;
  });
  return kept.length > MAX_HISTORY_RECORDS ? kept.slice(kept.length - MAX_HISTORY_RECORDS) : kept;
}

/** Every subject key a candidate would occupy, for intra-run coordination. */
export function candidateSubjects(card: CuriosityCardKey, subjects: readonly string[] | undefined): string[] {
  const group = policyFor(card)?.subjectGroup ?? 'standalone';
  return normalizeSubjects(subjects ?? []).map((subject) => subjectKey(group, subject)).filter(Boolean);
}

/** A short source label for the run log, never invented. */
export function sourceLabel(url: string | undefined, name: string | undefined): string {
  if (name && name.trim()) return name.trim();
  const host = urlHost(url);
  return host || 'unspecified source';
}

/** Content version: changes when the payload's text changes, stable when it does not. */
export function contentVersion(...parts: unknown[]): string {
  return fingerprint(...parts).slice(0, 16);
}

/** Convenience: a signature from the same body used for the fingerprint. */
export function candidateSignature(...parts: unknown[]): string {
  return signatureText(parts.filter(Boolean).join(' '));
}
