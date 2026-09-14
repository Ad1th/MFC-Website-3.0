import { Matrix4, Vector3 } from 'three';
import { latLonToVector } from '../sun.js';
import { greatCircle } from '../globe/GlobeArc.jsx';
import { GLOBE_FACING, GLOBE_RADIUS } from '../scenes/S01ColdOpen.jsx';
import { whereAmI } from '../../live/whereami.js';
import { site } from '../../content/index.js';

/**
 * S10 The Return, and S11 below it. Two sets, each its own world like the dive's: the sky the fox
 * climbs back out of, and the orbit where the page reassembles, the fox curls into the logo and
 * (S11) the end card floor lies under the planet. The orbit globe does not spin, so the fox's
 * delivery run can follow a fixed route on it.
 */

export const RETURN_SKY = new Vector3(0, -20000, 0);
export const RETURN_SPACE = new Vector3(0, -21000, 0);
export const GLOBE_TILT = 0.41;

/** Hidden cuts (camera and fox trail restart at each). */
export const CUT_HILL = 50;
export const CUT_SKY = 101;
export const CUT_SPACE = 102;

/** Where the camera holds for the form: the planet and the logo above, the form backdrop below. */
export const HOLD = {
  position: new Vector3(0, 0.7, 12.5).add(RETURN_SPACE),
  target: new Vector3(0, -0.35, 0).add(RETURN_SPACE),
  fov: 36,
};

/** The reassembled page, the form's backdrop: a wide pane in front of the lower planet. */
export const FORM_PANE = { centre: new Vector3(0, -1.57, 5.4).add(RETURN_SPACE), width: 7.8, height: 1.2 };

const GLOBE_MATRIX = new Matrix4()
  .makeRotationX(GLOBE_TILT)
  .multiply(new Matrix4().makeRotationY((-GLOBE_FACING * Math.PI) / 180))
  .premultiply(new Matrix4().makeScale(GLOBE_RADIUS, GLOBE_RADIUS, GLOBE_RADIUS))
  .setPosition(RETURN_SPACE);

/** Globe space (unit sphere, prime meridian on +z) to world, for the orbit globe. */
export function globeToWorld(unit, out = new Vector3()) {
  return out.copy(unit).applyMatrix4(GLOBE_MATRIX);
}

let route = null;

/**
 * The delivery route: the same great circle the S01 arc draws, from the viewer's city to
 * Vellore, in world space on the orbit globe. An unknown timezone starts from a point north
 * west of Vellore on the camera's side, so the run still reads.
 * @returns {{ world: Vector3[], known: boolean }}
 */
export function deliveryRoute() {
  if (route) return route;
  const here = whereAmI();
  const to = latLonToVector(site.campus.lat, site.campus.lon);
  const known = here.lat !== null;
  const from = known ? latLonToVector(here.lat, here.lon) : latLonToVector(site.campus.lat + 24, site.campus.lon - 38);
  const lift = 0.03 + 0.12 * (from.angleTo(to) / Math.PI);
  const world = greatCircle(from, to, 64, lift).map((p) => globeToWorld(p));
  route = { world, known };
  return route;
}

const ahead = new Vector3();

/** Position, forward and up on the route at t (0 at the viewer's city, 1 at Vellore). */
export function routeFrame(t, position, forward, up, direction = 1) {
  const { world } = deliveryRoute();
  const f = Math.min(Math.max(t, 0), 1) * (world.length - 1);
  const i = Math.min(Math.floor(f), world.length - 2);
  position.lerpVectors(world[i], world[i + 1], f - i);
  up.copy(position).sub(RETURN_SPACE).normalize();
  ahead.subVectors(world[i + 1], world[i]).multiplyScalar(direction);
  forward.copy(ahead).addScaledVector(up, -ahead.dot(up)).normalize();
  return position;
}
