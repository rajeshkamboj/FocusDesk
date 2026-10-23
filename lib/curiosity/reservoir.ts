import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import {
  HISTORY_CATEGORY_LABELS,
  HISTORY_CATEGORY_ORDER,
  RESERVOIR_CATEGORIES,
  type CandidateValidationStatus,
  type DiscoveryRunSummary,
  type DiscoveryTrigger,
  type EventDatePrecision,
  type HistoryCategory,
  type HistoryEvent,
  type KnowledgeCandidate,
  type ReservoirCategory,
  type ReservoirStatusSummary,
  type ScienceConcept,
} from './types';
import {
  LOW_STOCK_THRESHOLDS,
  TARGET_POOL_SIZES,
  historyPolicyFor,
} from './catalog';
import {
  fingerprint,
  normalizeTitle,
  normalizeUrl,
  signatureSimilarity,
  signatureText,
  subjectKey,
} from './dedupe';
import {
  candidateFingerprint,
  candidateFromHistory,
  candidateSignature,
  type ContentCandidate,
} from './candidates';
import { buildHistoryIndex, publicationRecords, toSeenRecord } from './history';
import { selectCandidate } from './selection';
import type { SeenRecord } from './state';
import {
  isIsoLeapYear,
  parseIsoCalendarDate,
  seedHistoryByCategory,
  type SeedHistoryRecord,
} from './content';
import { mythCharacters } from './content/mythology';
import { chemistryConcepts } from './content/chemistry';
import { physicsConcepts } from './content/physics';
import { biologyConcepts } from './content/biology';
import { aiBackgroundLibrary } from './content/ai-background';
import { radarFallbackShelf } from './content/radar-fallback';
import { poolFor } from './pool';

/* ------------------------------------------------------------------ */
/* Validation Gate                                                     */
/* ------------------------------------------------------------------ */

export interface CandidateDraft {
  id: string;
  entityId: string;
  canonicalUrl: string;
  category: ReservoirCategory;
  subcategory?: string;
  title: string;
  description: string;
  significance?: string;
  sourceName: string;
  attribution?: string;
  license?: string;
  aliases?: string[];
  subjects?: string[];
  eventYear?: number;
  eventYearLabel?: string;
  eventMonth?: number;
  eventDay?: number;
  eventDatePrecision?: EventDatePrecision;
  calendarNote?: string;
  payload?: Record<string, unknown>;
  validationStatus?: CandidateValidationStatus;
  validationNotes?: string[];
  eligible?: boolean;
  discoveredAt?: string;
  updatedAt?: string;
}

export type ValidationOutcome =
  | { ok: true; candidate: KnowledgeCandidate }
  | { ok: false; reasons: string[] };

const PLACEHOLDER_RE = /\b(lorem ipsum|todo|tbd|fixme|coming soon|insert (?:title|text|summary))\b/i;
const DISAMBIGUATION_RE = /\b(may refer to:|can refer to:|is a disambiguation page)\b/i;
const LIST_TITLE_RE = /^(list of |timeline of |index of |outline of )/i;
const HTML_TAG_RE = /<\/?[a-z][a-z0-9-]{0,20}(?:\s+[^<>]{0,80})?>/i;

const HISTORY_SET = new Set<string>(HISTORY_CATEGORY_ORDER);
const VALID_CATEGORIES = new Set<string>(RESERVOIR_CATEGORIES);
const VALID_PRECISIONS = new Set<EventDatePrecision>([
  'exact',
  'month-year',
  'year',
  'approximate',
  'disputed',
  'none',
]);

