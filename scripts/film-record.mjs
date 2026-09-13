#!/usr/bin/env node
/* global window, document */
/**
 * Gate videos of the film (headed Chromium, recordVideo). Uses a test-hooks build.
 *
 *   node scripts/film-record.mjs [--base http://localhost:4174] [--out director/frames/gate3-video]
 *        [--only continuous,fast,reverse,bullet,jump,scrub] [--size desktop|phone]
 *        [--from S01:0] [--to S03:1] [--rail 2] [--scrub-scene S04] [--scrub-range 0.8,1]
 *
 *   continuous  wheel-scroll from --from to --to at a steady reading pace
 *   fast        the same span flung in about four seconds
 *   reverse     from --to back to --from
 *   bullet      S01 bullet time scrubbed slowly, then scrubbed back
 *   jump        chapter rail jump (button --rail) from the start point
 *   scrub       --scrub-scene scrubbed slowly across --scrub-range and back (live, for moments a
 *               frozen frame cannot show, such as the fox's head tilts)
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
const point = (text) => {
  const [id, progress] = text.split(':');
  return [id, Number(progress)];
};
const FROM = point(arg('from', 'S01:0'));
const TO = point(arg('to', 'S03:1'));
const RAIL = Number(arg('rail', '2'));
const SCRUB_SCENE = arg('scrub-scene', 'S04');
const SCRUB_RANGE = arg('scrub-range', '0.8,1').split(',').map(Number);

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

/** Scrub a scene through the film's own hook in 60 ms steps (Lenis-free, so it lands exactly). */
async function scrubScene(page, scene, from, to, ms) {
  const steps = Math.max(1, Math.round(ms / 60));
  for (let i = 0; i <= steps; i += 1) {
    const p = from + ((to - from) * i) / steps;
    await page.evaluate(([id, value]) => window.__filmTest.scrollToScene(id, value), [scene, p]);
    await page.waitForTimeout(60);
  }
}

const CLIPS = {
  continuous: async (page) => wheelTo(page, offsetOf(...TO), 26000),
  fast: async (page) => wheelTo(page, offsetOf(...TO), 4000),
  reverse: async (page) => {
    await page.evaluate(([id, p]) => window.__filmTest.scrollToScene(id, Math.min(p, 0.99)), TO);
    await page.waitForTimeout(1500);
    await wheelTo(page, offsetOf(...FROM), 16000);
  },
  scrub: async (page) => {
    const [a, b] = SCRUB_RANGE;
    await scrubScene(page, SCRUB_SCENE, a, a, 1000);
    await scrubScene(page, SCRUB_SCENE, a, b, 12000);
    await page.waitForTimeout(1500);
    await scrubScene(page, SCRUB_SCENE, b, a, 8000);
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
    const rail = page.locator('nav[aria-label="chapters"] button').nth(RAIL);
    await rail.click();
    await page.waitForTimeout(4000);
  },
};

fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: false });
await measureTargets(browser, [FROM, TO]);
for (const name of only) {
  const clip = CLIPS[name];
  if (!clip) continue;
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: out, size: SIZE } });
  const page = await context.newPage();
  await page.goto(`${base}/?tier=2&weather=clear`);
  await page.bringToFront();
  await ready(page);
  // Clips that start mid-film begin at --from (the cold open when it is S01:0).
  if (name !== 'bullet' && (FROM[0] !== 'S01' || FROM[1] !== 0)) {
    await page.evaluate(([id, p]) => window.__filmTest.scrollToScene(id, p), FROM);
    await page.waitForTimeout(1500);
  }
  await clip(page);
  const video = page.video();
  await context.close();
  const file = path.join(out, `${name}-${sizeName}.webm`);
  await video.saveAs(file);
  await video.delete();
  console.log(path.relative(process.cwd(), file));
}
await browser.close();
