import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BackSide, CanvasTexture, Color, LinearFilter, SRGBColorSpace, TubeGeometry } from 'three';
import { PALETTE } from '../palette.js';
import { FILM_FREEZE } from '../testHooks.js';

/**
 * The fibre as a tunnel of text (S04). A tube along `curve`, seen from inside. The about lines
 * run along the tunnel floor and are revealed letter by
 * letter by `revealRef.current` (0 to 1 along the tunnel): a pure function of scroll, so
 * scrolling back un-reveals them letter by letter. The reveal edge burns in --fire; revealed
 * text cools to --ash. Faint scan lines stream past to sell the speed.
 */

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vView;
  varying vec3 vNormalWorld;
  void main() {
    vUv = uv;
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    vView = view.xyz;
    gl_Position = projectionMatrix * view;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uText;
  uniform float uReveal;
  uniform float uTextStart;
  uniform float uTextEnd;
  uniform float uTime;
  uniform vec3 uAsh;
  uniform vec3 uFire;
  uniform vec3 uWall;
  varying vec2 vUv;
  varying vec3 vView;
  varying vec3 vNormalWorld;
  void main() {
    // u runs along the tunnel. The text lies on the floor only, like road markings read toward
    // the horizon: wrapped round the tube it read mirrored or upside down on the walls and ceiling.
    float along = vUv.x;
    float span = uTextEnd - uTextStart;
    float tx = (along - uTextStart) / span;
    float inText = step(0.0, tx) * step(tx, 1.0);
    // Outward normals: the floor's points down. Angle from straight down, across the floor.
    float across = atan(vNormalWorld.x, -vNormalWorld.y);
    float ty = across / 1.1 + 0.5;
    float inBand = step(0.0, ty) * step(ty, 1.0);
    float glyph = texture2D(uText, vec2(clamp(tx, 0.0, 1.0), 1.0 - clamp(ty, 0.0, 1.0))).a * inText * inBand;

    float revealed = 1.0 - smoothstep(uReveal - 0.004, uReveal, along);
    float edge = exp(-pow((along - uReveal) / 0.01, 2.0));

    vec3 color = uWall * (0.35 + 0.65 * fract(vUv.y * 9.0 + along * 40.0));
    float scan = pow(0.5 + 0.5 * sin(along * 900.0 - uTime * 30.0), 24.0) * 0.08;
    color += uFire * scan;
    color = mix(color, uAsh, glyph * revealed);
    color += uFire * glyph * edge * 2.2;

    float fog = exp(-length(vView) * 0.045);
    gl_FragColor = vec4(color * fog, 1.0);
    #include <colorspace_fragment>
  }
`;

/** One long strip of the about lines, joined with wide gaps between sentences. */
function drawLines(lines) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = '600 110px "Mozilla Headline", "Zilla Slab", Georgia, serif';
  ctx.font = font;
  const gap = 360;
  const widths = lines.map((line) => Math.ceil(ctx.measureText(line).width));
  const width = widths.reduce((a, b) => a + b, 0) + gap * (lines.length + 1);
  canvas.width = Math.min(16384, width);
  canvas.height = 160;
  ctx.font = font;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  let x = gap;
  const scale = canvas.width / width;
  ctx.setTransform(scale, 0, 0, 1, 0, 0);
  lines.forEach((line, i) => {
    ctx.fillText(line, x, canvas.height / 2);
    x += widths[i] + gap;
  });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.anisotropy = 8;
  return texture;
}

/**
 * @param {{ curve: import('three').Curve, lines: string[], revealRef: { current: number }, radius?: number, textSpan?: [number, number] }} props
 */
export default function TextTunnel({ curve, lines, revealRef, radius = 2.2, textSpan = [0.1, 0.72] }) {
  const meshRef = useRef(null);
  const geometry = useMemo(() => new TubeGeometry(curve, 400, radius, 48, false), [curve, radius]);
  const material = useMemo(
    () => ({
      uniforms: {
        uText: { value: drawLines(lines) },
        uReveal: { value: 0 },
        uTextStart: { value: textSpan[0] },
        uTextEnd: { value: textSpan[1] },
        uTime: { value: 0 },
        uAsh: { value: new Color(PALETTE.ash) },
        uFire: { value: new Color(PALETTE.fire) },
        uWall: { value: new Color('#120d0b') },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    }),
    [lines, textSpan],
  );

  useEffect(() => {
    let alive = true;
    document.fonts?.load('600 100px "Mozilla Headline"').then(() => {
      if (!alive) return;
      material.uniforms.uText.value.dispose();
      material.uniforms.uText.value = drawLines(lines);
    });
    return () => {
      alive = false;
      material.uniforms.uText.value.dispose();
    };
  }, [material, lines]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state) => {
    material.uniforms.uReveal.value = revealRef.current;
    if (!FILM_FREEZE) material.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <mesh ref={meshRef} geometry={geometry} frustumCulled={false}>
      <shaderMaterial args={[material]} side={BackSide} />
    </mesh>
  );
}
