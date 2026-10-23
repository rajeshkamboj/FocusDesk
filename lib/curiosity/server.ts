import { sectionOrigins } from './origins';
import { curatedHistoryArchive, dailyEditorial } from './content';
import { catchUpOnRender, currentBook } from './job';
import { addPublicationDays, publicationDate } from './schedule';
import { BOOK_INTERVAL_DAYS } from './schedule';
import { getStateStore, type CuriosityState, type PublishedDaily } from './state';
import { getDailyQuote } from '../quotes';
import type { CuriosityBriefing, CuriosityDurability } from './types';

/**
 * The read path for Curiosity.
 *
 * One rule decides everything here: **a render reads, it does not produce.**
 * The briefing shown to a reader is either the snapshot the scheduler published
 * for that Asia/Kolkata day, or — when no snapshot exists yet — the deterministic
 * pool fallback for that day. Both are computed the same way for the same date,
 * so a page load never depends on which of the two it got, and opening the app
 * cannot cost an external API call.
 *
 * ### Why there is no `unstable_cache` any more
 *
 * The previous version wrapped `buildBriefing` in `unstable_cache` with
 * `revalidate: 3600`, which is what made "daily" mean "hourly": the first
 * request of the day did the work, a request after the cache expired could show
 * a different book, and every shape change needed a version bump in the cache key
 * or readers saw a stale briefing for an hour. The published snapshot replaces
 * that whole mechanism — the cache is now the store, its key is the date, and its
 * invalidation is the scheduler. The only in-process cache left is a
 * few-seconds memo so a page that mounts twice in one paint does not read the
 * store twice.
 *
 * ### Fallback and failure
 *
 * `store.read()` never throws, so an unreachable database or a corrupt state file
 * yields "nothing published" and the pool fallback renders. A failed refresh
 * leaves the previous snapshot in place, which the reader keeps seeing: content
 * degrades to *older*, never to *nothing*.
 */

const stateMemo = new Map<string, { at: number; state: CuriosityState }>();
const STATE_MEMO_MS = 5_000;

/** The store read, memoised per process for a few seconds. */
async function readState(): Promise<CuriosityState> {
  const key = getStateStore().location;
  const cached = stateMemo.get(key);
  if (cached && Date.now() - cached.at < STATE_MEMO_MS) return cached.state;
  const state = await getStateStore().read();
  stateMemo.set(key, { at: Date.now(), state });
  return state;
}

function publicationFrom(
  daily: PublishedDaily | null,
  store: 'file' | 'supabase',
  date: string,
  state: CuriosityState,
  durability: CuriosityDurability = 'unproven',
  /** Why there is nothing to show, in the publisher's own words. See `buildBriefing`. */
  reason?: string | null,
): CuriosityBriefing['publication'] {
  const bookDay = state.book?.date;
  return {
    date,
    publishedAt: daily?.publishedAt ?? new Date(`${date}T00:00:00+05:30`).toISOString(),
    origin: daily ? 'published' : 'fallback',
    store,
    contentIds: daily?.contentIds ?? {},
    degraded: daily?.degraded ?? [
      'No published snapshot for this day; showing the built-in rotation.',
      ...(reason ? [reason] : []),
    ],
    // The book keeps its own clock: the card says when it will next turn over,
    // which is three publication days after the one it was published on.
    bookPublishedOn: bookDay,
    bookNextChangeOn: bookDay ? addPublicationDays(bookDay, BOOK_INTERVAL_DAYS) : undefined,
    durability,
    sectionOrigins: sectionOrigins(daily, date),
  };
}

export async function buildBriefing(date: string): Promise<CuriosityBriefing> {
  const store = getStateStore();
  const state = await readState();
  const book = currentBook(state, date);

  if (state.daily && state.daily.date === date) {
    const daily = state.daily;
    return {
      date,
      book,
      ...daily.payload,
      publication: publicationFrom(daily, store.kind, date, state, store.durability),
    };
  }

  // Nothing published for the day the reader is on. If that day is *today* and a
  // scheduler has not had the chance yet (a fresh deploy, a laptop with no cron),
  // publish it now, once: the store claim means the second concurrent request of
  // that moment finds the snapshot instead of starting a second run.
  let reason: string | null = null;
  const isToday = date === publicationDate(new Date());
  if (isToday) {
    const summary = await catchUpOnRender(date).catch(() => null);
    if (summary && summary.status !== 'published') {
      reason = `publish attempt for ${date} finished as ${summary.status}: ${summary.detail}`;
    } else if (!summary) {
      // Today, no snapshot, and no attempt — the only way that happens is the opt-out.
      reason = 'no publish was attempted: CURIOSITY_AUTO_PUBLISH=off leaves the schedule as the only writer.';
    }
    if (summary && summary.status === 'published') {
      const refreshed = await store.read();
      if (refreshed.daily?.date === date) {
        return {
          date,
          book: currentBook(refreshed, date),
          ...refreshed.daily.payload,
          publication: publicationFrom(refreshed.daily, store.kind, date, refreshed, store.durability),
        };
      }
    }
  }

  // Say why the live cards are empty, instead of letting the card guess. "The
  // source could not be reached" is the wrong explanation for a day that was never
  // published at all — which is the normal state of a fresh install whose scheduler
  // is not configured yet, and an operator should not have to read the source to
  // work that out. The notes ride on `degraded`: the header shows the count, the
  // status endpoint and the Settings panel show the text.
  if (reason === null) {
    reason = isToday
      ? 'a publish was attempted for today and did not complete; its summary names the failing source (npx tsx scripts/curiosity-refresh.ts).'
      : `nothing has been published for ${date}, and a render never fetches sources — the scheduler fills these sections.`;
  }

  const fallback = dailyEditorial(date);
  return {
    date,
    book,
    // The live cards take today's slice of the curated shelves rather than being empty.
    // Empty is honest only if the reader is told nothing else is available — and they are
    // told, by the label on the card — but a card that can be filled with something true
    // and clearly marked as background is worth more than a card that can only be marked
    // as missing. No date is printed on these, because none of them is news.
    aiWorld: fallback.aiWorld,
    developerRadar: fallback.developerRadar,
    // The quote is included in a published snapshot (so the publisher can enforce a
    // cooldown on it); the built-in fallback still derives it from the date, which is
    // the pre-existing deterministic behaviour and never empty.
    quote: getDailyQuote(date),
    oneThing: fallback.oneThing,
    learning: fallback.learning,
    literature: fallback.literature,
    history: fallback.history ?? curatedHistoryArchive(date),
    sharpener: fallback.sharpener,
    speakBetter: fallback.speakBetter,
    mythology: fallback.mythology,
    chemistry: fallback.chemistry,
    physics: fallback.physics,
    biology: fallback.biology,
    publication: publicationFrom(null, store.kind, date, state, store.durability, reason),
  };
}

/**
 * @param date the Asia/Kolkata day to render. `getDailyBriefing` never
 *   re-derives "today" from the server clock beyond the catch-up check, so a
 *   dated request (a stale tab rolling over at midnight, the `/api/curiosity`
 *   route) resolves against the snapshot for exactly that day.
 */
export function getDailyBriefing(date: string): Promise<CuriosityBriefing> {
  return buildBriefing(date);
}

/** Today's briefing, keyed to the publication zone rather than to UTC. */
export function getTodaysBriefing(now: Date = new Date()): Promise<CuriosityBriefing> {
  return buildBriefing(publicationDate(now));
}

/**
 * Force the store to be re-read after an administrative refresh; without this a
 * refresh inside the 5-second memo window would still render the previous state.
 */
export function clearBriefingMemo(): void {
  stateMemo.clear();
}
