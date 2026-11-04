/**
 * Shared discovery infrastructure for the book and science collections.
 *
 * WHAT THIS IS
 * The Curiosity reservoir (`curiosity_candidates` + `curiosity_discovery_runs`,
 * migration 011) already persists validated candidates with provenance,
 * licensing, deduplication and run telemetry. Literature discovery and Science
 * expansion are the *same problem* with different sources, so they reuse it
 * rather than growing a second engine:
 *
 *   scheduled discovery → source-specific adapters → normalization → validation
 *   → attribution & licensing checks → deduplication → Supabase persistence
 *   → eligibility selection → existing UI
 *
 * This module is the connective tissue: the `KnowledgeCollection` type, the
 * per-source result reporting, the strictness / reuse policy, and the
 * collection-scoped storage that lets both features share one schema with the
 * Curiosity corpus.
 *
 * WHAT IT IS NOT
 * It does not fetch, schedule or publish. Sources live under
 * `lib/discovery/sources/`; the scheduled runner lives in
 * `lib/discovery/run.ts`. Everything here is pure and testable without a
 * network, a database or a clock.
 */

import {
  RESERVOIR_CATEGORIES,
  type CandidateValidationStatus,
  type DiscoveryTrigger,
  type ReservoirCategory,
} from '../curiosity/types';

/* ------------------------------------------------------------------ */
/* Collections                                                        */
/* ------------------------------------------------------------------ */

/**
 * A collection is a *view* over the existing candidate reservoir. It deliberately
 * does not add a column: provenance already lives in `payload`, and a collection
 * is a derived property of both the category and the payload, so the same table
 * serves every feature without a migration.
 */
export const KNOWLEDGE_COLLECTIONS = ['curiosity', 'literature'] as const;

export type KnowledgeCollection = (typeof KNOWLEDGE_COLLECTIONS)[number];

/**
 * The reservoir categories a collection may write into.
 *
 * Literature reuses `'literature'` and `'book'`. Science expansion reuses
 * `'chemistry'`, `'physics'`, `'biology'` and the two ideas categories
 * `'one-thing'` and `'learn-something'` in a follow-up change; this module is
 * written so that adding a collection is a one-line change to this table, not a new
 * persistence path.
 *
 * `curiosity` keeps every category, because that is the pre-existing behaviour.
 */
export const COLLECTION_CATEGORIES: Record<KnowledgeCollection, readonly ReservoirCategory[]> = {
  curiosity: RESERVOIR_CATEGORIES,
  literature: ['literature', 'book'],
};

export function categoriesForCollection(collection: KnowledgeCollection): readonly ReservoirCategory[] {
  return COLLECTION_CATEGORIES[collection];
}

/* ------------------------------------------------------------------ */
/* Source reporting                                                   */
/* ------------------------------------------------------------------ */

export type SourceStatus = 'ok' | 'partial' | 'failed' | 'skipped' | 'disabled';

/**
 * One source's outcome in a scheduled run.
 *
 * `status` is deliberately not a boolean: "partial" is the honest answer for a
 * source that returned fourteen usable records out of sixty-three pages, and a
 * run report that flattened it to "ok" would hide a degrading upstream.
 */
export interface SourceReport {
  /** Stable adapter id, e.g. `gutenberg`, `openstax`, `europepmc`. */
  sourceId: string;
  /** Reader-facing name, e.g. "Project Gutenberg". */
  sourceName: string;
  status: SourceStatus;
  /** Records returned by the source and offered to normalization. */
  fetched: number;
  /** Records that passed validation and entered the reservoir. */
  accepted: number;
  /** Records rejected by validation (with reasons in `notes`). */
  rejected: number;
  /** Records skipped because the reservoir already had them. */
  duplicates: number;
  /** Why the source failed or was skipped. Never thrown, always reported. */
  note?: string;
  /** ISO instant the source finished, for rate-limit diagnostics. */
  finishedAt: string;
}

export function summarizeSourceReports(reports: readonly SourceReport[]): {
  sources: number;
  failed: number;
  partial: number;
  accepted: number;
  rejected: number;
  duplicates: number;
  allFailed: boolean;
} {
  const failed = reports.filter((report) => report.status === 'failed').length;
  const partial = reports.filter((report) => report.status === 'partial').length;
  return {
    sources: reports.length,
    failed,
    partial,
    accepted: reports.reduce((total, report) => total + report.accepted, 0),
    rejected: reports.reduce((total, report) => total + report.rejected, 0),
    duplicates: reports.reduce((total, report) => total + report.duplicates, 0),
    // "All failed" only when every source actually tried and every one failed. A
    // disabled or skipped source must never make a healthy run look broken.
    allFailed:
      reports.length > 0
      && reports.every((report) => report.status === 'failed' || report.status === 'disabled' || report.status === 'skipped')
      && reports.some((report) => report.status === 'failed'),
  };
}

