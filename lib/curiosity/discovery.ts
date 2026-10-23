import { createHash } from 'node:crypto';
import { idFromText, normalizeTitle, normalizeUrl } from './dedupe';
import type { ContentCandidate } from './candidates';
import { candidateFromScience } from './candidates';
import {
  HISTORY_CATEGORY_ORDER,
  RESERVOIR_CATEGORIES,
  type DiscoveryRunSummary,
  type DiscoveryTrigger,
  type EventDatePrecision,
  type HistoryCategory,
  type MythCharacter,
  type ReservoirCategory,
  type ScienceConcept,
} from './types';
import {
  DISAMBIGUATION_TITLE,
  UNSUITABLE_TITLE,
  wikidataAliases,
  wikidataSearchEntity,
  wikidataSparql,
  wikimediaEnabled,
  wikimediaOnThisDay,
  wikipediaCategoryMembers,
  wikipediaLeads,
  type OnThisDayFeedEntry,
  type SparqlRow,
  type WikidataEntity,
  type WikimediaFetchOptions,
  type WikipediaPage,
} from './wikimedia';
import { fetchDeveloperRadar, fetchNews } from './sources';
import { addPublicationDays, dayNumber } from './schedule';
import { parseIsoCalendarDate } from './content';
import { mythCharacters } from './content/mythology';
import {
  curatedReservoirDrafts,
  getCandidateStore,
  isValidMonthDay,
  mergeCandidateDrafts,
  monthDayDisplay,
  summarizeReservoirCounts,
  type CandidateDraft,
  type CandidateStore,
} from './reservoir';

/* ------------------------------------------------------------------ */
/* Discipline configuration                                            */
/* ------------------------------------------------------------------ */

export type ScienceDiscipline = 'chemistry' | 'physics' | 'biology';

export interface DisciplineConfig {
  card: ScienceDiscipline;
  categories: string[];
  subfields: string[];
  connectionWords: RegExp;
}

export const SCIENCE_DISCIPLINES: Record<ScienceDiscipline, DisciplineConfig> = {
  chemistry: {
    card: 'chemistry',
    categories: [
      'Category:Chemical reactions',
      'Category:Organic chemistry',
      'Category:Inorganic chemistry',
      'Category:Analytical chemistry',
      'Category:Physical chemistry',
      'Category:Chemical elements',
      'Category:Biochemistry',
      'Category:Materials science',
    ],
    subfields: ['reactions', 'organic chemistry', 'inorganic chemistry', 'analytical chemistry', 'physical chemistry', 'elements', 'biochemistry', 'materials'],
    connectionWords: /\b(used|uses|using|applied|application|applications|found in|occurs|occur|important|essential|role|produces|produced|industry|industrial|medicine|medical|everyday|household|food|agriculture|energy|battery|catalyst|manufactur|common)\b/i,
  },
  physics: {
    card: 'physics',
    categories: [
      'Category:Classical mechanics',
      'Category:Thermodynamics',
      'Category:Electromagnetism',
      'Category:Optics',
      'Category:Quantum mechanics',
      'Category:Special relativity',
      'Category:Waves',
      'Category:Condensed matter physics',
      'Category:Astrophysics',
    ],
    subfields: ['mechanics', 'thermodynamics', 'electromagnetism', 'optics', 'quantum mechanics', 'relativity', 'waves', 'condensed matter', 'astrophysics'],
    connectionWords: /\b(used|uses|using|applied|application|applications|found in|occurs|occur|important|essential|role|produces|produced|industry|industrial|medicine|medical|everyday|household|energy|device|instrument|measurement|engine|common|nature)\b/i,
  },
  biology: {
    card: 'biology',
    categories: [
      'Category:Cell biology',
      'Category:Genetics',
      'Category:Evolutionary biology',
      'Category:Ecology',
      'Category:Physiology',
      'Category:Microbiology',
      'Category:Botany',
      'Category:Zoology',
      'Category:Immunology',
    ],
    subfields: ['cell biology', 'genetics', 'evolution', 'ecology', 'physiology', 'microbiology', 'botany', 'zoology', 'immunology'],
    connectionWords: /\b(used|uses|using|applied|application|applications|found in|occurs|occur|important|essential|role|produces|produced|medicine|medical|everyday|food|agriculture|disease|health|plant|animal|human|environment|common)\b/i,
  },
};

export const MIN_LEAD_CHARS = 320;
export const MIN_LEAD_SENTENCES = 3;
export const MAX_SIMPLE_CHARS = 620;
export const MAX_DEEPER_CHARS = 900;
export const MAX_CONNECTION_CHARS = 420;
export const MAX_SURPRISING_CHARS = 300;
export const DISCOVERY_BATCH = 20;

export function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z(“"'])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function trimTo(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trim()}…`;
}

function slug(value: string): string {
  return normalizeTitle(value).replace(/\s+/g, '-').slice(0, 48) || 'concept';
}

function conceptId(page: WikipediaPage): string {
  if (page.wikidataId) return `wiki-${page.wikidataId.toLowerCase()}`;
  return `wiki-${slug(page.title)}-${createHash('sha256').update(page.title).digest('hex').slice(0, 6)}`;
}

const SPECIFIC = /(\d|per cent|percent|most |only |first |largest|smallest|unique|never |always |every )/i;

