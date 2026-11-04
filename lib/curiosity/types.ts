export type CuriosityNewsItem = {
  title: string;
  source: string;
  publishedAt: string;
  summary: string;
  url: string;
  /**
   * `live` (or absent) — an item read from the publisher's own feed, with a real
   * `publishedAt`. `background` — a curated explainer from this repository: it has no
   * publication date because it is not news, and the card must not print one.
   */
  origin?: 'live' | 'background';
};

/* ------------------------------------------------------------------ */
/* Content pool                                                        */
/*                                                                     */
/* Every editorial card the scheduler can publish is one entry of a    */
/* pool: a unique id, a category, a first-publication day (in the     */
/* publication time zone, Asia/Kolkata), the card payload, and where   */
/* its claims came from. The id is what the rotation ledger and the    */
/* published snapshot refer to, so it must never be reused or renamed  */
/* once a day has been published with it.                              */
/* ------------------------------------------------------------------ */

export type CuriosityCategory = 'one-thing' | 'literature' | 'learn-something' | 'book';

export interface CuriositySourceRef {
  /** Where a reader can check the claim. */
  url: string;
  /** Short publisher name, e.g. "MDN Web Docs". */
  name: string;
  /** Licence/attribution note shown next to the link when one is needed. */
  attribution?: string;
  /** ISO date the claim was last checked against this source. */
  checkedAt?: string;
}

/**
 * `curated`     — written for this app; nothing was copied from a third party.
 * `source-checked` — the wording was checked against `source` before publishing.
 *
 * The distinction is kept on the record (not in a commit message) because the
 * card links out to `source`, and a reader is entitled to know whether the text
 * is ours or a paraphrase of the thing it links to.
 */
export type CuriosityProvenance = 'curated' | 'source-checked';

export type CuriosityPoolStatus = 'draft' | 'published' | 'retired';

export interface CuriosityPoolEntry<TItem = unknown> {
  id: string;
  category: CuriosityCategory;
  /** First day (Asia/Kolkata) on which this item may be published. */
  availableFrom: string;
  status?: CuriosityPoolStatus;
  provenance: CuriosityProvenance;
  source?: CuriositySourceRef;
  tags?: string[];
  item: TItem;
}

export interface OneThingItem {
  title: string;
  explanation: string;
  url?: string;
  sourceName?: string;
}

export interface LearningItem {
  topic: string;
  explanation: string;
  url?: string;
  sourceName?: string;
}

export type DeveloperDiscovery = {
  name: string;
  description: string;
  why: string;
  pricing: string;
  url: string;
  /**
   * `live` — found by the scheduled search of the public GitHub API, so it may be
   * described as recently updated. `curated` — the shelf in `content/radar-fallback.ts`,
   * chosen for being worth knowing, not for being new. The card says which.
   */
  origin?: 'live' | 'curated';
};

/* ------------------------------------------------------------------ */
/* Today in History — priority categories and event model              */
/* ------------------------------------------------------------------ */

/** Strict display & selection priority order for Today in History: 1 → 2 → 3. */
export const HISTORY_CATEGORY_ORDER = [
  'sikh-history',
  'indian-history',
  'world-history',
] as const;

export type HistoryCategory = (typeof HISTORY_CATEGORY_ORDER)[number];

export const HISTORY_CATEGORY_LABELS: Record<HistoryCategory, string> = {
  'sikh-history': 'Sikh History',
  'indian-history': 'Indian History',
  'world-history': 'World History',
};

export type EventDatePrecision = 'exact' | 'month-year' | 'year' | 'approximate' | 'disputed' | 'none';

