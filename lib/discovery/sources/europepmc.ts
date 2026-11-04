/**
 * Europe PMC — peer-reviewed research **metadata and abstracts only**.
 *
 * This is the adapter where over-claiming would be most damaging, so the policy is
 * written into the record rather than the docs:
 *
 *   - Only `title`, `authorString`, `journalTitle`, `pubYear`, `doi` and the
 *     abstract are read. No full text is fetched, even though Europe PMC exposes
 *     some.
 *   - The record is `abstract-only`, which is *eligible to be shown* but is never
 *     presented as established fact: the card carries the study design caveat and
 *     the source's own publication type, and a preprint or a single study is
 *     labelled as such.
 *   - Abstracts remain under the publisher's or the author's terms. The attribution
 *     sentence says so, and the card links to the record instead of inviting reuse.
 *
 * TERMS
 * Europe PMC's REST API is public and asks for reasonable use rather than a key. A
 * single bounded search per run, spaced by the shared rate limiter, with the
 * `resultType=core` shape that includes the abstract.
 */

import { collectionRecordId, rightsAttribution, statusForRights } from '../collection';
import { httpGet } from '../http';
import {
  disabledReport,
  failedReport,
  type AdapterContext,
  type AdapterOutcome,
  type DiscoveryAdapter,
} from './types';
import type { CandidateDraft } from '../../curiosity/reservoir';

const EPMC_API = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';

/** Fields of study, rotated across runs. */
const TOPICS = [
  'sleep deprivation cognition',
  'physical exercise mood',
  'gut microbiome',
  'vaccine immunogenicity',
  'climate heat stress',
  'meditation attention',
  'diet fibre metabolism',
  'antibiotic stewardship',
];

export function europePmcEnabled(): boolean {
  const value = (process.env.CURIOSITY_SCIENCE_SOURCES ?? '').trim().toLowerCase();
  if (value === 'off' || value === 'false' || value === '0') return false;
  return value !== 'europepmc-off';
}

export function europePmcQueryFor(cursor: number): string {
  return TOPICS[Math.abs(Math.trunc(cursor)) % TOPICS.length];
}

export interface EuropePmcRecord {
  id: string;
  title: string;
  authors?: string;
  journal?: string;
  year?: number;
  doi?: string;
  abstract?: string;
  publicationType?: string;
  source?: string;
}

export function parseEuropePmcResponse(json: unknown): EuropePmcRecord[] {
  const list = (json as { resultList?: { result?: unknown } } | undefined)?.resultList?.result;
  if (!Array.isArray(list)) return [];
  const out: EuropePmcRecord[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : '';
    const title = typeof record.title === 'string' ? record.title : '';
    if (!id || !title) continue;
    const year = Number(record.pubYear);
    out.push({
      id,
      title,
      authors: typeof record.authorString === 'string' ? record.authorString : undefined,
      journal: typeof record.journalTitle === 'string' ? record.journalTitle : undefined,
      year: Number.isFinite(year) && year > 1800 ? year : undefined,
      doi: typeof record.doi === 'string' ? record.doi : undefined,
      abstract: typeof record.abstractText === 'string' ? record.abstractText : undefined,
      publicationType: typeof record.pubType === 'string' ? record.pubType : undefined,
      source: typeof record.source === 'string' ? record.source : undefined,
    });
  }
  return out;
}

/**
 * The caveat that must travel with any research record.
 *
 * Different wording for a preprint, a review and a single study, because
 * "a study found" and "a systematic review found" are not the same claim and a
 * reader deserves to know which one they are looking at.
 */
export function researchCaveat(publicationType: string | undefined, journal: string | undefined): string {
  const type = (publicationType ?? '').toLowerCase();
  const venue = journal ? ` in ${journal}` : '';
  if (/preprint|unpublished/.test(type)) {
    return `A preprint${venue}, which has not completed peer review. Treat it as preliminary, not established fact.`;
  }
  if (/review|meta-analysis/.test(type)) {
    return `A review or meta-analysis${venue}. Stronger than one study, but still a summary of evidence rather than a settled conclusion.`;
  }
  return `One peer-reviewed study${venue}. A single result is preliminary until other groups replicate it; it is not established fact.`;
}

