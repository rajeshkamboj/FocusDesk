import type { CuriosityNewsItem, DeveloperDiscovery, HistoryEvent } from './types';

/**
 * Live sources. Everything here is optional by design: a failed source returns
 * `[]` or `null`, never throws, and the caller records the section as *degraded*
 * so the card can say so instead of showing yesterday’s headline as today’s.
 *
 * These run from the scheduler (`job.ts`), not from a render. That is the whole
 * difference between this file and the version that used to sit in `server.ts`:
 * the page reads a published snapshot, so opening Curiosity a hundred times costs
 * nobody a hundred feed fetches.
 */

export const SOURCE_TIMEOUT_MS = 6_000;
export const MAX_AI_WORLD_ARTICLES = 10;
/**
 * How far back a feed item may be and still be presented as news.
 *
 * Generous on purpose: these publishers are slower than a newswire, and a tight window
 * turns a quiet week into an empty card. It exists at all because a feed that stopped
 * being maintained would otherwise keep serving three-year-old posts under a heading
 * that says "recent". Anything outside the window is dropped and reported as *stale*,
 * which is a different sentence from *unreachable* in the log.
 */
export const NEWS_RECENCY_DAYS = 45;

const NEWS_FEEDS = [
  ['OpenAI', 'https://openai.com/news/rss.xml'],
  ['Anthropic', 'https://www.anthropic.com/news/rss.xml'],
  ['Google DeepMind', 'https://deepmind.google/blog/rss.xml'],
  ['Hugging Face', 'https://huggingface.co/blog/feed.xml'],
  ['Microsoft AI', 'https://blogs.microsoft.com/ai/feed/'],
  ['Meta AI', 'https://ai.meta.com/blog/rss/'],
] as const;

/**
 * First-party publisher feeds only.
 *
 * A briefing that links out should link to the organisation that made the
 * announcement, not to an aggregator that repeated it. These six are the
 * publishers whose own newsrooms cover the field the card is about.
 */
export const AI_WORLD_FEEDS: readonly (readonly [string, string])[] = NEWS_FEEDS;

/**
 * Feed text to card text.
 *
 * Order matters: CDATA markers first, then tags, then entities, then tags again —
 * because a feed that escaped its markup arrives as `&lt;p&gt;`, and decoding it
 * *after* stripping would leave the tags behind, while stripping it after decoding
 * removes what the escape produced. Entities are decoded last among the replacements
 * (`&amp;` after everything else) so `&amp;lt;` becomes the literal text `&lt;` rather
 * than an angle bracket.
 */
function text(value: string) {
  const stripped = value.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]*>/g, ' ');
  const decoded = stripped
    .replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, '&');
  return decoded.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function tag(item: string, name: string) {
  const match = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? text(match[1]) : '';
}

/** The one query the radar is built from: TypeScript developer tooling, newest activity first. */
const RADAR_QUERY = 'topic:developer-tools language:TypeScript';
const RADAR_SEARCH_URL = `https://api.github.com/search/repositories?q=${encodeURIComponent(RADAR_QUERY)}&sort=updated&order=desc&per_page=8`;

/** Wikipedia's selected anniversaries for the IST day being published. */
export function historyApiUrl(date: string): string {
  const [, month, day] = date.split('-');
  return `https://en.wikipedia.org/api/rest_v1/feed/onthisday/selected/${Number(month)}/${Number(day)}`;
}

/**
 * Keep the newest stories that the selected first-party AI publishers provide.
 *
 * These sources publish less often than a general newswire, so a rolling time
 * window can turn a useful briefing into an empty card. Source feeds already
 * establish authority; ordering all valid stories by their published date gives
 * readers the latest developments without hiding an important update from last
 * week.
 */
export function selectAiWorldArticles(items: CuriosityNewsItem[], now = Date.now()): CuriosityNewsItem[] {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      // Last gate before the item becomes a link in someone's browser: the card
      // renders `href={item.url}`, so only an absolute http(s) URL may pass. The
      // feed parser checks this too — a published snapshot is read back from the
      // store without re-running that parser, so the check has to live here as well.
      if (!isHttpUrl(item.url)) return false;
      const published = Date.parse(item.publishedAt);
      if (!Number.isFinite(published) || published > now) return false;
      // Outside the recency window: a real article, and not news.
      if (now - published > NEWS_RECENCY_DAYS * 86_400_000) return false;
      const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, MAX_AI_WORLD_ARTICLES);
}

