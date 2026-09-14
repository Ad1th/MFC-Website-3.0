import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Color, Float32BufferAttribute, ShaderMaterial } from 'three';
import { voronoiCells } from '../shatter/voronoi.js';
import { mulberry32 } from '../fox/rig.js';
import { PALETTE } from '../palette.js';
import { FORM_PANE } from './layout.js';

/**
 * The page that broke in S02, still drifting in orbit: its shards fly back together into one
 * wide pane in front of the planet, the form's backdrop. One draw call: every shard is a fan of
 * triangles around its centre, moved and turned in the vertex shader by its own delay. Edges run
 * hot while the shards fly and cool to a faint seam once the pane is whole.
 * `assembleRef.current` goes 0 (scattered) to 1 (whole). `fitRef.current` ({ position, scale }) moves
 * and stretches the pane onto the form's real box, which stacks tall on a phone.
 */

const VERTEX = /* glsl */ `
  uniform float uAssemble;
  attribute vec3 aCentre;
  attribute vec3 aScatter;
  attribute vec4 aSpin;
  attribute float aEdge;
  varying float vEdge;
  varying float vHeat;

  vec3 rotate(vec3 v, vec3 axis, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
  }

  void main() {
    // Each shard arrives on its own delay (aSpin.w), eased so it settles instead of stopping dead.
    float t = clamp(uAssemble * 1.5 - aSpin.w * 0.5, 0.0, 1.0);
    float e = 1.0 - pow(1.0 - t, 3.0);
    vec3 local = rotate(position - aCentre, normalize(aSpin.xyz), (1.0 - e) * 5.0);
    vec3 world = aCentre + aScatter * (1.0 - e) + local;
    vEdge = aEdge;
    vHeat = 1.0 - e;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uGlass;
  uniform vec3 uFire;
  uniform float uOpacity;
  varying float vEdge;
  varying float vHeat;
  void main() {
    // A line of constant screen width, whatever the shard's size.
    float edge = smoothstep(1.0 - 1.6 * fwidth(vEdge), 1.0, vEdge);
    vec3 color = uGlass + uFire * edge * (0.12 + 1.4 * vHeat);
    gl_FragColor = vec4(color, (0.8 + 0.2 * edge) * uOpacity);
    #include <colorspace_fragment>
  }
`;

const COUNT = 46;

function buildGeometry() {
  const { centre, width, height } = FORM_PANE;
  const cells = voronoiCells({ count: COUNT, impact: [0.5, 0.5], seed: 23, aspect: width / height });
  const rand = mulberry32(91);
  const position = [];
  const aCentre = [];
  const aScatter = [];
  const aSpin = [];
  const aEdge = [];
  const toWorld = ([x, y]) => [centre.x + (x - 0.5) * width, centre.y + (y - 0.5) * height, centre.z];

  cells.forEach(({ polygon }) => {
    if (polygon.length < 3) return;
    const points = polygon.map(toWorld);
    const c = points.reduce((sum, p) => [sum[0] + p[0] / points.length, sum[1] + p[1] / points.length, sum[2] + p[2] / points.length], [0, 0, 0]);
    // Scattered through a shell around the pane, mostly behind and above it, where the orbit is.
    const angle = rand() * Math.PI * 2;
    const reach = 5 + rand() * 9;
    const scatter = [Math.cos(angle) * reach, (rand() - 0.3) * reach * 0.8, -rand() * reach - 2];
    const spin = [rand() - 0.5, rand() - 0.5, rand() - 0.5, rand()];
    points.forEach((p, i) => {
      const q = points[(i + 1) % points.length];
      for (const [v, edge] of [
        [c, 0],
        [p, 1],
        [q, 1],
      ]) {
        position.push(...v);
        aCentre.push(...c);
        aScatter.push(...scatter);
        aSpin.push(...spin);
        aEdge.push(edge);
      }
    });
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.setAttribute('aCentre', new Float32BufferAttribute(aCentre, 3));
  geometry.setAttribute('aScatter', new Float32BufferAttribute(aScatter, 3));
  geometry.setAttribute('aSpin', new Float32BufferAttribute(aSpin, 4));
  geometry.setAttribute('aEdge', new Float32BufferAttribute(aEdge, 1));
  return geometry;
}

/** @param {{ assembleRef: { current: number }, opacityRef: { current: number }, fitRef: { current: null|{ position: import('three').Vector3, scale: import('three').Vector3 } } }} props */
export default function Shards({ assembleRef, opacityRef, fitRef }) {
  const meshRef = useRef(null);
  const geometry = useMemo(buildGeometry, []);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uAssemble: { value: 0 },
          uOpacity: { value: 1 },
          uGlass: { value: new Color('#0d0a09') },
          uFire: { value: new Color(PALETTE.fire) },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
      }),
    [],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame(() => {
    material.uniforms.uAssemble.value = assembleRef.current;
    material.uniforms.uOpacity.value = opacityRef.current;
    const fit = fitRef.current;
    if (fit && meshRef.current) {
      meshRef.current.position.copy(fit.position);
      meshRef.current.scale.copy(fit.scale);
    }
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} renderOrder={5} />;
}
