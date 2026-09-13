import { newsletters as fallback } from '../content/index.js';
import { flags } from './flags.js';
import { FILM_TEST } from '../film/testHooks.js';

/**
 * @typedef {{ title: string, date: string, cover: string, pdf: string }} Newsletter
 */

const TIMEOUT_MS = 4000;

export function apiBase() {
  return (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '');
}

const isHttps = (value) => typeof value === 'string' && /^https?:\/\//.test(value);

/** @returns {Newsletter[]} */
function normalise(list) {
  return list
    .filter((n) => n && isHttps(n.cover_url) && isHttps(n.pdf_link) && n.title)
    .map((n) => ({
      title: String(n.title).replace(/^"|"$/g, '').replace(/[—–]/g, ', ').trim(),
      date: String(n.uploadDate ?? ''),
      cover: n.cover_url,
      pdf: n.pdf_link,
    }))
    .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
}

/**
 * Newsletters from the API with a 4 second timeout. Any failure falls back to
 * src/content/newsletters.json. A successful empty response stays empty.
 * Never throws.
 * @returns {Promise<{ items: Newsletter[], source: 'api'|'fallback'|'none' }>}
 */
export async function loadNewsletters() {
  if (flags.noNewsletters) return { items: [], source: 'none' };
  // Test builds only: a page can hand in newsletters to exercise the covers without a backend.
  if (FILM_TEST && Array.isArray(window.__filmTest?.newsletters)) return { items: normalise(window.__filmTest.newsletters), source: 'fallback' };
  const base = apiBase();
  if (!base || flags.backendDown) return { items: normalise(fallback.items), source: 'fallback' };
  try {
    const res = await fetch(`${base}/api/v1/newsLetter/getAllNewsLetters`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const list = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : null;
    if (!list) throw new Error('unexpected response shape');
    return { items: normalise(list), source: 'api' };
  } catch {
    return { items: normalise(fallback.items), source: 'fallback' };
  }
}
