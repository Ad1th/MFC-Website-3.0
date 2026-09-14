import { film } from '../film/store.js';
import { getFox } from '../film/actors/foxShots.js';

/**
 * Secrets (living layer), listened for on the keyboard outside form fields:
 *   typing "fox"   the fox's ears perk up and its head lifts
 *   Konami code    every ember becomes a tiny fox for three seconds (the fox's particles)
 *   D              Director's Cut on and off
 */

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
const KONAMI_MS = 3000;

function typingInField(target) {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

/** @returns {() => void} teardown */
export function initSecrets() {
  let typed = '';
  let konami = 0;

  const onKey = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || typingInField(event.target)) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

    // Konami, tracked by position so a wrong key starts over.
    konami = key === KONAMI[konami] ? konami + 1 : key === KONAMI[0] ? 1 : 0;
    if (konami === KONAMI.length) {
      konami = 0;
      film.getState().setFoxSprites(performance.now() + KONAMI_MS);
    }

    if (key.length === 1) {
      typed = (typed + key).slice(-3);
      if (typed === 'fox') {
        const fox = getFox();
        fox?.trigger('earsPerk', {}, { force: true });
        typed = '';
      }
      if (key === 'd') {
        film.getState().setDirectorsCut(!film.getState().directorsCut);
      }
    }
  };

  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
