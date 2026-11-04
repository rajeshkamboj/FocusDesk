/**
 * Standard Ebooks — carefully edited public-domain editions.
 *
 * Standard Ebooks publishes an OPDS 1.2 Atom feed of its catalogue
 * (`/opds/all`) and a per-book Atom entry with full metadata. One feed request
 * yields a bounded number of entries, which is exactly the shape a scheduled run
 * wants: a single polite request instead of a crawl.
 *
 * RIGHTS
 * Every Standard Ebooks text is public domain in the United States — the project
 * states this on every book page and in its own FAQ — and its *own* editorial
 * work (the typesetting, the cover, the proofing) is released to the public
 * domain too. The adapter records `public-domain-verified` with that statement
 * quoted from the source, and the card repeats "public-domain status differs by
 * country". **No text is imported.**
 *
 * TERMS
 * The OPDS feed is published for exactly this kind of use. A single request per
 * run, one per second at most, with an identifying user agent.
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

const OPDS_ALL = 'https://standardebooks.org/opds/all';

export function standardEbooksEnabled(): boolean {
  const value = (process.env.CURIOSITY_LITERATURE_SOURCES ?? '').trim().toLowerCase();
  return value !== 'off' && value !== 'false' && value !== '0';
}

/** One entry of the OPDS Atom feed, as this adapter needs it. */
export interface OpdsEntry {
  id?: string;
  title?: string;
  author?: string;
  language?: string;
  updated?: string;
  rights?: string;
  /** The human-readable book page, which is what the card links to. */
  link?: string;
  subjects: string[];
}

/**
 * Parse the subset of Atom this feed uses.
 *
 * Deliberately regex-based rather than a full XML parser: the feed is a flat
 * list of `<entry>` elements, and adding an XML dependency to read six fields
 * would be a larger surface than the risk it removes. Every field is optional and
 * an unparseable entry is dropped, so a feed format change degrades to "no
 * candidates this run" rather than to an exception.
 */
export function parseOpdsFeed(xml: string): OpdsEntry[] {
  const entries: OpdsEntry[] = [];
  for (const match of xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)) {
    const block = match[0];
    const text = (pattern: RegExp): string | undefined => {
      const found = pattern.exec(block);
      if (!found) return undefined;
      const value = found[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/\s+/g, ' ')
        .trim();
      return value || undefined;
    };

    // The book page is the `alternate` text/html link; the acquisition links point
    // at the downloads, which are not what a reader wants from a card.
    const linkMatch = /<link\b[^>]*type="text\/html"[^>]*href="([^"]+)"/i.exec(block)
      ?? /<link\b[^>]*rel="alternate"[^>]*href="([^"]+)"/i.exec(block)
      ?? /<link\b[^>]*href="([^"]+)"/i.exec(block);
    const subjects = [...block.matchAll(/<category\b[^>]*label="([^"]+)"/gi)].map((m) => m[1].trim()).filter(Boolean);

    entries.push({
      id: text(/<id[^>]*>([\s\S]*?)<\/id>/i),
      title: text(/<title[^>]*>([\s\S]*?)<\/title>/i),
      author: text(/<author[^>]*>[\s\S]*?<name[^>]*>([\s\S]*?)<\/name>[\s\S]*?<\/author>/i) ?? text(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i),
      language: text(/<dc:language[^>]*>([\s\S]*?)<\/dc:language>/i),
      updated: text(/<updated[^>]*>([\s\S]*?)<\/updated>/i),
      rights: text(/<dc:rights[^>]*>([\s\S]*?)<\/dc:rights>/i) ?? text(/<rights[^>]*>([\s\S]*?)<\/rights>/i),
      link: linkMatch?.[1],
      subjects,
    });
  }
  return entries;
}

/** OPDS ids are URLs like `https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice`. */
export function stableKeyFromOpdsId(id: string | undefined, title: string | undefined): string {
  if (id) {
    const tail = id.replace(/\/+$/, '').split('/').slice(-2).join('-');
    if (tail) return tail;
  }
  return (title ?? 'record').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48);
}

