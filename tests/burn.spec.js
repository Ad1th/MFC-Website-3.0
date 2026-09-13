import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

/**
 * S08 accept:
 *   - works with blogs only, newsletters only, both, or neither (neither shows WE ALSO WRITE. and a
 *     link to Medium); no error screen ever
 *   - text contrast is at least 4.5:1 on the paper
 * Newsletters come from a test-only hook in test builds, since there is no backend in the suite.
 */

const blogs = JSON.parse(readFileSync(path.join(process.cwd(), 'src/content/generated/blogs.json'), 'utf8'));
const NEWSLETTERS = [
  { title: 'Test issue one', uploadDate: '2026-08-01', cover_url: 'https://example.invalid/one.png', pdf_link: 'https://example.invalid/one.pdf' },
  { title: 'Test issue two', uploadDate: '2026-07-01', cover_url: 'https://example.invalid/two.png', pdf_link: 'https://example.invalid/two.pdf' },
];

async function openWriting(page, query, { newsletters = null } = {}) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  if (newsletters) {
    await page.addInitScript((items) => {
      window.__filmTest = { shatter: null, newsletters: items };
    }, newsletters);
  }
  await page.goto(`/?tier=2&freeze=1&weather=clear${query}`);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.filmReady ?? null)).toBe('true');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ignition ?? null), { timeout: 20_000 }).toBe('done');
  await page.evaluate(() => window.__filmTest.scrollToScene('S08', 0.6));
  await expect.poll(() => page.evaluate(() => window.__filmTest.state().scene), { timeout: 20_000 }).toBe('S08');
  // Slots carry CSS-module class names, so select them by their data attributes.
  const panel = page.locator('[data-scene-index][data-active="true"] [data-region="writing"]');
  await expect(panel).toBeVisible();
  await expect.poll(() => panel.evaluate((el) => Number(getComputedStyle(el).opacity)), { timeout: 10_000 }).toBeGreaterThan(0.99);
  return { panel, errors };
}

const CASES = [
  { name: 'both', query: '', newsletters: NEWSLETTERS, posts: true, covers: 2 },
  { name: 'blogs only', query: '&newsletters=0', newsletters: null, posts: true, covers: 0 },
  { name: 'newsletters only', query: '&blogs=0', newsletters: NEWSLETTERS, posts: false, covers: 2 },
  { name: 'neither', query: '&blogs=0&newsletters=0', newsletters: null, posts: false, covers: 0 },
];

for (const c of CASES) {
  test(`S08 writing room works with ${c.name}`, async ({ page }) => {
    test.setTimeout(120_000);
    const { panel, errors } = await openWriting(page, c.query, { newsletters: c.newsletters });
    await expect(panel.getByRole('heading', { name: 'WE ALSO WRITE.' })).toBeVisible();
    await expect(panel.getByRole('link', { name: /all of it on medium/ })).toHaveAttribute('href', /medium\.com/);
    if (c.posts) await expect(panel.getByRole('link', { name: blogs[0].title })).toBeVisible();
    else await expect(panel.locator('article')).toHaveCount(0);
    await expect(panel.locator('ul[aria-label="newsletters"] li')).toHaveCount(c.covers);
    expect(errors).toEqual([]);
  });
}

test('S08 text on the paper has at least 4.5:1 contrast', async ({ page }) => {
  test.setTimeout(120_000);
  const { panel } = await openWriting(page, '', { newsletters: NEWSLETTERS });
  const worst = await panel.evaluate((root) => {
    const parse = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => {
      const f = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const paper = lum(parse(getComputedStyle(document.documentElement).getPropertyValue('--paper').trim().replace('#', '').match(/../g).map((h) => String(parseInt(h, 16))).join(',')));
    let min = Infinity;
    for (const el of root.querySelectorAll('h2, h3, p, a, time, span')) {
      if (!el.textContent.trim() || getComputedStyle(el).visibility === 'hidden') continue;
      const l = lum(parse(getComputedStyle(el).color));
      const ratio = (Math.max(l, paper) + 0.05) / (Math.min(l, paper) + 0.05);
      min = Math.min(min, ratio);
    }
    return min;
  });
  expect(worst).toBeGreaterThanOrEqual(4.5);
});