export interface HistoryEvent {
  /** Stable canonical event identity (e.g. `hist-sikh-1699-04-13-khalsa`). */
  id?: string;
  /** History tradition/scope category in priority order: Sikh → Indian → World. */
  category?: HistoryCategory;
  /** Display label for the category ("Sikh History" | "Indian History" | "World History"). */
  categoryLabel?: string;
  /** Month/day display text (e.g. "April 13") or period label where month/day is not fixed. */
  date: string;
  /** Historical year or period string (e.g. 1699, "c. 261 BCE"). */
  year: number | string;
  /** Calendar month (1–12) when historically supported. */
  month?: number;
  /** Calendar day (1–31) when historically supported. */
  day?: number;
  /** Explicit dating precision so disputed or approximate accounts are never flattened. */
  datePrecision?: EventDatePrecision;
  /** Historiographical or calendar conversion note (e.g. Nanakshahi / Bikrami / Julian). */
  calendarNote?: string;
  title: string;
  explanation: string;
  significance: string;
  url?: string;
  /** Publisher or primary/scholarly work name. */
  sourceName?: string;
  /** Licence identifier when adapted from open-content sources (e.g. "CC BY-SA 4.0"). */
  license?: string;
  /**
   * Was this event verified as belonging to the briefing's calendar date?
   * An archive/milestone fallback shown when no verified anniversary exists for today
   * carries `false`, and the card states so openly rather than fabricating an anniversary.
   */
  forThisDate?: boolean;
  /** How this event was matched for the briefing date. */
  dateMatch?: 'exact-date' | 'leap-day-observed' | 'archive-fallback';
  /** Where the event came from: live discovery/feed, or curated scholarly corpus. */
  origin?: 'live' | 'curated';
  /** Kept with the text when source attribution is shown to the reader. */
  attribution?: string;
}

/* ------------------------------------------------------------------ */
/* Persistent Knowledge Reservoir types                                */
/* ------------------------------------------------------------------ */

export const RESERVOIR_CATEGORIES = [
  'sikh-history',
  'indian-history',
  'world-history',
  'mythology',
  'chemistry',
  'physics',
  'biology',
  'one-thing',
  'learn-something',
  'literature',
  'book',
  'ai-world',
  'developer-radar',
] as const;

export type ReservoirCategory = (typeof RESERVOIR_CATEGORIES)[number];

export type CandidateValidationStatus = 'valid' | 'rejected' | 'pending' | 'needs-review';

export type DiscoveryTrigger = 'cron' | 'admin' | 'cli' | 'publish-replenish';

/**
 * A persistent candidate record in `curiosity_candidates` (or `.curiosity/candidates.json`).
 * Kept strictly separate from `curiosity_seen` (publication history).
 */
export interface KnowledgeCandidate {
  id: string;
  /** Stable upstream entity ID (Wikidata QID, MediaWiki page ID/slug, or curated slug). */
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
  aliases: string[];
  normalizedIdentity: string;
  fingerprint: string;
  signature?: string;
  subjects: string[];
  eventYear?: number;
  eventYearLabel?: string;
  eventMonth?: number;
  eventDay?: number;
  eventDatePrecision: EventDatePrecision;
  calendarNote?: string;
  payload?: Record<string, unknown>;
  validationStatus: CandidateValidationStatus;
  validationNotes?: string[];
  eligible: boolean;
  discoveredAt: string;
  updatedAt: string;
}

export interface DiscoveryRunSummary {
  ranAt: string;
  trigger: DiscoveryTrigger;
  categoriesChecked: ReservoirCategory[];
  lowStockCategories: ReservoirCategory[];
  eligibleByCategory: Partial<Record<ReservoirCategory, number>>;
  totalByCategory: Partial<Record<ReservoirCategory, number>>;
  newDiscovered: number;
  updatedExisting: number;
  duplicateRejections: number;
  validationFailures: number;
  sourceFailures: number;
  cooldownRelaxations: number;
  notes: string[];
}

export interface ReservoirStatusSummary {
  storeKind: 'supabase' | 'file';
  eligibleByCategory: Record<ReservoirCategory, number>;
  totalByCategory: Record<ReservoirCategory, number>;
  lowStockThresholds: Record<ReservoirCategory, number>;
  targetPoolSizes: Record<ReservoirCategory, number>;
  lowStockCategories: ReservoirCategory[];
  lastDiscoveryRun: Omit<DiscoveryRunSummary, 'totalByCategory' | 'updatedExisting'> | null;
}

export interface LiteratureItem {
  title: string;
  author: string;
  eraOrCountry?: string;
  format?: 'excerpt' | 'poem' | 'passage' | 'fable' | 'essay';
  passage: string;
  attribution?: string;
  whyItMatters: string;
  url?: string;
  sourceName?: string;
}

