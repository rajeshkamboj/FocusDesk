export type CuriosityNewsItem = {
  title: string;
  source: string;
  publishedAt: string;
  summary: string;
  url: string;
};

export type DeveloperDiscovery = {
  name: string;
  description: string;
  why: string;
  pricing: string;
  url: string;
};

export interface HistoryEvent {
  date: string;
  year: number | string;
  title: string;
  explanation: string;
  significance: string;
  url?: string;
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
 * Chemistry and Physics of the Day share one shape because they are the same
 * kind of card: a compact concept with an optional deeper layer, an equation
 * where an equation genuinely helps, a connection to real life, one surprising
 * fact, and one question to carry away. They stay two named types — and two
 * separate fields on the briefing — so each subject's content file, and the
 * label on each card, can be honest about its own subject.
 */
export interface ScienceConcept {
  id: string;
  topic: string;
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

export type CuriosityBriefing = {
  date: string;
  aiWorld: CuriosityNewsItem[];
  developerRadar: DeveloperDiscovery[];
  book: { title: string; author: string; description: string; why: string; url: string };
  oneThing: { title: string; explanation: string; url?: string };
  learning: { topic: string; explanation: string; url?: string };
  history: HistoryEvent | null;
  literature: LiteratureItem;
  sharpener: BrainSharpener;
  speakBetter: SpeakBetterLesson;
  mythology: MythCharacter;
  chemistry: ChemistryConcept;
  physics: PhysicsConcept;
};
