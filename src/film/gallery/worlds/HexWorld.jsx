import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry, Float32BufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import { PALETTE } from '../../palette.js';
import { mulberry32 } from '../../fox/rig.js';
import { ease, lerp, window01 } from '../../rooms/labels.js';

/**
 * 03 TECH WARS: a glowing hex territory map. The fox runs a winding line across it and every
 * tile it claims flips over to orange; at the end the camera rises to show the claimed trail.
 * Tiles in the screenshot's neon blue over its near-black, inside a neon hex frame.
 */

const RADIUS = 6;
const STEP = 1.04;
const SQRT3 = Math.sqrt(3);
const RUN = [0.03, 0.82];

export const background = '#0b0b10';

const PATH = new CatmullRomCurve3(
  [
    [-8.5, 6.5],
    [-5, 3],
    [-6.5, -2],
    [-2.5, -5.5],
    [1.5, -2.5],
    [0, 1.5],
    [4, 4],
    [7.5, 0.5],
    [6, -5],
  ].map(([x, z]) => new Vector3(x, 0, z)),
);

/** Every tile, whether the fox's line claims it, and when (the path parameter nearest it). */
const TILES = (() => {
  const samples = Array.from({ length: 301 }, (_, s) => PATH.getPointAt(s / 300));
  const out = [];
  for (let q = -RADIUS; q <= RADIUS; q += 1) {
    for (let r = Math.max(-RADIUS, -q - RADIUS); r <= Math.min(RADIUS, -q + RADIUS); r += 1) {
      const x = SQRT3 * (q + r / 2) * STEP;
      const z = 1.5 * r * STEP;
      let best = Infinity;
      let bestT = 0;
      samples.forEach((point, s) => {
        const d = Math.hypot(point.x - x, point.z - z);
        if (d < best) {
          best = d;
          bestT = s / 300;
        }
      });
      out.push({ x, z, claim: best < 1.6, t: bestT });
    }
  }
  return out;
})();

const at = new Vector3();

export function fox(p, pose, input) {
  const t = window01(p, RUN[0], RUN[1]);
  PATH.getPointAt(t, pose.position);
  pose.position.y = 0.16;
  PATH.getTangentAt(t, pose.forward);
  pose.forward.setY(0).normalize();
  pose.up.set(0, 1, 0);
  if (p >= RUN[1]) {
    input.hint = 'sit';
    input.velocity = 0;
  }
}

export function camera(p, cam) {
  PATH.getPointAt(window01(p, RUN[0], RUN[1]), at);
  const end = ease(window01(p, RUN[1], 1));
  cam.position.set(lerp(at.x - 4.5, 0, end), lerp(7.5, 21, end), lerp(at.z + 7.5, 13, end));
  cam.target.set(lerp(at.x, 0, end), 0, lerp(at.z, -0.5, end));
  cam.fov = 50;
  cam.roll = 0;
}

const FIRE = new Color(PALETTE.fire);
const X_AXIS = new Vector3(1, 0, 0);
const ONE = new Vector3(1, 1, 1);
const position = new Vector3();
const turn = new Quaternion();
const matrix = new Matrix4();

export default function HexWorld({ progressRef, origin, colours }) {
  const [baseHex, deepHex, glowHex] = colours;
  const mesh = useMemo(() => {
    const instanced = new InstancedMesh(new CylinderGeometry(0.9, 0.9, 0.28, 6), new MeshBasicMaterial({ toneMapped: false }), TILES.length);
    instanced.frustumCulled = false;
    const rand = mulberry32(5);
    const cold = new Color(glowHex).multiplyScalar(0.45);
    const deep = new Color(deepHex);
    instanced.userData.base = TILES.map((_, i) => {
      const colour = cold.clone().lerp(deep, rand() * 0.35);
      instanced.setColorAt(i, colour);
      return colour;
    });
    return instanced;
  }, [glowHex, deepHex]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    },
    [mesh],
  );

  const outline = useMemo(() => {
    const r = SQRT3 * (RADIUS + 0.7) * STEP;
    const points = [];
    for (let k = 0; k <= 6; k += 1) {
      const angle = (k * Math.PI) / 3;
      points.push(Math.cos(angle) * r, 0.02, Math.sin(angle) * r);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
    return geometry;
  }, []);
  useEffect(() => () => outline.dispose(), [outline]);

  useFrame(() => {
    const runT = window01(progressRef.current, RUN[0], RUN[1]);
    TILES.forEach((tile, i) => {
      // A claimed tile flips over just behind the fox, so the flip never hides it.
      const flip = tile.claim ? window01(runT, tile.t + 0.006, tile.t + 0.036) : 0;
      position.set(tile.x, Math.sin(Math.PI * flip) * 0.3, tile.z);
      turn.setFromAxisAngle(X_AXIS, Math.PI * flip);
      matrix.compose(position, turn, ONE);
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, flip >= 0.5 ? FIRE : mesh.userData.base[i]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <group position={origin}>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.2, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshBasicMaterial color={baseHex} toneMapped={false} />
      </mesh>
      <primitive object={mesh} />
      <line geometry={outline}>
        <lineBasicMaterial color={glowHex} toneMapped={false} />
      </line>
    </group>
  );
}
