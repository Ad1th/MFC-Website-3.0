import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, ShaderMaterial, Vector3 } from 'three';
import { film } from '../store.js';
import { useFilm } from '../store.js';
import { registerShot } from '../camera/shots.js';
import { getFox, registerFoxShot } from '../actors/foxShots.js';
import { sceneProgressOf } from './progress.js';
import { heartbeat } from '../../live/sound.js';
import { PALETTE } from '../palette.js';
import { FILM_FREEZE, FILM_TEST } from '../testHooks.js';
import { clamp01, ease, lerp, window01 } from '../rooms/labels.js';
import {
  BEATS,
  EMBERS,
  HEIGHT,
  HOLDS,
  SOTY,
  SPIRAL_ORIGIN,
  angleAt,
  climbAt,
  fallingEmber,
  helixLocal,
  helixWorld,
  holdEnvelope,
  radiusAt,
  spinAt,
  toWorld,
} from '../spiral/layout.js';
import Embers, { emberLabels } from '../spiral/Embers.jsx';
import { ClockRing, HexFlash } from '../spiral/Flagships.jsx';
import { buzz } from '../../live/haptics.js';

/**
 * S07 The Spiral. The fox runs off the mirror floor into open night and climbs a spiral staircase
 * of air; every step leaves an ember, and the events bloom as it passes (layout.js has the beats).
 * Four flagships pin the climb for a moment each:
 *   TechWars          the helix flares into a battlefield map; territories claim to orange
 *   Code To Survive   every light goes out except the fox's glow; a heartbeat; lights return
 *   InnovationX       a 36-hour clock ring spins; the sky cycles day, night, day
 *   Scavenger of the Year  the embers hide; the cursor is a torch; the fox sniffs along; finding
 *                     the last ember sets off a happy wag and a shower of sparks (touch: the torch
 *                     opens by itself after 1.5 s)
 * At the top the camera rises over a spinning fire galaxy, holds one still beat, and one ember falls
 * with the fox diving after it. Everything but the torch and the wag is a function of scroll.
 */

const SPIRAL_CUT = 30;
const NIGHT = new Color(PALETTE.night);
const DAY = new Color('#35526f');
const BLACK = new Color('#000000');
const TORCH_RADIUS = 0.22;
const AUTO_TORCH_MS = 1500;

const va = new Vector3();
const vb = new Vector3();
const local = new Vector3();

/** Outside the helix, a little behind the fox along the turn and above it, looking in at the fox. */
function climbCamera(s, spin, aspect, position, target) {
  const a = angleAt(s) - 0.55;
  const r = (radiusAt(s) + 9) * Math.max(1, 1 / aspect);
  toWorld(local.set(Math.cos(a) * r, s * HEIGHT + 2.5, Math.sin(a) * r), spin, position);
  helixWorld(s, spin, target);
  target.y += 0.6;
}

function topCamera(aspect, position, target) {
  position.set(0, HEIGHT + 30 * Math.max(1, 1 / aspect), 0.01).add(SPIRAL_ORIGIN);
  target.set(0, HEIGHT * 0.5, 0).add(SPIRAL_ORIGIN);
}

/** @type {import('../camera/shots.js').Shot} */
export function spiralShot(progress, out, aspect = 16 / 9) {
  const p = progress;
  const spin = spinAt(p);
  out.fov = 50;
  out.roll = 0;
  out.cut = SPIRAL_CUT;
  out.shake = 0;

  if (p < BEATS.rise[0]) {
    const { s, hold, holdT } = climbAt(p);
    climbCamera(s, spin, aspect, out.position, out.target);
    // A flagship pins the climb: the camera leans in a little and back out.
    if (hold) out.position.lerp(out.target, Math.sin(Math.PI * holdT) * 0.25);
    return;
  }

  topCamera(aspect, vb, va);
  if (p < BEATS.fall[0]) {
    climbCamera(1, 0, aspect, out.position, out.target);
    const e = ease(window01(p, BEATS.rise[0], BEATS.rise[1]));
    out.position.lerp(vb, e);
    out.target.lerp(va, e);
    return;
  }

  // The fall: follow the ember straight down into the dark.
  const t = window01(p, BEATS.fall[0], 1);
  const ember = fallingEmber(t, spin, local);
  out.position.set(lerp(vb.x, ember.x, ease(window01(t, 0, 0.5))), lerp(vb.y, ember.y + 14, ease(window01(t, 0, 0.5))), lerp(vb.z, ember.z + 0.01, ease(window01(t, 0, 0.5))));
  out.target.lerpVectors(va, ember, ease(window01(t, 0, 0.3)));
}

const fa = new Vector3();
const foxLook = new Vector3();

