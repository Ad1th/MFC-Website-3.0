import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { TITLES } from '../film/timeline.js';
import styles from './NotFound.module.css';

const NotFoundScene = lazy(() => import('./NotFoundScene.jsx'));

/**
 * The 404. Pitch dark, the fox searching with a torch in its mouth, the cursor the only other
 * light (NotFoundScene.jsx). The words are real HTML over it. `take me home` sends the fox
 * running back first. Reduced motion or no WebGL: just the words and the link.
 */

function canAnimate() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

export default function NotFound() {
  const [animate] = useState(canAnimate);
  const [found, setFound] = useState(false);
  const pointer = useRef({ x: -1000, y: -1000, active: false });
  const leaveRef = useRef(null);
  const lightRef = useRef(null);

  useEffect(() => {
    document.title = TITLES.notFound;
  }, []);

  useEffect(() => {
    const onMove = (event) => {
      if (event.pointerType === 'touch') return;
      pointer.current = { x: event.clientX, y: event.clientY, active: true };
      lightRef.current?.style.setProperty('--x', `${event.clientX}px`);
      lightRef.current?.style.setProperty('--y', `${event.clientY}px`);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  const goHome = useCallback(
    (event) => {
      if (!animate || !leaveRef.current || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      leaveRef.current();
      window.setTimeout(() => window.location.assign('/'), 900);
    },
    [animate],
  );

  return (
    <main id="main" className={styles.page} data-found={found || undefined}>
      {animate ? (
        <>
          <Suspense fallback={null}>
            <NotFoundScene pointer={pointer} leaveRef={leaveRef} onFound={() => setFound(true)} />
          </Suspense>
          <div ref={lightRef} className={styles.light} aria-hidden="true" />
        </>
      ) : null}
      <h1 className={styles.line}>this page doesn't exist. the fox checked.</h1>
      <a href="/" className={`hud ${styles.home}`} onClick={goHome} data-cursor="link">
        take me home
      </a>
    </main>
  );
}
