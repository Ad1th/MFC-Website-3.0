#!/usr/bin/env node
/**
 * Trace the MFC logo's outline once into a polyline for S05's web (the fox's path traces it).
 * Reads the alpha of public/images/logo_main.png, runs marching squares on a downsampled mask,
 * keeps the longest closed contour (the logo's outer silhouette), simplifies it with
 * Ramer-Douglas-Peucker, normalizes to [-1, 1] with +y up, and writes
 * src/film/world/Rooms/logoPath.json. Also writes a preview PNG next to it if --preview is given.
 *
 * Usage: node scripts/trace-logo.mjs [--points 150] [--preview /path/to/preview.png]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const targetPoints = Number(arg('points', 150));
const preview = arg('preview', null);
const GRID = 160;

const { data, info } = await sharp(path.join(root, 'public/images/logo_main.png'))
  .ensureAlpha()
  .resize(GRID, GRID, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .raw()
  .toBuffer({ resolveWithObject: true });

const W = info.width;
const H = info.height;
const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && data[(y * W + x) * 4 + 3] > 110;

// Marching squares over cell corners; collect boundary segments, then chain them into loops.
const segments = new Map();
const key = (p) => `${p[0]},${p[1]}`;
const add = (a, b) => {
  const k = key(a);
  if (!segments.has(k)) segments.set(k, []);
  segments.get(k).push(b);
};
for (let y = -1; y < H; y += 1) {
  for (let x = -1; x < W; x += 1) {
    const tl = inside(x, y);
    const tr = inside(x + 1, y);
    const br = inside(x + 1, y + 1);
    const bl = inside(x, y + 1);
    const code = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
    const top = [x + 0.5, y];
    const right = [x + 1, y + 0.5];
    const bottom = [x + 0.5, y + 1];
    const left = [x, y + 0.5];
    const edges = {
      1: [[left, bottom]], 2: [[bottom, right]], 3: [[left, right]], 4: [[right, top]],
      5: [[left, top], [right, bottom]], 6: [[bottom, top]], 7: [[left, top]], 8: [[top, left]],
      9: [[top, bottom]], 10: [[top, right], [bottom, left]], 11: [[top, right]], 12: [[right, left]],
      13: [[right, bottom]], 14: [[bottom, left]],
    }[code];
    if (edges) edges.forEach(([a, b]) => add(a, b));
  }
}

const loops = [];
while (segments.size) {
  const [startKey, nexts] = segments.entries().next().value;
  const start = startKey.split(',').map(Number);
  const loop = [start];
  let next = nexts.shift();
  if (!nexts.length) segments.delete(startKey);
  while (next && key(next) !== startKey) {
    loop.push(next);
    const here = key(next);
    const list = segments.get(here);
    if (!list || !list.length) break;
    next = list.shift();
    if (!list.length) segments.delete(here);
  }
  if (loop.length > 20) loops.push(loop);
}
loops.sort((a, b) => b.length - a.length);
const outline = loops[0];

function rdp(points, epsilon) {
  if (points.length < 3) return points;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  let worst = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = Math.abs(dy * points[i][0] - dx * points[i][1] + bx * ay - by * ax) / len;
    if (d > worst) {
      worst = d;
      index = i;
    }
  }
  if (worst <= epsilon) return [points[0], points[points.length - 1]];
  return [...rdp(points.slice(0, index + 1), epsilon).slice(0, -1), ...rdp(points.slice(index), epsilon)];
}

let epsilon = 0.3;
let simplified = rdp(outline, epsilon);
while (simplified.length > targetPoints && epsilon < 10) {
  epsilon *= 1.2;
  simplified = rdp(outline, epsilon);
}

const xs = simplified.map((p) => p[0]);
const ys = simplified.map((p) => p[1]);
const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
const half = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2;
const points = simplified.map(([x, y]) => [+((x - cx) / half).toFixed(4), +(-(y - cy) / half).toFixed(4)]);

const out = path.join(root, 'src/film/world/Rooms/logoPath.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  `${JSON.stringify({ source: 'public/images/logo_main.png', grid: GRID, loops: loops.length, points }, null, 0)}\n`,
);
console.log(`${path.relative(root, out)}: ${points.length} points from a ${outline.length}-point contour (${loops.length} loops found, epsilon ${epsilon.toFixed(2)})`);

if (preview) {
  const size = 400;
  const d = points.map(([x, y], i) => `${i ? 'L' : 'M'}${((x + 1) / 2) * (size - 40) + 20},${((1 - y) / 2) * (size - 40) + 20}`).join(' ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="#0a0807"/><path d="${d} Z" fill="none" stroke="#ff6d00" stroke-width="2"/></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(preview);
  console.log(`preview: ${preview}`);
}
