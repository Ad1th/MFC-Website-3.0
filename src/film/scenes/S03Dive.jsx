import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, Quaternion, ShaderMaterial, Vector3 } from 'three';
import { useFilm } from '../store.js';
import { createPose, registerShot } from '../camera/shots.js';
import { getFox, registerFoxShot } from '../actors/foxShots.js';
import { breakShot } from './S02Break.jsx';
import { GLOBE_CENTRE } from './S01ColdOpen.jsx';
import { velloreWorld } from '../globe/anchors.js';
import { sceneProgressOf } from './progress.js';
import DiveClouds, { RainStreaks, lookFor } from '../sky/DiveClouds.jsx';
import CarvedWords from '../sky/CarvedWords.jsx';
import SkyGround from '../sky/SkyGround.jsx';
import CommitMeteors from '../sky/CommitMeteors.jsx';
import { FILM_FREEZE } from '../testHooks.js';

/**
 * S03 The Dive. The fox leaps past us toward Earth and the camera swings round behind its
 * tail. Re-entry: the fox burns white-hot and the horizon rolls up to 15°. At the top of the clouds a
 * whiteout hides a change of scale into the sky set, a real-sized sky under Vellore. The fox
 * falls through three weather-shaped cloud layers, carving `open minds.`, `open ideas.`,
 * `OPEN SOURCE.` into them, sneezes on leaving the last one, and the subcontinent at night
 * opens below with the club's commits falling onto Vellore. It banks and dives into the
 * glowing fibre: impact.
 *
 * Every pose is a pure function of sceneProgress, so scrolling back rewinds the dive.
 *
 * Beats by sceneProgress:
 *   0.00 to 0.10  the swing round behind the tail
 *   0.10 to 0.30  re-entry toward Vellore on the spinning globe; white-hot, roll
 *   0.27 to 0.37  whiteout; the set changes at 0.32 (a hidden cut)
 *   0.32 to 0.90  falling through the cloud layers; words; sneeze after the last layer
 *   late          commit meteors over the subcontinent
 *   0.90 to 1.00  bank into the fibre; impact
 */

export const SKY_ORIGIN = new Vector3(0, -2000, 0);
const SET_SWITCH = 0.32;
const SKY_END = 0.9;
const TOP = 130;
const BOTTOM = 8;
const DRIFT = 30;
const LAYER_Y = [95, 65, 35];
const WORDS = ['open minds.', 'open ideas.', 'OPEN SOURCE.'];

const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
const window01 = (p, a, b) => clamp01((p - a) / (b - a));
const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

/** Scene progress at which the falling fox is at sky height y. */
function progressAtHeight(y) {
  return SET_SWITCH + ((TOP - y) / (TOP - BOTTOM)) * (SKY_END - SET_SWITCH);
}

/** Where the fox crosses height y along its drift (z in sky units). */
function driftAtHeight(y) {
  return -((TOP - y) / (TOP - BOTTOM)) * DRIFT;
}

export const LAYERS = LAYER_Y.map((y, i) => ({
  y,
  z: driftAtHeight(y),
  seed: 5 + i * 4,
  words: WORDS[i],
  reveal: [progressAtHeight(y + 4), progressAtHeight(y - 4)],
}));
const SNEEZE_AT = progressAtHeight(LAYER_Y[2] - 7);
const METEORS = [progressAtHeight(28), SKY_END + 0.04];
const FIBRE = [0.88, 0.95];
const IMPACT = [0.965, 1];
const GROUND_REVEAL = [progressAtHeight(34), progressAtHeight(22)];
const SPACE_FOG = new Color('#0a0807');
const SKY_BACKGROUND = new Color('#060a14');
const SKY_FOG = new Color('#0b1222');

const cam0 = createPose();
const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpC = new Vector3();
const tmpD = new Vector3();
const tmpQ = new Quaternion();
const identity = new Quaternion();

/**
 * The fox's frame at a progress: position, forward (nose) and up (back).
 * @returns {'space'|'sky'}
 */
