/**
 * Flags S00 sets before the film chunk exists. Ignition lives in the main bundle so its
 * counter shows at first paint; importing scroll.js from there would pull gsap and Lenis
 * into that bundle, so both sides meet here instead.
 *
 *   scroll lock   requested by Ignition while loading; scroll.js applies it when Lenis starts
 *   titles live   scene titles wait until the match is struck (the tab reads "." until then)
 */

let lockRequested = false;
let titlesLive = false;
const lockListeners = new Set();

/** @param {boolean} locked */
export function requestScrollLock(locked) {
  lockRequested = locked;
  lockListeners.forEach((fn) => fn(locked));
}

export function scrollLockRequested() {
  return lockRequested;
}

/**
 * @param {(locked: boolean) => void} fn
 * @returns {() => void} unsubscribe
 */
export function onScrollLockChange(fn) {
  lockListeners.add(fn);
  return () => lockListeners.delete(fn);
}

/** @param {boolean} live */
export function setTitlesLive(live) {
  titlesLive = live;
}

export function titlesAreLive() {
  return titlesLive;
}
