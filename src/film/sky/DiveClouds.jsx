import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Cloud, Clouds } from '@react-three/drei';
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, MeshLambertMaterial, ShaderMaterial } from 'three';
import { TIERS } from '../quality.js';
import { mulberry32 } from '../fox/rig.js';
import { FILM_FREEZE } from '../testHooks.js';

/**
 * S03's cloud layers, shaped by the live Vellore weather (weather.js conditions).
 *   clear          moonlit cloud tops, thin
 *   cloudy, fog    denser grey layers, dim moon
 *   drizzle, rain  dark layers and rain streaks moving up past the lens
 *   storm          darkest layers, lightning flashing inside them, heavy rain
 * No weather (fetch failed): the clear look, which claims nothing about the sky.
 * Layer count follows the quality tier (TIERS[tier].clouds). The puff texture is local.
 */

export const CLOUD_LOOK = {
  clear: { color: '#b9c4d8', opacity: 0.55, moon: 1.1, lightning: false, rain: 0 },
  cloudy: { color: '#8c929c', opacity: 0.75, moon: 0.45, lightning: false, rain: 0 },
  fog: { color: '#a3a8ad', opacity: 0.85, moon: 0.3, lightning: false, rain: 0 },
  drizzle: { color: '#7b828d', opacity: 0.8, moon: 0.25, lightning: false, rain: 0.35 },
  rain: { color: '#626975', opacity: 0.85, moon: 0.15, lightning: false, rain: 0.8 },
  storm: { color: '#474d58', opacity: 0.9, moon: 0.06, lightning: true, rain: 1 },
};

/** @param {null|{ condition: string }} weather */
export function lookFor(weather) {
  return CLOUD_LOOK[weather?.condition] ?? CLOUD_LOOK.clear;
}

function Lightning({ layers }) {
  const lights = useRef([]);
  const rand = useMemo(() => mulberry32(99), []);
  const timers = useRef(layers.map(() => ({ next: 1 + rand() * 3, flash: 0 })));

  useFrame((_, delta) => {
    timers.current.forEach((timer, i) => {
      if (FILM_FREEZE) {
        timer.flash = 0;
      } else {
        timer.next -= delta;
        if (timer.next <= 0) {
          timer.flash = 1;
          timer.next = 1.5 + rand() * 4;
        }
        timer.flash = Math.max(0, timer.flash - delta * 6);
      }
      const light = lights.current[i];
      // A flash with a flicker in it, like a real strike.
      if (light) light.intensity = 900 * timer.flash * (0.6 + 0.4 * Math.sin(timer.flash * 40));
    });
  });

  return layers.map((layer, i) => (
    <pointLight
      key={layer.y}
      ref={(el) => {
        lights.current[i] = el;
      }}
      position={[(i - 1) * 18, layer.y + 1, -10 - i * 8]}
      color="#dfe8ff"
      distance={90}
      decay={2}
      intensity={0}
    />
  ));
}

/**
 * @param {{ layers: { y: number, seed: number }[], tier: number, weather: null|object, origin: import('three').Vector3 }} props
 */
export default function DiveClouds({ layers, tier, weather, origin }) {
  const look = lookFor(weather);
  const count = Math.max(1, TIERS[tier]?.clouds ?? 2);
  // Dense enough around the fox's path that the camera beside it is framed by cloud.
  const segments = tier >= 3 ? 40 : tier === 2 ? 28 : 14;
  const shown = layers.slice(0, count);

  return (
    <group position={origin}>
      <directionalLight position={[-40, 160, 30]} intensity={look.moon} color="#cdd8ff" />
      <Clouds material={MeshLambertMaterial} texture="/textures/cloud.png" limit={segments * shown.length + 10} frustumCulled={false}>
        {shown.map((layer) => (
          <Cloud
            key={layer.y}
            seed={layer.seed}
            segments={segments}
            bounds={[34, 6, 34]}
            volume={16}
            position={[0, layer.y, layer.z ?? 0]}
            color={look.color}
            opacity={look.opacity}
            speed={FILM_FREEZE ? 0 : 0.1}
            growth={4}
            fade={30}
          />
        ))}
      </Clouds>
      {look.lightning ? <Lightning layers={shown} /> : null}
    </group>
  );
}

const RAIN_VERTEX = /* glsl */ `
  uniform float uTime;
  attribute float aEnd;
  varying float vEnd;
  void main() {
    vEnd = aEnd;
    vec3 p = position;
    // Streaks rise past the lens: the camera is falling faster than the rain.
    p.y = mod(p.y + uTime * 45.0, 40.0) - 20.0 + aEnd * 1.8;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const RAIN_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  varying float vEnd;
  void main() {
    gl_FragColor = vec4(uColor * uAlpha * (0.25 + 0.75 * vEnd), 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * Rain streaks in a box that travels with the camera, visible between `from` and `to` of
 * the scene's progress and scaled by `amount` (0 means no rain at all).
 */
export function RainStreaks({ amount, progressRef, from, to, count = 1200 }) {
  const { geometry, material } = useMemo(() => {
    const rand = mulberry32(21);
    const position = [];
    const end = [];
    for (let i = 0; i < count; i += 1) {
      const x = (rand() - 0.5) * 40;
      const y = (rand() - 0.5) * 40;
      const z = (rand() - 0.5) * 40;
      position.push(x, y, z, x, y, z);
      end.push(0, 1);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(position, 3));
    g.setAttribute('aEnd', new Float32BufferAttribute(end, 1));
    const m = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new Color('#9fb0c2') }, uAlpha: { value: 0 } },
      vertexShader: RAIN_VERTEX,
      fragmentShader: RAIN_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    return { geometry: g, material: m };
  }, [count]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const meshRef = useRef(null);
  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const p = progressRef.current;
    const inside = Math.min(Math.max((p - from) / 0.03, 0), 1) * (1 - Math.min(Math.max((p - to) / 0.03, 0), 1));
    const alpha = amount * inside;
    mesh.visible = alpha > 0.001;
    if (!mesh.visible) return;
    mesh.position.copy(state.camera.position);
    material.uniforms.uAlpha.value = alpha;
    if (!FILM_FREEZE) material.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return <lineSegments ref={meshRef} geometry={geometry} material={material} frustumCulled={false} visible={false} />;
}
