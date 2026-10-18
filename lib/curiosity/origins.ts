import type { CuriosityNewsItem, CuriositySectionOrigin, DeveloperDiscovery, HistoryEvent } from './types';
import type { PublishedDaily } from './state';

/**
 * Where the content a card is showing came from.
 *
 * Derived from the items themselves rather than stored next to them: the publisher, the
 * reader and the admin panel all ask the same question, and a label kept in one place
 * cannot disagree with the record it describes. The three live cards are the only ones
 * that need it — the pool cards are always curated by definition, and the book keeps its
 * own publication day on the snapshot.
 */
export type SectionOrigins = {
  aiWorld: CuriositySectionOrigin;
  developerRadar: CuriositySectionOrigin;
  history: CuriositySectionOrigin;
};

/** Reader-facing wording for each origin, shared by the page and the admin panel. */
export const ORIGIN_WORDS: Record<CuriositySectionOrigin, string> = {
  new: 'published today',
  cached: 'kept from the last run that answered',
  curated: 'curated in this repository',
  unavailable: 'nothing to show',
};

function originOf<T>(items: readonly T[], isCurated: (item: T) => boolean): CuriositySectionOrigin {
  if (items.length === 0) return 'unavailable';
  return items.every(isCurated) ? 'curated' : 'new';
}

// Each predicate answers "did this item come from inside the repository?", which is
// what decides whether a card is `curated` or `new`.
const isBackgroundReading = (item: CuriosityNewsItem) => item.origin === 'background';
const isShelfPick = (item: DeveloperDiscovery) => item.origin === 'curated';
const isVerifiedForDate = (event: HistoryEvent) => event.forThisDate !== false;

/**
 * Origins for the day being rendered. `daily` is the snapshot for that day, or `null`
 * when nothing was published for it and the built-in rotation is on screen.
 *
 * `date` is the Asia/Kolkata day the reader asked for, which is what decides whether
 * anything counts as new: content published *for this day* is today's, and a snapshot
 * carrying an older day key is cached whatever the items inside it claim — comparing
 * item timestamps against an ISO instant would get that wrong, because a publish at
 * midnight IST is six and a half hours earlier in UTC.
 */
export function sectionOrigins(daily: PublishedDaily | null, date: string): SectionOrigins {
  if (!daily) {
    return { aiWorld: 'curated', developerRadar: 'curated', history: 'curated' };
  }
  const { aiWorld, developerRadar, history } = daily.payload;
  const fresh = daily.date === date;
  const label = (origin: CuriositySectionOrigin): CuriositySectionOrigin =>
    origin === 'new' && !fresh ? 'cached' : origin;
  return {
    aiWorld: label(originOf(aiWorld, isBackgroundReading)),
    developerRadar: label(originOf(developerRadar, isShelfPick)),
    history: label(history && isVerifiedForDate(history) ? (history.origin === 'live' ? 'new' : 'curated') : 'curated'),
  };
}
