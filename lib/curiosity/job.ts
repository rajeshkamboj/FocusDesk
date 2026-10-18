import { dailyEditorial } from './content';
import { loadDatabasePool } from './content-db';
import { eligibleEntries, isCuriosityCategory, mergePool, poolFor, selectFromPool } from './pool';
import { buildRecommendation, lookupBook } from './openlibrary';
import { fetchDeveloperRadar, fetchHistory, fetchNews, type SourceNote } from './sources';
import { addPublicationDays, isBookDue, isDailyDue, publicationDate, BOOK_INTERVAL_DAYS } from './schedule';
import { emptyState, getStateStore, recentSeenIds, type RefreshTrigger, type CuriosityState, type DailyPayload } from './state';
import type {
  BookCandidate,
  CuriosityBriefing,
  BookRecommendation,
  CuriosityCategory,
  CuriosityPoolEntry,
  LearningItem,
  LiteratureItem,
  OneThingItem,
  PublishedContentIds,
} from './types';

/**
 * The publisher: the only place in Curiosity that writes, and the only place
 * that goes to the network for the daily cards.
 *
 * ## Why a job and not a render
 *
 * A briefing used to be computed each time the page was built and cached for an
 * hour, so the "daily" content was really "whatever the first visitor of the
 * day happened to get", and a book could change mid-afternoon when the cache
 * expired. Here the schedule decides the day, the job decides the content, and
 * a render only reads the result. Opening the app cannot make content.
 *
 * ## What the job guarantees
 *
 *  - **Once per day per kind.** The publication date is compared to today’s
 *    Asia/Kolkata day, so a scheduler that fires twice — or twice plus a manual
 *    click — publishes nothing the second time. `already-published` is a
 *    success, not an error.
 *  - **One run at a time.** The store’s lease is held for the whole run, so an
 *    overlapping invocation gets `busy` and leaves the record alone.
 *  - **Failure is conservative.** A source that fails degrades that one card to
 *    its curated text; a store that cannot be written leaves the *previous*
 *    snapshot in place, still served. Nothing in here deletes or clears content.
 *  - **No repeats from memory.** The rotation is told which ids were published
 *    recently and skips them, which is what prevents “today” from being the same
 *    page as yesterday after a redeploy, a forced refresh or a catch-up run.
 *
 * ## Fallback if no scheduler is configured
 *
 * `catchUpOnRender()` is the only path that may publish outside the schedule, and
 * only when nothing has been published for the current day. It is what lets a
 * deployment without cron still turn the page over once per day; the store claim
 * makes it idempotent, so the first request of the day publishes and every later
 * request reads. Set `CURIOSITY_AUTO_PUBLISH=off` to require the scheduler.
 */

export type RefreshScope = 'daily' | 'book' | 'all';

export type DailyOutcome = {
  published: boolean;
  reason?: 'already-published' | 'busy' | 'failed';
  contentIds?: PublishedContentIds;
  degraded?: string[];
  detail?: string;
};

export type BookOutcome = {
  published: boolean;
  reason?: 'interval' | 'already-published' | 'busy' | 'failed' | 'kept-previous';
  contentId?: string;
  source?: BookRecommendation['source'];
  cover?: boolean;
  detail?: string;
};

export type RefreshSummary = {
  status: 'published' | 'already-published' | 'busy' | 'failed';
  /** The Asia/Kolkata day the run was for. */
  date: string;
  /** The instant the run finished, for the settings panel. */
  at: string;
  store: { kind: 'file' | 'supabase'; location: string };
  trigger: RefreshTrigger;
  daily: DailyOutcome;
  book: BookOutcome;
  detail: string;
};

/** A run must not hold the lease longer than its own slowest failure path. */
export const LEASE_MS = 4 * 60_000;

const POOL_CATEGORY_BY_CARD: Record<'oneThing' | 'literature' | 'learning' | 'book', CuriosityCategory> = {
  oneThing: 'one-thing',
  literature: 'literature',
  learning: 'learn-something',
  book: 'book',
};

export function normalizeScope(value: string | null | undefined): RefreshScope {
  return value === 'daily' || value === 'book' ? value : 'all';
}

/* ------------------------------------------------------------------ */
/* Building one day                                                    */
/* ------------------------------------------------------------------ */

