import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BufferGeometry,
  CanvasTexture,
  CustomBlending,
  DoubleSide,
  Float32BufferAttribute,
  NearestFilter,
  NoColorSpace,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
} from 'three';
import { voronoiCells } from './voronoi.js';
import { mulberry32 } from '../fox/rig.js';
import { getHeroCanvas, heroVersion, onHeroChange } from '../../dom/hero/heroSurface.js';

/**
 * The page as glass. Every Voronoi cell of the hero canvas becomes a flat shard, all in
 * one draw call. Shards sit in camera space on a plane exactly filling the view, so at
 * t = 0 each texel lands on its own screen pixel: the frame is identical to the DOM
 * canvas it replaces. Motion is a pure function of `stateRef.current.t`, so scrolling
 * back reassembles the page. Reused by S10 to reassemble the shards into the form.
 *
 * stateRef.current = { intact: boolean, t: number, visible: boolean }
 *   intact  draw the page as one full-screen quad of the same texture and material
 *   t       seconds of flight for the shards (0 = every shard in place)
 * The intact quad and the shard mesh at t = 0 go through the same material, so the
 * swap between them is exact unless the Voronoi tiling cracks or overlaps.
 */

const vertexShader = /* glsl */ `
  uniform float uT;
  uniform vec2 uSize;
  uniform float uDistance;
  attribute vec3 aCentroid;
  attribute vec3 aOffset;
  attribute vec3 aVelocity;
  attribute vec4 aSpin;
  attribute float aDelay;
  varying vec2 vUv;

  vec3 rotateAxis(vec3 v, vec3 k, float a) {
    float c = cos(a);
    float s = sin(a);
    return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
  }

  void main() {
    vUv = uv;
    float t = max(0.0, uT - aDelay);
    vec3 offset = aOffset * vec3(uSize, 1.0);
    offset = rotateAxis(offset, normalize(aSpin.xyz), aSpin.w * t);
    vec3 centre = aCentroid * vec3(uSize, 1.0) + aVelocity * t + vec3(0.0, -0.3, 0.8) * t * t;
    vec3 p = centre + offset;
    p.z -= uDistance;
    // Camera space: the renderer sets projectionMatrix from this frame's camera, so the
    // plane is screen aligned wherever the camera is, with no stale world matrix.
    gl_Position = projectionMatrix * vec4(p, 1.0);
  }
`;

// No colour-space or tone-mapping chunks: the texel goes to the screen untouched.
const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  varying vec2 vUv;
  void main() {
    gl_FragColor = texture2D(uMap, vUv);
  }