export function conceptFromLead(discipline: ScienceDiscipline, page: WikipediaPage, subfield: string): ScienceConcept | null {
  const config = SCIENCE_DISCIPLINES[discipline];
  const title = page.title.trim();
  if (!title || UNSUITABLE_TITLE.test(title) || DISAMBIGUATION_TITLE.test(title)) return null;
  if (/may refer to/i.test(page.extract.slice(0, 240))) return null;
  if (page.extract.length < MIN_LEAD_CHARS) return null;

  const all = sentences(page.extract);
  if (all.length < MIN_LEAD_SENTENCES) return null;
  if (all[0].length < 24) return null;

  const simpleSentences = [all[0]];
  if (simpleSentences[0].length < 80 && all[1]) simpleSentences.push(all[1]);
  const simple = trimTo(simpleSentences.join(' '), MAX_SIMPLE_CHARS);

  const remaining = all.filter((sentence) => !simpleSentences.includes(sentence));

  const connectionSentence = remaining.find(
    (sentence) => sentence.length > 40 && config.connectionWords.test(sentence),
  );
  if (!connectionSentence) return null;

  const surprisingSentence = remaining.find(
    (sentence) => sentence !== connectionSentence && sentence.length > 30 && SPECIFIC.test(sentence),
  );
  if (!surprisingSentence) return null;

  const deeperSentences = remaining.filter(
    (sentence) => sentence !== connectionSentence && sentence !== surprisingSentence,
  );
  const deeper = deeperSentences.length ? trimTo(deeperSentences.slice(0, 4).join(' '), MAX_DEEPER_CHARS) : undefined;

  return {
    id: conceptId(page),
    topic: title,
    simple,
    ...(deeper ? { deeper } : {}),
    connection: trimTo(connectionSentence, MAX_CONNECTION_CHARS),
    surprising: trimTo(surprisingSentence, MAX_SURPRISING_CHARS),
    question: `Where does ${title} show up in something you use, and how would you explain it to someone learning ${subfield}?`,
    aliases: [title],
    ...(page.wikidataId ? { wikidataId: page.wikidataId } : {}),
    origin: 'wikipedia',
    source: {
      url: page.url,
      name: `Wikipedia · ${title}`,
      attribution: 'Sentences adapted from Wikipedia, CC BY-SA 4.0; follow the link for the full article and its citations.',
    },
  };
}

/* ------------------------------------------------------------------ */
/* Per-process cache                                                   */
/* ------------------------------------------------------------------ */

type CacheEntry<T> = { date: string; value: T };
const discoveryCache = new Map<string, CacheEntry<DiscoveryResult>>();
const mythologyCache = new Map<string, CacheEntry<MythologyDiscovery>>();
const entityCache = new Map<string, CacheEntry<{ entity: WikidataEntity | null }>>();
const dateDiscoveryCache = new Map<string, { at: number; value: { drafts: CandidateDraft[]; note?: string } }>();

export function clearDiscoveryCache(): void {
  discoveryCache.clear();
  mythologyCache.clear();
  entityCache.clear();
  dateDiscoveryCache.clear();
}

export interface DiscoveryResult {
  discipline: ScienceDiscipline;
  candidates: ContentCandidate<ScienceConcept>[];
  category?: string;
  subfield?: string;
  scanned: number;
  rejected: number;
  note?: string;
  cached?: boolean;
}

export async function discoverScience(
  discipline: ScienceDiscipline,
  date: string,
  options: { fetchImpl?: typeof fetch; limit?: number; cache?: boolean } = {},
): Promise<DiscoveryResult> {
  const cached = discoveryCache.get(discipline);
  if (options.cache !== false && cached?.date === date) return { ...cached.value, cached: true };

  const empty: DiscoveryResult = { discipline, candidates: [], scanned: 0, rejected: 0 };
  if (!wikimediaEnabled()) {
    return { ...empty, note: 'discovery disabled by CURIOSITY_WIKIMEDIA=off' };
  }

  const config = SCIENCE_DISCIPLINES[discipline];
  const step = ((dayNumber(date) % config.categories.length) + config.categories.length) % config.categories.length;
  const category = config.categories[step];
  const subfield = config.subfields[step];
  const note: { text?: string } = {};

  const listing = await wikipediaCategoryMembers(category, { fetchImpl: options.fetchImpl, note, limit: 200 });
  if (!listing.titles.length) {
    const result: DiscoveryResult = {
      ...empty,
      category,
      subfield,
      note: listing.note ?? note.text ?? `no members returned for ${category}`,
    };
    discoveryCache.set(discipline, { date, value: result });
    return result;
  }

  const batch = listing.titles
    .filter((title) => !UNSUITABLE_TITLE.test(title) && !DISAMBIGUATION_TITLE.test(title))
    .slice(0, Math.min(options.limit ?? DISCOVERY_BATCH, 20));

  const leads = await wikipediaLeads(batch, { fetchImpl: options.fetchImpl, note });
  let rejected = 0;
  const concepts: ScienceConcept[] = [];
  for (const page of leads.pages) {
    const concept = conceptFromLead(discipline, page, subfield);
    if (concept) concepts.push(concept);
    else rejected += 1;
  }

  const result: DiscoveryResult = {
    discipline,
    candidates: concepts.map((concept) => candidateFromScience(discipline, concept)),
    category,
    subfield,
    scanned: leads.pages.length,
    rejected,
    ...(note.text ? { note: note.text } : {}),
  };
  discoveryCache.set(discipline, { date, value: result });
  return result;
}

export async function discoverSciences(
  date: string,
  options: { fetchImpl?: typeof fetch; offline?: boolean } = {},
): Promise<Record<ScienceDiscipline, DiscoveryResult>> {
  if (options.offline) {
    return {
      chemistry: { discipline: 'chemistry', candidates: [], scanned: 0, rejected: 0, note: 'offline run' },
      physics: { discipline: 'physics', candidates: [], scanned: 0, rejected: 0, note: 'offline run' },
      biology: { discipline: 'biology', candidates: [], scanned: 0, rejected: 0, note: 'offline run' },
    };
  }
  const [chemistry, physics, biology] = await Promise.all([
    discoverScience('chemistry', date, { fetchImpl: options.fetchImpl }),
    discoverScience('physics', date, { fetchImpl: options.fetchImpl }),
    discoverScience('biology', date, { fetchImpl: options.fetchImpl }),
  ]);
  return { chemistry, physics, biology };
}

