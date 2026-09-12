import { forwardRef, useEffect, useImperativeHandle, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, ShaderMaterial } from 'three';
import { PALETTE } from '../palette.js';

/**
 * Small burst sparks for sneezes, shake-offs and yawns. A fixed CPU pool;
 * each burst is a handful of points, so this never shows up in the budget.
 */

const POOL = 256;

const vertex = /* glsl */ `
  attribute float aLife;
  uniform float uScale;
  varying float vLife;
  void main() {
    vLife = aLife;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(0.012 * uScale * aLife / -mv.z, 0.0, 12.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uEmber;
  uniform vec3 uFire;
  varying float vLife;
  void main() {
    if (vLife <= 0.0) discard;
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d) * vLife;
    gl_FragColor = vec4(mix(uFire, uEmber, vLife) * 1.5, a);
    #include <colorspace_fragment>
  }
`;

const Sparks = forwardRef(function Sparks({ driftRef, timeScaleRef }, ref) {
  const { geometry, material, pool } = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(POOL * 3), 3).setUsage(DynamicDrawUsage));
    g.setAttribute('aLife', new BufferAttribute(new Float32Array(POOL), 1).setUsage(DynamicDrawUsage));
    const m = new ShaderMaterial({
      uniforms: { uScale: { value: 500 }, uEmber: { value: new Color(PALETTE.ember) }, uFire: { value: new Color(PALETTE.fire) } },
      vertexShader: vertex,
      fragmentShader: `#include <common>\n${fragment}`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    return { geometry: g, material: m, pool: { velocity: new Float32Array(POOL * 3), maxLife: new Float32Array(POOL), next: 0 } };
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useImperativeHandle(
    ref,
    () => ({
      emit(at, { count = 12, speed = 1, spread = 0.6, up = false, ring = false }) {
        const pos = geometry.attributes.position.array;
        const life = geometry.attributes.aLife.array;
        for (let n = 0; n < count; n += 1) {
          const i = pool.next;
          pool.next = (pool.next + 1) % POOL;
          pos[i * 3] = at.x;
          pos[i * 3 + 1] = at.y;
          pos[i * 3 + 2] = at.z;
          const angle = ring ? (n / count) * Math.PI * 2 : Math.random() * Math.PI * 2;
          const s = speed * (0.5 + Math.random() * 0.6);
          pool.velocity[i * 3] = Math.cos(angle) * s * (ring ? 1 : spread);
          pool.velocity[i * 3 + 1] = (up ? 0.6 + Math.random() * 0.4 : (Math.random() - 0.2) * spread) * s;
          pool.velocity[i * 3 + 2] = Math.sin(angle) * s * (ring ? 1 : spread);
          pool.maxLife[i] = 0.35 + Math.random() * 0.35;
          life[i] = 1;
        }
      },
    }),
    [geometry, pool],
  );

  useFrame((state, frameDelta) => {
    // Sparks hang in the air when the fox's clock stops (bullet time).
    const delta = frameDelta * (timeScaleRef?.current ?? 1);
    const pos = geometry.attributes.position.array;
    const life = geometry.attributes.aLife.array;
    const drift = driftRef?.current;
    const damp = Math.exp(-3 * delta);
    for (let i = 0; i < POOL; i += 1) {
      if (life[i] <= 0) continue;
      life[i] = Math.max(0, life[i] - delta / pool.maxLife[i]);
      pool.velocity[i * 3] *= damp;
      pool.velocity[i * 3 + 1] = pool.velocity[i * 3 + 1] * damp - 0.9 * delta;
      pool.velocity[i * 3 + 2] *= damp;
      pos[i * 3] += pool.velocity[i * 3] * delta + (drift ? drift.x * delta : 0);
      pos[i * 3 + 1] += pool.velocity[i * 3 + 1] * delta;
      pos[i * 3 + 2] += pool.velocity[i * 3 + 2] * delta + (drift ? drift.z * delta : 0);
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aLife.needsUpdate = true;
    material.uniforms.uScale.value = state.size.height * state.viewport.dpr * 0.5 * state.camera.projectionMatrix.elements[5];
  });

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={4} />;
});

export default Sparks;
