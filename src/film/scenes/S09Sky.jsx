import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, Vector3 } from 'three';
import { film, useFilm } from '../store.js';
import { registerShot } from '../camera/shots.js';
import { getFox, registerFoxShot } from '../actors/foxShots.js';
import { sceneProgressOf } from './progress.js';
import { hiss } from '../../live/sound.js';
import { PALETTE } from '../palette.js';
import { FILM_FREEZE, FILM_TEST } from '../testHooks.js';
import { clamp01, lerp } from '../rooms/labels.js';
import { team } from '../../content/index.js';
import { EYE, POLE, RECRUITMENT_URL, SKY_ORIGIN, SKY_RADIUS, STARS, YEARS, angleForYear } from '../night/layout.js';
import SkyStars from '../night/SkyStars.jsx';
import Hill from '../night/Hill.jsx';
import { RainStreaks } from '../sky/DiveClouds.jsx';

/**
 * S09 The Sky. A hilltop at night; the fox sits on a rock with its fire low, looking up. Every
 * board member is a star, grouped into constellations by domain, and the faculty coordinator is the
 * north star the sky turns about. Hover a star and it swells into its portrait, lit in fire, with
 * name and role; click and the camera flies up to it while a card (DOM) shows the member's links.
 * The year dial (DOM) spins the whole sky with long-exposure trails; one board sets as the next
 * rises, and the fox's head follows. Real Vellore rain falls on the hilltop and makes the flame
 * sputter. Shooting stars cross now and then; the fox tracks them and thumps its tail. Idle for 12
 * seconds and it yawns. The empty star in the newest board says `this one could be you.`; the fox
 * looks at you and swishes its tail, and a click opens enrollments.
 *
 * The sky's turn and the camera's flight answer the viewer, so they run in real time; the scene's
 * scroll only brings the hilltop in and out.
 */

const SKY_CUT = 50;
const FOX_AT = new Vector3(0.55, 0.95, 7.0);
const SPIN_STIFFNESS = 3.2;
const HOVER_PX = 26;

/** Time-based focus flight, 0 (on the hill) to 1 (at the star), eased in the scene. */
const flight = { amount: 0, key: null };

const va = new Vector3();
const vb = new Vector3();

/** @type {import('../camera/shots.js').Shot} */
export function skyShot(progress, out) {
  const rise = clamp01(progress / 0.2);
  out.position.copy(EYE).add(SKY_ORIGIN);
  out.position.y += lerp(-0.6, 0, rise);
  // Looking a little up: the fox and its rock at the bottom of the frame, the north star near the top.
  va.set(0, Math.sin(0.31), -Math.cos(0.31));
  out.target.copy(out.position).addScaledVector(va, 20);
  out.fov = 62;
  out.roll = 0;
  out.cut = SKY_CUT;
  out.shake = 0;
  if (flight.amount > 0 && flight.key) {
    const star = STARS.find((s) => s.key === flight.key);
    if (star) {
      const angle = film.getState().teamYear ? angleForYear(Math.max(0, YEARS.indexOf(film.getState().teamYear))) : 0;
      const dir = star.kind === 'faculty' ? POLE.clone() : star.dir.clone().applyAxisAngle(POLE, angle);
      const at = vb.copy(EYE).add(SKY_ORIGIN).addScaledVector(dir, SKY_RADIUS * 0.92);
      out.position.lerp(va.copy(EYE).add(SKY_ORIGIN).addScaledVector(dir, SKY_RADIUS * 0.6), flight.amount);
      out.target.lerp(at, flight.amount);
      out.fov = lerp(62, 40, flight.amount);
    }
  }
}

const lookAt = new Vector3();
const foxState = { look: null, lookWeight: 0, flame: 0.4 };

/** @type {import('../actors/foxShots.js').FoxShot} */
function skyFoxShot(progress, pose, input) {
  pose.position.copy(FOX_AT).add(SKY_ORIGIN);
  pose.forward.set(0, 0, -1);
  pose.up.set(0, 1, 0);
  pose.scale = 0.35;
  pose.cut = SKY_CUT;
  pose.visible = progress > 0 && progress < 1;
  input.hint = 'sit';
  input.velocity = 0;
  input.flame = foxState.flame;
  if (foxState.look) {
    input.look = foxState.look;
    input.lookWeight = foxState.lookWeight;
  }
}

