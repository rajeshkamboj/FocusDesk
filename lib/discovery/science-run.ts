/**
 * The scheduled science discovery run.
 *
 * This is the Science counterpart of `lib/discovery/run.ts`: it reads four sources,
 * ranks what they return, verifies DOIs, and writes the survivors into the *same*
 * `curiosity_candidates` reservoir through the *same* validation, deduplication and
 * persistence path. Nothing here publishes; `lib/curiosity/job.ts` reads the
 * reservoir at midnight as it already does for every other card.
 *
 * ORDER OF OPERATIONS (the pipeline the repository already uses)
 *
 *   source → fetch → normalise → reject non-findings → score → dedupe (DOI) →
 *   verify DOI with Crossref → re-score → persist → (later) publish → display
 *
 * WHY VERIFY AFTER RANKING
 * Crossref is one HTTP request per DOI. Asking about every record would triple the
 * run's request count for no benefit; asking about the handful that could actually
 * be published is enough to catch a wrong DOI before it reaches a reader.
 */

import { persistCollectionRun } from './persist';
import { payloadForCollection, type SourceReport } from './collection';
import {
  SCIENCE_DISCIPLINES,
  rejectionForRecord,
  scienceDraftFromRecord,
  scoreScienceRecord,
  type ScienceDiscipline,
  type ScienceRecord,
} from './science';
import { fetchOpenAlex } from './sources/openalex';
import { fetchCrossref, verifyDoiWithCrossref } from './sources/crossref';
import { fetchEuropePmc } from './sources/europepmc';
import { fetchArxiv } from './sources/arxiv';
import { getCandidateStore, type CandidateDraft, type CandidateStore } from '../curiosity/reservoir';
import type { DiscoveryTrigger } from '../curiosity/types';

export type ScienceSourceId = 'openalex' | 'crossref' | 'europepmc' | 'arxiv';

export interface ScienceRunOptions {
  now?: Date;
  /** Defaults to all three disciplines. */
  disciplines?: readonly ScienceDiscipline[];
  trigger?: DiscoveryTrigger;
  store?: CandidateStore;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  /** Records kept per discipline after ranking. */
  keepPerDiscipline?: number;
  /** How many top DOIs per discipline are checked against Crossref. */
  verifyTop?: number;
  /** Restrict the run to named sources (manual runs and the harness). */
  onlySources?: readonly ScienceSourceId[];
  /** Age window, in days, beyond which a record is not a discovery any more. */
  maxAgeDays?: number;
  /** Disable Crossref DOI verification (offline fixtures). */
  verify?: boolean;
}

export interface ScienceRunOutcome {
  ranAt: string;
  disciplines: readonly ScienceDiscipline[];
  reports: SourceReport[];
  selected: Array<{
    discipline: ScienceDiscipline;
    record: ScienceRecord;
    score: number;
    provenance: string;
  }>;
  rejected: Array<{ title: string; reason: string }>;
  drafts: CandidateDraft[];
  written: number;
  persisted: boolean;
  unmigrated: boolean;
  notes: string[];
  summary: string;
}

function mergeRecords(a: ScienceRecord, b: ScienceRecord): ScienceRecord {
  // A peer-reviewed record wins over a preprint of the same DOI, because the whole
  // point of the label is that it never overstates. Everything else is filled in
  // from whichever source actually had it.
  const [primary, secondary] = a.peerReviewed && !b.peerReviewed ? [a, b] : b.peerReviewed && !a.peerReviewed ? [b, a] : [a, b];
  return {
    ...secondary,
    ...primary,
    venue: primary.venue ?? secondary.venue,
    publisher: primary.publisher ?? secondary.publisher,
    publishedOn: primary.publishedOn ?? secondary.publishedOn,
    citationCount: Math.max(primary.citationCount ?? 0, secondary.citationCount ?? 0) || undefined,
    license: primary.license ?? secondary.license,
    abstractText: primary.abstractText ?? secondary.abstractText,
    type: primary.type ?? secondary.type,
    preprint: primary.preprint && secondary.preprint,
    peerReviewed: primary.peerReviewed || secondary.peerReviewed,
    authors: primary.authors.length ? primary.authors : secondary.authors,
    institutions: primary.institutions.length ? primary.institutions : secondary.institutions,
    openAccess: primary.openAccess ?? secondary.openAccess,
  };
}

