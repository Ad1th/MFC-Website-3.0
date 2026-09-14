import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, PerspectiveCamera, Plane, Raycaster, ShaderMaterial, Vector2, Vector3 } from 'three';
import { createPose } from '../camera/shots.js';
import { film, useFilm } from '../store.js';
import { registerShot } from '../camera/shots.js';
import { getFox, registerFoxShot } from '../actors/foxShots.js';
import { sceneProgressOf } from './progress.js';
import { coldOpenFoxShot, GLOBE_FACING, GLOBE_RADIUS } from './S01ColdOpen.jsx';
import { FOX_AT as HILL_FOX, skyShot } from './S09Sky.jsx';
import { SKY_ORIGIN as NIGHT_ORIGIN } from '../night/layout.js';
import { LAYERS } from './S03Dive.jsx';
import Globe from '../globe/Globe.jsx';
import GlobeArc from '../globe/GlobeArc.jsx';
import DiveClouds, { lookFor } from '../sky/DiveClouds.jsx';
import SkyGround from '../sky/SkyGround.jsx';
import CommitMeteors from '../sky/CommitMeteors.jsx';
import Shards from '../return/Shards.jsx';
import Delivery from '../return/Delivery.jsx';
import { CUT_HILL, CUT_SKY, CUT_SPACE, FORM_PANE, GLOBE_TILT, HOLD, RETURN_SKY, RETURN_SPACE, globeToWorld, routeFrame } from '../return/layout.js';
import { latLonToVector } from '../sun.js';
import { site } from '../../content/index.js';
import { onFormSignal, setDeliveryHandler } from '../../live/formSignals.js';
import { FILM_TEST } from '../testHooks.js';

/**
 * S10 The Return. On the hilltop the fox stands, looks back once and launches. The camera chases
 * it up out of the sky (the dive in reverse, faster): through the cloud layers, the commit meteors
 * rising off the ground. A whiteout, and we are back in orbit. The shards of the page from S02
 * are still drifting here; they fly back together into one pane in front of the planet, and the
 * fox runs its last lap and curls into the logo pose above it. YOUR MOVE. The form (DOM) sits on
 * the pane. While you type the ears perk and the eyes follow the caret; a wrong field gets a
 * tilted head. On send the message becomes an ember, and the fox carries it along your arc to
 * Vellore, drops it, nudges it and trots back to the logo.
 *
 * Scroll drives the flight (reversible); the form's reactions and the delivery run in real time.
 *
 * Beats by sceneProgress:
 *   0.000 to 0.055  the hilltop: stand, glance back, launch (whiteout into the sky set)
 *   0.055 to 0.300  rising through the sky; meteors rise; whiteout 0.28 to 0.36, cut at 0.32
 *   0.320 to 0.620  orbit: the camera pulls back from the surface; shards reassemble 0.42 to 0.64
 *   0.320 to 0.620  the fox rises off Vellore and runs its last lap into the logo curl
 *   0.620 to 1.000  hold; the form fades in 0.62 to 0.72
 */

const HILL_END = 0.055;
const SKY_END = 0.32;
const HOLD_AT = 0.62;
const LAP_FROM = 0.43;
const LAP_TO = 0.4999;
const RISE = [0.32, 0.42];
const LAP = [0.42, 0.62];
const ASSEMBLE = [0.42, 0.64];
const FORM_IN = [0.62, 0.72];
const SKY_MOUNT = [0.03, 0.34];
const SPACE_MOUNT = 0.26;
const GLANCE_AT = 0.008;

const SKY_BACKGROUND = new Color('#060a14');
const SKY_FOG = new Color('#0b1222');
const SPACE_AIR = new Color('#0a0807');
const NIGHT_AIR = new Color('#0a0807');

const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
const window01 = (p, a, b) => clamp01((p - a) / (b - a));
const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

const VELLORE = globeToWorld(latLonToVector(site.campus.lat, site.campus.lon).multiplyScalar(1.004));
const VELLORE_NORMAL = VELLORE.clone().sub(RETURN_SPACE).normalize();

