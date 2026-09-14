import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Matrix4, Quaternion, Vector3 } from 'three';
import Fox from '../fox/Fox.jsx';
import { film, useFilm } from '../store.js';
import { getScenes } from '../scroll.js';
import { createFoxPose, sampleFoxShot, setFoxHandle } from './foxShots.js';
import { raceFoxPose } from './raceFox.js';
import { FILM_FREEZE, FILM_TEST } from '../testHooks.js';
import { buzz } from '../../live/haptics.js';

/**
 * The one fox in the film. Every frame it samples the active scene's fox shot (foxShots.js)
 * and hands the transform to the Fox as an anchor, which the Fox applies to its own rig
 * group: the trail, eyes and sparks are world-space and must never sit under a moved,
 * scaled group. This wrapper only toggles visibility. Scenes without a fox shot hide it.
 */

/** Tap and hold on the fox (mostly phones): pet it while held. */
const HOLD_MS = 350;
const HOLD_RADIUS_PX = 70;
const INTERACTIVE = 'a, button, input, textarea, select, label, [role="radio"], [data-cursor="link"]';
const headScreen = new Vector3();

const basis = new Matrix4();
const left = new Vector3();
const up = new Vector3();

export default function FilmFox() {
  const tier = useFilm((s) => s.quality);
  const visibleRef = useRef(null);
  const foxRef = useRef(null);
  const pose = useMemo(() => createFoxPose(), []);
  const anchor = useMemo(() => ({ position: pose.position, quaternion: new Quaternion(), scale: pose.scale, visible: false }), [pose]);
  const [trail, setTrail] = useState(true);
  const [light, setLight] = useState(false);
  const lightRef = useRef(false);
  const [tint, setTint] = useState(null);
  const tintRef = useRef(null);
  const lastCut = useRef(0);
  const input = useRef({
    velocity: 0,
    idleSeconds: 0,
    hint: 'run',
    forced: null,
    scripted: true,
    speed: 0,
    look: null,
    lookWeight: 0,
    petting: false,
    wind: new Vector3(),
    timeScale: 1,
    scenePose: null,
    eyeOverride: null,
    flame: 1,
  });

  useEffect(() => () => setFoxHandle(null), []);

  // Press and hold on the fox pets it; letting go ends the petting (the fox swishes its tail).
  const press = useRef({ down: null, petting: false, screen: null, rejected: null });
  useEffect(() => {
    const onDown = (event) => {
      if (event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest(INTERACTIVE)) {
        press.current.rejected = 'interactive';
        return;
      }
      const at = press.current.screen;
      if (!at || Math.hypot(event.clientX - at.x, event.clientY - at.y) > HOLD_RADIUS_PX) {
        press.current.rejected = at ? 'far' : 'no-head';
        return;
      }
      press.current.rejected = null;
      press.current.down = { x: event.clientX, y: event.clientY, t: performance.now() };
    };
    const onMove = (event) => {
      const d = press.current.down;
      if (d && Math.hypot(event.clientX - d.x, event.clientY - d.y) > 14) press.current.down = null;
    };
    const onUp = () => {
      press.current.down = null;
      if (press.current.petting) {
        press.current.petting = false;
        film.getState().petFox(0);
      }
    };
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  // Before the Fox's own frame callback (priority -1), so it reads this frame's pose and input.
  useFrame((state) => {
    const { activeScene, sceneProgress, velocity } = film.getState();
    const scene = getScenes()[activeScene];
    const inp = input.current;

    // Defaults each frame; a shot sets only what it owns.
    inp.velocity = velocity;
    inp.hint = 'run';
    inp.timeScale = 1;
    inp.scenePose = null;
    inp.eyeOverride = null;
    inp.flame = 1;
    inp.look = null;
    inp.lookWeight = 0;
    inp.scripted = true;
    pose.visible = true;
    pose.scale = 0.4;
    pose.cut = 0;
    pose.light = false;
    pose.tint = null;

    const context = { camera: state.camera, aspect: state.size.width / state.size.height };
    let sampled = Boolean(scene) && sampleFoxShot(scene.id, sceneProgress, pose, inp, context);
    // The race home takes the fox over from any scene (live/race.js).
    const race = film.getState().race;
    if (race.phase !== 'idle' && raceFoxPose(race, activeScene, sceneProgress, pose, inp, context)) sampled = true;
    if (FILM_FREEZE) inp.timeScale = 0;
    // Back after a long absence: asleep until the next scroll (tab.js, scroll.js).
    inp.forced = film.getState().foxAsleep ? 'sleep' : null;
    // Held long enough on the fox: petting until the pointer lets go (renewed each frame).
    const held = press.current.down;
    if (held && !press.current.petting && performance.now() - held.t > HOLD_MS) {
      press.current.petting = true;
      buzz(12);
    }
    if (press.current.petting) film.getState().petFox(performance.now() + 120);
    inp.petting = performance.now() < film.getState().petUntil;
    if (foxRef.current) setFoxHandle(foxRef.current);

    // Light backgrounds flip the fox's blending; a React update, but only when it changes.
    if (pose.light !== lightRef.current) {
      lightRef.current = pose.light;
      setLight(pose.light);
    }
    if (pose.tint !== tintRef.current) {
      tintRef.current = pose.tint;
      setTint(pose.tint);
    }

    const shown = sampled && pose.visible;
    anchor.visible = shown;
    if (visibleRef.current) visibleRef.current.visible = shown;
    if (!shown) return;

    // A hidden cut (a set change) restarts the world-space trail instead of drawing a line across worlds.
    if (pose.cut !== lastCut.current) {
      lastCut.current = pose.cut;
      setTrail(false);
      requestAnimationFrame(() => setTrail(true));
    }

    left.crossVectors(pose.up, pose.forward).normalize();
    up.crossVectors(pose.forward, left).normalize();
    basis.makeBasis(left, up, pose.forward);
    anchor.quaternion.setFromRotationMatrix(basis);
    anchor.scale = pose.scale;

    // Where the fox's head is on screen, for press-and-hold petting.
    const head = foxRef.current?.anchors?.().head;
    if (head) {
      headScreen.copy(head).project(state.camera);
      press.current.screen = headScreen.z < 1 ? { x: ((headScreen.x + 1) / 2) * state.size.width, y: ((1 - headScreen.y) / 2) * state.size.height } : null;
    } else {
      press.current.screen = null;
    }
    if (FILM_TEST) window.__filmTest.foxPress = () => ({ screen: press.current.screen, petting: press.current.petting, petUntil: film.getState().petUntil, down: Boolean(press.current.down), rejected: press.current.rejected });
  }, -2);

  return (
    <group ref={visibleRef} visible={false}>
      <Suspense fallback={null}>
        <Fox ref={foxRef} approach="C" tier={tier} input={input} trail={trail} anchor={anchor} light={light} tint={tint} />
      </Suspense>
    </group>
  );
}