`;

const DISTANCE = 1;

function buildShards({ count, impact, seed, aspect }) {
  const cells = voronoiCells({ count, impact, seed, aspect });
  const rand = mulberry32(seed + 101);
  const position = [];
  const uv = [];
  const centroidAttr = [];
  const offsetAttr = [];
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
    // Plane space: x right, y up, unit square centred on the origin.
    const px = (x) => x - 0.5;
    const py = (y) => 0.5 - y;
    const dx = (cx - impact[0]) * aspect;
    const dy = cy - impact[1];
    const dist = Math.hypot(dx, dy);
    const dirX = dist > 1e-4 ? dx / dist : rand() - 0.5;
    const dirY = dist > 1e-4 ? dy / dist : rand() - 0.5;
    const speed = 0.35 + rand() * 0.9;
    const vel = [dirX * speed * 0.6, -dirY * speed * 0.6, 0.5 + rand() * 1.4];
    const axis = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
    const angular = (rand() - 0.5) * 9;
    const wait = dist * 0.35;

    for (let k = 0; k < polygon.length; k += 1) {
      const a = polygon[k];
      const b = polygon[(k + 1) % polygon.length];
      for (const [x, y] of [[cx, cy], a, b]) {
        position.push(px(x), py(y), 0);
        uv.push(x, 1 - y);
        centroidAttr.push(px(cx), py(cy), 0);
        offsetAttr.push(px(x) - px(cx), py(y) - py(cy), 0);
        velocity.push(...vel);
        spin.push(...axis, angular);
        delay.push(wait);
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setAttribute('aCentroid', new Float32BufferAttribute(centroidAttr, 3));
  geometry.setAttribute('aOffset', new Float32BufferAttribute(offsetAttr, 3));
  geometry.setAttribute('aVelocity', new Float32BufferAttribute(velocity, 3));
  geometry.setAttribute('aSpin', new Float32BufferAttribute(spin, 4));
  geometry.setAttribute('aDelay', new Float32BufferAttribute(delay, 1));
  return { geometry, shardCount: cells.length };
}

/** Two triangles over the whole plane, with the same attributes as a shard at rest. */
function buildIntact() {
  const corners = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 0],
    [1, 1],
    [0, 1],
  ];
  const position = [];
  const uv = [];
  for (const [x, y] of corners) {
    position.push(x - 0.5, 0.5 - y, 0);
    uv.push(x, 1 - y);
  }
  const zeros = (size) => new Float32BufferAttribute(new Float32Array(corners.length * size), size);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setAttribute('aCentroid', new Float32BufferAttribute(position, 3));
  geometry.setAttribute('aOffset', zeros(3));
  geometry.setAttribute('aVelocity', zeros(3));
  const spin = new Float32Array(corners.length * 4);
  for (let i = 0; i < corners.length; i += 1) spin[i * 4] = 1;
  geometry.setAttribute('aSpin', new Float32BufferAttribute(spin, 4));
  geometry.setAttribute('aDelay', zeros(1));
  return geometry;
}

export default function Shatter({ stateRef, count = 60, impact = [0.5, 0.45], seed = 7 }) {
  const { camera, size } = useThree();
  const meshRef = useRef(null);
  const intactRef = useRef(null);
  const aspect = size.width / size.height;

  const { geometry } = useMemo(() => buildShards({ count, impact, seed, aspect }), [count, impact, seed, aspect]);
  const intactGeometry = useMemo(() => buildIntact(), []);

  const texture = useMemo(() => {
    const t = new CanvasTexture(document.createElement('canvas'));
    t.colorSpace = NoColorSpace;
    t.minFilter = NearestFilter;
    t.magFilter = NearestFilter;
    t.generateMipmaps = false;
    t.premultiplyAlpha = true;
    return t;
  }, []);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uT: { value: 0 }, uSize: { value: [1, 1] }, uDistance: { value: DISTANCE }, uMap: { value: texture } },
        vertexShader,
        fragmentShader,
        // Shards tumble, so both faces show (and the clipped cells wind clockwise).
        side: DoubleSide,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor,
      }),
    [texture],
  );

  useEffect(() => {
    let uploaded = -1;
    const sync = () => {
      const canvas = getHeroCanvas();
      if (!canvas) return;
      if (texture.image !== canvas) texture.image = canvas;
      if (uploaded !== heroVersion()) {
        uploaded = heroVersion();
        texture.needsUpdate = true;
      }
    };
    sync();
    return onHeroChange(sync);
  }, [texture]);

  useEffect(
    () => () => {
      geometry.dispose();
      intactGeometry.dispose();
      material.dispose();
      texture.dispose();
    },
    [geometry, intactGeometry, material, texture],
  );

  useFrame(() => {
    const mesh = meshRef.current;
    const intactMesh = intactRef.current;
    if (!mesh || !intactMesh) return;
    const { intact, t, visible } = stateRef.current;
    mesh.visible = visible && !intact;
    intactMesh.visible = visible && intact;
    if (!visible) return;
    const height = 2 * DISTANCE * Math.tan((camera.fov * Math.PI) / 360);
    material.uniforms.uSize.value = [height * camera.aspect, height];
    material.uniforms.uT.value = t;
  });

  return (
    <>
      <mesh ref={intactRef} geometry={intactGeometry} material={material} matrixAutoUpdate={false} frustumCulled={false} renderOrder={1000} />
      <mesh ref={meshRef} geometry={geometry} material={material} matrixAutoUpdate={false} frustumCulled={false} renderOrder={1000} />
    </>
  );
}
