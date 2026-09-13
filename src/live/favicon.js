/**
 * The tab's favicon as an actor. While loading it is one dark pixel; once the match is
 * struck it becomes a flickering ember, redrawn on a 32px canvas at most 8 times a second.
 * `setHeat(0..1)` lets the film grow the ember with progress (Phase 6 tab.js builds on it).
 */

const SIZE = 32;
const MAX_FPS = 8;

let link = null;
let canvas = null;
let ctx = null;
let timer = 0;
let heat = 0.4;
let dim = 1;

function ensure() {
  if (link) return;
  link = document.querySelector('link[rel~="icon"]') ?? document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/png';
  if (!link.parentNode) document.head.appendChild(link);
  canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  ctx = canvas.getContext('2d');
}

function publish() {
  link.href = canvas.toDataURL('image/png');
}

/** One dark pixel in the centre of a transparent icon. */
export function darkPixel() {
  ensure();
  stopEmber();
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#1b1512';
  ctx.fillRect(SIZE / 2 - 2, SIZE / 2 - 2, 4, 4);
  publish();
}

function drawEmber(t) {
  ctx.clearRect(0, 0, SIZE, SIZE);
  const flicker = 0.85 + 0.15 * Math.sin(t * 13.7) * Math.sin(t * 7.3);
  const r = (6 + heat * 7) * flicker;
  const cx = SIZE / 2;
  const cy = SIZE / 2 + 2;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.6);
  glow.addColorStop(0, `rgba(255, 241, 220, ${dim})`);
  glow.addColorStop(0.35, `rgba(255, 179, 107, ${dim})`);
  glow.addColorStop(0.7, `rgba(255, 109, 0, ${0.8 * dim})`);
  glow.addColorStop(1, 'rgba(255, 109, 0, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  // A teardrop: round below, tapering to a tip that sways.
  const sway = Math.sin(t * 3.1) * 2;
  ctx.moveTo(cx + sway, cy - r * 1.7);
  ctx.bezierCurveTo(cx + r, cy - r * 0.6, cx + r, cy + r, cx, cy + r);
  ctx.bezierCurveTo(cx - r, cy + r, cx - r, cy - r * 0.6, cx + sway, cy - r * 1.7);
  ctx.fill();
  publish();
}

export function startEmber() {
  ensure();
  stopEmber();
  const start = performance.now();
  drawEmber(0);
  timer = window.setInterval(() => drawEmber((performance.now() - start) / 1000), 1000 / MAX_FPS);
}

export function stopEmber() {
  if (timer) window.clearInterval(timer);
  timer = 0;
}

/** @param {number} value 0 to 1 */
export function setHeat(value) {
  heat = Math.min(Math.max(value, 0), 1);
}

/** @param {number} value 0 to 1, for the hidden-tab dim */
export function setDim(value) {
  dim = Math.min(Math.max(value, 0), 1);
}