/* ------------------------------------------------------------------ */
/* Mythology                                                           */
/* ------------------------------------------------------------------ */

export const MYTH_TRADITIONS: Array<{ tradition: string; category: string }> = [
  { tradition: 'Greek', category: 'Category:Greek mythological figures' },
  { tradition: 'Norse', category: 'Category:Norse deities' },
  { tradition: 'Egyptian', category: 'Category:Egyptian deities' },
  { tradition: 'Mesopotamian', category: 'Category:Mesopotamian deities' },
  { tradition: 'Chinese', category: 'Category:Chinese deities' },
  { tradition: 'Japanese', category: 'Category:Japanese deities' },
  { tradition: 'Hindu', category: 'Category:Hindu deities' },
  { tradition: 'Yoruba', category: 'Category:Yoruba deities' },
  { tradition: 'Mesoamerican', category: 'Category:Mesoamerican deities' },
  { tradition: 'Polynesian', category: 'Category:Polynesian deities' },
  { tradition: 'Irish', category: 'Category:Irish mythology' },
  { tradition: 'Slavic', category: 'Category:Slavic deities' },
];

export interface MythologyDiscovery {
  queue: Array<{ tradition: string; title: string; category: string }>;
  tradition?: string;
  category?: string;
  note?: string;
}

export async function discoverMythologyQueue(
  date: string,
  known: readonly MythCharacter[],
  options: { fetchImpl?: typeof fetch; limit?: number; cache?: boolean } = {},
): Promise<MythologyDiscovery> {
  const cached = mythologyCache.get('queue');
  if (options.cache !== false && cached?.date === date) {
    return cached.value;
  }
  if (!wikimediaEnabled()) return { queue: [], note: 'discovery disabled by CURIOSITY_WIKIMEDIA=off' };

  const knownNames = new Set(
    known.flatMap((character) => [character.name, ...(character.aliases ?? [])]).map((name) => normalizeTitle(name)),
  );
  const step = ((dayNumber(date) % MYTH_TRADITIONS.length) + MYTH_TRADITIONS.length) % MYTH_TRADITIONS.length;
  const entry = MYTH_TRADITIONS[step];
  const note: { text?: string } = {};
  const listing = await wikipediaCategoryMembers(entry.category, { fetchImpl: options.fetchImpl, note, limit: 200 });
  const queue = listing.titles
    .filter((title) => !UNSUITABLE_TITLE.test(title) && !DISAMBIGUATION_TITLE.test(title))
    .filter((title) => !knownNames.has(normalizeTitle(title)))
    .slice(0, options.limit ?? 12)
    .map((title) => ({ tradition: entry.tradition, title, category: entry.category }));
  const result: MythologyDiscovery = {
    queue,
    tradition: entry.tradition,
    category: entry.category,
    ...(note.text ? { note: note.text } : {}),
  };
  mythologyCache.set('queue', { date, value: result });
  return result;
}

export async function resolveMythologyEntity(
  character: MythCharacter,
  options: { fetchImpl?: typeof fetch; cache?: boolean } = {},
): Promise<{ character: MythCharacter; note?: string }> {
  if (!wikimediaEnabled()) return { character, note: 'discovery disabled' };
  const cached = entityCache.get(character.id);
  if (options.cache !== false && cached) {
    return { character: applyEntity(character, cached.value.entity), ...(cached.value.entity ? {} : { note: 'no Wikidata match (cached)' }) };
  }
  const { entity, note } = await wikidataSearchEntity(character.name, { fetchImpl: options.fetchImpl });
  entityCache.set(character.id, { date: new Date().toISOString().slice(0, 10), value: { entity } });
  return { character: applyEntity(character, entity), ...(note ? { note } : {}) };
}

function applyEntity(character: MythCharacter, entity: WikidataEntity | null): MythCharacter {
  if (!entity) return character;
  return {
    ...character,
    wikidataId: character.wikidataId ?? entity.id,
    aliases: [...new Set([...(character.aliases ?? []), ...entity.aliases])].filter(Boolean).slice(0, 12),
    ...((character.sourceUrl ?? entity.articleUrl) ? { sourceUrl: character.sourceUrl ?? entity.articleUrl } : {}),
  };
}

export function describeDiscovery(result: DiscoveryResult): string {
  if (result.note) return `${result.discipline}: ${result.note}`;
  return `${result.discipline}: ${result.candidates.length} candidate(s) from ${result.category ?? 'categories'} (${result.scanned} read, ${result.rejected} rejected by the quality gate)`;
}

/* ========================================================================== */
/* Phase 3 & Phase 5 — Multi-Source Reservoir Discovery & Maintenance Engine  */
/* ========================================================================== */

const ATTRIBUTION = 'Text adapted from Wikipedia (CC BY-SA 4.0) — verify against the linked article.';

const SIKH_HISTORY_WIKI_CATEGORIES: readonly { category: string; subcategory: string }[] = [
  { category: 'Sikh_gurus', subcategory: 'gurus' },
  { category: 'Sikh_history', subcategory: 'events' },
  { category: 'Battles_involving_the_Sikh_Empire', subcategory: 'battles' },
  { category: 'Battles_involving_the_Sikhs', subcategory: 'battles' },
  { category: 'Sikh_scriptures', subcategory: 'literature' },
  { category: 'Gurdwara_Reform_Movement', subcategory: 'milestones' },
];

const INDIAN_HISTORY_WIKI_CATEGORIES: readonly { category: string; subcategory: string }[] = [
  { category: 'Indian_independence_movement', subcategory: 'events' },
  { category: 'History_of_science_and_technology_in_India', subcategory: 'milestones' },
  { category: 'Ancient_India', subcategory: 'milestones' },
  { category: 'Chola_dynasty', subcategory: 'institutions' },
  { category: 'Mughal_Empire', subcategory: 'events' },
  { category: 'Missions_of_the_Indian_Space_Research_Organisation', subcategory: 'milestones' },
];

