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
  /**
   * Approved vocabulary lessons from the scheduled discovery pipeline. Added by
   * the curated-expansion build; `supabase/migrations/012_vocabulary_candidates.sql`
   * extends the candidate category constraint to match. Without 012 the write is
   * refused by the database, the store records a note, and the app keeps
   * publishing from the authored curriculum — a visible degradation, not a break.
   */
  'speak-better',
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

/**
 * Rights classification for a reading selection.
 *
 * - `public-domain` — the work, **and the translation quoted**, are outside
 *   copyright in the named jurisdiction.
 * - `open-licence` — an explicit open licence (CC BY, CC BY-SA, CC0) covers the
 *   text shown.
 * - `link-only` — the rights could not be verified for the passage, so no text is
 *   reproduced. The card links to the source and prints only an original note.
 *
 * `link-only` exists because the honest response to an unclear rights position is
 * to link, not to quote. A `link-only` selection carries no `passage` at all.
 */
export const LITERATURE_RIGHTS = ['public-domain', 'open-licence', 'link-only'] as const;

export type LiteratureRights = (typeof LITERATURE_RIGHTS)[number];

export interface LiteratureItem {
  title: string;
  author: string;
  eraOrCountry?: string;
  format?: 'excerpt' | 'poem' | 'passage' | 'fable' | 'essay';
  /**
   * The quoted passage. Empty for a `link-only` selection — the card then shows
   * `context` instead, and `excerptKind` is what tells the two apart.
   */
  passage: string;
  attribution?: string;
  whyItMatters: string;
  url?: string;
  sourceName?: string;
  /**
   * How the text arrived. `curated` — an editor selected it for the pool.
   * `discovered` — the scheduled discovery pipeline found it in a catalogue
   * (Gutenberg, Standard Ebooks, Wikisource) and it is linked, not quoted.
   */
  origin?: 'curated' | 'discovered';
  /** `public-domain-passage` reproduces text; `link-only` does not. */
  excerptKind?: 'public-domain-passage' | 'link-only';
  /** The rights position for exactly the text this card shows. */
  rights?: LiteratureRights;
  /** One sentence naming the basis (edition, translator, licence, jurisdiction). */
  rightsBasis?: string;
  /** Where the public-domain determination differs from the reader's country. */
  jurisdictionNote?: string;
  /**
   * An original note written for this app — never a quotation. Used for a
   * `link-only` selection, where quoting the work is not permitted.
   */
  context?: string;
  /** The publisher's own catalogue date, when the source supplied one. */
  discoveredAt?: string;
  /**
   * The selection's score and the reasons behind it, so the card can explain why
   * this work rather than another appeared today.
   */
  selectionBasis?: string[];
}

/** The puzzle families Brain Sharpener draws on. */
export const PUZZLE_CATEGORIES = [
  'logical-reasoning',
  'mathematics',
  'number-patterns',
  'probability',
  'physics',
  'critical-thinking',
  'spatial-reasoning',
  'memory-observation',
] as const;

export type PuzzleCategory = (typeof PUZZLE_CATEGORIES)[number];

export const PUZZLE_CATEGORY_LABELS: Record<PuzzleCategory, string> = {
  'logical-reasoning': 'Logical reasoning',
  mathematics: 'Mathematics',
  'number-patterns': 'Number patterns',
  probability: 'Probability',
  physics: 'Physics',
  'critical-thinking': 'Critical thinking',
  'spatial-reasoning': 'Spatial reasoning',
  'memory-observation': 'Memory & observation',
};

export type PuzzleDifficulty = 1 | 2 | 3 | 4 | 5;

