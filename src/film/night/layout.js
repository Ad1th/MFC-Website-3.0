import { Vector3 } from 'three';
import { site, team, years } from '../../content/index.js';

/**
 * S09 The Sky: where every star is. The camera sits on a hilltop looking up at the sky; the
 * faculty coordinator is the north star (the pole), and the whole sky turns about it. Each board
 * year owns one sector around the pole; turning the sky by a sector brings the next year's
 * constellations round to the front while the last one sweeps away. Members are grouped into
 * constellations by domain, at fixed distances from the pole:
 *   core        closest to the pole
 *   technical   a middle band, left
 *   design      the same band, right
 *   management  a wide low arc
 *   mentor      at the sector's edge
 * All positions are unit directions from the eye, in the sky's own frame (before it turns).
 */

const DEG = Math.PI / 180;

export const SKY_ORIGIN = new Vector3(0, -18000, 0);
/** The eye, in the scene's local space: a little above the hilltop, looking north into the sky. */
export const EYE = new Vector3(0, 1.6, 12);
export const SKY_RADIUS = 70;

const POLE_ALTITUDE = 44 * DEG;
/** The north star's direction from the eye (ahead is -z). */
export const POLE = new Vector3(0, Math.sin(POLE_ALTITUDE), -Math.cos(POLE_ALTITUDE)).normalize();
/** From the pole down toward the horizon in front of the eye; orthogonal to POLE. */
const FRONT = new Vector3(0, -Math.cos(POLE_ALTITUDE), -Math.sin(POLE_ALTITUDE)).normalize();

export const YEARS = years;
export const SECTOR = (Math.PI * 2) / years.length;

/** A direction psi radians from the pole, turned phi about it (phi 0 is straight down in front). */
export function skyDirection(psi, phi, out = new Vector3()) {
  out.copy(POLE).multiplyScalar(Math.cos(psi)).addScaledVector(FRONT, Math.sin(psi));
  return out.applyAxisAngle(POLE, phi);
}

/** The sky angle that brings year index i to the front. */
export const angleForYear = (i) => -i * SECTOR;

// psi is the distance from the pole; step spreads a constellation around the pole (wider near it).
const BANDS = {
  core: { psi: 14 * DEG, centre: 0, step: 0.3 },
  technical: { psi: 24 * DEG, centre: -0.62, step: 0.22 },
  design: { psi: 24 * DEG, centre: 0.62, step: 0.22 },
  management: { psi: 34 * DEG, centre: 0, step: 0.2 },
  mentor: { psi: 29 * DEG, centre: 1.0, step: 0.16 },
};

/**
 * Every star: faculty, one per member of every year, and the empty star in the newest year.
 * @type {Array<{ key: string, kind: 'faculty'|'member'|'empty', yearIndex: number, year: string|null, member: object|null, group: string|null, dir: Vector3 }>}
 */
export const STARS = (() => {
  const out = [{ key: 'faculty', kind: 'faculty', yearIndex: -1, year: null, member: team.faculty, group: null, dir: POLE.clone() }];
  years.forEach((year, yearIndex) => {
    const members = team.years[year];
    const groups = {};
    members.forEach((member, index) => {
      const group = BANDS[member.domain] ? member.domain : 'management';
      (groups[group] ??= []).push({ member, index });
    });
    for (const [group, list] of Object.entries(groups)) {
      const band = BANDS[group];
      list.forEach(({ member, index }, k) => {
        const phi = yearIndex * SECTOR + band.centre + (k - (list.length - 1) / 2) * band.step;
        // Alternate a little closer and further so a row reads as a constellation, not a line.
        const psi = band.psi + (k % 2 ? 2.5 : -2.5) * DEG;
        out.push({ key: `${year}:${index}`, kind: 'member', yearIndex, year, member, group, dir: skyDirection(psi, phi) });
      });
    }
    if (yearIndex === 0) {
      const band = BANDS.management;
      const count = groups.management?.length ?? 0;
      const phi = band.centre + ((count + 1 - (count - 1) / 2) * band.step);
      out.push({ key: 'empty', kind: 'empty', yearIndex: 0, year, member: null, group: 'management', dir: skyDirection(band.psi, phi) });
    }
  });
  return out;
})();

/** Lines between neighbouring members of the same constellation (indices into STARS). */
export const LINES = (() => {
  const pairs = [];
  let previous = null;
  STARS.forEach((star, i) => {
    if (star.kind !== 'member') return;
    if (previous && previous.star.year === star.year && previous.star.group === star.group) pairs.push([previous.i, i]);
    previous = { star, i };
  });
  return pairs;
})();

export const RECRUITMENT_URL = site.recruitmentUrl;

/** The line across the sky sits still while the sky turns: up and to the left of the view. */
export const SKY_LINE_DIRECTION = new Vector3(Math.sin(-24 * DEG) * Math.cos(38 * DEG), Math.sin(38 * DEG), -Math.cos(-24 * DEG) * Math.cos(38 * DEG)).normalize();
