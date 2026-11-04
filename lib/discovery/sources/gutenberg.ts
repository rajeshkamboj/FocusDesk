/**
 * Project Gutenberg — public-domain book metadata.
 *
 * WHY THE RDF CATALOGUE AND NOT THE WEBSITE
 * Gutenberg publishes a compressed RDF/XML dump of its whole catalogue
 * (`https://www.gutenberg.org/cache/epub/feeds/pg_catalog.rdf.bz2`, several MB) and
 * a per-book RDF file (`/ebooks/<id>.rdf`). The dump is the right shape for a
 * scheduled offline job but needs a bzip2 decoder, which this project does not
 * ship. Instead each run fetches a *small, bounded set* of per-book RDF records
 * for identifiers drawn from the same deterministic sequence the catalogue uses —
 * one request per book, spaced by the shared rate limiter, with the cursor stored
 * in `curiosity_discovery_state` so a run resumes where the last one stopped.
 *
 * That is a deliberate, documented compromise: it discovers steadily and politely
 * rather than in one large pull. If a bzip2 decoder is ever added, only
 * `fetchCandidates` needs to change.
 *
 * RIGHTS
 * Gutenberg's own RDF carries `dcterms:rights`; when it says "Public domain in the
 * USA" the record is `public-domain-verified` for that jurisdiction — and the card
 * says which jurisdiction, because a Gutenberg text can still be in copyright
 * elsewhere. **No full text and no excerpt is imported.** The record is metadata
 * plus a link, which is what the reading card renders.
 *
 * TERMS
 * Gutenberg asks that automated clients be considerate (no bulk scraping of the
 * HTML site) and that the Project Gutenberg trademark not be used to imply
 * endorsement. This adapter reads one RDF metadata file per book at roughly one
 * request a second and keeps the source link and attribution on the record.
 */

import { collectionRecordId, rightsAttribution, statusForRights } from '../collection';
import { httpGet, redactUrl } from '../http';
import {
  disabledReport,
  emptyReport,
  failedReport,
  type AdapterContext,
  type AdapterOutcome,
  type DiscoveryAdapter,
} from './types';
import type { CandidateDraft } from '../../curiosity/reservoir';

const RDF_BASE = 'https://www.gutenberg.org/ebooks';

/**
 * Identifiers to try when no cursor exists yet.
 *
 * Gutenberg's ids are not contiguous with its holdings — many are retired — so a
 * run tolerates misses and simply moves on. The list starts at 1 and advances by
 * the cursor after that.
 */
const START_ID = 1;
const MAX_RECORDS_DEFAULT = 12;

export function gutenbergEnabled(): boolean {
  const value = (process.env.CURIOSITY_LITERATURE_SOURCES ?? '').trim().toLowerCase();
  if (value === 'off' || value === 'false' || value === '0') return false;
  return true;
}

