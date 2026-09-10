/**
 * Tells keyboard focus apart from programmatic or load-time focus.
 * The film only follows focus into a region when a person tabbed there:
 * a Tab or Shift+Tab keydown in the last 500ms, or :focus-visible while the
 * last navigation input was Tab (a pointer press ends keyboard navigation).
 * Programmatic focus with no Tab behind it never moves the film.
 */

const TAB_WINDOW_MS = 500;

let lastTabAt = Number.NEGATIVE_INFINITY;
let tabNavigating = false;

if (typeof window !== 'undefined') {
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Tab') {
        lastTabAt = performance.now();
        tabNavigating = true;
      }
    },
    true,
  );
  window.addEventListener(
    'pointerdown',
    () => {
      tabNavigating = false;
    },
    true,
  );
}

/**
 * @param {EventTarget|null} target the element that just received focus
 * @returns {boolean}
 */
export function isKeyboardFocus(target) {
  if (performance.now() - lastTabAt < TAB_WINDOW_MS) return true;
  if (!tabNavigating || !(target instanceof Element)) return false;
  try {
    return target.matches(':focus-visible');
  } catch {
    return false;
  }
}
