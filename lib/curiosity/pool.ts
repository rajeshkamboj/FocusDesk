import type {
  BookCandidate,
  CuriosityCategory,
  CuriosityPoolEntry,
  LearningItem,
  LiteratureItem,
  OneThingItem,
} from './types';
import { dayNumber } from './schedule';
import { oneThingPool } from './content/one-things';
import { learnSomethingPool } from './content/learn-something';
import { literaturePool } from './content/literature';
import { bookPool } from './content/books';

/**
 * The content pool and the rotation over it.
 *
 * Two jobs, kept deliberately small and pure:
 *
 *  1. **Aggregate.** The authored pools live in `content/*.ts`; this module is
 *     the only place that knows all four. When Supabase is configured, its
 *     `curiosity_content` rows are merged over the authored pool by id, so a
 *     database row can retire an item or add one without a deploy — and the
 *     authored pool remains the fallback when the database is unreachable.
 *  2. **Rotate.** For a date, pick one eligible entry per category. The pick is
 *     `(rotationStep + offset) % eligible.length`, so a given date always maps
 *     to the same item, and no clock, random number or request count is
 *     involved. That determinism is what makes the briefing safe to render on
 *     every request without generating anything.
 *
 * Nothing here fetches, writes or reads state. Repeat avoidance is a *parameter*
 * (`seenIds`) rather than a side effect, so the publisher job can pass the
 * ledger it read and the fallback path can pass nothing.
 */

export const CURIOUSITY_CATEGORIES = ['one-thing', 'literature', 'learn-something', 'book'] as const;

/** Per-category offsets, so the four rotations do not advance in lockstep. */
export const ROTATION_OFFSETS: Record<CuriosityCategory, number> = {
  'one-thing': 0,
  'literature': 5,
  'learn-something': 11,
  'book': 2,
};

/** Which card payload each category carries. */
export type PoolItemByCategory = {
  'one-thing': OneThingItem;
  'literature': LiteratureItem;
  'learn-something': LearningItem;
  book: BookCandidate;
};

const pools: { [C in CuriosityCategory]: CuriosityPoolEntry<PoolItemByCategory[C]>[] } = {
  'one-thing': oneThingPool,
  'literature': literaturePool,
  'learn-something': learnSomethingPool,
  book: bookPool,
};

/** The pool for one category, typed for its card. */
export function poolFor<C extends CuriosityCategory>(category: C): CuriosityPoolEntry<PoolItemByCategory[C]>[] {
  return pools[category] ?? [];
}

export function isCuriosityCategory(value: unknown): value is CuriosityCategory {
  return typeof value === 'string' && (CURIOUSITY_CATEGORIES as readonly string[]).includes(value);
}

/** An entry is publishable on `date` when it exists by then and has not been retired. */
export function isEligible(entry: CuriosityPoolEntry<unknown>, date: string): boolean {
  if (entry.status === 'retired' || entry.status === 'draft') return false;
  if (!entry.availableFrom) return true;
  return entry.availableFrom <= date;
}

export function eligibleEntries(pool: CuriosityPoolEntry<unknown>[], date: string): CuriosityPoolEntry<unknown>[] {
  return pool.filter((entry) => isEligible(entry, date));
}

export type SelectionResult = {
  entry: CuriosityPoolEntry<unknown>;
  /** Index inside `candidates`, for tests and for the publish log. */
  index: number;
  /** Ids dropped because they were shown too recently. */
  avoided: string[];
};

/**
 * The deterministic pick for one category.
 *
 * `seenIds` is the recent tail of the rotation ledger. Entries in it are set
 * aside while any fresh entry remains, which is what stops yesterday’s item
 * from reappearing after a store reset, a redeploy or a manual refresh. With no
 * ledger (the offline fallback path) the plain rotation is used, so the same
 * date always produces the same card.
 */
export function selectFromPool(
  category: CuriosityCategory,
  date: string,
  options: { seenIds?: string[]; pool?: CuriosityPoolEntry<unknown>[]; offset?: number } = {},
): SelectionResult {
  const pool: CuriosityPoolEntry<unknown>[] = options.pool ?? poolFor(category);
  const eligible = eligibleEntries(pool, date);
  if (eligible.length === 0) throw new Error(`No eligible ${category} content for ${date}`);
  const offset = options.offset ?? ROTATION_OFFSETS[category] ?? 0;
  const seen = new Set(options.seenIds ?? []);
  const fresh = seen.size ? eligible.filter((entry) => !seen.has(entry.id)) : eligible;
  const candidates = fresh.length ? fresh : eligible;
  const avoided = fresh.length ? [...seen].filter((id) => eligible.some((entry) => entry.id === id)) : [];
  const index = ((dayNumber(date) + offset) % candidates.length + candidates.length) % candidates.length;
  return { entry: candidates[index], index, avoided };
}

/**
 * Merge database rows over the authored pool.
 *
 * Keyed by id, so a row edits in place (retiring or re-dating a card) and a new
 * id appends. Rows whose category is unknown, or whose payload is unusable, are
 * dropped rather than trusted — a malformed row must never be able to blank a
 * day’s card.
 */
export function mergePool(
  authored: CuriosityPoolEntry<unknown>[],
  fromDatabase: CuriosityPoolEntry<unknown>[],
): CuriosityPoolEntry<unknown>[] {
  if (!fromDatabase.length) return authored;
  const byId = new Map(authored.map((entry) => [entry.id, entry]));
  for (const entry of fromDatabase) byId.set(entry.id, entry);
  return [...byId.values()];
}

/** How many entries each category can currently rotate through, for the settings panel. */
export function poolSizes(date: string): Record<CuriosityCategory, { eligible: number; total: number }> {
  return CURIOUSITY_CATEGORIES.reduce(
    (acc, category) => {
      const pool = poolFor(category);
      return { ...acc, [category]: { eligible: eligibleEntries(pool, date).length, total: pool.length } };
    },
    {} as Record<CuriosityCategory, { eligible: number; total: number }>,
  );
}

/** Days before the same authored item could come round again, per category. */
export function cycleLengths(date: string): Record<CuriosityCategory, number> {
  return CURIOUSITY_CATEGORIES.reduce(
    (acc, category) => ({ ...acc, [category]: eligibleEntries(poolFor(category), date).length }),
    {} as Record<CuriosityCategory, number>,
  );
}
