import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CanvasTexture, Color, LinearFilter, Plane, Raycaster, ShaderMaterial, SRGBColorSpace, Vector2, Vector3 } from 'three';
import { PALETTE } from '../palette.js';
import { FILM_FREEZE } from '../testHooks.js';
import { FLOOR_Y, WORDMARK, floorToUv, oMark } from './layout.js';

/**
 * FIREFOX burned into the floor (S11). The letters are still molten: a heat shimmer bends them
 * and the glow flickers. The cursor cools a dark trail through them. The trail is a small heat
 * map (a 2D canvas uploaded as a texture) that the cursor paints dark and that fades back to hot
 * every frame. The O glows brighter under a sleeping fox (`oGlowRef`).
 *
 * `onCool(u, v)` reports where the cursor is cooling, for the fox's reactions.
 */

const HEAT_W = 256;
const HEAT_H = 64;
const REHEAT_PER_SECOND = 0.45;

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uWord;
  uniform sampler2D uHeat;
  uniform float uTime;
  uniform float uOGlow;
  uniform vec2 uO;
  uniform vec3 uDeep;
  uniform vec3 uFire;
  uniform vec3 uEmber;
  uniform vec3 uCore;
  varying vec2 vUv;

  void main() {
    float heatMap = texture2D(uHeat, vUv).r;
    // The O is warmest, and warmer still under a sleeping fox.
    vec2 dO = (vUv - uO) * vec2(4.0, 1.0);
    float o = exp(-dot(dO, dO) * 9.0);
    float heat = clamp(heatMap * (0.82 + 0.18 * o) + o * uOGlow * 0.45, 0.0, 1.2);

    // Shimmer: the hotter, the more the air bends the letters.
    vec2 wobble = vec2(sin(vUv.y * 70.0 + uTime * 3.1) + sin(vUv.y * 23.0 - uTime * 1.7), cos(vUv.x * 55.0 - uTime * 2.3)) * 0.0016 * heatMap;
    float ink = texture2D(uWord, vUv + wobble).a;
    float halo = 0.0;
    halo += texture2D(uWord, vUv + vec2(0.006, 0.0)).a;
    halo += texture2D(uWord, vUv - vec2(0.006, 0.0)).a;
    halo += texture2D(uWord, vUv + vec2(0.0, 0.022)).a;
    halo += texture2D(uWord, vUv - vec2(0.0, 0.022)).a;
    halo *= 0.25;

    float flicker = 0.9 + 0.1 * sin(uTime * 6.3 + vUv.x * 31.0) * sin(uTime * 2.9 + vUv.y * 17.0);
    vec3 molten = mix(uDeep, uFire, smoothstep(0.1, 0.7, heat));
    molten = mix(molten, uEmber, smoothstep(0.6, 0.95, heat));
    molten = mix(molten, uCore, smoothstep(0.95, 1.2, heat) * 0.7);
    vec3 crust = vec3(0.075, 0.045, 0.035);
    vec3 letter = mix(crust, molten * flicker * 1.35, smoothstep(0.05, 0.6, heat));
    vec3 glow = uFire * halo * 0.4 * heat * flicker;
    float alpha = max(ink, halo * 0.55 * heat);
    gl_FragColor = vec4(letter * ink + glow * (1.0 - ink), alpha);
    #include <colorspace_fragment>
  }
