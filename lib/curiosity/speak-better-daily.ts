/**
 * Speak Better — choosing the day's lesson, for the reader in front of it.
 *
 * WHAT THIS FIXES
 * The daily card rotated over the twelve A2–B1 lessons, so a reader who wanted to
 * improve at a professional level kept meeting "excuse me" and "I'm afraid". The
 * pool is now the B2 and C1 bands, with a C2 lesson appearing occasionally, and the
 * choice respects what the reader has already marked as known.
 *
 * WHY THERE ARE TWO SELECTIONS, NOT ONE
 * The daily snapshot is published on the server at midnight and cannot see a
 * reader's `localStorage`. So there are two layers, both using this module:
 *
 *   - `selectDailyLesson` — the publisher's choice, from the date alone. It is what
 *     a first-time reader sees, and what the snapshot records.
 *   - `refineForReader` — the browser's refinement, applied only when the published
 *     lesson contains words this particular reader has marked *known*. It never
 *     invents content and never overrides a lesson the reader has not already
 *     outgrown; the card notes when it has swapped the lesson.
 *
 * CEFR HONESTY
 * No dictionary API publishes CEFR levels for individual senses. Every band here is
 * editorial (`levelBasis: 'curated'`); the card says "curated level" rather than
 * implying a word list or an API assigned it.
 *
 * Everything is pure: no clock, no storage, no network.
 */

import type { SpeakBetterLesson, SpeakBetterLevel, SpeakBetterProgressEntry } from './types';
import { dayNumber } from './schedule';

/** The band order this module prefers, most common first. */
export const DAILY_BANDS: readonly SpeakBetterLevel[] = ['B2', 'C1', 'C2'];

/** One C2 day every five, deterministically. */
export function isC2Day(date: string): boolean {
  return Math.abs(dayNumber(date)) % 5 === 0;
}

export function bandOf(lesson: SpeakBetterLesson): SpeakBetterLevel {
  return lesson.level ?? 'A2-B1';
}

/** Known words, by lesson id, from a progress ledger. */
export function knownWordsByLesson(entries: readonly SpeakBetterProgressEntry[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const entry of entries) {
    if (entry.state !== 'known') continue;
    const set = map.get(entry.lessonId) ?? new Set<string>();
    set.add(entry.word.trim().toLowerCase());
    map.set(entry.lessonId, set);
  }
  return map;
}

/** How many of a lesson's words the reader has not yet marked known. */
export function newWordCount(lesson: SpeakBetterLesson, known: Map<string, Set<string>>): number {
  const knownForLesson = known.get(lesson.id) ?? new Set<string>();
  return lesson.words.filter((word) => !knownForLesson.has(word.word.trim().toLowerCase())).length;
}

