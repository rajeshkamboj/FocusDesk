import type { SpeakBetterLesson, SpeakBetterLevel, SpeakBetterWord } from './types';
import { SPEAK_BETTER_LEVELS } from './types';
import { speakBetterLessons as speakBetterA2B1 } from './content/speak-better';
import { speakBetterB2Lessons } from './content/speak-better-b2';
import { speakBetterC1Lessons } from './content/speak-better-c1';
import { speakBetterC2Lessons } from './content/speak-better-c2';

/**
 * The Speak Better curriculum.
 *
 * The lessons themselves live in four typed data files, one per difficulty band,
 * exactly like the rest of the Curiosity corpus — a content file per level rather
 * than an ever-growing component. This module is the only place that knows all
 * four, and it does four jobs:
 *
 *   1. **Compose.** One ordered list, oldest band first, preserving the original
 *      A2–B1 order byte for byte so the daily rotation that produced every
 *      existing reader's history still produces the same card.
 *   2. **Identify.** Every word gets a stable id — `lessonId:word` — which is the
 *      key progress is stored under. It is derived, never authored, so a lesson
 *      cannot forget to have one and cannot have two different ones.
 *   3. **Filter.** By level and by free text, over exactly the words a reader can
 *      see: the word, both meanings, the nuance and the examples.
 *   4. **Track.** Seen / Known / Saved / Review-later, as a pure reducer over a
 *      record the caller owns, so persistence is a separate, testable decision.
 *
 * Nothing here fetches, writes or reads storage at import time.
 */

export const SPEAK_BETTER_A2B1_LESSONS: readonly SpeakBetterLesson[] = speakBetterA2B1;
export const SPEAK_BETTER_B2_LESSONS: readonly SpeakBetterLesson[] = speakBetterB2Lessons;
export const SPEAK_BETTER_C1_LESSONS: readonly SpeakBetterLesson[] = speakBetterC1Lessons;
export const SPEAK_BETTER_C2_LESSONS: readonly SpeakBetterLesson[] = speakBetterC2Lessons;

/** A lesson's band. A lesson without a marker is A2–B1, the original corpus. */
export function levelOf(lesson: SpeakBetterLesson): SpeakBetterLevel {
  return lesson.level ?? 'A2-B1';
}

/**
 * Every lesson, in band order. The A2–B1 block comes first and in its original
 * order: the publisher's day-index rotation reads this list, so reordering the
 * original twelve would change which lesson an existing reader sees today.
 */
export const speakBetterCurriculum: readonly SpeakBetterLesson[] = [
  ...SPEAK_BETTER_A2B1_LESSONS,
  ...SPEAK_BETTER_B2_LESSONS,
  ...SPEAK_BETTER_C1_LESSONS,
  ...SPEAK_BETTER_C2_LESSONS,
];

export function lessonsForLevel(level: SpeakBetterLevel): readonly SpeakBetterLesson[] {
  return speakBetterCurriculum.filter((lesson) => levelOf(lesson) === level);
}

/** How many lessons each band holds, for the difficulty selector's counts. */
export function levelCounts(): Record<SpeakBetterLevel, number> {
  const counts = Object.fromEntries(SPEAK_BETTER_LEVELS.map((level) => [level, 0])) as Record<SpeakBetterLevel, number>;
  for (const lesson of speakBetterCurriculum) counts[levelOf(lesson)] += 1;
  return counts;
}

/** The stable identity of one word's progress record. */
export function wordProgressId(lessonId: string, word: string): string {
  return `${lessonId}:${word}`;
}

/**
 * The word as the UI and the tracker see it: the authored word plus the id it
 * is stored under. A word with an explicit `id` keeps it, so an unusual spelling
 * can be re-keyed deliberately without losing a reader's progress.
 */
export function resolvedWords(lesson: SpeakBetterLesson): (SpeakBetterWord & { id: string })[] {
  return lesson.words.map((word) => ({ ...word, id: word.id ?? wordProgressId(lesson.id, word.word) }));
}

/**
 * Free-text search over one lesson: every word a reader can read is searchable,
 * including the Hindi meaning, so “सिखाना” finds the teach/learn lesson.
 *
 * Matching is case- and diacritic-insensitive on the Latin side and substring-based
 * on the Devanagari side, which is what a Hindi keyboard produces naturally.
 */
function normalized(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function lessonMatchesQuery(lesson: SpeakBetterLesson, query: string): boolean {
  const terms = normalized(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalized([
    lesson.focus,
    lesson.situation,
    lesson.challenge,
    ...lesson.words.flatMap((word) => [
      word.word,
      word.englishMeaning,
      word.hindiMeaning,
      word.nuance,
      word.pronunciation ?? '',
      ...(word.collocations ?? []),
      ...(word.commonMistake ? [word.commonMistake] : []),
      ...(word.differsFrom ? [word.differsFrom] : []),
      ...(word.register ? [word.register] : []),
      ...word.examples,
    ]),
    ...lesson.dialogue.flatMap((line) => [line.speaker, line.line]),
  ].join(' \u0000 '));
  // Devanagari does not survive NFKD normalisation predictably, so the raw text
  // is searched too — a query in Hindi matches the Hindi gloss either way.
  const raw = [
    ...lesson.words.map((word) => word.hindiMeaning),
    lesson.focus,
    lesson.situation,
  ].join(' ');
  return terms.every((term) => haystack.includes(term) || raw.toLowerCase().includes(term));
}

export interface SpeakBetterFilter {
  level?: SpeakBetterLevel | 'all';
  query?: string;
  /** Only lessons containing at least one word in this tracking state. */
  onlyWordState?: { state: import('./types').SpeakBetterTrackingState; progress: import('./types').SpeakBetterProgressEntry[] };
}

/**
 * The lessons a reader should see for a difficulty, a search and an optional
 * progress filter. Order is always the curriculum order, so scrolling down a
 * level reads from the earliest lesson to the latest and switching levels does
 * not reshuffle what is already on screen.
 */
export function filterLessons(filter: SpeakBetterFilter = {}): readonly SpeakBetterLesson[] {
  const level = filter.level ?? 'all';
  const query = filter.query?.trim() ?? '';
  return speakBetterCurriculum.filter((lesson) => {
    if (level !== 'all' && levelOf(lesson) !== level) return false;
    if (query && !lessonMatchesQuery(lesson, query)) return false;
    if (filter.onlyWordState) {
      const { state, progress } = filter.onlyWordState;
      const tracked = new Set(progress.filter((entry) => entry.state === state).map((entry) => entry.id));
      if (!resolvedWords(lesson).some((word) => tracked.has(word.id))) return false;
    }
    return true;
  });
}

/**
 * Which band today's published lesson belongs to. The daily card keeps its
 * existing selection (unchanged, see lib/curiosity/content.ts); this only labels
 * it so the reader knows where it sits on the ladder.
 */
export function levelOfLessonId(lessonId: string): SpeakBetterLevel | null {
  const found = speakBetterCurriculum.find((lesson) => lesson.id === lessonId);
  return found ? levelOf(found) : null;
}
