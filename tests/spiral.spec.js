import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

/**
 * S07 accept:
 *   - all 11 events are present with correct dates (the ember labels against events.json)
 *   - the flagship micro-scenes are reversible (their state at a point is the same after
 *     scrolling past and back)
 *   - the SOTY torch works with a mouse (pointing at the last ember finds it) and without one
 *     (the torch opens by itself after 1.5 s)
 */

const events = JSON.parse(readFileSync(path.join(process.cwd(), 'src/content/events.json'), 'utf8'));
const short = (iso) => {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y.slice(2)}`;
};

async function ready(page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.filmReady ?? null)).toBe('true');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ignition ?? null), { timeout: 20_000 }).toBe('done');
}

async function at(page, progress) {
  await page.evaluate((p) => window.__filmTest.scrollToScene('S07', p), progress);
  await expect.poll(() => page.evaluate(() => window.__filmTest.state().scene), { timeout: 20_000 }).toBe('S07');
  await expect.poll(() => page.evaluate(() => typeof window.__filmTest.spiral === 'function'), { timeout: 20_000 }).toBe(true);
  await page.waitForTimeout(300);
}

test('S07 has every event with its date, and the flagship moments reverse cleanly', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/?tier=2&freeze=1&weather=clear');
  await ready(page);
  await at(page, 0.05);

  const { labels, holds } = await page.evaluate(() => window.__filmTest.spiral());
  expect(labels).toHaveLength(events.length);
  expect(labels.map((l) => l.text)).toEqual(events.map((e) => `${short(e.date)} ${e.name.toUpperCase()}`));
  expect(holds.map((h) => h.slug).sort()).toEqual(events.filter((e) => e.flagship).map((e) => e.slug).sort());

  for (const hold of holds) {
    const mid = hold.p0 + (hold.p1 - hold.p0) * 0.5;
    await at(page, mid);
    const before = await page.evaluate(() => window.__filmTest.spiral().state);
    await at(page, Math.min(0.99, hold.p1 + 0.03));
    await at(page, mid);
    const after = await page.evaluate(() => window.__filmTest.spiral().state);
    for (const key of Object.keys(before)) expect(after[key], `${hold.slug} ${key}`).toBeCloseTo(before[key], 5);
  }
});

test('S07 SOTY torch opens by itself without a cursor, and a mouse finds the last ember', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/?tier=2&freeze=1&weather=clear');
  await ready(page);
  await at(page, 0.05);
  const { holds } = await page.evaluate(() => window.__filmTest.spiral());
  const soty = holds.find((h) => h.slug === 'scavenger-of-the-year');
  const mid = soty.p0 + (soty.p1 - soty.p0) * 0.5;

  // No pointer has moved in this page: the touch path.
  await at(page, mid);
  expect(await page.evaluate(() => window.__filmTest.spiral().state.hide)).toBeGreaterThan(0.9);
  await expect.poll(() => page.evaluate(() => window.__filmTest.spiral().torchRadius), { timeout: 5_000 }).toBeGreaterThan(1);

  // Now a mouse: point at the last ember.
  await at(page, Math.min(0.99, soty.p1 + 0.03));
  await at(page, mid);
  const [x, y] = await page.evaluate(() => window.__filmTest.spiral().sotyScreen);
  await page.mouse.move(x + 3, y + 3);
  await page.mouse.move(x, y);
  await expect.poll(() => page.evaluate(() => window.__filmTest.spiral().found), { timeout: 5_000 }).toBe(true);
});
