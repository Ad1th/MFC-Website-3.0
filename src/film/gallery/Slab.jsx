import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import { AdditiveBlending, Color, DoubleSide, RepeatWrapping } from 'three';
import { PALETTE } from '../palette.js';
import { FILM_FREEZE } from '../testHooks.js';
import { PLANE_VERTEX, textTexture } from '../rooms/labels.js';
import { SLAB_SIZE, SLAB_Y, slabFrame, slabYaw } from './layout.js';

const RING_RADIUS = 4.1;
const RING_HEIGHT = 0.7;

const RING_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uRepeat;
  uniform float uOpacity;
  uniform float uTime;
  uniform vec3 uFire;
  uniform vec3 uEmber;
  varying vec2 vUv;
  void main() {
    float u = vUv.x * uRepeat;
    // Seen through the ring from inside, the name would read backwards; flip it there.
    if (!gl_FrontFacing) u = -u;
    float a = texture2D(uMap, vec2(fract(u), vUv.y)).a;
    float flicker = 0.85 + 0.15 * sin(uTime * 11.0 + vUv.x * 60.0) * sin(uTime * 7.0 + vUv.y * 9.0);
    vec3 color = mix(uFire, uEmber, smoothstep(0.25, 0.95, vUv.y)) * flicker * 1.5;
    float facing = gl_FrontFacing ? 1.0 : 0.3;
    gl_FragColor = vec4(color * a * uOpacity * facing, 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * One project slab: a dark glass shell, the screenshot as an emissive plane on its front face,
 * and the project's name on a rotating ring of fire above it.
 *
 * stateRef.current = { visible, ring, angle, tiltX, tiltY }
 *   ring   0 to 1 opacity of the name ring
 *   angle  the ring's rotation in radians (a function of scroll)
 *   tilt   radians toward the cursor, at most 6 degrees
 */
export default function Slab({ index, name, texture, stateRef }) {
  const groupRef = useRef(null);
  const tiltRef = useRef(null);
  const ringRef = useRef(null);
  const position = useMemo(() => slabFrame(index, 0, SLAB_Y, 0), [index]);
  const yaw = useMemo(() => slabYaw(index), [index]);

  const label = useMemo(() => {
    const made = textTexture(`${name}    `, { weight: 600, size: 96 });
    made.texture.wrapS = RepeatWrapping;
    return made;
  }, [name]);
  const ring = useMemo(() => {
    const circumference = 2 * Math.PI * RING_RADIUS;
    const repeat = Math.max(1, Math.round(circumference / (RING_HEIGHT * label.aspect)));
    return {
      uniforms: {
        uMap: { value: label.texture },
        uRepeat: { value: repeat },
        uOpacity: { value: 0 },
        uTime: { value: 0 },
        uFire: { value: new Color(PALETTE.fire) },
        uEmber: { value: new Color(PALETTE.ember) },
      },
      vertexShader: PLANE_VERTEX,
      fragmentShader: RING_FRAGMENT,
    };
  }, [label]);
  useEffect(() => () => label.texture.dispose(), [label]);

  useFrame((state) => {
    const s = stateRef.current;
    if (groupRef.current) groupRef.current.visible = s.visible;
    if (!s.visible) return;
    if (tiltRef.current) {
      tiltRef.current.rotation.x = s.tiltX;
      tiltRef.current.rotation.y = s.tiltY;
    }
    if (ringRef.current) {
      ringRef.current.rotation.y = s.angle;
      ringRef.current.visible = s.ring > 0.001;
    }
    ring.uniforms.uOpacity.value = s.ring;
    ring.uniforms.uTime.value = FILM_FREEZE ? 0 : state.clock.elapsedTime;
  });

  const { width, height, depth } = SLAB_SIZE;
  return (
    <group ref={groupRef} position={position} rotation={[0, yaw, 0]}>
      <group ref={tiltRef}>
        <mesh>
          <boxGeometry args={[width, height, depth]} />
          <meshPhysicalMaterial color="#0c0b0e" roughness={0.06} metalness={0.2} clearcoat={1} clearcoatRoughness={0.05} transparent opacity={0.62} />
          <Edges threshold={15} color={PALETTE.ashDim} />
        </mesh>
        <mesh position={[0, 0, depth / 2 + 0.002]}>
          <planeGeometry args={[width - 0.3, height - 0.3]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
      </group>
      <mesh ref={ringRef} position={[0, height / 2 + 1.1, 0]} frustumCulled={false}>
        <cylinderGeometry args={[RING_RADIUS, RING_RADIUS, RING_HEIGHT, 96, 1, true]} />
        <shaderMaterial args={[ring]} transparent depthWrite={false} blending={AdditiveBlending} side={DoubleSide} />
      </mesh>
    </group>
  );
}
