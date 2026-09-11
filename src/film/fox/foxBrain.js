/**
 * The fox's mood state machine. Pure logic, no three.js: it turns scroll
 * velocity, idle time and scene hints into a mood, animation clip weights,
 * pose weights and a couple of shader drivers. See brief section 9.4.
 *
 * | mood     | condition                        |
 * | trot     | velocity 0 to 800 px/s           |
 * | sprint   | 800 to 2500                      |
 * | overtake | above 2500 for over 400ms        |
 * | sit      | idle 6s                          |
 * | lie      | idle 20s                         |
 * | sleep    | idle 60s                         |
 * | startle  | scroll while lying or sleeping   |
 */

export const MOODS = ['trot', 'sprint', 'overtake', 'sit', 'lie', 'sleep', 'startle'];

const STILL = 30;
const SPRINT_IN = 800;
const SPRINT_OUT = 700;
const OVERTAKE_IN = 2500;
const OVERTAKE_OUT = 1200;
const OVERTAKE_HOLD = 0.4;
const STARTLE_TIME = 0.25;
const STARTLE_SPRINT = 0.6;
const WAIT_TIME = 1.4;

const approach = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));
const clamp01 = (x) => Math.min(Math.max(x, 0), 1);

export function createFoxBrain() {
  const s = {
    mood: 'trot',
    moodTime: 0,
    fastTime: 0,
    waitTime: 0,
    weights: { walk: 0, run: 0, survey: 1 },
    speeds: { walk: 1, run: 1, survey: 1 },
    pose: { sit: 0, lie: 0, sleep: 0 },
    heat: 0,
    overtake: 0,
    breath: 1,
    clock: 0,
  };

  function moodFromVelocity(v, prev, dt) {
    s.fastTime = v > OVERTAKE_IN ? s.fastTime + dt : 0;
    if (prev === 'overtake' && v > OVERTAKE_OUT) return 'overtake';
    if (s.fastTime > OVERTAKE_HOLD) return 'overtake';
    if (prev === 'sprint' && v > SPRINT_OUT) return 'sprint';
    if (v > SPRINT_IN) return 'sprint';
    return 'trot';
  }

  /**
   * @param {number} dt seconds
   * @param {{ velocity: number, idleSeconds: number, hint?: string|null, forced?: string|null }} input
   */
  function update(dt, input) {
    s.clock += dt;
    const v = Math.abs(input.velocity ?? 0);
    const prev = s.mood;
    let next;

    if (input.forced && MOODS.includes(input.forced)) {
      next = input.forced;
    } else if (input.hint === 'sleep' || input.hint === 'curl') {
      next = 'sleep';
    } else if (input.hint === 'sit') {
      next = 'sit';
    } else if (input.hint === 'run') {
      next = v > SPRINT_IN ? 'sprint' : 'trot';
    } else if (prev === 'startle') {
      next = s.moodTime < STARTLE_TIME + STARTLE_SPRINT ? 'startle' : moodFromVelocity(v, 'sprint', dt);
    } else if ((prev === 'sleep' || prev === 'lie') && v > STILL) {
      next = 'startle';
    } else if (prev === 'overtake' && v <= OVERTAKE_OUT) {
      next = 'sit';
      s.waitTime = WAIT_TIME;
    } else if (s.waitTime > 0) {
      s.waitTime -= dt;
      next = v > SPRINT_IN ? moodFromVelocity(v, prev, dt) : 'sit';
    } else if (v <= STILL && input.idleSeconds >= 60) {
      next = 'sleep';
    } else if (v <= STILL && input.idleSeconds >= 20) {
      next = 'lie';
    } else if (v <= STILL && input.idleSeconds >= 6) {
      next = 'sit';
    } else {
      next = moodFromVelocity(v, prev === 'sit' ? 'trot' : prev, dt);
    }

    const entered = next !== prev ? next : null;
    if (entered) s.moodTime = 0;
    else s.moodTime += dt;
    s.mood = next;

    // Clip and pose targets per mood.
    const target = { walk: 0, run: 0, survey: 0, sit: 0, lie: 0, sleep: 0, heat: 0, overtake: 0 };
    const speeds = { walk: 1, run: 1, survey: 1 };
    switch (next) {
      case 'trot': {
        if (v <= STILL) {
          target.survey = 1;
          speeds.survey = 0.8;
        } else {
          const r = clamp01(v / SPRINT_IN);
          target.walk = 1 - r * 0.75;
          target.run = r * 0.75;
          speeds.walk = 0.75 + r * 0.75;
          speeds.run = 0.85 + r * 0.25;
        }
        break;
      }
      case 'sprint':
        target.run = 1;
        speeds.run = 1.3;
        target.heat = clamp01((v - SPRINT_OUT) / 1400);
        break;
      case 'overtake':
        target.run = 1;
        speeds.run = 1.5;
        target.heat = 1;
        target.overtake = 1;
        break;
      case 'startle':
        if (s.moodTime < STARTLE_TIME) {
          target.survey = 1;
          speeds.survey = 2.5;
        } else {
          target.run = 1;
          speeds.run = 1.3;
          target.heat = 0.7;
        }
        break;
      case 'sit':
        target.survey = 1;
        speeds.survey = 0.35;
        target.sit = 1;
        target.overtake = s.waitTime > 0 ? 1 : 0;
        break;
      case 'lie':
        target.survey = 1;
        speeds.survey = 0.12;
        target.lie = 1;
        break;
      case 'sleep':
        target.survey = 1;
        speeds.survey = 0;
        target.lie = 1;
        target.sleep = 1;
        break;
      default:
        target.survey = 1;
    }

    const clipRate = 6;
    const poseRate = next === 'startle' ? 12 : 3.2;
    s.weights.walk = approach(s.weights.walk, target.walk, clipRate, dt);
    s.weights.run = approach(s.weights.run, target.run, clipRate, dt);
    s.weights.survey = approach(s.weights.survey, target.survey, clipRate, dt);
    s.speeds = speeds;
    s.pose.sit = approach(s.pose.sit, target.sit, poseRate, dt);
    s.pose.lie = approach(s.pose.lie, target.lie, poseRate, dt);
    s.pose.sleep = approach(s.pose.sleep, target.sleep, poseRate * 0.6, dt);
    s.heat = approach(s.heat, target.heat, 4, dt);
    s.overtake = approach(s.overtake, target.overtake, target.overtake ? 2.2 : 0.9, dt);
    // Sleep breathes at 0.25Hz; awake the flame is steady.
    const breathing = 0.82 + 0.18 * Math.sin(s.clock * Math.PI * 2 * 0.25);
    s.breath = approach(s.breath, next === 'sleep' ? breathing : 1, 5, dt);

    return {
      mood: s.mood,
      entered,
      previous: entered ? prev : null,
      moodTime: s.moodTime,
      weights: s.weights,
      speeds: s.speeds,
      pose: s.pose,
      heat: s.heat,
      overtake: s.overtake,
      breath: s.breath,
    };
  }

  return { update, get mood() { return s.mood; } };
}
