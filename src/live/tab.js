import { film } from '../film/store.js';
import { setDim, setHeat } from './favicon.js';

/**
 * The tab (living layer). The favicon ember grows with the film's progress. Leaving the tab
 * sets the title to `the fox is waiting.` and dims the ember over ten seconds; the film stops
 * rendering while hidden. Coming back after thirty seconds or more finds the fox asleep, and it
 * wakes when you scroll (scroll.js clears the flag). Per-scene titles come from timeline.js.
 */

export const WAITING_TITLE = 'the fox is waiting.';
const SLEEP_AFTER_MS = 30000;
const DIM_MS = 10000;

/** @returns {() => void} teardown */
export function initTab() {
  let hiddenAt = 0;
  let savedTitle = null;
  let dimTimer = 0;

  const offProgress = film.subscribe((state, previous) => {
    if (state.progress !== previous.progress) setHeat(0.25 + 0.75 * state.progress);
  });

  const onVisibility = () => {
    const store = film.getState();
    if (document.hidden) {
      hiddenAt = performance.now();
      savedTitle = document.title;
      document.title = WAITING_TITLE;
      store.setTabHidden(true);
      const start = performance.now();
      window.clearInterval(dimTimer);
      dimTimer = window.setInterval(() => {
        const t = Math.min(1, (performance.now() - start) / DIM_MS);
        setDim(1 - 0.8 * t);
        if (t >= 1) window.clearInterval(dimTimer);
      }, 250);
      return;
    }
    window.clearInterval(dimTimer);
    setDim(1);
    if (savedTitle && document.title === WAITING_TITLE) document.title = savedTitle;
    store.setTabHidden(false);
    if (performance.now() - hiddenAt >= SLEEP_AFTER_MS) store.setFoxAsleep(true);
  };

  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.clearInterval(dimTimer);
    offProgress();
  };
}
