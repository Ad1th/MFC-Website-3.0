import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

/**
 * S02 risk R1: the frame before impact (the intact hero page) and the frame at impact
 * (the same page as Voronoi shards, all still in place) must be the same pixels, so
 * the break has no visible jump. Any crack, overlap or UV error in the shard tiling
 * shows up here. ?freeze=1 stops time-based motion so the two screenshots differ only
 * by the swap, which is forced through window.__filmTest.shatter just before impact. The pixel compare
 * runs in a blank page's 2D canvas (PNG decode is lossless, and sharp does not load
 * under Playwright's module loader).
 */

const SIZES = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  { name: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 },
];

const OUT = path.resolve('director/frames/gate3-shatter');

async function frames(page, count) {
  await page.evaluate((n) => new Promise((resolve) => {
    let left = n;
    const step = () => (--left <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  }), count);
}

/** Decode both PNGs in a blank page and count differing pixels; returns a diff mask PNG. */
async function compare(browser, before, after) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const result = await page.evaluate(
    async ([a64, b64]) => {
      const load = async (b) => createImageBitmap(await (await fetch(`data:image/png;base64,${b}`)).blob());
      const [ia, ib] = await Promise.all([load(a64), load(b64)]);
      const read = (img) => {
        const c = new OffscreenCanvas(img.width, img.height);
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height);
      };
      const a = read(ia);
      const b = read(ib);
      if (a.width !== b.width || a.height !== b.height) return { sizeMismatch: true, width: a.width, height: a.height };
      const mask = new ImageData(a.width, a.height);
      let diff = 0;
      let maxDelta = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        const delta = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
        if (delta > 0) {
          diff += 1;
          maxDelta = Math.max(maxDelta, delta);
          mask.data[i] = 255;
        } else {
          mask.data[i] = a.data[i] >> 2;
          mask.data[i + 1] = a.data[i + 1] >> 2;
          mask.data[i + 2] = a.data[i + 2] >> 2;
        }
        mask.data[i + 3] = 255;
      }
      const c = new OffscreenCanvas(a.width, a.height);
      c.getContext('2d').putImageData(mask, 0, 0);
      const blob = await c.convertToBlob({ type: 'image/png' });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { width: a.width, height: a.height, diff, maxDelta, mask: btoa(bin) };
    },
    [before.toString('base64'), after.toString('base64')],
  );
  await context.close();
  return result;
}

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: size.viewport, deviceScaleFactor: size.deviceScaleFactor });

    test(`the intact page hands over to its shards with no pixel change at ${size.viewport.width}x${size.viewport.height}`, async ({ page, browser, browserName }) => {
      // Mocked weather resolves at once; live weather could land between the two screenshots.
      await page.goto('/?tier=2&freeze=1&weather=clear');
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.filmReady ?? null)).toBe('true');
      // The cover streams real assets and counts real frames; allow for a loaded machine.
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.ignition ?? null), { timeout: 20_000 })
        .toBe('done');
      await page.evaluate(() => document.fonts.ready);
      await expect.poll(() => page.evaluate(() => document.querySelector('canvas[data-ready]') !== null)).toBe(true);
      // The HUD redraws when the weather resolves; compare only after that.
      await expect.poll(() => page.evaluate(() => document.querySelector('canvas[data-weather="settled"]') !== null)).toBe(true);

      await page.evaluate(() => window.__filmTest.scrollToScene('S02', 0.05));
      await expect.poll(() => page.evaluate(() => window.__filmTest.state().scene)).toBe('S02');
      // Let the logo decode, the hero redraw and the texture upload settle.
      await page.waitForTimeout(800);

      await page.evaluate(() => {
        window.__filmTest.shatter = false;
      });
      await frames(page, 4);
      const before = await page.screenshot({ animations: 'disabled', caret: 'hide' });
      const beforeState = await page.evaluate(() => window.__filmTest.breakState());

      await page.evaluate(() => {
        window.__filmTest.shatter = true;
      });
      await frames(page, 4);
      const after = await page.screenshot({ animations: 'disabled', caret: 'hide' });
      const afterState = await page.evaluate(() => window.__filmTest.breakState());

      expect(beforeState).toMatchObject({ intact: true, t: 0, visible: true });
      expect(afterState).toMatchObject({ intact: false, t: 0, visible: true });

      const result = await compare(browser, before, after);
      expect(result.sizeMismatch ?? false).toBe(false);

      fs.mkdirSync(OUT, { recursive: true });
      const stem = `${browserName}-${size.viewport.width}x${size.viewport.height}`;
      fs.writeFileSync(path.join(OUT, `${stem}-before.png`), before);
      fs.writeFileSync(path.join(OUT, `${stem}-after.png`), after);
      fs.writeFileSync(path.join(OUT, `${stem}-diff.png`), Buffer.from(result.mask, 'base64'));
      console.log(`shatter swap ${stem}: ${result.width}x${result.height} device px, ${result.diff} differing pixels, max channel delta ${result.maxDelta}`);

      expect(result.diff).toBe(0);
    });
  });
}
