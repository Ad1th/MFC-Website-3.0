import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
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

/** Centre and radius of the logo's bounds on the floor plane, for the reveal framing. */
export const LOGO_BOUNDS = (() => {
  const xs = LOGO_POINTS.map((v) => v.x);
  const zs = LOGO_POINTS.map((v) => v.z);
  const centre = new Vector3((Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2);
  const radius = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) / 2;
  return { centre, radius };
})();

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

/** A thread along the logo path from node t0 to node t1 (wrapping past 1), sagging between them. */
function threadGeometry(t0, t1) {
  const span = t1 > t0 ? t1 - t0 : 1 - t0 + t1;
  const segments = Math.max(THREAD_SEGMENTS, Math.round(span * 160));
  const positions = [];
  const ts = [];
  const p = new Vector3();
  for (let i = 0; i <= segments; i += 1) {
    const s = i / segments;
    let t = t0 + span * s;
    if (t > 1) t -= 1;
    pathAt(t, p);
    // Parabolic sag between the two nodes (a close stand-in for a catenary at this slack).
    p.y -= SAG * 4 * s * (1 - s);
    positions.push(p.x, p.y, p.z);
    ts.push(s);
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

  // Threads run the logo path from each node to the next, so the web itself is the logo and the
  // pull-back reveals it. (Straight node-to-node threads read as a zigzag.)
  const threads = useMemo(
    () =>
      NODE_T.map((t, i) => {
        const next = NODE_T[(i + 1) % NODE_T.length];
        return {
          geometry: threadGeometry(t, next),
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
      nodes.forEach((n) => n.label.texture.dispose());
    },
    [threads, nodes],
  );

  const lastT = useRef(0);
  const pluckStart = useRef(NODES.map(() => -Infinity));

  useFrame((state) => {
    const p = progressRef.current;
    const runT = window01(p, 0.05, 0.75);
    const now = state.clock.elapsedTime;

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
          <Billboard position={[0, 0.9, 0]}>
            <mesh frustumCulled={false}>
              <planeGeometry args={[0.55 * node.label.aspect, 0.55]} />
              <shaderMaterial args={[node.text]} transparent depthWrite={false} blending={AdditiveBlending} />
            </mesh>
          </Billboard>
        </group>
      ))}
    </group>
  );
}
