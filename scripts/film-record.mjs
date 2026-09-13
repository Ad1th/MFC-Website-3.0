#!/usr/bin/env node
/* global window, document */
/**
 * Gate videos of the film (headed Chromium, recordVideo). Uses a test-hooks build.
 *
 *   node scripts/film-record.mjs [--base http://localhost:4174] [--out director/frames/gate3-video]
 *        [--only continuous,fast,reverse,bullet,jump] [--size desktop|phone]
 *
 *   continuous  wheel-scroll S01 to S03 at a steady reading pace
 *   fast        the same span flung in about four seconds
 *   reverse     from the end of S03 back to the top
 *   bullet      S01 bullet time scrubbed slowly, then scrubbed back
 *   jump        chapter rail jump from the cold open to the dive
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};

const base = arg('base', 'http://localhost:4174');
const out = path.resolve(arg('out', 'director/frames/gate3-video'));
const only = arg('only', 'continuous,fast,reverse,bullet,jump').split(',');
const sizeName = arg('size', 'desktop');
const SIZE = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } }[sizeName];

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.dataset.filmReady === 'true' && document.documentElement.dataset.ignition === 'done', null, { timeout: 60000 });
  await page.waitForTimeout(1200);
}

/**
 * Scroll targets in px, measured once before recording in a throwaway page: jump there with the
 * test hook (Lenis-aware) and read scrollY. Measuring inside the clip meant jumping away and
 * back with window.scrollTo, which Lenis does not track, so later wheel steps started from the
 * wrong place (the bullet clip fell back to the wide shot). Computing it from the document's
 * scroll height overshot into S02, because the film maps progress through its track.
 */
const targets = new Map();

async function measureTargets(browser, points) {
  const context = await browser.newContext({ viewport: SIZE });
  const page = await context.newPage();
  await page.goto(`${base}/?tier=2&weather=clear`);
  await ready(page);
  for (const [id, progress] of points) {
    await page.evaluate(([sceneId, p]) => window.__filmTest.scrollToScene(sceneId, p), [id, progress]);
    await page.waitForTimeout(150);
    targets.set(`${id}:${progress}`, await page.evaluate(() => window.scrollY));
  }
  await context.close();
}

function offsetOf(id, progress) {
  const value = targets.get(`${id}:${progress}`);
  if (value === undefined) throw new Error(`target ${id}:${progress} was not measured`);
  return value;
}

/** Wheel from the current position to a target in px over roughly `ms`. */
async function wheelTo(page, target, ms) {
  const from = await page.evaluate(() => window.scrollY);
  const steps = Math.max(1, Math.round(ms / 16));
  const delta = (target - from) / steps;
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(900);
}

const CLIPS = {
  continuous: async (page) => wheelTo(page, offsetOf('S03', 1), 26000),
  fast: async (page) => wheelTo(page, offsetOf('S03', 1), 4000),
  reverse: async (page) => {
    await page.evaluate(() => window.__filmTest.scrollToScene('S03', 0.99));
    await page.waitForTimeout(1500);
    await wheelTo(page, 0, 16000);
  },
  // Bullet time is scrubbed through the film's own hook, not the wheel: Lenis keeps easing after
  // each wheel step, so wheel targets overshot into S02's shatter and back past the cold open.
  bullet: async (page) => {
    const scrub = async (from, to, ms) => {
      const steps = Math.max(1, Math.round(ms / 60));
      for (let i = 0; i <= steps; i += 1) {
        const p = from + ((to - from) * i) / steps;
        await page.evaluate((value) => window.__filmTest.scrollToScene('S01', value), p);
        await page.waitForTimeout(60);
      }
    };
    await scrub(0.46, 0.46, 1500);
    await scrub(0.46, 0.84, 9000);
    await page.waitForTimeout(800);
    await scrub(0.84, 0.5, 6000);
    await page.waitForTimeout(800);
  },
  jump: async (page) => {
    await page.waitForTimeout(1200);
    const rail = page.locator('nav[aria-label="chapters"] button').nth(2);
    await rail.click();
    await page.waitForTimeout(4000);
  },
};

fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: false });
await measureTargets(browser, [['S03', 1]]);
for (const name of only) {
  const clip = CLIPS[name];
  if (!clip) continue;
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: out, size: SIZE } });
  const page = await context.newPage();
  await page.goto(`${base}/?tier=2&weather=clear`);
  await page.bringToFront();
  await ready(page);
  await clip(page);
  const video = page.video();
  await context.close();
  const file = path.join(out, `${name}-${sizeName}.webm`);
  await video.saveAs(file);
  await video.delete();
  console.log(path.relative(process.cwd(), file));
}
await browser.close();
