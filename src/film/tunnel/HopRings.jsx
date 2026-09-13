import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, CanvasTexture, Color, LinearFilter, Matrix4, Quaternion, SRGBColorSpace, Vector3 } from 'three';
import { PALETTE } from '../palette.js';

/**
 * Traceroute junctions (S04): a thin glowing ring around the tunnel at each hop, and a mono
 * label (`hop 04  mumbai ix`) set just inside the ring. A ring flares as the packet passes it
 * and the label flashes in, both as pure functions of `progressRef.current` along the tunnel.
 */

function labelTexture(text) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = '400 64px "Fira Code", ui-monospace, monospace';
  ctx.font = font;
  canvas.width = Math.ceil(ctx.measureText(text).width) + 40;
  canvas.height = 96;
  ctx.font = font;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 20, canvas.height / 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return { texture, aspect: canvas.width / canvas.height };
}

/** Hop numbers spread across 01 to 10, the way a real route skips hops that don't answer. */
export function hopNumbers(count) {
  if (count <= 1) return ['01'];
  return Array.from({ length: count }, (_, i) => String(Math.round(1 + (i * 9) / (count - 1))).padStart(2, '0'));
}

const RING_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFlare;
  void main() {
    gl_FragColor = vec4(uColor * (0.25 + 2.2 * uFlare), 1.0);
    #include <colorspace_fragment>
  }
`;

const LABEL_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float a = texture2D(uMap, vUv).a;
    gl_FragColor = vec4(uColor * a * uOpacity, 1.0);
    #include <colorspace_fragment>
  }
`;

const LABEL_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RING_VERTEX = /* glsl */ `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const up = new Vector3(0, 1, 0);
const basis = new Matrix4();
const side = new Vector3();
const normal = new Vector3();

/**
 * @param {{ curve: import('three').Curve, hops: string[], at: number[], progressRef: { current: number }, radius?: number }} props
 *   at: tunnel position (0 to 1) of each hop, same length as hops
 */
export default function HopRings({ curve, hops, at, progressRef, radius = 2.2 }) {
  const numbers = useMemo(() => hopNumbers(hops.length), [hops]);
  const items = useMemo(
    () =>
      hops.map((name, i) => {
        const t = at[i];
        const position = curve.getPointAt(t);
        const tangent = curve.getTangentAt(t).normalize();
        side.crossVectors(up, tangent).normalize();
        normal.crossVectors(tangent, side).normalize();
        basis.makeBasis(side, normal, tangent);
        const quaternion = new Quaternion().setFromRotationMatrix(basis);
        const label = labelTexture(`hop ${numbers[i]}  ${name}`);
        return {
          t,
          position,
          quaternion,
          label,
          ring: { uniforms: { uColor: { value: new Color(PALETTE.fire) }, uFlare: { value: 0 } }, vertexShader: RING_VERTEX, fragmentShader: RING_FRAGMENT },
          text: {
            uniforms: { uMap: { value: label.texture }, uColor: { value: new Color(PALETTE.ash) }, uOpacity: { value: 0 } },
            vertexShader: LABEL_VERTEX,
            fragmentShader: LABEL_FRAGMENT,
          },
        };
      }),
    [curve, hops, at, numbers],
  );

  useEffect(() => () => items.forEach((item) => item.label.texture.dispose()), [items]);

  const groups = useRef([]);
  useFrame(() => {
    const p = progressRef.current;
    items.forEach((item) => {
      const d = p - item.t;
      // Flares as the packet passes, then settles to a faint glow behind it.
      item.ring.uniforms.uFlare.value = Math.exp(-Math.pow(d / 0.012, 2));
      const seen = Math.min(Math.max((p - (item.t - 0.06)) / 0.03, 0), 1);
      const passed = Math.min(Math.max((p - (item.t + 0.02)) / 0.03, 0), 1);
      item.text.uniforms.uOpacity.value = seen * (1 - 0.7 * passed);
    });
  });

  const labelHeight = radius * 0.16;
  return items.map((item, i) => (
    <group
      key={`${i}-${item.t}`}
      ref={(el) => {
        groups.current[i] = el;
      }}
      position={item.position}
      quaternion={item.quaternion}
    >
      <mesh frustumCulled={false}>
        <torusGeometry args={[radius * 0.98, 0.012, 8, 96]} />
        <shaderMaterial args={[item.ring]} transparent depthWrite={false} blending={AdditiveBlending} />
      </mesh>
      <mesh position={[-radius * 0.45, radius * 0.62, 0]} rotation={[0, Math.PI, 0]} frustumCulled={false}>
        <planeGeometry args={[labelHeight * item.label.aspect, labelHeight]} />
        <shaderMaterial args={[item.text]} transparent depthWrite={false} blending={AdditiveBlending} />
      </mesh>
    </group>
  ));
}
