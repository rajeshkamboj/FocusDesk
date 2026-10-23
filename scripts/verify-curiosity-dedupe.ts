/**
 * Acceptance tests for the Curiosity anti-repetition layer.
 *
 *   npx tsx scripts/verify-curiosity-dedupe.ts
 *
 * The twelve cases are the ones the upgrade brief names, plus the invariants the
 * implementation depends on. They run against the real modules — the real
 * selector, the real ledger, the real publisher, the real Wikimedia client and
 * the real page — with three substitutions only:
 *
 *  - a temp directory stands in for the deployment's state file,
 *  - a scripted `fetch` stands in for Wikipedia, Wikidata and the content feeds,
 *  - a fixed clock is passed as `now`, so a 365-day cooldown can be tested in
 *    milliseconds.
 *
 * Nothing here asserts that repetition has been "eliminated". It asserts the
 * windows that are enforceable, and it asserts that where a pool is smaller than
 * its window the relaxation is explicit, bounded and recorded.
 */

import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CARD_ORDER, CARD_POLICIES, hardFloorFor } from '../lib/curiosity/catalog';
import { buildHistoryIndex, daysBetweenDays, pruneHistory, toSeenRecord, type PublicationRecord } from '../lib/curiosity/history';
import { selectCandidate, selectMany } from '../lib/curiosity/selection';
import { fingerprint, isNearDuplicate, normalizeTitle, normalizeUrl, signatureText } from '../lib/curiosity/dedupe';
import {
  candidateFromMyth,
  candidateSubjectKeys,
  candidateFromNews,
  candidateFromQuote,
  candidateFromScience,
  type ContentCandidate,
} from '../lib/curiosity/candidates';
import { clearDiscoveryCache, conceptFromLead, discoverScience } from '../lib/curiosity/discovery';
import { chemistryConcepts } from '../lib/curiosity/content/chemistry';
import { physicsConcepts } from '../lib/curiosity/content/physics';
import { mythCharacters } from '../lib/curiosity/content/mythology';
import { DAILY_QUOTES } from '../lib/quotes';
import { addPublicationDays, publicationDate } from '../lib/curiosity/schedule';
import { getStateStore, setStateStoreForTesting, type SeenRecord } from '../lib/curiosity/state';
import { getDailyBriefing } from '../lib/curiosity/server';
import { runCuriosityRefresh } from '../lib/curiosity/job';
import { CuriosityScreen } from '../components/curiosity/curiosity-screen';

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

let checks = 0;
const notes: string[] = [];
function pass(name: string, detail: string): void {
  checks += 1;
  notes.push(`${checks}. ${name} — ${detail}`);
  console.log(`PASS ${checks}. ${name}`);
}

const IST_MIDNIGHT = (dayOffset: number) => new Date(Date.UTC(2026, 9, 18 + dayOffset, 18, 30, 0));

function useTempStore(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'focusdesk-dedupe-'));
  process.env.CURIOSITY_STORE = 'file';
  process.env.CURIOSITY_STATE_FILE = join(dir, 'state.json');
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  setStateStoreForTesting(null);
  return {
    dir,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
      delete process.env.CURIOSITY_STATE_FILE;
      delete process.env.CURIOSITY_STORE;
      setStateStoreForTesting(null);
    },
  };
}

/** A history index built from records, without going through a store. */
function historyFrom(records: PublicationRecord[]) {
  return buildHistoryIndex(records);
}

function record(card: PublicationRecord['card'], id: string, on: string, extra: Partial<PublicationRecord> = {}): PublicationRecord {
  return { card, id, on, ...extra };
}

/** A published science candidate, with the identity fields the ledger stores. */
function publishedConcept(card: 'chemistry' | 'physics' | 'biology', concept: (typeof chemistryConcepts)[number], on: string): PublicationRecord {
  const candidate = candidateFromScience(card, concept);
  return record(card, candidate.id, on, {
    title: candidate.title,
    ...(candidate.url ? { url: candidate.url } : {}),
    fingerprint: fingerprint(candidate.title, candidate.text),
    signature: signatureText(`${candidate.title} ${candidate.text}`),
    subjects: candidate.subjects,
  });
}


/**
 * An unrelated candidate for the same card.
 *
 * Every rejection test passes one of these alongside the duplicate. Without it a
 * one-item pool would legitimately take the documented "pool exhausted" fallback
 * (repeat the only item rather than leave the card empty), which would test the
 * fallback instead of the rule. Production pools have dozens of candidates; these
 * two make the strict path the one under test.
 */
function unrelated(card: ContentCandidate['card'], id: string, text: string): ContentCandidate {
  return { card, id, title: `Unrelated ${id}`, text, item: {} };
}