const SKY_FORWARD = new Vector3(0, 0.85, -0.5).normalize();
const SKY_UP = new Vector3(0, 0.5, 0.85).normalize();
// Above and beside the climbing fox, so the clouds and the ground fall away beneath it.
const SKY_CAMERA = new Vector3(9, 7, 6);

/** The rising fox in the sky set at a progress. */
function skyFox(p, position) {
  const s = window01(p, HILL_END, 0.3);
  return position.set(Math.sin(s * 5.5) * 2.5, lerp(4, 150, s), -30 * s).add(RETURN_SKY);
}

const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpC = new Vector3();

/** @type {import('../camera/shots.js').Shot} */
export function returnShot(progress, out, aspect = 16 / 9) {
  const p = clamp01(progress);
  const fit = Math.max(1, 0.85 / aspect);
  out.roll = 0;
  out.shake = 0;

  if (p < HILL_END) {
    // Where S09 left the hilltop, the lens tipping up after the leaping fox.
    skyShot(1, out);
    out.target.y += 12 * ease(window01(p, 0.02, HILL_END));
    out.cut = CUT_HILL;
    return;
  }

  if (p < SKY_END) {
    const fox = skyFox(p, tmpA);
    out.position.copy(fox).addScaledVector(SKY_CAMERA, fit);
    out.target.copy(fox).add(tmpB.set(0, -4, 0));
    out.fov = 55;
    out.roll = Math.sin(p * 18) * 0.03;
    out.shake = 0.2;
    out.cut = CUT_SKY;
    return;
  }

  // Orbit: from just above Vellore back out to the hold.
  const pull = ease(window01(p, SKY_END, HOLD_AT));
  const start = tmpA.copy(VELLORE).addScaledVector(VELLORE_NORMAL, 2.4).add(tmpC.set(0, 0.3, 0));
  out.target.lerpVectors(VELLORE, HOLD.target, pull);
  out.position.lerpVectors(start, HOLD.position, pull);
  if (fit > 1) out.position.sub(out.target).multiplyScalar(lerp(1, fit, pull)).add(out.target);
  out.fov = lerp(50, HOLD.fov, pull);
  out.cut = CUT_SPACE;
}

/** The logo curl above the orbit globe (S01's pose, moved to this set). */
function logoPose(pose, input, context) {
  coldOpenFoxShot(LAP_TO, pose, input, context);
  pose.position.add(RETURN_SPACE);
}

/** Real-time state shared by the fox shot, the scene and the form listeners. */
const live = {
  lookPoint: new Vector3(),
  lookUntil: 0,
  lastEars: 0,
  delivery: null,
  deliveries: 0,
  ember: { position: new Vector3(), visible: false, glow: 0, text: '' },
  arc: { current: 0 },
};

const DELIVERY_SECONDS = 5.8;
const EMBER_FADE = 3;
const routeStart = { position: new Vector3(), forward: new Vector3(), up: new Vector3() };
const hold = { position: new Vector3(), forward: new Vector3(), up: new Vector3() };
const scratchInput = {};

function once(delivery, key, when, fn) {
  if (when && !delivery.fired.has(key)) {
    delivery.fired.add(key);
    fn();
  }
}

