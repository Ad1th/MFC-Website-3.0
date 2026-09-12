import { Vector3 } from 'three';
import { projects } from '../../content/index.js';
import { clamp01, window01 } from '../rooms/labels.js';

/**
 * S06 The Gallery: where things stand and when things happen. Pure functions of the scene's
 * progress, shared by the scene (camera and fox), the slabs, the shatter and the tests.
 *
 * The floor is at GALLERY_ORIGIN.y. Slab i stands on a long curve, its front facing back toward
 * where the fox comes from. Each slab owns a fifth of the scene:
 *   approach  the fox runs from the last slab's back (or the scene's entry) to this slab's front
 *   spin      the camera orbits 180 degrees while the fox circles the slab the other way
 *   dive      the fox leaps into the glass and the camera follows it through
 *   world     the project's mini-world at its own origin (hidden cuts at cutIn and cutOut)
 *   exit      the fox bursts out of the back face; the slab shatters into the next one
 * On phones only slab 01 dives; the others spin longer and the fox runs round to the back.
 */

export const GALLERY_ORIGIN = new Vector3(0, -12000, 0);
export const SLAB_COUNT = projects.length;
export const SLAB_SIZE = { width: 6, height: 3.4, depth: 0.35 };
/** Height of a slab's centre above the floor. */
export const SLAB_Y = 2.3;
const SPACING = 42;
const SWAY = 9;

export const BEATS = {
  approach: [0, 0.1],
  spin: [0.1, 0.38],
  cutIn: 0.445,
  cutOut: 0.865,
  shatter: [0.9, 1],
};

/** Phones, slabs 02 to 05: the spin runs to here, then the fox runs round to the back. */
export const MOBILE_SPIN_END = 0.7;

/** Which slab plays at a scene progress, and that slab's own progress. */
export function slabAt(progress) {
  const p = clamp01(progress);
  const index = Math.min(SLAB_COUNT - 1, Math.floor(p * SLAB_COUNT));
  return { index, local: window01(p, index / SLAB_COUNT, (index + 1) / SLAB_COUNT) };
}

export function dives(index, mobile) {
  return !mobile || index === 0;
}

function baseX(i) {
  return Math.sin(i * 0.9) * SWAY;
}

/** Slab i faces back along the curve, toward the slab before it. */
export function slabYaw(i) {
  if (i <= 0) return 0;
  return Math.atan2(baseX(i - 1) - baseX(i), SPACING);
}

/**
 * A point in slab i's frame: x to the slab's right, y up from the floor, z out of its front face.
 * @returns {Vector3}
 */
export function slabFrame(i, x, y, z, out = new Vector3()) {
  const yaw = slabYaw(i);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return out.set(baseX(i) + x * c + z * s, y, -i * SPACING - x * s + z * c).add(GALLERY_ORIGIN);
}

/** How high the shards arc on their way to the next slab. */
export const SHARD_LIFT = 4;

/** Where slab i's shards end up: the next slab's face, or up into the dark after the last. */
export function shardTarget(i, out = new Vector3()) {
  return i + 1 < SLAB_COUNT ? slabFrame(i + 1, 0, SLAB_Y, 0, out) : slabFrame(i, 0, SLAB_Y + 16, -30, out);
}

/** The centre of slab i's flying shards at shatter time t (0 to 1), matching SlabShatter's shader. */
export function shardFlight(i, t, out = new Vector3()) {
  const x = Math.min(Math.max((t - 0.15) / 0.85, 0), 1);
  const travel = x * x * (3 - 2 * x);
  const lift = i + 1 < SLAB_COUNT ? SHARD_LIFT : 0;
  const tx = shardTarget(i, out).x;
  const ty = out.y;
  const tz = out.z;
  slabFrame(i, 0, SLAB_Y, 0, out);
  return out.set(out.x + (tx - out.x) * travel, out.y + (ty - out.y) * travel + Math.sin(Math.PI * travel) * lift, out.z + (tz - out.z) * travel);
}

/** Mini-world origins, far below the gallery and each other. */
export function worldOrigin(i, out = new Vector3()) {
  return out.set(0, GALLERY_ORIGIN.y - 600 - i * 300, 0);
}
