/** Optional local tooling: npx tsx scripts/verify-advanced-themes.ts (requires jsdom). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import {
  applyTheme, contrastRatio, CUSTOM_COLORS_KEY, customThemeTokens, DEFAULT_CUSTOM_COLORS,
  normalizeCustomColors, normalizeHex, normalizeTheme, readCustomColors, readStoredTheme,
  storeCustomColors, subscribeCustomColors, THEME_OPTIONS, themeInitScript,
} from '../lib/theme';
import { LocalRepository } from '../lib/store/local-repository';

async function main() {
  const dom = new JSDOM('<!doctype html><html></html>', { url: 'http://localhost/', runScripts: 'outside-only' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, Event: dom.window.Event });
  const storage = dom.window.localStorage;
  assert.equal(THEME_OPTIONS.length, 6);
  for (const option of THEME_OPTIONS) {
    assert.equal(normalizeTheme(option.value), option.value);
    storage.setItem('pace.theme', option.value);
    assert.equal(readStoredTheme(), option.value);
    dom.window.eval(themeInitScript);
    assert.equal(document.documentElement.dataset.theme, option.value);
  }
  for (const invalid of [null, undefined, 'system', 'obsolete', '', {}, 0, 'LIGHT']) assert.equal(normalizeTheme(invalid), 'dark');
  assert.equal(normalizeHex('#aBc'), '#aabbcc');
  assert.equal(normalizeHex(' #aB123F '), '#ab123f');
  for (const invalid of ['red', '#abcd', '#11223344', 'url(https://example.com)', 'var(--ink)', '#123456;display:none', '#gggggg', '', 42]) assert.equal(normalizeHex(invalid), null);
  assert.deepEqual(normalizeCustomColors({ background: '#abc', text: 'url(x)', unexpected: '#123456' }), { ...DEFAULT_CUSTOM_COLORS, background: '#aabbcc' });
  storage.setItem(CUSTOM_COLORS_KEY, '{broken');
  assert.deepEqual(readCustomColors(), DEFAULT_CUSTOM_COLORS);

  const repo = new LocalRepository(storage);
  await repo.importData(JSON.parse(readFileSync('fixtures/focusdesk-phase1-preview.json', 'utf8')));
  const before = await repo.exportData();
  const palette = { ...DEFAULT_CUSTOM_COLORS, background: '#f6f7f8', text: '#202124', surface: '#ffffff', accent: '#ffda00', muted: '#555555', border: '#b5b5b5' };
  assert.ok(storeCustomColors(palette));
  applyTheme('custom');
  const root = document.documentElement;
  assert.equal(root.style.getPropertyValue('--accent'), palette.accent);
  assert.equal(root.style.getPropertyValue('--on-accent'), '#000000');
  for (const option of THEME_OPTIONS) {
    applyTheme(option.value);
    await repo.settings.save({ appearance: { theme: option.value } });
    assert.deepEqual(readCustomColors(), palette);
    if (option.value !== 'custom') assert.equal(root.style.getPropertyValue('--accent'), '', 'No inline custom token leaks into a predefined theme');
    const after = await repo.exportData();
    assert.deepEqual({ ...after, settings: before.settings }, before, 'User records unchanged');
  }
  dom.window.eval(themeInitScript);
  assert.equal(root.style.getPropertyValue('--accent'), palette.accent, 'Custom tokens applied before hydration');
  assert.deepEqual(readCustomColors(), palette);
  const tokens = customThemeTokens(palette);
  assert.ok(contrastRatio(tokens['--on-accent'], tokens['--accent']) >= 4.5);
  assert.ok(contrastRatio(tokens['--on-accent'], tokens['--accent-hover']) >= 4.5);
  for (const bg of [tokens['--background'], tokens['--surface'], tokens['--surface-2'], tokens['--surface-3']]) assert.ok(contrastRatio(tokens['--accent-ink'], bg) >= 4.5);
  for (const accent of ['#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff', '#777777']) {
    const t = customThemeTokens({ ...palette, accent });
    assert.ok(contrastRatio(t['--on-accent'], accent) >= 4.5);
    assert.ok(contrastRatio(t['--on-accent'], t['--accent-hover']) >= 4.5);
  }
  // Independent early-startup runtime also validates malformed stored palettes.
  storage.setItem(CUSTOM_COLORS_KEY, JSON.stringify({ accent: 'url(x)', background: '#abc' }));
  dom.window.eval(themeInitScript);
  assert.equal(root.style.getPropertyValue('--accent'), DEFAULT_CUSTOM_COLORS.accent);
  assert.equal(root.style.getPropertyValue('--background'), '#aabbcc');

  const unsubscribe = subscribeCustomColors(() => {});
  storage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(palette));
  dom.window.dispatchEvent(new dom.window.StorageEvent('storage', { key: CUSTOM_COLORS_KEY }));
  assert.equal(root.style.getPropertyValue('--accent'), palette.accent, 'Cross-tab palette applies globally');
  assert.deepEqual(readCustomColors(), palette);
  const prototype = Object.getPrototypeOf(storage), originalSet = prototype.setItem;
  try {
    prototype.setItem = () => { throw new Error('Storage blocked'); };
    assert.equal(storeCustomColors({ ...palette, accent: '#006622' }), false);
    assert.equal(root.style.getPropertyValue('--accent'), '#006622');
    assert.equal(readCustomColors().accent, '#006622', 'Blocked storage still permits session changes');
  } finally { prototype.setItem = originalSet; }
  storeCustomColors({ ...DEFAULT_CUSTOM_COLORS });
  assert.deepEqual(readCustomColors(), DEFAULT_CUSTOM_COLORS);
  applyTheme('dark');
  assert.equal(root.style.getPropertyValue('--accent'), '');
  unsubscribe();
  dom.window.close();
  console.log('PASS all 6 themes, hex validation/injection safety, custom persistence, startup parity, independent palette, resets, cross-tab updates, blocked storage, AA filled-control contrast, unchanged fixture records');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
