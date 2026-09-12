import { Suspense, useEffect } from 'react';
import { useFilm } from '../store.js';
import Globe from '../globe/Globe.jsx';
import { registerShot } from '../camera/shots.js';

/**
 * S01 Cold Open. Wide on the live globe turning in space, then a slow push in.
 * This first pass is the globe beat and the camera; the lensed title, your arc, the fox
 * orbit, bullet time and the jump land in the following passes.
 */

export const GLOBE_RADIUS = 3;

const START = { position: [0.4, 0.9, 13.5], target: [0, 0.15, 0], fov: 32 };
const END = { position: [0.1, 0.35, 9.2], target: [0, 0.05, 0], fov: 36 };

const ease = (t) => t * t * (3 - 2 * t);

/** @type {import('../camera/shots.js').Shot} */
export function coldOpenShot(progress, out) {
  const t = ease(Math.min(Math.max(progress, 0), 1));
  out.position.set(
    START.position[0] + (END.position[0] - START.position[0]) * t,
    START.position[1] + (END.position[1] - START.position[1]) * t,
    START.position[2] + (END.position[2] - START.position[2]) * t,
  );
  out.target.set(
    START.target[0] + (END.target[0] - START.target[0]) * t,
    START.target[1] + (END.target[1] - START.target[1]) * t,
    START.target[2] + (END.target[2] - START.target[2]) * t,
  );
  out.fov = START.fov + (END.fov - START.fov) * t;
  out.roll = 0;
}

export default function S01ColdOpen() {
  const tier = useFilm((s) => s.quality);
  useEffect(() => registerShot('S01', coldOpenShot), []);
  return (
    <Suspense fallback={null}>
      <Globe tier={tier} scale={GLOBE_RADIUS} rotation={[0.41, 0, 0]} />
    </Suspense>
  );
}
