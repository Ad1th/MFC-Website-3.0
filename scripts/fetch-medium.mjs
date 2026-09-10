#!/usr/bin/env node
/**
 * Fetches the club's Medium RSS feed and writes src/content/generated/blogs.json.
 * On any failure the previously committed file is kept untouched.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';

const FEED_URL = 'https://medium.com/feed/mozilla-firefox-club';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(root, 'src/content/generated/blogs.json');

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/** HTML to plain text, with dashes replaced so check:content stays green. */
function toText(html) {
  return html
    .replace(/<figure[\s\S]*?<\/figure>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#?\w+);/g, (m, name) => {
      if (ENTITIES[name]) return ENTITIES[name];
      if (name.startsWith('#x')) return String.fromCodePoint(parseInt(name.slice(2), 16));
      if (name.startsWith('#')) return String.fromCodePoint(Number(name.slice(1)));
      return m;
    })
    .replace(/[—–]/g, ', ')
    .replace(/\s+,/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
}

function excerpt(text, words = 30) {
  const parts = text.split(' ');
  if (parts.length <= words) return text;
  return `${parts.slice(0, words).join(' ').replace(/[,;:.]$/, '')}...`;
}

function firstImage(html) {
  const match = html.match(/<img[^>]+src="(https:\/\/[^"]+)"/i);
  return match ? match[1] : null;
}

function cleanUrl(link) {
  const u = new URL(link);
  u.search = '';
  return u.toString();
}

async function main() {
  const res = await fetch(FEED_URL, {
    headers: { 'User-Agent': 'mfc-website-build (+https://github.com/MFC-VIT)' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();

  const parser = new XMLParser({ ignoreAttributes: false, cdataPropName: false, trimValues: true });
  const doc = parser.parse(xml);
  const rawItems = doc?.rss?.channel?.item;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  if (items.length === 0) throw new Error('feed has no items');

  const posts = items
    .map((item) => {
      const html = String(item['content:encoded'] ?? item.description ?? '');
      return {
        title: toText(String(item.title ?? '')),
        url: cleanUrl(String(item.link)),
        date: new Date(item.pubDate).toISOString().slice(0, 10),
        author: toText(String(item['dc:creator'] ?? 'Mozilla Firefox Club')),
        excerpt: excerpt(toText(html)),
        image: firstImage(html),
      };
    })
    .filter((p) => p.title && p.url)
    .sort((a, b) => b.date.localeCompare(a.date));

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(posts, null, 2)}\n`);
  console.log(`fetch-medium: wrote ${posts.length} posts`);
}

main().catch((err) => {
  const kept = fs.existsSync(outFile) ? 'kept the previous blogs.json' : 'no blogs.json exists, Scene 8 will link to Medium only';
  console.warn(`fetch-medium: ${err.message}; ${kept}`);
});
