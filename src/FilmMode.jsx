import { lazy, Suspense, useCallback, useEffect, useRef } from 'react';
import { film } from './film/store.js';
import { initScroll, jumpToScene } from './film/scroll.js';
import { SCENES } from './film/timeline.js';
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
import { initRace } from './live/race.js';
import RaceResult from './dom/RaceResult.jsx';
import DirectorsCutHud from './dom/DirectorsCutHud.jsx';
import styles from './FilmMode.module.css';

/** Where keyboard focus lands inside a scene: S10's form is only visible once the pane is whole. */
const FOCUS_AT = { S10: 0.74 };

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
    const offRace = initRace();
    return () => {
      offTab();
      offSecrets();
      offRace();
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
      const focusAt = FOCUS_AT[SCENES[index]?.id] ?? 0;
      if (film.getState().activeScene !== index || film.getState().sceneProgress < focusAt) jumpToScene(index, { immediate: true, progress: focusAt });
    });
  }, []);

  return (
    <>
      <Chrome onJump={(index) => jumpToScene(index)} onSkip={onSkip} />
      <Film />
      <GalleryHud />
      <SkyOverlay />
      <RaceResult />
      <DirectorsCutHud />
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
