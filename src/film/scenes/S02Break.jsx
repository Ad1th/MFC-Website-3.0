import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { film } from '../store.js';
import Shatter from '../shatter/Shatter.jsx';
import { FILM_TEST, shatterOverride } from '../testHooks.js';
import { registerShot } from '../camera/shots.js';
import { coldOpenShot } from './S01ColdOpen.jsx';

/**
 * S02 The Break. The hero page (logo, HUD, title) is drawn once into a 2D canvas and
 * painted by the film as an intact plane in front of the camera from the start of the
 * film until impact. At impact the plane is replaced by its Voronoi shards, which fly
 * past the camera. Everything is a function of scroll: scrolling back above the impact
 * reassembles the page. See D-061 for why the film, not the compositor, paints the page.
 */

export const IMPACT = 0.1;
const FLIGHT = 2.2;
const PUSH = 6;

/** Starts exactly where S01 ends, then the camera is sucked forward through the hole. */
function breakShot(progress, out, aspect) {
  coldOpenShot(1, out, aspect);
  const t = Math.max(0, progress - IMPACT) / (1 - IMPACT);
  const forward = out.target.clone().sub(out.position).normalize();
  const push = PUSH * t * t;
  out.position.addScaledVector(forward, push);
  out.target.addScaledVector(forward, push);
}

export default function S02Break({ index }) {
  const state = useRef({ intact: true, t: 0, visible: true });
  useEffect(() => registerShot('S02', breakShot), []);

  if (FILM_TEST) {
    window.__filmTest.breakState = () => ({ ...state.current });
  }

  // Priority -2 runs before Shatter's own frame callback and before render.
  useFrame(() => {
    const s = film.getState();
    let shattered;
    let t;
    if (s.activeScene > index) {
      shattered = true;
      t = FLIGHT;
    } else if (s.activeScene < index) {
      shattered = false;
      t = 0;
    } else {
      shattered = s.sceneProgress >= IMPACT;
      t = (Math.max(0, s.sceneProgress - IMPACT) / (1 - IMPACT)) * FLIGHT;
    }
    const override = shatterOverride();
    if (override !== null) {
      shattered = override;
      t = 0;
    }
    state.current.intact = !shattered;
    state.current.t = t;
    // Tests that measure the world behind the page can take the page away.
    state.current.visible = t < FLIGHT && !(FILM_TEST && window.__filmTest.hidePage);
  }, -2);

  return <Shatter stateRef={state} />;
}