export function monthDayDisplay(month: number, day: number): string {
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${names[month - 1] ?? `Month ${month}`} ${day}`;
}

export function isValidMonthDay(month: number, day: number): boolean {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  if (month === 2) return day <= 29;
  if ([4, 6, 9, 11].includes(month)) return day <= 30;
  return day <= 31;
}

function buildNormalizedIdentity(category: ReservoirCategory, title: string, year?: number, yearLabel?: string): string {
  const base = HISTORY_SET.has(category)
    ? `${year ?? yearLabel ?? ''} ${title}`
    : title;
  return normalizeTitle(base).replace(/\s+/g, '-');
}

function uniqueSubjectKeys(group: string, rawValues: (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of rawValues) {
    if (!raw) continue;
    const key = subjectKey(group, raw);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

/**
 * Strict validation gate: no external API result enters the eligible reservoir
 * without passing every structural, attribution, licence, and calendar check.
 */
export function validateCandidate(
  draft: CandidateDraft,
  referenceYear = new Date().getUTCFullYear() + 1,
): ValidationOutcome {
  const reasons: string[] = [];

  const id = (draft.id ?? '').trim();
  if (!id || !/^[a-z0-9][a-z0-9:_./-]{1,120}$/i.test(id)) {
    reasons.push('missing or invalid canonical candidate id');
  }

  const entityId = (draft.entityId ?? '').trim();
  if (!entityId || entityId.length > 140) {
    reasons.push('missing or invalid upstream entityId');
  }

  if (!VALID_CATEGORIES.has(draft.category)) {
    reasons.push(`unsupported category "${String(draft.category)}"`);
  }

  const rawUrl = (draft.canonicalUrl ?? '').trim();
  if (!/^https?:\/\/\S+$/i.test(rawUrl)) {
    reasons.push('missing or non-HTTP canonical source URL');
  }
  const normalizedUrl = normalizeUrl(rawUrl);
  if (!normalizedUrl) {
    reasons.push('canonical source URL could not be normalized');
  }

  const title = (draft.title ?? '').replace(/\s+/g, ' ').trim();
  if (title.length < 2 || title.length > 220) {
    reasons.push('title must be between 2 and 220 characters');
  }
  if (PLACEHOLDER_RE.test(title) || HTML_TAG_RE.test(title) || LIST_TITLE_RE.test(title)) {
    reasons.push('title contains HTML markup, list boilerplate, or placeholder text');
  }

  const description = (draft.description ?? '').replace(/\s+/g, ' ').trim();
  if (description.length < 28 || description.length > 1800) {
    reasons.push('description must be between 28 and 1800 characters');
  }
  if (PLACEHOLDER_RE.test(description) || HTML_TAG_RE.test(description) || DISAMBIGUATION_RE.test(description)) {
    reasons.push('description contains HTML markup, disambiguation boilerplate, or placeholder text');
  }

  const sourceName = (draft.sourceName ?? '').replace(/\s+/g, ' ').trim();
  if (sourceName.length < 2) {
    reasons.push('missing source attribution name');
  }

  const attribution = draft.attribution?.replace(/\s+/g, ' ').trim();
  const license = draft.license?.trim();

  if (/(?:wikipedia|wikimedia)\.org\//i.test(normalizedUrl)) {
    const hasWikiAttribution = /wikipedia|wikimedia|cc\s*by-sa/i.test(
      `${sourceName} ${attribution ?? ''} ${license ?? ''}`,
    );
    if (!hasWikiAttribution) {
      reasons.push('Wikimedia/Wikipedia candidate lacks required CC BY-SA / Wikipedia attribution');
    }
  }
  if (/wikidata\.org\//i.test(normalizedUrl)) {
    const hasWikidataAttribution = /wikidata|cc0/i.test(
      `${sourceName} ${attribution ?? ''} ${license ?? ''}`,
    );
    if (!hasWikidataAttribution) {
      reasons.push('Wikidata candidate lacks Wikidata / CC0 attribution');
    }
  }

  const hasMonth = draft.eventMonth !== undefined && draft.eventMonth !== null;
  const hasDay = draft.eventDay !== undefined && draft.eventDay !== null;
  if (hasMonth !== hasDay) {
    reasons.push('eventMonth and eventDay must both be present or both be omitted');
  } else if (hasMonth && hasDay) {
    if (!isValidMonthDay(draft.eventMonth!, draft.eventDay!)) {
      reasons.push(`impossible calendar month-day ${draft.eventMonth}-${draft.eventDay}`);
    }
  }

  if (draft.eventYear !== undefined && draft.eventYear !== null) {
    if (!Number.isInteger(draft.eventYear) || draft.eventYear < -10_000 || draft.eventYear > referenceYear) {
      reasons.push(`eventYear ${draft.eventYear} is outside plausible historical range`);
    }
  }

  const yearLabel = draft.eventYearLabel?.trim();
  if (HISTORY_SET.has(draft.category)) {
    if (draft.eventYear === undefined && (!yearLabel || yearLabel.length === 0)) {
      reasons.push('history candidate requires a supported year or period label');
    }
  }

  const precision: EventDatePrecision = draft.eventDatePrecision && VALID_PRECISIONS.has(draft.eventDatePrecision)
    ? draft.eventDatePrecision
    : (hasMonth && hasDay ? 'exact' : (draft.eventYear !== undefined || yearLabel ? 'year' : 'none'));

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }

  const normalizedIdentity = buildNormalizedIdentity(
    draft.category,
    title,
    draft.eventYear,
    yearLabel,
  );
  if (!normalizedIdentity) {
    return { ok: false, reasons: ['normalized identity collapsed to empty string'] };
  }

  const cleanAliases = [...new Set(
    (draft.aliases ?? [])
      .map((a) => a.replace(/\s+/g, ' ').trim())
      .filter((a) => a.length > 1 && normalizeTitle(a) !== normalizeTitle(title)),
  )].slice(0, 20);

  const computedSubjects = uniqueSubjectKeys(
    HISTORY_SET.has(draft.category) ? 'history' : draft.category,
    [
      title,
      /^Q\d+$/i.test(entityId) ? entityId : undefined,
      ...cleanAliases,
      ...(draft.subjects ?? []),
    ],
  );

  let validationStatus: CandidateValidationStatus = draft.validationStatus ?? 'valid';
  let eligible = draft.eligible ?? (validationStatus === 'valid');
  const notes = [...(draft.validationNotes ?? [])];

  if (draft.category === 'mythology' && draft.payload?.mythologyComplete !== true) {
    validationStatus = 'needs-review';
    eligible = false;
    if (!notes.some((n) => /evidence layers/i.test(n))) {
      notes.push('Staged for editorial evidence-layer review before daily publication.');
    }
  }

  if (validationStatus !== 'valid') {
    eligible = false;
  }

  const inferredLicense = license
    || (/\b(wikipedia|wikimedia|wikisource|wiktionary)\.org\b/i.test(rawUrl)
      ? 'CC BY-SA 4.0'
      : /\bwikidata\.org\b/i.test(rawUrl)
        ? 'CC0 1.0'
        : undefined);
  const inferredAttribution = attribution || `Source: ${sourceName}`;
  const nowIso = new Date().toISOString();
  const discoveredAt = draft.discoveredAt ?? nowIso;
  const updatedAt = draft.updatedAt ?? nowIso;

  return {
    ok: true,
    candidate: {
      id,
      entityId,
      canonicalUrl: rawUrl,
      category: draft.category,
      subcategory: draft.subcategory?.trim() || undefined,
      title,
      description,
      significance: draft.significance?.replace(/\s+/g, ' ').trim() || undefined,
      sourceName,
      attribution: inferredAttribution,
      license: inferredLicense,
      aliases: cleanAliases,
      normalizedIdentity,
      fingerprint: fingerprint(String(draft.eventYear ?? yearLabel ?? ''), title, description),
      signature: signatureText([title, String(draft.eventYear ?? yearLabel ?? ''), description].filter(Boolean).join(' ')),
      subjects: computedSubjects,
      eventYear: draft.eventYear,
      eventYearLabel: yearLabel || (draft.eventYear !== undefined ? String(draft.eventYear) : undefined),
      eventMonth: hasMonth ? draft.eventMonth : undefined,
      eventDay: hasDay ? draft.eventDay : undefined,
      eventDatePrecision: precision,
      calendarNote: draft.calendarNote?.replace(/\s+/g, ' ').trim() || undefined,
      payload: draft.payload ? { ...draft.payload } : undefined,
      validationStatus,
      validationNotes: notes.length > 0 ? notes : undefined,
      eligible,
      discoveredAt,
      updatedAt,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Idempotent Upsert & Cross-Record Deduplication                      */
/* ------------------------------------------------------------------ */

export interface UpsertBatchMetrics {
  merged: KnowledgeCandidate[];
  toWrite: KnowledgeCandidate[];
  newDiscovered: number;
  updatedExisting: number;
  duplicateRejections: number;
  validationFailures: number;
  validationReasons: string[];
}

function sameUnderlyingRecord(a: KnowledgeCandidate, b: KnowledgeCandidate): boolean {
  if (a.id === b.id) return true;
  if (a.category === b.category && a.entityId === b.entityId) return true;
  if (a.category === b.category && a.normalizedIdentity === b.normalizedIdentity) return true;
  return false;
}

function isNearDuplicateInCategory(existing: KnowledgeCandidate, incoming: KnowledgeCandidate): boolean {
  if (existing.category !== incoming.category) return false;
  if (normalizeUrl(existing.canonicalUrl) === normalizeUrl(incoming.canonicalUrl)) {
    const sameYear = (existing.eventYear ?? existing.eventYearLabel) === (incoming.eventYear ?? incoming.eventYearLabel);
    if (sameYear) return true;
  }
  if (existing.fingerprint === incoming.fingerprint) return true;
  const existingNames = new Set(
    [existing.title, ...existing.aliases].map((s) => normalizeTitle(s)).filter(Boolean),
  );
  for (const name of [incoming.title, ...incoming.aliases]) {
    const key = normalizeTitle(name);
    if (key && existingNames.has(key)) {
      const sameYear = (existing.eventYear ?? existing.eventYearLabel) === (incoming.eventYear ?? incoming.eventYearLabel);
      if (!HISTORY_SET.has(incoming.category) || sameYear) return true;
    }
  }
  if (existing.signature && incoming.signature) {
    if (signatureSimilarity(existing.signature, incoming.signature) >= 0.55) return true;
  }
  return false;
}

function candidateContentChanged(prev: KnowledgeCandidate, next: KnowledgeCandidate): boolean {
  return (
    prev.title !== next.title
    || prev.description !== next.description
    || prev.significance !== next.significance
    || prev.canonicalUrl !== next.canonicalUrl
    || prev.attribution !== next.attribution
    || prev.license !== next.license
    || prev.eligible !== next.eligible
    || prev.validationStatus !== next.validationStatus
    || prev.calendarNote !== next.calendarNote
  );
}

export function mergeCandidateDrafts(
  existing: readonly KnowledgeCandidate[],
  drafts: readonly CandidateDraft[],
  nowIso = new Date().toISOString(),
): UpsertBatchMetrics {
  const working: KnowledgeCandidate[] = existing.map((c) => ({ ...c }));
  const dirtyIds = new Set<string>();
  const seenInCurrentBatch = new Set<string>();
  let newDiscovered = 0;
  let updatedExisting = 0;
  let duplicateRejections = 0;
  let validationFailures = 0;
  const validationReasons: string[] = [];

  for (const draft of drafts) {
    const outcome = validateCandidate({ ...draft, updatedAt: nowIso });
    if (!outcome.ok) {
      validationFailures += 1;
      if (validationReasons.length < 15) {
        validationReasons.push(`${draft.id || draft.title || 'candidate'}: ${outcome.reasons.join('; ')}`);
      }
      continue;
    }
    const candidate = outcome.candidate;

    const sameIdx = working.findIndex((item) => sameUnderlyingRecord(item, candidate));
    if (sameIdx >= 0) {
      const prev = working[sameIdx];
      if (seenInCurrentBatch.has(prev.id)) {
        duplicateRejections += 1;
        continue;
      }
      seenInCurrentBatch.add(prev.id);
      if (candidateContentChanged(prev, candidate)) {
        const mergedRecord: KnowledgeCandidate = {
          ...candidate,
          id: prev.id,
          aliases: [...new Set([...prev.aliases, ...candidate.aliases])].slice(0, 20),
          subjects: [...new Set([...prev.subjects, ...candidate.subjects])],
          discoveredAt: prev.discoveredAt,
          updatedAt: nowIso,
        };
        working[sameIdx] = mergedRecord;
        dirtyIds.add(mergedRecord.id);
        updatedExisting += 1;
      }
      continue;
    }

    const nearDup = working.find((item) => isNearDuplicateInCategory(item, candidate));
    if (nearDup) {
      duplicateRejections += 1;
      continue;
    }

    working.push({ ...candidate, discoveredAt: draft.discoveredAt ?? nowIso, updatedAt: nowIso });
    dirtyIds.add(candidate.id);
    seenInCurrentBatch.add(candidate.id);
    newDiscovered += 1;
  }

  const toWrite = working.filter((c) => dirtyIds.has(c.id));
  return {
    merged: working,
    toWrite,
    newDiscovered,
    updatedExisting,
    duplicateRejections,
    validationFailures,
    validationReasons,
  };
}

/* ------------------------------------------------------------------ */
/* Curated Seed -> Reservoir Drafts                                    */
/* ------------------------------------------------------------------ */

function historySeedToDraft(record: SeedHistoryRecord, category: HistoryCategory): CandidateDraft {
  return {
    id: record.id,
    entityId: record.entityId,
    canonicalUrl: record.url,
    category,
    subcategory: record.subcategory,
    title: record.title,
    description: record.explanation,
    significance: record.significance,
    sourceName: record.sourceName,
    attribution: record.attribution,
    license: record.license,
    aliases: record.aliases,
    subjects: record.subjects,
    eventYear: record.numericYear,
    eventYearLabel: String(record.year),
    eventMonth: record.month,
    eventDay: record.day,
    eventDatePrecision: record.datePrecision,
    calendarNote: record.calendarNote,
    payload: {
      dateLabel: record.dateLabel,
      origin: 'curated',
    },
    validationStatus: 'valid',
    eligible: true,
    discoveredAt: '2026-10-23T00:00:00.000Z',
  };
}

function scienceConceptToDraft(
  concept: ScienceConcept,
  category: 'chemistry' | 'physics' | 'biology',
): CandidateDraft {
  const url = concept.source?.url
    ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(concept.topic.replace(/\s+/g, '_'))}`;
  return {
    id: concept.id,
    entityId: concept.wikidataId ?? concept.id,
    canonicalUrl: url,
    category,
    subcategory: concept.origin === 'wikipedia' ? 'discovered-lead' : 'authored-concept',
    title: concept.topic,
    description: concept.simple,
    significance: concept.connection,
    sourceName: concept.source?.name ?? 'Wikipedia',
    attribution: concept.source?.attribution ?? 'Source: Wikipedia contributors (CC BY-SA 4.0).',
    license: 'CC BY-SA 4.0',
    aliases: concept.aliases ?? [],
    payload: { concept },
    validationStatus: 'valid',
    eligible: true,
    discoveredAt: '2026-10-23T00:00:00.000Z',
  };
}

