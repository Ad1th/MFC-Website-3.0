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
/** CPU milliseconds per frame: frame start (probe) to the end of the last render call. */
const cpuSamples = [];
/** GPU milliseconds per frame from EXT_disjoint_timer_query_webgl2, when the browser exposes it. */
const gpuSamples = [];
/** @type {import('three').WebGLRenderer|null} */
let renderer = null;
let lastRender = { calls: 0, triangles: 0 };
let particles = 0;
let frameStart = 0;
let lastRenderEnd = 0;
let timer = null;
let pendingQuery = null;

export function registerRenderer(gl) {
  renderer = gl;
  // With post-processing the last render call is a fullscreen quad, so automatic
  // per-render resets would report 1 draw. Count the whole frame instead.
  gl.info.autoReset = false;
  // Time the end of every render call; the last one in a frame ends that frame's CPU work.
  const render = gl.render.bind(gl);
  gl.render = (...args) => {
    render(...args);
    lastRenderEnd = performance.now();
  };
  const ctx = gl.getContext();
  const ext = ctx.getExtension('EXT_disjoint_timer_query_webgl2');
  timer = ext ? { ctx, ext } : null;
}

function keep(samples, value) {
  samples.push(value);
  if (samples.length > 600) samples.shift();
}

/** Close the previous frame's measurements and open this frame's. Runs first in each frame. */
function frameBoundary(now) {
  if (frameStart && lastRenderEnd > frameStart) keep(cpuSamples, lastRenderEnd - frameStart);
  frameStart = now;
  if (!timer) return;
  const { ctx, ext } = timer;
  if (pendingQuery) {
    ctx.endQuery(ext.TIME_ELAPSED_EXT);
    const done = pendingQuery;
    pendingQuery = null;
    const poll = () => {
      if (!ctx.getQueryParameter(done, ctx.QUERY_RESULT_AVAILABLE)) return requestAnimationFrame(poll);
      if (!ctx.getParameter(ext.GPU_DISJOINT_EXT)) keep(gpuSamples, ctx.getQueryParameter(done, ctx.QUERY_RESULT) / 1e6);
      ctx.deleteQuery(done);
      return undefined;
    };
    requestAnimationFrame(poll);
  }
  pendingQuery = ctx.createQuery();
  ctx.beginQuery(ext.TIME_ELAPSED_EXT, pendingQuery);
}

function summary(samples) {
  if (!samples.length) return { avg: null, p95: null };
  const sorted = [...samples].sort((a, b) => a - b);
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  return { avg: Math.round(avg * 100) / 100, p95: Math.round(p95 * 100) / 100 };
}

/** Scenes that own particle systems report their live count here. */
export function reportParticles(count) {
  particles = count;
}

function record(now, dt) {
  frameBoundary(performance.now());
  frames.push({ t: now, dt });
  while (frames.length && now - frames[0].t > WINDOW_MS) frames.shift();
  // Runs first in the frame: read everything the previous frame drew, then reset.
  if (renderer) {
    lastRender = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    renderer.info.reset();
  }
}

export function stats() {
  if (frames.length < 2) return { fps: 0, low1: 0, drawCalls: 0, triangles: 0, particles, scene: null, progress: 0 };
  const dts = frames.map((f) => f.dt).sort((a, b) => b - a);
  const avg = dts.reduce((a, b) => a + b, 0) / dts.length;
  const worst = dts.slice(0, Math.max(1, Math.floor(dts.length * 0.01)));
  const worstAvg = worst.reduce((a, b) => a + b, 0) / worst.length;
  const state = film.getState();
  const cpu = summary(cpuSamples);
  const gpu = summary(gpuSamples);
  return {
    fps: Math.round(1 / avg),
    low1: Math.round(1 / worstAvg),
    cpuAvgMs: cpu.avg,
    cpuP95Ms: cpu.p95,
    gpuAvgMs: gpu.avg,
    gpuP95Ms: gpu.p95,
    gpuTimer: Boolean(timer),
    drawCalls: lastRender.calls,
    triangles: lastRender.triangles,
    particles,
    scene: getScenes()[state.activeScene]?.id ?? null,
    progress: Number(state.progress.toFixed(4)),
  };
}

/**
 * Mount inside <Canvas> to sample real render cadence.
 * Default priority on purpose: any positive useFrame priority makes R3F stop
 * rendering automatically, which would blank the film in ?debug.
 */
export function StatsProbe() {
  useFrame((state, delta) => {
    record(state.clock.elapsedTime * 1000, delta);
  }, -1000);
  return null;
}

if (typeof window !== 'undefined') {
  window.__film = Object.assign(window.__film ?? {}, { stats });
}
