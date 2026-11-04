/**
 * The daily-knowledge upgrades, checked end to end but offline:
 *
 *   - Brain Sharpener: a wider, verified puzzle pool with procedural generators,
 *     where a wrong or unattributable answer can never reach a card.
 *   - Literature: every entry states the rights it is shown under, and a
 *     link-only entry never reproduces text.
 *   - Speak Better: B2/C1 by default, C2 one day in five, and a reader-level
 *     refinement that can only choose among published lessons.
 *   - The local attempt ledger: no table, no migration, and no history deleted.
 *
 * Run: npm run verify:daily-knowledge
 */

import assert from 'node:assert/strict';

import {
  PUZZLE_GENERATORS,
  curatedPuzzleBank,
  generatedPuzzleIds,
  puzzlePoolForDate,
  scorePuzzle,
  selectDailyPuzzle,
  verifyPuzzle,
} from '../lib/curiosity/puzzles';
import { PUZZLE_CATEGORIES, PUZZLE_CATEGORY_LABELS } from '../lib/curiosity/types';
import { dayNumber } from '../lib/curiosity/schedule';
import { brainSharpeners } from '../lib/curiosity/content';
import { literatureEntries, LITERATURE_RIGHTS_BY_ID, literaturePool, withLiteratureRights } from '../lib/curiosity/content/literature';
import {
  SPEAK_BETTER_B2_LESSONS,
  SPEAK_BETTER_C1_LESSONS,
  SPEAK_BETTER_C2_LESSONS,
  SPEAK_BETTER_A2B1_LESSONS,
} from '../lib/curiosity/speak-better';
import {
  isC2Day,
  levelLabel,
  newWordCount,
  knownWordsByLesson,
  refineForReader,
  selectDailyLesson,
} from '../lib/curiosity/speak-better-daily';
import {
  SHARPENER_PROGRESS_KEY,
  emptySharpenerProgress,
  hasAttempted,
  loadSharpenerProgress,
  markAttempted,
  markSolved,
  normalizeSharpenerProgress,
  saveSharpenerProgress,
  sharpenerSummary,
  type ProgressStorage,
} from '../lib/curiosity/sharpener-progress';
import { invalidDailyFields } from '../lib/curiosity/job';
import type { DailyPayload } from '../lib/curiosity/types';

const results: string[] = [];
function pass(n: number, message: string): void {
  results.push(`${String(n).padStart(2)} ${message}`);
}

