import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, CatmullRomCurve3, Color, DoubleSide, Quaternion, ShaderMaterial, TubeGeometry, Vector3 } from 'three';
import { film } from '../store.js';
import { registerShot } from '../camera/shots.js';
import { registerFoxShot } from '../actors/foxShots.js';
import { sceneProgressOf } from './progress.js';
import TextTunnel from '../tunnel/TextTunnel.jsx';
import HopRings from '../tunnel/HopRings.jsx';
import { whereAmI } from '../../live/whereami.js';
import { site } from '../../content/index.js';
import { PALETTE } from '../palette.js';
import { FILM_FREEZE } from '../testHooks.js';

/**
 * S04 The Packet. Inside the fibre: the fox is a streak of light racing down a tunnel made of
 * the club's about lines, which light up letter by letter as the packet passes. Traceroute
 * rings flash the route from your timezone's city to Vellore. At the end the tunnel splits in
 * three; the fox slows back into its shape, tilts its head at the left branch, the right, then
 * at you, and the cursor's third picks the order of the rooms in S05.
 *
 * Every pose is a pure function of sceneProgress, so scrolling back reverses the packet and
 * un-reveals the text letter by letter.
 *
 * Beats by sceneProgress:
 *   0.00 to 0.025 arrival flash (hides the change of world after S03's impact)
 *   0.00 to 0.74  the streak runs the tunnel; hops pass; text reveals
 *   0.74 to 0.82  slowing into the junction; the fox reforms
 *   0.82 to 1.00  head tilts: left branch, right branch, the camera; cursor picks the order
 *
 * Photo rings (S04 script): only verified event photos may be shown. None are verified yet
 * (CONTENT_NEEDED), so PHOTOS_VERIFIED is false and the rings are skipped.
 */

export const TUNNEL_ORIGIN = new Vector3(0, -6000, 0);
// Gate for the photo rings (D-065): flip once the event photos are verified.
const PHOTOS_VERIFIED = false;
const RUN_END = 0.74;
const REFORM_END = 0.82;
const TUNNEL_RADIUS = 2.2;
const BRANCH_LENGTH = 26;

const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
const window01 = (p, a, b) => clamp01((p - a) / (b - a));
const ease = (t) => t * t * (3 - 2 * t);

/** The fibre: a long gently winding path along -z. */
export const tunnelCurve = new CatmullRomCurve3(
  [
    [0, 0, 0],
    [3, 1.5, -40],
    [-4, -1, -85],
    [2, 2, -130],
    [-2, 0, -175],
    [0, 0, -210],
  ].map(([x, y, z]) => new Vector3(x, y, z).add(TUNNEL_ORIGIN)),
  false,
  'centripetal',
);

const JUNCTION = tunnelCurve.getPointAt(1);
const JUNCTION_TANGENT = tunnelCurve.getTangentAt(1).normalize();
const WORLD_UP = new Vector3(0, 1, 0);
const JUNCTION_SIDE = new Vector3().crossVectors(JUNCTION_TANGENT, WORLD_UP).normalize();
/** Where the reformed fox stands: on the tunnel floor, a little before the junction. */
const FOX_SPOT = new Vector3().copy(JUNCTION).addScaledVector(JUNCTION_TANGENT, -1.5).addScaledVector(WORLD_UP, -TUNNEL_RADIUS * 0.55);

/** Branch directions at the junction: left, centre, right (as seen facing down the tunnel). */
export const BRANCHES = [-1, 0, 1].map((k) =>
  new Vector3()
    .copy(JUNCTION_TANGENT)
    .addScaledVector(JUNCTION_SIDE, k * 0.75)
    .normalize(),
);

/** Cursor thirds to room order. Left keeps the default (Technical first). */
export const ORDER_BY_THIRD = [
  ['technical', 'design', 'management'],
  ['design', 'management', 'technical'],
  ['management', 'technical', 'design'],
];

/** Where along the tunnel the streak is at a scene progress. */
function runT(p) {
  const run = window01(p, 0, REFORM_END);
  // Fast through the tunnel, easing into the junction.
  return 1 - Math.pow(1 - run, 2.2);
}

const cameraPoint = new Vector3();
const aheadPoint = new Vector3();
const tangent = new Vector3();

