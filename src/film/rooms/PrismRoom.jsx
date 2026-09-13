import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshTransmissionMaterial } from '@react-three/drei';
import { AdditiveBlending, Color, Matrix4, Quaternion, Vector3 } from 'three';
import Fox from '../fox/Fox.jsx';
import { getFox } from '../actors/foxShots.js';
import { FILM_FREEZE } from '../testHooks.js';
import { domains } from '../../content/index.js';
import { PLANE_VERTEX, clamp01, ease, textTexture, window01 } from './labels.js';

/**
 * ROOM TWO: DESIGN, "THE PRISM" (S05). A white void and a glass prism the size of a building,
 * refracting with dispersion. The fox runs into it and splits into three foxes, red, green and
 * blue, which run to three walls and each paint a discipline in one brush stroke of its colour.
 * They run back and fuse into one orange fox; the flash whites out the room. Blue is always half
 * a second late: it skids in after the other two have merged, bumps the fused fox and is
 * absorbed with a small extra puff.
 *
 * The room owns the three tinted foxes; the film's fox is the fused one (S05 hides it while
 * the colours are apart). Every position is a pure function of the room's progress.
 */

export const PRISM_CENTRE = new Vector3(0, 0, -12);
const WALL_DISTANCE = 11;
/** Red, green and blue run to left, back and right walls. */
const SPLITS = [
  { name: 'red', tint: '#ff3b2f', dir: new Vector3(-1, 0, 0.15).normalize(), sub: 0 },
  { name: 'green', tint: '#34e07a', dir: new Vector3(0, 0, -1), sub: 1 },
  { name: 'blue', tint: '#3d7bff', dir: new Vector3(1, 0, 0.15).normalize(), sub: 2 },
];

/** Beats inside the room (0 to 1). Blue's return lags the others by LATE. */
export const PRISM_BEATS = {
  enter: [0, 0.18],
  split: 0.18,
  out: [0.18, 0.42],
  paint: [0.36, 0.56],
  back: [0.56, 0.76],
  fuse: 0.76,
  late: 0.055,
  flash: [0.74, 0.86],
};

const basis = new Matrix4();
const up = new Vector3(0, 1, 0);

function faceAlong(dir, out) {
  const side = new Vector3().crossVectors(up, dir).normalize();
  basis.makeBasis(side, up, dir);
  return out.setFromRotationMatrix(basis);
}

/** Where a split fox is at room progress p (world-relative to the room origin). */
export function splitPosition(split, p, out) {
  const outT = ease(window01(p, PRISM_BEATS.out[0], PRISM_BEATS.out[1]));
  const lateBy = split.name === 'blue' ? PRISM_BEATS.late : 0;
  const backT = ease(window01(p, PRISM_BEATS.back[0] + lateBy, PRISM_BEATS.back[1] + lateBy));
  const reach = outT * (1 - backT) * WALL_DISTANCE;
  return out.copy(PRISM_CENTRE).addScaledVector(split.dir, reach);
}

const STROKE_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uReveal;
  varying vec2 vUv;
  void main() {
    float a = texture2D(uMap, vUv).a;
    // One brush stroke, left to right, with a ragged bristle edge.
    float bristle = sin(vUv.y * 90.0) * 0.012 + sin(vUv.y * 37.0) * 0.02;
    float painted = 1.0 - smoothstep(uReveal - 0.04, uReveal, vUv.x + bristle);
    gl_FragColor = vec4(uColor, a * painted);
    #include <colorspace_fragment>
  }
`;

const FLASH_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  void main() {
    gl_FragColor = vec4(vec3(1.0), uOpacity);
    #include <colorspace_fragment>
  }
`;

const FLASH_VERTEX = /* glsl */ `
  uniform vec2 uSize;
  void main() {
    gl_Position = projectionMatrix * vec4(position.xy * uSize, -1.0, 1.0);
  }
`;

function SplitFox({ split, progressRef, origin }) {
  const groupRef = useRef(null);
  const input = useRef({
    velocity: 900,
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
  });
  const position = useMemo(() => new Vector3(), []);
  const quaternion = useMemo(() => new Quaternion(), []);
  const anchor = useMemo(() => ({ position, quaternion, scale: 0.4, visible: true }), [position, quaternion]);

  useFrame(() => {
    const p = progressRef.current;
    const apart = p > PRISM_BEATS.split && p < PRISM_BEATS.fuse + (split.name === 'blue' ? PRISM_BEATS.late + 0.02 : 0);
    if (groupRef.current) groupRef.current.visible = apart;
    if (!apart) return;
    splitPosition(split, p, position).add(origin);
    const returning = p > PRISM_BEATS.paint[1];
    faceAlong(returning ? split.dir.clone().negate() : split.dir, quaternion);
    // Stand still while painting; blue skids when it arrives late.
    input.current.velocity = p > PRISM_BEATS.out[1] - 0.02 && p < PRISM_BEATS.back[0] ? 0 : 1100;
  });

  return (
    <group ref={groupRef} visible={false}>
      <Suspense fallback={null}>
        <Fox approach="C" tier={1} input={input} trail={false} anchor={anchor} tint={split.tint} />
      </Suspense>
    </group>
  );
}

