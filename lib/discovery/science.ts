/**
 * The science significance layer.
 *
 * WHAT PROBLEM THIS SOLVES
 * "Physics of the Day" used to be a Wikipedia article picked by `dayNumber % 9`.
 * That is a topic rotation, not a discovery. This module turns a *research
 * record* — a journal article, a preprint, a DOI — into a card a reader can
 * trust, by doing three things the old path could not:
 *
 *   1. **Classification.** Every record says what it is: peer-reviewed research,
 *      a preprint, an institutional announcement or a press release. The label is
 *      stored with the record and printed on the card, so a preprint can never be
 *      read as a confirmed finding.
 *   2. **Significance scoring.** A transparent, additive score over freshness,
 *      venue quality, citation signal, subject relevance, publication type and
 *      substance. Every component is returned as a sentence, so the card can say
 *      *why* it was chosen instead of asserting importance.
 *   3. **Rights discipline.** An abstract is reproduced only when the source
 *      states an open licence. Otherwise the card carries metadata only and links
 *      to the publisher. No full text, ever.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * It does not claim to find "the most important paper published today". Citation
 * counts cannot rank a paper from this week, and press releases outnumber
 * findings. The honest, achievable target — and what the scoring produces — is a
 * small set of recent, well-attributed, appropriately-labelled records ranked by
 * a *stated* heuristic.
 *
 * Everything here is pure: no network, no storage, no clock of its own.
 */

import { normalizeTitle, normalizeUrl } from '../curiosity/dedupe';
import { collectionRecordId } from './collection';
import type { CandidateDraft } from '../curiosity/reservoir';
import {
  RESEARCH_PROVENANCE_LABELS,
  type ResearchProvenance,
  type ResearchRecord,
  type ResearchTextRights,
  type ScienceConcept,
} from '../curiosity/types';

export const SCIENCE_DISCIPLINES = ['physics', 'chemistry', 'biology'] as const;

export type ScienceDiscipline = (typeof SCIENCE_DISCIPLINES)[number];

/**
 * A record as one adapter read it.
 *
 * Normalised *before* scoring so the scorer never has to know which API a field
 * came from, and so a new adapter cannot smuggle a different meaning for
 * "peer reviewed" into the ranking.
 */
export interface ScienceRecord {
  /** Adapter id: `openalex`, `crossref`, `europepmc`, `arxiv`. */
  sourceId: string;
  discipline: ScienceDiscipline;
  title: string;
  /** Bare DOI, lower-cased, no `https://doi.org/` prefix. */
  doi?: string;
  /** The page a reader should open: the DOI resolver or the source's own abstract page. */
  url: string;
  /** ISO calendar date (`YYYY-MM-DD`) of publication, when the source stated one. */
  publishedOn?: string;
  venue?: string;
  publisher?: string;
  authors: string[];
  institutions: string[];
  citationCount?: number;
  /** The source's own type string, kept for the audit trail. */
  type?: string;
  /** The source says this is a preprint-server deposit. */
  preprint: boolean;
  /** The source indexes it as a peer-reviewed research article. */
  peerReviewed: boolean;
  /** An open licence for the abstract, when the source names one. */
  license?: string;
  /** Abstract text the source supplied. Only ever shown under an open licence. */
  abstractText?: string;
  openAccess?: boolean;
  /** The query that surfaced it, e.g. `physics:quantum`. */
  foundVia: string;
}

/* ------------------------------------------------------------------ */
/* Relevance terms per discipline                                     */
/* ------------------------------------------------------------------ */

/**
 * Search terms and relevance keywords.
 *
 * These are deliberately broad: a discipline is not one subfield, and the ranker
 * uses them for *relevance*, not for exclusion. A record outside every keyword can
 * still be accepted — it simply scores lower, which is exactly the behaviour a
 * transparent heuristic should have.
 */
