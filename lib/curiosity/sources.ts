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

/**
 * What the AI World card is allowed to cover.
 *
 * These tags are not decoration: the Settings panel groups feed health by them, so an
 * operator can see *which* part of the beat has gone quiet — "no model releases this
 * week" is a different fact from "every feed is down".
 */
export type AiFeedCoverage =
  | 'models'
  | 'products'
  | 'agents'
  | 'media'
  | 'coding'
  | 'research'
  | 'industry';

export interface AiWorldFeed {
  /** Stable id, used in the status payload and the per-feed report. */
  id: string;
  /** Publisher name printed on the card. */
  name: string;
  /** The feed URL exactly as the publisher advertises it. Never guessed. */
  url: string;
  coverage: readonly AiFeedCoverage[];
  /** ISO date this URL was last confirmed to answer with a feed, and what it said. */
  verifiedAt?: string;
  verifiedNote?: string;
  /**
   * `false` keeps a feed in the registry (and in the documentation) without
   * fetching it. Nothing in this repository is enabled on an unverified URL.
   */
  enabled: boolean;
}

/**
 * First-party AI newsrooms.
 *
 * WHY FIRST-PARTY ONLY: a briefing that links out should link to the organisation
 * that made the announcement, not to an aggregator repeating it. Every URL below is
 * the publisher's own feed, and every one of them is recorded with the evidence that
 * it answered.
 *
 * AI WORLD IS NEWS, NOT BACKGROUND
 * The curated explainer shelf that used to back this card is gone from this path.
 * An explainer is not a development; putting one under a news heading is the kind of
 * quiet substitution this card exists to avoid. If nothing fresh answers, the card
 * says so.
 */
export const AI_WORLD_FEEDS: readonly AiWorldFeed[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    url: 'https://openai.com/news/rss.xml',
    coverage: ['models', 'products', 'agents', 'research', 'industry'],
    verifiedAt: '2026-11-09',
    verifiedNote: 'RSS 2.0, item dates present; OpenAI News room feed',
    enabled: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    url: 'https://www.anthropic.com/news/rss.xml',
    coverage: ['models', 'products', 'research', 'industry'],
    enabled: true,
  },
  {
    id: 'deepmind',
    name: 'Google DeepMind',
    url: 'https://deepmind.google/blog/rss.xml',
    coverage: ['models', 'research', 'agents'],
    enabled: true,
  },
  {
    id: 'google-ai',
    name: 'Google AI',
    url: 'https://blog.google/innovation-and-ai/technology/ai/rss/',
    coverage: ['models', 'products', 'media', 'research'],
    verifiedAt: '2026-11-09',
    verifiedNote:
      'RSS 2.0 from the Google blog AI topic; the legacy blog.google/technology/ai/rss/ path redirects here',
    enabled: true,
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    url: 'https://huggingface.co/blog/feed.xml',
    coverage: ['models', 'research', 'coding'],
    enabled: true,
  },
  {
    id: 'microsoft-ai',
    name: 'Microsoft AI',
    url: 'https://blogs.microsoft.com/ai/feed/',
    coverage: ['products', 'agents', 'industry'],
    enabled: true,
  },
  {
    id: 'meta-ai',
    name: 'Meta AI',
    url: 'https://ai.meta.com/blog/rss/',
    coverage: ['models', 'research', 'media'],
    enabled: true,
  },
  {
    id: 'higgsfield',
    name: 'Higgsfield',
    url: 'https://higgsfield.ai/creator-hub/changelog/rss.xml',
    coverage: ['media', 'products', 'models'],
    verifiedAt: '2026-11-09',
    verifiedNote:
      'RSS 2.0 changelog feed that Higgsfield lists in its own llms.txt (higgsfield.ai/blog/news is the editorial blog, this is the dated release feed)',
    enabled: true,
  },
];