/**
 * Why a live section ended up empty, phrased by the code that knows. A card has to
 * stay quiet either way, but the *record* should distinguish "the feeds could not be
 * reached from this server" from "the feeds answered and had nothing recent" — the
 * first is a deployment problem, the second is a Tuesday. The publisher copies the
 * text into the snapshot's `degraded` list, where the status endpoint and Settings
 * show it.
 */
export type SourceNote = { text?: string };

export async function fetchNews(fetchImpl: typeof fetch = fetch, note?: SourceNote): Promise<CuriosityNewsItem[]> {
  let reached = 0;
  let stale = 0;
  const reasons: string[] = [];
  const remember = (reason: string) => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };
  try {
    const batches = await Promise.all(NEWS_FEEDS.map(async ([source, url]) => {
      try {
        // Redirects are followed by `fetch` itself; the pair is asked for the feed URL
        // the publisher advertises, and whatever answers is judged on its content type.
        const response = await fetchImpl(url, {
          headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
          signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
          redirect: 'follow',
        });
        if (!response.ok) {
          remember(`${source} answered ${response.status}`);
          return [];
        }
        const type = response.headers.get('content-type') ?? '';
        if (type && !/xml|rss|atom/i.test(type)) {
          // An HTML page here means the feed moved or the URL was a web page all along.
          // Parsing it as XML would either fail quietly or invent a headline.
          remember(`${source} answered with ${type.split(';')[0]}, not a feed`);
          return [];
        }
        reached += 1;
        const xml = await response.text();
        // A single publisher can account for all ten newest stories, so retain
        // enough entries from each authoritative feed before the global limit.
        return [...xml.matchAll(/<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/gi)].slice(0, MAX_AI_WORLD_ARTICLES).map((match): CuriosityNewsItem | null => {
          const item = match[0];
          const link = tag(item, 'link') || (item.match(/<link[^>]*href=["']([^"']+)/i)?.[1] ?? '');
          const title = tag(item, 'title');
          // RSS says `pubDate`, Atom says `published`, or `updated` when that is all
          // the feed offers. An entry with none of the three cannot be placed inside the
          // recency window at all, so it is skipped here rather than printed undated:
          // the card never shows a date it does not have, and never shows "news" whose
          // age nobody knows.
          const publishedAt = tag(item, 'pubDate') || tag(item, 'published') || tag(item, 'updated');
          const summary = tag(item, 'description') || tag(item, 'summary') || tag(item, 'content');
          if (!title || !isHttpUrl(link)) return null;
          if (!publishedAt) {
            stale += 1;
            return null;
          }
          return { title, source, publishedAt, summary: summary.slice(0, 280), url: link, origin: 'live' as const };
        }).filter((item): item is CuriosityNewsItem => Boolean(item));
      } catch (error) {
        // A timeout, a refused connection and a DNS failure all arrive here. They are
        // not the same as an empty feed, and one dead publisher must not end the loop:
        // every feed is fetched independently and its failure is only recorded.
        remember(`${source} could not be reached (${error instanceof Error ? error.message.replace(/^AbortSignal timed out\.$/, 'timed out') : String(error)})`);
        return [];
      }
    }));
    const items = selectAiWorldArticles(batches.flat());
    if (!items.length && note) {
      const why = reasons.length ? ` (${reasons.slice(0, 3).join('; ')}${reasons.length > 3 ? `; +${reasons.length - 3} more` : ''})` : '';
      note.text =
        reached === 0
          ? `none of the ${NEWS_FEEDS.length} feeds could be reached from this server${why}`
          : stale
            ? `the ${reached} feed(s) that answered had no item published within ${NEWS_RECENCY_DAYS} days${why}`
            : `the ${reached} feed(s) that answered had nothing new to show${why}`;
    }
    return items;
  } catch (error) {
    if (note) note.text = `the feeds could not be read (${error instanceof Error ? error.message : String(error)})`;
    return [];
  }
}

export async function fetchDeveloperRadar(fetchImpl: typeof fetch = fetch, note?: SourceNote): Promise<DeveloperDiscovery[]> {
  try {
    const response = await fetchImpl(RADAR_SEARCH_URL, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'FocusDesk/0.1 (developer radar)' },
      signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
    });
    if (!response.ok) {
      // The anonymous search API allows ten requests a minute; a `403` from it means the
      // limit, not a permission problem with this repository, and a `429` says the same
      // with a `Retry-After`. Both are named here because "GitHub returned 403" reads
      // like a credential problem an operator would go and chase.
      const limited = response.status === 403 || response.status === 429;
      const retryAfter = limited ? response.headers.get('retry-after') : null;
      if (note) {
        note.text = limited
          ? `api.github.com rate limited the anonymous search request (HTTP ${response.status}${retryAfter ? `, retry after ${retryAfter}s` : ''}; ${RADAR_QUERY})`
          : `api.github.com returned ${response.status}`;
      }
      return [];
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      if (note) note.text = 'api.github.com answered with a body that was not JSON';
      return [];
    }
    const items = Array.isArray((data as { items?: unknown })?.items) ? (data as { items: Array<Record<string, unknown>> }).items : [];
    const seen = new Set<string>();
    const picked: DeveloperDiscovery[] = [];
    for (const row of items) {
      const name = typeof row.full_name === 'string' ? row.full_name : typeof row.name === 'string' ? row.name : '';
      const url = typeof row.html_url === 'string' ? row.html_url : '';
      const description = typeof row.description === 'string' ? row.description.trim() : '';
      // A repository without a name, a link, or a description is not a recommendation —
      // and the card is not allowed to fill that gap with an invention.
      if (!name || !isHttpUrl(url) || !description || seen.has(url)) continue;
      seen.add(url);
      const pushedAt = typeof row.pushed_at === 'string' && Number.isFinite(Date.parse(row.pushed_at)) ? new Date(row.pushed_at).toISOString() : '';
      picked.push({
        name,
        description: description.slice(0, 280),
        why: pushedAt
          ? `Last pushed ${pushedAt.slice(0, 10)}; worth evaluating where its topic overlaps the work.`
          : 'Open-source project matched by the daily search; read the repository before depending on it.',
        pricing: 'Open source; confirm the repository license and any hosted-service terms.',
        url,
        origin: 'live' as const,
      });
      if (picked.length === 3) break;
    }
    if (!picked.length && note) note.text = `GitHub answered but listed no repository matching ${RADAR_QUERY} with a name, description and link`;
    return picked;
  } catch (error) {
    // No token is required for this path to be *useful* when it fails: the curated shelf
    // in `content/radar-fallback.ts` is what the card shows, so a missing
    // GITHUB_TOKEN is never a reason for an empty box.
    if (note) note.text = `api.github.com could not be reached (${error instanceof Error ? error.message : String(error)})`;
    return [];
  }
}

