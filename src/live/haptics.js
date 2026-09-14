/**
 * Haptics (mobile): a short buzz on the film's big moments, where the device supports it
 * (`navigator.vibrate`; iOS Safari does not). Never under reduced motion, never faster than the
 * minimum gap, and silently nothing everywhere else.
 */

const MIN_GAP_MS = 250;
let last = 0;

/** @param {number|number[]} pattern milliseconds, or an on/off pattern */
export function buzz(pattern = 18) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const now = performance.now();
  if (now - last < MIN_GAP_MS) return false;
  last = now;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}