/* ------------------------------------------------------------------ */
/* Validation strictness                                              */
/* ------------------------------------------------------------------ */

/**
 * `standard` is the Curiosity gate (28–1800 character description, no
 * disambiguation pages, licence inference).
 *
 * `catalogue` is for a *bibliographic* record: a book's own description is often
 * one line ("The Iliad"), and padding it out to satisfy a prose length rule would
 * mean inventing text. So the length floor is relaxed and every record must
 * instead carry a stable source identifier, an author, a language and an explicit
 * rights statement — which is a stronger claim than a word count.
 *
 * The relaxed pathway is a separate, named policy rather than a flag that turns
 * checks off, so a caller cannot accidentally weaken the Curiosity gate.
 */
export type ValidationStrictness = 'standard' | 'catalogue';

export interface CollectionValidationPolicy {
  strictness: ValidationStrictness;
  /** Minimum acceptable description length. */
  minDescriptionChars: number;
  /** Whether a rights / public-domain statement is mandatory. */
  requireRightsStatement: boolean;
  /**
   * The record kinds that must name an author.
   *
   * A book without an author is a broken catalogue record; a NASA image, a
   * Wikipedia explainer or a research abstract has no "author" in that sense, and
   * demanding one would either reject valid records or invite an invented name.
   * So authorship is required per kind, not per collection.
   */
  authorRequiredKinds: readonly string[];
  /** Whether a language code is mandatory. */
  requireLanguage: boolean;
}

export const COLLECTION_VALIDATION: Record<ValidationStrictness, CollectionValidationPolicy> = {
  standard: {
    strictness: 'standard',
    minDescriptionChars: 28,
    requireRightsStatement: false,
    authorRequiredKinds: [],
    requireLanguage: false,
  },
  catalogue: {
    strictness: 'catalogue',
    minDescriptionChars: 12,
    requireRightsStatement: true,
    authorRequiredKinds: ['book', 'text', 'textbook'],
    requireLanguage: true,
  },
};

/* ------------------------------------------------------------------ */
/* Rights                                                             */
/* ------------------------------------------------------------------ */

/**
 * Rights are a first-class part of a record, not a comment.
 *
 *   - `public-domain-verified` — the source itself states the work is in the
 *     public domain, or the jurisdiction is named and verified.
 *   - `public-domain-asserted` — the work is widely treated as public domain in
 *     its source country, but the exact edition/jurisdiction was not verified.
 *     It may be *listed* with its source link; no text is reproduced.
 *   - `permitted-reuse` — an explicit open licence (CC BY, CC0, CC BY-SA, OGL…).
 *   - `abstract-only` — research metadata and abstract. Never full text.
 *   - `unknown` — anything else. Never eligible.
 *
 * The invariant that matters: **only `public-domain-verified`,
 * `public-domain-asserted`, `permitted-reuse` and `abstract-only` may be
 * eligible**, and `public-domain-asserted` is always surfaced to the reader as
 * "check your country's rules", because a work can be public domain in the source
 * country and still in copyright where the reader is.
 */
export const RIGHTS_STATUSES = [
  'public-domain-verified',
  'public-domain-asserted',
  'permitted-reuse',
  'abstract-only',
  'unknown',
] as const;

export type RightsStatus = (typeof RIGHTS_STATUSES)[number];

export const ELIGIBLE_RIGHTS: readonly RightsStatus[] = [
  'public-domain-verified',
  'public-domain-asserted',
  'permitted-reuse',
  'abstract-only',
];

export function rightsAreEligible(status: RightsStatus): boolean {
  return ELIGIBLE_RIGHTS.includes(status);
}

/** The sentence shown next to a source link, so a reader can check the claim. */
export function rightsAttribution(status: RightsStatus, sourceName: string): string {
  switch (status) {
    case 'public-domain-verified':
      return `Public domain, as stated by ${sourceName}. Verify the rules for your own country before republishing.`;
    case 'public-domain-asserted':
      return `Widely treated as public domain; ${sourceName} hosts the work. Public-domain status differs by country — check yours before republishing.`;
    case 'permitted-reuse':
      return `Openly licensed for reuse by ${sourceName}. Follow the licence terms and keep this attribution.`;
    case 'abstract-only':
      return `Metadata and abstract only, from ${sourceName}. Abstract reproduced under the source's terms for non-commercial reading; the full text may require a subscription.`;
    default:
      return `Reuse status not verified. Links to ${sourceName} for reference only.`;
  }
}

