import { film } from '../store.js';
import { getScenes } from '../scroll.js';

/**
 * A scene's own progress: 0 before it, 1 after it, sceneProgress while it plays. Lets a
 * scene that stays mounted past its slot rewind and hold cleanly.
 * @param {string} id
 */
export function sceneProgressOf(id) {
  const { activeScene, sceneProgress } = film.getState();
  const index = getScenes().findIndex((scene) => scene.id === id);
  if (index < 0 || activeScene < index) return 0;
  if (activeScene > index) return 1;
  return sceneProgress;
}
