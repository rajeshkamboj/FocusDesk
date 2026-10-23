import type { CuriosityCategory } from './types';

/**
 * The card registry: every Curiosity card, its cooldown, and how its items are
 * identified.
 *
 * WHY A REGISTRY AND NOT CONSTANTS IN THE JOB
 *   Repetition is only preventable if "the same item" is defined once per card.
 *   The audit of the previous pipeline found three competing definitions — the
 *   pool's `seen` ids, the fixed-corpus rotations that consulted no history at
 *   all, and the live cards that recorded nothing — so a cooldown lived nowhere
 *   and every card repeated on its own private cycle. This is the one place that
 *   answers, for all fourteen cards on the page, what an item is, how long it
 *   must stay out, and which other cards share its subject space.
 *
 * The `curiosity_seen` table already had a `category` column before this change;
 * the keys here are the values it stores. `CURIOSITY_CATEGORY_CARDS` maps the
 * old, narrower four-value pool category union onto the same keys, so existing
 * rows keep their meaning.
 */

export const CURIOSITY_CARD_KEYS = [
  'quote',
  'history',
  'ai-world',
  'developer-radar',
  'one-thing',
  'learn-something',
  'speak-better',
  'literature',
  'book',
  'sharpener',
  'mythology',
  'chemistry',
  'physics',
  'biology',
] as const;

export type CuriosityCardKey = (typeof CURIOSITY_CARD_KEYS)[number];

export interface CardPolicy {
  /** The name the reader sees. Kept identical to the rendered card label. */
  label: string;
  /**
   * Minimum days before the *same* item may be published again. This is the
   * exact-item window and applies to the canonical id, the normalized title, the
   * canonical URL and the text fingerprint alike.
   */
  exactDays: number;
  /** Minimum days before an item sharing this card's subject space may return. */
  subjectDays: number;
  /** Minimum days before a re-worded version of a published item may return. */
  nearDuplicateDays: number;
  /**
   * Which cross-card subject group this card belongs to. Cards in the same group
   * share the stronger `crossCardDays` window; cards outside it only deduplicate
   * against themselves.
   */
  subjectGroup: 'science' | 'mythology' | 'reading' | 'ideas' | 'news' | 'practice' | 'standalone';
  /** Days within which a subject may not appear on *another* card in the group. */
  crossCardDays: number;
  /**
   * The smallest gap the fallback will ever accept, in days, when the configured
   * cooldown cannot be met with the current pool. It is derived from the pool
   * size at selection time (`hardFloorFor`), never from a bypass: relaxing a
   * cooldown is recorded on the run, and it never breaks this floor.
   */
  allowRelaxation: boolean;
  /** Where the item's identity most often comes from, for the audit table. */
  identity: string;
}

/**
 * Cooldown targets from the brief, applied per card.
 *
 * `exactDays: 365` is the target for a true repeat. Cards whose authored pool is
 * smaller than that cannot honour it yet — a twelve-item corpus cannot produce a
 * year of distinct days — and the selection layer is explicit about that: it
 * prefers never-published items, then the least-recently published, and records
 * `pool-exhausted` on the run rather than silently showing yesterday's item.
 * `docs/curiosity-repetition-audit.md` lists each pool's guaranteed gap.
 */