export interface BrainSharpener {
  id: string;
  subject: 'mathematics' | 'physics';
  topic: string;
  title: string;
  problem: string;
  givenInfo?: string[];
  hint?: string;
  solution: string;
  answer: string;
}

/**
 * Speak Better — practical spoken English, taught through a situation.
 *
 * The words in a lesson are meant to be *confusable*: the lesson earns its
 * place only by making the difference between them explicit, so every word
 * carries its own English gloss, Hindi gloss and one line of nuance, plus
 * example sentences that show the difference rather than describe it.
 *
 * DIFFICULTY
 * The original twelve lessons were written for A2–B1 learners and keep their
 * ids, wording and order exactly as they were — the difficulty marker is
 * metadata, not a rewrite, so an existing reading history and the rotation that
 * produced it are untouched. B2, C1 and C2 lessons use the same shape with the
 * optional depth fields filled in: pronunciation, collocations, common mistakes,
 * the difference from a near-synonym, and a register note for natural
 * conversational use.
 *
 * Every field beyond `word`/`englishMeaning`/`hindiMeaning`/`nuance`/`examples`
 * is optional, which is what lets one type describe a two-line A2 lesson and a
 * nine-line C2 one without padding the simpler lesson with empty headings.
 */
export const SPEAK_BETTER_LEVELS = ['A2-B1', 'B2', 'C1', 'C2'] as const;

export type SpeakBetterLevel = (typeof SPEAK_BETTER_LEVELS)[number];

/** How a reader is tracking one word they have met. */
export const SPEAK_BETTER_TRACKING_STATES = ['seen', 'known', 'saved', 'review'] as const;

export type SpeakBetterTrackingState = (typeof SPEAK_BETTER_TRACKING_STATES)[number];

export const SPEAK_BETTER_LEVEL_LABELS: Record<SpeakBetterLevel, string> = {
  'A2-B1': 'A2–B1 · Elementary & Pre-intermediate',
  B2: 'B2 · Upper Intermediate',
  C1: 'C1 · Advanced',
  C2: 'C2 · Proficiency',
};

export interface SpeakBetterWord {
  /** Stable identity for progress tracking. Defaults to the lesson id + the word. */
  id?: string;
  word: string;
  englishMeaning: string;
  hindiMeaning: string;
  nuance: string;
  examples: string[];
  /** How to say it: stress, vowels, linking. Omitted where it would add nothing. */
  pronunciation?: string;
  /** Words this one habitually travels with, as they are actually said. */
  collocations?: string[];
  /** The mistake learners at this level actually make, and the fix. */
  commonMistake?: string;
  /** The near-synonym it is most often confused with, and the line between them. */
  differsFrom?: string;
  /** When this is the natural thing to say, and when it would sound wrong. */
  register?: string;
}

export interface SpeakBetterLesson {
  id: string;
  /** Difficulty band. Absent means A2–B1, the original corpus. */
  level?: SpeakBetterLevel;
  /** The one-line takeaway the whole lesson exists to deliver. */
  focus: string;
  /** A concrete moment where this language would actually be spoken. */
  situation: string;
  words: SpeakBetterWord[];
  /** A short conversational example — a few lines of real dialogue. */
  dialogue: { speaker: string; line: string }[];
  /** One small spoken task the reader can do immediately. */
  challenge: string;
}

/** One word's tracking record, as persisted for a reader. */
export interface SpeakBetterProgressEntry {
  /** `${lessonId}:${word}` — stable across a lesson rewrite only if the word survives. */
  id: string;
  lessonId: string;
  word: string;
  level: SpeakBetterLevel;
  state: SpeakBetterTrackingState;
  /** ISO instant of the first time the reader met the word. */
  firstSeenAt: string;
  /** ISO instant of the most recent tracking change. */
  updatedAt: string;
}

