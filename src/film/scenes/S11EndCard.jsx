import { Suspense, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, Vector3 } from 'three';
import { useFilm } from '../store.js';
import { registerShot } from '../camera/shots.js';
import { getFox, registerFoxShot } from '../actors/foxShots.js';
import { sceneProgressOf } from './progress.js';
import { coldOpenFoxShot, GLOBE_FACING } from './S01ColdOpen.jsx';
import Globe from '../globe/Globe.jsx';
import Wordmark from '../end/Wordmark.jsx';
import { CUT_SPACE, HOLD, RETURN_SPACE } from '../return/layout.js';
import { END_VIEW, FLOOR_Y, MINI_GLOBE, oMark, oWorld } from '../end/layout.js';
import { visitorState, markCompleted } from '../../live/visitor.js';
import { FILM_FREEZE, FILM_TEST } from '../testHooks.js';

/**
 * S11 End Card. The camera tips down past the planet onto a black floor with FIREFOX burned in,
 * still molten. The fox jumps down from the logo, walks onto the word, turns three times on the O
 * and curls up to sleep, tail over its nose; the O glows brighter under it. Cool the letters near
 * it and it tucks its tail tighter; hover right above it and one ear twitches.
 *
 * The first time a visitor ever gets here the fox has the zoomies first: three laps round a small
 * globe, a skid, a tumble, then it lies down on the O as if nothing happened.
 *
 * Beats by sceneProgress:
 *   0.00 to 0.35  the camera tips down from S10's hold to the floor
 *   0.20 to 0.30  the fox jumps down from the logo
 *   0.30 to 0.45  it walks onto the word to the O (or, first visit, the zoomies start here)
 *   0.45 to 0.62  three turns on the O
 *   0.62 on       lies down and sleeps
 */

const TIP = [0, 0.35];
const LEAP = [0.2, 0.3];
const WALK = [0.3, 0.45];
const TURNS = [0.45, 0.62];
const SLEEP_AT = 0.62;
const ZOOM_AT = 0.3;
const FLOOR_SCALE = 0.7;
const SPACE_AIR = new Color('#0a0807');

const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
const window01 = (p, a, b) => clamp01((p - a) / (b - a));
const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

const UP = new Vector3(0, 1, 0);
const oPoint = new Vector3();
const landing = new Vector3();
const logo = { position: new Vector3(), forward: new Vector3(), up: new Vector3() };
const tmpA = new Vector3();
const tmpB = new Vector3();

/** @type {import('../camera/shots.js').Shot} */
export function endShot(progress, out, aspect = 16 / 9) {
  const t = ease(window01(progress, TIP[0], TIP[1]));
  out.position.lerpVectors(HOLD.position, END_VIEW.position, t);
  out.target.lerpVectors(HOLD.target, END_VIEW.target, t);
  // The word spans 12 units: narrow screens pull back to keep it whole.
  const fit = lerp(Math.max(1, 0.85 / aspect), Math.max(1, 1.75 / aspect), t);
  if (fit > 1) out.position.sub(out.target).multiplyScalar(fit).add(out.target);
  out.fov = lerp(HOLD.fov, END_VIEW.fov, t);
  out.roll = 0;
  out.cut = CUT_SPACE;
  out.shake = 0;
}

/** Real-time state: the zoomies, the sleep and the reactions. */
const live = {
  zoomStart: 0,
  zooming: false,
  zoomDone: false,
  firstVisit: true,
  lastTuck: 0,
  hovering: false,
  asleep: 0,
};

const ZOOM = { toLap: 0.4, laps: 3.4, skid: 4.0, tumble: 4.7, trot: 5.8, settle: 6.3 };
const zoomFrom = new Vector3();
const skidFrom = new Vector3();
const skidDir = new Vector3();
const tumbleFrom = new Vector3();