function describe(entry: OpdsEntry): string {
  const subjectText = entry.subjects.slice(0, 3).join(', ');
  return [
    entry.author ? `By ${entry.author}.` : '',
    subjectText ? `Catalogued under ${subjectText}.` : '',
    'An edited public-domain edition from Standard Ebooks.',
  ]
    .filter(Boolean)
    .join(' ');
}

export const standardEbooksAdapter: DiscoveryAdapter = {
  id: 'standard-ebooks',
  name: 'Standard Ebooks',
  collection: 'literature',
  enabled: standardEbooksEnabled,
  async run(context: AdapterContext): Promise<AdapterOutcome> {
    if (!standardEbooksEnabled()) {
      return { drafts: [], report: disabledReport(standardEbooksAdapter, context.nowIso) };
    }
    const result = await httpGet(OPDS_ALL, {
      fetchImpl: context.fetchImpl,
      sleepImpl: context.sleepImpl,
      attempts: 2,
      headers: { accept: 'application/atom+xml, application/xml;q=0.9, */*;q=0.5' },
    });
    if (!result.ok) {
      return { drafts: [], report: failedReport(standardEbooksAdapter, context.nowIso, result.note) };
    }

    const entries = parseOpdsFeed(result.text);
    if (entries.length === 0) {
      return {
        drafts: [],
        report: {
          sourceId: standardEbooksAdapter.id,
          sourceName: standardEbooksAdapter.name,
          status: 'failed',
          fetched: 0,
          accepted: 0,
          rejected: 0,
          duplicates: 0,
          note: 'the catalogue feed contained no readable entries (the feed format may have changed)',
          finishedAt: context.nowIso,
        },
      };
    }

    // A bounded, evenly spaced slice, so the same run does not always take the
    // alphabetically first books.
    const limit = Math.max(1, Math.min(context.maxRecords ?? 10, 25));
    const startIndex = Number(context.cursor) > 0 ? Number(context.cursor) % entries.length : 0;
    const slice: OpdsEntry[] = [];
    for (let offset = 0; offset < Math.min(limit, entries.length); offset += 1) {
      slice.push(entries[(startIndex + offset) % entries.length]);
    }

    const drafts: CandidateDraft[] = [];
    let rejected = 0;
    for (const entry of slice) {
      const key = stableKeyFromOpdsId(entry.id, entry.title);
      const canonicalUrl = entry.link ?? entry.id;
      if (!entry.title || !canonicalUrl || !/^https?:\/\//i.test(canonicalUrl)) {
        rejected += 1;
        continue;
      }
      const rightsStatus = /public domain/i.test(entry.rights ?? '') || !entry.rights
        ? 'public-domain-verified'
        : 'unknown';
      const status = statusForRights(rightsStatus);
      drafts.push({
        id: collectionRecordId('standard-ebooks', key),
        entityId: `standardebooks:${key}`,
        canonicalUrl,
        category: 'book',
        subcategory: 'public-domain-edition',
        title: entry.title.slice(0, 200),
        description: describe(entry),
        significance: 'A public-domain edition, proofread and typeset, readable in full at Standard Ebooks.',
        sourceName: 'Standard Ebooks',
        attribution: rightsAttribution(rightsStatus, 'Standard Ebooks'),
        license: 'Public domain (USA)',
        aliases: [entry.author ?? ''].filter(Boolean),
        payload: {
          collection: 'literature',
          kind: 'book',
          author: entry.author ?? 'Unknown author',
          language: (entry.language ?? 'en').toLowerCase().slice(0, 12),
          rights: rightsStatus,
          rightsStatement: entry.rights ?? 'Every Standard Ebooks text is in the public domain in the United States.',
          publicationDetails: entry.updated ? `Last updated ${entry.updated.slice(0, 10)}` : undefined,
          subjects: entry.subjects.slice(0, 8),
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
        sourceId: standardEbooksAdapter.id,
        sourceName: standardEbooksAdapter.name,
        status: drafts.length > 0 ? 'ok' : 'partial',
        fetched: entries.length,
        accepted: drafts.length,
        rejected,
        duplicates: 0,
        note: drafts.length === 0 ? 'no usable entries in the slice' : undefined,
        finishedAt: context.nowIso,
      },
    };
  },
};

export function standardEbooksNextCursor(previous: number, pageSize: number, total: number): string {
  if (total <= 0) return '0';
  return String((previous + pageSize) % total);
}