/** Failing fetch: everything throws, which is the common "no network" case. */
const deadFetch = ((async () => {
  throw new Error('scripted: no network');
}) as unknown as typeof fetch);

/* ------------------------------------------------------------------ */
/* 1. Exact duplicate URLs and ids                                     */
/* ------------------------------------------------------------------ */
function caseOne(): void {
  const concept = chemistryConcepts[0];
  const candidate = candidateFromScience('chemistry', concept);
  const index = historyFrom([
    record('chemistry', candidate.id, '2026-03-01', {
      title: candidate.title,
      url: 'https://example.org/a?utm_source=feed&utm_medium=rss',
      fingerprint: fingerprint(candidate.title, candidate.text),
      subjects: candidate.subjects,
    }),
  ]);

  // Same URL, different tracking parameters and a different id: still the same page.
  const sameUrl: ContentCandidate = {
    card: 'chemistry',
    id: 'different-id-same-url',
    title: 'A differently titled copy',
    text: 'This copy has a different identifier and different surrounding text entirely, so only the URL can catch it.',
    url: 'https://www.example.org/a/?utm_campaign=x',
    item: {},
  };
  const filler = unrelated('chemistry', 'unrelated-chemistry-one', 'A completely unrelated concept about crystallisation and its uses in the laboratory.');
  const urlOutcome = selectCandidate([sameUrl, filler], { card: 'chemistry', date: '2026-05-01', index });
  assert.equal(urlOutcome.ok, true);
  assert.equal(urlOutcome.candidate?.id, filler.id, 'a duplicate URL was chosen over fresh content');
  assert.ok(urlOutcome.rejections.some((rejection) => rejection.reason === 'duplicate-url'), 'the rejection did not name the URL');

  // Same canonical id, different URL: still the same item.
  const sameId: ContentCandidate = { ...sameUrl, id: candidate.id, url: 'https://example.org/other', title: 'Another copy' };
  const idOutcome = selectCandidate([sameId, filler], { card: 'chemistry', date: '2026-05-01', index });
  assert.equal(idOutcome.ok, true);
  assert.equal(idOutcome.candidate?.id, filler.id, 'a duplicate id was chosen over fresh content');
  assert.ok(idOutcome.rejections.some((rejection) => rejection.reason === 'duplicate-id'));

  // normalizeUrl itself: scheme, www, trailing slash, fragment and order all collapse.
  assert.equal(normalizeUrl('https://WWW.Example.org/a/?b=2&a=1#frag'), normalizeUrl('http://example.org/a?a=1&b=2'));
  assert.notEqual(normalizeUrl('https://example.org/a?id=1'), normalizeUrl('https://example.org/a?id=2'));

  pass('Exact duplicate URLs and ids', 'canonical URL and stable id both reject a repeat inside the window; tracking params, scheme, www, fragment and parameter order collapse to one identity');
}

/* ------------------------------------------------------------------ */
/* 2. Duplicate titles with different formatting                       */
/* ------------------------------------------------------------------ */
function caseTwo(): void {
  const title = 'The  Iliad: A New Translation!';
  const index = historyFrom([record('literature', 'lit-homer', '2026-01-05', { title })]);
  assert.equal(normalizeTitle(title), 'iliad a new translation');
  assert.equal(normalizeTitle('Iliad — a new translation'), 'iliad a new translation');

  const candidate: ContentCandidate = {
    card: 'literature',
    id: 'lit-other-edition',
    title: 'ILIAD: a new  translation',
    text: 'A different passage entirely, with enough words that the near-duplicate test has something to compare and does not simply fire on the title.',
    item: {},
  };
  const filler = unrelated('literature', 'lit-unrelated', 'An unrelated passage from a different work, long enough to be a real candidate for the card.');
  const outcome = selectCandidate([candidate, filler], { card: 'literature', date: '2026-02-01', index });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.candidate?.id, filler.id, 'a re-formatted duplicate title was chosen over fresh content');
  assert.ok(outcome.rejections.some((rejection) => rejection.reason === 'duplicate-title'), `rejections: ${outcome.rejections.map((r) => r.reason).join(',')}`);
  pass('Duplicate titles with different formatting', 'case, punctuation, leading article and spacing are normalized before the title comparison');
}

