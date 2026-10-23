import {
  CURATED_PER_DAY,
  brainSharpeners,
  curatedHistoryArchive,
  curatedHistoryMatches,
  historyEvents,
} from './content';
import { loadDatabasePool } from './content-db';
import { eligibleEntries, mergePool, poolFor, selectFromPool } from './pool';
import { buildRecommendation, lookupBook } from './openlibrary';
import { fetchDeveloperRadar, fetchHistoryCandidates, fetchNews, type SourceNote } from './sources';
import { addPublicationDays, isBookDue, isDailyDue, publicationDate, BOOK_INTERVAL_DAYS } from './schedule';
import {
  emptyState,
  getStateStore,
  recentSeenIds,
  type RefreshTrigger,
  type CuriosityState,
  type DailyPayload,
  type SeenRecord,
} from './state';
import type { CuriosityCardKey } from './catalog';
import {
  buildHistoryIndex,
  publicationRecords,
  toSeenRecord,
  type HistoryIndex,
} from './history';
import { selectMany, selectCandidate } from './selection';
import {
  candidateFingerprint,
  candidateFromHistory,
  candidateFromHistoryArchive,
  candidateFromMyth,
  candidateFromNews,
  candidateFromPool,
  candidateFromQuote,
  candidateFromRadar,
  candidateFromScience,
  candidateFromSharpener,
  candidateFromSpeakBetter,
  candidateSignature,
  type ContentCandidate,
} from './candidates';
import { speakBetterLessons } from './content/speak-better';
import { mythCharacters } from './content/mythology';
import { chemistryConcepts } from './content/chemistry';
import { physicsConcepts } from './content/physics';
import { biologyConcepts } from './content/biology';
import { aiBackgroundLibrary } from './content/ai-background';
import { radarFallbackShelf } from './content/radar-fallback';
import {
  describeDiscovery,
  discoverMythologyQueue,
  discoverSciences,
  resolveMythologyEntity,
  type ScienceDiscipline,
} from './discovery';
import { DAILY_QUOTES } from '../quotes';
import { idFromText } from './dedupe';
import { sectionOrigins, type SectionOrigins } from './origins';
import type {
  BookCandidate,
  BrainSharpener,
  CuriosityDurability,
  CuriosityNewsItem,
  DeveloperDiscovery,
  HistoryEvent,
  MythCharacter,
  ScienceConcept,
  SpeakBetterLesson,
  CuriositySectionOrigin,
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
  store: { kind: 'file' | 'supabase'; location: string; durability: CuriosityDurability; durable: boolean };
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


/* ------------------------------------------------------------------ */
/* The anti-repetition layer, wired into the publisher                 */
/* ------------------------------------------------------------------ */

/**
 * Per-card rotation offsets.
 *
 * These are the same offsets the render fallback has always used, now applied to
 * the *fresh* set rather than to the whole pool. Keeping them means two cards
 * that share a pool shape do not advance in lockstep, while the selection service
 * remains the thing that decides eligibility.
 */
const CARD_OFFSETS: Record<CuriosityCardKey, number> = {
  quote: 0,
  history: 0,
  'ai-world': 0,
  'developer-radar': 0,
  'one-thing': 0,
  literature: 5,
  'learn-something': 11,
  book: 2,
  'speak-better': 5,
  mythology: 2,
  chemistry: 7,
  physics: 11,
  biology: 3,
  sharpener: 0,
};

/** What a card's choice carries: the payload, its id, and the candidate behind both. */
type Chosen = { id: string; item: unknown; candidate?: ContentCandidate };

/**
 * The ledger row for one published item.
 *
 * The fingerprint and signature are computed from the payload the reader is
 * about to see, not from the source's raw response, so an item edited between
 * fetch and publish is recorded as what was actually shown.
 */
export function ledgerRecord(candidate: ContentCandidate, date: string): SeenRecord {
  return toSeenRecord({
    card: candidate.card,
    id: candidate.id,
    on: date,
    title: candidate.title,
    ...(candidate.url ? { url: candidate.url } : {}),
    fingerprint: candidateFingerprint(candidate),
    signature: candidateSignature(candidate),
    ...(candidate.subjects?.length ? { subjects: candidate.subjects } : {}),
    ...(candidate.sourceName ? { source: candidate.sourceName } : {}),
    ...(candidate.version ? { version: candidate.version } : {}),
  });
}

/** Curated concepts for a discipline, before discovery is merged in. */
function curatedScience(discipline: ScienceDiscipline) {
  const concepts =
    discipline === 'chemistry' ? chemistryConcepts : discipline === 'physics' ? physicsConcepts : biologyConcepts;
  return concepts.map((concept) => candidateFromScience(discipline, concept));
}

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
  // The durability is reported with the path: "written to /tmp" and "written to the
  // database" are different promises, and an operator reading a summary has to be able
  // to tell them apart without knowing how the store was constructed.
  const storeAtReportTime = (): RefreshSummary['store'] => ({
    kind: store.kind,
    location: store.location,
    durability: store.durability,
    durable: store.durability === 'shared',
  });
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
    // Built once per run, from the full retained ledger: every cooldown check in
    // this run reads this index, so two cards cannot disagree about what was
    // published last week.
    //
    // Today's own rows are excluded when today is being re-published. A forced
    // re-run is not a second discovery: it re-checks the live sources for the same
    // day, and the items published earlier today must remain eligible so the
    // snapshot does not change under a reader who is already looking at it. No new
    // ledger rows are written for that path, so this cannot become a backdoor to
    // publishing the same item twice.
    const republishingSameDay = state.daily?.date === date;
    const historyIndex: HistoryIndex = buildHistoryIndex(
      publicationRecords(state.seen).filter((record) => !republishingSameDay || record.on !== date),
    );

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
      // The book is selected through the same service as every other card, which
      // is what makes a book that reappears after 40 days — the old rotation's
      // behaviour with 25 entries — impossible while any unread one remains.
      const bookOutcome = selectCandidate(
        pools.book.map((entry) => candidateFromPool('book', entry)),
        { card: 'book', date, index: historyIndex, offset: CARD_OFFSETS.book },
      );
      const entry = bookOutcome.ok && bookOutcome.candidate
        ? (pools.book.find((candidateEntry) => candidateEntry.id === bookOutcome.candidate?.id) as CuriosityPoolEntry<BookCandidate> | undefined)
        : undefined;
      if (!entry) {
        // Nothing unread is left in the book pool: keep the recommendation the reader
        // already has rather than republishing a recent one under a new day key.
        book = { published: false, reason: 'failed', detail: `No unread book candidate for ${date}; the previous recommendation is kept.` };
      } else {
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
        const bookProblems = invalidBookFields(recommendation);
        if (bookProblems.length) {
          // A malformed catalogue record must not become anyone's book of the day. The
          // throw happens inside the lease, so nothing was written and the previous
          // record is still the reader's — which is also why this is reported as a
          // failed run rather than a degraded one.
          throw new RangeError(`refusing to publish the One Book record: ${bookProblems.join('; ')}`);
        }
        patch.book = {
          date,
          publishedAt,
          contentId: id,
          payload: recommendation,
          degraded: lookup.status === 'unresolved' ? [`openlibrary: ${lookup.note}`] : [],
          trigger,
        };
        seenRecords.push(ledgerRecord(candidateFromPool('book', entry), date));
        book = { published: true, contentId: id, source: recommendation.source, cover: Boolean(recommendation.coverUrl), detail: lookup.status === 'unresolved' ? 'Published from the curated record; Open Library returned no matching work.' : 'Published with Open Library metadata.' };
      }
      }
    }

    /* ---- Daily cards -------------------------------------------------- */
    const wantDaily = scope === 'daily' || scope === 'all';
    // Re-publishing today's date (the admin button, a retried workflow) refreshes
    // the live sections and keeps every editorial pick: a day's briefing must not
    // change under a reader who is looking at it. The selection layer enforces the
    // same rule on its own, but reusing the published payload is stronger — it does
    // not depend on the ledger having been written yet.
    const republishingToday = state.daily?.date === date ? state.daily : null;
    const dailyDue = wantDaily && isDailyDue(now, state.daily?.date, { force: options.force });
    if (wantDaily && !dailyDue) {
      daily = { published: false, reason: 'already-published', contentIds: state.daily?.contentIds, detail: `Already published for ${date}.` };
    } else if (wantDaily) {
      const degraded: string[] = [];
      const reusing = Boolean(republishingToday);
      const previousPayload = republishingToday?.payload ?? null;
      const previousIds = republishingToday?.contentIds ?? {};
      const reserved = new Set<string>();
      const selectionNotes: string[] = [];
      const discoveryNotes: string[] = [];

      /**
       * One selector for every card in this run.
       *
       * `reserved` carries the subjects already used today, so two cards cannot
       * publish the same concept under different labels. Every relaxed window
       * reported by the selector becomes a note on the published day.
       */
      const pick = <T,>(
        card: CuriosityCardKey,
        candidates: ContentCandidate<T>[],
        count = 1,
        allowRelaxation = true,
      ): ContentCandidate<T>[] => {
        const result = selectMany<T>(
          candidates,
          {
            card,
            date,
            index: historyIndex,
            reservedSubjects: reserved,
            offset: CARD_OFFSETS[card] ?? 0,
            ...(allowRelaxation ? {} : { policy: { allowRelaxation: false } }),
          },
          count,
        );
        selectionNotes.push(...result.warnings);
        return result.candidates;
      };

      const choose = (card: CuriosityCardKey, candidates: ContentCandidate<unknown>[]): Chosen => {
        const [candidate] = pick(card, candidates, 1);
        if (!candidate) {
          // Nothing usable means the pool is empty or every item is excluded. The
          // throw happens inside the lease, so the previous day stays published and
          // the run reports the card by name. An empty card is never written.
          throw new RangeError(`refusing to publish ${date}: no usable ${card} candidate — every item is inside its exclusion window or the pool is empty`);
        }
        return { id: candidate.id, item: candidate.item, candidate };
      };

      const reusePick = (id: string | undefined, item: unknown): Chosen => ({ id: id ?? '', item });

      /* ---- Pool-backed editorial cards --------------------------- */
      const oneThingChoice = reusing
        ? reusePick(previousIds['one-thing'], previousPayload?.oneThing)
        : choose('one-thing', pools['one-thing'].map((entry) => candidateFromPool('one-thing', entry)));
      const literatureChoice = reusing
        ? reusePick(previousIds.literature, previousPayload?.literature)
        : choose('literature', pools.literature.map((entry) => candidateFromPool('literature', entry)));
      const learningChoice = reusing
        ? reusePick(previousIds['learn-something'], previousPayload?.learning)
        : choose('learn-something', pools['learn-something'].map((entry) => candidateFromPool('learn-something', entry)));

      /* ---- A Thought for Today ----------------------------------- */
      // The quote used to be chosen in the browser from a fixed list, so it repeated
      // on a fifty-one day clock and nothing recorded that it had been shown. It is
      // now published like any other card and carries the same cooldown.
      const quoteChoice = reusing
        ? reusePick(previousIds.quote, previousPayload?.quote)
        : choose('quote', DAILY_QUOTES.map((quote) => candidateFromQuote(quote)));

      /* ---- Speak Better and Brain Sharpener ---------------------- */
      const speakBetterChoice = reusing
        ? reusePick(previousIds['speak-better'], previousPayload?.speakBetter)
        : choose('speak-better', speakBetterLessons.map((lesson) => candidateFromSpeakBetter(lesson)));
      const sharpenerChoice = reusing
        ? reusePick(previousIds.sharpener, previousPayload?.sharpener)
        : choose('sharpener', brainSharpeners.map((sharpener) => candidateFromSharpener(sharpener)));

      /* ---- Mythology -------------------------------------------- */
      const mythologyChoice = reusing
        ? reusePick(previousIds.mythology, previousPayload?.mythology)
        : choose('mythology', mythCharacters.map((character) => candidateFromMyth(character)));
      if (!reusing && mythologyChoice.candidate) {
        // Enrich the *chosen* character only: one or two Wikidata requests a day, and
        // the entity id and aliases are what stop a figure returning as a variant name.
        const { character: enriched, note } = await resolveMythologyEntity(mythologyChoice.item as MythCharacter, { fetchImpl });
        if (note) discoveryNotes.push(`mythology: ${note}`);
        const enrichedCandidate = candidateFromMyth(enriched);
        mythologyChoice.item = enriched;
        mythologyChoice.candidate = enrichedCandidate;
      }

      /* ---- Science: authored corpus plus today's discovery ------- */
      const discovery = options.offline
        ? ({
            chemistry: { discipline: 'chemistry' as const, candidates: [], scanned: 0, rejected: 0, note: 'offline run' },
            physics: { discipline: 'physics' as const, candidates: [], scanned: 0, rejected: 0, note: 'offline run' },
            biology: { discipline: 'biology' as const, candidates: [], scanned: 0, rejected: 0, note: 'offline run' },
          } as Record<ScienceDiscipline, Awaited<ReturnType<typeof discoverSciences>>[ScienceDiscipline]>)
        : await discoverSciences(date, { fetchImpl });
      for (const discipline of ['chemistry', 'physics', 'biology'] as const) {
        if (discovery[discipline].note) discoveryNotes.push(describeDiscovery(discovery[discipline]));
      }

      // Mythology cannot be published from a lead paragraph — the card needs a
      // story, a family, a timeline and evidence-labelled claims — so discovery's
      // output for it is an *authoring queue*: named figures the curated corpus does
      // not cover yet, read from the tradition that rotates by day. It is reported
      // on the run so the queue is visible, and never becomes card content.
      const mythQueue = options.offline
        ? { queue: [], note: 'offline run' }
        : await discoverMythologyQueue(date, mythCharacters, { fetchImpl });
      const authoringQueue = mythQueue.queue.length
        ? `Mythology authoring queue (${mythQueue.tradition ?? 'unavailable'}): ${mythQueue.queue.slice(0, 6).map((entry) => entry.title).join(', ')}${mythQueue.queue.length > 6 ? ` (+${mythQueue.queue.length - 6} more)` : ''}`
        : null;
      if (mythQueue.note && !mythQueue.queue.length) discoveryNotes.push(`mythology: ${mythQueue.note}`);

      const chemistryChoice = reusing
        ? reusePick(previousIds.chemistry, previousPayload?.chemistry)
        : choose('chemistry', [...curatedScience('chemistry'), ...discovery.chemistry.candidates]);
      const physicsChoice = reusing
        ? reusePick(previousIds.physics, previousPayload?.physics)
        : choose('physics', [...curatedScience('physics'), ...discovery.physics.candidates]);
      const biologyChoice = reusing
        ? reusePick(previousIds.biology, previousPayload?.biology)
        : choose('biology', [...curatedScience('biology'), ...discovery.biology.candidates]);

      /* ---- Today in History -------------------------------------- */
      // Three tiers, in order: verified anniversaries for this date (live first, then
      // the authored corpus), then an archive entry explicitly labelled as *not*
      // belonging to this date. An anniversary that is not one is never presented
      // as one, and yesterday's event is never carried over.
      let historyChoice: Chosen;
      if (reusing) {
        historyChoice = reusePick(previousIds.history, previousPayload?.history);
      } else {
        const historyNote: SourceNote = {};
        const live = options.offline
          ? []
          : (await fetchHistoryCandidates(date, fetchImpl, historyNote)).map((event) => candidateFromHistory(event));
        const verified = [...live, ...curatedHistoryMatches(date).map((event) => candidateFromHistory(event))];
        const [verifiedChoice] = verified.length ? pick<HistoryEvent>('history', verified, 1, false) : [];
        if (verifiedChoice) {
          historyChoice = { id: verifiedChoice.id, item: verifiedChoice.item, candidate: verifiedChoice };
        } else {
          const archive = historyEvents.map((event) =>
            candidateFromHistoryArchive(
              { ...event, forThisDate: false, origin: 'curated' as const },
              `history-archive-${String(event.year)}-${idFromText(event.title)}`,
            ),
          );
          const [archiveChoice] = pick<HistoryEvent>('history', archive, 1, false);
          if (archiveChoice) {
            historyChoice = { id: archiveChoice.id, item: archiveChoice.item, candidate: archiveChoice };
            degraded.push(
              `history: no unseen verified anniversary for ${date}${historyNote.text ? ` (${historyNote.text})` : ''}; published a curated archive entry, labelled as not belonging to this date`,
            );
          } else {
            // The archive corpus has now been shown in full. A dated anniversary that
            // is not today's cannot be substituted, and leaving the card empty breaks
            // the day — so the archive rotation is allowed to come round again, with
            // its label (`forThisDate: false`) intact and the repetition recorded.
            const event = curatedHistoryArchive(date);
            const candidate = candidateFromHistoryArchive(
              event,
              `history-archive-${String(event.year)}-${idFromText(event.title)}`,
            );
            historyChoice = { id: candidate.id, item: candidate.item, candidate };
            degraded.push(
              `history: no unseen verified anniversary for ${date}${historyNote.text ? ` (${historyNote.text})` : ''}, and every archive entry has been shown inside its cooldown; repeating the least-recently used archive entry, labelled as not belonging to this date`,
            );
          }
        }
      }

      /* ---- AI World and Developer Radar -------------------------- */
      const newsNote: SourceNote = {};
      const radarNote: SourceNote = {};
      const [news, radar] = options.offline
        ? [[] as CuriosityNewsItem[], [] as DeveloperDiscovery[]]
        : await Promise.all([fetchNews(fetchImpl, newsNote), fetchDeveloperRadar(fetchImpl, radarNote)]);

      const liveNews = news.length
        ? pick('ai-world', news.map((item) => candidateFromNews(item)), Math.min(news.length, 10), false)
        : [];
      const liveRadar = radar.length
        ? pick('developer-radar', radar.map((item) => candidateFromRadar(item)), Math.min(radar.length, 3), false)
        : [];

      const curatedNews = aiBackgroundLibrary.map((entry) => candidateFromNews(entry.item));
      const curatedRadarItems = radarFallbackShelf.map((entry) => candidateFromRadar(entry.item));

      /**
       * Precedence for a live card, unchanged from the original publisher and now
       * enforced by the selector rather than by the shape of an array:
       *   1. today's live items that pass the cooldown;
       *   2. the items the previous run successfully published (kept with their own
       *      dates and links, so a cached item is still a true statement);
       *   3. this repository's curated shelf, chosen through the same ledger.
       * A card is never left empty, and a fallback is always labelled.
       */
      let aiWorldChoices: ContentCandidate<CuriosityNewsItem>[] = liveNews;
      let radarChoices: ContentCandidate<DeveloperDiscovery>[] = liveRadar;
      let aiWorldOrigin: CuriositySectionOrigin = liveNews.length ? 'new' : 'unavailable';
      let radarOrigin: CuriositySectionOrigin = liveRadar.length ? 'new' : 'unavailable';
      let aiWorldItems: CuriosityNewsItem[] = aiWorldChoices.map((candidate) => candidate.item);
      let radarItems: DeveloperDiscovery[] = radarChoices.map((candidate) => candidate.item);

      if (!aiWorldItems.length && previousPayload?.aiWorld.length) {
        aiWorldItems = previousPayload.aiWorld;
        aiWorldOrigin = 'cached';
        degraded.push(`aiWorld: nothing usable from the live source${newsNote.text ? ` (${newsNote.text})` : ''}; kept the ${previousPayload.aiWorld.length} item(s) published for ${state.daily?.date ?? 'an earlier run'}`);
      } else if (!aiWorldItems.length) {
        aiWorldChoices = pick('ai-world', curatedNews, CURATED_PER_DAY);
        aiWorldItems = aiWorldChoices.map((candidate) => candidate.item);
        aiWorldOrigin = aiWorldItems.length ? 'curated' : 'unavailable';
        degraded.push(`aiWorld: nothing usable from the live source${newsNote.text ? ` (${newsNote.text})` : ''}; published ${aiWorldItems.length} curated background item(s)`);
      }

      if (!radarItems.length && previousPayload?.developerRadar.length) {
        radarItems = previousPayload.developerRadar;
        radarOrigin = 'cached';
        degraded.push(`developerRadar: nothing usable from the live source${radarNote.text ? ` (${radarNote.text})` : ''}; kept the ${previousPayload.developerRadar.length} item(s) published for ${state.daily?.date ?? 'an earlier run'}`);
      } else if (!radarItems.length) {
        radarChoices = pick('developer-radar', curatedRadarItems, CURATED_PER_DAY);
        radarItems = radarChoices.map((candidate) => candidate.item);
        radarOrigin = radarItems.length ? 'curated' : 'unavailable';
        degraded.push(`developerRadar: nothing usable from the live source${radarNote.text ? ` (${radarNote.text})` : ''}; published ${radarItems.length} curated shelf item(s)`);
      }

      if (!aiWorldItems.length && !previousPayload?.aiWorld.length) {
        // Last resort: the deterministic shelf slice, still labelled curated. This
        // can only be reached when the shelf itself is empty, which is a content bug.
        throw new RangeError(`refusing to publish ${date}: no AI World content from any source`);
      }
      if (!radarItems.length && !previousPayload?.developerRadar.length) {
        throw new RangeError(`refusing to publish ${date}: no Developer Radar content from any source`);
      }

      const payload: DailyPayload = {
        aiWorld: [...aiWorldItems],
        developerRadar: [...radarItems],
        oneThing: oneThingChoice.item as OneThingItem,
        learning: learningChoice.item as LearningItem,
        literature: literatureChoice.item as LiteratureItem,
        quote: quoteChoice.item as { text: string; author: string },
        history: historyChoice.item as HistoryEvent,
        sharpener: sharpenerChoice.item as BrainSharpener,
        speakBetter: speakBetterChoice.item as SpeakBetterLesson,
        mythology: mythologyChoice.item as MythCharacter,
        chemistry: chemistryChoice.item as ScienceConcept,
        physics: physicsChoice.item as ScienceConcept,
        biology: biologyChoice.item as ScienceConcept,
      };

      const idsFor = (choices: ContentCandidate<unknown>[]) => choices.map((candidate) => candidate.id).join('+');
      const contentIds: PublishedContentIds = {
        'one-thing': oneThingChoice.id,
        literature: literatureChoice.id,
        'learn-something': learningChoice.id,
        quote: quoteChoice.id,
        'speak-better': speakBetterChoice.id,
        mythology: mythologyChoice.id,
        chemistry: chemistryChoice.id,
        physics: physicsChoice.id,
        biology: biologyChoice.id,
        sharpener: sharpenerChoice.id,
        history: historyChoice.id,
        'ai-world': aiWorldOrigin === 'cached' ? previousIds['ai-world'] ?? '' : idsFor(aiWorldChoices),
        'developer-radar': radarOrigin === 'cached' ? previousIds['developer-radar'] ?? '' : idsFor(radarChoices),
      };

      // Validate the whole snapshot before it can be seen by anyone. A payload that
      // would render an empty or malformed card must fail here, inside the lease, so a
      // bad run leaves the previous good day exactly as it was rather than replacing it.
      const invalid = invalidDailyFields(payload);
      if (invalid.length) {
        throw new RangeError(`refusing to publish ${date}: ${invalid.join('; ')}`);
      }

      // Ledger rows are written only for what this run actually chose. A same-day
      // re-run reuses the published picks and therefore adds no history: the day is
      // already recorded, and a second row would be a duplicate publication.
      if (!reusing) {
        for (const choice of [
          oneThingChoice,
          literatureChoice,
          learningChoice,
          quoteChoice,
          speakBetterChoice,
          sharpenerChoice,
          mythologyChoice,
          chemistryChoice,
          physicsChoice,
          biologyChoice,
          historyChoice,
        ]) {
          if (choice.candidate) seenRecords.push(ledgerRecord(choice.candidate, date));
        }
        if (aiWorldOrigin !== 'cached') for (const candidate of aiWorldChoices) seenRecords.push(ledgerRecord(candidate, date));
        if (radarOrigin !== 'cached') for (const candidate of radarChoices) seenRecords.push(ledgerRecord(candidate, date));
      }

      // A relaxed cooldown or a failed discovery pass is part of the day's record,
      // not just the console: Settings → Data shows these, and the workflow prints
      // them. Silence about a fallback is what the brief calls presenting stale
      // content as newly discovered.
      degraded.push(...selectionNotes);
      if (!reusing && discoveryNotes.length) degraded.push(...discoveryNotes.map((note) => `discovery: ${note}`));

      patch.daily = {
        date,
        publishedAt,
        contentIds,
        payload,
        degraded,
        trigger,
      };
      daily = {
        published: true,
        contentIds,
        degraded,
        detail: [
          degraded.length
            ? `Published with ${degraded.length} note(s): retained, relaxed or fallback content.`
            : 'Published all sections from live sources.',
          authoringQueue,
        ]
          .filter(Boolean)
          .join(' '),
      };
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
  store: { kind: 'file' | 'supabase'; location: string; durability: CuriosityDurability; durable: boolean };
  today: string;
  scheduler: {
    cronSecretConfigured: boolean;
    autoPublish: boolean;
    /** The UTC cron line every scheduler in this repo uses (= 00:00 Asia/Kolkata). */
    schedule: string;
    timezone: string;
    /** The newest publish this process can see — the only liveness evidence from in here. */
    lastPublishAt: string | null;
    /**
     * Always false, stated so on purpose: a repository can declare a schedule, it cannot
     * see the platform's cron. Whether the scheduler is active is answered by
     * `lastPublishAt`, never by the existence of a config file or a secret.
     */
    provenActive: boolean;
  };
  daily: {
    published: boolean;
    date?: string;
    publishedAt?: string;
    contentIds?: PublishedContentIds;
    degraded?: string[];
    /** Per card: today's fetch, a kept-over run, or this repository's curated content. */
    sections?: SectionOrigins;
    /** Whether every card has content, so a "published" run is provably a usable day. */
    complete: boolean;
  } | null;
  book: { published: boolean; date?: string; publishedAt?: string; contentId?: string; source?: BookRecommendation['source']; nextChangeAfter?: string } | null;
  pool: Record<CuriosityCategory, { eligible: number; total: number }>;
  /** Most recent first. The database backend contributes a single entry. */
  runs: Array<{ at: string; ok: boolean; detail: string; trigger?: RefreshTrigger }>;
};

