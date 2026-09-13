import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, ShaderMaterial } from 'three';
import { PALETTE } from '../palette.js';
import { FILM_FREEZE } from '../testHooks.js';

/**
 * Re-entry heat at the frame's edges (S03): a camera-space quad that burns a faint, rippling
 * --fire glow into the borders of the view. Strength comes from `strengthRef.current` (0 to 1),
 * a pure function of the scene's progress set by the scene. One draw, drawn last, no depth.
 * This is an edge glow with animated ripples, not a refraction pass: the film has no
 * post-processing chain for S03 yet.
 */

const VERTEX = /* glsl */ `
  uniform vec2 uSize;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * vec4(position.xy * uSize, -1.0, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uStrength;
  uniform float uTime;
  uniform vec3 uFire;
  uniform vec3 uCore;
  varying vec2 vUv;
  void main() {
    vec2 c = vUv - 0.5;
    // Distance inside a rounded rectangle the size of the frame: a thin rim along every edge,
    // with softened corners (an ellipse filled the corners; a hard box showed square corners).
    float r = 0.09;
    vec2 q = abs(c) - (0.5 - r);
    float edge = -(length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r);
    // A thin shimmering rim: a few percent of the frame, never a border that eats the shot.
    float ripple = sin(atan(c.y, c.x) * 9.0 + uTime * 5.0) * 0.5 + 0.5;
    float band = smoothstep(0.045 + 0.012 * ripple, 0.0, edge);
    vec3 color = mix(uFire, uCore, band * band * 0.4);
    gl_FragColor = vec4(color * band * uStrength * 0.35, 1.0);
    #include <colorspace_fragment>
  }
`;

export default function HeatEdges({ strengthRef }) {
  const meshRef = useRef(null);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uSize: { value: [1, 1] },
          uStrength: { value: 0 },
          uTime: { value: 0 },
          uFire: { value: new Color(PALETTE.fire) },
          uCore: { value: new Color(PALETTE.flameCore) },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [],
  );

  useEffect(() => () => material.dispose(), [material]);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const strength = strengthRef.current;
    mesh.visible = strength > 0.001;
    if (!mesh.visible) return;
    const camera = state.camera;
    const height = 2 * Math.tan((camera.fov * Math.PI) / 360) * 1.02;
    material.uniforms.uSize.value = [height * camera.aspect, height];
    material.uniforms.uStrength.value = strength;
    if (!FILM_FREEZE) material.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <mesh ref={meshRef} material={material} visible={false} frustumCulled={false} renderOrder={950}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}
