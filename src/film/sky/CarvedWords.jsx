import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, CanvasTexture, Color, LinearFilter, SRGBColorSpace } from 'three';
import { PALETTE } from '../palette.js';

/**
 * Words the fox's tail carves into a cloud top (S03): a flat plane of type lying on the
 * layer, revealed left to right by a burning edge as the fox cuts through. The reveal is a
 * pure function of the scene's progress inside `range`, so scrolling back un-carves it.
 * Orange is allowed here: it is the fox's own fire left behind.
 */

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uReveal;
  uniform vec3 uColor;
  uniform vec3 uCore;
  varying vec2 vUv;
  void main() {
    float a = texture2D(uMap, vUv).a;
    float carved = 1.0 - smoothstep(uReveal - 0.03, uReveal, vUv.x);
    float edge = exp(-pow((vUv.x - uReveal) / 0.018, 2.0));
    vec3 color = mix(uColor, uCore, edge);
    float light = a * (carved * 1.1 + edge * 2.2);
    gl_FragColor = vec4(color * light, 1.0);
    #include <colorspace_fragment>
  }
`;

function drawWords(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 190;
  const font = (px) => `600 ${px}px "Mozilla Headline", "Zilla Slab", Georgia, serif`;
  ctx.font = font(size);
  while (ctx.measureText(text).width > canvas.width * 0.94 && size > 60) {
    size -= 6;
    ctx.font = font(size);
  }
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

/**
 * @param {{ text: string, position: [number, number, number], width?: number, progressRef: { current: number }, range: [number, number], tilt?: number }} props
 *   tilt: radians the words stand up from lying flat, so a camera beside the fox can read them
 */
export default function CarvedWords({ text, position, width = 56, progressRef, range, tilt = 0 }) {
  const meshRef = useRef(null);
  const material = useMemo(
    () => ({
      uniforms: {
        uMap: { value: drawWords(text) },
        uReveal: { value: 0 },
        uColor: { value: new Color(PALETTE.fire) },
        uCore: { value: new Color(PALETTE.flameCore) },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    }),
    [text],
  );

  useEffect(() => {
    let alive = true;
    document.fonts?.load('600 100px "Mozilla Headline"').then(() => {
      if (!alive) return;
      material.uniforms.uMap.value.dispose();
      material.uniforms.uMap.value = drawWords(text);
    });
    return () => {
      alive = false;
      material.uniforms.uMap.value.dispose();
    };
  }, [material, text]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const [a, b] = range;
    const t = Math.min(Math.max((progressRef.current - a) / (b - a), 0), 1);
    material.uniforms.uReveal.value = t * 1.04;
    mesh.visible = t > 0;
  });

  return (
    <mesh ref={meshRef} position={position} rotation={[-Math.PI / 2 + tilt, 0, 0]} visible={false} renderOrder={5}>
      <planeGeometry args={[width, width / 8]} />
      <shaderMaterial args={[material]} transparent depthWrite={false} blending={AdditiveBlending} />
    </mesh>
  );
}
