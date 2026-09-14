import { Vector3 } from 'three';
import { coldOpenFoxShot } from '../scenes/S01ColdOpen.jsx';

/**
 * The fox's side of the race home (live/race.js). While racing it runs just ahead of the camera,
 * weaving a little, through whatever scene is rewinding; its size follows the scene's own fox
 * scale. At the top it sits on the front of the globe: looking away if you won, facing you if it
 * did (race.js plays the bow and the wags).
 */

const direction = new Vector3();
const side = new Vector3();
const toCamera = new Vector3();

/** @returns {boolean} true when the race owns the fox this frame */
export function raceFoxPose(race, activeScene, sceneProgress, pose, input, context) {
  const { camera } = context;
  if (race.phase === 'racing') {
    camera.getWorldDirection(direction);
    const s = pose.scale / 0.4;
    const t = performance.now() / 1000;
    side.crossVectors(direction, camera.up).normalize();
    pose.position
      .copy(camera.position)
      .addScaledVector(direction, 2.2 * s)
      .addScaledVector(camera.up, -0.42 * s)
      .addScaledVector(side, Math.sin(t * 2.3) * 0.3 * s);
    pose.forward.copy(direction);
    pose.up.copy(camera.up).addScaledVector(direction, -camera.up.dot(direction)).normalize();
    pose.visible = true;
    input.hint = 'run';
    input.velocity = 2600;
    input.scenePose = null;
    input.timeScale = 1;
    input.look = null;
    input.lookWeight = 0;
    return true;
  }
  if (race.phase === 'done' && activeScene === 0 && sceneProgress < 0.12) {
    // The front of the globe on S01's orbit.
    coldOpenFoxShot(0.175, pose, input, context);
    input.hint = 'sit';
    input.velocity = 0;
    input.scenePose = null;
    input.timeScale = 1;
    input.look = null;
    input.lookWeight = 0;
    toCamera.subVectors(camera.position, pose.position).projectOnPlane(pose.up).normalize();
    if (race.result === 'viewer') pose.forward.copy(toCamera).negate().applyAxisAngle(pose.up, 0.9).projectOnPlane(pose.up).normalize();
    else pose.forward.copy(toCamera);
    pose.visible = true;
    return true;
  }
  return false;
}
