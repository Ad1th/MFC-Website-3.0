import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CanvasTexture, Color, LinearFilter, Plane, Ray, SRGBColorSpace, Vector2, Vector3 } from 'three';
import { PALETTE } from '../palette.js';

/**
 * S01 title: MOZILLA FIREFOX CLUB set so large behind the planet that only fragments fit
 * the frame. Letters near the globe's limb are lensed: the fragment shader pulls its
 * sample outward from the globe's centre (as seen from the camera, projected onto the
 * title plane) by strength * R² / r, the thin-lens deflection, so type close to the
 * planet stretches around it like light bending in gravity.
 * Decorative (the DOM carries the real title); drawn into a canvas with the page font.
 */

const WORDS = 'MOZILLA FIREFOX CLUB';

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec2 uCentre;   // globe centre in plane uv
  uniform float uRadius;  // globe apparent radius in plane uv-height units
  uniform float uAspect;  // plane width / height
  uniform float uStrength;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec2 d = (vUv - uCentre) * vec2(uAspect, 1.0);
    float r = length(d);
    float R = uRadius;
    // Thin-lens deflection outside the disc, fading out within about one radius of the
    // limb so only letters close to the planet bend; inside, the planet hides the title.
    float falloff = exp(-max(r - R, 0.0) / (R * 0.6));
    float deflect = uStrength * R * R / max(r, R) * falloff;
    vec2 sampleUv = vUv - normalize(d + 1e-6) * deflect / vec2(uAspect, 1.0);
    float a = texture2D(uMap, sampleUv).a;
    // A faint ember glow where the light bends hardest.
    float ring = exp(-pow((r - R * 1.04) / (R * 0.08), 2.0));
    float alpha = a * uOpacity;
    gl_FragColor = vec4(uColor * (1.0 + 0.35 * ring), alpha);
    #include <colorspace_fragment>
  }
`;

function drawTitle() {
  const canvas = document.createElement('canvas');
  canvas.width = 4096;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  let size = 700;
  const font = (px) => `600 ${px}px "Mozilla Headline", "Zilla Slab", Georgia, serif`;
  ctx.font = font(size);
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${-0.03 * size}px`;
  while (ctx.measureText(WORDS).width > canvas.width * 0.98 && size > 100) {
    size -= 10;
    ctx.font = font(size);
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${-0.03 * size}px`;
  }
  ctx.fillText(WORDS, canvas.width / 2, canvas.height / 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

const ray = new Ray();
const plane = new Plane();
const hit = new Vector3();
const normal = new Vector3();
const local = new Vector3();
const toGlobe = new Vector3();

/**
 * @param {{ globeCentre: Vector3, globeRadius: number, position: [number, number, number], width: number, opacityRef?: { current: number } }} props
 */
export default function LensedTitle({ globeCentre, globeRadius, position, width = 60, strength = 0.12, opacityRef }) {
  const meshRef = useRef(null);
  const { camera } = useThree();
  const aspect = 4;
  const height = width / aspect;

  const material = useMemo(() => {
    const texture = drawTitle();
    return {
      uniforms: {
        uMap: { value: texture },
        uCentre: { value: new Vector2(0.5, 0.5) },
        uRadius: { value: 0.1 },
        uAspect: { value: aspect },
        uStrength: { value: strength },
        uColor: { value: new Color(PALETTE.ash) },
        uOpacity: { value: 0.9 },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    };
  }, [strength]);

  useEffect(() => {
    // Redraw once the page font has arrived, so the title never ships in the fallback face.
    let alive = true;
    document.fonts?.load('600 100px "Mozilla Headline"').then(() => {
      if (!alive) return;
      material.uniforms.uMap.value.dispose();
      material.uniforms.uMap.value = drawTitle();
    });
    return () => {
      alive = false;
    };
  }, [material]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    // Where the camera sees the globe's centre on the title plane, and how big the disc is there.
    mesh.updateWorldMatrix(true, false);
    normal.set(0, 0, 1).transformDirection(mesh.matrixWorld);
    plane.setFromNormalAndCoplanarPoint(normal, mesh.getWorldPosition(local));
    toGlobe.copy(globeCentre).sub(camera.position);
    const globeDistance = toGlobe.length();
    ray.set(camera.position, toGlobe.normalize());
    if (!ray.intersectPlane(plane, hit)) return;
    const planeDistance = hit.distanceTo(camera.position);
    const apparent = globeRadius * (planeDistance / globeDistance);
    mesh.worldToLocal(local.copy(hit));
    material.uniforms.uCentre.value.set(local.x / width + 0.5, local.y / height + 0.5);
    material.uniforms.uRadius.value = apparent / height;
    material.uniforms.uOpacity.value = 0.9 * (opacityRef ? opacityRef.current : 1);
  });

  return (
    <mesh ref={meshRef} position={position} renderOrder={-5}>
      <planeGeometry args={[width, height]} />
      <shaderMaterial args={[material]} transparent depthWrite={false} />
    </mesh>
  );
}
