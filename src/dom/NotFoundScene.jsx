import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, Color, Matrix4, Quaternion, ShaderMaterial, Vector3 } from 'three';
import Fox from '../film/fox/Fox.jsx';
import { PALETTE } from '../film/palette.js';
import { FILM_TEST } from '../film/testHooks.js';
import '../film/threeConsole.js';

/**
 * The 404. Pitch dark; the fox walks back and forth holding a tiny torch flame, searching. The
 * cursor is the only other light. When the two lights meet the fox drops the torch, sits and wags,
 * relieved to have found someone. With no cursor (touch) it finds you after a few seconds.
 * `leaveRef.current()` sends it running off before the page goes home.
 */

const FOUND_PX = 110;
const TOUCH_FIND_MS = 3500;
const FLOOR = -1.1;
const ROAM = 2.6;
const SCALE = 0.55;

const EMBER_VERTEX = /* glsl */ `
  uniform float uPixelRatio;
  uniform float uSize;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * uPixelRatio;
  }
`;

const EMBER_FRAGMENT = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uFire;
  uniform float uGlow;
  uniform float uTime;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    // A flame: taller than wide, flickering.
    p.y *= 0.75 + 0.08 * sin(uTime * 17.0);
    float d = dot(p, p);
    if (d > 1.0) discard;
    vec3 color = uCore * exp(-d * 12.0) * 2.0 + uFire * exp(-d * 2.6) * (0.8 + 0.2 * sin(uTime * 11.0));
    gl_FragColor = vec4(color * uGlow, 1.0);
    #include <colorspace_fragment>
  }
`;

const basis = new Matrix4();
const left = new Vector3();
const upAxis = new Vector3();
const projected = new Vector3();

function Searcher({ pointer, leaveRef, onFound }) {
  const { size } = useThree();
  const foxRef = useRef(null);
  const torchRef = useRef(null);
  const input = useRef({ velocity: 300, idleSeconds: 0, hint: 'run', forced: null, scripted: true, speed: 0, look: null, lookWeight: 0, petting: false, wind: new Vector3(), timeScale: 1, scenePose: null, eyeOverride: null, flame: 1 });
  const anchor = useMemo(() => ({ position: new Vector3(0, FLOOR, 0), quaternion: new Quaternion(), scale: SCALE, visible: true }), []);
  const walk = useRef({ x: -ROAM, dir: 1, found: false, foundAt: 0, leaving: false, leftAt: 0, lastWag: 0, torch: new Vector3(), torchFall: 0, start: performance.now() });
  const forward = useMemo(() => new Vector3(1, 0, 0), []);
  const ember = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uCore: { value: new Color(PALETTE.flameCore) }, uFire: { value: new Color(PALETTE.fire) }, uGlow: { value: 1 }, uSize: { value: 26 }, uPixelRatio: { value: 1 }, uTime: { value: 0 } },
        vertexShader: EMBER_VERTEX,
        fragmentShader: EMBER_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [],
  );

  useEffect(() => {
    leaveRef.current = () => {
      walk.current.leaving = true;
      walk.current.leftAt = performance.now();
    };
    return () => {
      leaveRef.current = null;
      ember.dispose();
    };
  }, [leaveRef, ember]);

  useFrame((state, delta) => {
    const w = walk.current;
    const dt = Math.min(delta, 1 / 20);
    const now = performance.now();
    const fox = foxRef.current;
    const inp = input.current;

    if (w.leaving) {
      // Off to the right at a sprint, back to the globe.
      w.x += dt * 5;
      forward.set(1, 0, 0);
      inp.hint = 'run';
      inp.velocity = 1600;
    } else if (!w.found) {
      w.x += w.dir * dt * 0.7;
      if (Math.abs(w.x) > ROAM) w.dir = -Math.sign(w.x);
      forward.set(w.dir, 0, 0.15).normalize();
      inp.hint = 'run';
      inp.velocity = 260;
      // Searching: the head sweeps side to side.
      inp.look = new Vector3(w.x + w.dir * 2, FLOOR + 0.6 + Math.sin(now / 700) * 0.6, Math.sin(now / 900) * 2);
      inp.lookWeight = 0.7;
    } else {
      // Found: sit facing you, wag now and then.
      forward.lerp(new Vector3(0, 0, 1), Math.min(1, dt * 4)).normalize();
      inp.hint = 'sit';
      inp.velocity = 0;
      inp.look = state.camera.position;
      inp.lookWeight = 0.8;
      if (now - w.lastWag > 1400) {
        w.lastWag = now;
        fox?.trigger('wag', { intensity: 1 }, { force: true });
      }
    }

    anchor.position.set(w.x, FLOOR, 0);
    upAxis.set(0, 1, 0);
    left.crossVectors(upAxis, forward).normalize();
    basis.makeBasis(left, upAxis, forward);
    anchor.quaternion.setFromRotationMatrix(basis);

    // The torch rides in the mouth until the fox finds you, then drops and dims on the floor.
    const head = fox?.anchors?.().head;
    if (!w.found && head) w.torch.copy(head).addScaledVector(forward, 0.18);
    if (w.found) {
      w.torchFall = Math.min(1, w.torchFall + dt * 2.5);
      w.torch.y += (FLOOR + 0.05 - w.torch.y) * Math.min(1, dt * 8);
    }
    if (torchRef.current) torchRef.current.position.copy(w.torch);
    ember.uniforms.uGlow.value = 1 - 0.65 * w.torchFall;
    ember.uniforms.uTime.value = state.clock.elapsedTime;
    ember.uniforms.uPixelRatio.value = state.gl.getPixelRatio();

    // Do the lights meet? The cursor against the torch on screen; touch finds you after a while.
    if (!w.found && !w.leaving && head) {
      projected.copy(w.torch).project(state.camera);
      const x = ((projected.x + 1) / 2) * size.width;
      const y = ((1 - projected.y) / 2) * size.height;
      const p = pointer.current;
      const met = p.active ? Math.hypot(p.x - x, p.y - y) < FOUND_PX : now - w.start > TOUCH_FIND_MS;
      if (met) {
        w.found = true;
        w.foundAt = now;
        fox?.trigger('earsPerk', {}, { force: true });
        onFound();
      }
    }
    if (FILM_TEST) {
      window.__notFound = {
        found: w.found,
        leaving: w.leaving,
        torchScreen: () => {
          projected.copy(w.torch).project(state.camera);
          return { x: ((projected.x + 1) / 2) * size.width, y: ((1 - projected.y) / 2) * size.height };
        },
      };
    }
  }, -2);

  return (
    <>
      <Suspense fallback={null}>
        <Fox ref={foxRef} approach="C" tier={2} input={input} anchor={anchor} />
      </Suspense>
      <points ref={torchRef} material={ember} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[new Float32Array(3), 3]} />
        </bufferGeometry>
      </points>
    </>
  );
}

/** @param {{ pointer: { current: { x: number, y: number, active: boolean } }, leaveRef: { current: null|(() => void) }, onFound: () => void }} props */
export default function NotFoundScene({ pointer, leaveRef, onFound }) {
  return (
    <Canvas camera={{ position: [0, 0.2, 6], fov: 40 }} dpr={[1, 2]} gl={{ antialias: true }} style={{ position: 'fixed', inset: 0 }} aria-hidden="true">
      <color attach="background" args={['#030202']} />
      <Searcher pointer={pointer} leaveRef={leaveRef} onFound={onFound} />
    </Canvas>
  );
}
