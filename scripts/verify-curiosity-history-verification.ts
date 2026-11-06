/**
 *   npx tsx scripts/verify-curiosity-history-verification.ts
 *
 * Regression checks for the "refusing to publish …: historyEntries[n] labelled when
 * not verified for date" failure.
 *
 * The rule the publish validator enforces (`invalidDailyFields`) is that a history
 * entry may carry `forThisDate: false` only when it is a curated entry. A live or
 * reservoir record has a real date of its own, so it may be published only when it
 * matches the publication day. These checks run the real selector and the real
 * publisher and confirm that:
 *
 *  - a stray, non-curated history record never reaches a non-exact slot, on 6 November
 *    2026 or on any day sampled across the year, in any category;
 *  - when that happens, the slot falls back to a curated, labelled entry and the day
 *    publishes;
 *  - a verified replacement for the day publishes as verified;
 *  - the validator still refuses a forged unverified entry (it was not weakened);
 *  - the priority Sikh → Indian → World holds, Feb 28 / Feb 29 and the Asia/Kolkata
 *    boundary behave, and disputed (Nanakshahi/Bikrami) Sikh dates still match their day.
 *
 * Substitutions: a temp directory stands in for the state and candidate stores, and a
 * fetch that always fails stands in for the network, so the run is offline and
 * deterministic. A clock is passed in (`now`).
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { indianHistorySeed, parseIsoCalendarDate, seedHistoryByCategory, sikhHistorySeed, worldHistorySeed } from '../lib/curiosity/content';
import { invalidDailyFields, runCuriosityRefresh } from '../lib/curiosity/job';
import { publicationDate } from '../lib/curiosity/schedule';
import { FileStateStore, getStateStore, setStateStoreForTesting, type SeenRecord } from '../lib/curiosity/state';
import {
  FileCandidateStore,
  curatedReservoirDrafts,
  mergeCandidateDrafts,
  selectHistoryTriad,
  setCandidateStoreForTesting,
  type CandidateDraft,
  type KnowledgeCandidate,
} from '../lib/curiosity/reservoir';
import { HISTORY_CATEGORY_ORDER, type HistoryCategory, type HistoryEvent } from '../lib/curiosity/types';

const NOV_6 = '2026-11-06';
/** 2026-11-06 00:00 Asia/Kolkata is 2026-11-05 18:30 UTC. */
const NOV_6_MIDNIGHT_IST = new Date('2026-11-05T18:30:00Z');