/**
 * Wikipedia's selected anniversaries for a date, as *several* candidates.
 *
 * The publisher needs alternatives, not one event: if the first anniversary was
 * already shown in a previous year, the card must move to the next one rather
 * than repeat it. `fetchHistory` below keeps the old single-result contract for
 * callers that only need today's headline.
 */
export async function fetchHistoryCandidates(
  date: string,
  fetchImpl: typeof fetch = fetch,
  note?: SourceNote,
  limit = 5,
): Promise<HistoryEvent[]> {
  const [, month, day] = date.split('-');
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (!Number.isInteger(monthNumber) || !Number.isInteger(dayNumber) || monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) {
    if (note) note.text = `${date} is not a date the anniversaries API can be asked about`;
    return [];
  }
  try {
    // Wikipedia's selected anniversaries are editorially curated, not random events.
    // The endpoint is keyed by month/day in UTC, which is close enough to the IST day to
    // be worth asking; the card is only ever shown under the date this run published for.
    const response = await fetchImpl(historyApiUrl(date), {
      headers: { accept: 'application/json', 'user-agent': 'FocusDesk/0.1 (daily history reader)' },
      signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
    });
    if (!response.ok) {
      if (note) note.text = `en.wikipedia.org returned ${response.status} for the ${monthNumber}/${dayNumber} anniversaries`;
      return [];
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (note) note.text = 'en.wikipedia.org answered with a body that was not JSON';
      return [];
    }
    const selected = (payload as { selected?: unknown })?.selected;
    if (!Array.isArray(selected)) {
      if (note) note.text = 'en.wikipedia.org replied without a `selected` list';
      return [];
    }
    const yearFloor = -3000;
    const yearCeiling = Number(date.slice(0, 4));
    const events = (selected as Array<Record<string, unknown>>).flatMap((event) => {
      const year = Number(event.year);
      const text = typeof event.text === 'string' ? event.text.trim() : '';
      const pages = Array.isArray(event.pages) ? (event.pages as Array<Record<string, unknown>>) : [];
      const page = pages.find((candidate) => {
        const desktop = (candidate.content_urls as { desktop?: unknown } | undefined)?.desktop as { page?: unknown } | undefined;
        return typeof desktop?.page === 'string' && isHttpUrl(desktop.page);
      });
      const title = typeof page?.title === 'string' ? page.title : '';
      // An event is publishable only with a sane year, real text, and a link a reader can
      // open. Anything else is dropped rather than rendered with a hole in it.
      if (!page || !title || !text || !Number.isInteger(year) || year < yearFloor || year > yearCeiling) return [];
      const url = ((page.content_urls as { desktop?: { page?: string } }).desktop?.page as string);
      const extract = typeof page.extract === 'string' ? page.extract.trim() : '';
      return [{ year, text, title, url, extract }];
    });
    // Stable ordering makes the daily item independent of response ordering.
    events.sort((a, b) => a.year - b.year || a.text.localeCompare(b.text));
    if (!events.length) {
      if (note) note.text = `Wikipedia listed no usable selected anniversary for ${monthNumber}/${dayNumber}`;
      return [];
    }
    const dateLabel = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
    return events.slice(0, Math.max(1, limit)).map((event) => ({
      date: dateLabel,
      year: event.year,
      title: event.title.replaceAll('_', ' '),
      explanation: event.text,
      significance: event.extract
        ? event.extract.length > 380
          ? `${event.extract.slice(0, 377).replace(/\s+\S*$/, '')}…`
          : event.extract
        : 'Featured in Wikipedia’s curated selection of significant anniversaries for this date.',
      url: event.url,
      attribution: 'Wikipedia · Selected anniversaries',
      // Verified against the briefing's own month and day, which is what lets the card
      // be headed "Today in History" without qualification.
      forThisDate: true,
      origin: 'live',
    }));
  } catch (error) {
    if (note) note.text = `en.wikipedia.org could not be reached (${error instanceof Error ? error.message : String(error)})`;
    return [];
  }
}

