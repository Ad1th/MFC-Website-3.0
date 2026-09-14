import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Automated accessibility checks (axe, WCAG 2.2 A and AA). Still mode is the full reading of the
 * site and must be clean. In film mode the built scenes' region HTML is deliberately unpainted
 * (the film shows it) until keyboard focus paints it, so colour contrast is not measured on
 * those panels; everything else is. The 404 too. Findings are printed so a run doubles as a report.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

function report(name, violations) {
  for (const v of violations) {
    console.log(`[axe ${name}] ${v.impact} ${v.id}: ${v.help} (${v.nodes.length})`);
    for (const node of v.nodes.slice(0, 3)) console.log(`    ${node.target.join(' ')}`);
  }
}

test('still mode has no accessibility violations', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?still=1');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.mode ?? null)).toBe('still');
  // Show every frame (they fade in as they enter) so contrast is measured on the settled page.
  await page.addStyleTag({ content: '[data-region] > * { opacity: 1 !important; transition: none !important; }' });
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  report('still', violations);
  expect(violations.map((v) => v.id)).toEqual([]);
});

test('film mode has no accessibility violations outside the unpainted panels', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?tier=2&freeze=1&weather=clear');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ignition ?? null), { timeout: 30_000 }).toBe('done');
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const relevant = violations
    .map((v) => (v.id === 'color-contrast' ? { ...v, nodes: v.nodes.filter((n) => !n.target.join(' ').includes('data-built')) } : v))
    .filter((v) => v.nodes.length > 0);
  // Contrast inside unpainted built panels is by design (transparent text over the film).
  const unpainted = await page.evaluate(() => document.querySelectorAll('[data-built="true"]').length);
  expect(unpainted).toBeGreaterThan(0);
  const filtered = relevant.filter((v) => v.id !== 'color-contrast' || v.nodes.some((n) => !n.html.includes('color: transparent')));
  report('film', filtered);
  expect(filtered.map((v) => v.id)).toEqual([]);
});

test('the 404 has no accessibility violations', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  report('404', violations);
  expect(violations.map((v) => v.id)).toEqual([]);
});
