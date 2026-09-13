import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Vector3 } from 'three';
import logo from '../world/Rooms/logoPath.json';
import { domains } from '../../content/index.js';
import { PALETTE } from '../palette.js';
import { pluck, WEB_NOTES } from '../../live/sound.js';
import { FILM_FREEZE } from '../testHooks.js';
import { LABEL_FRAGMENT, PLANE_VERTEX, clamp01, ease, textTexture, window01 } from './labels.js';

/**
 * ROOM THREE: MANAGEMENT, "THE WEB" (S05). Darkness and a constellation of five nodes joined by
 * threads that sag like strings. The fox runs the threads; the path it runs is the MFC logo's
 * outline (traced once into logoPath.json), laid flat so the camera's pull-back reveals it.
 * Touching a node plucks its threads (a damped wave along the string) and, with sound on,
 * plays its note; the five notes C, E, G, B, D make one chord.
 *
 * Everything positional is a pure function of the room's progress; plucks are fired on the
 * frame the fox crosses a node and ring out over real time.
 */

export const WEB_SIZE = 9;
const SAG = 0.35;
const THREAD_SEGMENTS = 24;
const NOTE_ORDER = ['C', 'E', 'G', 'B', 'D'];

/** Logo outline points in room space (x, z on the floor plane, y up), closed. */
export const LOGO_POINTS = (() => {
  const pts = logo.points.map(([x, y]) => new Vector3(x * WEB_SIZE, 0, -y * WEB_SIZE));
  pts.push(pts[0].clone());
  return pts;
})();

const cumulative = (() => {
  const out = [0];
  for (let i = 1; i < LOGO_POINTS.length; i += 1) out.push(out[i - 1] + LOGO_POINTS[i].distanceTo(LOGO_POINTS[i - 1]));
  return out;
})();
const TOTAL_LENGTH = cumulative[cumulative.length - 1];

/** A point along the logo path at t in [0, 1], and its direction. */
export function pathAt(t, outPoint, outDir) {
  const target = clamp01(t) * TOTAL_LENGTH;
  let i = 1;
  while (i < cumulative.length - 1 && cumulative[i] < target) i += 1;
  const a = LOGO_POINTS[i - 1];
  const b = LOGO_POINTS[i];
  const span = cumulative[i] - cumulative[i - 1] || 1;
  const f = (target - cumulative[i - 1]) / span;
  outPoint.lerpVectors(a, b, f);
  if (outDir) outDir.subVectors(b, a).normalize();
  return outPoint;
}

/** The five nodes sit at evenly spaced distances along the path; their thread spans join them. */
export const NODE_T = [0.04, 0.24, 0.44, 0.64, 0.84];
export const NODES = NODE_T.map((t) => pathAt(t, new Vector3()));

const THREAD_VERTEX = /* glsl */ `
  attribute float aT;
  uniform float uPluckTime;
  uniform float uAmplitude;
  varying float vT;
  void main() {
    vT = aT;
    vec3 p = position;
    // The string's shape: a sag at rest, plus a damped standing wave after a pluck.
    float wave = sin(3.14159 * aT) * sin(aT * 18.0 - uPluckTime * 22.0) * uAmplitude * exp(-uPluckTime * 3.0);
    p.y += wave;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const THREAD_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uLit;
  varying float vT;
  void main() {
    gl_FragColor = vec4(uColor * (0.25 + 1.4 * uLit), 1.0);
    #include <colorspace_fragment>
  }
`;

const NODE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uLit;
  varying vec2 vUv;
  void main() {
    vec2 c = vUv - 0.5;
    float d = dot(c, c);
    float core = exp(-d * 120.0);
    float halo = exp(-d * 18.0) * (0.2 + 0.8 * uLit);
    gl_FragColor = vec4(uColor * (core * 2.0 + halo), 1.0);
    #include <colorspace_fragment>
  }
