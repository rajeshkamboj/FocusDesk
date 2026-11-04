/**
 * OpenAlex — the primary breadth and ranking source for science.
 *
 * WHY OPENALEX
 * It is an open catalogue of scholarly works with a stable work id, a DOI, the
 * venue, the authors and their institutions, a citation count, an open-access flag
 * and — for many records — the abstract as an inverted index. That is exactly the
 * metadata the significance scorer needs, it is free to query, and it asks only for
 * an identifying contact (`mailto`) in return.
 *
 * TERMS
 * OpenAlex publishes usage guidance rather than a hard cap: identify yourself,
 * keep your request rate modest, and cache. One request per discipline per run,
 * spaced by the shared rate limiter, with the contact address taken from the
 * repository's existing `OPENALEX_CONTACT_EMAIL` / `WIKIMEDIA_CONTACT_EMAIL`.
 * The metadata is CC0 1.0; the *articles* it points at are not, which is why the
 * adapter imports no article text and the card links to the publisher.
 *
 * WHAT IT DOES NOT DO
 * It does not decide eligibility, score, deduplicate or persist. It reads one
 * response and returns normalised `ScienceRecord`s, or a failed report with a
 * reason. Everything else is the shared pipeline's job.
 */

import { httpGet } from '../http';
import { failedReport } from './types';
import {
  isoDate,
  normalizeDoi,
  doiUrl,
  DISCIPLINE_TERMS,
  type ScienceDiscipline,
  type ScienceRecord,
  type ScienceSourceContext,
  type ScienceSourceOutcome,
} from '../science';

const API = 'https://api.openalex.org/works';

export function openAlexEnabled(): boolean {
  const value = (process.env.CURIOSITY_SCIENCE_SOURCES ?? '').trim().toLowerCase();
  return value !== 'off' && value !== 'false' && value !== '0';
}

/** The polite-pool contact. Optional: keyless use is allowed, just metered. */
export function openAlexContact(): string | undefined {
  return process.env.OPENALEX_CONTACT_EMAIL?.trim() || process.env.WIKIMEDIA_CONTACT_EMAIL?.trim() || undefined;
}

/** Rebuild readable text from OpenAlex's `abstract_inverted_index`. */
export function abstractFromInvertedIndex(index: unknown): string | undefined {
  if (!index || typeof index !== 'object' || Array.isArray(index)) return undefined;
  const positioned: Array<{ position: number; word: string }> = [];
  for (const [word, positions] of Object.entries(index as Record<string, unknown>)) {
    if (!Array.isArray(positions)) continue;
    for (const position of positions) {
      if (typeof position === 'number') positioned.push({ position, word });
    }
  }
  if (positioned.length === 0) return undefined;
  positioned.sort((a, b) => a.position - b.position);
  return positioned.map((entry) => entry.word).join(' ').replace(/\s+/g, ' ').trim();
}

interface OpenAlexWork {
  id?: string;
  doi?: string | null;
  title?: string;
  display_name?: string;
  publication_date?: string;
  type?: string;
  cited_by_count?: number;
  primary_location?: {
    license?: string | null;
    landing_page_url?: string | null;
    source?: { display_name?: string; publisher?: string; type?: string } | null;
  } | null;
  best_oa_location?: { license?: string | null } | null;
  open_access?: { is_oa?: boolean; oa_url?: string | null } | null;
  authorships?: Array<{
    author?: { display_name?: string };
    institutions?: Array<{ display_name?: string }>;
  }>;
  abstract_inverted_index?: unknown;
}

