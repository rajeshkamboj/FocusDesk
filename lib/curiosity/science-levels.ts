/**
 * Which undergraduate records exist, and why a discipline has none.
 *
 * THE PROBLEM THIS SOLVES
 * The Two Levels selector used to return an empty object for a discipline with no
 * qualified research record, and say nothing about it. "Physics has no undergraduate
 * card today" is then indistinguishable from "the discovery job has never written a
 * single row", "the table is missing", "every row failed validation" and "the rows
 * are there but all too old" — four different faults with one blank card.
 *
 * This module answers the question once, from the same predicates the publisher
 * uses, so the card, the status endpoint and the Settings panel cannot disagree.
 * It is pure: no store, no network, no clock of its own.
 */

import { researchCandidateEligibleToday } from '../discovery/science';
import type { ScienceDiscipline } from '../discovery/science';
import { RESEARCH_PROVENANCE_LABELS } from './types';
import type { KnowledgeCandidate, ResearchProvenance, ScienceConcept, ScienceLevelDiagnostic } from './types';

export const SCIENCE_DISCIPLINES = ['chemistry', 'physics', 'biology'] as const;
export type { ScienceDiscipline };

/** The freshness and significance gates the publisher applies, in one place. */
export const UNDERGRADUATE_GATES = { maxAgeDays: 60, minimumScore: 35 } as const;

export type ScienceLevelDiagnostics = Record<ScienceDiscipline, ScienceLevelDiagnostic>;

export type ScienceReservoirCounts = {
  /** Everything the candidate store returned, before any filtering. */
  total: number;
  /** Whether the store answered at all (`false` when the read failed or was unmapped). */
  readable: boolean;
  /** Set when the store reported it is missing its table or migration. */
  unmigrated?: boolean;
};

function isScienceCandidate(candidate: KnowledgeCandidate, discipline: ScienceDiscipline): boolean {
  return candidate.category === discipline;
}

/**
 * A stored record qualifies for the undergraduate lane when it is a science record
 * for that discipline, still eligible, still valid, and still inside the publisher's
 * freshness and significance gates.
 */
function qualifies(candidate: KnowledgeCandidate, date: string): boolean {
  if (!candidate.eligible) return false;
  if (candidate.validationStatus !== 'valid') return false;
  return researchCandidateEligibleToday(
    candidate.payload as { science?: { publishedOn?: string; provenance?: string; significanceScore?: number } },
    date,
    UNDERGRADUATE_GATES,
  );
}

/* ------------------------------------------------------------------ */
/* Hydrating a stored research record                                  */
/* ------------------------------------------------------------------ */

/**
 * Why a stored record cannot be published as an undergraduate card.
 *
 * These are codes rather than prose so a test, the Settings panel and the publish
 * refusal can all name the same fault without matching English.
 */
export type ScienceRejectionCode =
  /** The row has no `payload.science`, so it is not a research record at all. */
  | 'no-research-metadata'
  /** Recorded provenance is neither peer-reviewed nor preprint. */
  | 'unsupported-provenance'
  /** The row carries no `payload.concept`, so there is no card to render. */
  | 'no-concept-payload'
  /** The concept says it is foundation-level, and it is not ours to promote. */
  | 'marked-foundation'
  /** The concept carries a level value this app does not know. */
  | 'unknown-education-level'
  /** The concept describes curated or encyclopedic text, not a research record. */
  | 'explainer-not-research'
  /** A field the undergraduate card must print is missing or unusable. */
  | 'incomplete-concept';

export type ScienceRejection = {
  /** The stored row's id, safe to log: it is the content id, not personal data. */
  candidateId: string;
  code: ScienceRejectionCode;
  reason: string;
};

export type HydratedResearchRecord = {
  concept: ScienceConcept;
  candidateId: string;
  /** True when this module completed metadata the row was stored without. */
  normalized: boolean;
  /** A one-line description of exactly what was completed, for the run record. */
  normalization?: string;
};

