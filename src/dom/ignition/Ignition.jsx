import { useEffect, useRef, useState } from 'react';
import { film, useFilm } from '../../film/store.js';
import { TITLES } from '../../film/timeline.js';
import { filmManifest, preload } from '../../live/preload.js';
import { darkPixel, startEmber } from '../../live/favicon.js';
import { setScrollLocked, setTitlesLive } from '../../film/scroll.js';
import styles from './Ignition.module.css';

/**
 * S00 Ignition. Black, a heartbeat pixel in the centre, and a counter bottom left that
 * measures the film's real bytes (preload.js). At 100 a match strikes: for exactly one
 * frame the flame has two ear points, then it flares white for exactly 4 frames (frames
 * are counted, not timed), the favicon catches and the title becomes the club's name.
 * Then the page is revealed and a tiny sound choice waits bottom right.
 *
 * If loading passes 6 seconds: `still loading. start anyway?` drops one quality tier and
 * lets the film stream the rest. Scroll is locked until the reveal; the skip link and
 * keyboard focus keep working the whole time.
 */

const SLOW_MS = 6000;
const SOUND_KEY = 'mfc.sound';

function rememberedSound() {
  try {
    const value = sessionStorage.getItem(SOUND_KEY);
    return value === 'on' || value === 'off' ? value : null;
  } catch {
    return null;
  }
}

function drawFlame(ctx, size, { ears, flare }) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  const cx = width / 2;
  const cy = height / 2;
  const s = size * (window.devicePixelRatio || 1);
  if (flare) {
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 6);
    glow.addColorStop(0, 'rgba(255, 255, 255, 1)');
    glow.addColorStop(0.2, 'rgba(255, 241, 220, 0.9)');
    glow.addColorStop(1, 'rgba(255, 241, 220, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    return;
  }
  const gradient = ctx.createLinearGradient(cx, cy + s, cx, cy - s * 1.8);
  gradient.addColorStop(0, '#fff1dc');
  gradient.addColorStop(0.45, '#ffb36b');
  gradient.addColorStop(1, '#ff6d00');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  if (ears) {
    // The one-frame secret: the flame's tip splits into two pointed ears.
    ctx.moveTo(cx - s * 0.55, cy - s * 1.55);
    ctx.lineTo(cx - s * 0.18, cy - s * 0.75);
    ctx.lineTo(cx + s * 0.18, cy - s * 0.75);
    ctx.lineTo(cx + s * 0.55, cy - s * 1.55);
    ctx.bezierCurveTo(cx + s * 0.95, cy - s * 0.5, cx + s * 0.8, cy + s, cx, cy + s);
    ctx.bezierCurveTo(cx - s * 0.8, cy + s, cx - s * 0.95, cy - s * 0.5, cx - s * 0.55, cy - s * 1.55);
  } else {
    ctx.moveTo(cx, cy - s * 1.8);
    ctx.bezierCurveTo(cx + s * 0.9, cy - s * 0.6, cx + s * 0.8, cy + s, cx, cy + s);
    ctx.bezierCurveTo(cx - s * 0.8, cy + s, cx - s * 0.9, cy - s * 0.6, cx, cy - s * 1.8);
  }
  ctx.fill();
}

/**
 * @param {{ onReveal: () => void }} props
 */
export default function Ignition({ onReveal }) {
  const [percent, setPercent] = useState(0);
  const [phase, setPhase] = useState('loading'); // loading | strike | revealed
  const [slow, setSlow] = useState(false);
  const sound = useFilm((s) => s.sound);
  const flameRef = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    const remembered = rememberedSound();
    if (remembered) film.getState().setSound(remembered);
  }, []);

  useEffect(() => {
    document.title = TITLES.loading;
    darkPixel();
    setScrollLocked(true);
    const controller = new AbortController();
    // Six seconds from navigation, not from when this chunk arrived.
    const slowTimer = window.setTimeout(() => setSlow(true), Math.max(0, SLOW_MS - performance.now()));
    preload(filmManifest(film.getState().quality), (value) => {
      setPercent(value);
      film.getState().setLoaded(value);
    }, { signal: controller.signal })
      .then(() => {
        window.clearTimeout(slowTimer);
        if (!started.current) setPhase('strike');
      })
      .catch(() => {});
    return () => {
      controller.abort();
      window.clearTimeout(slowTimer);
    };
  }, []);

  // The strike: frame-counted, so the ears are exactly one frame and the flare exactly four.
  useEffect(() => {
    if (phase !== 'strike') return undefined;
    started.current = true;
    const canvas = flameRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) {
      setPhase('revealed');
      return undefined;
    }
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    let frame = 0;
    let raf = 0;
    const step = () => {
      if (frame === 0) drawFlame(ctx, 10, { ears: true, flare: false });
      else if (frame <= 4) drawFlame(ctx, 10, { ears: false, flare: true });
      else {
        drawFlame(ctx, 10, { ears: false, flare: false });
        document.title = TITLES.ready;
        setTitlesLive(true);
        startEmber();
        setPhase('revealed');
        setScrollLocked(false);
        onReveal?.();
        return;
      }
      frame += 1;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase, onReveal]);

  const startAnyway = () => {
    started.current = true;
    const state = film.getState();
    state.setQuality(Math.max(1, state.quality - 1));
    setPhase('strike');
  };

  const choose = (value) => {
    film.getState().setSound(value);
    try {
      sessionStorage.setItem(SOUND_KEY, value);
    } catch {
      // Remembered for this page only.
    }
  };

  return (
    <>
      {phase !== 'revealed' ? (
        <div className={styles.cover} data-phase={phase} role="status" aria-live="polite" aria-label={`loading the film, ${percent} percent`}>
          {phase === 'loading' ? <span className={styles.pulse} aria-hidden="true" /> : null}
          <canvas ref={flameRef} className={styles.flame} aria-hidden="true" />
          <span className={`hud ${styles.counter}`} aria-hidden="true">
            {String(percent).padStart(3, '0')}
          </span>
          {slow && phase === 'loading' ? (
            <button type="button" className={`hud ${styles.slow}`} onClick={startAnyway}>
              still loading. start anyway?
            </button>
          ) : null}
        </div>
      ) : null}
      {phase === 'revealed' && sound === null ? (
        <div className={`hud ${styles.sound}`} role="group" aria-label="sound">
          <button type="button" onClick={() => choose('on')}>
            watch with sound
          </button>
          <button type="button" onClick={() => choose('off')}>
            watch in silence
          </button>
        </div>
      ) : null}
    </>
  );
}
