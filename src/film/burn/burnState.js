/**
 * S08's shared state between the film and the DOM reading room: how far the pen has written the
 * headline (0 to 1), and where the newest newsletter cover sits on screen (so the fox's shadow can
 * sit beside it). The film writes, the DOM reads; listeners fire only on change.
 */

let pen = 1;
const penListeners = new Set();

export function currentPen() {
  return pen;
}

export function setPen(value) {
  if (Math.abs(value - pen) < 0.0005) return;
  pen = value;
  penListeners.forEach((fn) => fn(pen));
}

/** @returns {() => void} unsubscribe */
export function onPen(fn) {
  penListeners.add(fn);
  return () => penListeners.delete(fn);
}

/** Screen x (0 to 1) of the newest newsletter cover's centre, or null when there are no covers. */
let coverX = null;

export function setCoverX(value) {
  coverX = value;
}

export function currentCoverX() {
  return coverX;
}
