import { test, expect } from '@playwright/test';

/**
 * S11 End Card and the race home: the fox sleeps on the O, the year and socials are real, the
 * cursor cools the letters, the zoomies happen once per visitor, and the race home only starts
 * from the end card and knows who won.
 */

const PANEL = '[data-scene-index][data-active="true"] [data-region="end"]';

async function ready(page, query = '') {
  await page.goto(`/?tier=2&freeze=1&weather=clear${query}`);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ignition ?? null), { timeout: 30_000 }).toBe('done');
}

const scrollTo = (page, id, progress) => page.evaluate(([i, p]) => window.__filmTest.scrollToScene(i, p), [id, progress]);

test('S11 the fox sleeps on the O under a real year and working socials', async ({ page }) => {
  test.setTimeout(120_000);
  await ready(page);
  await scrollTo(page, 'S11', 0.9);
  await expect.poll(() => page.evaluate(() => window.__filmTest.endCard?.().asleep ?? false), { timeout: 20_000 }).toBe(true);
  await expect(page).toHaveTitle('shh. fox is sleeping.');
  await expect(page.locator(PANEL)).toContainText(`© ${new Date().getFullYear()} Mozilla Firefox Club`);
  const links = await page.locator(`${PANEL} a`).evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(links.length).toBeGreaterThanOrEqual(6);
  for (const href of links) expect(href).toMatch(/^https:\/\//);
  expect(await page.evaluate(() => window.__filmTest.endCard().oGlow)).toBeGreaterThan(0.5);
});

test('S11 the cursor cools the letters and they reheat', async ({ page }) => {
  test.setTimeout(120_000);
  await ready(page);
  await scrollTo(page, 'S11', 0.9);
  await expect.poll(() => page.evaluate(() => window.__filmTest.endCard?.().asleep ?? false), { timeout: 20_000 }).toBe(true);
  const o = await page.evaluate(() => window.__filmTest.endCard().o);
  expect(await page.evaluate(({ u, v }) => window.__filmTest.endCard().heatAt(u, v), o)).toBeGreaterThan(0.9);
  const at = await page.evaluate(() => window.__filmTest.endCard().oScreen());
  for (let i = 0; i < 12; i += 1) await page.mouse.move(at.x + (i % 2) * 2, at.y);
  await expect.poll(() => page.evaluate(({ u, v }) => window.__filmTest.endCard().heatAt(u, v), o)).toBeLessThan(0.6);
  await page.mouse.move(5, 5);
  await expect.poll(() => page.evaluate(({ u, v }) => window.__filmTest.endCard().heatAt(u, v), o), { timeout: 15_000 }).toBeGreaterThan(0.85);
});

test('S11 zoomies happen the first time only', async ({ page }) => {
  test.setTimeout(120_000);
  await ready(page, '&zoomies=1');
  await scrollTo(page, 'S11', 0.2);
  await page.waitForTimeout(400);
  await scrollTo(page, 'S11', 0.5);
  await expect.poll(() => page.evaluate(() => window.__filmTest.endCard().zooming)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__filmTest.endCard().zoomDone), { timeout: 15_000 }).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mfc.visitor')).firstCompletion)).toBeTruthy();

  await ready(page, '&zoomies=1');
  await scrollTo(page, 'S11', 0.2);
  await page.waitForTimeout(400);
  await scrollTo(page, 'S11', 0.5);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.__filmTest.endCard().zooming)).toBe(false);
});

test('race home: a fast viewer wins and gets rematch?', async ({ page }) => {
  test.setTimeout(120_000);
  await ready(page);
  await scrollTo(page, 'S11', 0.9);
  await page.waitForTimeout(600);
  await scrollTo(page, 'S11', 0.7);
  await expect.poll(() => page.evaluate(() => window.__filmTest.race().phase)).toBe('racing');
  await scrollTo(page, 'S01', 0);
  await expect.poll(() => page.evaluate(() => window.__filmTest.race().phase)).toBe('done');
  expect(await page.evaluate(() => window.__filmTest.race().result)).toBe('viewer');
  await expect(page.getByRole('button', { name: 'rematch?' })).toBeVisible();
});

test('race home: a slow viewer loses and gets again?', async ({ page }) => {
  test.setTimeout(120_000);
  await ready(page);
  await scrollTo(page, 'S11', 0.9);
  await page.waitForTimeout(600);
  await scrollTo(page, 'S11', 0.7);
  await expect.poll(() => page.evaluate(() => window.__filmTest.race().phase)).toBe('racing');
  await page.waitForTimeout(2700);
  await scrollTo(page, 'S01', 0);
  await expect.poll(() => page.evaluate(() => window.__filmTest.race().result)).toBe('fox');
  await expect(page.getByRole('button', { name: 'again?' })).toBeVisible();
});

test('race home never starts from anywhere but the end card', async ({ page }) => {
  test.setTimeout(120_000);
  await ready(page);
  await scrollTo(page, 'S09', 0.5);
  await page.waitForTimeout(400);
  await scrollTo(page, 'S01', 0);
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__filmTest.race().phase)).toBe('idle');
  await expect(page.getByRole('button', { name: /rematch\?|again\?/ })).toHaveCount(0);
});
