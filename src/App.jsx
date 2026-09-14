import { lazy, Suspense, useCallback, useEffect, useRef } from 'react';
import { film, useFilm } from './film/store.js';
import { initialTier } from './film/quality.js';
import { flags } from './live/flags.js';
import Still from './dom/Still.jsx';
import NotFound from './dom/NotFound.jsx';
import Ignition from './dom/ignition/Ignition.jsx';
import { initConsole } from './live/console.js';
import { initCursor } from './live/cursor.js';

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
  const forced = flags.tier;
  const tier = forced !== null && forced >= 0 && forced <= 3 ? forced : initialTier();
  if (flags.still || prefersReducedMotion() || tier === 0) return { mode: 'still', tier };
  return { mode: 'film', tier };
}

const initial = decideMode();
film.getState().setQuality(initial.tier);
film.getState().setMode(initial.mode);

export default function App() {
  const mode = useFilm((s) => s.mode);
  const canPlayFilm = useRef(initial.tier > 0 && initial.mode !== 'notFound').current;

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
  }, [mode]);

  // The inline boot cover in index.html bridges the time before this bundle runs. In film
  // mode Ignition's identical cover has painted in this same commit; elsewhere it just goes.
  useEffect(() => {
    document.getElementById('boot')?.remove();
  }, []);

  // The living layer that belongs to every mode: the console fox and the ember cursor.
  useEffect(() => {
    initConsole();
    return initCursor();
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
      {/* Outside the lazy film chunk: the counter shows at first paint and counts the chunk's bytes. */}
      <Ignition onReveal={onReveal} onSkip={toStill} />
      <Suspense fallback={null}>
        <FilmMode onSkip={toStill} />
      </Suspense>
    </>
  );
}
