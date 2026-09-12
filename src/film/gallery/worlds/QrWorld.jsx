import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import { AdditiveBlending, BoxGeometry, Color, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { mulberry32 } from '../../fox/rig.js';
import { LABEL_FRAGMENT, PLANE_VERTEX, ease, lerp, textTexture, window01 } from '../../rooms/labels.js';

/**
 * 04 SOTY: QR codes the size of buildings. A scan line sweeps each code, the fox runs through it,
 * and the modules dissolve outward from where it passes, lifting away as riddle glyphs float up.
 * Modules in the screenshot's pale pink over its purples.
 */

const N = 21;
const MODULE = 0.5;
const CODES = 3;
const SPACING = 11;
const FIRST_Z = -8;
const START_Z = 4;
const END_Z = FIRST_Z - (CODES - 1) * SPACING - 8;
const RUN = [0.02, 0.94];
const GLYPHS = ['?', '!', '#', '%', '&', '*', '+', '=', '7', '3', 'x', '@'];

export const background = '#1b0a19';

const codeZ = (k) => FIRST_Z - k * SPACING;
/** The run parameter at which the fox crosses code k. */
const crossAt = (k) => (START_Z - codeZ(k)) / (START_Z - END_Z);

function finder(i, j, oi, oj) {
  const x = i - oi;
  const y = j - oj;
  if (x < 0 || y < 0 || x > 6 || y > 6) return null;
  return x === 0 || y === 0 || x === 6 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4);
}

/** A QR-like module grid: three finder squares, their separators, timing lines, seeded data. */
function pattern(seed) {
  const rand = mulberry32(seed);
  const cells = [];
  for (let j = 0; j < N; j += 1) {
    for (let i = 0; i < N; i += 1) {
      const f = finder(i, j, 0, 0) ?? finder(i, j, N - 7, 0) ?? finder(i, j, 0, N - 7);
      let on;
      if (f !== null) on = f;
      else if ((i <= 7 && j <= 7) || (i >= N - 8 && j <= 7) || (i <= 7 && j >= N - 8)) on = false;
      else if (i === 6 || j === 6) on = (i + j) % 2 === 0;
      else on = rand() > 0.52;
      if (on) cells.push([i, j]);
    }
  }
  return cells;
}

const MODULES = (() => {
  const out = [];
  for (let k = 0; k < CODES; k += 1) {
    const rand = mulberry32(900 + k);
    for (const [i, j] of pattern(40 + k)) {
      const x = (i - (N - 1) / 2) * MODULE;
      const y = (N - 1 - j) * MODULE - 0.1;
      out.push({ k, x, y, z: codeZ(k), delay: Math.hypot(x, y) * 0.004, dx: (rand() - 0.5) * 2, dz: (rand() - 0.5) * 2 });
    }
  }
  return out;
})();

const SCAN_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float band = 1.0 - abs(vUv.y - 0.5) * 2.0;
    gl_FragColor = vec4(uColor * band * uOpacity * 1.5, 1.0);
    #include <colorspace_fragment>
  }
