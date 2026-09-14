import { test, expect } from '@playwright/test';

/**
 * Keyboard only. "Skip the film" is the first thing Tab reaches; focusing into a scene's region
 * brings that scene on screen with its HTML painted; the contact form can be filled and sent
 * without a pointer; the 404's link is reachable. Still mode is fully tabbable in reading order.
 */

async function film(page) {
  await page.goto('/?tier=2&freeze=1&weather=clear');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ignition ?? null), { timeout: 30_000 }).toBe('done');
}

const focused = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return { tag: el?.tagName ?? null, text: (el?.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60), region: el?.closest('[data-region]')?.getAttribute('data-region') ?? null };
  });

test('the first Tab stop is "skip the film"', async ({ page }) => {
  test.setTimeout(120_000);
  await film(page);
  await page.keyboard.press('Tab');
  const first = await focused(page);
  expect(first.text.toLowerCase()).toContain('skip the film');
});

test('keyboard focus inside a scene brings it on screen with its HTML painted', async ({ page }) => {
  test.setTimeout(120_000);
  await film(page);
  // Tab until focus lands inside the projects region.
  let at = null;
  for (let i = 0; i < 120; i += 1) {
    await page.keyboard.press('Tab');
    at = await focused(page);
    if (at.region === 'projects') break;
  }
  expect(at?.region).toBe('projects');
  await expect.poll(() => page.evaluate(() => window.__filmTest.state().scene)).toBe('S06');
  // The focused element is visible (built panels paint while they hold focus).
  const box = await page.evaluate(() => {
    const r = document.activeElement.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, h: window.innerHeight };
  });
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.bottom).toBeLessThanOrEqual(box.h);
});

test('the contact form works with the keyboard alone', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?still=1&backend=down');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.mode ?? null)).toBe('still');
  let at = null;
  for (let i = 0; i < 400; i += 1) {
    await page.keyboard.press('Tab');
    at = await page.evaluate(() => document.activeElement?.getAttribute('name'));
    if (at === 'name') break;
  }
  expect(at).toBe('name');
  await page.keyboard.type('Ada Lovelace');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('name'))).toBe('email');
  await page.keyboard.type('ada@example.org');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('name'))).toBe('message');
  await page.keyboard.type('hello from the keyboard');
  await page.keyboard.press('Enter');
  await expect(page.locator('#contact [role="status"]').first()).toContainText("couldn't send. email us instead:");
});

test('still mode tabs through every link and control in reading order without traps', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?still=1');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.mode ?? null)).toBe('still');
  const expected = await page.evaluate(
    () => [...document.querySelectorAll('a[href], button:not([disabled]), input:not([type="hidden"]):not([tabindex="-1"]), textarea, select')].filter((el) => el.offsetParent !== null || el.getClientRects().length).length,
  );
  // The still page carries every link: socials, projects, events, 80+ members' profiles, the form.
  expect(expected).toBeGreaterThan(150);
  const seen = new Set();
  let previousTop = -Infinity;
  let backwards = 0;
  for (let i = 0; i < expected + 20; i += 1) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      el.dataset.kbSeen ??= String(Math.random());
      const r = el.getBoundingClientRect();
      return { id: el.dataset.kbSeen, top: r.top + window.scrollY };
    });
    if (!info) break;
    if (seen.has(info.id)) break;
    seen.add(info.id);
    // Reading order: focus never jumps far back up the page.
    if (info.top < previousTop - 400) backwards += 1;
    previousTop = info.top;
  }
  expect(seen.size).toBeGreaterThan(expected * 0.9);
  expect(backwards).toBe(0);
});

test('the 404 link is reachable by keyboard', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/no-such-page');
  let text = '';
  for (let i = 0; i < 10; i += 1) {
    await page.keyboard.press('Tab');
    text = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
    if (text === 'take me home') break;
  }
  expect(text).toBe('take me home');
});
