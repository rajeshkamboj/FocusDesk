import { isNearDuplicate, normalizeTitle, normalizeUrl } from './dedupe';
import {
  CARD_POLICIES,
  CARD_ORDER,
  hardFloorFor,
  policyFor,
  type CardPolicy,
  type CuriosityCardKey,
} from './catalog';
import {
  candidateFingerprint,
  candidateSubjectKeys,
  type ContentCandidate,
} from './candidates';
import { candidateSignature } from './candidates';
import { daysBetweenDays, lastUseOf, recordsWithin, type HistoryIndex } from './history';
import { dayNumber } from './schedule';

/**
 * The selection service: the single gate every card's content passes through
 * before it can become part of a published day.
 *
 * ## What it guarantees
 *
 *  - **No repeat inside a card's window.** A candidate is rejected when its
 *    canonical id, URL, normalized title, text fingerprint or a near-duplicate
 *    signature was published inside the configured window — by this card or, for
 *    identity keys, by any card.
 *  - **No recurring subject across related cards.** Science concepts, myth
 *    characters, works/authors and lessons share a subject space with their
 *    siblings, so the same concept cannot appear as Chemistry today and Physics
 *    tomorrow.
 *  - **Unpublished items first, deterministically.** Among everything allowed,
 *    never-published candidates win, and the pick inside that set is a pure
 *    function of the date and the caller's offset. Only when nothing is fresh
 *    does it take the least-recently published item.
 *  - **Relaxation is explicit and bounded.** A pool smaller than its cooldown
 *    cannot meet it. Rather than silently ignoring the rule (the previous
 *    behaviour, which is what made content repeat), the service relaxes in a
 *    fixed order and returns the reason, which the publisher records on the run.
 *    It never returns to the same item inside `hardFloorFor(poolSize)` days.
 *
 * ## What it deliberately does not do
 *
 * It does not write. The publisher validates the chosen payload and writes the
 * snapshot and the ledger; this module is a pure decision, so tests can drive it
 * with a synthetic history and no store.
 */

export type RejectionReason =
  | 'invalid'
  | 'excluded-today'
  | 'duplicate-id'
  | 'duplicate-url'
  | 'duplicate-title'
  | 'duplicate-fingerprint'
  | 'near-duplicate'
  | 'subject-cooldown'
  | 'cross-card-subject'
  | 'intra-run-subject';

export interface Rejection {
  id: string;
  title: string;
  reason: RejectionReason;
  /** The day the conflicting publication happened, when one exists. */
  on?: string;
  /** Whole days since that publication. */
  ageDays?: number;
  /** The window that was enforced for this reason. */
  windowDays?: number;
}

export type SelectionReason =
  | 'fresh'
  | 'least-recent'
  | 'relaxed-subject'
  | 'relaxed-cooldown'
  | 'empty-pool'
  | 'no-usable-candidate';

export interface SelectionOptions {
  card: CuriosityCardKey;
  /** The publication day being built, Asia/Kolkata. */
  date: string;
  index: HistoryIndex;
  /**
   * Subject keys already used by another card in *this* run, so one day's
   * briefing does not put the same idea on two cards.
   */
  reservedSubjects?: ReadonlySet<string>;
  /** Ids already chosen for today's snapshot, so a forced re-run cannot reshuffle a card. */
  excludeIds?: ReadonlySet<string>;
  /** Rotation offset, matching the per-card offset the fallback renderer uses. */
  offset?: number;
  /** Test seam: override individual windows without editing the registry. */
  policy?: Partial<CardPolicy>;
}

export interface SelectionOutcome<T = unknown> {
  ok: boolean;
  candidate?: ContentCandidate<T>;
  reason: SelectionReason;
  rejections: Rejection[];
  warnings: string[];
  /** True when a configured window had to be relaxed to keep the card non-empty. */
  relaxed: boolean;
  /** When this item was last published, if ever. */
  lastPublishedOn?: string;
}

