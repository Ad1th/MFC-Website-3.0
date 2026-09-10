#!/usr/bin/env node
/**
 * Turns originals in media-src/ into web images in public/media/ (AVIF + WebP).
 *   media-src/team/**      480px square portraits, cropped toward the most salient region
 *   media-src/projects/**  1600px wide max
 *   media-src/events/**    1600px wide max
 *   media-src/about/**     1600px wide max
 * Never upscales. Skips outputs newer than their source unless --force.
 * --clean removes outputs whose source no longer exists.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'media-src');
const outDir = path.join(root, 'public/media');
const force = process.argv.includes('--force');
const clean = process.argv.includes('--clean');
const INPUT = /\.(png|jpe?g|webp|avif|tiff?)$/i;

const RULES = {
  team: (img) => img.resize(480, 480, { fit: 'cover', position: sharp.strategy.attention }),
  projects: (img) => img.resize({ width: 1600, withoutEnlargement: true }),
  events: (img) => img.resize({ width: 1600, withoutEnlargement: true }),
  about: (img) => img.resize({ width: 1600, withoutEnlargement: true }),
};

function* files(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(abs);
    else if (INPUT.test(entry.name)) yield abs;
  }
}

const newer = (a, b) => fs.existsSync(b) && fs.statSync(b).mtimeMs >= fs.statSync(a).mtimeMs;

async function main() {
  let written = 0;
  let skipped = 0;
  const expected = new Set();

  for (const src of files(srcDir)) {
    const rel = path.relative(srcDir, src);
    const group = rel.split(path.sep)[0];
    const rule = RULES[group];
    if (!rule) {
      console.warn(`optimize-images: no rule for ${rel}, skipped`);
      continue;
    }
    const base = path.join(outDir, rel.replace(INPUT, ''));
    const avif = `${base}.avif`;
    const webp = `${base}.webp`;
    expected.add(avif);
    expected.add(webp);
    if (!force && newer(src, avif) && newer(src, webp)) {
      skipped += 1;
      continue;
    }
    fs.mkdirSync(path.dirname(base), { recursive: true });
    const input = fs.readFileSync(src);
    await rule(sharp(input).rotate()).avif({ quality: 50, effort: 6 }).toFile(avif);
    await rule(sharp(input).rotate()).webp({ quality: 74, effort: 6 }).toFile(webp);
    written += 1;
  }

  let removed = 0;
  if (clean) {
    for (const out of files(outDir)) {
      if (!expected.has(out)) {
        fs.rmSync(out);
        removed += 1;
      }
    }
  }

  let bytes = 0;
  let count = 0;
  for (const out of files(outDir)) {
    bytes += fs.statSync(out).size;
    count += 1;
  }
  console.log(
    `optimize-images: ${written} written, ${skipped} up to date${clean ? `, ${removed} removed` : ''}; public/media holds ${count} files, ${(bytes / 1024 / 1024).toFixed(2)} MB`,
  );
}

main().catch((err) => {
  console.error(`optimize-images: ${err.message}`);
  process.exit(1);
});