export interface BrainSharpener {
  id: string;
  /**
   * Legacy subject marker, kept because published snapshots and the existing card
   * read it. `category` is the fuller taxonomy and is what selection uses.
   */
  subject: 'mathematics' | 'physics';
  topic: string;
  title: string;
  problem: string;
  givenInfo?: string[];
  hint?: string;
  solution: string;
  answer: string;
  /**
   * Puzzle family. Absent on the six original puzzles, which are classified by
   * `subject` exactly as before.
   */
  category?: PuzzleCategory;
  difficulty?: PuzzleDifficulty;
  /**
   * `curated` — authored, with the answer checked by hand.
   * `generated` — produced by a procedural generator whose answer is recomputed
   * and compared before the puzzle is offered.
   */
  origin?: 'curated' | 'generated';
  /** For a generated puzzle: the generator family and the seed that produced it. */
  generator?: { family: string; seed: number };
  /** True once the answer and the worked solution have been machine-checked. */
  verified?: boolean;
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

/** Register and tone of the primary word, as a learner should choose it. */
export const SPEAK_BETTER_TONES = ['formal', 'neutral', 'informal', 'professional'] as const;
export type SpeakBetterTone = (typeof SPEAK_BETTER_TONES)[number];

/**
 * The one target word a lesson teaches, in depth.
 *
 * Every field except `pronunciation`, `idioms`, `differsFrom` and `dictionary` is
 * authored editorially. Dictionary APIs may only populate `dictionary`; they never
 * write or replace the authored teaching content.
 */
export interface SpeakBetterWord {
  /** Stable identity for progress tracking. Defaults to the lesson id + the word. */
  id?: string;
  word: string;
  /** e.g. "verb", "noun", "adjective". Shown beside the word. */
  partOfSpeech: string;
  /** The register this word belongs to. Required, so every lesson states it. */
  tone: SpeakBetterTone;
  englishMeaning: string;
  hindiMeaning: string;
  nuance: string;
  /** Three or four natural examples: everyday, professional or academic. */
  examples: string[];
  /** How to say it: stress, vowels, linking. Omitted where it would add nothing. */
  pronunciation?: string;
  /** Words this one habitually travels with, as they are actually said. */
  collocations: string[];
  /** Fixed expressions that use the word. Optional: most words have none worth teaching. */
  idioms?: string[];
  /** The mistake learners at this level actually make, and the fix. */
  commonMistake: string;
  /** The near-synonym it is most often confused with, and the line between them. */
  differsFrom?: string;
  /** When this is the natural thing to say, and when it would sound wrong. */
  register: string;
  /**
   * Optional live enrichment from Wiktionary (definitions, pronunciation, part of
   * speech) and Datamuse (collocations, related expressions).
   *
   * Deliberately a separate object rather than fields merged into the authored
   * ones: the English definition, the Hindi meaning, the nuance and the learner
   * mistake are editorial and are never replaced by an API response. This object
   * is displayed as clearly attributed dictionary material next to them.
   */
  dictionary?: SpeakBetterDictionaryEntry;
}

/**
 * What a dictionary API actually supplied for one word.
 *
 * Every field is optional because no API answers for every word, and the card
 * omits what is missing rather than filling it in. `license` and `url` are not
 * optional: dictionary text may only be shown with its licence and a link back.
 */
export interface SpeakBetterDictionaryEntry {
  sourceName: string;
  /** e.g. "Wiktionary, CC BY-SA 4.0". */
  license: string;
  url: string;
  pronunciation?: string;
  partOfSpeech?: string;
  /** A short sense, copied verbatim from the dictionary and attributed as such. */
  definition?: string;
  /** Frequent neighbours from Datamuse, shown as "often used with". */
  collocations?: string[];
  /** Datamuse "means like" / "sounds like" neighbours, for comparison. */
  related?: string[];
  fetchedAt?: string;
}

/** A near word, mentioned briefly to clarify the primary word. */
export interface SpeakBetterRelatedWord {
  word: string;
  note: string;
}

export interface SpeakBetterLesson {
  id: string;
  /** Difficulty band. Absent means A2–B1, the original corpus. */
  level?: SpeakBetterLevel;
  /**
   * Where the CEFR band came from. `curated` — an editor assigned it (the default
   * for every shipped lesson). `estimated` — inferred, and the card says so.
   * `estimated-frequency` — the discovery pipeline mapped a measured corpus
   * frequency onto a band (see `FREQUENCY_BANDS`).
   * No dictionary API supplies a CEFR level, so this is never `api`.
   */
  levelBasis?: 'curated' | 'estimated' | 'estimated-frequency';
  /** The one-line takeaway the whole lesson exists to deliver. */
  focus: string;
  /** A concrete moment where this language would actually be spoken. */
  situation: string;
  /** The single primary target word of this lesson. */
  word: SpeakBetterWord;
  /**
   * Words a learner may confuse with the primary word, each in one line of
   * clarification. These are not lessons: they carry no progress, are never
   * selected as a target and are never tracked as known or saved.
   */
  relatedWords?: SpeakBetterRelatedWord[];
  /** A short conversational example — a few lines of real dialogue. */
  dialogue: { speaker: string; line: string }[];
  /** One small spoken task the reader can do immediately. */
  challenge: string;
  /**
   * The outcome of the optional enrichment pass. `unavailable` is a normal state
   * (an offline publish, a dictionary outage) and the card simply shows the
   * authored lesson without dictionary extras.
   */
  enrichment?: {
    status: 'enriched' | 'unavailable' | 'disabled';
    detail?: string;
    fetchedAt?: string;
  };
  /**
   * How the lesson came to exist.
   *
   * `authored` (or absent) — written in this repository, the original curriculum.
   * `discovered` — assembled by the scheduled vocabulary pipeline from a live
   * lexical source plus an editorial gloss, and approved by the quality gate.
   * The card states it, because a reader is entitled to know which they are
   * reading and the two are not equally settled.
   */
  origin?: 'authored' | 'discovered';
  /** The audit trail behind a discovered lesson. Absent on authored lessons. */
  discovery?: VocabularyDiscoveryRecord;
}

/**
 * The provenance of one vocabulary lesson produced by the discovery pipeline.
 *
 * Every field is supplied by a named source or by the pipeline's own stated
 * heuristic — nothing here is inferred silently. It is persisted with the lesson
 * so a later audit can answer "where did this word come from?" without re-running
 * discovery.
 */
export interface VocabularyDiscoveryRecord {
  /** `YYYY-MM-DD` on which the pipeline approved the lesson. */
  approvedOn: string;
  /** Which lexical services answered, in the order they were asked. */
  sources: VocabularySourceRef[];
  /**
   * How the CEFR band was decided. `estimated-frequency` is the only automatic
   * basis: Datamuse's per-million frequency score, mapped to a band by a stated
   * table. An editor can override the band, which is recorded as `curated`.
   */
  levelBasis: 'curated' | 'estimated-frequency';
  /** The Datamuse frequency score (occurrences per million words) when supplied. */
  frequencyPerMillion?: number;
  /** The band the frequency score maps to, before any editorial override. */
  frequencyBand?: string;
  /**
   * The authored gloss this lesson's teaching fields came from. The pipeline can
   * only publish a word an editor has written a gloss for; discovery without a
   * gloss is held as a candidate, never shown as a lesson.
   */
  glossRevision: string;
  /** Quality components the evaluator recorded, so the approval is auditable. */
  quality: string[];
}

/** One external service a discovered lesson used, with the licence it carries. */
export interface VocabularySourceRef {
  id: string;
  name: string;
  url: string;
  license: string;
  /**
   * `ok` — answered and its answer was used. `failed` — did not answer; the
   * lesson was published from the remaining sources, and the card says which.
   */
  status: 'ok' | 'failed';
  detail?: string;
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

/**
 * What kind of figure this is — the distinction the section must never blur.
 *
 * A Sikh Guru is not a mythological character, and presenting one as fiction is
 * the failure this field exists to prevent. `religious` says only that the figure
 * is an object of living religious devotion; it is not a claim about whether a
 * historical person stands behind the account, which `historicity` records
 * separately.
 */
export const MYTH_CLASSIFICATIONS = [
  'mythological',
  'religious',
  'historical',
  'legendary',
  'literary',
] as const;

export type MythClassification = (typeof MYTH_CLASSIFICATIONS)[number];

export const MYTH_CLASSIFICATION_LABELS: Record<MythClassification, string> = {
  mythological: 'Mythological figure',
  religious: 'Religious figure',
  historical: 'Historical person',
  legendary: 'Legendary or semi-historical',
  literary: 'Literary or epic character',
};

/**
 * The historicity question, kept separate from classification because the two
 * are different: a historical person can also be an object of devotion, and a
 * legendary figure can be treated by a tradition as entirely real.
 */
export const MYTH_HISTORICITIES = ['documented', 'debated', 'legendary', 'textual-only'] as const;

export type MythHistoricity = (typeof MYTH_HISTORICITIES)[number];

export const MYTH_HISTORICITY_LABELS: Record<MythHistoricity, string> = {
  documented: 'Documented in contemporary or near-contemporary sources',
  debated: 'Historicity debated among scholars',
  legendary: 'Legendary account; no contemporary documentation',
  'textual-only': 'Known only from texts and tradition',
};

/** A citation a reader can check, as distinct from a list of text names. */
export interface MythReference {
  /** Author, title, publisher/journal and year, as one citation line. */
  citation: string;
  /** A stable link when one exists (a publisher page, an archive, a DOI). */
  url?: string;
  /** What the reference supports, when it is specific. */
  note?: string;
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

