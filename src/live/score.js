import { film } from '../film/store.js';
import { getScenes } from '../film/scroll.js';
import { BURN_BEATS } from '../film/scenes/S08Burn.jsx';
import { audioOut, noiseBuffer } from './sound.js';

/**
 * The score (sound on only), synthesized with Web Audio and cross-faded by scroll position:
 *   drone  a low chord that holds the film together
 *   fire   a bed of filtered noise with crackles; louder and busier with scroll speed
 *   pulse  a low throb whose rate tightens as the fox sprints (scroll velocity)
 * plus two scene beds: the cable hum under S04's tunnel, and wind with crickets on S09's hilltop.
 * S08 crackles while the paper burns in and away, and is absolutely silent while you read.
 *
 * Levels move with setTargetAtTime (a quarter-second glide), so scrubbing never clicks. The graph
 * is built the first time sound is on, and silenced (then suspended) when sound goes off, the tab
 * hides or the film stops.
 */

/** Per scene, 0 to 1 per layer. The volume pass: relative levels, the master bus is 0.18. */
const MIX = {
  S01: { drone: 0.8, fire: 0.35, pulse: 0.25 },
  S02: { drone: 0.7, fire: 0.4, pulse: 0.45 },
  S03: { drone: 0.55, fire: 0.25, pulse: 0.6 },
  S04: { drone: 0.45, fire: 0.1, pulse: 0.35, hum: 0.7 },
  S05: { drone: 0.6, fire: 0.3, pulse: 0.3 },
  S06: { drone: 0.55, fire: 0.3, pulse: 0.35 },
  S07: { drone: 0.7, fire: 0.45, pulse: 0.4 },
  S08: { drone: 0.35, fire: 0.2, pulse: 0.1 },
  S09: { drone: 0.3, fire: 0.12, pulse: 0.08, night: 0.8 },
  S10: { drone: 0.6, fire: 0.35, pulse: 0.3 },
  S11: { drone: 0.45, fire: 0.5, pulse: 0.08 },
};
const LAYERS = ['drone', 'fire', 'pulse', 'hum', 'night'];
const LAYER_GAIN = { drone: 0.55, fire: 0.5, pulse: 0.6, hum: 0.25, night: 0.4 };
const BLEND = 0.15;
const GLIDE = 0.25;

const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
const window01 = (p, a, b) => clamp01((p - a) / (b - a));

/** Layer levels for the current scroll position, blending into the next scene near the end. */
export function mixAt(activeScene, sceneProgress) {
  const scenes = getScenes();
  const here = MIX[scenes[activeScene]?.id] ?? {};
  const next = MIX[scenes[activeScene + 1]?.id] ?? here;
  const t = window01(sceneProgress, 1 - BLEND, 1);
  const levels = {};
  for (const layer of LAYERS) levels[layer] = (here[layer] ?? 0) * (1 - t) + (next[layer] ?? 0) * t;

  // S08: crackle as the paper burns in and away, silence while it is read.
  if (scenes[activeScene]?.id === 'S08') {
    const burning = Math.max(1 - window01(sceneProgress, BURN_BEATS.in[1], BURN_BEATS.in[1] + 0.04), window01(sceneProgress, BURN_BEATS.out[0] - 0.02, BURN_BEATS.out[0]));
    for (const layer of LAYERS) levels[layer] *= burning;
    levels.fire = Math.max(levels.fire, 0.85 * burning);
  }
  return levels;
}

function build(ctx, master) {
  const bus = {};
  for (const layer of LAYERS) {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(master);
    bus[layer] = g;
  }
  const started = [];
  const start = (node) => {
    node.start();
    started.push(node);
    return node;
  };

  // Drone: a low open fifth with a soft octave, through a lowpass.
  const droneFilter = ctx.createBiquadFilter();
  droneFilter.type = 'lowpass';
  droneFilter.frequency.value = 420;
  droneFilter.connect(bus.drone);
  for (const [frequency, type, level, detune] of [
    [55, 'sine', 0.5, 0],
    [82.41, 'sine', 0.35, 4],
    [110, 'triangle', 0.12, -3],
  ]) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.detune.value = detune;
    const g = ctx.createGain();
    g.gain.value = level;
    osc.connect(g).connect(droneFilter);
    start(osc);
  }

  // Fire bed: looped noise through a band, the crackles are scheduled in update().
  const fireNoise = ctx.createBufferSource();
  fireNoise.buffer = noiseBuffer(ctx, 2);
  fireNoise.loop = true;
  const fireBand = ctx.createBiquadFilter();
  fireBand.type = 'bandpass';
  fireBand.frequency.value = 900;
  fireBand.Q.value = 0.6;
  const fireBed = ctx.createGain();
  fireBed.gain.value = 0.35;
  fireNoise.connect(fireBand).connect(fireBed).connect(bus.fire);
  start(fireNoise);

  // Pulse: a low sine whose loudness an LFO throbs; the LFO rate follows scroll speed.
  const pulseOsc = ctx.createOscillator();
  pulseOsc.frequency.value = 58;
  const pulseAmp = ctx.createGain();
  pulseAmp.gain.value = 0.5;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 1.2;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.5;
  lfo.connect(lfoDepth).connect(pulseAmp.gain);
  pulseOsc.connect(pulseAmp).connect(bus.pulse);
  start(pulseOsc);
  start(lfo);

  // Cable hum: mains-like 60 Hz with its second harmonic, low passed.
  const humFilter = ctx.createBiquadFilter();
  humFilter.type = 'lowpass';
  humFilter.frequency.value = 240;
  humFilter.connect(bus.hum);
  for (const [frequency, type, level] of [
    [60, 'sawtooth', 0.35],
    [120, 'sine', 0.25],
  ]) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const g = ctx.createGain();
    g.gain.value = level;
    osc.connect(g).connect(humFilter);
    start(osc);
  }

  // Night: wind (slow-breathing low noise); crickets are scheduled in update().
  const windNoise = ctx.createBufferSource();
  windNoise.buffer = noiseBuffer(ctx, 2);
  windNoise.loop = true;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 380;
  const windLfo = ctx.createOscillator();
  windLfo.frequency.value = 0.09;
  const windLfoDepth = ctx.createGain();
  windLfoDepth.gain.value = 160;
  windLfo.connect(windLfoDepth).connect(windFilter.frequency);
  const windLevel = ctx.createGain();
  windLevel.gain.value = 0.5;
  windNoise.connect(windFilter).connect(windLevel).connect(bus.night);
  start(windNoise);
  start(windLfo);

  return { bus, lfo, fireBand, started };
}