export const DISCIPLINE_TERMS: Record<ScienceDiscipline, { queries: string[]; keywords: RegExp }> = {
  physics: {
    queries: [
      'quantum mechanics',
      'condensed matter physics',
      'astrophysics',
      'particle physics',
      'optics and photonics',
    ],
    keywords: /\b(physic|quantum|photon|optic|laser|magnet|superconduct|gravit|cosmolog|astro|particle|neutrino|condensed matter|semiconductor|thermodynamic|relativit|plasma|atomic|molecular|entangle|topolog)/i,
  },
  chemistry: {
    queries: [
      'catalysis chemistry',
      'materials chemistry',
      'organic synthesis',
      'electrochemistry energy storage',
      'analytical chemistry',
    ],
    keywords: /\b(chemis|catalys|catalyt|molecul|reaction|synthesis|polymer|electrochem|battery|spectroscop|compound|solvent|ligand|enzyme|photochem|nanomaterial|electrolyte|metabolom|chromatograph)/i,
  },
  biology: {
    queries: [
      'cell biology',
      'genomics evolution',
      'neuroscience',
      'immunology microbiology',
      'ecology climate biology',
    ],
    keywords: /\b(biolog|cell|genom|gene|protein|enzyme|evolution|ecolog|neuron|immun|microb|bacteri|virus|virolog|plant|species|metabolis|transcript|organism|disease|therap|clinical|molecular)/i,
  },
};

/* ------------------------------------------------------------------ */
/* Venue quality                                                      */
/* ------------------------------------------------------------------ */

/**
 * Venues that are unambiguously selective. This is a *ranking aid*, not a claim
 * that everything outside the list is poor — a paper in an unlisted but indexed
 * journal still scores as peer-reviewed research, which is the important part.
 *
 * The list is short on purpose. A long allow-list would be a second, unreviewable
 * body of editorial judgement hiding inside a ranking function.
 */
export const HIGH_SELECTIVITY_VENUES: readonly string[] = [
  'nature',
  'science',
  'cell',
  'the lancet',
  'new england journal of medicine',
  'physical review letters',
  'physical review x',
  'nature physics',
  'nature chemistry',
  'nature biology',
  'nature materials',
  'nature communications',
  'science advances',
  'proceedings of the national academy of sciences',
  'journal of the american chemical society',
  'angewandte chemie',
  'chemical science',
  'nature cell biology',
  'cell reports',
  'elife',
  'embo journal',
  'immunity',
  'neuron',
  'the astrophysical journal',
  'monthly notices of the royal astronomical society',
  'journal of high energy physics',
];

/** Venues that publish unreviewed deposits. Their records are never labelled reviewed. */
export const PREPRINT_VENUES: readonly string[] = [
  'arxiv',
  'biorxiv',
  'medrxiv',
  'chemrxiv',
  'ssrn',
  'research square',
  'preprints.org',
  'techrxiv',
];

function venueIsHighSelectivity(venue?: string): boolean {
  if (!venue) return false;
  const text = venue.trim().toLowerCase();
  // A prefix match handles "Nature Communications" vs "Nature Communications
  // Biology" without needing every variant in the list.
  return HIGH_SELECTIVITY_VENUES.some((known) => text === known || text.startsWith(`${known} `) || text.includes(known));
}

export function venueLooksLikePreprint(venue?: string, url?: string): boolean {
  const text = `${venue ?? ''} ${url ?? ''}`.toLowerCase();
  return PREPRINT_VENUES.some((known) => text.includes(known));
}

/**
 * What an adapter is given, and what it must return.
 *
 * Shared by every science source so the runner can treat them identically, and so
 * a new adapter cannot invent its own notion of "today" or of a record count.
 */
export interface ScienceSourceContext {
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  nowIso: string;
  maxRecords?: number;
  cursor?: string;
}

export interface ScienceSourceOutcome {
  records: ScienceRecord[];
  report: import('./collection').SourceReport;
}

/* ------------------------------------------------------------------ */
/* Normalisation                                                      */
/* ------------------------------------------------------------------ */

/** A bare, comparable DOI. `10.1038/S41586-024-00001-2` → `10.1038/s41586-024-00001-2`. */
export function normalizeDoi(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?&].*$/, '');
  if (!/^10\.\d{4,9}\/\S+$/.test(text)) return undefined;
  return text.toLowerCase();
}

export function doiUrl(doi: string): string {
  return `https://doi.org/${doi}`;
}

/** An ISO calendar date, or undefined. Never invents a day from a year alone. */
export function isoDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return undefined;
  const [, year, month, day] = match;
  const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const iso = parsed.toISOString().slice(0, 10);
  // `2026-02-30` parses as 2 March in JavaScript. Publishing that would silently
  // rewrite a source's date into one it never stated, so the round trip decides.
  if (iso !== `${year}-${month}-${day}`) return undefined;
  return iso;
}

