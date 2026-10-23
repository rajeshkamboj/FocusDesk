import {
  fingerprint,
  idFromText,
  normalizeTitle,
  normalizeUrl,
  signatureText,
  subjectKey,
} from './dedupe';
import { policyFor, type CuriosityCardKey } from './catalog';
import type {
  BookCandidate,
  BookRecommendation,
  BrainSharpener,
  CuriosityNewsItem,
  CuriosityPoolEntry,
  DeveloperDiscovery,
  HistoryEvent,
  LearningItem,
  LiteratureItem,
  MythCharacter,
  OneThingItem,
  ScienceConcept,
  SpeakBetterLesson,
} from './types';
import type { Quote } from '@/lib/quotes';

/**
 * A card-agnostic candidate.
 *
 * Every builder below turns one authored or fetched item into the same six
 * facts the selection service needs: which card it belongs to, what it is called,
 * what its text is, where it can be checked, which subjects it occupies, and a
 * version that changes exactly when the content does. The payload (`item`) is
 * untouched, so the selection layer can never mutate what a card renders.
 *
 * The distinction the brief asks for — a new item versus an edited old one — is
 * carried by `id` + `version`: the id is stable across edits (so the cooldown
 * still applies), while the version and signature change (so a genuinely
 * different article is not mistaken for the old one). Selection treats a
 * changed version of a *published* id as a repeat of the same item.
 */
export interface ContentCandidate<T = unknown> {
  card: CuriosityCardKey;
  id: string;
  title: string;
  /** Canonical text: title plus every field a reader will read. */
  text: string;
  url?: string;
  sourceName?: string;
  subjects?: string[];
  /** Changes when the wording changes; stable when only the fetch timestamp does. */
  version?: string;
  /** The source's own publication date, for news items only. */
  publishedAt?: string;
  item: T;
}

/** Shared finalization: fingerprint, signature and version all derive from the same text. */
function finalize<T>(candidate: Omit<ContentCandidate<T>, 'text'> & { text: string }): ContentCandidate<T> {
  const text = candidate.text.trim();
  return {
    ...candidate,
    text,
    version: candidate.version ?? fingerprint(candidate.card, candidate.id, text).slice(0, 16),
  };
}

/** The signature a candidate would store if published. Exported for tests and the validator. */
export function candidateSignature(candidate: ContentCandidate): string {
  return signatureText(`${candidate.title} ${candidate.text}`);
}

/** The fingerprint a candidate would store if published. */
export function candidateFingerprint(candidate: ContentCandidate): string {
  return fingerprint(candidate.title, candidate.text);
}

/* ------------------------------------------------------------------ */
/* Pool-backed cards                                                   */
/* ------------------------------------------------------------------ */

/**
 * One Thing, Learn Something, Literature, One Book.
 *
 * The pool entry already carries the stable id, the source and the provenance;
 * the only new work is turning the card's own fields into comparable text. The
 * `item.url` is preferred over `entry.source.url` for identity because it is the
 * link the reader is shown, and the cooldown should follow what was seen.
 */
export function candidateFromPool(card: CuriosityCardKey, entry: CuriosityPoolEntry<unknown>): ContentCandidate<unknown> {
  const item = entry.item as OneThingItem & LearningItem & LiteratureItem & BookCandidate;
  const title = item.title ?? item.topic ?? entry.id;
  const text = [
    title,
    item.explanation ?? item.passage ?? item.synopsis ?? '',
    item.whyItMatters ?? item.why ?? '',
    item.author ?? '',
  ]
    .filter(Boolean)
    .join('\n');
  const url = item.url ?? entry.source?.url;
  const subjects = [
    item.title ? `work:${item.title}` : '',
    item.topic ? `topic:${item.topic}` : '',
    item.author ? `author:${item.author}` : '',
    ...(entry.tags ?? []).filter((tag) => !GENERIC_TAGS.has(tag.toLowerCase())).map((tag) => `tag:${tag}`),
  ].filter(Boolean);
  return finalize({
    card,
    id: entry.id,
    title,
    text,
    ...(url ? { url } : {}),
    ...(entry.source?.name ? { sourceName: entry.source.name } : {}),
    subjects,
    item,
  });
}

