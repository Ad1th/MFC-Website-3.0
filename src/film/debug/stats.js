import { useFrame } from '@react-three/fiber';
import { film } from '../store.js';
import { getScenes } from '../scroll.js';

/**
 * Performance probe for ?debug. window.__film.stats() returns the last 5 seconds:
 * average FPS, 1% low FPS, draw calls, triangles and particles.
 */

const WINDOW_MS = 5000;
/** @type {{ t: number, dt: number }[]} */
const frames = [];
/** @type {import('three').WebGLRenderer|null} */
let renderer = null;
let lastRender = { calls: 0, triangles: 0 };
let particles = 0;

export function registerRenderer(gl) {
  renderer = gl;
}

/** Scenes that own particle systems report their live count here. */
export function reportParticles(count) {
  particles = count;
}

function record(now, dt) {
  frames.push({ t: now, dt });
  while (frames.length && now - frames[0].t > WINDOW_MS) frames.shift();
  if (renderer) lastRender = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
}

export function stats() {
  if (frames.length < 2) return { fps: 0, low1: 0, drawCalls: 0, triangles: 0, particles, scene: null, progress: 0 };
  const dts = frames.map((f) => f.dt).sort((a, b) => b - a);
  const avg = dts.reduce((a, b) => a + b, 0) / dts.length;
  const worst = dts.slice(0, Math.max(1, Math.floor(dts.length * 0.01)));
  const worstAvg = worst.reduce((a, b) => a + b, 0) / worst.length;
  const state = film.getState();
  return {
    fps: Math.round(1 / avg),
    low1: Math.round(1 / worstAvg),
    drawCalls: lastRender.calls,
    triangles: lastRender.triangles,
    particles,
    scene: getScenes()[state.activeScene]?.id ?? null,
    progress: Number(state.progress.toFixed(4)),
  };
}

/** Mount inside <Canvas> to sample real render cadence. */
export function StatsProbe() {
  useFrame((state, delta) => {
    record(state.clock.elapsedTime * 1000, delta);
  }, 1000);
  return null;
}

if (typeof window !== 'undefined') {
  window.__film = Object.assign(window.__film ?? {}, { stats });
}
