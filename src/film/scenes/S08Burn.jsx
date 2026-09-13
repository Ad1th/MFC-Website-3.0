import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, ShaderMaterial, Vector3 } from 'three';
import { registerShot } from '../camera/shots.js';
import { registerFoxShot } from '../actors/foxShots.js';
import { sceneProgressOf } from './progress.js';
import { PALETTE } from '../palette.js';
import { FILM_FREEZE, FILM_TEST } from '../testHooks.js';
import { clamp01, ease, lerp, window01 } from '../rooms/labels.js';
import { currentCoverX, setPen } from '../burn/burnState.js';

/**
 * S08 The Burn. The ember from the spiral lands on a sheet of paper in the dark; a noise burn with
 * a glowing edge grows from the impact until paper fills the frame. Then the calm room: the paper
 * is painted here, and the writing itself is the real HTML of the writing region laid over it (the
 * headline drawn letter by letter like a pen, the post index, newsletter covers you can drag). The
 * fox is not in the room, only its shadow, which walks right to left and sits a moment beside the
 * newest newsletter. At the end the paper smoulders from the bottom and burns upward, line by line,
 * back to dark. Every part is a function of scroll.
 *
 * The film tells the DOM how far it has burned through CSS variables on the root:
 *   --burn-in   0 to 1 as the paper is revealed
 *   --burn-out  0 to 1 as it burns away from the bottom
 *   --writing-opacity  the writing appears once the paper fills the frame
 */

export const BURN_ORIGIN = new Vector3(0, -16000, 0);
const BURN_CUT = 40;
const CAMERA_DISTANCE = 10;

export const BURN_BEATS = {
  in: [0, 0.16],
  pen: [0.18, 0.34],
  walk: [0.3, 0.82],
  sit: [0.5, 0.58],
  out: [0.86, 1],
};

/** The impact point on screen (uv), a little above centre, where the ember lands. */
const IMPACT = [0.52, 0.56];

/** @type {import('../camera/shots.js').Shot} */
export function burnShot(progress, out) {
  // The only still camera in the film: the reading room does not move.
  out.position.set(0, 0, CAMERA_DISTANCE).add(BURN_ORIGIN);
  out.target.copy(BURN_ORIGIN);
  out.fov = 45;
  out.roll = 0;
  out.cut = BURN_CUT;
  out.shake = 0;
}

/** Walk progress (0 right edge, 1 left edge), pausing at the newest cover during the sit. */
function walkAt(p, sitU) {
  const [w0, w1] = BURN_BEATS.walk;
  const [s0, s1] = BURN_BEATS.sit;
  if (p < s0) return lerp(0, sitU, window01(p, w0, s0));
  if (p < s1) return sitU;
  return lerp(sitU, 1, window01(p, s1, w1));
}

/** @type {import('../actors/foxShots.js').FoxShot} */
function burnFoxShot(progress, pose, input, context) {
  const p = progress;
  const aspect = context?.aspect ?? 16 / 9;
  const halfWidth = Math.tan((22.5 * Math.PI) / 180) * CAMERA_DISTANCE * aspect;
  const coverX = currentCoverX();
  // Sit beside the newest newsletter; without covers, a little left of centre.
  const sitU = coverX === null ? 0.55 : clamp01(1 - (coverX * 2 - 1 + 1) / 2 + 0.06);
  const u = walkAt(p, sitU);
  const edge = halfWidth + 1.5;
  pose.position.set(lerp(edge, -edge, u), -2.7, 0.5).add(BURN_ORIGIN);
  pose.forward.set(-1, 0, 0);
  pose.up.set(0, 1, 0);
  pose.scale = 0.8;
  pose.cut = BURN_CUT;
  // A shadow: dark, normally blended, on the paper.
  pose.light = true;
  pose.tint = '#3a2f28';
  pose.visible = p > BURN_BEATS.walk[0] && p < BURN_BEATS.walk[1];
  const sitting = p >= BURN_BEATS.sit[0] && p < BURN_BEATS.sit[1];
  input.hint = sitting ? 'sit' : 'run';
  input.velocity = sitting ? 0 : 260;
}

const PAPER_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy * 2.0, 0.999, 1.0);
  }
