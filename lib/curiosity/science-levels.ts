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
import { candidateToScienceConcept } from './reservoir';
import type { KnowledgeCandidate, ScienceConcept, ScienceLevelDiagnostic } from './types';

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

/** The concepts that may be published at undergraduate level today, best first. */
export function undergraduateCandidates(
  records: readonly KnowledgeCandidate[],
  date: string,
  discipline: ScienceDiscipline,
): ScienceConcept[] {
  return records
    .filter((candidate) => isScienceCandidate(candidate, discipline) && qualifies(candidate, date))
    .sort((a, b) => {
      const scoreOf = (candidate: KnowledgeCandidate) =>
        (candidate.payload?.science as { significanceScore?: number } | undefined)?.significanceScore ?? 0;
      return scoreOf(b) - scoreOf(a) || a.id.localeCompare(b.id);
    })
    .map((candidate) => candidateToScienceConcept(candidate))
    .filter((concept): concept is ScienceConcept => concept !== null);
}

/**
 * Why this discipline has no undergraduate card — phrased for the reader first and
 * the operator second, because both read the same sentence in the panel.
 */
export function explainDiscipline(
  discipline: ScienceDiscipline,
  counts: { stored: number; usable: number; qualified: number },
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
  if (counts.qualified === 0) {
    return `${discipline}: ${counts.usable} usable ${discipline} record(s), none inside the ${UNDERGRADUATE_GATES.maxAgeDays}-day freshness window with a significance score of at least ${UNDERGRADUATE_GATES.minimumScore}. Run the science discovery job to refresh them.`;
  }
  return `${discipline}: ${counts.qualified} qualified research record(s) today.`;
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
    return {
      ...acc,
      [discipline]: {
        discipline,
        stored: all.length,
        usable: usable.length,
        qualified: qualified.length,
        published: Boolean(published[discipline]),
        reason: explainDiscipline(discipline, { stored: all.length, usable: usable.length, qualified: qualified.length }, reservoir),
      },
    };
  }, {} as ScienceLevelDiagnostics);
}
