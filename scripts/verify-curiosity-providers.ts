import assert from 'node:assert/strict';
import { fetchGurbani } from '@/lib/curiosity/server';
import { fetchVideos } from '@/lib/curiosity/youtube';

const originalFetch = globalThis.fetch;
process.env.YOUTUBE_API_KEY = 'fixture-only';

globalThis.fetch = async (input: URL | RequestInfo) => {
  const url = String(input);
  if (url.includes('/hukamnama/today')) {
    return new Response(JSON.stringify({ data: { gurbani: 'ਸਤਿਗੁਰੁ ਮੇਰਾ ਸਦਾ ਸਦਾ', ang: 1, english: 'Fixture translation', date: '2026-10-03' } }), { status: 200 });
  }
  if (url.includes('youtube/v3/search')) {
    const query = new URL(url).searchParams.get('q') ?? '';
    return new Response(JSON.stringify({ items: [
      { id: { videoId: `${query.slice(0, 3)}-one` }, snippet: { title: 'An educational explanation', channelTitle: 'Teaching channel', publishedAt: '2026-10-02T00:00:00Z', thumbnails: { medium: { url: 'https://i.ytimg.com/fixture.jpg' } } } },
      { id: { videoId: `${query.slice(0, 3)}-one` }, snippet: { title: 'Duplicate educational explanation', channelTitle: 'Teaching channel', publishedAt: '2026-10-02T00:00:00Z', thumbnails: { medium: { url: 'https://i.ytimg.com/fixture.jpg' } } } },
      { id: { videoId: `${query.slice(0, 3)}-short` }, snippet: { title: '#shorts quick reaction', channelTitle: 'Noise channel', publishedAt: '2026-10-02T00:00:00Z', thumbnails: { medium: { url: 'https://i.ytimg.com/fixture.jpg' } } } },
    ] }), { status: 200 });
  }
  return new Response('{}', { status: 503 });
};

async function main() {
  const gurbani = await fetchGurbani();
  assert.equal(gurbani?.text, 'ਸਤਿਗੁਰੁ ਮੇਰਾ ਸਦਾ ਸਦਾ');
  assert.equal(gurbani?.ang, '1');
  assert.equal(gurbani?.translation, 'Fixture translation');

  const videos = await fetchVideos();
  assert.equal(videos.length, 3);
  assert.equal(new Set(videos.map((video) => video.videoId)).size, 3);
  assert.ok(videos.every((video) => !/short|reaction/i.test(video.title)));

  globalThis.fetch = async () => new Response('{}', { status: 503 });
  assert.equal(await fetchGurbani(), null);
  assert.deepEqual(await fetchVideos(), []);

  console.log('Curiosity provider fixtures verified: Gurbani fields, video deduplication, filtering, and three-item cap.');
}

main().finally(() => { globalThis.fetch = originalFetch; });
