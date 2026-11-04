/**
 * Wikisource — public-domain and freely licensed texts by language.
 *
 * The MediaWiki Action API is used with the same conventions as
 * `lib/curiosity/wikimedia.ts`: an identifying user agent carrying
 * `WIKIMEDIA_CONTACT_EMAIL`, a single bounded request per run, and no scraping.
 * Unlike Curiosity's Wikimedia client, this one only reads Wikisource (so it can
 * request the `extracts` prop against a different host) and it records *licensing
 * per page* rather than assuming one licence for the whole site.
 *
 * RIGHTS
 * Wikisource hosts public-domain texts **and** freely licensed ones (CC BY-SA).
 * They are not the same claim, so the adapter reads each page's categories rather
 * than the site's reputation: a page in a `Public domain` category is
 * `public-domain-verified`, a page naming CC BY/CC BY-SA is `permitted-reuse`, and
 * anything else is stored as `unknown` and never eligible. **No text is imported**
 * — the description is a short abstract from the API, and the card links to the
 * page under the source's own terms.
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

const API = 'https://en.wikisource.org/w/api.php';

/** Languages a reader of this app is likely to want. Bounded on purpose. */
const LANGUAGES = ['en'] as const;

export function wikisourceEnabled(): boolean {
  const value = (process.env.CURIOSITY_LITERATURE_SOURCES ?? '').trim().toLowerCase();
  return value !== 'off' && value !== 'false' && value !== '0';
}

/** Rotate the query so successive runs surface different texts. */
const QUERIES = ['poetry', 'essay', 'novel', 'short story', 'speech', 'memoir', 'play', 'letters'];

export function wikisourceQueryFor(cursor: number): string {
  return QUERIES[Math.abs(Math.trunc(cursor)) % QUERIES.length];
}

export interface WikisourcePage {
  pageid: number;
  title: string;
  extract?: string;
  canonicalUrl?: string;
  categories: string[];
}

/** Turn the Action API response into pages, keeping only what the adapter uses. */
export function parseWikisourceResponse(json: unknown): WikisourcePage[] {
  if (!json || typeof json !== 'object') return [];
  const query = (json as { query?: { pages?: unknown; search?: unknown } }).query;
  if (!query) return [];
  const pages: WikisourcePage[] = [];
  const seen = new Set<number>();

  const push = (raw: Record<string, unknown>): void => {
    const pageid = typeof raw.pageid === 'number' ? raw.pageid : Number(raw.pageid);
    const title = typeof raw.title === 'string' ? raw.title : '';
    if (!Number.isFinite(pageid) || !title || seen.has(pageid)) return;
    if (title.includes(':')) return; // Namespaces (Author:, Portal:, Category:) are not texts.
    seen.add(pageid);
    const categories = Array.isArray(raw.categories)
      ? raw.categories
        .map((entry) => (entry && typeof entry === 'object' ? String((entry as { title?: unknown }).title ?? '') : ''))
        .filter(Boolean)
      : [];
    pages.push({
      pageid,
      title,
      extract: typeof raw.extract === 'string' ? raw.extract : undefined,
      canonicalUrl: typeof raw.canonicalurl === 'string' ? raw.canonicalurl : undefined,
      categories,
    });
  };

  const rawPages = query.pages;
  if (Array.isArray(rawPages)) {
    for (const raw of rawPages) if (raw && typeof raw === 'object') push(raw as Record<string, unknown>);
  } else if (rawPages && typeof rawPages === 'object') {
    for (const raw of Object.values(rawPages)) if (raw && typeof raw === 'object') push(raw as Record<string, unknown>);
  }
  if (Array.isArray(query.search)) {
    for (const raw of query.search) if (raw && typeof raw === 'object') push(raw as Record<string, unknown>);
  }
  return pages;
}

/**
 * Decide reuse status from a page's own categories.
 *
 * This is the whole licensing policy in one function, which is the point: a
 * reviewer can read it and see that nothing is assumed. Order matters — an
 * explicit licence beats a public-domain category, because a page tagged both
 * ways is safest treated as licensed.
 */
export function rightsFromCategories(categories: readonly string[]): 'public-domain-verified' | 'permitted-reuse' | 'unknown' {
  const text = categories.join(' | ').toLowerCase();
  if (/cc[ -]by|creative commons|gfdl/.test(text)) return 'permitted-reuse';
  if (/public domain|pd-old|pd-us/.test(text)) return 'public-domain-verified';
  return 'unknown';
}