const WORLD_HISTORY_WIKI_CATEGORIES: readonly { category: string; subcategory: string }[] = [
  { category: 'History_of_science', subcategory: 'milestones' },
  { category: 'Scientific_revolution', subcategory: 'milestones' },
  { category: 'Age_of_Discovery', subcategory: 'events' },
  { category: 'Constitutional_history', subcategory: 'events' },
];

const MONTH_NAME_TO_NUMBER: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const SIKH_DOMAIN_RE = /\b(sikh|sikhs|sikhism|khalsa|gurdwara|gurbani|guru\s+(?:nanak|angad|amar\s+das|ram\s+das|arjan|hargobind|har\s+rai|har\s+krishan|tegh\s+bahadur|gobind\s+singh|granth\s+sahib)|adi\s+granth|akal\s+takht|harmandir\s+sahib|maharaja\s+ranjit\s+singh|banda\s+singh\s+bahadur|misls?|sgpc|akali|singh\s+sabha|anandpur\s+sahib|saragarhi|ghallughara)\b/i;

const INDIAN_DOMAIN_RE = /\b(india|indian|bharat|bengal|bombay|calcutta|kolkata|madras|chennai|delhi|mumbai|punjab|maratha|maurya|ashoka|gupta|chola|vijayanagara|mughal|isro|chandrayaan|mangalyaan|satyagraha|swadeshi|constituent\s+assembly\s+of\s+india|lok\s+sabha|rajya\s+sabha|harappa|indus\s+valley|aryabhata|ramanujan|c\.?\s*v\.?\s*raman|mahatma\s+gandhi|ambedkar|bhagat\s+singh|subhas\s+chandra\s+bose|tagore)\b/i;

export function classifyHistoryDomain(title: string, text: string): HistoryCategory {
  const combined = `${title} ${text}`;
  if (SIKH_DOMAIN_RE.test(combined)) return 'sikh-history';
  if (INDIAN_DOMAIN_RE.test(combined)) return 'indian-history';
  return 'world-history';
}

export function extractDateFromLead(extract: string): {
  year?: number;
  yearLabel?: string;
  month?: number;
  day?: number;
  precision: EventDatePrecision;
  calendarNote?: string;
} | null {
  const head = extract.slice(0, 650);
  const disputed = /\b(disputed|traditionally dated|julian calendar|bikrami|nanakshahi|circa|c\.\s*\d)\b/i.test(head);
  const calendarNote = disputed
    ? 'Historical sources record calendar or dating variations; check the linked reference for full context.'
    : undefined;

  const dmy = /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{3,4})\b/i.exec(head);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = MONTH_NAME_TO_NUMBER[dmy[2].toLowerCase()];
    const year = Number(dmy[3]);
    if (month && isValidMonthDay(month, day) && year <= new Date().getUTCFullYear()) {
      return { year, yearLabel: String(year), month, day, precision: disputed ? 'disputed' : 'exact', calendarNote };
    }
  }

  const mdy = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{3,4})\b/i.exec(head);
  if (mdy) {
    const month = MONTH_NAME_TO_NUMBER[mdy[1].toLowerCase()];
    const day = Number(mdy[2]);
    const year = Number(mdy[3]);
    if (month && isValidMonthDay(month, day) && year <= new Date().getUTCFullYear()) {
      return { year, yearLabel: String(year), month, day, precision: disputed ? 'disputed' : 'exact', calendarNote };
    }
  }

  const bce = /\b(\d{1,4})\s*(?:BCE|BC)\b/.exec(head);
  if (bce) {
    const num = Number(bce[1]);
    if (num >= 1 && num <= 9000) {
      return { year: -num, yearLabel: `${num} BCE`, precision: 'approximate', calendarNote };
    }
  }

  const yr = /\b(1[0-9]{3}|20[0-2][0-9]|[4-9][0-9]{2})\b/.exec(head);
  if (yr) {
    const year = Number(yr[1]);
    if (year <= new Date().getUTCFullYear()) {
      return { year, yearLabel: String(year), precision: disputed ? 'disputed' : 'year', calendarNote };
    }
  }

  return null;
}

export function parseWikidataTime(
  rawTime?: string,
  rawPrecision?: string,
): {
  year: number;
  yearLabel: string;
  month?: number;
  day?: number;
  precision: EventDatePrecision;
} | null {
  if (!rawTime) return null;
  const m = /^([+-]?\d{1,6})-(\d{2})-(\d{2})T/.exec(rawTime.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isInteger(year) || year < -10_000 || year > new Date().getUTCFullYear()) return null;
  const precNum = rawPrecision ? Number(rawPrecision) : 11;
  const yearLabel = year < 0 ? `${Math.abs(year)} BCE` : String(year);

  if (precNum >= 11 && isValidMonthDay(month, day)) {
    return { year, yearLabel, month, day, precision: 'exact' };
  }
  if (precNum === 10) return { year, yearLabel, precision: 'month-year' };
  return { year, yearLabel, precision: precNum < 9 ? 'approximate' : 'year' };
}

function recordId(prefix: string, label: string): string {
  return `${prefix}-${idFromText(label)}`;
}

