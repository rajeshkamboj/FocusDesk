import { unstable_cache } from 'next/cache';
import { dailyEditorial } from './content';
import type { CuriosityBriefing, CuriosityNewsItem, DeveloperDiscovery } from './types';

const SOURCE_TIMEOUT_MS = 6_000;
const NEWS_SIGNAL = /model|api|release|launch|research|open source|developer|agent|benchmark|safety|inference|tool|platform|framework/i;
const NEWS_FEEDS = [
  ['OpenAI', 'https://openai.com/news/rss.xml'],
  ['Anthropic', 'https://www.anthropic.com/news/rss.xml'],
  ['Google DeepMind', 'https://deepmind.google/blog/rss.xml'],
  ['Hugging Face', 'https://huggingface.co/blog/feed.xml'],
  ['Microsoft AI', 'https://blogs.microsoft.com/ai/feed/'],
  ['Meta AI', 'https://ai.meta.com/blog/rss/'],
] as const;

function text(value: string) {
  return value.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function isHttpUrl(value: string) {
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

async function fetchNews(): Promise<CuriosityNewsItem[]> {
  try {
    const batches = await Promise.all(NEWS_FEEDS.map(async ([source, url]) => {
      try {
        const response = await fetch(url, { headers: { accept: 'application/rss+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS) });
        if (!response.ok) return [];
        const xml = await response.text();
        return [...xml.matchAll(/<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/gi)].slice(0, 5).map((match): CuriosityNewsItem | null => {
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
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    const seen = new Set<string>();
    return batches.flat().filter((item) => {
      const published = Date.parse(item.publishedAt);
      if (!Number.isFinite(published) || published < cutoff || published > Date.now() || !NEWS_SIGNAL.test(item.title)) return false;
      const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 10);
  } catch {
    return [];
  }
}

async function fetchDeveloperRadar(): Promise<DeveloperDiscovery[]> {
  try {
    const response = await fetch('https://api.github.com/search/repositories?q=topic%3Adeveloper-tools+language%3ATypeScript&sort=updated&order=desc&per_page=3', { headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS) });
    if (!response.ok) return [];
    const data = await response.json() as { items?: Array<{ name: string; description: string | null; html_url: string }> };
    return (data.items ?? []).slice(0, 3).filter((item) => isHttpUrl(item.html_url)).map((item) => ({ name: item.name, description: item.description ?? 'An open-source developer project.', why: 'A recently updated open-source project worth evaluating for practical modern web work.', pricing: 'Open source; confirm the repository license and any hosted-service terms.', url: item.html_url }));
  } catch {
    return [];
  }
}

async function buildBriefing(date: string): Promise<CuriosityBriefing> {
  const [aiWorld, developerRadar] = await Promise.all([fetchNews(), fetchDeveloperRadar()]);
  return { date, aiWorld, developerRadar, ...dailyEditorial(date) };
}

export const getDailyBriefing = (date: string) => unstable_cache(() => buildBriefing(date), ['curiosity:v4', date], { revalidate: 86_400, tags: [`curiosity:v4:${date}`] })();