export const wikisourceAdapter: DiscoveryAdapter = {
  id: 'wikisource',
  name: 'Wikisource',
  collection: 'literature',
  enabled: wikisourceEnabled,
  async run(context: AdapterContext): Promise<AdapterOutcome> {
    if (!wikisourceEnabled()) {
      return { drafts: [], report: disabledReport(wikisourceAdapter, context.nowIso) };
    }
    const cursor = Number(context.cursor) > 0 ? Number(context.cursor) : 0;
    const query = wikisourceQueryFor(cursor);
    const limit = Math.max(1, Math.min(context.maxRecords ?? 10, 20));
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      generator: 'search',
      gsrsearch: `${query} incategory:"Main topic"`,
      gsrnamespace: '0',
      gsrlimit: String(limit),
      prop: 'extracts|categories|info',
      exintro: '1',
      explaintext: '1',
      exchars: '400',
      cllimit: '20',
      inprop: 'url',
      origin: '*',
    });
    // The category filter above can legitimately return nothing on a small wiki;
    // retry once without it rather than reporting a healthy wiki as broken.
    let result = await httpGet(`${API}?${params.toString()}`, {
      fetchImpl: context.fetchImpl,
      sleepImpl: context.sleepImpl,
      attempts: 2,
      headers: { accept: 'application/json' },
    });
    let pages = result.ok ? parseWikisourceResponse(result.json) : [];
    if (result.ok && pages.length === 0) {
      params.delete('gsrsearch');
      params.set('gsrsearch', query);
      result = await httpGet(`${API}?${params.toString()}`, {
        fetchImpl: context.fetchImpl,
        sleepImpl: context.sleepImpl,
        attempts: 2,
        headers: { accept: 'application/json' },
      });
      pages = result.ok ? parseWikisourceResponse(result.json) : [];
    }
    if (!result.ok) {
      return { drafts: [], report: failedReport(wikisourceAdapter, context.nowIso, result.note) };
    }

    const drafts: CandidateDraft[] = [];
    let rejected = 0;
    for (const page of pages) {
      const canonicalUrl = page.canonicalUrl ?? `https://en.wikisource.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`;
      const extract = (page.extract ?? '').replace(/\s+/g, ' ').trim();
      if (extract.length < 40) {
        // Without a short abstract there is nothing to show but a bare title, and
        // padding one out would mean writing text the source never said.
        rejected += 1;
        continue;
      }
      const rightsStatus = rightsFromCategories(page.categories);
      const status = statusForRights(rightsStatus);
      drafts.push({
        id: collectionRecordId('wikisource', String(page.pageid)),
        entityId: `wikisource:${page.pageid}`,
        canonicalUrl,
        category: 'literature',
        subcategory: 'wikisource-text',
        title: page.title.slice(0, 200),
        description: extract.slice(0, 600),
        significance: 'A text hosted by Wikisource, readable in full at the source.',
        sourceName: 'Wikisource',
        attribution: rightsAttribution(rightsStatus, 'Wikisource'),
        license: rightsStatus === 'permitted-reuse' ? 'CC BY-SA (per page categories)' : rightsStatus === 'public-domain-verified' ? 'Public domain' : undefined,
        payload: {
          collection: 'literature',
          kind: 'text',
          language: LANGUAGES[0],
          rights: rightsStatus,
          rightsStatement: rightsStatus === 'unknown' ? 'No rights category found on the page' : page.categories.slice(0, 6).join('; '),
          wikisourcePageId: page.pageid,
          subjects: page.categories.slice(0, 8),
          excerptImported: false,
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
        sourceId: wikisourceAdapter.id,
        sourceName: wikisourceAdapter.name,
        status: drafts.length > 0 ? 'ok' : 'partial',
        fetched: pages.length,
        accepted: drafts.length,
        rejected,
        duplicates: 0,
        note: drafts.length === 0 ? `the "${query}" search returned no usable texts` : undefined,
        finishedAt: context.nowIso,
      },
    };
  },
};

export function wikisourceNextCursor(previous: number): string {
  return String((previous + 1) % QUERIES.length);
}