function buildSparqlHistoryQuery(category: HistoryCategory, limit = 30): string {
  if (category === 'sikh-history') {
    return `
SELECT DISTINCT ?item ?itemLabel ?itemDescription ?article ?date ?precision WHERE {
  {
    VALUES ?sikhTopic { wd:Q9316 wd:Q233900 wd:Q629467 wd:Q3012246 wd:Q83350 }
    ?item (wdt:P31|wdt:P361|wdt:P1269|wdt:P710|wdt:P140) ?sikhTopic .
  } UNION {
    ?item wdt:P31 wd:Q178561 ; wdt:P710 wd:Q233900 .
  }
  OPTIONAL { ?item p:P585/psv:P585 [ wikibase:timeValue ?d1 ; wikibase:timePrecision ?p1 ] . }
  OPTIONAL { ?item p:P571/psv:P571 [ wikibase:timeValue ?d2 ; wikibase:timePrecision ?p2 ] . }
  OPTIONAL { ?item p:P569/psv:P569 [ wikibase:timeValue ?d3 ; wikibase:timePrecision ?p3 ] . }
  BIND(COALESCE(?d1, ?d2, ?d3) AS ?date)
  BIND(COALESCE(?p1, ?p2, ?p3) AS ?precision)
  FILTER(BOUND(?date))
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT ${limit}`.trim();
  }

  if (category === 'indian-history') {
    return `
SELECT DISTINCT ?item ?itemLabel ?itemDescription ?article ?date ?precision WHERE {
  ?item wdt:P17 wd:Q668 .
  VALUES ?kind { wd:Q1190554 wd:Q178561 wd:Q2133344 wd:Q40218 }
  ?item wdt:P31 ?kind .
  ?item p:P585/psv:P585 [ wikibase:timeValue ?date ; wikibase:timePrecision ?precision ] .
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT ${limit}`.trim();
  }

  return `
SELECT DISTINCT ?item ?itemLabel ?itemDescription ?article ?date ?precision WHERE {
  VALUES ?kind { wd:Q1190554 wd:Q1656682 wd:Q11862829 }
  ?item wdt:P31 ?kind .
  ?item p:P585/psv:P585 [ wikibase:timeValue ?date ; wikibase:timePrecision ?precision ] .
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT ${limit}`.trim();
}

function sparqlRowToDraft(row: SparqlRow, category: HistoryCategory): CandidateDraft | null {
  const itemUri = row.item ?? '';
  const qidMatch = /(Q\d+)$/.exec(itemUri);
  const qid = qidMatch?.[1];
  const label = (row.itemLabel ?? '').trim();
  const desc = (row.itemDescription ?? '').trim();
  const article = (row.article ?? '').trim();
  if (!qid || !label || /^Q\d+$/.test(label)) return null;

  const parsedDate = parseWikidataTime(row.date, row.precision);
  if (!parsedDate) return null;

  const canonicalUrl = article || `https://www.wikidata.org/wiki/${qid}`;
  const isWikipedia = /wikipedia\.org/i.test(canonicalUrl);
  const description = desc.length >= 28
    ? `${label}: ${desc}.`
    : `${label} (${parsedDate.yearLabel}) — structured historical record indexed via Wikidata (${qid}) and linked reference literature.`;

  return {
    id: recordId(`hist-${category.replace(/-history$/, '')}`, `${parsedDate.year}-${qid}-${label}`),
    entityId: qid,
    canonicalUrl,
    category,
    subcategory: 'events',
    title: label,
    description,
    significance: `Structured entity ${qid} recorded in ${category.replace('-', ' ')} (${parsedDate.yearLabel}).`,
    sourceName: isWikipedia ? 'Wikipedia · Wikidata' : 'Wikidata',
    attribution: isWikipedia
      ? 'Structured date via Wikidata (CC0 1.0); reference article via Wikipedia (CC BY-SA 4.0).'
      : 'Structured reference data via Wikidata (CC0 1.0).',
    license: isWikipedia ? 'CC BY-SA 4.0' : 'CC0 1.0',
    eventYear: parsedDate.year,
    eventYearLabel: parsedDate.yearLabel,
    eventMonth: parsedDate.month,
    eventDay: parsedDate.day,
    eventDatePrecision: parsedDate.precision,
    payload: {
      dateLabel: parsedDate.month && parsedDate.day
        ? monthDayDisplay(parsedDate.month, parsedDate.day)
        : parsedDate.yearLabel,
      origin: 'live',
    },
    validationStatus: 'valid',
    eligible: true,
  };
}

function onThisDayEntryToDraft(
  entry: OnThisDayFeedEntry,
  month: number,
  day: number,
  forcedCategory?: HistoryCategory,
): CandidateDraft | null {
  const primary = entry.pages[0];
  if (!primary) return null;
  const inferred = classifyHistoryDomain(primary.title, `${entry.text} ${primary.extract}`);
  if (forcedCategory && forcedCategory !== 'world-history' && inferred !== forcedCategory) {
    return null;
  }
  const category = forcedCategory ?? inferred;
  const entityId = primary.wikidataId ?? normalizeTitle(primary.title);
  const rawExtract = primary.extract?.trim() ?? '';
  const explanation = rawExtract.length >= 40
    ? sentences(rawExtract).slice(0, 2).join(' ') || rawExtract.slice(0, 420)
    : rawExtract.length > 0
      ? `${rawExtract} (${primary.title.replace(/_/g, ' ')})`
      : `${entry.text} — reference article: ${primary.title.replace(/_/g, ' ')}.`;

  return {
    id: recordId(`hist-${category.replace(/-history$/, '')}`, `${entry.year}-${entityId}-${entry.text}`),
    entityId,
    canonicalUrl: primary.url,
    category,
    subcategory: 'events',
    title: entry.text,
    description: explanation.length >= 28 ? explanation : `${entry.text} — reference article: ${primary.title}.`,
    significance: `Further context: ${primary.title} — verify against the linked reference.`,
    sourceName: 'Wikipedia',
    attribution: 'Source: Wikipedia contributors (CC BY-SA 4.0)',
    license: 'CC BY-SA 4.0',
    aliases: [],
    eventYear: entry.year,
    eventYearLabel: entry.year < 0 ? `${Math.abs(entry.year)} BCE` : String(entry.year),
    eventMonth: month,
    eventDay: day,
    eventDatePrecision: 'exact',
    payload: {
      dateLabel: monthDayDisplay(month, day),
      origin: 'live',
    },
    validationStatus: 'valid',
    eligible: true,
  };
}

