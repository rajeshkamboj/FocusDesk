import type { CuriosityCategory, HistoryCategory, ReservoirCategory } from './types';

/**
 * The card registry: every Curiosity card, its cooldown, and how its items are
 * identified.
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
  /** Minimum days before the *same* item may be published again. */
  exactDays: number;
  /** Minimum days before an item sharing this card's subject space may return. */
  subjectDays: number;
  /** Minimum days before a re-worded version of a published item may return. */
  nearDuplicateDays: number;
  /** Which cross-card subject group this card belongs to. */
  subjectGroup: 'science' | 'mythology' | 'reading' | 'ideas' | 'news' | 'practice' | 'standalone';
  /** Days within which a subject may not appear on *another* card in the group. */
  crossCardDays: number;
  /** Whether the selector may relax windows when the pool is exhausted. */
  allowRelaxation: boolean;
  /** Where the item's identity most often comes from, for the audit table. */
  identity: string;
}

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
    identity: 'canonical event id + year + title fingerprint + source URL',
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

/**
 * Category-specific cooldown windows for the three ordered Today in History slots:
 *   1. Sikh History
 *   2. Indian History
 *   3. World History
 *
 * Exact events keep a full 365-day repeat window across all three categories, while
 * subject windows allow distinct historical episodes (for instance two different
 * Guru-period milestones or independence-era events months apart) without letting the
 * same figure or event dominate consecutive weeks.
 */
export const HISTORY_CATEGORY_POLICIES: Record<HistoryCategory, CardPolicy> = {
  'sikh-history': {
    label: 'Sikh History',
    exactDays: 365,
    subjectDays: 45,
    nearDuplicateDays: 0,
    subjectGroup: 'news',
    crossCardDays: 30,
    allowRelaxation: false,
    identity: 'canonical Sikh history id + event year + normalized title + source URL',
  },
  'indian-history': {
    label: 'Indian History',
    exactDays: 365,
    subjectDays: 60,
    nearDuplicateDays: 0,
    subjectGroup: 'news',
    crossCardDays: 30,
    allowRelaxation: false,
    identity: 'canonical Indian history id + event year + normalized title + source URL',
  },
  'world-history': {
    label: 'World History',
    exactDays: 365,
    subjectDays: 90,
    nearDuplicateDays: 0,
    subjectGroup: 'news',
    crossCardDays: 30,
    allowRelaxation: false,
    identity: 'canonical World history id + event year + normalized title + source URL',
  },
};

export function historyPolicyFor(category: HistoryCategory): CardPolicy {
  return HISTORY_CATEGORY_POLICIES[category];
}

/**
 * Operational low-stock thresholds that trigger automated replenishment during
 * scheduled discovery runs. Below `LOW_STOCK_THRESHOLDS[category]`, maintenance
 * runs prioritize discovering fresh validated candidates before any cooldown
 * relaxation is ever needed.
 */
export const LOW_STOCK_THRESHOLDS: Record<ReservoirCategory, number> = {
  'sikh-history': 60,
  'indian-history': 90,
  'world-history': 120,
  mythology: 30,
  chemistry: 45,
  physics: 45,
  biology: 45,
  'one-thing': 30,
  'learn-something': 30,
  literature: 30,
  book: 30,
  'ai-world': 15,
  'developer-radar': 12,
};

/**
 * Long-range pool targets to measure growth against. Reported explicitly as
 * operational targets — never claimed as available counts unless verified in the
 * eligible reservoir.
 */
export const TARGET_POOL_SIZES: Record<ReservoirCategory, number> = {
  'sikh-history': 365,
  'indian-history': 365,
  'world-history': 365,
  mythology: 180,
  chemistry: 180,
  physics: 180,
  biology: 180,
  'one-thing': 120,
  'learn-something': 120,
  literature: 120,
  book: 120,
  'ai-world': 60,
  'developer-radar': 45,
};

/** The four pool-backed categories `curiosity_content` stores, as card keys. */
export const POOL_CARD_BY_CATEGORY: Record<CuriosityCategory, CuriosityCardKey> = {
  'one-thing': 'one-thing',
  literature: 'literature',
  'learn-something': 'learn-something',
  book: 'book',
};

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

export function hardFloorFor(poolSize: number): number {
  return Math.max(1, Math.min(7, poolSize - 1));
}

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
