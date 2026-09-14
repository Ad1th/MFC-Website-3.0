/**
 * The cursor as an ember (living layer). A fixed canvas overlay that never takes pointer events:
 * a glowing head with a short two-frame trail, opening into a ring over anything you can press
 * (`[data-cursor="link"]`, links, buttons, fields). Off on coarse pointers, where the native
 * behaviour stays. No React state: pointer events write plain variables and one rAF loop draws.
 * `sparkAtCursor()` throws a few sparks off the ember (the contact email's copy confirmation).
 */

const INTERACTIVE = '[data-cursor="link"], a, button, input, textarea, select, label, [role="radio"]';

let sparks = [];
let lastX = -100;
let lastY = -100;

/** A small burst of sparks at the cursor. */
export function sparkAtCursor(count = 10) {
  const now = performance.now();
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const speed = 60 + Math.random() * 90;
    sparks.push({ x: lastX, y: lastY, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 40, born: now });
  }
}

/** @returns {() => void} teardown */
export function initCursor() {
  if (typeof window === 'undefined' || window.matchMedia('(pointer: coarse)').matches) return () => {};

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '1000' });
  document.body.appendChild(canvas);
  document.documentElement.dataset.cursor = 'ember';
  const ctx = canvas.getContext('2d');

  let dpr = 1;
  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
  };
  resize();

  const trail = [
    { x: -100, y: -100 },
    { x: -100, y: -100 },
  ];
  let ring = 0;
  let target = 0;
  let visible = false;
  let last = performance.now();

  const onMove = (event) => {
    lastX = event.clientX;
    lastY = event.clientY;
    visible = true;
    target = event.target instanceof Element && event.target.closest(INTERACTIVE) ? 1 : 0;
  };
  const onLeave = () => {
    visible = false;
  };

  let raf = 0;
  const draw = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    ring += (target - ring) * Math.min(1, dt * 14);

    if (visible) {
      // The trail: the last two frames' positions, smaller and cooler.
      trail.forEach((p, i) => {
        const r = 3.2 - i * 1.1;
        ctx.fillStyle = `rgba(255, 109, 0, ${0.45 - i * 0.18})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, r), 0, Math.PI * 2);
        ctx.fill();
      });
      if (ring > 0.02) {
        ctx.strokeStyle = `rgba(255, 179, 107, ${0.85 * ring})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(lastX, lastY, 6 + 12 * ring, 0, Math.PI * 2);
        ctx.stroke();
      }
      const head = 5 * (1 - ring * 0.45);
      const glow = ctx.createRadialGradient(lastX, lastY, 0, lastX, lastY, head * 2.4);
      glow.addColorStop(0, 'rgba(255, 241, 220, 1)');
      glow.addColorStop(0.35, 'rgba(255, 179, 107, 0.95)');
      glow.addColorStop(1, 'rgba(255, 109, 0, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(lastX, lastY, head * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    trail[1] = trail[0];
    trail[0] = { x: lastX, y: lastY };

    sparks = sparks.filter((s) => now - s.born < 520);
    for (const s of sparks) {
      const age = (now - s.born) / 520;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 220 * dt;
      ctx.fillStyle = `rgba(255, 179, 107, ${1 - age})`;
      ctx.fillRect(s.x - 1, s.y - 1, 2, 2);
    }
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  window.addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  window.addEventListener('resize', resize);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('pointermove', onMove);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    window.removeEventListener('resize', resize);
    canvas.remove();
    delete document.documentElement.dataset.cursor;
  };
}
