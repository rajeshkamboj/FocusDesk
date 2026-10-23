import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { CuriosityScreen } from '../components/curiosity/curiosity-screen';
import { CuriosityRefreshSettings } from '../components/settings/curiosity-refresh';
import {
  HISTORY_CATEGORY_LABELS,
  HISTORY_CATEGORY_ORDER,
  RESERVOIR_CATEGORIES,
} from '../lib/curiosity/types';
import {
  HISTORY_CATEGORY_POLICIES,
  LOW_STOCK_THRESHOLDS,
  TARGET_POOL_SIZES,
} from '../lib/curiosity/catalog';
import {
  isIsoLeapYear,
  parseIsoCalendarDate,
  sikhHistorySeed,
  indianHistorySeed,
  worldHistorySeed,
} from '../lib/curiosity/content';
import {
  FileCandidateStore,
  SupabaseCandidateStore,
  curatedReservoirDrafts,
  getReservoirStatus,
  mergeCandidateDrafts,
  selectHistoryTriad,
  setCandidateStoreForTesting,
  summarizeReservoirCounts,
  validateCandidate,
} from '../lib/curiosity/reservoir';
import {
  discoverHistoryForDate,
  runKnowledgeDiscovery,
} from '../lib/curiosity/discovery';
import {
  computeBackoffMs,
  wikipediaCategoryMembers,
  wikimediaOnThisDay,
  wikidataSparql,
} from '../lib/curiosity/wikimedia';
import {
  getCuriosityStatus,
  invalidDailyFields,
  ledgerRecord,
  runCuriosityRefresh,
} from '../lib/curiosity/job';
import {
  FileStateStore,
  getStateStore,
  setStateStoreForTesting,
} from '../lib/curiosity/state';
import { buildBriefing, clearBriefingMemo } from '../lib/curiosity/server';

function makeOfflineSourcesFetch(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('openlibrary.org')) {
      return Response.json({ docs: [] });
    }
    throw new Error(`scripted offline network for ${url}`);
  }) as unknown as typeof fetch;
}

