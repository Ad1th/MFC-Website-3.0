#!/usr/bin/env node
/* global window -- used inside page.evaluate callbacks, which run in the browser */
/**
 * Gate 2 motion evidence: one short video per mood and behaviour, recorded from
 * the fox sandbox with Playwright's recordVideo. Headed Chromium, so the GPU is
 * real. Needs a running server:
 *   npx vite build && npx vite preview --port 4199
 *   node scripts/fox-record.mjs [--base http://localhost:4199] [--approach C] [--only name,name]
 * Output: director/frames/gate2-video/<clip>.webm
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'director/frames/gate2-video');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const base = arg('base', 'http://localhost:4199');
const approach = arg('approach', 'C');
const only = arg('only', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const SIZE = { width: 1280, height: 720 };

const wait = (page, ms) => page.waitForTimeout(ms);
const fox = (page, fn, ...args) => page.evaluate(([f, a]) => window.__fox[f](...a), [fn, args]);

/** Trigger a behaviour three times across the clip so it can't be missed. */
const repeat = (name, opts = {}) => async (page) => {
  for (let i = 0; i < 3; i += 1) {
    await wait(page, 900);
    await fox(page, 'trigger', name, opts, true);
    await wait(page, 1300);
  }
};

async function screen(page) {
  return page.evaluate(() => window.__fox.screen());
}

const CLIPS = [
  { name: 'trot', query: 'shot=hero&velocity=500', run: (p) => wait(p, 6000) },
  { name: 'sprint', query: 'shot=hero&velocity=1800', run: (p) => wait(p, 6000) },
  {
    name: 'overtake',
    query: 'shot=hero&velocity=900',
    run: async (p) => {
      await wait(p, 1200);
      await fox(p, 'setVelocity', 3400);
      await wait(p, 2600);
      await fox(p, 'setVelocity', 0);
      await wait(p, 3200);
    },
  },
  { name: 'sit', query: 'shot=hero&velocity=0&mood=sit', run: (p) => wait(p, 6500) },
  { name: 'lie', query: 'shot=hero&velocity=0&mood=lie', run: (p) => wait(p, 6500) },
  {
    name: 'sleep',
    query: 'shot=hero&velocity=0&mood=sleep',
    run: async (p) => {
      await wait(p, 2500);
      await fox(p, 'trigger', 'pawTwitch', {}, true);
      await wait(p, 3000);
      await fox(p, 'trigger', 'pawTwitch', {}, true);
      await wait(p, 2000);
    },
  },
  {
    name: 'startle',
    query: 'shot=hero&velocity=0&idle=25',
    run: async (p) => {
      await wait(p, 3000);
      await fox(p, 'setIdle', null);
      await fox(p, 'setVelocity', 900);
      await wait(p, 3500);
    },
  },
  { name: 'tilt', query: 'shot=face&velocity=0', run: repeat('tilt', { dir: 1 }) },
  { name: 'blink', query: 'shot=face&velocity=0', run: repeat('blink') },
  { name: 'earFlick', query: 'shot=face&velocity=0', run: repeat('earFlick', { side: 1 }) },
  { name: 'sneeze', query: 'shot=face&velocity=0', run: repeat('sneeze') },
  { name: 'playBow', query: 'shot=hero&velocity=0', run: repeat('playBow') },
  { name: 'shakeOff', query: 'shot=hero&velocity=0', run: repeat('shakeOff') },
  { name: 'yawn', query: 'shot=face&velocity=0', run: repeat('yawn') },
  { name: 'wag', query: 'shot=tail&velocity=0', run: repeat('wag', { intensity: 1 }) },
  { name: 'tailThump', query: 'shot=tail&velocity=0&mood=sit', run: repeat('tailThump') },
  { name: 'tuckTail', query: 'shot=tail&velocity=0', run: repeat('tuckTail') },
  { name: 'offended', query: 'shot=face&velocity=0', run: repeat('offended') },
  {
    name: 'pounce',
    query: 'shot=hero&velocity=0',
    run: async (p) => {
      for (let i = 0; i < 2; i += 1) {
        await wait(p, 1200);
        const s = await screen(p);
        await p.mouse.click(s.body.x - s.radius * 0.9, s.body.y + s.radius * 0.35);
        await wait(p, 2000);
      }
    },
  },
  {
    name: 'lookAt',
    query: 'shot=face&velocity=0',
    run: async (p) => {
      const s = await screen(p);
      const points = [
        [s.head.x + 90, s.head.y - 60],
        [s.head.x - 80, s.head.y - 40],
        [s.head.x + 40, s.head.y + 70],
      ];
      for (const [x, y] of points) {
        await p.mouse.move(x, y, { steps: 12 });
        await wait(p, 2000);
      }
    },
  },
  {
    name: 'leanInto',
    query: 'shot=hero&velocity=0',
    run: async (p) => {
      await wait(p, 1000);
      const s = await screen(p);
      await p.mouse.move(s.body.x, s.body.y);
      await p.mouse.down();
      await wait(p, 2600);
      await p.mouse.up();
      await wait(p, 2200);
    },
  },
  {
    name: 'chasePlay',
    query: 'shot=hero&velocity=0',
    run: async (p) => {
      await wait(p, 800);
      const s = await screen(p);
      for (let i = 0; i < 40; i += 1) {
        const x = s.head.x + (i % 2 ? 70 : -70);
        await p.mouse.move(x, s.head.y + 20, { steps: 3 });
        await wait(p, 70);
      }
      await wait(p, 2500);
    },
  },
];

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: false });
  for (const clip of CLIPS) {
    if (only.length && !only.includes(clip.name)) continue;
    const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: outDir, size: SIZE } });
    const page = await context.newPage();
    await page.goto(`${base}/?sandbox=fox&approach=${approach}&tier=2&bloom=1&panel=0&${clip.query}`);
    await page.bringToFront();
    await page.waitForFunction(() => Boolean(window.__fox && window.__fox.screen && window.__fox.screen()), null, { timeout: 30000 });
    await wait(page, 1500);
    await clip.run(page);
    const video = page.video();
    await context.close();
    const target = path.join(outDir, `${clip.name}.webm`);
    await video.saveAs(target);
    await video.delete();
    console.log(`recorded ${clip.name}`);
  }
  await browser.close();
}

main().catch((err) => {
  console.error(`fox-record: ${err.message}`);
  process.exit(1);
});
