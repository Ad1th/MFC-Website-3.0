import { flags } from './flags.js';

/**
 * Live Vellore weather from Open-Meteo. Real or absent, never invented: if the fetch
 * fails the caller gets null and drops the weather from the HUD. Cached 15 minutes in
 * sessionStorage. `?weather=<condition>` is a test mock for the scene branches; it
 * carries no temperature, so a mocked HUD shows the condition only.
 */

const URL =
  'https://api.open-meteo.com/v1/forecast?latitude=12.9692&longitude=79.1559&current=temperature_2m,weather_code,is_day,precipitation,cloud_cover';
const CACHE_KEY = 'mfc.weather';
const TTL_MS = 15 * 60 * 1000;
const CONDITIONS = ['clear', 'cloudy', 'rain', 'storm', 'fog', 'drizzle'];

/**
 * WMO weather code to one lowercase word.
 * @param {number} code
 */
export function conditionFor(code) {
  if (code <= 1) return 'clear';
  if (code <= 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code >= 95) return 'storm';
  // Snow codes (71 to 77, 85, 86) do not happen in Vellore; treat as overcast.
  return 'cloudy';
}

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    return Date.now() - cached.at < TTL_MS ? cached.weather : null;
  } catch {
    return null;
  }
}

function writeCache(weather) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), weather }));
  } catch {
    // Storage can throw (private mode, quota); the site works without the cache.
  }
}

/**
 * @typedef {{ condition: string, temperature: number|null, isDay: boolean, code: number|null, mocked: boolean }} Weather
 * @returns {Promise<Weather|null>}
 */
export async function loadWeather() {
  if (flags.weather && CONDITIONS.includes(flags.weather)) {
    return { condition: flags.weather, temperature: null, isDay: true, code: null, mocked: true };
  }
  const cached = readCache();
  if (cached) return cached;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(URL, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return null;
    const { current } = await response.json();
    if (!current || typeof current.weather_code !== 'number') return null;
    const weather = {
      condition: conditionFor(current.weather_code),
      temperature: typeof current.temperature_2m === 'number' ? Math.round(current.temperature_2m) : null,
      isDay: current.is_day === 1,
      code: current.weather_code,
      mocked: false,
    };
    writeCache(weather);
    return weather;
  } catch {
    return null;
  }
}