export function curatedReservoirDrafts(): CandidateDraft[] {
  const drafts: CandidateDraft[] = [];

  for (const category of HISTORY_CATEGORY_ORDER) {
    for (const record of seedHistoryByCategory[category]) {
      drafts.push(historySeedToDraft(record, category));
    }
  }

  for (const m of mythCharacters) {
    drafts.push({
      id: m.id,
      entityId: m.wikidataId ?? m.id,
      canonicalUrl: m.sourceUrl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(m.name.replace(/\s+/g, '_'))}`,
      category: 'mythology',
      subcategory: m.tradition,
      title: m.name,
      description: m.story,
      significance: m.analysis,
      sourceName: m.sources[0] ?? 'Wikipedia',
      attribution: `Tradition sources: ${m.sources.slice(0, 2).join('; ')} · Reference via Wikipedia (CC BY-SA 4.0).`,
      license: 'CC BY-SA 4.0',
      aliases: m.aliases ?? [],
      payload: { mythologyComplete: true },
      validationStatus: 'valid',
      eligible: true,
      discoveredAt: '2026-10-23T00:00:00.000Z',
    });
  }

  for (const c of chemistryConcepts) drafts.push(scienceConceptToDraft(c, 'chemistry'));
  for (const p of physicsConcepts) drafts.push(scienceConceptToDraft(p, 'physics'));
  for (const b of biologyConcepts) drafts.push(scienceConceptToDraft(b, 'biology'));

  for (const entry of poolFor('one-thing')) {
    const url = entry.item.url ?? entry.source?.url ?? 'https://developer.mozilla.org/';
    const name = entry.item.sourceName ?? entry.source?.name ?? 'FocusDesk Curated';
    drafts.push({
      id: entry.id,
      entityId: entry.id,
      canonicalUrl: url,
      category: 'one-thing',
      title: entry.item.title,
      description: entry.item.explanation,
      sourceName: name,
      attribution: entry.source?.attribution ?? (/wikipedia\.org/i.test(url) ? 'Reference via Wikipedia (CC BY-SA 4.0).' : `Source: ${name}.`),
      subjects: entry.tags,
      validationStatus: 'valid',
      eligible: true,
      discoveredAt: '2026-10-23T00:00:00.000Z',
    });
  }

  for (const entry of poolFor('learn-something')) {
    const url = entry.item.url ?? entry.source?.url ?? 'https://developer.mozilla.org/';
    const name = entry.item.sourceName ?? entry.source?.name ?? 'FocusDesk Curated';
    drafts.push({
      id: entry.id,
      entityId: entry.id,
      canonicalUrl: url,
      category: 'learn-something',
      title: entry.item.topic,
      description: entry.item.explanation,
      sourceName: name,
      attribution: entry.source?.attribution ?? (/wikipedia\.org/i.test(url) ? 'Reference via Wikipedia (CC BY-SA 4.0).' : `Source: ${name}.`),
      subjects: entry.tags,
      validationStatus: 'valid',
      eligible: true,
      discoveredAt: '2026-10-23T00:00:00.000Z',
    });
  }

  for (const entry of poolFor('literature')) {
    const url = entry.item.url ?? entry.source?.url ?? 'https://standardebooks.org/';
    const name = entry.item.sourceName ?? entry.source?.name ?? entry.item.author;
    drafts.push({
      id: entry.id,
      entityId: entry.id,
      canonicalUrl: url,
      category: 'literature',
      subcategory: entry.item.format,
      title: `${entry.item.title} — ${entry.item.author}`,
      description: entry.item.whyItMatters,
      sourceName: name,
      attribution: entry.item.attribution ?? entry.source?.attribution ?? `Public-domain / source reference: ${name}.`,
      subjects: entry.tags,
      validationStatus: 'valid',
      eligible: true,
      discoveredAt: '2026-10-23T00:00:00.000Z',
    });
  }

  for (const entry of poolFor('book')) {
    const url = entry.item.url
      ?? entry.source?.url
      ?? `https://openlibrary.org/search?q=${encodeURIComponent(`${entry.item.title} ${entry.item.author}`)}`;
    const name = entry.source?.name ?? 'Open Library';
    drafts.push({
      id: entry.id,
      entityId: entry.id,
      canonicalUrl: url,
      category: 'book',
      title: `${entry.item.title} — ${entry.item.author}`,
      description: entry.item.synopsis,
      significance: entry.item.why,
      sourceName: name,
      attribution: entry.source?.attribution ?? `Catalogue reference via ${name}.`,
      subjects: [...(entry.tags ?? []), ...(entry.item.subjects ?? [])],
      validationStatus: 'valid',
      eligible: true,
      discoveredAt: '2026-10-23T00:00:00.000Z',
    });
  }

  for (const bg of aiBackgroundLibrary) {
    drafts.push({
      id: bg.id,
      entityId: bg.id,
      canonicalUrl: bg.item.url,
      category: 'ai-world',
      subcategory: 'background',
      title: bg.item.title,
      description: bg.item.summary,
      sourceName: bg.item.source,
      attribution: `Reference: ${bg.item.source}.`,
      validationStatus: 'valid',
      eligible: true,
      discoveredAt: '2026-10-23T00:00:00.000Z',
    });
  }

  for (const repo of radarFallbackShelf) {
    drafts.push({
      id: repo.id,
      entityId: repo.item.name,
      canonicalUrl: repo.item.url,
      category: 'developer-radar',
      subcategory: 'curated-shelf',
      title: repo.item.name,
      description: repo.item.description,
      significance: repo.item.why,
      sourceName: 'GitHub',
      attribution: repo.item.pricing,
      validationStatus: 'valid',
      eligible: true,
      discoveredAt: '2026-10-23T00:00:00.000Z',
    });
  }

  return drafts;
}

/* ------------------------------------------------------------------ */
/* Candidate <-> HistoryEvent & ScienceConcept Adapters                */
/* ------------------------------------------------------------------ */

export function candidateToHistoryEvent(
  candidate: KnowledgeCandidate,
  opts: {
    forThisDate: boolean;
    dateMatch: 'exact-date' | 'leap-day-observed' | 'archive-fallback';
    extraCalendarNote?: string;
  },
): HistoryEvent {
  const category = candidate.category as HistoryCategory;
  const payloadDateLabel = typeof candidate.payload?.dateLabel === 'string'
    ? candidate.payload.dateLabel
    : undefined;
  const date = payloadDateLabel
    ?? (candidate.eventMonth && candidate.eventDay
      ? monthDayDisplay(candidate.eventMonth, candidate.eventDay)
      : (candidate.eventYearLabel ?? String(candidate.eventYear ?? 'Historical period')));
  const year: number | string = candidate.eventYearLabel && /\D/.test(candidate.eventYearLabel)
    ? candidate.eventYearLabel
    : (candidate.eventYear ?? candidate.eventYearLabel ?? 'Unknown');
  const origin: 'live' | 'curated' = candidate.payload?.origin === 'curated' ? 'curated' : 'live';
  const calendarNote = [candidate.calendarNote, opts.extraCalendarNote]
    .filter(Boolean)
    .join(' ');

  return {
    id: candidate.id,
    category,
    categoryLabel: HISTORY_CATEGORY_LABELS[category],
    date,
    year,
    month: candidate.eventMonth,
    day: candidate.eventDay,
    datePrecision: candidate.eventDatePrecision,
    calendarNote: calendarNote || undefined,
    title: candidate.title,
    explanation: candidate.description,
    significance: candidate.significance
      ?? `Recorded in ${HISTORY_CATEGORY_LABELS[category]} reference sources (${candidate.sourceName}).`,
    url: candidate.canonicalUrl,
    sourceName: candidate.sourceName,
    license: candidate.license,
    forThisDate: opts.forThisDate,
    dateMatch: opts.dateMatch,
    origin,
    attribution: candidate.attribution ?? `Source: ${candidate.sourceName}.`,
  };
}

export function candidateToScienceConcept(candidate: KnowledgeCandidate): ScienceConcept | null {
  const stored = candidate.payload?.concept;
  if (stored && typeof stored === 'object' && 'topic' in (stored as Record<string, unknown>)) {
    return stored as ScienceConcept;
  }
  if (!candidate.title || !candidate.description) return null;
  return {
    id: candidate.id,
    topic: candidate.title,
    aliases: candidate.aliases,
    wikidataId: /^Q\d+$/i.test(candidate.entityId) ? candidate.entityId : undefined,
    origin: /wikipedia\.org/i.test(candidate.canonicalUrl) ? 'wikipedia' : 'curated',
    source: {
      url: candidate.canonicalUrl,
      name: candidate.sourceName,
      attribution: candidate.attribution,
    },
    simple: candidate.description,
    connection: candidate.significance ?? `Read the full reference at ${candidate.sourceName}.`,
    surprising: `Catalogued under ${candidate.subcategory ?? candidate.category} (${candidate.sourceName}).`,
    question: `How would you explain ${candidate.title.toLowerCase()} using an everyday observation?`,
  };
}

/* ------------------------------------------------------------------ */
/* Persistent Candidate Store Backends (Supabase + Local File Store)   */
/* ------------------------------------------------------------------ */

export interface CandidateStore {
  readonly kind: 'supabase' | 'file';
  readonly location: string;
  readAll(): Promise<KnowledgeCandidate[]>;
  writeUpsert(candidates: readonly KnowledgeCandidate[]): Promise<{ persisted: boolean; unmigrated?: boolean }>;
  readCursors(): Promise<Record<string, string>>;
  writeCursor(cursorKey: string, category: string, continueToken: string | null): Promise<void>;
  appendRunLog(run: Omit<DiscoveryRunSummary, 'totalByCategory' | 'updatedExisting'>): Promise<void>;
  lastRunLog(): Promise<Omit<DiscoveryRunSummary, 'totalByCategory' | 'updatedExisting'> | null>;
}

const EPHEMERAL_CANDIDATES_FILE = join(tmpdir(), 'focusdesk-curiosity', 'candidates.json');

interface FileReservoirEnvelope {
  version: 1;
  candidates: KnowledgeCandidate[];
  cursors: Record<string, string>;
  runs: Omit<DiscoveryRunSummary, 'totalByCategory' | 'updatedExisting'>[];
}

function defaultCandidateFilePath(): string {
  const explicit = process.env.CURIOSITY_CANDIDATES_FILE?.trim();
  if (explicit) return isAbsolute(explicit) ? explicit : resolve(/* turbopackIgnore: true */ process.cwd(), explicit);
  const stateOverride = process.env.CURIOSITY_STATE_FILE?.trim();
  if (stateOverride) {
    const absState = isAbsolute(stateOverride) ? stateOverride : resolve(/* turbopackIgnore: true */ process.cwd(), stateOverride);
    return join(dirname(absState), 'candidates.json');
  }
  if (process.cwd().startsWith('/var/task')) return EPHEMERAL_CANDIDATES_FILE;
  return resolve(/* turbopackIgnore: true */ process.cwd(), '.curiosity', 'candidates.json');
}

function isReadOnlyError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === 'EROFS' || code === 'EACCES' || code === 'EPERM' || code === 'ENOENT';
}

