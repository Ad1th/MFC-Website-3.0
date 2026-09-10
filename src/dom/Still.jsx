import { useEffect, useRef } from 'react';
import Semantic from './Semantic.jsx';
import styles from './Still.module.css';

/**
 * Graphic-novel mode: one composed frame per scene with real HTML over it.
 * Phase 1 frames are type-only; captured stills (public/stills/Sxx.avif)
 * slot in behind the text in Phase 7.
 * @param {{ canPlayFilm: boolean, onPlayFilm: () => void }} props
 */
export default function Still({ canPlayFilm, onPlayFilm }) {
  const rootRef = useRef(null);

  useEffect(() => {
    document.title = 'mozilla firefox club';
    const frames = rootRef.current?.querySelectorAll('[data-region]') ?? [];
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) {
      frames.forEach((f) => f.setAttribute('data-seen', 'true'));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute('data-seen', 'true');
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15 },
    );
    frames.forEach((f) => io.observe(f));
    return () => io.disconnect();
  }, []);

  return (
    <div ref={rootRef} className={styles.still}>
      {canPlayFilm ? (
        <button type="button" className={`hud ${styles.play}`} onClick={onPlayFilm}>
          play the film
        </button>
      ) : null}
      <main id="main" tabIndex={-1} className={styles.main}>
        <Semantic variant="still" />
      </main>
    </div>
  );
}
