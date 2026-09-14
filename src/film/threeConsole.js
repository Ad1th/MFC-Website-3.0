import { setConsoleFunction } from 'three';

/**
 * three's own console hook. The brief allows no console output in production except the
 * console fox. React Three Fiber 9 still constructs a THREE.Clock for every canvas, and three
 * r183+ warns that Clock is deprecated; that notice is about the library's internals, not this
 * site, so it is dropped here. Every other message three sends goes to the console unchanged.
 * Imported before any canvas is created (Film.jsx, RunOverlay.jsx).
 */

const DROPPED = [/^THREE\.Clock: This module has been deprecated/];

setConsoleFunction((level, message, ...params) => {
  if (DROPPED.some((pattern) => pattern.test(String(message)))) return;
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  out(message, ...params);
});
