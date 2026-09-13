import { Suspense, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { film, useFilm } from '../store.js';
import Globe from '../globe/Globe.jsx';
import GlobeArc from '../globe/GlobeArc.jsx';
import EventStars from '../globe/EventStars.jsx';
import LensedTitle from '../globe/LensedTitle.jsx';
import { registerShot } from '../camera/shots.js';
import { registerFoxShot } from '../actors/foxShots.js';
import { getScenes } from '../scroll.js';

/**
 * S01 Cold Open. Wide on the live globe turning in space, the title set huge behind the
 * planet and bent around its limb, the Milky Way of event names, your arc to Vellore,
 * and the fox: one running lap, a second lap that curls into the logo pose, bullet time
 * (the camera orbits the frozen fox; it blinks once, facing the lens), then it looks
 * into the lens and jumps at it, into S02's impact.
 *
 * Every position is a pure function of sceneProgress, so scrolling back rewinds it.
 *
 * Beats by sceneProgress:
 *   0.00 to 0.35  wide, slow push; your arc draws 0.05 to 0.35; lap one
 *   0.35 to 0.50  lap two, curling into the logo pose; camera flies in to the fox
 *   0.50 to 0.80  bullet time: frozen fox, camera orbits 360°, blink at ±8° of the front
 *   0.80 to 0.90  time resumes, the curl releases, the head turns to the lens
 *   0.90 to 1.00  the jump at the camera
 */

export const GLOBE_RADIUS = 3;
export const GLOBE_CENTRE = new Vector3(0, 0, 0);
/** Longitude turned to the camera at the start: India and Vellore sit right of centre. */
export const GLOBE_FACING = 55;

const FOX_WORLD_SCALE = 0.4;
/** Feet to body centre in world units: about 45 model units up, times FOX_SCALE (0.01) and the scene scale. */
const FOX_BODY_HEIGHT = 45 * 0.01 * FOX_WORLD_SCALE;
const ORBIT_RADIUS = 3.32;
const ORBIT_U = new Vector3(1, 0, 0);
const ORBIT_W = new Vector3(0, 0.38, 1).normalize();
const BULLET_DISTANCE = 1.7;
const BULLET_LIFT = 0.28;
const BLINK_HALF_ANGLE = (8 * Math.PI) / 180;

const WIDE_START = { position: new Vector3(0.4, 0.9, 13.5), target: new Vector3(0, 0.15, 0), fov: 32 };
const WIDE_END = { position: new Vector3(0.2, 0.6, 11.2), target: new Vector3(0, 0.1, 0), fov: 34 };

const ease = (t) => t * t * (3 - 2 * t);
const window01 = (p, a, b) => Math.min(Math.max((p - a) / (b - a), 0), 1);
const lerp = (a, b, t) => a + (b - a) * t;

/** Orbit angle for the fox at a scene progress (radians). The front of the globe is π/2. */
function orbitAngle(p) {
  const lapOne = window01(p, 0, 0.35);
  const lapTwo = ease(window01(p, 0.35, 0.5));
  return -Math.PI / 2 + lapOne * Math.PI * 2 + lapTwo * Math.PI;
}

/** Fox frame on the orbit: position, forward (tangent) and up (radial). */
function orbitFrame(angle, position, forward, up) {
  up.copy(ORBIT_U).multiplyScalar(Math.cos(angle)).addScaledVector(ORBIT_W, Math.sin(angle)).normalize();
  position.copy(GLOBE_CENTRE).addScaledVector(up, ORBIT_RADIUS);
  forward.copy(ORBIT_U).multiplyScalar(-Math.sin(angle)).addScaledVector(ORBIT_W, Math.cos(angle)).normalize();
}

const HOLD = { position: new Vector3(), forward: new Vector3(), up: new Vector3() };
orbitFrame(orbitAngle(0.5), HOLD.position, HOLD.forward, HOLD.up);
/** Bullet-time orbit axes: the camera starts on the wide camera's side of the fox. */
const HOLD_TO_CAMERA = new Vector3().subVectors(WIDE_END.position, HOLD.position).projectOnPlane(HOLD.up).normalize();
const HOLD_SIDE = new Vector3().crossVectors(HOLD.up, HOLD_TO_CAMERA).normalize();

/** Camera offset direction around the held fox for an orbit azimuth (0 = toward the wide camera). */
function bulletDirection(azimuth, out) {
  return out.copy(HOLD_TO_CAMERA).multiplyScalar(Math.cos(azimuth)).addScaledVector(HOLD_SIDE, Math.sin(azimuth));
}

function bulletAzimuth(p) {
  return ease(window01(p, 0.5, 0.8)) * Math.PI * 2;
}

const shotWidePosition = new Vector3();
const shotWideTarget = new Vector3();
const shotCloseTarget = new Vector3();
const shotClosePosition = new Vector3();
const shotDirection = new Vector3();

/** @type {import('../camera/shots.js').Shot} */
export function coldOpenShot(progress, out, aspect = 16 / 9) {
  const p = Math.min(Math.max(progress, 0), 1);

  // Wide: a slow push on the planet; narrow screens pull back so the planet keeps its width.
  const wide = ease(window01(p, 0.02, 0.35));
  shotWidePosition.lerpVectors(WIDE_START.position, WIDE_END.position, wide);
  shotWideTarget.lerpVectors(WIDE_START.target, WIDE_END.target, wide);
  const fit = Math.max(1, 0.85 / aspect);
  if (fit > 1) shotWidePosition.sub(shotWideTarget).multiplyScalar(fit).add(shotWideTarget);
  let fov = lerp(WIDE_START.fov, WIDE_END.fov, wide);

  // Close: orbiting the held fox. Before bullet time this is the orbit's start pose.
  bulletDirection(bulletAzimuth(p), shotDirection);
  shotCloseTarget.copy(HOLD.position).addScaledVector(HOLD.up, BULLET_LIFT * 0.6);
  const closeDistance = BULLET_DISTANCE * Math.max(1, 0.7 / aspect);
  shotClosePosition.copy(shotCloseTarget).addScaledVector(shotDirection, closeDistance).addScaledVector(HOLD.up, BULLET_LIFT);

  // Fly in during lap two and stay close to the end.
  const flyIn = ease(window01(p, 0.36, 0.5));
  out.position.lerpVectors(shotWidePosition, shotClosePosition, flyIn);
  out.target.lerpVectors(shotWideTarget, shotCloseTarget, flyIn);
  fov = lerp(fov, 38, flyIn);

  // The jump: a small recoil and a wider lens as the fox comes at the camera.
  const jump = window01(p, 0.9, 1);
  out.position.addScaledVector(shotDirection, 0.12 * jump * jump);
  out.fov = fov + 6 * jump * jump;
  out.roll = 0;
}

/**
 * Where the fox is at the end of the jump: on the camera's line of sight, just short of
 * the lens, so it fills the frame head-on as S02 begins.
 */
function jumpTarget(cameraPosition, out) {
  // The fox's origin is at its feet; aim so its body centre, not its feet, meets the lens axis.
  shotCloseTarget.copy(HOLD.position).addScaledVector(HOLD.up, BULLET_LIFT * 0.6 - FOX_BODY_HEIGHT);
  return out.lerpVectors(shotCloseTarget, cameraPosition, 0.82);
}

/** This scene's progress, or 0 before it and 1 after it (so scrolling back rewinds cleanly). */
function localProgress() {
  const { activeScene, sceneProgress } = film.getState();
  const index = getScenes().findIndex((scene) => scene.id === 'S01');
  if (activeScene < index) return 0;
  if (activeScene > index) return 1;
  return sceneProgress;
}

const cameraDirection = new Vector3();
const jumpPoint = new Vector3();
const toLens = new Vector3();

/**
 * S01's fox shot for the film's one fox (FilmFox): the orbit, the logo curl, bullet time
 * with the front-facing blink, the look into the lens and the jump, all from sceneProgress.
 * @type {import('../actors/foxShots.js').FoxShot}
 */
export function coldOpenFoxShot(progress, pose, input, context) {
  const p = Math.min(Math.max(progress, 0), 1);
  const cameraPosition = context.camera.position;

  orbitFrame(orbitAngle(p), pose.position, pose.forward, pose.up);
  const jump = ease(window01(p, 0.9, 1));
  if (jump > 0) {
    jumpTarget(cameraPosition, jumpPoint);
    pose.position.lerp(jumpPoint, jump);
    // A shallow arc: the leap rises a little, then comes straight down the lens axis.
    pose.position.addScaledVector(HOLD.up, Math.sin(jump * Math.PI) * 0.08);
    toLens.subVectors(cameraPosition, HOLD.position).normalize();
    pose.forward.lerp(toLens, jump).normalize();
  }
  pose.scale = FOX_WORLD_SCALE;

  const curl = ease(window01(p, 0.36, 0.5)) * (1 - ease(window01(p, 0.8, 0.88)));
  const bullet = p >= 0.5 && p < 0.8;
  input.timeScale = bullet ? 0 : 1;
  input.scenePose = curl > 0.001 ? { name: 'curl', weight: curl } : null;
  input.hint = bullet ? null : 'run';

  // After bullet time the head turns into the lens.
  const look = ease(window01(p, 0.8, 0.88));
  input.look = look > 0 ? cameraPosition : null;
  input.lookWeight = look;

  // The blink: once, slowly, when the orbiting camera is within ±8° of the fox's front.
  if (bullet) {
    cameraDirection.subVectors(cameraPosition, HOLD.position).projectOnPlane(HOLD.up).normalize();
    const closed = 1 - Math.min(cameraDirection.angleTo(HOLD.forward) / BLINK_HALF_ANGLE, 1);
    input.eyeOverride = 1 - 0.92 * Math.sin((closed * Math.PI) / 2);
  }
}

export default function S01ColdOpen() {
  const tier = useFilm((s) => s.quality);
  const arcProgress = useRef(0);
  const titleOpacity = useRef(1);

  useEffect(() => registerShot('S01', coldOpenShot), []);
  useEffect(() => registerFoxShot('S01', coldOpenFoxShot), []);

  useFrame(() => {
    const p = localProgress();
    arcProgress.current = ease(window01(p, 0.05, 0.35));
    // The giant title belongs to the cold open; once S01 is over it must not hang in later shots.
    titleOpacity.current = p < 1 ? 1 : 0;
  });

  return (
    <>
      <EventStars count={tier >= 3 ? 2200 : tier === 2 ? 1400 : 700} />
      <LensedTitle globeCentre={GLOBE_CENTRE} globeRadius={GLOBE_RADIUS} position={[0, -0.6, -16]} width={64} opacityRef={titleOpacity} />
      <Suspense fallback={null}>
        <Globe tier={tier} scale={GLOBE_RADIUS} rotation={[0.41, 0, 0]} facing={GLOBE_FACING}>
          <GlobeArc progressRef={arcProgress} />
        </Globe>
      </Suspense>
    </>
  );
}
