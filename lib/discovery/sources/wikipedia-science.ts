/**
 * Wikipedia + Wikidata — science explainers.
 *
 * Reuses the *same* two endpoints Curiosity already reads, with the same polite
 * conventions, but queries science topics and resolves each article's Wikidata
 * entity so the record carries a stable identifier (QID) that survives title
 * changes. That QID is what makes cross-source deduplication possible: the same
 * concept arriving from Wikipedia and from Wikidata is one record, not two.
 *
 * RIGHTS
 * Wikipedia text is CC BY-SA 4.0 and Wikidata is CC0. Both are `permitted-reuse`
 * — recorded per record, with the attribution sentence the card shows, so a
 * reader can follow the licence. Only the intro extract is stored, capped at a few
 * hundred characters, and the card links to the article rather than reproducing
 * it.
 *
 * TERMS
 * The Wikimedia Foundation asks for an identifying user agent with contact
 * details (already supported through `WIKIMEDIA_CONTACT_EMAIL`), no more than one
 * request per second per host (enforced by the shared rate limiter) and no
 * scraping of page HTML (this uses the Action API only).
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

const WIKI_API = 'https://en.wikipedia.org/w/api.php';

/** Science topics worth an explainer, rotated so runs do not repeat. */
const TOPICS = [
  'photosynthesis',
  'plate tectonics',
  'immunology',
  'thermodynamics',
  'quantum entanglement',
  'protein folding',
  'CRISPR',
  'ocean acidification',
  'neuroplasticity',
  'dark matter',
  'antibiotic resistance',
  'Entropy',
  'circadian rhythm',
  'coral reef',
  'gravitational wave',
  'enzyme kinetics',
];

export function wikipediaScienceEnabled(): boolean {
  const value = (process.env.CURIOSITY_SCIENCE_SOURCES ?? '').trim().toLowerCase();
  return value !== 'off' && value !== 'false' && value !== '0';
}

export function scienceTopicFor(cursor: number): string {
  return TOPICS[Math.abs(Math.trunc(cursor)) % TOPICS.length];
}

export interface WikiSciencePage {
  pageid: number;
  title: string;
  extract?: string;
  canonicalUrl?: string;
  wikidataId?: string;
  description?: string;
}

export function parseWikipediaScienceResponse(json: unknown): WikiSciencePage[] {
  if (!json || typeof json !== 'object') return [];
  const query = (json as { query?: { pages?: unknown } }).query;
  if (!query?.pages) return [];
  const rawPages = Array.isArray(query.pages) ? query.pages : Object.values(query.pages as Record<string, unknown>);
  const pages: WikiSciencePage[] = [];
  for (const raw of rawPages) {
    if (!raw || typeof raw !== 'object') continue;
    const page = raw as Record<string, unknown>;
    const pageid = Number(page.pageid);
    const title = typeof page.title === 'string' ? page.title : '';
    if (!Number.isFinite(pageid) || !title) continue;
    pages.push({
      pageid,
      title,
      extract: typeof page.extract === 'string' ? page.extract : undefined,
      canonicalUrl: typeof page.canonicalurl === 'string' ? page.canonicalurl : undefined,
      wikidataId: typeof page.pageprops === 'object' && page.pageprops
        ? (typeof (page.pageprops as Record<string, unknown>).wikibase_item === 'string'
          ? String((page.pageprops as Record<string, unknown>).wikibase_item)
          : undefined)
        : undefined,
      description: typeof page.description === 'string' ? page.description : undefined,
    });
  }
  return pages;
}

