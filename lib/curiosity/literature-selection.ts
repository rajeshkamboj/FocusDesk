/**
 * Choosing the daily reading — discovered first, curated as the fallback.
 *
 * WHAT CHANGED
 * "A Few Minutes of Literature" used to rotate over 24 hardcoded entries and
 * nothing else. The Gutenberg / Standard Ebooks / Wikisource adapters already ran
 * on a schedule, but their output only appeared on a separate shelf below the card.
 * This module connects the two: a discovered, rights-verified work from the
 * reservoir becomes the *daily card*, and the authored pool stays behind it as an
 * explicitly labelled fallback.
 *
 * THE RIGHTS RULE, IN ONE PARAGRAPH
 * A discovered work is shown **link-only**. Quoting a passage would require proving
 * that the edition, the translation and the reader's jurisdiction are all clear,
 * and the reservation API does not give us the first two. So the card carries the
 * title, the author, the source, an original note and a link — never a quotation —
 * and it says so. The curated pool is different: each entry was checked by hand,
 * has a recorded rights basis, and may quote.
 *
 * Everything here is pure: no network, no storage, no clock.
 */

import type { KnowledgeCandidate, LiteratureItem, LiteratureRights } from './types';
import { normalizeTitle } from './dedupe';
import { collectionOfCandidate } from '../discovery/collection';
import { shelfScore } from '../discovery/shelf';

/** Rights statuses under which a discovered work may be *linked* on the daily card. */
const LINKABLE_RIGHTS = new Set(['public-domain-verified', 'public-domain-asserted', 'permitted-reuse']);

/** One selected work, with the reservoir id the publication ledger records. */
export interface LiteraturePick {
  id: string;
  item: LiteratureItem;
}

export interface LiteratureSelectionOptions {
  /** Discovery day, for the deterministic ordering. */
  date: string;
  /** Candidate ids already shown recently, most recent first. */
  recentIds?: readonly string[];
  /** How many alternatives to prepare. The first is today's. */
  limit?: number;
}

function rightsFromPayload(status: string): LiteratureRights {
  return status === 'permitted-reuse' ? 'open-licence' : 'public-domain';
}

function rightsSentence(status: string, sourceName: string): string {
  if (status === 'public-domain-verified') {
    return `The source states that this work is in the public domain; verify the rules for your own country before republishing.`;
  }
  if (status === 'public-domain-asserted') {
    return `Widely treated as public domain, and hosted by ${sourceName} — but the exact edition and your country's rules were not verified, so no text is reproduced here.`;
  }
  return `${sourceName} publishes this work under an open licence; follow the licence terms and keep the attribution.`;
}

function jurisdictionNote(status: string): string | undefined {
  if (status === 'public-domain-verified') {
    return 'Public-domain status differs by country.';
  }
  if (status === 'public-domain-asserted') {
    return 'Public-domain status is asserted rather than verified, and differs by country.';
  }
  return undefined;
}

/**
 * Turn one stored, eligible literature/book candidate into the card shape.
 *
 * Returns `null` when the record cannot be shown honestly — no link, no title, an
 * unverified rights position, or nothing to say about it. A `null` here means the
 * curated pool is used, which is the correct degradation.
 */
