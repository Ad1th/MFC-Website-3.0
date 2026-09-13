import { Vector3 } from 'three';

/**
 * The fox's script, the way shots.js is the camera's. Each scene registers a fox shot: a
 * pure function of its sceneProgress that writes the fox's pose and any input it owns
 * (time scale, held pose, eyes, look, mood hints). One persistent FilmFox samples the
 * active scene's shot every frame, so the same fox runs through the whole film.
 *
 * @typedef {{ position: Vector3, forward: Vector3, up: Vector3, scale: number, visible: boolean, cut: number }} FoxPose
 *   forward is the nose direction, up the back; scale multiplies FOX_SCALE;
 *   cut changes at a hidden cut (a set change), so world-space trails restart there
 * @typedef {{ camera: import('three').Camera, aspect: number }} FoxShotContext
 * @typedef {(progress: number, pose: FoxPose, input: object, context: FoxShotContext) => void} FoxShot
 */

/** @type {Map<string, FoxShot>} */
const shots = new Map();
let foxHandle = null;

/** @returns {FoxPose} */
export function createFoxPose() {
  return { position: new Vector3(), forward: new Vector3(0, 0, 1), up: new Vector3(0, 1, 0), scale: 0.4, visible: true, cut: 0 };
}

/**
 * @param {string} sceneId
 * @param {FoxShot} shot
 * @returns {() => void} unregister
 */
export function registerFoxShot(sceneId, shot) {
  shots.set(sceneId, shot);
  return () => {
    if (shots.get(sceneId) === shot) shots.delete(sceneId);
  };
}

/** @returns {boolean} false when the scene has no fox shot */
export function sampleFoxShot(sceneId, progress, pose, input, context) {
  const shot = shots.get(sceneId);
  if (!shot) return false;
  shot(progress, pose, input, context);
  return true;
}

/** The film's fox (its imperative handle: trigger, anchors, ...), or null before it mounts. */
export function getFox() {
  return foxHandle;
}

export function setFoxHandle(handle) {
  foxHandle = handle;
}
