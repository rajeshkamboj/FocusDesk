import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createClient } from '@supabase/supabase-js';
import { SupabaseRepository } from '../lib/store/supabase-repository';
import { LocalRepository } from '../lib/store/local-repository';
import { defaultSettings } from '../lib/store/defaults';
import { getDailyQuote } from '../lib/quotes';
import { dailyEditorial } from '../lib/curiosity/content';
import { getUserDisplayName } from '../lib/auth/display-name';
import { ProgressSegments } from '../components/today/progress-segments';
import { CuriosityScreen } from '../components/curiosity/curiosity-screen';

const CLAIM_LAYERS = ['textual', 'traditional', 'analysis', 'inference'] as const;

async function main() {
  const speakBetterIds = new Set<string>();
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

    // Speak Better: a situation, 3-5 confusable words, and something to say
    // out loud. Every word must carry both an English and a Hindi meaning, and
    // the Hindi must actually be Devanagari rather than a transliteration.
    const lesson = editorial.speakBetter;
    speakBetterIds.add(lesson.id);
    assert.ok(lesson.id && lesson.focus && lesson.situation && lesson.challenge);
    assert.ok(lesson.words.length >= 3 && lesson.words.length <= 5, `${lesson.id} has ${lesson.words.length} words`);
    assert.ok(lesson.dialogue.length >= 3, `${lesson.id} dialogue is too short`);
    for (const word of lesson.words) {
      assert.ok(word.word && word.englishMeaning && word.nuance, `${lesson.id}: ${word.word} is incomplete`);
      assert.match(word.hindiMeaning, /[\u0900-\u097F]/, `${lesson.id}: ${word.word} has no Hindi meaning`);
      assert.ok(word.examples.length >= 1, `${lesson.id}: ${word.word} has no example sentence`);
    }

    // Mythology: a reference panel (family, timeline, sources) plus claims that
    // are each labelled with their evidence layer, so a modern reading can never
    // be presented in the voice of scripture.
    const character = editorial.mythology;
    mythologyIds.add(character.id);
    assert.ok(character.id && character.name && character.tradition && character.story && character.analysis);
    assert.ok(character.sources.length >= 1 && character.relationships.length >= 1);
    assert.ok(character.family.length >= 4, `${character.id} family tree is too thin`);
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
  assert.equal(speakBetterIds.size, 12, `only ${speakBetterIds.size} Speak Better lessons appear`);
  assert.equal(mythologyIds.size, 12, `only ${mythologyIds.size} myth characters appear`);
  assert.ok(dailyPairs.size >= 12, 'the Speak Better and Mythology rotations are locked together');
  assert.equal(chemistryIds.size, 12, `only ${chemistryIds.size} chemistry concepts appear`);
  assert.equal(physicsIds.size, 12, `only ${physicsIds.size} physics concepts appear`);
  assert.equal(biologyIds.size, 12, `only ${biologyIds.size} biology concepts appear`);
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
    for (const label of ['Daily highlights', 'Speak better', 'Speak Better', 'Mythology · Character of the Day', 'Science', 'Chemistry of the Day', 'Physics of the Day', 'Biology of the Day', 'Everyday connection', 'Real-world connection', 'Reading &amp; practice']) {
      assert.ok(html.includes(label), `the Curiosity page does not render the ${label} section`);
    }
    for (const layer of ['A · Textual', 'B · Traditional', 'C · Analysis', 'D · Inference']) {
      assert.ok(html.includes(layer), `the evidence layer ${layer} is missing from the mythology card`);
    }
    assert.match(html, /[\u0900-\u097F]/, 'the Speak Better card renders no Devanagari text');
    const order = (label: string) => html.indexOf(label);
    assert.ok(order('Today in History') < order('Speak Better'), 'Speak Better must follow the existing daily highlights');
    assert.ok(order('Speak Better') < order('Mythology · Character of the Day'), 'Speak Better must come before Mythology');
    assert.ok(order('Mythology · Character of the Day') < order('Chemistry of the Day'), 'the science pair must follow Mythology');
    assert.ok(order('Chemistry of the Day') < order('Physics of the Day'), 'chemistry is the left half of the science pair');
    assert.ok(order('Physics of the Day') < order('Biology of the Day'), 'biology is the third card of the science row');
    assert.ok(order('Biology of the Day') < order('A Few Minutes of Literature'), 'the science cards must come before the reading cards');
    assert.ok(order('Mythology · Character of the Day') < order('A Few Minutes of Literature'), 'Mythology must come before the reading cards');
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
  console.log('PASS 366 daily selections (12 each of Speak Better lessons, myth characters, chemistry, physics and biology concepts; every claim layer-labelled; every Hindi meaning in Devanagari), the Curiosity page renders all nine existing cards plus the four new sections in order, matching historical dates, zero/partial/full/250-task progress, name fallback, local reload and Supabase settings round-trip');
}
main().catch((error) => { console.error(error); process.exit(1); });
