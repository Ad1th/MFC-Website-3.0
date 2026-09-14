import { test, expect } from '@playwright/test';

/**
 * Still mode (graphic novel): one captured frame per scene with the real HTML over it, in the
 * film's order. All content, the form and the team switcher work, and so does the living layer
 * (console, secrets). Reduced motion chooses it without asking.
 */

async function still(page, query = '') {
  await page.goto(`/?still=1${query}`);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.mode ?? null)).toBe('still');
}

test('still mode stacks a captured frame per scene behind the real content', async ({ page }) => {
  test.setTimeout(120_000);
  await still(page);
  await expect(page.locator('[data-still]')).toHaveCount(9);
  // S02 and S03 have no words: two picture-only interludes.
  expect(await page.locator('picture:has(> img[src^="/stills/"])').count()).toBe(11);
  const first = page.locator('[data-still="S01"] img');
  await expect.poll(() => first.evaluate((img) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
  // Every still file exists (lazy images: fetch them directly).
  const ids = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11'];
  for (const id of ids) {
    for (const suffix of ['', '-tall']) {
      const res = await page.request.get(`/stills/${id}${suffix}.avif`);
      expect(res.status(), `${id}${suffix}.avif`).toBe(200);
    }
  }
  await expect(page.getByRole('heading', { name: 'MOZILLA FIREFOX CLUB' })).toBeVisible();
  await expect(page.locator('#projects')).toBeAttached();
  await expect(page.locator('#events')).toBeAttached();
  await expect(page.locator('#team')).toBeAttached();
  await expect(page.locator('#contact form')).toBeAttached();
  await expect(page.locator('#end')).toContainText(String(new Date().getFullYear()));
});

test('still mode: the form falls back to mailto and the team switcher changes year', async ({ page }) => {
  test.setTimeout(120_000);
  await still(page, '&backend=down');
  const form = page.locator('#contact form');
  await form.scrollIntoViewIfNeeded();
  await form.locator('input[name="name"]').fill('Ada Lovelace');
  await form.locator('input[name="email"]').fill('ada@example.org');
  await form.locator('textarea[name="message"]').fill('hello from still mode');
  await form.locator('button[type="submit"]').click();
  await expect(page.locator('#contact [role="status"]').first()).toContainText("couldn't send. email us instead:");

  const radios = page.locator('#team input[type="radio"][name="board-year"]');
  expect(await radios.count()).toBeGreaterThan(1);
  const second = radios.nth(1);
  await second.scrollIntoViewIfNeeded();
  await second.check();
  await expect(second).toBeChecked();
  await expect(radios.first()).not.toBeChecked();
});

test('still mode keeps the living layer: console fox and Konami, but D needs the film', async ({ page }) => {
  test.setTimeout(120_000);
  const logs = [];
  page.on('console', (message) => logs.push(message.text()));
  await still(page);
  await expect.poll(() => logs.some((l) => l.includes("you opened the console. you're our kind of people."))).toBe(true);
  await page.mouse.click(5, 300);
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']) await page.keyboard.press(key);
  await expect(page.locator('canvas[data-stampede]')).toHaveCount(1);
  await page.keyboard.press('d');
  await page.waitForTimeout(300);
  await expect(page.locator('[data-directors-cut-hud]')).toHaveCount(0);
});

test('reduced motion chooses still mode', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.mode ?? null)).toBe('still');
  await expect(page.locator('[data-still]')).toHaveCount(9);
  await context.close();
});
