/**
 * arXiv — additional physics and chemistry breadth, always labelled a preprint.
 *
 * THE ONE RULE THIS ADAPTER EXISTS TO ENFORCE
 * Everything on arXiv is an unreviewed preprint. It is genuinely useful — it is
 * often months ahead of the journal version — but it may never be presented as a
 * confirmed discovery. So the adapter sets `preprint: true`, the scorer classifies
 * it as such, and the card prints "Preprint — not yet peer-reviewed" in the same
 * block as the title. A journal reference on the record does not change that: the
 * version being linked is the preprint.
 *
 * TERMS
 * arXiv's API guidance asks for a single connection at a time and a delay of about
 * three seconds between requests; `lib/discovery/http.ts` enforces that per host.
 * One request per discipline per run. Metadata is CC0 1.0.
 *
 * PARSING
 * The response is Atom. This reads it with the same bounded regex approach the
 * Standard Ebooks adapter uses rather than adding an XML dependency: the fields
 * needed are few, each optional, and a format change degrades to "no candidates
 * this run" instead of an exception.
 */

import { httpGet } from '../http';
import { failedReport } from './types';
import { isoDate, type ScienceDiscipline, type ScienceRecord } from '../science';
import type { ScienceSourceContext, ScienceSourceOutcome } from '../science';

const API = 'https://export.arxiv.org/api/query';

export function arxivEnabled(): boolean {
  const value = (process.env.CURIOSITY_SCIENCE_SOURCES ?? '').trim().toLowerCase();
  return value !== 'off' && value !== 'false' && value !== '0';
}

/**
 * Categories per discipline. Kept short: arXiv's physics listing is enormous, and
 * a bounded query is both politer and more likely to return something substantive
 * rather than the newest marginal note in an unrelated subfield.
 */
export const ARXIV_CATEGORIES: Record<ScienceDiscipline, readonly string[]> = {
  physics: ['quant-ph', 'cond-mat.mes-hall', 'astro-ph.GA', 'physics.optics'],
  chemistry: ['physics.chem-ph', 'cond-mat.mtrl-sci'],
  biology: ['q-bio.BM', 'q-bio.NC'],
};

export interface ArxivEntry {
  id?: string;
  title?: string;
  summary?: string;
  published?: string;
  updated?: string;
  authors: string[];
  categories: string[];
  /** The `journal_ref` field, when the authors supplied one. Informational only. */
  journalRef?: string;
  license?: string;
  doi?: string;
}

function textOf(xml: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(xml);
  if (!match) return undefined;
  return decode(match[1]).replace(/\s+/g, ' ').trim() || undefined;
}

function decode(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** The Creative Commons URL arXiv publishes, mapped to the vocabulary the scorer reads. */
export function arxivLicense(entryXml: string): string | undefined {
  const href = /<link[^>]*title="license"[^>]*href="([^"]+)"/i.exec(entryXml)?.[1]
    ?? /<link[^>]*href="([^"]+)"[^>]*title="license"/i.exec(entryXml)?.[1];
  if (!href) return undefined;
  const text = href.toLowerCase();
  if (/publicdomain\/zero/.test(text)) return 'cc0';
  if (/licenses\/by-sa/.test(text)) return 'cc-by-sa';
  if (/licenses\/by/.test(text)) return 'cc-by';
  return undefined;
}

