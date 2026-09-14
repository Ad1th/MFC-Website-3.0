import { film } from '../film/store.js';
import { getScenes } from '../film/scroll.js';
import { getFox } from '../film/actors/foxShots.js';
import { FILM_TEST } from '../film/testHooks.js';

/**
 * The race home. Once you have reached the end card, scrolling back up from it wakes the fox,
 * which races you to the top (FilmFox runs it just ahead of the camera through every scene you
 * rewind). The fox takes 2.5 s. Beat it and it arrives second, sits and looks away (`rematch?`);
 * slower, and it waits at the top in a play bow, tail wagging (`again?`). Scrolling back down
 * inside the end card calls the race off.
 */

export const FOX_TIME_MS = 2500;
const RESULT_MS = 12000;
const REACHED_END = 0.6;

/** @returns {() => void} teardown */
export function initRace() {
  let reachedEnd = false;
  let wagTimer = 0;
  let resultTimer = 0;
  const set = (race) => film.getState().setRace(race);
  const clearTimers = () => {
    window.clearInterval(wagTimer);
    window.clearTimeout(resultTimer);
  };

  const off = film.subscribe((s, prev) => {
    if (s.progress === prev.progress) return;
    const end = getScenes().findIndex((scene) => scene.id === 'S11');

    if (s.race.phase === 'idle') {
      if (s.activeScene === end && s.sceneProgress >= REACHED_END) reachedEnd = true;
      if (reachedEnd && prev.activeScene === end && s.progress < prev.progress) {
        reachedEnd = false;
        set({ phase: 'racing', startedAt: performance.now(), result: null });
        // Awake, a stretch, and off.
        getFox()?.trigger('playBow', {}, { force: true });
      }
    }

    const race = film.getState().race;
    if (race.phase === 'racing') {
      if (s.activeScene === end && s.progress > prev.progress) {
        set({ phase: 'idle', startedAt: 0, result: null });
        return;
      }
      if (s.activeScene === 0 && s.sceneProgress <= 0.02) {
        const elapsed = performance.now() - race.startedAt;
        const result = elapsed < FOX_TIME_MS ? 'viewer' : 'fox';
        set({ phase: 'done', startedAt: race.startedAt, result, elapsed });
        clearTimers();
        if (result === 'fox') {
          getFox()?.trigger('playBow', {}, { force: true });
          wagTimer = window.setInterval(() => getFox()?.trigger('wag', { intensity: 1 }, { force: true }), 1600);
        }
        resultTimer = window.setTimeout(() => {
          clearTimers();
          if (film.getState().race.phase === 'done') set({ phase: 'idle', startedAt: 0, result: null });
        }, RESULT_MS);
      }
      return;
    }

    if (race.phase === 'done' && (s.activeScene > 0 || s.sceneProgress > 0.12)) {
      clearTimers();
      set({ phase: 'idle', startedAt: 0, result: null });
    }
  });

  if (FILM_TEST) window.__filmTest.race = () => ({ ...film.getState().race });

  return () => {
    off();
    clearTimers();
  };
}
