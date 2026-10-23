import type { CuriosityNewsItem, CuriositySectionOrigin, DeveloperDiscovery, HistoryEvent } from './types';
import type { PublishedDaily } from './state';

export type SectionOrigins = {
  aiWorld: CuriositySectionOrigin;
  developerRadar: CuriositySectionOrigin;
  history: CuriositySectionOrigin;
};

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

const isBackgroundReading = (item: CuriosityNewsItem) => item.origin === 'background';
const isShelfPick = (item: DeveloperDiscovery) => item.origin === 'curated';
const isVerifiedLive = (event: HistoryEvent) => event.forThisDate !== false && event.origin === 'live';

export function sectionOrigins(daily: PublishedDaily | null, date: string): SectionOrigins {
  if (!daily) {
    return { aiWorld: 'curated', developerRadar: 'curated', history: 'curated' };
  }
  const { aiWorld, developerRadar, history, historyEntries } = daily.payload;
  const fresh = daily.date === date;
  const label = (origin: CuriositySectionOrigin): CuriositySectionOrigin =>
    origin === 'new' && !fresh ? 'cached' : origin;

  const entries = historyEntries && historyEntries.length > 0
    ? historyEntries
    : (history ? [history] : []);
  const historyOrigin: CuriositySectionOrigin = entries.length === 0
    ? 'unavailable'
    : (entries.some(isVerifiedLive) ? 'new' : 'curated');

  return {
    aiWorld: label(originOf(aiWorld, isBackgroundReading)),
    developerRadar: label(originOf(developerRadar, isShelfPick)),
    history: label(historyOrigin),
  };
}
