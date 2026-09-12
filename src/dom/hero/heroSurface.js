/**
 * Shared handle on the hero canvas. The DOM layer draws the hero into it; the film
 * uploads the very same canvas as the texture of the intact page and of its shards.
 */

/** @type {HTMLCanvasElement|null} */
let canvas = null;
let version = 0;
const listeners = new Set();

export function registerHeroCanvas(el) {
  canvas = el;
  version += 1;
  listeners.forEach((fn) => fn());
}

export function getHeroCanvas() {
  return canvas;
}

/** Bumped every time the hero is redrawn, so the film knows to re-upload the texture. */
export function heroVersion() {
  return version;
}

export function heroRedrawn() {
  version += 1;
  listeners.forEach((fn) => fn());
}

export function onHeroChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