/* ------------------------------------------------------------------ */
/* 3. Identical content with changed wording or markup                 */
/* ------------------------------------------------------------------ */
function caseThree(): void {
  const original =
    'A database index is an additional organised lookup structure built beside a table. Without one the database may inspect every row to find matching records.';
  const reworded =
    'A database index is an organised additional lookup structure built next to a table. Without one, the database may inspect each row to find matching records.';
  const index = historyFrom([
    record('one-thing', 'one-thing-index', '2026-02-02', {
      title: 'Why does a database index make a query faster?',
      // The publisher's signature covers title + body; the fixture must match it or
      // it would be testing a different string from the one production stores.
      signature: signatureText(`Why does a database index make a query faster? ${original}`),
    }),
  ]);
  assert.equal(
    isNearDuplicate(
      signatureText(`Why does a database index make a query faster? ${original}`),
      signatureText(`Why a database index speeds a query ${reworded}`),
    ),
    true,
    'a one-word edit was not recognised as the same text',
  );

  const candidate: ContentCandidate = {
    card: 'one-thing',
    id: 'one-thing-index-v2',
    title: 'Why a database index speeds a query',
    text: reworded,
    item: {},
  };
  const filler = unrelated('one-thing', 'one-thing-unrelated', 'A completely different idea about how noise-cancelling headphones subtract sound waves.');
  const outcome = selectCandidate([candidate, filler], { card: 'one-thing', date: '2026-02-03', index });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.candidate?.id, filler.id, 'a re-worded copy of a published item was accepted');
  assert.ok(outcome.rejections.some((rejection) => rejection.reason === 'near-duplicate'), 'the near-duplicate was not named');

  // An edited version of an old item is not a new discovery: same id, changed text,
  // inside the window — rejected on the id, and reported as a duplicate rather than
  // as fresh content.
  const edited: ContentCandidate = {
    card: 'one-thing',
    id: 'one-thing-index',
    title: 'Why does a database index make a query faster? (2026 edition)',
    text: `${original} The index is updated on every write, which is the cost side of the trade.`,
    item: {},
  };
  const editedOutcome = selectCandidate([edited, filler], { card: 'one-thing', date: '2026-02-04', index });
  assert.equal(editedOutcome.ok, true);
  assert.equal(editedOutcome.candidate?.id, filler.id);
  assert.ok(editedOutcome.rejections.some((rejection) => rejection.reason === 'duplicate-id'));

  // And badly different content is accepted, so the near-duplicate rule is not a
  // blanket refusal.
  const different: ContentCandidate = {
    card: 'one-thing',
    id: 'one-thing-other',
    title: 'Why does ice float?',
    text: 'Water expands as it freezes, so ice is less dense than the liquid and floats instead of sinking to the bottom of a lake.',
    item: {},
  };
  assert.equal(selectCandidate([different], { card: 'one-thing', date: '2026-02-05', index }).ok, true, 'unrelated content was rejected as a near-duplicate');
  pass('Identical content with changed wording or markup', 'shingle signatures catch a re-worded paragraph; an edited version of a published id is a duplicate, not a discovery; unrelated text still passes');
}

/* ------------------------------------------------------------------ */
/* 4. Similar subjects across multiple cards                           */
/* ------------------------------------------------------------------ */
function caseFour(): void {
  const concept = chemistryConcepts.find((entry) => entry.id === 'photosynthesis') ?? chemistryConcepts[0];
  const index = historyFrom([
    publishedConcept('chemistry', concept, '2026-04-01'),
  ]);

  // The same concept, on the physics card, eight days later: a different card but
  // the same subject space. The title and the text are deliberately different, so
  // this exercises the *subject* rule rather than title/fingerprint identity — the
  // case the brief describes as "the same concept returning under a different title".
  const asPhysics: ContentCandidate = {
    card: 'physics',
    id: 'physics-same-subject',
    title: 'How plants capture light energy',
    text: 'A different explanation, several sentences long, about light-harvesting pigments and electron transport in plants and algae.',
    subjects: [`concept:${concept.topic}`],
    item: {},
  };
  const unrelatedPhysics = candidateFromScience('physics', physicsConcepts[3]);
  const outcome = selectCandidate([asPhysics, unrelatedPhysics], { card: 'physics', date: '2026-04-09', index });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.candidate?.id, unrelatedPhysics.id, 'the same concept was published on two science cards eight days apart');
  assert.ok(
    outcome.rejections.some((rejection) => rejection.reason === 'cross-card-subject'),
    `expected a cross-card subject rejection, saw ${outcome.rejections.map((rejection) => rejection.reason).join(',')}`,
  );

  // Thirty days later it is allowed again (the cross-card window).
  const later = selectCandidate([asPhysics], { card: 'physics', date: addPublicationDays('2026-04-01', 30), index });
  assert.equal(later.ok, true, 'the cross-card window never expires');
  assert.equal(later.candidate?.id, asPhysics.id);

  // Two cards in the same run cannot pick the same subject either.
  const first = selectCandidate([candidateFromScience('chemistry', concept)], {
    card: 'chemistry',
    date: '2026-06-01',
    index: historyFrom([]),
  });
  assert.ok(first.ok && first.candidate);
  const reserved = new Set<string>();
  const many = selectMany([candidateFromScience('physics', concept)], {
    card: 'physics',
    date: '2026-06-01',
    index: historyFrom([]),
    reservedSubjects: reserved,
  }, 1);
  // With nothing published, the same run only shares a subject if both cards chose
  // it; selectMany receives the reservation explicitly, so this asserts that the
  // reservation is what blocks it.
  for (const key of candidateSubjectKeys(candidateFromScience('chemistry', concept))) reserved.add(key);
  const blockedInRun = selectMany([candidateFromScience('physics', concept)], {
    card: 'physics',
    date: '2026-06-01',
    index: historyFrom([]),
    reservedSubjects: reserved,
    policy: { allowRelaxation: false },
  }, 1);
  assert.equal(many.candidates.length, 1);
  assert.equal(blockedInRun.candidates.length, 0, 'an intra-run subject reservation did not block the second card');
  pass('Similar subjects across multiple cards', 'the same concept is refused on a sibling science card for 30 days, allowed after it, and refused within one run by subject reservation');
}

