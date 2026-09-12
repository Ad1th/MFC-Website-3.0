#!/usr/bin/env node
/**
 * Production build guard, run after `npm run build`. Fails if the fox test hooks
 * (FOX_REGRESS switches that re-create fixed bugs) or the film test hooks leaked into the output.
 *
 * It matches the hook's own signatures, not the bare word "regress": React Three
 * Fiber legitimately ships a `performance.regress()` API for adaptive resolution.
 *
 * Usage: node scripts/check-dist.mjs [dir]   (default dir: dist)
 * `node scripts/check-dist.mjs dist-test` must FAIL, which proves the guard works.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, process.argv[2] ?? 'dist');

const FORBIDDEN = [
  { pattern: /get\(\s*["'`]regress["'`]\s*\)/, why: 'reads the ?regress= URL switch' },
  { pattern: /["'`]embers-parent["'`]/, why: 're-creates the ember attachment bug' },
  { pattern: /["'`]no-hit-radius["'`]/, why: 'disables the petting hit radius' },
  { pattern: /["'`]no-near-radius["'`]/, why: 'disables the pounce radius' },
  { pattern: /__filmTest/, why: 'film test hooks (scroll jumps, forced shatter)' },
  { pattern: /get\(\s*["'`]freeze["'`]\s*\)/, why: 'reads the ?freeze= URL switch' },
];

function* files(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(abs);
    else if (/\.(js|html|css|json|map)$/.test(entry.name)) yield abs;
  }
}

if (!fs.existsSync(dist)) {
  console.error(`check-dist: ${dist} does not exist`);
  process.exit(1);
}

const hits = [];
for (const file of files(dist)) {
  const text = fs.readFileSync(file, 'utf8');
  for (const { pattern, why } of FORBIDDEN) {
    const match = text.match(pattern);
    if (match) hits.push(`${path.relative(root, file)}: ${match[0]} (${why}) at ${match.index}`);
  }
}

if (hits.length) {
  console.error(`check-dist: test-only hooks found in ${path.relative(root, dist)}:`);
  for (const h of hits) console.error(`  ${h}`);
  process.exit(1);
}
console.log(`check-dist: no test-only hooks in ${path.relative(root, dist)}`);