/** What an operator wants before they trust the cron: is anything there, and when did it last move? */
/* ------------------------------------------------------------------ */
/* Nothing is published that a reader would experience as a broken card */
/* ------------------------------------------------------------------ */

/**
 * A field that is missing, or so long that a parser has clearly fed one card the
 * contents of another. Deliberately blunt and small: this is the gate in front of the
 * write, not a linter.
 */
function blank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0 || value.trim().length > 6000;
}

function invalidUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !/^https?:\/\/\S+$/i.test(value.trim())) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol !== 'https:' && parsed.protocol !== 'http:';
  } catch {
    return true;
  }
}

/**
 * Field names that must be present and plausible before a daily payload becomes the
 * reader's briefing. Everything a card *claims* is checked against that claim: a dated
 * news item must have a date, an undated background item must not have one, and an
 * event that is not verified for today must be labelled as an archive pick. A payload
 * that fails here is a bug or a source that answered with the wrong shape — either way
 * the previous day's record is better than publishing it.
 */
export function invalidDailyFields(payload: DailyPayload): string[] {
  const problems: string[] = [];
  const check = (name: string, ok: boolean) => {
    if (!ok) problems.push(name);
  };

  check('oneThing.title', !blank(payload.oneThing?.title));
  check('oneThing.explanation', !blank(payload.oneThing?.explanation));
  check('learning.topic', !blank(payload.learning?.topic));
  check('learning.explanation', !blank(payload.learning?.explanation));
  check('literature.title', !blank(payload.literature?.title));
  check('literature.passage', !blank(payload.literature?.passage));
  check('literature.whyItMatters', !blank(payload.literature?.whyItMatters));

  check('aiWorld has items', (payload.aiWorld?.length ?? 0) > 0);
  payload.aiWorld?.forEach((item, index) => {
    check(`aiWorld[${index}].title`, !blank(item.title));
    check(`aiWorld[${index}].url`, !invalidUrl(item.url));
    check(`aiWorld[${index}].source`, !blank(item.source));
    if (item.origin === 'background') check(`aiWorld[${index}] carries no date`, blank(item.publishedAt));
    else check(`aiWorld[${index}].publishedAt`, !blank(item.publishedAt));
  });

  check('developerRadar has items', (payload.developerRadar?.length ?? 0) > 0);
  payload.developerRadar?.forEach((item, index) => {
    check(`developerRadar[${index}].name`, !blank(item.name));
    check(`developerRadar[${index}].description`, !blank(item.description));
    check(`developerRadar[${index}].url`, !invalidUrl(item.url));
  });

  if (payload.history) {
    check('history.title', !blank(payload.history.title));
    check('history.explanation', !blank(payload.history.explanation));
    check('history.year', !blank(String(payload.history.year ?? '')));
    check(
      'history labelled when not verified for this date',
      payload.history.forThisDate === false ? payload.history.origin === 'curated' : true,
    );
  } else {
    check('history', false);
  }

  for (const key of ['sharpener', 'speakBetter', 'mythology', 'chemistry', 'physics', 'biology'] as const) {
    const card = payload[key] as { id?: string } | undefined;
    check(`${key}.id`, !blank(card?.id));
  }
  check('mythology.story', !blank(payload.mythology?.story));

  // A Thought for Today: optional, but if it is present it must be a complete
  // attribution — an anonymous quotation is unattributable, and the card renders
  // the author as the caption.
  if (payload.quote) {
    check('quote.text', !blank(payload.quote.text));
    check('quote.author', !blank(payload.quote.author));
  }

  // The three science cards now accept discovered content as well as authored
  // content, so the gate is explicit about every field the card renders, and about
  // attribution: a discovered card without a source link would be a claim with no
  // way to check it.
  for (const key of ['chemistry', 'physics', 'biology'] as const) {
    const concept = payload[key];
    check(`${key}.topic`, !blank(concept?.topic));
    check(`${key}.simple`, !blank(concept?.simple));
    check(`${key}.connection`, !blank(concept?.connection));
    check(`${key}.surprising`, !blank(concept?.surprising));
    check(`${key}.question`, !blank(concept?.question));
    if (concept?.origin === 'wikipedia') {
      check(`${key}.source url`, !invalidUrl(concept?.source?.url));
      check(`${key}.source name`, !blank(concept?.source?.name));
    }
  }

  return problems;
}

