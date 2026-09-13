#!/usr/bin/env node
/**
 * The cloud puff sprite for S03's cloud layers, generated locally so the film never loads
 * drei's default cloud texture from a third-party CDN at runtime. A soft radial falloff
 * shaped by a few octaves of deterministic value noise, white with the puff in alpha.
 *
 * Usage: node scripts/cloud-sprite.mjs   (writes public/textures/cloud.png)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public/textures/cloud.png');
const SIZE = 256;

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, y) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < 5; o += 1) {
    sum += amp * valueNoise(x * freq, y * freq);
    freq *= 2;
    amp *= 0.5;
  }
  return sum;
}

const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    const nx = (x / (SIZE - 1)) * 2 - 1;
    const ny = (y / (SIZE - 1)) * 2 - 1;
    const r = Math.hypot(nx, ny);
    const falloff = Math.max(0, 1 - r) ** 1.6;
    const n = fbm(x / 48 + 3.1, y / 48 + 7.7);
    const alpha = Math.max(0, Math.min(1, falloff * (0.35 + 0.9 * n)));
    const i = (y * SIZE + x) * 4;
    pixels[i] = 255;
    pixels[i + 1] = 255;
    pixels[i + 2] = 255;
    pixels[i + 3] = Math.round(alpha * 255);
  }
}

fs.mkdirSync(path.dirname(out), { recursive: true });
await sharp(pixels, { raw: { width: SIZE, height: SIZE, channels: 4 } }).png({ compressionLevel: 9 }).toFile(out);
console.log(`${path.relative(root, out)}  ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