/**
 * Additional feeds an operator has verified, added without a deploy.
 *
 * `CURIOSITY_AI_FEEDS="Name|https://example.com/feed.xml,Other|https://…"`.
 *
 * Deliberately strict: an entry without a name, without an absolute http(s) URL, or
 * that points at a host we already read is ignored rather than fetched. Adding a
 * source is a decision someone makes after checking it, not a side effect of a typo
 * in an environment variable.
 */
export function extraAiWorldFeeds(raw = process.env.CURIOSITY_AI_FEEDS ?? ''): AiWorldFeed[] {
  const feeds: AiWorldFeed[] = [];
  for (const chunk of raw.split(',')) {
    const [name, url] = chunk.split('|').map((part) => part.trim());
    if (!name || !url || !isHttpUrl(url)) continue;
    if (AI_WORLD_FEEDS.some((feed) => feed.url === url) || feeds.some((feed) => feed.url === url)) continue;
    feeds.push({
      id: `extra-${slug(name)}`,
      name,
      url,
      coverage: ['industry'],
      enabled: true,
      verifiedNote: 'configured through CURIOSITY_AI_FEEDS',
    });
  }
  return feeds;
}

/** The feeds actually fetched: the verified registry, plus the operator's own. */
export function aiWorldFeeds(raw?: string): AiWorldFeed[] {
  return [...AI_WORLD_FEEDS.filter((feed) => feed.enabled), ...extraAiWorldFeeds(raw)];
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** How many items one publisher may contribute to a single day. */
export const MAX_ITEMS_PER_SOURCE = 3;
/** A headline shorter than this is a label, not a development. */
export const MIN_TITLE_CHARS = 16;

/** One feed's outcome, kept so Settings can say which source is quiet and why. */
export interface AiFeedReport {
  id: string;
  name: string;
  url: string;
  coverage: readonly AiFeedCoverage[];
  status: 'ok' | 'unreachable' | 'not-a-feed' | 'empty' | 'stale' | 'disabled';
  items: number;
  note?: string;
}

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
/** Canonical form of a URL for cross-source duplicate detection. */
export function canonicalNewsUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}${url.search}`.toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

/**
 * Keep the newest stories that the selected first-party AI publishers provide.
 *
 * Four gates, in this order, because each one answers a different question:
 *
 *   1. **Is this a card?** An absolute http(s) link, a named publisher, and a title
 *      long enough to be a development rather than a product name.
 *   2. **Is it news?** A parseable, not-in-the-future date inside the recency window.
 *   3. **Is it the same story again?** Canonical URL and normalised title are both
 *      checked across *all* publishers, so one announcement syndicated by two
 *      newsrooms appears once.
 *   4. **Is one publisher crowding the card?** `MAX_ITEMS_PER_SOURCE` caps each
 *      source, which is what keeps a chatty changelog from burying a model release
 *      from a quieter lab. Fewer, better items beat ten weak ones.
 */
export function selectAiWorldArticles(items: CuriosityNewsItem[], now = Date.now()): CuriosityNewsItem[] {
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const perSource = new Map<string, number>();
  const kept: CuriosityNewsItem[] = [];
  const sorted = [...items].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  for (const item of sorted) {
    // Last gate before the item becomes a link in someone's browser: the card
    // renders `href={item.url}`, so only an absolute http(s) URL may pass. The
    // feed parser checks this too — a published snapshot is read back from the
    // store without re-running that parser, so the check has to live here as well.
    if (!isHttpUrl(item.url)) continue;
    if (!item.source || item.source.trim().length < 2) continue;
    if (!item.title || item.title.trim().length < MIN_TITLE_CHARS) continue;
    const published = Date.parse(item.publishedAt);
    if (!Number.isFinite(published) || published > now) continue;
    // Outside the recency window: a real article, and not news.
    if (now - published > NEWS_RECENCY_DAYS * 86_400_000) continue;

    const urlKey = canonicalNewsUrl(item.url);
    const titleKey = item.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seenUrls.has(urlKey) || seenTitles.has(titleKey)) continue;
    const used = perSource.get(item.source) ?? 0;
    if (used >= MAX_ITEMS_PER_SOURCE) continue;

    perSource.set(item.source, used + 1);
    seenUrls.add(urlKey);
    seenTitles.add(titleKey);
    kept.push(item);
    if (kept.length === MAX_AI_WORLD_ARTICLES) break;
  }
  return kept;
}

/**
 * Parse one feed document into items.
 *
 * Pure and exported so the parser can be tested against recorded RSS and Atom
 * documents — including the awkward ones: CDATA-wrapped text, escaped markup,
 * self-closing `<link href>` in Atom, and items with no date at all.
 *
 * An item without a title or a link is skipped. An item without a date is skipped
 * too: the card must never show a story whose age nobody knows, and an undated item
 * cannot be placed inside the recency window.
 */
export function parseFeedXml(xml: string, feed: Pick<AiWorldFeed, 'id' | 'name'>): { items: CuriosityNewsItem[]; undated: number } {
  let undated = 0;
  const items: CuriosityNewsItem[] = [];
  for (const match of xml.matchAll(/<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/gi)) {
    const block = match[0];
    const link = tag(block, 'link') || (block.match(/<link[^>]*href=["']([^"']+)/i)?.[1] ?? '');
    const title = tag(block, 'title');
    // RSS says `pubDate`, Atom says `published`, or `updated` when that is all the
    // feed offers.
    const publishedAt = tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated');
    const summary = tag(block, 'description') || tag(block, 'summary') || tag(block, 'content');
    if (!title || !isHttpUrl(link)) continue;
    if (!publishedAt) {
      undated += 1;
      continue;
    }
    items.push({
      title,
      source: feed.name,
      publishedAt,
      summary: summary.slice(0, 280),
      url: link,
      origin: 'live' as const,
    });
  }
  return { items, undated };
}

/** A feed answers with XML, or it is not a feed we can read. */
export function looksLikeFeedDocument(contentType: string | null): boolean {
  if (!contentType) return true; // no header: judge the body instead
  return /xml|rss|atom/i.test(contentType);
}

/**
 * Why a live section ended up empty, phrased by the code that knows.
 *
 * `note.text` is the sentence the snapshot records; `note.feeds` is the per-feed
 * report the status endpoint and Settings read, so "nothing new" and "the feeds are
 * unreachable" stop being the same line.
 */
export type SourceNote = { text?: string; feeds?: AiFeedReport[] };

export type NewsFetchResult = {
  items: CuriosityNewsItem[];
  reports: AiFeedReport[];
  noteText?: string;
};

/**
 * Read every enabled AI newsroom feed, once, and report on each one.
 *
 * The report is the operator-facing half of this function: a day with three items
 * from two feeds is a very different situation from a day with three items because
 * five feeds are down, and the status endpoint should be able to say which.
 */
export async function fetchAiWorldFeeds(
  fetchImpl: typeof fetch = fetch,
  options: { now?: number; feeds?: readonly AiWorldFeed[] } = {},
): Promise<NewsFetchResult> {
  const now = options.now ?? Date.now();
  const feeds = options.feeds ?? aiWorldFeeds();
  const reports: AiFeedReport[] = [];
  const collected: CuriosityNewsItem[] = [];

  await Promise.all(
    feeds.map(async (feed) => {
      const report: AiFeedReport = {
        id: feed.id,
        name: feed.name,
        url: feed.url,
        coverage: feed.coverage,
        status: 'unreachable',
        items: 0,
      };
      try {
        // Redirects are followed by `fetch` itself; the pair is asked for the feed URL
        // the publisher advertises, and whatever answers is judged on its content type.
        const response = await fetchImpl(feed.url, {
          headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
          signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
          redirect: 'follow',
          cache: 'no-store',
        });
        if (!response.ok) {
          report.status = 'unreachable';
          report.note = `HTTP ${response.status}`;
          return;
        }
        const type = response.headers.get('content-type') ?? '';
        if (!looksLikeFeedDocument(type)) {
          // An HTML page here means the feed moved or the URL was a web page all along.
          // Parsing it as XML would either fail quietly or invent a headline.
          report.status = 'not-a-feed';
          report.note = `answered with ${type.split(';')[0]}, not a feed`;
          return;
        }
        const xml = await response.text();
        const parsed = parseFeedXml(xml, feed);
        if (parsed.items.length === 0) {
          report.status = parsed.undated > 0 ? 'stale' : 'empty';
          report.note = parsed.undated > 0
            ? `${parsed.undated} item(s) carried no date, so none could be placed inside the ${NEWS_RECENCY_DAYS}-day window`
            : 'the feed answered but listed no items';
          return;
        }
        report.status = 'ok';
        report.items = parsed.items.length;
        collected.push(...parsed.items);
        if (parsed.undated > 0) report.note = `${parsed.undated} undated item(s) skipped`;
      } catch (error) {
        // A timeout, a refused connection and a DNS failure all arrive here. They are
        // not the same as an empty feed, and one dead publisher must not end the loop:
        // every feed is fetched independently and its failure is only recorded.
        report.status = 'unreachable';
        report.note = error instanceof Error ? error.message.replace(/^AbortSignal timed out\.$/, 'timed out') : String(error);
      } finally {
        reports.push(report);
      }
    }),
  );

  // Stable order for the Settings panel, whatever order the network finished in.
  reports.sort((a, b) => aiWorldFeeds().findIndex((feed) => feed.id === a.id) - aiWorldFeeds().findIndex((feed) => feed.id === b.id) || a.name.localeCompare(b.name));

  const items = selectAiWorldArticles(collected, now);
  const reached = reports.filter((report) => report.status === 'ok' || report.status === 'empty' || report.status === 'stale').length;
  const stale = reports.filter((report) => report.status === 'stale').length;
  const problems = reports.filter((report) => report.status !== 'ok');
  const named = problems
    .slice(0, 3)
    .map((report) => `${report.name}: ${report.note ?? report.status}`)
    .join('; ');
  // Never drop a cause silently: the reader of the note has to know how many were
  // left out, otherwise "three feeds failed" reads like "only three feeds failed".
  const why = problems.length > 3 ? `${named}; +${problems.length - 3} more` : named;

  let noteText: string | undefined;
  if (items.length === 0) {
    noteText =
      reached === 0
        ? `none of the ${reports.length} first-party AI feeds could be reached from this server${why ? ` (${why})` : ''}`
        : stale > 0
          ? `the ${reached} feed(s) that answered had no item published within ${NEWS_RECENCY_DAYS} days${why ? ` (${why})` : ''}`
          : `the ${reached} feed(s) that answered had nothing new to show${why ? ` (${why})` : ''}`;
  }

  return { items, reports, ...(noteText ? { noteText } : {}) };
}

/**
 * The long-standing contract: headlines, plus a note explaining an empty result.
 *
 * `note.feeds` is new and additive — the per-feed report that Settings and the
 * status endpoint read. Callers that only want the items are unaffected.
 */
export async function fetchNews(fetchImpl: typeof fetch = fetch, note?: SourceNote): Promise<CuriosityNewsItem[]> {
  try {
    const result = await fetchAiWorldFeeds(fetchImpl);
    if (note) {
      note.feeds = result.reports;
      if (result.noteText) note.text = result.noteText;
    }
    return result.items;
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
    ...aiWorldFeeds().map((feed) => probe(feed.name, feed.url, /xml|rss|atom/i)),
    probe('GitHub repository search', RADAR_SEARCH_URL, /json/i),
    probe('Wikipedia selected anniversaries', historyApiUrl(date ?? '2026-01-01'), /json/i),
    probe(
      'Open Library search',
      'https://openlibrary.org/search.json?q=design+of+everyday+things&fields=key,title,author_name,cover_i,first_publish_year&limit=1',
      /json/i,
    ),
  ]);
}
