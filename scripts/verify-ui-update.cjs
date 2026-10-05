// Run against a local-storage preview, never a signed-in production account.
// Optional test tooling: npm install --no-save --package-lock=false playwright
// UI_TEST_URL defaults to http://localhost:3101. Uses installed Microsoft Edge.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Kolkata', serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const base = process.env.UI_TEST_URL || 'http://localhost:3101';
  const visit = async (route) => {
    const response = await page.goto(`${base}/${route}`);
    assert.equal(response.status(), 200, route);
    await page.locator('main h1').waitFor();
  };
  const shots = '.next/ui-verification';
  fs.mkdirSync(shots, { recursive: true });
  await visit('today');
  assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '0');
  const quote = await page.locator('blockquote').innerText();
  await page.reload();
  await page.locator('blockquote').waitFor();
  assert.equal(await page.locator('blockquote').innerText(), quote);
  await visit('settings');
  await page.getByLabel('Your name', { exact: true }).fill('  Rajesh  ');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Name saved' }).waitFor();
  await page.reload();
  await page.getByLabel('Your name', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Your name', { exact: true }).inputValue(), 'Rajesh');
  await page.screenshot({ path: `${shots}/settings-desktop.png`, fullPage: true });
  await visit('today');
  assert.match(await page.locator('header').innerText(), /Rajesh/i);
  await page.getByRole('button', { name: 'Add Task', exact: true }).first().click();
  await page.getByPlaceholder('What needs to be done?').fill('Verify segmented progress');
  await page.getByRole('dialog').getByRole('button', { name: 'Add task', exact: true }).click();
  await page.getByText('1 of 1 completed').waitFor({ state: 'hidden' });
  await page.getByText('0 of 1 completed', { exact: false }).waitFor();
  const checkbox = page.getByRole('button', { name: 'Complete task', exact: true });
  await checkbox.click();
  await page.getByText('1 of 1 completed', { exact: false }).waitFor();
  assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '100');
  await page.getByRole('button', { name: /Completed today/ }).click();
  await page.getByRole('button', { name: 'Reopen task', exact: true }).click();
  await page.getByText('0 of 1 completed', { exact: false }).waitFor();
  console.log('PASS name persistence, greeting, quote stability, task completion/reopening');
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['today', 'inbox', 'tasks', 'projects', 'goals', 'calendar', 'review', 'ideas', 'settings', 'curiosity']) {
      await visit(route);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${route} overflows at ${width}px`);
      await page.screenshot({ path: `${shots}/${route}-${width}.png`, fullPage: true });
      if (route === 'curiosity') {
        const text = await page.locator('main').innerText();
        for (const label of ['AI WORLD', 'DEVELOPER RADAR', 'ONE THING WORTH KNOWING', 'ONE BOOK', 'LEARN SOMETHING', 'TODAY IN HISTORY', 'A FEW MINUTES OF LITERATURE', 'BRAIN SHARPENER']) assert.ok(text.toUpperCase().includes(label), label);
        assert.equal(await page.getByRole('button', { name: 'Show solution' }).getAttribute('aria-expanded'), 'false');
        await page.getByRole('button', { name: 'Show solution' }).click();
        await page.getByText('Step-by-Step Solution').waitFor();
        await page.getByRole('button', { name: 'Hide solution' }).click();
      }
    }
    console.log(`PASS all routes and overflow at ${width}px; original Curious sections and daily additions present`);
  }
  await visit('settings');
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await visit('today');
  await page.screenshot({ path: `${shots}/today-dark.png`, fullPage: true });
  assert.deepEqual(errors, [], 'browser runtime errors');
  await browser.close();
  console.log('PASS browser verification; screenshots in .next/ui-verification');
}
main().catch((error) => { console.error(error); process.exit(1); });
