/**
 * Film test hooks. Same gate as the fox hooks: only `vite dev` and builds made with
 * VITE_FOX_TEST_HOOKS=1 (the Playwright build) can read them. In a production build
 * ENABLED is the constant `false`, so the URL is never read and the override object
 * is never created; scripts/check-dist.mjs fails the build if either leaks.
 *
 *   ?freeze=1            no time-based motion (camera sway, placeholder spin), and the
 *                        camera snaps to its scroll target, so two screenshots at the
 *                        same scroll position are identical
 *   window.__filmTest    { shatter: null|true|false } forces the S02 hero swap
 */
const ENABLED = import.meta.env.DEV || import.meta.env.VITE_FOX_TEST_HOOKS === '1';

export const FILM_TEST = ENABLED;
export const FILM_FREEZE = ENABLED ? new URLSearchParams(window.location.search).get('freeze') === '1' : false;

if (ENABLED) {
  window.__filmTest = window.__filmTest ?? { shatter: null };
}

/** @returns {null|boolean} */
export function shatterOverride() {
  return ENABLED ? (window.__filmTest?.shatter ?? null) : null;
}