/** @type {import('../actors/foxShots.js').FoxShot} */
function spiralFoxShot(progress, pose, input) {
  const p = progress;
  const spin = spinAt(p);
  pose.scale = 0.45;
  pose.cut = SPIRAL_CUT;
  pose.up.set(0, 1, 0);
  input.hint = 'run';
  input.velocity = 900;

  if (p < BEATS.fall[0]) {
    const { s, hold } = climbAt(p);
    helixWorld(s, spin, pose.position);
    helixWorld(Math.min(1, s + 0.003), spin, fa);
    if (fa.distanceToSquared(pose.position) > 1e-8) pose.forward.subVectors(fa, pose.position).normalize();
    const resting = (hold && hold !== SOTY) || p >= BEATS.climb[1];
    if (resting) {
      input.velocity = 0;
      input.hint = 'sit';
      pose.forward.setY(0).normalize();
    }
    if (hold === SOTY) {
      // Nose to the ground, following the trail.
      input.velocity = 250;
      helixWorld(Math.min(1, s + 0.02), spin, foxLook);
      foxLook.y -= 1.2;
      input.look = foxLook;
      input.lookWeight = 1;
    }
    return;
  }

  const t = window01(p, BEATS.fall[0], 1);
  fallingEmber(t, spin, pose.position);
  pose.position.y += lerp(3.5, 1.2, t);
  pose.forward.set(0, -1, 0);
  pose.up.set(0, 0, 1);
  input.velocity = 1400;
}

const FLASH_VERTEX = /* glsl */ `
  uniform vec2 uSize;
  void main() {
    gl_Position = projectionMatrix * vec4(position.xy * uSize, -1.0, 1.0);
  }
`;

const FLASH_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    gl_FragColor = vec4(uColor, uOpacity);
    #include <colorspace_fragment>
  }
`;

const EMBER_POINT_FRAGMENT = /* glsl */ `
  uniform vec3 uFire;
  uniform vec3 uCore;
  void main() {
    float core = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
    gl_FragColor = vec4(mix(uFire, uCore, core) * core * 1.6, 1.0);
    #include <colorspace_fragment>
  }
`;

const EMBER_POINT_VERTEX = /* glsl */ `
  uniform float uPixelRatio;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(40.0 * uPixelRatio * (26.0 / -mv.z), 72.0 * uPixelRatio);
  }
