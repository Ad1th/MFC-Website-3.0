import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

/**
 * S01 accept: the terminator matches the real time. With ?at= pinned and ?freeze=1 the
 * globe does not spin; S01 turns longitude 55°E toward the camera, east on the right.
 * Moments are chosen so the subsolar point is 90° either side of that centre:
 *   02:20 UTC on 13 Sep 2026: the sun is over 145°E, so the right side is day.
 *   14:20 UTC the same day: the sun is over 35°W, so the left side is day.
 * The hero page is taken away so only the globe is measured. Frames are saved for the gate.
 */

const OUT = path.resolve('director/frames/gate3-globe');
const CASES = [
  { at: '2026-09-13T02:20:00Z', lit: 'right' },
  { at: '2026-09-13T14:20:00Z', lit: 'left' },
];

for (const { at, lit } of CASES) {
  test(`the terminator puts day on the ${lit} at ${at}`, async ({ page, browserName }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/?tier=2&freeze=1&at=${at}`);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.filmReady ?? null)).toBe('true');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ignition ?? null)).toBe('done');
    await page.evaluate(() => {
      window.__filmTest.hidePage = true;
    });
    // Textures decode and the sun uniform updates once a second.
    await page.waitForTimeout(2500);
    const shot = await page.screenshot();
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, `${browserName}-${at.replace(/[:]/g, '')}.png`), shot);

    const { left, right } = await page.evaluate(async (b64) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      // Mean blue over a wide band on each side of the globe. Day land and ocean both carry
      // blue; the night side, its ember city lights and the fire rim carry almost none.
      const band = (x0, x1) => {
        const x = Math.round(bitmap.width * x0);
        const w = Math.round(bitmap.width * (x1 - x0));
        const y = Math.round(bitmap.height * 0.3);
        const h = Math.round(bitmap.height * 0.4);
        const { data } = ctx.getImageData(x, y, w, h);
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) sum += data[i + 2];
        return sum / (data.length / 4);
      };
      return { left: band(0.3, 0.47), right: band(0.53, 0.7) };
    }, shot.toString('base64'));

    console.log(`terminator ${browserName} ${at}: mean blue left ${left.toFixed(1)}, right ${right.toFixed(1)}`);
    if (lit === 'right') expect(right).toBeGreaterThan(left * 2);
    else expect(left).toBeGreaterThan(right * 2);
  });
}
