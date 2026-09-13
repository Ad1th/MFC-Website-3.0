import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

/**
 * S06 accept: all five names, taglines and links are correct. Scrolls to each slab's spin and
 * checks the HUD against projects.json, including the link's target and rel, and that the slab's
 * mini-world is mounted for the dive (desktop dives every slab).
 */

const projects = JSON.parse(readFileSync(path.join(process.cwd(), 'src/content/projects.json'), 'utf8'));

test('S06 shows each project with its own name, tagline, stack and link', async ({ page }) => {
  // Five slabs, each loading its world on the way: well past the default 60 s on a busy machine.
  test.setTimeout(240_000);
  await page.goto('/?tier=2&freeze=1&weather=clear');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.filmReady ?? null)).toBe('true');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ignition ?? null), { timeout: 20_000 }).toBe('done');

  const total = String(projects.length).padStart(2, '0');
  for (const [i, project] of projects.entries()) {
    await page.evaluate((p) => window.__filmTest.scrollToScene('S06', p), (i + 0.25) / projects.length);
    await expect.poll(() => page.evaluate(() => window.__filmTest.state().scene), { timeout: 20_000 }).toBe('S06');
    await expect.poll(() => page.evaluate(() => window.__filmTest.gallery?.().index ?? -1), { timeout: 20_000 }).toBe(i);

    const hud = page.locator('[data-gallery-hud]');
    await expect(hud.locator('[data-field="count"]')).toHaveText(`${project.number} / ${total}`);
    await expect(hud.locator('[data-field="name"]')).toHaveText(project.name);
    await expect(hud.locator('[data-field="tagline"]')).toHaveText(project.tagline);
    await expect(hud.locator('[data-field="stack"]')).toHaveText(project.stack.join('  '));
    const link = hud.locator('[data-field="link"]');
    await expect(link).toHaveAttribute('href', project.link);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(link).toHaveText(`${project.linkType} ↗`);
    await expect.poll(() => page.evaluate(() => window.__filmTest.gallery().world)).toBe(i);
  }
});
