#!/usr/bin/env node
/**
 * Gate 2 fox benchmark. For each browser (Chromium, Firefox), rendering
 * approach (A, B) and camera distance (hero, dive, sky): load the sandbox,
 * warm up so shader compilation is outside the window, sample
 * window.__film.stats() over 5 seconds and save a screenshot.
 *
 * Runs headed by default so the GPU is real (headless browsers may fall back
 * to software rendering). Needs a running server:
 *   npx vite build && npx vite preview --port 4199
 *   node scripts/fox-bench.mjs [--base http://localhost:4199] [--headless] [--velocity 1200]
 * Output: director/frames/gate2-<browser>-<approach>-<shot>.jpg and gate2-bench.json
 */
/* global window, document -- used inside page.evaluate callbacks, which run in the browser */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'director/frames');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const base = arg('base', 'http://localhost:4199');
const velocity = Number(arg('velocity', '900'));
const headless = process.argv.includes('--headless');
const WARMUP_MS = 6000;
const SAMPLE_MS = 5500;

const BROWSERS = [
  ['chromium', chromium],
  ['firefox', firefox],
];
const APPROACHES = ['A', 'B'];
const SHOTS = ['hero', 'dive', 'sky'];

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  for (const [browserName, type] of BROWSERS) {
    const browser = await type.launch({ headless });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    for (const approach of APPROACHES) {
      for (const shot of SHOTS) {
        await page.goto(`${base}/?sandbox=fox&approach=${approach}&shot=${shot}&velocity=${velocity}&tier=2`);
        await page.waitForFunction(() => Boolean(window.__fox && window.__film), null, { timeout: 30000 });
        await page.waitForTimeout(WARMUP_MS + SAMPLE_MS);
        const stats = await page.evaluate(() => window.__film.stats());
        const renderer = await page.evaluate(() => {
          const gl = document.querySelector('canvas')?.getContext('webgl2');
          const ext = gl?.getExtension('WEBGL_debug_renderer_info');
          return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER) ?? 'unknown';
        });
        const file = `gate2-${browserName}-${approach}-${shot}.jpg`;
        await page.locator('canvas').first().screenshot({ path: path.join(outDir, file), type: 'jpeg', quality: 85 });
        const row = { browser: browserName, approach, shot, fps: stats.fps, low1: stats.low1, drawCalls: stats.drawCalls, triangles: stats.triangles, particles: stats.particles, renderer, file };
        results.push(row);
        console.log(`${browserName.padEnd(9)} ${approach} ${shot.padEnd(5)} fps ${String(stats.fps).padStart(3)}  1% ${String(stats.low1).padStart(3)}  draws ${stats.drawCalls}  particles ${stats.particles}`);
      }
    }
    if (errors.length) console.log(`${browserName} errors:`, errors.slice(0, 5));
    await browser.close();
  }
  fs.writeFileSync(path.join(outDir, 'gate2-bench.json'), `${JSON.stringify({ velocity, headless, date: new Date().toISOString(), results }, null, 2)}\n`);
}

main().catch((err) => {
  console.error(`fox-bench: ${err.message}`);
  process.exit(1);
});
