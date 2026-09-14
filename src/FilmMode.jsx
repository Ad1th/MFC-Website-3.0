import { lazy, Suspense, useCallback, useEffect, useRef } from 'react';
import { film } from './film/store.js';
import { initScroll, jumpToScene } from './film/scroll.js';
import { flags } from './live/flags.js';
import { isKeyboardFocus } from './live/inputModality.js';
import Film from './film/Film.jsx';
import Chrome from './dom/Chrome.jsx';
import Semantic from './dom/Semantic.jsx';
import HeroCanvas from './dom/hero/HeroCanvas.jsx';
import GalleryHud from './dom/GalleryHud.jsx';
import SkyOverlay from './dom/SkyOverlay.jsx';
import { initTab } from './live/tab.js';
import { initSecrets } from './live/secrets.js';
import styles from './FilmMode.module.css';

const DebugHud = flags.debug ? lazy(() => import('./film/debug/DebugHud.jsx')) : null;

/**
 * Film mode: the fixed canvas, the chrome, and one scroll track whose height is
 * the whole film. Semantic regions live inside the track at their scene offsets.
 * @param {{ onSkip: () => void }} props
 */
export default function FilmMode({ onSkip }) {
  const trackRef = useRef(null);

  useEffect(() => {
    if (!trackRef.current) return undefined;
    return initScroll(trackRef.current);
  }, []);

  // The tab and the keyboard secrets live with the film.
  useEffect(() => {
    const offTab = initTab();
    const offSecrets = initSecrets();
    return () => {
      offTab();
      offSecrets();
    };
  }, []);

  const subscribeActive = useCallback((fn) => {
    let last = -1;
    const listener = (state) => {
      if (state.activeScene !== last) {
        last = state.activeScene;
        fn(last);
      }
    };
    listener(film.getState());
    return film.subscribe(listener);
  }, []);

  const onRegionFocus = useCallback((index, target) => {
    if (!isKeyboardFocus(target)) return;
    // Next frame: the browser's own scroll-to-focused-element runs after the focus
    // event, and would otherwise land between scenes.
    requestAnimationFrame(() => {
      if (film.getState().activeScene !== index) jumpToScene(index, { immediate: true });
    });
  }, []);

  return (
    <>
      <Chrome onJump={(index) => jumpToScene(index)} onSkip={onSkip} />
      <Film />
      <GalleryHud />
      <SkyOverlay />
      <HeroCanvas />
      <main id="main" tabIndex={-1} className={styles.main}>
        <div ref={trackRef} className={styles.track}>
          <Semantic variant="film" onRegionFocus={onRegionFocus} subscribe={subscribeActive} />
        </div>
      </main>
      {DebugHud ? (
        <Suspense fallback={null}>
          <DebugHud />
        </Suspense>
      ) : null}
    </>
  );
}
