import { createHash } from 'node:crypto';
import { normalizeTitle } from './dedupe';
import type { ContentCandidate } from './candidates';
import { candidateFromScience } from './candidates';
import type { MythCharacter, ScienceConcept } from './types';
import {
  DISAMBIGUATION_TITLE,
  UNSUITABLE_TITLE,
  wikipediaCategoryMembers,
  wikipediaLeads,
  wikidataSearchEntity,
  wikimediaEnabled,
  type WikidataEntity,
  type WikipediaPage,
} from './wikimedia';
import { dayNumber } from './schedule';

/**
 * Candidate discovery for the mythology and science cards.
 *
 * ## Why discovery at all
 *
 * The audit found the three science cards rotating through twelve authored
 * concepts each and the mythology card through twelve characters: after twelve
 * days every reader had seen the whole corpus, and the same card came back on a
 * fixed clock. Authoring more fixed entries raises that ceiling but never removes
 * it. Discovery is what makes the pool grow while the app runs.
 *
 * ## What discovery may and may not do
 *
 *  - **Sciences:** a candidate is assembled only from sentences the Wikipedia
 *    lead actually contains, and only if that lead supports *every* field the
 *    card renders — what the concept is, a real-world connection, and one
 *    verifiable specific. A concept whose lead does not support a connection is
 *    rejected. Nothing is invented to fill a card, and every published sentence
 *    carries the article URL it came from.
 *  - **Mythology:** the card's shape (family, timeline, variants, evidence-labelled
 *    claims) cannot be assembled honestly from a lead paragraph, so a discovered
 *    name is **never published directly**. It is recorded as an authoring
 *    candidate, and Wikidata supplies the entity id, aliases and canonical
 *    article for *curated* characters so that the same figure cannot return under
 *    another name.
 *
 * ## Failure behaviour
 *
 * Every function resolves, never throws, and returns a `note` describing what was
 * unavailable. The publisher keeps the authored corpus and says so on the run.
 */

/* ------------------------------------------------------------------ */
/* Discipline configuration                                            */
/* ------------------------------------------------------------------ */

export type ScienceDiscipline = 'chemistry' | 'physics' | 'biology';

export interface DisciplineConfig {
  card: ScienceDiscipline;
  /** Topic categories, rotated by day so the card does not spend a week on one subfield. */
  categories: string[];
  /** A short label used when the subfield is recorded with the item. */
  subfields: string[];
  /** Words that indicate a real-world connection in a lead paragraph. */
  connectionWords: RegExp;
}

/**
 * Categories are chosen to be **concept**-bearing rather than "everything tagged
 * chemistry": a random page from a broad category is exactly the unsuitable
 * candidate the brief warns about. Each list rotates, so a week of Chemistry cards
 * draws from a week of different subfields.
 */
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

/** No discovered card is assembled from less than a real paragraph. */
export const MIN_LEAD_CHARS = 320;
export const MIN_LEAD_SENTENCES = 3;
/** Caps on card text, so a runaway lead cannot make one card scroll forever. */
export const MAX_SIMPLE_CHARS = 620;
export const MAX_DEEPER_CHARS = 900;
export const MAX_CONNECTION_CHARS = 420;
export const MAX_SURPRISING_CHARS = 300;
/** How many category members are read per discipline per day. */
export const DISCOVERY_BATCH = 20;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Split plain prose into sentences without pulling in a parser. */
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

/** A sentence carrying a checkable specific: a number, a unit, or an explicit superlative. */
const SPECIFIC = /(\d|per cent|percent|most |only |first |largest|smallest|unique|never |always |every )/i;

/**
 * Turn one Wikipedia lead into a science card, or reject it.
 *
 * The rejection rules are the quality gate the brief asks for:
 *  - the lead must be a real paragraph (length and sentence count);
 *  - the title must not be a list, glossary, outline or disambiguation page;
 *  - there must be a sentence that states a real-world use or role, because the
 *    card's connection field is required and the alternative is inventing one;
 *  - there must be a separate sentence with a verifiable specific, because
 *    "Surprising" must be a fact from the source, not a rhetorical flourish.
 *
 * Returns `null` when any rule fails, in which case the caller moves to the next
 * member of the batch.
 */
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

  // A real-world connection must exist in the source. Prefer a sentence that both
  // states a use and is long enough to be an explanation rather than a fragment.
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

/** Test seam: forget cached discovery between scenarios. */
export function clearDiscoveryCache(): void {
  discoveryCache.clear();
  mythologyCache.clear();
  entityCache.clear();
}

export interface DiscoveryResult {
  discipline: ScienceDiscipline;
  candidates: ContentCandidate<ScienceConcept>[];
  /** Where the batch came from: the category, and the subfield it belongs to. */
  category?: string;
  subfield?: string;
  /** Members read, and how many failed the quality gate. */
  scanned: number;
  rejected: number;
  note?: string;
  /** `cache` when a same-day re-run reused the first result. */
  cached?: boolean;
}

/**
 * Discover candidates for one discipline.
 *
 * Deterministic per day (the category rotates with the publication day), cached
 * per process per day so a retried workflow or an admin refresh does not repeat
 * the requests, and bounded to one category page and one batch of leads.
 */
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

/** Discover all three science batches in parallel; one failure cannot empty the others. */
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

/**
 * The traditions discovery watches, and the category it reads for each.
 *
 * These are *authoring* queues, not publication pools: the mythology card needs
 * a story, a family, a timeline, variants and evidence-labelled claims, and none
 * of those can be assembled honestly from a lead paragraph. What this buys is a
 * growing, attributed list of figures the corpus does not cover yet, printed in
 * the run log so the next authoring pass starts from evidence rather than memory.
 */
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
  /** Figures in the watched tradition that the authored corpus does not cover. */
  queue: Array<{ tradition: string; title: string; category: string }>;
  tradition?: string;
  category?: string;
  note?: string;
}

/**
 * Read today's tradition category and return the figures not already authored.
 *
 * Purely advisory: the returned names go into the run detail, never into the
 * day's snapshot. `known` is compared on normalized titles and aliases, so a
 * character already covered under a variant name is not queued again.
 */
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

/**
 * Resolve one authored character to a Wikidata entity.
 *
 * Used at publish time to record a stable entity id, the alternate names the
 * tradition uses, and the canonical article link on the character that is about
 * to be shown. When Wikidata cannot be reached, the authored record is published
 * unchanged: the enrichment is evidence, not a requirement, and a missing lookup
 * must never delay or blank the card.
 */
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

/** The authored record with Wikidata's ids and links merged in, authored fields untouched. */
function applyEntity(character: MythCharacter, entity: WikidataEntity | null): MythCharacter {
  if (!entity) return character;
  return {
    ...character,
    wikidataId: character.wikidataId ?? entity.id,
    aliases: [...new Set([...(character.aliases ?? []), ...entity.aliases])].filter(Boolean).slice(0, 12),
    ...((character.sourceUrl ?? entity.articleUrl) ? { sourceUrl: character.sourceUrl ?? entity.articleUrl } : {}),
  };
}

/** A one-line summary of a discovery pass, for the run log. */
export function describeDiscovery(result: DiscoveryResult): string {
  if (result.note) return `${result.discipline}: ${result.note}`;
  return `${result.discipline}: ${result.candidates.length} candidate(s) from ${result.category ?? 'categories'} (${result.scanned} read, ${result.rejected} rejected by the quality gate)`;
}
