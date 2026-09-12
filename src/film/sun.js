import { Vector3 } from 'three';

/**
 * The real sun for the globe. Returns the subsolar point (where the sun is overhead)
 * for a moment in UTC, using the NOAA low-precision solar position (about 0.01° in
 * declination and a few seconds in the equation of time, far below a pixel on the globe).
 * Cross-checked against suncalc in scripts/check-sun.mjs.
 */

const RAD = Math.PI / 180;

/**
 * @param {Date} date
 * @returns {{ lat: number, lon: number }} degrees
 */
export function subsolarPoint(date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const meanLon = (280.46 + 0.9856474 * n) % 360;
  const meanAnomaly = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const eclipticLon = (meanLon + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * RAD;
  const obliquity = (23.439 - 0.0000004 * n) * RAD;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLon));
  const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLon), Math.cos(eclipticLon));
  // Greenwich mean sidereal time in degrees.
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;
  let lon = rightAscension / RAD - gmst;
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  return { lat: declination / RAD, lon };
}

/**
 * Unit vector on the globe for a latitude and longitude. Convention shared by every
 * globe feature: +y is north, the prime meridian faces +z, east longitude turns toward +x.
 * It matches an equirectangular texture on three's SphereGeometry rotated by -90° in y.
 * @param {number} lat degrees
 * @param {number} lon degrees
 * @param {Vector3} [target]
 */
export function latLonToVector(lat, lon, target = new Vector3()) {
  const phi = lat * RAD;
  const lambda = lon * RAD;
  return target.set(Math.cos(phi) * Math.sin(lambda), Math.sin(phi), Math.cos(phi) * Math.cos(lambda));
}

/** Globe-space direction toward the sun right now. */
export function sunDirection(date = new Date(), target = new Vector3()) {
  const { lat, lon } = subsolarPoint(date);
  return latLonToVector(lat, lon, target);
}