/** Turn one work into a record, or `null` when it cannot be attributed. */
export function recordFromOpenAlexWork(work: OpenAlexWork, discipline: ScienceDiscipline, foundVia: string): ScienceRecord | null {
  const title = (work.title ?? work.display_name ?? '').replace(/\s+/g, ' ').trim();
  if (!title) return null;
  const doi = normalizeDoi(work.doi);
  const landing = work.primary_location?.landing_page_url?.trim();
  const url = doi ? doiUrl(doi) : (landing || (work.id ? work.id.replace('https://openalex.org/', 'https://openalex.org/works/') : ''));
  if (!/^https?:\/\//i.test(url)) return null;

  const authors = (work.authorships ?? [])
    .map((authorship) => authorship.author?.display_name?.trim() ?? '')
    .filter(Boolean);
  const institutions = (work.authorships ?? [])
    .flatMap((authorship) => (authorship.institutions ?? []).map((institution) => institution.display_name?.trim() ?? ''))
    .filter(Boolean);

  const venue = work.primary_location?.source?.display_name?.trim() || undefined;
  const sourceType = (work.primary_location?.source?.type ?? '').toLowerCase();
  const type = (work.type ?? '').toLowerCase();
  const preprint = type === 'preprint' || sourceType === 'repository' || type === 'posted-content';
  const peerReviewed = !preprint && Boolean(venue) && type !== 'paratext';

  return {
    sourceId: 'openalex',
    discipline,
    title,
    doi,
    url,
    publishedOn: isoDate(work.publication_date),
    venue,
    publisher: work.primary_location?.source?.publisher?.trim() || undefined,
    authors,
    institutions: [...new Set(institutions)].slice(0, 6),
    citationCount: typeof work.cited_by_count === 'number' ? work.cited_by_count : undefined,
    type: type || undefined,
    preprint,
    peerReviewed,
    license: work.best_oa_location?.license?.trim() || work.primary_location?.license?.trim() || undefined,
    abstractText: abstractFromInvertedIndex(work.abstract_inverted_index),
    openAccess: work.open_access?.is_oa === true,
    foundVia,
  };
}

export async function fetchOpenAlex(
  discipline: ScienceDiscipline,
  context: ScienceSourceContext,
): Promise<ScienceSourceOutcome> {
  const nowIso = context.nowIso;
  if (!openAlexEnabled()) {
    return {
      records: [],
      report: {
        sourceId: 'openalex',
        sourceName: 'OpenAlex',
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
  const perPage = Math.max(1, Math.min(context.maxRecords ?? 12, 25));

  const params = new URLSearchParams({
    filter: `from_publication_date:${from},to_publication_date:${today},type:article`,
    search: query,
    sort: 'relevance_score:desc',
    'per-page': String(perPage),
  });
  const contact = openAlexContact();
  if (contact) params.set('mailto', contact);
  const url = `${API}?${params.toString()}`;

  const result = await httpGet(url, {
    fetchImpl: context.fetchImpl,
    sleepImpl: context.sleepImpl,
    attempts: 2,
    headers: { accept: 'application/json' },
  });
  if (!result.ok) {
    return { records: [], report: failedReport({ id: 'openalex', name: 'OpenAlex' }, nowIso, result.note) };
  }
  const results = (result.json as { results?: unknown } | undefined)?.results;
  if (!Array.isArray(results)) {
    return {
      records: [],
      report: failedReport({ id: 'openalex', name: 'OpenAlex' }, nowIso, 'response carried no results array'),
    };
  }

  const records: ScienceRecord[] = [];
  let rejected = 0;
  for (const raw of results) {
    if (!raw || typeof raw !== 'object') {
      rejected += 1;
      continue;
    }
    const record = recordFromOpenAlexWork(raw as OpenAlexWork, discipline, `openalex:${query}`);
    if (record) records.push(record);
    else rejected += 1;
  }

  return {
    records,
    report: {
      sourceId: 'openalex',
      sourceName: 'OpenAlex',
      status: records.length > 0 ? 'ok' : 'skipped',
      fetched: results.length,
      accepted: records.length,
      rejected,
      duplicates: 0,
      note: records.length === 0 ? `no usable works for "${query}" between ${from} and ${today}` : undefined,
      finishedAt: nowIso,
    },
  };
}
