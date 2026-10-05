import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createClient } from '@supabase/supabase-js';
import { SupabaseRepository } from '../lib/store/supabase-repository';
import { LocalRepository } from '../lib/store/local-repository';
import { defaultSettings } from '../lib/store/defaults';
import { getDailyQuote } from '../lib/quotes';
import { dailyEditorial } from '../lib/curiosity/content';
import { getUserDisplayName } from '../lib/auth/display-name';
import { ProgressSegments } from '../components/today/progress-segments';

async function main() {
  for (let day = 0; day < 366; day++) {
    const date = new Date(Date.UTC(2028, 0, 1 + day)).toISOString().slice(0, 10);
    const next = new Date(Date.UTC(2028, 0, 2 + day)).toISOString().slice(0, 10);
    assert.deepEqual(getDailyQuote(date), getDailyQuote(date));
    assert.notDeepEqual(getDailyQuote(date), getDailyQuote(next));
    const editorial = dailyEditorial(date);
    assert.deepEqual(editorial, dailyEditorial(date));
    if (editorial.history) assert.equal(editorial.history.date, new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }));
    assert.ok(editorial.literature.author && editorial.literature.url);
    assert.ok(editorial.sharpener.solution && editorial.sharpener.answer);
  }
  for (const [done, total] of [[0, 0], [0, 4], [2, 4], [4, 4], [137, 250]]) {
    const html = renderToStaticMarkup(createElement(ProgressSegments, { done, total }));
    assert.ok(html.includes(`aria-valuenow="${total ? Math.round(done / total * 100) : 0}"`));
    assert.equal((html.match(/h-2 rounded-full/g) || []).length, total || 1);
    assert.equal((html.match(/h-2 rounded-full bg-accent/g) || []).length, done);
  }
  assert.equal(getUserDisplayName(null, ' Rajesh '), 'Rajesh');
  assert.equal(getUserDisplayName(null, ' '), 'there');
  const storage = new Map<string, string>();
  const adapter = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); }, removeItem: (key: string) => { storage.delete(key); } };
  await new LocalRepository(adapter).settings.save({ general: { ...defaultSettings.general, displayName: 'Rajesh' } });
  assert.equal((await new LocalRepository(adapter).settings.get()).general.displayName, 'Rajesh');

  // Exercise the real Supabase repository and SDK against a controlled HTTP boundary.
  // No request or write reaches a real user account.
  let row: Record<string, unknown> | null = null;
  const client = createClient('https://test.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = String(input);
      assert.ok(url.includes('/rest/v1/app_settings'));
      if (init?.method === 'POST') {
        row = JSON.parse(String(init.body));
        assert.equal(row!.user_id, 'test-user');
        return new Response(null, { status: 201 });
      }
      assert.ok(url.includes('user_id=eq.test-user'));
      return Response.json(row ? [row] : []);
    } },
  });
  const repo = new SupabaseRepository(client, 'test-user');
  await repo.settings.save({ general: { ...defaultSettings.general, defaultTaskDuration: 45, displayName: 'Rajesh' } });
  const restored = await new SupabaseRepository(client, 'test-user').settings.get();
  assert.equal(restored.general.displayName, 'Rajesh');
  assert.equal(restored.general.defaultTaskDuration, 45);
  assert.deepEqual(restored.notifications, defaultSettings.notifications);
  console.log('PASS 366 daily selections, matching historical dates, zero/partial/full/250-task progress, name fallback, local reload and Supabase settings round-trip');
}
main().catch((error) => { console.error(error); process.exit(1); });
