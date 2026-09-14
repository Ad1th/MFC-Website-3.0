import * as doors from './DoorsWorld.jsx';
import * as stairs from './StairsWorld.jsx';
import * as hex from './HexWorld.jsx';
import * as qr from './QrWorld.jsx';
import * as tape from './TapeWorld.jsx';

/**
 * One mini-world per project, keyed by slug. Each module exports:
 *   default     the world (props: progressRef, origin, colours, tier)
 *   fox         (p, pose, input) the fox in world-local space, p the world's own 0 to 1
 *   camera      (p, cam) the camera in world-local space
 *   background  the world's air colour
 */
export const WORLDS = {
  'roommate-dhoondo': doors,
  'enrollment-portal': stairs,
  'tech-wars': hex,
  soty: qr,
  'code-to-survive': tape,
};

/** The world for a project; a project added in projects.json without its own world gets the doors. */
export function worldFor(slug) {
  return WORLDS[slug] ?? doors;
}
