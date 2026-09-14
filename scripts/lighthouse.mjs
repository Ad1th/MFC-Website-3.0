#!/usr/bin/env node
/**
 * Lighthouse runs for Gate 7 against a production build (not the test-hooks build):
 *   still mode, mobile (Lighthouse's default phone emulation and throttling)
 *   still mode, desktop
 *   film mode, desktop
 * Reports go to director/frames/gate7-lighthouse/ as HTML and JSON, with a summary printed.
 *
 *   npx vite build && npx vite preview --port 4175 --strictPort
 *   node scripts/lighthouse.mjs [--base http://localhost:4175] [--only still-mobile,film-desktop]
 */
import fs from 'node:fs';
import path from 'node:path';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const base = arg('base', 'http://localhost:4175');
const only = arg('only', null)?.split(',') ?? null;
const out = path.resolve('director/frames/gate7-lighthouse');
fs.mkdirSync(out, { recursive: true });

const DESKTOP = {
  formFactor: 'desktop',
  screenEmulation: { mobile: false, width: 1440, height: 900, deviceScaleFactor: 1, disabled: false },
  throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1, requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0 },
};

const RUNS = [
  { name: 'still-mobile', url: `${base}/?still=1`, settings: {} },
  { name: 'still-desktop', url: `${base}/?still=1`, settings: DESKTOP },
  { name: 'film-desktop', url: `${base}/`, settings: DESKTOP },
];

const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--use-angle=metal', '--enable-gpu'] });
const summary = [];
try {
  for (const run of RUNS) {
    if (only && !only.includes(run.name)) continue;
    const result = await lighthouse(
      run.url,
      { port: chrome.port, output: ['html', 'json'], onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'], logLevel: 'error' },
      { extends: 'lighthouse:default', settings: { ...run.settings, maxWaitForLoad: 60000 } },
    );
    const [html, json] = result.report;
    fs.writeFileSync(path.join(out, `${run.name}.html`), html);
    fs.writeFileSync(path.join(out, `${run.name}.json`), json);
    const c = result.lhr.categories;
    const score = (k) => Math.round((c[k]?.score ?? 0) * 100);
    const audits = result.lhr.audits;
    summary.push({
      run: run.name,
      performance: score('performance'),
      accessibility: score('accessibility'),
      bestPractices: score('best-practices'),
      seo: score('seo'),
      fcp: audits['first-contentful-paint']?.displayValue,
      lcp: audits['largest-contentful-paint']?.displayValue,
      tbt: audits['total-blocking-time']?.displayValue,
      cls: audits['cumulative-layout-shift']?.displayValue,
    });
    console.log(JSON.stringify(summary.at(-1)));
  }
} finally {
  await chrome.kill();
}
fs.writeFileSync(path.join(out, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
