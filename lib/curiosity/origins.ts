import type {
  CuriositySectionOrigin,
  CuriositySectionOrigins,
  DeveloperDiscovery,
  HistoryEvent,
} from './types';
import type { DailyPayload, PublishedDaily } from './state';

/** Kept as an alias so every existing caller and import keeps compiling. */
export type SectionOrigins = CuriositySectionOrigins;

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

const isShelfPick = (item: DeveloperDiscovery) => item.origin === 'curated';
const isVerifiedLive = (event: HistoryEvent) => event.forThisDate !== false && event.origin === 'live';

/**
 * How the history card's entries were obtained.
 *
 * Exported because the publisher records this at publish time and the render path
 * derives it for snapshots published before the recording existed. One function, so
 * the two cannot disagree.
 */
export function historyOriginFor(entries: readonly HistoryEvent[]): CuriositySectionOrigin {
  if (entries.length === 0) return 'unavailable';
  return entries.some(isVerifiedLive) ? 'new' : 'curated';
}

/**
 * Best-effort origins read from a payload's items.
 *
 * This is the *fallback*: it is what older snapshots get, and it cannot tell a
 * carried-over live story from a freshly fetched one, because both carry
 * `origin: 'live'`. New snapshots record the answer in `payload.sectionOrigins`
 * instead, which is why that value wins when it is present.
 */
export function deriveSectionOrigins(payload: DailyPayload): SectionOrigins {
  const entries = payload.historyEntries && payload.historyEntries.length > 0
    ? payload.historyEntries
    : (payload.history ? [payload.history] : []);
  /*
    AI World has exactly three honest states: live (`new`), kept from an earlier day
    (`cached`), or nothing (`unavailable`). `curated` is deliberately unreachable: the
    explainer shelf is no longer a source, so an item marked `background` in an older
    snapshot is filtered out before this runs and the section reads as empty.
  */
  const newsItems = payload.aiWorld.filter((item) => item.origin !== 'background');
  return {
    aiWorld: newsItems.length === 0 ? 'unavailable' : 'new',
    developerRadar: originOf(payload.developerRadar, isShelfPick),
    history: historyOriginFor(entries),
  };
}

/**
 * The per-card origin shown to the reader.
 *
 * Precedence matters and is the point of this module:
 *
 *  1. the origin **recorded by the publisher** (`payload.sectionOrigins`), because only
 *     the publish path knows whether an AI story was fetched today or kept from the
 *     last run that answered;
 *  2. otherwise the origin derived from the items, which is all an older snapshot
 *     supports;
 *  3. and in both cases `new` becomes `cached` once the reader is looking at a day
 *     other than the one it was published for — today's news is not today's news
 *     tomorrow, whatever it was labelled when it was written.
 */
export function sectionOrigins(daily: PublishedDaily | null, date: string): SectionOrigins {
  if (!daily) {
    // A day that was never published has no AI news: saying "curated" here would
    // describe a shelf this card no longer reads.
    return { aiWorld: 'unavailable', developerRadar: 'curated', history: 'curated' };
  }
  const derived = deriveSectionOrigins(daily.payload);
  const recorded = daily.payload.sectionOrigins;
  const bases: SectionOrigins = recorded
    ? {
        aiWorld: recorded.aiWorld ?? derived.aiWorld,
        developerRadar: recorded.developerRadar ?? derived.developerRadar,
        history: recorded.history ?? derived.history,
      }
    : derived;

  const fresh = daily.date === date;
  const label = (origin: CuriositySectionOrigin): CuriositySectionOrigin =>
    origin === 'new' && !fresh ? 'cached' : origin;

  return {
    aiWorld: label(bases.aiWorld),
    developerRadar: label(bases.developerRadar),
    history: label(bases.history),
  };
}
