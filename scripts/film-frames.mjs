#!/usr/bin/env node
/**
 * Film frames for gates and reviews. Loads a test-hooks build (VITE_FOX_TEST_HOOKS=1),
 * freezes time, jumps to scene positions and saves screenshots.
 *
 *   VITE_FOX_TEST_HOOKS=1 npx vite build --outDir dist-test
 *   npx vite preview --outDir dist-test --port 4174
 *   node scripts/film-frames.mjs [--base http://localhost:4174] [--out director/frames/gate3-film]
 *        [--at 2026-09-13T06:30:00Z] [--points S01:0,S01:0.2,S02:0.05] [--every 10 --scenes S01,S02,S03]
 *        [--sizes desktop,phone] [--browser chromium]
 *
 * --every N captures a frame every N vh through the listed scenes (gate evidence).
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, firefox } from '@playwright/test';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};

const base = arg('base', 'http://localhost:4174');
const out = path.resolve(arg('out', 'director/frames/gate3-film'));
const at = arg('at', null);
const browserName = arg('browser', 'chromium');
const sizes = arg('sizes', 'desktop').split(',');
const every = Number(arg('every', 0));
const SIZE = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};

fs.mkdirSync(out, { recursive: true });
const browser = await (browserName === 'firefox' ? firefox : chromium).launch({ headless: false });

for (const sizeName of sizes) {
  const { isMobile, ...contextOptions } = SIZE[sizeName];
  const context = await browser.newContext(browserName === 'firefox' ? contextOptions : { ...contextOptions, isMobile });
  const page = await context.newPage();
  await page.goto(`${base}/?tier=2&freeze=1${at ? `&at=${at}` : ''}`);
  await page.waitForFunction(() => document.documentElement.dataset.filmReady === 'true', null, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2500);

  let points;
  if (every > 0) {
    const wanted = arg('scenes', 'S01,S02,S03').split(',');
    const scenes = await page.evaluate(() => window.__filmTest.layout());
    points = [];
    for (const scene of scenes.filter((s) => wanted.includes(s.id))) {
      for (let vh = 0; vh < scene.length; vh += every) points.push({ id: scene.id, progress: vh / scene.length, label: `${scene.id}-${String(scene.start + vh).padStart(4, '0')}vh` });
    }
  } else {
    points = arg('points', 'S01:0,S01:0.2,S01:0.6,S02:0.05')
      .split(',')
      .map((p) => {
        const [id, progress] = p.split(':');
        return { id, progress: Number(progress), label: `${id}-${progress}` };
      });
  }

  for (const point of points) {
    await page.evaluate(({ id, progress }) => window.__filmTest.scrollToScene(id, progress), point);
    // The camera snaps under freeze; give the frame loop and any texture uploads a moment.
    await page.waitForTimeout(350);
    const file = path.join(out, `${browserName}-${sizeName}-${point.label}.png`);
    await page.screenshot({ path: file });
    console.log(path.relative(process.cwd(), file));
  }
  await context.close();
}

await browser.close();
