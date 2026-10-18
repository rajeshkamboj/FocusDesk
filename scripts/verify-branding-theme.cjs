// Isolated local preview only. Optional tooling: npm i --no-save --package-lock=false playwright
// UI_TEST_URL=http://localhost:3000 UI_TEST_EXECUTABLE_PATH=/path/to/chromium node scripts/verify-branding-theme.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { readFileSync } = require('node:fs');

async function main() {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.UI_TEST_EXECUTABLE_PATH ? { executablePath: process.env.UI_TEST_EXECUTABLE_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {}),
  });
  try {
    const base = process.env.UI_TEST_URL || 'http://localhost:3000';
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', colorScheme: 'light' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const visit = async (route) => {
      const response = await page.goto(`${base}/${route}`);
      assert.equal(response.status(), 200, route);
      await page.locator('main h1').waitFor();
    };
    const theme = () => page.locator('html').getAttribute('data-theme');
    const choose = async (name, value) => {
      await page.getByRole('radio', { name: new RegExp(`^${name}`) }).check();
      await page.waitForFunction((expected) => document.documentElement.dataset.theme === expected && JSON.parse(localStorage.getItem('pace.db.v1')).settings.appearance.theme === expected, value);
      await page.waitForFunction(() => !document.querySelector('fieldset[disabled]'));
    };
    await visit('settings');
    assert.equal(await theme(), 'dark', 'Default ignores light OS preference');
    assert.equal(await page.title(), 'Settings · Focus Desk');
    assert.match(await page.locator('aside.fixed').innerText(), /Focus Desk/);
    assert.match(await page.locator('aside.fixed footer').innerText(), /Developed with love for Rajesh Singh/);
    assert.match(await page.locator('aside.fixed footer').innerText(), /Your data stays on this device/);
    assert.equal(await page.locator('aside.fixed footer a').last().getAttribute('href'), 'https://pixldot.com/');
    const logo = page.getByAltText('PixlDot logo');
    await logo.evaluate((image) => image.decode());
    const dimensions = await logo.evaluate((image) => ({ width: image.width, height: image.height, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight }));
    assert.equal(dimensions.height, 24);
    assert.equal(dimensions.width / dimensions.height, dimensions.naturalWidth / dimensions.naturalHeight);
    const fixture = JSON.parse(readFileSync('fixtures/focusdesk-phase1-preview.json', 'utf8'));
    fixture.settings.general.automaticCarryForward = false;
    fixture.settings.appearance.theme = 'dark';
    await page.evaluate((data) => localStorage.setItem('pace.db.v1', JSON.stringify(data)), fixture);
    await visit('settings');
    await choose('PixlDot', 'pixldot');
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('pace.db.v1')));
    const routes = ['today', 'inbox', 'tasks', 'projects', 'goals', 'calendar', 'review', 'learnings', 'ideas', 'curiosity', 'settings'];
    for (const value of ['pixldot', 'dark']) {
      await visit('settings');
      await choose(value === 'pixldot' ? 'PixlDot' : 'Existing Dark', value);
      await page.evaluate(() => { window.themeNavigationProbe = true; });
      await page.locator('aside.fixed nav a[href="/inbox"]').click();
      await page.getByRole('heading', { name: 'Inbox', exact: true }).waitFor();
      assert.equal(await theme(), value);
      assert.ok(await page.evaluate(() => window.themeNavigationProbe), 'Sidebar navigation does not reload');
      await page.locator('aside.fixed nav a[href="/settings"]').click();
      await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
      assert.equal(await theme(), value);
      const expectedAccent = value === 'pixldot' ? '#3757f5' : '#4fae8d';
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()), expectedAccent);
      const resolved = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.className = 'text-accent';
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      });
      assert.equal(resolved, value === 'pixldot' ? 'rgb(169, 186, 255)' : 'rgb(79, 174, 141)', 'Accessible semantic accent text');
      for (const width of [320, 390, 1024, 1440]) {
        await page.setViewportSize({ width, height: width === 1024 ? 480 : 900 });
        for (const route of routes) {
          await visit(route);
          assert.equal(await theme(), value);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route}/${value} overflow at ${width}`);
          if (width >= 1024) {
            assert.ok(await page.locator('aside.fixed').evaluate((aside) => {
              const nav = aside.querySelector('nav').getBoundingClientRect();
              const footer = aside.querySelector('footer').getBoundingClientRect();
              return nav.bottom <= footer.top + 1 && footer.bottom <= innerHeight && footer.left >= 0;
            }), `Footer collision at ${width}`);
            const lastNavItem = page.locator('aside.fixed nav a').last();
            await lastNavItem.scrollIntoViewIfNeeded();
            assert.ok(await lastNavItem.isVisible());
          }
        }
      }
      await page.reload();
      await page.getByRole('radio', { name: /^Existing Dark/ }).waitFor();
      assert.equal(await theme(), value);
      const after = await page.evaluate(() => JSON.parse(localStorage.getItem('pace.db.v1')));
      assert.deepEqual({ ...after, settings: before.settings }, before, 'Theme switching changes no user records');
      const state = await context.storageState();
      const reopened = await browser.newContext({ storageState: state, serviceWorkers: 'block' });
      const reopenedPage = await reopened.newPage();
      await reopenedPage.goto(`${base}/settings`);
      await reopenedPage.getByRole('radio', { name: value === 'pixldot' ? /^PixlDot/ : /^Existing Dark/ }).waitFor();
      assert.equal(await reopenedPage.locator('html').getAttribute('data-theme'), value);
      await reopened.close();
    }
    // Native radios support keyboard selection without custom key handlers.
    await page.getByRole('radio', { name: /^Existing Dark/ }).focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'pixldot');
    assert.equal(await page.getByRole('radio', { name: /^PixlDot/ }).isChecked(), true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: '.next/verification/settings-pixldot.png', fullPage: true });
    assert.deepEqual(errors, [], 'No browser runtime errors');
  } finally {
    await browser.close();
  }
  console.log('PASS branding/logo, immediate and keyboard theme switching, reload/reopen persistence, all 11 routes in both themes at 4 viewport sizes, compact footer, unchanged records, runtime errors');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
