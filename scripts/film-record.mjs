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

/** Scroll position in px at a scene's progress, from the film's own layout. */
function offsetOf(page, id, progress) {
  return page.evaluate(
    ([sceneId, p]) => {
      const scenes = window.__filmTest.layout();
      const total = scenes[scenes.length - 1].start + scenes[scenes.length - 1].length;
      const s = scenes.find((scene) => scene.id === sceneId);
      const range = document.documentElement.scrollHeight - window.innerHeight;
      return ((s.start + s.length * p) / total) * range;
    },
    [id, progress],
  );
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
  continuous: async (page) => wheelTo(page, await offsetOf(page, 'S03', 1), 26000),
  fast: async (page) => wheelTo(page, await offsetOf(page, 'S03', 1), 4000),
  reverse: async (page) => {
    await page.evaluate(() => window.__filmTest.scrollToScene('S03', 0.99));
    await page.waitForTimeout(1500);
    await wheelTo(page, 0, 16000);
  },
  bullet: async (page) => {
    await page.evaluate(() => window.__filmTest.scrollToScene('S01', 0.46));
    await page.waitForTimeout(1500);
    await wheelTo(page, await offsetOf(page, 'S01', 0.84), 9000);
    await wheelTo(page, await offsetOf(page, 'S01', 0.5), 6000);
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