/** @type {import('../camera/shots.js').Shot} */
export function packetShot(progress, out, aspect = 16 / 9) {
  const p = clamp01(progress);
  const t = runT(p);
  const lag = 0.035 * (1 - ease(window01(p, RUN_END, REFORM_END)));
  const camT = Math.max(0, t - lag);
  tunnelCurve.getPointAt(camT, cameraPoint);
  tunnelCurve.getPointAt(Math.min(1, camT + 0.02), aheadPoint);
  out.position.copy(cameraPoint).addScaledVector(WORLD_UP, 0.35);
  out.target.copy(aheadPoint);
  out.fov = 62 - 14 * ease(window01(p, RUN_END, REFORM_END));

  // At the junction: a three-quarter front view, so the fox's face and head tilts read and the
  // branch mouths show beyond it. From behind it was a thin tail-on sliver.
  const settle = ease(window01(p, RUN_END, REFORM_END));
  if (settle > 0) {
    tangent.copy(JUNCTION_TANGENT);
    const fit = Math.max(1, 0.8 / aspect);
    const front = new Vector3()
      .copy(FOX_SPOT)
      .addScaledVector(tangent, 1.6 * fit)
      .addScaledVector(JUNCTION_SIDE, 1.2 * fit)
      .addScaledVector(WORLD_UP, 0.55);
    out.position.lerp(front, settle);
    out.target.lerp(new Vector3().copy(FOX_SPOT).addScaledVector(WORLD_UP, 0.18).addScaledVector(tangent, 0.4), settle);
  }
  out.roll = 0;
  // The tunnel is its own world: arriving in it is a cut, hidden by the arrival flash.
  out.cut = 4;
  out.shake = 0.35 * (1 - window01(p, 0.6, RUN_END));
}

/** @type {import('../actors/foxShots.js').FoxShot} */
function packetFoxShot(progress, pose, input, context) {
  const p = clamp01(progress);
  // A streak until the junction; the Fox itself is hidden and the scene draws the streak.
  pose.visible = p >= RUN_END + 0.02;
  pose.cut = 4;
  pose.scale = 0.4;
  pose.position.copy(FOX_SPOT);
  pose.forward.copy(JUNCTION_TANGENT);
  pose.up.copy(WORLD_UP);
  input.hint = p < REFORM_END ? 'run' : null;
  input.velocity = p < REFORM_END ? 900 * (1 - window01(p, RUN_END, REFORM_END)) : 0;

  // Head tilts: the left branch, the right branch, then the camera.
  const lookAt = (point, w) => {
    input.look = point;
    input.lookWeight = w;
  };
  if (p >= REFORM_END) {
    const phase = window01(p, REFORM_END, 1);
    const w = ease(Math.min(1, phase * 6));
    if (phase < 0.33) lookAt(new Vector3().copy(JUNCTION).addScaledVector(BRANCHES[0], 6), w);
    else if (phase < 0.66) lookAt(new Vector3().copy(JUNCTION).addScaledVector(BRANCHES[2], 6), w);
    else lookAt(context.camera.position, w);
  }
}

const STREAK_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const STREAK_FRAGMENT = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uFire;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec2 c = vUv - 0.5;
    // Long along x (the direction of travel), thin across.
    float body = exp(-pow(c.y / 0.12, 2.0)) * smoothstep(0.5, 0.0, abs(c.x)) ;
    float head = exp(-dot(c - vec2(0.35, 0.0), c - vec2(0.35, 0.0)) * 90.0);
    vec3 color = mix(uFire, uCore, head + body * 0.4);
    gl_FragColor = vec4(color * (body + head * 1.8) * uOpacity, 1.0);
    #include <colorspace_fragment>
  }
`;

const FLASH_VERTEX = /* glsl */ `
  uniform vec2 uSize;
  void main() {
    gl_Position = projectionMatrix * vec4(position.xy * uSize, -1.0, 1.0);
  }
`;

const FLASH_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    gl_FragColor = vec4(uColor, uOpacity);
    #include <colorspace_fragment>
  }
`;

const streakPos = new Vector3();
const streakAhead = new Vector3();

const mouthQuaternions = BRANCHES.map((dir) => new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), dir));

