import { lazy, Suspense, useCallback, useEffect, useRef } from 'react';
import { film, useFilm } from './film/store.js';
import { initialTier } from './film/quality.js';
import { flags } from './live/flags.js';
import Still from './dom/Still.jsx';
import NotFound from './dom/NotFound.jsx';

const FilmMode = lazy(() => import('./FilmMode.jsx'));

const HOME_PATHS = new Set(['/', '/index.html']);

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Decide the starting mode once, before first paint of the real UI. */
function decideMode() {
  if (!HOME_PATHS.has(window.location.pathname)) return { mode: 'notFound', tier: 0 };
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

  const toStill = useCallback(() => {
    film.getState().setMode('still');
    window.scrollTo({ top: 0, behavior: 'instant' });
    requestAnimationFrame(() => document.getElementById('main')?.focus());
  }, []);

  const toFilm = useCallback(() => {
    film.getState().setMode('film');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  if (mode === 'notFound') return <NotFound />;
  if (mode === 'still') return <Still canPlayFilm={canPlayFilm} onPlayFilm={toFilm} />;
  return (
    <Suspense fallback={<Still canPlayFilm={false} onPlayFilm={toFilm} />}>
      <FilmMode onSkip={toStill} />
    </Suspense>
  );
}
