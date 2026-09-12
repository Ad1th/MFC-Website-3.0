import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearMipmapLinearFilter,
  Matrix4,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';
import { events } from '../../content/index.js';
import { mulberry32 } from '../fox/rig.js';
import { PALETTE } from '../palette.js';
import { FILM_FREEZE } from '../testHooks.js';

/**
 * The Milky Way of events (S01). The background stars are the real MFC event names:
 * each star is a tiny camera-facing label cut from one text atlas. From the wide shot
 * they read as a faint band of stars; in bullet time the orbiting camera comes close
 * enough to read them. The band is a tilted ring, denser toward its centre line.
 * One draw call. Names come from src/content/events.json, never invented.
 */

const ATLAS_WIDTH = 1024;
const ROW_HEIGHT = 40;

function buildAtlas(names) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = '500 26px "Fira Code", ui-monospace, monospace';
  ctx.font = font;
  const rows = [];
  let x = 0;
  let y = 0;
  const pad = 12;
  for (const name of names) {
    const text = name.toLowerCase();
    const w = Math.ceil(ctx.measureText(text).width) + pad;
    if (x + w > ATLAS_WIDTH) {
      x = 0;
      y += ROW_HEIGHT;
    }
    rows.push({ text, x, y, w });
    x += w;
  }
  canvas.width = ATLAS_WIDTH;
  canvas.height = 2 ** Math.ceil(Math.log2(y + ROW_HEIGHT));
  ctx.font = font;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  for (const r of rows) ctx.fillText(r.text, r.x + pad / 2, r.y + ROW_HEIGHT / 2);
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  const rects = rows.map((r) => ({
    u: r.x / canvas.width,
    v: 1 - (r.y + ROW_HEIGHT) / canvas.height,
    w: r.w / canvas.width,
    h: ROW_HEIGHT / canvas.height,
    aspect: r.w / ROW_HEIGHT,
  }));
  return { texture, rects };
}

const VERTEX = /* glsl */ `
  attribute vec4 aRect;
  attribute vec2 aSizeTwinkle;
  varying vec2 vUv;
  varying float vTwinkle;
  varying float vFade;
  uniform float uTime;
  void main() {
    vUv = aRect.xy + uv * aRect.zw;
    vTwinkle = 0.65 + 0.35 * sin(uTime * (0.6 + aSizeTwinkle.y) + aSizeTwinkle.y * 40.0);
    vec4 centre = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    // Billboard: offset in view space, width from the label's aspect ratio.
    vec2 corner = position.xy * vec2(aSizeTwinkle.x, 1.0) * 0.16;
    vec4 view = centre + vec4(corner, 0.0, 0.0);
    // Far labels melt into star points; near labels become readable.
    vFade = clamp((-centre.z - 4.0) / 40.0, 0.0, 1.0);
    gl_Position = projectionMatrix * view;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vTwinkle;
  varying float vFade;
  void main() {
    float a = texture2D(uAtlas, vUv).a;
    gl_FragColor = vec4(uColor * a * vTwinkle * mix(0.9, 0.35, vFade), 1.0);
    #include <colorspace_fragment>
  }
`;

export default function EventStars({ count = 1400, radius = 70, seed = 11 }) {
  const mesh = useMemo(() => {
    const names = events.map((e) => e.name);
    if (!names.length) return null;
    const { texture, rects } = buildAtlas(names);
    const material = new ShaderMaterial({
      uniforms: { uAtlas: { value: texture }, uColor: { value: new Color(PALETTE.spark) }, uTime: { value: 0 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const instanced = new InstancedMesh(new PlaneGeometry(1, 1), material, count);
    instanced.instanceMatrix.setUsage(DynamicDrawUsage);
    const rand = mulberry32(seed);
    const rectData = new Float32Array(count * 4);
    const sizeData = new Float32Array(count * 2);
    const m = new Matrix4();
    const tilt = new Matrix4().makeRotationZ(0.5).multiply(new Matrix4().makeRotationX(1.1));
    for (let i = 0; i < count; i += 1) {
      const r = rects[i % rects.length];
      const angle = rand() * Math.PI * 2;
      // Gaussian-ish spread across the band.
      const spread = (rand() + rand() + rand() - 1.5) * 0.28;
      const dist = radius * (0.8 + rand() * 0.4);
      m.makeTranslation(Math.cos(angle) * dist, spread * dist, Math.sin(angle) * dist).premultiply(tilt);
      instanced.setMatrixAt(i, m);
      rectData.set([r.u, r.v, r.w, r.h], i * 4);
      sizeData.set([r.aspect, rand()], i * 2);
    }
    instanced.geometry.setAttribute('aRect', new InstancedBufferAttribute(rectData, 4));
    instanced.geometry.setAttribute('aSizeTwinkle', new InstancedBufferAttribute(sizeData, 2));
    instanced.frustumCulled = false;
    instanced.renderOrder = -10;
    return instanced;
  }, [count, radius, seed]);

  useFrame((state) => {
    // Twinkle stops under ?freeze so identical frames stay identical.
    if (mesh && !FILM_FREEZE) mesh.material.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return mesh ? <primitive object={mesh} /> : null;
}
