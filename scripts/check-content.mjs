#!/usr/bin/env node
/**
 * Validates every content file against its zod schema and the set rules:
 * no em or en dashes, no "#" placeholder links, no banned words, and every
 * /media path must exist in public/. Prints a content report.
 * Exit code 1 on any failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTENT_FILES, BANNED_PHRASES, BANNED_PATTERNS, DASH_PATTERN } from '../src/content/schema.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = path.join(root, 'src/content');
const publicDir = path.join(root, 'public');

const errors = [];
const todos = [];
const report = {};

/** Walk every string value in a JSON tree with its path. */
function walk(node, trail, visit) {
  if (typeof node === 'string') visit(node, trail);
  else if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${trail}[${i}]`, visit));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, `${trail}.${k}`, visit);
}

for (const { file, schema, optional } of CONTENT_FILES) {
  const abs = path.join(contentDir, file);
  if (!fs.existsSync(abs)) {
    if (optional) {
      report[file] = 'absent (optional)';
      continue;
    }
    errors.push(`${file}: missing`);
    continue;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (err) {
    errors.push(`${file}: invalid JSON (${err.message})`);
    continue;
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors.push(`${file}: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }

  walk(data, file, (value, trail) => {
    if (DASH_PATTERN.test(value)) errors.push(`${trail}: contains an em or en dash`);
    if (value.trim() === '#' || value.trim().startsWith('#http')) errors.push(`${trail}: "#" placeholder link`);
    const lower = value.toLowerCase();
    for (const phrase of BANNED_PHRASES) if (lower.includes(phrase)) errors.push(`${trail}: banned phrase "${phrase}"`);
    for (const pattern of BANNED_PATTERNS) if (pattern.test(value)) errors.push(`${trail}: banned pattern ${pattern}`);
    if (value.startsWith('TODO_CONTENT')) todos.push(trail);
    if (value.startsWith('/media/')) {
      const onDisk = path.join(publicDir, value);
      if (!fs.existsSync(onDisk)) errors.push(`${trail}: ${value} does not exist in public/`);
      const avif = onDisk.replace(/\.webp$/, '.avif');
      if (value.endsWith('.webp') && !fs.existsSync(avif)) errors.push(`${trail}: AVIF twin of ${value} missing`);
    }
  });

  report[file] = summarise(file, data);
}

function summarise(file, data) {
  switch (file) {
    case 'projects.json':
      return `${data.length} projects`;
    case 'events.json':
      return `${data.length} events, ${data.filter((e) => e.flagship).length} flagship, ${data.filter((e) => e.image).length} with photos`;
    case 'team.json': {
      const members = Object.values(data.years).flat();
      const perYear = Object.entries(data.years).map(([y, m]) => `${y}: ${m.length}`).join(', ');
      const noPhoto = members.filter((m) => !m.photo).length;
      const links = members.reduce((n, m) => n + Object.keys(m.links).length, 0);
      return `faculty + ${members.length} members (${perYear}); ${noPhoto} without photo; ${links} links`;
    }
    case 'newsletters.json':
      return `${data.items.length} fallback newsletters`;
    case 'generated/blogs.json':
      return `${data.length} posts`;
    case 'generated/commits.json':
      return `${data.length} activity items`;
    default:
      return 'ok';
  }
}

console.log('content report');
for (const [file, line] of Object.entries(report)) console.log(`  ${file.padEnd(24)} ${line}`);
if (todos.length) {
  console.log(`\nTODO_CONTENT markers (${todos.length}):`);
  for (const t of todos) console.log(`  ${t}`);
}
if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log('\ncheck:content passed');