  /* ---- Added by the Mythology + Historical expansion. All optional, so  ----
   * ---- every entry authored before it keeps rendering unchanged.        ---- */

  /** Mythological / religious / historical / legendary / literary. */
  classification?: MythClassification;
  /** What the historical record actually supports. */
  historicity?: MythHistoricity;
  /** Stable key for the tradition, so a new tradition needs no code change. */
  traditionKey?: string;
  /** Where the figure belongs on a timeline, in the tradition's own terms. */
  period?: string;
  /** Background and origin — the context the story assumes the reader has. */
  background?: string;
  /** Important events, in a form a reader can scan after the narrative. */
  keyEvents?: MythTimelineEntry[];
  /** Teachings, actions or contributions, one line each. */
  contributions?: string[];
  /** Cultural and historical significance, stated as such. */
  significance?: string;
  /** Citations a reader can check, beyond the names of the texts. */
  references?: MythReference[];
  /** Interesting facts that are checkable, not trivia invented to fill space. */
  interestingFacts?: string[];
  /**
   * How contested the account is, in the entry's own words. Present when the
   * scholarly or inter-tradition picture is genuinely unsettled.
   */
  contestedNote?: string;
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
   * The two user-facing educational levels. There is no third level: the
   * specialist-research framing that used to be mixed into the default cards is
   * demoted into `undergraduate`, and nothing exposes a level above it.
   *
   * Absent means `foundation` — the default — so a snapshot published before
   * this field existed reads exactly as it did.
   */
  educationLevel?: ScienceEducationLevel;
  /** Why the level was assigned, shown in the level selector's explanation. */
  levelBasis?: 'curated' | 'derived-from-record';
  /**
   * The six questions every Science card should answer. Optional because the
   * authored corpus predates them and is not padded with empty headings; the
   * card renders whichever the entry has.
   */
  firstUnderstand?: string;
  whyCare?: string;
  whereUseful?: string;
  unknown?: string;
  /**
   * `curated` — written for this app. `wikipedia` — assembled from a Wikipedia
   * article's own sentences, linked and attributed. `research` — a recent
   * research record selected by the significance scorer: metadata plus an
   * original note, never a copied abstract unless the licence permits it.
   * Discovered content is never presented as if an editor had written it.
   */
  origin?: 'curated' | 'wikipedia' | 'research';
  /** Where every factual sentence in this card can be checked. */
  source?: CuriositySourceRef;
  /**
   * What kind of record this is, in the reader's terms. Only these values exist,
   * because a press release presented as a peer-reviewed finding is the failure
   * this field is here to prevent.
   */
  provenance?: ResearchProvenance;
  /** The sentence the card prints: "Peer-reviewed research", "Preprint — not yet peer reviewed". */
  provenanceLabel?: string;
  /** The record's own publication date. Absent when the source gave none. */
  publishedOn?: string;
  /** Journal, preprint server or publisher, as the source named it. */
  venue?: string;
  /** Bare DOI (no URL prefix), when the source supplied one. */
  doi?: string;
  /** Up to three author names, in the source's order, plus an "et al." marker. */
  authors?: string[];
  /** Why this record was selected today, in plain language. */
  whySelected?: string;
  /** The structured basis behind `whySelected`, kept for the audit trail. */
  research?: ResearchRecord;
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

/* ------------------------------------------------------------------ */
/* Research provenance and significance                               */
/* ------------------------------------------------------------------ */

/**
 * What a science record *is*. Never infer a stronger category than the source
 * states:
 *
 * - `peer-reviewed`   — an article in a journal that indexes it as a research
 *                       article (Crossref `journal-article`, Europe PMC MEDLINE).
 * - `preprint`        — arXiv/medRxiv/bioRxiv-style server deposit; not reviewed.
 * - `institutional-announcement` / `press-release` — a body describing its own
 *                       work. Supported by the type so a future adapter cannot
 *                       classify one as a discovery.
 * - `reference`       — an encyclopaedia or educational page.
 */
export const RESEARCH_PROVENANCE = [
  'peer-reviewed',
  'preprint',
  'institutional-announcement',
  'press-release',
  'reference',
] as const;

export type ResearchProvenance = (typeof RESEARCH_PROVENANCE)[number];

export const RESEARCH_PROVENANCE_LABELS: Record<ResearchProvenance, string> = {
  'peer-reviewed': 'Peer-reviewed research',
  preprint: 'Preprint — not yet peer-reviewed',
  'institutional-announcement': 'Institutional announcement',
  'press-release': 'Press release',
  reference: 'Reference material',
};

/** The rights position for the text on a research card. */
export type ResearchTextRights = 'open-licensed-abstract' | 'metadata-only';

/**
 * The stored basis of a science selection.
 *
 * Every field here is either supplied by the source or computed by
 * `scoreScienceRecord`; nothing is guessed. It is persisted in the candidate
 * payload so a later audit can ask "why did this appear?" and get an answer.
 */
export interface ResearchRecord {
  /** Bare DOI, when known. The dedupe key across OpenAlex/Crossref/Europe PMC/arXiv. */
  doi?: string;
  venue?: string;
  publisher?: string;
  authors?: string[];
  /** Institutions named on the record, when the source supplied them. */
  institutions?: string[];
  publishedOn: string;
  peerReviewed: boolean;
  citationCount?: number;
  openAccess?: boolean;
  license?: string;
  /** 0–100. A stated heuristic, not a judgement of scientific truth. */
  significanceScore: number;
  /** Human-readable components of the score, shown on the card. */
  significanceBasis: string[];
  rights: ResearchTextRights;
  /** Which adapters supplied or verified this record. */
  verifiedAgainst: string[];
  /** The query/field that found it, for rate-limit and relevance diagnostics. */
  foundVia: string;
}


export type ChemistryConcept = ScienceConcept;
export type PhysicsConcept = ScienceConcept;
export type BiologyConcept = ScienceConcept;

/* ------------------------------------------------------------------ */
/* Science — the two educational levels                               */
/* ------------------------------------------------------------------ */

/**
 * Exactly two user-facing levels. The union has no third member, which is what
 * makes "Advanced Research" impossible to reintroduce by adding a button: there
 * is no value for it to select.
 */
export const SCIENCE_EDUCATION_LEVELS = ['foundation', 'undergraduate'] as const;

export type ScienceEducationLevel = (typeof SCIENCE_EDUCATION_LEVELS)[number];

export const SCIENCE_EDUCATION_LEVEL_LABELS: Record<ScienceEducationLevel, string> = {
  foundation: 'School / Foundation Science',
  undergraduate: 'Undergraduate Science',
};

export const SCIENCE_EDUCATION_LEVEL_HINTS: Record<ScienceEducationLevel, string> = {
  foundation: 'School-level science, explained in plain language. The default.',
  undergraduate: 'Undergraduate-level detail, including research and methodology.',
};

export const DEFAULT_SCIENCE_EDUCATION_LEVEL: ScienceEducationLevel = 'foundation';

/**
 * The three science cards' content at both levels.
 *
 * Kept as its own optional field on the briefing rather than replacing
 * `chemistry`/`physics`/`biology`: an old snapshot keeps rendering the three
 * cards it published, and a new one adds a level selector on top of them.
 */
export interface ScienceLevelSet {
  foundation: { chemistry: ScienceConcept; physics: ScienceConcept; biology: ScienceConcept };
  undergraduate: { chemistry?: ScienceConcept; physics?: ScienceConcept; biology?: ScienceConcept };
  /** Which disciplines had no qualified undergraduate record today, and why. */
  notes?: string[];
}

/* ------------------------------------------------------------------ */
/* One Book — genre and bestseller evidence                           */
/* ------------------------------------------------------------------ */

export const BOOK_GENRES = [
  'science-fiction',
  'fantasy',
  'mystery',
  'thriller',
  'crime',
  'historical-fiction',
  'literary-fiction',
  'history',
  'biography',
  'autobiography',
  'science',
  'technology',
  'philosophy',
  'psychology',
  'business',
  'personal-development',
  'popular-non-fiction',
  'other',
] as const;

export type BookGenre = (typeof BOOK_GENRES)[number];

export const BOOK_GENRE_LABELS: Record<BookGenre, string> = {
  'science-fiction': 'Science fiction',
  fantasy: 'Fantasy',
  mystery: 'Mystery',
  thriller: 'Thriller',
  crime: 'Crime',
  'historical-fiction': 'Historical fiction',
  'literary-fiction': 'Literary fiction',
  history: 'History',
  biography: 'Biography',
  autobiography: 'Autobiography',
  science: 'Science',
  technology: 'Technology',
  philosophy: 'Philosophy',
  psychology: 'Psychology',
  business: 'Business',
  'personal-development': 'Personal development',
  'popular-non-fiction': 'Popular non-fiction',
  other: 'Other',
};

/**
 * Bestseller evidence — a record of *why* a book may be called a bestseller.
 *
 * The rule the type encodes: a title may only be labelled a bestseller when one
 * of these records exists and names its source. Popularity signals (Goodreads
 * counts, Amazon ratings, catalogue presence) are not evidence and have nowhere
 * to go in this shape.
 */
export interface BestsellerEvidence {
  /** The recognising body, e.g. "The New York Times". */
  source: string;
  /** The list itself, e.g. "Hardcover Fiction". */
  list?: string;
  /** Where on the list, when the record states it, e.g. "#1". */
  rank?: string;
  /** The ranking period, when the record states it, e.g. "week of 12 May 2019". */
  period?: string;
  /** A page a reader can check, when a stable one exists. */
  url?: string;
  /**
   * `list-entry` — the title was recorded on the named list.
   * `publisher-stated` — the publisher's own page states the bestseller status,
   * which is weaker than an independent list and is said so on the card.
   */
  kind: 'list-entry' | 'publisher-stated';
  /** Anything a reader should know about the strength of this evidence. */
  note?: string;
}

export interface BookGenreMetadata {
  /**
   * The shelf this book belongs to. Optional on the type because a snapshot
   * published before genre rotation existed has none; every entry the planner may
   * publish carries one, and `genreOf` reads a missing value as `other` rather than
   * guessing.
   */
  genre?: BookGenre;
  /** A second shelf, for a book that genuinely sits in two. */
  secondaryGenre?: BookGenre;
  /** Who the book is for, in one line. */
  audience?: string;
  /** What the reader can expect, in one line. */
  expect?: string;
  /** Present only when a credible source supports the word "bestseller". */
  bestseller?: BestsellerEvidence;
  /** The year of first publication, when the record states one. */
  firstPublished?: number;
}

/* ------------------------------------------------------------------ */
/* One Book — a candidate from the pool, plus the resolved record      */
/* ------------------------------------------------------------------ */

export interface BookCandidate extends BookGenreMetadata {
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
  /**
   * The same three cards at both educational levels: `foundation` (the default,
   * and what `chemistry`/`physics`/`biology` above hold) and `undergraduate`
   * when a qualified record exists. Optional, so a snapshot published before
   * the two-level structure still renders.
   */
  scienceLevels?: ScienceLevelSet;
  /** How the Two Levels selector's content arrived today, for the card's label. */
  scienceLevelNote?: string;
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
  /**
   * Two verified alternative challenges, so the card can offer "try another" without
   * shipping the generator code to the browser and without asking the server again.
   * Populated by the publisher; absent in older snapshots, which simply show the one
   * puzzle they always had.
   */
  sharpenerAlternatives?: BrainSharpener[];
  /**
   * Two alternative Speak Better lessons at the same bands. The browser uses them
   * only when the published lesson's words are all marked known on that device —
   * the per-reader half of repetition control, which the server cannot see.
   */
  speakBetterAlternatives?: SpeakBetterLesson[];
};