/** The pool entry for a category on a date, with the recent ledger excluded. */
function pickEntry<T>(
  category: CuriosityCategory,
  date: string,
  state: CuriosityState,
  pools?: Record<CuriosityCategory, CuriosityPoolEntry<unknown>[]>,
): CuriosityPoolEntry<T> {
  const seen = recentSeenIds(state, category);
  const { entry } = selectFromPool(category, date, { seenIds: seen, ...(pools ? { pool: pools[category] } : {}) });
  return entry as CuriosityPoolEntry<T>;
}

/**
 * The authored pools, with any `curiosity_content` rows merged over them.
 *
 * Read once per run and only in the publisher, so a database row can change what
 * gets published without the render path ever depending on the database being up.
 * No date is passed down: `available_from` is applied by the rotation itself
 * (`eligibleEntries`), so the pool and the fallback share one eligibility rule.
 */
export async function loadPools(): Promise<Record<CuriosityCategory, CuriosityPoolEntry<unknown>[]>> {
  const rows = await loadDatabasePool();
  return (['one-thing', 'literature', 'learn-something', 'book'] as CuriosityCategory[]).reduce(
    (acc, category) => ({
      ...acc,
      [category]: mergePool(poolFor(category), rows.filter((entry) => entry.category === category)),
    }),
    {} as Record<CuriosityCategory, CuriosityPoolEntry<unknown>[]>,
  );
}

/**
 * The three network-free daily cards, straight from the pool with the ledger
 * applied. Each returns its own item shape, so `content.ts` and the published
 * snapshot share one source of truth for what a card contains.
 */
export function selectDailyEditorial(
  date: string,
  state: CuriosityState,
  pools?: Record<CuriosityCategory, CuriosityPoolEntry<unknown>[]>,
) {
  const oneThingEntry = pickEntry<OneThingItem>(POOL_CATEGORY_BY_CARD.oneThing, date, state, pools);
  const literatureEntry = pickEntry<LiteratureItem>(POOL_CATEGORY_BY_CARD.literature, date, state, pools);
  const learningEntry = pickEntry<LearningItem>(POOL_CATEGORY_BY_CARD.learning, date, state, pools);
  return {
    oneThing: { item: oneThingEntry.item, id: oneThingEntry.id },
    literature: { item: literatureEntry.item, id: literatureEntry.id },
    learning: { item: learningEntry.item, id: learningEntry.id },
  };
}

/** The card for a day Open Library could not be consulted for: our text, nothing invented. */
function curatedBookFor(entry: CuriosityPoolEntry<BookCandidate>): BookRecommendation {
  return buildRecommendation(entry, null);
}

/** The book the page shows right now: the published record, else the curated fallback. */
export function currentBook(state: CuriosityState, date: string): BookRecommendation {
  if (state.book?.payload) return state.book.payload;
  return curatedBookFor(pickEntry<BookCandidate>(POOL_CATEGORY_BY_CARD.book, date, emptyState()));
}

/* ------------------------------------------------------------------ */
/* The job                                                             */
/* ------------------------------------------------------------------ */