export class FileCandidateStore implements CandidateStore {
  readonly kind = 'file' as const;
  private path: string;

  constructor(path = defaultCandidateFilePath()) {
    this.path = path;
  }

  get location(): string {
    return this.path;
  }

  private readEnvelope(): FileReservoirEnvelope {
    for (const target of [this.path, EPHEMERAL_CANDIDATES_FILE]) {
      if (!existsSync(/* turbopackIgnore: true */ target)) continue;
      try {
        const parsed = JSON.parse(readFileSync(/* turbopackIgnore: true */ target, 'utf8')) as Partial<FileReservoirEnvelope>;
        if (parsed && Array.isArray(parsed.candidates)) {
          return {
            version: 1,
            candidates: parsed.candidates,
            cursors: parsed.cursors && typeof parsed.cursors === 'object' ? parsed.cursors : {},
            runs: Array.isArray(parsed.runs) ? parsed.runs : [],
          };
        }
      } catch {
        // Corrupt file degrades gracefully to empty envelope.
      }
    }
    return { version: 1, candidates: [], cursors: {}, runs: [] };
  }

  private writeEnvelope(envelope: FileReservoirEnvelope): void {
    const writeTo = (target: string) => {
      mkdirSync(/* turbopackIgnore: true */ dirname(target), { recursive: true });
      const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
      writeFileSync(/* turbopackIgnore: true */ tmp, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
      renameSync(/* turbopackIgnore: true */ tmp, target);
    };
    try {
      writeTo(this.path);
    } catch (err) {
      if (this.path === EPHEMERAL_CANDIDATES_FILE || !isReadOnlyError(err)) throw err;
      this.path = EPHEMERAL_CANDIDATES_FILE;
      writeTo(this.path);
    }
  }

  async readAll(): Promise<KnowledgeCandidate[]> {
    return this.readEnvelope().candidates;
  }

  async writeUpsert(incoming: readonly KnowledgeCandidate[]): Promise<{ persisted: boolean }> {
    if (incoming.length === 0) return { persisted: true };
    const env = this.readEnvelope();
    const byId = new Map(env.candidates.map((c) => [c.id, c]));
    for (const c of incoming) {
      const prev = byId.get(c.id);
      byId.set(c.id, prev ? { ...c, discoveredAt: prev.discoveredAt } : c);
    }
    env.candidates = [...byId.values()];
    this.writeEnvelope(env);
    return { persisted: true };
  }

  async readCursors(): Promise<Record<string, string>> {
    return { ...this.readEnvelope().cursors };
  }

  async writeCursor(cursorKey: string, _category: string, continueToken: string | null): Promise<void>;
  async writeCursor(cursorKey: string, category: string, continueToken: string | null): Promise<void> {
    void category;
    const env = this.readEnvelope();
    if (continueToken) env.cursors[cursorKey] = continueToken;
    else delete env.cursors[cursorKey];
    this.writeEnvelope(env);
  }

  async appendRunLog(run: Omit<DiscoveryRunSummary, 'totalByCategory' | 'updatedExisting'>): Promise<void> {
    const env = this.readEnvelope();
    env.runs = [run, ...env.runs].slice(0, 40);
    this.writeEnvelope(env);
  }

  async lastRunLog(): Promise<Omit<DiscoveryRunSummary, 'totalByCategory' | 'updatedExisting'> | null> {
    return this.readEnvelope().runs[0] ?? null;
  }
}

interface CandidateDbRow {
  id: string;
  entity_id: string;
  canonical_url: string;
  category: ReservoirCategory;
  subcategory: string | null;
  title: string;
  description: string;
  significance: string | null;
  source_name: string;
  attribution: string | null;
  license: string | null;
  aliases: string[] | null;
  normalized_identity: string;
  fingerprint: string;
  signature: string | null;
  subjects: string[] | null;
  event_year: number | null;
  event_year_label: string | null;
  event_month: number | null;
  event_day: number | null;
  event_date_precision: EventDatePrecision;
  calendar_note: string | null;
  payload: Record<string, unknown> | null;
  validation_status: CandidateValidationStatus;
  validation_notes: string[] | null;
  eligible: boolean;
  discovered_at: string;
  updated_at: string;
}

function toDbRow(c: KnowledgeCandidate): CandidateDbRow {
  return {
    id: c.id,
    entity_id: c.entityId,
    canonical_url: c.canonicalUrl,
    category: c.category,
    subcategory: c.subcategory ?? null,
    title: c.title,
    description: c.description,
    significance: c.significance ?? null,
    source_name: c.sourceName,
    attribution: c.attribution ?? null,
    license: c.license ?? null,
    aliases: c.aliases,
    normalized_identity: c.normalizedIdentity,
    fingerprint: c.fingerprint,
    signature: c.signature ?? null,
    subjects: c.subjects,
    event_year: c.eventYear ?? null,
    event_year_label: c.eventYearLabel ?? null,
    event_month: c.eventMonth ?? null,
    event_day: c.eventDay ?? null,
    event_date_precision: c.eventDatePrecision,
    calendar_note: c.calendarNote ?? null,
    payload: c.payload ?? {},
    validation_status: c.validationStatus,
    validation_notes: c.validationNotes ?? [],
    eligible: c.eligible,
    discovered_at: c.discoveredAt,
    updated_at: c.updatedAt,
  };
}

function fromDbRow(r: CandidateDbRow): KnowledgeCandidate {
  return {
    id: r.id,
    entityId: r.entity_id,
    canonicalUrl: r.canonical_url,
    category: r.category,
    subcategory: r.subcategory ?? undefined,
    title: r.title,
    description: r.description,
    significance: r.significance ?? undefined,
    sourceName: r.source_name,
    attribution: r.attribution ?? undefined,
    license: r.license ?? undefined,
    aliases: Array.isArray(r.aliases) ? r.aliases : [],
    normalizedIdentity: r.normalized_identity,
    fingerprint: r.fingerprint,
    signature: r.signature ?? undefined,
    subjects: Array.isArray(r.subjects) ? r.subjects : [],
    eventYear: r.event_year ?? undefined,
    eventYearLabel: r.event_year_label ?? undefined,
    eventMonth: r.event_month ?? undefined,
    eventDay: r.event_day ?? undefined,
    eventDatePrecision: r.event_date_precision ?? 'none',
    calendarNote: r.calendar_note ?? undefined,
    payload: r.payload ?? undefined,
    validationStatus: r.validation_status,
    validationNotes: Array.isArray(r.validation_notes) && r.validation_notes.length > 0 ? r.validation_notes : undefined,
    eligible: Boolean(r.eligible),
    discoveredAt: r.discovered_at,
    updatedAt: r.updated_at,
  };
}

export class SupabaseCandidateStore implements CandidateStore {
  readonly kind = 'supabase' as const;
  private readonly base: string;
  private readonly readKey: string;
  private readonly writeKey: string | null;

