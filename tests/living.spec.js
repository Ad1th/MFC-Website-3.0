import { test, expect } from '@playwright/test';

/**
 * The living layer: the console fox and its commands, the tab when hidden and back, the ember
 * cursor on fine pointers, and typing "fox". Visibility is simulated by overriding
 * document.hidden and firing visibilitychange, since a test page cannot really lose focus.
 */

async function ready(page, query = '') {
  await page.goto(`/?tier=2&freeze=1&weather=clear${query}`);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.filmReady ?? null)).toBe('true');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ignition ?? null), { timeout: 20_000 }).toBe('done');
}

test('the console prints the fox and its three lines, and nothing else goes wrong', async ({ page }) => {
  test.setTimeout(120_000);
  const logs = [];
  const problems = [];
  page.on('console', (message) => {
    if (message.type() === 'log') logs.push(message.text());
    if (message.type() === 'error' || message.type() === 'warning') problems.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  await ready(page);
  const intro = logs.find((l) => l.includes("you opened the console. you're our kind of people."));
  expect(intro).toBeTruthy();
  expect(intro).toContain('type fox.run() to let it loose.');
  expect(intro).toContain('type join() to apply.');
  expect(await page.evaluate(() => typeof window.fox.run === 'function' && typeof window.fox.pet === 'function' && typeof window.join === 'function')).toBe(true);

  await page.evaluate(() => window.fox.pet());
  await expect.poll(() => logs.some((l) => /^pets today: \d+$/.test(l))).toBe(true);

  await page.evaluate(() => window.fox.run());
  await expect.poll(() => page.evaluate(() => document.querySelectorAll('body > div[aria-hidden="true"] canvas').length), { timeout: 15_000 }).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => document.querySelectorAll('body > div[aria-hidden="true"] canvas').length), { timeout: 15_000 }).toBe(0);

  // Only WebGL driver chatter from headless GPU emulation is tolerated; the site itself says nothing.
  expect(problems.filter((p) => !/GPU stall|WebGL|GL Driver|ReadPixels/i.test(p))).toEqual([]);
});

test('leaving the tab sets the waiting title, pauses the film, and a long absence puts the fox to sleep', async ({ page }) => {
  test.setTimeout(120_000);
  await ready(page);
  await page.evaluate(() => window.__filmTest.scrollToScene('S02', 0.5));
  const title = await page.title();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page).toHaveTitle('the fox is waiting.');
  // Pretend 31 seconds went by, then come back.
  await page.evaluate(() => {
    const now = performance.now();
    const real = performance.now.bind(performance);
    performance.now = () => real() + 31_000;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
    return now;
  });
  await expect(page).toHaveTitle(title);
});

test('the ember cursor replaces the pointer on a fine pointer', async ({ page }) => {
  test.setTimeout(120_000);
  await ready(page);
  expect(await page.evaluate(() => document.documentElement.dataset.cursor)).toBe('ember');
  expect(await page.evaluate(() => getComputedStyle(document.body).cursor)).toBe('none');
});

test('press and hold on the fox pets it in the film, and letting go stops', async ({ page }) => {
  test.setTimeout(120_000);
  await ready(page);
  await page.evaluate(() => window.__filmTest.scrollToScene('S01', 0.62));
  // Wait for the jump to land and the head's screen position to settle (slower engines report the
  // pre-scroll position for a few frames).
  await expect.poll(() => page.evaluate(() => Math.abs(window.__filmTest.state().sceneProgress - 0.62) < 0.01)).toBe(true);
  let screen = null;
  await expect
    .poll(
      async () => {
        const next = await page.evaluate(() => window.__filmTest.foxPress?.().screen ?? null);
        const settled = Boolean(next && screen && Math.hypot(next.x - screen.x, next.y - screen.y) < 1);
        screen = next;
        return settled;
      },
      { timeout: 15_000, intervals: [250] },
    )
    .toBe(true);
  await page.mouse.move(screen.x, screen.y);
  await page.mouse.down();
  await expect.poll(() => page.evaluate(() => window.__filmTest.foxPress().petting)).toBe(true);
  expect(await page.evaluate(() => window.__filmTest.foxPress().petUntil > performance.now())).toBe(true);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__filmTest.foxPress().petting)).toBe(false);
});