export async function runCuriosityRefresh(
  options: {
    scope?: RefreshScope;
    trigger?: RefreshTrigger;
    force?: boolean;
    now?: Date;
    fetchImpl?: typeof fetch;
    /** Skips every network call; used by the offline verification of state handling. */
    offline?: boolean;
  } = {},
): Promise<RefreshSummary> {
  const now = options.now ?? new Date();
  const scope = options.scope ?? 'all';
  const trigger = options.trigger ?? 'cron';
  const fetchImpl = options.fetchImpl ?? fetch;
  const date = publicationDate(now);
  const store = getStateStore();
  // `store` is read at report time, not here: the file store chooses its writable
  // location on the first publish of a process, and a summary that names a path the
  // run then abandoned is worse than no path at all.
  const storeAtReportTime = (): RefreshSummary['store'] => ({ kind: store.kind, location: store.location });
  const started: Omit<RefreshSummary, 'daily' | 'book' | 'status' | 'detail' | 'store'> = {
    date,
    at: now.toISOString(),
    trigger,
  };

  let daily: DailyOutcome = { published: false, reason: 'busy' };
  let book: BookOutcome = { published: false, reason: 'busy' };

  // Read the optional database pool before claiming the lease: it is a read, it
  // cannot be wrong in a way that damages the record, and doing it outside the
  // lease keeps the single-flight window as short as possible.
  const pools = await loadPools();

  const result = await store.withLease(LEASE_MS, async (state: CuriosityState) => {
    const patch: Partial<CuriosityState> = {};
    const seenRecords: CuriosityState['seen'] = [];
    const publishedAt = now.toISOString();

    /* ---- One Book, every three days ---------------------------------- */
    const wantBook = scope === 'book' || scope === 'all';
    // A record published *today* is not re-rolled, even under `force`: the admin
    // button re-checks the catalogue, it does not swap the book under a reader who
    // has already seen it. The interval is measured from the last successful day.
    const bookAlreadyToday = state.book?.date === date;
    const bookDue = wantBook && !bookAlreadyToday && isBookDue(now, state.book?.date, { force: options.force });
    if (wantBook && bookAlreadyToday) {
      book = { published: false, reason: 'already-published', contentId: state.book?.contentId, source: state.book?.payload.source, detail: `One Book is already published for ${date}.` };
    } else if (wantBook && !bookDue) {
      book = { published: false, reason: 'interval', contentId: state.book?.contentId, source: state.book?.payload.source, detail: `Next change ${addPublicationDays(state.book?.date ?? date, BOOK_INTERVAL_DAYS)} (every ${BOOK_INTERVAL_DAYS} days).` };
    } else if (wantBook) {
      const entry = pickEntry<BookCandidate>(POOL_CATEGORY_BY_CARD.book, date, state, pools);
      const { id } = entry;
      const lookup = options.offline
        ? ({ status: 'unresolved' as const, note: 'Offline run: Open Library was not contacted.', book: curatedBookFor(entry) } as const)
        : await lookupBook(entry, { fetchImpl });
      if (lookup.status === 'failed') {
        // Keep the last successful book, for as long as it takes the catalogue to
        // answer again. The card stays populated and the log says why it did not
        // change; because the interval is measured from the last *successful*
        // publish, the next scheduled run retries it.
        book = { published: false, reason: 'kept-previous', contentId: state.book?.contentId, source: state.book?.payload.source, detail: `Open Library lookup failed (${lookup.error}); keeping the previous recommendation.` };
      } else {
        // The catalogue's own timestamp is replaced by the run's clock so a
        // snapshot is internally consistent (and testable) end to end.
        const recommendation: BookRecommendation = { ...lookup.book, id, fetchedAt: publishedAt };
        patch.book = {
          date,
          publishedAt,
          contentId: id,
          payload: recommendation,
          degraded: lookup.status === 'unresolved' ? [`openlibrary: ${lookup.note}`] : [],
          trigger,
        };
        seenRecords.push({ category: 'book', id, on: date });
        book = { published: true, contentId: id, source: recommendation.source, cover: Boolean(recommendation.coverUrl), detail: lookup.status === 'unresolved' ? 'Published from the curated record; Open Library returned no matching work.' : 'Published with Open Library metadata.' };
      }
    }

    /* ---- Daily cards -------------------------------------------------- */
    const wantDaily = scope === 'daily' || scope === 'all';
    // Re-publishing today's date (the admin button, a retried workflow) refreshes
    // the live sections and keeps the editorial picks: a day's briefing must not
    // change under a reader who is looking at it.
    const republishingToday = state.daily?.date === date ? state.daily : null;
    const dailyDue = wantDaily && isDailyDue(now, state.daily?.date, { force: options.force });
    if (wantDaily && !dailyDue) {
      daily = { published: false, reason: 'already-published', contentIds: state.daily?.contentIds, detail: `Already published for ${date}.` };
    } else if (wantDaily) {
      const editorial = dailyEditorial(date);
      const fresh = selectDailyEditorial(date, state, pools);
      const picks = republishingToday
        ? {
            oneThing: { item: republishingToday.payload.oneThing, id: republishingToday.contentIds['one-thing'] ?? '' },
            literature: { item: republishingToday.payload.literature, id: republishingToday.contentIds.literature ?? '' },
            learning: { item: republishingToday.payload.learning, id: republishingToday.contentIds['learn-something'] ?? '' },
          }
        : fresh;
      const degraded: string[] = [];

      const newsNote: SourceNote = {};
      const radarNote: SourceNote = {};
      const historyNote: SourceNote = {};
      const [news, radar] = options.offline
        ? [[] as CuriosityBriefing['aiWorld'], [] as CuriosityBriefing['developerRadar']]
        : [await fetchNews(fetchImpl, newsNote), await fetchDeveloperRadar(fetchImpl, radarNote)];

      // A section whose source did not answer keeps the last successful items
      // rather than being replaced by an empty list, and says so on the snapshot.
      const keep = (label: string, next: number, previous: number, why?: string) => {
        // The reason travels with the note, so an empty card is explainable from the
        // record alone: "the feeds were unreachable here" and "the feeds are quiet
        // today" are different problems with different fixes.
        const cause = why ? ` (${why})` : '';
        if (previous) degraded.push(`${label}: source returned nothing${cause}; kept the ${previous} item(s) from ${state.daily?.date ?? 'the last run'}`);
        else if (!next) degraded.push(`${label}: nothing to publish for this day${cause}`);
      };
      const aiWorld = news.length ? news : (republishingToday?.payload.aiWorld ?? state.daily?.payload.aiWorld ?? []);
      const developerRadar = radar.length ? radar : (republishingToday?.payload.developerRadar ?? state.daily?.payload.developerRadar ?? []);
      keep('aiWorld', news.length, (republishingToday?.payload.aiWorld ?? state.daily?.payload.aiWorld ?? []).length, newsNote.text);
      keep('developerRadar', radar.length, (republishingToday?.payload.developerRadar ?? state.daily?.payload.developerRadar ?? []).length, radarNote.text);

      // The curated date-matched event wins; the live anniversaries feed only
      // fills a day the corpus does not already cover.
      //
      // Unlike the rolling lists, history is *not* carried over from a previous
      // day. A news item is labelled with its own date, so yesterday's entry is
      // still true today; "Today in History" showing another day's anniversary
      // would be a wrong statement, not a stale one. The card has an honest
      // unavailable state for exactly this case, so it shows that instead.
      let history = editorial.history;
      if (!history && !options.offline) history = await fetchHistory(date, fetchImpl, historyNote);
      if (!history && !editorial.history) {
        degraded.push(`history: no curated event for this date${historyNote.text ? ` and ${historyNote.text}` : ' and no live source was consulted'}`);
      }

      const payload: DailyPayload = {
        aiWorld: [...aiWorld],
        developerRadar: [...developerRadar],
        oneThing: picks.oneThing.item,
        learning: picks.learning.item,
        literature: picks.literature.item,
        history,
        sharpener: editorial.sharpener,
        speakBetter: editorial.speakBetter,
        mythology: editorial.mythology,
        chemistry: editorial.chemistry,
        physics: editorial.physics,
        biology: editorial.biology,
      };
      const contentIds: PublishedContentIds = {
        'one-thing': picks.oneThing.id,
        literature: picks.literature.id,
        'learn-something': picks.learning.id,
        'speak-better': payload.speakBetter.id,
        mythology: payload.mythology.id,
        chemistry: payload.chemistry.id,
        physics: payload.physics.id,
        biology: payload.biology.id,
        sharpener: payload.sharpener.id,
        ...(history ? { history: `history-${date}` } : {}),
      };
      patch.daily = { date, publishedAt, contentIds, payload, degraded, trigger };
      if (!republishingToday) {
        for (const [category, entryId] of Object.entries(contentIds)) {
          if (entryId && category !== 'history' && isCuriosityCategory(category)) {
            seenRecords.push({ category, id: String(entryId), on: date });
          }
        }
      }
      daily = { published: true, contentIds, degraded, detail: degraded.length ? `Published with ${degraded.length} section(s) on retained or fallback content.` : 'Published all sections from live sources.' };
    }

    if (!patch.daily && !patch.book) return null;
    return {
      ...(patch.daily ? { daily: patch.daily } : {}),
      ...(patch.book ? { book: patch.book } : {}),
      seen: [...state.seen, ...seenRecords],
    };
  });

  if (!result.ok) {
    const detail = result.reason === 'busy' ? 'Another refresh holds the lease; nothing was written.' : `Refresh failed: ${result.error}. The last published content is unchanged.`;
    return {
      ...started,
      store: storeAtReportTime(),
      status: result.reason === 'busy' ? 'busy' : 'failed',
      daily: result.reason === 'busy' ? daily : { published: false, reason: 'failed', detail },
      book: result.reason === 'busy' ? book : { published: false, reason: 'failed', detail },
      detail,
    };
  }

  // The run log is written outside the mutation so a failed run is recorded too:
  // "the job ran and did nothing" is the fact an operator needs to see.
  const detail = [daily.detail, book.detail].filter(Boolean).join(' ');
  const status: 'published' | 'already-published' = result.wrote && (daily.published || book.published) ? 'published' : 'already-published';
  await store
    .withLease(30_000, (state) => ({
      runs: [
        ...state.runs,
        // A run that found nothing to publish is still a successful run: what an
        // operator needs from the log is "it fired", not "it fired and changed nothing".
        { at: new Date().toISOString(), trigger, ok: true, detail: `${status}: ${detail || 'no changes'}`.slice(0, 300) },
      ],
    }))
    .catch(() => null);

  return { ...started, store: storeAtReportTime(), status, daily, book, detail: detail || 'Nothing due; the published day is unchanged.' };
}