/** The delivery run, t seconds in: writes the fox pose and moves the ember. */
function deliveryPose(t, pose, input, context) {
  const d = live.delivery;
  logoPose(hold, scratchInput, context);
  routeFrame(0, routeStart.position, routeStart.forward, routeStart.up);
  pose.scale = 0.4;
  pose.cut = CUT_SPACE;
  input.scenePose = null;
  input.hint = 'run';
  input.velocity = 0;

  const fox = getFox();
  if (t < 0.5) {
    const u = ease(t / 0.5);
    pose.position.lerpVectors(hold.position, routeStart.position, u);
    pose.forward.lerpVectors(hold.forward, routeStart.forward, u).normalize();
    pose.up.lerpVectors(hold.up, routeStart.up, u).normalize();
    input.scenePose = { name: 'curl', weight: 1 - u };
  } else if (t < 3.1) {
    const r = ease((t - 0.5) / 2.6);
    routeFrame(r, pose.position, pose.forward, pose.up);
    input.velocity = 1400;
    live.arc.current = r;
  } else if (t < 3.9) {
    routeFrame(1, pose.position, pose.forward, pose.up);
    live.arc.current = 1;
    // The nudge: a small push of the nose toward the dropped ember.
    const nudge = Math.sin(Math.PI * window01(t, 3.5, 3.9));
    pose.position.addScaledVector(pose.forward, 0.07 * nudge);
    once(d, 'look', t >= 3.3, () => fox?.trigger('earsPerk', {}, { force: true }));
  } else if (t < 5.3) {
    const r = 1 - ease((t - 3.9) / 1.4);
    routeFrame(r, pose.position, pose.forward, pose.up, -1);
    input.velocity = 650;
    live.arc.current = r;
    once(d, 'wag1', t >= 3.95, () => fox?.trigger('wag', { intensity: 1 }, { force: true }));
    once(d, 'wag2', t >= 4.7, () => fox?.trigger('wag', { intensity: 1 }, { force: true }));
  } else {
    const u = ease(window01(t, 5.3, DELIVERY_SECONDS));
    pose.position.lerpVectors(routeStart.position, hold.position, u);
    pose.forward.lerpVectors(routeStart.forward, hold.forward, u).normalize();
    pose.up.lerpVectors(routeStart.up, hold.up, u).normalize();
    input.scenePose = { name: 'curl', weight: u };
    live.arc.current = 0;
  }

  // The ember rides at the fox's head until the drop, then lies glowing on campus.
  const ember = live.ember;
  if (t < 3.1) {
    const head = fox?.anchors?.().head;
    if (head) ember.position.copy(head).addScaledVector(pose.forward, 0.05);
    else ember.position.copy(pose.position);
    ember.glow = Math.min(1, t * 4);
  } else {
    ember.position.copy(VELLORE).addScaledVector(VELLORE_NORMAL, 0.02);
    ember.glow = 1;
    once(d, 'drop', true, () => fox?.emitSparks?.({ count: 18, speed: 0.5, spread: 0.6, up: true }));
  }
  ember.visible = true;
}

/** @type {import('../actors/foxShots.js').FoxShot} */
function returnFoxShot(progress, pose, input, context) {
  const p = clamp01(progress);
  pose.visible = true;

  if (p < HILL_END) {
    pose.position.copy(HILL_FOX).add(NIGHT_ORIGIN);
    const launch = ease(window01(p, 0.022, HILL_END));
    pose.position.y += launch * launch * 5;
    pose.forward.set(0, 0, -1).lerp(tmpB.set(0, 1, -0.2), launch).normalize();
    pose.up.set(0, 1, 0).lerp(tmpC.set(0, 0.2, 1), launch).normalize();
    pose.scale = 0.35;
    pose.cut = CUT_HILL;
    input.hint = 'run';
    input.velocity = 1400 * launch;
    input.flame = lerp(0.4, 1, launch);
    return;
  }

  if (p < SKY_END) {
    skyFox(p, pose.position);
    pose.forward.copy(SKY_FORWARD);
    pose.up.copy(SKY_UP);
    pose.scale = 1.2;
    pose.cut = CUT_SKY;
    input.hint = 'run';
    input.velocity = 1600;
    return;
  }

  if (live.delivery) {
    const t = (performance.now() - live.delivery.start) / 1000;
    deliveryPose(t, pose, input, context);
    return;
  }

  pose.cut = CUT_SPACE;
  pose.scale = 0.4;
  if (p < RISE[1]) {
    // Up off the surface at Vellore, toward where the last lap begins.
    coldOpenFoxShot(LAP_FROM, hold, input, context);
    hold.position.add(RETURN_SPACE);
    const u = ease(window01(p, RISE[0], RISE[1]));
    pose.position.copy(VELLORE).lerp(hold.position, u);
    pose.forward.copy(VELLORE_NORMAL).lerp(hold.forward, u).normalize();
    pose.up.copy(tmpA.set(0, 0, 1)).lerp(hold.up, u).normalize();
    input.hint = 'run';
    input.velocity = 1200;
    input.scenePose = null;
    return;
  }

  const lap = window01(p, LAP[0], LAP[1]);
  coldOpenFoxShot(lerp(LAP_FROM, LAP_TO, lap), pose, input, context);
  pose.position.add(RETURN_SPACE);
  if (lap >= 1) {
    input.hint = 'run';
    input.velocity = 0;
  }
  if (performance.now() < live.lookUntil) {
    input.look = live.lookPoint;
    input.lookWeight = 0.85;
  }
}

