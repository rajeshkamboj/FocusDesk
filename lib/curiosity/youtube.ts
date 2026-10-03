import type { CuriosityVideo } from './types';

const SOURCE_TIMEOUT_MS = 6_000;
const SEARCHES = [
  { query: 'AI engineering OR programming OR web development educational explanation', label: 'AI and development' },
  { query: 'science physics astronomy computer science educational explanation', label: 'science' },
  { query: 'mathematics probability calculus algebra mathematical intuition educational', label: 'mathematics' },
] as const;

const REJECT = /#?shorts?|reaction|reacts|celebrity|gossip|drama|prank|challenge|giveaway|sponsor|sponsored|crypto|motivation/i;
const PREFER = /explained|lecture|tutorial|lesson|course|demo|deep dive|intuition|how it works|research/i;

type SearchResponse = { items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; publishedAt?: string; thumbnails?: { medium?: { url?: string }; high?: { url?: string } } } }> };

function score(title: string, query: string) {
  let value = PREFER.test(title) ? 3 : 0;
  for (const word of query.toLowerCase().split(/\s+|\b(?:or)\b/)) if (word.length > 4 && title.toLowerCase().includes(word)) value += 1;
  return value;
}

async function search(query: string, label: string, publishedAfter: string, key: string): Promise<CuriosityVideo[]> {
  const params = new URLSearchParams({ part: 'snippet', q: query, type: 'video', maxResults: '10', order: 'relevance', publishedAfter, relevanceLanguage: 'en', safeSearch: 'strict', videoDuration: 'medium', key });
  try {
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, { signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS), headers: { accept: 'application/json' } });
    if (!response.ok) return [];
    const data = await response.json() as SearchResponse;
    return (data.items ?? []).flatMap((item) => {
      const id = item.id?.videoId;
      const snippet = item.snippet;
      const title = snippet?.title?.replace(/<[^>]+>/g, '').trim();
      const publishedAt = snippet?.publishedAt;
      const thumbnail = snippet?.thumbnails?.high?.url ?? snippet?.thumbnails?.medium?.url;
      if (!id || !title || !publishedAt || !thumbnail || REJECT.test(title) || Date.parse(publishedAt) > Date.now()) return [];
      return [{ videoId: id, title, source: snippet?.channelTitle ?? 'YouTube', thumbnail, publishedAt, why: `Editorial selection for a recent ${label} explanation; review the original video before deciding whether to watch.`, url: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}` }];
    });
  } catch {
    return [];
  }
}

export async function fetchVideos(): Promise<CuriosityVideo[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];
  const publishedAfter = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const results = await Promise.all(SEARCHES.map(({ query, label }) => search(query, label, publishedAfter, key)));
  const selected: CuriosityVideo[] = [];
  const seen = new Set<string>();
  for (const category of results) {
    const choice = category.filter((video) => !seen.has(video.videoId)).sort((a, b) => score(b.title, '') - score(a.title, ''))[0];
    if (choice) { selected.push(choice); seen.add(choice.videoId); }
  }
  return selected.slice(0, 3);
}
