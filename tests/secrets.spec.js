import { test, expect } from '@playwright/test';

/**
 * The secrets: the Konami stampede (and the embers turning into foxes), the Director's Cut toggle,
 * typing "fox", and the 404's torch-and-fox. Each is triggered the way a visitor would.
 */

async function ready(page, query = '') {
  await page.goto(`/?tier=2&weather=clear${query}`);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ignition ?? null), { timeout: 30_000 }).toBe('done');
}

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

test('Konami code: a three second stampede of foxes that cleans up after itself', async ({ page }) => {
  test.setTimeout(120_000);
  await ready(page);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  for (const key of KONAMI) await page.keyboard.press(key);
  await expect(page.locator('canvas[data-stampede]')).toHaveCount(1);
  await expect(page.locator('canvas[data-stampede]')).toHaveCount(0, { timeout: 6_000 });
});

test('a wrong key breaks the Konami code', async ({ page }) => {
  test.setTimeout(120_000);
  await ready(page);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  for (const key of [...KONAMI.slice(0, 5), 'x', ...KONAMI.slice(5)]) await page.keyboard.press(key);
  await page.waitForTimeout(300);
  await expect(page.locator('canvas[data-stampede]')).toHaveCount(0);
});

test("D opens the Director's Cut with live numbers and D closes it", async ({ page }) => {
  test.setTimeout(120_000);
  await ready(page);
  await page.evaluate(() => window.__filmTest.scrollToScene('S01', 0.3));
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('d');
  const hud = page.locator('[data-directors-cut-hud]');
  await expect(hud).toBeVisible();
  await expect(hud.locator('[data-field="scene"]')).toHaveText('S01');
  await expect.poll(async () => Number(await hud.locator('[data-field="fps"]').textContent()), { timeout: 10_000 }).toBeGreaterThan(0);
  await expect(hud).toContainText('press D to return to the film');
  // Still scrollable in the cut.
  await page.evaluate(() => window.__filmTest.scrollToScene('S03', 0.5));
  await expect(hud.locator('[data-field="scene"]')).toHaveText('S03');
  await page.keyboard.press('d');
  await expect(hud).toHaveCount(0);
});

test('keys typed into a form field never trigger secrets', async ({ page }) => {
  test.setTimeout(120_000);
  await ready(page, '&freeze=1');
  await page.evaluate(() => window.__filmTest.scrollToScene('S10', 0.9));
  await expect.poll(() => page.evaluate(() => window.__filmTest.returnScene?.().formIn ?? 0), { timeout: 30_000 }).toBe(1);
  await page.locator('[data-scene-index][data-active="true"] [data-region="contact"] textarea[name="message"]').pressSequentially('d is for directors, and a fox');
  await expect(page.locator('[data-directors-cut-hud]')).toHaveCount(0);
});

test('404: the fox searches with a torch, finds the cursor, and takes you home', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { name: "this page doesn't exist. the fox checked." })).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(window.__notFound)), { timeout: 20_000 }).toBe(true);
  expect(await page.evaluate(() => window.__notFound.found)).toBe(false);
  // Chase the torch with the cursor until the lights meet.
  await expect
    .poll(
      async () => {
        const at = await page.evaluate(() => window.__notFound.torchScreen());
        await page.mouse.move(at.x, at.y);
        return page.evaluate(() => window.__notFound.found);
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  await page.getByRole('link', { name: 'take me home' }).click();
  await expect.poll(() => page.evaluate(() => window.__notFound?.leaving ?? true)).toBe(true);
  await page.waitForURL((url) => url.pathname === '/', { timeout: 10_000 });
  expect(errors).toEqual([]);
});
