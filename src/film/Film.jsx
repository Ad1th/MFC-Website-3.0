import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Color } from 'three';
import { film, useFilm } from './store.js';
import { SCENES } from './timeline.js';
import { getScenes } from './scroll.js';
import { registerRenderer, StatsProbe } from './debug/stats.js';
import { flags } from '../live/flags.js';
import { filmDpr } from './dpr.js';
import { FILM_FREEZE } from './testHooks.js';
import S02Break from './scenes/S02Break.jsx';
import S01ColdOpen from './scenes/S01ColdOpen.jsx';
import CameraRig from './camera/CameraRig.jsx';
import S03Dive from './scenes/S03Dive.jsx';
import S04Packet from './scenes/S04Packet.jsx';
import S05Rooms from './scenes/S05Rooms.jsx';
import { BUILT_SCENES as BUILT } from './built.js';
import FilmFox from './actors/FilmFox.jsx';
import styles from './Film.module.css';

/**
 * Phase 1 placeholder film: one tumbling block per scene along the camera path,
 * so scroll mapping, scene windows and handovers are visible before any real
 * scene exists. Only the active scene and its neighbours are mounted.
 */

const SPACING = 30;

function placeholderColor(index) {
  // Debug-only hues. Real scenes follow the palette rule.
  return new Color().setHSL(index / SCENES.length, 0.32, 0.42);
}

function SceneBlock({ index }) {
  const ref = useRef(null);
  const color = useMemo(() => placeholderColor(index), [index]);
  useFrame((_, delta) => {
    if (!ref.current || FILM_FREEZE) return;
    ref.current.rotation.x += delta * 0.18;
    ref.current.rotation.y += delta * 0.27;
  });
  return (
    <mesh ref={ref} position={[0, 0, -index * SPACING]}>
      <boxGeometry args={[4, 4, 4]} />
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.05} />
    </mesh>
  );
}

/* Scenes with real content (built.js); the rest keep their debug block until they are built. */

function SceneWindow() {
  const active = useFilm((s) => s.activeScene);
  return SCENES.map((scene, index) =>
    !BUILT.has(scene.id) && Math.abs(index - active) <= 1 ? <SceneBlock key={scene.id} index={index} /> : null,
  );
}

function ColdOpenWindow() {
  const active = useFilm((s) => s.activeScene);
  // The globe returns in S03 and S10; for now it lives while S01 to S03 are near.
  return active <= 2 ? <S01ColdOpen /> : null;
}

function DiveWindow() {
  const active = useFilm((s) => s.activeScene);
  return active >= 1 && active <= 3 ? <S03Dive /> : null;
}

function PacketWindow() {
  const active = useFilm((s) => s.activeScene);
  return active >= 2 && active <= 4 ? <S04Packet /> : null;
}

function RoomsWindow() {
  const active = useFilm((s) => s.activeScene);
  return active >= 3 && active <= 5 ? <S05Rooms /> : null;
}

function PlaceholderLabel() {
  const idRef = useRef(null);
  const nameRef = useRef(null);
  const barRef = useRef(null);
  useEffect(() => {
    const paint = (state) => {
      const scene = getScenes()[state.activeScene];
      if (!scene || !idRef.current) return;
      // Debug marker for unbuilt scenes only; built scenes carry their own frame.
      // visibility, not [hidden]: the module's display:grid would override the attribute.
      idRef.current.parentElement.style.visibility = BUILT.has(scene.id) ? 'hidden' : 'visible';
      idRef.current.textContent = scene.id;
      nameRef.current.textContent = scene.name;
      barRef.current.style.transform = `scaleX(${state.sceneProgress})`;
    };
    paint(film.getState());
    return film.subscribe(paint);
  }, []);
  return (
    <div className={styles.label}>
      <span ref={idRef} className={styles.id} />
      <span ref={nameRef} className={styles.name} />
      <span className={styles.bar}>
        <span ref={barRef} className={styles.fill} />
      </span>
    </div>
  );
}

const BREAK_INDEX = SCENES.findIndex((scene) => scene.id === 'S02');

export default function Film() {
  const tier = useFilm((s) => s.quality);
  return (
    <div className={styles.film} aria-hidden="true">
      <Canvas
        className={styles.canvas}
        dpr={filmDpr(tier)}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 45, near: 0.1, far: 200, position: [0, 0, 9] }}
        onCreated={({ gl }) => registerRenderer(gl)}
      >
        <color attach="background" args={['#0a0807']} />
        <fog attach="fog" args={['#0a0807', 20, 60]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[4, 6, 5]} intensity={1.8} />
        <CameraRig />
        <SceneWindow />
        <ColdOpenWindow />
        <DiveWindow />
        <PacketWindow />
        <RoomsWindow />
        <FilmFox />
        <S02Break index={BREAK_INDEX} />
        {flags.debug ? <StatsProbe /> : null}
      </Canvas>
      <PlaceholderLabel />
    </div>
  );
}
