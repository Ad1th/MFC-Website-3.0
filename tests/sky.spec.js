import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

/**
 * S09 accept:
 *   - all 81 members plus faculty are reachable (as stars, and as HTML in the team region)
 *   - year switching works by mouse, touch and keyboard
 *   - no "#" links anywhere
 */

const team = JSON.parse(readFileSync(path.join(process.cwd(), 'src/content/team.json'), 'utf8'));
const years = Object.keys(team.years).sort((a, b) => b.localeCompare(a));

async function openSky(page, options = {}) {
  await page.goto('/?tier=2&freeze=1&weather=clear', options);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.filmReady ?? null)).toBe('true');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ignition ?? null), { timeout: 20_000 }).toBe('done');
  await page.evaluate(() => window.__filmTest.scrollToScene('S09', 0.5));
  await expect.poll(() => page.evaluate(() => window.__filmTest.state().scene), { timeout: 20_000 }).toBe('S09');
  await expect.poll(() => page.evaluate(() => typeof window.__filmTest.sky === 'function'), { timeout: 20_000 }).toBe(true);
}

test('S09 has a star for every member of every year and the faculty coordinator', async ({ page }) => {
  test.setTimeout(120_000);
  await openSky(page);
  const { stars, facultyName } = await page.evaluate(() => window.__filmTest.sky());
  expect(stars.find((s) => s.kind === 'faculty').name).toBe(team.faculty.name);
  expect(facultyName).toBe(team.faculty.name);
  let total = 0;
  for (const year of years) {
    const names = stars.filter((s) => s.kind === 'member' && s.year === year).map((s) => s.name).sort();
    expect(names).toEqual(team.years[year].map((m) => m.name).sort());
    total += names.length;
  }
  expect(total).toBe(81);
  expect(stars.filter((s) => s.kind === 'empty')).toHaveLength(1);
});

test('S09 every member is reachable as HTML in the team region, year by year', async ({ page }) => {
  test.setTimeout(120_000);
  await openSky(page);
  const region = page.locator('#team');
  await expect(region.getByRole('heading', { name: team.faculty.name })).toHaveCount(1);
  for (const year of years) {
    // The keyboard path: focus paints the region, Space selects the year.
    await region.getByRole('radio', { name: year }).focus();
    await page.keyboard.press('Space');
    await expect(region.getByRole('radio', { name: year })).toBeChecked();
    for (const member of team.years[year]) await expect(region.getByRole('heading', { name: member.name, exact: true })).toHaveCount(1);
  }
});

test('S09 year dial works by mouse, keyboard and touch', async ({ page }) => {
  test.setTimeout(120_000);
  await openSky(page);
  const dial = page.locator('[data-sky-dial]');
  await expect(dial).toBeVisible();

  await dial.getByRole('radio', { name: years[2] }).click();
  await expect.poll(() => page.evaluate(() => window.__filmTest.sky().year)).toBe(years[2]);

  await dial.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => window.__filmTest.sky().year)).toBe(years[3]);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => page.evaluate(() => window.__filmTest.sky().year)).toBe(years[1]);

  // A touch drag along the dial: pointer events with pointerType touch.
  const box = await dial.boundingBox();
  const y = box.y + box.height / 2;
  const x = box.x + box.width / 2;
  await dial.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 7, clientX: x, clientY: y, isPrimary: true });
  await dial.dispatchEvent('pointermove', { pointerType: 'touch', pointerId: 7, clientX: x + 150, clientY: y, isPrimary: true });
  await dial.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 7, clientX: x + 150, clientY: y, isPrimary: true });
  await expect.poll(() => page.evaluate(() => window.__filmTest.sky().year)).toBe(years[3]);
});

test('no "#" links anywhere', async ({ page }) => {
  test.setTimeout(120_000);
  await openSky(page);
  const hashes = await page.evaluate(() => [...document.querySelectorAll('a[href]')].filter((a) => a.getAttribute('href').trim() === '#').length);
  expect(hashes).toBe(0);
});