export const CARD_POLICIES: Record<CuriosityCardKey, CardPolicy> = {
  quote: {
    label: 'A Thought for Today',
    exactDays: 365,
    subjectDays: 90,
    nearDuplicateDays: 365,
    subjectGroup: 'reading',
    crossCardDays: 30,
    allowRelaxation: true,
    identity: 'normalized quote text + author',
  },
  history: {
    label: 'Today in History',
    exactDays: 365,
    subjectDays: 365,
    nearDuplicateDays: 0,
    subjectGroup: 'news',
    crossCardDays: 30,
    allowRelaxation: false,
    identity: 'event year + title fingerprint + source URL',
  },
  'ai-world': {
    label: 'AI World',
    exactDays: 365,
    subjectDays: 60,
    nearDuplicateDays: 365,
    subjectGroup: 'news',
    crossCardDays: 30,
    allowRelaxation: true,
    identity: 'canonical article URL + normalized title',
  },
  'developer-radar': {
    label: 'Developer Radar',
    exactDays: 365,
    subjectDays: 60,
    nearDuplicateDays: 365,
    subjectGroup: 'standalone',
    crossCardDays: 30,
    allowRelaxation: true,
    identity: 'repository full name + canonical URL',
  },
  'one-thing': {
    label: 'One Thing Worth Knowing',
    exactDays: 365,
    subjectDays: 60,
    nearDuplicateDays: 365,
    subjectGroup: 'ideas',
    crossCardDays: 30,
    allowRelaxation: true,
    identity: 'pool id + normalized title + text fingerprint',
  },
  'learn-something': {
    label: 'Learn Something',
    exactDays: 365,
    subjectDays: 60,
    nearDuplicateDays: 365,
    subjectGroup: 'ideas',
    crossCardDays: 30,
    allowRelaxation: true,
    identity: 'pool id + normalized topic + source URL',
  },
  'speak-better': {
    label: 'Speak Better',
    exactDays: 365,
    subjectDays: 120,
    nearDuplicateDays: 365,
    subjectGroup: 'practice',
    crossCardDays: 30,
    allowRelaxation: true,
    identity: 'lesson id + normalized focus + word list',
  },
  literature: {
    label: 'A Few Minutes of Literature',
    exactDays: 365,
    subjectDays: 120,
    nearDuplicateDays: 365,
    subjectGroup: 'reading',
    crossCardDays: 30,
    allowRelaxation: true,
    identity: 'pool id + work title + author',
  },
  book: {
    label: 'One Book',
    exactDays: 365,
    subjectDays: 90,
    nearDuplicateDays: 365,
    subjectGroup: 'reading',
    crossCardDays: 30,
    allowRelaxation: true,
    identity: 'pool id + work title + Open Library key',
  },
  sharpener: {
    label: 'Brain Sharpener',
    exactDays: 365,
    subjectDays: 120,
    nearDuplicateDays: 365,
    subjectGroup: 'practice',
    crossCardDays: 30,
    allowRelaxation: true,
    identity: 'puzzle id + normalized question + answer',
  },
  mythology: {
    label: 'Mythology · Character of the Day',
    exactDays: 180,
    subjectDays: 180,
    nearDuplicateDays: 180,
    subjectGroup: 'mythology',
    crossCardDays: 30,
    allowRelaxation: true,
    identity: 'character id + Wikidata QID + alternate names',
  },
  chemistry: {
    label: 'Chemistry of the Day',
    exactDays: 90,
    subjectDays: 90,
    nearDuplicateDays: 180,
    subjectGroup: 'science',
    crossCardDays: 30,
    allowRelaxation: true,
    identity: 'concept id + Wikidata QID + aliases + normalized topic',
  },
  physics: {
    label: 'Physics of the Day',
    exactDays: 90,
    subjectDays: 90,
    nearDuplicateDays: 180,
    subjectGroup: 'science',
    crossCardDays: 30,
    allowRelaxation: true,
    identity: 'concept id + Wikidata QID + aliases + normalized topic',
  },
  biology: {
    label: 'Biology of the Day',
    exactDays: 90,
    subjectDays: 90,
    nearDuplicateDays: 180,
    subjectGroup: 'science',
    crossCardDays: 30,
    allowRelaxation: true,
    identity: 'concept id + Wikidata QID + aliases + normalized topic',
  },
};

/** The four pool-backed categories `curiosity_content` stores, as card keys. */
export const POOL_CARD_BY_CATEGORY: Record<CuriosityCategory, CuriosityCardKey> = {
  'one-thing': 'one-thing',
  literature: 'literature',
  'learn-something': 'learn-something',
  book: 'book',
};

/**
 * The categories `curiosity_seen` accepted before this change (migration 009).
 *
 * Kept because a deployment that has not applied `010_curiosity_dedupe_history.sql`
 * still has the narrower CHECK constraint. The writer degrades to these instead
 * of failing the whole publish when the new keys are rejected — losing the new
 * cards' history is recoverable; losing the day's publication is not.
 */
export const LEGACY_SEEN_CATEGORIES: readonly string[] = [
  'one-thing',
  'literature',
  'learn-something',
  'book',
  'speak-better',
  'mythology',
  'chemistry',
  'physics',
  'biology',
  'sharpener',
];

export function isCuriosityCardKey(value: unknown): value is CuriosityCardKey {
  return typeof value === 'string' && (CURIOSITY_CARD_KEYS as readonly string[]).includes(value);
}

export function policyFor(card: CuriosityCardKey): CardPolicy {
  return CARD_POLICIES[card];
}

/**
 * The floor the fallback may not cross.
 *
 * With a pool of N items the best any selector can promise is one full cycle
 * before a repeat, so the floor is `min(7, N - 1)` days. A two-item pool has a
 * one-day floor — the alternative would be publishing nothing, which the brief
 * forbids more strongly than repetition.
 */
export function hardFloorFor(poolSize: number): number {
  return Math.max(1, Math.min(7, poolSize - 1));
}

/** Every card on the page, in rendered order, for the audit report and the status panel. */
export const CARD_ORDER: readonly CuriosityCardKey[] = [
  'quote',
  'history',
  'ai-world',
  'developer-radar',
  'one-thing',
  'speak-better',
  'mythology',
  'chemistry',
  'physics',
  'biology',
  'literature',
  'book',
  'sharpener',
  'learn-something',
];
