import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Color } from 'three';
import { film, useFilm } from './store.js';
import { SCENES } from './timeline.js';
import { getScenes } from './scroll.js';
import { registerRenderer, StatsProbe } from './debug/stats.js';
import { flags } from '../live/flags.js';
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

function CameraRig() {
  useFrame((state, delta) => {
    const { activeScene, sceneProgress } = film.getState();
    const targetZ = 9 - (activeScene + sceneProgress) * SPACING;
    const cam = state.camera;
    const k = 1 - Math.exp(-delta * 5);
    cam.position.z += (targetZ - cam.position.z) * k;
    cam.position.x = Math.sin(state.clock.elapsedTime * 0.25) * 0.15;
    cam.lookAt(0, 0, cam.position.z - 12);
  });
  return null;
}

function SceneBlock({ index }) {
  const ref = useRef(null);
  const color = useMemo(() => placeholderColor(index), [index]);
  useFrame((_, delta) => {
    if (!ref.current) return;
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

function SceneWindow() {
  const active = useFilm((s) => s.activeScene);
  return SCENES.map((scene, index) => (Math.abs(index - active) <= 1 ? <SceneBlock key={scene.id} index={index} /> : null));
}

function PlaceholderLabel() {
  const idRef = useRef(null);
  const nameRef = useRef(null);
  const barRef = useRef(null);
  useEffect(() => {
    const paint = (state) => {
      const scene = getScenes()[state.activeScene];
      if (!scene || !idRef.current) return;
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

export default function Film() {
  return (
    <div className={styles.film} aria-hidden="true">
      <Canvas
        className={styles.canvas}
        dpr={[1, 1.5]}
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
        {flags.debug ? <StatsProbe /> : null}
      </Canvas>
      <PlaceholderLabel />
    </div>
  );
}