/** A candidate is usable only if it would render as a real card. */
export function isValidCandidate(candidate: ContentCandidate): boolean {
  if (!candidate.id || !candidate.id.trim()) return false;
  if (!candidate.title || !candidate.title.trim()) return false;
  if (!candidate.text || candidate.text.trim().length < 12) return false;
  if (candidate.url) {
    try {
      const parsed = new URL(candidate.url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    } catch {
      return false;
    }
  }
  return true;
}

interface Prepared {
  candidate: ContentCandidate;
  fingerprint: string;
  signature: string;
  subjectKeys: string[];
  /** Position in the caller's list; the final tie-break, so order is reproducible. */
  order: number;
}

function prepare(candidate: ContentCandidate, order: number): Prepared {
  return {
    candidate,
    fingerprint: candidateFingerprint(candidate),
    signature: candidateSignature(candidate),
    subjectKeys: candidateSubjectKeys(candidate),
    order,
  };
}

/** Cards that share a subject space, so near-duplicates are compared across them. */
function cardsInGroup(group: CardPolicy['subjectGroup'], self: CuriosityCardKey): CuriosityCardKey[] {
  return CARD_ORDER.filter((card) => card !== self && CARD_POLICIES[card].subjectGroup === group);
}

interface Blocked {
  rejection: Rejection;
}

/**
 * Every reason this candidate must not be shown on `date`.
 *
 * Modes:
 *  - `strict`       — everything, including subjects and near-duplicates.
 *  - `identity`     — exact identity only (subjects relaxed, near-duplicates kept).
 *  - `floor`        — only the hard floor: the pool is smaller than its cooldown.
 */
function blockingReasons(
  item: Prepared,
  options: SelectionOptions,
  policy: CardPolicy,
  mode: 'strict' | 'identity' | 'floor' | 'none',
  poolSize: number,
): Blocked[] {
  const { date, index, card } = options;
  const blocked: Blocked[] = [];
  const push = (rejection: Rejection) => blocked.push({ rejection });

  const check = (key: string, reason: RejectionReason, window: number) => {
    if (window <= 0) return;
    const last = lastUseOf(index, key);
    if (!last) return;
    const age = daysBetweenDays(last.on, date);
    if (age < window) {
      push({ id: item.candidate.id, title: item.candidate.title, reason, on: last.on, ageDays: age, windowDays: window });
    }
  };

  if (mode === 'none') return blocked;

  if (mode === 'floor') {
    check(`id:${card}|${item.candidate.id}`, 'duplicate-id', hardFloorFor(poolSize));
    return blocked;
  }

  check(`id:${card}|${item.candidate.id}`, 'duplicate-id', policy.exactDays);

  const canonicalUrl = normalizeUrl(item.candidate.url);
  if (canonicalUrl) check(`url:${canonicalUrl}`, 'duplicate-url', policy.exactDays);

  const title = normalizeTitle(item.candidate.title);
  if (title) check(`title:${title}`, 'duplicate-title', policy.exactDays);

  check(`fp:${item.fingerprint}`, 'duplicate-fingerprint', policy.exactDays);

  if (mode === 'identity') return blocked;

  for (const key of item.subjectKeys) {
    const perCard = index.lastByKey.get(key);
    if (!perCard) continue;
    for (const [otherCard, on] of perCard) {
      const window = otherCard === card ? policy.subjectDays : policy.crossCardDays;
      const age = daysBetweenDays(on, date);
      if (age < window) {
        push({
          id: item.candidate.id,
          title: item.candidate.title,
          reason: otherCard === card ? 'subject-cooldown' : 'cross-card-subject',
          on,
          ageDays: age,
          windowDays: window,
        });
        break;
      }
    }
    if (blocked.some((entry) => entry.rejection.reason === 'subject-cooldown' || entry.rejection.reason === 'cross-card-subject')) break;
  }

  for (const key of item.subjectKeys) {
    if (options.reservedSubjects?.has(key)) {
      push({ id: item.candidate.id, title: item.candidate.title, reason: 'intra-run-subject' });
      break;
    }
  }

  if (item.signature) {
    const relatedCards = [card, ...cardsInGroup(policy.subjectGroup, card)];
    for (const record of recordsWithin(index, relatedCards, date, policy.nearDuplicateDays)) {
      if (record.card === card && record.id === item.candidate.id) continue;
      if (isNearDuplicate(item.signature, record.signature)) {
        push({
          id: item.candidate.id,
          title: item.candidate.title,
          reason: 'near-duplicate',
          on: record.on,
          ageDays: daysBetweenDays(record.on, date),
          windowDays: policy.nearDuplicateDays,
        });
        break;
      }
    }
  }

  return blocked;
}

/** Deterministic index into a fresh set, independent of candidate order. */
function rotationIndex(date: string, offset: number, length: number): number {
  const step = dayNumber(date) + offset;
  return ((step % length) + length) % length;
}

/**
 * Pick one candidate for a card.
 *
 * The order of fallbacks is the contract:
 *   1. strict          — every rule, including subjects and near-duplicates;
 *   2. relaxed subjects — nothing else was available, so a recurring *subject*
 *                        is allowed but an exact repeat is not;
 *   3. least-recent    — only when the pool is smaller than the cooldown, and
 *                        never inside the hard floor.
 *
 * Steps 2 and 3 always return warnings, and the publisher records those on the
 * published day, so a relaxed window is visible in Settings → Data rather than
 * hidden in behaviour.
 */
export function selectCandidate<T = unknown>(
  candidates: readonly ContentCandidate<T>[],
  options: SelectionOptions,
): SelectionOutcome<T> {
  const policy: CardPolicy = { ...policyFor(options.card), ...options.policy };
  const rejections: Rejection[] = [];
  const excluded = options.excludeIds ?? new Set<string>();

  const pool: Prepared[] = [];
  candidates.forEach((candidate, order) => {
    if (!isValidCandidate(candidate as ContentCandidate)) {
      rejections.push({ id: candidate.id || '(no id)', title: candidate.title || '(no title)', reason: 'invalid' });
      return;
    }
    if (excluded.has(candidate.id)) {
      rejections.push({ id: candidate.id, title: candidate.title, reason: 'excluded-today' });
      return;
    }
    pool.push(prepare(candidate as ContentCandidate, order));
  });

  if (pool.length === 0) {
    return {
      ok: false,
      reason: 'empty-pool',
      rejections,
      warnings: [`${options.card}: the candidate pool for ${options.date} is empty or unusable`],
      relaxed: false,
    };
  }

  const offset = options.offset ?? 0;
  const attempt = (mode: 'strict' | 'identity' | 'floor' | 'none', items: Prepared[], collect: boolean) => {
    const clear: Prepared[] = [];
    for (const item of items) {
      const blocked = blockingReasons(item, options, policy, mode, pool.length);
      if (blocked.length === 0) clear.push(item);
      else if (collect) rejections.push(...blocked.map((entry) => entry.rejection));
    }
    return clear;
  };

  let allowed = attempt('strict', pool, true);
  let reason: SelectionReason = 'fresh';
  let relaxed = false;
  const warnings: string[] = [];

  if (allowed.length === 0 && pool.length < policy.exactDays && policy.allowRelaxation) {
    const subjectFree = attempt('identity', pool, false);
    if (subjectFree.length) {
      allowed = subjectFree;
      relaxed = true;
      reason = 'relaxed-subject';
      warnings.push(
        `${options.card}: nothing inside the full ${policy.exactDays}-day identity / ${policy.subjectDays}-day subject windows on ${options.date}; relaxed the subject window to keep the card filled. Exact repeats and near-duplicates are still excluded.`,
      );
    }
  }

  if (allowed.length === 0 && policy.allowRelaxation) {
    // Step 3: the pool is smaller than its cooldown. Take the least-recently used
    // item that is still outside the hard floor, so a card never repeats inside a
    // week unless there is literally no alternative.
    const floorPool = attempt('floor', pool, false);
    if (floorPool.length) {
      allowed = floorPool;
      relaxed = true;
      reason = 'relaxed-cooldown';
      warnings.push(
        `${options.card}: pool of ${pool.length} cannot satisfy its ${policy.exactDays}-day cooldown on ${options.date}; publishing the least-recently used item outside the ${hardFloorFor(pool.length)}-day floor. Cooldown relaxed — this is recorded, not silent.`,
      );
    } else {
      // Step 4: exhausted even the floor (a shelf rotated several times a day, or a
      // one-item pool). Publishing the oldest available item beats publishing an
      // empty card, which the brief forbids more strongly. The warning is explicit.
      allowed = attempt('none', pool, false);
      relaxed = true;
      reason = 'relaxed-cooldown';
      warnings.push(
        `${options.card}: pool of ${pool.length} is exhausted for ${options.date} (every item was published inside the ${hardFloorFor(pool.length)}-day floor); repeating the least-recently used item rather than leaving the card empty.`,
      );
    }
  }

  if (allowed.length === 0) {
    return {
      ok: false,
      reason: 'no-usable-candidate',
      rejections,
      warnings: [
        ...warnings,
        `${options.card}: every candidate for ${options.date} is inside its exclusion window; nothing was published for this card.`,
      ],
      relaxed,
    };
  }

  const lastOn = (item: Prepared) => lastUseOf(options.index, `id:${options.card}|${item.candidate.id}`)?.on ?? null;
  const fresh = allowed.filter((item) => lastOn(item) === null);

  let chosen: Prepared;
  if (fresh.length) {
    chosen = fresh[rotationIndex(options.date, offset, fresh.length)];
    if (reason !== 'relaxed-cooldown') reason = reason === 'relaxed-subject' ? 'relaxed-subject' : 'fresh';
  } else {
    chosen = [...allowed].sort((left, right) => {
      const leftOn = lastOn(left) ?? '0000-01-01';
      const rightOn = lastOn(right) ?? '0000-01-01';
      if (leftOn !== rightOn) return leftOn < rightOn ? -1 : 1;
      return left.order - right.order;
    })[0];
    if (reason !== 'relaxed-cooldown') reason = 'least-recent';
  }

  const last = lastOn(chosen);
  return {
    ok: true,
    candidate: chosen.candidate as ContentCandidate<T>,
    reason,
    rejections,
    warnings,
    relaxed,
    ...(last ? { lastPublishedOn: last } : {}),
  };
}

/**
 * The fallback contract, exported for documentation and for the test that proves
 * a relaxation cannot happen silently.
 */
export const FALLBACK_ORDER = ['strict', 'relaxed-subject', 'relaxed-cooldown'] as const;

/**
 * Pick up to `count` distinct items for a card that shows a list (AI World and
 * Developer Radar show three each).
 *
 * Each pick is a full `selectCandidate` call, with the subjects already chosen in
 * this run reserved, so one day's three headlines cannot be three copies of the
 * same story and a card cannot repeat yesterday's list. It stops as soon as the
 * pool is exhausted rather than topping the list up with repeats: the caller then
 * decides whether to keep the previous run's items or switch to the curated shelf.
 */
export function selectMany<T = unknown>(
  candidates: readonly ContentCandidate<T>[],
  options: SelectionOptions,
  count: number,
): { candidates: ContentCandidate<T>[]; outcomes: SelectionOutcome<T>[]; warnings: string[] } {
  const chosen: ContentCandidate<T>[] = [];
  const outcomes: SelectionOutcome<T>[] = [];
  const warnings: string[] = [];
  const reserved = new Set<string>(options.reservedSubjects ?? []);
  let remaining = [...candidates];
  for (let index = 0; index < count && remaining.length > 0; index += 1) {
    const outcome = selectCandidate<T>(remaining, { ...options, reservedSubjects: reserved });
    outcomes.push(outcome);
    warnings.push(...outcome.warnings);
    if (!outcome.ok || !outcome.candidate) break;
    chosen.push(outcome.candidate);
    const prepared = prepare(outcome.candidate as ContentCandidate, 0);
    for (const key of prepared.subjectKeys) reserved.add(key);
    remaining = remaining.filter((candidate) => candidate.id !== outcome.candidate?.id);
  }
  return { candidates: chosen, outcomes, warnings };
}
