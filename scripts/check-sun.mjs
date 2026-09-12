#!/usr/bin/env node
/**
 * Cross-check src/film/sun.js against suncalc: at the computed subsolar point the sun's
 * altitude must be within 0.5° of 90°, at dates across the year and the day.
 * Usage: node scripts/check-sun.mjs
 */
import { createRequire } from 'node:module';
import { subsolarPoint } from '../src/film/sun.js';

const SunCalc = createRequire(import.meta.url)('suncalc');
const DATES = ['2026-03-20T09:46:00Z', '2026-06-21T00:00:00Z', '2026-09-13T06:30:00Z', '2026-12-21T18:00:00Z', '2027-02-01T12:00:00Z'];

let worst = 0;
for (const iso of DATES) {
  const date = new Date(iso);
  const { lat, lon } = subsolarPoint(date);
  // suncalc documents radians, but the installed 2.0.2 build returns degrees; accept either.
  const raw = SunCalc.getPosition(date, lat, lon).altitude;
  const altitude = Math.abs(raw) > Math.PI ? raw : (raw * 180) / Math.PI;
  worst = Math.max(worst, Math.abs(90 - altitude));
  console.log(`${iso}  subsolar ${lat.toFixed(2)}, ${lon.toFixed(2)}  suncalc altitude ${altitude.toFixed(3)}°`);
}
console.log(`worst error ${worst.toFixed(3)}°`);
process.exit(worst < 0.5 ? 0 : 1);