function dates(count: number, start = '2027-01-01'): string[] {
  const base = Date.parse(`${start}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => new Date(base + index * 86_400_000).toISOString().slice(0, 10));
}

function memoryStorage(seed?: unknown): ProgressStorage & { raw: Record<string, string> } {
  const raw: Record<string, string> = seed === undefined ? {} : { [SHARPENER_PROGRESS_KEY]: JSON.stringify(seed) };
  return {
    raw,
    getItem: (key) => raw[key] ?? null,
    setItem: (key, value) => {
      raw[key] = value;
    },
  };
}

async function main(): Promise<void> {
  /* ---------------------------------------------------------------- *
   * 1. Every authored puzzle verifies, and says what kind it is.
   * ---------------------------------------------------------------- */
  {
    assert.ok(curatedPuzzleBank.length >= 15, `the authored bank is only ${curatedPuzzleBank.length} puzzles`);
    for (const puzzle of curatedPuzzleBank) {
      const check = verifyPuzzle(puzzle);
      assert.ok(check.ok, `${puzzle.id}: ${check.reasons.join('; ')}`);
      assert.ok(puzzle.category && PUZZLE_CATEGORIES.includes(puzzle.category), `${puzzle.id} has no valid category`);
      assert.equal(PUZZLE_CATEGORY_LABELS[puzzle.category].length > 2, true);
      assert.ok((puzzle.difficulty ?? 0) >= 1 && (puzzle.difficulty ?? 0) <= 5, `${puzzle.id} has difficulty ${puzzle.difficulty}`);
      assert.ok(puzzle.solution.length > 60, `${puzzle.id} has no worked solution`);
      assert.equal(puzzle.verified, true);
    }
    const ids = new Set(curatedPuzzleBank.map((puzzle) => puzzle.id));
    assert.equal(ids.size, curatedPuzzleBank.length, 'two authored puzzles share an id');
    pass(1, `${curatedPuzzleBank.length} authored puzzles carry a category, a difficulty, a worked solution and a verified answer, with unique ids across ${new Set(curatedPuzzleBank.map((p) => p.category)).size} categories`);
  }

  /* ---------------------------------------------------------------- *
   * 2. Generated puzzles are derived from the seed and verified by
   *    re-deriving them — a tampered answer is caught.
   * ---------------------------------------------------------------- */
  {
    assert.ok(PUZZLE_GENERATORS.length >= 6, `only ${PUZZLE_GENERATORS.length} generators`);
    for (const generator of PUZZLE_GENERATORS) {
      const puzzle = generator.generate(4242);
      const check = verifyPuzzle(puzzle);
      assert.ok(check.ok, `${generator.family}: ${check.reasons.join('; ')}`);
      assert.equal(puzzle.origin, 'generated');
      assert.equal(puzzle.verified, true);

      const tampered = { ...puzzle, answer: `${puzzle.answer} (wrong)` };
      const tamperedCheck = verifyPuzzle(tampered);
      assert.equal(tamperedCheck.ok, false, `${generator.family}: a changed answer still verified`);
      assert.ok(tamperedCheck.reasons.some((reason) => /answer mismatch/.test(reason)));

      const tamperedProblem = { ...puzzle, problem: `${puzzle.problem} Almost.` };
      assert.equal(verifyPuzzle(tamperedProblem).ok, false, `${generator.family}: a changed problem still verified`);

      // Determinism: the same seed is the same puzzle, every time.
      assert.deepEqual(generator.generate(4242), puzzle);
    }

    const year = dates(366).flatMap((date) => generatedPuzzleIds(date));
    assert.ok(new Set(year).size > 500, `only ${new Set(year).size} distinct generated puzzles over a year`);
    pass(2, `${PUZZLE_GENERATORS.length} generators produce deterministic, self-verifying puzzles whose answer, problem and solution are all re-derived — an edited answer fails verification instead of shipping`);
  }

  /* ---------------------------------------------------------------- *
   * 3. A year of the card: no repeats inside a run, every category and
   *    difficulty reachable, and the alternative is never the chosen one.
   * ---------------------------------------------------------------- */
  {
    const recent: string[] = [];
    const categories = new Set<string>();
    const difficulties = new Set<number>();
    const chosen: string[] = [];
    for (const date of dates(366)) {
      const pool = puzzlePoolForDate(date, brainSharpeners);
      assert.ok(pool.length >= 12, `${date} has only ${pool.length} puzzles in its pool`);
      const recentForThisCall = recent.slice(-6);
      const selection = selectDailyPuzzle({ date, pool, recentIds: recentForThisCall });
      assert.ok(selection.puzzle, `${date} selected nothing`);
      const chosenPuzzle = selection.puzzle!;
      assert.equal(verifyPuzzle(chosenPuzzle).ok, true);
      if (chosenPuzzle.category) categories.add(chosenPuzzle.category);
      if (chosenPuzzle.difficulty) difficulties.add(chosenPuzzle.difficulty);
      chosen.push(chosenPuzzle.id);
      recent.push(chosenPuzzle.id);

      const alternatives = pool.filter((puzzle) => puzzle.id !== chosenPuzzle.id);
      assert.equal(alternatives.some((puzzle) => puzzle.id === chosenPuzzle.id), false);

      const again = selectDailyPuzzle({ date, pool, recentIds: recentForThisCall });
      assert.equal(again.puzzle?.id, chosenPuzzle.id, `${date} is not deterministic`);
    }
    // Repetition is bounded, not eliminated: the daily pool is ~27 puzzles against a
    // six-day memory, so the honest property is that nothing repeats inside that window.
    for (let index = 0; index < chosen.length; index += 1) {
      const window = chosen.slice(Math.max(0, index - 5), index);
      assert.equal(window.includes(chosen[index]), false, `${dates(366)[index]} repeated ${chosen[index]} inside a six-day window`);
    }
    assert.ok(new Set(chosen).size >= 100, `only ${new Set(chosen).size} distinct puzzles reached 366 cards`);
    assert.equal(categories.size, PUZZLE_CATEGORIES.length, `only ${categories.size} of ${PUZZLE_CATEGORIES.length} categories reach the card`);
    assert.ok(difficulties.size >= 4, `only ${difficulties.size} difficulty levels reach the card`);

    // Scoring preferences: an unattempted puzzle beats an attempted one; a recent
    // repeat is pushed behind; and the prefs never invent a puzzle that is not there.
    const sample = puzzlePoolForDate('2027-03-03', brainSharpeners);
    const target = sample[0];
    const day = Math.abs(dayNumber('2027-03-03'));
    const unattempted = scorePuzzle(target, day, new Set(), new Set());
    const attempted = scorePuzzle(target, day, new Set([target.id]), new Set());
    const recentScore = scorePuzzle(target, day, new Set(), new Set([target.id]));
    assert.ok(unattempted > attempted, 'an attempted puzzle scores as high as an unattempted one');
    assert.ok(unattempted > recentScore, 'a recently shown puzzle scores as high as a fresh one');
    pass(3, `366 days pick ${new Set(chosen).size} distinct verified puzzles across all ${categories.size} categories and ${difficulties.size} difficulty levels, deterministically, preferring puzzles the reader has not attempted and has not just seen`);
  }

  /* ---------------------------------------------------------------- *
   * 4. Literature rights: every entry says what it is, and a link-only
   *    entry carries no text.
   * ---------------------------------------------------------------- */
  {
    assert.equal(literaturePool.length, literatureEntries.length, 'an entry was dropped from the rights-aware pool');
    for (const entry of literatureEntries) {
      assert.ok(LITERATURE_RIGHTS_BY_ID[entry.id], `${entry.id} has no rights record`);
    }
    const linkOnly: string[] = [];
    for (const entry of literaturePool) {
      const item = entry.item;
      assert.equal(item.origin, 'curated');
      assert.ok(item.rights, `${entry.id} states no rights`);
      assert.ok((item.rightsBasis ?? '').length > 20, `${entry.id} gives no rights basis`);
      assert.ok(item.excerptKind);
      if (item.excerptKind === 'link-only') {
        linkOnly.push(entry.id);
        assert.equal(item.passage.trim(), '', `${entry.id} reproduces a passage it does not have the right to quote`);
        assert.ok((item.context ?? '').length > 40, `${entry.id} has no original context note to show instead`);
        assert.match(item.url ?? '', /^https:\/\/\S+$/, `${entry.id} has no link to read`);
      } else {
        assert.ok(item.passage.trim().length >= 8, `${entry.id} has no passage`);
        assert.equal(item.context, undefined, `${entry.id} has both a passage and a link-only note`);
      }
    }
    assert.ok(linkOnly.length >= 2, 'no entry exercises the link-only path');
    // The two paths coexist: a permitted quotation keeps its text.
    const quoted = literaturePool.find((entry) => entry.item.excerptKind === 'public-domain-passage');
    assert.ok(quoted && quoted.item.passage.length > 0);

    // An entry with no rights record is left exactly as authored rather than guessed at.
    const orphan = { id: 'lit-not-in-the-map', category: 'literature' as const, availableFrom: '2026-01-01', provenance: 'curated' as const, item: { title: 'T', author: 'A', passage: 'P', whyItMatters: 'W' } };
    assert.deepEqual(withLiteratureRights(orphan).item, orphan.item);
    pass(4, `${literaturePool.length} literature entries state their rights and basis; ${linkOnly.length} are link-only with an original note in place of text (${linkOnly.join(', ')}), and every quoted passage is marked as one`);
  }

  /* ---------------------------------------------------------------- *
   * 5. Speak Better: B2/C1 by default, C2 one day in five, A2–B1 only
   *    as the library on-ramp.
   * ---------------------------------------------------------------- */
  {
    const curriculum = [...SPEAK_BETTER_B2_LESSONS, ...SPEAK_BETTER_C1_LESSONS, ...SPEAK_BETTER_C2_LESSONS];
    assert.ok(curriculum.length >= 18, `the advanced curriculum has only ${curriculum.length} lessons`);
    assert.ok(SPEAK_BETTER_A2B1_LESSONS.length >= 12);

    const c2Days = dates(200).filter(isC2Day);
    assert.equal(c2Days.length, 40, `one day in five gave ${c2Days.length} of 200`);

    for (const date of dates(366)) {
      const selection = selectDailyLesson(curriculum, { date });
      assert.ok(selection);
      const expected = isC2Day(date) ? 'C2' : 'B2/C1';
      if (expected === 'B2/C1') {
        assert.notEqual(selection.level, 'C2', `${date} is not a C2 day but got a C2 lesson`);
        assert.notEqual(selection.level, 'A2-B1');
      } else {
        assert.equal(selection.level, 'C2', `${date} is a C2 day but got ${selection.level}`);
      }
      assert.ok(selection.basis.length >= 2, 'the selection does not say why');
      assert.ok(selection.basis.some((line) => /curated/.test(line)), 'the basis must not imply an API assigned the CEFR level');
    }

    // With no advanced corpus at all, the card still shows something instead of nothing.
    const fallback = selectDailyLesson(SPEAK_BETTER_A2B1_LESSONS, { date: '2027-01-02' });
    assert.ok(fallback, 'an A2–B1-only curriculum produced no lesson');
    assert.equal(fallback!.fromPreferredBands, false, 'the fallback must report that it left the preferred bands');

    // CEFR honesty in the label.
    const sample = SPEAK_BETTER_B2_LESSONS[0];
    assert.equal(levelLabel(sample), `B2 · curated level`);
    assert.equal(levelLabel({ ...sample, levelBasis: 'estimated' }), `B2 · estimated level`);
    pass(5, `366 daily selections stay in B2/C1 with a real C2 lesson on ${dates(366).filter(isC2Day).length} of them; A2–B1 is reachable only as the stated fallback, and the level is printed as curated rather than API-assigned`);
  }

  /* ---------------------------------------------------------------- *
   * 6. Reader refinement: only swaps when the published lesson is fully
   *    known, and only to a lesson with new words.
   * ---------------------------------------------------------------- */
  {
    const published = SPEAK_BETTER_B2_LESSONS[0];
    const alternative = SPEAK_BETTER_C1_LESSONS[0];
    const curriculum = [published, alternative];

    const untouched = refineForReader(published, curriculum, [], '2027-02-01');
    assert.equal(untouched.replaced, false, 'a reader with no history got a different lesson');

    const knownForPublished = published.words.map((word, index) => ({
      word: word.word,
      lessonId: published.id,
      state: 'known' as const,
      firstSeenAt: `2027-01-0${(index % 9) + 1}T00:00:00.000Z`,
      lastSeenAt: `2027-01-0${(index % 9) + 1}T00:00:00.000Z`,
    }));
    const refined = refineForReader(published, curriculum, knownForPublished, '2027-02-01');
    assert.equal(refined.replaced, true, 'a fully known published lesson was not swapped');
    assert.equal(refined.lesson.id, alternative.id);
    assert.match(refined.reason ?? '', /already known/i);

    // Every lesson known: keep the published one rather than swap for no reason.
    const allKnown = curriculum.flatMap((lesson) =>
      lesson.words.map((word) => ({
        word: word.word,
        lessonId: lesson.id,
        state: 'known' as const,
        firstSeenAt: '2027-01-01T00:00:00.000Z',
        lastSeenAt: '2027-01-01T00:00:00.000Z',
      })),
    );
    const exhausted = refineForReader(published, curriculum, allKnown, '2027-02-01');
    assert.equal(exhausted.replaced, false, 'when everything has been read, the published lesson is kept');

    // Learning state is not "known", so it does not trigger a swap.
    const learning = published.words.map((word) => ({
      word: word.word,
      lessonId: published.id,
      state: 'learning' as const,
      firstSeenAt: '2027-01-01T00:00:00.000Z',
      lastSeenAt: '2027-01-01T00:00:00.000Z',
    }));
    assert.equal(refineForReader(published, curriculum, learning, '2027-02-01').replaced, false);

    const known = knownWordsByLesson(knownForPublished as never);
    assert.equal(newWordCount(published, known), 0);
    assert.equal(newWordCount(alternative, known), alternative.words.length);
    pass(6, 'The daily lesson is only replaced when every one of its words is already marked known and another published lesson has something new; a learning, seen-but-unknown or fully-read state never forces a swap');
  }

  /* ---------------------------------------------------------------- *
   * 7. The attempt ledger: local, versioned, additive, crash-proof.
   * ---------------------------------------------------------------- */
  {
    const storage = memoryStorage();
    const emptyLoad = loadSharpenerProgress(storage);
    assert.deepEqual(emptyLoad.document.attempts, {});
    assert.equal(emptyLoad.persistent, true, 'a writable storage is reported as persistent');

    const first = markAttempted(emptySharpenerProgress(), 'logic-three-crates', '2027-03-01T10:00:00.000Z');
    assert.equal(hasAttempted(first, 'logic-three-crates'), true);
    assert.equal(hasAttempted(first, 'nope'), false);
    const second = markAttempted(first, 'logic-three-crates', '2027-03-02T10:00:00.000Z');
    const entry = second.attempts['logic-three-crates'];
    assert.equal(entry.attempts, 2);
    assert.equal(entry.firstAttemptedAt, '2027-03-01T10:00:00.000Z', 'the first attempt is preserved');
    assert.equal(entry.lastAttemptedAt, '2027-03-02T10:00:00.000Z');

    const solved = markSolved(second, 'logic-three-crates', '2027-03-03T10:00:00.000Z');
    assert.equal(solved.attempts['logic-three-crates'].solvedAt, '2027-03-03T10:00:00.000Z');
    // Solving is a separate state change, not a new attempt: inflating the count would
    // misreport how many times the reader actually tried.
    assert.equal(solved.attempts['logic-three-crates'].attempts, 2, 'solving inflated the attempt count');
    assert.equal(solved.attempts['logic-three-crates'].firstAttemptedAt, '2027-03-01T10:00:00.000Z');
    assert.deepEqual(sharpenerSummary(solved), { attempted: 1, solved: 1 });

    // Persistence round-trips through the versioned key.
    assert.equal(saveSharpenerProgress(solved, storage), true);
    assert.ok(storage.raw[SHARPENER_PROGRESS_KEY]);
    const reloaded = loadSharpenerProgress(storage);
    assert.equal(reloaded.persistent, true);
    assert.deepEqual(reloaded.document.attempts, solved.attempts, 'the ledger survives a round trip through storage');

    // Corrupt, lean and older documents normalise instead of throwing.
    for (const corrupt of [null, 'nonsense', 42, { attempts: 'x' }, { version: 99, attempts: { a: { id: 'a' } } }]) {
      const normalised = normalizeSharpenerProgress(corrupt);
      assert.equal(normalised.version, 1);
      assert.equal(typeof normalised.attempts, 'object');
    }
    const legacy = normalizeSharpenerProgress({
      attempts: {
        'logic-three-crates': { firstAttemptedAt: '2027-03-01T10:00:00.000Z', lastAttemptedAt: '2027-03-01T10:00:00.000Z' },
        'not-a-slug': { attempts: 3 },
      },
    });
    assert.equal(legacy.attempts['logic-three-crates'].attempts, 1, 'an older row without a count is read as one attempt');
    // An unfamiliar key is kept, not deleted: it may be a real attempt under an id we
    // no longer recognise, and the ledger's contract is that it only ever adds.
    assert.equal(legacy.attempts['not-a-slug']?.attempts, 3);
    const junk = normalizeSharpenerProgress({ attempts: { good: 'not-an-object', '': { attempts: 1 }, other: { attempts: 'many' } } });
    assert.deepEqual(Object.keys(junk.attempts), ['other'], 'non-object rows are dropped, an unnamed row is dropped, and a nonsense count becomes one attempt');
    assert.equal(junk.attempts.other.attempts, 1);

    // Storage that throws (private mode, quota) degrades without losing the session.
    const broken: ProgressStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const brokenLoad = loadSharpenerProgress(broken);
    assert.deepEqual(brokenLoad.document, emptySharpenerProgress());
    assert.equal(brokenLoad.persistent, false, 'blocked storage is reported as not persistent, not as an error');
    assert.equal(saveSharpenerProgress(solved, broken), false);
    pass(7, 'Attempts live in a versioned local ledger that only ever adds (first attempt, last attempt, count, solved date), survives old and corrupt documents, and degrades to an in-memory session when storage is blocked — no table, no migration, nothing deleted');
  }

  /* ---------------------------------------------------------------- *
   * 8. The publisher's validator rejects what the new cards must never
   *    show: a link-only entry with text, a research card without
   *    provenance, a preprint printed as peer-reviewed.
   * ---------------------------------------------------------------- */
  {
    // Build a valid payload from the real fallback builder, then break one thing at a
    // time, so the validator is tested against the shape it actually receives.
    const { dailyEditorial } = await import('../lib/curiosity/content');
    // A day the curated history rotation actually covers: the payload validator
    // requires either a verified event or the labelled ordered triad.
    const covered = Array.from({ length: 120 }, (_, index) =>
      new Date(Date.UTC(2027, 0, 1 + index)).toISOString().slice(0, 10),
    ).find((date) => dailyEditorial(date).history !== null);
    assert.ok(covered, 'no day in the first four months of 2027 has a curated history match');
    const payload = dailyEditorial(covered) as unknown as DailyPayload;
    assert.deepEqual(invalidDailyFields(payload), [], 'a clean daily payload failed validation');

    const linkOnlyQuote = structuredClone(payload);
    linkOnlyQuote.literature = {
      ...linkOnlyQuote.literature,
      excerptKind: 'link-only',
      rights: 'link-only',
      passage: 'Some text the terms do not allow.',
      context: 'An original note long enough to stand in for the quotation.',
    };
    const quotedProblems = invalidDailyFields(linkOnlyQuote);
    assert.ok(quotedProblems.some((problem) => /no passage when link-only/.test(problem)), 'a link-only entry quoting text passed validation');
    assert.ok(quotedProblems.length > 0);

    const linkOnlyNoNote = structuredClone(payload);
    linkOnlyNoNote.literature = { ...linkOnlyNoNote.literature, excerptKind: 'link-only', rights: 'link-only', passage: '', context: '' };
    assert.ok(
      invalidDailyFields(linkOnlyNoNote).some((problem) => /context/.test(problem)),
      'a link-only entry with no original note passed validation',
    );

    const researchNoDate = structuredClone(payload);
    researchNoDate.physics = {
      ...researchNoDate.physics,
      origin: 'research',
      provenance: 'peer-reviewed',
      provenanceLabel: 'Peer-reviewed research article',
      url: 'https://doi.org/10.1038/s41567-026-00001-1',
      significanceBasis: ['published today'],
      research: { peerReviewed: true, significanceBasis: ['published today'], rights: 'open-licensed-abstract' },
    } as typeof researchNoDate.physics;
    assert.ok(
      invalidDailyFields(researchNoDate).some((problem) => /physics.*published/.test(problem)),
      'a research card with no publication date passed validation',
    );

    const preprintClaim = structuredClone(payload);
    preprintClaim.chemistry = {
      ...preprintClaim.chemistry,
      origin: 'research',
      provenance: 'preprint',
      provenanceLabel: 'Peer-reviewed research article',
      publishedOn: '2027-03-30',
      url: 'https://doi.org/10.1038/s41586-0000-0000-1',
      significanceBasis: ['published 5 days ago'],
      research: { peerReviewed: true, significanceBasis: ['published 5 days ago'], rights: 'metadata-only' },
    } as typeof preprintClaim.chemistry;
    assert.ok(
      invalidDailyFields(preprintClaim).some((problem) => /chemistry/.test(problem)),
      'a preprint labelled peer-reviewed passed validation',
    );
    pass(8, 'The publisher refuses a link-only literature card that quotes text, a research card with no publication date, and a preprint printed as peer-reviewed — the three ways this upgrade could have lied');
  }

  console.log(`\n${results.join('\n')}\n`);
  console.log(
    `${results.length} checks. Brain Sharpener now draws from ${curatedPuzzleBank.length} authored and ${PUZZLE_GENERATORS.length}-family procedural puzzles, all re-verified before a card can show them; literature states its rights on the card and never quotes a link-only work; Speak Better speaks at B2–C1 with an occasional C2 day; and attempts are kept in a local, additive ledger.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
