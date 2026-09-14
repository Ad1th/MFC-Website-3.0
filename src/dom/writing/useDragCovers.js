import { useEffect } from 'react';
import { film } from '../../film/store.js';
import { setCoverX } from '../../film/burn/burnState.js';

/**
 * Newsletter covers as physical objects (S08): each sits at a slight tilt, can be dragged and
 * thrown with inertia and friction inside the writing region, and curls a corner while held
 * (`data-dragging`, styled in CSS). A click without a drag still opens the PDF in a new tab, and
 * the links stay ordinary links for the keyboard. Also reports where the newest cover is, so the
 * fox's shadow can sit beside it.
 *
 * @param {{ current: HTMLElement|null }} listRef the covers list
 * @param {number} count how many covers are rendered (re-binds when it changes)
 */
export function useDragCovers(listRef, count) {
  useEffect(() => {
    const list = listRef.current;
    if (!list || !count || film.getState().mode !== 'film') {
      setCoverX(null);
      return undefined;
    }
    let cancelled = false;
    let cleanup = () => setCoverX(null);
    // GSAP loads only when the film plays (still mode never downloads it).
    Promise.all([import('gsap'), import('gsap/Draggable'), import('gsap/InertiaPlugin')]).then(([{ gsap }, { Draggable }, { InertiaPlugin }]) => {
      if (cancelled) return;
      gsap.registerPlugin(Draggable, InertiaPlugin);
      const items = [...list.querySelectorAll('a')];
      items.forEach((item, i) => gsap.set(item, { rotation: (i % 2 ? 1 : -1) * (1.5 + (i % 3)) }));

      const report = () => {
        const rect = items[0]?.getBoundingClientRect();
        setCoverX(rect && rect.width ? (rect.left + rect.width / 2) / window.innerWidth : null);
      };
      report();

      const draggables = Draggable.create(items, {
        type: 'x,y',
        inertia: true,
        bounds: list.closest('section') ?? undefined,
        edgeResistance: 0.85,
        dragClickables: true,
        onPress() {
          this.target.dataset.dragging = 'true';
        },
        onRelease() {
          delete this.target.dataset.dragging;
        },
        onDragEnd: report,
        onThrowComplete: report,
        onClick() {
          window.open(this.target.href, '_blank', 'noopener');
        },
      });
      window.addEventListener('resize', report);
      cleanup = () => {
        window.removeEventListener('resize', report);
        draggables.forEach((d) => d.kill());
        setCoverX(null);
      };
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [listRef, count]);
}