  constructor(url: string, readKey: string, writeKey: string | null) {
    this.base = url.replace(/\/$/, '');
    this.readKey = readKey;
    this.writeKey = writeKey;
  }

  get location(): string {
    return `${new URL(this.base).host} · curiosity_candidates`;
  }

  private getHeaders(): Record<string, string> {
    return {
      apikey: this.readKey,
      Authorization: `Bearer ${this.readKey}`,
      Accept: 'application/json',
    };
  }

  private postHeaders(prefer: string): Record<string, string> | null {
    if (!this.writeKey) return null;
    return {
      apikey: this.writeKey,
      Authorization: `Bearer ${this.writeKey}`,
      'Content-Type': 'application/json',
      Prefer: prefer,
    };
  }

  async readAll(): Promise<KnowledgeCandidate[]> {
    try {
      const res = await fetch(
        `${this.base}/rest/v1/curiosity_candidates?select=*&order=updated_at.desc&limit=5000`,
        { headers: this.getHeaders(), cache: 'no-store' },
      );
      if (!res.ok) return [];
      const rows = (await res.json()) as CandidateDbRow[];
      if (!Array.isArray(rows)) return [];
      return rows.map(fromDbRow);
    } catch {
      return [];
    }
  }

  async writeUpsert(candidates: readonly KnowledgeCandidate[]): Promise<{ persisted: boolean; unmigrated?: boolean }> {
    if (candidates.length === 0) return { persisted: true };
    const headers = this.postHeaders('resolution=merge-duplicates,return=minimal');
    if (!headers) return { persisted: false };

    for (let i = 0; i < candidates.length; i += 200) {
      const batch = candidates.slice(i, i + 200).map(toDbRow);
      try {
        const res = await fetch(`${this.base}/rest/v1/curiosity_candidates?on_conflict=id`, {
          method: 'POST',
          headers,
          body: JSON.stringify(batch),
        });
        if (res.status === 404) return { persisted: false, unmigrated: true };
        if (!res.ok) return { persisted: false };
      } catch {
        return { persisted: false };
      }
    }
    return { persisted: true };
  }