/** Tags that describe a whole discipline rather than an item; never used as subjects. */
const GENERIC_TAGS = new Set(['physics', 'chemistry', 'biology', 'science', 'technology', 'engineering', 'history']);

/* ------------------------------------------------------------------ */
/* Fixed-corpus cards                                                  */
/* ------------------------------------------------------------------ */

export function candidateFromMyth(character: MythCharacter): ContentCandidate<MythCharacter> {
  const subjects = [
    `character:${character.name}`,
    character.wikidataId ? `qid:${character.wikidataId}` : '',
    ...(character.aliases ?? []).map((alias) => `character:${alias}`),
  ].filter(Boolean);
  return finalize({
    card: 'mythology',
    id: character.id,
    title: character.name,
    text: [character.name, character.tradition, character.story, character.analysis].join('\n'),
    ...(character.sourceUrl ? { url: character.sourceUrl } : {}),
    sourceName: character.wikidataId ? 'Wikidata · Wikipedia' : 'Authored from the named sources',
    subjects,
    item: character,
  });
}

export function candidateFromScience(card: 'chemistry' | 'physics' | 'biology', concept: ScienceConcept): ContentCandidate<ScienceConcept> {
  const subjects = [
    `concept:${concept.topic}`,
    concept.wikidataId ? `qid:${concept.wikidataId}` : '',
    ...(concept.aliases ?? []).map((alias) => `concept:${alias}`),
  ].filter(Boolean);
  return finalize({
    card,
    id: concept.id,
    title: concept.topic,
    text: [concept.topic, concept.simple, concept.deeper, concept.connection, concept.surprising].filter(Boolean).join('\n'),
    ...(concept.source?.url ? { url: concept.source.url } : {}),
    ...(concept.source?.name ? { sourceName: concept.source.name } : {}),
    subjects,
    item: concept,
  });
}

export function candidateFromSpeakBetter(lesson: SpeakBetterLesson): ContentCandidate<SpeakBetterLesson> {
  const subjects = [`lesson:${lesson.id}`, ...lesson.words.map((word) => `word:${word.word}`)];
  return finalize({
    card: 'speak-better',
    id: lesson.id,
    title: lesson.focus,
    text: [
      lesson.focus,
      lesson.situation,
      lesson.words.map((word) => `${word.word}: ${word.englishMeaning} ${word.nuance} ${word.examples.join(' ')}`).join('\n'),
      lesson.dialogue.map((line) => line.line).join('\n'),
      lesson.challenge,
    ].join('\n'),
    subjects,
    item: lesson,
  });
}

export function candidateFromSharpener(sharpener: BrainSharpener): ContentCandidate<BrainSharpener> {
  return finalize({
    card: 'sharpener',
    id: sharpener.id,
    title: sharpener.title,
    text: [sharpener.title, sharpener.problem, sharpener.answer, sharpener.solution].join('\n'),
    subjects: [`puzzle:${sharpener.title}`, `answer:${sharpener.answer}`],
    item: sharpener,
  });
}

/**
 * A Thought for Today.
 *
 * The quote corpus has no ids, so the identity is derived from the words and the
 * attribution: re-punctuating a quote does not make it new, and publishing the
 * same line under two spellings of the author's name does not either.
 */
export function candidateFromQuote(quote: Quote): ContentCandidate<Quote> {
  const title = quote.text;
  const subjects = [`author:${quote.author}`, `quote:${normalizeTitle(quote.text).slice(0, 60)}`];
  return finalize({
    card: 'quote',
    id: `quote-${idFromText(quote.text, quote.author)}`,
    title,
    text: `${quote.text} — ${quote.author}`,
    subjects,
    sourceName: quote.author,
    item: quote,
  });
}

/**
 * Today in History.
 *
 * The identity is the event, not the day: the same anniversary must not return
 * a year later under the same heading, while a *different* event on the same date
 * is allowed. Year and title are part of both the id and the fingerprint, so an
 * edited explanation of the same event keeps the id and the cooldown.
 */
