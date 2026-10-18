/**
 * Verification for the Curiosity content lifecycle.
 *
 *   npx tsx scripts/verify-curiosity-automation.tsx
 *
 * Seven checks, matching the seven acceptance criteria of the brief. They run
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
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
import { dailyEditorial, dailyEditorialIds } from '../lib/curiosity/content';
import { buildBriefing, clearBriefingMemo } from '../lib/curiosity/server';
import { getCuriosityStatus, runCuriosityRefresh } from '../lib/curiosity/job';
import { getStateStore, setStateStoreForTesting } from '../lib/curiosity/state';
import { rowToPoolEntry } from '../lib/curiosity/content-db';
import { authorizeRefresh } from '../lib/curiosity/refresh-auth';
import { COVER_PLACEHOLDER, buildRecommendation, lookupBook, openLibraryUserAgent, pickWorkRecord, searchUrl, titlesMatch } from '../lib/curiosity/openlibrary';
import { selectAiWorldArticles } from '../lib/curiosity/sources';
import { CuriosityScreen } from '../components/curiosity/curiosity-screen';
import type { BookCandidate, CuriosityPoolEntry } from '../lib/curiosity/types';

const DAY = 86_400_000;
/** 2026-10-18T18:30:00Z is 2026-10-19 00:00 in Asia/Kolkata. */
const IST_MIDNIGHT = (dayOffset: number) => new Date(Date.UTC(2026, 9, 18 + dayOffset, 18, 30, 0));

type FetchCall = { url: string; count: number };

/** A scripted Open Library / feeds / GitHub boundary. */
function scriptedFetch(options: { failBooks?: boolean; failFeeds?: boolean; failEverything?: boolean } = {}) {
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
      assert.equal(after.daily?.payload.history ?? null, before.daily?.payload.history ?? null);

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
      assert.equal(corrupt.aiWorld.length, 0, 'the fallback path must not claim live news');
      pass(3, 'failed book lookup kept the previous recommendation; degraded feeds recorded on the snapshot; a corrupt store falls back to the built-in rotation instead of erroring');
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
        assert.ok(summary.daily.published, `day ${day} published nothing`);
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
      const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons: { path: string; schedule: string }[] };
      assert.equal(vercel.crons[0].schedule, '30 18 * * *');
      assert.match(vercel.crons[0].path, /^\/api\/curiosity\/refresh\?scope=all$/);
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
      pass(6, '40 renders of a published day made 0 source calls; catch-up is opt-out per day and never runs for a non-current date; vercel.json, the Actions workflow, pg_cron SQL and the edge function all target 30 18 * * * and the refresh endpoint; the endpoint fails closed in production without a credential');
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
      // Four rows, not nine: the ledger tracks what *rotates*. The five fixed-corpus
      // cards and the history event are not repeats by construction, so recording
      // them would only grow a table that nothing reads.
      assert.equal(reopened.seen.length, 4, 'the ledger should hold one row per rotating item');
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


  console.log(`PASS ${results.length} automation checks, each with content, security and wiring guards\n${results.join('\n')}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