const pointerNdc = { x: 0, y: 0, active: false };
const probe = new Vector3();
const air = new Color(PALETTE.night);

export default function S09Sky() {
  const weather = useFilm((s) => s.live.weather);
  const { camera, size, scene } = useThree();
  const skyState = useRef({ yearIndex: 0, angle: 0, spin: 0, hover: null, focus: null, pulse: 0 });
  const shootingRef = useRef({ active: false, position: new Vector3(), startedAt: 0 });
  const progressRef = useRef(0);
  const idle = useRef({ since: 0, yawned: false, lastAngle: 0, lastShot: -1, emptyHovered: false });
  const rain = weather?.condition === 'rain' || weather?.condition === 'storm' ? 1 : weather?.condition === 'drizzle' ? 0.5 : 0;
  const origin = useMemo(() => SKY_ORIGIN.clone(), []);

  useEffect(() => registerShot('S09', skyShot), []);
  useEffect(() => registerFoxShot('S09', skyFoxShot), []);
  useEffect(() => {
    if (!film.getState().teamYear) film.getState().setTeamYear(YEARS[0]);
    return () => {
      film.getState().setSkyFocus(null);
      flight.amount = 0;
      flight.key = null;
      document.body.style.cursor = '';
    };
  }, []);

  // Pointer, click and Esc come from the window: the film canvas takes no pointer events.
  useEffect(() => {
    const onMove = (event) => {
      pointerNdc.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointerNdc.y = -(event.clientY / window.innerHeight) * 2 + 1;
      pointerNdc.active = true;
      idle.current.since = performance.now();
      idle.current.yawned = false;
    };
    const onClick = (event) => {
      const p = sceneProgressOf('S09');
      if (p <= 0 || p >= 1) return;
      if (event.target instanceof Element && event.target.closest('a, button, input, label, [role="dialog"], [data-sky-dial]')) return;
      const s = skyState.current;
      if (s.focus) {
        film.getState().setSkyFocus(null);
        return;
      }
      if (s.hover === 'empty') {
        window.open(RECRUITMENT_URL, '_blank', 'noopener');
        return;
      }
      if (s.hover) film.getState().setSkyFocus(s.hover);
    };
    const onKey = (event) => {
      if (event.key === 'Escape' && film.getState().skyFocus) film.getState().setSkyFocus(null);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onMove, { passive: true });
    window.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
      window.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    if (!FILM_TEST) return undefined;
    window.__filmTest.sky = () => ({
      year: film.getState().teamYear,
      yearIndex: skyState.current.yearIndex,
      angle: skyState.current.angle,
      focus: film.getState().skyFocus,
      hover: skyState.current.hover,
      stars: STARS.map((s) => ({ key: s.key, kind: s.kind, year: s.year, name: s.member?.name ?? null })),
      facultyName: team.faculty.name,
      screen: (key) => {
        const star = STARS.find((st) => st.key === key);
        if (!star) return null;
        probe.copy(star.dir).applyAxisAngle(POLE, skyState.current.angle).multiplyScalar(SKY_RADIUS).add(EYE).add(SKY_ORIGIN).project(camera);
        return [((probe.x + 1) / 2) * size.width, ((1 - probe.y) / 2) * size.height];
      },
    });
    return () => {
      delete window.__filmTest.sky;
    };
  }, [camera, size.width, size.height]);

  useFrame((state, delta) => {
    const p = sceneProgressOf('S09');
    progressRef.current = p;
    const active = p > 0 && p < 1;
    const s = skyState.current;
    const store = film.getState();

    // The sky turns to the chosen year with a spring; its speed drives the star trails.
    const yearIndex = Math.max(0, YEARS.indexOf(store.teamYear ?? YEARS[0]));
    s.yearIndex = yearIndex;
    const goal = angleForYear(yearIndex);
    if (FILM_FREEZE) {
      s.spin = 0;
      s.angle = goal;
    } else {
      const dt = Math.min(delta, 1 / 20);
      const accel = SPIN_STIFFNESS * SPIN_STIFFNESS * (goal - s.angle) - 2 * SPIN_STIFFNESS * s.spin;
      s.spin += accel * dt;
      s.angle += s.spin * dt;
    }
    s.pulse = FILM_FREEZE ? 1 : 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 3);
    s.focus = store.skyFocus;

    // Hover: the nearest star of the showing year (or the north star, or the empty star) on screen.
    let hover = null;
    if (active && pointerNdc.active && !s.focus) {
      let best = HOVER_PX;
      for (const star of STARS) {
        if (star.kind === 'member' && star.yearIndex !== yearIndex) continue;
        if (star.kind === 'empty' && yearIndex !== 0) continue;
        probe.copy(star.dir).applyAxisAngle(POLE, s.angle).multiplyScalar(SKY_RADIUS).add(EYE).add(SKY_ORIGIN).project(camera);
        if (probe.z > 1) continue;
        const dx = ((probe.x - pointerNdc.x) * size.width) / 2;
        const dy = ((probe.y - pointerNdc.y) * size.height) / 2;
        const d = Math.hypot(dx, dy);
        if (d < best) {
          best = d;
          hover = star.key;
        }
      }
    }
    if (hover !== s.hover) document.body.style.cursor = hover ? 'pointer' : '';
    s.hover = hover;

    // The camera flight to a focused star.
    const wantFlight = s.focus ? 1 : 0;
    if (s.focus) flight.key = s.focus;
    flight.amount = FILM_FREEZE ? wantFlight : flight.amount + (wantFlight - flight.amount) * Math.min(1, delta * 2.5);

    // The fox's life: head follows the hovered star, a shooting star or the turning sky.
    const fox = getFox();
    const shooting = shootingRef.current;
    const idleState = idle.current;
    foxState.look = null;
    foxState.lookWeight = 0;
    if (hover === 'empty') {
      foxState.look = lookAt.copy(camera.position);
      foxState.lookWeight = 1;
      if (!idleState.emptyHovered) fox?.trigger('swish', {}, { force: true });
      idleState.emptyHovered = true;
    } else {
      idleState.emptyHovered = false;
      const key = s.focus ?? hover;
      const star = key ? STARS.find((st) => st.key === key) : null;
      if (star) {
        foxState.look = lookAt.copy(star.dir).applyAxisAngle(POLE, s.angle).multiplyScalar(SKY_RADIUS).add(EYE).add(SKY_ORIGIN);
        foxState.lookWeight = 1;
      } else if (shooting.active) {
        foxState.look = lookAt.copy(shooting.position);
        foxState.lookWeight = 1;
        if (idleState.lastShot !== shooting.startedAt) {
          idleState.lastShot = shooting.startedAt;
          fox?.trigger('tailThump', {}, { force: true });
        }
      } else if (Math.abs(s.spin) > 0.05) {
        // Track the turning sky: look at the front of the showing year's sector.
        const front = STARS.find((st) => st.kind === 'member' && st.yearIndex === yearIndex && st.group === 'core');
        if (front) {
          foxState.look = lookAt.copy(front.dir).applyAxisAngle(POLE, s.angle).multiplyScalar(SKY_RADIUS).add(EYE).add(SKY_ORIGIN);
          foxState.lookWeight = 0.8;
        }
      }
    }
    if (Math.abs(s.angle - idleState.lastAngle) > 0.01) {
      idleState.lastAngle = s.angle;
      idleState.since = performance.now();
      idleState.yawned = false;
    }
    if (active && !FILM_FREEZE && !idleState.yawned && performance.now() - idleState.since > 12000) {
      idleState.yawned = true;
      fox?.trigger('yawn', {}, { force: true });
    }

    // Rain on the hilltop makes the low flame sputter, with a hiss now and then.
    const t = state.clock.elapsedTime;
    const dip = rain > 0 && !FILM_FREEZE ? Math.max(0, Math.sin(t * 2.3) * Math.sin(t * 5.1 + 1.3) - 0.35) * rain : 0;
    foxState.flame = 0.4 * (1 - dip * 0.9);
    if (dip > 0.45 && Math.random() < 0.01) hiss();

    if (active && scene.background?.isColor) scene.background.copy(air);
  });

  return (
    <group>
      <group position={[EYE.x + SKY_ORIGIN.x, EYE.y + SKY_ORIGIN.y, EYE.z + SKY_ORIGIN.z]}>
        <SkyStars stateRef={skyState} />
      </group>
      <Hill origin={origin} shootingRef={shootingRef} />
      {/* Softer than the dive's storm: rain against a night sky, not a curtain. */}
      <RainStreaks amount={rain * 0.3} progressRef={progressRef} from={0.001} to={0.999} count={600} />
    </group>
  );
}