let passed = 0;
function pass(name: string, detail: string) {
  passed += 1;
  console.log(`PASS ${passed}. ${name} — ${detail}`);
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

type LiveSpec = {
  id: string;
  category: HistoryCategory;
  year?: number;
  month?: number;
  day?: number;
  precision?: CandidateDraft['eventDatePrecision'];
  title?: string;
  description?: string;
};

/** A stable, collision-resistant numeric entity id for a fixture. */
function hashDigits(text: string): string {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return String(h).padStart(10, '0');
}

/** A non-curated (live / reservoir) history record, as discovery stores it. */
function liveDraft(spec: LiveSpec): CandidateDraft {
  const { id, category, year = 1921, month, day, precision } = spec;
  const hasDay = month !== undefined && day !== undefined;
  return {
    id,
    entityId: `Q${hashDigits(id)}`,
    canonicalUrl: `https://en.wikipedia.org/wiki/${id}`,
    category,
    title: spec.title ?? `Live ${category} record ${id}`,
    description: spec.description ?? `A live ${category} record stored by discovery (${id}) for its own calendar date.`,
    sourceName: 'Wikipedia',
    attribution: 'Source: Wikipedia contributors (CC BY-SA 4.0)',
    license: 'CC BY-SA 4.0',
    subjects: [`event:${id}`],
    eventYear: year,
    eventYearLabel: String(year),
    ...(hasDay ? { eventMonth: month, eventDay: day } : {}),
    eventDatePrecision: precision ?? (hasDay ? 'exact' : 'year'),
    payload: { dateLabel: hasDay ? `${month}-${day}` : String(year), origin: 'live' },
    validationStatus: 'valid',
    eligible: true,
    discoveredAt: '2026-10-01T00:00:00.000Z',
  };
}

function reservoirOf(drafts: CandidateDraft[]): KnowledgeCandidate[] {
  return mergeCandidateDrafts([], drafts).merged;
}

/** Every curated entry of one category, published on the days before 6 November (the persisted ledger shape). */
function curatedInCooldown(category: HistoryCategory): SeenRecord[] {
  return seedHistoryByCategory[category].map((rec, i) => ({
    category: 'history',
    id: rec.id,
    on: `2026-10-${String(27 + (i % 5)).padStart(2, '0')}`,
    title: rec.title,
    url: rec.url,
    source: rec.sourceName,
  }));
}

/** A live record for each category on a date that is NOT the day being published. */
const STRAY_ON_OTHER_DAYS: CandidateDraft[] = [
  liveDraft({ id: 'hist-indian-stray-0305', category: 'indian-history', month: 3, day: 5, year: 1921, title: 'A stray Indian event dated 5 March 1921' }),
  liveDraft({ id: 'hist-sikh-stray-0712', category: 'sikh-history', month: 7, day: 12, year: 1710, title: 'A stray Sikh event dated 12 July 1710' }),
  liveDraft({ id: 'hist-world-stray-0918', category: 'world-history', month: 9, day: 18, year: 1950, title: 'A stray world event dated 18 September 1950' }),
];

/** The shape the payload validator checks: the three-slot triad, in order. */
function historyProblems(entries: HistoryEvent[]): string[] {
  return invalidDailyFields({ history: entries[0], historyEntries: entries } as never).filter((p) =>
    p.startsWith('historyEntries') || p.startsWith('history '),
  );
}

function assertCategoryOrder(entries: HistoryEvent[], label: string) {
  assert.deepEqual(
    entries.map((e) => e.category),
    [...HISTORY_CATEGORY_ORDER],
    `${label}: the triad is not Sikh → Indian → World`,
  );
}

/** The invariant the validator enforces, stated directly. */
function unverifiedButLive(entries: HistoryEvent[]): HistoryEvent[] {
  return entries.filter((e) => e.forThisDate === false && e.origin !== 'curated');
}

/* ------------------------------------------------------------------ */
/* Temp stores, and the real publisher                                 */
/* ------------------------------------------------------------------ */

async function withStores<T>(candidates: CandidateDraft[], seen: SeenRecord[], body: () => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'focusdesk-history-verify-'));
  const savedEnv = { CURIOSITY_STORE: process.env.CURIOSITY_STORE, CURIOSITY_STATE_FILE: process.env.CURIOSITY_STATE_FILE };
  process.env.CURIOSITY_STORE = 'file';
  process.env.CURIOSITY_STATE_FILE = join(dir, 'state.json');
  setStateStoreForTesting(new FileStateStore(join(dir, 'state.json')));
  const candidateStore = new FileCandidateStore(join(dir, 'candidates.json'));
  setCandidateStoreForTesting(candidateStore);
  try {
    if (candidates.length) await candidateStore.writeUpsert(reservoirOf(candidates));
    if (seen.length) {
      const seeded = await getStateStore().withLease(30_000, () => ({ seen }));
      assert.ok(seeded.ok, `could not seed the cooled-down ledger: ${JSON.stringify(seeded).slice(0, 200)}`);
    }
    return await body();
  } finally {
    setCandidateStoreForTesting(null);
    setStateStoreForTesting(null);
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Every network call fails, so the publish is offline and the history comes only from the reservoir and the curated corpus. */
const offlineFetch = (async () => {
  throw new Error('verification: no network');
}) as unknown as typeof fetch;

/** Runs the real publisher for 6 November 2026 and returns the stored triad. */
async function publishNov6(): Promise<{ status: string; detail: string; date: string; entries: HistoryEvent[] | null }> {
  const summary = await runCuriosityRefresh({ now: NOV_6_MIDNIGHT_IST, fetchImpl: offlineFetch, trigger: 'cron' });
  const state = await getStateStore().read();
  const entries = state.daily?.date === summary.date ? (state.daily?.payload.historyEntries ?? null) : null;
  return { status: summary.status, detail: summary.detail, date: summary.date, entries };
}

async function main() {
  /* ---------------------------------------------------------------- *
   * 1. The exact 6 November failure, end to end                      *
   * ---------------------------------------------------------------- */
  {
    // The stray Indian record is non-curated and dated 5 March. Every curated Indian
    // entry was published inside the cooldown, so the archive fallback is the only
    // slot left, and before the fix that is where the stray record was chosen.
    const seen = curatedInCooldown('indian-history');
    const run = await withStores([STRAY_ON_OTHER_DAYS[0]], seen, publishNov6);
    assert.equal(run.date, NOV_6, `the publisher wrote ${run.date}, not ${NOV_6}`);
    assert.notEqual(run.status, 'failed', `6 November was refused: ${run.detail}`);
    assert.ok(run.entries, '6 November published no historyEntries');
    assertCategoryOrder(run.entries, '6 November');
    assert.deepEqual(unverifiedButLive(run.entries), [], 'a live record was published under 6 November unverified');
    assert.deepEqual(historyProblems(run.entries), [], 'the validator refused the 6 November triad');
    assert.equal(run.entries[1].origin, 'curated', 'the Indian fallback must be a curated, labelled entry');
    assert.equal(run.entries[1].forThisDate, false, 'a curated fallback must say it is not for this date');
    pass(
      1,
      '6 November 2026 (run at 00:00 Asia/Kolkata) publishes with a curated, labelled Indian fallback when the stray live record is present and every curated entry is in cooldown',
    );
  }

  /* ---------------------------------------------------------------- *
   * 2. A verified replacement for the day is preferred and published *
   * ---------------------------------------------------------------- */
  let verifiedRunEntries: HistoryEvent[] | null = null;
  {
    const verified = liveDraft({
      id: 'hist-indian-verified-1106',
      category: 'indian-history',
      month: 11,
      day: 6,
      year: 1920,
      title: 'Verified Indian event on 6 November 1920',
      description: 'Pilgrims gathered along the Godavari ferry crossings while rain delayed the district survey of cotton mills.',
    });
    const seen = curatedInCooldown('indian-history');
    const run = await withStores([...STRAY_ON_OTHER_DAYS, verified], seen, publishNov6);
    assert.notEqual(run.status, 'failed', `a verified replacement was refused: ${run.detail}`);
    assert.ok(run.entries);
    assertCategoryOrder(run.entries, 'verified replacement');
    assert.equal(run.entries[1].id, 'hist-indian-verified-1106', 'the verified 6 November event did not replace the fallback');
    assert.equal(run.entries[1].origin, 'live');
    assert.equal(run.entries[1].forThisDate, true);
    assert.deepEqual(historyProblems(run.entries), [], 'the validator refused a verified replacement');
    verifiedRunEntries = run.entries;
    pass(2, 'a verified Indian event for 6 November replaces the curated fallback, is labelled verified, and the day publishes');
  }

  /* ---------------------------------------------------------------- *
   * 3. The validator still refuses an unverified entry               *
   * ---------------------------------------------------------------- */
  {
    assert.ok(verifiedRunEntries);
    const good = verifiedRunEntries;
    const forged = good.map((e, i) => (i === 1 ? { ...e, origin: 'live' as const, forThisDate: false } : e));
    assert.ok(
      invalidDailyFields({ history: forged[0], historyEntries: forged } as never).includes(
        'historyEntries[1] labelled when not verified for date',
      ),
      'the validator accepted a live entry labelled not-for-date',
    );
    const curatedFallback = good.map((e, i) => (i === 1 ? { ...e, origin: 'curated' as const, forThisDate: false } : e));
    assert.deepEqual(historyProblems(curatedFallback), [], 'a curated, labelled fallback must still pass');
    const unlabelled = good.map((e, i) => (i === 1 ? { ...e, origin: 'live' as const, forThisDate: undefined as unknown as boolean } : e));
    assert.deepEqual(historyProblems(unlabelled), [], 'an entry with no forThisDate label is not a labelled non-match');
    pass(3, 'the validator still refuses a live entry labelled not-for-date and accepts a curated labelled fallback; nothing was relaxed');
  }

  /* ---------------------------------------------------------------- *
   * 4. Sampled year: no unverified live entry, any day, any slot     *
   * ---------------------------------------------------------------- */
  {
    const dates = new Set<string>([NOV_6, '2026-11-05', '2026-01-27', '2026-02-26', '2026-02-28', '2026-03-28', '2028-02-28', '2028-02-29', '2026-12-31', '2027-01-01']);
    for (let d = 0; d < 366; d += 7) {
      const iso = new Date(Date.UTC(2026, 0, 1) + d * 86_400_000).toISOString().slice(0, 10);
      dates.add(iso);
    }
    const reservoir = reservoirOf([...STRAY_ON_OTHER_DAYS]);
    let checked = 0;
    for (const date of dates) {
      const res = await selectHistoryTriad({ date, seen: [], reservoirCandidates: reservoir });
      assertCategoryOrder(res.entries, date);
      assert.deepEqual(unverifiedButLive(res.entries), [], `${date}: an unverified live entry was selected`);
      assert.deepEqual(historyProblems(res.entries), [], `${date}: the validator would refuse this triad`);
      checked += 1;
    }
    pass(4, `${checked} sampled days across 2026–2028 (including 6 November, 28 Feb and 29 Feb) with a stray live record in every category: no unverified live entry, order always Sikh → Indian → World`);
  }

  /* ---------------------------------------------------------------- *
   * 5. Adjacent: all curated entries cooled down, every category      *
   * ---------------------------------------------------------------- */
  {
    const seen = [...curatedInCooldown('sikh-history'), ...curatedInCooldown('indian-history'), ...curatedInCooldown('world-history')];
    const reservoir = reservoirOf([...STRAY_ON_OTHER_DAYS]);
    const res = await selectHistoryTriad({ date: NOV_6, seen, reservoirCandidates: reservoir });
    assertCategoryOrder(res.entries, 'full cooldown');
    assert.deepEqual(unverifiedButLive(res.entries), []);
    assert.deepEqual(historyProblems(res.entries), []);
    assert.ok(res.cooldownRelaxations >= 1, 'a cooled-down curated pool must record that it relaxed');
    pass(5, 'with every curated entry inside its cooldown, each slot still publishes a curated, labelled fallback and records the relaxation');
  }

  /* ---------------------------------------------------------------- *
   * 6. Adjacent: 28 February and 29 February                          *
   * ---------------------------------------------------------------- */
  {
    const leapDraft = liveDraft({ id: 'hist-indian-leap-0229', category: 'indian-history', month: 2, day: 29, year: 1904, title: 'A live Indian event on 29 February 1904' });
    // Non-leap 28 February: a live 29 February record is not 28 February and must not appear.
    const nonLeap = await selectHistoryTriad({ date: '2026-02-28', seen: [], reservoirCandidates: reservoirOf([leapDraft]) });
    assert.deepEqual(unverifiedButLive(nonLeap.entries), [], 'a 29 February live record was shown on a non-leap 28 February');
    assert.notEqual(nonLeap.entries[1].id, 'hist-indian-leap-0229');
    assert.deepEqual(historyProblems(nonLeap.entries), []);
    // Leap-year 29 February: the same record is an exact match and is verified.
    const leap = await selectHistoryTriad({ date: '2028-02-29', seen: [], reservoirCandidates: reservoirOf([leapDraft]) });
    // Curated exact matches are preferred, so the curated 29 February entry may win;
    // what the rule needs is a verified 29 February entry on 29 February.
    assert.equal(leap.entries[1].forThisDate, true, '29 February in a leap year did not match its own day');
    assert.equal(leap.entries[1].month, 2);
    assert.equal(leap.entries[1].day, 29);
    assert.deepEqual(unverifiedButLive(leap.entries), []);
    // Leap-year 28 February: not a leap-day observation, so the record must not appear.
    const leapYear28 = await selectHistoryTriad({ date: '2028-02-28', seen: [], reservoirCandidates: reservoirOf([leapDraft]) });
    assert.notEqual(leapYear28.entries[1].id, 'hist-indian-leap-0229');
    assert.deepEqual(unverifiedButLive(leapYear28.entries), []);
    pass(6, '29 February records are never shown on a non-leap 28 February, are verified on 29 February in a leap year, and are not used on 28 February in a leap year');
  }

  /* ---------------------------------------------------------------- *
   * 7. Adjacent: year-only records and calendar-date parsing         *
   * ---------------------------------------------------------------- */
  {
    const yearOnly = liveDraft({ id: 'hist-indian-year-only', category: 'indian-history', year: 1921, title: 'An Indian event known only by year 1921' });
    const res = await selectHistoryTriad({ date: NOV_6, seen: curatedInCooldown('indian-history'), reservoirCandidates: reservoirOf([yearOnly]) });
    assert.notEqual(res.entries[1].id, 'hist-indian-year-only', 'a year-only record was published as a history entry for 6 November');
    assert.deepEqual(unverifiedButLive(res.entries), []);
    assert.deepEqual(parseIsoCalendarDate(NOV_6), { year: 2026, month: 11, day: 6 });
    assert.equal(parseIsoCalendarDate('2026-02-29'), null, 'a non-existent 29 February was parsed');
    pass(7, 'a year-only record never reaches a day, and calendar dates are parsed from the ISO day with no time-zone shift');
  }

  /* ---------------------------------------------------------------- *
   * 8. Asia/Kolkata boundary                                         *
   * ---------------------------------------------------------------- */
  {
    assert.equal(publicationDate(new Date('2026-11-05T18:29:59Z')), '2026-11-05', 'one second before IST midnight is still 5 November');
    assert.equal(publicationDate(new Date('2026-11-05T18:30:00Z')), NOV_6, '18:30 UTC is 00:00 6 November in Asia/Kolkata');
    assert.equal(publicationDate(new Date('2026-11-06T18:29:59Z')), NOV_6, 'one second before the next IST midnight is still 6 November');
    // A record for the day before must not match the day being published.
    const yesterday = liveDraft({ id: 'hist-indian-nov5', category: 'indian-history', month: 11, day: 5, year: 1930, title: 'An Indian event on 5 November 1930' });
    const res = await selectHistoryTriad({ date: NOV_6, seen: curatedInCooldown('indian-history'), reservoirCandidates: reservoirOf([yesterday]) });
    assert.notEqual(res.entries[1].id, 'hist-indian-nov5', '5 November was shown on 6 November');
    pass(8, 'the publication day is Asia/Kolkata (18:30 UTC is 00:00 IST), and a record for 5 November is not used on 6 November');
  }

  /* ---------------------------------------------------------------- *
   * 9. Priority: a verified Sikh event outranks Indian and World      *
   * ---------------------------------------------------------------- */
  {
    const sikh = liveDraft({ id: 'hist-sikh-live-1106', category: 'sikh-history', month: 11, day: 6, year: 1700, title: 'Verified Sikh event on 6 November 1700', description: 'Sangat assembled at the gurdwara for langar and a reading of the hymns after the morning procession.' });
    const indian = liveDraft({ id: 'hist-indian-live-1106', category: 'indian-history', month: 11, day: 6, year: 1920, title: 'Verified Indian event on 6 November 1920', description: 'Pilgrims gathered along the Godavari ferry crossings while rain delayed the district survey of cotton mills.' });
    const world = liveDraft({ id: 'hist-world-live-1106', category: 'world-history', month: 11, day: 6, year: 1940, title: 'Verified world event on 6 November 1940', description: 'A transatlantic convoy altered course after a radio intercept, reshaping the shipping schedule for the autumn.' });
    const res = await selectHistoryTriad({ date: NOV_6, seen: [], reservoirCandidates: reservoirOf([world, indian, sikh]) });
    assertCategoryOrder(res.entries, 'priority');
    assert.equal(res.entries[0].id, 'hist-sikh-live-1106');
    assert.equal(res.entries[1].id, 'hist-indian-live-1106');
    assert.equal(res.entries[2].id, 'hist-world-live-1106');
    assert.ok(res.entries.every((e) => e.forThisDate === true && e.origin === 'live'));
    pass(9, 'when all three categories have a verified event for the day, the triad is Sikh → Indian → World regardless of input order');
  }

  /* ---------------------------------------------------------------- *
   * 10. Disputed Sikh dates still match their day                    *
   * ---------------------------------------------------------------- */
  {
    // Sikh dates in the curated corpus are Nanakshahi/Bikrami and carry `disputed`
    // precision. They must keep matching their own day, or the Sikh priority breaks.
    const disputed = sikhHistorySeed.find((r) => r.month === 11 && r.day === 24);
    assert.ok(disputed, 'the 24 November Sikh seed is missing from the corpus');
    assert.equal(disputed?.datePrecision, 'disputed');
    const res = await selectHistoryTriad({ date: '2026-11-24', seen: [], reservoirCandidates: [] });
    assert.equal(res.entries[0].id, disputed!.id, 'a disputed Sikh date stopped matching its day');
    assert.equal(res.entries[0].forThisDate, true);
    assert.equal(res.entries[0].origin, 'curated');
    pass(10, 'disputed (Nanakshahi/Bikrami) Sikh dates still match their day, so the Sikh priority is not weakened');
  }

  /* ---------------------------------------------------------------- *
   * 11. The fallback corpus is never empty for any category          *
   * ---------------------------------------------------------------- */
  {
    assert.ok(sikhHistorySeed.length > 0 && indianHistorySeed.length > 0 && worldHistorySeed.length > 0);
    const curated = curatedReservoirDrafts().filter((d) => HISTORY_CATEGORY_ORDER.includes(d.category as HistoryCategory));
    for (const category of HISTORY_CATEGORY_ORDER) {
      assert.ok(curated.some((d) => d.category === category && (d.payload as { origin?: string })?.origin === 'curated'), `no curated ${category} fallback`);
    }
    pass(11, 'every history category has at least one curated, labelled fallback, so the archive slot can always publish');
  }

  console.log(`\nALL ${passed} HISTORY VERIFICATION CHECKS PASSED.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