const STAR_VERTEX = /* glsl */ `
  attribute float aSize;
  uniform float uPixelRatio;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio;
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = dot(p, p);
    if (d > 1.0) discard;
    gl_FragColor = vec4(vec3(0.85, 0.82, 0.78) * exp(-d * 5.0), 1.0);
    #include <colorspace_fragment>
  }
`;

function OrbitStars() {
  const { geometry, material } = useMemo(() => {
    const positions = [];
    const sizes = [];
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 1400; i += 1) {
      const u = rand() * 2 - 1;
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      positions.push(Math.cos(a) * r * 55, u * 55, Math.sin(a) * r * 55 - 10);
      sizes.push(1 + rand() * 2.2);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    g.setAttribute('aSize', new Float32BufferAttribute(sizes, 1));
    const m = new ShaderMaterial({ uniforms: { uPixelRatio: { value: 1 } }, vertexShader: STAR_VERTEX, fragmentShader: STAR_FRAGMENT, transparent: true, depthWrite: false, blending: AdditiveBlending });
    return { geometry: g, material: m };
  }, []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  useFrame((state) => {
    material.uniforms.uPixelRatio.value = state.gl.getPixelRatio();
  });
  return <points geometry={geometry} material={material} position={RETURN_SPACE} frustumCulled={false} />;
}

const WHITEOUT_VERTEX = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
  }
`;

const WHITEOUT_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    gl_FragColor = vec4(uColor, uOpacity);
    #include <colorspace_fragment>
  }
`;

const holdPose = createPose();
const holdCamera = new PerspectiveCamera();
const corner = new Vector3();
const PANE_PAD_PX = 28;

/**
 * Where the pane must sit to cover the form's box on this screen: the box's corners cast from
 * the hold camera onto the pane's plane, as a translate and scale of the pane as built.
 */
function fitPane(out) {
  const box = document.querySelector('[data-region="contact"] form')?.parentElement?.getBoundingClientRect();
  if (!box || box.height < 1) return false;
  const width = window.innerWidth;
  const height = window.innerHeight;
  returnShot(1, holdPose, width / height);
  holdCamera.fov = holdPose.fov;
  holdCamera.aspect = width / height;
  holdCamera.position.copy(holdPose.position);
  holdCamera.up.set(0, 1, 0);
  holdCamera.lookAt(holdPose.target);
  holdCamera.updateProjectionMatrix();
  holdCamera.updateMatrixWorld();
  const cast = (x, y) => {
    ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
    raycaster.setFromCamera(ndc, holdCamera);
    return raycaster.ray.intersectPlane(pane, corner) ? corner.clone() : null;
  };
  const topLeft = cast(Math.max(0, box.left - PANE_PAD_PX), box.top - PANE_PAD_PX);
  const bottomRight = cast(Math.min(width, box.right + PANE_PAD_PX), box.bottom + PANE_PAD_PX);
  if (!topLeft || !bottomRight) return false;
  const sx = Math.max(Math.abs(bottomRight.x - topLeft.x) / FORM_PANE.width, 0.3);
  const sy = Math.max(Math.abs(topLeft.y - bottomRight.y) / FORM_PANE.height, 0.3);
  const cx = (topLeft.x + bottomRight.x) / 2;
  const cy = (topLeft.y + bottomRight.y) / 2;
  out.scale.set(sx, sy, 1);
  out.position.set(cx - sx * FORM_PANE.centre.x, cy - sy * FORM_PANE.centre.y, 0);
  return true;
}

const ndc = new Vector2();
const raycaster = new Raycaster();
const pane = new Plane(new Vector3(0, 0, 1), -FORM_PANE.centre.z);

