import { film } from '../film/store.js';

/**
 * Sound, only after the viewer chose "watch with sound". No AudioContext exists until then,
 * and nothing plays while sound is off or unchosen. S05's web plucks five notes (C, E, G, B, D)
 * that together make a chord (Cmaj9).
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
