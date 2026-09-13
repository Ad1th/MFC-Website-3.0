import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, Vector3 } from 'three';
import { PALETTE } from '../palette.js';
import { FILM_FREEZE } from '../testHooks.js';
import { PLANE_VERTEX } from '../rooms/labels.js';

/**
 * The hilltop: a black silhouette ridge along the bottom of the frame (a noise-edged plane, so it
 * reads as grass and rock against the sky), the rock the fox sits on, and a shooting star that
 * crosses the upper sky every 8 to 15 seconds. The shooting star reports where it is, so the fox
 * can track it.
 *
 * shootingRef.current: { active, position: Vector3 (world), startedAt }
 */

const RIDGE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying vec2 vUv;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  float noise(float x) {
    float i = floor(x);
    float f = fract(x);
    return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f));
  }
  void main() {
    float x = vUv.x * 40.0;
    float ridge = 0.55 + 0.18 * noise(x * 0.15) + 0.06 * noise(x) + 0.02 * noise(x * 6.0) - 0.25 * pow(abs(vUv.x - 0.62) * 1.6, 2.0);
    if (vUv.y > ridge) discard;
    gl_FragColor = vec4(uColor, 1.0);
    #include <colorspace_fragment>
  }
`;

const STREAK_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  varying vec2 vUv;
  void main() {
    float head = smoothstep(0.0, 1.0, vUv.x);
    float across = 1.0 - abs(vUv.y - 0.5) * 2.0;
    gl_FragColor = vec4(uColor * head * head * across * uAlpha, 1.0);
    #include <colorspace_fragment>
  }
`;

const scratch = new Vector3();

export default function Hill({ origin, shootingRef }) {
  const ridge = useMemo(() => ({ uniforms: { uColor: { value: new Color('#040303') } }, vertexShader: PLANE_VERTEX, fragmentShader: RIDGE_FRAGMENT }), []);
  const streak = useMemo(() => ({ uniforms: { uColor: { value: new Color(PALETTE.flameCore) }, uAlpha: { value: 0 } }, vertexShader: PLANE_VERTEX, fragmentShader: STREAK_FRAGMENT }), []);
  const streakRef = useRef(null);
  const next = useRef(8 + Math.random() * 7);
  const flight = useRef({ from: new Vector3(), to: new Vector3() });

  useFrame((state) => {
    const shooting = shootingRef.current;
    const mesh = streakRef.current;
    if (!mesh) return;
    if (FILM_FREEZE) {
      mesh.visible = false;
      shooting.active = false;
      return;
    }
    const now = state.clock.elapsedTime;
    if (!shooting.active && now > next.current) {
      shooting.active = true;
      shooting.startedAt = now;
      const left = Math.random() < 0.5;
      flight.current.from.set(left ? -26 : 26, 20 + Math.random() * 10, -30).add(origin);
      flight.current.to.set(left ? 6 : -6, 12 + Math.random() * 6, -30).add(origin);
    }
    if (shooting.active) {
      const t = (now - shooting.startedAt) / 0.8;
      if (t >= 1) {
        shooting.active = false;
        next.current = now + 8 + Math.random() * 7;
        mesh.visible = false;
        return;
      }
      shooting.position.lerpVectors(flight.current.from, flight.current.to, t);
      mesh.visible = true;
      mesh.position.copy(shooting.position);
      scratch.subVectors(flight.current.to, flight.current.from);
      mesh.rotation.set(0, 0, Math.atan2(scratch.y, scratch.x));
      streak.uniforms.uAlpha.value = Math.sin(Math.PI * t);
    }
  });

  return (
    <group>
      <mesh position={[origin.x, origin.y - 2.2, origin.z - 14]} frustumCulled={false}>
        <planeGeometry args={[90, 22]} />
        <shaderMaterial args={[ridge]} />
      </mesh>
      <mesh position={[origin.x + 0.55, origin.y + 0.45, origin.z + 7.0]} scale={[1.1, 0.55, 0.9]}>
        <dodecahedronGeometry args={[0.8, 0]} />
        <meshStandardMaterial color="#0d0b0a" roughness={0.95} />
      </mesh>
      <mesh ref={streakRef} visible={false} frustumCulled={false}>
        <planeGeometry args={[5, 0.12]} />
        <shaderMaterial args={[streak]} transparent depthWrite={false} blending={AdditiveBlending} />
      </mesh>
    </group>
  );
}
