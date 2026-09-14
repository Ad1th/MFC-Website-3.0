import { useEffect, useRef } from 'react';
import { film } from '../../film/store.js';
import { currentPen, onPen } from '../../film/burn/burnState.js';

/**
 * S08's headline written like a pen: SplitText splits it into characters, and each character is
 * wiped in with a clip-path in sequence as the film's pen advances (a function of scroll, so it
 * un-writes on the way back). Outside film mode, or with reduced motion, the text is simply there.
 * SplitText keeps the whole string as the element's accessible name. GSAP loads only when the film
 * plays, so still mode never downloads it.
 */
export default function PenTitle({ children, className }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || film.getState().mode !== 'film') return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let cancelled = false;
    let cleanup = () => {};
    Promise.all([import('gsap'), import('gsap/SplitText')]).then(([{ gsap }, { SplitText }]) => {
      if (cancelled) return;
      gsap.registerPlugin(SplitText);
      // Words as well as characters: characters alone let the line wrap in the middle of a word.
      const split = new SplitText(el, { type: 'words,chars', aria: 'auto' });
      const chars = split.chars;
      const apply = (pen) => {
        const n = chars.length;
        chars.forEach((char, i) => {
          const t = Math.min(1, Math.max(0, pen * n * 1.1 - i));
          char.style.clipPath = t >= 1 ? '' : `inset(0 ${((1 - t) * 100).toFixed(1)}% 0 0)`;
        });
      };
      apply(currentPen());
      const off = onPen(apply);
      cleanup = () => {
        off();
        split.revert();
      };
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return (
    <span ref={ref} className={className}>
      {children}
    </span>
  );
}
