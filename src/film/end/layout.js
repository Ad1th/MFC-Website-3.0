import { Vector3 } from 'three';
import { RETURN_SPACE } from '../return/layout.js';

/**
 * S11 End Card, in the orbit set under S10's planet: a black floor with FIREFOX burned into it,
 * a small globe behind the word for the zoomies, and the O the fox sleeps on.
 */

export const FLOOR_Y = RETURN_SPACE.y - 6;

export const WORDMARK = {
  text: 'FIREFOX',
  centre: new Vector3(RETURN_SPACE.x, FLOOR_Y + 0.002, RETURN_SPACE.z + 1.2),
  width: 12,
  height: 3,
};

/** The O's centre in the wordmark's uv, measured from the font once it has loaded (Wordmark.jsx). */
export const oMark = { u: 0.66, v: 0.5 };

/** World point on the floor at the O's centre. */
export function oWorld(out = new Vector3()) {
  return out.set(WORDMARK.centre.x + (oMark.u - 0.5) * WORDMARK.width, FLOOR_Y, WORDMARK.centre.z + (0.5 - oMark.v) * WORDMARK.height);
}

/** Floor point to wordmark uv (u across, v up the word's height), or null off the word. */
export function floorToUv(point) {
  const u = (point.x - (WORDMARK.centre.x - WORDMARK.width / 2)) / WORDMARK.width;
  const v = (WORDMARK.centre.z + WORDMARK.height / 2 - point.z) / WORDMARK.height;
  return { u, v, inside: u >= 0 && u <= 1 && v >= 0 && v <= 1 };
}

export const MINI_GLOBE = { centre: new Vector3(RETURN_SPACE.x, FLOOR_Y + 0.62, RETURN_SPACE.z - 1.6), radius: 0.5, lap: 1.35 };

export const END_VIEW = {
  position: new Vector3(0, 2.2, 8.6).add(RETURN_SPACE),
  target: new Vector3(0, -6, 0.9).add(RETURN_SPACE),
  fov: 42,
};
