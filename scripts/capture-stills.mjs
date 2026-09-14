#!/usr/bin/env node
/**
 * Still mode frames and the share image. Loads a test-hooks build at tier 3, freezes time, jumps
 * to one composed moment per scene and saves it as public/stills/Sxx.avif (1600x1000 and a
 * 800x1200 phone crop), then the S01 hero as public/og.jpg (1200x630).
 *
 *   VITE_FOX_TEST_HOOKS=1 npx vite build --outDir dist-test
 *   npx vite preview --outDir dist-test --port 4174
 *   node scripts/capture-stills.mjs [--base http://localhost:4174] [--only S01,S05]
 */
/* global window, document */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from '@playwright/test';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const base = arg('base', 'http://localhost:4174');
const only = arg('only', null)?.split(',') ?? null;
const out = path.resolve('public/stills');
fs.mkdirSync(out, { recursive: true });

/** The moment per scene that reads as that scene's poster (the gate hero frames). */
const MOMENTS = {
  S01: 0.62,
  S02: 0.3,
  S03: 0.55,
  S04: 0.5,
  S05: 0.5,
  S06: 0.12,
  S07: 0.92,
  S08: 0.5,
  S09: 0.45,
  S10: 0.9,
  S11: 0.9,
};

const SIZES = [
  { name: 'wide', viewport: { width: 1600, height: 1000 } },
  { name: 'tall', viewport: { width: 800, height: 1200 } },
];

const browser = await chromium.launch({ headless: false });
for (const size of SIZES) {
  const context = await browser.newContext({ viewport: size.viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${base}/?tier=3&freeze=1&weather=clear&visits=1`);
  await page.waitForFunction(() => document.documentElement.dataset.ignition === 'done', null, { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  // The film only: everything but the film's WebGL canvas (R3F marks it with data-engine) is hidden,
  // so no chrome, hero HUD, cursor or region text lands in the still; still mode lays real text over it.
  await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas[data-engine] { visibility: visible !important; }' });
  // The hero page is painted inside the film until S02's impact (D-061); its title and live HUD
  // (the viewer's timezone and clock) must not be baked into a still.
  await page.evaluate(() => {
    window.__filmTest.hidePage = true;
  });
  for (const [id, progress] of Object.entries(MOMENTS)) {
    if (only && !only.includes(id)) continue;
    await page.evaluate(([scene, p]) => window.__filmTest.scrollToScene(scene, p), [id, progress]);
    await page.waitForTimeout(3500);
    const png = await page.screenshot({ type: 'png' });
    const file = path.join(out, size.name === 'wide' ? `${id}.avif` : `${id}-tall.avif`);
    await sharp(png).avif({ quality: 52, effort: 6 }).toFile(file);
    console.log(path.relative(process.cwd(), file));
    if (id === 'S01' && size.name === 'wide') {
      await sharp(png).resize(1200, 630, { fit: 'cover', position: 'centre' }).jpeg({ quality: 84, mozjpeg: true }).toFile(path.resolve('public/og.jpg'));
      console.log('public/og.jpg');
    }
  }
  await context.close();
}
await browser.close();
