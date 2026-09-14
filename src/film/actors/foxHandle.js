/**
 * The film fox's imperative handle (trigger, anchors, ...), kept apart from foxShots.js so the
 * living layer can reach the fox without pulling three into the first load (still mode).
 */

let foxHandle = null;

/** The film's fox, or null before it mounts (and always in still mode). */
export function getFox() {
  return foxHandle;
}

export function setFoxHandle(handle) {
  foxHandle = handle;
}