/** Whole days between two ISO dates; never negative for a future date. */
export function ageInDays(publishedOn: string, today: string): number {
  const a = Date.parse(`${publishedOn}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/* ------------------------------------------------------------------ */
/* Classification                                                     */
/* ------------------------------------------------------------------ */

/**
 * Decide what kind of record this is.
 *
 * The order matters. A preprint server always wins, because a deposit there has
 * not been reviewed no matter what the journal reference field says. Then an
 * explicit press-release type. Peer review is only claimed for an article whose
 * source indexes it as a research article in a named venue — which is why the
 * adapters pass `peerReviewed` from the API rather than guessing from a title.
 */
export function classifyProvenance(record: ScienceRecord): ResearchProvenance {
  if (record.preprint || venueLooksLikePreprint(record.venue, normalizeUrl(record.url))) return 'preprint';
  const type = (record.type ?? '').toLowerCase();
  if (/press[- ]release|news/.test(type)) return 'press-release';
  if (/editorial|comment|letter|erratum|correction|retraction|posted-content/.test(type)) return 'reference';
  if (record.peerReviewed && record.venue) return 'peer-reviewed';
  if (record.doi && record.venue) return 'peer-reviewed';
  return 'reference';
}

/**
 * Reject a record before it can reach the reservoir.
 *
 * These are the shapes that look like a discovery in a search result and are not
 * one. Rejecting them at the adapter boundary keeps the scorer honest: the score
 * is for ranking candidates, not for rescuing non-candidates.
 */
const NON_FINDING_TITLE = /\b(erratum|corrigendum|correction to|retraction|retracted|editorial|call for papers|book review|conference announcement|in memoriam|obituary|upcoming|foreword|preface)\b/i;
const NON_FINDING_TYPE = /^(editorial|erratum|letter|correction|retraction|peer-review|component|dataset|posted-content)$/i;

export function rejectionForRecord(record: ScienceRecord, today: string, maxAgeDays = 60): string | null {
  const title = record.title?.trim() ?? '';
  if (title.length < 24) return 'title too short to describe a finding';
  if (NON_FINDING_TITLE.test(title)) return `not a research report (${NON_FINDING_TITLE.exec(title)?.[0]})`;
  if (record.type && NON_FINDING_TYPE.test(record.type)) return `publication type "${record.type}" is not a research article`;
  if (!record.url || !/^https?:\/\//i.test(record.url)) return 'no resolvable source link';
  if (!record.publishedOn) return 'no publication date supplied by the source';
  // A date that cannot round-trip is not a date: `2026-02-30` would otherwise be
  // quietly re-dated to 2 March and published as if the source had said so.
  if (isoDate(record.publishedOn) !== record.publishedOn) return 'unreadable publication date';
  const age = ageInDays(record.publishedOn, today);
  if (!Number.isFinite(age)) return 'unreadable publication date';
  if (age > maxAgeDays) return `published ${age} days ago (window is ${maxAgeDays})`;
  return null;
}

/* ------------------------------------------------------------------ */
/* Scoring                                                            */
/* ------------------------------------------------------------------ */

export interface ScienceScoreComponents {
  freshness: number;
  venue: number;
  citations: number;
  relevance: number;
  provenance: number;
  substance: number;
}

export interface ScienceScore {
  total: number;
  components: ScienceScoreComponents;
  /** 0–1 relevance, kept separately because it is a filter as well as a score. */
  relevance: number;
  provenance: ResearchProvenance;
  /** What the reader is told about the ranking. One sentence per component. */
  basis: string[];
}

/** Maximum points per component. Documented so the weights are reviewable. */
export const SCIENCE_SCORE_WEIGHTS: ScienceScoreComponents = {
  freshness: 30,
  venue: 20,
  citations: 15,
  relevance: 15,
  provenance: 15,
  substance: 5,
};

/**
 * Score one record. Additive, bounded, and every component has a sentence.
 *
 * Freshness decays linearly over the window, so a two-day-old paper outranks a
 * forty-day-old one from the same venue. Citations are logarithmic and explicitly
 * discounted for very new papers: a paper published this week has had no time to
 * be cited, and pretending its zero means "unimportant" would systematically
 * favour older work.
 */
export function scoreScienceRecord(record: ScienceRecord, today: string): ScienceScore {
  const provenance = classifyProvenance(record);
  const age = record.publishedOn ? ageInDays(record.publishedOn, today) : Number.POSITIVE_INFINITY;
  const basis: string[] = [];

  const freshnessRatio = Number.isFinite(age) ? Math.max(0, 1 - age / 60) : 0;
  const freshness = Math.round(freshnessRatio * SCIENCE_SCORE_WEIGHTS.freshness);
  if (Number.isFinite(age)) {
    basis.push(age === 0 ? 'published today' : `published ${age} day${age === 1 ? '' : 's'} ago`);
  }

  const selective = venueIsHighSelectivity(record.venue);
  const venue = record.venue
    ? selective
      ? SCIENCE_SCORE_WEIGHTS.venue
      : Math.round(SCIENCE_SCORE_WEIGHTS.venue * 0.6)
    : 0;
  if (record.venue) {
    basis.push(selective ? `${record.venue} is a selective venue` : `published in ${record.venue}`);
  }

  const citations = record.citationCount ?? 0;
  const citationPoints = citations > 0
    ? Math.min(SCIENCE_SCORE_WEIGHTS.citations, Math.round(Math.log2(1 + citations) * 3))
    : 0;
  if (citations > 0) {
    basis.push(
      age <= 30
        ? `${citations} citation${citations === 1 ? '' : 's'} already, though the paper is under a month old`
        : `${citations} citation${citations === 1 ? '' : 's'} recorded`,
    );
  } else if (Number.isFinite(age) && age <= 45) {
    basis.push('no citations yet — expected for a paper this recent');
  }

  const terms = DISCIPLINE_TERMS[record.discipline];
  const haystack = `${record.title} ${record.venue ?? ''} ${(record.institutions ?? []).join(' ')}`;
  const matches = (haystack.match(terms.keywords) ?? []).length;
  const relevanceRatio = matches > 0 ? Math.min(1, 0.6 + matches * 0.2) : 0.2;
  const relevance = Math.round(relevanceRatio * SCIENCE_SCORE_WEIGHTS.relevance);
  if (matches > 0) basis.push(`subject matter sits inside ${record.discipline}`);

  const provenancePoints =
    provenance === 'peer-reviewed'
      ? SCIENCE_SCORE_WEIGHTS.provenance
      : provenance === 'preprint'
        ? Math.round(SCIENCE_SCORE_WEIGHTS.provenance * 0.45)
        : Math.round(SCIENCE_SCORE_WEIGHTS.provenance * 0.2);
  basis.push(RESEARCH_PROVENANCE_LABELS[provenance]);

  // Substance: a named venue, an author, and enough title to say what was done.
  const substanceChecks = [
    Boolean(record.venue),
    record.authors.length > 0,
    record.title.split(/\s+/).length >= 6,
    Boolean(record.doi),
  ].filter(Boolean).length;
  const substance = Math.round((substanceChecks / 4) * SCIENCE_SCORE_WEIGHTS.substance);

  const components: ScienceScoreComponents = {
    freshness,
    venue,
    citations: citationPoints,
    relevance,
    provenance: provenancePoints,
    substance,
  };
  const total = Math.min(
    100,
    components.freshness + components.venue + components.citations + components.relevance + components.provenance + components.substance,
  );

  return { total, components, relevance: relevanceRatio, provenance, basis };
}

/* ------------------------------------------------------------------ */
/* Rights                                                             */
/* ------------------------------------------------------------------ */

const OPEN_ABSTRACT_LICENSES = /^(cc0|cc-by|cc-by-sa|cc by|cc by-sa|public-domain|publisher-specific-oa|other-oa)/i;

/**
 * Whether the abstract may be shown.
 *
 * Crossref and OpenAlex both publish a licence field for the *article*; Europe PMC
 * states `license` per record. Only an explicitly open licence qualifies. When the
 * field is missing, this returns `metadata-only`, because "probably open" is not a
 * rights basis.
 */
export function abstractRights(record: ScienceRecord): ResearchTextRights {
  if (!record.abstractText || !record.license) return 'metadata-only';
  return OPEN_ABSTRACT_LICENSES.test(record.license.trim()) ? 'open-licensed-abstract' : 'metadata-only';
}

/**
 * A short excerpt of the abstract, only under an open licence.
 *
 * Two sentences and 420 characters at most: enough to say what the study was,
 * not enough to substitute for reading the paper. The excerpt is quoted verbatim
 * with attribution, which is what the licence requires.
 */
export function licensedExcerpt(record: ScienceRecord, maxChars = 420): string | undefined {
  if (abstractRights(record) !== 'open-licensed-abstract') return undefined;
  const text = (record.abstractText ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return undefined;
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z(“"'])/).slice(0, 2).join(' ');
  const excerpt = sentences.length > maxChars ? `${sentences.slice(0, maxChars).replace(/\s+\S*$/, '')}…` : sentences;
  return excerpt.trim() || undefined;
}

/* ------------------------------------------------------------------ */
/* From record to card                                                */
/* ------------------------------------------------------------------ */

function authorLine(authors: readonly string[]): string {
  const clean = authors.map((author) => author.trim()).filter(Boolean);
  if (clean.length === 0) return '';
  if (clean.length <= 3) return clean.join(', ');
  return `${clean.slice(0, 3).join(', ')} et al.`;
}

const RECORD_ID_PREFIX: Record<ScienceDiscipline, string> = {
  physics: 'sciphy',
  chemistry: 'scichem',
  biology: 'scibio',
};

/** The canonical candidate id for a record. DOI first, so sources collapse. */
export function scienceRecordId(record: ScienceRecord): string {
  const key = record.doi ? `doi:${record.doi}` : normalizeUrl(record.url) || normalizeTitle(record.title);
  return collectionRecordId(RECORD_ID_PREFIX[record.discipline], key).slice(0, 120);
}

/**
 * Build the card.
 *
 * The wording is assembled from metadata only: the title, the venue, the date and
 * the scoring basis. That is a deliberate limit — this app has no model to write a
 * summary, and paraphrasing an abstract badly would be worse than linking to it.
 * When the licence is open, one short verbatim excerpt is added and attributed; the
 * reader is always told which of the two they are looking at.
 */
export function scienceConceptFromRecord(
  record: ScienceRecord,
  score: ScienceScore,
  options: { verifiedAgainst?: string[] } = {},
): ScienceConcept {
  const provenance = score.provenance;
  const published = record.publishedOn;
  const dateLine = published ? `published ${published}` : 'publication date not supplied';
  const excerpt = licensedExcerpt(record);

  const typeSentence = provenance === 'peer-reviewed'
    ? `A peer-reviewed research article in ${record.venue ?? 'an indexed journal'}, ${dateLine}.`
    : provenance === 'preprint'
      ? `A preprint posted at ${record.venue ?? 'a preprint server'}, ${dateLine}. It has not been peer-reviewed.`
      : `A ${RESEARCH_PROVENANCE_LABELS[provenance].toLowerCase()} from ${record.venue ?? record.publisher ?? 'the source'}, ${dateLine}.`;

  const authorSentence = record.authors.length
    ? `${authorLine(record.authors)}${record.institutions.length ? ` (${record.institutions.slice(0, 2).join('; ')})` : ''}.`
    : '';

  const simple = [typeSentence, excerpt ? `The authors write: “${excerpt}”` : '', authorSentence]
    .filter(Boolean)
    .join(' ');

  const whySelected = score.basis.slice(0, 3).join('; ');
  const connection = whySelected
    ? `Selected because it is ${whySelected}. The full article is the place to check the finding.`
    : 'Selected from the recent records indexed by the source. Read the full article before drawing conclusions.';

  const surprising = provenance === 'peer-reviewed'
    ? `One recent, peer-reviewed ${record.discipline} paper out of the many published this week${record.citationCount ? ` — ${record.citationCount} citation${record.citationCount === 1 ? '' : 's'} so far` : ''}.`
    : `A preprint is not a finding: it has not been reviewed, and it may change or be withdrawn.`;

  const research: ResearchRecord = {
    doi: record.doi,
    venue: record.venue,
    publisher: record.publisher,
    authors: record.authors.slice(0, 8),
    institutions: record.institutions.slice(0, 4),
    publishedOn: published ?? '',
    peerReviewed: provenance === 'peer-reviewed',
    citationCount: record.citationCount,
    openAccess: record.openAccess,
    license: record.license,
    significanceScore: score.total,
    significanceBasis: score.basis,
    rights: abstractRights(record),
    verifiedAgainst: [...new Set([record.sourceId, ...(options.verifiedAgainst ?? [])])],
    foundVia: record.foundVia,
  };

  const sourceName = record.venue
    ? `${record.venue}${record.doi ? ` · DOI ${record.doi}` : ''}`
    : record.doi
      ? `DOI ${record.doi}`
      : new URL(record.url).hostname;

  return {
    id: scienceRecordId(record),
    topic: record.title.replace(/\s+/g, ' ').trim().slice(0, 220),
    aliases: [record.title, record.doi ? `doi:${record.doi}` : ''].filter(Boolean),
    origin: 'research',
    provenance,
    provenanceLabel: RESEARCH_PROVENANCE_LABELS[provenance],
    ...(published ? { publishedOn: published } : {}),
    ...(record.venue ? { venue: record.venue } : {}),
    ...(record.doi ? { doi: record.doi } : {}),
    ...(record.authors.length ? { authors: record.authors.slice(0, 6) } : {}),
    whySelected,
    research,
    simple,
    connection,
    surprising,
    question: `The paper's own abstract and figures are at the link. What would you want to check before repeating this result?`,
    source: {
      url: record.url,
      name: sourceName,
      attribution: `${provenance === 'peer-reviewed' ? 'Peer-reviewed research' : RESEARCH_PROVENANCE_LABELS[provenance]}. Metadata via ${[...new Set([record.sourceId, ...(options.verifiedAgainst ?? [])])].join(', ')}; no full text reproduced.${excerpt ? ` Abstract excerpt quoted under ${record.license}.` : ''}`,
    },
  };
}

