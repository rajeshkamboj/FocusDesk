/**
 * Crossref — DOI and publication verification.
 *
 * WHY THIS EXISTS SEPARATELY FROM ITS SEARCH
 * OpenAlex and Europe PMC are good at *finding* records; Crossref is the
 * registration authority's own view of a DOI. When a candidate carries a DOI,
 * asking Crossref is the cheapest way to answer two questions the scorer depends
 * on:
 *
 *   1. Is this DOI real, and does it name the same work? (title similarity)
 *   2. What does the publisher itself say about the type, the venue and the
 *      licence?
 *
 * The adapter therefore does two jobs: a bounded `query.bibliographic` search for
 * breadth, and `verifyDoi` for the handful of records that survive ranking. A
 * record whose DOI fails verification is **demoted**, never silently upgraded.
 *
 * TERMS
 * Crossref asks for a `mailto` in the query string and a descriptive user agent;
 * both are supplied from the existing contact variables. Metadata is openly
 * available; abstracts are not always, and the licence field is read rather than
 * assumed. No full text is requested.
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

const API = 'https://api.crossref.org/works';

export function crossrefEnabled(): boolean {
  const value = (process.env.CURIOSITY_SCIENCE_SOURCES ?? '').trim().toLowerCase();
  return value !== 'off' && value !== 'false' && value !== '0';
}

export function crossrefContact(): string | undefined {
  return process.env.OPENALEX_CONTACT_EMAIL?.trim() || process.env.WIKIMEDIA_CONTACT_EMAIL?.trim() || undefined;
}

interface CrossrefItem {
  DOI?: string;
  title?: string[];
  'container-title'?: string[];
  publisher?: string;
  type?: string;
  license?: Array<{ URL?: string; 'content-version'?: string }>;
  author?: Array<{ given?: string; family?: string; name?: string; affiliation?: Array<{ name?: string }> }>;
  'is-referenced-by-count'?: number;
  abstract?: string;
  published?: { 'date-parts'?: number[][] };
  'published-online'?: { 'date-parts'?: number[][] };
  'published-print'?: { 'date-parts'?: number[][] };
  issued?: { 'date-parts'?: number[][] };
}

/** Crossref dates are `[[2026, 10, 3]]`, and any component may be missing. */
export function crossrefDate(item: CrossrefItem): string | undefined {
  for (const candidate of [item.published, item['published-online'], item['published-print'], item.issued]) {
    const parts = candidate?.['date-parts']?.[0];
    if (!Array.isArray(parts) || typeof parts[0] !== 'number') continue;
    const [year, month, day] = parts;
    if (typeof month !== 'number' || typeof day !== 'number') continue;
    const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const parsed = isoDate(iso);
    if (parsed) return parsed;
  }
  return undefined;
}