`;

const foxZ = (p) => lerp(START_Z, END_Z, window01(p, RUN[0], RUN[1]));

export function fox(p, pose, input) {
  pose.position.set(0, 0, foxZ(p));
  pose.forward.set(0, 0, -1);
  pose.up.set(0, 1, 0);
  if (p >= RUN[1]) {
    input.hint = 'sit';
    input.velocity = 0;
  }
}

export function camera(p, cam) {
  const z = foxZ(p);
  const end = ease(window01(p, RUN[1], 1));
  cam.position.set(1.8, lerp(1.2, 2.5, end), z + lerp(5.5, 8, end));
  cam.target.set(0, lerp(3.8, 1.5, end), z - 8);
  cam.fov = 58;
  cam.roll = 0;
}

const IDENTITY = new Quaternion();
const at = new Vector3();
const scale = new Vector3();
const matrix = new Matrix4();

export default function QrWorld({ progressRef, origin, colours }) {
  const [baseHex, midHex, lightHex] = colours;
  const mesh = useMemo(() => {
    const material = new MeshStandardMaterial({ color: lightHex, roughness: 0.4, emissive: new Color(lightHex).multiplyScalar(0.25) });
    const instanced = new InstancedMesh(new BoxGeometry(MODULE * 0.94, MODULE * 0.94, MODULE * 0.94), material, MODULES.length);
    instanced.frustumCulled = false;
    return instanced;
  }, [lightHex]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    },
    [mesh],
  );

  const glyphs = useMemo(() => {
    const rand = mulberry32(77);
    const out = [];
    for (let k = 0; k < CODES; k += 1) {
      for (let g = 0; g < 10; g += 1) {
        const label = textTexture(GLYPHS[Math.floor(rand() * GLYPHS.length)], { weight: 700, size: 128 });
        out.push({
          k,
          label,
          x: (rand() - 0.5) * 9,
          y: 1 + rand() * 8,
          z: codeZ(k) - 0.5 - rand() * 2,
          material: {
            uniforms: { uMap: { value: label.texture }, uColor: { value: new Color(lightHex) }, uOpacity: { value: 0 } },
            vertexShader: PLANE_VERTEX,
            fragmentShader: LABEL_FRAGMENT,
          },
        });
      }
    }
    return out;
  }, [lightHex]);
  useEffect(() => () => glyphs.forEach((g) => g.label.texture.dispose()), [glyphs]);

  const scans = useMemo(
    () =>
      Array.from({ length: CODES }, () => ({
        uniforms: { uColor: { value: new Color(lightHex) }, uOpacity: { value: 0 } },
        vertexShader: PLANE_VERTEX,
        fragmentShader: SCAN_FRAGMENT,
      })),
    [lightHex],
  );
  const glyphRefs = useRef([]);
  const scanRefs = useRef([]);

  useFrame(() => {
    const runT = window01(progressRef.current, RUN[0], RUN[1]);
    MODULES.forEach((m, i) => {
      const c = crossAt(m.k);
      const d = ease(window01(runT, c - 0.035 + m.delay, c + 0.02 + m.delay));
      at.set(m.x + m.dx * d * 2.2, m.y + d * d * 3.5, m.z + m.dz * d * 1.5);
      scale.setScalar(Math.max(1e-4, 1 - d));
      matrix.compose(at, IDENTITY, scale);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;

    glyphs.forEach((g, i) => {
      const c = crossAt(g.k);
      const o = window01(runT, c, c + 0.04) * (1 - window01(runT, c + 0.22, c + 0.32));
      g.material.uniforms.uOpacity.value = o;
      const ref = glyphRefs.current[i];
      if (ref) {
        ref.visible = o > 0.001;
        ref.position.y = g.y + window01(runT, c, c + 0.3) * 1.5;
      }
    });

    scans.forEach((scan, k) => {
      const c = crossAt(k);
      const sweep = window01(runT, c - 0.12, c - 0.03);
      scan.uniforms.uOpacity.value = sweep > 0 && sweep < 1 ? 1 : 0;
      const ref = scanRefs.current[k];
      if (ref) ref.position.y = N * MODULE * (1 - sweep);
    });
  });

  return (
    <group position={origin}>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.35, (START_Z + END_Z) / 2]}>
        <planeGeometry args={[30, START_Z - END_Z + 20]} />
        <meshStandardMaterial color={baseHex} roughness={0.9} />
      </mesh>
      <primitive object={mesh} />
      {scans.map((scan, k) => (
        <mesh key={`scan${k}`} ref={(el) => (scanRefs.current[k] = el)} position={[0, 0, codeZ(k) + 0.4]}>
          <planeGeometry args={[N * MODULE + 0.6, 0.18]} />
          <shaderMaterial args={[scan]} transparent depthWrite={false} blending={AdditiveBlending} />
        </mesh>
      ))}
      {glyphs.map((g, i) => (
        <Billboard key={`glyph${i}`} ref={(el) => (glyphRefs.current[i] = el)} position={[g.x, g.y, g.z]}>
          <mesh>
            <planeGeometry args={[0.9 * g.label.aspect, 0.9]} />
            <shaderMaterial args={[g.material]} transparent depthWrite={false} />
          </mesh>
        </Billboard>
      ))}
      <pointLight position={[0, 6, codeZ(1) + 4]} color={midHex} intensity={60} distance={40} decay={1.2} />
    </group>
  );
}
