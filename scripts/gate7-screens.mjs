#!/usr/bin/env node
/**
 * Gate 7 screenshots at 390x844, 768x1024, 1440x900 and 1920x1080: the film at one moment per
 * scene (frozen, test-hooks build) and still mode top to bottom (a screen per frame).
 *
 *   node scripts/gate7-screens.mjs [--base http://localhost:4174] [--out director/frames/gate7-screens]
 */
/* global window, document */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const base = arg('base', 'http://localhost:4174');
const out = path.resolve(arg('out', 'director/frames/gate7-screens'));
fs.mkdirSync(out, { recursive: true });

const SIZES = [
  { name: '390x844', viewport: { width: 390, height: 844 }, mobile: true, scale: 3 },
  { name: '768x1024', viewport: { width: 768, height: 1024 }, mobile: true, scale: 2 },
  { name: '1440x900', viewport: { width: 1440, height: 900 }, mobile: false, scale: 1 },
  { name: '1920x1080', viewport: { width: 1920, height: 1080 }, mobile: false, scale: 1 },
];
const MOMENTS = { S01: 0.3, S02: 0.3, S03: 0.55, S04: 0.5, S05: 0.5, S06: 0.12, S07: 0.5, S08: 0.5, S09: 0.45, S10: 0.9, S11: 0.9 };

const browser = await chromium.launch({ headless: false });
for (const size of SIZES) {
  const contextOptions = { viewport: size.viewport, deviceScaleFactor: size.scale, hasTouch: size.mobile, isMobile: size.mobile };
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  await page.goto(`${base}/?tier=${size.mobile ? 1 : 2}&freeze=1&weather=clear&visits=1`);
  await page.waitForFunction(() => document.documentElement.dataset.ignition === 'done', null, { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  for (const [id, progress] of Object.entries(MOMENTS)) {
    await page.evaluate(([scene, p]) => window.__filmTest.scrollToScene(scene, p), [id, progress]);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(out, `${size.name}-film-${id}.png`) });
  }

  await page.goto(`${base}/?still=1`);
  await page.waitForFunction(() => document.documentElement.dataset.mode === 'still');
  await page.addStyleTag({ content: '[data-region] > * { opacity: 1 !important; transition: none !important; }' });
  const frames = await page.evaluate(() => [...document.querySelectorAll('[data-still], [aria-hidden="true"] > picture')].length);
  const ids = await page.evaluate(() => [...document.querySelectorAll('[data-still]')].map((el) => el.dataset.still));
  for (const sid of ids) {
    await page.evaluate((s) => document.querySelector(`[data-still="${s}"]`).scrollIntoView({ block: 'start' }), sid);
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(out, `${size.name}-still-${sid}.png`) });
  }
  console.log(`${size.name}: ${Object.keys(MOMENTS).length} film, ${ids.length} still (${frames} frames)`);
  await context.close();
}
await browser.close();