export default function S10Return() {
  const tier = useFilm((s) => s.quality);
  const weather = useFilm((s) => s.live.weather);
  const look = lookFor(weather);
  const { camera, scene } = useThree();
  const [skyOn, setSkyOn] = useState(false);
  const [spaceOn, setSpaceOn] = useState(false);
  const mounted = useRef({ sky: false, space: false });
  const lastProgress = useRef(0);
  const meteors = useRef(0.94);
  const ground = useRef(0.5);
  const assemble = useRef(0);
  const shardOpacity = useRef(0);
  const whiteoutRef = useRef(null);
  const formIn = useRef(-1);
  const paneFit = useRef(null);
  const fitFrame = useRef(0);

  useEffect(() => registerShot('S10', returnShot), []);
  useEffect(() => registerFoxShot('S10', returnFoxShot), []);

  const whiteout = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uColor: { value: new Color('#b9c4d8') }, uOpacity: { value: 0 } },
        vertexShader: WHITEOUT_VERTEX,
        fragmentShader: WHITEOUT_FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );

  // The form talks to the fox (formSignals.js).
  useEffect(() => {
    const toPane = (x, y) => {
      ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(pane, live.lookPoint)) live.lookPoint.copy(FORM_PANE.centre);
    };
    const offSignals = onFormSignal((signal) => {
      const now = performance.now();
      if (signal.type === 'key') {
        if (now - live.lastEars > 280) {
          live.lastEars = now;
          getFox()?.trigger('earsPerk', {}, { force: true });
        }
      } else if (signal.type === 'caret') {
        toPane(signal.x, signal.y);
        live.lookUntil = now + 2500;
      } else if (signal.type === 'invalid') {
        toPane(signal.x, signal.y);
        live.lookUntil = now + 2200;
        getFox()?.trigger('tilt', { dir: signal.x < window.innerWidth / 2 ? -1 : 1 }, { force: true });
      } else if (signal.type === 'blur') {
        live.lookUntil = Math.min(live.lookUntil, now + 400);
      }
    });
    const offDelivery = setDeliveryHandler(
      (message) =>
        new Promise((resolve) => {
          live.delivery = { start: performance.now(), resolve, fired: new Set() };
          live.deliveries += 1;
          live.ember.text = message;
          live.ember.visible = true;
        }),
    );
    return () => {
      offSignals();
      offDelivery();
      live.delivery?.resolve();
      live.delivery = null;
      live.ember.visible = false;
    };
  }, [camera]);

  useEffect(
    () => () => {
      whiteout.dispose();
      document.documentElement.style.removeProperty('--return-form');
      if (scene.fog) {
        scene.fog.color.copy(SPACE_AIR);
        scene.fog.near = 20;
        scene.fog.far = 60;
      }
      if (scene.background?.isColor) scene.background.copy(SPACE_AIR);
    },
    [whiteout, scene],
  );

  if (FILM_TEST) {
    window.__filmTest.returnScene = () => ({
      delivering: Boolean(live.delivery),
      deliveries: live.deliveries,
      assemble: assemble.current,
      formIn: Math.max(0, formIn.current),
      emberVisible: live.ember.visible && live.ember.glow > 0,
    });
  }

  useFrame((state) => {
    const p = sceneProgressOf('S10');
    const { activeScene } = film.getState();

    // Mount the heavy sets only near their beats.
    const wantSky = p >= SKY_MOUNT[0] && p < SKY_MOUNT[1];
    if (wantSky !== mounted.current.sky) {
      mounted.current.sky = wantSky;
      setSkyOn(wantSky);
    }
    const wantSpace = p >= SPACE_MOUNT;
    if (wantSpace !== mounted.current.space) {
      mounted.current.space = wantSpace;
      setSpaceOn(wantSpace);
    }

    // The glance back, once each way down.
    if (lastProgress.current < GLANCE_AT && p >= GLANCE_AT) getFox()?.trigger('glanceBack', {}, { force: true });
    lastProgress.current = p;

    meteors.current = lerp(0.94, 0.805, window01(p, 0.06, 0.2));
    assemble.current = ease(window01(p, ASSEMBLE[0], ASSEMBLE[1]));
    // In at the orbit, out as S11 tips the camera down to the floor.
    shardOpacity.current = window01(p, 0.34, 0.4) * (1 - window01(sceneProgressOf('S11'), 0.04, 0.24));

    // Air: only while this scene plays (S11 keeps the orbit's air itself).
    const index = film.getState().activeScene;
    if (index === activeScene && sceneProgressOf('S10') === p && p > 0 && p < 1) {
      const inSky = p >= HILL_END && p < SKY_END;
      const inSpace = p >= SKY_END;
      if (state.scene.fog) {
        state.scene.fog.color.copy(inSky ? SKY_FOG : inSpace ? SPACE_AIR : NIGHT_AIR);
        state.scene.fog.near = inSky ? 70 : inSpace ? 20 : state.scene.fog.near;
        state.scene.fog.far = inSky ? 460 : inSpace ? 60 : state.scene.fog.far;
      }
      if (state.scene.background?.isColor && (inSky || inSpace)) state.scene.background.copy(inSky ? SKY_BACKGROUND : SPACE_AIR);
    }

    // Two whiteouts hide the set changes.
    const w1 = window01(p, 0.035, HILL_END) * (1 - window01(p, HILL_END, 0.075));
    const w2 = window01(p, 0.28, SKY_END) * (1 - window01(p, SKY_END, 0.36));
    const opacity = Math.max(w1, w2);
    if (whiteoutRef.current) whiteoutRef.current.visible = opacity > 0.001;
    whiteout.uniforms.uOpacity.value = opacity;
    whiteout.uniforms.uColor.value.set(look.color);

    // The form fades in over the reassembled pane (a CSS variable, written only when it changes).
    const form = Math.round(window01(p, FORM_IN[0], FORM_IN[1]) * 100) / 100;
    if (form !== formIn.current) {
      formIn.current = form;
      document.documentElement.style.setProperty('--return-form', String(form));
    }

    // Refit the pane to the form now and then (layout changes with the viewport and the send state).
    fitFrame.current += 1;
    if (p > 0.34 && fitFrame.current % 20 === 1) {
      const fit = paneFit.current ?? { position: new Vector3(), scale: new Vector3(1, 1, 1) };
      if (fitPane(fit)) paneFit.current = fit;
    }

    // The delivery ends in real time, wherever the scroll is.
    const d = live.delivery;
    if (d) {
      const t = (performance.now() - d.start) / 1000;
      if (t >= DELIVERY_SECONDS) {
        live.delivery = null;
        live.arc.current = 0;
        live.ember.fadeFrom = performance.now();
        d.resolve();
      }
    } else if (live.ember.visible) {
      const t = (performance.now() - (live.ember.fadeFrom ?? 0)) / 1000;
      live.ember.glow = Math.max(0, 1 - t / EMBER_FADE);
      if (live.ember.glow <= 0) live.ember.visible = false;
    }
  });

  return (
    <>
      <mesh ref={whiteoutRef} material={whiteout} visible={false} frustumCulled={false} renderOrder={900}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      {skyOn ? (
        <>
          <Suspense fallback={null}>
            <DiveClouds layers={LAYERS} tier={tier} weather={weather} origin={RETURN_SKY} />
          </Suspense>
          <Suspense fallback={null}>
            <SkyGround tier={tier} origin={RETURN_SKY} progressRef={ground} fibre={[5, 6]} impact={[5, 6]} reveal={[0, 0.01]} />
          </Suspense>
          <CommitMeteors origin={RETURN_SKY} progressRef={meteors} range={[0.805, 0.94]} />
        </>
      ) : null}
      {spaceOn ? (
        <>
          <OrbitStars />
          <Suspense fallback={null}>
            <Globe tier={tier} spin={0} facing={GLOBE_FACING} primary={false} scale={GLOBE_RADIUS} rotation={[GLOBE_TILT, 0, 0]} position={RETURN_SPACE}>
              <GlobeArc progressRef={live.arc} />
            </Globe>
          </Suspense>
          <Shards assembleRef={assemble} opacityRef={shardOpacity} fitRef={paneFit} />
          <Delivery stateRef={{ current: live.ember }} />
        </>
      ) : null}
    </>
  );
}
