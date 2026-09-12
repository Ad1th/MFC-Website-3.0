import { Suspense, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { film, useFilm } from '../store.js';
import Globe from '../globe/Globe.jsx';
import GlobeArc from '../globe/GlobeArc.jsx';
import EventStars from '../globe/EventStars.jsx';
import LensedTitle from '../globe/LensedTitle.jsx';
import { registerShot } from '../camera/shots.js';
import { getScenes } from '../scroll.js';

/**
 * S01 Cold Open. Wide on the live globe turning in space, the title set huge behind the
 * planet and bent around its limb, the Milky Way of event names, and your arc drawn from
 * your city to Vellore. The fox orbit, bullet time and the jump land in the next pass.
 *
 * Beats by sceneProgress:
 *   0.00 to 0.05  hold wide
 *   0.05 to 0.35  your arc draws
 *   0.05 to 1.00  slow push in
 */

export const GLOBE_RADIUS = 3;
export const GLOBE_CENTRE = new Vector3(0, 0, 0);
/** Longitude turned to the camera at the start: India and Vellore sit right of centre. */
export const GLOBE_FACING = 55;

const START = { position: [0.4, 0.9, 13.5], target: [0, 0.15, 0], fov: 32 };
const END = { position: [0.1, 0.35, 9.2], target: [0, 0.05, 0], fov: 36 };

const ease = (t) => t * t * (3 - 2 * t);
const window01 = (p, a, b) => Math.min(Math.max((p - a) / (b - a), 0), 1);

/** @type {import('../camera/shots.js').Shot} */
export function coldOpenShot(progress, out, aspect = 16 / 9) {
  const t = ease(window01(progress, 0.05, 1));
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
  // Narrow screens: pull back along the view line so the planet keeps its width in frame.
  const fit = Math.max(1, 0.85 / aspect);
  if (fit > 1) out.position.sub(out.target).multiplyScalar(fit).add(out.target);
}

/** This scene's progress, or 0 before it and 1 after it (so scrolling back rewinds cleanly). */
function localProgress() {
  const { activeScene, sceneProgress } = film.getState();
  const index = getScenes().findIndex((scene) => scene.id === 'S01');
  if (activeScene < index) return 0;
  if (activeScene > index) return 1;
  return sceneProgress;
}

export default function S01ColdOpen() {
  const tier = useFilm((s) => s.quality);
  const arcProgress = useRef(0);
  useEffect(() => registerShot('S01', coldOpenShot), []);

  useFrame(() => {
    arcProgress.current = ease(window01(localProgress(), 0.05, 0.35));
  });

  return (
    <>
      <EventStars count={tier >= 3 ? 2200 : tier === 2 ? 1400 : 700} />
      <LensedTitle globeCentre={GLOBE_CENTRE} globeRadius={GLOBE_RADIUS} position={[0, -0.6, -16]} width={64} />
      <Suspense fallback={null}>
        <Globe tier={tier} scale={GLOBE_RADIUS} rotation={[0.41, 0, 0]} facing={GLOBE_FACING}>
          <GlobeArc progressRef={arcProgress} />
        </Globe>
      </Suspense>
    </>
  );
}
