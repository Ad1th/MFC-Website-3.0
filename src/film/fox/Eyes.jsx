import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, ShaderMaterial, Vector3 } from 'three';

/**
 * The fox's whole face: two pure white points riding the head bone. They never
 * bloom (colour stays at 1.0, below the bloom threshold) and blink by squashing
 * vertically. eyeState.current.scale comes from the behaviour engine.
 */

const vertex = /* glsl */ `
  uniform float uScale;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(0.0085 * uScale / -mv.z, 2.0, 7.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  uniform float uSquash;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    c.y /= max(uSquash, 0.08);
    if (dot(c, c) > 0.25) discard;
    gl_FragColor = vec4(1.0);
    #include <colorspace_fragment>
  }
`;

export default function Eyes({ rig, eyeState }) {
  const { geometry, material } = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(6), 3).setUsage(DynamicDrawUsage));
    const m = new ShaderMaterial({
      uniforms: { uScale: { value: 500 }, uSquash: { value: 1 } },
      vertexShader: vertex,
      fragmentShader: `#include <common>\n${fragment}`,
      depthWrite: false,
    });
    return { geometry: g, material: m };
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const left = useMemo(() => new Vector3(), []);
  const right = useMemo(() => new Vector3(), []);

  useFrame((state) => {
    rig.bones.head.localToWorld(left.copy(rig.eyesLocal.left));
    rig.bones.head.localToWorld(right.copy(rig.eyesLocal.right));
    const arr = geometry.attributes.position.array;
    left.toArray(arr, 0);
    right.toArray(arr, 3);
    geometry.attributes.position.needsUpdate = true;
    material.uniforms.uScale.value = state.size.height * state.viewport.dpr * 0.5 * state.camera.projectionMatrix.elements[5];
    material.uniforms.uSquash.value = eyeState.current.scale;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={3} />;
}