/** Pull the few fields this project needs out of one RDF/XML record. */
export function parseGutenbergRdf(xml: string): {
  id?: string;
  title?: string;
  author?: string;
  language?: string;
  rights?: string;
  issued?: string;
  subjects: string[];
} {
  const pick = (tag: string): string | undefined => {
    // Accepts both `<dcterms:title>…</dcterms:title>` and namespaced variants, and
    // tolerates attributes on the open tag.
    const match = new RegExp(`<[a-z0-9]*:?${tag}[^>]*>([\\s\\S]*?)</[a-z0-9]*:?${tag}>`, 'i').exec(xml);
    if (!match) return undefined;
    const value = match[1]
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

  const subjects = [...xml.matchAll(/<dcterms:subject[^>]*>([\s\S]*?)<\/dcterms:subject>/gi)]
    .map((match) => match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  // Gutenberg writes the language as a resource reference rather than text:
  //   <dcterms:language><rdf:Description rdf:about="languages/en"/></dcterms:language>
  // so read the attribute, and fall back to the text content for records that
  // spell it out.
  const languageTag = /<dcterms:language[\s\S]*?rdf:(?:about|resource)="[^"]*?languages\/([A-Za-z-]+)"/i.exec(xml);
  const language = languageTag ? languageTag[1].toLowerCase() : pick('language')?.toLowerCase();

  return {
    id: pick('identifier')?.replace(/[^0-9]/g, '') || undefined,
    title: pick('title'),
    author: pick('creator'),
    language,
    rights: pick('rights'),
    issued: pick('issued'),
    subjects,
  };
}

/** A one-line description built from what the record actually says. */
function describe(record: { title?: string; author?: string; subjects: string[]; issued?: string }): string {
  const subjectText = record.subjects.slice(0, 3).join(', ');
  const parts = [
    record.author ? `By ${record.author}.` : '',
    subjectText ? `Catalogued under ${subjectText}.` : '',
    record.issued ? `First issued ${record.issued}.` : '',
  ].filter(Boolean);
  return parts.join(' ') || `A Project Gutenberg catalogue record for “${record.title ?? 'this work'}”.`;
}

export const gutenbergAdapter: DiscoveryAdapter = {
  id: 'gutenberg',
  name: 'Project Gutenberg',
  collection: 'literature',
  enabled: gutenbergEnabled,
  async run(context: AdapterContext): Promise<AdapterOutcome> {
    if (!gutenbergEnabled()) {
      return { drafts: [], report: disabledReport(gutenbergAdapter, context.nowIso) };
    }

    const maxRecords = Math.max(1, Math.min(context.maxRecords ?? MAX_RECORDS_DEFAULT, 25));
    const start = Number(context.cursor) > 0 ? Number(context.cursor) : START_ID;
    const drafts: CandidateDraft[] = [];
    let fetched = 0;
    let rejected = 0;
    let skipped = 0;
    let firstFailure = '';

    for (let offset = 0; offset < maxRecords * 3 && drafts.length < maxRecords; offset += 1) {
      const bookId = start + offset;
      const url = `${RDF_BASE}/${bookId}.rdf`;
      const result = await httpGet(url, {
        fetchImpl: context.fetchImpl,
        sleepImpl: context.sleepImpl,
        attempts: 2,
        headers: { accept: 'application/rdf+xml, text/xml;q=0.9, */*;q=0.5' },
      });
      if (!result.ok) {
        if (result.status === 404) {
          // A retired identifier is not a source failure.
          skipped += 1;
          continue;
        }
        firstFailure ||= result.note;
        break;
      }
      fetched += 1;
      const record = parseGutenbergRdf(result.text);
      if (!record.title || !record.id) {
        rejected += 1;
        continue;
      }
      const rights = (record.rights ?? '').toLowerCase();
      const rightsStatus = /public domain in the usa/.test(rights)
        ? 'public-domain-verified'
        : /public domain/.test(rights)
          ? 'public-domain-asserted'
          : 'unknown';
      const status = statusForRights(rightsStatus);
      const canonicalUrl = `https://www.gutenberg.org/ebooks/${record.id}`;
      const language = (record.language ?? 'en').toLowerCase().slice(0, 12);

      drafts.push({
        id: collectionRecordId('gutenberg', record.id),
        entityId: `gutenberg:${record.id}`,
        canonicalUrl,
        category: 'book',
        subcategory: 'public-domain-book',
        title: record.title.slice(0, 200),
        description: describe(record),
        significance: `A public-domain text available to read in full at Project Gutenberg (ebook ${record.id}).`,
        sourceName: 'Project Gutenberg',
        attribution: rightsAttribution(rightsStatus, 'Project Gutenberg'),
        license: rightsStatus === 'public-domain-verified' ? 'Public domain (USA)' : undefined,
        // ISBN is not in the RDF record; the ebook id is the stable identifier.
        aliases: [record.author ?? ''].filter(Boolean),
        payload: {
          collection: 'literature',
          kind: 'book',
          author: record.author ?? 'Unknown author',
          language,
          rights: rightsStatus,
          rightsStatement: record.rights,
          publicationDetails: record.issued ? `First issued ${record.issued}` : undefined,
          isbn: undefined,
          gutenbergId: record.id,
          subjects: record.subjects.slice(0, 8),
          // No full text and no excerpt: the card links out instead.
          excerptImported: false,
        },
        validationStatus: status.validationStatus,
        validationNotes: status.notes.length > 0 ? status.notes : undefined,
        eligible: status.eligible,
        discoveredAt: context.nowIso,
        updatedAt: context.nowIso,
      });
    }

    if (fetched === 0 && firstFailure) {
      return { drafts: [], report: failedReport(gutenbergAdapter, context.nowIso, firstFailure) };
    }

    const failed = Boolean(firstFailure);
    return {
      drafts,
      report: {
        sourceId: gutenbergAdapter.id,
        sourceName: gutenbergAdapter.name,
        status: failed ? (drafts.length > 0 ? 'partial' : 'failed') : drafts.length > 0 ? 'ok' : 'skipped',
        fetched,
        accepted: drafts.length,
        rejected,
        duplicates: 0,
        note: [
          firstFailure ? `stopped early: ${firstFailure}` : '',
          skipped > 0 ? `${skipped} retired identifier(s) skipped` : '',
          drafts.length === 0 && !firstFailure ? 'no usable catalogue records in this window' : '',
        ]
          .filter(Boolean)
          .join('; ') || undefined,
        finishedAt: context.nowIso,
      },
    };
  },
};

/** Where the next run should resume. Pure, so the runner can test it. */
export function gutenbergNextCursor(startId: number, scanned: number): string {
  return String(startId + Math.max(1, scanned));
}

/** A record's reader-facing link, used by the UI and by the harness. */
export function gutenbergLink(id: string): string {
  return `https://www.gutenberg.org/ebooks/${id}`;
}

/** Kept for symmetry with the other adapters' error surface. */
export function gutenbergFailureNote(status: number, url: string): string {
  return `HTTP ${status} from ${redactUrl(url)}`;
}

export { emptyReport };
