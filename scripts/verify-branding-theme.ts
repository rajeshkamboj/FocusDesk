/** Run: npx tsx scripts/verify-branding-theme.ts (optional tooling: tsx jsdom). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { applyTheme, normalizeTheme, readStoredTheme, themeInitScript } from '../lib/theme';
import { defaultSettings } from '../lib/store/defaults';
import { LocalRepository } from '../lib/store/local-repository';

async function main() {
  const dom = new JSDOM('<!doctype html><html></html>', { url: 'http://localhost/', runScripts: 'outside-only' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });
  const storage = dom.window.localStorage;
  assert.equal(defaultSettings.appearance.theme, 'dark');
  for (const value of [null, undefined, '', 'light', 'system', 'outdated', {}, 42, 'dark', 'pixldot']) {
    storage.clear();
    if (typeof value === 'string') storage.setItem('pace.theme', value);
    const expected = value === 'pixldot' ? 'pixldot' : 'dark';
    assert.equal(normalizeTheme(value), expected);
    assert.equal(readStoredTheme(), expected);
    dom.window.eval(themeInitScript);
    assert.equal(document.documentElement.dataset.theme, expected);
  }
  storage.clear();
  storage.setItem('pace.db.v1', JSON.stringify({ settings: { appearance: { theme: 'pixldot' } } }));
  assert.equal(readStoredTheme(), 'pixldot');
  dom.window.eval(themeInitScript);
  assert.equal(document.documentElement.dataset.theme, 'pixldot');
  storage.setItem('pace.theme', 'invalid');
  assert.equal(readStoredTheme(), 'dark');
  storage.clear();
  storage.setItem('pace.db.v1', '{bad json');
  assert.equal(readStoredTheme(), 'dark');
  dom.window.eval(themeInitScript);
  assert.equal(document.documentElement.dataset.theme, 'dark');

  storage.clear();
  const repo = new LocalRepository(storage);
  const fixture = JSON.parse(readFileSync('fixtures/focusdesk-phase1-preview.json', 'utf8'));
  await repo.importData(fixture);
  const before = await repo.exportData();
  for (const theme of ['pixldot', 'dark'] as const) {
    applyTheme(theme);
    await repo.settings.save({ appearance: { theme } });
    assert.equal(document.documentElement.dataset.theme, theme);
    assert.equal(readStoredTheme(), theme);
    const after = await repo.exportData();
    assert.equal(after.settings.appearance.theme, theme);
    assert.deepEqual({ ...after, settings: before.settings }, before, 'All user records remain identical');
  }
  const snapshot = storage.getItem('pace.db.v1');
  const prototype = Object.getPrototypeOf(storage);
  const originalGet = prototype.getItem;
  const originalSet = prototype.setItem;
  try {
    prototype.getItem = () => { throw new Error('Storage blocked'); };
    prototype.setItem = () => { throw new Error('Storage blocked'); };
    assert.equal(readStoredTheme(), 'dark');
    applyTheme('pixldot');
    assert.equal(document.documentElement.dataset.theme, 'pixldot');
    dom.window.eval(themeInitScript);
    assert.equal(document.documentElement.dataset.theme, 'dark');
  } finally {
    prototype.getItem = originalGet;
    prototype.setItem = originalSet;
  }
  assert.equal(storage.getItem('pace.db.v1'), snapshot);
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
  assert.equal(manifest.name, 'Focus Desk');
  assert.equal(manifest.short_name, 'Focus Desk');
  dom.window.close();
  console.log('PASS theme defaults, legacy/invalid preferences, startup parity, blocked storage, repository persistence, unchanged user data, PWA branding');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
