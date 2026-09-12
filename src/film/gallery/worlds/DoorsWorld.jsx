import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, DoubleSide, Vector3 } from 'three';
import { ease, lerp, window01 } from '../../rooms/labels.js';

/**
 * 01 ROOMMATE DHOONDO: a corridor of doors that open one by one. The fox pokes its head into each
 * room, sniffs and moves on; at the last door it circles once and sits, as if it might stay.
 * Primitives only, tinted with the screenshot's colours (walls, doors, warm room light).
 */

const DOORS = 6;
const GAP = 5.5;
const WIDTH = 5;
const HEIGHT = 4.2;
const DOOR_HEIGHT = 3;
const RUN_END = 0.8;
const SLOT = RUN_END / DOORS;
const LENGTH = 10 + DOORS * GAP;

export const background = '#10121c';

const doorZ = (k) => -5 - k * GAP;
const doorSide = (k) => (k % 2 === 0 ? -1 : 1);

function slot(p, k) {
  const start = k * SLOT;
  return {
    walk: ease(window01(p, start, start + SLOT * 0.55)),
    poke: Math.sin(Math.PI * window01(p, start + SLOT * 0.55, start + SLOT)),
    open: ease(window01(p, start + SLOT * 0.35, start + SLOT * 0.62)),
  };
}

const look = new Vector3();

export function fox(p, pose, input) {
  pose.up.set(0, 1, 0);
  input.velocity = 900;
  if (p < RUN_END) {
    const k = Math.min(DOORS - 1, Math.floor(p / SLOT));
    const { walk, poke } = slot(p, k);
    const side = doorSide(k);
    const from = k === 0 ? 3 : doorZ(k - 1);
    pose.position.set(side * 1.5 * poke, 0, lerp(from, doorZ(k), walk));
    pose.forward.set(side * poke, 0, -(1 - poke)).normalize();
    if (poke > 0.15) {
      input.velocity = 0;
      input.look = look.set(side * (WIDTH / 2 + 2), 0.8, doorZ(k));
      input.lookWeight = poke;
    }
    return;
  }
  const last = doorZ(DOORS - 1);
  if (p < 0.94) {
    const a = window01(p, RUN_END, 0.94) * Math.PI * 2;
    pose.position.set(-Math.sin(a) * 1.2, 0, last - 1.2 + Math.cos(a) * 1.2);
    pose.forward.set(-Math.cos(a), 0, -Math.sin(a));
    return;
  }
  pose.position.set(0, 0, last);
  pose.forward.set(doorSide(DOORS - 1), 0, 0);
  input.hint = 'sit';
  input.velocity = 0;
}

const camPose = { position: new Vector3(), forward: new Vector3(), up: new Vector3() };

export function camera(p, cam) {
  fox(p, camPose, {});
  const f = camPose.position;
  const end = ease(window01(p, RUN_END, 1));
  const k = Math.min(DOORS - 1, Math.floor(Math.min(p, RUN_END - 1e-6) / SLOT));
  const poke = p < RUN_END ? slot(p, k).poke : 0;
  const side = doorSide(k);
  cam.position.set(f.x - side * 1.6 * poke + 1.2, 2.3 + end * 1.8, f.z + 4.6 + end * 2.5);
  cam.target.set(f.x + side * 2.6 * poke, 0.9, f.z - 3 + 3 * end);
  cam.fov = 55;
  cam.roll = 0;
}

export default function DoorsWorld({ progressRef, origin, colours }) {
  const [frameHex, wallHex, doorHex] = colours;
  const floorColour = useMemo(() => new Color(wallHex).multiplyScalar(0.55), [wallHex]);
  const doors = useMemo(() => Array.from({ length: DOORS }, (_, k) => ({ z: doorZ(k), side: doorSide(k) })), []);
  // Wall runs between the doorways on each side.
  const walls = useMemo(() => {
    const out = [];
    for (const side of [-1, 1]) {
      let from = 4;
      for (const d of doors.filter((door) => door.side === side)) {
        if (from > d.z + 0.9) out.push({ side, from, to: d.z + 0.9 });
        from = d.z - 0.9;
      }
      out.push({ side, from, to: 4 - LENGTH });
    }
    return out;
  }, [doors]);
  const leaves = useRef([]);
  const glows = useRef([]);

  useFrame(() => {
    const p = progressRef.current;
    doors.forEach((d, k) => {
      const { open } = slot(p, k);
      const leaf = leaves.current[k];
      if (leaf) leaf.rotation.y = -d.side * open * 1.35;
      const glow = glows.current[k];
      if (glow) glow.material.opacity = open;
    });
  });

  return (
    <group position={origin}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 4 - LENGTH / 2]}>
        <planeGeometry args={[WIDTH, LENGTH]} />
        <meshStandardMaterial color={floorColour} roughness={0.8} />
      </mesh>
      {walls.map((w, i) => (
        <mesh key={`wall${i}`} position={[w.side * (WIDTH / 2 + 0.1), HEIGHT / 2, (w.from + w.to) / 2]}>
          <boxGeometry args={[0.2, HEIGHT, Math.abs(w.from - w.to)]} />
          <meshStandardMaterial color={wallHex} roughness={0.9} />
        </mesh>
      ))}
      {doors.map((d, k) => (
        <group key={`door${k}`}>
          <mesh position={[d.side * (WIDTH / 2 + 0.1), (DOOR_HEIGHT + HEIGHT) / 2, d.z]}>
            <boxGeometry args={[0.2, HEIGHT - DOOR_HEIGHT, 1.8]} />
            <meshStandardMaterial color={wallHex} roughness={0.9} />
          </mesh>
          {[0.85, -0.85].map((dz) => (
            <mesh key={dz} position={[d.side * (WIDTH / 2), DOOR_HEIGHT / 2, d.z + dz]}>
              <boxGeometry args={[0.26, DOOR_HEIGHT, 0.1]} />
              <meshStandardMaterial color={frameHex} roughness={0.5} />
            </mesh>
          ))}
          <group ref={(el) => (leaves.current[k] = el)} position={[d.side * (WIDTH / 2), 0, d.z + 0.8]}>
            <mesh position={[0, DOOR_HEIGHT / 2, -0.8]}>
              <boxGeometry args={[0.08, DOOR_HEIGHT, 1.6]} />
              <meshStandardMaterial color={doorHex} roughness={0.6} />
            </mesh>
            <mesh position={[-d.side * 0.08, 1.45, -1.4]}>
              <sphereGeometry args={[0.06, 12, 8]} />
              <meshStandardMaterial color={frameHex} metalness={0.6} roughness={0.3} />
            </mesh>
          </group>
          {/* The room's warm light, wide enough to fill the doorway from the corridor's oblique view. */}
          <mesh ref={(el) => (glows.current[k] = el)} position={[d.side * (WIDTH / 2 + 1.2), DOOR_HEIGHT / 2, d.z - 1.2]} rotation-y={(-d.side * Math.PI) / 2}>
            <planeGeometry args={[5.4, DOOR_HEIGHT]} />
            <meshBasicMaterial color={frameHex} transparent opacity={0} toneMapped={false} side={DoubleSide} />
          </mesh>
          <mesh position={[0, HEIGHT - 0.05, d.z]}>
            <boxGeometry args={[0.6, 0.05, 0.3]} />
            <meshBasicMaterial color={frameHex} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {[doorZ(0), doorZ(2), doorZ(4)].map((z) => (
        <pointLight key={z} position={[0, 3.6, z]} color={frameHex} intensity={25} distance={16} decay={1.5} />
      ))}
    </group>
  );
}