/** The One Book record: a title, an author, something to read it for, and a working link. */
export function invalidBookFields(book: BookRecommendation): string[] {
  const problems: string[] = [];
  const check = (name: string, ok: boolean) => {
    if (!ok) problems.push(name);
  };
  check('book.title', !blank(book.title));
  check('book.author', !blank(book.author));
  check('book.synopsis', !blank(book.synopsis));
  check('book.why', !blank(book.why));
  check('book.url', !invalidUrl(book.url));
  if (book.coverUrl) check('book.coverUrl', !invalidUrl(book.coverUrl));
  return problems;
}

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
    store: { kind: store.kind, location: store.location, durability: store.durability, durable: store.durability === 'shared' },
    today: date,
    scheduler: {
      cronSecretConfigured: Boolean(process.env.CURIOSITY_CRON_SECRET?.trim()),
      autoPublish: (process.env.CURIOSITY_AUTO_PUBLISH ?? '').toLowerCase() !== 'off',
      schedule: '30 18 * * *',
      timezone: 'Asia/Kolkata',
      lastPublishAt: state.daily?.publishedAt ?? state.runs[state.runs.length - 1]?.at ?? null,
      provenActive: false,
    },
    daily: state.daily
      ? {
          published: true,
          date: state.daily.date,
          publishedAt: state.daily.publishedAt,
          contentIds: state.daily.contentIds,
          degraded: state.daily.degraded,
          sections: sectionOrigins(state.daily, date),
          // A published day is only "complete" when no card is empty and nothing was
          // recorded as degraded — curated content counts as content, because it is
          // useful content; an *empty* card does not.
          complete:
            state.daily.degraded.length === 0 &&
            state.daily.payload.aiWorld.length > 0 &&
            state.daily.payload.developerRadar.length > 0 &&
            state.daily.payload.history !== null,
        }
      : null,
    book: state.book ? { published: true, date: state.book.date, publishedAt: state.book.publishedAt, contentId: state.book.contentId, source: state.book.payload.source, nextChangeAfter: addPublicationDays(state.book.date, BOOK_INTERVAL_DAYS) } : null,
    pool,
    runs,
  };
}