/** The licence string Crossref's URL implies, in the vocabulary the scorer reads. */
export function licenseFromCrossref(licenseUrls: readonly string[] | undefined): string | undefined {
  const joined = (licenseUrls ?? []).join(' ').toLowerCase();
  if (!joined) return undefined;
  if (/creativecommons\.org\/publicdomain\/zero/.test(joined)) return 'cc0';
  if (/creativecommons\.org\/licenses\/by-sa/.test(joined)) return 'cc-by-sa';
  if (/creativecommons\.org\/licenses\/by\//.test(joined)) return 'cc-by';
  if (/creativecommons\.org\/licenses\/by-nc/.test(joined)) return 'cc-by-nc';
  return undefined;
}

function authorNames(item: CrossrefItem): string[] {
  return (item.author ?? [])
    .map((author) => {
      if (author.name?.trim()) return author.name.trim();
      return [author.given?.trim(), author.family?.trim()].filter(Boolean).join(' ');
    })
    .filter(Boolean);
}

/** Strip the JATS markup Crossref sometimes embeds in its abstract field. */
function cleanAbstract(raw?: string): string | undefined {
  if (!raw) return undefined;
  const text = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return text || undefined;
}

export function recordFromCrossrefItem(
  item: CrossrefItem,
  discipline: ScienceDiscipline,
  foundVia: string,
): ScienceRecord | null {
  const title = (item.title ?? []).join(' ').replace(/\s+/g, ' ').trim();
  const doi = normalizeDoi(item.DOI);
  if (!title || !doi) return null;
  const venue = (item['container-title'] ?? []).join(' ').trim() || undefined;
  const type = (item.type ?? '').toLowerCase();
  const preprint = type === 'posted-content';
  const peerReviewed = type === 'journal-article' && Boolean(venue);
  return {
    sourceId: 'crossref',
    discipline,
    title,
    doi,
    url: doiUrl(doi),
    publishedOn: crossrefDate(item),
    venue,
    publisher: item.publisher?.trim() || undefined,
    authors: authorNames(item),
    institutions: [...new Set((item.author ?? []).flatMap((author) => (author.affiliation ?? []).map((entry) => entry.name?.trim() ?? '')).filter(Boolean))].slice(0, 6),
    citationCount: typeof item['is-referenced-by-count'] === 'number' ? item['is-referenced-by-count'] : undefined,
    type: type || undefined,
    preprint,
    peerReviewed,
    license: licenseFromCrossref((item.license ?? []).map((entry) => entry.URL ?? '')),
    abstractText: cleanAbstract(item.abstract),
    foundVia,
  };
}

export async function fetchCrossref(
  discipline: ScienceDiscipline,
  context: ScienceSourceContext,
): Promise<ScienceSourceOutcome> {
  const nowIso = context.nowIso;
  if (!crossrefEnabled()) {
    return {
      records: [],
      report: {
        sourceId: 'crossref',
        sourceName: 'Crossref',
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
  const rows = Math.max(1, Math.min(context.maxRecords ?? 8, 20));

  const params = new URLSearchParams({
    filter: `from-pub-date:${from},type:journal-article`,
    'query.bibliographic': query,
    rows: String(rows),
    select: 'DOI,title,container-title,publisher,type,license,author,is-referenced-by-count,abstract,published,published-online,published-print,issued',
  });
  const contact = crossrefContact();
  if (contact) params.set('mailto', contact);

  const result = await httpGet(`${API}?${params.toString()}`, {
    fetchImpl: context.fetchImpl,
    sleepImpl: context.sleepImpl,
    attempts: 2,
    headers: { accept: 'application/json' },
  });
  if (!result.ok) {
    return { records: [], report: failedReport({ id: 'crossref', name: 'Crossref' }, nowIso, result.note) };
  }
  const items = (result.json as { message?: { items?: unknown } } | undefined)?.message?.items;
  if (!Array.isArray(items)) {
    return {
      records: [],
      report: failedReport({ id: 'crossref', name: 'Crossref' }, nowIso, 'response carried no message.items array'),
    };
  }

  const records: ScienceRecord[] = [];
  let rejected = 0;
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') {
      rejected += 1;
      continue;
    }
    const record = recordFromCrossrefItem(raw as CrossrefItem, discipline, `crossref:${query}`);
    if (record) records.push(record);
    else rejected += 1;
  }

  return {
    records,
    report: {
      sourceId: 'crossref',
      sourceName: 'Crossref',
      status: records.length > 0 ? 'ok' : 'skipped',
      fetched: items.length,
      accepted: records.length,
      rejected,
      duplicates: 0,
      note: records.length === 0 ? `no journal articles for "${query}" since ${from}` : undefined,
      finishedAt: nowIso,
    },
  };
}

export interface CrossrefVerification {
  verified: boolean;
  /** Why verification failed, for the run log. */
  note?: string;
  /** Metadata that only the registration authority can confirm. */
  peerReviewed?: boolean;
  venue?: string;
  publisher?: string;
  license?: string;
  publishedOn?: string;
  authors?: string[];
  type?: string;
}

/**
 * Ask Crossref whether a DOI is real and whether it names the same work.
 *
 * A wrong-but-valid DOI is the failure mode that matters: it would attach a card
 * to somebody else's paper. So the title is compared as well as the status, and a
 * mismatch demotes the record rather than replacing its title.
 */
export async function verifyDoiWithCrossref(
  doi: string,
  expectedTitle: string,
  context: { fetchImpl?: typeof fetch; sleepImpl?: (ms: number) => Promise<void> },
): Promise<CrossrefVerification> {
  const normalized = normalizeDoi(doi);
  if (!normalized) return { verified: false, note: 'not a DOI' };
  const params = new URLSearchParams();
  const contact = crossrefContact();
  if (contact) params.set('mailto', contact);
  const suffix = params.toString() ? `?${params.toString()}` : '';

  const result = await httpGet(`${API}/${encodeURIComponent(normalized)}${suffix}`, {
    fetchImpl: context.fetchImpl,
    sleepImpl: context.sleepImpl,
    attempts: 1,
    timeoutMs: 6_000,
    headers: { accept: 'application/json' },
  });
  if (!result.ok) return { verified: false, note: `Crossref lookup failed (${result.note})` };

  const message = (result.json as { message?: CrossrefItem } | undefined)?.message;
  if (!message) return { verified: false, note: 'Crossref returned no message' };

  const title = (message.title ?? []).join(' ').replace(/\s+/g, ' ').trim();
  const expected = expectedTitle.replace(/\s+/g, ' ').trim();
  const verified = titleLooksSame(expected, title);
  return {
    verified,
    ...(verified ? {} : { note: `Crossref title differs: "${title.slice(0, 90)}"` }),
    peerReviewed: (message.type ?? '').toLowerCase() === 'journal-article',
    venue: (message['container-title'] ?? []).join(' ').trim() || undefined,
    publisher: message.publisher?.trim() || undefined,
    license: licenseFromCrossref((message.license ?? []).map((entry) => entry.URL ?? '')),
    publishedOn: crossrefDate(message),
    authors: authorNames(message),
    type: (message.type ?? '').toLowerCase() || undefined,
  };
}

/**
 * A tolerant title comparison: DOIs occasionally resolve to a differently
 * punctuated title ("α-synuclein" vs "alpha-synuclein"), and a strict equality
 * check would demote good records. Overlap is measured on words of four or more
 * characters, and 60% shared is enough at this length.
 */
export function titleLooksSame(left: string, right: string): boolean {
  const words = (value: string): Set<string> =>
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length >= 4),
    );
  const a = words(left);
  const b = words(right);
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / Math.min(a.size, b.size) >= 0.6;
}
