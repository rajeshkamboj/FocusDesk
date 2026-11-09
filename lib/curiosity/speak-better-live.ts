/**
 * Publishing a discovered vocabulary lesson.
 *
 * The scheduled pipeline approves lessons into the candidate reservoir; this
 * module turns those rows back into lessons at publish time, and decides which one
 * a date may show. It never fetches and never writes.
 *
 * Three rules, in order:
 *
 *   1. **No repeat.** A word already published is not a new lesson — not after a
 *      month, not after a year. The publication ledger is the record; the word is
 *      read from the ledger's `word:` subject and from the lesson ids it recorded.
 *      A deliberate revision experience is a separate feature and is not faked
 *      here by quietly re-showing the same word.
 *   2. **Bands before recency.** Only B2–C2 lessons compete; a C2 lesson is
 *      eligible on the same one-day-in-five basis the authored curriculum uses.
 *   3. **Freshness, then date.** Never-published lessons win; inside that set the
 *      pick is a pure function of the date, so the same day always agrees.
 *
 * Known-word tracking stays where it has to be: on the reader's device. The server
 * cannot see it, so the publisher also ships alternatives and the card
 * (`refineForReader`) swaps in one whose word is still new.
 */

import type { SpeakBetterLesson, SpeakBetterLevel } from './types';
import type { SeenRecord } from './state';

/** The bands the daily card draws from. */
export const LIVE_DAILY_BANDS: readonly SpeakBetterLevel[] = ['B2', 'C1'];

function hash(value: string): number {
  let h = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 16_777_619) >>> 0;
  }
  return h % 1_000_003;
}

function bandOf(lesson: SpeakBetterLesson): SpeakBetterLevel {
  return lesson.level ?? 'A2-B1';
}

/**
 * Every target word already shown to a reader, from the publication ledger.
 *
 * The subject key is the primary signal; the lesson id is the fallback for a
 * ledger written before subjects were stored. Both are cheap and neither can
 * invent a word that was not published.
 */
export function publishedVocabularyWords(seen: readonly SeenRecord[]): Set<string> {
  const words = new Set<string>();
  for (const record of seen) {
    if (record.category !== 'speak-better') continue;
    for (const subject of record.subjects ?? []) {
      const match = /^word:(.+)$/i.exec(subject.trim());
      if (match && match[1]) words.add(match[1].trim().toLowerCase());
    }
    // `vocab-<word>` and `<lessonId>:<word>` both end in the word.
    const fromId = record.id ? record.id.split(':').pop() ?? '' : '';
    if (fromId) words.add(fromId.trim().toLowerCase());
  }
  // A word can also be visible in the title, which is how the publisher records it.
  for (const record of seen) {
    if (record.category !== 'speak-better' || !record.title) continue;
    const title = record.title.trim().toLowerCase();
    if (/^[a-z][a-z'-]{2,19}$/.test(title)) words.add(title);
  }
  return words;
}

/** Lesson ids shown recently, so a re-run cannot shuffle the day's card. */
export function recentLessonIds(seen: readonly SeenRecord[], withinDays = 30, today?: string): string[] {
  const limit = today ? Date.parse(`${today}T00:00:00Z`) : Date.now();
  const out: string[] = [];
  for (const record of seen) {
    if (record.category !== 'speak-better') continue;
    const at = Date.parse(`${record.on}T00:00:00Z`);
    if (Number.isFinite(at) && Number.isFinite(limit)) {
      const age = Math.floor((limit - at) / 86_400_000);
      if (age > withinDays) continue;
    }
    out.push(record.id);
  }
  return out;
}

export interface LiveLessonSelection {
  lesson: SpeakBetterLesson;
  /** Why this lesson, in words the run log can store. */
  basis: string[];
}

/**
 * Choose the day's discovered lesson.
 *
 * Returns `null` when the reservoir holds nothing eligible — the caller then
 * publishes an authored lesson, which is the documented fallback and never an
 * empty card.
 */
export function selectLiveLesson(
  lessons: readonly SpeakBetterLesson[],
  options: {
    date: string;
    publishedWords: ReadonlySet<string>;
    recentLessonIds?: readonly string[];
    /** C2 joins the pool on one day in five, as the authored curriculum does. */
    includeC2?: boolean;
  },
): LiveLessonSelection | null {
  if (lessons.length === 0) return null;
  const includeC2 = options.includeC2 ?? Math.abs(hash(options.date)) % 5 === 0;
  const bands = new Set<SpeakBetterLevel>(includeC2 ? [...LIVE_DAILY_BANDS, 'C2'] : LIVE_DAILY_BANDS);
  const recent = new Set(options.recentLessonIds ?? []);

  const unseen = lessons.filter((lesson) => !options.publishedWords.has(lesson.word.word.toLowerCase()));
  const inBand = unseen.filter((lesson) => bands.has(bandOf(lesson)));
  const pool = inBand.length ? inBand : unseen;
  if (pool.length === 0) return null;

  const ordered = [...pool].sort((left, right) => {
    const leftRecent = recent.has(left.id) ? 1 : 0;
    const rightRecent = recent.has(right.id) ? 1 : 0;
    if (leftRecent !== rightRecent) return leftRecent - rightRecent;
    return hash(`${options.date}|${left.id}`) - hash(`${options.date}|${right.id}`) || left.id.localeCompare(right.id);
  });

  const lesson = ordered[0];
  const basis = [
    `discovered vocabulary at ${bandOf(lesson)}`,
    lesson.discovery?.levelBasis === 'estimated-frequency'
      ? `band estimated from frequency (${lesson.discovery.frequencyPerMillion}/million)`
      : 'band assigned by the editor',
    recent.has(lesson.id) ? 'repeated because every unseen alternative was recent' : 'never shown before',
  ];
  return { lesson, basis };
}

/**
 * Alternatives shipped with the day, used only when the browser finds the
 * published word is already known on that device.
 *
 * Different words only — an alternative that repeats the day's word would defeat
 * the purpose — and never one already published to the ledger.
 */
export function liveAlternatives(
  lessons: readonly SpeakBetterLesson[],
  options: { publishedWords: ReadonlySet<string>; excludeWord?: string; limit?: number; date?: string },
): SpeakBetterLesson[] {
  const exclude = options.excludeWord?.toLowerCase();
  const date = options.date ?? '';
  return lessons
    .filter((lesson) => !options.publishedWords.has(lesson.word.word.toLowerCase()))
    .filter((lesson) => lesson.word.word.toLowerCase() !== exclude)
    .filter((lesson) => LIVE_DAILY_BANDS.includes(bandOf(lesson)) || bandOf(lesson) === 'C2')
    .sort((left, right) => hash(`${date}|${left.id}`) - hash(`${date}|${right.id}`) || left.id.localeCompare(right.id))
    .slice(0, options.limit ?? 4);
}