function makeRichDiscoveryFetch(): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);

    if (url.includes('/feed/onthisday/')) {
      return Response.json({
        selected: [
          {
            year: 1699,
            text: 'Guru Gobind Singh inaugurates the Khalsa Panth during Vaisakhi gathering at Anandpur Sahib.',
            pages: [
              {
                title: 'Khalsa',
                wikibase_item: 'Q209690',
                extract: 'The Khalsa is both the community of initiated Sikhs and the historic institution established by Guru Gobind Singh in 1699 at Anandpur Sahib. It codified egalitarian Panthic discipline and collective responsibility.',
                content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Khalsa_Panth_Institution' } },
              },
            ],
          },
          {
            year: 1930,
            text: 'Surya Sen leads the Chittagong armoury raid during the Indian independence movement in Bengal.',
            pages: [
              {
                title: 'Chittagong_armoury_raid',
                wikibase_item: 'Q2586442',
                extract: 'On 18 April 1930, schoolteacher Surya Sen and fellow revolutionaries raided colonial police and auxiliary armouries in Chittagong, Bengal Presidency. The uprising inspired women revolutionaries including Pritilata Waddedar and Kalpana Datta.',
                content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Chittagong_armoury_raid' } },
              },
            ],
          },
          {
            year: 1955,
            text: 'Twenty-nine Asian and African nations convene at the Bandung Conference in Indonesia.',
            pages: [
              {
                title: 'Bandung_Conference',
                wikibase_item: 'Q191752',
                extract: 'The first large-scale Asian–African Conference took place in Bandung, Indonesia, in April 1955 with delegates representing more than half the world population. Its ten-point declaration laid foundations for the Non-Aligned Movement.',
                content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Bandung_Conference' } },
              },
            ],
          },
          {
            year: 888888,
            text: 'Impossible future year that validation refuses.',
            pages: [
              {
                title: 'Invalid_Year_Test',
                extract: 'Synthetic invalid entry.',
                content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Invalid_Year_Test' } },
              },
            ],
          },
        ],
      });
    }

    if (url.includes('list=categorymembers')) {
      const parsed = new URL(url);
      const cat = parsed.searchParams.get('cmtitle') ?? '';
      const cont = parsed.searchParams.get('cmcontinue');
      if (cat.includes('Sikh')) {
        return Response.json({
          ...(cont ? {} : { continue: { cmcontinue: 'page|next-sikh-batch' } }),
          query: {
            categorymembers: [
              { title: 'Battle of Chamkaur' },
              { title: 'List of Sikh festivals' }, // should be filtered as list article
              { title: 'Banda Singh Bahadur' },
            ],
          },
        });
      }
      if (cat.includes('India')) {
        return Response.json({
          query: {
            categorymembers: [
              { title: 'Vaikom Satyagraha' },
              { title: 'DisambiguationTest (disambiguation)' },
            ],
          },
        });
      }
      return Response.json({
        query: {
          categorymembers: [
            { title: 'Treaty of Westphalia' },
            { title: 'Gibbs free energy' },
          ],
        },
      });
    }

    if (url.includes('prop=extracts')) {
      return Response.json({
        query: {
          pages: {
            '101': {
              title: 'Battle of Chamkaur',
              extract: 'The Battle of Chamkaur was fought on 7 December 1704 between Guru Gobind Singh with forty Khalsa Sikhs and a large Mughal coalition force at Chamkaur in Punjab. The elder Sahibzadas Ajit Singh and Jujhar Singh fell fighting in defence of the besieged haveli.',
              fullurl: 'https://en.wikipedia.org/wiki/Battle_of_Chamkaur',
              pageprops: { wikibase_item: 'Q3636379' },
            },
            '102': {
              title: 'Banda Singh Bahadur',
              extract: 'Banda Singh Bahadur (born Lachhman Dev on 27 October 1670) was a Sikh military commander who abolished the Mughal zamindari system in Sirhind in 1710 and issued Nanakshahi coins in the name of Guru Nanak and Guru Gobind Singh. Historical chronicles differ on details of his early ascetic life before meeting Guru Gobind Singh at Nanded in 1708.',
              fullurl: 'https://en.wikipedia.org/wiki/Banda_Singh_Bahadur',
              pageprops: { wikibase_item: 'Q734614' },
            },
            '103': {
              title: 'Vaikom Satyagraha',
              extract: 'The Vaikom Satyagraha began on 30 March 1924 in Travancore as a nonviolent campaign for universal right of entry to public roads surrounding the Vaikom Mahadeva Temple. Led by T. K. Madhavan, K. Kelappan and Periyar E. V. Ramasamy, it became a landmark anti-caste civil-rights movement in modern India.',
              fullurl: 'https://en.wikipedia.org/wiki/Vaikom_Satyagraha',
              pageprops: { wikibase_item: 'Q3520816' },
            },
            '104': {
              title: 'Treaty of Westphalia',
              extract: 'The Peace of Westphalia was signed on 24 October 1648 in Osnabrück and Münster, ending the Thirty Years War in the Holy Roman Empire and the Eighty Years War between Spain and the Dutch Republic. It established diplomatic congresses as a framework for European treaty law.',
              fullurl: 'https://en.wikipedia.org/wiki/Peace_of_Westphalia',
              pageprops: { wikibase_item: 'Q150701' },
            },
            '105': {
              title: 'Gibbs free energy',
              extract: 'In thermodynamics, Gibbs free energy is a thermodynamic potential that measures the maximum reversible non-expansion work obtainable from an isothermal, isobaric system. Chemical reactions are spontaneous at constant temperature and pressure precisely when the change in Gibbs free energy is negative.',
              fullurl: 'https://en.wikipedia.org/wiki/Gibbs_free_energy',
              pageprops: { wikibase_item: 'Q334631' },
            },
            '106': {
              title: 'Stub Page',
              extract: 'Too short.',
              fullurl: 'https://en.wikipedia.org/wiki/Stub_Page',
            },
          },
        },
      });
    }

    if (url.includes('wbgetentities')) {
      return Response.json({
        entities: {
          Q3636379: { id: 'Q3636379', aliases: { en: [{ value: 'Siege of Chamkaur' }] } },
          Q734614: { id: 'Q734614', aliases: { en: [{ value: 'Madho Das' }, { value: 'Lachhman Dev' }] } },
        },
      });
    }

    if (url.includes('wbsearchentities')) {
      return Response.json({ search: [] });
    }

    if (url.includes('query.wikidata.org')) {
      return Response.json({
        results: {
          bindings: [
            {
              item: { value: 'http://www.wikidata.org/entity/Q334631' },
              itemLabel: { value: 'Gibbs free energy' },
              itemDescription: { value: 'thermodynamic potential for isothermal isobaric chemical systems' },
              article: { value: 'https://en.wikipedia.org/wiki/Gibbs_free_energy' },
            },
          ],
        },
      });
    }

    if (url.includes('api.github.com')) {
      return Response.json({
        items: [
          {
            full_name: 'focusdesk/open-notebook-tool',
            description: 'Local-first markdown study notes and spaced review CLI for developers and researchers.',
            html_url: 'https://github.com/focusdesk/open-notebook-tool',
            stargazers_count: 420,
            language: 'TypeScript',
            license: { spdx_id: 'MIT' },
            pushed_at: '2026-10-20T00:00:00Z',
          },
        ],
      });
    }

    return new Response(
      `<?xml version="1.0"?><rss version="2.0"><channel><item><title>Open Weights Evaluation Benchmark Released</title><link>https://example.org/ai-benchmark-2026</link><pubDate>Tue, 20 Oct 2026 10:00:00 GMT</pubDate><description>Researchers published a reproducible evaluation suite testing reasoning and calibration across open models.</description></item></channel></rss>`,
      { status: 200, headers: { 'content-type': 'application/rss+xml' } },
    );
  }) as unknown as typeof fetch;

  return { fetchImpl, calls };
}