function wikiPageToHistoryDraft(
  page: WikipediaPage,
  category: HistoryCategory,
  subcategory: string,
  aliases: readonly string[],
): CandidateDraft | null {
  if (UNSUITABLE_TITLE.test(page.title) || DISAMBIGUATION_TITLE.test(page.title)) return null;
  if (/may refer to/i.test(page.extract.slice(0, 200))) return null;
  const split = sentences(page.extract);
  if (split.length < 2) return null;
  const extracted = extractDateFromLead(page.extract);
  if (!extracted) return null;

  const entityId = page.wikidataId ?? normalizeTitle(page.title);
  return {
    id: recordId(`hist-${category.replace(/-history$/, '')}`, `${extracted.year ?? extracted.yearLabel}-${entityId}`),
    entityId,
    canonicalUrl: page.url,
    category,
    subcategory,
    title: page.title,
    description: split.slice(0, 2).join(' '),
    significance: split[2] ?? `Documented in ${category.replace('-', ' ')} reference literature.`,
    sourceName: 'Wikipedia',
    attribution: ATTRIBUTION,
    license: 'CC BY-SA 4.0',
    aliases: [...aliases],
    eventYear: extracted.year,
    eventYearLabel: extracted.yearLabel,
    eventMonth: extracted.month,
    eventDay: extracted.day,
    eventDatePrecision: extracted.precision,
    calendarNote: extracted.calendarNote,
    payload: {
      dateLabel: extracted.month && extracted.day
        ? monthDayDisplay(extracted.month, extracted.day)
        : (extracted.yearLabel ?? String(extracted.year ?? '')),
      origin: 'live',
    },
    validationStatus: 'valid',
    eligible: true,
  };
}

/**
 * Targeted on-demand discovery for a single `(category, month, day)` slot during
 * daily snapshot assembly whenever the reservoir has no unseen calendar match.
 */
export async function discoverHistoryForDate(
  category: HistoryCategory,
  month: number,
  day: number,
  opts: WikimediaFetchOptions & { fresh?: boolean } = {},
): Promise<{ drafts: CandidateDraft[]; note?: string }> {
  if (!wikimediaEnabled()) {
    return { drafts: [], note: 'CURIOSITY_WIKIMEDIA is off' };
  }
  const cacheKey = `${category}:${month}-${day}`;
  const hit = dateDiscoveryCache.get(cacheKey);
  if (!opts.fresh && hit && Date.now() - hit.at < 6 * 3600_000) {
    return hit.value;
  }

  const drafts: CandidateDraft[] = [];
  const notes: string[] = [];
  const otd = await wikimediaOnThisDay(month, day, { ...opts, feedKind: 'selected' });
  if (otd.note) notes.push(`onthisday ${month}-${day}: ${otd.note}`);
  for (const item of otd.events) {
    const draft = onThisDayEntryToDraft(item, month, day, category);
    if (draft) drafts.push(draft);
  }

  const value = {
    drafts,
    note: drafts.length === 0 && notes.length > 0 ? notes.join('; ') : undefined,
  };
  dateDiscoveryCache.set(cacheKey, { at: Date.now(), value });
  return value;
}

export interface KnowledgeDiscoveryJobOptions extends WikimediaFetchOptions {
  now?: Date;
  date?: string;
  trigger?: DiscoveryTrigger;
  categories?: readonly ReservoirCategory[];
  lowStockOnly?: boolean;
  fullSweep?: boolean;
  daysAhead?: number;
  store?: CandidateStore;
}

async function discoverPaginatedWikiHistoryCategory(
  category: HistoryCategory,
  wikiCategories: readonly { category: string; subcategory: string }[],
  cursors: Record<string, string>,
  store: CandidateStore,
  callOpts: WikimediaFetchOptions,
): Promise<{ drafts: CandidateDraft[]; failures: number; notes: string[] }> {
  const drafts: CandidateDraft[] = [];
  const notes: string[] = [];
  let failures = 0;

  for (const spec of wikiCategories.slice(0, 3)) {
    const cursorKey = `wiki:${category}:${spec.category}`;
    const res = await wikipediaCategoryMembers(spec.category, {
      ...callOpts,
      limit: 25,
      continueFrom: cursors[cursorKey],
      maxPages: 1,
    });
    if (res.note) {
      failures += 1;
      notes.push(`${category}/${spec.category}: ${res.note}`);
      continue;
    }
    await store.writeCursor(cursorKey, category, res.nextContinue ?? null);

    const usableTitles = res.titles
      .filter((t) => !UNSUITABLE_TITLE.test(t) && !DISAMBIGUATION_TITLE.test(t))
      .slice(0, 20);
    if (usableTitles.length === 0) continue;

    const leadsRes = await wikipediaLeads(usableTitles, callOpts);
    if (leadsRes.note) {
      failures += 1;
      notes.push(`${category}/${spec.category} leads: ${leadsRes.note}`);
    }
    const qids = leadsRes.pages.map((p) => p.wikidataId).filter((x): x is string => Boolean(x));
    const aliasRes = await wikidataAliases(qids, callOpts);
    if (aliasRes.note) notes.push(`${category} aliases: ${aliasRes.note}`);

    for (const page of leadsRes.pages) {
      const built = wikiPageToHistoryDraft(
        page,
        category,
        spec.subcategory,
        page.wikidataId ? aliasRes.aliases.get(page.wikidataId) ?? [] : [],
      );
      if (built) drafts.push(built);
    }
  }

  const sparql = await wikidataSparql(buildSparqlHistoryQuery(category, 30), callOpts);
  if (sparql.note) {
    failures += 1;
    notes.push(`${category}/wikidata-sparql: ${sparql.note}`);
  } else {
    for (const row of sparql.rows) {
      const built = sparqlRowToDraft(row, category);
      if (built) drafts.push(built);
    }
  }

  return { drafts, failures, notes };
}