function crackle(ctx, destination, level) {
  const now = ctx.currentTime;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, 2);
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 1800 + Math.random() * 2500;
  const env = ctx.createGain();
  const duration = 0.015 + Math.random() * 0.05;
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(0.25 + level * 0.6 * Math.random(), now + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  source.connect(filter).connect(env).connect(destination);
  source.start(now, Math.random() * 1.5);
  source.stop(now + duration + 0.02);
}

function cricket(ctx, destination) {
  const now = ctx.currentTime;
  const frequency = 4200 + Math.random() * 600;
  for (let i = 0; i < 3; i += 1) {
    const start = now + i * 0.045;
    const osc = ctx.createOscillator();
    osc.frequency.value = frequency;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(0.08, start + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, start + 0.03);
    osc.connect(env).connect(destination);
    osc.start(start);
    osc.stop(start + 0.04);
  }
}

/** @returns {() => void} teardown */
export function initScore() {
  let graph = null;
  let raf = 0;
  let last = performance.now();

  const silence = () => {
    if (!graph) return;
    const out = audioOut();
    const ctx = out?.ctx;
    if (!ctx) {
      // Sound turned off: fade the buses on the existing context directly.
      for (const g of Object.values(graph.bus)) g.gain.setTargetAtTime(0, g.context.currentTime, 0.08);
      return;
    }
    for (const g of Object.values(graph.bus)) g.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
  };

  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const state = film.getState();
    const playing = state.sound === 'on' && state.mode === 'film' && !state.tabHidden;
    if (!playing) {
      silence();
      return;
    }
    const out = audioOut();
    if (!out) return;
    const { ctx, master } = out;
    if (!graph) graph = build(ctx, master);

    const levels = mixAt(state.activeScene, state.sceneProgress);
    const speed = clamp01(Math.abs(state.velocity) / 2200);
    const t = ctx.currentTime;
    graph.bus.drone.gain.setTargetAtTime(levels.drone * LAYER_GAIN.drone, t, GLIDE);
    graph.bus.fire.gain.setTargetAtTime(levels.fire * LAYER_GAIN.fire * (0.6 + 0.6 * speed), t, GLIDE);
    graph.bus.pulse.gain.setTargetAtTime(levels.pulse * LAYER_GAIN.pulse * (0.35 + 0.65 * speed), t, GLIDE);
    graph.bus.hum.gain.setTargetAtTime(levels.hum * LAYER_GAIN.hum, t, GLIDE);
    graph.bus.night.gain.setTargetAtTime(levels.night * LAYER_GAIN.night, t, GLIDE);
    // The pulse tightens as the fox sprints; the fire's band brightens with speed.
    graph.lfo.frequency.setTargetAtTime(1.1 + 4.5 * speed, t, 0.4);
    graph.fireBand.frequency.setTargetAtTime(800 + 1400 * speed, t, 0.4);

    // Crackles: a few a second at rest, many while scrolling fast.
    if (levels.fire > 0.02 && Math.random() < dt * levels.fire * (3 + 18 * speed)) crackle(ctx, graph.bus.fire, levels.fire);
    if (levels.night > 0.05 && Math.random() < dt * 1.4 * levels.night) cricket(ctx, graph.bus.night);
  };

  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    silence();
    if (graph) {
      const g = graph;
      graph = null;
      window.setTimeout(() => {
        for (const node of g.started) {
          try {
            node.stop();
          } catch {
            // already stopped
          }
        }
      }, 400);
    }
  };
}
