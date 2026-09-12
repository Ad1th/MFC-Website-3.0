import { film } from '../store.js';
import { projects } from '../../content/index.js';

const DOLLY_SECONDS = 0.38;
const RETURN_SECONDS = 0.5;

/** A click on a slab or its link: a short dolly-in, then the project opens in a new tab. */
export function openProject(index) {
  const project = projects[index];
  if (!project) return;
  film.getState().dollyGallery(performance.now());
  window.setTimeout(() => {
    window.open(project.link, '_blank', 'noopener');
  }, DOLLY_SECONDS * 1000);
}

/** How far the dolly has pushed in, 0 to 1 and back, from the store's timestamp. */
export function dollyAmount(now = performance.now()) {
  const start = film.getState().galleryDolly;
  if (!start) return 0;
  const t = (now - start) / 1000;
  if (t < 0 || t > DOLLY_SECONDS + RETURN_SECONDS) return 0;
  if (t < DOLLY_SECONDS) return Math.sin((t / DOLLY_SECONDS) * (Math.PI / 2));
  return 1 - (t - DOLLY_SECONDS) / RETURN_SECONDS;
}
