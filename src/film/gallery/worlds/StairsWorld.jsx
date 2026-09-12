import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import { Color, Vector3 } from 'three';
import { PALETTE } from '../../palette.js';
import { clamp01, ease, lerp, window01 } from '../../rooms/labels.js';

/**
 * 02 ENROLLMENT PORTAL: a staircase of form fields. The fox climbs it, and each step ticks its
 * checkbox as the fox lands. Fields in the screenshot's greys, labels in its blue-grey, ticks in
 * the portal's orange.
 */

const STEPS = 9;
const RISE = 1;
const RUN = 2.6;
const CLIMB_END = 0.88;

export const background = '#131417';

const a = new Vector3();
const b = new Vector3();
const at = new Vector3();

const stepTop = (k, out) => out.set(0, k * RISE + 0.15, -k * RUN);
const landAt = (k) => (k === 0 ? 0.01 : (k / (STEPS - 1)) * CLIMB_END);

function foxPosition(p, out) {
  if (p >= CLIMB_END) return stepTop(STEPS - 1, out);
  const s = clamp01(p / CLIMB_END) * (STEPS - 1);
  const k = Math.min(STEPS - 2, Math.floor(s));
  // Stand a moment on each step, then hop to the next.
  const hop = ease(clamp01((s - k - 0.35) / 0.65));
  stepTop(k, a);
  stepTop(k + 1, b);
  out.lerpVectors(a, b, hop);
  out.y += Math.sin(Math.PI * hop) * 0.7;
  return out;
}

export function fox(p, pose, input) {
  foxPosition(p, pose.position);
  pose.forward.set(0, 0, -1);
  pose.up.set(0, 1, 0);
  input.velocity = 600;
  if (p >= CLIMB_END) {
    input.hint = 'sit';
    input.velocity = 0;
  }
}

export function camera(p, cam) {
  foxPosition(p, at);
  const end = ease(window01(p, CLIMB_END, 1));
  cam.position.set(lerp(7.5, 12, end), at.y + lerp(2.4, 5, end), at.z + lerp(3, 9, end));
  cam.target.set(0, at.y + lerp(0.8, -3, end), at.z + lerp(-1.5, 8, end));
  cam.fov = 50;
  cam.roll = 0;
}

export default function StairsWorld({ progressRef, origin, colours }) {
  const [fieldHex, , labelHex] = colours;
  const field = useMemo(() => new Color(fieldHex).multiplyScalar(1.7), [fieldHex]);
  const ticks = useRef([]);
  const lightRef = useRef(null);

  useFrame(() => {
    const p = progressRef.current;
    for (let k = 0; k < STEPS; k += 1) {
      const tick = ticks.current[k];
      if (!tick) continue;
      const v = ease(window01(p, landAt(k), landAt(k) + 0.02));
      tick.visible = v > 0.001;
      tick.scale.setScalar(Math.max(1e-4, v));
    }
    if (lightRef.current) {
      foxPosition(p, at);
      lightRef.current.position.set(2, at.y + 3, at.z + 1);
    }
  });

  return (
    <group position={origin}>
      {Array.from({ length: STEPS }, (_, k) => (
        <group key={k} position={[0, k * RISE, -k * RUN]}>
          <mesh>
            <boxGeometry args={[4.4, 0.3, 1.7]} />
            <meshStandardMaterial color={field} roughness={0.55} />
            <Edges color={labelHex} />
          </mesh>
          <mesh position={[-1.35, 0.16, -0.5]}>
            <boxGeometry args={[1.1, 0.02, 0.14]} />
            <meshBasicMaterial color={labelHex} toneMapped={false} />
          </mesh>
          <mesh position={[-0.25, 0.16, 0.3]}>
            <boxGeometry args={[2.7, 0.02, 0.05]} />
            <meshBasicMaterial color={labelHex} transparent opacity={0.45} toneMapped={false} />
          </mesh>
          <mesh position={[1.75, 0.2, 0]}>
            <boxGeometry args={[0.5, 0.1, 0.5]} />
            <meshStandardMaterial color={field} />
            <Edges color={labelHex} />
          </mesh>
          <group ref={(el) => (ticks.current[k] = el)} position={[1.75, 0.27, 0]} visible={false}>
            {/* A tick seen from above: a short stroke down to the point, a long one up to the right. */}
            <mesh position={[-0.08, 0, 0.02]} rotation-y={-Math.PI / 4}>
              <boxGeometry args={[0.18, 0.04, 0.06]} />
              <meshBasicMaterial color={PALETTE.fire} toneMapped={false} />
            </mesh>
            <mesh position={[0.08, 0, -0.04]} rotation-y={0.876}>
              <boxGeometry args={[0.34, 0.04, 0.06]} />
              <meshBasicMaterial color={PALETTE.fire} toneMapped={false} />
            </mesh>
          </group>
        </group>
      ))}
      <pointLight ref={lightRef} color={labelHex} intensity={40} distance={14} decay={1.4} />
    </group>
  );
}