export function literatureItemFromCandidate(candidate: KnowledgeCandidate): LiteratureItem | null {
  if (!candidate.eligible || candidate.validationStatus !== 'valid') return null;
  if (collectionOfCandidate(candidate) !== 'literature') return null;
  if (candidate.category !== 'literature' && candidate.category !== 'book') return null;
  if (!candidate.canonicalUrl || !/^https?:\/\//i.test(candidate.canonicalUrl)) return null;

  const payload = candidate.payload ?? {};
  const rightsStatus = typeof payload.rights === 'string' ? payload.rights : '';
  if (!LINKABLE_RIGHTS.has(rightsStatus)) return null;

  const title = candidate.title?.trim();
  if (!title) return null;

  const author = typeof payload.author === 'string' && payload.author.trim() && payload.author.trim() !== 'Unknown author'
    ? payload.author.trim()
    : 'Author not stated in the catalogue record';
  const kind = typeof payload.kind === 'string' ? payload.kind : 'text';
  const publicationDetails = typeof payload.publicationDetails === 'string' ? payload.publicationDetails.trim() : '';
  const language = typeof payload.language === 'string' ? payload.language : '';

  const context = [
    `A ${kind} from ${candidate.sourceName}${publicationDetails ? `, ${publicationDetails.toLowerCase()}` : ''}.`,
    `Open the source to read it${language && language !== 'en' ? ` (${language})` : ''}.`,
    rightsSentence(rightsStatus, candidate.sourceName),
  ].join(' ');

  const whyItMatters = candidate.significance?.trim()
    || `A public-domain work chosen from the discovery library on ${candidate.sourceName}; the catalogue record explains what it is.`;

  return {
    title: title.slice(0, 200),
    author,
    ...(publicationDetails ? { eraOrCountry: publicationDetails.slice(0, 120) } : {}),
    format: kind === 'book' ? 'excerpt' : 'passage',
    // Link-only: no text is reproduced from a discovered work.
    passage: '',
    whyItMatters: whyItMatters.slice(0, 500),
    url: candidate.canonicalUrl,
    sourceName: candidate.sourceName,
    origin: 'discovered',
    excerptKind: 'link-only',
    rights: rightsFromPayload(rightsStatus),
    rightsBasis: candidate.attribution?.trim() || rightsSentence(rightsStatus, candidate.sourceName),
    ...(jurisdictionNote(rightsStatus) ? { jurisdictionNote: jurisdictionNote(rightsStatus) } : {}),
    context,
    discoveredAt: candidate.discoveredAt,
    selectionBasis: [
      `Rights: ${rightsStatus.replace(/-/g, ' ')}`,
      `Source: ${candidate.sourceName}`,
      'Not previously shown in this window',
    ],
  };
}

/** A stable identity for one work, so two catalogues describing it collapse. */
export function literatureWorkKey(candidate: KnowledgeCandidate): string {
  const author = typeof candidate.payload?.author === 'string' ? candidate.payload.author : '';
  return `${normalizeTitle(candidate.title)}|${normalizeTitle(author)}`;
}

/**
 * Today's discovered reading, best first.
 *
 * Ordering is a hash of the date and the work, which gives two properties the card
 * needs: stable within a day (a reader refreshing at 12:05 and 23:50 sees the same
 * work) and different across days. Works shown inside the recent window are pushed
 * behind unseen ones rather than removed — if the reservoir only has three works,
 * the card still fills, and the reader sees something real instead of nothing.
 */
export function selectDiscoveredLiterature(
  candidates: readonly KnowledgeCandidate[],
  options: LiteratureSelectionOptions,
): LiteraturePick[] {
  const recent = new Set(options.recentIds ?? []);
  const seenWorks = new Set<string>();
  const rows: Array<{ item: LiteratureItem; key: string; fresh: boolean; id: string }> = [];

  for (const candidate of candidates) {
    const item = literatureItemFromCandidate(candidate);
    if (!item) continue;
    const key = literatureWorkKey(candidate);
    if (seenWorks.has(key)) continue;
    seenWorks.add(key);
    rows.push({ item, key, fresh: !recent.has(candidate.id), id: candidate.id });
  }

  rows.sort((left, right) => {
    if (left.fresh !== right.fresh) return left.fresh ? -1 : 1;
    const delta = shelfScore(options.date, left.key) - shelfScore(options.date, right.key);
    return delta !== 0 ? delta : left.id.localeCompare(right.id);
  });

  const limit = Math.max(1, Math.min(options.limit ?? 2, 8));
  return rows.slice(0, limit).map((row) => ({ id: row.id, item: row.item }));
}