`;

const PAPER_FRAGMENT = /* glsl */ `
  uniform float uIn;
  uniform float uOut;
  uniform vec2 uImpact;
  uniform float uAspect;
  uniform float uTime;
  uniform vec3 uPaper;
  uniform vec3 uNight;
  uniform vec3 uEmber;
  uniform vec3 uFire;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 p = vUv * vec2(uAspect, 1.0);
    float n = fbm(p * 3.5);
    // In: the burn grows out from the impact, revealing the paper.
    float d = length((vUv - uImpact) * vec2(uAspect, 1.0));
    float fieldIn = d + (n - 0.5) * 0.45 - uIn * (1.2 + uAspect);
    // Out: the paper burns away from the bottom.
    float fieldOut = vUv.y + (n - 0.5) * 0.2 - uOut * 1.3;
    float revealed = smoothstep(0.004, -0.004, fieldIn);
    float kept = smoothstep(-0.004, 0.004, fieldOut);
    float paper = revealed * kept;

    // Scorch just inside each burning edge, and the glowing edge itself.
    float scorch = max(smoothstep(0.08, 0.0, -fieldIn) * step(uIn, 0.999), smoothstep(0.08, 0.0, fieldOut) * step(0.001, uOut));
    float live = step(0.001, uIn) * step(uIn, 0.999);
    float edgeIn = exp(-abs(fieldIn) * 90.0) * live;
    float edgeOut = exp(-abs(fieldOut) * 90.0) * step(0.001, uOut) * step(uOut, 0.999);
    float edge = max(edgeIn, edgeOut);

    vec3 sheet = uPaper * (1.0 - scorch * 0.45) * (0.97 + 0.03 * noise(p * 60.0));
    vec3 color = mix(uNight, sheet, paper);
    color += uEmber * edge * 1.4 + uFire * pow(edge, 3.0);
    // Smoke drifting up off the out-burn, a faint warm haze on the paper side.
    color = mix(color, uNight * 1.6, smoothstep(0.22, 0.0, fieldOut) * kept * step(0.001, uOut) * 0.25 * n);
    // Subtle grain.
    color += (hash(vUv * 1000.0 + uTime) - 0.5) * 0.025;
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

export default function S08Burn() {
  const { size, scene } = useThree();
  const paperRef = useRef(null);
  const last = useRef({ in: -1, out: -1, opacity: -1 });

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uIn: { value: 0 },
          uOut: { value: 0 },
          uImpact: { value: IMPACT },
          uAspect: { value: 1.6 },
          uTime: { value: 0 },
          uPaper: { value: new Color(PALETTE.paper) },
          uNight: { value: new Color(PALETTE.night) },
          uEmber: { value: new Color(PALETTE.ember) },
          uFire: { value: new Color(PALETTE.fire) },
        },
        vertexShader: PAPER_VERTEX,
        fragmentShader: PAPER_FRAGMENT,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );

  useEffect(() => registerShot('S08', burnShot), []);
  useEffect(() => registerFoxShot('S08', burnFoxShot), []);
  useEffect(() => () => material.dispose(), [material]);

  // The DOM variables go back to their resting values when the scene leaves.
  useEffect(
    () => () => {
      const root = document.documentElement.style;
      root.removeProperty('--burn-in');
      root.removeProperty('--burn-out');
      root.removeProperty('--writing-opacity');
      if (document.documentElement.dataset.theme === 'paper') delete document.documentElement.dataset.theme;
      setPen(1);
    },
    [],
  );

  useEffect(() => {
    if (!FILM_TEST) return undefined;
    window.__filmTest.burn = () => ({ in: last.current.in, out: last.current.out, opacity: last.current.opacity });
    return () => {
      delete window.__filmTest.burn;
    };
  }, []);

  useFrame((state) => {
    const p = sceneProgressOf('S08');
    const active = p > 0 && p < 1;
    const burnIn = ease(window01(p, BURN_BEATS.in[0], BURN_BEATS.in[1]));
    const burnOut = window01(p, BURN_BEATS.out[0], BURN_BEATS.out[1]);
    const u = material.uniforms;
    u.uIn.value = burnIn;
    u.uOut.value = burnOut;
    u.uAspect.value = size.width / size.height;
    u.uTime.value = FILM_FREEZE ? 0 : state.clock.elapsedTime;
    if (paperRef.current) paperRef.current.visible = active;

    setPen(ease(window01(p, BURN_BEATS.pen[0], BURN_BEATS.pen[1])));

    // Only write the CSS variables when they change: every write restyles the document.
    const opacity = active ? clamp01((burnIn - 0.8) / 0.2) : 1;
    const root = document.documentElement.style;
    const l = last.current;
    if (Math.abs(l.in - burnIn) > 0.001) root.setProperty('--burn-in', burnIn.toFixed(3));
    if (Math.abs(l.out - burnOut) > 0.001) root.setProperty('--burn-out', burnOut.toFixed(3));
    if (Math.abs(l.opacity - opacity) > 0.001) root.setProperty('--writing-opacity', opacity.toFixed(3));
    last.current = { in: burnIn, out: burnOut, opacity };

    // The light palette while the paper holds the frame: the chrome and cursor read on paper too.
    const paperUp = active && burnIn > 0.5 && burnOut < 0.5;
    const dataset = document.documentElement.dataset;
    if (paperUp && dataset.theme !== 'paper') dataset.theme = 'paper';
    if (!paperUp && dataset.theme === 'paper') delete dataset.theme;

    if (active && scene.background?.isColor) scene.background.set(PALETTE.night);
  });

  return (
    <mesh ref={paperRef} material={material} frustumCulled={false} renderOrder={-100} visible={false}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}