export function parseArxivFeed(xml: string): ArxivEntry[] {
  const entries: ArxivEntry[] = [];
  const blocks = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  for (const block of blocks) {
    const rawId = textOf(block, 'id');
    // The Atom id is `http://arxiv.org/abs/2410.01234v2`; the version suffix is
    // dropped so a revised preprint updates its own record instead of adding one.
    const absId = rawId?.replace(/^https?:\/\/arxiv\.org\/abs\//, '').replace(/v\d+$/, '');
    const authors = [...block.matchAll(/<author[\s>][\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi)]
      .map((match) => decode(match[1]).replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const categories = [...block.matchAll(/<category[^>]*term="([^"]+)"/gi)].map((match) => match[1]);
    const doiMatch = /<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/i.exec(block);
    entries.push({
      id: absId,
      title: textOf(block, 'title'),
      summary: textOf(block, 'summary'),
      published: textOf(block, 'published'),
      updated: textOf(block, 'updated'),
      authors,
      categories,
      journalRef: /<arxiv:journal_ref[^>]*>([\s\S]*?)<\/arxiv:journal_ref>/i.exec(block)?.map(decode)[1]?.trim() || undefined,
      license: arxivLicense(block),
      doi: doiMatch ? decode(doiMatch[1]).trim() : undefined,
    });
  }
  return entries;
}

export function recordFromArxivEntry(entry: ArxivEntry, discipline: ScienceDiscipline, foundVia: string): ScienceRecord | null {
  const title = entry.title?.replace(/\s+/g, ' ').trim();
  if (!title || !entry.id) return null;
  return {
    sourceId: 'arxiv',
    discipline,
    title,
    doi: entry.doi && /^10\.\d{4,9}\/\S+$/.test(entry.doi) ? entry.doi.toLowerCase() : undefined,
    url: `https://arxiv.org/abs/${entry.id}`,
    publishedOn: isoDate(entry.published),
    venue: 'arXiv',
    publisher: 'arXiv (Cornell University)',
    authors: entry.authors,
    institutions: [],
    type: 'preprint',
    // The invariant: nothing from arXiv is peer-reviewed, whatever the journal
    // reference field says about a later version.
    preprint: true,
    peerReviewed: false,
    license: entry.license,
    abstractText: entry.summary,
    openAccess: true,
    foundVia,
  };
}

export async function fetchArxiv(
  discipline: ScienceDiscipline,
  context: ScienceSourceContext,
): Promise<ScienceSourceOutcome> {
  const nowIso = context.nowIso;
  if (!arxivEnabled()) {
    return {
      records: [],
      report: {
        sourceId: 'arxiv',
        sourceName: 'arXiv',
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

  const categories = ARXIV_CATEGORIES[discipline];
  const cursor = Math.abs(Number(context.cursor) || 0);
  const category = categories[cursor % categories.length];
  const maxResults = Math.max(1, Math.min(context.maxRecords ?? 8, 20));
  const params = new URLSearchParams({
    search_query: `cat:${category}`,
    sortBy: 'submittedDate',
    sortOrder: 'descending',
    max_results: String(maxResults),
  });

  const result = await httpGet(`${API}?${params.toString()}`, {
    fetchImpl: context.fetchImpl,
    sleepImpl: context.sleepImpl,
    attempts: 1,
    timeoutMs: 12_000,
    headers: { accept: 'application/atom+xml' },
  });
  if (!result.ok) {
    return { records: [], report: failedReport({ id: 'arxiv', name: 'arXiv' }, nowIso, result.note) };
  }

  const entries = parseArxivFeed(result.text);
  if (entries.length === 0) {
    return {
      records: [],
      report: {
        sourceId: 'arxiv',
        sourceName: 'arXiv',
        status: 'skipped',
        fetched: 0,
        accepted: 0,
        rejected: 0,
        duplicates: 0,
        note: `no entries returned for cat:${category}`,
        finishedAt: nowIso,
      },
    };
  }

  const records: ScienceRecord[] = [];
  let rejected = 0;
  for (const entry of entries) {
    const record = recordFromArxivEntry(entry, discipline, `arxiv:${category}`);
    if (record) records.push(record);
    else rejected += 1;
  }

  return {
    records,
    report: {
      sourceId: 'arxiv',
      sourceName: 'arXiv',
      status: records.length > 0 ? 'ok' : 'skipped',
      fetched: entries.length,
      accepted: records.length,
      rejected,
      duplicates: 0,
      note: records.length > 0 ? 'all records are preprints' : undefined,
      finishedAt: nowIso,
    },
  };
}