/** The first usable anniversary for a date, or `null`. */
export async function fetchHistory(date: string, fetchImpl: typeof fetch = fetch, note?: SourceNote): Promise<HistoryEvent | null> {
  const events = await fetchHistoryCandidates(date, fetchImpl, note, 1);
  return events[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Operator probe: is this source reachable from where the app runs?   */
/* ------------------------------------------------------------------ */

/** Same budget as a real fetch, so a slow source that costs a publish also shows as slow here. */
export const PROBE_TIMEOUT_MS = SOURCE_TIMEOUT_MS;

export type SourceProbe = {
  name: string;
  url: string;
  ok: boolean;
  status: number | null;
  ms: number;
  /** What was wrong, when something was: an HTTP status, a content type, a network error. */
  note: string;
};

/**
 * Ask every source a publish depends to answer, once, and report what came back.
 *
 * This is an *operator* tool, reached from the admin panel, never from a render: the
 * page must not cost a fetch, and a reader's browser cannot tell you whether the
 * deployment's server can reach `api.github.com`. It asks for the smallest thing that
 * proves the endpoint works — a feed document, one page of results — so it does not
 * become a way to hammer a rate-limited API.
 */
export async function probeSources(fetchImpl: typeof fetch = fetch, date?: string): Promise<SourceProbe[]> {
  const probe = async (name: string, url: string, expect: RegExp): Promise<SourceProbe> => {
    const started = Date.now();
    try {
      const response = await fetchImpl(url, {
        headers: { accept: '*/*', 'user-agent': 'FocusDesk/0.1 (source check)' },
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        redirect: 'follow',
        cache: 'no-store',
      });
      const type = (response.headers.get('content-type') ?? '').split(';')[0].trim();
      if (!response.ok) {
        return { name, url, ok: false, status: response.status, ms: Date.now() - started, note: `HTTP ${response.status}` };
      }
      if (type && !expect.test(type)) {
        return { name, url, ok: false, status: response.status, ms: Date.now() - started, note: `answered ${type}, not a document this app can read` };
      }
      return { name, url, ok: true, status: response.status, ms: Date.now() - started, note: 'answered' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        name,
        url,
        ok: false,
        status: null,
        ms: Date.now() - started,
        note: /abort/i.test(message) ? `no answer within ${Math.round(PROBE_TIMEOUT_MS / 1000)}s` : message,
      };
    }
  };

  return Promise.all([
    ...NEWS_FEEDS.map(([source, url]) => probe(source, url, /xml|rss|atom/i)),
    probe('GitHub repository search', RADAR_SEARCH_URL, /json/i),
    probe('Wikipedia selected anniversaries', historyApiUrl(date ?? '2026-01-01'), /json/i),
    probe(
      'Open Library search',
      'https://openlibrary.org/search.json?q=design+of+everyday+things&fields=key,title,author_name,cover_i,first_publish_year&limit=1',
      /json/i,
    ),
  ]);
}
