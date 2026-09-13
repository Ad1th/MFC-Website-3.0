import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { film } from '../store.js';
import { getScenes } from '../scroll.js';
import { createPose, sampleShot } from './shots.js';
import { FILM_FREEZE } from '../testHooks.js';

/**
 * The only camera. Samples the active scene's shot at sceneProgress and follows it with a
 * critically damped spring (lag, and a little overshoot when the shot turns hard), adds a
 * breathing drift at rest and widens the lens with scroll velocity. Scenes without a shot
 * yet fall back to the placeholder dolly so the rest of the film stays navigable.
 * With ?freeze=1 the camera snaps to the shot with no drift, for pixel tests.
 */

const PLACEHOLDER_SPACING = 30;
const OMEGA = 7;
// Kept small: a wide velocity lens on top of fast trackpad scrolling read as dizzying.
const FOV_MAX_BOOST = 8;
const VELOCITY_FOR_MAX = 4000;

const pose = createPose();
const pos = new Vector3();
const vel = new Vector3();
const target = new Vector3();
const targetVel = new Vector3();
const breath = new Vector3();
const shake = new Vector3();
const up = new Vector3();
let fov = 45;
let fovVel = 0;
let roll = 0;
let initialised = false;
let lastCut = 0;

function spring(x, v, goal, dt) {
  // Semi-implicit critically damped spring, per component.
  for (const k of ['x', 'y', 'z']) {
    const accel = -2 * OMEGA * v[k] - OMEGA * OMEGA * (x[k] - goal[k]);
    v[k] += accel * dt;
    x[k] += v[k] * dt;
  }
}

function placeholder(index, progress, out) {
  const z = 9 - (index + progress) * PLACEHOLDER_SPACING;
  // Placeholder dollies are separate worlds: entering one is a cut, not a flight.
  out.cut = 1000 + index;
  out.position.set(0, 0, z);
  out.target.set(0, 0, z - 12);
  out.fov = 45;
  out.roll = 0;
}

export default function CameraRig() {
  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 20);
    const { activeScene, sceneProgress, velocity } = film.getState();
    const scene = getScenes()[activeScene];
    pose.cut = 0;
    pose.shake = 0;
    if (!scene || !sampleShot(scene.id, sceneProgress, pose, state.size.width / state.size.height)) placeholder(activeScene, sceneProgress, pose);
    // A hidden cut (whiteout, set change) snaps instead of springing across worlds.
    if (pose.cut !== lastCut) {
      lastCut = pose.cut;
      initialised = false;
    }

    const cam = state.camera;
    if (FILM_FREEZE || !initialised) {
      pos.copy(pose.position);
      target.copy(pose.target);
      vel.set(0, 0, 0);
      targetVel.set(0, 0, 0);
      fov = pose.fov;
      fovVel = 0;
      roll = pose.roll;
      initialised = true;
    } else {
      spring(pos, vel, pose.position, dt);
      spring(target, targetVel, pose.target, dt);
      const speed = Math.min(Math.abs(velocity) / VELOCITY_FOR_MAX, 1);
      const fovGoal = pose.fov + FOV_MAX_BOOST * speed * speed;
      fovVel += (-2 * OMEGA * fovVel - OMEGA * OMEGA * (fov - fovGoal)) * dt;
      fov += fovVel * dt;
      roll += (pose.roll - roll) * (1 - Math.exp(-dt * OMEGA));
    }

    cam.position.copy(pos);
    if (!FILM_FREEZE) {
      // Breathing: a slow figure-eight of a few centimetres, strongest at rest.
      const t = state.clock.elapsedTime;
      const rest = 1 - Math.min(Math.abs(velocity) / 400, 1);
      breath.set(Math.sin(t * 0.31) * 0.02, Math.sin(t * 0.47) * 0.014, 0).multiplyScalar(rest);
      cam.position.add(breath);
      // Shake: layered sines as cheap noise, from scroll speed and from shots that ask for it.
      const speed = Math.min(Math.abs(velocity) / VELOCITY_FOR_MAX, 1);
      const amplitude = 0.006 * speed * speed + 0.05 * pose.shake;
      if (amplitude > 1e-4) {
        shake
          .set(Math.sin(t * 37.1) * 0.6 + Math.sin(t * 61.7) * 0.4, Math.sin(t * 43.3) * 0.6 + Math.sin(t * 71.9) * 0.4, Math.sin(t * 29.3) * 0.5)
          .multiplyScalar(amplitude);
        cam.position.add(shake);
      }
    }
    cam.up.copy(up.set(Math.sin(roll), Math.cos(roll), 0));
    cam.lookAt(target);
    if (Math.abs(cam.fov - fov) > 1e-3) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  });
  return null;
}