/** The zoomies, t seconds in. Returns true while they run. */
function zoomPose(t, pose, input) {
  oWorld(oPoint);
  pose.scale = FLOOR_SCALE;
  pose.up.copy(UP);
  input.scenePose = null;
  input.hint = 'run';
  const centre = MINI_GLOBE.centre;
  const lapPoint = (angle, out) => out.set(centre.x + Math.cos(angle) * MINI_GLOBE.lap, FLOOR_Y, centre.z + Math.sin(angle) * MINI_GLOBE.lap);
  const startAngle = Math.PI * 0.5;

  if (t < ZOOM.toLap) {
    lapPoint(startAngle, tmpA);
    pose.position.lerpVectors(zoomFrom, tmpA, ease(t / ZOOM.toLap));
    pose.forward.subVectors(tmpA, zoomFrom).setY(0).normalize();
    input.velocity = 1800;
  } else if (t < ZOOM.laps) {
    const angle = startAngle + ((t - ZOOM.toLap) / (ZOOM.laps - ZOOM.toLap)) * Math.PI * 6;
    lapPoint(angle, pose.position);
    pose.forward.set(-Math.sin(angle), 0, Math.cos(angle));
    input.velocity = 2600;
    skidFrom.copy(pose.position);
    skidDir.copy(pose.forward);
  } else if (t < ZOOM.skid) {
    const u = (t - ZOOM.laps) / (ZOOM.skid - ZOOM.laps);
    pose.position.copy(skidFrom).addScaledVector(skidDir, 1.1 * (1 - (1 - u) * (1 - u)));
    pose.forward.copy(skidDir);
    // Leaning back into the skid.
    pose.up.copy(UP).addScaledVector(skidDir, -0.45 * Math.sin(Math.PI * u)).normalize();
    input.velocity = 2400 * (1 - u);
    tumbleFrom.copy(pose.position);
  } else if (t < ZOOM.tumble) {
    const u = ease((t - ZOOM.skid) / (ZOOM.tumble - ZOOM.skid));
    pose.position.copy(tumbleFrom).addScaledVector(skidDir, 0.35 * u);
    pose.position.y += Math.sin(Math.PI * u) * 0.3;
    pose.forward.copy(skidDir);
    pose.up.copy(UP).applyAxisAngle(skidDir, Math.PI * 2 * u);
    input.velocity = 300;
    zoomFrom.copy(tumbleFrom).addScaledVector(skidDir, 0.35);
  } else if (t < ZOOM.trot) {
    const u = ease((t - ZOOM.tumble) / (ZOOM.trot - ZOOM.tumble));
    pose.position.lerpVectors(zoomFrom, oPoint, u);
    tmpB.subVectors(oPoint, zoomFrom).setY(0);
    if (tmpB.lengthSq() > 1e-6) pose.forward.copy(tmpB.normalize());
    input.velocity = 520;
  } else {
    pose.position.copy(oPoint);
    pose.forward.subVectors(oPoint, zoomFrom).setY(0).normalize();
    input.hint = 'sleep';
    input.velocity = 0;
  }
  if (t >= ZOOM.laps && !live.skidSparks) {
    live.skidSparks = true;
    getFox()?.emitSparks?.({ count: 30, speed: 0.8, spread: 1.4, up: true });
  }
  return t < ZOOM.settle;
}

/** Facing along the walk onto the word, which is also where it faces after three full turns. */
function walkForward(out) {
  return out.subVectors(oPoint, landing).setY(0).normalize();
}

/** @type {import('../actors/foxShots.js').FoxShot} */
function endFoxShot(progress, pose, input, context) {
  const p = clamp01(progress);
  pose.visible = true;
  pose.cut = CUT_SPACE;
  oWorld(oPoint);
  landing.set(oPoint.x - 4.2, FLOOR_Y, oPoint.z + 1.5);

  if (live.zooming) {
    zoomPose((performance.now() - live.zoomStart) / 1000, pose, input);
    return;
  }

  const asleep = live.zoomDone || p >= SLEEP_AT;
  if (asleep && p >= LEAP[1]) {
    pose.position.copy(oPoint);
    walkForward(pose.forward);
    pose.up.copy(UP);
    pose.scale = FLOOR_SCALE;
    input.hint = 'sleep';
    input.velocity = 0;
    return;
  }

  // On the logo until it jumps down.
  coldOpenFoxShot(0.4999, logo, input, context);
  logo.position.add(RETURN_SPACE);
  if (p < LEAP[0]) {
    pose.position.copy(logo.position);
    pose.forward.copy(logo.forward);
    pose.up.copy(logo.up);
    pose.scale = 0.4;
    input.velocity = 0;
    return;
  }
  input.scenePose = null;

  if (p < LEAP[1]) {
    const u = window01(p, LEAP[0], LEAP[1]);
    pose.position.lerpVectors(logo.position, landing, ease(u));
    pose.position.y += Math.sin(Math.PI * u) * 1.4;
    pose.forward.subVectors(landing, logo.position).setY(0).normalize();
    pose.up.copy(UP);
    pose.scale = lerp(0.4, FLOOR_SCALE, u);
    input.hint = 'run';
    input.velocity = 1400;
    return;
  }

  pose.scale = FLOOR_SCALE;
  pose.up.copy(UP);
  walkForward(tmpA);
  if (p < WALK[1]) {
    pose.position.lerpVectors(landing, oPoint, ease(window01(p, WALK[0], WALK[1])));
    pose.forward.copy(tmpA);
    input.hint = 'run';
    input.velocity = 380;
    return;
  }

  // Three turns on the O, on a tiny circle, the way a dog settles.
  const turn = ease(window01(p, TURNS[0], TURNS[1])) * Math.PI * 6;
  pose.forward.copy(tmpA).applyAxisAngle(UP, turn);
  pose.position.copy(oPoint).addScaledVector(tmpB.crossVectors(UP, pose.forward), 0.12 * Math.sin(Math.PI * window01(p, TURNS[0], TURNS[1])));
  input.hint = 'run';
  input.velocity = 220;
}

