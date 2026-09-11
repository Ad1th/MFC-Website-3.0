import { Vector3 } from 'three';

/**
 * Additive bone layers over the base clip (brief section 9.5). Every behaviour
 * is short (under 1.2s), small, and adds fox-space degrees to a few bones, so it
 * can fire in the middle of a run cycle without breaking it.
 *
 * Rules: at most one behaviour per 2s (blink, ear flicks and swish are exempt),
 * never while a scene has scripted a pose, and every duration below 1.2s.
 */

const smoothstep = (e0, e1, x) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};
/** Attack and release envelope over normalised time t. */
const env = (t, attack, release) => smoothstep(0, attack, t) * (1 - smoothstep(1 - release, 1, t));
const window01 = (t, a, b) => Math.min(Math.max((t - a) / (b - a), 0), 1);

function add(out, key, yaw = 0, pitch = 0, roll = 0) {
  const bone = out.bones[key] ?? (out.bones[key] = [0, 0, 0]);
  bone[0] += yaw;
  bone[1] += pitch;
  bone[2] += roll;
}

export const BEHAVIOURS = {
  tilt: {
    duration: 0.9,
    run(out, t, { dir = 1 }) {
      const e = env(t, 0.25, 0.4);
      add(out, 'head', 4 * dir * e, 0, 20 * dir * e);
      add(out, 'neck', 0, 0, 5 * dir * e);
    },
  },
  blink: {
    duration: 0.13,
    free: true,
    run(out, t) {
      out.eyeScale = Math.min(out.eyeScale, 1 - 0.9 * Math.sin(Math.PI * t));
    },
  },
  earFlick: {
    duration: 0.28,
    free: true,
    run(out, t, { side = 1 }) {
      const flick = -0.45 * Math.sin(Math.PI * t);
      if (side > 0) out.ears.L += flick;
      else out.ears.R += flick;
    },
  },
  earsPerk: {
    duration: 0.7,
    free: true,
    run(out, t) {
      const e = env(t, 0.15, 0.5) * 0.28;
      out.ears.L += e;
      out.ears.R += e;
      add(out, 'head', 0, -6 * env(t, 0.15, 0.5), 0);
    },
  },
  sneeze: {
    duration: 0.6,
    run(out, t, opts, a) {
      const inhale = window01(t, 0, 0.35);
      const jerk = Math.sin(Math.PI * window01(t, 0.35, 0.6));
      add(out, 'head', 0, -7 * smoothstep(0, 1, inhale) * (t < 0.35 ? 1 : 1 - jerk) + 16 * jerk, 0);
      add(out, 'neck', 0, 5 * jerk, 0);
      const flat = t > 0.35 ? -0.7 * Math.sin(Math.PI * window01(t, 0.35, 1)) : 0;
      if (opts.side > 0) out.ears.L += flat;
      else out.ears.R += flat;
      a.once('sparks', t >= 0.4, () => out.sparks.push({ at: 'nose', count: 14, speed: 0.9, spread: 0.5 }));
    },
  },
  playBow: {
    duration: 1.1,
    run(out, t) {
      const e = env(t, 0.25, 0.3);
      add(out, 'hip', 0, 8 * e, 0);
      add(out, 'spine1', 0, 14 * e, 0);
      add(out, 'spine2', 0, 10 * e, 0);
      add(out, 'neck', 0, -14 * e, 0);
      add(out, 'head', 0, -12 * e, 0);
      add(out, 'lArmUp', 0, -38 * e, 0);
      add(out, 'rArmUp', 0, -38 * e, 0);
      add(out, 'lArmFore', 0, 26 * e, 0);
      add(out, 'rArmFore', 0, 26 * e, 0);
      add(out, 'tail1', 10 * Math.sin(t * 40) * e, -26 * e, 0);
      out.hip.y += -6 * e;
      out.hip.z += 4 * e;
    },
  },
  pounce: {
    duration: 1.1,
    run(out, t, opts) {
      const target = opts.target ?? new Vector3(0, 0, 50);
      const flight = window01(t, 0.12, 0.7);
      const eased = smoothstep(0, 1, flight);
      out.root.x += target.x * eased;
      out.root.z += target.z * eased;
      out.root.y += 34 * 4 * flight * (1 - flight);
      const crouch = env(window01(t, 0, 0.14), 0.5, 0.5);
      out.hip.y += -7 * crouch;
      const body = t < 0.4 ? -18 * Math.sin(Math.PI * window01(t, 0.1, 0.4)) : 26 * Math.sin(Math.PI * window01(t, 0.4, 0.75));
      add(out, 'hip', 0, body, 0);
      const reach = Math.sin(Math.PI * window01(t, 0.35, 0.8));
      add(out, 'lArmUp', 0, -50 * reach, 0);
      add(out, 'rArmUp', 0, -50 * reach, 0);
      const puzzled = env(window01(t, 0.76, 1), 0.3, 0.3);
      add(out, 'head', 0, -6 * puzzled, 14 * puzzled);
    },
    end(state, opts) {
      if (opts.target) state.committedRoot.add(new Vector3(opts.target.x, 0, opts.target.z));
    },
  },
  shakeOff: {
    duration: 1.2,
    run(out, t, opts, a) {
      const shake = t * 1.2;
      const head = env(window01(shake, 0, 0.35), 0.2, 0.3);
      const body = env(window01(shake, 0.2, 0.62), 0.2, 0.3);
      const tail = env(window01(shake, 0.48, 0.9), 0.2, 0.3);
      add(out, 'head', 0, 0, 24 * head * Math.sin(shake * 2 * Math.PI * 11));
      add(out, 'neck', 0, 0, 10 * head * Math.sin(shake * 2 * Math.PI * 11 - 0.6));
      add(out, 'spine1', 0, 0, 14 * body * Math.sin(shake * 2 * Math.PI * 9));
      add(out, 'spine2', 0, 0, 12 * body * Math.sin(shake * 2 * Math.PI * 9 - 0.8));
      add(out, 'tail1', 28 * tail * Math.sin(shake * 2 * Math.PI * 10), 0, 0);
      add(out, 'tail2', 32 * tail * Math.sin(shake * 2 * Math.PI * 10 - 0.9), 0, 0);
      a.once('ring', shake >= 0.42, () => out.sparks.push({ at: 'body', count: 26, speed: 1.3, spread: 1, ring: true }));
      const offended = env(window01(shake, 0.9, 1.2), 0.25, 0.25);
      out.ears.L -= 0.17 * offended;
      out.ears.R -= 0.17 * offended;
      add(out, 'head', -10 * offended, 0, -12 * offended);
    },
  },
  offended: {
    duration: 0.3,
    run(out, t) {
      const e = env(t, 0.3, 0.3);
      out.ears.L -= 0.17 * e;
      out.ears.R -= 0.17 * e;
      add(out, 'head', -10 * e, 0, -12 * e);
    },
  },
  yawn: {
    duration: 1.1,
    run(out, t, opts, a) {
      const e = env(t, 0.3, 0.3);
      add(out, 'head', 0, -24 * e, 0);
      add(out, 'neck', 0, -8 * e, 0);
      out.ears.L -= 0.26 * e;
      out.ears.R -= 0.26 * e;
      out.eyeScale = Math.min(out.eyeScale, 1 - 0.75 * e);
      a.once('puff', t >= 0.5, () => out.sparks.push({ at: 'nose', count: 9, speed: 0.45, spread: 0.3, up: true }));
    },
  },
  wag: {
    duration: 0.8,
    run(out, t, { intensity = 1 }) {
      const e = env(t, 0.15, 0.3) * intensity;
      const phase = t * 0.8 * 2 * Math.PI * 7;
      add(out, 'tail1', 18 * e * Math.sin(phase), -8 * e, 0);
      add(out, 'tail2', 22 * e * Math.sin(phase - 0.7), 0, 0);
      add(out, 'tail3', 24 * e * Math.sin(phase - 1.4), 0, 0);
      add(out, 'hip', 0, 0, 2.5 * e * Math.sin(phase));
    },
  },
  swish: {
    duration: 1.1,
    free: true,
    run(out, t) {
      const s = Math.sin(Math.PI * t) * Math.sin(t * 2 * Math.PI);
      add(out, 'tail1', 16 * s, 0, 0);
      add(out, 'tail2', 20 * s, 0, 0);
      add(out, 'tail3', 22 * s, 0, 0);
    },
  },
  tailThump: {
    duration: 0.35,
    run(out, t) {
      const s = Math.sin(Math.PI * t);
      add(out, 'tail1', 0, 22 * s, 0);
      add(out, 'tail2', 0, 10 * s, 0);
    },
  },
  tuckTail: {
    duration: 0.8,
    run(out, t) {
      const e = env(t, 0.3, 0.3);
      add(out, 'tail1', -12 * e, 0, 0);
      add(out, 'tail2', -16 * e, 0, 0);
      add(out, 'tail3', -18 * e, 0, 0);
    },
  },
  glanceBack: {
    duration: 0.9,
    run(out, t) {
      const e = env(t, 0.3, 0.35);
      add(out, 'neck', 14 * e, -3 * e, 0);
      add(out, 'head', 24 * e, -4 * e, 6 * e);
      out.ears.L += 0.1 * e;
    },
  },
  pawTwitch: {
    duration: 0.25,
    free: true,
    run(out, t) {
      add(out, 'lHand', 0, -14 * Math.sin(Math.PI * t), 0);
    },
  },
  jolt: {
    duration: 0.3,
    free: true,
    run(out, t) {
      const s = Math.sin(Math.PI * t);
      out.ears.L += 0.3 * s;
      out.ears.R += 0.3 * s;
      out.hip.y += 5 * s;
      add(out, 'head', 0, -10 * s, 0);
    },
  },
};

