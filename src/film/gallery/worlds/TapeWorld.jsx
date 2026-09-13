import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, DoubleSide, Vector3 } from 'three';
import { PLANE_VERTEX, ease, lerp, textTexture, window01 } from '../../rooms/labels.js';

/**
 * 05 CODE TO SURVIVE: a dark room strung with crime-scene tape, one spotlight that follows the fox,
 * and a single line of code on the floor. The code shows only inside the pool of light, so the fox
 * reads it as it goes, following it to a lit exit. Paper tones from the screenshot's case files.
 */

const START_Z = 3;
const EXIT_Z = -29;
const RUN = [0.04, 0.9];
const CODE = 'const exit = clues.every((clue) => clue.solved);';
const TAPE_TEXT = 'CRIME SCENE   DO NOT CROSS   ';
const TAPE_WIDTH = 14;
const TAPE_HEIGHT = 0.34;
const TAPES = [
  { z: -6, y: 1.3, yaw: 0.28 },
  { z: -12, y: 1.9, yaw: -0.36 },
  { z: -18.5, y: 1.1, yaw: 0.16 },
  { z: -24, y: 2.2, yaw: -0.22 },
];

export const background = '#050404';

const WORLD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const CODE_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform vec3 uFox;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    float a = texture2D(uMap, vUv).a;
    float lit = smoothstep(4.2, 1.2, distance(vWorld.xz, uFox.xz));
    // What the fox has already read stays faintly on the floor behind it.
    float read = step(uFox.z, vWorld.z) * 0.14;
    gl_FragColor = vec4(uColor, a * max(lit, read));
    #include <colorspace_fragment>
  }
`;

const TAPE_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uTape;
  uniform vec3 uFox;
  uniform float uRepeat;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    float a = texture2D(uMap, vec2(fract(vUv.x * uRepeat), vUv.y)).a;
    vec3 color = mix(uTape, vec3(0.02), a);
    float lit = 0.12 + 0.88 * smoothstep(7.0, 2.0, distance(vWorld.xz, uFox.xz));
    gl_FragColor = vec4(color * lit, 1.0);
    #include <colorspace_fragment>
  }
`;

const CONE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    gl_FragColor = vec4(uColor * mix(0.02, 0.16, vUv.y), 1.0);
    #include <colorspace_fragment>
  }
`;

const POOL_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    gl_FragColor = vec4(uColor * smoothstep(1.0, 0.0, d) * 0.55, 1.0);
    #include <colorspace_fragment>
  }
`;

function foxZ(p) {
  return lerp(START_Z, EXIT_Z + 0.8, window01(p, RUN[0], RUN[1])) - window01(p, RUN[1], 1) * 3;
}

export function fox(p, pose) {
  pose.position.set(0, 0, foxZ(p));
  pose.forward.set(0, 0, -1);
  pose.up.set(0, 1, 0);
}

export function camera(p, cam) {
  const z = foxZ(p);
  const end = ease(window01(p, RUN[1] - 0.05, 1));
  cam.position.set(lerp(2.4, 0.6, end), lerp(6.2, 2.2, end), z + lerp(6.5, 5, end));
  cam.target.set(0, lerp(0, 1.4, end), z - 2.5);
  cam.fov = 52;
  cam.roll = 0;
}

const foxWorld = new Vector3();

export default function TapeWorld({ progressRef, origin, colours }) {
  const [, paperHex] = colours;
  const code = useMemo(() => {
    const label = textTexture(CODE, { size: 96 });
    return {
      label,
      material: {
        uniforms: { uMap: { value: label.texture }, uColor: { value: new Color(paperHex) }, uFox: { value: new Vector3() } },
        vertexShader: WORLD_VERTEX,
        fragmentShader: CODE_FRAGMENT,
      },
    };
  }, [paperHex]);
  const tape = useMemo(() => {
    const label = textTexture(TAPE_TEXT, { weight: 700, size: 72 });
    return {
      label,
      material: {
        uniforms: {
          uMap: { value: label.texture },
          uTape: { value: new Color('#d9b43c') },
          uFox: { value: new Vector3() },
          uRepeat: { value: Math.max(1, TAPE_WIDTH / TAPE_HEIGHT / label.aspect) },
        },
        vertexShader: WORLD_VERTEX,
        fragmentShader: TAPE_FRAGMENT,
      },
    };
  }, []);
  const cone = useMemo(() => ({ uniforms: { uColor: { value: new Color(paperHex) } }, vertexShader: PLANE_VERTEX, fragmentShader: CONE_FRAGMENT }), [paperHex]);
  const pool = useMemo(() => ({ uniforms: { uColor: { value: new Color(paperHex) } }, vertexShader: PLANE_VERTEX, fragmentShader: POOL_FRAGMENT }), [paperHex]);
  useEffect(
    () => () => {
      code.label.texture.dispose();
      tape.label.texture.dispose();
    },
    [code, tape],
  );

  const lightRef = useRef(null);
  const exitRef = useRef(null);
  const codeLength = START_Z - EXIT_Z - 1;

  useFrame(() => {
    const p = progressRef.current;
    const z = foxZ(p);
    foxWorld.set(0, 0, z).add(origin);
    code.material.uniforms.uFox.value.copy(foxWorld);
    tape.material.uniforms.uFox.value.copy(foxWorld);
    if (lightRef.current) lightRef.current.position.set(0, 0, z);
    if (exitRef.current) exitRef.current.material.opacity = window01(p, 0.6, 0.95);
  });

  return (
    <group position={origin}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, (START_Z + EXIT_Z) / 2]}>
        <planeGeometry args={[18, 46]} />
        <meshBasicMaterial color="#0c0b0a" toneMapped={false} />
      </mesh>
      {/* The line of code lies along the path, reading toward the exit. */}
      <group position={[0, 0.012, (START_Z + EXIT_Z) / 2]} rotation-y={Math.PI / 2}>
        <mesh rotation-x={-Math.PI / 2}>
          <planeGeometry args={[codeLength, codeLength / code.label.aspect]} />
          <shaderMaterial args={[code.material]} transparent depthWrite={false} />
        </mesh>
      </group>
      {TAPES.map((t, i) => (
        <mesh key={`tape${i}`} position={[0, t.y, t.z]} rotation-y={t.yaw}>
          <planeGeometry args={[TAPE_WIDTH, TAPE_HEIGHT]} />
          <shaderMaterial args={[tape.material]} side={DoubleSide} />
        </mesh>
      ))}
      <group ref={lightRef}>
        <mesh position={[0, 4.6, 0]}>
          <coneGeometry args={[2.4, 9, 40, 1, true]} />
          <shaderMaterial args={[cone]} transparent depthWrite={false} blending={AdditiveBlending} side={DoubleSide} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
          <planeGeometry args={[5.5, 5.5]} />
          <shaderMaterial args={[pool]} transparent depthWrite={false} blending={AdditiveBlending} />
        </mesh>
      </group>
      {[-0.9, 0.9].map((x) => (
        <mesh key={x} position={[x, 1.3, EXIT_Z]}>
          <boxGeometry args={[0.12, 2.6, 0.12]} />
          <meshBasicMaterial color={paperHex} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[0, 2.6, EXIT_Z]}>
        <boxGeometry args={[1.92, 0.12, 0.12]} />
        <meshBasicMaterial color={paperHex} toneMapped={false} />
      </mesh>
      <mesh ref={exitRef} position={[0, 1.3, EXIT_Z - 0.05]}>
        <planeGeometry args={[1.7, 2.5]} />
        <meshBasicMaterial color={paperHex} transparent opacity={0} toneMapped={false} />
      </mesh>
    </group>
  );
}
