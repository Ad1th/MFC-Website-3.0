import { Vector3 } from 'three';

/**
 * The one camera's script. Each scene registers a shot: a pure function of its
 * sceneProgress that writes a camera pose. CameraRig samples the active scene's shot and
 * springs toward it. Handover rule: a shot's pose at progress 1 must equal the next
 * scene's pose at progress 0 (checked by `handoverGap`). No cuts.
 *
 * @typedef {{ position: Vector3, target: Vector3, fov: number, roll: number }} Pose
 * @typedef {(progress: number, out: Pose) => void} Shot
 */

/** @type {Map<string, Shot>} */
const shots = new Map();

export function createPose() {
  return { position: new Vector3(), target: new Vector3(), fov: 45, roll: 0 };
}

/**
 * @param {string} sceneId
 * @param {Shot} shot
 * @returns {() => void} unregister
 */
export function registerShot(sceneId, shot) {
  shots.set(sceneId, shot);
  return () => {
    if (shots.get(sceneId) === shot) shots.delete(sceneId);
  };
}

/**
 * @param {string} sceneId
 * @param {number} progress
 * @param {Pose} out
 * @returns {boolean} false when the scene has no shot yet
 */
export function sampleShot(sceneId, progress, out) {
  const shot = shots.get(sceneId);
  if (!shot) return false;
  shot(progress, out);
  return true;
}

const a = createPose();
const b = createPose();

/**
 * Distance between one scene's end pose and the next scene's start pose (tests, debug HUD).
 * @returns {{ position: number, target: number, fov: number, roll: number }|null}
 */
export function handoverGap(fromId, toId) {
  if (!sampleShot(fromId, 1, a) || !sampleShot(toId, 0, b)) return null;
  return {
    position: a.position.distanceTo(b.position),
    target: a.target.distanceTo(b.target),
    fov: Math.abs(a.fov - b.fov),
    roll: Math.abs(a.roll - b.roll),
  };
}