/** A stable ordering key for (date, lesson), so the same day always agrees. */
function dailyScore(date: string, lessonId: string): number {
  let hash = 2_166_136_261;
  const input = `${date}|${lessonId}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash % 1_000_003;
}

export interface DailyLessonSelection {
  lesson: SpeakBetterLesson;
  level: SpeakBetterLevel;
  /** Why this lesson, in words the card can print. */
  basis: string[];
  /** False when the preferred pool was empty and the whole curriculum was used. */
  fromPreferredBands: boolean;
}

/**
 * The publisher's choice for a date.
 *
 * The B2/C1 pool is preferred; C2 joins it on one day in five. If the curriculum
 * has no B2/C1 lesson at all (an older build, a filtered list), the function falls
 * back to whatever it was given rather than returning nothing — a card is never
 * empty because a band is missing. Recently published lessons are pushed behind
 * unseen ones, which is the publisher-side half of repetition control.
 */
export function selectDailyLesson(
  curriculum: readonly SpeakBetterLesson[],
  options: { date: string; recentLessonIds?: readonly string[]; includeC2?: boolean },
): DailyLessonSelection | null {
  if (curriculum.length === 0) return null;
  const includeC2 = options.includeC2 ?? isC2Day(options.date);
  const preferredBands = new Set<SpeakBetterLevel>(includeC2 ? DAILY_BANDS : ['B2', 'C1']);
  const recent = new Set(options.recentLessonIds ?? []);

  /*
    A C2 day is a C2 *lesson* day, not merely a day when C2 is allowed to compete:
    pooling C2 with the fifteen B2/C1 lessons would have picked C2 about a quarter
    of the time and then printed "C2 lesson day" on a B2 card. If the C2 band is
    empty (an older build, a filtered list) the day quietly becomes a B2–C1 day.
  */
  const c2Pool = includeC2 ? curriculum.filter((lesson) => bandOf(lesson) === 'C2') : [];
  const preferred = c2Pool.length > 0
    ? c2Pool
    : curriculum.filter((lesson) => preferredBands.has(bandOf(lesson)));
  const pool = preferred.length > 0 ? preferred : [...curriculum];

  const ordered = [...pool].sort((left, right) => {
    const leftFresh = recent.has(left.id) ? 1 : 0;
    const rightFresh = recent.has(right.id) ? 1 : 0;
    if (leftFresh !== rightFresh) return leftFresh - rightFresh;
    return dailyScore(options.date, left.id) - dailyScore(options.date, right.id) || left.id.localeCompare(right.id);
  });

  const lesson = ordered[0];
  const level = bandOf(lesson);
  const c2Day = includeC2 && bandOf(lesson) === 'C2';
  const basis = [
    `CEFR band ${level} (curated)`,
    c2Day ? 'C2 lesson day' : includeC2 ? 'C2 band empty, so a B2–C1 lesson' : 'B2–C1 focus',
    recent.has(lesson.id) ? 'repeated because every alternative was recent' : 'not shown in the recent window',
  ];
  return { lesson, level, basis, fromPreferredBands: preferred.length > 0 };
}

/**
 * The browser's refinement of the published lesson.
 *
 * It only steps in when the published lesson would repeat words the reader has
 * already marked as known. In that case it picks the best alternative lesson for
 * the same date whose words are not all known, preferring the highest band the
 * reader has not finished. If no better lesson exists, the published one is kept —
 * the card never swaps content for no reason.
 */
export function refineForReader(
  published: SpeakBetterLesson,
  curriculum: readonly SpeakBetterLesson[],
  progressEntries: readonly SpeakBetterProgressEntry[],
  date: string,
): { lesson: SpeakBetterLesson; replaced: boolean; reason?: string } {
  const known = knownWordsByLesson(progressEntries);
  const publishedNew = newWordCount(published, known);
  if (publishedNew > 0) return { lesson: published, replaced: false };

  const alternatives = curriculum
    .filter((lesson) => lesson.id !== published.id)
    .filter((lesson) => DAILY_BANDS.includes(bandOf(lesson)))
    .map((lesson) => ({ lesson, fresh: newWordCount(lesson, known) }))
    .filter((entry) => entry.fresh > 0)
    .sort((left, right) => {
      if (left.fresh !== right.fresh) return right.fresh - left.fresh;
      return dailyScore(date, left.lesson.id) - dailyScore(date, right.lesson.id) || left.lesson.id.localeCompare(right.lesson.id);
    });

  const replacement = alternatives[0]?.lesson;
  if (!replacement) {
    return {
      lesson: published,
      replaced: false,
      reason: 'Every word in today’s lesson is already marked known; no unseen alternative is available at this level yet.',
    };
  }
  return {
    lesson: replacement,
    replaced: true,
    reason: 'Today’s published lesson was already known, so a lesson with new words is shown instead.',
  };
}

/** A short, reader-facing description of the level, with its provenance. */
export function levelLabel(lesson: SpeakBetterLesson): string {
  const level = bandOf(lesson);
  const basis = lesson.levelBasis ?? 'curated';
  return basis === 'estimated' ? `${level} · estimated level` : `${level} · curated level`;
}