/* ------------------------------------------------------------------ */
/* Catch-up and reporting                                              */
/* ------------------------------------------------------------------ */

/**
 * Publish the current day if nobody has yet.
 *
 * Called from the render path only when there is no snapshot for today, so it is
 * a safety net for a deployment without a scheduler rather than a second
 * schedule: with cron configured the snapshot already exists and this returns
 * immediately without touching the network. `CURIOSITY_AUTO_PUBLISH=off` turns
 * the net off and makes the scheduler the only publisher.
 */
export async function catchUpOnRender(date: string, fetchImpl?: typeof fetch): Promise<RefreshSummary | null> {
  if ((process.env.CURIOSITY_AUTO_PUBLISH ?? '').toLowerCase() === 'off') return null;
  const store = getStateStore();
  const state = await store.read();
  const now = new Date();
  const today = publicationDate(now);
  // Only catch up for the day the reader is actually on. A request for a past or
  // future date must never publish: it would let one odd link write a day of content.
  if (date !== today) return null;
  const dailyDue = isDailyDue(now, state.daily?.date);
  const bookDue = isBookDue(now, state.book?.date);
  if (!dailyDue && !bookDue) return null;
  return runCuriosityRefresh({ scope: dailyDue && bookDue ? 'all' : dailyDue ? 'daily' : 'book', trigger: 'startup', fetchImpl });
}

