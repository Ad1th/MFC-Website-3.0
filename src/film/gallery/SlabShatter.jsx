import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, ShaderMaterial } from 'three';
import { voronoiCells } from '../shatter/voronoi.js';
import { mulberry32 } from '../fox/rig.js';
import { PALETTE } from '../palette.js';
import { SHARD_LIFT, SLAB_COUNT, SLAB_SIZE, SLAB_Y, shardTarget, slabFrame, slabYaw } from './layout.js';

/**
 * S02's shatter, in world space. The slab's screenshot breaks along the same Voronoi tiling the
 * page broke along, the shards burst out, then fly down the curve and settle into the next slab's
 * face, crossfading to its screenshot as they land. The last slab's shards rise into the dark.
 * Motion is a pure function of stateRef.current.t (0 to 1), so scrolling back reassembles it.
 *
 * stateRef.current = { visible: boolean, t: number }
 */

const vertexShader = /* glsl */ `
  uniform float uT;
  uniform vec3 uFrom;
  uniform vec3 uTo;
  uniform float uYawFrom;
  uniform float uYawTo;
  uniform float uLift;
  uniform float uFront;
  attribute vec3 aCentroid;
  attribute vec3 aOffset;
  attribute vec3 aVelocity;
  attribute vec4 aSpin;
  attribute float aDelay;
  varying vec2 vUv;
  varying float vBurst;

  vec3 rotateAxis(vec3 v, vec3 k, float a) {
    float c = cos(a);
    float s = sin(a);
    return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
  }

  vec3 rotY(vec3 v, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
  }

  void main() {
    vUv = uv;
    float t = clamp((uT - aDelay) / (1.0 - aDelay), 0.0, 1.0);
    // Out, then home: the burst peaks early and is gone by the time the shards land.
    float burst = sin(3.14159 * min(t / 0.8, 1.0));
    float travel = smoothstep(0.15, 1.0, t);
    vBurst = burst;
    vec3 offset = rotateAxis(aOffset, normalize(aSpin.xyz + vec3(1e-4)), aSpin.w * burst);
    vec3 local = aCentroid + offset + aVelocity * burst * 1.6;
    local.z += uFront;
    float yaw = mix(uYawFrom, uYawTo, travel);
    vec3 base = mix(uFrom, uTo, travel) + vec3(0.0, sin(3.14159 * travel) * uLift, 0.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(base + rotY(local, yaw), 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform sampler2D uNext;
  uniform float uT;
  uniform float uFade;
  uniform vec3 uFire;
  varying vec2 vUv;
  varying float vBurst;
  void main() {
    vec3 from = texture2D(uMap, vUv).rgb;
    vec3 to = texture2D(uNext, vUv).rgb;
    vec3 color = mix(from, to, smoothstep(0.65, 1.0, uT)) + uFire * vBurst * 0.25;
    gl_FragColor = vec4(color, uFade);
    #include <colorspace_fragment>
  }
`;

function buildShards(seed) {
  const w = SLAB_SIZE.width - 0.3;
  const h = SLAB_SIZE.height - 0.3;
  const cells = voronoiCells({ count: 34, impact: [0.5, 0.5], seed, aspect: w / h });
  const rand = mulberry32(seed + 303);
  const X = (x) => (x - 0.5) * w;
  const Y = (y) => (0.5 - y) * h;
  const position = [];
  const uv = [];
  const centroid = [];
  const offset = [];
  const velocity = [];
  const spin = [];
  const delay = [];

  for (const { polygon } of cells) {
    if (polygon.length < 3) continue;
    let cx = 0;
    let cy = 0;
    for (const [x, y] of polygon) {
      cx += x;
      cy += y;
    }
    cx /= polygon.length;
    cy /= polygon.length;
    const len = Math.hypot(X(cx), Y(cy)) || 1;
    const vel = [(X(cx) / len) * (0.6 + rand()), (Y(cy) / len) * (0.6 + rand()) + 0.4, 0.8 + rand() * 1.6];
    const axis = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
    const angular = (rand() - 0.5) * 10;
    const wait = rand() * 0.12;
    for (let k = 0; k < polygon.length; k += 1) {
      const a = polygon[k];
      const b = polygon[(k + 1) % polygon.length];
      for (const [x, y] of [[cx, cy], a, b]) {
        position.push(X(x), Y(y), 0);
        uv.push(x, 1 - y);
        centroid.push(X(cx), Y(cy), 0);
        offset.push(X(x) - X(cx), Y(y) - Y(cy), 0);
        velocity.push(...vel);
        spin.push(...axis, angular);
        delay.push(wait);
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setAttribute('aCentroid', new Float32BufferAttribute(centroid, 3));
  geometry.setAttribute('aOffset', new Float32BufferAttribute(offset, 3));
  geometry.setAttribute('aVelocity', new Float32BufferAttribute(velocity, 3));
  geometry.setAttribute('aSpin', new Float32BufferAttribute(spin, 4));
  geometry.setAttribute('aDelay', new Float32BufferAttribute(delay, 1));
  return geometry;
}

export default function SlabShatter({ index, texture, nextTexture, stateRef }) {
  const meshRef = useRef(null);
  const last = index + 1 >= SLAB_COUNT;
  const geometry = useMemo(() => buildShards(11 + index * 17), [index]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uT: { value: 0 },
          uFrom: { value: slabFrame(index, 0, SLAB_Y, 0) },
          uTo: { value: shardTarget(index) },
          uYawFrom: { value: slabYaw(index) },
          uYawTo: { value: last ? slabYaw(index) : slabYaw(index + 1) },
          uLift: { value: last ? 0 : SHARD_LIFT },
          uFront: { value: SLAB_SIZE.depth / 2 + 0.002 },
          uMap: { value: texture },
          uNext: { value: nextTexture ?? texture },
          uFade: { value: 1 },
          uFire: { value: new Color(PALETTE.fire) },
        },
        vertexShader,
        fragmentShader,
        side: DoubleSide,
        transparent: true,
      }),
    [index, last, texture, nextTexture],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const { visible, t } = stateRef.current;
    mesh.visible = visible;
    if (!visible) return;
    material.uniforms.uT.value = t;
    material.uniforms.uFade.value = last ? 1 - Math.min(1, Math.max(0, (t - 0.5) / 0.5)) : 1;
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} matrixAutoUpdate={false} visible={false} />;
}
