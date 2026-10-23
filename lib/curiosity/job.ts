import {
  CURATED_PER_DAY,
  brainSharpeners,
} from './content';
import { loadDatabasePool } from './content-db';
import { eligibleEntries, mergePool, poolFor, selectFromPool } from './pool';
import { buildRecommendation, lookupBook } from './openlibrary';
import { fetchDeveloperRadar, fetchNews, type SourceNote } from './sources';
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
  discoverHistoryForDate,
  discoverMythologyQueue,
  discoverSciences,
  resolveMythologyEntity,
  type ScienceDiscipline,
} from './discovery';
import {
  candidateToScienceConcept,
  getCandidateStore,
  getReservoirStatus,
  selectHistoryTriad,
} from './reservoir';
import { DAILY_QUOTES } from '../quotes';
import { sectionOrigins, type SectionOrigins } from './origins';
import {
  HISTORY_CATEGORY_ORDER,
  type BookCandidate,
  type BrainSharpener,
  type CuriosityDurability,
  type CuriosityNewsItem,
  type DeveloperDiscovery,
  type HistoryEvent,
  type MythCharacter,
  type ReservoirStatusSummary,
  type ScienceConcept,
  type SpeakBetterLesson,
  type CuriositySectionOrigin,
  type BookRecommendation,
  type CuriosityCategory,
  type CuriosityPoolEntry,
  type LearningItem,
  type LiteratureItem,
  type OneThingItem,
  type PublishedContentIds,
} from './types';

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
  date: string;
  at: string;
  store: { kind: 'file' | 'supabase'; location: string; durability: CuriosityDurability; durable: boolean };
  trigger: RefreshTrigger;
  daily: DailyOutcome;
  book: BookOutcome;
  detail: string;
};

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

function curatedBookFor(entry: CuriosityPoolEntry<BookCandidate>): BookRecommendation {
  return buildRecommendation(entry, null);
}

export function currentBook(state: CuriosityState, date: string): BookRecommendation {
  if (state.book?.payload) return state.book.payload;
  return curatedBookFor(pickEntry<BookCandidate>(POOL_CATEGORY_BY_CARD.book, date, emptyState()));
}

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

