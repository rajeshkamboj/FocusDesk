/**
 * Europe PMC — biology and life-science research.
 *
 * WHY IT IS THE BIOLOGY SOURCE OF RECORD
 * Europe PMC indexes MEDLINE and PubMed Central, so a record whose `source` is
 * `MED` is a journal article that the National Library of Medicine's index has
 * accepted — a materially stronger claim than "it has a DOI". It also publishes a
 * per-record licence and, for open-access records, the abstract.
 *
 * TERMS
 * The REST search endpoint is free and does not require a key. The project asks
 * clients to identify themselves and to keep request rates modest; one request per
 * run per discipline, spaced by the shared per-host limiter, satisfies both.
 *
 * RIGHTS
 * The abstract is stored, but `science.ts` decides whether it may be *shown*, and
 * only an explicitly open licence qualifies. A non-open record still becomes a card
 * — metadata and a link — which is the whole point of separating metadata from text.
 */

import { httpGet } from '../http';
import { failedReport } from './types';
import {
  DISCIPLINE_TERMS,
  doiUrl,
  isoDate,
  normalizeDoi,
  type ScienceDiscipline,
  type ScienceRecord,
} from '../science';
import type { ScienceSourceContext, ScienceSourceOutcome } from '../science';

const API = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';

export function europePmcEnabled(): boolean {
  const value = (process.env.CURIOSITY_SCIENCE_SOURCES ?? '').trim().toLowerCase();
  return value !== 'off' && value !== 'false' && value !== '0';
}

interface EuropePmcResult {
  id?: string;
  source?: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title?: string;
  authorString?: string;
  journalTitle?: string;
  bookOrReportDetails?: { publisher?: string };
  pubYear?: string;
  firstPublicationDate?: string;
  isOpenAccess?: string;
  license?: string;
  abstractText?: string;
  pubType?: string;
  pubTypeList?: { pubType?: string[] };
}

/** Europe PMC returns a comma-separated author string. */
export function splitAuthorString(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(/,\s*/)
    .map((name) => name.replace(/\.$/, '').trim())
    .filter((name) => name.length > 1 && !/^(et al|and)$/i.test(name));
}

/**
 * Provenance from the index, not from the title.
 *
 * `source: 'MED'` means the record is in MEDLINE. PMC is the full-text archive and
 * also carries reviewed articles, but it additionally hosts author manuscripts and
 * some non-reviewed material, so it is treated as peer-reviewed only when the
 * record's own `pubType` says "Journal Article" or "research-article".
 */
export function provenanceFromEuropePmc(result: EuropePmcResult): { peerReviewed: boolean; preprint: boolean; type: string } {
  const types = [...(result.pubTypeList?.pubType ?? []), result.pubType ?? '']
    .map((type) => type.toLowerCase())
    .filter(Boolean);
  const type = types[0] ?? '';
  if (types.some((entry) => /preprint/.test(entry))) return { peerReviewed: false, preprint: true, type: type || 'preprint' };
  // `source: 'PPR'` is Europe PMC's preprints index. It is stated by the index rather
  // than by the article's pubType, and a preprints index is exactly as authoritative
  // about preprint status as MEDLINE is about indexing. Treating it as "unknown"
  // would let a preprint reach a card with no preprint label at all.
  if (result.source === 'PPR') return { peerReviewed: false, preprint: true, type: type || 'preprint' };
  const reviewed = types.some((entry) => /journal article|research-article|review-article/.test(entry))
    || result.source === 'MED';
  return { peerReviewed: reviewed, preprint: false, type: type || 'journal-article' };
}

