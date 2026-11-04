/**
 * NASA — public-domain imagery and mission media.
 *
 * Uses the NASA Image and Video Library API (`images-api.nasa.gov/search`), which
 * is a plain JSON search endpoint. NASA's media usage guidelines say that most
 * NASA-produced material is **not** covered by copyright and may be used without
 * permission, with two conditions this adapter respects in full: NASA does **not**
 * endorse this project, and any third-party material inside an image (an ESA
 * instrument, a contributed photograph) may not be free. So records are marked
 * `public-domain-asserted`, the card carries the "NASA does not endorse" sentence,
 * and **no media file is copied or re-hosted** — the card links to NASA's own page.
 *
 * TERMS
 * The API is public and needs no key. Requests are bounded (one search per run,
 * a handful of results) and spaced by the shared rate limiter. The `nasa_id` is
 * the stable identifier, so re-runs update rather than duplicate.
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

const NASA_API = 'https://images-api.nasa.gov/search';

/** Missions and phenomena, rotated across runs. */
const QUERIES = [
  'Mars rover',
  'James Webb Space Telescope',
  'International Space Station',
  'Pillars of Creation',
  'Europa',
  'Artemis',
  'black hole',
  'solar corona',
];

export function nasaEnabled(): boolean {
  const value = (process.env.CURIOSITY_SCIENCE_SOURCES ?? '').trim().toLowerCase();
  if (value === 'off' || value === 'false' || value === '0') return false;
  // NASA needs no credentials, but a deployment may choose to exclude it.
  return value !== 'nasa-off';
}

export function nasaQueryFor(cursor: number): string {
  return QUERIES[Math.abs(Math.trunc(cursor)) % QUERIES.length];
}

export interface NasaItem {
  nasaId: string;
  title: string;
  description: string;
  dateCreated?: string;
  center?: string;
  keywords: string[];
  pageUrl: string;
}

/** One item from `collection.items`, flattened. */
export function parseNasaResponse(json: unknown): NasaItem[] {
  const items = (json as { collection?: { items?: unknown } } | undefined)?.collection?.items;
  if (!Array.isArray(items)) return [];
  const out: NasaItem[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const data = (raw as { data?: unknown }).data;
    const first = Array.isArray(data) ? data[0] : undefined;
    if (!first || typeof first !== 'object') continue;
    const record = first as Record<string, unknown>;
    const nasaId = typeof record.nasa_id === 'string' ? record.nasa_id : '';
    const title = typeof record.title === 'string' ? record.title : '';
    if (!nasaId || !title) continue;
    const keywords = Array.isArray(record.keywords) ? record.keywords.map(String) : [];
    out.push({
      nasaId,
      title,
      description: typeof record.description === 'string' ? record.description : '',
      dateCreated: typeof record.date_created === 'string' ? record.date_created : undefined,
      center: typeof record.center === 'string' ? record.center : undefined,
      keywords,
      pageUrl: `https://images.nasa.gov/details/${encodeURIComponent(nasaId)}`,
    });
  }
  return out;
}

export const nasaAdapter: DiscoveryAdapter = {
  id: 'nasa',
  name: 'NASA Image and Video Library',
  collection: 'science',
  enabled: nasaEnabled,
  async run(context: AdapterContext): Promise<AdapterOutcome> {
    if (!nasaEnabled()) {
      return { drafts: [], report: disabledReport(nasaAdapter, context.nowIso) };
    }
    const cursor = Number(context.cursor) > 0 ? Number(context.cursor) : 0;
    const query = nasaQueryFor(cursor);
    const params = new URLSearchParams({ q: query, media_type: 'image', page_size: '8' });
    const result = await httpGet(`${NASA_API}?${params.toString()}`, {
      fetchImpl: context.fetchImpl,
      sleepImpl: context.sleepImpl,
      attempts: 2,
      headers: { accept: 'application/json' },
    });
    if (!result.ok) {
      return { drafts: [], report: failedReport(nasaAdapter, context.nowIso, result.note) };
    }
    const items = parseNasaResponse(result.json);
    const drafts: CandidateDraft[] = [];
    let rejected = 0;

    for (const item of items) {
      const description = item.description.replace(/\s+/g, ' ').trim();
      if (description.length < 60) {
        rejected += 1;
        continue;
      }
      // NASA's own date is the only publication fact stored; a missing or
      // implausible date is recorded as unknown rather than guessed.
      const year = Number((item.dateCreated ?? '').slice(0, 4));
      const plausibleYear = Number.isFinite(year) && year >= 1958 && year <= new Date().getUTCFullYear() + 1;
      const status = statusForRights('public-domain-asserted');
      drafts.push({
        id: collectionRecordId('nasa', item.nasaId),
        entityId: `nasa:${item.nasaId}`,
        canonicalUrl: item.pageUrl,
        category: 'physics',
        subcategory: 'space-science',
        title: item.title.slice(0, 200),
        description: description.slice(0, 700),
        significance: item.center
          ? `Catalogued by ${item.center}. A mission image, not a research finding.`
          : 'A mission image, not a research finding.',
        sourceName: 'NASA',
        attribution: `${rightsAttribution('public-domain-asserted', 'NASA')} NASA does not endorse this project.`,
        license: 'NASA media usage guidelines',
        eventYear: plausibleYear ? year : undefined,
        eventYearLabel: plausibleYear ? `Recorded ${year}` : undefined,
        payload: {
          collection: 'science',
          kind: 'mission-media',
          language: 'en',
          rights: 'public-domain-asserted',
          rightsStatement: 'Most NASA-produced material is not subject to copyright in the United States; third-party elements may be. NASA does not endorse this project.',
          nasaId: item.nasaId,
          dateCreated: plausibleYear ? item.dateCreated : undefined,
          dateVerified: Boolean(plausibleYear),
          center: item.center,
          subjects: item.keywords.slice(0, 8),
          // The image itself stays on NASA's servers.
          mediaCopied: false,
          quality: 'primary-media',
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
        sourceId: nasaAdapter.id,
        sourceName: nasaAdapter.name,
        status: drafts.length > 0 ? 'ok' : 'partial',
        fetched: items.length,
        accepted: drafts.length,
        rejected,
        duplicates: 0,
        note: drafts.length === 0 ? `nothing usable for "${query}"` : undefined,
        finishedAt: context.nowIso,
      },
    };
  },
};

export function nasaNextCursor(previous: number): string {
  return String((previous + 1) % QUERIES.length);
}
