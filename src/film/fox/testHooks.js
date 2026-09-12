/**
 * Test-only switches that deliberately re-create fixed bugs, so regression tests
 * can be shown to fail. Available in `vite dev` and in builds made with
 * VITE_FOX_TEST_HOOKS=1 (the Playwright build). In a normal production build the
 * condition is the constant `false`, the URL is never read and the value is null,
 * so the switch cannot be triggered; scripts/check-dist.mjs fails the build if the
 * word appears in the output.
 */
const ENABLED = import.meta.env.DEV || import.meta.env.VITE_FOX_TEST_HOOKS === '1';

/** @type {null|'embers-parent'|'no-hit-radius'|'no-near-radius'} */
export const FOX_REGRESS = ENABLED ? new URLSearchParams(window.location.search).get('regress') : null;