`;

function drawWord(canvas) {
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  let size = 380;
  context.font = `400 ${size}px apex, "Mozilla Headline", sans-serif`;
  const fit = (canvas.width * 0.94) / context.measureText(WORDMARK.text).width;
  size = Math.min(size * fit, canvas.height * 0.9);
  context.font = `400 ${size}px apex, "Mozilla Headline", sans-serif`;
  context.textBaseline = 'middle';
  context.fillStyle = '#fff';
  const total = context.measureText(WORDMARK.text).width;
  const x0 = (canvas.width - total) / 2;
  context.fillText(WORDMARK.text, x0, canvas.height / 2);
  // The O's centre from the glyph widths.
  const index = WORDMARK.text.indexOf('O');
  const before = context.measureText(WORDMARK.text.slice(0, index)).width;
  const oWidth = context.measureText('O').width;
  oMark.u = (x0 + before + oWidth / 2) / canvas.width;
  oMark.v = 0.5;
}

const ndc = new Vector2();
const raycaster = new Raycaster();
const floor = new Plane(new Vector3(0, 1, 0), -FLOOR_Y);
const hit = new Vector3();

/** @param {{ oGlowRef: { current: number }, onCool?: (u: number, v: number) => void, heatRef?: { current: null|((u: number, v: number) => number) } }} props */
export default function Wordmark({ oGlowRef, onCool, heatRef }) {
  const { camera } = useThree();
  const pointer = useRef({ x: 0, y: 0, inside: false });

  const { wordCanvas, wordTexture, heatCanvas, heatTexture, material } = useMemo(() => {
    const wc = document.createElement('canvas');
    wc.width = 2048;
    wc.height = 512;
    drawWord(wc);
    const wt = new CanvasTexture(wc);
    wt.colorSpace = SRGBColorSpace;
    wt.anisotropy = 8;
    const hc = document.createElement('canvas');
    hc.width = HEAT_W;
    hc.height = HEAT_H;
    const hctx = hc.getContext('2d', { willReadFrequently: true });
    hctx.fillStyle = '#fff';
    hctx.fillRect(0, 0, HEAT_W, HEAT_H);
    const ht = new CanvasTexture(hc);
    ht.minFilter = LinearFilter;
    ht.magFilter = LinearFilter;
    const m = new ShaderMaterial({
      uniforms: {
        uWord: { value: wt },
        uHeat: { value: ht },
        uTime: { value: 0 },
        uOGlow: { value: 0 },
        uO: { value: new Vector2(oMark.u, oMark.v) },
        uDeep: { value: new Color('#4a1203') },
        uFire: { value: new Color(PALETTE.fire) },
        uEmber: { value: new Color(PALETTE.ember) },
        uCore: { value: new Color(PALETTE.flameCore) },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    return { wordCanvas: wc, wordTexture: wt, heatCanvas: hc, heatTexture: ht, material: m };
  }, []);

  // Redraw once apex has loaded; the first draw may have used the fallback face.
  useEffect(() => {
    let cancelled = false;
    document.fonts
      ?.load('400 200px apex')
      .then(() => {
        if (cancelled) return;
        drawWord(wordCanvas);
        wordTexture.needsUpdate = true;
        material.uniforms.uO.value.set(oMark.u, oMark.v);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [wordCanvas, wordTexture, material]);

  useEffect(() => {
    const onMove = (event) => {
      pointer.current.x = event.clientX;
      pointer.current.y = event.clientY;
      pointer.current.inside = true;
    };
    const onLeave = () => {
      pointer.current.inside = false;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      wordTexture.dispose();
      heatTexture.dispose();
      material.dispose();
    };
  }, [wordTexture, heatTexture, material]);

  useEffect(() => {
    if (!heatRef) return undefined;
    const context = heatCanvas.getContext('2d', { willReadFrequently: true });
    heatRef.current = (u, v) => {
      const x = Math.min(HEAT_W - 1, Math.max(0, Math.round(u * HEAT_W)));
      const y = Math.min(HEAT_H - 1, Math.max(0, Math.round((1 - v) * HEAT_H)));
      return context.getImageData(x, y, 1, 1).data[0] / 255;
    };
    return () => {
      heatRef.current = null;
    };
  }, [heatRef, heatCanvas]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 20);
    const context = heatCanvas.getContext('2d', { willReadFrequently: true });
    // Everything slowly reheats: an additive step, so it climbs all the way back (a blended
    // low-alpha fill rounds to nothing in 8 bits and stalls short of white).
    context.globalCompositeOperation = 'lighter';
    context.fillStyle = `rgba(255, 255, 255, ${Math.max(2 / 255, Math.min(1, REHEAT_PER_SECOND * dt))})`;
    context.fillRect(0, 0, HEAT_W, HEAT_H);
    context.globalCompositeOperation = 'source-over';

    const p = pointer.current;
    if (p.inside) {
      ndc.set((p.x / window.innerWidth) * 2 - 1, -(p.y / window.innerHeight) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(floor, hit)) {
        const { u, v, inside } = floorToUv(hit);
        if (u > -0.05 && u < 1.05 && v > -0.2 && v < 1.2) {
          const x = u * HEAT_W;
          const y = (1 - v) * HEAT_H;
          const gradient = context.createRadialGradient(x, y, 0, x, y, 9);
          gradient.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
          gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
          context.fillStyle = gradient;
          context.beginPath();
          context.ellipse(x, y, 9, 9 * 2.2, 0, 0, Math.PI * 2);
          context.fill();
          if (inside) onCool?.(u, v);
        }
      }
    }
    heatTexture.needsUpdate = true;
    material.uniforms.uTime.value = FILM_FREEZE ? 0 : state.clock.elapsedTime;
    material.uniforms.uOGlow.value = oGlowRef.current;
  });

  return (
    <>
      <mesh position={[WORDMARK.centre.x, FLOOR_Y - 0.01, WORDMARK.centre.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[60, 60]} />
        <meshBasicMaterial color="#050403" />
      </mesh>
      <mesh position={WORDMARK.centre} rotation={[-Math.PI / 2, 0, 0]} material={material} renderOrder={4}>
        <planeGeometry args={[WORDMARK.width, WORDMARK.height]} />
      </mesh>
    </>
  );
}
