import { flags } from './flags.js';

/**
 * Roughly where the viewer is, from the timezone alone. No IP lookup, no geolocation
 * permission, nothing sent anywhere. A hand-written table: city label, approximate
 * coordinates and a plausible traceroute toward Vellore (S04).
 */

const VELLORE_TAIL = ['chennai', 'vellore', 'mfc'];
const VIA_MUMBAI = ['mumbai ix', ...VELLORE_TAIL];
const VIA_SINGAPORE = ['singapore ix', ...VIA_MUMBAI];
const VIA_EUROPE = ['marseille', ...VIA_MUMBAI];
const VIA_US_EAST = ['new york ix', 'london ix', ...VIA_EUROPE];
const VIA_US_WEST = ['los angeles ix', 'tokyo ix', ...VIA_SINGAPORE];

/** @type {Record<string, { city: string, lat: number, lon: number, hops: string[] }>} */
const ZONES = {
  // One zone covers all of India, so the label is the country and the point its centre.
  'Asia/Kolkata': { city: 'india', lat: 20.59, lon: 78.96, hops: VIA_MUMBAI },
  'Asia/Calcutta': { city: 'india', lat: 20.59, lon: 78.96, hops: VIA_MUMBAI },
  'Asia/Colombo': { city: 'colombo', lat: 6.93, lon: 79.86, hops: VELLORE_TAIL },
  'Asia/Kathmandu': { city: 'kathmandu', lat: 27.72, lon: 85.32, hops: ['delhi ix', ...VIA_MUMBAI] },
  'Asia/Dhaka': { city: 'dhaka', lat: 23.81, lon: 90.41, hops: ['kolkata', ...VELLORE_TAIL] },
  'Asia/Karachi': { city: 'karachi', lat: 24.86, lon: 67.0, hops: VIA_MUMBAI },
  'Asia/Dubai': { city: 'dubai', lat: 25.2, lon: 55.27, hops: ['fujairah', ...VIA_MUMBAI] },
  'Asia/Riyadh': { city: 'riyadh', lat: 24.71, lon: 46.68, hops: ['jeddah', ...VIA_MUMBAI] },
  'Asia/Qatar': { city: 'doha', lat: 25.29, lon: 51.53, hops: ['fujairah', ...VIA_MUMBAI] },
  'Asia/Singapore': { city: 'singapore', lat: 1.35, lon: 103.82, hops: VIA_SINGAPORE },
  'Asia/Kuala_Lumpur': { city: 'kuala lumpur', lat: 3.14, lon: 101.69, hops: VIA_SINGAPORE },
  'Asia/Jakarta': { city: 'jakarta', lat: -6.21, lon: 106.85, hops: VIA_SINGAPORE },
  'Asia/Bangkok': { city: 'bangkok', lat: 13.76, lon: 100.5, hops: VIA_SINGAPORE },
  'Asia/Manila': { city: 'manila', lat: 14.6, lon: 120.98, hops: ['hong kong ix', ...VIA_SINGAPORE] },
  'Asia/Hong_Kong': { city: 'hong kong', lat: 22.32, lon: 114.17, hops: ['hong kong ix', ...VIA_SINGAPORE] },
  'Asia/Shanghai': { city: 'shanghai', lat: 31.23, lon: 121.47, hops: ['hong kong ix', ...VIA_SINGAPORE] },
  'Asia/Taipei': { city: 'taipei', lat: 25.03, lon: 121.57, hops: ['hong kong ix', ...VIA_SINGAPORE] },
  'Asia/Seoul': { city: 'seoul', lat: 37.57, lon: 126.98, hops: ['tokyo ix', ...VIA_SINGAPORE] },
  'Asia/Tokyo': { city: 'tokyo', lat: 35.68, lon: 139.69, hops: ['tokyo ix', ...VIA_SINGAPORE] },
  'Australia/Sydney': { city: 'sydney', lat: -33.87, lon: 151.21, hops: ['sydney ix', 'perth', ...VIA_SINGAPORE] },
  'Australia/Melbourne': { city: 'melbourne', lat: -37.81, lon: 144.96, hops: ['sydney ix', 'perth', ...VIA_SINGAPORE] },
  'Australia/Perth': { city: 'perth', lat: -31.95, lon: 115.86, hops: ['perth', ...VIA_SINGAPORE] },
  'Pacific/Auckland': { city: 'auckland', lat: -36.85, lon: 174.76, hops: ['sydney ix', 'perth', ...VIA_SINGAPORE] },
  'Europe/London': { city: 'london', lat: 51.51, lon: -0.13, hops: ['london ix', ...VIA_EUROPE] },
  'Europe/Dublin': { city: 'dublin', lat: 53.35, lon: -6.26, hops: ['london ix', ...VIA_EUROPE] },
  'Europe/Paris': { city: 'paris', lat: 48.86, lon: 2.35, hops: ['paris ix', ...VIA_EUROPE] },
  'Europe/Berlin': { city: 'berlin', lat: 52.52, lon: 13.4, hops: ['frankfurt ix', ...VIA_EUROPE] },
  'Europe/Amsterdam': { city: 'amsterdam', lat: 52.37, lon: 4.9, hops: ['amsterdam ix', ...VIA_EUROPE] },
  'Europe/Madrid': { city: 'madrid', lat: 40.42, lon: -3.7, hops: ['madrid ix', ...VIA_EUROPE] },
  'Europe/Rome': { city: 'rome', lat: 41.9, lon: 12.5, hops: ['milan ix', ...VIA_EUROPE] },
  'Europe/Stockholm': { city: 'stockholm', lat: 59.33, lon: 18.07, hops: ['frankfurt ix', ...VIA_EUROPE] },
  'Europe/Moscow': { city: 'moscow', lat: 55.76, lon: 37.62, hops: ['frankfurt ix', ...VIA_EUROPE] },
  'Europe/Istanbul': { city: 'istanbul', lat: 41.01, lon: 28.98, hops: VIA_EUROPE },
  'Africa/Cairo': { city: 'cairo', lat: 30.04, lon: 31.24, hops: ['jeddah', ...VIA_MUMBAI] },
  'Africa/Lagos': { city: 'lagos', lat: 6.52, lon: 3.38, hops: ['lisbon', ...VIA_EUROPE] },
  'Africa/Nairobi': { city: 'nairobi', lat: -1.29, lon: 36.82, hops: ['mombasa', ...VIA_MUMBAI] },
  'Africa/Johannesburg': { city: 'johannesburg', lat: -26.2, lon: 28.05, hops: ['mombasa', ...VIA_MUMBAI] },
  'America/New_York': { city: 'new york', lat: 40.71, lon: -74.01, hops: VIA_US_EAST },
  'America/Toronto': { city: 'toronto', lat: 43.65, lon: -79.38, hops: VIA_US_EAST },
  'America/Chicago': { city: 'chicago', lat: 41.88, lon: -87.63, hops: ['chicago ix', ...VIA_US_EAST] },
  'America/Denver': { city: 'denver', lat: 39.74, lon: -104.99, hops: ['denver', ...VIA_US_WEST] },
  'America/Los_Angeles': { city: 'los angeles', lat: 34.05, lon: -118.24, hops: VIA_US_WEST },
  'America/Vancouver': { city: 'vancouver', lat: 49.28, lon: -123.12, hops: ['seattle ix', 'tokyo ix', ...VIA_SINGAPORE] },
  'America/Mexico_City': { city: 'mexico city', lat: 19.43, lon: -99.13, hops: ['dallas ix', ...VIA_US_WEST] },
  'America/Sao_Paulo': { city: 'são paulo', lat: -23.55, lon: -46.63, hops: ['fortaleza', 'lisbon', ...VIA_EUROPE] },
  'America/Argentina/Buenos_Aires': { city: 'buenos aires', lat: -34.6, lon: -58.38, hops: ['são paulo ix', 'fortaleza', 'lisbon', ...VIA_EUROPE] },
};

const SOMEWHERE = { city: 'somewhere', lat: null, lon: null, hops: ['somewhere', ...VIA_MUMBAI] };

/** @returns {string} */
export function timeZone() {
  if (flags.tz) return flags.tz;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * @returns {{ zone: string, city: string, lat: number|null, lon: number|null, hops: string[], known: boolean }}
 */
export function whereAmI() {
  const zone = timeZone();
  const entry = ZONES[zone];
  if (!entry) return { zone, ...SOMEWHERE, known: false };
  return { zone, ...entry, hops: ['your city', ...entry.hops], known: true };
}