const probe = new Vector3();

export default function S11EndCard() {
  const tier = useFilm((s) => s.quality);
  const { camera, size } = useThree();
  const oGlow = useRef(0);
  const heat = useRef(null);
  const lastProgress = useRef(0);
  const pointer = useRef({ x: -1000, y: -1000 });
  const frame = useRef(0);

  useEffect(() => registerShot('S11', endShot), []);
  useEffect(() => registerFoxShot('S11', endFoxShot), []);

  useEffect(() => {
    live.firstVisit = !visitorState().firstCompletion;
    const onMove = (event) => {
      pointer.current.x = event.clientX;
      pointer.current.y = event.clientY;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      live.zooming = false;
    };
  }, []);

  // Zoomies are real time; frozen pixel tests keep them off unless a test asks.
  const zoomiesAllowed = !FILM_FREEZE || (FILM_TEST && new URLSearchParams(window.location.search).get('zoomies') === '1');

  if (FILM_TEST) {
    window.__filmTest.endCard = () => ({
      zooming: live.zooming,
      zoomDone: live.zoomDone,
      asleep: live.asleep > 0.5,
      oGlow: oGlow.current,
      o: { ...oMark },
      oScreen: () => {
        oWorld(probe).project(camera);
        return { x: ((probe.x + 1) / 2) * size.width, y: ((1 - probe.y) / 2) * size.height };
      },
      heatAt: (u, v) => heat.current?.(u, v) ?? null,
    });
  }

  const onCool = (u, v) => {
    if (live.asleep < 0.5) return;
    const near = Math.hypot((u - oMark.u) * 4, v - oMark.v) < 0.9;
    const now = performance.now();
    if (near && now - live.lastTuck > 1800) {
      live.lastTuck = now;
      getFox()?.trigger('tuckTail', {}, { force: true });
    }
  };

  useFrame((state, delta) => {
    const p = sceneProgressOf('S11');

    // The orbit's air belongs to the end card too.
    if (p > 0 && p < 1) {
      if (state.scene.fog) {
        state.scene.fog.color.copy(SPACE_AIR);
        state.scene.fog.near = 20;
        state.scene.fog.far = 60;
      }
      if (state.scene.background?.isColor) state.scene.background.copy(SPACE_AIR);
    }

    // First visit to the end: the zoomies, once per visitor.
    if (zoomiesAllowed && live.firstVisit && !live.zoomDone && !live.zooming && lastProgress.current < ZOOM_AT && p >= ZOOM_AT) {
      live.zooming = true;
      live.skidSparks = false;
      live.zoomStart = performance.now();
      oWorld(oPoint);
      zoomFrom.set(oPoint.x - 4.2, FLOOR_Y, oPoint.z + 1.5);
    }
    if (live.zooming && (performance.now() - live.zoomStart) / 1000 >= ZOOM.settle) {
      live.zooming = false;
      live.zoomDone = true;
      markCompleted();
    }
    // Reaching the end without zoomies still counts as having seen it.
    if (!live.firstVisit || !zoomiesAllowed) {
      if (p >= SLEEP_AT) markCompleted();
    }
    lastProgress.current = p;

    const sleeping = !live.zooming && (live.zoomDone || p >= SLEEP_AT) && p >= LEAP[1];
    live.asleep += ((sleeping ? 1 : 0) - live.asleep) * Math.min(1, delta * 2);
    oGlow.current = live.asleep;

    // Hover right above the sleeping fox: one ear twitch per visit of the cursor.
    frame.current += 1;
    if (live.asleep > 0.5 && frame.current % 6 === 0) {
      const head = getFox()?.anchors?.().head;
      if (head) {
        head.project(camera);
        const x = ((head.x + 1) / 2) * size.width;
        const y = ((1 - head.y) / 2) * size.height;
        const over = Math.hypot(pointer.current.x - x, pointer.current.y - y) < 60;
        if (over && !live.hovering) getFox()?.trigger('earFlick', { side: 1 }, { force: true });
        live.hovering = over;
      }
    }
  });

  return (
    <>
      <Wordmark oGlowRef={oGlow} onCool={onCool} heatRef={heat} />
      <Suspense fallback={null}>
        <Globe tier={Math.min(tier, 2)} spin={0.1} facing={GLOBE_FACING} primary={false} scale={MINI_GLOBE.radius} position={MINI_GLOBE.centre} rotation={[0.41, 0, 0]} />
      </Suspense>
    </>
  );
}
