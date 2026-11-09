import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createClient } from '@supabase/supabase-js';
import { SupabaseRepository } from '../lib/store/supabase-repository';
import { LocalRepository } from '../lib/store/local-repository';
import { defaultSettings } from '../lib/store/defaults';
import { getDailyQuote } from '../lib/quotes';
import { dailyEditorial } from '../lib/curiosity/content';
import { mythCharacters } from '../lib/curiosity/content/mythology';
import { chemistryConcepts } from '../lib/curiosity/content/chemistry';
import { physicsConcepts } from '../lib/curiosity/content/physics';
import { biologyConcepts } from '../lib/curiosity/content/biology';
import { speakBetterLessons } from '../lib/curiosity/content/speak-better';
import {
  SPEAK_BETTER_B2_LESSONS,
  SPEAK_BETTER_C1_LESSONS,
  SPEAK_BETTER_C2_LESSONS,
} from '../lib/curiosity/speak-better';
import { verifyPuzzle, puzzlePoolForDate } from '../lib/curiosity/puzzles';
import { PUZZLE_CATEGORIES } from '../lib/curiosity/types';
import { getUserDisplayName } from '../lib/auth/display-name';
import { ProgressSegments } from '../components/today/progress-segments';
import { CuriosityScreen } from '../components/curiosity/curiosity-screen';

const CLAIM_LAYERS = ['textual', 'traditional', 'analysis', 'inference'] as const;