/**
 * Evidence layers for Mythology. Every claim drawn from the character story is
 * tagged with one of these, so a modern reading can never be read as scripture:
 *
 * - `textual`     — stated in the named scripture or primary source.
 * - `traditional` — how the tradition has commonly retold or interpreted it.
 * - `analysis`    — a modern scholarly or psychological reading.
 * - `inference`   — a reasoned guess, offered as a guess.
 */
export type ClaimLayer = 'textual' | 'traditional' | 'analysis' | 'inference';

export interface MythClaim {
  layer: ClaimLayer;
  text: string;
}

export interface MythFamilyMember {
  relation: string;
  name: string;
  note?: string;
}

export interface MythTimelineEntry {
  when: string;
  event: string;
}

export interface MythVariant {
  tradition: string;
  difference: string;
}

export interface MythCharacter {
  id: string;
  name: string;
  /** The tradition or body of literature the character belongs to. */
  tradition: string;
  /** Alternate names the tradition itself uses; used for deduplication. */
  aliases?: string[];
  /** Wikidata entity id, when the character has a canonically resolvable one. */
  wikidataId?: string;
  /** A page a reader can check the account against (Wikipedia or a primary text). */
  sourceUrl?: string;
  /** Where the character appears — scriptures, epics, texts, oral traditions. */
  sources: string[];
  relationships: { with: string; note: string }[];
  family: MythFamilyMember[];
  timeline: MythTimelineEntry[];
  /** The main story, told in the tradition's own voice. */
  story: string;
  /** Lesser-known points, each labelled with its evidence layer. */
  lesserKnown: MythClaim[];
  /** Where traditions disagree — labelled, and never smoothed into one story. */
  variants?: MythVariant[];
  /** A modern cultural or psychological reading. Analysis, not scripture. */
  analysis: string;
}

/**
 * Chemistry, Physics and Biology of the Day share one shape because they are
 * the same kind of card: a compact concept, an intuitive explanation, an
 * optional deeper layer, an equation or worked example where it genuinely
 * helps, a connection to real life, one surprising fact, and one question a
 * teacher can put to a class as it stands. They stay separate named types —
 * and separate fields on the briefing — so each subject's content file, and
 * the label on each card, can be honest about its own subject.
 */
export interface ScienceConcept {
  id: string;
  topic: string;
  /** Alternate names, so a concept cannot return under a different title. */
  aliases?: string[];
  /** Wikidata QID (or other stable identifier) for cross-title deduplication. */
  wikidataId?: string;
  /**
   * `curated` — written for this app. `wikipedia` — assembled from a Wikipedia
   * article's own sentences, linked and attributed. Discovered content is never
   * presented as if an editor had written it.
   */
  origin?: 'curated' | 'wikipedia';
  /** Where every factual sentence in this card can be checked. */
  source?: CuriositySourceRef;
  simple: string;
  deeper?: string;
  equation?: string;
  /**
   * The connection to real life — labelled “Everyday connection” on the
   * chemistry card and “Real-world connection” on the physics card. One field,
   * because it is one idea; the label is the only thing that differs.
   */
  connection: string;
  surprising: string;
  question: string;
}

export type ChemistryConcept = ScienceConcept;
export type PhysicsConcept = ScienceConcept;
export type BiologyConcept = ScienceConcept;

/* ------------------------------------------------------------------ */
/* One Book — a candidate from the pool, plus the resolved record      */
/* ------------------------------------------------------------------ */

export interface BookCandidate {
  title: string;
  author: string;
  synopsis: string;
  why: string;
  url?: string;
  subjects?: string[];
}

export interface BookRecommendation extends BookCandidate {
  id: string;
  /** The link the card shows: the Open Library work record when resolved. */
  url: string;
  source: 'openlibrary' | 'curated';
  sourceName: string;
  /** Open Library work key, e.g. `/works/OL20803380W`. */
  openLibraryKey?: string;
  coverUrl?: string;
  /** `false` when Open Library returned no cover id for this record. */
  coverAvailable?: boolean;
  firstPublishYear?: number;
  publisher?: string;
  publishersNote?: string;
  editionCount?: number;
  /** Internet Archive record for reading / borrowing / preview, when catalogue-listed. */
  previewUrl?: string;
  previewNote?: string;
  fetchedAt?: string;
  notes?: string[];
}

