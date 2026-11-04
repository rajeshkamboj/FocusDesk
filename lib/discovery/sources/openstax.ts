/**
 * OpenStax — openly licensed textbooks.
 *
 * OpenStax publishes its catalogue through a documented JSON API
 * (`/apps/cms/api/v2/books`) that lists openly licensed titles. Their books are
 * licensed **CC BY 4.0**, which permits reuse with attribution — so this adapter is
 * the one place a record may quote a little more than a title: it stores the book's
 * own summary and the licence name, and links to the free book.
 *
 * It does not store chapters, sections or exercises. CC BY would permit that with
 * attribution, but a book is not a discovery item and importing one would turn a
 * reading card into a content mirror of somebody else's product.
 *
 * TERMS
 * One catalogue request per run, spaced, with an identifying user agent. If the
 * API shape changes the adapter reports a failure rather than guessing.
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

const OPENSTAX_API = 'https://openstax.org/apps/cms/api/v2/books/';

export function openStaxEnabled(): boolean {
  const value = (process.env.CURIOSITY_SCIENCE_SOURCES ?? '').trim().toLowerCase();
  if (value === 'off' || value === 'false' || value === '0') return false;
  return value !== 'openstax-off';
}

export interface OpenStaxBook {
  slug: string;
  title: string;
  summary: string;
  license?: string;
  subject?: string;
  /** Named contributors when the catalogue lists them. */
  authors?: string;
  bookUrl: string;
}

/** The API returns either an array or `{ items: [...] }`; accept both. */
export function parseOpenStaxResponse(json: unknown): OpenStaxBook[] {
  const root = json as { items?: unknown } | unknown[] | undefined;
  const list = Array.isArray(root) ? root : Array.isArray((root as { items?: unknown })?.items) ? (root as { items: unknown[] }).items : [];
  const books: OpenStaxBook[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title : '';
    const slug = typeof record.slug === 'string' ? record.slug : typeof record.book_slug === 'string' ? record.book_slug : '';
    if (!title || !slug) continue;
    const summary = typeof record.summary === 'string'
      ? record.summary
      : typeof record.description === 'string'
        ? record.description
        : '';
    const license = typeof record.license === 'string'
      ? record.license
      : typeof record.license_name === 'string'
        ? record.license_name
        : undefined;
    const subject = typeof record.subject === 'string'
      ? record.subject
      : typeof record.subject_name === 'string'
        ? record.subject_name
        : undefined;
    // The catalogue lists contributors either as an array of names or as one
    // string. When it lists none, the corporate author is the publisher — stated
    // as such rather than left blank, because a textbook with no authorship at all
    // would be rejected downstream.
    const rawAuthors = record.authors ?? record.author;
    const authors = Array.isArray(rawAuthors)
      ? rawAuthors
        .map((entry) => (entry && typeof entry === 'object' ? String((entry as { name?: unknown }).name ?? '') : String(entry)))
        .filter(Boolean)
        .join(', ')
      : typeof rawAuthors === 'string'
        ? rawAuthors
        : '';

    books.push({
      slug,
      title,
      summary: summary.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      license,
      subject,
      authors: authors || 'OpenStax (corporate author)',
      bookUrl: `https://openstax.org/details/books/${encodeURIComponent(slug)}`,
    });
  }
  return books;
}

export const openStaxAdapter: DiscoveryAdapter = {
  id: 'openstax',
  name: 'OpenStax',
  collection: 'science',
  enabled: openStaxEnabled,
  async run(context: AdapterContext): Promise<AdapterOutcome> {
    if (!openStaxEnabled()) {
      return { drafts: [], report: disabledReport(openStaxAdapter, context.nowIso) };
    }
    const result = await httpGet(OPENSTAX_API, {
      fetchImpl: context.fetchImpl,
      sleepImpl: context.sleepImpl,
      attempts: 2,
      headers: { accept: 'application/json' },
    });
    if (!result.ok) {
      return { drafts: [], report: failedReport(openStaxAdapter, context.nowIso, result.note) };
    }
    const books = parseOpenStaxResponse(result.json);
    const drafts: CandidateDraft[] = [];
    let rejected = 0;
    const limit = Math.max(1, Math.min(context.maxRecords ?? 8, 20));
    const startIndex = Number(context.cursor) > 0 && books.length > 0 ? Number(context.cursor) % books.length : 0;
    const slice: OpenStaxBook[] = [];
    for (let offset = 0; offset < Math.min(limit, books.length); offset += 1) {
      slice.push(books[(startIndex + offset) % books.length]);
    }

    for (const book of slice) {
      if (book.summary.length < 40) {
        // No summary, no card: a textbook title alone is not something a reader can
        // judge, and the licence claim would be the only other thing to show.
        rejected += 1;
        continue;
      }
      // A missing licence is *unknown*, not the project's usual one. Asserting
      // "CC BY 4.0" because that is what OpenStax normally uses would be inventing
      // a licence claim from a habit rather than from the record.
      const licenseName = book.license?.trim();
      const openLicence = typeof licenseName === 'string'
        && /cc[ -]by|creative commons|cc0|public domain/i.test(licenseName);
      const status = statusForRights(openLicence ? 'permitted-reuse' : 'unknown');
      drafts.push({
        id: collectionRecordId('openstax', book.slug),
        entityId: `openstax:${book.slug}`,
        canonicalUrl: book.bookUrl,
        category: 'learn-something',
        subcategory: 'open-textbook',
        title: book.title.slice(0, 200),
        description: book.summary.slice(0, 700),
        significance: 'A free, openly licensed textbook — useful for going past an explainer.',
        sourceName: 'OpenStax',
        attribution: rightsAttribution(openLicence ? 'permitted-reuse' : 'unknown', 'OpenStax'),
        license: licenseName,
        payload: {
          collection: 'science',
          kind: 'textbook',
          language: 'en',
          rights: openLicence ? 'permitted-reuse' : 'unknown',
          rightsStatement: licenseName
            ? `${licenseName}, per the OpenStax catalogue.`
            : 'The catalogue did not state a licence for this title.',
          openstaxSlug: book.slug,
          author: book.authors,
          subject: book.subject,
          // Chapter text is not imported; the book is linked.
          excerptImported: false,
          quality: 'textbook',
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
        sourceId: openStaxAdapter.id,
        sourceName: openStaxAdapter.name,
        status: drafts.length > 0 ? 'ok' : 'partial',
        fetched: books.length,
        accepted: drafts.length,
        rejected,
        duplicates: 0,
        note: drafts.length === 0 ? 'the catalogue returned no usable summaries' : undefined,
        finishedAt: context.nowIso,
      },
    };
  },
};

export function openStaxNextCursor(previous: number, pageSize: number, total: number): string {
  if (total <= 0) return '0';
  return String((previous + pageSize) % total);
}