  async readCursors(): Promise<Record<string, string>> {
    try {
      const res = await fetch(
        `${this.base}/rest/v1/curiosity_discovery_state?select=cursor_key,continue_token`,
        { headers: this.getHeaders(), cache: 'no-store' },
      );
      if (!res.ok) return {};
      const rows = (await res.json()) as { cursor_key?: string; continue_token?: string | null }[];
      if (!Array.isArray(rows)) return {};
      const out: Record<string, string> = {};
      for (const r of rows) {
        if (r.cursor_key && r.continue_token) out[r.cursor_key] = r.continue_token;
      }
      return out;
    } catch {
      return {};
    }
  }

  async writeCursor(cursorKey: string, category: string, continueToken: string | null): Promise<void> {
    const headers = this.postHeaders('resolution=merge-duplicates,return=minimal');
    if (!headers) return;
    try {
      await fetch(`${this.base}/rest/v1/curiosity_discovery_state?on_conflict=cursor_key`, {
        method: 'POST',
        headers,
        body: JSON.stringify([{
          cursor_key: cursorKey,
          category,
          continue_token: continueToken,
          last_checked_at: new Date().toISOString(),
        }]),
      });
    } catch {
      // Non-fatal on unmigrated database.
    }
  }

  async appendRunLog(run: Omit<DiscoveryRunSummary, 'totalByCategory' | 'updatedExisting'>): Promise<void> {
    const headers = this.postHeaders('return=minimal');
    if (!headers) return;
    try {
      await fetch(`${this.base}/rest/v1/curiosity_discovery_runs`, {
        method: 'POST',
        headers,
        body: JSON.stringify([{
          ran_at: run.ranAt,
          trigger: run.trigger,
          categories_checked: run.categoriesChecked,
          low_stock_categories: run.lowStockCategories,
          eligible_counts: run.eligibleByCategory,
          new_discovered: run.newDiscovered,
          duplicate_rejections: run.duplicateRejections,
          validation_failures: run.validationFailures,
          source_failures: run.sourceFailures,
          cooldown_relaxations: run.cooldownRelaxations,
          notes: run.notes,
        }]),
      });
    } catch {
      // Non-fatal telemetry write.
    }
  }