/** Every id that went into a snapshot — the audit trail behind a day. */
export type CuriosityContentKey =
  | 'quote'
  | 'ai-world'
  | 'developer-radar'
  | 'one-thing'
  | 'literature'
  | 'learn-something'
  | 'book'
  | 'speak-better'
  | 'mythology'
  | 'chemistry'
  | 'physics'
  | 'biology'
  | 'sharpener'
  | 'history';

export type PublishedContentIds = Partial<Record<CuriosityContentKey, string>>;

export type CuriosityDurability = 'shared' | 'single-host' | 'instance-only' | 'unproven';

/** How the content a card is showing arrived. */
export type CuriositySectionOrigin = 'new' | 'cached' | 'curated' | 'unavailable';

/** Snapshot metadata surfaced on the page so "is this today's?" is answerable. */
export interface CuriosityPublicationMeta {
  /** The Asia/Kolkata date this snapshot was published for. */
  date: string;
  /** ISO timestamp of the successful publish (not the date key). */
  publishedAt: string;
  /** Where the snapshot came from: the store, or the built-in fallback. */
  origin: 'published' | 'fallback';
  store: 'supabase' | 'file';
  /** Per-category content ids, so repetition can be audited. */
  contentIds: PublishedContentIds;
  /** Sections whose live source failed while this snapshot was built. */
  degraded?: string[];
  sectionOrigins?: Partial<Record<'history' | 'aiWorld' | 'developerRadar' | 'book', CuriositySectionOrigin>>;
  durability?: CuriosityDurability;
  /** The publication day of the One Book record, and the day it next turns over. */
  bookPublishedOn?: string;
  bookNextChangeOn?: string;
}

/**
 * One discovered record as the Curiosity page renders it.
 *
 * Deliberately a flat, serialisable shape: it crosses the server/client boundary
 * inside the briefing, so it may not carry functions or dates. `attribution`,
 * `license` and `rights` are part of the type — not optional extras — because a
 * record without them may not be shown.
 */
export type DiscoveryShelfEntry = {
  id: string;
  title: string;
  description: string;
  url: string;
  sourceName: string;
  attribution: string;
  license?: string;
  /** book | text | explainer | entity | textbook | mission-media | research-abstract */
  kind: string;
  /** Mandatory reading for research records; shown inline, never as a footnote. */
  caveat?: string;
  rights: string;
  subjects: string[];
  author?: string;
  language?: string;
  publicationDetails?: string;
  discoveredAt?: string;
};

export type CuriosityBriefing = {
  date: string;
  quote?: { text: string; author: string };
  aiWorld: CuriosityNewsItem[];
  developerRadar: DeveloperDiscovery[];
  book: BookRecommendation;
  oneThing: OneThingItem;
  learning: LearningItem;
  /**
   * Lead history event (kept for full compatibility with pre-upgrade snapshots and callers).
   * When `historyEntries` is populated, `history` equals `historyEntries[0] ?? null`.
   */
  history: HistoryEvent | null;
  /**
   * Today in History entries ordered strictly by priority:
   *   1. Sikh History
   *   2. Indian History
   *   3. World History
   * Pre-upgrade snapshots that omit `historyEntries` fall back cleanly to `[history]`.
   */
  historyEntries?: HistoryEvent[];
  literature: LiteratureItem;
  sharpener: BrainSharpener;
  speakBetter: SpeakBetterLesson;
  mythology: MythCharacter;
  chemistry: ChemistryConcept;
  physics: PhysicsConcept;
  biology: BiologyConcept;
  /** Present whenever a scheduled snapshot (rather than the fallback) is shown. */
  publication?: CuriosityPublicationMeta;
  /**
   * Discovered public-domain books and texts, selected from the persistent
   * candidate reservoir — never fetched during this render.
   *
   * Optional and additive: a stored snapshot from before the discovery feature
   * exists simply omits it, and the page falls back to the authored Literature and
   * Science cards it has always shown. An empty array means "the reservoir had
   * nothing eligible", which is a normal, quiet state rather than an error.
   */
  literatureShelf?: DiscoveryShelfEntry[];
};