export type CuriosityStatus = {
  store: { kind: 'file' | 'supabase'; location: string };
  today: string;
  scheduler: {
    cronSecretConfigured: boolean;
    autoPublish: boolean;
    /** The UTC cron line every scheduler in this repo uses (= 00:00 Asia/Kolkata). */
    schedule: string;
    timezone: string;
  };
  daily: { published: boolean; date?: string; publishedAt?: string; contentIds?: PublishedContentIds; degraded?: string[] } | null;
  book: { published: boolean; date?: string; publishedAt?: string; contentId?: string; source?: BookRecommendation['source']; nextChangeAfter?: string } | null;
  pool: Record<CuriosityCategory, { eligible: number; total: number }>;
  /** Most recent first. The database backend contributes a single entry. */
  runs: Array<{ at: string; ok: boolean; detail: string; trigger?: RefreshTrigger }>;
};

/** What an operator wants before they trust the cron: is anything there, and when did it last move? */
export async function getCuriosityStatus(now: Date = new Date()): Promise<CuriosityStatus> {
  const store = getStateStore();
  const state = await store.read();
  let runs: CuriosityStatus['runs'] = state.runs.slice(-5).reverse();
  if (runs.length === 0 && store.lastRun) {
    const last = await store.lastRun();
    if (last) runs = [last];
  }
  const date = publicationDate(now);
  const pool = (['one-thing', 'literature', 'learn-something', 'book'] as CuriosityCategory[]).reduce(
    (acc, category) => {
      const entries = poolFor(category);
      return { ...acc, [category]: { eligible: eligibleEntries(entries, date).length, total: entries.length } };
    },
    {} as CuriosityStatus['pool'],
  );
  return {
    store: { kind: store.kind, location: store.location },
    today: date,
    scheduler: {
      cronSecretConfigured: Boolean(process.env.CURIOSITY_CRON_SECRET?.trim()),
      autoPublish: (process.env.CURIOSITY_AUTO_PUBLISH ?? '').toLowerCase() !== 'off',
      schedule: '30 18 * * *',
      timezone: 'Asia/Kolkata',
    },
    daily: state.daily ? { published: true, date: state.daily.date, publishedAt: state.daily.publishedAt, contentIds: state.daily.contentIds, degraded: state.daily.degraded } : null,
    book: state.book ? { published: true, date: state.book.date, publishedAt: state.book.publishedAt, contentId: state.book.contentId, source: state.book.payload.source, nextChangeAfter: `${state.book.date} + ${BOOK_INTERVAL_DAYS} days` } : null,
    pool,
    runs,
  };
}