/**
 * Scheduled & low-stock knowledge pool maintenance job.
 */
export async function runKnowledgeDiscovery(
  options: KnowledgeDiscoveryJobOptions = {},
): Promise<DiscoveryRunSummary> {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const baseDate = options.date ?? nowIso.slice(0, 10);
  const trigger: DiscoveryTrigger = options.trigger ?? 'cli';
  const store = options.store ?? getCandidateStore();

  const callOpts: WikimediaFetchOptions = {
    fetchImpl: options.fetchImpl,
    sleepImpl: options.sleepImpl,
    timeoutMs: options.timeoutMs ?? 6_000,
    attempts: options.attempts ?? 2,
    baseBackoffMs: options.baseBackoffMs,
    maxBackoffMs: options.maxBackoffMs,
  };

  const existing = await store.readAll();
  const cursors = await store.readCursors();

  const seedMerge = mergeCandidateDrafts(existing, curatedReservoirDrafts(), nowIso);
  let pool = seedMerge.merged;
  const toPersistMap = new Map(seedMerge.toWrite.map((c) => [c.id, c]));

  const initialCounts = summarizeReservoirCounts(pool);
  const targetCategories: ReservoirCategory[] = options.categories
    ? options.lowStockOnly
      ? options.categories.filter((c) => initialCounts.lowStockCategories.includes(c))
      : [...options.categories]
    : options.fullSweep
      ? [...RESERVOIR_CATEGORIES]
      : options.lowStockOnly
        ? [...initialCounts.lowStockCategories]
        : initialCounts.lowStockCategories.length > 0
          ? initialCounts.lowStockCategories
          : [...HISTORY_CATEGORY_ORDER, 'chemistry', 'physics', 'biology', 'mythology', 'developer-radar', 'ai-world'];

  const incomingDrafts: CandidateDraft[] = [];
  const notes: string[] = [];
  let sourceFailures = 0;

  const wantsAnyHistory = targetCategories.some((c) => (HISTORY_CATEGORY_ORDER as readonly string[]).includes(c));

  if (wantsAnyHistory && wikimediaEnabled()) {
    const daysAhead = Math.max(1, Math.min(options.daysAhead ?? 3, 14));
    for (let offset = 0; offset < daysAhead; offset += 1) {
      const d = offset === 0 ? baseDate : addPublicationDays(baseDate, offset);
      const parsed = parseIsoCalendarDate(d);
      if (!parsed) continue;
      const otd = await wikimediaOnThisDay(parsed.month, parsed.day, { ...callOpts, feedKind: 'selected' });
      if (otd.note) {
        sourceFailures += 1;
        notes.push(`onthisday ${parsed.month}-${parsed.day}: ${otd.note}`);
        continue;
      }
      for (const item of otd.events) {
        const draft = onThisDayEntryToDraft(item, parsed.month, parsed.day);
        if (draft) incomingDrafts.push(draft);
      }
    }
  }

  const historyCategorySpecs: Array<[HistoryCategory, readonly { category: string; subcategory: string }[]]> = [
    ['sikh-history', SIKH_HISTORY_WIKI_CATEGORIES],
    ['indian-history', INDIAN_HISTORY_WIKI_CATEGORIES],
    ['world-history', WORLD_HISTORY_WIKI_CATEGORIES],
  ];
  for (const [histCat, specs] of historyCategorySpecs) {
    if (!targetCategories.includes(histCat) || !wikimediaEnabled()) continue;
    const res = await discoverPaginatedWikiHistoryCategory(histCat, specs, cursors, store, callOpts);
    incomingDrafts.push(...res.drafts);
    sourceFailures += res.failures;
    notes.push(...res.notes);
  }

  for (const discipline of ['chemistry', 'physics', 'biology'] as const) {
    if (!targetCategories.includes(discipline) || !wikimediaEnabled()) continue;
    const cfg = SCIENCE_DISCIPLINES[discipline];
    for (let idx = 0; idx < 3; idx += 1) {
      const catName = cfg.categories[idx];
      const subfield = cfg.subfields[idx];
      const cursorKey = `wiki:${discipline}:${catName}`;
      const members = await wikipediaCategoryMembers(catName, {
        ...callOpts,
        limit: 25,
        continueFrom: cursors[cursorKey],
        maxPages: 1,
      });
      if (members.note) {
        sourceFailures += 1;
        notes.push(`${discipline}/${catName}: ${members.note}`);
        continue;
      }
      await store.writeCursor(cursorKey, discipline, members.nextContinue ?? null);
      const usable = members.titles
        .filter((t) => !UNSUITABLE_TITLE.test(t) && !DISAMBIGUATION_TITLE.test(t))
        .slice(0, 20);
      if (!usable.length) continue;

      const leadsRes = await wikipediaLeads(usable, callOpts);
      if (leadsRes.note) {
        sourceFailures += 1;
        notes.push(`${discipline}/${catName} leads: ${leadsRes.note}`);
      }
      const qids = leadsRes.pages.map((p) => p.wikidataId).filter((x): x is string => Boolean(x));
      const aliasRes = await wikidataAliases(qids, callOpts);
      for (const page of leadsRes.pages) {
        const built = conceptFromLead(discipline, page, subfield);
        if (!built) continue;
        const extraAliases = page.wikidataId ? aliasRes.aliases.get(page.wikidataId) ?? [] : [];
        incomingDrafts.push({
          id: built.id,
          entityId: built.wikidataId ?? built.id,
          canonicalUrl: built.source?.url ?? page.url,
          category: discipline,
          subcategory: subfield,
          title: built.topic,
          description: built.simple,
          significance: built.connection,
          sourceName: built.source?.name ?? 'Wikipedia',
          attribution: built.source?.attribution ?? ATTRIBUTION,
          license: 'CC BY-SA 4.0',
          aliases: [...new Set([...(built.aliases ?? []), ...extraAliases])],
          payload: { concept: built },
          validationStatus: 'valid',
          eligible: true,
        });
      }
    }
  }

  if (targetCategories.includes('mythology') && wikimediaEnabled()) {
    const mythRes = await discoverMythologyQueue(baseDate, mythCharacters, {
      fetchImpl: callOpts.fetchImpl,
      cache: false,
      limit: 20,
    });
    if (mythRes.note) {
      sourceFailures += 1;
      notes.push(`mythology: ${mythRes.note}`);
    } else if (mythRes.queue.length > 0) {
      const leadsRes = await wikipediaLeads(mythRes.queue.map((q) => q.title), callOpts);
      if (leadsRes.note) {
        sourceFailures += 1;
        notes.push(`mythology leads: ${leadsRes.note}`);
      }
      for (const page of leadsRes.pages) {
        if (page.extract.length < 80) continue;
        incomingDrafts.push({
          id: recordId('myth-stage', page.wikidataId ?? page.title),
          entityId: page.wikidataId ?? normalizeTitle(page.title),
          canonicalUrl: page.url,
          category: 'mythology',
          subcategory: mythRes.tradition ?? 'world mythology',
          title: page.title,
          description: sentences(page.extract).slice(0, 2).join(' ') || page.extract.slice(0, 400),
          sourceName: 'Wikipedia',
          attribution: ATTRIBUTION,
          license: 'CC BY-SA 4.0',
          payload: { mythologyComplete: false },
          validationStatus: 'needs-review',
          eligible: false,
        });
      }
    }
  }

  if (targetCategories.includes('developer-radar')) {
    const radarNote: { text?: string } = {};
    const repos = await fetchDeveloperRadar(options.fetchImpl ?? fetch, radarNote);
    if (radarNote.text && repos.length === 0) {
      sourceFailures += 1;
      notes.push(`developer-radar: ${radarNote.text}`);
    }
    for (const repo of repos) {
      incomingDrafts.push({
        id: `repo-${idFromText(normalizeUrl(repo.url) || repo.name)}`,
        entityId: repo.name,
        canonicalUrl: repo.url,
        category: 'developer-radar',
        subcategory: 'github-search',
        title: repo.name,
        description: repo.description,
        significance: repo.why,
        sourceName: 'GitHub',
        attribution: repo.pricing,
        payload: { repo },
        validationStatus: 'valid',
        eligible: true,
      });
    }
  }

  if (targetCategories.includes('ai-world')) {
    const newsNote: { text?: string } = {};
    const articles = await fetchNews(options.fetchImpl ?? fetch, newsNote);
    if (newsNote.text && articles.length === 0) {
      sourceFailures += 1;
      notes.push(`ai-world: ${newsNote.text}`);
    }
    for (const art of articles) {
      incomingDrafts.push({
        id: `news-${idFromText(normalizeUrl(art.url) || art.title)}`,
        entityId: normalizeUrl(art.url) || art.title,
        canonicalUrl: art.url,
        category: 'ai-world',
        subcategory: art.source,
        title: art.title,
        description: art.summary.length >= 28 ? art.summary : `${art.title} — published by ${art.source}.`,
        sourceName: art.source,
        attribution: `Published by ${art.source} (${art.publishedAt}).`,
        payload: { article: art },
        validationStatus: 'valid',
        eligible: true,
      });
    }
  }

  const discoveredMerge = mergeCandidateDrafts(pool, incomingDrafts, nowIso);
  pool = discoveredMerge.merged;
  for (const item of discoveredMerge.toWrite) {
    toPersistMap.set(item.id, item);
  }
  for (const reason of discoveredMerge.validationReasons) {
    notes.push(`rejected: ${reason}`);
  }

  const writeResult = await store.writeUpsert([...toPersistMap.values()]);
  if (writeResult.unmigrated) {
    notes.push('curiosity_candidates table not yet migrated; apply supabase/migrations/011_curiosity_candidates.sql to persist reservoir in Supabase');
  } else if (!writeResult.persisted) {
    notes.push('candidate reservoir could not persist writes (check SUPABASE_SECRET_KEY or file permissions)');
  }

  const finalCounts = summarizeReservoirCounts(pool);
  const runSummary: DiscoveryRunSummary = {
    ranAt: nowIso,
    trigger,
    categoriesChecked: targetCategories,
    lowStockCategories: finalCounts.lowStockCategories,
    eligibleByCategory: finalCounts.eligibleByCategory,
    totalByCategory: finalCounts.totalByCategory,
    newDiscovered: seedMerge.newDiscovered + discoveredMerge.newDiscovered,
    updatedExisting: seedMerge.updatedExisting + discoveredMerge.updatedExisting,
    duplicateRejections: seedMerge.duplicateRejections + discoveredMerge.duplicateRejections,
    validationFailures: seedMerge.validationFailures + discoveredMerge.validationFailures,
    sourceFailures,
    cooldownRelaxations: 0,
    notes: notes.slice(0, 30),
  };

  await store.appendRunLog({
    ranAt: runSummary.ranAt,
    trigger: runSummary.trigger,
    categoriesChecked: runSummary.categoriesChecked,
    lowStockCategories: runSummary.lowStockCategories,
    eligibleByCategory: runSummary.eligibleByCategory,
    newDiscovered: runSummary.newDiscovered,
    duplicateRejections: runSummary.duplicateRejections,
    validationFailures: runSummary.validationFailures,
    sourceFailures: runSummary.sourceFailures,
    cooldownRelaxations: runSummary.cooldownRelaxations,
    notes: runSummary.notes,
  });

  return runSummary;
}