export function diveFox(progress, aspect, position, forward, up) {
  const p = clamp01(progress);
  if (p < SET_SWITCH) {
    breakShot(1, cam0, aspect);
    const normal = tmpA.copy(velloreWorld).sub(GLOBE_CENTRE);
    if (normal.lengthSq() < 1e-6) normal.set(0, 0, 1);
    normal.normalize();
    const entry = tmpB.copy(velloreWorld).addScaledVector(normal, 0.35);
    const lensForward = tmpC.copy(cam0.target).sub(cam0.position).normalize();
    // Starts just past the lens, where S02 left it, and heads for the top of Vellore's sky.
    position.copy(cam0.position).addScaledVector(lensForward, 0.6);
    forward.copy(entry).sub(position).normalize();
    position.lerp(entry, ease(window01(p, 0.04, 0.3)));
    up.copy(normal).addScaledVector(forward, -normal.dot(forward));
    if (up.lengthSq() < 1e-6) up.set(0, 1, 0);
    up.normalize();
    return 'space';
  }
  const s = window01(p, SET_SWITCH, SKY_END);
  const bank = ease(window01(p, SKY_END, 1));
  position
    .set(Math.sin(s * 5.5) * 2.5 * (1 - bank), lerp(lerp(TOP, BOTTOM, s), 0.6, bank), lerp(-s * DRIFT, 4, bank))
    .add(SKY_ORIGIN);
  // Diving forward and down so the camera beside it sees a fox in profile, then banking south (+z).
  forward.set(0, -0.8, -0.6).lerp(tmpA.set(0, -1, 0.8), bank).normalize();
  // Back toward the sky, so the camera beside the fox sees its side, not its back.
  const skyUp = tmpB.set(0, 1, 0);
  up.copy(skyUp).addScaledVector(forward, -skyUp.dot(forward));
  if (up.lengthSq() < 1e-6) up.set(0, 0, 1);
  up.normalize();
  return 'sky';
}

const foxPosition = new Vector3();
const foxForward = new Vector3();
const foxUp = new Vector3();

/** @type {import('../camera/shots.js').Shot} */
export function diveShot(progress, out, aspect = 16 / 9) {
  const p = clamp01(progress);
  const where = diveFox(p, aspect, foxPosition, foxForward, foxUp);
  const fit = Math.max(1, 0.8 / aspect);

  if (where === 'space') {
    breakShot(1, cam0, aspect);
    // The swing: the camera's offset from the fox turns from S02's view to behind the tail.
    const follow = lerp(1.4, 0.7, ease(window01(p, 0.1, 0.3))) * fit;
    const startOffset = tmpA.copy(cam0.position).sub(foxPosition);
    const startDistance = startOffset.length() || 1;
    startOffset.divideScalar(startDistance);
    const endOffset = tmpB.copy(foxForward).multiplyScalar(-1).addScaledVector(foxUp, 0.35).normalize();
    const w = ease(window01(p, 0, 0.1));
    tmpQ.setFromUnitVectors(startOffset, endOffset);
    const turn = identity.clone().slerp(tmpQ, w);
    const offset = tmpC.copy(startOffset).applyQuaternion(turn).multiplyScalar(lerp(startDistance, follow, w));
    out.position.copy(foxPosition).add(offset);
    const followTarget = tmpD.copy(foxPosition).addScaledVector(foxForward, 1.2);
    out.target.lerpVectors(cam0.target, followTarget, w);
    out.fov = lerp(cam0.fov, 55, w);
    out.roll = ((15 * Math.PI) / 180) * Math.sin(Math.PI * window01(p, 0.12, 0.3));
    out.cut = 0;
    return;
  }

  const bank = ease(window01(p, SKY_END, 1));
  // Beside and a little above the falling fox, so it reads as a fox, not a streak.
  out.position.copy(foxPosition).add(tmpA.set(lerp(11, 5, bank), lerp(5, 3, bank), lerp(8, 6, bank)).multiplyScalar(fit));
  out.target.copy(foxPosition).addScaledVector(foxForward, 2.5);
  out.fov = 50;
  out.roll = Math.sin(p * 20) * 0.03 * (1 - bank);
  // The sky set is a different world from the globe: arriving in it is a cut hidden by the whiteout.
  out.cut = 1;
}

/** @type {import('../actors/foxShots.js').FoxShot} */
function diveFoxShot(progress, pose, input, context) {
  const where = diveFox(progress, context.aspect, pose.position, pose.forward, pose.up);
  pose.scale = where === 'space' ? 0.4 : 1.2;
  pose.cut = where === 'space' ? 0 : 1;
  input.hint = 'run';
  // Re-entry burns hot (sprint); in the clouds the fox is simply falling fast.
  input.velocity = where === 'space' ? 1600 : 900;
}