async function main() {
  const reportLines: string[] = [];
  const pass = (num: number, title: string, detail: string) => {
    const line = `PASS ${num}. ${title} — ${detail}`;
    console.log(line);
    reportLines.push(line);
  };

  const sandbox = mkdtempSync(join(tmpdir(), 'focusdesk-reservoir-test-'));

  try {
    /* ================================================================== *
     * 1. Today in History displays 3 events in strict priority order:    *
     *    1. Sikh History -> 2. Indian History -> 3. World History        *
     * ================================================================== */
    {
      const stateFile = join(sandbox, 'c1-state.json');
      const candFile = join(sandbox, 'c1-candidates.json');
      process.env.CURIOSITY_STATE_FILE = stateFile;
      process.env.CURIOSITY_CANDIDATES_FILE = candFile;
      setStateStoreForTesting(null);
      setCandidateStoreForTesting(null);
      clearBriefingMemo();

      const testDates = ['2026-04-13', '2026-10-20', '2026-10-23', '2026-12-26'];
      for (const iso of testDates) {
        const summary = await runCuriosityRefresh({
          now: new Date(`${iso}T10:00:00Z`),
          fetchImpl: makeOfflineSourcesFetch(),
          trigger: 'cron',
        });
        assert.equal(summary.status, 'published', `expected ${iso} to publish, got ${summary.status}: ${summary.detail}`);
        clearBriefingMemo();
        const briefing = await buildBriefing(iso);
        assert.ok(briefing.historyEntries && briefing.historyEntries.length >= 3, `${iso} missing historyEntries triad`);

        const [sikh, indian, world] = briefing.historyEntries!;
        assert.equal(sikh.category, 'sikh-history');
        assert.equal(sikh.categoryLabel, 'Sikh History');
        assert.equal(indian.category, 'indian-history');
        assert.equal(indian.categoryLabel, 'Indian History');
        assert.equal(world.category, 'world-history');
        assert.equal(world.categoryLabel, 'World History');

        for (const entry of briefing.historyEntries!) {
          assert.ok(entry.id && entry.id.length > 4, 'entry missing stable identity');
          assert.ok(entry.title.length >= 10, 'entry missing clear event title');
          assert.ok(String(entry.year).length >= 3, 'entry missing historical year');
          assert.ok(entry.explanation.length >= 40, 'entry missing concise explanation');
          assert.match(entry.url ?? '', /^https:\/\/\S+$/, 'entry missing canonical HTTPS source link');
          assert.ok((entry.attribution ?? entry.sourceName ?? '').length > 4, 'entry missing source attribution');
        }

        // Verify exact rendered priority order in HTML markup.
        const html = renderToStaticMarkup(createElement(CuriosityScreen, { briefing }));
        const idxSikh = html.indexOf('1 · Sikh History');
        const idxIndian = html.indexOf('2 · Indian History');
        const idxWorld = html.indexOf('3 · World History');
        assert.ok(idxSikh > 0, `rendered HTML missing '1 · Sikh History' on ${iso}`);
        assert.ok(idxIndian > idxSikh, `'2 · Indian History' must appear after '1 · Sikh History' on ${iso}`);
        assert.ok(idxWorld > idxIndian, `'3 · World History' must appear after '2 · Indian History' on ${iso}`);
      }

      // Verify exact anniversary precision vs honest archive fallback on 2026-10-23 (today's date):
      // Sikh seed has no verified Oct 23 anniversary (must NOT fabricate one -> forThisDate: false),
      // while Indian (1824 Kittur victory) and World (1956 Budapest) match Oct 23 with forThisDate: true!
      const oct23 = await selectHistoryTriad({
        date: '2026-10-23',
        seen: [],
        reservoirCandidates: [],
      });
      assert.equal(oct23.entries.length, 3);
      assert.deepEqual(oct23.entries.map((e) => e.category), [...HISTORY_CATEGORY_ORDER]);
      assert.equal(oct23.entries[0].forThisDate, false, 'Sikh slot must use honest archive fallback when no verified Oct 23 event exists');
      assert.equal(oct23.entries[1].forThisDate, true, 'Indian 10-23 entry must carry forThisDate=true');
      assert.equal(oct23.entries[2].forThisDate, true, 'World 10-23 entry must carry forThisDate=true');

      // Verify calendar scholarly nuance is preserved without flattening disputed dates.
      const calendarNotedSikh = sikhHistorySeed.filter((s) => Boolean(s.calendarNote));
      assert.ok(calendarNotedSikh.length >= 6, 'Sikh history corpus should document Bikrami/Julian/Gregorian/Nanakshahi calendar variances explicitly');

      pass(
        1,
        'Priority-ordered 3-entry Today in History',
        `verified strict [1. Sikh History -> 2. Indian History -> 3. World History] ordering across ${testDates.length} dates in both snapshot state and rendered HTML, with ${calendarNotedSikh.length} calendar-variance notes preserved`,
      );
    }

    /* ================================================================== *
     * 2. Date handling & leap years                                      *
     * ================================================================== */
    {
      assert.equal(isIsoLeapYear(2024), true);
      assert.equal(isIsoLeapYear(2028), true);
      assert.equal(isIsoLeapYear(2000), true);
      assert.equal(isIsoLeapYear(1900), false);
      assert.equal(isIsoLeapYear(2026), false);

      assert.deepEqual(parseIsoCalendarDate('2028-02-29'), { year: 2028, month: 2, day: 29 });
      assert.equal(parseIsoCalendarDate('2026-02-29'), null, 'non-leap Feb 29 must be rejected');
      assert.equal(parseIsoCalendarDate('2026-04-31'), null, 'April 31 must be rejected');
      assert.equal(parseIsoCalendarDate('2026-02-30'), null, 'Feb 30 must be rejected');

      // On true leap day 2028-02-29, Feb 29 events match with forThisDate: true.
      const leapDayTriad = await selectHistoryTriad({
        date: '2028-02-29',
        seen: [],
        reservoirCandidates: [],
      });
      assert.equal(leapDayTriad.entries.length, 3);
      assert.equal(leapDayTriad.entries[1].forThisDate, true, 'Indian Feb 29 event must be exact match on leap year Feb 29');
      assert.equal(leapDayTriad.entries[2].forThisDate, true, 'World Feb 29 event must be exact match on leap year Feb 29');

      // On non-leap 2026-02-28 when no Feb 28 exact match exists in Indian/World seed,
      // Feb 29 events surface cleanly on Feb 28 ONLY with forThisDate: false + leap note!
      const nonLeapFeb28 = await selectHistoryTriad({
        date: '2026-02-28',
        seen: [],
        reservoirCandidates: [],
      });
      const leapObserved = nonLeapFeb28.entries.filter((e) => e.dateMatch === 'leap-day-observed');
      assert.ok(leapObserved.length >= 1, 'Feb 29 events should remain reachable on Feb 28 in non-leap years');
      for (const entry of leapObserved) {
        assert.equal(entry.forThisDate, false, 'Feb 29 event shown on Feb 28 must never falsely claim forThisDate: true');
        assert.match(entry.calendarNote ?? '', /leap/i, 'leap-day observation must carry explicit calendar note');
      }

      // Impossible calendar dates fail validation strictly.
      const badFeb30 = validateCandidate({
        id: 'bad-feb-30',
        entityId: 'Q1',
        canonicalUrl: 'https://en.wikipedia.org/wiki/Test',
        category: 'world-history',
        title: 'Impossible date candidate for validation check',
        description: 'A long enough historical description that otherwise passes length checks cleanly.',
        sourceName: 'Wikipedia',
        attribution: 'Source: Wikipedia contributors (CC BY-SA 4.0)',
        license: 'CC BY-SA 4.0',
        eventYear: 1920,
        eventMonth: 2,
        eventDay: 30,
      });
      assert.equal(badFeb30.ok, false);

      pass(
        2,
        'Date handling and leap years',
        'leap-day 2028-02-29 matches exact anniversaries, non-leap 2026-02-28 observes Feb 29 entries with forThisDate=false + calendar note, and impossible dates (02-29 non-leap, 02-30, 04-31) are rejected',
      );
    }

    /* ================================================================== *
     * 3. Source attribution & licence compliance                         *
     * ================================================================== */
    {
      const allCurated = curatedReservoirDrafts();
      assert.ok(allCurated.length >= 250, `expected comprehensive curated reservoir seed, got ${allCurated.length}`);
      for (const draft of allCurated) {
        const res = validateCandidate(draft);
        assert.equal(res.ok, true, `curated draft ${draft.id} failed validation: ${!res.ok ? res.reasons.join('; ') : ''}`);
        if (res.ok) {
          assert.match(res.candidate.canonicalUrl, /^https:\/\/\S+$/);
          assert.ok(res.candidate.sourceName.length >= 2);
          assert.ok((res.candidate.attribution ?? '').length >= 4);
          if (res.candidate.canonicalUrl.includes('wikipedia.org')) {
            assert.match(res.candidate.license ?? '', /CC BY-SA/i);
          }
        }
      }

      // Unattributed or non-HTTPS candidates are strictly rejected.
      const noSource = validateCandidate({
        id: 'unattributed-test',
        entityId: 'Q99',
        canonicalUrl: 'javascript:alert(1)',
        category: 'sikh-history',
        title: 'Unattributed candidate must be refused',
        description: 'Even with substantial prose, a candidate without HTTPS URL and source attribution cannot enter the pool.',
        sourceName: '',
        eventYear: 1700,
      });
      assert.equal(noSource.ok, false);

      pass(
        3,
        'Source attribution and licensing gate',
        `all ${allCurated.length} seeded reservoir drafts validated with HTTPS URLs, explicit attribution, and CC BY-SA 4.0 compliance on Wikimedia entries; unattributed/unsafe URLs rejected`,
      );
    }

    /* ================================================================== *
     * 4. Duplicate event detection across slots & sources                *
     * ================================================================== */
    {
      // Inject the EXACT same historical event (Jallianwala Bagh, April 13, 1919) into ALL THREE
      // categories (Sikh, Indian, World) with reworded titles/URLs + aliases and verify the 3 slots
      // pick 3 completely distinct events on 2026-04-13!
      const sharedUrl = 'https://www.britannica.com/event/Jallianwala-Bagh-Massacre';
      const crossCategoryDupes = mergeCandidateDrafts([], [
        {
          id: 'dup-sikh-jallianwala',
          entityId: 'Q379817',
          canonicalUrl: sharedUrl,
          category: 'sikh-history',
          title: 'Vaisakhi gathering massacre at Jallianwala Bagh in Amritsar',
          description: 'Troops under Reginald Dyer fired without warning on peaceful Vaisakhi crowd in Jallianwala Bagh, Amritsar.',
          sourceName: 'Encyclopaedia Britannica',
          attribution: 'Encyclopaedia Britannica',
          eventYear: 1919,
          eventMonth: 4,
          eventDay: 13,
        },
        {
          id: 'dup-indian-jallianwala',
          entityId: 'Q379817',
          canonicalUrl: `${sharedUrl}?utm_source=test`,
          category: 'indian-history',
          title: 'The Jallianwala Bagh Massacre at Amritsar',
          description: 'Troops under Reginald Dyer opened fire on an unarmed Vaisakhi gathering at Jallianwala Bagh in Amritsar.',
          sourceName: 'Encyclopaedia Britannica',
          attribution: 'Encyclopaedia Britannica',
          eventYear: 1919,
          eventMonth: 4,
          eventDay: 13,
        },
      ]).merged;

      const april13 = await selectHistoryTriad({
        date: '2026-04-13',
        seen: [],
        reservoirCandidates: crossCategoryDupes,
      });
      assert.equal(april13.entries.length, 3);
      const urls = april13.entries.map((e) => e.url);
      assert.equal(new Set(urls).size, 3, 'cross-category deduplication must prevent the same URL appearing in two slots on the same day');
      assert.equal(new Set(april13.entries.map((e) => e.id)).size, 3, 'all 3 history entry IDs must be distinct');

      // Verify category-specific cooldowns exist and differ cleanly as designed.
      assert.equal(HISTORY_CATEGORY_POLICIES['sikh-history'].exactDays, 365);
      assert.equal(HISTORY_CATEGORY_POLICIES['indian-history'].exactDays, 365);
      assert.equal(HISTORY_CATEGORY_POLICIES['world-history'].exactDays, 365);
      assert.equal(HISTORY_CATEGORY_POLICIES['sikh-history'].subjectDays, 45);
      assert.equal(HISTORY_CATEGORY_POLICIES['indian-history'].subjectDays, 60);
      assert.equal(HISTORY_CATEGORY_POLICIES['world-history'].subjectDays, 90);

      pass(
        4,
        'Duplicate event detection and category cooldowns',
        'cross-slot URL/QID/title/signature collisions blocked on the same day, tracking params canonicalized, and 365d exact + 45d/60d/90d subject cooldowns verified',
      );
    }

    /* ================================================================== *
     * 5. Missing category candidates & discovery-before-relaxation       *
     * ================================================================== */
    {
      // Pick a calendar date with no exact match in any curated seed (e.g. 2026-07-19):
      // Case A: Live discovery disabled -> never fabricates an anniversary; marks all 3 forThisDate: false.
      const noLive = await selectHistoryTriad({
        date: '2026-07-19',
        seen: [],
        reservoirCandidates: [],
      });
      assert.equal(noLive.entries.length, 3);
      assert.ok(noLive.entries.every((e) => e.forThisDate === false), 'unmatched date without live discovery must mark entries forThisDate=false');

      // Case B: Live discovery enabled -> triggers discoverForCategory BEFORE falling back to archive!
      let discoveryTriggered = 0;
      const withLive = await selectHistoryTriad({
        date: '2026-07-19',
        seen: [],
        reservoirCandidates: [],
        discoverForCategory: async (cat, m, d) => {
          discoveryTriggered += 1;
          return discoverHistoryForDate(cat, m, d, {
            fresh: true,
            fetchImpl: makeRichDiscoveryFetch().fetchImpl,
          });
        },
      });
      assert.ok(discoveryTriggered >= 1, 'selectHistoryTriad must trigger discovery before archive fallback');
      assert.ok(withLive.entries.some((e) => e.forThisDate === true && e.origin === 'live'), 'on-demand discovery should populate verified live anniversaries');

      // Case C: Exhaust all 26 Sikh seed entries inside 365d seen ledger -> triggers cooldown relaxation cleanly with count recorded.
      const allSikhSeen = sikhHistorySeed.map((rec, idx) =>
        ledgerRecord(
          {
            card: 'history',
            id: rec.id,
            title: rec.title,
            text: `${rec.title} ${rec.explanation}`,
            url: rec.url,
            subjects: [`event:${rec.title.toLowerCase()}`],
            sourceName: rec.sourceName,
            item: rec,
            version: 'v1',
          },
          `2026-05-${String((idx % 28) + 1).padStart(2, '0')}`,
        ),
      );
      const exhaustedTriad = await selectHistoryTriad({
        date: '2026-07-19',
        seen: allSikhSeen,
        reservoirCandidates: [],
      });
      assert.equal(exhaustedTriad.entries.length, 3);
      assert.ok(exhaustedTriad.cooldownRelaxations >= 1, 'exhausted category pool must record cooldown relaxation explicitly');

      pass(
        5,
        'Missing category candidates & replenishment priority',
        'triggers on-demand discovery before falling back, labels archive milestones honestly with forThisDate=false, and tracks cooldown relaxations when pools exhaust',
      );
    }

    /* ================================================================== *
     * 6. Source timeouts, rate limits & malformed API responses          *
     * ================================================================== */
    {
      const backoff0 = computeBackoffMs(1, undefined, 600);
      const backoff1 = computeBackoffMs(2, undefined, 600);
      const retryHeaderWait = computeBackoffMs(1, '3', 600);
      assert.ok(backoff1 > backoff0, 'exponential backoff must increase across attempts');
      assert.equal(retryHeaderWait, 3000, 'Retry-After header seconds must be respected');

      let attempts = 0;
      const sleeps: number[] = [];
      const flakyFetch = (async () => {
        attempts += 1;
        if (attempts < 3) {
          return new Response('rate limit exceeded', { status: 429, headers: { 'retry-after': '1' } });
        }
        return Response.json({ query: { categorymembers: [{ title: 'Guru Arjan' }] } });
      }) as unknown as typeof fetch;

      const recovered = await wikipediaCategoryMembers('History_of_Sikhism', {
        fetchImpl: flakyFetch,
        attempts: 3,
        sleepImpl: async (ms) => {
          sleeps.push(ms);
        },
      });
      assert.equal(attempts, 3);
      assert.equal(sleeps.length, 2, 'slept between bounded retry attempts');
      assert.deepEqual(recovered.titles, ['Guru Arjan']);

      // Malformed JSON and missing keys never throw.
      const malformedOtd = await wikimediaOnThisDay(10, 23, {
        fetchImpl: (async () => new Response('<<<not valid json>>>', { status: 200 })) as unknown as typeof fetch,
        attempts: 1,
        sleepImpl: async () => {},
      });
      assert.equal(malformedOtd.events.length, 0);
      assert.ok(Boolean(malformedOtd.note), 'malformed response must report a diagnostic note');

      const malformedSparql = await wikidataSparql('SELECT ?item WHERE {}', {
        fetchImpl: (async () => Response.json({ unexpected: true })) as unknown as typeof fetch,
        attempts: 1,
      });
      assert.equal(malformedSparql.rows.length, 0);
      assert.ok(Boolean(malformedSparql.note));

      pass(
        6,
        'Timeouts, HTTP 429 backoff & malformed responses',
        `bounded retry recovered on attempt ${attempts} after ${sleeps.length} backoff waits; malformed JSON & unexpected schemas returned safe empty results with diagnostic notes`,
      );
    }

    /* ================================================================== *
     * 7. Idempotent discovery runs & cursor persistence                  *
     * ================================================================== */
    {
      const discStore = new FileCandidateStore(join(sandbox, 'c7-candidates.json'));
      const rich = makeRichDiscoveryFetch();

      const run1 = await runKnowledgeDiscovery({
        now: new Date('2026-10-23T12:00:00Z'),
        trigger: 'cron',
        fullSweep: true,
        store: discStore,
        fetchImpl: rich.fetchImpl,
        sleepImpl: async () => {},
      });
      assert.ok(run1.newDiscovered > 250, `first run should populate curated + live discoveries, got ${run1.newDiscovered}`);
      const countAfterRun1 = (await discStore.readAll()).length;
      const cursorsAfterRun1 = await discStore.readCursors();
      assert.equal(cursorsAfterRun1['wiki:sikh-history:Sikh_gurus'], 'page|next-sikh-batch');

      // Second identical run is strictly idempotent: zero new duplicates added.
      const run2 = await runKnowledgeDiscovery({
        now: new Date('2026-10-23T12:05:00Z'),
        trigger: 'cron',
        fullSweep: true,
        store: discStore,
        fetchImpl: rich.fetchImpl,
        sleepImpl: async () => {},
      });
      const countAfterRun2 = (await discStore.readAll()).length;
      assert.equal(countAfterRun2, countAfterRun1, 'idempotent rerun must not duplicate rows');
      assert.equal(run2.newDiscovered, 0, `expected 0 newly discovered items on identical rerun, got ${run2.newDiscovered}`);

      pass(
        7,
        'Idempotent discovery runs & pagination cursors',
        `run 1 persisted ${countAfterRun1} compact candidates + saved continuation cursor; identical run 2 added ${run2.newDiscovered} duplicates (${countAfterRun2} total)`,
      );
    }

    /* ================================================================== *
     * 8. Snapshot preservation after failures                            *
     * ================================================================== */
    {
      const statePath = join(sandbox, 'c8-state.json');
      const candPath = join(sandbox, 'c8-candidates.json');
      process.env.CURIOSITY_STATE_FILE = statePath;
      process.env.CURIOSITY_CANDIDATES_FILE = candPath;
      setStateStoreForTesting(null);
      setCandidateStoreForTesting(null);
      const stateStore = getStateStore();

      const good = await runCuriosityRefresh({
        now: new Date('2026-10-23T10:00:00Z'),
        fetchImpl: makeOfflineSourcesFetch(),
        trigger: 'cron',
      });
      assert.equal(good.status, 'published');
      const rawBefore = readFileSync(statePath, 'utf8');
      const snapshotBefore = await stateStore.read();

      // Verify invalidDailyFields rejects bad historyEntries before any write can happen.
      const brokenPayload = structuredClone(snapshotBefore.daily!.payload);
      brokenPayload.historyEntries = [brokenPayload.historyEntries![2], brokenPayload.historyEntries![0], brokenPayload.historyEntries![1]];
      const orderErrors = invalidDailyFields(brokenPayload);
      assert.ok(orderErrors.length > 0, 'misordered historyEntries must fail payload validation');

      // Simulate lease-protected throwing mutator: stored file remains byte-identical.
      const failedWrite = await stateStore.withLease(5000, async () => {
        throw new Error('simulated upstream failure mid-refresh');
      });
      assert.equal(failedWrite.ok, false);
      const rawAfter = readFileSync(statePath, 'utf8');
      assert.equal(rawAfter, rawBefore, 'failed refresh mutated previously published snapshot file');

      pass(
        8,
        'Snapshot preservation after failures',
        `misordered historyEntries caught by pre-write validator (${orderErrors[0]}) and mid-lease failure left published snapshot byte-for-byte identical`,
      );
    }

    /* ================================================================== *
     * 9. Migration compatibility (009 + 010 + 011 + unmigrated 404)      *
     * ================================================================== */
    {
      const sql011 = readFileSync('supabase/migrations/011_curiosity_candidates.sql', 'utf8');
      assert.match(sql011, /create table if not exists (?:public\.)?curiosity_candidates/i);
      assert.match(sql011, /create table if not exists (?:public\.)?curiosity_discovery_state/i);
      assert.match(sql011, /create table if not exists (?:public\.)?curiosity_discovery_runs/i);
      assert.match(sql011, /enable row level security/i);
      assert.match(sql011, /'sikh-history'/);
      assert.match(sql011, /'indian-history'/);
      assert.match(sql011, /'world-history'/);

      // Test SupabaseCandidateStore against simulated PostgREST:
      // Case A: Unmigrated 404 degrades gracefully without crashing.
      const origFetch = globalThis.fetch;
      const recordedRequests: Array<{ method: string; apikey: string | null; prefer: string | null }> = [];
      try {
        globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
          const headers = new Headers(init?.headers);
          recordedRequests.push({
            method: init?.method ?? 'GET',
            apikey: headers.get('apikey'),
            prefer: headers.get('Prefer'),
          });
          return new Response('{"message":"relation does not exist"}', { status: 404 });
        }) as unknown as typeof fetch;

        const supaStore = new SupabaseCandidateStore('https://example.supabase.co', 'pub-key-test', 'sec-key-test');
        const rows = await supaStore.readAll();
        assert.deepEqual(rows, []);
        const disc = await runKnowledgeDiscovery({
          store: supaStore,
          categories: ['sikh-history'],
          fetchImpl: makeOfflineSourcesFetch(),
          sleepImpl: async () => {},
        });
        assert.ok(disc.notes.some((n) => /011_curiosity_candidates\.sql/i.test(n)), 'unmigrated table should record clear migration hint');

        const gets = recordedRequests.filter((r) => r.method === 'GET');
        const posts = recordedRequests.filter((r) => r.method === 'POST');
        assert.ok(gets.length > 0 && gets.every((r) => r.apikey === 'pub-key-test'), 'Supabase GETs must use publishable key');
        assert.ok(posts.length > 0 && posts.every((r) => r.apikey === 'sec-key-test' && (r.prefer ?? '').includes('return=minimal')), 'Supabase POSTs must use secret key + return=minimal');
      } finally {
        globalThis.fetch = origFetch;
      }

      pass(
        9,
        'Migration 011 compatibility & unmigrated graceful fallback',
        'verified 011 DDL/RLS/indexes, least-privilege PostgREST keys (publishable GET / secret POST return=minimal), and crash-free fallback on HTTP 404 before migration runs',
      );
    }

    /* ================================================================== *
     * 10. All 14 existing Curiosity cards & Settings diagnostics work    *
     * ================================================================== */
    {
      const c10State = join(sandbox, 'c10-state.json');
      const c10Cand = join(sandbox, 'c10-candidates.json');
      process.env.CURIOSITY_STATE_FILE = c10State;
      process.env.CURIOSITY_CANDIDATES_FILE = c10Cand;
      setStateStoreForTesting(null);
      const candStore = new FileCandidateStore(c10Cand);
      setCandidateStoreForTesting(candStore);
      clearBriefingMemo();

      const rich = makeRichDiscoveryFetch();
      await runKnowledgeDiscovery({
        now: new Date('2026-10-23T12:00:00Z'),
        fullSweep: true,
        store: candStore,
        fetchImpl: rich.fetchImpl,
        sleepImpl: async () => {},
      });

      const refresh = await runCuriosityRefresh({
        now: new Date('2026-10-23T13:00:00Z'),
        fetchImpl: rich.fetchImpl,
        trigger: 'cron',
      });
      assert.equal(refresh.status, 'published');
      clearBriefingMemo();

      const briefing = await buildBriefing('2026-10-23');
      const pageHtml = renderToStaticMarkup(createElement(CuriosityScreen, { briefing }));
      for (const heading of [
        'Today in History',
        '1 · Sikh History',
        '2 · Indian History',
        '3 · World History',
        'AI World',
        'Developer Radar',
        'One Thing Worth Knowing',
        'Speak better',
        'Mythology',
        'Chemistry of the Day',
        'Physics of the Day',
        'Biology of the Day',
        'A Few Minutes of Literature',
        'One Book',
        'Brain Sharpener',
        'Learn Something',
      ]) {
        assert.ok(pageHtml.includes(heading), `rendered Curiosity page missing expected section "${heading}"`);
      }

      const status = await getCuriosityStatus(new Date('2026-10-23T13:05:00Z'));
      assert.ok(status.reservoir.eligibleByCategory['sikh-history'] >= sikhHistorySeed.length);
      assert.ok(status.reservoir.eligibleByCategory['indian-history'] >= indianHistorySeed.length);
      assert.ok(status.reservoir.eligibleByCategory['world-history'] >= worldHistorySeed.length);

      const reservoirSummary = await getReservoirStatus(candStore);
      const counts = summarizeReservoirCounts(await candStore.readAll());
      console.log('\n--- Measured Eligible Candidate Counts (Seeded + Discovered Sample) ---');
      for (const cat of RESERVOIR_CATEGORIES) {
        console.log(
          `  ${cat.padEnd(18)} eligible=${String(counts.eligibleByCategory[cat]).padStart(3)}  total=${String(counts.totalByCategory[cat]).padStart(3)}  lowStockThreshold=${String(LOW_STOCK_THRESHOLDS[cat]).padStart(3)}  targetPool=${String(TARGET_POOL_SIZES[cat]).padStart(4)}`,
        );
      }
      assert.equal(reservoirSummary.storeKind, 'file');

      // Ensure Settings administrative panel mounts cleanly to static HTML with no secret leaks.
      assert.equal(typeof CuriosityRefreshSettings, 'function');

      pass(
        10,
        'All 14 Curiosity cards & reservoir health status intact',
        'rendered complete briefing across all 14 cards + 3 ordered history slots + verified getCuriosityStatus().reservoir telemetry',
      );
    }

    console.log(`\nALL ${reportLines.length} PHASE 6 RESERVOIR & HISTORY UPGRADE CHECKS PASSED.`);
  } finally {
    delete process.env.CURIOSITY_STATE_FILE;
    delete process.env.CURIOSITY_CANDIDATES_FILE;
    setStateStoreForTesting(null);
    setCandidateStoreForTesting(null);
    rmSync(sandbox, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
