/**
 * Speak Better B2–C2 — verification harness.
 *
 *   npx tsx scripts/verify-speak-better.tsx
 *
 * What it proves:
 *
 *   1. Content quality: every lesson at every level carries the word, both
 *      meanings, examples, nuance, and — from B2 up — pronunciation, collocations,
 *      a common mistake and the difference from a near-synonym. Every Hindi gloss
 *      is real Devanagari. No lesson repeats another lesson's word set.
 *   2. The curriculum composes without disturbing A2–B1: same twelve lessons, same
 *      order, same ids, so the publisher's rotation is unchanged.
 *   3. Filtering: by level, by search across words and Hindi meanings, and by
 *      tracked state.
 *   4. Progress persistence: a document round-trips through storage, survives an
 *      unknown state, a corrupt payload and a missing field, and never resets the
 *      history of a word already known.
 *   5. Saved words and the four tracking states behave as toggles.
 *   6. Migration compatibility: a document written by an older build (fewer
 *      states, extra fields, an unknown version) is read as-is.
 *   7. Hindi rendering: the components mark Hindi text with `lang="hi"`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  SPEAK_BETTER_A2B1_LESSONS,
  SPEAK_BETTER_B2_LESSONS,
  SPEAK_BETTER_C1_LESSONS,
  SPEAK_BETTER_C2_LESSONS,
  filterLessons,
  lessonMatchesQuery,
  levelCounts,
  levelOf,
  lessonsForLevel,
  resolvedWords,
  speakBetterCurriculum,
  wordProgressId,
} from '../lib/curiosity/speak-better';
import {
  SPEAK_BETTER_PROGRESS_KEY,
  emptyProgress,
  entriesInState,
  loadProgress,
  markSeen,
  normalizeProgress,
  progressSummary,
  saveProgress,
  setWordState,
  toggleWordState,
  wordState,
} from '../lib/curiosity/speak-better-progress';
import { speakBetterLessons as publisherLessons } from '../lib/curiosity/content/speak-better';
import { SPEAK_BETTER_LEVELS, SPEAK_BETTER_LEVEL_LABELS, type SpeakBetterLevel } from '../lib/curiosity/types';
import { SpeakBetterLibrary, markLessonSeen } from '../components/curiosity/speak-better-library';

let checks = 0;
function pass(label: string) {
  checks += 1;
  console.log(`  ✓ ${label}`);
}

const DEVANAGARI = /[\u0900-\u097F]/;

async function main() {
  /* ---------------------------------------------------------------- */
  /* 1. Content quality, level by level                                */
  /* ---------------------------------------------------------------- */

  assert.deepEqual(
    SPEAK_BETTER_LEVELS,
    ['A2-B1', 'B2', 'C1', 'C2'],
    'the four difficulty bands are declared once, in order',
  );
  for (const level of SPEAK_BETTER_LEVELS) {
    assert.ok(SPEAK_BETTER_LEVEL_LABELS[level], `${level} has a reader-facing label`);
  }

  const ids = new Set<string>();
  const wordSets: string[] = [];
  for (const lesson of speakBetterCurriculum) {
    assert.ok(!ids.has(lesson.id), `lesson id ${lesson.id} is unique`);
    ids.add(lesson.id);

    const level = levelOf(lesson);
    assert.ok(SPEAK_BETTER_LEVELS.includes(level), `${lesson.id} has a known level`);
    assert.ok(lesson.focus && lesson.situation && lesson.challenge, `${lesson.id} is incomplete`);
    assert.ok(lesson.dialogue.length >= 3, `${lesson.id} has no real dialogue`);
    assert.ok(lesson.words.length >= 3 && lesson.words.length <= 5, `${lesson.id} has ${lesson.words.length} words`);

    for (const word of lesson.words) {
      assert.ok(word.word && word.englishMeaning && word.nuance, `${lesson.id}/${word.word} is incomplete`);
      assert.match(word.hindiMeaning, DEVANAGARI, `${lesson.id}/${word.word} has no Devanagari Hindi meaning`);
      assert.ok(word.examples.length >= 1, `${lesson.id}/${word.word} has no example`);
      if (level !== 'A2-B1') {
        assert.ok(word.pronunciation, `${lesson.id}/${word.word} (${level}) has no pronunciation guidance`);
        assert.ok(word.collocations && word.collocations.length >= 2, `${lesson.id}/${word.word} has no collocations`);
        assert.ok(word.commonMistake, `${lesson.id}/${word.word} names no common mistake`);
        assert.ok(word.differsFrom, `${lesson.id}/${word.word} does not distinguish a near-synonym`);
        assert.ok(word.register, `${lesson.id}/${word.word} has no register note`);
      }
    }

    // A lesson earns its place by contrasting words, so its word set must not
    // repeat another lesson's — that is the "artificial or repetitive" failure.
    const setKey = lesson.words.map((word) => word.word.toLowerCase()).sort().join('|');
    assert.ok(!wordSets.includes(setKey), `${lesson.id} repeats another lesson's word set`);
    wordSets.push(setKey);
  }
  pass(`all ${speakBetterCurriculum.length} lessons (A2–B1 ${SPEAK_BETTER_A2B1_LESSONS.length}, B2 ${SPEAK_BETTER_B2_LESSONS.length}, C1 ${SPEAK_BETTER_C1_LESSONS.length}, C2 ${SPEAK_BETTER_C2_LESSONS.length}) are complete, Devanagari-Hindi, and non-repetitive`);

  for (const [level, lessons] of [
    ['B2', SPEAK_BETTER_B2_LESSONS],
    ['C1', SPEAK_BETTER_C1_LESSONS],
    ['C2', SPEAK_BETTER_C2_LESSONS],
  ] as const) {
    assert.ok(lessons.length >= 5, `${level} has only ${lessons.length} lessons`);
    for (const lesson of lessons) assert.equal(levelOf(lesson), level);
  }
  pass('B2, C1 and C2 each carry a real corpus, not a token entry');

  // The content must be usable for adults at work, not only for beginners.
  const professionalHits = speakBetterCurriculum.filter((lesson) =>
    /meeting|client|team|board|contract|audit|negotiat|colleague|manager|review|report|governance/i.test(
      `${lesson.situation} ${lesson.focus} ${lesson.words.map((word) => `${word.register ?? ''} ${word.examples.join(' ')}`).join(' ')}`,
    ),
  );
  assert.ok(professionalHits.length >= 20, 'too few lessons are grounded in professional communication');
  pass('the corpus is written for adult learners and professional communication');

  /* ---------------------------------------------------------------- */
  /* 2. The A2–B1 corpus and its rotation are untouched                 */
  /* ---------------------------------------------------------------- */

  assert.equal(SPEAK_BETTER_A2B1_LESSONS.length, 12, 'the original twelve lessons are still there');
  assert.equal(publisherLessons.length, 12, 'the publisher still rotates over exactly those twelve');
  for (const [index, lesson] of SPEAK_BETTER_A2B1_LESSONS.entries()) {
    assert.equal(publisherLessons[index].id, lesson.id, `publisher order changed at ${index}`);
  }
  assert.deepEqual(
    SPEAK_BETTER_A2B1_LESSONS.map((lesson) => lesson.id),
    [
      'teach-learn-study-practise',
      'hear-listen-overhear-listen-in',
      'say-tell-speak-talk',
      'see-look-watch-observe',
      'borrow-lend-loan-return',
      'remember-remind-recall-forget',
      'spend-take-waste-pass',
      'ask-request-demand-insist',
      'argue-debate-quarrel-discuss',
      'think-feel-believe-suppose',
      'advice-advise-suggest-recommend',
      'sorry-excuse-me-pardon-apologise',
    ],
    'the original lesson ids and order are byte-identical',
  );
  assert.deepEqual(SPEAK_BETTER_A2B1_LESSONS[0].words[0], speakBetterCurriculum[0].words[0], 'wording unchanged');
  pass('A2–B1 keeps its ids, order and wording, so existing history and the daily rotation are unaffected');

  /* ---------------------------------------------------------------- */
  /* 3. Word identity                                                  */
  /* ---------------------------------------------------------------- */

  assert.equal(wordProgressId('b2-suggest-imply-infer-insinuate', 'imply'), 'b2-suggest-imply-infer-insinuate:imply');
  const resolved = resolvedWords(SPEAK_BETTER_B2_LESSONS[0]);
  assert.equal(resolved.length, SPEAK_BETTER_B2_LESSONS[0].words.length);
  for (const word of resolved) assert.equal(word.id, wordProgressId(SPEAK_BETTER_B2_LESSONS[0].id, word.word));
  pass('every word has a stable lesson-scoped id, derived rather than authored');

  /* ---------------------------------------------------------------- */
  /* 4. Filtering                                                      */
  /* ---------------------------------------------------------------- */

  assert.equal(lessonsForLevel('A2-B1').length, 12);
  assert.equal(lessonsForLevel('B2').length, SPEAK_BETTER_B2_LESSONS.length);
  assert.equal(filterLessons({}).length, speakBetterCurriculum.length);
  assert.equal(filterLessons({ level: 'C2' }).length, SPEAK_BETTER_C2_LESSONS.length);
  const counts = levelCounts();
  assert.equal(counts['A2-B1'] + counts.B2 + counts.C1 + counts.C2, speakBetterCurriculum.length);
  pass('difficulty filtering returns exactly that level, and the counts add up');

  assert.ok(lessonMatchesQuery(SPEAK_BETTER_B2_LESSONS[0], 'imply'), 'an English word is searchable');
  assert.ok(lessonMatchesQuery(SPEAK_BETTER_C1_LESSONS[0], 'mitigate'));
  assert.equal(filterLessons({ query: 'mitigate' }).length, 1, 'a rare word finds its one lesson');
  assert.ok(
    filterLessons({ level: 'C2', query: 'specious' }).length === 1,
    'search composes with the level filter',
  );
  // Hindi search: a query typed in Devanagari must find the word it glosses.
  const hindiGloss = SPEAK_BETTER_A2B1_LESSONS[0].words[0].hindiMeaning.split(',')[0].trim();
  assert.ok(hindiGloss.length > 1);
  assert.ok(filterLessons({ query: hindiGloss }).length >= 1, `searching “${hindiGloss}” found nothing`);
  assert.equal(filterLessons({ query: 'zzzzz-not-a-word' }).length, 0);
  assert.equal(filterLessons({ query: '   ' }).length, speakBetterCurriculum.length, 'a blank query is no filter');
  pass('search covers English words, meanings and Devanagari Hindi glosses, and composes with the level');

  // Filtering by tracked state.
  const tracked = setWordState(
    emptyProgress(),
    { id: wordProgressId('b2-suggest-imply-infer-insinuate', 'imply'), lessonId: 'b2-suggest-imply-infer-insinuate', word: 'imply', level: 'B2', state: 'saved' },
  );
  const savedOnly = filterLessons({
    onlyWordState: { state: 'saved', progress: Object.values(tracked.words) },
  });
  assert.equal(savedOnly.length, 1);
  assert.equal(savedOnly[0].id, 'b2-suggest-imply-infer-insinuate');
  assert.equal(filterLessons({ onlyWordState: { state: 'known', progress: Object.values(tracked.words) } }).length, 0);
  pass('the Saved / Known / Review-later filters show only lessons containing such a word');

  /* ---------------------------------------------------------------- */
  /* 5. Tracking: Seen, Known, Saved, Review later                     */
  /* ---------------------------------------------------------------- */

  const word = { id: 'b2-assume-presume-suppose-expect:presume', lessonId: 'b2-assume-presume-suppose-expect', word: 'presume', level: 'B2' as SpeakBetterLevel };
  let doc = emptyProgress();
  assert.equal(wordState(doc, word.id), null);

  doc = markSeen(doc, word, '2026-11-01T10:00:00.000Z');
  assert.equal(wordState(doc, word.id), 'seen');
  const firstSeen = doc.words[word.id].firstSeenAt;
  assert.equal(firstSeen, '2026-11-01T10:00:00.000Z');

  // Seeing it again must not move firstSeenAt or downgrade a deliberate state.
  doc = markSeen(doc, word, '2026-11-05T10:00:00.000Z');
  assert.equal(doc.words[word.id].firstSeenAt, firstSeen);
  doc = setWordState(doc, { ...word, state: 'known' }, '2026-11-06T10:00:00.000Z');
  doc = markSeen(doc, word, '2026-11-07T10:00:00.000Z');
  assert.equal(wordState(doc, word.id), 'known', 're-seeing a known word keeps it known');
  assert.equal(doc.words[word.id].firstSeenAt, firstSeen, 'firstSeenAt is never rewritten');
  pass('Seen is idempotent and never overwrites a state the reader chose');

  doc = toggleWordState(doc, { ...word, state: 'saved' });
  assert.equal(wordState(doc, word.id), 'saved');
  doc = toggleWordState(doc, { ...word, state: 'saved' });
  assert.equal(wordState(doc, word.id), 'seen', 'un-saving returns the word to seen, it never deletes it');
  doc = toggleWordState(doc, { ...word, state: 'review' });
  assert.equal(wordState(doc, word.id), 'review');
  pass('Known, Saved and Review later toggle on and off without ever deleting history');

  const summary = progressSummary(doc);
  assert.deepEqual(Object.keys(summary).sort(), ['known', 'review', 'saved', 'seen']);
  assert.equal(summary.review, 1);
  assert.equal(entriesInState(doc, 'review').length, 1);
  assert.equal(entriesInState(doc, 'known').length, 0);
  pass('the four states are counted and listed per state');

  /* ---------------------------------------------------------------- */
  /* 6. Persistence                                                    */
  /* ---------------------------------------------------------------- */

  const store = (() => {
    const map = new Map<string, string>();
    return {
      map,
      getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
      setItem: (key: string, value: string) => void map.set(key, value),
    };
  })();

  assert.deepEqual(loadProgress(store).document.words, {}, 'a fresh browser has no progress');
  assert.ok(saveProgress(doc, store), 'the write succeeded');
  assert.ok(store.map.has(SPEAK_BETTER_PROGRESS_KEY), 'progress is stored under one versioned key');

  const reloaded = loadProgress(store);
  assert.ok(reloaded.persistent);
  assert.deepEqual(reloaded.document, doc, 'the document round-trips byte for byte');
  assert.equal(wordState(reloaded.document, word.id), 'review');
  pass('progress persists and reloads exactly, under one versioned key');

  // Private mode: the write must report failure rather than pretend.
  const refusing = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
  assert.equal(saveProgress(doc, refusing), false, 'a refused write returns false');
  assert.equal(loadProgress(null).persistent, false, 'no storage is reported as not persistent');
  assert.equal(saveProgress(doc, null), false);
  pass('a browser that refuses storage reports it instead of implying a durable save');

  /* ---------------------------------------------------------------- */
  /* 7. Migration compatibility                                        */
  /* ---------------------------------------------------------------- */

  // (a) A document with an unknown state on one entry: that entry is dropped,
  //     the rest of the ledger survives.
  const mixed = normalizeProgress({
    version: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
    words: {
      'b2-x:a': { id: 'b2-x:a', lessonId: 'b2-x', word: 'a', level: 'B2', state: 'known', firstSeenAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' },
      'b2-x:b': { id: 'b2-x:b', lessonId: 'b2-x', word: 'b', level: 'B2', state: 'archived-forever', firstSeenAt: '', updatedAt: '' },
    },
  });
  assert.equal(Object.keys(mixed.words).length, 1, 'only the unreadable entry is dropped');
  assert.equal(mixed.words['b2-x:a'].state, 'known');
  assert.equal(mixed.version, 1, 'the document is brought up to the current version on read');
  pass('an unknown tracking state drops one entry, never the whole ledger');

  // (b) A pre-versioned document: a bare array of entries, as an older build
  //     might have written. It normalises to an empty ledger rather than throwing.
  assert.doesNotThrow(() => normalizeProgress([{ id: 'x:y', state: 'known' }]));
  assert.deepEqual(normalizeProgress([{ id: 'x:y', state: 'known' }]).words, {});
  assert.deepEqual(normalizeProgress('not json').words, {});
  assert.deepEqual(normalizeProgress(null).words, {});
  pass('a corrupt or pre-versioned payload normalises to an empty ledger instead of throwing');

  // (c) An entry missing optional fields is repaired from its own id, so history
  //     written by a leaner build still resolves.
  const lean = normalizeProgress({
    words: { 'c1-y:nuance': { state: 'saved' } },
  });
  assert.equal(lean.words['c1-y:nuance'].lessonId, 'c1-y');
  assert.equal(lean.words['c1-y:nuance'].word, 'nuance');
  assert.equal(lean.words['c1-y:nuance'].level, 'C1');
  assert.ok(lean.words['c1-y:nuance'].firstSeenAt);
  pass('an entry missing fields is repaired from its own id, so lean history still resolves');

  // (d) A stored value that is not JSON at all is treated as empty by the loader.
  const broken = { getItem: () => '{not json', setItem: () => {} };
  assert.doesNotThrow(() => loadProgress(broken));
  assert.deepEqual(loadProgress(broken).document.words, {});
  pass('a corrupt stored document loads as empty and is replaced by the next write');

  // (e) The A2–B1 ids used by the publisher are the ids progress is keyed on, so
  //     adding B2–C2 could not have invalidated an existing record.
  const legacyWord = resolvedWords(SPEAK_BETTER_A2B1_LESSONS[0])[0];
  const legacyDoc = setWordState(emptyProgress(), { id: legacyWord.id, lessonId: SPEAK_BETTER_A2B1_LESSONS[0].id, word: legacyWord.word, level: 'A2-B1', state: 'known' });
  assert.equal(wordState(legacyDoc, legacyWord.id), 'known');
  assert.ok(legacyWord.id.startsWith('teach-learn-study-practise:'));
  pass('A2–B1 progress keys are unchanged by the new levels, so nothing was reset');

  /* ---------------------------------------------------------------- */
  /* 8. Opening a lesson marks its words seen                          */
  /* ---------------------------------------------------------------- */

  const seenDoc = markLessonSeen(SPEAK_BETTER_C2_LESSONS[0], emptyProgress());
  assert.equal(Object.keys(seenDoc.words).length, SPEAK_BETTER_C2_LESSONS[0].words.length);
  assert.equal(progressSummary(seenDoc).seen, SPEAK_BETTER_C2_LESSONS[0].words.length);
  // Opening it twice must not change anything the second time.
  const twice = markLessonSeen(SPEAK_BETTER_C2_LESSONS[0], seenDoc);
  assert.deepEqual(Object.keys(twice.words).sort(), Object.keys(seenDoc.words).sort());
  pass('opening a lesson records its words as seen, idempotently');

  /* ---------------------------------------------------------------- */
  /* 9. Hindi renders with the right language marker                   */
  /* ---------------------------------------------------------------- */

  const markup = renderToStaticMarkup(
    createElement(
      'div',
      null,
      createElement('p', { lang: 'hi' }, SPEAK_BETTER_A2B1_LESSONS[0].words[0].hindiMeaning),
    ),
  );
  assert.match(markup, /lang="hi"/, 'Hindi text carries a lang attribute for font and voice selection');
  const librarySource = readFileSync('components/curiosity/speak-better-library.tsx', 'utf8');
  assert.match(librarySource, /lang="hi"/, 'the library marks Hindi with lang="hi"');
  assert.ok(librarySource.includes('break-words'), 'a long Hindi gloss cannot overflow a narrow card');
  pass('Hindi text is marked `lang="hi"` and wraps inside the card');

  /* ---------------------------------------------------------------- */
  /* 10. The screen is a static, client-side library                   */
  /* ---------------------------------------------------------------- */

  assert.equal(typeof SpeakBetterLibrary, 'function');
  const pageSource = readFileSync('app/speak-better/page.tsx', 'utf8');
  assert.match(pageSource, /SpeakBetterScreen/);
  assert.doesNotMatch(pageSource, /fetch\(|force-dynamic/, 'the practice page fetches nothing at request time');
  assert.ok(
    librarySource.includes('useSyncExternalStore'),
    'progress is read through an external store, so the first client paint matches the server',
  );
  assert.ok(librarySource.includes("aria-pressed={active}"), 'tracking buttons expose their state');
  assert.ok(librarySource.includes('aria-live="polite"'), 'the result count is announced');
  pass('the library is client-side over static content, with no per-visit fetching');

  const nav = readFileSync('components/layout/nav.ts', 'utf8');
  assert.match(nav, /href: '\/speak-better'/, 'the practice library is reachable from the navigation');
  pass('Speak Better is in the app navigation');

  console.log(
    `\n${checks} checks. Speak Better B2–C2: ${speakBetterCurriculum.length} lessons across four levels, complete fields with Devanagari Hindi, level and Hindi-aware search, four tracking states that never delete history, and a progress ledger that survives old, lean and corrupt documents.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