async function main() {
  const speakBetterIds = new Set<string>();
  const sharpenerIds = new Set<string>();
  const sharpenerCategories = new Set<string>();
  const mythologyIds = new Set<string>();
  const chemistryIds = new Set<string>();
  const physicsIds = new Set<string>();
  const biologyIds = new Set<string>();
  const dailyPairs = new Set<string>();
  for (let day = 0; day < 366; day++) {
    const date = new Date(Date.UTC(2028, 0, 1 + day)).toISOString().slice(0, 10);
    const next = new Date(Date.UTC(2028, 0, 2 + day)).toISOString().slice(0, 10);
    assert.deepEqual(getDailyQuote(date), getDailyQuote(date));
    assert.notDeepEqual(getDailyQuote(date), getDailyQuote(next));
    const editorial = dailyEditorial(date);
    assert.deepEqual(editorial, dailyEditorial(date));
    if (editorial.history) assert.equal(editorial.history.date, new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }));
    assert.ok(editorial.literature.author && editorial.literature.url);
    assert.ok(editorial.sharpener.solution && editorial.sharpener.answer);
    // Every puzzle the page can show must verify against its generator: the answer is
    // re-derived from the seed rather than trusted from the object. A puzzle whose
    // answer cannot be reproduced is never published, so it must not be reachable here.
    sharpenerIds.add(editorial.sharpener.id);
    if (editorial.sharpener.category) sharpenerCategories.add(editorial.sharpener.category);
    const verified = verifyPuzzle(editorial.sharpener);
    assert.ok(verified.ok, `${editorial.sharpener.id} does not verify on ${date}: ${verified.reasons.join('; ')}`);
    for (const alternative of editorial.sharpenerAlternatives ?? []) {
      const check = verifyPuzzle(alternative);
      assert.ok(check.ok, `${alternative.id} (alternative) does not verify on ${date}: ${check.reasons.join('; ')}`);
    }

    // Speak Better: one primary word, taught in depth, a situation, and something
    // to say out loud. The word must carry both an English and a Hindi meaning,
    // and the Hindi must actually be Devanagari rather than a transliteration.
    const lesson = editorial.speakBetter;
    speakBetterIds.add(lesson.id);
    assert.ok(lesson.id && lesson.focus && lesson.situation && lesson.challenge);
    assert.ok(lesson.word && !('words' in lesson), `${lesson.id} must teach one primary word, not a list`);
    assert.ok(lesson.dialogue.length >= 3, `${lesson.id} dialogue is too short`);
    const word = lesson.word;
    assert.ok(word.word && word.englishMeaning && word.nuance && word.partOfSpeech, `${lesson.id}: ${word.word} is incomplete`);
    assert.match(word.hindiMeaning, /[\u0900-\u097F]/, `${lesson.id}: ${word.word} has no Hindi meaning`);
    assert.ok(word.examples.length >= 3 && word.examples.length <= 4, `${lesson.id}: ${word.word} needs three or four examples`);

    // Mythology: a reference panel (family, timeline, sources) plus claims that
    // are each labelled with their evidence layer, so a modern reading can never
    // be presented in the voice of scripture.
    const character = editorial.mythology;
    mythologyIds.add(character.id);
    assert.ok(character.id && character.name && character.tradition && character.story && character.analysis);
    assert.ok(character.sources.length >= 1 && character.relationships.length >= 1);
    /*
      Two kinds of entry now share this card, and they do not have the same
      structure — so they are not held to the same shape.

      A mythological, literary or legendary figure is known through a narrative, and
      the card's reference panel is what makes that narrative checkable: it needs a
      populated family tree (>= 4) and timeline (>= 4).

      A historical or religious figure known through a documented record is a
      different case, because the record is often thin precisely where the story is
      thin — Mirabai's and Enheduanna's families are documented in two or three
      lines, and inventing a fourth to satisfy a layout rule would be the one thing
      this corpus must never do. These entries must instead carry a background
      paragraph (the documented outline) and at least two checkable references. The
      floor is lower; the evidence bar is higher.

      The distinction is drawn on *classification plus historicity*, not on either
      alone: a deity of a living religion (Hanuman) is venerated, not documented, and
      a legendary king with a debated existence (Gilgamesh) is still a narrative
      figure. Both keep the narrative shape.
    */
    const documentedPerson =
      (character.classification === 'historical' || character.classification === 'religious') &&
      (character.historicity === 'documented' || character.historicity === 'debated');
    if (documentedPerson) {
      assert.ok(character.family.length >= 2, `${character.id} records no family at all`);
      assert.ok(
        (character.background?.trim().length ?? 0) >= 120,
        `${character.id} has no usable life-and-background paragraph`,
      );
      assert.ok((character.references?.length ?? 0) >= 2, `${character.id} cites fewer than two checkable references`);
      assert.ok(
        character.classification !== 'historical' || character.historicity === 'documented' || character.historicity === 'debated',
        `${character.id} is classified historical but its historicity is not documented or debated`,
      );
    } else {
      assert.ok(character.family.length >= 4, `${character.id} family tree is too thin`);
    }
    assert.ok(character.timeline.length >= 4, `${character.id} timeline is too thin`);
    assert.ok(character.variants && character.variants.length >= 1, `${character.id} does not record where traditions differ`);
    for (const entry of character.timeline) assert.ok(entry.when && entry.event);
    for (const claim of character.lesserKnown) {
      assert.ok(CLAIM_LAYERS.includes(claim.layer), `${character.id} has an unknown evidence layer: ${claim.layer}`);
      assert.ok(claim.text);
    }
    assert.ok(character.lesserKnown.some((claim) => claim.layer === 'textual'), `${character.id} cites no text`);
    assert.ok(
      character.lesserKnown.some((claim) => claim.layer === 'analysis' || claim.layer === 'inference'),
      `${character.id} labels no claim as analysis or inference`,
    );

    // Chemistry and Physics: a compact concept with the same six parts, so the
    // paired cards can never render half-empty. The connection is the part that
    // makes the concept worth teaching, so it is required, not optional.
    for (const [subject, concept, ids] of [
      ['Chemistry', editorial.chemistry, chemistryIds],
      ['Physics', editorial.physics, physicsIds],
      ['Biology', editorial.biology, biologyIds],
    ] as const) {
      ids.add(concept.id);
      assert.ok(concept.id && concept.topic && concept.simple && concept.surprising, `${subject} ${concept.id} is incomplete`);
      assert.ok(concept.connection && concept.connection.length > 40, `${subject} ${concept.id} has no real connection`);
      assert.ok(concept.question.endsWith('?'), `${subject} ${concept.id} does not end in a question`);
    }

    dailyPairs.add(`${lesson.id}|${character.id}`);
  }
  // 366 days is longer than either rotation, so every authored entry must appear,
  // and the two daily categories must not simply advance together.
  // The corpus grew with this upgrade (mythology 12 → 24; each science 12 → 18),
  // so the assertions compare against the pools rather than a literal that would
  // silently forbid adding content — which is how a "diversity" test becomes a
  // ceiling.
  // The daily card speaks at B2–C1 with a C2 lesson one day in five (see
  // `speak-better-daily.ts`). A2–B1 remains the library's on-ramp and its final
  // fallback, so the daily rotation is asserted against the advanced corpus.
  const advancedBands = [...SPEAK_BETTER_B2_LESSONS, ...SPEAK_BETTER_C1_LESSONS];
  for (const lesson of advancedBands) {
    assert.ok(speakBetterIds.has(lesson.id), `${lesson.id} (${lesson.level}) never reaches the daily card`);
  }
  const a2b1OnTheDailyCard = speakBetterLessons.filter((lesson) => speakBetterIds.has(lesson.id));
  assert.deepEqual(a2b1OnTheDailyCard, [], 'an A2–B1 lesson took the daily card from the advanced rotation');
  assert.ok(
    SPEAK_BETTER_C2_LESSONS.some((lesson) => speakBetterIds.has(lesson.id)),
    'no C2 lesson ever reaches the daily card, so the hardest band is unreachable',
  );
  // C2 is an occasional day, not the default: one in five, and it must actually
  // happen often enough to reach the whole C2 band over a year without crowding
  // out B2 and C1.
  const c2Days = Array.from({ length: 366 }, (_, day) =>
    new Date(Date.UTC(2028, 0, 1 + day)).toISOString().slice(0, 10),
  ).filter((date) => dailyEditorial(date).speakBetter.level === 'C2').length;
  assert.ok(c2Days >= 50 && c2Days <= 90, `${c2Days} of 366 days were C2`);
  // Brain Sharpener: the pool is wider than the six legacy puzzles, spans more than
  // one category, and gained verified procedural puzzles rather than only rotation.
  assert.ok(sharpenerIds.size >= 20, `only ${sharpenerIds.size} puzzles reach 366 days`);
  assert.ok(sharpenerCategories.size >= 3, `only ${sharpenerCategories.size} puzzle categories reach the card`);
  const generated = puzzlePoolForDate('2028-05-01', []).filter(
    (puzzle) => puzzle.generator && puzzle.category && PUZZLE_CATEGORIES.includes(puzzle.category),
  );
  assert.ok(generated.length > 0, 'the puzzle pool has no generated, categorised puzzle');
  assert.equal(mythologyIds.size, mythCharacters.length, `only ${mythologyIds.size} of ${mythCharacters.length} myth characters appear`);
  assert.ok(dailyPairs.size >= mythCharacters.length, 'the Speak Better and Mythology rotations are locked together');
  assert.equal(chemistryIds.size, chemistryConcepts.length, `only ${chemistryIds.size} of ${chemistryConcepts.length} chemistry concepts appear`);
  assert.equal(physicsIds.size, physicsConcepts.length, `only ${physicsIds.size} of ${physicsConcepts.length} physics concepts appear`);
  assert.equal(biologyIds.size, biologyConcepts.length, `only ${biologyIds.size} of ${biologyConcepts.length} biology concepts appear`);
  // The Curiosity page renders every card from the briefing, so a content change
  // that quietly dropped or reordered a section would only show up on screen.
  // This renders the real screen and checks the briefing end to end: every card
  // that existed before is still there, the new sections appear between them,
  // and the evidence labels reach the markup.
  {
    const date = new Date(Date.UTC(2028, 5, 15)).toISOString().slice(0, 10);
    const html = renderToStaticMarkup(createElement(CuriosityScreen, {
      briefing: { date, aiWorld: [], developerRadar: [], ...dailyEditorial(date) },
    }));
    const existingCards = [
      'A thought for today',
      'Today in History',
      'AI World',
      'Developer Radar',
      'One Thing Worth Knowing',
      'A Few Minutes of Literature',
      'One Book',
      'Brain Sharpener',
      'Learn Something',
    ];
    for (const label of existingCards) assert.ok(html.includes(label), `the Curiosity page no longer renders ${label}`);
    assert.ok(html.includes('Everyday connection') && html.includes('Real-world connection'), 'the science cards lost their connection labels');
    // React escapes the ampersand in markup, so the group label is matched as rendered.
    for (const label of ['Daily highlights', 'Speak better', 'Speak Better', 'Mythology + Historical', 'Science', 'Chemistry of the Day', 'Physics of the Day', 'Biology of the Day', 'Everyday connection', 'Real-world connection', 'Reading &amp; practice']) {
      assert.ok(html.includes(label), `the Curiosity page does not render the ${label} section`);
    }
    /*
      The two-level control is the user-facing half of the Science change: if the
      selector disappears, the feature disappears with it, and the page silently
      reverts to one undifferentiated level. Assert both options, and assert that
      no third level exists under any of the names the old code used.
    */
    assert.ok(html.includes('School / Foundation Science'), 'the foundation level is not offered');
    assert.ok(html.includes('Undergraduate Science'), 'the undergraduate level is not offered');
    for (const retired of ['Advanced Research', 'Level 3', 'Advanced Science']) {
      assert.ok(!html.includes(retired), `a third science level is still visible on the page: ${retired}`);
    }
    /*
      The classification badge is what keeps a Sikh Guru from reading as a
      mythological character. If the card stops printing it, that guarantee is gone
      even though the data still holds it.
    */
    assert.ok(
      /Mythological figure|Religious figure|Historical person|Legendary or semi-historical|Literary/i.test(html),
      'the mythology card does not print its classification',
    );
    for (const layer of ['A · Textual', 'B · Traditional', 'C · Analysis', 'D · Inference']) {
      assert.ok(html.includes(layer), `the evidence layer ${layer} is missing from the mythology card`);
    }
    assert.match(html, /[\u0900-\u097F]/, 'the Speak Better card renders no Devanagari text');
    const order = (label: string) => html.indexOf(label);
    assert.ok(order('Today in History') < order('Speak Better'), 'Speak Better must follow the existing daily highlights');
    assert.ok(order('Speak Better') < order('Mythology + Historical'), 'Speak Better must come before Mythology');
    assert.ok(order('Mythology + Historical') < order('Chemistry of the Day'), 'the science pair must follow Mythology');
    assert.ok(order('Chemistry of the Day') < order('Physics of the Day'), 'chemistry is the left half of the science pair');
    assert.ok(order('Physics of the Day') < order('Biology of the Day'), 'biology is the third card of the science row');
    assert.ok(order('Biology of the Day') < order('A Few Minutes of Literature'), 'the science cards must come before the reading cards');
    assert.ok(order('Mythology + Historical') < order('A Few Minutes of Literature'), 'Mythology must come before the reading cards');
    assert.ok(order('A Few Minutes of Literature') < order('Brain Sharpener'), 'the reading cards must keep their existing order');
  }

  for (const [done, total] of [[0, 0], [0, 4], [2, 4], [4, 4], [137, 250]]) {
    const html = renderToStaticMarkup(createElement(ProgressSegments, { done, total }));
    assert.ok(html.includes(`aria-valuenow="${total ? Math.round(done / total * 100) : 0}"`));
    assert.equal((html.match(/h-2 rounded-full/g) || []).length, total || 1);
    assert.equal((html.match(/h-2 rounded-full bg-accent/g) || []).length, done);
  }
  assert.equal(getUserDisplayName(null, ' Rajesh '), 'Rajesh');
  assert.equal(getUserDisplayName(null, ' '), 'there');
  const storage = new Map<string, string>();
  const adapter = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); }, removeItem: (key: string) => { storage.delete(key); } };
  await new LocalRepository(adapter).settings.save({ general: { ...defaultSettings.general, displayName: 'Rajesh' } });
  assert.equal((await new LocalRepository(adapter).settings.get()).general.displayName, 'Rajesh');

  // Exercise the real Supabase repository and SDK against a controlled HTTP boundary.
  // No request or write reaches a real user account.
  let row: Record<string, unknown> | null = null;
  const client = createClient('https://test.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = String(input);
      assert.ok(url.includes('/rest/v1/app_settings'));
      if (init?.method === 'POST') {
        row = JSON.parse(String(init.body));
        assert.equal(row!.user_id, 'test-user');
        return new Response(null, { status: 201 });
      }
      assert.ok(url.includes('user_id=eq.test-user'));
      return Response.json(row ? [row] : []);
    } },
  });
  const repo = new SupabaseRepository(client, 'test-user');
  await repo.settings.save({ general: { ...defaultSettings.general, defaultTaskDuration: 45, displayName: 'Rajesh' } });
  const restored = await new SupabaseRepository(client, 'test-user').settings.get();
  assert.equal(restored.general.displayName, 'Rajesh');
  assert.equal(restored.general.defaultTaskDuration, 45);
  assert.deepEqual(restored.notifications, defaultSettings.notifications);
  console.log(`PASS 366 daily selections (${advancedBands.length} B2/C1 Speak Better lessons plus a C2 day one in five; ${sharpenerIds.size} verified puzzles over ${sharpenerCategories.size} categories; ${speakBetterLessons.length} A2–B1 lessons remain the library on-ramp, ${mythCharacters.length} myth characters, ${chemistryConcepts.length}/${physicsConcepts.length}/${biologyConcepts.length} chemistry/physics/biology concepts; every claim layer-labelled; every Hindi meaning in Devanagari), the Curiosity page renders all nine existing cards plus the four new sections in order, matching historical dates, zero/partial/full/250-task progress, name fallback, local reload and Supabase settings round-trip`);
}
main().catch((error) => { console.error(error); process.exit(1); });