const WHITEOUT_VERTEX = /* glsl */ `
  uniform vec2 uSize;
  void main() {
    gl_Position = projectionMatrix * vec4(position.xy * uSize, -1.0, 1.0);
  }
`;

const WHITEOUT_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    gl_FragColor = vec4(uColor, uOpacity);
    #include <colorspace_fragment>
  }
`;

export default function S03Dive() {
  const tier = useFilm((s) => s.quality);
  const weather = useFilm((s) => s.live.weather);
  const look = lookFor(weather);
  const { camera, scene } = useThree();
  const progress = useRef(0);
  const lastProgress = useRef(0);
  const whiteoutRef = useRef(null);

  useEffect(() => registerShot('S03', diveShot), []);
  useEffect(() => registerFoxShot('S03', diveFoxShot), []);

  const whiteoutMaterial = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uSize: { value: [1, 1] }, uColor: { value: new Color('#b9c4d8') }, uOpacity: { value: 0 } },
        vertexShader: WHITEOUT_VERTEX,
        fragmentShader: WHITEOUT_FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );

  useEffect(() => {
    whiteoutMaterial.uniforms.uColor.value.set(look.color);
  }, [look, whiteoutMaterial]);

  useEffect(
    () => () => {
      whiteoutMaterial.dispose();
    },
    [whiteoutMaterial],
  );

  // Leaving the dive restores the film's own air.
  useEffect(
    () => () => {
      if (scene.fog) {
        scene.fog.color.copy(SPACE_FOG);
        scene.fog.near = 20;
        scene.fog.far = 60;
      }
      if (scene.background?.isColor) scene.background.copy(SPACE_FOG);
    },
    [scene],
  );

  useFrame((state) => {
    const p = sceneProgressOf('S03');
    progress.current = p;

    // The sky set has its own air: a deep night-blue sky and long fog so the cloud layers
    // read against it; space keeps the film's near-black and short fog.
    const inSky = p >= SET_SWITCH;
    if (state.scene.fog) {
      state.scene.fog.color.copy(inSky ? SKY_FOG : SPACE_FOG);
      state.scene.fog.near = inSky ? 70 : 20;
      state.scene.fog.far = inSky ? 460 : 60;
    }
    if (state.scene.background?.isColor) state.scene.background.copy(inSky ? SKY_BACKGROUND : SPACE_FOG);

    // The sneeze, once, on the way down through the last layer's underside.
    if (!FILM_FREEZE && lastProgress.current < SNEEZE_AT && p >= SNEEZE_AT) getFox()?.trigger('sneeze', {}, { force: true });
    lastProgress.current = p;

    const whiteout = whiteoutRef.current;
    if (whiteout) {
      const opacity = window01(p, 0.27, 0.31) * (1 - window01(p, 0.335, 0.37));
      whiteout.visible = opacity > 0.001;
      whiteoutMaterial.uniforms.uOpacity.value = opacity;
      const height = 2 * Math.tan((camera.fov * Math.PI) / 360) * 1.1;
      whiteoutMaterial.uniforms.uSize.value = [height * camera.aspect, height];
    }
  });

  return (
    <>
      <mesh ref={whiteoutRef} material={whiteoutMaterial} visible={false} frustumCulled={false} renderOrder={900}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <Suspense fallback={null}>
        <DiveClouds layers={LAYERS} tier={tier} weather={weather} origin={SKY_ORIGIN} />
      </Suspense>
      {LAYERS.map((layer) => (
        <CarvedWords
          key={layer.y}
          text={layer.words}
          // Just below the layer's height, so the fox passes the words while the camera beside it can see them.
          position={[SKY_ORIGIN.x, SKY_ORIGIN.y + layer.y - 3, SKY_ORIGIN.z + layer.z]}
          progressRef={progress}
          range={layer.reveal}
          tilt={0.5}
          width={22}
        />
      ))}
      <Suspense fallback={null}>
        <SkyGround tier={tier} origin={SKY_ORIGIN} progressRef={progress} fibre={FIBRE} impact={IMPACT} reveal={GROUND_REVEAL} />
      </Suspense>
      <CommitMeteors origin={SKY_ORIGIN} progressRef={progress} range={METEORS} />
      <RainStreaks amount={look.rain} progressRef={progress} from={SET_SWITCH} to={SKY_END} />
    </>
  );
}
