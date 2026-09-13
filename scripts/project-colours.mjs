#!/usr/bin/env node
/**
 * Three dominant colours per project screenshot, for S06's mini-worlds (each world is tinted
 * with its project's own colours). Downsamples each image, runs k-means (k = 5) in RGB with a
 * deterministic seed, and keeps the three largest clusters that are not near-black or
 * near-white, falling back to whatever remains if a screenshot is mostly neutral.
 *
 * Writes src/content/generated/projectColours.json: { [slug]: ["#rrggbb", "#rrggbb", "#rrggbb"] }.
 * Usage: node scripts/project-colours.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projects = JSON.parse(fs.readFileSync(path.join(root, 'src/content/projects.json'), 'utf8'));
const SIZE = 64;
const K = 5;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function kmeans(pixels, k, seed) {
  const rand = mulberry32(seed);
  let centres = Array.from({ length: k }, () => pixels[Math.floor(rand() * pixels.length)].slice());
  let assignment = new Array(pixels.length).fill(0);
  for (let iter = 0; iter < 20; iter += 1) {
    assignment = pixels.map((p) => {
      let best = 0;
      let bestD = Infinity;
      centres.forEach((c, i) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      return best;
    });
    centres = centres.map((c, i) => {
      const members = pixels.filter((_, j) => assignment[j] === i);
      if (!members.length) return c;
      return [0, 1, 2].map((ch) => members.reduce((s, m) => s + m[ch], 0) / members.length);
    });
  }
  const counts = centres.map((_, i) => assignment.filter((a) => a === i).length);
  return centres.map((c, i) => ({ colour: c, count: counts[i] })).sort((a, b) => b.count - a.count);
}

const hex = ([r, g, b]) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const luminance = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

const out = {};
for (const project of projects) {
  const file = path.join(root, 'public', project.image);
  const { data, info } = await sharp(file).resize(SIZE, SIZE, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = [];
  for (let i = 0; i < data.length; i += info.channels) pixels.push([data[i], data[i + 1], data[i + 2]]);
  const clusters = kmeans(pixels, K, 7);
  const vivid = clusters.filter((c) => luminance(c.colour) > 0.08 && luminance(c.colour) < 0.92);
  const chosen = [...vivid, ...clusters.filter((c) => !vivid.includes(c))].slice(0, 3).map((c) => hex(c.colour));
  out[project.slug] = chosen;
  console.log(`${project.slug.padEnd(20)} ${chosen.join(' ')}`);
}

const target = path.join(root, 'src/content/generated/projectColours.json');
fs.writeFileSync(target, `${JSON.stringify(out, null, 2)}\n`);
console.log(path.relative(root, target));