export function candidateFromHistory(event: HistoryEvent, sourceId?: string): ContentCandidate<HistoryEvent> {
  const titleKey = normalizeTitle(event.title);
  const id = sourceId ?? `history-${event.year}-${idFromText(event.title).slice(0, 10)}`;
  return finalize({
    card: 'history',
    id,
    title: event.title,
    text: [event.title, String(event.year), event.explanation, event.significance].join('\n'),
    ...(event.url ? { url: event.url } : {}),
    ...(event.attribution ? { sourceName: event.attribution } : {}),
    subjects: [`event:${titleKey}`, `year:${event.year}-${titleKey.slice(0, 24)}`],
    item: event,
  });
}

/** An archive entry shown when nothing is verified for the date. Labelled, never presented as today's. */
export function candidateFromHistoryArchive(event: HistoryEvent, archiveId: string): ContentCandidate<HistoryEvent> {
  return candidateFromHistory(event, archiveId);
}

export function candidateFromNews(item: CuriosityNewsItem): ContentCandidate<CuriosityNewsItem> {
  const id = item.url ? `news-${idFromText(normalizeUrl(item.url))}` : `news-${idFromText(item.title, item.source)}`;
  return finalize({
    card: 'ai-world',
    id,
    title: item.title,
    text: [item.title, item.summary].join('\n'),
    ...(item.url ? { url: item.url } : {}),
    sourceName: item.source,
    subjects: [`article:${normalizeTitle(item.title)}`],
    ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
    item,
  });
}

export function candidateFromRadar(item: DeveloperDiscovery): ContentCandidate<DeveloperDiscovery> {
  const id = item.url ? `repo-${idFromText(normalizeUrl(item.url))}` : `repo-${idFromText(item.name)}`;
  return finalize({
    card: 'developer-radar',
    id,
    title: item.name,
    text: [item.name, item.description, item.why].join('\n'),
    ...(item.url ? { url: item.url } : {}),
    sourceName: item.url ? new URL(item.url, 'https://github.com').hostname : 'curated shelf',
    subjects: [`repo:${item.name}`, `repository:${normalizeUrl(item.url)}`],
    item,
  });
}

export function candidateFromBook(book: BookRecommendation | BookCandidate, id: string, openLibraryKey?: string): ContentCandidate<BookCandidate> {
  const subjects = [
    `book:${book.title}`,
    `author:${book.author}`,
    openLibraryKey ? `work:${openLibraryKey}` : '',
  ].filter(Boolean);
  return finalize({
    card: 'book',
    id,
    title: book.title,
    text: [book.title, book.author, book.synopsis, book.why].join('\n'),
    ...(book.url ? { url: book.url } : {}),
    sourceName: 'Open Library',
    subjects,
    item: book,
  });
}

/**
 * The subject keys a candidate would block, in the exact form the ledger index
 * stores (`sub:<group>:<subject>`).
 *
 * The prefix is part of the key, not decoration: an earlier version returned the
 * unprefixed form here while `history.identityKeys` stored the prefixed one, and
 * the result was a subject check that silently never matched. The two functions
 * now agree by construction, and `verify-curiosity-dedupe` asserts a cross-card
 * rejection by subject rather than by title.
 */
export function candidateSubjectKeys(candidate: ContentCandidate): string[] {
  const group = policyFor(candidate.card).subjectGroup;
  return (candidate.subjects ?? [])
    .map((subject) => subjectKey(group, subject))
    .filter(Boolean)
    .map((key) => `sub:${key}`);
}

/** Every key the ledger would record for a published candidate. */
export function candidateLedgerKeys(candidate: ContentCandidate): string[] {
  return [
    `id:${candidate.card}|${candidate.id}`,
    candidate.url ? `url:${normalizeUrl(candidate.url)}` : '',
    candidate.title ? `title:${normalizeTitle(candidate.title)}` : '',
    ...candidateSubjectKeys(candidate),
  ].filter(Boolean);
}
