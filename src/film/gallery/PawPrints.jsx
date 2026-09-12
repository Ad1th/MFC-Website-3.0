import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, ShaderMaterial, Vector3 } from 'three';
import { PALETTE } from '../palette.js';
import { FILM_FREEZE } from '../testHooks.js';

/**
 * Glowing paw prints on the mirror floor. A print is stamped every stride while the fox runs the
 * floor, alternating left and right of its path, and cools from white-hot through fire to nothing
 * over two seconds. One instanced draw; the oldest print is reused.
 *
 * trackRef.current = { position: Vector3, forward: Vector3, onFloor: boolean }
 */

const MAX = 48;
const STRIDE = 0.55;
const COOL_SECONDS = 2;
const UP = new Vector3(0, 1, 0);
const FLAT = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
const ONE = new Vector3(1, 1, 1);

const vertexShader = /* glsl */ `
  attribute float aStamp;
  uniform float uNow;
  varying vec2 vUv;
  varying float vHeat;
  void main() {
    vUv = uv;
    vHeat = clamp(1.0 - (uNow - aStamp) / ${COOL_SECONDS.toFixed(1)}, 0.0, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uFire;
  uniform vec3 uCore;
  varying vec2 vUv;
  varying float vHeat;
  float disc(vec2 p, vec2 c, float r) {
    return smoothstep(r, r * 0.55, length(p - c));
  }
  void main() {
    vec2 p = vUv - 0.5;
    float pad = smoothstep(0.2, 0.13, length((p - vec2(0.0, -0.12)) * vec2(1.0, 1.3)));
    float toes = disc(p, vec2(-0.17, 0.12), 0.085) + disc(p, vec2(-0.06, 0.22), 0.085) + disc(p, vec2(0.06, 0.22), 0.085) + disc(p, vec2(0.17, 0.12), 0.085);
    float shape = clamp(pad + toes, 0.0, 1.0);
    vec3 color = mix(uFire, uCore, vHeat * vHeat) * vHeat * shape * 1.6;
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

const forward = new Vector3();
const right = new Vector3();
const at = new Vector3();
const yaw = new Quaternion();
const turn = new Quaternion();
const matrix = new Matrix4();

export default function PawPrints({ trackRef }) {
  const mesh = useMemo(() => {
    const geometry = new PlaneGeometry(0.2, 0.26);
    geometry.setAttribute('aStamp', new InstancedBufferAttribute(new Float32Array(MAX).fill(-1000), 1));
    const material = new ShaderMaterial({
      uniforms: { uNow: { value: 0 }, uFire: { value: new Color(PALETTE.fire) }, uCore: { value: new Color(PALETTE.flameCore) } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const instanced = new InstancedMesh(geometry, material, MAX);
    instanced.frustumCulled = false;
    const hidden = new Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX; i += 1) instanced.setMatrixAt(i, hidden);
    return instanced;
  }, []);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    },
    [mesh],
  );

  const last = useRef(null);
  const next = useRef(0);
  const side = useRef(1);

  useFrame((state) => {
    const now = FILM_FREEZE ? 0 : state.clock.elapsedTime;
    mesh.material.uniforms.uNow.value = now;
    const track = trackRef.current;
    if (!track.onFloor) {
      last.current = null;
      return;
    }
    if (last.current && last.current.distanceTo(track.position) < STRIDE) return;
    forward.copy(track.forward).setY(0);
    if (forward.lengthSq() < 1e-6) return;
    forward.normalize();
    last.current = (last.current ?? new Vector3()).copy(track.position);

    side.current = -side.current;
    right.set(-forward.z, 0, forward.x);
    at.copy(track.position).addScaledVector(right, 0.12 * side.current);
    at.y += 0.012;
    // The print's toes (its +y) lie along the fox's heading.
    turn.setFromAxisAngle(UP, Math.atan2(-forward.x, -forward.z));
    yaw.copy(turn).multiply(FLAT);
    matrix.compose(at, yaw, ONE);

    const i = next.current;
    next.current = (i + 1) % MAX;
    mesh.setMatrixAt(i, matrix);
    mesh.instanceMatrix.needsUpdate = true;
    const stamps = mesh.geometry.getAttribute('aStamp');
    stamps.setX(i, now);
    stamps.needsUpdate = true;
  });

  return <primitive object={mesh} />;
}
