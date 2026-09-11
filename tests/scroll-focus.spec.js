import { test, expect } from '@playwright/test';

/**
 * The page must never scroll itself. Focus only moves the film when it came
 * from the keyboard. ?tier=2 forces film mode so headless browsers without a
 * GPU still exercise the film path.
 */

const MODES = [
  { mode: 'film', path: '/?tier=2' },
  { mode: 'still', path: '/?still=1' },
];

for (const { mode, path } of MODES) {
  test(`${mode} mode stays at the top for 5 seconds with no input`, async ({ page }) => {
    await page.goto(path);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.mode)).toBe(mode);
    await page.waitForTimeout(5000);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
}

test('programmatic focus inside a far region does not move the film', async ({ page }) => {
  await page.goto('/?tier=2');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.mode)).toBe('film');
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const link = document.querySelector('[data-region="team"] a');
    link?.focus({ preventScroll: true });
  });
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.title()).toBe('mozilla firefox club');
});

test('tabbing into a region moves the film to its scene', async ({ page }) => {
  await page.goto('/?tier=2');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.mode)).toBe('film');
  let region = null;
  for (let i = 0; i < 40 && !region; i += 1) {
    await page.keyboard.press('Tab');
    region = await page.evaluate(() => document.activeElement?.closest('[data-region]')?.getAttribute('data-region') ?? null);
  }
  expect(region).toBe('projects');
  await expect.poll(() => page.title()).toBe('the gallery');
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});