/** The DOI (or URL) that makes two records the same work. */
export function workKey(record: ScienceRecord): string {
  return record.doi ? `doi:${record.doi}` : `url:${record.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
}

/**
 * Group records that are the same work, keeping the strongest version of each.
 * Exported so the harness can prove the collapse without running a network call.
 */
export function collapseRecords(records: readonly ScienceRecord[]): ScienceRecord[] {
  const byKey = new Map<string, ScienceRecord>();
  for (const record of records) {
    const key = workKey(record);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeRecords(existing, record) : record);
  }
  return [...byKey.values()];
}

export async function runScienceDiscovery(options: ScienceRunOptions = {}): Promise<ScienceRunOutcome> {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);
  const store = options.store ?? getCandidateStore();
  const disciplines = options.disciplines ?? SCIENCE_DISCIPLINES;
  const keep = Math.max(1, Math.min(options.keepPerDiscipline ?? 6, 12));
  const verifyTop = Math.max(0, Math.min(options.verifyTop ?? 3, 5));
  const maxAgeDays = options.maxAgeDays ?? 60;
  const only = options.onlySources;

  const reports: SourceReport[] = [];
  const notes: string[] = [];
  const rejected: Array<{ title: string; reason: string }> = [];
  const selected: ScienceRunOutcome['selected'] = [];
  const drafts: CandidateDraft[] = [];

  const cursors = await store.readCursors().catch(() => ({} as Record<string, string>));
  const context = { fetchImpl: options.fetchImpl, sleepImpl: options.sleepImpl, nowIso };

  for (const discipline of disciplines) {
    const collected: ScienceRecord[] = [];
    const adapters: Array<{ id: ScienceSourceId; run: () => Promise<{ records: ScienceRecord[]; report: SourceReport }> }> = [];

    if (!only || only.includes('openalex')) {
      adapters.push({ id: 'openalex', run: () => fetchOpenAlex(discipline, { ...context, cursor: cursors[`science:${discipline}:openalex`] }) });
    }
    // Crossref search for every discipline; Europe PMC is the life-sciences index,
    // arXiv the preprint server for physics and chemistry.
    if (!only || only.includes('crossref')) {
      adapters.push({ id: 'crossref', run: () => fetchCrossref(discipline, { ...context, cursor: cursors[`science:${discipline}:crossref`] }) });
    }
    if (discipline === 'biology' && (!only || only.includes('europepmc'))) {
      adapters.push({ id: 'europepmc', run: () => fetchEuropePmc(discipline, { ...context, cursor: cursors[`science:${discipline}:europepmc`] }) });
    }
    if ((discipline === 'physics' || discipline === 'chemistry') && (!only || only.includes('arxiv'))) {
      adapters.push({ id: 'arxiv', run: () => fetchArxiv(discipline, { ...context, cursor: cursors[`science:${discipline}:arxiv`] }) });
    }

    // Sequential, and each isolated: one unreachable source is one report line,
    // never a lost run.
    for (const adapter of adapters) {
      try {
        const outcome = await adapter.run();
        collected.push(...outcome.records);
        reports.push(outcome.report);
        // Advance the rotation cursor only when the source actually answered, so a
        // failure does not silently skip a query window.
        if (outcome.report.status !== 'failed' && outcome.report.status !== 'disabled') {
          const previous = Number(cursors[`science:${discipline}:${adapter.id}`]) || 0;
          await store
            .writeCursor(`science:${discipline}:${adapter.id}`, discipline, String(previous + 1))
            .catch(() => notes.push(`cursor for ${adapter.id}/${discipline} could not be saved`));
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        reports.push({
          sourceId: adapter.id,
          sourceName: adapter.id,
          status: 'failed',
          fetched: 0,
          accepted: 0,
          rejected: 0,
          duplicates: 0,
          note: `adapter threw: ${reason.slice(0, 160)}`,
          finishedAt: nowIso,
        });
      }
    }

    const collapsed = collapseRecords(collected);
    const scored: Array<{ record: ScienceRecord; score: ReturnType<typeof scoreScienceRecord> }> = [];
    for (const record of collapsed) {
      const rejection = rejectionForRecord(record, today, maxAgeDays);
      if (rejection) {
        rejected.push({ title: record.title.slice(0, 120), reason: rejection });
        continue;
      }
      scored.push({ record, score: scoreScienceRecord(record, today) });
    }
    scored.sort((a, b) => b.score.total - a.score.total || (b.record.publishedOn ?? '').localeCompare(a.record.publishedOn ?? ''));

    const shortlist = scored.slice(0, keep);
    for (const [index, entry] of shortlist.entries()) {
      let record = entry.record;
      let score = entry.score;
      const verifiedAgainst: string[] = [record.sourceId];

      if (options.verify !== false && index < verifyTop && record.doi) {
        const verification = await verifyDoiWithCrossref(record.doi, record.title, {
          fetchImpl: options.fetchImpl,
          sleepImpl: options.sleepImpl,
        });
        if (!verification.verified) {
          const unreachable = /lookup failed/i.test(verification.note ?? '');
          if (unreachable) {
            // The registration authority being down is not evidence against the
            // record: keep it, but do not claim it was verified.
            notes.push(`${discipline}: DOI ${record.doi} could not be checked with Crossref (${verification.note})`);
          } else {
            rejected.push({ title: record.title.slice(0, 120), reason: verification.note ?? 'DOI did not verify with Crossref' });
            continue;
          }
        } else {
          verifiedAgainst.push('crossref');
          record = {
            ...record,
            license: record.license ?? verification.license,
            venue: record.venue ?? verification.venue,
            publisher: record.publisher ?? verification.publisher,
            publishedOn: record.publishedOn ?? verification.publishedOn,
            // Crossref's own type is the stronger statement about review status, but
            // it may only *demote*: a Crossref "journal-article" cannot make an arXiv
            // deposit peer-reviewed.
            peerReviewed: record.preprint ? false : record.peerReviewed || Boolean(verification.peerReviewed),
            authors: record.authors.length ? record.authors : (verification.authors ?? []),
          };
          score = scoreScienceRecord(record, today);
        }
      }

      selected.push({ discipline, record, score: score.total, provenance: score.provenance });
      drafts.push(
        scienceDraftFromRecord(
          record,
          score,
          nowIso,
          { verifiedAgainst },
        ),
      );
    }

    if (shortlist.length === 0) {
      notes.push(`${discipline}: no record survived the freshness and substance gates (${Math.max(0, rejected.length)} rejected so far)`);
    }
  }

  // Collection marker, so the reservoir can tell a science row from a Curiosity
  // editorial row without a new column.
  const marked = drafts.map((draft) => ({
    ...draft,
    payload: payloadForCollection('science', draft.payload ?? {}),
  }));

  const persistence = await persistCollectionRun({
    collection: 'science',
    drafts: marked,
    reports,
    trigger: options.trigger ?? 'cron',
    nowIso,
    store,
    strictness: 'standard',
  });

  const failed = reports.filter((report) => report.status === 'failed').length;
  const summary = [
    `science discovery`,
    `${reports.length} source call${reports.length === 1 ? '' : 's'}`,
    `${selected.length} selected`,
    `${drafts.length} drafted`,
    `${persistence.written} written`,
    `${persistence.metrics.duplicateRejections} duplicate`,
    `${failed} failed`,
    persistence.unmigrated ? 'NOT PERSISTED (migration missing)' : persistence.persisted ? 'persisted' : 'NOT PERSISTED',
  ].join(' · ');

  return {
    ranAt: nowIso,
    disciplines,
    reports,
    selected,
    rejected,
    drafts,
    written: persistence.written,
    persisted: persistence.persisted,
    unmigrated: persistence.unmigrated,
    notes: [...notes, ...persistence.notes].slice(0, 40),
    summary,
  };
}

/** The one-line description a scheduler log shows. */
export function describeScienceRun(outcome: ScienceRunOutcome): string {
  const perDiscipline = outcome.disciplines
    .map((discipline) => {
      const picks = outcome.selected.filter((entry) => entry.discipline === discipline);
      if (picks.length === 0) return `${discipline}: none`;
      const best = picks.reduce((a, b) => (b.score > a.score ? b : a));
      return `${discipline}: ${picks.length} (top ${best.score}, ${best.provenance})`;
    })
    .join(' · ');
  return `${outcome.summary} — ${perDiscipline}`;
}