/* ------------------------------------------------------------------ */
/* 5. Cooldown enforcement                                             */
/* ------------------------------------------------------------------ */
function caseFive(): void {
  const concept = physicsConcepts[0];
  const candidate = candidateFromPhysics(concept);
  const published = publishedConcept('physics', concept, '2026-01-01');
  const index = historyFrom([published]);

  // Inside the 90-day science cooldown: refused, and the reason carries the age.
  const fresh = candidateFromPhysics(physicsConcepts[1]);
  const inside = selectCandidate([candidate, fresh], { card: 'physics', date: '2026-03-01', index });
  assert.equal(inside.ok, true);
  assert.equal(inside.candidate?.id, fresh.id, 'a science concept returned inside 90 days');
  const rejection = inside.rejections.find((entry) => entry.reason === 'duplicate-id');
  assert.ok(rejection, 'the id was not the reason');
  assert.equal(rejection.ageDays, daysBetweenDays('2026-01-01', '2026-03-01'));
  assert.equal(rejection.windowDays, 90);

  // On the 90th day: allowed, but chosen as least-recent (it has been published).
  const edge = selectCandidate([candidate], { card: 'physics', date: addPublicationDays('2026-01-01', 90), index });
  assert.equal(edge.ok, true, 'the cooldown never expires');
  assert.equal(edge.reason, 'least-recent');

  // A never-published item wins even if the published one is eligible again.
  const preferFresh = selectCandidate([candidate, fresh], { card: 'physics', date: addPublicationDays('2026-01-01', 120), index });
  assert.ok(preferFresh.ok);
  assert.equal(preferFresh.candidate?.id, fresh.id, 'a fresh candidate did not beat a previously published one');

  // The registry's windows match the brief's minimums.
  assert.ok(CARD_POLICIES.quote.exactDays >= 365);
  assert.ok(CARD_POLICIES.history.exactDays >= 365);
  assert.ok(CARD_POLICIES.mythology.exactDays >= 180);
  assert.ok(CARD_POLICIES.chemistry.exactDays >= 90 && CARD_POLICIES.physics.exactDays >= 90 && CARD_POLICIES.biology.exactDays >= 90);
  assert.ok(CARD_ORDER.every((card) => CARD_POLICIES[card].crossCardDays >= 30));
  pass('Cooldown enforcement', `365-day exact windows, 180-day mythology, 90-day science and 30-day cross-card windows all enforced with the age and window recorded on the rejection`);
}

function candidateFromPhysics(concept: (typeof physicsConcepts)[number]) {
  return candidateFromScience('physics', concept);
}