`;

function threadGeometry(a, b) {
  const positions = [];
  const ts = [];
  for (let i = 0; i <= THREAD_SEGMENTS; i += 1) {
    const t = i / THREAD_SEGMENTS;
    const p = new Vector3().lerpVectors(a, b, t);
    // Parabolic sag (a close stand-in for a catenary at this slack).
    p.y -= SAG * 4 * t * (1 - t) * Math.min(1, a.distanceTo(b) / 4);
    positions.push(p.x, p.y, p.z);
    ts.push(t);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('aT', new Float32BufferAttribute(ts, 1));
  return g;
}

/**
 * @param {{ progressRef: { current: number }, origin: Vector3 }} props
 */
export default function WebRoom({ progressRef, origin }) {
  const subs = useMemo(() => domains.find((d) => d.key === 'management')?.subs ?? [], []);

  // Threads: the logo path between consecutive nodes, drawn as sagging strings; plus the faint
  // full outline so the pull-back reveals the logo.
  const threads = useMemo(
    () =>
      NODES.map((node, i) => {
        const next = NODES[(i + 1) % NODES.length];
        return {
          geometry: threadGeometry(node, next),
          material: {
            uniforms: { uColor: { value: new Color(PALETTE.ember) }, uLit: { value: 0 }, uPluckTime: { value: 10 }, uAmplitude: { value: 0.18 } },
            vertexShader: THREAD_VERTEX,
            fragmentShader: THREAD_FRAGMENT,
          },
          plucked: -1,
        };
      }),
    [],
  );

  const outline = useMemo(() => {
    const g = new BufferGeometry().setFromPoints(LOGO_POINTS);
    const ts = LOGO_POINTS.map((_, i) => cumulative[i] / TOTAL_LENGTH);
    g.setAttribute('aT', new Float32BufferAttribute(ts, 1));
    return {
      geometry: g,
      material: {
        uniforms: { uColor: { value: new Color(PALETTE.fire) }, uDrawn: { value: 0 } },
        vertexShader: `attribute float aT; varying float vT; void main() { vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform vec3 uColor; uniform float uDrawn; varying float vT; void main() { if (vT > uDrawn) discard; gl_FragColor = vec4(uColor * 1.4, 1.0); #include <colorspace_fragment> }`,
      },
    };
  }, []);

  const nodes = useMemo(
    () =>
      NODES.map((position, i) => {
        const label = textTexture(subs[i] ?? '', { size: 64 });
        return {
          position,
          label,
          dot: { uniforms: { uColor: { value: new Color(PALETTE.ember) }, uLit: { value: 0 } }, vertexShader: PLANE_VERTEX, fragmentShader: NODE_FRAGMENT },
          text: { uniforms: { uMap: { value: label.texture }, uColor: { value: new Color(PALETTE.ash) }, uOpacity: { value: 0 } }, vertexShader: PLANE_VERTEX, fragmentShader: LABEL_FRAGMENT },
        };
      }),
    [subs],
  );

  useEffect(
    () => () => {
      threads.forEach((t) => t.geometry.dispose());
      outline.geometry.dispose();
      nodes.forEach((n) => n.label.texture.dispose());
    },
    [threads, outline, nodes],
  );

  const lastT = useRef(0);
  const pluckStart = useRef(NODES.map(() => -Infinity));

  useFrame((state) => {
    const p = progressRef.current;
    const runT = window01(p, 0.05, 0.75);
    const now = state.clock.elapsedTime;
    outline.material.uniforms.uDrawn.value = runT;

    NODE_T.forEach((t, i) => {
      const reached = runT >= t;
      // Pluck on the frame the fox crosses the node, in either scroll direction.
      if (!FILM_FREEZE && (lastT.current < t) !== (runT < t) && p > 0 && p < 1) {
        pluckStart.current[i] = now;
        if (runT >= t) pluck(WEB_NOTES[NOTE_ORDER[i]]);
      }
      const since = now - pluckStart.current[i];
      const node = nodes[i];
      node.dot.uniforms.uLit.value = reached ? Math.max(0.35, Math.exp(-since * 2)) : 0;
      // Labels stay once lit, so each reads for the rest of the room (well over 600 ms).
      node.text.uniforms.uOpacity.value = ease(window01(runT, t - 0.02, t + 0.03));
      const thread = threads[i];
      thread.material.uniforms.uLit.value = reached ? 1 : 0;
      thread.material.uniforms.uPluckTime.value = FILM_FREEZE ? 10 : Math.min(10, since);
    });
    lastT.current = runT;
  });

  return (
    <group position={origin}>
      <line geometry={outline.geometry} frustumCulled={false}>
        <shaderMaterial args={[outline.material]} transparent depthWrite={false} blending={AdditiveBlending} />
      </line>
      {threads.map((thread, i) => (
        <line key={`t${i}`} geometry={thread.geometry} frustumCulled={false}>
          <shaderMaterial args={[thread.material]} transparent depthWrite={false} blending={AdditiveBlending} />
        </line>
      ))}
      {nodes.map((node, i) => (
        <group key={`n${i}`} position={node.position}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
            <planeGeometry args={[1.4, 1.4]} />
            <shaderMaterial args={[node.dot]} transparent depthWrite={false} blending={AdditiveBlending} />
          </mesh>
          <mesh position={[0, 0.9, 0]} frustumCulled={false}>
            <planeGeometry args={[0.55 * node.label.aspect, 0.55]} />
            <shaderMaterial args={[node.text]} transparent depthWrite={false} blending={AdditiveBlending} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
