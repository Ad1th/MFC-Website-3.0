/**
 * All site content, imported once. Components read from here, never from JSON
 * paths directly. Generated files are optional: a missing blogs.json or
 * commits.json becomes an empty list, never a build failure.
 */
import site from './site.json';
import domains from './domains.json';
import projects from './projects.json';
import events from './events.json';
import team from './team.json';
import newsletters from './newsletters.json';
import credits from './credits.json';
import { flags } from '../live/flags.js';

const generated = import.meta.glob('./generated/*.json', { eager: true, import: 'default' });

/** @type {Array<{ title: string, url: string, date: string, author: string, excerpt: string, image: string|null }>} */
export const blogs = flags.noBlogs ? [] : (generated['./generated/blogs.json'] ?? []);

/** @type {Array<{ repo: string, actor: string, type: string, createdAt: string }>} */
export const commits = flags.noCommits ? [] : (generated['./generated/commits.json'] ?? []);

/** Board years, newest first. */
export const years = Object.keys(team.years).sort((a, b) => b.localeCompare(a));

export const memberCount = Object.values(team.years).reduce((n, list) => n + list.length, 0);

export { site, domains, projects, events, team, newsletters, credits };

/** "2024-09-28" to "28.09.24", the script's date style. */
export function shortDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y.slice(2)}`;
}

/** "2024-09-28" to a readable, locale-aware date. */
const LONG_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export function longDate(iso) {
  return LONG_DATE.format(new Date(`${iso}T00:00:00Z`));
}

/** Swap a /media/...webp path for its AVIF twin. */
export function avifOf(webpPath) {
  return webpPath.replace(/\.webp$/, '.avif');
}
