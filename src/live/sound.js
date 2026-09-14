import { film } from '../film/store.js';

/**
 * Sound, only after the viewer chose "watch with sound". No AudioContext exists until then,
 * and nothing plays while sound is off or unchosen. Everything is synthesized with Web Audio (no
 * audio files). Spot effects live here; the continuous score is score.js. S05's web plucks five
 * notes (C, E, G, B, D) that together make a chord (Cmaj9).
 *
 * A pluck is synthesized: a short burst of a triangle wave through a lowpass that closes fast,
 * with a quick attack and an exponential decay, like a plucked string.
 */

let context = null;
let master = null;

/** Note names used by the web, in the order the fox reaches the nodes. */
export const WEB_NOTES = { C: 261.63, E: 329.63, G: 392.0, B: 493.88, D: 587.33 };

function ensure() {
  if (film.getState().sound !== 'on') return null;
  if (typeof window === 'undefined' || !(window.AudioContext || window.webkitAudioContext)) return null;
  if (!context) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = 0.18;
    master.connect(context.destination);
  }
  if (context.state === 'suspended') context.resume().catch(() => {});
  return context;
}

/** The live audio graph's context and master bus, or null while sound is off (score.js). */
export function audioOut() {
  const ctx = ensure();
  return ctx ? { ctx, master } : null;
}

/** A buffer of white noise, cached per context (seconds long). */
const noiseCache = new WeakMap();
export function noiseBuffer(ctx, seconds = 2) {
  const cached = noiseCache.get(ctx);
  if (cached && cached.duration >= seconds) return cached;
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  noiseCache.set(ctx, buffer);
  return buffer;
}

/** A shaped burst of filtered noise (the spot effects' shared voice). */
function noiseBurst(ctx, { start, duration, gain, type = 'bandpass', from = 2000, to = from, q = 0.8 }) {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, Math.max(2, duration + 0.1));
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.02, duration / 4));
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(env).connect(master);
  source.start(start);
  source.stop(start + duration + 0.05);
}

/** S00: the match strikes (a scratch, a small thump, then the flare catching). */
export function matchStrike() {
  const ctx = ensure();
  if (!ctx) return false;
  const now = ctx.currentTime;
  noiseBurst(ctx, { start: now, duration: 0.11, gain: 0.9, from: 3200, to: 900, q: 1.2 });
  noiseBurst(ctx, { start: now + 0.09, duration: 0.7, gain: 0.35, type: 'lowpass', from: 2400, to: 500 });
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(120, now + 0.08);
  osc.frequency.exponentialRampToValueAtTime(45, now + 0.3);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, now + 0.08);
  env.gain.exponentialRampToValueAtTime(0.5, now + 0.1);
  env.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  osc.connect(env).connect(master);
  osc.start(now + 0.08);
  osc.stop(now + 0.4);
  return true;
}

/** S02: glass shatter (a crack of noise and a scatter of bright tinkles falling away). */
export function shatter() {
  const ctx = ensure();
  if (!ctx) return false;
  const now = ctx.currentTime;
  noiseBurst(ctx, { start: now, duration: 0.3, gain: 0.8, type: 'highpass', from: 3500, to: 1800, q: 0.5 });
  for (let i = 0; i < 26; i += 1) {
    const start = now + 0.02 + Math.random() * 0.55;
    const duration = 0.04 + Math.random() * 0.14;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2200 + Math.random() * 4200, start);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(0.12 + Math.random() * 0.12, start + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(env).connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }
  return true;
}

/** S03: wind roar on re-entry (a long swell of low noise that opens and closes). */
export function windRoar() {
  const ctx = ensure();
  if (!ctx) return false;
  const now = ctx.currentTime;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, 3);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(180, now);
  filter.frequency.exponentialRampToValueAtTime(1600, now + 1.1);
  filter.frequency.exponentialRampToValueAtTime(260, now + 2.6);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(0.7, now + 0.9);
  env.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);
  source.connect(filter).connect(env).connect(master);
  source.start(now);
  source.stop(now + 2.9);
  return true;
}

/** S04: a data chirp as the packet passes a hop (two short square blips, rising with the hop). */
export function chirp(index = 0) {
  const ctx = ensure();
  if (!ctx) return false;
  const now = ctx.currentTime;
  for (const offset of [0, 0.06]) {
    const start = now + offset;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1300 + index * 110 + offset * 1500, start);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(0.06, start + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, start + 0.04);
    osc.connect(env).connect(master);
    osc.start(start);
    osc.stop(start + 0.05);
  }
  return true;
}

/**
 * @param {number} frequency Hz
 * @param {{ duration?: number, gain?: number }} [options]
 * @returns {boolean} true if a note was played
 */
export function pluck(frequency, { duration = 1.6, gain = 1 } = {}) {
  const ctx = ensure();
  if (!ctx) return false;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(frequency, now);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(frequency * 8, now);
  filter.frequency.exponentialRampToValueAtTime(frequency * 1.5, now + 0.25);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(gain, now + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(filter).connect(env).connect(master);
  osc.start(now);
  osc.stop(now + duration + 0.05);
  return true;
}

/**
 * A short hiss (S09: rain on the fox's flame): white noise through a highpass, fast in, slow out.
 * @returns {boolean} true if it played
 */
export function hiss({ duration = 0.6, gain = 0.35 } = {}) {
  const ctx = ensure();
  if (!ctx) return false;
  const now = ctx.currentTime;
  const length = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 3000;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(gain, now + 0.05);
  env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  source.connect(filter).connect(env).connect(master);
  source.start(now);
  source.stop(now + duration);
  return true;
}

/**
 * One heartbeat (S07, Code To Survive in the dark): two low sine thumps, lub and dub, each a pitch
 * drop with a fast attack and a short decay.
 * @returns {boolean} true if it played
 */
export function heartbeat({ gain = 1 } = {}) {
  const ctx = ensure();
  if (!ctx) return false;
  const now = ctx.currentTime;
  for (const [offset, level] of [
    [0, 1],
    [0.22, 0.7],
  ]) {
    const start = now + offset;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(70, start);
    osc.frequency.exponentialRampToValueAtTime(42, start + 0.18);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain * level, start + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
    osc.connect(env).connect(master);
    osc.start(start);
    osc.stop(start + 0.3);
  }
  return true;
}
