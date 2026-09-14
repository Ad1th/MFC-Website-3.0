/**
 * The Konami stampede (living layer): for three seconds tiny fire foxes pour across the whole
 * page, over the HTML, then snap back into one point at the centre and are gone. Drawn on one
 * overlay canvas that never takes pointer events; the fox's own embers turn into foxes at the
 * same time (the particle shader's uFoxSprite). Skipped under reduced motion.
 */

export const STAMPEDE_MS = 3000;
const SNAP_MS = 450;

let running = false;

function foxSprite(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size * 2;
  canvas.height = size;
  const c = canvas.getContext('2d');
  const s = size / 10;
  c.fillStyle = '#ff6d00';
  c.beginPath();
  // Tail, body, head with ears and nose, running to the right.
  c.ellipse(4 * s, 5.6 * s, 3.6 * s, 1.4 * s, -0.35, 0, Math.PI * 2);
  c.ellipse(9.5 * s, 5.8 * s, 3.4 * s, 1.9 * s, 0, 0, Math.PI * 2);
  c.moveTo(12 * s, 3.2 * s);
  c.lineTo(13 * s, 0.6 * s);
  c.lineTo(14 * s, 3 * s);
  c.lineTo(15 * s, 0.8 * s);
  c.lineTo(15.8 * s, 3.4 * s);
  c.lineTo(19.6 * s, 5.2 * s);
  c.lineTo(15 * s, 6.8 * s);
  c.closePath();
  c.fill();
  c.fillStyle = '#ffb36b';
  c.fillRect(9 * s, 7.3 * s, 1 * s, 2.5 * s);
  c.fillRect(12 * s, 7.3 * s, 1 * s, 2.5 * s);
  return canvas;
}

/** Runs the stampede once; resolves when it has cleaned up. */
export function stampede() {
  if (running || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve(false);
  running = true;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.stampede = '';
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '999' });
  document.body.appendChild(canvas);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext('2d');
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const count = Math.round(Math.min(1600, (width * height) / 900));
  const sprites = [foxSprite(8), foxSprite(12), foxSprite(16)];
  const foxes = Array.from({ length: count }, () => ({
    x: -Math.random() * width * 1.2,
    y: Math.random() * height,
    speed: 420 + Math.random() * 900,
    phase: Math.random() * Math.PI * 2,
    sprite: sprites[Math.floor(Math.random() * sprites.length)],
  }));

  return new Promise((resolve) => {
    const start = performance.now();
    const frame = (now) => {
      const t = now - start;
      context.clearRect(0, 0, width, height);
      const snap = Math.max(0, (t - (STAMPEDE_MS - SNAP_MS)) / SNAP_MS);
      const pull = snap * snap;
      for (const fox of foxes) {
        const runX = ((fox.x + (fox.speed * t) / 1000) % (width * 1.3)) - width * 0.1;
        const runY = fox.y + Math.sin(t * 0.02 + fox.phase) * 3;
        const x = runX + (width / 2 - runX) * pull;
        const y = runY + (height / 2 - runY) * pull;
        context.globalAlpha = 1 - 0.7 * pull;
        context.drawImage(fox.sprite, x, y);
      }
      if (t < STAMPEDE_MS) {
        requestAnimationFrame(frame);
        return;
      }
      canvas.remove();
      running = false;
      resolve(true);
    };
    requestAnimationFrame(frame);
  });
}
