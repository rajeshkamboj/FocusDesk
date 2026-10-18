// Optional tooling: playwright. Use only against an isolated local-storage preview.
// UI_TEST_URL=http://localhost:3000 UI_TEST_EXECUTABLE_PATH=/path/to/chromium node scripts/verify-advanced-themes.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const defaults = { background: '#151613', text: '#ecece6', surface: '#1c1d19', accent: '#4fae8d', border: '#42443a', muted: '#a9aa9f' };
const options = [['dark', 'Existing Dark'], ['pixldot', 'PixlDot'], ['light', 'Light'], ['midnight', 'Midnight'], ['warm-paper', 'Warm Paper'], ['custom', 'Custom']];
const key = 'focusdesk.theme.custom.v1';
function contrast(a, b) {
  const luminance = (value) => {
    const hex = value.length === 4 ? '#' + value.slice(1).split('').map((c) => c + c).join('') : value;
    const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const first = luminance(a), second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
async function main() {
  const browser = await chromium.launch({ headless: true, ...(process.env.UI_TEST_EXECUTABLE_PATH ? { executablePath: process.env.UI_TEST_EXECUTABLE_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {}) });
  try {
    const base = process.env.UI_TEST_URL || 'http://localhost:3000';
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', colorScheme: 'light' });
    // Emulate only the platform window API; exercise the real timer PiP component.
    await context.addInitScript(() => {
      Object.defineProperty(window, 'documentPictureInPicture', {
        configurable: true,
        value: { requestWindow: () => Promise.resolve(window.open('about:blank', 'focusdesk-theme-pip', 'width=360,height=300')) },
      });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const visit = async (route) => {
      assert.equal((await page.goto(`${base}/${route}`)).status(), 200);
      await page.locator('main h1').waitFor();
    };
    const theme = () => page.locator('html').getAttribute('data-theme');
    const css = (token) => page.evaluate((t) => getComputedStyle(document.documentElement).getPropertyValue(t).trim(), token);
    const choose = async (value, label) => {
      await page.getByRole('radio', { name: new RegExp(`^${label}(?:\\s|$)`) }).check();
      await page.waitForFunction((expected) => document.documentElement.dataset.theme === expected && !document.querySelector('fieldset[disabled]') && JSON.parse(localStorage.getItem('pace.db.v1')).settings.appearance.theme === expected, value);
    };
    await visit('settings');
    assert.equal(await theme(), 'dark');
    assert.equal(await page.getByRole('radio').count(), 6);
    const fixture = JSON.parse(fs.readFileSync('fixtures/focusdesk-phase1-preview.json', 'utf8'));
    fixture.settings.general.automaticCarryForward = false;
    fixture.settings.appearance.theme = 'dark';
    await page.evaluate((data) => localStorage.setItem('pace.db.v1', JSON.stringify(data)), fixture);
    await visit('settings');
    await choose('pixldot', 'PixlDot');
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('pace.db.v1')));
    for (const [value, label] of options) {
      await visit('settings');
      await choose(value, label);
      if (value === 'dark') {
        assert.equal(await css('--background'), '#151613');
        assert.equal(await css('--accent'), '#4fae8d');
      }
      if (value === 'pixldot') {
        assert.equal(await css('--background'), '#131620');
        assert.equal(await css('--accent'), '#3757f5');
        assert.equal(await css('--highlight'), '#e87552');
      }
      assert.equal(await page.getByRole('heading', { name: 'Custom colors', exact: true }).isVisible(), value === 'custom');
      const tokens = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return Object.fromEntries(['background', 'surface', 'surface-2', 'surface-3', 'ink', 'ink-2', 'ink-3', 'accent', 'accent-hover', 'on-accent', 'danger', 'danger-soft', 'warning', 'warning-soft'].map((k) => [k, style.getPropertyValue('--' + k).trim()]));
      });
      for (const fg of ['ink', 'ink-2', 'ink-3']) {
        for (const bg of ['background', 'surface', 'surface-2', 'surface-3']) assert.ok(contrast(tokens[fg], tokens[bg]) >= 4.5, `${label}: ${fg} on ${bg} AA contrast`);
      }
      if (value !== 'dark') {
        for (const bg of ['accent', 'accent-hover']) assert.ok(contrast(tokens['on-accent'], tokens[bg]) >= 4.5, `${label}: filled-control AA contrast`);
      }
      assert.ok(contrast(tokens.danger, tokens['danger-soft']) >= 4.5);
      assert.ok(contrast(tokens.warning, tokens['warning-soft']) >= 4.5);

      for (const width of [320, 768, 1440]) {
        await page.setViewportSize({ width, height: width === 1440 ? 480 : 900 });
        for (const route of ['today', 'inbox', 'tasks', 'projects', 'goals', 'calendar', 'review', 'learnings', 'ideas', 'curiosity', 'settings']) {
          await visit(route);
          assert.equal(await theme(), value);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${value}/${route} overflows at ${width}`);
        }
      }
      await page.reload();
      await page.getByRole('radio', { name: /^Existing Dark/ }).waitFor();
      assert.equal(await theme(), value);
      console.log(`PASS ${label}: all 11 screens at 320/768/1440px, reload, responsive custom panel`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    const edit = (label) => page.getByRole('textbox', { name: `${label} hex`, exact: true });
    for (const [label, token, color] of [
      ['Background', '--background', '#faf8f2'], ['Primary text', '--ink', '#222222'],
      ['Surface / card', '--surface', '#ffffff'], ['Primary accent', '--accent', '#ffcc00'],
      ['Border', '--line', '#889988'], ['Muted text', '--ink-2', '#555555'],
    ]) {
      await edit(label).fill(color);
      await edit(label).blur();
      assert.equal(await css(token), color);
    }
    assert.equal(await css('--on-accent'), '#000000', 'Yellow accents have readable dark labels');
    const validAccent = await css('--accent');
    for (const invalid of ['#xyz', 'url(x)', '#123456;display:none', '#12345678', '']) {
      await edit('Primary accent').fill(invalid);
      assert.equal(await edit('Primary accent').getAttribute('aria-invalid'), 'true');
      assert.equal(await css('--accent'), validAccent);
    }
    await edit('Primary accent').fill('#ABC');
    await edit('Primary accent').blur();
    assert.equal(await edit('Primary accent').inputValue(), '#aabbcc');
    // Exercise the native picker through its native value setter and input events.
    await page.getByLabel('Primary accent color', { exact: true }).evaluate((input) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '#126b59');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    assert.equal(await css('--accent'), '#126b59');
    await edit('Primary text').fill('#ffffff');
    await page.getByText(/Low contrast: aim/).waitFor();
    await edit('Primary text').fill('#222222');
    const palette = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
    // SPA navigation, not just full document loads.
    await page.evaluate(() => { window.navigationProbe = true; });
    await page.locator('aside.fixed nav a[href="/inbox"]').click();
    await page.getByRole('heading', { name: 'Inbox', exact: true }).waitFor();
    assert.ok(await page.evaluate(() => window.navigationProbe));
    assert.equal(await css('--accent'), palette.accent);
    await visit('settings');
    await choose('light', 'Light');
    assert.equal(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).accent, key), palette.accent);
    await choose('custom', 'Custom');
    assert.equal(await edit('Primary accent').inputValue(), palette.accent);
    await page.reload();
    await edit('Primary accent').waitFor();
    assert.equal(await edit('Primary accent').inputValue(), palette.accent);
    const reopened = await browser.newContext({ storageState: await context.storageState(), serviceWorkers: 'block' });
    const reopenedPage = await reopened.newPage();
    await reopenedPage.goto(`${base}/settings`);
    await reopenedPage.getByLabel('Primary accent hex', { exact: true }).waitFor();
    assert.equal(await reopenedPage.getByLabel('Primary accent hex', { exact: true }).inputValue(), palette.accent);
    await reopened.close();
    // Changes in another live tab update both palette controls and global tokens.
    const second = await context.newPage();
    await second.goto(`${base}/settings`);
    await second.getByLabel('Primary accent hex', { exact: true }).fill('#4055c8');
    await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--accent') === '#4055c8');
    assert.equal(await edit('Primary accent').inputValue(), '#4055c8');
    await second.close();
    await page.getByRole('button', { name: 'Reset Theme', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark' && !document.querySelector('fieldset[disabled]'));
    assert.equal(await css('--accent'), '#4fae8d');
    await choose('custom', 'Custom');
    assert.equal(await css('--accent'), '#4055c8');
    await page.getByRole('button', { name: 'Reset Custom Colors', exact: true }).click();
    assert.deepEqual(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key), defaults);
    assert.equal(await theme(), 'custom');
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('pace.db.v1')));
    assert.deepEqual({ ...after, settings: before.settings }, before, 'Theme work preserves user records');
    assert.deepEqual(errors, []);
    fs.mkdirSync('.next/verification', { recursive: true });
    await page.screenshot({ path: '.next/verification/advanced-themes-custom.png', fullPage: true });
    // Normal task/timer workflow continues while Settings updates the pop-out.
    await visit('today');
    await page.getByRole('button', { name: 'Add Task', exact: true }).first().click();
    await page.getByPlaceholder('What needs to be done?').fill('Theme timer smoke test');
    await page.getByRole('dialog').getByRole('button', { name: 'Add task', exact: true }).click();
    const row = page.locator('[data-task-id]').filter({ hasText: 'Theme timer smoke test' }).first();
    await row.getByRole('button', { name: 'Start task', exact: true }).click();
    await page.getByRole('button', { name: 'Pause timer for Theme timer smoke test', exact: true }).waitFor();
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Pop out timers', exact: true }).click();
    const popup = await popupPromise;
    await popup.getByText('Theme timer smoke test', { exact: true }).waitFor();
    await page.locator('aside.fixed nav a[href="/settings"]').click();
    await edit('Primary accent').waitFor();
    await edit('Primary accent').fill('#ff8800');
    await popup.waitForFunction(() => document.documentElement.style.getPropertyValue('--accent') === '#ff8800');
    await choose('light', 'Light');
    await popup.waitForFunction(() => document.documentElement.dataset.theme === 'light' && !document.documentElement.style.getPropertyValue('--accent'));
    await choose('custom', 'Custom');
    await popup.waitForFunction(() => document.documentElement.style.getPropertyValue('--accent') === '#ff8800');
    await page.getByRole('button', { name: 'Pause timer for Theme timer smoke test', exact: true }).click();
    await popup.getByText(/elapsed, paused/).waitFor();
    await popup.close();
    await page.locator('aside.fixed nav a[href="/today"]').click();
    await row.getByRole('button', { name: 'Finish task', exact: true }).click();
    await page.getByRole('button', { name: /Completed today/ }).click();
    await page.getByText('Theme timer smoke test', { exact: true }).waitFor();
    console.log('PASS task creation/start/pause/completion and real timer PiP theme mirroring (platform window API emulated)');
    console.log('PASS live hex/native color edits, invalid CSS/hex rejection, contrast warning, independent palette persistence, SPA/reload/reopen, cross-tab sync, both resets, preserved data and no runtime errors');
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