/**
 * @param {{ progressRef: { current: number }, origin: Vector3, tier: number }} props
 */
export default function PrismRoom({ progressRef, origin, tier }) {
  const subs = useMemo(() => domains.find((d) => d.key === 'design')?.subs ?? [], []);
  const strokes = useMemo(
    () =>
      SPLITS.map((split) => {
        const label = textTexture(subs[split.sub] ?? '', { font: '"Mozilla Headline", "Zilla Slab", Georgia, serif', weight: 600, size: 140 });
        const wallPoint = new Vector3().copy(PRISM_CENTRE).addScaledVector(split.dir, WALL_DISTANCE + 2.2).setY(2.2);
        const q = faceAlong(split.dir.clone().negate(), new Quaternion());
        return {
          label,
          wallPoint,
          q,
          material: {
            uniforms: { uMap: { value: label.texture }, uColor: { value: new Color(split.tint) }, uReveal: { value: 0 } },
            vertexShader: PLANE_VERTEX,
            fragmentShader: STROKE_FRAGMENT,
          },
        };
      }),
    [subs],
  );
  useEffect(() => () => strokes.forEach((s) => s.label.texture.dispose()), [strokes]);

  const flashRef = useRef(null);
  const lastP = useRef(0);
  const flash = useMemo(
    () => ({ uniforms: { uOpacity: { value: 0 }, uSize: { value: [1, 1] } }, vertexShader: FLASH_VERTEX, fragmentShader: FLASH_FRAGMENT }),
    [],
  );

  useFrame((state) => {
    const p = progressRef.current;
    // Blue arrives late: it bumps the fused fox (a small jolt through the spine) and is absorbed
    // with an extra puff of sparks. Once, on the frame the scroll crosses its arrival.
    const BLUE_ARRIVES = PRISM_BEATS.fuse + PRISM_BEATS.late;
    if (!FILM_FREEZE && lastP.current < BLUE_ARRIVES && p >= BLUE_ARRIVES) {
      const fox = getFox();
      fox?.trigger('jolt', {}, { force: true });
      fox?.emitSparks?.({ count: 22, speed: 1.1, spread: 1, ring: true });
    }
    lastP.current = p;
    strokes.forEach((stroke) => {
      stroke.material.uniforms.uReveal.value = 1.05 * ease(window01(p, PRISM_BEATS.paint[0], PRISM_BEATS.paint[1]));
    });
    const f = flashRef.current;
    if (f) {
      const [a, b] = PRISM_BEATS.flash;
      const mid = (a + b) / 2;
      const o = p < mid ? window01(p, a, mid) : 1 - window01(p, mid, b);
      f.visible = o > 0.001;
      flash.uniforms.uOpacity.value = clamp01(o) * 0.95;
      const camera = state.camera;
      const height = 2 * Math.tan((camera.fov * Math.PI) / 360) * 1.3;
      flash.uniforms.uSize.value = [height * camera.aspect, height];
    }
  });

  const samples = tier >= 3 ? 8 : tier === 2 ? 4 : 2;
  return (
    <group position={origin}>
      <mesh position={[PRISM_CENTRE.x, 7, PRISM_CENTRE.z]} rotation={[0, Math.PI / 6, 0]}>
        <cylinderGeometry args={[3.2, 3.2, 14, 3, 1]} />
        <MeshTransmissionMaterial
          samples={samples}
          resolution={tier >= 3 ? 1024 : 512}
          thickness={3}
          chromaticAberration={1}
          anisotropy={0.3}
          distortion={0.2}
          distortionScale={0.5}
          ior={1.5}
          roughness={0.02}
          color="#ffffff"
          background={new Color('#f4f2ef')}
        />
      </mesh>
      {strokes.map((stroke, i) => (
        <mesh key={i} position={stroke.wallPoint} quaternion={stroke.q} frustumCulled={false}>
          <planeGeometry args={[1.3 * stroke.label.aspect, 1.3]} />
          <shaderMaterial args={[stroke.material]} transparent depthWrite={false} />
        </mesh>
      ))}
      {SPLITS.map((split) => (
        <SplitFox key={split.name} split={split} progressRef={progressRef} origin={origin} />
      ))}
      <mesh ref={flashRef} visible={false} frustumCulled={false} renderOrder={960}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial args={[flash]} transparent depthTest={false} depthWrite={false} blending={AdditiveBlending} />
      </mesh>
    </group>
  );
}
