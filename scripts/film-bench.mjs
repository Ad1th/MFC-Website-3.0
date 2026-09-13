#!/usr/bin/env node
/* global window, document */
/**
 * Frame times through the film, scene by scene (headed, so the GPU and vsync are real).
 * Uses a test-hooks build with ?debug, parks the scroll at each point, warms up, then samples
 * window.__film.stats(): fps, 1% low, CPU and GPU frame ms (avg and p95), draw calls.
 *
 *   node scripts/film-bench.mjs [--base http://localhost:4174] [--tiers 2,3]
 *        [--browsers chromium,firefox] [--points S01:0.2,S01:0.6,S02:0.3,S03:0.2,S03:0.5,S03:0.9]
 *        [--tag gate3-film] [--throttle 4]
 *
 * Writes director/frames/<tag>-bench.json and prints a markdown table.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, firefox } from '@playwright/test';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};

const base = arg('base', 'http://localhost:4174');
const tiers = arg('tiers', '2').split(',').map(Number);
const browsers = arg('browsers', 'chromium').split(',');
const points = arg('points', 'S01:0.2,S01:0.6,S02:0.3,S03:0.2,S03:0.5,S03:0.9').split(',');
const tag = arg('tag', 'gate3-film');
const throttle = Number(arg('throttle', 1));
const WARMUP_MS = 2500;
const SAMPLE_MS = 4500;

const rows = [];
for (const browserName of browsers) {
  const browser = await (browserName === 'firefox' ? firefox : chromium).launch({ headless: false });
  for (const tier of tiers) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    if (throttle > 1 && browserName === 'chromium') {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    }
    await page.goto(`${base}/?tier=${tier}&debug&weather=clear`);
    await page.bringToFront();
    await page.waitForFunction(() => document.documentElement.dataset.ignition === 'done' && Boolean(window.__film?.stats), null, { timeout: 90000 });
    for (const point of points) {
      const [id, progress] = point.split(':');
      await page.evaluate(([sceneId, p]) => window.__filmTest.scrollToScene(sceneId, Number(p)), [id, progress]);
      await page.bringToFront();
      await page.waitForTimeout(WARMUP_MS);
      await page.waitForTimeout(SAMPLE_MS);
      const stats = await page.evaluate(() => window.__film.stats());
      const row = { browser: browserName, tier, throttle, point, ...stats };
      rows.push(row);
      console.log(
        `${browserName.padEnd(8)} t${tier} ${point.padEnd(8)} fps ${String(stats.fps).padStart(3)}  1% ${String(stats.low1).padStart(3)}  cpu ${stats.cpuAvgMs}/${stats.cpuP95Ms}  gpu ${stats.gpuAvgMs ?? 'n/a'}/${stats.gpuP95Ms ?? 'n/a'}  draws ${stats.drawCalls}`,
      );
    }
    await context.close();
  }
  await browser.close();
}

const outDir = path.resolve('director/frames');
fs.mkdirSync(outDir, { recursive: true });
const suffix = throttle > 1 ? `-cpu${throttle}x` : '';
fs.writeFileSync(path.join(outDir, `${tag}-bench${suffix}.json`), JSON.stringify(rows, null, 2));
console.log('\n| browser | tier | point | fps | 1% low | CPU avg / p95 ms | GPU avg / p95 ms | draws |');
console.log('|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  console.log(`| ${r.browser}${r.throttle > 1 ? ` (CPU ${r.throttle}x)` : ''} | ${r.tier} | ${r.point} | ${r.fps} | ${r.low1} | ${r.cpuAvgMs} / ${r.cpuP95Ms} | ${r.gpuAvgMs ?? 'n/a'} / ${r.gpuP95Ms ?? 'n/a'} | ${r.drawCalls} |`);
}