/* ------------------------------------------------------------------ */
/* 6. Candidate-pool exhaustion                                        */
/* ------------------------------------------------------------------ */
function caseSix(): void {
  // One item, published yesterday. Nothing can satisfy a 365-day window, so the
  // documented fallback applies — and it says so.
  const only: ContentCandidate = {
    card: 'sharpener',
    id: 'only-puzzle',
    title: 'The only puzzle',
    text: 'A puzzle with enough text to be a real candidate for the card.',
    item: {},
  };
  const index = historyFrom([record('sharpener', 'only-puzzle', '2026-07-01')]);
  const outcome = selectCandidate([only], { card: 'sharpener', date: '2026-07-02', index });
  assert.equal(outcome.ok, true, 'an exhausted pool left the card empty');
  assert.equal(outcome.relaxed, true);
  assert.equal(outcome.reason, 'relaxed-cooldown');
  assert.ok(outcome.warnings.some((warning) => /pool .* exhausted|pool of 1/i.test(warning)), `no warning named the exhaustion: ${outcome.warnings.join(' | ')}`);
  assert.ok(hardFloorFor(1) === 1 && hardFloorFor(12) === 7);

  // A pool that is larger than the floor, all used yesterday: still filled, and the
  // warning distinguishes "relaxed to the floor" from "exhausted".
  const pool: ContentCandidate[] = Array.from({ length: 8 }, (_, index) => ({
    card: 'speak-better',
    id: `lesson-${index}`,
    title: `Lesson ${index}`,
    text: `A complete lesson number ${index} with enough words to be usable in a card.`,
    item: {},
  }));
  const used = pool.map((candidate) => record('speak-better', candidate.id, '2026-07-01'));
  const relaxed = selectCandidate(pool, { card: 'speak-better', date: '2026-07-02', index: historyFrom(used) });
  assert.equal(relaxed.ok, true);
  assert.ok(relaxed.warnings.length > 0, 'a relaxation happened without a warning');
  assert.equal(relaxed.candidate?.id, 'lesson-0', 'the least-recently used item was not chosen, so the repeat was not at least the oldest one');

  // An empty pool is a refusal, never an empty card.
  const empty = selectCandidate([], { card: 'sharpener', date: '2026-07-02', index: historyFrom([]) });
  assert.equal(empty.ok, false);
  assert.equal(empty.reason, 'empty-pool');
  assert.ok(empty.warnings[0].includes('empty'));
  pass('Candidate-pool exhaustion', 'a pool smaller than its window falls back in a recorded order, picks the oldest item first, and an empty pool is refused rather than published as a blank card');
}

/* ------------------------------------------------------------------ */
/* 7. Source timeouts and malformed responses                          */
/* ------------------------------------------------------------------ */
async function caseSeven(): Promise<void> {
  clearDiscoveryCache();
  const date = '2026-10-19';
  const pages = [
    {
      title: 'Mock concept',
      extract:
        'Mock concept is a process in which a substance changes form under ordinary conditions, and it is studied by chemists as a model of a wider class of reactions. It happens in several stages, each of which can be observed separately in the laboratory. The process is used in industry to produce a common material, and the same route is found in a number of household products. About 40 per cent of the material is recovered at the end of the first stage. The remaining portion is recycled back into the start of the process.',
    },
  ];
  const goodFetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname !== 'en.wikipedia.org') throw new Error('unexpected host');
    if (url.searchParams.get('list') === 'categorymembers') {
      return Response.json({ query: { categorymembers: pages.map((page) => ({ title: page.title })) } });
    }
    return Response.json({
      query: {
        pages: pages.map((page) => ({
          title: page.title,
          fullurl: 'https://en.wikipedia.org/wiki/Mock_concept',
          extract: page.extract,
          pageprops: { wikibase_item: 'Q123' },
          length: 9000,
        })),
      },
    });
  }) as unknown as typeof fetch;

  const found = await discoverScience('chemistry', date, { fetchImpl: goodFetch, cache: false });
  assert.equal(found.candidates.length, 1, `discovery returned ${found.candidates.length} candidates`);
  const concept = found.candidates[0].item;
  assert.equal(concept.origin, 'wikipedia');
  assert.equal(concept.wikidataId, 'Q123');
  assert.match(concept.source.url, /^https:\/\/en\.wikipedia\.org\/wiki\//, 'a discovered concept has no citable URL');
  assert.match(concept.source.attribution, /CC BY-SA/);
  assert.equal(conceptFromLead('chemistry', { title: 'List of chemical compounds', url: 'https://x', extract: pages[0].extract }, 'x'), null, 'a list page passed the quality gate');
  assert.equal(
    conceptFromLead('chemistry', { title: 'Mock', url: 'https://x', extract: 'Mock is a thing. It exists. It is here.' }, 'x'),
    null,
    'a three-short-sentence lead passed the quality gate',
  );

  // A timeout: two attempts, then nothing, with a reason — never a throw.
  clearDiscoveryCache();
  let attempts = 0;
  const timeoutFetch = (async () => {
    attempts += 1;
    throw new Error('The operation was aborted due to timeout');
  }) as unknown as typeof fetch;
  const timedOut = await discoverScience('physics', date, { fetchImpl: timeoutFetch, cache: false, limit: 3 });
  assert.equal(timedOut.candidates.length, 0);
  assert.equal(attempts, 2, `retried ${attempts} times, expected 2 attempts`);
  assert.ok(timedOut.note, 'a failed discovery pass returned no reason');

  // A malformed body: an answer, but not one that can be used.
  clearDiscoveryCache();
  const malformed = await discoverScience('biology', date, {
    fetchImpl: (async () => Response.json({ nonsense: true })) as unknown as typeof fetch,
    cache: false,
  });
  assert.equal(malformed.candidates.length, 0);
  assert.ok(malformed.note && /no members|returned no/i.test(malformed.note), `malformed note: ${malformed.note}`);

  // And the publisher still fills the science cards from the authored corpus when
  // discovery returns nothing. This is the part that matters to a reader.
  const store = useTempStore();
  try {
    const summary = await runCuriosityRefresh({ now: IST_MIDNIGHT(0), fetchImpl: timeoutFetch, trigger: 'cron' });
    assert.equal(summary.status, 'published', `the day was not published: ${summary.detail}`);
    const brief = await getDailyBriefing(publicationDate(IST_MIDNIGHT(0)));
    assert.ok(brief.chemistry.topic && brief.chemistry.simple && brief.physics.simple && brief.biology.simple, 'a science card was empty');
    assert.ok((summary.daily.degraded ?? []).some((note) => /discovery|chemistry|physics|biology/.test(note)), 'the discovery failure was not recorded on the day');
  } finally {
    store.cleanup();
  }
  pass('Source timeouts and malformed responses', 'two attempts, a named reason, no throw, and the authored corpus fills the cards with the failure recorded on the run');
}