function Branches() {
  const geometries = useMemo(
    () =>
      BRANCHES.map((dir) => {
        const curve = new CatmullRomCurve3([
          JUNCTION.clone(),
          JUNCTION.clone().addScaledVector(dir, BRANCH_LENGTH * 0.5),
          JUNCTION.clone().addScaledVector(dir, BRANCH_LENGTH),
        ]);
        return new TubeGeometry(curve, 60, TUNNEL_RADIUS * 0.75, 32, false);
      }),
    [],
  );
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);
  const material = useMemo(
    () => ({
      uniforms: { uColor: { value: new Color('#1a1210') } },
      vertexShader: `varying vec3 vView; void main() { vec4 v = modelViewMatrix * vec4(position, 1.0); vView = v.xyz; gl_Position = projectionMatrix * v; }`,
      fragmentShader: `uniform vec3 uColor; varying vec3 vView; void main() { gl_FragColor = vec4(uColor * exp(-length(vView) * 0.05), 1.0); #include <colorspace_fragment> }`,
    }),
    [],
  );
  return geometries.map((geometry, i) => (
    <group key={i}>
      <mesh geometry={geometry} frustumCulled={false}>
        <shaderMaterial args={[material]} side={DoubleSide} />
      </mesh>
      {/* A fire ring at each branch mouth, so the three ways ahead read from the junction. */}
      <mesh position={JUNCTION.clone().addScaledVector(BRANCHES[i], 1.2)} quaternion={mouthQuaternions[i]} frustumCulled={false}>
        <torusGeometry args={[TUNNEL_RADIUS * 0.75, 0.03, 8, 64]} />
        <meshBasicMaterial color={PALETTE.fire} toneMapped={false} />
      </mesh>
    </group>
  ));
}

export default function S04Packet() {
  const { camera } = useThree();
  const progress = useRef(0);
  const reveal = useRef(0);
  const streakRef = useRef(null);
  const flashRef = useRef(null);
  const pointerThird = useRef(0);

  const here = useMemo(() => whereAmI(), []);
  const hopAt = useMemo(() => here.hops.map((_, i) => 0.08 + (i * 0.62) / Math.max(1, here.hops.length - 1)), [here]);

  useEffect(() => registerShot('S04', packetShot), []);
  useEffect(() => registerFoxShot('S04', packetFoxShot), []);

  // The cursor's horizontal third picks the branch order while the fox considers the split.
  useEffect(() => {
    const onMove = (event) => {
      pointerThird.current = Math.min(2, Math.floor((event.clientX / window.innerWidth) * 3));
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  const streakMaterial = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uCore: { value: new Color(PALETTE.flameCore) }, uFire: { value: new Color(PALETTE.fire) }, uOpacity: { value: 1 } },
        vertexShader: STREAK_VERTEX,
        fragmentShader: STREAK_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [],
  );
  const flashMaterial = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uSize: { value: [1, 1] }, uColor: { value: new Color(PALETTE.flameCore) }, uOpacity: { value: 0 } },
        vertexShader: FLASH_VERTEX,
        fragmentShader: FLASH_FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );
  useEffect(
    () => () => {
      streakMaterial.dispose();
      flashMaterial.dispose();
    },
    [streakMaterial, flashMaterial],
  );

  useFrame(() => {
    const p = sceneProgressOf('S04');
    progress.current = p;
    const t = runT(p);
    // The text reveals just ahead of the packet, so letters light up as it arrives.
    reveal.current = Math.min(1, t + 0.01);

    const streak = streakRef.current;
    if (streak) {
      const on = 1 - window01(p, RUN_END, RUN_END + 0.03);
      streak.visible = on > 0.001;
      if (streak.visible) {
        tunnelCurve.getPointAt(t, streakPos);
        tunnelCurve.getPointAt(Math.min(1, t + 0.01), streakAhead);
        streak.position.copy(streakPos).addScaledVector(WORLD_UP, -0.15);
        streak.lookAt(camera.position);
        // Stretch along the travel direction as seen by the camera.
        streak.scale.set(2.6, 0.5, 1);
        streakMaterial.uniforms.uOpacity.value = on;
      }
    }

    const flash = flashRef.current;
    if (flash) {
      const opacity = 1 - window01(p, 0, 0.025);
      flash.visible = opacity > 0.001;
      flashMaterial.uniforms.uOpacity.value = opacity;
      const height = 2 * Math.tan((camera.fov * Math.PI) / 360) * 1.4;
      flashMaterial.uniforms.uSize.value = [height * camera.aspect, height];
    }

    // Choose the room order while the fox considers the branches; hold it after.
    if (!FILM_FREEZE && p >= REFORM_END && p < 1) {
      const order = ORDER_BY_THIRD[pointerThird.current];
      const current = film.getState().branchOrder;
      if (order.join() !== current.join()) film.getState().setBranchOrder(order);
    }
  });

  return (
    <>
      <TextTunnel curve={tunnelCurve} lines={site.about} revealRef={reveal} radius={TUNNEL_RADIUS} />
      <HopRings curve={tunnelCurve} hops={here.hops} at={hopAt} progressRef={reveal} radius={TUNNEL_RADIUS} />
      <Branches />
      <mesh ref={streakRef} material={streakMaterial} frustumCulled={false} renderOrder={6}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh ref={flashRef} material={flashMaterial} visible={false} frustumCulled={false} renderOrder={950}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      {/* Photo rings go here once PHOTOS_VERIFIED is true (D-065). */}
    </>
  );
}