export function recordFromEuropePmcResult(
  result: EuropePmcResult,
  discipline: ScienceDiscipline,
  foundVia: string,
): ScienceRecord | null {
  const title = (result.title ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (title.length === 0) return null;
  const doi = normalizeDoi(result.doi);
  const pmid = typeof result.pmid === 'string' && /^\d+$/.test(result.pmid) ? result.pmid : undefined;
  const url = doi
    ? doiUrl(doi)
    : pmid
      ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
      : typeof result.pmcid === 'string' && result.pmcid
        ? `https://europepmc.org/article/PMC/${result.pmcid.replace(/^PMC/, '')}`
        : '';
  if (!url) return null;

  const classification = provenanceFromEuropePmc(result);

  return {
    sourceId: 'europepmc',
    discipline,
    title,
    doi,
    url,
    // A year-only date is not a publication date; `isoDate` would accept Jan 1 and
    // invent a day, so a year-only record is left undated and the freshness gate
    // rejects it rather than guessing.
    publishedOn: isoDate(result.firstPublicationDate),
    venue: result.journalTitle?.trim() || undefined,
    publisher: result.bookOrReportDetails?.publisher?.trim() || undefined,
    authors: splitAuthorString(result.authorString),
    institutions: [],
    type: classification.type,
    preprint: classification.preprint,
    peerReviewed: classification.peerReviewed,
    license: result.license?.trim() || undefined,
    abstractText: result.abstractText?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || undefined,
    openAccess: (result.isOpenAccess ?? '').toUpperCase() === 'Y',
    foundVia,
  };
}

export async function fetchEuropePmc(
  discipline: ScienceDiscipline,
  context: ScienceSourceContext,
): Promise<ScienceSourceOutcome> {
  const nowIso = context.nowIso;
  if (!europePmcEnabled()) {
    return {
      records: [],
      report: {
        sourceId: 'europepmc',
        sourceName: 'Europe PMC',
        status: 'disabled',
        fetched: 0,
        accepted: 0,
        rejected: 0,
        duplicates: 0,
        note: 'switched off by CURIOSITY_SCIENCE_SOURCES',
        finishedAt: nowIso,
      },
    };
  }

  const today = isoDate(nowIso) ?? nowIso.slice(0, 10);
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - 45 * 86_400_000).toISOString().slice(0, 10);
  const queries = DISCIPLINE_TERMS[discipline].queries;
  const cursor = Math.abs(Number(context.cursor) || 0);
  const query = queries[cursor % queries.length];
  const pageSize = Math.max(1, Math.min(context.maxRecords ?? 10, 25));
  const search = `(${query}) AND (FIRST_PDATE:[${from} TO ${today}]) AND (SRC:MED OR SRC:PMC OR SRC:PPR)`;

  const params = new URLSearchParams({
    query: search,
    format: 'json',
    resultType: 'core',
    pageSize: String(pageSize),
    sort: 'P_PDATE_D desc',
  });

  const result = await httpGet(`${API}?${params.toString()}`, {
    fetchImpl: context.fetchImpl,
    sleepImpl: context.sleepImpl,
    attempts: 2,
    headers: { accept: 'application/json' },
  });
  if (!result.ok) {
    return { records: [], report: failedReport({ id: 'europepmc', name: 'Europe PMC' }, nowIso, result.note) };
  }
  const list = (result.json as { resultList?: { result?: unknown } } | undefined)?.resultList?.result;
  if (!Array.isArray(list)) {
    return {
      records: [],
      report: failedReport({ id: 'europepmc', name: 'Europe PMC' }, nowIso, 'response carried no resultList.result array'),
    };
  }

  const records: ScienceRecord[] = [];
  let rejected = 0;
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') {
      rejected += 1;
      continue;
    }
    const record = recordFromEuropePmcResult(raw as EuropePmcResult, discipline, `europepmc:${query}`);
    if (record) records.push(record);
    else rejected += 1;
  }

  return {
    records,
    report: {
      sourceId: 'europepmc',
      sourceName: 'Europe PMC',
      status: records.length > 0 ? 'ok' : 'skipped',
      fetched: list.length,
      accepted: records.length,
      rejected,
      duplicates: 0,
      note: records.length === 0 ? `no indexed articles for "${query}" since ${from}` : undefined,
      finishedAt: nowIso,
    },
  };
}