/**
 * The draft that enters the reservoir.
 *
 * `entityId` is the DOI whenever there is one — that is what makes OpenAlex,
 * Crossref, Europe PMC and arXiv collapse to a single row. `payload.science`
 * carries the score and its basis, which is the audit trail the daily card and the
 * status panel read.
 */
export function scienceDraftFromRecord(
  record: ScienceRecord,
  score: ScienceScore,
  nowIso: string,
  options: { verifiedAgainst?: string[] } = {},
): CandidateDraft {
  const concept = scienceConceptFromRecord(record, score, options);
  const provenance = score.provenance;
  return {
    id: concept.id,
    entityId: record.doi ? `doi:${record.doi}` : normalizeUrl(record.url) || concept.id,
    canonicalUrl: record.url,
    category: record.discipline,
    subcategory: provenance,
    title: concept.topic,
    description: concept.simple,
    significance: concept.connection,
    sourceName: concept.source?.name ?? record.sourceId,
    attribution: concept.source?.attribution ?? `Metadata via ${record.sourceId}.`,
    // The metadata is CC0/CC BY from the index; the article's own licence is
    // recorded separately on the concept.
    license: record.license ? `Metadata: ${record.sourceId}. Article: ${record.license}.` : `Metadata: ${record.sourceId}.`,
    aliases: concept.aliases ?? [],
    subjects: [
      record.doi ? `doi:${record.doi}` : '',
      record.venue ? `venue:${record.venue}` : '',
      `research:${provenance}`,
    ].filter(Boolean),
    payload: {
      concept,
      science: {
        discipline: record.discipline,
        doi: record.doi,
        venue: record.venue,
        publishedOn: record.publishedOn,
        provenance,
        provenanceLabel: RESEARCH_PROVENANCE_LABELS[provenance],
        peerReviewed: provenance === 'peer-reviewed',
        significanceScore: score.total,
        significanceComponents: score.components,
        significanceBasis: score.basis,
        rights: abstractRights(record),
        verifiedAgainst: [...new Set([record.sourceId, ...(options.verifiedAgainst ?? [])])],
        foundVia: record.foundVia,
      },
    },
    validationStatus: 'valid',
    eligible: true,
    discoveredAt: nowIso,
    updatedAt: nowIso,
  };
}

/**
 * The gate the daily publisher applies before a stored research candidate may be
 * shown. Stored records can age, so freshness is re-checked at publish time rather
 * than trusted from discovery time.
 */
export function researchCandidateEligibleToday(
  payload: { science?: { publishedOn?: string; provenance?: string; significanceScore?: number } } | undefined,
  today: string,
  options: { maxAgeDays?: number; minimumScore?: number } = {},
): boolean {
  const science = payload?.science;
  if (!science) return false;
  if (!science.publishedOn) return false;
  if (ageInDays(science.publishedOn, today) > (options.maxAgeDays ?? 60)) return false;
  if ((science.significanceScore ?? 0) < (options.minimumScore ?? 35)) return false;
  return science.provenance === 'peer-reviewed' || science.provenance === 'preprint';
}