/* ------------------------------------------------------------------ */
/* Normalisation helpers                                             */
/* ------------------------------------------------------------------ */

/**
 * A stable, namespaced record id.
 *
 * Idempotency across runs depends on this being a pure function of the source
 * identifier, so re-discovering the same work updates its metadata instead of
 * inserting a second row. Different sources for the same work produce different
 * ids on purpose — cross-source deduplication is the reservoir's job (by
 * normalized identity, canonical URL and ISBN), not the id's.
 */
export function collectionRecordId(sourceId: string, stableKey: string): string {
  const slug = stableKey
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  const safeSource = sourceId.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `${safeSource}-${slug || 'record'}`;
}

/* ------------------------------------------------------------------ */
/* Run accounting                                                     */
/* ------------------------------------------------------------------ */

export interface CollectionRunHeader {
  collection: KnowledgeCollection;
  ranAt: string;
  trigger: DiscoveryTrigger;
  categoriesChecked: readonly ReservoirCategory[];
  reports: readonly SourceReport[];
  /** Notes that belong to the run rather than to one source (e.g. "migration missing"). */
  notes: string[];
}

/**
 * The one-line status a scheduler's log will show. Written for a human reading a
 * red GitHub Actions run at midnight: which collection, which sources worked,
 * what was stored.
 */
export function describeCollectionRun(run: CollectionRunHeader): string {
  const summary = summarizeSourceReports(run.reports);
  const failed = run.reports.filter((report) => report.status === 'failed').map((report) => report.sourceId);
  const parts = [
    `${run.collection} discovery`,
    `${summary.sources} source${summary.sources === 1 ? '' : 's'}`,
    `${summary.accepted} stored`,
    `${summary.duplicates} duplicate`,
    `${summary.rejected} rejected`,
  ];
  if (failed.length > 0) parts.push(`failed: ${failed.join(', ')}`);
  if (summary.partial > 0) parts.push(`${summary.partial} partial`);
  if (summary.allFailed) parts.push('ALL SOURCES FAILED');
  return parts.join(' · ');
}

/** Whether a category may be written by a collection. Guards a mis-wired adapter. */
export function collectionAllowsCategory(
  collection: KnowledgeCollection,
  category: ReservoirCategory,
): boolean {
  return categoriesForCollection(collection).includes(category);
}

/** The payload marker that turns a shared reservoir row into a collection record. */
export const COLLECTION_PAYLOAD_KEY = 'collection';

export function payloadForCollection(
  collection: KnowledgeCollection,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return { ...payload, [COLLECTION_PAYLOAD_KEY]: collection };
}

/**
 * Which collection a stored candidate belongs to. Rows written before this
 * module existed carry no marker and are Curiosity content — the correct default,
 * because that is what they are.
 */
export function collectionOfCandidate(candidate: {
  category: ReservoirCategory;
  payload?: Record<string, unknown>;
}): KnowledgeCollection {
  const marker = candidate.payload?.[COLLECTION_PAYLOAD_KEY];
  if (marker === 'literature' || marker === 'curiosity') return marker;
  return 'curiosity';
}

/**
 * The status a candidate should carry, derived from its rights and validation.
 *
 * Kept as one function so every adapter reaches the same conclusion, and so a
 * record with an unverified rights statement can never be eligible — that is the
 * single invariant the licensing review depends on.
 */
export function statusForRights(
  rights: RightsStatus,
  validationStatus: CandidateValidationStatus = 'valid',
): { validationStatus: CandidateValidationStatus; eligible: boolean; notes: string[] } {
  const notes: string[] = [];
  if (!rightsAreEligible(rights)) {
    notes.push(`Reuse status "${rights}" is not verified, so this record is stored but never published.`);
    return { validationStatus: 'needs-review', eligible: false, notes };
  }
  if (validationStatus !== 'valid') return { validationStatus, eligible: false, notes };
  if (rights === 'public-domain-asserted') {
    notes.push('Public-domain status asserted rather than verified for a named edition; the card tells the reader to check their country.');
  }
  return { validationStatus: 'valid', eligible: true, notes };
}
