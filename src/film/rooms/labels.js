import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';

/**
 * Text drawn once into a canvas texture, for labels that live in 3D (leader-line labels, node
 * names, painted words). Returns the texture and its aspect ratio so a plane can match it.
 *
 * @param {string} text
 * @param {{ font?: string, size?: number, padding?: number }} [options]
 * @returns {{ texture: CanvasTexture, aspect: number }}
 */
export function textTexture(text, { font = '"Fira Code", ui-monospace, monospace', weight = 400, size = 64, padding = 24 } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const css = `${weight} ${size}px ${font}`;
  ctx.font = css;
  canvas.width = Math.ceil(ctx.measureText(text).width) + padding * 2;
  canvas.height = Math.ceil(size * 1.5);
  ctx.font = css;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, padding, canvas.height / 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return { texture, aspect: canvas.width / canvas.height };
}

/** Vertex shader for a textured plane. */
export const PLANE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Fragment shader for an alpha-masked label with a colour and an opacity. */
export const LABEL_FRAGMENT = /* glsl */ `
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

export const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
export const window01 = (p, a, b) => clamp01((p - a) / (b - a));
export const ease = (t) => t * t * (3 - 2 * t);
export const lerp = (a, b, t) => a + (b - a) * t;
