#!/usr/bin/env node
/* global window, document, requestAnimationFrame -- used inside page.evaluate callbacks, which run in the browser */
/**
 * Gate 2 fox benchmark. For each browser (Chromium, Firefox), particle tier
 * (1 = 12k, 2 = 30k, 3 = 60k), rendering approach (A, B, C) and camera distance
 * (hero, dive, sky): load the sandbox, warm up so shader compilation is outside
 * the window, sample window.__film.stats() over 5 seconds and save a screenshot.
 *
 * Runs headed by default so the GPU is real (headless browsers may fall back
 * to software rendering). Needs a running server:
 *   npx vite build && npx vite preview --port 4199
 *   node scripts/fox-bench.mjs [--base http://localhost:4199] [--headless] [--uncapped]
 *                              [--velocity 900] [--tiers 1,2,3] [--approaches A,B,C] [--shots hero,dive,sky]
 * Output: director/frames/gate2-<browser>-t<tier>-<approach>-<shot>.jpg and gate2-bench.json
 */
import { execSync } from 'node:child_process';
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
const list = (name, fallback) => arg(name, fallback).split(',').map((s) => s.trim()).filter(Boolean);

const base = arg('base', 'http://localhost:4199');
const velocity = Number(arg('velocity', '900'));
const headless = process.argv.includes('--headless');
// Without this the display's refresh caps FPS at 60; --uncapped measures headroom.
const uncapped = process.argv.includes('--uncapped');
const LAUNCH = {
  chromium: uncapped ? { args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] } : {},
  firefox: uncapped ? { firefoxUserPrefs: { 'layout.frame_rate': 1000 } } : {},
};
const WARMUP_MS = 6000;
const SAMPLE_MS = 5500;

const BROWSERS = [
  ['chromium', chromium],
  ['firefox', firefox],
].filter(([name]) => list('browsers', 'chromium,firefox').includes(name));
const TIERS = list('tiers', '1,2,3').map(Number);
const APPROACHES = list('approaches', 'A,B,C');
const SHOTS = list('shots', 'hero,dive,sky');

function countFrames() {
  return new Promise((resolve) => {
    let n = 0;
    const start = performance.now();
    const step = () => {
      n += 1;
      if (performance.now() - start < 1000) requestAnimationFrame(step);
      else resolve(n);
    };
    requestAnimationFrame(step);
  });
}

/** The commit the served build came from, and whether the tree had uncommitted changes. */
function buildStamp() {
  try {
    const commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
    const dirty = execSync('git status --porcelain -- src public', { cwd: root }).toString().trim().length > 0;
    return { commit, dirty };
  } catch {
    return { commit: 'unknown', dirty: null };
  }
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = buildStamp();
  console.log(`bench against commit ${stamp.commit}${stamp.dirty ? ' (src or public has uncommitted changes)' : ''}`);
  const results = [];
  for (const [browserName, type] of BROWSERS) {
    const browser = await type.launch({ headless, ...LAUNCH[browserName] });
    const browserVersion = browser.version();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    for (const tier of TIERS) {
      for (const approach of APPROACHES) {
        for (const shot of SHOTS) {
          await page.goto(`${base}/?sandbox=fox&approach=${approach}&shot=${shot}&velocity=${velocity}&tier=${tier}`);
          // A window that isn't frontmost gets its animation frames throttled (Firefox
          // reported 0 fps that way), so bring it forward before warm-up and sampling.
          await page.bringToFront();
          await page.waitForFunction(() => Boolean(window.__fox && window.__film), null, { timeout: 30000 });
          await page.waitForTimeout(WARMUP_MS);
          await page.bringToFront();
          await page.waitForTimeout(SAMPLE_MS);
          const stats = await page.evaluate(() => window.__film.stats());
          const frames = await page.evaluate(countFrames);
          const renderer = await page.evaluate(() => {
            const gl = document.querySelector('canvas')?.getContext('webgl2');
            const ext = gl?.getExtension('WEBGL_debug_renderer_info');
            return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : (gl?.getParameter(gl.RENDERER) ?? 'unknown');
          });
          const file = `gate2-${browserName}-t${tier}-${approach}-${shot}.jpg`;
          await page.locator('canvas').first().screenshot({ path: path.join(outDir, file), type: 'jpeg', quality: 85 });
          const row = { browser: browserName, browserVersion, tier, approach, shot, fps: stats.fps, low1: stats.low1, rafPerSecond: frames, drawCalls: stats.drawCalls, triangles: stats.triangles, particles: stats.particles, renderer, file };
          results.push(row);
          console.log(
            `${browserName.padEnd(9)} t${tier} ${approach} ${shot.padEnd(5)} fps ${String(stats.fps).padStart(4)}  1% ${String(stats.low1).padStart(4)}  raf/s ${String(frames).padStart(4)}  draws ${stats.drawCalls}  particles ${stats.particles}`,
          );
        }
      }
    }
    const renderers = [...new Set(results.filter((r) => r.browser === browserName).map((r) => r.renderer))];
    console.log(`${browserName} ${browserVersion}, renderer: ${renderers.join(' | ')}`);
    if (errors.length) console.log(`${browserName} errors:`, errors.slice(0, 5));
    await browser.close();
  }
  fs.writeFileSync(
    path.join(outDir, 'gate2-bench.json'),
    `${JSON.stringify({ velocity, headless, uncapped, build: stamp, date: new Date().toISOString(), results }, null, 2)}\n`,
  );
}

main().catch((err) => {
  console.error(`fox-bench: ${err.message}`);
  process.exit(1);
});
