import { Vector3 } from 'three';
import { events } from '../../content/index.js';
import { ease, window01 } from '../rooms/labels.js';

/**
 * S07 The Spiral: where the embers are and when things happen. Pure functions of the scene's
 * progress, shared by the scene, the embers, the flagship moments and the tests.
 *
 * The helix climbs from the bottom (newest event) to the top (oldest). Its radius grows with
 * height, so from above it reads as a spiral: the fire galaxy. Everything is built in the spiral's
 * local space and the whole set spins about its axis at the top, so world positions go through
 * `toWorld` with the current spin.
 *
 *   entry  a flash hides the cut in from the gallery
 *   climb  the fox runs the helix; each flagship pins the climb for about 40vh (a hold)
 *   rise   the camera lifts above the helix and looks down while it spins into a galaxy
 *   still  one beat of stillness (30vh)
 *   fall   one ember drops from the top and the fox dives after it
 */

export const SPIRAL_ORIGIN = new Vector3(0, -14000, 0);
export const HEIGHT = 34;
const TURNS = 4.25;
const SCENE_VH = 680;
const HOLD = 40 / SCENE_VH;

export const BEATS = {
  entry: 0.012,
  climb: [0.02, 0.8],
  rise: [0.8, 0.9],
  still: [0.9, 0.944],
  fall: [0.944, 1],
};

export const SOTY = 'scavenger-of-the-year';

/** Radius grows with height, so the helix seen from above is a spiral. */
export const radiusAt = (s) => 2.5 + 7.5 * s;
export const angleAt = (s) => s * TURNS * Math.PI * 2;

/** A point on the helix at s (0 bottom, 1 top), in the spiral's local space. */
export function helixLocal(s, out = new Vector3()) {
  const a = angleAt(s);
  const r = radiusAt(s);
  return out.set(Math.cos(a) * r, s * HEIGHT, Math.sin(a) * r);
}

/** Local to world: spin about the spiral's axis, then move to its origin. */
export function toWorld(local, spin, out = new Vector3()) {
  const c = Math.cos(spin);
  const s = Math.sin(spin);
  return out.set(local.x * c + local.z * s, local.y, -local.x * s + local.z * c).add(SPIRAL_ORIGIN);
}

const scratch = new Vector3();
export function helixWorld(s, spin, out = new Vector3()) {
  return toWorld(helixLocal(s, scratch), spin, out);
}

/** One ember per event, newest at the bottom (events.json is newest first). */
export const EMBERS = events.map((event, i) => ({ event, s: (i + 0.6) / (events.length + 0.2) }));

/** The climb as segments: runs between flagships, and a pinned hold at each flagship ember. */
const SEGMENTS = (() => {
  const flagships = EMBERS.filter((e) => e.event.flagship);
  const [a, b] = BEATS.climb;
  const runTotal = b - a - flagships.length * HOLD;
  const out = [];
  let p = a;
  let s = 0;
  for (const ember of flagships) {
    const run = (ember.s - s) * runTotal;
    out.push({ kind: 'run', p0: p, p1: p + run, s0: s, s1: ember.s });
    p += run;
    s = ember.s;
    out.push({ kind: 'hold', p0: p, p1: p + HOLD, s0: s, s1: s, slug: ember.event.slug });
    p += HOLD;
  }
  out.push({ kind: 'run', p0: p, p1: b, s0: s, s1: 1 });
  return out;
})();

/** The flagship holds, for tests and the scene. */
export const HOLDS = SEGMENTS.filter((seg) => seg.kind === 'hold').map(({ p0, p1, slug }) => ({ p0, p1, slug }));

/**
 * Where the fox is on the helix at scene progress p, and whether a flagship holds it.
 * @returns {{ s: number, hold: string|null, holdT: number }}
 */
export function climbAt(p) {
  if (p <= BEATS.climb[0]) return { s: 0, hold: null, holdT: 0 };
  if (p >= BEATS.climb[1]) return { s: 1, hold: null, holdT: 0 };
  for (const seg of SEGMENTS) {
    if (p < seg.p1) {
      const t = window01(p, seg.p0, seg.p1);
      if (seg.kind === 'hold') return { s: seg.s0, hold: seg.slug, holdT: t };
      return { s: seg.s0 + (seg.s1 - seg.s0) * t, hold: null, holdT: 0 };
    }
  }
  return { s: 1, hold: null, holdT: 0 };
}

/** The helix turns into a galaxy as the camera rises; still during the beat of stillness and the fall. */
export const spinAt = (p) => ease(window01(p, BEATS.rise[0], BEATS.rise[1])) * Math.PI * 0.9;

/** An envelope over a hold: in over the first 12%, out over the last 12%. */
export const holdEnvelope = (t) => window01(t, 0, 0.12) * (1 - window01(t, 0.88, 1));

/** The falling ember at fall time t (0 to 1), in world space. */
export function fallingEmber(t, spin, out = new Vector3()) {
  helixWorld(1, spin, out);
  out.y -= (HEIGHT + 30) * t * t;
  return out;
}