/* ------------------------------------------------------------------ */
/* 8. Scheduled-job reruns and concurrent executions                   */
/* ------------------------------------------------------------------ */
async function caseEight(): Promise<void> {
  const store = useTempStore();
  try {
    const now = IST_MIDNIGHT(0);
    const first = await runCuriosityRefresh({ now, fetchImpl: deadFetch, trigger: 'cron' });
    assert.equal(first.status, 'published');
    const afterFirst = await getStateStore().read();
    const seenAfterFirst = afterFirst.seen.length;
    const dailyAfterFirst = JSON.stringify(afterFirst.daily?.payload);

    // A retried workflow: same day, same scope. It must do nothing and record nothing.
    const rerun = await runCuriosityRefresh({ now, fetchImpl: deadFetch, trigger: 'cron' });
    assert.equal(rerun.status, 'already-published');
    const afterRerun = await getStateStore().read();
    assert.equal(afterRerun.seen.length, seenAfterFirst, 'a rerun added ledger rows');
    assert.equal(JSON.stringify(afterRerun.daily?.payload), dailyAfterFirst, 'a rerun changed the published day');

    // Two publishers at once: the lease serialises them, and the loser writes nothing.
    const [left, right] = await Promise.all([
      runCuriosityRefresh({ now: IST_MIDNIGHT(1), fetchImpl: deadFetch, trigger: 'cron' }),
      runCuriosityRefresh({ now: IST_MIDNIGHT(1), fetchImpl: deadFetch, trigger: 'cron' }),
    ]);
    // Exactly one run may publish. The other either loses the lease (`busy`) or
    // arrives after the lease was released and finds the day already built
    // (`already-published`); both are successes, and both write nothing.
    const statuses = [left.status, right.status].sort();
    assert.equal(statuses.filter((status) => status === 'published').length, 1, `concurrent runs returned ${statuses.join(', ')}`);
    assert.ok(statuses.every((status) => ['published', 'busy', 'already-published'].includes(status)), `unexpected status: ${statuses.join(', ')}`);
    const state = await getStateStore().read();
    const keys = state.seen.map((row) => `${row.category}|${row.id}|${row.on}`);
    assert.equal(new Set(keys).size, keys.length, 'concurrent runs recorded a duplicate publication');
    pass('Scheduled-job reruns and concurrent executions', 'a retried run is idempotent at both the snapshot and the ledger, and two overlapping runs produce one publication');
  } finally {
    store.cleanup();
  }
}

/* ------------------------------------------------------------------ */
/* 9. Persistence across simulated deployments                         */
/* ------------------------------------------------------------------ */
async function caseNine(): Promise<void> {
  const store = useTempStore();
  try {
    const dayOne = await runCuriosityRefresh({ now: IST_MIDNIGHT(0), fetchImpl: deadFetch, trigger: 'cron' });
    assert.equal(dayOne.status, 'published');
    const firstIds = { ...(dayOne.daily.contentIds ?? {}) };

    // A new store object and a cleared module cache: what a restart or a second
    // instance sees. Nothing is shared in memory.
    setStateStoreForTesting(null);
    const reopened = await getStateStore().read();
    assert.ok(reopened.daily && reopened.seen.length > 0, 'a fresh store object found no history');
    assert.deepEqual(reopened.daily?.contentIds, firstIds, 'the published ids did not survive a new store instance');

    const dayTwo = await runCuriosityRefresh({ now: IST_MIDNIGHT(1), fetchImpl: deadFetch, trigger: 'cron' });
    assert.equal(dayTwo.status, 'published');
    for (const card of ['one-thing', 'literature', 'learn-something', 'speak-better', 'mythology', 'chemistry', 'physics', 'biology', 'sharpener', 'quote', 'history'] as const) {
      assert.notEqual(
        dayTwo.daily.contentIds?.[card],
        firstIds[card],
        `${card} repeated across a restart on the very next day`,
      );
    }
    pass('Persistence across deployments', 'history lives in the store, a fresh store object reads it, and the next day avoids every card published the day before');
  } finally {
    store.cleanup();
  }
}

