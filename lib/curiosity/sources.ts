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

function text(value: string) {
  return value.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
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
      const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, MAX_AI_WORLD_ARTICLES);
}

export async function fetchNews(fetchImpl: typeof fetch = fetch): Promise<CuriosityNewsItem[]> {
  try {
    const batches = await Promise.all(NEWS_FEEDS.map(async ([source, url]) => {
      try {
        const response = await fetchImpl(url, { headers: { accept: 'application/rss+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS) });
        if (!response.ok) return [];
        const xml = await response.text();
        // A single publisher can account for all ten newest stories, so retain
        // enough entries from each authoritative feed before the global limit.
        return [...xml.matchAll(/<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/gi)].slice(0, MAX_AI_WORLD_ARTICLES).map((match): CuriosityNewsItem | null => {
          const item = match[0];
          const link = tag(item, 'link') || (item.match(/<link[^>]*href=["']([^"']+)/i)?.[1] ?? '');
          const title = tag(item, 'title');
          const publishedAt = tag(item, 'pubDate') || tag(item, 'published') || tag(item, 'updated');
          const summary = tag(item, 'description') || tag(item, 'summary');
          return title && isHttpUrl(link) ? { title, source, publishedAt, summary: summary.slice(0, 280), url: link } : null;
        }).filter((item): item is CuriosityNewsItem => Boolean(item));
      } catch {
        return [];
      }
    }));
    return selectAiWorldArticles(batches.flat());
  } catch {
    return [];
  }
}

export async function fetchDeveloperRadar(fetchImpl: typeof fetch = fetch): Promise<DeveloperDiscovery[]> {
  try {
    const response = await fetchImpl('https://api.github.com/search/repositories?q=topic%3Adeveloper-tools+language%3ATypeScript&sort=updated&order=desc&per_page=3', { headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS) });
    if (!response.ok) return [];
    const data = await response.json() as { items?: Array<{ name: string; description: string | null; html_url: string }> };
    return (data.items ?? []).slice(0, 3).filter((item) => isHttpUrl(item.html_url)).map((item) => ({ name: item.name, description: item.description ?? 'An open-source developer project.', why: 'A recently updated open-source project worth evaluating for practical modern web work.', pricing: 'Open source; confirm the repository license and any hosted-service terms.', url: item.html_url }));
  } catch {
    return [];
  }
}

export async function fetchHistory(date: string, fetchImpl: typeof fetch = fetch): Promise<HistoryEvent | null> {
  const [, month, day] = date.split('-');
  try {
    // Wikipedia's selected anniversaries are editorially curated, not random events.
    const response = await fetchImpl(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/selected/${month}/${day}`, {
      headers: { accept: 'application/json', 'User-Agent': 'FocusDesk/0.1 (daily history reader)' },
      signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const result = await response.json() as { selected?: Array<{ year: number; text: string; pages?: Array<{ title: string; extract?: string; content_urls?: { desktop?: { page?: string } } }> }> };
    const events = (result.selected ?? []).filter((event) => Number.isFinite(event.year) && event.text && event.pages?.some((page) => page.content_urls?.desktop?.page && isHttpUrl(page.content_urls.desktop.page)));
    // Stable ordering makes the daily item independent of response ordering.
    events.sort((a, b) => a.year - b.year || a.text.localeCompare(b.text));
    const event = events[0];
    if (!event) return null;
    const page = event.pages!.find((page) => page.content_urls?.desktop?.page && isHttpUrl(page.content_urls.desktop.page))!;
    return {
      date: new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }),
      year: event.year,
      title: page.title.replaceAll('_', ' '),
      explanation: event.text,
      significance: page.extract ? (page.extract.length > 380 ? `${page.extract.slice(0, 377).replace(/\s+\S*$/, '')}…` : page.extract) : 'Featured in Wikipedia’s curated selection of significant anniversaries for this date.',
      url: page.content_urls!.desktop!.page,
    };
  } catch { return null; }
}
