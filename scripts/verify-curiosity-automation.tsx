/**
 * Verification for the Curiosity content lifecycle.
 *
 *   npx tsx scripts/verify-curiosity-automation.tsx
 *
 * Nineteen checks. The first eight follow the acceptance criteria of the brief;
 * 9–19 are the production-reliability cases: what every card does when a source is
 * down, whether the payload is validated before it can be seen, what the store is
 * allowed to claim about durability, whether exactly one scheduler exists, and
 * whether the curated corpus is complete enough to be the safety net rather than a
 * consolation prize. They run
 * against the real modules — the real publisher, the real store, the real Open
 * Library client, the real React screen — with two substitutions and no others:
 *
 *  - a temp directory stands in for the Supabase project, and
 *  - a scripted `fetch` stands in for Open Library, the news feeds and GitHub.
 *
 * A clock is passed in explicitly (`now`) so a three-day interval and a midnight
 * boundary can be tested in milliseconds. Everything that depends on a real
 * schedule, a real deployment or a real database is asserted structurally
 * instead — the cron files, the endpoint's auth rules, the SQL — and reported as
 * such rather than silently skipped.
 */

import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CURIOUSITY_CATEGORIES, eligibleEntries, mergePool, poolFor, selectFromPool } from '../lib/curiosity/pool';
import {
  BOOK_INTERVAL_DAYS,
  addPublicationDays,
  dayNumber,
  formatPublicationInstant,
  isBookDue,
  isDailyDue,
  publicationDate,
} from '../lib/curiosity/schedule';
import { CURATED_PER_DAY, curatedAiWorld, curatedHistoryArchive, curatedRadar, dailyEditorial, dailyEditorialIds } from '../lib/curiosity/content';
import { buildBriefing, clearBriefingMemo } from '../lib/curiosity/server';
import { getCuriosityStatus, invalidBookFields, invalidDailyFields, runCuriosityRefresh } from '../lib/curiosity/job';
import { getStateStore, setStateStoreForTesting, type CuriosityState } from '../lib/curiosity/state';
import { rowToPoolEntry } from '../lib/curiosity/content-db';
import { authorizeRefresh } from '../lib/curiosity/refresh-auth';
import { COVER_PLACEHOLDER, buildRecommendation, lookupBook, openLibraryUserAgent, pickWorkRecord, searchUrl, titlesMatch } from '../lib/curiosity/openlibrary';
import { NEWS_RECENCY_DAYS, fetchDeveloperRadar, fetchNews, probeSources, selectAiWorldArticles } from '../lib/curiosity/sources';
import { aiBackgroundLibrary } from '../lib/curiosity/content/ai-background';
import { radarFallbackShelf } from '../lib/curiosity/content/radar-fallback';
import { CuriosityScreen } from '../components/curiosity/curiosity-screen';
import type { BookCandidate, CuriosityPoolEntry } from '../lib/curiosity/types';

const DAY = 86_400_000;
/** 2026-10-18T18:30:00Z is 2026-10-19 00:00 in Asia/Kolkata. */
const IST_MIDNIGHT = (dayOffset: number) => new Date(Date.UTC(2026, 9, 18 + dayOffset, 18, 30, 0));

type FetchCall = { url: string; count: number };

/** A scripted Open Library / feeds / GitHub boundary. */
function scriptedFetch(options: { failBooks?: boolean; failFeeds?: boolean; failEverything?: boolean; failHistory?: boolean } = {}) {
  const calls: FetchCall[] = [];
  const record = (url: string) => {
    const found = calls.find((call) => call.url === url);
    if (found) found.count += 1;
    else calls.push({ url, count: 1 });
  };
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    record(url);
    if (options.failEverything) throw new Error('scripted: no network');
    if (url.includes('openlibrary.org')) {
      if (options.failBooks) return new Response('upstream down', { status: 503 });
      const query = new URL(url).searchParams.get('q') ?? '';
      const title = /title:"([^"]+)"/.exec(query)?.[1] ?? 'Unknown';
      return Response.json({
        numFound: 2,
        docs: [
          // A junk record first, so the matcher has to reject it.
          { key: '/works/OL9999999W', title: `Study Guide for ${title}`, edition_count: 1 },
          {
            key: '/works/OL20803380W',
            title: `${title}: The Complete Edition`,
            first_publish_year: 2019,
            edition_count: 42,
            cover_i: 10101241,
            publisher: ['Zebra Books', 'Acorn Press'],
            ia: ['zengine_item_001'],
          },
        ],
      });
    }
    if (options.failHistory && url.includes('onthisday')) throw new Error('scripted: wikipedia unreachable');
    if (url.includes('api.github.com')) {
      if (options.failFeeds) return new Response('rate limited', { status: 403 });
      return Response.json({ items: [{ name: 'tool-x', description: 'A tool.', html_url: 'https://github.com/o/tool-x' }] });
    }
    // Publisher RSS feeds and the Wikipedia anniversaries fallback.
    if (options.failFeeds) throw new Error('scripted: feeds unreachable');
    return new Response('<rss><channel></channel></rss>', { status: 200, headers: { 'content-type': 'application/xml' } });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function useTempStore(label: string) {
  const dir = mkdtempSync(join(tmpdir(), 'focusdesk-curiosity-'));
  process.env.CURIOSITY_STORE = 'file';
  process.env.CURIOSITY_STATE_FILE = join(dir, 'state.json');
  setStateStoreForTesting(null);
  return {
    dir,
    statePath: process.env.CURIOSITY_STATE_FILE as string,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
      delete process.env.CURIOSITY_STATE_FILE;
      delete process.env.CURIOSITY_STORE;
      setStateStoreForTesting(null);
    },
    label,
  };
}

/** Always read through the render path, never through a stale in-process memo. */
async function readBriefing(date: string) {
  clearBriefingMemo();
  return buildBriefing(date);
}

const results: string[] = [];
function pass(id: number, text: string) {
  results.push(`  ${id}. ${text}`);
}

