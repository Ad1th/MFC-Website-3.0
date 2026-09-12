#!/usr/bin/env node
/**
 * Earth textures for the S01 globe, from NASA public-domain sources in media-src/earth:
 *   day:   Blue Marble Next Generation, topography and bathymetry, August 2004
 *   night: Black Marble 2016, 3km
 * Writes equirectangular WebP at 2048 (tiers 1 and 2) and 4096 (tier 3) wide.
 * The night map is kept greyscale; the shader tints it toward --ember.
 *
 * Usage: node scripts/earth-textures.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'media-src/earth');
const out = path.join(root, 'public/textures/earth');
fs.mkdirSync(out, { recursive: true });

const JOBS = [
  { name: 'day', file: 'blue-marble-ng-topo-bathy-200408-5400.jpg', grey: false, quality: 80 },
  { name: 'night', file: 'black-marble-2016-3km.jpg', grey: true, quality: 70 },
];

for (const job of JOBS) {
  for (const width of [2048, 4096]) {
    let image = sharp(path.join(src, job.file)).resize(width, width / 2, { kernel: 'lanczos3' });
    if (job.grey) image = image.greyscale();
    const target = path.join(out, `${job.name}-${width}.webp`);
    await image.webp({ quality: job.quality, effort: 6 }).toFile(target);
    console.log(`${path.relative(root, target)}  ${(fs.statSync(target).size / 1024).toFixed(0)} KB`);
  }
}