const COOLDOWN = 2;

/**
 * @param {{ random?: () => number }} [options]
 */
export function createBehaviourEngine({ random = Math.random } = {}) {
  /** @type {{ name: string, def: any, start: number, opts: any, fired: Set<string> }[]} */
  const active = [];
  const state = {
    lastFire: Number.NEGATIVE_INFINITY,
    committedRoot: new Vector3(),
    nextBlink: 1.5 + random() * 3,
    nextAmbient: 3 + random() * 2,
    look: { yaw: 0, pitch: 0 },
    pet: 0,
    wasPetting: false,
    now: 0,
  };

  const out = {
    bones: {},
    hip: new Vector3(),
    root: new Vector3(),
    ears: { L: 0, R: 0 },
    eyeScale: 1,
    warm: 0,
    sparks: [],
  };

  function trigger(name, opts = {}, { force = false, scripted = false } = {}) {
    const def = BEHAVIOURS[name];
    if (!def) return false;
    if (!force && scripted && !def.free) return false;
    if (!force && !def.free && state.now - state.lastFire < COOLDOWN) return false;
    if (!def.free) {
      if (active.some((b) => b.name === name)) return false;
      state.lastFire = state.now;
    }
    active.push({ name, def, start: state.now, opts: { side: random() < 0.5 ? 1 : -1, ...opts }, fired: new Set() });
    return true;
  }

  function ambient(mood, dt, scripted) {
    state.nextBlink -= dt;
    if (state.nextBlink <= 0) {
      trigger('blink');
      state.nextBlink = 4 + random() * 3;
    }
    // Scene-scripted poses hold: only blinks keep going.
    if (scripted) return;
    state.nextAmbient -= dt;
    if (state.nextAmbient > 0) return;
    switch (mood) {
      case 'trot':
        trigger(random() < 0.6 ? 'glanceBack' : 'earFlick', { side: random() < 0.5 ? 1 : -1 });
        state.nextAmbient = 3 + random() * 2;
        break;
      case 'sit':
        trigger('tailThump');
        state.nextAmbient = 2 + random() * 2;
        break;
      case 'lie':
        trigger('earFlick', { side: random() < 0.5 ? 1 : -1 });
        state.nextAmbient = 3 + random() * 3;
        break;
      case 'sleep':
        trigger('pawTwitch');
        state.nextAmbient = 10 + random() * 10;
        break;
      default:
        state.nextAmbient = 2;
    }
  }

  /**
   * @param {number} dt
   * @param {{ mood: string, entered: string|null, previous: string|null, scripted?: boolean,
   *   look?: { yaw: number, pitch: number, weight: number }|null, petting?: boolean }} ctx
   */
  function update(dt, ctx) {
    state.now += dt;
    out.bones = {};
    out.hip.set(0, 0, 0);
    out.root.copy(state.committedRoot);
    out.ears.L = 0;
    out.ears.R = 0;
    out.eyeScale = 1;
    out.sparks = [];

    if (ctx.entered === 'startle') trigger('jolt', {}, { force: true });

    for (let i = active.length - 1; i >= 0; i -= 1) {
      const b = active[i];
      const t = (state.now - b.start) / b.def.duration;
      if (t >= 1) {
        b.def.end?.(state, b.opts);
        active.splice(i, 1);
        continue;
      }
      const api = {
        once: (key, condition, fn) => {
          if (condition && !b.fired.has(key)) {
            b.fired.add(key);
            fn();
          }
        },
      };
      b.def.run(out, t, b.opts, api);
    }

    ambient(ctx.mood, dt, Boolean(ctx.scripted));

    // Continuous head tracking (cursor sniff, a hovered star, the camera).
    const look = ctx.look;
    const targetYaw = look ? look.yaw * look.weight : 0;
    const targetPitch = look ? look.pitch * look.weight : 0;
    const k = 1 - Math.exp(-6 * dt);
    state.look.yaw += (targetYaw - state.look.yaw) * k;
    state.look.pitch += (targetPitch - state.look.pitch) * k;
    add(out, 'neck', state.look.yaw * 0.4, state.look.pitch * 0.35, 0);
    add(out, 'head', state.look.yaw * 0.6, state.look.pitch * 0.65, 0);

    // Petting: lean in, eyes to lines, flame toward gold; one slow swish on release.
    const petting = Boolean(ctx.petting);
    state.pet += ((petting ? 1 : 0) - state.pet) * (1 - Math.exp(-(petting ? 5 : 2.5) * dt));
    if (state.pet > 0.001) {
      add(out, 'head', 0, 4 * state.pet, 10 * state.pet);
      add(out, 'neck', 0, 3 * state.pet, 4 * state.pet);
      out.ears.L -= 0.12 * state.pet;
      out.ears.R -= 0.12 * state.pet;
      out.eyeScale = Math.min(out.eyeScale, 1 - 0.85 * state.pet);
    }
    out.warm = state.pet;
    if (state.wasPetting && !petting) trigger('swish', {}, { force: true });
    state.wasPetting = petting;

    return out;
  }

  function reset() {
    active.length = 0;
    state.committedRoot.set(0, 0, 0);
  }

  return { trigger, update, reset, get active() { return active.map((b) => b.name); } };
}
