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

function finalize<T>(candidate: Omit<ContentCandidate<T>, 'text'> & { text: string }): ContentCandidate<T> {
  const text = candidate.text.trim();
  return {
    ...candidate,
    text,
    version: candidate.version ?? fingerprint(candidate.card, candidate.id, text).slice(0, 16),
  };
}

export function candidateSignature(candidate: ContentCandidate): string {
  return signatureText(`${candidate.title} ${candidate.text}`);
}

export function candidateFingerprint(candidate: ContentCandidate): string {
  return fingerprint(candidate.title, candidate.text);
}

/* ------------------------------------------------------------------ */
/* Pool-backed cards                                                   */
/* ------------------------------------------------------------------ */

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
 * Today in History candidate wrapper. Preserves canonical reservoir event ids,
 * category source attribution, aliases and subject keys across all three priority
 * categories (`sikh-history`, `indian-history`, `world-history`).
 */
export function candidateFromHistory(
  event: HistoryEvent,
  sourceId?: string,
  extraSubjects?: readonly string[],
): ContentCandidate<HistoryEvent> {
  const titleKey = normalizeTitle(event.title);
  const id = sourceId ?? event.id ?? `history-${event.year}-${idFromText(event.title).slice(0, 10)}`;
  const sourceLabel = event.sourceName ?? event.attribution;
  return finalize({
    card: 'history',
    id,
    title: event.title,
    text: [event.title, String(event.year), event.explanation].join('\n'),
    ...(event.url ? { url: event.url } : {}),
    ...(sourceLabel ? { sourceName: sourceLabel } : {}),
    subjects: [
      `event:${titleKey}`,
      `year:${event.year}-${titleKey.slice(0, 24)}`,
      ...(extraSubjects ?? []),
    ],
    item: event,
  });
}

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

export function candidateSubjectKeys(candidate: ContentCandidate): string[] {
  const group = policyFor(candidate.card).subjectGroup;
  return (candidate.subjects ?? [])
    .map((subject) => subjectKey(group, subject))
    .filter(Boolean)
    .map((key) => `sub:${key}`);
}

export function candidateLedgerKeys(candidate: ContentCandidate): string[] {
  return [
    `id:${candidate.card}|${candidate.id}`,
    candidate.url ? `url:${normalizeUrl(candidate.url)}` : '',
    candidate.title ? `title:${normalizeTitle(candidate.title)}` : '',
    ...candidateSubjectKeys(candidate),
  ].filter(Boolean);
}
