import { useEffect, useRef } from 'react';
import { heroLayout, HERO_FONTS, HERO_COLORS } from './heroLayout.js';
import { registerHeroCanvas, heroRedrawn } from './heroSurface.js';
import { filmDpr } from '../../film/dpr.js';
import { useFilm } from '../../film/store.js';
import styles from './Hero.module.css';

/**
 * The hero page: logo, HUD and title drawn into a 2D canvas at the film's device pixel
 * ratio. In film mode the canvas is never shown; it is the texture the film paints as
 * the intact page and then shatters (S02, D-061), so one pipeline paints those pixels
 * before and after the swap. The real, selectable text is the semantic intro region.
 */

let logoImage = null;
function loadLogo() {
  if (logoImage) return logoImage;
  logoImage = new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = '/images/logo_main.png';
  });
  return logoImage;
}

async function fontsReady() {
  if (!document.fonts?.load) return;
  try {
    await Promise.all([document.fonts.load(HERO_FONTS.title(120), 'MOZILLA'), document.fonts.load(HERO_FONTS.hud, 'you: vellore 00:00')]);
  } catch {
    // Fallback faces still draw; the canvas redraws if fonts arrive later.
  }
}

export default function HeroCanvas() {
  const ref = useRef(null);
  const tier = useFilm((s) => s.quality);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let logo = null;
    let alive = true;
    let minuteTimer = 0;

    const measure = (text, font) => {
      ctx.font = font;
      return ctx.measureText(text).width;
    };

    const draw = () => {
      if (!alive) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = filmDpr(tier);
      // Floor, like WebGLRenderer.setSize, so both backing stores are the same size.
      const backingW = Math.floor(width * dpr);
      const backingH = Math.floor(height * dpr);
      if (canvas.width !== backingW || canvas.height !== backingH) {
        canvas.width = backingW;
        canvas.height = backingH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const layout = heroLayout(width, height, measure);

      if (logo) ctx.drawImage(logo, layout.logo.x, layout.logo.y, layout.logo.size, layout.logo.size);

      ctx.textBaseline = 'alphabetic';
      ctx.font = HERO_FONTS.hud;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      for (const line of layout.hud) {
        ctx.fillStyle = line.color;
        ctx.fillText(line.text, line.x, line.y);
      }

      ctx.font = layout.title.font;
      ctx.fillStyle = HERO_COLORS.title;
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${layout.title.tracking}px`;
      for (const line of layout.title.lines) ctx.fillText(line.text, line.x, line.baseline);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

      canvas.dataset.ready = 'true';
      heroRedrawn();
    };

    const scheduleMinute = () => {
      const now = new Date();
      const ms = (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 20;
      minuteTimer = window.setTimeout(() => {
        draw();
        scheduleMinute();
      }, ms);
    };

    registerHeroCanvas(canvas);
    draw();
    Promise.all([fontsReady(), loadLogo()]).then(([, img]) => {
      logo = img;
      draw();
    });
    scheduleMinute();
    window.addEventListener('resize', draw);
    return () => {
      alive = false;
      window.clearTimeout(minuteTimer);
      window.removeEventListener('resize', draw);
    };
  }, [tier]);

  return <canvas ref={ref} className={styles.canvas} aria-hidden="true" />;
}