/* ------------------------------------------------------------------ */
/* 10. Snapshot preservation when a publish fails                      */
/* ------------------------------------------------------------------ */
async function caseTen(): Promise<void> {
  const store = useTempStore();
  try {
    const published = await runCuriosityRefresh({ now: IST_MIDNIGHT(0), fetchImpl: deadFetch, trigger: 'cron' });
    assert.equal(published.status, 'published');
    const before = readFileSync(process.env.CURIOSITY_STATE_FILE as string, 'utf8');

    // A mutator that throws is exactly what the publisher is when validation
    // refuses a payload. The store must leave the previous snapshot untouched.
    const result = await getStateStore().withLease(60_000, async () => {
      throw new RangeError('refusing to publish: synthetic validation failure');
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'error');
    const after = readFileSync(process.env.CURIOSITY_STATE_FILE as string, 'utf8');
    assert.equal(after, before, 'a failed publication rewrote the state file');

    // And the read path still serves the last good day.
    const briefing = await getDailyBriefing(publicationDate(IST_MIDNIGHT(0)));
    assert.equal(briefing.publication?.origin, 'published');
    assert.ok(briefing.oneThing.explanation.length > 40);

    // Validation is the gate that triggers the throw: an empty card is refused.
    const { invalidDailyFields } = await import('../lib/curiosity/job');
    const empty = await getDailyBriefing(publicationDate(IST_MIDNIGHT(0)));
    const broken = { ...empty } as unknown as Parameters<typeof invalidDailyFields>[0];
    (broken as { literature: { title: string } }).literature = { ...broken.literature, title: '   ' };
    assert.ok(invalidDailyFields(broken).includes('literature.title'), 'an empty card passed validation');
    pass('Snapshot preservation when a publish fails', 'a throwing mutator leaves the previous snapshot byte-identical, the read path still serves it, and an empty card fails validation before the write');
  } finally {
    store.cleanup();
  }
}

/* ------------------------------------------------------------------ */
/* 11. Source attribution                                              */
/* ------------------------------------------------------------------ */
async function caseEleven(): Promise<void> {
  // Authored mythology: attribution is real, and the card says where to check it.
  const character = mythCharacters.find((entry) => entry.id === 'athena') ?? mythCharacters[0];
  const mythCandidate = candidateFromMyth(character);
  assert.ok(mythCandidate.subjects?.some((subject) => subject.startsWith('character:')), 'a mythology candidate has no entity subject');
  assert.ok(mythCandidate.sourceName, 'a mythology candidate has no source label');

  // A discovered science card carries the article URL, a named source and a licence.
  const candidate = candidateFromScience('chemistry', {
    id: 'wiki-q123',
    topic: 'Mock concept',
    simple: 'A mock concept is a process used to test discovery.',
    connection: 'It is used in industry to produce a common material that readers can verify from the source article.',
    surprising: 'About 40 per cent of the material is recovered.',
    question: 'Where does Mock concept appear in something you use?',
    origin: 'wikipedia',
    source: { url: 'https://en.wikipedia.org/wiki/Mock_concept', name: 'Wikipedia · Mock concept', attribution: 'CC BY-SA 4.0' },
  });
  assert.equal(candidate.url, 'https://en.wikipedia.org/wiki/Mock_concept');
  assert.match(candidate.sourceName ?? '', /Wikipedia/);

  const store = useTempStore();
  try {
    await runCuriosityRefresh({ now: IST_MIDNIGHT(0), fetchImpl: deadFetch, trigger: 'cron' });
    const state = await getStateStore().read();
    const rows = state.seen.filter((row) => row.category === 'mythology');
    assert.equal(rows.length, 1);
    assert.ok(rows[0].source, 'the ledger row has no source attribution');
    assert.ok(rows[0].title && rows[0].fingerprint && rows[0].subjects?.length, 'the ledger row has no identity metadata');

    const briefing = await getDailyBriefing(publicationDate(IST_MIDNIGHT(0)));
    const html = renderToStaticMarkup(createElement(CuriosityScreen, { briefing }));
    assert.ok(html.includes('Reference article') || html.includes('Texts &amp; traditions'), 'the mythology card lost its reference panel');
    assert.ok(html.includes('Today in History') && html.includes('One Book'), 'the rendered page lost a card');
  } finally {
    store.cleanup();
  }
  pass('Correct source attribution', 'candidates carry a named source and URL, discovered science text carries its article and licence, and the ledger keeps the attribution with the publication');
}

/* ------------------------------------------------------------------ */
/* 12. Records remain available after cooldown expiry                  */
/* ------------------------------------------------------------------ */
function caseTwelve(): void {
  const concept = chemistryConcepts[2];
  const candidate = candidateFromScience('chemistry', concept);
  const published = publishedConcept('chemistry', concept, '2024-01-01');
  const index = historyFrom([published]);

  // A record older than the cooldown still exists, and is still readable.
  const last = index.lastByKey.get(`id:chemistry|${candidate.id}`)?.get('chemistry');
  assert.equal(last, '2024-01-01', 'the historical record disappeared from the index');
  assert.ok(daysBetweenDays('2024-01-01', '2026-01-01') > CARD_POLICIES.chemistry.exactDays);

  // It is eligible again, and the selector reports when it was last shown.
  const again = selectCandidate([candidate], { card: 'chemistry', date: '2026-01-01', index });
  assert.equal(again.ok, true, 'an item was blocked forever after its cooldown');
  assert.equal(again.lastPublishedOn, '2024-01-01');

  // It is not "fresh" — the distinction between new and long-unseen is retained.
  assert.equal(again.reason, 'least-recent');

  // The retention window prunes by age, not by cooldown: three years of history,
  // so a reader can still ask "was this shown before?" after the window expired.
  const old = [
    record('chemistry', 'ancient', '2022-01-01'),
    record('chemistry', 'recent', '2026-01-01'),
  ];
  const pruned = pruneHistory(old, '2026-01-01');
  assert.deepEqual(pruned.map((entry) => entry.id), ['recent'], 'pruning kept a record beyond three years');
  const within = pruneHistory([record('chemistry', 'two-years', '2024-01-01')], '2026-01-01');
  assert.equal(within.length, 1, 'pruning dropped a record that is still inside the retention window');
  pass('Records after cooldown expiry', 'publication records outlive their cooldown, remain queryable, become eligible again, and are pruned by a three-year retention window rather than by the cooldown');
}

/* ------------------------------------------------------------------ */
/* Extra: the quote card participates in the same ledger               */
/* ------------------------------------------------------------------ */
async function caseQuote(): Promise<void> {
  const store = useTempStore();
  try {
    const dayOne = await runCuriosityRefresh({ now: IST_MIDNIGHT(0), fetchImpl: deadFetch, trigger: 'cron' });
    const first = dayOne.daily.contentIds?.quote;
    assert.ok(first, 'the quote was not published as part of the day');
    const briefing = await getDailyBriefing(publicationDate(IST_MIDNIGHT(0)));
    assert.ok(briefing.quote?.text && briefing.quote?.author, 'the published quote did not reach the briefing');
    assert.equal(new Set(DAILY_QUOTES.map((quote) => normalizeTitle(quote.text))).size, DAILY_QUOTES.length, 'the quote corpus contains the same text twice');

    const tomorrow = await runCuriosityRefresh({ now: IST_MIDNIGHT(1), fetchImpl: deadFetch, trigger: 'cron' });
    assert.notEqual(tomorrow.daily.contentIds?.quote, first, 'the quote repeated the next day');

    const state = await getStateStore().read();
    const quotes = state.seen.filter((row) => row.category === 'quote');
    assert.equal(quotes.length, 2);
    assert.ok(quotes.every((row) => row.author ?? true));
    assert.ok(quotes.every((row) => row.fingerprint && row.signature), 'a quote row carries no text identity');
  } finally {
    store.cleanup();
  }
  pass('A Thought for Today', 'the quote is selected through the same ledger, carries text identity, and cannot repeat on the next day');
}

/* ------------------------------------------------------------------ */
/* Extra: the ledger helper is what the publisher writes              */
/* ------------------------------------------------------------------ */
function caseLedgerShape(): void {
  const recordOut = toSeenRecord(record('mythology', 'athena', '2026-10-19', { title: 'Athena', subjects: ['character:Athena'] }));
  assert.equal(recordOut.category, 'mythology');
  assert.deepEqual(recordOut.subjects, ['character:Athena']);
  const seen: SeenRecord = recordOut;
  assert.ok(seen.on === '2026-10-19');
  pass('Ledger shape', 'the persisted row is the same shape the selector reads, so no translation layer can drift between them');
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */
async function main(): Promise<void> {
  caseOne();
  caseTwo();
  caseThree();
  caseFour();
  caseFive();
  caseSix();
  await caseSeven();
  await caseEight();
  await caseNine();
  await caseTen();
  await caseEleven();
  caseTwelve();
  await caseQuote();
  caseLedgerShape();

  console.log('\nAll Curiosity anti-repetition checks passed:\n');
  for (const note of notes) console.log(`  ${note}`);
  console.log(`\n${checks} checks. Repetition is bounded by the recorded windows, not eliminated: pools smaller than their window fall back explicitly, and every relaxation is published in the day's own record.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
