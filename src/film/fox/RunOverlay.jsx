import '../threeConsole.js';
import { Suspense, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame } from '@react-three/fiber';
import { Quaternion, Vector3 } from 'three';
import Fox from './Fox.jsx';

/**
 * `fox.run()` (console.js): the fox runs across the whole viewport, over the DOM, from the left
 * edge to the right and gone. A fixed, pointer-events-none overlay with its own small canvas and
 * the same fox; it unmounts itself when the run is over.
 */

const RUN_SECONDS = 2.6;

function Runner({ onDone }) {
  const start = useRef(null);
  const input = useRef({ velocity: 1400, idleSeconds: 0, hint: 'run', forced: null, scripted: true, speed: 0, look: null, lookWeight: 0, petting: false, wind: new Vector3(), timeScale: 1, scenePose: null, eyeOverride: null, flame: 1 });
  const anchor = useRef({ position: new Vector3(), quaternion: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2), scale: 1.1, visible: true });
  const done = useRef(false);

  useFrame((state) => {
    if (start.current === null) start.current = state.clock.elapsedTime;
    const t = (state.clock.elapsedTime - start.current) / RUN_SECONDS;
    const halfWidth = (state.viewport.width / 2) * 1.25;
    anchor.current.position.set(-halfWidth + t * halfWidth * 2, -state.viewport.height * 0.3 + Math.abs(Math.sin(t * Math.PI * 7)) * 0.15, 0);
    if (t >= 1 && !done.current) {
      done.current = true;
      onDone();
    }
  });

  return (
    <Suspense fallback={null}>
      <Fox approach="C" tier={2} input={input} trail anchor={anchor.current} />
    </Suspense>
  );
}

/** @returns {Promise<void>} resolves when the fox has run off */
export function mountRunOverlay() {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    Object.assign(host.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '900' });
    document.body.appendChild(host);
    const root = createRoot(host);
    const finish = () => {
      window.setTimeout(() => {
        root.unmount();
        host.remove();
        resolve();
      }, 400);
    };
    root.render(
      <Canvas gl={{ alpha: true, antialias: true }} camera={{ position: [0, 0, 10], fov: 40 }} dpr={[1, 1.5]} style={{ pointerEvents: 'none' }}>
        <Runner onDone={finish} />
      </Canvas>,
    );
  });
}
