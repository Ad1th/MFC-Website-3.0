import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { film, useFilm } from './film/store.js';
import { initialTier, tierAfterWarmUp, warmUpBenchmark } from './film/quality.js';
import { flags } from './live/flags.js';
import Still from './dom/Still.jsx';
import NotFound from './dom/NotFound.jsx';
import Ignition from './dom/ignition/Ignition.jsx';
import { initConsole } from './live/console.js';
import { initCursor } from './live/cursor.js';
import { initTab } from './live/tab.js';
import { initSecrets } from './live/secrets.js';

const FilmMode = lazy(() => import('./FilmMode.jsx'));
// Development tool. Phase 8 strips it from production builds.
const FoxSandbox = lazy(() => import('./film/fox/Sandbox.jsx'));

const HOME_PATHS = new Set(['/', '/index.html']);

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Decide the starting mode once, before first paint of the real UI. */
function decideMode() {
  if (!HOME_PATHS.has(window.location.pathname)) return { mode: 'notFound', tier: 0 };
  if (flags.sandbox === 'fox') return { mode: 'sandbox', tier: flags.tier ?? 2 };
  const forced = flags.tier !== null && flags.tier >= 0 && flags.tier <= 3 ? flags.tier : null;
  // Still mode asked for: no WebGL probe before first paint (it is slow without a GPU). Whether
  // the film could play is probed after paint, for the "play the film" button (tier null = unknown).
  if (flags.still || prefersReducedMotion()) return { mode: 'still', tier: forced };
  const tier = forced ?? initialTier();
  if (tier === 0) return { mode: 'still', tier };
  return { mode: 'film', tier };
}

const initial = decideMode();
film.getState().setQuality(initial.tier ?? 0);
film.getState().setMode(initial.mode);

export default function App() {
  const mode = useFilm((s) => s.mode);
  const [canPlayFilm, setCanPlayFilm] = useState(initial.tier !== null && initial.tier > 0 && initial.mode !== 'notFound');

  // Still mode chosen up front: find out after paint whether this device could play the film.
  useEffect(() => {
    if (initial.tier !== null || initial.mode !== 'still') return undefined;
    const idle = window.requestIdleCallback ?? ((fn) => window.setTimeout(fn, 200));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = idle(() => {
      const tier = initialTier();
      if (tier > 0) {
        film.getState().setQuality(tier);
        setCanPlayFilm(true);
      }
    });
    return () => cancel(id);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
  }, [mode]);

  // The inline boot cover in index.html bridges the time before this bundle runs. In film
  // mode Ignition's identical cover has painted in this same commit; elsewhere it just goes.
  useEffect(() => {
    document.getElementById('boot')?.remove();
  }, []);

  // The living layer that belongs to every mode (the film and still mode): the console fox, the
  // ember cursor, the tab and the keyboard secrets.
  useEffect(() => {
    initConsole();
    const offCursor = initCursor();
    const offTab = initTab();
    const offSecrets = initSecrets();
    return () => {
      offCursor();
      offTab();
      offSecrets();
    };
  }, []);

  // The warm-up benchmark runs while Ignition covers the page, and can lower the tier before the
  // reveal. A forced tier (?tier=) skips it.
  useEffect(() => {
    if (initial.mode !== 'film' || flags.tier !== null) return;
    let cancelled = false;
    warmUpBenchmark().then((ms) => {
      if (cancelled) return;
      const state = film.getState();
      const tier = tierAfterWarmUp(state.quality, ms);
      if (tier < state.quality) state.setQuality(tier);
      document.documentElement.dataset.warmUp = ms === null ? 'none' : String(Math.round(ms * 10) / 10);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toStill = useCallback(() => {
    film.getState().setMode('still');
    window.scrollTo({ top: 0, behavior: 'instant' });
    requestAnimationFrame(() => document.getElementById('main')?.focus());
  }, []);

  const toFilm = useCallback(() => {
    film.getState().setMode('film');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const onReveal = useCallback(() => {
    // Tests and frame capture wait for this instead of guessing when the cover lifts.
    document.documentElement.dataset.ignition = 'done';
  }, []);

  if (mode === 'notFound') return <NotFound />;
  if (mode === 'sandbox') {
    return (
      <Suspense fallback={null}>
        <FoxSandbox />
      </Suspense>
    );
  }
  if (mode === 'still') return <Still canPlayFilm={canPlayFilm} onPlayFilm={toFilm} />;
  return (
    <>
      <Suspense fallback={null}>
        <FilmMode onSkip={toStill} />
      </Suspense>
      {/* Outside the lazy film chunk: the counter shows at first paint and counts the chunk's bytes.
          After the film in the DOM, so the film's "skip the film" stays the first Tab stop once the
          sound choice appears (Ignition is a fixed overlay, so order does not change what is seen). */}
      <Ignition onReveal={onReveal} onSkip={toStill} />
    </>
  );
}