type Chosen = { id: string; item: unknown; candidate?: ContentCandidate };

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
    offline?: boolean;
  } = {},
): Promise<RefreshSummary> {
  const now = options.now ?? new Date();
  const scope = options.scope ?? 'all';
  const trigger = options.trigger ?? 'cron';
  const fetchImpl = options.fetchImpl ?? fetch;
  const date = publicationDate(now);
  const store = getStateStore();
  const candidateStore = getCandidateStore();

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

  const [pools, reservoirCandidates] = await Promise.all([
    loadPools(),
    candidateStore.readAll(),
  ]);

  const result = await store.withLease(LEASE_MS, async (state: CuriosityState) => {
    const patch: Partial<CuriosityState> = {};
    const seenRecords: CuriosityState['seen'] = [];
    const publishedAt = now.toISOString();

    const republishingSameDay = state.daily?.date === date;
    const activeSeen = state.seen.filter((record) => !republishingSameDay || record.on !== date);
    const historyIndex: HistoryIndex = buildHistoryIndex(publicationRecords(activeSeen));

    /* ---- One Book, every three days ---------------------------------- */
    const wantBook = scope === 'book' || scope === 'all';
    const bookAlreadyToday = state.book?.date === date;
    const bookDue = wantBook && !bookAlreadyToday && isBookDue(now, state.book?.date, { force: options.force });
    if (wantBook && bookAlreadyToday) {
      book = { published: false, reason: 'already-published', contentId: state.book?.contentId, source: state.book?.payload.source, detail: `One Book is already published for ${date}.` };
    } else if (wantBook && !bookDue) {
      book = { published: false, reason: 'interval', contentId: state.book?.contentId, source: state.book?.payload.source, detail: `Next change ${addPublicationDays(state.book?.date ?? date, BOOK_INTERVAL_DAYS)} (every ${BOOK_INTERVAL_DAYS} days).` };
    } else if (wantBook) {
      const bookOutcome = selectCandidate(
        pools.book.map((entry) => candidateFromPool('book', entry)),
        { card: 'book', date, index: historyIndex, offset: CARD_OFFSETS.book },
      );
      const entry = bookOutcome.ok && bookOutcome.candidate
        ? (pools.book.find((candidateEntry) => candidateEntry.id === bookOutcome.candidate?.id) as CuriosityPoolEntry<BookCandidate> | undefined)
        : undefined;
      if (!entry) {
        book = { published: false, reason: 'failed', detail: `No unread book candidate for ${date}; the previous recommendation is kept.` };
      } else {
        const { id } = entry;
        const lookup = options.offline
          ? ({ status: 'unresolved' as const, note: 'Offline run: Open Library was not contacted.', book: curatedBookFor(entry) } as const)
          : await lookupBook(entry, { fetchImpl });
        if (lookup.status === 'failed') {
          book = { published: false, reason: 'kept-previous', contentId: state.book?.contentId, source: state.book?.payload.source, detail: `Open Library lookup failed (${lookup.error}); keeping the previous recommendation.` };
        } else {
          const recommendation: BookRecommendation = { ...lookup.book, id, fetchedAt: publishedAt };
          const bookProblems = invalidBookFields(recommendation);
          if (bookProblems.length) {
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
      if (!reusing && mythologyChoice.candidate && !options.offline) {
        const { character: enriched, note } = await resolveMythologyEntity(mythologyChoice.item as MythCharacter, { fetchImpl });
        if (note) discoveryNotes.push(`mythology: ${note}`);
        const enrichedCandidate = candidateFromMyth(enriched);
        mythologyChoice.item = enriched;
        mythologyChoice.candidate = enrichedCandidate;
      }

      /* ---- Science: authored + reservoir + live discovery -------- */
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

      const reservoirScience = (discipline: ScienceDiscipline): ContentCandidate<ScienceConcept>[] =>
        reservoirCandidates
          .filter((c) => c.category === discipline && c.eligible && c.validationStatus === 'valid')
          .map((c) => candidateToScienceConcept(c))
          .filter((c): c is ScienceConcept => c !== null)
          .map((concept) => candidateFromScience(discipline, concept));

      const mythQueue = options.offline
        ? { queue: [], note: 'offline run' }
        : await discoverMythologyQueue(date, mythCharacters, { fetchImpl });
      const authoringQueue = mythQueue.queue.length
        ? `Mythology authoring queue (${mythQueue.tradition ?? 'unavailable'}): ${mythQueue.queue.slice(0, 6).map((entry) => entry.title).join(', ')}${mythQueue.queue.length > 6 ? ` (+${mythQueue.queue.length - 6} more)` : ''}`
        : null;
      if (mythQueue.note && !mythQueue.queue.length) discoveryNotes.push(`mythology: ${mythQueue.note}`);

      const chemistryChoice = reusing
        ? reusePick(previousIds.chemistry, previousPayload?.chemistry)
        : choose('chemistry', [...curatedScience('chemistry'), ...reservoirScience('chemistry'), ...discovery.chemistry.candidates]);
      const physicsChoice = reusing
        ? reusePick(previousIds.physics, previousPayload?.physics)
        : choose('physics', [...curatedScience('physics'), ...reservoirScience('physics'), ...discovery.physics.candidates]);
      const biologyChoice = reusing
        ? reusePick(previousIds.biology, previousPayload?.biology)
        : choose('biology', [...curatedScience('biology'), ...reservoirScience('biology'), ...discovery.biology.candidates]);

      /* ---- Today in History (1. Sikh -> 2. Indian -> 3. World) --- */
      let historyEntries: HistoryEvent[];
      let historyChosenCandidates: ContentCandidate<HistoryEvent>[] = [];
      let historyCombinedId: string;

      if (reusing && previousPayload?.historyEntries?.length) {
        historyEntries = previousPayload.historyEntries;
        historyCombinedId = previousIds.history ?? historyEntries.map((h) => h.id ?? '').filter(Boolean).join('+');
      } else {
        const liveFailureCauses: string[] = [];
        const triad = await selectHistoryTriad({
          date,
          seen: activeSeen,
          reservoirCandidates,
          discoverForCategory: options.offline
            ? undefined
            : async (cat, month, day) => {
                const res = await discoverHistoryForDate(cat, month, day, { fetchImpl, fresh: true });
                if (res.note) liveFailureCauses.push(res.note);
                return res;
              },
        });
        historyEntries = triad.entries;
        historyChosenCandidates = triad.chosenCandidates;
        historyCombinedId = triad.combinedId;

        if (liveFailureCauses.length > 0 && historyEntries.every((e) => e.origin !== 'live')) {
          degraded.push(
            `history: no live anniversary response for ${date} (${liveFailureCauses[0]}); published curated historical entries with explicit date status`,
          );
        } else if (historyEntries.every((e) => e.forThisDate === false)) {
          degraded.push(
            `history: no unseen verified anniversary for ${date} (archive fallback); published curated historical milestones labelled as not belonging to this date`,
          );
        }
        if (triad.cooldownRelaxations > 0) {
          selectionNotes.push(`history: relaxed cooldown window for ${triad.cooldownRelaxations} category slot(s) on ${date}`);
        }
      }

      const primaryHistory =
        historyEntries.find((entry) => entry.forThisDate === true && entry.origin === 'curated')
        ?? historyEntries.find((entry) => entry.forThisDate === true)
        ?? historyEntries[0]
        ?? null;

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
        history: primaryHistory,
        historyEntries: [...historyEntries],
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
        history: historyCombinedId,
        'ai-world': aiWorldOrigin === 'cached' ? previousIds['ai-world'] ?? '' : idsFor(aiWorldChoices),
        'developer-radar': radarOrigin === 'cached' ? previousIds['developer-radar'] ?? '' : idsFor(radarChoices),
      };

      const invalid = invalidDailyFields(payload);
      if (invalid.length) {
        throw new RangeError(`refusing to publish ${date}: ${invalid.join('; ')}`);
      }

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
          biologyChoice,
          physicsChoice,
        ]) {
          if (choice.candidate) seenRecords.push(ledgerRecord(choice.candidate, date));
        }
        for (const histCandidate of historyChosenCandidates) {
          seenRecords.push(ledgerRecord(histCandidate, date));
        }
        if (aiWorldOrigin !== 'cached') for (const candidate of aiWorldChoices) seenRecords.push(ledgerRecord(candidate, date));
        if (radarOrigin !== 'cached') for (const candidate of radarChoices) seenRecords.push(ledgerRecord(candidate, date));
      }

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

  const detail = [daily.detail, book.detail].filter(Boolean).join(' ');
  const status: 'published' | 'already-published' = result.wrote && (daily.published || book.published) ? 'published' : 'already-published';
  await store
    .withLease(30_000, (state) => ({
      runs: [
        ...state.runs,
        { at: new Date().toISOString(), trigger, ok: true, detail: `${status}: ${detail || 'no changes'}`.slice(0, 300) },
      ],
    }))
    .catch(() => null);

  return { ...started, store: storeAtReportTime(), status, daily, book, detail: detail || 'Nothing due; the published day is unchanged.' };
}

/* ------------------------------------------------------------------ */
/* Catch-up and reporting                                              */
/* ------------------------------------------------------------------ */

export async function catchUpOnRender(date: string, fetchImpl?: typeof fetch): Promise<RefreshSummary | null> {
  if ((process.env.CURIOSITY_AUTO_PUBLISH ?? '').toLowerCase() === 'off') return null;
  const store = getStateStore();
  const state = await store.read();
  const now = new Date();
  const today = publicationDate(now);
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
    schedule: string;
    timezone: string;
    lastPublishAt: string | null;
    provenActive: boolean;
  };
  daily: {
    published: boolean;
    date?: string;
    publishedAt?: string;
    contentIds?: PublishedContentIds;
    degraded?: string[];
    sections?: SectionOrigins;
    complete: boolean;
  } | null;
  book: { published: boolean; date?: string; publishedAt?: string; contentId?: string; source?: BookRecommendation['source']; nextChangeAfter?: string } | null;
  pool: Record<CuriosityCategory, { eligible: number; total: number }>;
  reservoir: ReservoirStatusSummary;
  runs: Array<{ at: string; ok: boolean; detail: string; trigger?: RefreshTrigger }>;
};

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

  if (payload.historyEntries !== undefined) {
    check('historyEntries minimum three items', payload.historyEntries.length >= 3);
    HISTORY_CATEGORY_ORDER.forEach((expectedCategory, idx) => {
      const entry = payload.historyEntries?.[idx];
      check(`historyEntries[${idx}].category=${expectedCategory}`, entry?.category === expectedCategory);
      check(`historyEntries[${idx}].id`, !blank(entry?.id));
      check(`historyEntries[${idx}].categoryLabel`, !blank(entry?.categoryLabel));
      check(`historyEntries[${idx}].title`, !blank(entry?.title));
      check(`historyEntries[${idx}].explanation`, !blank(entry?.explanation));
      check(`historyEntries[${idx}].year`, !blank(String(entry?.year ?? '')));
      check(`historyEntries[${idx}].url`, !invalidUrl(entry?.url));
      check(`historyEntries[${idx}].attribution`, !blank(entry?.attribution ?? entry?.sourceName));
      check(
        `historyEntries[${idx}] labelled when not verified for date`,
        entry?.forThisDate === false ? entry.origin === 'curated' : true,
      );
    });
    const entryIds = payload.historyEntries.map((e) => e.id).filter(Boolean);
    check('historyEntries unique ids', new Set(entryIds).size === entryIds.length);
  }

  for (const key of ['sharpener', 'speakBetter', 'mythology', 'chemistry', 'physics', 'biology'] as const) {
    const card = payload[key] as { id?: string } | undefined;
    check(`${key}.id`, !blank(card?.id));
  }
  check('mythology.story', !blank(payload.mythology?.story));

  if (payload.quote) {
    check('quote.text', !blank(payload.quote.text));
    check('quote.author', !blank(payload.quote.author));
  }

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
  const [state, reservoir] = await Promise.all([
    store.read(),
    getReservoirStatus(),
  ]);
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
          complete:
            state.daily.degraded.length === 0 &&
            state.daily.payload.aiWorld.length > 0 &&
            state.daily.payload.developerRadar.length > 0 &&
            state.daily.payload.history !== null &&
            (state.daily.payload.historyEntries?.length ?? 3) >= 3,
        }
      : null,
    book: state.book ? { published: true, date: state.book.date, publishedAt: state.book.publishedAt, contentId: state.book.contentId, source: state.book.payload.source, nextChangeAfter: addPublicationDays(state.book.date, BOOK_INTERVAL_DAYS) } : null,
    pool,
    reservoir,
    runs,
  };
}