export const wikipediaScienceAdapter: DiscoveryAdapter = {
  id: 'wikipedia-science',
  name: 'Wikipedia',
  collection: 'science',
  enabled: wikipediaScienceEnabled,
  async run(context: AdapterContext): Promise<AdapterOutcome> {
    if (!wikipediaScienceEnabled()) {
      return { drafts: [], report: disabledReport(wikipediaScienceAdapter, context.nowIso) };
    }
    const cursor = Number(context.cursor) > 0 ? Number(context.cursor) : 0;
    const topic = scienceTopicFor(cursor);
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      titles: topic,
      prop: 'extracts|pageprops|info|description',
      exintro: '1',
      explaintext: '1',
      exchars: '700',
      inprop: 'url',
      redirects: '1',
      origin: '*',
    });
    const result = await httpGet(`${WIKI_API}?${params.toString()}`, {
      fetchImpl: context.fetchImpl,
      sleepImpl: context.sleepImpl,
      attempts: 2,
      headers: { accept: 'application/json' },
    });
    if (!result.ok) {
      return { drafts: [], report: failedReport(wikipediaScienceAdapter, context.nowIso, result.note) };
    }
    const pages = parseWikipediaScienceResponse(result.json);
    const drafts: CandidateDraft[] = [];
    let rejected = 0;
    for (const page of pages) {
      const extract = (page.extract ?? '').replace(/\s+/g, ' ').trim();
      if (extract.length < 80) {
        rejected += 1;
        continue;
      }
      // A disambiguation page is not an explainer.
      if (/\bmay refer to\b/i.test(extract.slice(0, 160))) {
        rejected += 1;
        continue;
      }
      const status = statusForRights('permitted-reuse');
      const canonicalUrl = page.canonicalUrl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`;
      drafts.push({
        id: collectionRecordId('wikipedia-science', page.wikidataId ?? String(page.pageid)),
        entityId: page.wikidataId ? `wikidata:${page.wikidataId}` : `wikipedia:${page.pageid}`,
        canonicalUrl,
        category: 'one-thing',
        subcategory: 'science-explainer',
        title: page.title.slice(0, 200),
        description: extract.slice(0, 900),
        significance: 'An encyclopaedic introduction, useful as a starting point rather than a primary source.',
        sourceName: 'Wikipedia',
        attribution: rightsAttribution('permitted-reuse', 'Wikipedia'),
        license: 'CC BY-SA 4.0',
        aliases: page.description ? [page.description] : undefined,
        payload: {
          collection: 'science',
          kind: 'explainer',
          language: 'en',
          rights: 'permitted-reuse',
          rightsStatement: 'Wikipedia text is licensed CC BY-SA 4.0; attribution and the licence link travel with the card.',
          // Halfway between metadata and full text: the intro only, never the article.
          excerptKind: 'intro-extract',
          wikidataId: page.wikidataId,
          wikipediaPageId: page.pageid,
          quality: 'tertiary',
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
        sourceId: wikipediaScienceAdapter.id,
        sourceName: wikipediaScienceAdapter.name,
        status: drafts.length > 0 ? 'ok' : 'partial',
        fetched: pages.length,
        accepted: drafts.length,
        rejected,
        duplicates: 0,
        note: drafts.length === 0 ? `no usable extract for "${topic}"` : undefined,
        finishedAt: context.nowIso,
      },
    };
  },
};

export function wikipediaScienceNextCursor(previous: number): string {
  return String((previous + 1) % TOPICS.length);
}

/* ------------------------------------------------------------------ */
/* Wikidata                                                           */
/* ------------------------------------------------------------------ */

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';

/**
 * Wikidata is used for *labels and identifiers*, not prose: it proves a concept is
 * a real, identifiable entity (a QID) and gives its descriptions in several
 * languages. A Wikidata-only record is thinner than a Wikipedia one, so it is
 * stored as the same concept with the same entity id — which means the reservoir
 * correctly treats the two as one work.
 */
export const wikidataScienceAdapter: DiscoveryAdapter = {
  id: 'wikidata',
  name: 'Wikidata',
  collection: 'science',
  enabled: wikipediaScienceEnabled,
  async run(context: AdapterContext): Promise<AdapterOutcome> {
    if (!wikipediaScienceEnabled()) {
      return { drafts: [], report: disabledReport(wikidataScienceAdapter, context.nowIso) };
    }
    const cursor = Number(context.cursor) > 0 ? Number(context.cursor) : 0;
    const topic = scienceTopicFor(cursor);
    const params = new URLSearchParams({
      action: 'wbsearchentities',
      format: 'json',
      language: 'en',
      uselang: 'en',
      search: topic,
      limit: '3',
      origin: '*',
    });
    const result = await httpGet(`${WIKIDATA_API}?${params.toString()}`, {
      fetchImpl: context.fetchImpl,
      sleepImpl: context.sleepImpl,
      attempts: 2,
      headers: { accept: 'application/json' },
    });
    if (!result.ok) {
      return { drafts: [], report: failedReport(wikidataScienceAdapter, context.nowIso, result.note) };
    }
    const search = (result.json as { search?: unknown } | undefined)?.search;
    if (!Array.isArray(search)) {
      return {
        drafts: [],
        report: {
          sourceId: wikidataScienceAdapter.id,
          sourceName: wikidataScienceAdapter.name,
          status: 'failed',
          fetched: 0,
          accepted: 0,
          rejected: 0,
          duplicates: 0,
          note: 'the entity search returned no readable result set',
          finishedAt: context.nowIso,
        },
      };
    }

    const drafts: CandidateDraft[] = [];
    let rejected = 0;
    for (const raw of search.slice(0, 3)) {
      if (!raw || typeof raw !== 'object') continue;
      const entity = raw as Record<string, unknown>;
      const qid = typeof entity.id === 'string' ? entity.id : '';
      const label = typeof entity.label === 'string' ? entity.label : '';
      const description = typeof entity.description === 'string' ? entity.description : '';
      if (!/^Q\d+$/.test(qid) || !label || description.length < 20) {
        rejected += 1;
        continue;
      }
      const status = statusForRights('permitted-reuse');
      drafts.push({
        id: collectionRecordId('wikidata', qid),
        entityId: `wikidata:${qid}`,
        canonicalUrl: `https://www.wikidata.org/wiki/${qid}`,
        category: 'one-thing',
        subcategory: 'science-entity',
        title: label.slice(0, 200),
        description: description.slice(0, 400),
        significance: `An identified concept (${qid}) with a stable Wikidata record.`,
        sourceName: 'Wikidata',
        attribution: rightsAttribution('permitted-reuse', 'Wikidata'),
        license: 'CC0 1.0',
        payload: {
          collection: 'science',
          kind: 'entity',
          language: 'en',
          rights: 'permitted-reuse',
          rightsStatement: 'Wikidata data is released under CC0 1.0.',
          wikidataId: qid,
          quality: 'index',
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
        sourceId: wikidataScienceAdapter.id,
        sourceName: wikidataScienceAdapter.name,
        status: drafts.length > 0 ? 'ok' : 'partial',
        fetched: search.length,
        accepted: drafts.length,
        rejected,
        duplicates: 0,
        note: drafts.length === 0 ? `no entity with a usable description for "${topic}"` : undefined,
        finishedAt: context.nowIso,
      },
    };
  },
};