export type HydrationResult =
  | { ok: true; record: HydratedResearchRecord }
  | { ok: false; rejection: ScienceRejection };

type StoredScience = {
  discipline?: string;
  doi?: string;
  venue?: string;
  publisher?: string;
  authors?: string[];
  institutions?: string[];
  publishedOn?: string;
  provenance?: string;
  provenanceLabel?: string;
  peerReviewed?: boolean;
  significanceScore?: number;
  significanceBasis?: string[];
  rights?: string;
  verifiedAgainst?: string[];
  foundVia?: string;
  license?: string;
};

const RESEARCH_PROVENANCES: readonly ResearchProvenance[] = ['peer-reviewed', 'preprint'];

function reject(candidateId: string, code: ScienceRejectionCode, reason: string): HydrationResult {
  return { ok: false, rejection: { candidateId, code, reason } };
}

function nonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function httpsUrl(value: unknown): string | null {
  if (!nonBlank(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Turn a stored research row into a card, or say why it cannot be one.
 *
 * THE RULE THIS ENFORCES
 * `payload.science` is the record of what a source said; `payload.concept` is the card
 * written from it. A row written before the two-level structure existed has the first
 * and not the second's `educationLevel`, and the publisher used to take that concept
 * verbatim — so it reached `invalidDailyFields` as an undergraduate card with no level
 * and the whole day was refused (the 2026-11-11 outage). Hydration is where that is
 * fixed: the level is **derived from the record's own provenance**, never assumed.
 *
 * What is deliberately *not* done here:
 *  - a concept marked `foundation` is refused, not promoted (`marked-foundation`);
 *  - a curated or Wikipedia concept is refused, even if a research payload was bolted
 *    onto the row (`explainer-not-research`);
 *  - a row with no concept is refused rather than assembled from a title and a DOI
 *    (`no-concept-payload`) — a card is written text, not a template;
 *  - nothing is invented: every completed field is either a rendering of a value that
 *    is already in the row (`provenanceLabel` from `provenance`) or a copy of one
 *    (`publishedOn`, `research`) from the record the row already stores.
 */
export function hydrateResearchCandidate(candidate: KnowledgeCandidate): HydrationResult {
  const id = candidate.id;
  if (!candidate.eligible || candidate.validationStatus !== 'valid') {
    return reject(id, 'no-research-metadata', `the stored row is ${candidate.validationStatus} or ineligible, so it cannot be published`);
  }

  const stored = candidate.payload?.science;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return reject(id, 'no-research-metadata', 'the stored row carries no research metadata (payload.science), so it is not a research record');
  }
  const science = stored as StoredScience;
  const provenance = science.provenance as ResearchProvenance | undefined;
  if (!provenance || !RESEARCH_PROVENANCES.includes(provenance)) {
    return reject(
      id,
      'unsupported-provenance',
      `recorded provenance is ${provenance ? `"${provenance}"` : 'missing'}; only peer-reviewed or preprint records may be published at undergraduate level`,
    );
  }

  const rawConcept = candidate.payload?.concept;
  if (!rawConcept || typeof rawConcept !== 'object' || Array.isArray(rawConcept) || !('topic' in (rawConcept as Record<string, unknown>))) {
    return reject(
      id,
      'no-concept-payload',
      'the stored row has no card payload (payload.concept); re-run the science discovery job so the record is written with its concept',
    );
  }
  const concept = rawConcept as ScienceConcept;

  if (concept.educationLevel === 'foundation') {
    return reject(
      id,
      'marked-foundation',
      'the stored concept is marked foundation-level; a foundation card is never promoted into the undergraduate lane',
    );
  }
  if (concept.educationLevel !== undefined && concept.educationLevel !== 'undergraduate') {
    return reject(id, 'unknown-education-level', `the stored concept carries an unknown education level (${String(concept.educationLevel)})`);
  }
  if (concept.origin === 'curated' || concept.origin === 'wikipedia') {
    return reject(
      id,
      'explainer-not-research',
      `the stored concept is a ${concept.origin} explainer, not a research record; it cannot be published as undergraduate research`,
    );
  }
  if (!nonBlank(concept.topic) || !nonBlank(concept.simple)) {
    return reject(id, 'incomplete-concept', 'the stored concept has no topic or no summary, so the card would render empty');
  }
  const conceptUrl = httpsUrl(concept.source?.url) ?? httpsUrl(candidate.canonicalUrl);
  if (!conceptUrl) {
    return reject(id, 'incomplete-concept', 'the stored concept cites no usable http(s) link, so a reader could not check it');
  }
  const publishedOn = concept.publishedOn ?? science.publishedOn;
  if (!nonBlank(publishedOn)) {
    return reject(id, 'incomplete-concept', 'the stored record has no publication instant of its own');
  }

  const completed: string[] = [];
  const normalized: ScienceConcept = { ...concept };

  if (normalized.educationLevel !== 'undergraduate') {
    normalized.educationLevel = 'undergraduate';
    completed.push('educationLevel=undergraduate (derived from recorded provenance)');
  }
  if (!normalized.levelBasis) {
    normalized.levelBasis = 'derived-from-record';
    completed.push('levelBasis=derived-from-record');
  }
  if (!normalized.origin) {
    normalized.origin = 'research';
    completed.push('origin=research');
  }
  if (!normalized.provenance) {
    normalized.provenance = provenance;
    completed.push(`provenance=${provenance}`);
  }
  if (!nonBlank(normalized.provenanceLabel)) {
    normalized.provenanceLabel = RESEARCH_PROVENANCE_LABELS[provenance];
    completed.push('provenanceLabel (rendered from the recorded provenance)');
  }
  if (!normalized.publishedOn) {
    normalized.publishedOn = publishedOn;
    completed.push(`publishedOn=${publishedOn}`);
  }
  if (!normalized.source || !httpsUrl(normalized.source.url)) {
    normalized.source = {
      url: conceptUrl,
      name: nonBlank(science.venue) ? `${science.venue}${science.doi ? ` · DOI ${science.doi}` : ''}` : conceptUrl,
    };
    completed.push('source link (taken from the stored record)');
  }
  if (!normalized.research) {
    /*
      The card's own metadata panel is built from the record the row already holds.
      Nothing here is new information: every field is a straight copy, and a field the
      row does not have stays absent rather than being guessed.
    */
    normalized.research = {
      ...(nonBlank(science.doi) ? { doi: science.doi } : {}),
      ...(nonBlank(science.venue) ? { venue: science.venue } : {}),
      ...(nonBlank(science.publisher) ? { publisher: science.publisher } : {}),
      ...(Array.isArray(science.authors) ? { authors: science.authors } : {}),
      ...(Array.isArray(science.institutions) ? { institutions: science.institutions } : {}),
      publishedOn,
      peerReviewed: provenance === 'peer-reviewed',
      ...(typeof science.significanceScore === 'number' ? { significanceScore: science.significanceScore } : { significanceScore: 0 }),
      significanceBasis: Array.isArray(science.significanceBasis) ? science.significanceBasis : [],
      rights: 'metadata-only',
      verifiedAgainst: Array.isArray(science.verifiedAgainst) ? science.verifiedAgainst : [],
      foundVia: nonBlank(science.foundVia) ? science.foundVia : 'stored record',
    };
    completed.push('research metadata (copied from the stored record)');
  }

  return {
    ok: true,
    record: {
      concept: normalized,
      candidateId: id,
      normalized: completed.length > 0,
      ...(completed.length ? { normalization: completed.join(', ') } : {}),
    },
  };
}

/**
 * Every qualifying research row for a discipline, hydrated and sorted best first.
 *
 * Hydration happens here — once, for the publisher, the render-time fallback, the
 * status endpoint and the Settings panel — so a record stored without its
 * `educationLevel` is completed in exactly one place, and a record that cannot be
 * completed is refused with a code instead of silently disappearing.
 */
export function undergraduatePool(
  records: readonly KnowledgeCandidate[],
  date: string,
  discipline: ScienceDiscipline,
): { concepts: ScienceConcept[]; records: HydratedResearchRecord[]; rejected: ScienceRejection[] } {
  const candidates = records
    .filter((candidate) => isScienceCandidate(candidate, discipline) && qualifies(candidate, date))
    .sort((a, b) => {
      const scoreOf = (candidate: KnowledgeCandidate) =>
        (candidate.payload?.science as { significanceScore?: number } | undefined)?.significanceScore ?? 0;
      return scoreOf(b) - scoreOf(a) || a.id.localeCompare(b.id);
    });

  const hydrated: HydratedResearchRecord[] = [];
  const rejected: ScienceRejection[] = [];
  for (const candidate of candidates) {
    const result = hydrateResearchCandidate(candidate);
    if (result.ok) hydrated.push(result.record);
    else rejected.push(result.rejection);
  }
  return { concepts: hydrated.map((record) => record.concept), records: hydrated, rejected };
}

/** The concepts that may be published at undergraduate level today, best first. */
export function undergraduateCandidates(
  records: readonly KnowledgeCandidate[],
  date: string,
  discipline: ScienceDiscipline,
): ScienceConcept[] {
  return undergraduatePool(records, date, discipline).concepts;
}

export type UndergraduateSelection = {
  concept?: ScienceConcept;
  candidateId?: string;
  /** Records whose missing metadata was completed before publication. */
  normalized: HydratedResearchRecord[];
  /** Records that qualified on their payload but could not become a card. */
  rejected: ScienceRejection[];
};

/** The single card this discipline publishes today, with the reasons behind it. */
export function selectUndergraduate(
  records: readonly KnowledgeCandidate[],
  date: string,
  discipline: ScienceDiscipline,
): UndergraduateSelection {
  const pool = undergraduatePool(records, date, discipline);
  const [first] = pool.records;
  return {
    ...(first ? { concept: first.concept, candidateId: first.candidateId } : {}),
    normalized: pool.records.filter((record) => record.normalized),
    rejected: pool.rejected,
  };
}

export type UndergraduateConceptProblem = {
  /** The validator's phrase, so the refusal text and the tests stay identical. */
  field: string;
  expected: string;
  actual: string;
  candidateId?: string;
  reason: string;
};

/**
 * The rules an undergraduate card must satisfy, in one place.
 *
 * `invalidDailyFields()` and the publisher's last-line guard both call this, so the
 * check that *refuses a day* and the check that *keeps a bad card out of the day*
 * can never drift apart.
 */
export function undergraduateConceptProblems(concept: ScienceConcept): UndergraduateConceptProblem[] {
  const problems: UndergraduateConceptProblem[] = [];
  if (concept.educationLevel !== 'undergraduate') {
    problems.push({
      field: 'is undergraduate-level',
      expected: 'undergraduate',
      actual: concept.educationLevel ?? 'missing',
      candidateId: concept.id,
      reason: 'only a research record may be published in the undergraduate lane',
    });
  }
  if (!nonBlank(concept.provenanceLabel)) {
    problems.push({
      field: 'names its provenance',
      expected: 'a provenance label',
      actual: 'missing',
      candidateId: concept.id,
      reason: 'a research card must say whether it is peer-reviewed or a preprint',
    });
  }
  if (!httpsUrl(concept.source?.url)) {
    problems.push({
      field: 'cites its source',
      expected: 'an http(s) link',
      actual: concept.source?.url ? 'unusable link' : 'missing',
      candidateId: concept.id,
      reason: 'a research card must link to the record a reader can check',
    });
  }
  return problems;
}

/**
 * Why this discipline has no undergraduate card — phrased for the reader first and
 * the operator second, because both read the same sentence in the panel.
 */
export function explainDiscipline(
  discipline: ScienceDiscipline,
  counts: { stored: number; usable: number; qualified: number; normalized?: number; rejected?: ScienceRejection[] },
  reservoir: ScienceReservoirCounts,
): string {
  if (!reservoir.readable) {
    return `${discipline}: the research library could not be read, so no undergraduate record can be confirmed. Discovery and storage need checking; the Foundation level is unaffected.`;
  }
  if (reservoir.unmigrated) {
    return `${discipline}: the research library has no readable table yet (migration 011 not applied), so no undergraduate record can be confirmed.`;
  }
  if (reservoir.total === 0) {
    return `${discipline}: the research library is empty — the science discovery job has not stored a record yet. The Foundation level below is today's complete briefing.`;
  }
  if (counts.stored === 0) {
    return `${discipline}: the research library holds ${reservoir.total} record(s), none of them ${discipline} research. The discovery job has not produced a ${discipline} record yet.`;
  }
  if (counts.usable === 0) {
    return `${discipline}: ${counts.stored} stored ${discipline} record(s), none of them usable — each was recorded as invalid or ineligible when it was stored.`;
  }
  const suffix = describeHydration(counts);
  if (counts.qualified === 0) {
    return `${discipline}: ${counts.usable} usable ${discipline} record(s), none inside the ${UNDERGRADUATE_GATES.maxAgeDays}-day freshness window with a significance score of at least ${UNDERGRADUATE_GATES.minimumScore}. Run the science discovery job to refresh them.${suffix}`;
  }
  return `${discipline}: ${counts.qualified} qualified research record(s) today.${suffix}`;
}

/**
 * What happened to the qualified records on the way to the card.
 *
 * This is the sentence that would have made the 2026-11-11 outage self-explaining: a
 * reader and an operator both need to know that records were completed from legacy
 * storage, and that a record was refused rather than quietly dropped.
 */
function describeHydration(counts: { normalized?: number; rejected?: ScienceRejection[] }): string {
  const parts: string[] = [];
  if (counts.normalized) {
    parts.push(`${counts.normalized} stored record(s) were completed from their own research metadata before publication (the stored concept predates the two-level field).`);
  }
  for (const rejection of (counts.rejected ?? []).slice(0, 3)) {
    parts.push(`1 record was refused (${rejection.code}): ${rejection.reason}.`);
  }
  return parts.length ? ` ${parts.join(' ')}` : '';
}

export function diagnoseScienceLevels(
  records: readonly KnowledgeCandidate[],
  date: string,
  reservoir: ScienceReservoirCounts,
  published: Partial<Record<ScienceDiscipline, unknown>> = {},
): ScienceLevelDiagnostics {
  return SCIENCE_DISCIPLINES.reduce((acc, discipline) => {
    const all = records.filter((candidate) => isScienceCandidate(candidate, discipline));
    const usable = all.filter((candidate) => candidate.eligible && candidate.validationStatus === 'valid');
    const qualified = usable.filter((candidate) => qualifies(candidate, date));
    // The same hydration the publisher uses, so "3 qualified" and "0 published" can
    // never be reported without the reason in between.
    const pool = undergraduatePool(records, date, discipline);
    const normalized = pool.records.filter((record) => record.normalized).length;
    return {
      ...acc,
      [discipline]: {
        discipline,
        stored: all.length,
        usable: usable.length,
        qualified: qualified.length,
        normalized,
        rejected: pool.rejected.map((rejection) => ({ candidateId: rejection.candidateId, code: rejection.code, reason: rejection.reason })),
        published: Boolean(published[discipline]),
        reason: explainDiscipline(
          discipline,
          { stored: all.length, usable: usable.length, qualified: qualified.length, normalized, rejected: pool.rejected },
          reservoir,
        ),
      },
    };
  }, {} as ScienceLevelDiagnostics);
}