`;

const air = new Color();
const probe = new Vector3();

export default function S07Spiral() {
  const tier = useFilm((s) => s.quality);
  const { camera, scene, size } = useThree();
  const groupRef = useRef(null);
  const flashRef = useRef(null);
  const fallRef = useRef(null);
  const embersState = useRef({ foxS: 0, hide: 0, torch: [0, 0], torchRadius: TORCH_RADIUS, lights: 1, galaxy: 0, found: false });
  const flagState = useRef({ tech: 0, techT: 0, clock: 0, clockT: 0 });
  const pointer = useRef({ x: 0, y: 0, mouse: false });
  const soty = useRef({ enteredAt: 0, inside: false, screen: [0, 0], reveal: 0 });
  const lastHold = useRef({ slug: null, t: 0 });

  const flash = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uSize: { value: [1, 1] }, uColor: { value: new Color(PALETTE.flameCore) }, uOpacity: { value: 0 } },
        vertexShader: FLASH_VERTEX,
        fragmentShader: FLASH_FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );
  const fallGeometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3));
    return g;
  }, []);
  const fallMaterial = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uPixelRatio: { value: 1 }, uFire: { value: new Color(PALETTE.fire) }, uCore: { value: new Color(PALETTE.flameCore) } },
        vertexShader: EMBER_POINT_VERTEX,
        fragmentShader: EMBER_POINT_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [],
  );

  useEffect(() => registerShot('S07', spiralShot), []);
  useEffect(() => registerFoxShot('S07', spiralFoxShot), []);
  useEffect(
    () => () => {
      flash.dispose();
      fallGeometry.dispose();
      fallMaterial.dispose();
    },
    [flash, fallGeometry, fallMaterial],
  );
  useEffect(
    () => () => {
      if (scene.background?.isColor) scene.background.copy(NIGHT);
      scene.fog?.color.copy(NIGHT);
    },
    [scene],
  );

  // The torch follows a mouse or pen; touch has no hover, so the torch opens by itself.
  useEffect(() => {
    const onMove = (event) => {
      if (event.pointerType === 'touch') return;
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
      pointer.current.mouse = true;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  useEffect(() => {
    if (!FILM_TEST) return undefined;
    // Tests read the event labels, the flagship holds, the scroll-driven state and the torch target.
    window.__filmTest.spiral = () => {
      const e = embersState.current;
      const f = flagState.current;
      return {
        labels: emberLabels(),
        holds: HOLDS,
        state: { foxS: e.foxS, hide: e.hide, lights: e.lights, galaxy: e.galaxy, tech: f.tech, techT: f.techT, clock: f.clock, clockT: f.clockT },
        found: e.found,
        torchRadius: e.torchRadius,
        sotyScreen: soty.current.screen,
      };
    };
    return () => {
      delete window.__filmTest.spiral;
    };
  }, []);

  useFrame((state) => {
    const p = sceneProgressOf('S07');
    const active = p > 0 && p < 1;
    const spin = spinAt(p);
    const { s, hold, holdT } = climbAt(p);
    const env = hold ? holdEnvelope(holdT) : 0;
    if (groupRef.current) groupRef.current.rotation.y = spin;

    const e = embersState.current;
    const f = flagState.current;
    e.foxS = p >= BEATS.fall[0] ? 1 : s;
    e.galaxy = ease(window01(p, BEATS.rise[0], BEATS.rise[1]));

    // Code To Survive: the lights go out, a heartbeat, the lights come back.
    const dark = hold === 'code-to-survive' ? window01(holdT, 0.1, 0.3) * (1 - window01(holdT, 0.75, 0.95)) : 0;
    e.lights = 1 - dark;
    if (!FILM_FREEZE && hold === 'code-to-survive' && lastHold.current.slug === hold) {
      for (const beat of [0.4, 0.62]) {
        if (lastHold.current.t < beat && holdT >= beat) heartbeat();
      }
    }

    // InnovationX: a day and a half on the clock; the sky goes day, night, day.
    const day = hold === 'innovationx' ? env * (0.5 + 0.5 * Math.cos(holdT * Math.PI * 2)) : 0;
    f.clock = hold === 'innovationx' ? env : 0;
    f.clockT = hold === 'innovationx' ? holdT : 0;

    // TechWars: the battlefield map flares.
    f.tech = hold === 'techwars' ? env : 0;
    f.techT = hold === 'techwars' ? holdT : 0;

    // Scavenger of the Year: hide the embers; the torch finds them.
    const sotyHold = hold === SOTY;
    e.hide = sotyHold ? env : 0;
    const st = soty.current;
    if (sotyHold && !st.inside) {
      st.inside = true;
      st.enteredAt = performance.now();
      e.found = false;
    }
    if (!sotyHold && st.inside) {
      st.inside = false;
      e.found = false;
    }
    const sotyEmber = EMBERS.find((em) => em.event.slug === SOTY);
    helixWorld(sotyEmber.s, spin, probe).project(camera);
    st.screen = [((probe.x + 1) / 2) * size.width, ((1 - probe.y) / 2) * size.height];
    if (sotyHold) {
      if (pointer.current.mouse) {
        e.torch = [pointer.current.x, pointer.current.y];
        e.torchRadius = TORCH_RADIUS;
      } else {
        // No cursor: after 1.5 s the torch opens from the middle until everything shows.
        const since = performance.now() - st.enteredAt - AUTO_TORCH_MS;
        e.torch = [0, 0];
        e.torchRadius = since > 0 ? TORCH_RADIUS + clamp01(since / 600) * 3 : 0;
      }
      const aspect = size.width / size.height;
      const d = Math.hypot((probe.x - e.torch[0]) * aspect, probe.y - e.torch[1]);
      if (!e.found && env > 0.5 && d < e.torchRadius * 0.6) {
        e.found = true;
        const fox = getFox();
        fox?.trigger('wag', {}, { force: true });
        fox?.emitSparks?.({ count: 40, speed: 1.4, spread: 1.2 });
      }
    }
    // A flagship blooms: a short buzz on phones as its hold begins.
    if (hold && hold !== lastHold.current.slug) buzz(24);
    lastHold.current = { slug: hold, t: holdT };

    if (active) {
      air.copy(NIGHT).lerp(DAY, day).lerp(BLACK, dark);
      if (scene.background?.isColor) scene.background.copy(air);
      scene.fog?.color.copy(air);
    }

    // The falling ember.
    const fallT = window01(p, BEATS.fall[0], 1);
    if (fallRef.current) {
      fallRef.current.visible = active && p >= BEATS.fall[0];
      fallingEmber(fallT, spin, fallRef.current.position);
      fallMaterial.uniforms.uPixelRatio.value = state.gl.getPixelRatio();
    }

    // A flash hides the cut in from the gallery.
    const fl = flashRef.current;
    if (fl) {
      const o = active && p < BEATS.entry ? 1 - p / BEATS.entry : 0;
      fl.visible = o > 0.001;
      flash.uniforms.uOpacity.value = o;
      const height = 2 * Math.tan((camera.fov * Math.PI) / 360) * 1.4;
      flash.uniforms.uSize.value = [height * camera.aspect, height];
    }
  });

  return (
    <>
      <group ref={groupRef} position={SPIRAL_ORIGIN}>
        <Embers stateRef={embersState} tier={tier} />
        <HexFlash stateRef={flagState} />
        <ClockRing stateRef={flagState} />
      </group>
      <points ref={fallRef} geometry={fallGeometry} material={fallMaterial} frustumCulled={false} visible={false} />
      <mesh ref={flashRef} material={flash} visible={false} frustumCulled={false} renderOrder={955}>
        <planeGeometry args={[1, 1]} />
      </mesh>
    </>
  );
}

/** For tests: helix points in local space match the labels' events. */
export { helixLocal, film };