  async lastRunLog(): Promise<Omit<DiscoveryRunSummary, 'totalByCategory' | 'updatedExisting'> | null> {
    try {
      const res = await fetch(
        `${this.base}/rest/v1/curiosity_discovery_runs?select=*&order=ran_at.desc&limit=1`,
        { headers: this.getHeaders(), cache: 'no-store' },
      );
      if (!res.ok) return null;
      const rows = (await res.json()) as {
        ran_at: string;
        trigger: DiscoveryTrigger;
        categories_checked: ReservoirCategory[];
        low_stock_categories: ReservoirCategory[];
        eligible_counts: Partial<Record<ReservoirCategory, number>>;
        new_discovered: number;
        duplicate_rejections: number;
        validation_failures: number;
        source_failures: number;
        cooldown_relaxations: number;
        notes: string[];
      }[];
      const top = rows?.[0];
      if (!top) return null;
      return {
        ranAt: top.ran_at,
        trigger: top.trigger,
        categoriesChecked: top.categories_checked ?? [],
        lowStockCategories: top.low_stock_categories ?? [],
        eligibleByCategory: top.eligible_counts ?? {},
        newDiscovered: top.new_discovered ?? 0,
        duplicateRejections: top.duplicate_rejections ?? 0,
        validationFailures: top.validation_failures ?? 0,
        sourceFailures: top.source_failures ?? 0,
        cooldownRelaxations: top.cooldown_relaxations ?? 0,
        notes: top.notes ?? [],
      };
    } catch {
      return null;
    }
  }
}

let candidateStoreOverride: CandidateStore | null = null;

export function setCandidateStoreForTesting(store: CandidateStore | null): void {
  candidateStoreOverride = store;
}

export function getCandidateStore(): CandidateStore {
  if (candidateStoreOverride) return candidateStoreOverride;
  const forced = process.env.CURIOSITY_STORE?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const secret = process.env.SUPABASE_SECRET_KEY?.trim() ?? null;
  const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? secret ?? '';
  if (forced !== 'file' && url && secret) {
    return new SupabaseCandidateStore(url, pub, secret);
  }
  return new FileCandidateStore();
}

/* ------------------------------------------------------------------ */
/* Reservoir Summary & Low-Stock Evaluation                            */
/* ------------------------------------------------------------------ */

export function summarizeReservoirCounts(candidates: readonly KnowledgeCandidate[]): {
  eligibleByCategory: Record<ReservoirCategory, number>;
  totalByCategory: Record<ReservoirCategory, number>;
  lowStockCategories: ReservoirCategory[];
} {
  const eligibleByCategory = {} as Record<ReservoirCategory, number>;
  const totalByCategory = {} as Record<ReservoirCategory, number>;
  for (const cat of RESERVOIR_CATEGORIES) {
    eligibleByCategory[cat] = 0;
    totalByCategory[cat] = 0;
  }
  for (const c of candidates) {
    if (!(c.category in totalByCategory)) continue;
    totalByCategory[c.category] += 1;
    if (c.eligible && c.validationStatus === 'valid') {
      eligibleByCategory[c.category] += 1;
    }
  }
  const lowStockCategories = RESERVOIR_CATEGORIES.filter(
    (cat) => eligibleByCategory[cat] < LOW_STOCK_THRESHOLDS[cat],
  );
  return { eligibleByCategory, totalByCategory, lowStockCategories };
}

export async function getReservoirStatus(store = getCandidateStore()): Promise<ReservoirStatusSummary> {
  const stored = await store.readAll();
  const withSeed = stored.length > 0
    ? stored
    : mergeCandidateDrafts([], curatedReservoirDrafts()).merged;
  const counts = summarizeReservoirCounts(withSeed);
  const lastDiscoveryRun = await store.lastRunLog();
  return {
    storeKind: store.kind,
    eligibleByCategory: counts.eligibleByCategory,
    totalByCategory: counts.totalByCategory,
    lowStockThresholds: { ...LOW_STOCK_THRESHOLDS },
    targetPoolSizes: { ...TARGET_POOL_SIZES },
    lowStockCategories: counts.lowStockCategories,
    lastDiscoveryRun,
  };
}

/* ------------------------------------------------------------------ */
/* Today in History — Priority Selection Engine (Sikh -> Indian -> World)
/* ------------------------------------------------------------------ */

export interface HistoryTriadResult {
  /** Strictly ordered: 1. Sikh History, 2. Indian History, 3. World History. */
  entries: HistoryEvent[];
  /** Matching `ContentCandidate<HistoryEvent>` wrappers for recording into `curiosity_seen`. */
  chosenCandidates: ContentCandidate<HistoryEvent>[];
  /** Combined canonical content id string (`id1+id2+id3`). */
  combinedId: string;
  /** Overall section origin (`new` if any slot used fresh live discovery, else `curated`). */
  sectionOrigin: 'new' | 'curated';
  /** Number of slots that required anti-repetition window relaxation. */
  cooldownRelaxations: number;
  /** Diagnostic notes per category when a live source degraded or fell back. */
  notes: string[];
}

export interface SelectHistoryTriadOptions {
  date: string;
  seen: readonly SeenRecord[];
  reservoirCandidates?: readonly KnowledgeCandidate[];
  discoverForCategory?: (
    category: HistoryCategory,
    month: number,
    day: number,
  ) => Promise<{ drafts: CandidateDraft[]; note?: string }>;
}

function collidesWithSameDaySelection(
  candidate: ContentCandidate<HistoryEvent>,
  raw: KnowledgeCandidate,
  taken: {
    ids: Set<string>;
    entities: Set<string>;
    urls: Set<string>;
    titles: Set<string>;
    fingerprints: Set<string>;
    signatures: string[];
    subjects: Set<string>;
  },
): boolean {
  if (taken.ids.has(candidate.id)) return true;
  if (taken.entities.has(raw.entityId)) return true;
  const normTitle = normalizeTitle(candidate.title);
  if (normTitle && taken.titles.has(normTitle)) return true;
  const fp = candidateFingerprint(candidate);
  if (fp && taken.fingerprints.has(fp)) return true;
  const normUrl = candidate.url ? normalizeUrl(candidate.url) : '';
  if (normUrl && taken.urls.has(normUrl)) return true;
  for (const subj of candidate.subjects ?? []) {
    if (!subj.startsWith('year:') && taken.subjects.has(subj)) return true;
  }
  const sig = candidateSignature(candidate);
  for (const prevSig of taken.signatures) {
    if (prevSig && sig && signatureSimilarity(prevSig, sig) >= 0.4) return true;
  }
  return false;
}

export async function selectHistoryTriad(
  options: SelectHistoryTriadOptions,
): Promise<HistoryTriadResult> {
  const parsed = parseIsoCalendarDate(options.date);
  if (!parsed) {
    throw new RangeError(`Invalid ISO calendar date for Today in History: "${options.date}"`);
  }

  const baseMerged = mergeCandidateDrafts(
    options.reservoirCandidates ?? [],
    curatedReservoirDrafts(),
  ).merged;

  let workingPool = baseMerged.filter((c) => c.eligible && c.validationStatus === 'valid');
  const workingSeen: SeenRecord[] = [...options.seen];

  const taken = {
    ids: new Set<string>(),
    entities: new Set<string>(),
    urls: new Set<string>(),
    titles: new Set<string>(),
    fingerprints: new Set<string>(),
    signatures: [] as string[],
    subjects: new Set<string>(),
  };

  const entries: HistoryEvent[] = [];
  const chosenCandidates: ContentCandidate<HistoryEvent>[] = [];
  const notes: string[] = [];
  let cooldownRelaxations = 0;

  const isNonLeapFeb28 = !isIsoLeapYear(parsed.year) && parsed.month === 2 && parsed.day === 28;
  let dateFeedQueried = false;
  let dateFeedNote: string | undefined;

  for (const [slotIdx, category] of HISTORY_CATEGORY_ORDER.entries()) {
    const policy = historyPolicyFor(category);
    const historyIndex = buildHistoryIndex(publicationRecords(workingSeen));

    const buildEligiblePool = (
      mode: 'exact-curated' | 'exact-date' | 'leap-day-observed' | 'archive-fallback',
    ): Array<{ candidate: ContentCandidate<HistoryEvent>; raw: KnowledgeCandidate }> => {
      const matching = workingPool.filter((c) => {
        if (c.category !== category) return false;
        if (mode === 'exact-curated') {
          return c.payload?.origin === 'curated' && c.eventMonth === parsed.month && c.eventDay === parsed.day;
        }
        if (mode === 'exact-date') {
          return c.eventMonth === parsed.month && c.eventDay === parsed.day;
        }
        if (mode === 'leap-day-observed') {
          return c.eventMonth === 2 && c.eventDay === 29;
        }
        return true;
      });

      const ordered = [...matching].sort((a, b) => {
        const aCurated = a.payload?.origin === 'curated' ? 0 : 1;
        const bCurated = b.payload?.origin === 'curated' ? 0 : 1;
        return aCurated - bCurated;
      });

      const isExact = mode === 'exact-curated' || mode === 'exact-date';
      return ordered
        .map((raw) => {
          const ev = candidateToHistoryEvent(raw, {
            forThisDate: isExact,
            dateMatch: isExact ? 'exact-date' : mode,
            extraCalendarNote: mode === 'leap-day-observed'
              ? 'Occurred on leap day (February 29); surfaced on February 28 in a non-leap year.'
              : undefined,
          });
          const cand = candidateFromHistory(
            ev,
            raw.id,
            [
              ...raw.aliases.map((a) => `alias:${normalizeTitle(a)}`),
              ...raw.subjects,
              /^Q\d+$/i.test(raw.entityId) ? `qid:${raw.entityId}` : '',
            ].filter(Boolean),
          );
          return { candidate: cand, raw };
        })
        .filter(({ candidate, raw }) => !collidesWithSameDaySelection(candidate, raw, taken));
    };

    const tryPick = (
      poolItems: Array<{ candidate: ContentCandidate<HistoryEvent>; raw: KnowledgeCandidate }>,
      allowRelaxation: boolean,
    ) => {
      if (poolItems.length === 0) return null;
      const outcome = selectCandidate(
        poolItems.map((p) => p.candidate),
        {
          card: 'history',
          date: options.date,
          index: historyIndex,
          offset: slotIdx * 3,
          policy: { ...policy, allowRelaxation },
        },
      );
      if (!outcome.ok || !outcome.candidate) return null;
      const matched = poolItems.find((p) => p.candidate.id === outcome.candidate!.id);
      if (!matched) return null;
      return { outcome, candidate: matched.candidate, raw: matched.raw };
    };

    // Pass 1: Curated scholarly exact MM-DD match first, then reservoir exact MM-DD match.
    let resolved = tryPick(buildEligiblePool('exact-curated'), false)
      ?? tryPick(buildEligiblePool('exact-date'), false);

    // Pass 2: On-demand discovery BEFORE falling back to an archive milestone!
    if (!resolved && options.discoverForCategory) {
      if (!dateFeedQueried) {
        dateFeedQueried = true;
        // Fetch once across all three history categories for this calendar date.
        const [sikhDisc, indDisc, worldDisc] = await Promise.all([
          options.discoverForCategory('sikh-history', parsed.month, parsed.day),
          options.discoverForCategory('indian-history', parsed.month, parsed.day),
          options.discoverForCategory('world-history', parsed.month, parsed.day),
        ]);
        dateFeedNote = sikhDisc.note ?? indDisc.note ?? worldDisc.note;
        const combinedDrafts = [...sikhDisc.drafts, ...indDisc.drafts, ...worldDisc.drafts];
        if (combinedDrafts.length > 0) {
          const upserted = mergeCandidateDrafts(workingPool, combinedDrafts);
          workingPool = upserted.merged.filter((c) => c.eligible && c.validationStatus === 'valid');
        }
      }
      if (dateFeedNote) notes.push(`${category}: ${dateFeedNote}`);
      resolved = tryPick(buildEligiblePool('exact-date'), false);
    }

    // Pass 3: Leap-day February 29 observation on non-leap February 28.
    if (!resolved && isNonLeapFeb28) {
      resolved = tryPick(buildEligiblePool('leap-day-observed'), false);
    }

    // Pass 4: Labelled category milestone (`forThisDate: false`), relaxing only if every milestone is inside cooldown.
    if (!resolved) {
      resolved = tryPick(buildEligiblePool('archive-fallback'), false)
        ?? tryPick(buildEligiblePool('archive-fallback'), true);
      if (resolved) {
        const existingCause = notes.find((n) => n.startsWith(`${category}:`));
        if (!existingCause) {
          notes.push(
            `${category}: no unseen verified ${monthDayDisplay(parsed.month, parsed.day)} anniversary; published labelled archive milestone`,
          );
        }
      }
    }

    if (!resolved) {
      throw new RangeError(`No usable candidate for ${HISTORY_CATEGORY_LABELS[category]} on ${options.date}`);
    }

    if (resolved.outcome.relaxed) {
      cooldownRelaxations += 1;
      notes.push(...resolved.outcome.warnings);
    }

    const chosen = resolved.candidate;
    const raw = resolved.raw;
    entries.push(chosen.item);
    chosenCandidates.push(chosen);

    taken.ids.add(chosen.id);
    taken.entities.add(raw.entityId);
    if (chosen.url) taken.urls.add(normalizeUrl(chosen.url));
    const normTitle = normalizeTitle(chosen.title);
    if (normTitle) taken.titles.add(normTitle);
    taken.fingerprints.add(candidateFingerprint(chosen));
    taken.signatures.push(candidateSignature(chosen));
    for (const subj of chosen.subjects ?? []) {
      if (!subj.startsWith('year:')) taken.subjects.add(subj);
    }

    workingSeen.push(
      toSeenRecord({
        card: 'history',
        id: chosen.id,
        on: options.date,
        title: chosen.title,
        ...(chosen.url ? { url: chosen.url } : {}),
        fingerprint: candidateFingerprint(chosen),
        signature: candidateSignature(chosen),
        ...(chosen.subjects?.length ? { subjects: chosen.subjects } : {}),
        ...(chosen.sourceName ? { source: chosen.sourceName } : {}),
        ...(chosen.version ? { version: chosen.version } : {}),
      }),
    );
  }

  const sectionOrigin: 'new' | 'curated' = entries.some((e) => e.origin === 'live' && e.forThisDate !== false)
    ? 'new'
    : 'curated';

  return {
    entries,
    chosenCandidates,
    combinedId: chosenCandidates.map((c) => c.id).join('+'),
    sectionOrigin,
    cooldownRelaxations,
    notes,
  };
}