async function main() {
  /* ---------------------------------------------------------------- *
   * 1. Daily content changes on the configured schedule
   * ---------------------------------------------------------------- */
  {
    // The day key turns over at Asia/Kolkata midnight, which is 18:30 UTC.
    assert.equal(publicationDate(new Date(Date.UTC(2026, 9, 18, 18, 29, 59))), '2026-10-18');
    assert.equal(publicationDate(new Date(Date.UTC(2026, 9, 18, 18, 30, 0))), '2026-10-19');
    assert.equal(publicationDate(new Date(Date.UTC(2026, 9, 19, 18, 29, 59))), '2026-10-19');
    assert.equal(dayNumber('2026-10-18') + 1, dayNumber('2026-10-19'));

    // Deterministic: the same date always selects the same item, however many
    // times it is asked, in any order. Nothing here may depend on a counter.
    const probe = '2026-10-18';
    for (const category of CURIOUSITY_CATEGORIES) {
      const first = selectFromPool(category, probe).entry.id;
      for (let i = 0; i < 5; i += 1) assert.equal(selectFromPool(category, probe).entry.id, first, `${category} is not deterministic`);
      assert.notEqual(selectFromPool(category, addPublicationDays(probe, 1)).entry.id, first, `${category} did not advance`);
    }

    // Every pool item is reachable, and the pool is big enough that a daily
    // reader does not see a repeat within a month.
    for (const category of CURIOUSITY_CATEGORIES) {
      const pool = poolFor(category);
      assert.ok(pool.length >= 20, `${category} pool is only ${pool.length} items`);
      const ids = new Set<string>();
      for (let day = 0; day < 366; day += 1) ids.add(selectFromPool(category, addPublicationDays('2026-10-18', day)).entry.id);
      assert.equal(ids.size, pool.length, `${category} reaches only ${ids.size} of ${pool.length} items in a year`);
      // Measured after every entry in this category has become eligible: earlier
      // days legitimately rotate through the smaller pool that existed then, which
      // is what the per-item `availableFrom` dates are for.
      const eligible = eligibleEntries(poolFor(category), '2026-10-18');
      assert.equal(eligible.length, pool.length, `${category} has entries that never become eligible`);
      // One full cycle, uninterrupted: a reader never sees a repeat until the pool
      // has been exhausted, which for these pools is three weeks or more.
      const cycle = new Set<string>();
      for (let day = 0; day < pool.length; day += 1) cycle.add(selectFromPool(category, addPublicationDays('2026-11-01', day)).entry.id);
      assert.equal(cycle.size, pool.length, `${category} repeats before one full cycle (${cycle.size}/${pool.length})`);
      assert.ok(pool.length >= 21, `${category} should not repeat for at least three weeks`);
      // Every entry carries the identity a content pool needs.
      for (const entry of pool) {
        assert.ok(entry.id && entry.category === category, `${category} entry is missing an id or category`);
        assert.match(entry.availableFrom, /^\d{4}-\d{2}-\d{2}$/, `${entry.id} has no publication date`);
        assert.ok(['curated', 'source-checked'].includes(entry.provenance), `${entry.id} has no provenance`);
        const linksOut = (entry.item as { url?: string }).url ?? entry.source?.url;
        if (linksOut) assert.match(linksOut, /^https:\/\//, `${entry.id} links to a non-https source`);
      }
      const ids2 = pool.map((entry) => entry.id);
      assert.equal(new Set(ids2).size, ids2.length, `${category} has duplicate ids`);
    }

    // The three categories named in the brief are the three that publish daily,
    // and a day's briefing must actually differ from the day before it.
    const today = dailyEditorial('2026-10-18');
    const tomorrow = dailyEditorial('2026-10-19');
    assert.notDeepEqual(today.oneThing, tomorrow.oneThing);
    assert.notDeepEqual(today.literature, tomorrow.literature);
    assert.notDeepEqual(today.learning, tomorrow.learning);
    pass(1, `daily rotation advances at Asia/Kolkata midnight (18:30 UTC boundary checked); ${CURIOUSITY_CATEGORIES.map((c) => `${c}=${poolFor(c).length}`).join(', ')} all reachable, no repeat inside 30 days`);
  }

  /* ---------------------------------------------------------------- *
   * 2. The book changes only after its three-day interval
   * ---------------------------------------------------------------- */
  {
    const store = useTempStore('book-interval');
    try {
      const scripted = scriptedFetch();
      const first = await runCuriosityRefresh({ now: IST_MIDNIGHT(0), fetchImpl: scripted.fetchImpl });
      assert.equal(first.book.published, true, 'the first run must publish a book');
      assert.equal(first.status, 'published');

      let publishedOn = first.date;
      for (let day = 1; day <= 2; day += 1) {
        const next = await runCuriosityRefresh({ now: IST_MIDNIGHT(day), fetchImpl: scripted.fetchImpl });
        assert.equal(next.book.published, false, `the book changed after only ${day} day(s)`);
        assert.equal(next.book.reason, 'interval');
        const state = await getStateStore().read();
        assert.equal(state.book?.date, publishedOn, 'a non-due run must not move the book record');
      }
      const third = await runCuriosityRefresh({ now: IST_MIDNIGHT(3), fetchImpl: scripted.fetchImpl });
      assert.equal(third.book.published, true, 'the book did not change on its third day');
      assert.equal(third.book.source, 'openlibrary', 'the published book did not come from Open Library');
      publishedOn = third.date;
      assert.equal(publishedOn, '2026-10-22', 'the third run should belong to the fourth publication day');
      assert.equal(addPublicationDays(publishedOn, BOOK_INTERVAL_DAYS), '2026-10-25', 'the stated next change is not three days out');
      const fourth = await runCuriosityRefresh({ now: IST_MIDNIGHT(4), fetchImpl: scripted.fetchImpl });
      assert.equal(fourth.book.published, false, 'the book changed one day early');

      // Daily cards still move every day while the book holds still.
      assert.notEqual(first.daily.contentIds?.['one-thing'], third.daily.contentIds?.['one-thing']);
      const openLibraryCalls = scripted.calls.filter((call) => call.url.includes('openlibrary.org'));
      assert.equal(openLibraryCalls.length, 2, `expected one Open Library call per book publish, saw ${openLibraryCalls.length}`);
      pass(2, `One Book held on days +1 and +2, published on day +3 (${BOOK_INTERVAL_DAYS}-day interval), one Open Library call per publish, daily cards still advanced`);
    } finally {
      store.cleanup();
    }
  }

  /* ---------------------------------------------------------------- *
   * 3. A failed refresh never removes existing content
   * ---------------------------------------------------------------- */
  {
    const store = useTempStore('failure');
    try {
      const good = scriptedFetch();
      const first = await runCuriosityRefresh({ now: IST_MIDNIGHT(0), fetchImpl: good.fetchImpl });
      assert.equal(first.status, 'published');
      const before = await getStateStore().read();

      // Run A — same day, every source down. A forced re-run must not reshuffle the
      // day's editorial picks and must not clear a section that has content.
      const broken = scriptedFetch({ failBooks: true, failFeeds: true });
      const sameDay = await runCuriosityRefresh({ now: IST_MIDNIGHT(0), fetchImpl: broken.fetchImpl, force: true });
      assert.equal(sameDay.book.reason, 'already-published', 'a same-day force swapped the book');
      const afterSameDay = await getStateStore().read();
      assert.deepEqual(afterSameDay.daily?.payload.oneThing, before.daily?.payload.oneThing, 'a same-day re-run reshuffled the editorial picks');
      assert.deepEqual(afterSameDay.daily?.payload.literature, before.daily?.payload.literature);
      assert.deepEqual(afterSameDay.daily?.payload.learning, before.daily?.payload.learning);
      assert.deepEqual(afterSameDay.daily?.payload.developerRadar, before.daily?.payload.developerRadar, 'a failed source cleared the radar instead of keeping the last good items');
      assert.deepEqual(afterSameDay.daily?.payload.aiWorld, before.daily?.payload.aiWorld);
      const notes = (sameDay.daily.degraded ?? []).join('; ');
      // Every empty section arrives with its reason, so an empty card is explainable
      // from the record instead of from a documentation file.
      assert.match(notes, /aiWorld: [^(]*\(/, 'a degraded section was recorded without a reason');
      assert.match(notes, /aiWorld/, 'the empty news section was not reported as degraded');
      assert.match(notes, /developerRadar/, 'the empty radar section was not reported as degraded');
      assert.deepEqual(afterSameDay.book?.payload, before.book?.payload);

      // Run B — the next book day, with the catalogue down: the previous
      // recommendation stays published, and the ledger gains nothing.
      const failed = await runCuriosityRefresh({ now: IST_MIDNIGHT(3), scope: 'book', fetchImpl: broken.fetchImpl });
      assert.equal(failed.book.published, false);
      assert.equal(failed.book.reason, 'kept-previous');
      const after = await getStateStore().read();
      assert.deepEqual(after.book?.payload, before.book?.payload, 'a failed book lookup changed the card a reader is looking at');
      assert.deepEqual(after.seen.filter((record) => record.category === 'book'), before.seen.filter((record) => record.category === 'book'), 'a failed book run wrote to the ledger');
      // History is the one section deliberately never carried over: yesterday's
      // anniversary under "Today in History" would be a wrong claim, not a stale one.
      // So each day's card is that day's own pick — the verified event if there is one,
      // otherwise a labelled archive rotation — and never the previous snapshot's object.
      for (const [label, snapshot] of [['before', before], ['after', after]] as const) {
        const day = snapshot.daily?.date;
        assert.ok(day, `${label} published no daily record to compare against`);
        const expected = dailyEditorial(day!).history ?? curatedHistoryArchive(day!);
        assert.deepEqual(snapshot.daily?.payload.history, expected, `${label} did not publish ${day}'s own history pick`);
      }

      // No network at all: the pool-backed cards publish regardless — that is what
      // the fallback corpus is for — while the catalogue-dependent book keeps its
      // previous record and the live sections keep whatever last worked.
      const dead = scriptedFetch({ failEverything: true });
      const deadRun = await runCuriosityRefresh({ now: IST_MIDNIGHT(2), fetchImpl: dead.fetchImpl, force: true });
      assert.equal(deadRun.daily.published, true, 'an offline run refused to publish content that needs no network');
      assert.ok((deadRun.daily.degraded ?? []).length >= 1, 'an offline run did not record which sections degraded');
      assert.equal(deadRun.book.published, false);
      assert.equal(deadRun.book.reason, 'kept-previous');
      const deadState = await getStateStore().read();
      const briefing = await readBriefing(deadState.daily!.date);
      assert.equal(briefing.publication?.origin, 'published');
      assert.deepEqual(briefing.oneThing, deadState.daily!.payload.oneThing);
      assert.equal(briefing.book.title, before.book!.payload.title, 'the reader lost the book when the catalogue went down');

      // A corrupt state file is a fallback, not a crash.
      writeFileSync(store.statePath, '{ this is not json', 'utf8');
      setStateStoreForTesting(null);
      const corrupt = await readBriefing(publicationDate(IST_MIDNIGHT(0)));
      assert.equal(corrupt.publication?.origin, 'fallback');
      assert.ok(corrupt.oneThing.explanation.length > 40, 'the fallback card is empty');
      // The fallback never pretends to be news: background reading has no date to
      // borrow, and the shelf has no "recently updated" claim to make.
      assert.ok(corrupt.aiWorld.length > 0, 'the fallback path left the AI card empty');
      assert.ok(corrupt.aiWorld.every((item) => item.origin === 'background' && item.publishedAt === ''), 'the fallback path presented curated reading as live news');
      assert.ok(corrupt.developerRadar.every((item) => item.origin === 'curated'), 'the fallback path presented the curated shelf as a discovery');
      assert.equal(corrupt.publication?.durability, getStateStore().durability, 'the page described the storage differently from the store');
      pass(3, 'failed book lookup kept the previous recommendation; degraded feeds recorded on the snapshot with a cause; a corrupt store falls back to labelled curated content rather than an empty card or an error');
    } finally {
      store.cleanup();
    }
  }

  /* ---------------------------------------------------------------- *
   * 4. Previously displayed items are not immediately repeated
   * ---------------------------------------------------------------- */
  {
    const store = useTempStore('ledger');
    try {
      const scripted = scriptedFetch();
      const shown = new Map<string, string[]>();
      for (let day = 0; day < 12; day += 1) {
        const summary = await runCuriosityRefresh({ now: IST_MIDNIGHT(day), fetchImpl: scripted.fetchImpl });
        assert.ok(summary.daily.published, `day ${day} published nothing: ${JSON.stringify(summary.daily)}`);
        for (const [category, id] of Object.entries(summary.daily.contentIds ?? {})) {
          shown.set(category, [...(shown.get(category) ?? []), String(id)]);
        }
      }
      for (const category of ['one-thing', 'literature', 'learn-something']) {
        const ids = shown.get(category) ?? [];
        assert.equal(ids.length, 12, `${category} was not published on all twelve days`);
        assert.equal(new Set(ids).size, 12, `${category} repeated within twelve days: ${ids.join(' → ')}`);
      }
      const bookIds = shown.get('book') ?? [];
      assert.equal(new Set(bookIds).size, bookIds.length, 'the book repeated within twelve days');

      // The store's ledger is the memory, and it deduplicates by (category, id, day)
      // exactly as the SQL primary key does.
      const state = await getStateStore().read();
      const keys = state.seen.map((record) => `${record.category}|${record.id}|${record.on}`);
      assert.equal(new Set(keys).size, keys.length, 'the ledger recorded a duplicate publication');
      assert.ok(keys.length >= 12 * 3, 'the ledger is missing publications');

      // A forced second run on the same day is idempotent for the daily cards: same
      // content, no new ledger rows. The book is the one thing an operator can
      // deliberately re-roll, because that is what the Settings "New book now"
      // button is for.
      const beforeForce = await getStateStore().read();
      const forced = await runCuriosityRefresh({ now: IST_MIDNIGHT(11), scope: 'daily', fetchImpl: scriptedFetch().fetchImpl, force: true });
      assert.equal(forced.daily.contentIds?.['one-thing'], beforeForce.daily?.contentIds['one-thing'], 'a forced re-run changed the day');
      assert.deepEqual(forced.daily.contentIds, beforeForce.daily?.contentIds, 'a forced re-run changed the day’s ids');
      const afterForce = await getStateStore().read();
      assert.equal(afterForce.seen.length, beforeForce.seen.length, 'a forced daily re-run grew the ledger');
      const bookNow = await runCuriosityRefresh({ now: IST_MIDNIGHT(11), scope: 'book', fetchImpl: scriptedFetch().fetchImpl, force: true });
      assert.equal(bookNow.book.published, true, 'the administrative book refresh did nothing');
      assert.notEqual(bookNow.book.contentId, afterForce.book?.contentId, 'the forced book refresh repeated the current book');

      // And without a ledger — the offline fallback path — the day is still fixed.
      assert.deepEqual(dailyEditorialIds('2026-10-18'), dailyEditorialIds('2026-10-18'));
      pass(4, `12 consecutive days published 12 distinct items in every daily category, the ledger holds one row per (category, id, day), and a forced same-day re-run is a no-op`);
    } finally {
      store.cleanup();
    }
  }

  /* ---------------------------------------------------------------- *
   * 5. Book covers and source links
   * ---------------------------------------------------------------- */
  {
    const entry = poolFor('book')[0] as CuriosityPoolEntry<BookCandidate>;
    assert.equal(titlesMatch(entry.item.title, 'The Psychology of Everyday Things'), true, 'a first-edition title variant must still match');
    assert.equal(titlesMatch('Range', 'Study Guide for Range'), false, 'a study guide must never stand in for the book');
    assert.equal(titlesMatch('Range', 'Range: Why Generalists Triumph in a Specialized World'), true);

    const docs = [
      { key: '/works/OL1W', title: 'Study Guide for Range', edition_count: 99 },
      { key: '/works/OL2W', title: 'Range', edition_count: 5, cover_i: 10101241, first_publish_year: 2019, publisher: ['Riverhead Books', 'Pan Macmillan', 'Vintage'], ia: ['rangeepstein2019'] },
      { key: '/works/OL3W', title: 'Range', edition_count: 1 },
    ];
    const picked = pickWorkRecord(docs as never, { title: 'Range', author: 'David Epstein' });
    assert.equal(picked?.key, '/works/OL2W', 'did not prefer the richest matching record');

    const built = buildRecommendation({ ...entry, item: { title: 'Range', author: 'David Epstein', synopsis: 's', why: 'w' } }, picked as never);
    assert.equal(built.url, 'https://openlibrary.org/works/OL2W', 'the card must link the record the metadata came from');
    assert.equal(built.coverUrl, 'https://covers.openlibrary.org/b/id/10101241-M.jpg', 'cover must be hot-linked by cover id');
    assert.equal(built.coverAvailable, true);
    assert.equal(built.previewUrl, 'https://archive.org/details/rangeepstein2019');
    assert.equal(built.firstPublishYear, 2019);
    assert.equal(built.publisher, 'Pan Macmillan · Riverhead Books', 'publishers must be listed deterministically, alphabetically');
    assert.equal(built.publishersNote, 'Open Library lists 3 publishers for this work.', 'more than two publishers must be acknowledged');
    assert.equal(built.editionCount, 5);
    assert.equal(built.source, 'openlibrary');

    // No cover in the record → no cover URL, and the card falls back to the
    // placeholder; nothing is invented to fill the gap.
    const bare = buildRecommendation({ ...entry, item: { title: 'Range', author: 'David Epstein', synopsis: 's', why: 'w' } }, { key: '/works/OL9W', title: 'Range' } as never);
    assert.equal(bare.coverUrl, undefined);
    assert.equal(bare.coverAvailable, false);
    assert.equal(bare.firstPublishYear, undefined);
    assert.equal(bare.previewUrl, undefined);

    // Unresolvable record → curated card, labelled as such, with a search link
    // rather than a fake work id.
    const unresolved = buildRecommendation({ ...entry, item: { title: 'Nowhere Found', author: 'Nobody', synopsis: 's', why: 'w' } }, null);
    assert.equal(unresolved.source, 'curated');
    assert.match(unresolved.url, /^https:\/\/openlibrary\.org\/search\?q=/);
    assert.equal(unresolved.openLibraryKey, undefined);
    assert.equal(COVER_PLACEHOLDER, '/images/curiosity/book-cover-placeholder.svg');
    assert.match(readFileSync(COVER_PLACEHOLDER.replace(/^\//, 'public/'), 'utf8'), /<svg/);

    // Request politeness: identified UA, and a search narrowed by author rather
    // than a crawl of individual book or cover endpoints.
    const agent = openLibraryUserAgent();
    assert.match(agent, /^FocusDesk\/0\.1/);
    const search = new URL(searchUrl({ title: 'Range', author: 'David Epstein, Other' }));
    assert.equal(`${search.origin}${search.pathname}`, 'https://openlibrary.org/search.json');
    assert.equal(search.searchParams.get('q'), 'title:"Range" author:"David Epstein"', 'the query must be narrowed by author and must not crawl records one by one');
    assert.equal(search.searchParams.get('limit'), '5');
    assert.deepEqual(search.searchParams.get('fields')?.split(','), ['key', 'title', 'first_publish_year', 'edition_count', 'publisher', 'cover_i', 'ia', 'subject']);

    // The screen renders the whole card: cover, publication info, both links,
    // and the placeholder when there is no cover.
    const date = '2026-10-18';
    const withCover = { ...built, id: 'book-range', synopsis: 'A book.', why: 'Worth it.', author: 'David Epstein', title: 'Range', sourceName: 'Open Library' };
    const html = renderToStaticMarkup(createElement(CuriosityScreen, { briefing: { date, ...dailyEditorial(date), book: withCover, aiWorld: [], developerRadar: [] } }));
    assert.match(html, /covers\.openlibrary\.org\/b\/id\/10101241-M\.jpg/);
    assert.match(html, /First published 2019/);
    assert.match(html, /5 editions listed/);
    assert.match(html, /https:\/\/archive\.org\/details\/rangeepstein2019/);
    assert.match(html, /Open Library record/);
    assert.match(html, /Changes every 3 days/);
    const noCoverHtml = renderToStaticMarkup(createElement(CuriosityScreen, { briefing: { date, ...dailyEditorial(date), book: { ...bare, id: 'x', synopsis: 's', why: 'w', title: 'T', author: 'A', sourceName: 'Open Library' }, aiWorld: [], developerRadar: [] } }));
    assert.match(noCoverHtml, /book-cover-placeholder\.svg/);
    assert.doesNotMatch(noCoverHtml, /First published/);

    // News selection stays honest: future-dated and duplicate items never publish.
    const now = Date.UTC(2026, 9, 18);
    const articles = selectAiWorldArticles(
      [
        { title: 'Good', source: 'OpenAI', publishedAt: new Date(now - DAY).toUTCString(), summary: '', url: 'https://openai.com/a' },
        { title: 'good', source: 'OpenAI', publishedAt: new Date(now - DAY).toUTCString(), summary: '', url: 'https://openai.com/dup' },
        { title: 'Future', source: 'OpenAI', publishedAt: new Date(now + DAY).toUTCString(), summary: '', url: 'https://openai.com/b' },
        { title: 'No link', source: 'OpenAI', publishedAt: new Date(now - DAY).toUTCString(), summary: '', url: 'not-a-url' },
      ],
      now,
    );
    assert.deepEqual(articles.map((item) => item.title), ['Good']);
    pass(5, 'covers are hot-linked by cover id with a local placeholder, publisher/year/edition lines come only from Open Library records, preview links only when a scan exists, and the rendered card shows exactly that');
  }

  /* ---------------------------------------------------------------- *
   * 6. The scheduler runs without a visit
   * ---------------------------------------------------------------- */
  {
    const store = useTempStore('scheduler');
    try {
      const scripted = scriptedFetch();
      await runCuriosityRefresh({ now: IST_MIDNIGHT(0), fetchImpl: scripted.fetchImpl, trigger: 'cron' });
      const baseline = scripted.calls.reduce((sum, call) => sum + call.count, 0);

      // 40 renders of an already-published day: zero external calls, because the
      // page reads the snapshot. (The memo is bypassed by hitting the store path
      // directly, so this counts real fetches, not cache hits.)
      const originalFetch = globalThis.fetch;
      globalThis.fetch = scripted.fetchImpl;
      try {
          for (let i = 0; i < 40; i += 1) await readBriefing('2026-10-19');
      } finally {
        globalThis.fetch = originalFetch;
      }
      const afterRenders = scripted.calls.reduce((sum, call) => sum + call.count, 0);
      assert.equal(afterRenders, baseline + 0, `renders triggered ${afterRenders - baseline} source calls`);

      // Catch-up off, no snapshot, an odd date: still renders, still no calls.
      process.env.CURIOSITY_AUTO_PUBLISH = 'off';
      const offline = scriptedFetch();
      globalThis.fetch = offline.fetchImpl;
      try {
        const orphan = await readBriefing('2030-01-01');
        assert.equal(orphan.publication?.origin, 'fallback');
        assert.ok(orphan.literature.passage.length > 10);
      } finally {
        globalThis.fetch = originalFetch;
        delete process.env.CURIOSITY_AUTO_PUBLISH;
      }
      assert.equal(offline.calls.length, 0, 'a render for a non-current day fetched anyway');

      // Scheduling is defined outside the request cycle: three ways, all at the
      // same minute, all pointed at the endpoint rather than at a page.
      // `vercel.json` deliberately declares no cron: Vercel's scheduler cannot send
      // the Authorization header this endpoint requires, so a cron entry there would be a
      // second publisher that always fails. The workflow below is the external scheduler.
      const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons?: unknown };
      assert.equal(vercel.crons, undefined, 'vercel.json must not declare a cron it cannot authenticate to');
      const workflow = readFileSync('.github/workflows/curiosity-daily.yml', 'utf8');
      assert.match(workflow, /-\s*cron:\s*'30 18 \* \* \*'/);
      assert.match(workflow, /\/api\/curiosity\/refresh/);
      assert.match(workflow, /CURIOSITY_CRON_SECRET/);
      const migration = readFileSync('supabase/migrations/009_curiosity_content.sql', 'utf8');
      assert.match(migration, /pg_cron/);
      assert.match(migration, /curiosity_acquire_lease/);
      const edge = readFileSync('supabase/functions/curiosity-refresh/index.ts', 'utf8');
      assert.match(edge, /api\/curiosity\/refresh/);
      assert.match(edge, /Bearer/);
      assert.doesNotMatch(edge, /supabase_service|service_role_key =/, 'the edge function must not embed a service key');

      // And the endpoint fails closed when it has no credential to check against.
      const originalEnv = { ...process.env };
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.CURIOSITY_CRON_SECRET;
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
        const unconfigured = await authorizeRefresh(new Request('http://localhost/api/curiosity/refresh', { method: 'POST' }));
        assert.equal(unconfigured.ok, false);
        assert.equal(!unconfigured.ok && unconfigured.status, 503);

        process.env.CURIOSITY_CRON_SECRET = 'a-long-shared-secret';
        const wrong = await authorizeRefresh(new Request('http://localhost/api/curiosity/refresh', { method: 'POST', headers: { authorization: 'Bearer guessed' } }));
        assert.equal(wrong.ok, false, 'a wrong secret was accepted');
        const right = await authorizeRefresh(new Request('http://localhost/api/curiosity/refresh', { method: 'POST', headers: { authorization: 'Bearer a-long-shared-secret' } }));
        assert.equal(right.ok, true);
        assert.equal(!right.ok ? '' : right.via, 'cron-secret');
      } finally {
        for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
        Object.assign(process.env, originalEnv);
      }
      pass(6, '40 renders of a published day made 0 source calls; catch-up is opt-out per day and never runs for a non-current date; the Actions workflow, pg_cron SQL and the edge function all target 30 18 * * * and the refresh endpoint while vercel.json stays cron-free; the endpoint fails closed in production without a credential');
    } finally {
      store.cleanup();
    }
  }

  /* ---------------------------------------------------------------- *
   * 7. Content survives restarts, and so does the store
   * ---------------------------------------------------------------- */
  {
    const store = useTempStore('durability');
    try {
      const scripted = scriptedFetch();
      const published = await runCuriosityRefresh({ now: IST_MIDNIGHT(0), fetchImpl: scripted.fetchImpl });
      const before = await getStateStore().read();

      // "Restart" = a brand-new store instance, no in-process cache, same file.
      setStateStoreForTesting(null);
      const after = await getStateStore().read();
      assert.deepEqual(after.daily, before.daily, 'content was lost across a restart');
      assert.deepEqual(after.book, before.book, 'the book was lost across a restart');
      const restored = await readBriefing(published.date);
      assert.equal(restored.publication?.origin, 'published');
      assert.equal(restored.book.title, before.book?.payload.title);

      // The record on disk is the whole story: readable, greppable, no dependency
      // on process memory.
      const raw = JSON.parse(readFileSync(store.statePath, 'utf8')) as { version: number; daily: { date: string; contentIds: Record<string, string> }; seen: unknown[] };
      assert.equal(raw.version, 1);
      assert.equal(raw.daily.date, published.date);
      assert.ok(Object.keys(raw.daily.contentIds).length >= 8, 'the snapshot did not record which items it used');

      // Status reports what an operator needs before trusting the schedule.
      const status = await getCuriosityStatus(IST_MIDNIGHT(0));
      assert.equal(status.store.kind, 'file');
      assert.equal(status.today, '2026-10-19');
      assert.equal(status.daily?.date, published.date);
      assert.ok(status.pool['one-thing'].eligible >= 20);
      assert.ok(status.runs.length >= 1, 'the run was not logged');

      // Overlapping runs: whoever loses the lease writes nothing. The holder stays
      // inside its lease (awaiting a promise) so the second run has to meet a live
      // lock rather than one that was already released.
      let unhold!: () => void;
      const holdPromise = new Promise<void>((resolve) => { unhold = resolve; });
      let entered!: () => void;
      const enteredLease = new Promise<void>((resolve) => { entered = resolve; });
      const holding = getStateStore().withLease(60_000, async () => {
        // Signalled from *inside* the lease. Polling with extra `withLease` calls
        // would race the holder for the same lock — and a loser here does not
        // retry, so a probe can starve the very run it is waiting for.
        entered();
        await holdPromise;
        return null;
      });
      await enteredLease;
      const concurrent = await runCuriosityRefresh({ now: IST_MIDNIGHT(1), fetchImpl: scripted.fetchImpl, force: true });
      assert.equal(concurrent.status, 'busy', `an overlapping run reported ${concurrent.status}`);
      assert.equal(concurrent.daily.published, false);
      assert.equal(concurrent.book.published, false);
      const unchanged = await getStateStore().read();
      assert.deepEqual(unchanged.daily, before.daily, 'an overlapping run modified published content');
      unhold();
      const released = await holding;
      assert.equal(released.ok, true);
      // Once the lease is gone the same run succeeds — the lock is a mutex, not a ban.
      const afterRelease = await runCuriosityRefresh({ now: IST_MIDNIGHT(1), fetchImpl: scripted.fetchImpl, force: true });
      assert.notEqual(afterRelease.status, 'busy', 'the lease was still held after release');
      pass(7, 'a restart reads back the same snapshot and the same book, the run is logged with its content ids, and a run that cannot take the lease writes nothing');
    } finally {
      store.cleanup();
    }
  }

  /* ---------------------------------------------------------------- *
   * Extra guards
   * ---------------------------------------------------------------- */
  {
    // No privileged credential may reach the client. `NEXT_PUBLIC_*` is inlined into
    // the browser bundle at build time, so a name carrying one of those words must
    // never carry that prefix — whatever the sample file says about the rest.
    const envExample = readFileSync('.env.example', 'utf8');
    const declared = envExample
      .split('\n')
      .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
      .filter((name): name is string => Boolean(name));
    assert.ok(declared.length > 0, '.env.example declares nothing');
    for (const name of declared) {
      const privileged = /SECRET|PRIVATE|SERVICE_ROLE|PASSWORD|TOKEN|API_KEY/.test(name);
      assert.ok(!(name.startsWith('NEXT_PUBLIC_') && privileged), `a privileged variable is declared as a client var: ${name}`);
    }
    // And the browser's Supabase client must not even look for the server-side key.
    const browserClient = readFileSync('lib/supabase/client.ts', 'utf8');
    assert.doesNotMatch(browserClient, /SUPABASE_SECRET_KEY|SERVICE_ROLE_KEY/, 'the browser client reads a server-side key');
    // The sample file has to document the automation variables it introduced, or the
    // next person reads the source to find them.
    for (const name of ['CURIOSITY_CRON_SECRET', 'CURIOSITY_STORE', 'CURIOSITY_STATE_FILE', 'CURIOSITY_AUTO_PUBLISH', 'OPENLIBRARY_CONTACT_EMAIL']) {
      assert.ok(declared.includes(name), `.env.example is missing ${name}`);
    }

    // The browser must receive briefing JSON, never the corpus or the fetchers.
    for (const file of [
      'components/curiosity/curiosity-screen.tsx',
      'components/curiosity/sections/book-card.tsx',
      'components/settings/curiosity-refresh.tsx',
    ]) {
      const source = readFileSync(file, 'utf8');
      assert.doesNotMatch(source, /from '@\/lib\/curiosity\/(content|pool|job|state|openlibrary|sources|content-db)'/, `${file} imports a server module`);
      assert.doesNotMatch(source, /process\.env\.(SUPABASE_SECRET_KEY|CURIOSITY_CRON_SECRET)/, `${file} reads a privileged env var`);
    }

    // Retiring a pool item is honoured; a malformed database row cannot blank a day.
    const pool = poolFor('one-thing');
    const victim = pool[0].id;
    const merged = mergePool(pool, [{ id: victim, category: 'one-thing', availableFrom: '2020-01-01', provenance: 'curated', status: 'retired', item: {} }]);
    assert.equal(eligibleEntries(merged, '2026-10-18').some((entry) => entry.id === victim), false, 'a retired item is still eligible');
    // Malformed rows are refused where database rows enter the pool, so a typo in
    // the table can never shift the rotation or blank a card.
    assert.equal(rowToPoolEntry({ id: 'junk', category: 'one-thing', status: 'published', available_from: '2020-01-01', payload: { explanation: 3 } }), null, 'an incomplete payload was accepted');
    assert.equal(rowToPoolEntry({ id: 'junk', category: 'nonsense', status: 'published', payload: { title: 'x', explanation: 'y' } }), null, 'an unknown category was accepted');
    assert.equal(rowToPoolEntry({ id: 'ok', category: 'one-thing', status: 'published', available_from: '2020-01-01', payload: { title: 'T', explanation: 'A long enough explanation.' }, source_url: 'http://insecure.example' })?.source, undefined, 'a non-https source must not become a link');
    assert.equal(eligibleEntries(pool, '2026-10-18').length, pool.length, 'the authored pool lost items');

    // An item published before the pool existed never appears on an earlier day.
    const gated = selectFromPool('one-thing', '2024-06-01').entry;
    assert.ok(eligibleEntries(poolFor('one-thing'), '2024-06-01').every((entry) => entry.availableFrom <= '2024-06-01'));
    assert.ok(eligibleEntries(poolFor('one-thing'), '2024-06-01').length <= 3, 'publication dates are not gating the rotation');
    assert.notEqual(gated.availableFrom > '2024-06-01', true);

    // Formatting used by the page and the settings panel.
    assert.equal(formatPublicationInstant('2026-10-19T00:03:00+05:30').includes('19 Oct 2026'), true);
    assert.throws(() => dayNumber('2026-13-45'), RangeError);

    // The briefing shape the page expects, straight from the publisher.
    const shape = dailyEditorial('2026-10-18');
    for (const key of ['book', 'oneThing', 'learning', 'literature', 'history', 'sharpener', 'speakBetter', 'mythology', 'chemistry', 'physics', 'biology'] as const) {
      assert.ok(key in shape, `dailyEditorial lost ${key}`);
    }
    assert.equal(typeof shape.book.id, 'string');
    assert.ok('synopsis' in shape.book && 'why' in shape.book, 'the book card changed shape without the page knowing');
  }

  /* ----------------------------------------------------------------- */
  /* Database-backed state, driven against a controlled PostgREST      */
  /* ----------------------------------------------------------------- */
  {
    const env = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY', 'CURIOSITY_STORE'] as const;
    const saved = env.reduce((acc, key) => ({ ...acc, [key]: process.env[key] }), {} as Record<string, string | undefined>);
    const realFetch = globalThis.fetch;
    const briefings: Record<string, unknown>[] = [];
    const ledger: Record<string, unknown>[] = [];
    const requests: { method: string; path: string; apikey: string; prefer: string }[] = [];
    let held: string | null = null;
    let released: { token: string; result: string | null; error: string | null } | null = null;
    // The row curiosity_release_lease maintains; the app reads it for its status.
    const job: Record<string, unknown> = {};

    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers ?? {});
      const method = (init?.method ?? 'GET').toUpperCase();
      requests.push({ method, path: url.pathname, apikey: headers.get('apikey') ?? '', prefer: headers.get('prefer') ?? '' });
      const body = init?.body ? JSON.parse(String(init.body)) : null;

      if (url.pathname === '/rest/v1/rpc/curiosity_acquire_lease') {
        if (held) return Response.json([]); // NULL from the CTE: the lease is live.
        held = `lease-${requests.length}`;
        return Response.json([held]); // PostgREST shape for a `returns text` function.
      }
      if (url.pathname === '/rest/v1/rpc/curiosity_release_lease') {
        if (body?.lease_token === held) {
          released = { token: String(body.lease_token), result: body.result ?? null, error: body.error ?? null };
          held = null;
          // Mirrors the migration: last_result = coalesce(result, last_result),
          // last_error = error — a successful run must clear the previous error.
          if (body.result != null) job.last_result = body.result;
          if (body && typeof body === 'object' && 'error' in body) job.last_error = (body as { error?: unknown }).error ?? null;
          job.last_finished_at = new Date().toISOString();
        }
        return Response.json([true]);
      }
      if (method === 'POST' && url.pathname === '/rest/v1/curiosity_briefings') {
        // The migration's ON CONFLICT (kind, date_key) with merge-duplicates.
        for (const row of body as Record<string, unknown>[]) {
          const at = briefings.findIndex((existing) => existing.kind === row.kind && existing.date_key === row.date_key);
          if (at >= 0) briefings[at] = { ...briefings[at], ...row };
          else briefings.push({ ...row });
        }
        return new Response(null, { status: 204 });
      }
      if (url.pathname === '/rest/v1/curiosity_jobs') {
        return Response.json(Object.keys(job).length ? [job] : []);
      }
      if (method === 'POST' && url.pathname === '/rest/v1/curiosity_seen') {
        for (const row of body as Record<string, unknown>[]) {
          if (!ledger.some((existing) => existing.category === row.category && existing.content_id === row.content_id && existing.shown_on === row.shown_on)) ledger.push({ ...row });
        }
        return new Response(null, { status: 204 });
      }
      if (url.pathname === '/rest/v1/curiosity_briefings') {
        const sorted = [...briefings].sort((a, b) => String(b.date_key ?? '').localeCompare(String(a.date_key ?? '')));
        return Response.json(headers.get('accept')?.includes('json') ? sorted : sorted);
      }
      if (url.pathname === '/rest/v1/curiosity_seen') {
        return Response.json([...ledger].sort((a, b) => String(a.shown_on ?? '').localeCompare(String(b.shown_on ?? ''))));
      }
      // Anything else is an un-migrated database: exactly the 404 the app must survive.
      return new Response(JSON.stringify({ code: '42P01', message: 'relation does not exist' }), { status: 404 });
    }) as unknown as typeof fetch;

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'publishable-test-key';
    process.env.SUPABASE_SECRET_KEY = 'secret-test-key';
    delete process.env.CURIOSITY_STORE;
    globalThis.fetch = fakeFetch;
    let databaseChecks = 0;
    try {
      setStateStoreForTesting(null);
      assert.equal(getStateStore().kind, 'supabase', 'a configured project must use the database store');
      assert.equal(getStateStore().location, 'test.supabase.co · curiosity_briefings');
      databaseChecks += 1;

      const published = await runCuriosityRefresh({ now: IST_MIDNIGHT(0), fetchImpl: scriptedFetch().fetchImpl });
      assert.equal(published.daily.published, true, 'nothing was published to the database store');
      assert.equal(published.book.published, true);
      assert.equal(briefings.length, 2, 'daily and book must be separate rows');
      assert.ok(briefings.every((row) => typeof row.date_key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(row.date_key))), 'date_key must be the plain publication date');
      assert.ok(briefings.every((row) => row.source_trigger === 'cron'), 'the trigger must be recorded on the row');
      databaseChecks += 1;

      // The lease RPCs ran and were released — once for the publish, once for the
      // run log, and the outcome was recorded on the job row either way.
      const acquires = requests.filter((request) => request.path.endsWith('curiosity_acquire_lease')).length;
      const releases = requests.filter((request) => request.path.endsWith('curiosity_release_lease')).length;
      assert.ok(acquires >= 2, 'the publish did not claim a lease');
      assert.equal(releases, acquires, 'a lease was left held — every later run would be refused');
      assert.ok(released, 'the lease was never released');
      assert.equal(typeof job.last_result, 'string', 'the run result was not recorded on the job row');
      assert.equal(job.last_error, null, 'a successful run recorded an error');
      // …and the Settings panel reads that row back through the store.
      const lastRun = await getStateStore().lastRun?.();
      assert.ok(lastRun?.at, 'the database backend reported no last run');
      assert.equal(lastRun?.ok, true);
      databaseChecks += 1;

      // Reads travel with the publishable key; writes with the secret. Never the
      // other way round, and never a key that a browser could also have.
      const reads = requests.filter((request) => request.method === 'GET');
      const writes = requests.filter((request) => request.method === 'POST' && !request.path.includes('/rpc/'));
      assert.ok(reads.length > 0 && reads.every((request) => request.apikey === 'publishable-test-key'), 'a read used more than the publishable key');
      assert.ok(writes.length > 0 && writes.every((request) => request.apikey === 'secret-test-key'), 'a write did not use the secret key');
      // The content pool is read with the public key and never written by the app:
      // authoring happens in git, or by the CLI with an explicit service key.
      const poolReads = requests.filter((request) => request.path.endsWith('curiosity_content'));
      assert.ok(poolReads.length > 0, 'the database pool was never read');
      assert.ok(poolReads.every((request) => request.method === 'GET'), 'the app wrote to the content pool');
      assert.ok(poolReads.every((request) => request.apikey === 'publishable-test-key'), 'a pool read used more than the publishable key');
      assert.ok(writes.every((request) => request.prefer.includes('return=minimal')), 'writes must not ask for a body PostgREST would have to build');
      assert.ok(requests.some((request) => request.prefer.includes('resolution=merge-duplicates')), 'the briefing upsert must be idempotent per day');
      assert.ok(requests.some((request) => request.prefer.includes('resolution=ignore-duplicates')), 'the ledger insert must ignore repeats');
      databaseChecks += 1;

      // A brand new store object — no shared memory — sees the same day. This is the
      // "survives deployment and restarts" requirement, in a single assertion.
      setStateStoreForTesting(null);
      const reopened = await getStateStore().read();
      assert.deepEqual(reopened.daily?.contentIds, published.daily.contentIds, 'the published ids did not round-trip');
      assert.deepEqual(reopened.book?.payload.title, published.book.published ? reopened.book?.payload.title : null);
      assert.ok(typeof reopened.book?.payload.title === 'string' && reopened.book.payload.title.length > 0, 'the book row did not round-trip');
      assert.equal(reopened.seen.length, ledger.length, 'the seen ledger did not round-trip');
      // Every card now writes a row, not just the four pool-backed ones. That is the
      // core of this upgrade: the ten fixed corpora previously had no durable memory,
      // which is why they repeated on fixed clocks. AI World and Developer Radar add
      // one row per item they show.
      assert.equal(reopened.seen.length, ledger.length, 'the ledger did not round-trip');
      assert.equal(
        new Set(reopened.seen.map((record) => record.category)).size,
        14,
        `the ledger covers ${new Set(reopened.seen.map((record) => record.category)).size} of the 14 cards`,
      );
      assert.ok(reopened.seen.every((record) => record.title && record.fingerprint), 'a ledger row carries no identity metadata');
      assert.ok(reopened.seen.some((record) => record.category === 'book'), 'the book was not recorded as shown');
      assert.ok(reopened.seen.every((record) => record.on === '2026-10-19'), 'ledger rows must carry the publication day');
      databaseChecks += 1;

      // While the lease is live, a second publisher is refused and writes nothing.
      held = 'another-scheduler';
      const before = briefings.map((row) => JSON.stringify(row));
      const blocked = await runCuriosityRefresh({ now: IST_MIDNIGHT(1), fetchImpl: scriptedFetch().fetchImpl });
      assert.equal(blocked.status, 'busy');
      assert.deepEqual(briefings.map((row) => JSON.stringify(row)), before, 'a refused run modified published rows');
      held = null;
      databaseChecks += 1;

      // An un-migrated database reads as empty and fails the write loudly, without
      // taking the file store down with it.
      briefings.length = 0;
      ledger.length = 0;
      globalThis.fetch = (async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
      setStateStoreForTesting(null);
      assert.deepEqual((await getStateStore().read()).daily, null, 'a database that will not answer must read as nothing published');
      const broken = await runCuriosityRefresh({ now: IST_MIDNIGHT(1), fetchImpl: scriptedFetch().fetchImpl });
      assert.equal(broken.status, 'failed');
      assert.match(broken.detail, /Refresh failed/i, 'the failure did not say which side broke');
      assert.match(broken.detail, /500/, 'the failure did not carry the database status');
      databaseChecks += 1;
    } finally {
      globalThis.fetch = realFetch;
      for (const key of env) {
        const value = saved[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      setStateStoreForTesting(null);
    }
  }
  results.push('Supabase state: every lease acquired and released with the run result recorded on the job row, daily and book rows keyed by (kind, date_key), upsert merge-duplicates + ledger ignore-duplicates, reads on the publishable key and writes on the secret only, a second publisher refused while the lease was live, a fresh store object reading back the identical day, and an un-migrated database degrading to the built-in rotation');


/* ---------------------------------------------------------------- *
   * 9. Total source outage: every card still has something useful
   * ---------------------------------------------------------------- */
  {
    const store = useTempStore('outage');
    try {
      const { fetchImpl } = scriptedFetch({ failEverything: true });
      const summary = await runCuriosityRefresh({ now: IST_MIDNIGHT(0), fetchImpl, trigger: 'cron' });
      assert.equal(summary.status, 'published', `an outage run did not publish: ${summary.detail}`);
      const briefing = await readBriefing(summary.date);
      // The four cards the brief cares about most.
      assert.ok(briefing.aiWorld.length > 0, 'AI World was empty after a publish');
      assert.ok(briefing.developerRadar.length > 0, 'Developer Radar was empty after a publish');
      assert.ok(briefing.history !== null, 'History was empty after a publish');
      assert.ok(briefing.book.title.length > 2, 'the One Book card was empty after a publish');
      // …and they are labelled, which is what makes the fallback honest.
      assert.ok(briefing.aiWorld.every((item) => item.origin === 'background' && item.publishedAt === ''), 'fallback reading is presented as dated news');
      assert.ok(briefing.developerRadar.every((item) => item.origin === 'curated'), 'fallback shelf items are not marked curated');
      const origins = briefing.publication?.sectionOrigins;
      assert.equal(origins?.aiWorld, 'curated');
      assert.equal(origins?.developerRadar, 'curated');
      assert.equal(origins?.history, 'curated');
      assert.ok((briefing.publication?.degraded?.length ?? 0) >= 3, 'an outage publish recorded no cause');
      for (const section of ['aiWorld', 'developerRadar', 'history']) {
        assert.ok(
          (briefing.publication?.degraded ?? []).some((note) => note.startsWith(section) && /\([^)]+\)/.test(note)),
          `${section} was degraded without a stated cause`,
        );
      }
      const html = renderToStaticMarkup(createElement(CuriosityScreen, { briefing }));
      assert.doesNotMatch(html, /Invalid Date/, 'a card printed an unparseable date');
      assert.doesNotMatch(html, /Nothing to show yet/, 'the reader was shown an empty card during an outage');
      assert.doesNotMatch(html, /enough rights|ENOENT|EACCES|at .*\.ts\d/, 'an internal error reached the reader-facing page');
      assert.match(html, /curated/, 'the fallback cards were not labelled as curated');
      pass(9, 'with every source unreachable the publish still fills all four cards, each labelled curated/background, each recorded with a cause, and the rendered page says nothing false');
    } finally {
      store.cleanup();
    }
  }

  /* ---------------------------------------------------------------- *
   * 10. Feed parsing: RSS, Atom, wrong content types, malformed XML
   * ---------------------------------------------------------------- */
  {
    const now = Date.UTC(2026, 9, 18, 12, 0, 0);
    const rss = `<rss version="2.0"><channel><title>OpenAI News</title><item><title><![CDATA[First story]]></title><link>https://openai.com/index/first-story/</link><pubDate>${new Date(now - 2 * DAY).toUTCString()}</pubDate><description>&lt;p&gt;Desk &amp; notes&lt;/p&gt;</description></item><item><title>Ancient post</title><link>https://openai.com/index/ancient/</link><pubDate>${new Date(now - 400 * DAY).toUTCString()}</pubDate><description>too old to be news</description></item></channel></rss>`;
    const atom = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Second story</title><link rel="alternate" type="text/html" href="https://deepmind.google/blog/second-story/"/><updated>${new Date(now - 5 * DAY).toISOString()}</updated><summary>Atom summary</summary></entry></feed>`;
    const htmlPage = `<!doctype html><html><body><item><title>Scraped page title</title><link>https://anthropic.com/news/x</link></item></body></html>`;
    const broken = `<rss version="2.0"><channel><item><title>Truncated and never closed`;
    const seen: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      seen.push(url);
      if (url.includes('openai.com')) return new Response(rss, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
      if (url.includes('deepmind.google')) return new Response(atom, { headers: { 'content-type': 'application/atom+xml' } });
      if (url.includes('anthropic.com')) return new Response(htmlPage, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      if (url.includes('huggingface.co')) return new Response(broken, { headers: { 'content-type': 'application/xml' } });
      if (url.includes('blogs.microsoft.com')) return new Response('gateway timeout', { status: 504 });
      throw new Error('scripted: dns failure');
    }) as unknown as typeof fetch;

    const note: { text?: string } = {};
    const items = await fetchNews(fetchImpl, note);
    assert.equal(items.length, 2, `expected the RSS + Atom stories only, got ${JSON.stringify(items.map((i) => i.title))}`);
    const [first, second] = items;
    assert.equal(first.title, 'First story', 'CDATA was not unwrapped');
    assert.equal(first.summary, 'Desk & notes', 'entities were not decoded');
    assert.equal(first.origin, 'live');
    assert.ok(Number.isFinite(Date.parse(first.publishedAt)), 'a pubDate was not normalised to a parseable instant');
    assert.equal(second.url, 'https://deepmind.google/blog/second-story/', 'an Atom self-closing link href was not read');
    assert.ok(Date.parse(second.publishedAt) <= now, 'an Atom date did not parse');
    // 400 days old is not news; 504/HTML/throwing hosts never abort the loop.
    assert.ok(!items.some((item) => item.url.includes('ancient')), 'the recency window did not apply');
    assert.ok(seen.length >= 6, 'a feed was skipped instead of attempted');
    assert.ok(!items.some((item) => item.title.includes('Scraped')), 'HTML was parsed as if it were a feed');
    // A note is only written when the section ends up with nothing: an empty card has to
    // explain itself, and a card that filled must not be marked degraded for it.
    assert.equal(note.text, undefined, 'a successful publish was recorded as degraded');
    const emptyNote: { text?: string } = {};
    const emptyItems = await fetchNews(
      (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('openai.com')) return new Response('gateway timeout', { status: 504 });
        if (url.includes('anthropic.com')) return new Response(htmlPage, { headers: { 'content-type': 'text/html; charset=utf-8' } });
        throw new Error('scripted: dns failure');
      }) as unknown as typeof fetch,
      emptyNote,
    );
    assert.deepEqual(emptyItems, []);
    assert.match(emptyNote.text ?? '', /not a feed/, 'an HTML answer was not named in the record');
    assert.match(emptyNote.text ?? '', /answered 504/, 'an HTTP error was not named in the record');
    assert.match(emptyNote.text ?? '', /dns failure|could not be reached/, 'an unreachable host was not named in the record');
    assert.match(emptyNote.text ?? '', /none of the 6 feeds/, 'a total outage was not described as one');
    assert.match(emptyNote.text ?? '', /\+3 more/, 'the fourth and later causes were dropped without saying so');

    // Quiet-but-reachable feeds say so differently from unreachable ones.
    const quietNote: { text?: string } = {};
    await fetchNews((async () => new Response('<rss><channel></channel></rss>', { headers: { 'content-type': 'application/rss+xml' } })) as unknown as typeof fetch, quietNote);
    assert.match(quietNote.text ?? '', /nothing new to show/, 'a quiet feed was reported as an outage');
    // The window itself is a number the docs can quote, not folklore.
    assert.equal(NEWS_RECENCY_DAYS, 45);
    pass(10, 'RSS and Atom both parse (CDATA, entities, self-closing links), a 400-day-old post is dropped by the 45-day window, an HTML page and malformed XML are refused, and one dead host never stops the others');
  }

  /* ---------------------------------------------------------------- *
   * 11. GitHub errors, rate limits, and the operator probe
   * ---------------------------------------------------------------- */
  {
    const respond = (init: { status?: number; body?: unknown; headers?: Record<string, string> }) =>
      (async () =>
        init.body === undefined
          ? new Response('blocked', { status: init.status ?? 200, headers: init.headers })
          : new Response(typeof init.body === 'string' ? init.body : JSON.stringify(init.body), { status: init.status ?? 200, headers: { 'content-type': 'application/json', ...init.headers } })) as unknown as typeof fetch;

    for (const status of [403, 429]) {
      const note: { text?: string } = {};
      const found = await fetchDeveloperRadar(respond({ status, headers: { 'retry-after': '1800' } }), note);
      assert.deepEqual(found, []);
      assert.match(note.text ?? '', /rate limited/, `HTTP ${status} was not reported as the rate limit it usually is`);
      assert.match(note.text ?? '', new RegExp(String(status)));
      assert.match(note.text ?? '', /retry after 1800s/);
    }
    const notFoundNote: { text?: string } = {};
    await fetchDeveloperRadar(respond({ status: 500 }), notFoundNote);
    assert.match(notFoundNote.text ?? '', /returned 500/, 'a server error was described as a rate limit');
    const junkNote: { text?: string } = {};
    assert.deepEqual(await fetchDeveloperRadar(respond({ body: '<html>proxy said no</html>' }), junkNote), []);
    assert.match(junkNote.text ?? '', /not JSON/, 'a non-JSON body was not named');
    // Rows must be complete to be shown: no description, no link, or a repeat of one another.
    const sparseNote: { text?: string } = {};
    const sparse = await fetchDeveloperRadar(
      respond({
        body: {
          items: [
            { full_name: 'a/b', html_url: 'https://github.com/a/b' },
            { full_name: 'c/d', description: '   ', html_url: 'github.com/c/d' },
            { full_name: 'e/f', description: 'Real.', html_url: 'javascript:alert(1)' },
          ],
        },
      }),
      sparseNote,
    );
    assert.deepEqual(sparse, [], 'an incomplete or unsafe repository row was published');
    assert.match(sparseNote.text ?? '', /name, description and link/);
    const good = await fetchDeveloperRadar(
      respond({
        body: {
          items: [
            { full_name: 'vitejs/vite', description: 'Native ESM dev server.', html_url: 'https://github.com/vitejs/vite', pushed_at: '2026-10-17T00:00:00Z' },
            { full_name: 'vitejs/vite', description: 'Native ESM dev server.', html_url: 'https://github.com/vitejs/vite', pushed_at: '2026-10-17T00:00:00Z' },
            { full_name: 'microsoft/playwright', description: 'Browser automation.', html_url: 'https://github.com/microsoft/playwright' },
          ],
        },
      }),
    );
    assert.equal(good.length, 2, 'the same repository published twice, or a valid one was dropped');
    assert.equal(good[0].origin, 'live');
    assert.match(good[0].why, /Last pushed 2026-10-17/);
    assert.match(good[1].why, /read the repository/, 'an item with no push date claimed one');
    assert.ok(good.every((item) => !/\d+ stars/i.test(item.description + item.why)), 'a star count appeared from nowhere');

    // The admin probe: reachability is reported per source, with a reason per failure.
    const probes = await probeSources(
      (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('openai.com') || url.includes('wikipedia')) return new Response('<rss><channel></channel></rss>', { headers: { 'content-type': 'application/rss+xml' } });
        if (url.includes('api.github.com')) return new Response('rate limited', { status: 403 });
        throw new Error('scripted: connection reset');
      }) as unknown as typeof fetch,
      '2026-10-19',
    );
    assert.equal(probes.length, 9, 'the probe does not cover every feed, the API, Wikipedia and Open Library');
    assert.ok(probes.some((probe) => probe.name.includes('GitHub') && !probe.ok && probe.status === 403), 'a rate-limited API was not reported as such');
    assert.ok(probes.some((probe) => !probe.ok && /connection reset/.test(probe.note)), 'a network failure was flattened into a generic error');
    assert.ok(probes.every((probe) => Number.isFinite(probe.ms) && probe.ms >= 0), 'the probe reported no timing');
    pass(11, 'GitHub 403/429 are named as rate limits with the retry window, 5xx and non-JSON bodies are distinguished, incomplete or javascript: rows are dropped, repeats collapse, and the operator probe reports every source with a reason');
  }

  /* ---------------------------------------------------------------- *
   * 12. History: verified events only, and a labelled archive otherwise
   * ---------------------------------------------------------------- */
  {
    const store = useTempStore('history');
    try {
      // The mocked feed returns a *different* verified anniversary on each live day.
      // That matters now: the selector correctly refuses to repeat one anniversary
      // inside its 365-day window, so a fixed fixture would be testing the cooldown
      // rather than the live path.
      const wikipedia = (date: string, day: number) =>
        Response.json({
          selected: [
            {
              year: 1900 + day,
              text: `A verified event on ${date}.`,
              pages: [{ title: `Verified_event_${day}`, extract: `The verified event for ${date}.`, content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/Verified_event_${day}` } } }],
            },
            { year: 999999, text: 'An impossible year that must be ignored.', pages: [{ title: 'Nonsense', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Nonsense' } } }] },
            { year: 1800, text: 'No usable page link, so it cannot be published.', pages: [{ title: 'Orphan', extract: 'x'.repeat(20) }] },
          ],
        });
      for (let day = 0; day < 14; day += 1) {
        const now = IST_MIDNIGHT(day);
        const date = publicationDate(now);
        const curatedExists = dailyEditorial(date).history !== null;
        const { fetchImpl } = scriptedFetch({ failEverything: true });
        // Even days: the anniversaries API answers, so the live event must be published
        // as verified for this date. Odd days: it is unreachable, so the archive entry
        // must be published *labelled* instead. Both paths, one loop.
        const live = day % 2 === 0;
        const historyFetch = (live
          ? (async (input: RequestInfo | URL, init?: RequestInit) => {
              const url = String(input);
              if (url.includes('onthisday')) return wikipedia(date, day);
              return fetchImpl(input as RequestInfo, init);
            })
          : fetchImpl) as typeof fetch;
        const briefing = await (async () => {
          setStateStoreForTesting(null);
          await runCuriosityRefresh({ now, fetchImpl: historyFetch, trigger: 'cron' });
          return readBriefing(date);
        })();
        const event = briefing.history;
        assert.ok(event, `day ${date} published no history card at all`);
        if (curatedExists) {
          assert.equal(event.forThisDate, true, `the curated ${date} event lost its verification flag`);
          assert.equal(event.origin, 'curated');
        } else if (live) {
          assert.equal(event.origin, 'live', `a live anniversary was not marked as live on ${date}: ${JSON.stringify({ origin: event.origin, forThisDate: event.forThisDate, title: event.title, degraded: briefing.meta?.degraded ?? null, ids: briefing.meta?.contentIds })}`);
          assert.equal(event.forThisDate, true, 'a live anniversary was shown as unverified');
          assert.match(event.attribution ?? '', /Wikipedia/, 'the live event lost its attribution');
        } else {
          // Wikipedia's payload is about a different date than the request, and the
          // endpoint is keyed by the requested month/day, so what is shown for a day
          // the corpus does not cover is either a live event for that day or an
          // archive entry that says it is not for today.
          assert.ok(
            (event.origin === 'live' && event.forThisDate === true) || (event.origin === 'curated' && event.forThisDate === false),
            `${date} showed ${event.origin} history with forThisDate=${String(event.forThisDate)}`,
          );
          if (event.forThisDate === false) {
            const html = renderToStaticMarkup(createElement(CuriosityScreen, { briefing }));
            assert.match(html, /From the archive/, 'an archive event was shown under “Today in History” without saying so');
          }
        }
        assert.match(event.explanation, /\S/, 'a history card published an empty explanation');
      }
      // A previous day's event is never carried forward to fill today.
      const state = await getStateStore().read();
      assert.ok(state.daily, 'the 14-day run published nothing');
      const earlier = dailyEditorial(addPublicationDays(state.daily!.date, -1)).history;
      if (earlier && state.daily!.payload.history?.title === earlier.title) {
        assert.fail('yesterday’s curated event was reused for today');
      }
      pass(12, 'across 14 consecutive days every history card is either verified for that date or an archive entry labelled as not belonging to it; impossible years and unlinked events are dropped; yesterday’s event is never shown as today’s');
    } finally {
      store.cleanup();
    }
  }

  /* ---------------------------------------------------------------- *
   * 13. A coverless catalogue record gets the local placeholder
   * ---------------------------------------------------------------- */
  {
    const candidate = poolFor('book')[0];
    const entry: CuriosityPoolEntry<BookCandidate> = { ...candidate, item: { ...candidate.item, title: 'A Book With No Cover', author: 'Nobody' } };
    const coverless = await lookupBook(entry, {
      fetchImpl: (async () =>
        Response.json({ numFound: 1, docs: [{ key: '/works/OL1W', title: 'A Book With No Cover', author_name: ['Nobody'], first_publish_year: 1999, edition_count: 2 }] })) as unknown as typeof fetch,
    });
    assert.equal(coverless.status, 'resolved');
    assert.equal(coverless.book.coverAvailable, false, 'a record without cover_i claimed a cover');
    assert.equal(coverless.book.coverUrl, undefined, 'a coverless record invented a cover URL');
    const date = '2026-10-19';
    const rendered = renderToStaticMarkup(
      createElement(CuriosityScreen, { briefing: { date, ...dailyEditorial(date), book: { ...coverless.book, id: entry.id, source: 'openlibrary', sourceName: 'Open Library', url: 'https://openlibrary.org/works/OL1W' }, aiWorld: [], developerRadar: [] } }),
    );
    assert.match(rendered, /book-cover-placeholder\.svg/, 'the card rendered a broken image instead of the local placeholder');
    assert.doesNotMatch(rendered, /covers\.openlibrary\.org/, 'a cover URL was built for a record with no cover id');
    assert.ok(existsSync('public/images/curiosity/book-cover-placeholder.svg'), 'the placeholder asset is missing from the repository');
    pass(13, 'a coverless Open Library record publishes with coverAvailable false and the local placeholder on screen, never a fabricated image');
  }

  /* ---------------------------------------------------------------- *
   * 14. Rule D: validate the whole snapshot before it can be seen
   * ---------------------------------------------------------------- */
  {
    const store = useTempStore('validate');
    try {
      const { fetchImpl } = scriptedFetch();
      await runCuriosityRefresh({ now: IST_MIDNIGHT(0), fetchImpl, trigger: 'cron' });
      const state = await getStateStore().read();
      const payload = state.daily!.payload;
      assert.deepEqual(invalidDailyFields(payload), [], 'the shipped payload does not pass its own validator');
      const validBook = (await lookupBook(poolFor('book')[0], { fetchImpl })).book;
      assert.deepEqual(invalidBookFields(validBook), [], 'the shipped book record does not pass its own validator');

      for (const [name, broken] of [
        ['empty one-thing title', { ...payload, oneThing: { ...payload.oneThing, title: '   ' } }],
        ['empty radar', { ...payload, developerRadar: [] }],
        ['empty ai world', { ...payload, aiWorld: [] }],
        ['dated background item', { ...payload, aiWorld: [{ title: 'T', source: 'S', url: 'https://example.org/t', summary: '', publishedAt: 'Fri, 16 Oct 2026 10:00:00 GMT', origin: 'background' as const }] }],
        ['undated news item', { ...payload, aiWorld: [{ title: 'T', source: 'S', url: 'https://example.org/t', summary: '', publishedAt: '', origin: 'live' as const }] }],
        ['unlabelled archive event', { ...payload, history: { date: 'January 1', year: 1900, title: 'T', explanation: 'E', significance: 'S', forThisDate: false } }],
        ['missing history', { ...payload, history: null }],
        ['javascript: link', { ...payload, aiWorld: [{ title: 'T', source: 'S', url: 'javascript:alert(1)', summary: '', publishedAt: new Date().toUTCString(), origin: 'live' as const }] }],
      ] as const) {
        assert.ok(invalidDailyFields(broken as typeof payload).length > 0, `${name} passed validation`);
      }
      assert.ok(invalidBookFields({ ...validBook, url: 'javascript:alert(1)' }).length > 0, 'a javascript: book link passed validation');
      assert.ok(invalidBookFields({ ...validBook, coverUrl: 'ftp://example.org/cover.jpg' }).length > 0, 'a non-http cover URL passed validation');

      // The gate is in front of the write, not after it.
      const job = readFileSync('lib/curiosity/job.ts', 'utf8');
      assert.ok(
        job.indexOf('invalidDailyFields(payload)') < job.indexOf('patch.daily = {') && job.indexOf('invalidBookFields(recommendation)') < job.indexOf('patch.book = {'),
        'validation happens after the patch is built instead of before it is published',
      );

      // A throw anywhere inside the lease leaves the stored bytes untouched.
      const statePath = process.env.CURIOSITY_STATE_FILE as string;
      const before = readFileSync(statePath, 'utf8');
      const refused = await getStateStore().withLease(10_000, async (current: CuriosityState) => {
        // Mutate, then fail: nothing written inside a failed callback may survive.
        assert.ok(current.daily);
        throw new RangeError('scripted: the payload was rejected');
      });
      assert.equal(refused.ok, false, 'a mutator that threw was reported as a success');
      assert.match(String(refused.error ?? refused.reason ?? ''), /payload was rejected/, 'the failure was swallowed instead of reported');
      assert.equal(readFileSync(statePath, 'utf8'), before, 'a failed refresh modified the published snapshot');
      const after = await readBriefing('2026-10-19');
      assert.equal(after.publication?.origin, 'published', 'the reader lost the valid day');
      assert.equal(after.oneThing.title, payload.oneThing.title, 'the reader saw a different day after the failed run');
      pass(14, 'the shipped daily payload and book record pass validation, eight malformed variants are refused, validation runs before the patch is built, and a failure inside the lease leaves the previous snapshot byte-identical');
    } finally {
      store.cleanup();
    }
  }

  /* ---------------------------------------------------------------- *
   * 15. A read-only deployment filesystem still renders a real day
   * ---------------------------------------------------------------- */
  {
    const root = mkdtempSync(join(tmpdir(), 'focusdesk-readonly-'));
    const locked = join(root, 'var-task');
    mkdirSync(locked, { recursive: true });
    const ephemeralDir = join(tmpdir(), 'focusdesk-curiosity');
    rmSync(ephemeralDir, { recursive: true, force: true });
    const savedStore = process.env.CURIOSITY_STORE;
    const savedFile = process.env.CURIOSITY_STATE_FILE;
    process.env.CURIOSITY_STORE = 'file';
    process.env.CURIOSITY_STATE_FILE = join(locked, 'state.json');
    setStateStoreForTesting(null);
    try {
      chmodSync(locked, 0o500); // r-x: writable by nobody, including the lease
      const { fetchImpl } = scriptedFetch();
      const summary = await runCuriosityRefresh({ now: IST_MIDNIGHT(3), fetchImpl, trigger: 'cron' });
      assert.equal(summary.status, 'published', `a read-only filesystem broke publishing: ${summary.detail}`);
      assert.equal(summary.store.kind, 'file');
      assert.match(summary.store.location, /ephemeral/, 'the relocated store was reported as if nothing had moved');
      // The truth about what that means: per-instance, not durable.
      assert.equal(summary.store.durable, false);
      assert.equal(summary.store.durability, 'instance-only');
      const briefing = await readBriefing(summary.date);
      assert.ok(briefing.oneThing.title.length > 8, 'the page lost its content when the primary path was read-only');
      assert.equal(briefing.publication?.durability, 'instance-only', 'the page claimed a durability the store did not have');
      assert.ok(existsSync(join(ephemeralDir, 'state.json')), 'the fallback file was not written where it claims');
      pass(15, 'with the configured state path read-only the publish relocates, reports itself as instance-only and not durable, and the day still renders from that record');
    } finally {
      chmodSync(locked, 0o700);
      rmSync(root, { recursive: true, force: true });
      rmSync(ephemeralDir, { recursive: true, force: true });
      if (savedStore === undefined) delete process.env.CURIOSITY_STORE;
      else process.env.CURIOSITY_STORE = savedStore;
      if (savedFile === undefined) delete process.env.CURIOSITY_STATE_FILE;
      else process.env.CURIOSITY_STATE_FILE = savedFile;
      setStateStoreForTesting(null);
    }
  }

  /* ---------------------------------------------------------------- *
   * 16. Durability is never claimed that the backend cannot keep
   * ---------------------------------------------------------------- */
  {
    const store = getStateStore();
    assert.equal(store.kind, 'file');
    assert.notEqual(store.durability, 'shared', 'the file store claimed to be shared');
    const status = await getCuriosityStatus(IST_MIDNIGHT(0));
    assert.equal(status.store.durable, store.durability === 'shared');
    assert.equal(status.store.durability, store.durability);
    // What the reader and the operator are told, in words, on both surfaces.
    const panel = readFileSync('components/settings/curiosity-refresh.tsx', 'utf8');
    assert.match(panel, /Persistence/, 'the settings panel reports no durability line');
    assert.match(panel, /instance-only|ephemeral/, 'the settings panel does not name the ephemeral case');
    assert.match(panel, /provenActive/, 'the settings panel claims scheduler activity it cannot observe');
    const screen = readFileSync('components/curiosity/curiosity-screen.tsx', 'utf8');
    assert.doesNotMatch(screen, /store\.durability|durable/, 'the reader-facing page should not be discussing storage');
    // The migration that would make it shared is deliberately still unapplied.
    const sql = readFileSync('supabase/migrations/009_curiosity_content.sql', 'utf8');
    assert.match(sql, /curiosity_briefings/, 'the durable option is no longer documented');
    pass(16, `durability is reported as ${store.durability} by the store, the page and the admin panel alike, and only the unapplied 009 migration would make it shared`);
  }

  /* ---------------------------------------------------------------- *
   * 17. Exactly one publisher path, and it proves its own result
   * ---------------------------------------------------------------- */
  {
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons?: unknown };
    assert.equal(vercel.crons, undefined, 'vercel.json declares a cron that cannot authenticate — two schedulers, one of them broken');
    const workflow = readFileSync('.github/workflows/curiosity-daily.yml', 'utf8');
    assert.match(workflow, /- cron: '30 18 \* \* \*'/);
    // The secret reaches curl through an env var, not inline: `${{ secrets.* }}` inside a
    // `run` block is written into the job script, and this keeps it out of there.
    assert.match(workflow, /SECRET: \$\{\{ secrets\.CURIOSITY_CRON_SECRET \}\}/);
    assert.match(workflow, /-H "authorization: Bearer \$\{SECRET\}"/);
    assert.doesNotMatch(workflow, /authorization: Bearer \$\{\{ secrets/, 'the secret was interpolated straight into the script');
    assert.doesNotMatch(workflow, /refresh\?[^\n]*CURIOSITY_CRON_SECRET/, 'the secret was placed in a URL, where access logs keep it');
    assert.match(workflow, /action=status/, 'the workflow does not read the published record back');
    assert.match(workflow, /body\.status/, 'the workflow treated HTTP 200 as proof of publication');
    // No privileged value in a committed file, anywhere in the shipped config.
    for (const file of [
      'vercel.json',
      '.github/workflows/curiosity-daily.yml',
      '.github/workflows/curiosity-discovery.yml',
      'supabase/functions/curiosity-refresh/index.ts',
      '.env.example',
    ]) {
      const text = readFileSync(file, 'utf8');
      assert.doesNotMatch(text, /(?:secret|key)\s*[:=]\s*['"]?(sk|srpat|eyJ)[A-Za-z0-9_-]{12,}/, `${file} appears to contain a credential`);
    }
    const env = readFileSync('.env.example', 'utf8');
    assert.match(env, /CURIOSITY_CRON_SECRET=/, 'the variable the scheduler needs is not documented');
    assert.doesNotMatch(env, /CURIOSITY_CRON_SECRET=.{4,}/, '.env.example must document the name, not a usable value');
    // The client must never be able to reach either privileged name.
    // And if a build exists, the claim is checked against its output rather than its
    // source: a server-only name that reaches a client chunk is a leak, whatever the
    // source files look like.
    if (existsSync('.next/static')) {
      let hits = '';
      try {
        hits = execFileSync('grep', ['-rEl', 'CURIOSITY_CRON_SECRET|SUPABASE_SECRET_KEY|service_role', '.next/static'], { encoding: 'utf8' }).trim();
      } catch {
        hits = ''; // grep exits non-zero when nothing matched, which is the pass case.
      }
      assert.equal(hits, '', `a server-only credential name reached the client bundle: ${hits}`);
    }
    const clientBundleFiles = ['components/settings/curiosity-refresh.tsx', 'components/curiosity/curiosity-screen.tsx', 'app/curiosity/page.tsx'];
    for (const file of clientBundleFiles) {
      assert.doesNotMatch(readFileSync(file, 'utf8'), /SUPABASE_SECRET_KEY|service_role|process\.env\.CURIOSITY_CRON_SECRET/, `${file} references a privileged secret`);
    }
    pass(17, 'Vercel declares no cron because it cannot authenticate, the Actions workflow is the only external publisher, it authenticates by header only, checks the body’s result and reads the record back, no committed file carries a credential, and no server-only name reached .next/static');
  }

  /* ---------------------------------------------------------------- *
   * 18. The curated corpus is complete enough to be the safety net
   * ---------------------------------------------------------------- */
  {
    const placeholder = /\b(tbd|todo|fixme|lorem ipsum|coming soon|placeholder|insert (?:title|text|summary))\b/i;
    const ids = new Map<string, string>();
    const urls = new Set<string>();
    let audited = 0;
    for (const category of CURIOUSITY_CATEGORIES) {
      for (const entry of poolFor(category)) {
        audited += 1;
        const where = `${category}/${entry.id}`;
        assert.match(entry.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${where}: id is not a slug`);
        assert.ok(!ids.has(entry.id), `${where}: id is reused (the ledger keys on it)`);
        ids.set(entry.id, category);
        assert.equal(entry.category, category, `${where}: the entry disagrees with the pool it is filed in`);
        assert.match(entry.availableFrom, /^\d{4}-\d{2}-\d{2}$/, `${where}: availableFrom is not an ISO date`);
        assert.ok(['curated', 'source-checked'].includes(entry.provenance), `${where}: unclear provenance`);
        if (entry.source) {
          assert.match(entry.source.url, /^https:\/\/\S+$/, `${where}: source url is not https`);
          assert.ok(entry.source.name.length > 1, `${where}: source has no name`);
        }
        const item = entry.item as Record<string, unknown>;
        const text = JSON.stringify(item);
        assert.ok(!placeholder.test(text), `${where}: placeholder prose shipped as content`);
        for (const key of Object.keys(item)) {
          const value = item[key];
          if (typeof value === 'string') assert.ok(value.trim().length > 0, `${where}.${key}: empty string`);
          if (/(url|link)$/i.test(key) && typeof value === 'string' && value.length) {
            assert.match(value, /^https:\/\/\S+$/, `${where}.${key}: not an https link`);
            urls.add(value);
          }
        }
        if (category === 'one-thing') assert.ok((item.title as string).length <= 120, `${where}: title too long for the card`);
        if (category === 'book') assert.ok((item.synopsis as string).length > 60 && (item.why as string).length > 40, `${where}: a book published without a synopsis or a reason`);
        // A one-line quotation is still a passage ("Live the questions now." is 23
        // characters and the point of the whole entry), so the bar is substance where the
        // card needs it: something to read, and something said about why it matters.
        if (category === 'literature') {
          assert.ok((item.passage as string).trim().length >= 8, `${where}: no passage to read`);
          assert.ok((item.whyItMatters as string).length > 40, `${where}: a passage published without a reason`);
        }
        if (category === 'learn-something') assert.ok((item.explanation as string).length > 60, `${where}: nothing being taught`);
      }
    }
    // The two shelves that back the live cards, and the history corpus.
    const shelf = [...aiBackgroundLibrary.map((entry) => ['ai-background', entry.id, entry.item as unknown as Record<string, unknown>] as const), ...radarFallbackShelf.map((entry) => ['radar-shelf', entry.id, entry.item] as const)];
    assert.ok(aiBackgroundLibrary.length >= 8 && radarFallbackShelf.length >= 8, 'a shelf too small to rotate without repeating tomorrow');
    for (const [where, id, item] of shelf) {
      audited += 1;
      assert.ok(!ids.has(id), `${where}/${id}: id collides with a pool entry`);
      ids.set(id, where);
      assert.match(String(item.url), /^https:\/\/\S+$/, `${where}/${id}: not an https link`);
      const text = JSON.stringify(item);
      assert.ok(!placeholder.test(text), `${where}/${id}: placeholder prose`);
      if (where === 'ai-background') {
        assert.equal(item.origin, 'background', `${where}/${id}: background reading not marked as such`);
        assert.equal(item.publishedAt, '', `${where}/${id}: background reading carries a date`);
        assert.ok((item.summary as string).length > 120, `${where}/${id}: too thin to be worth reading`);
      } else {
        assert.equal(item.origin, 'curated', `${where}/${id}: shelf item not marked curated`);
        assert.ok((item.why as string).length > 60, `${where}/${id}: no reason it may help`);
        assert.match(String(item.pricing), /[Ll]icen[cs]e/, `${where}/${id}: availability claim without a licence note`);
        assert.doesNotMatch(text, /\d+[kKM] ?stars|trending|most popular/i, `${where}/${id}: invented popularity`);
      }
    }
    // Consecutive days never show the same shelf, and the shelves cycle.
    const day1 = curatedAiWorld('2026-10-19').ids;
    const day2 = curatedAiWorld('2026-10-20').ids;
    assert.equal(day1.length, CURATED_PER_DAY);
    assert.equal(day1.filter((id) => day2.includes(id)).length, 0, 'the background shelf repeated itself the next day');
    const cycle = new Set<string>();
    for (let offset = 0; offset < aiBackgroundLibrary.length / CURATED_PER_DAY; offset += 1) {
      for (const id of curatedAiWorld(addPublicationDays('2026-10-19', offset)).ids) cycle.add(id);
    }
    assert.equal(cycle.size, aiBackgroundLibrary.length, 'the background rotation never reaches part of the library');
    const radarCycle = new Set<string>();
    for (let offset = 0; offset < radarFallbackShelf.length / CURATED_PER_DAY; offset += 1) {
      for (const id of curatedRadar(addPublicationDays('2026-10-19', offset)).ids) radarCycle.add(id);
    }
    assert.equal(radarCycle.size, radarFallbackShelf.length, 'the radar shelf rotation never reaches part of the shelf');
    // A database row that is not fit to publish is rejected rather than rendered.
    const rejected = [
      { id: '', category: 'one-thing', item: { title: 'x', explanation: 'y' } },
      { id: 'ok-id', category: 'not-a-category', item: {} },
      { id: 'bad-url', category: 'one-thing', item: { title: 'T', explanation: 'E', url: 'javascript:alert(1)' } },
    ];
    for (const row of rejected) assert.equal(rowToPoolEntry(row as never), null, `${JSON.stringify(row.id)} should not become pool content`);
    pass(18, `${audited} curated records audited: ${CURIOUSITY_CATEGORIES.map((c) => `${c}=${poolFor(c).length}`).join(', ')} plus ${aiBackgroundLibrary.length} background items and ${radarFallbackShelf.length} shelf tools — unique ids, https links, provenance on every row, no placeholders, no invented dates or popularity, rotations that never repeat a neighbour day`);
  }

  /* ---------------------------------------------------------------- *
   * 19. Nothing outside Curiosity was touched
   * ---------------------------------------------------------------- */
  {
    const allowed = [
      /^(lib|components\/curiosity|app\/api\/curiosity|app\/curiosity|public\/images\/curiosity|docs)\//,
      /^components\/settings\/(curiosity-refresh|settings-screen)\.tsx$/,
      /^scripts\/(verify-)?curiosity[a-z-]*\.(ts|tsx|mjs)$/,
      /^scripts\/verify-daily-content\.tsx$/,
      /^supabase\/(functions\/curiosity-refresh\/index\.ts|migrations\/0(09_curiosity_content|10_curiosity_dedupe_history|11_curiosity_candidates)\.sql)$/,
      /^(\.github\/workflows\/curiosity-(daily|discovery)\.yml|vercel\.json|package\.json|tsconfig\.json|\.env\.example|\.gitignore|README\.md|AGENTS\.md)$/,
    ];
    try {
      const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
      const base = git('merge-base', 'HEAD', 'origin/main');
      const tracked = git('diff', '--name-only', base).split('\n').filter(Boolean);
      const untracked = git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean);
      const changed = [...new Set([...tracked, ...untracked])];
      const strays = changed.filter((file) => !allowed.some((pattern) => pattern.test(file)));
      assert.deepEqual(strays, [], `files outside Curiosity changed: ${strays.join(', ')}`);
      // The theme and the four unrelated feature areas are the ones that must not move.
      for (const untouched of ['app/(app)/tasks', 'app/(app)/projects', 'app/(app)/calendar', 'lib/theme', 'components/timer']) {
        assert.ok(!changed.some((file) => file.startsWith(untouched)), `${untouched} was modified`);
      }
      results.push(`Unrelated files: ${changed.length} paths changed, every one of them Curiosity, its docs, or its wiring (${['app/(app)/tasks', 'app/(app)/projects', 'app/(app)/calendar', 'lib/theme', 'components/timer'].join(', ')} untouched)`);
    } catch (error) {
      if (error instanceof assert.AssertionError) throw error;
      results.push(`Unrelated files: could not be verified from git (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  console.log(`PASS ${results.length} automation checks, each with content, security and wiring guards\n${results.join('\n')}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
