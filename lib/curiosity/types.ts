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

export interface HistoryEvent {
  date: string;
  year: number | string;
  title: string;
  explanation: string;
  significance: string;
  url?: string;
  /**
   * Was this event verified as belonging to the briefing's date? An archive entry
   * shown because nothing was verified for today carries `false`, and the card has to
   * say so — an anniversary presented under "Today in History" that is not one is a
   * false statement, not a soft failure.
   */
  forThisDate?: boolean;
  /** Where the event came from: the live anniversaries feed, or this repository. */
  origin?: 'live' | 'curated';
  /** Kept with the text when a source's own attribution is required. */
  attribution?: string;
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
 * Speak Better — one practical spoken-English lesson a day.
 *
 * The words in a lesson are meant to be *confusable*: the lesson earns its
 * place only by making the difference between them explicit, so every word
 * carries its own English gloss, Hindi gloss and one line of nuance, plus
 * example sentences that show the difference rather than describe it.
 */
export interface SpeakBetterWord {
  word: string;
  englishMeaning: string;
  hindiMeaning: string;
  nuance: string;
  examples: string[];
}

export interface SpeakBetterLesson {
  id: string;
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

/**
 * What this repository asserts about a book. Everything here is authored
 * editorial: a title, an author, and two short paragraphs we wrote.
 *
 * It deliberately holds **no** cover, no rating, no publication year and no
 * availability claim. Those belong to the catalogue, so they are fetched from
 * Open Library at publish time (see `openlibrary.ts`) and are simply omitted
 * when the catalogue does not provide them.
 */
export interface BookCandidate {
  title: string;
  author: string;
  synopsis: string;
  why: string;
  /**
   * An optional publisher/author page we also authored. When Open Library
   * resolves, its work record becomes the primary link and this is dropped.
   */
  url?: string;
  subjects?: string[];
}

/**
 * The published book card. Fields are optional because they are only ever
 * present when Open Library actually returned them — a missing `coverUrl`
 * means no cover exists for this record, not that the book has no cover.
 */
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

/**
 * `shared`       — every instance and every restart reads the same record (the database).
 * `single-host`  — survives a restart of this machine, invisible to any other instance.
 * `instance-only`— written where the deployment filesystem is read-only, so it dies with
 *                  the instance; useful, and not persistence.
 * `unproven`     — nothing has been written yet from this process, so the store has not
 *                  had to discover whether its directory is writable.
 */
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
  /**
   * How each card's content got here, computed by the server so the components can
   * stay presentational: `new` from today's successful fetch, `cached` from an earlier
   * successful fetch, `curated` from this repository, `unavailable` when neither
   * applies. A reader should be able to tell without hovering over anything.
   */
  sectionOrigins?: Partial<Record<'history' | 'aiWorld' | 'developerRadar' | 'book', CuriositySectionOrigin>>;
  /**
   * Whether this snapshot is still there after a restart, and whether another instance
   * would see it. Reported, not assumed: the file store is `single-host` on a machine
   * with a writable disk, `instance-only` on a read-only deployment filesystem, and the
   * database store is `shared`.
   */
  durability?: CuriosityDurability;
  /** The publication day of the One Book record, and the day it next turns over. */
  bookPublishedOn?: string;
  bookNextChangeOn?: string;
}


export type CuriosityBriefing = {
  date: string;
  /**
   * A Thought for Today, when a published snapshot carries one.
   *
   * Optional on purpose: the quote used to be selected in the browser and there
   * is nothing wrong with a briefing that omits it. When present, the publisher
   * chose it through the same anti-repetition ledger as the other cards, so the
   * same line cannot come back the next week under a different date.
   */
  quote?: { text: string; author: string };
  aiWorld: CuriosityNewsItem[];
  developerRadar: DeveloperDiscovery[];
  book: BookRecommendation;
  oneThing: OneThingItem;
  learning: LearningItem;
  history: HistoryEvent | null;
  literature: LiteratureItem;
  sharpener: BrainSharpener;
  speakBetter: SpeakBetterLesson;
  mythology: MythCharacter;
  chemistry: ChemistryConcept;
  physics: PhysicsConcept;
  biology: BiologyConcept;
  /** Present whenever a scheduled snapshot (rather than the fallback) is shown. */
  publication?: CuriosityPublicationMeta;
};