export const europePmcAdapter: DiscoveryAdapter = {
  id: 'europepmc',
  name: 'Europe PMC',
  collection: 'science',
  enabled: europePmcEnabled,
  async run(context: AdapterContext): Promise<AdapterOutcome> {
    if (!europePmcEnabled()) {
      return { drafts: [], report: disabledReport(europePmcAdapter, context.nowIso) };
    }
    const cursor = Number(context.cursor) > 0 ? Number(context.cursor) : 0;
    const topic = europePmcQueryFor(cursor);
    const params = new URLSearchParams({
      query: `(${topic}) AND (ABSTRACT:"${topic.split(' ')[0]}") AND SRC:MED`,
      format: 'json',
      resultType: 'core',
      pageSize: '6',
      // Open access is preferred, but the record is metadata-only either way so a
      // closed-access abstract is still usable as a *link* with a caveat.
      sort: 'CITED desc',
    });
    const result = await httpGet(`${EPMC_API}?${params.toString()}`, {
      fetchImpl: context.fetchImpl,
      sleepImpl: context.sleepImpl,
      attempts: 2,
      headers: { accept: 'application/json' },
    });
    if (!result.ok) {
      return { drafts: [], report: failedReport(europePmcAdapter, context.nowIso, result.note) };
    }
    const records = parseEuropePmcResponse(result.json);
    const drafts: CandidateDraft[] = [];
    let rejected = 0;

    for (const record of records) {
      const abstract = (record.abstract ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (abstract.length < 120) {
        // No abstract means a reader cannot judge the claim, and the title alone
        // would be presented as a finding with no context. Skip it.
        rejected += 1;
        continue;
      }
      // A publication year is a fact worth validating: a missing or impossible year
      // is recorded as unknown rather than printed.
      const year = record.year;
      const plausible = typeof year === 'number' && year >= 1900 && year <= new Date().getUTCFullYear();
      const status = statusForRights('abstract-only');
      const canonicalUrl = record.doi
        ? `https://doi.org/${record.doi}`
        : `https://europepmc.org/article/${record.source ?? 'MED'}/${record.id}`;
      const caveat = researchCaveat(record.publicationType, record.journal);
      drafts.push({
        id: collectionRecordId('europepmc', record.id),
        entityId: `europepmc:${record.id}`,
        canonicalUrl,
        category: 'learn-something',
        subcategory: 'research-abstract',
        title: record.title.slice(0, 240),
        description: abstract.slice(0, 900),
        significance: caveat,
        sourceName: 'Europe PMC',
        attribution: rightsAttribution('abstract-only', 'Europe PMC'),
        license: 'Publisher terms; abstract reproduced for reading',
        eventYear: plausible ? year : undefined,
        eventYearLabel: plausible ? `Published ${year}` : undefined,
        aliases: record.authors ? [record.authors] : undefined,
        payload: {
          collection: 'science',
          kind: 'research-abstract',
          language: 'en',
          rights: 'abstract-only',
          rightsStatement: 'Metadata and abstract, under the publisher’s or author’s terms. No full text is stored or reproduced.',
          doi: record.doi,
          authors: record.authors,
          journal: record.journal,
          publicationYear: plausible ? year : undefined,
          publicationType: record.publicationType ?? 'Journal article',
          caveat,
          // The explicit promise this feature is judged on.
          fullTextIncluded: false,
          isEstablishedFact: false,
          quality: /review|meta-analysis/i.test(record.publicationType ?? '') ? 'review' : 'primary-study',
        },
        validationStatus: status.validationStatus,
        validationNotes: status.notes.length > 0 ? status.notes : undefined,
        eligible: status.eligible,
        discoveredAt: context.nowIso,
        updatedAt: context.nowIso,
      });
    }

    return {
      drafts,
      report: {
        sourceId: europePmcAdapter.id,
        sourceName: europePmcAdapter.name,
        status: drafts.length > 0 ? 'ok' : 'partial',
        fetched: records.length,
        accepted: drafts.length,
        rejected,
        duplicates: 0,
        note: drafts.length === 0 ? `no abstract-bearing records for "${topic}"` : undefined,
        finishedAt: context.nowIso,
      },
    };
  },
};

export function europePmcNextCursor(previous: number): string {
  return String((previous + 1) % TOPICS.length);
}
