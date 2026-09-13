import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  DataTexture,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  NearestFilter,
  RedFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
} from 'three';
import { domains } from '../../content/index.js';
import { PALETTE } from '../palette.js';
import { FILM_FREEZE } from '../testHooks.js';
import { LABEL_FRAGMENT, PLANE_VERTEX, ease, textTexture, window01 } from './labels.js';

/**
 * ROOM ONE: TECHNICAL, "THE SOURCE" (S05). A cathedral of falling code, and the code is this
 * website's own source: the film's shaders and scripts are imported raw at build time (a lazy
 * Vite glob, loaded when the room mounts) and streamed down instanced monolith columns. The fox
 * runs along the floor and up a wall as gravity turns 90 degrees; monoliths ignite and leader
 * lines draw out to the five sub-domains. The floor reads TECHNICAL. Near the top, for exactly one
 * frame, one column's characters rearrange into an ASCII fox.
 */

const SOURCES = import.meta.glob('/src/film/**/*.{glsl,js,jsx}', { query: '?raw', import: 'default', eager: false });

export const SOURCE_COLUMNS = 26;
const COLUMN_HEIGHT = 26;
const COLUMN_WIDTH = 1.1;
const ROWS = 64;
const COLS_PER_COLUMN = 3;
const STREAM_WIDTH = 1024;
/** The wall the fox climbs stands at x = WALL_X; the corridor floor runs along -z. */
export const WALL_X = -5;
export const CORRIDOR_LENGTH = 40;

const ASCII_FOX = [
  '   /\\   /\\   ',
  '  /  \\_/  \\  ',
  ' |  o   o  | ',
  '  \\   v   /  ',
  '   \\_____/   ',
  '    |   |    ',
  '   /  |  \\~~ ',
].join('');

/** Printable ASCII glyph atlas, 16 x 6 cells, white on transparent. */
function glyphAtlas() {
  const cell = 32;
  const canvas = document.createElement('canvas');
  canvas.width = 16 * cell;
  canvas.height = 6 * cell;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.font = `500 ${cell * 0.78}px "Fira Code", ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let code = 32; code < 128; code += 1) {
    const i = code - 32;
    ctx.fillText(String.fromCharCode(code), (i % 16) * cell + cell / 2, Math.floor(i / 16) * cell + cell / 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

/** The source text as a single-channel data texture of character codes, STREAM_WIDTH wide. */
function streamTexture(text) {
  const clean = text.replace(/[^\x20-\x7e]/g, ' ');
  const height = Math.max(1, Math.ceil(clean.length / STREAM_WIDTH));
  const data = new Uint8Array(STREAM_WIDTH * height).fill(32);
  for (let i = 0; i < clean.length; i += 1) data[i] = clean.charCodeAt(i);
  const texture = new DataTexture(data, STREAM_WIDTH, height, RedFormat, UnsignedByteType);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.needsUpdate = true;
  return { texture, length: clean.length };
}

const VERTEX = /* glsl */ `
  attribute vec4 aColumn; // x: seed offset, y: speed, z: ignite order 0..1, w: is-ascii column
  varying vec3 vLocal;
  varying vec4 vColumn;
  varying vec3 vNormalLocal;
  void main() {
    vLocal = position;
    vColumn = aColumn;
    vNormalLocal = normal;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform sampler2D uStream;
  uniform vec2 uStreamSize;
  uniform float uStreamLength;
  uniform float uTime;
  uniform float uIgnite;
  uniform float uAscii;
  uniform sampler2D uAsciiFox;
  uniform vec3 uFire;
  uniform vec3 uCode;
  varying vec3 vLocal;
  varying vec4 vColumn;
  varying vec3 vNormalLocal;
  const float ROWS = ${ROWS.toFixed(1)};
  const float COLS = ${COLS_PER_COLUMN.toFixed(1)};
  void main() {
    // Glyph grid on the column's faces: box is 1 x 1 x 1 in local space (scaled by the instance).
    vec2 face = abs(vNormalLocal.x) > 0.5 ? vLocal.zy : vLocal.xy;
    vec2 grid = vec2((face.x + 0.5) * COLS, (face.y + 0.5) * ROWS);
    vec2 cellId = floor(grid);
    vec2 inCell = fract(grid);

    // Falling: each column scrolls through the source at its own speed.
    float fall = floor(uTime * vColumn.y * 6.0);
    float index = mod(vColumn.x * 9973.0 + (ROWS - cellId.y + fall) * COLS + cellId.x, uStreamLength);
    vec2 streamUv = vec2((mod(index, uStreamSize.x) + 0.5) / uStreamSize.x, (floor(index / uStreamSize.x) + 0.5) / uStreamSize.y);
    float code = texture2D(uStream, streamUv).r * 255.0;

    // For one frame near the top, the ASCII column shows a fox instead of source.
    if (vColumn.w > 0.5 && uAscii > 0.5) {
      vec2 foxCell = vec2(cellId.x, ROWS - 1.0 - cellId.y);
      code = texture2D(uAsciiFox, vec2((mod(cellId.x * 4.0, 13.0) + 0.5) / 13.0, (mod(foxCell.y, 7.0) + 0.5) / 7.0)).r * 255.0;
    }

    float glyphIndex = max(code - 32.0, 0.0);
    vec2 atlasUv = (vec2(mod(glyphIndex, 16.0), floor(glyphIndex / 16.0)) + vec2(inCell.x, 1.0 - inCell.y)) / vec2(16.0, 6.0);
    float glyph = texture2D(uAtlas, vec2(atlasUv.x, 1.0 - atlasUv.y)).a;

    // Brighter toward the head of the fall; ignited columns burn in fire.
    float head = fract((cellId.y + fall) / 17.0);
    float lit = step(vColumn.z, uIgnite);
    vec3 color = mix(uCode, uFire, lit) * glyph * (0.35 + 0.9 * pow(head, 3.0));
    color += uCode * 0.02;
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * @param {{ progressRef: { current: number }, origin: Vector3, tier: number }} props
 */
export default function SourceRoom({ progressRef, origin, tier }) {
  const [source, setSource] = useState('');
  const subs = useMemo(() => domains.find((d) => d.key === 'technical')?.subs ?? [], []);

  // The site's own source, fox shader first, loaded lazily when the room mounts.
  useEffect(() => {
    let alive = true;
    const keys = Object.keys(SOURCES).sort((a, b) => (a.includes('fox/shaders') ? -1 : 0) - (b.includes('fox/shaders') ? -1 : 0));
    Promise.all(keys.slice(0, 40).map((k) => SOURCES[k]())).then((texts) => {
      if (alive) setSource(texts.join('\n'));
    });
    return () => {
      alive = false;
    };
  }, []);

  const count = tier >= 3 ? SOURCE_COLUMNS : tier === 2 ? 20 : 12;

  const mesh = useMemo(() => {
    const atlas = glyphAtlas();
    const stream = streamTexture(source || 'loading the source'.repeat(40));
    const asciiData = new Uint8Array(13 * 7);
    for (let i = 0; i < 13 * 7; i += 1) asciiData[i] = ASCII_FOX.charCodeAt(i) || 32;
    const asciiTexture = new DataTexture(asciiData, 13, 7, RedFormat, UnsignedByteType);
    asciiTexture.minFilter = NearestFilter;
    asciiTexture.magFilter = NearestFilter;
    asciiTexture.needsUpdate = true;
    const material = new ShaderMaterial({
      uniforms: {
        uAtlas: { value: atlas },
        uStream: { value: stream.texture },
        uStreamSize: { value: [STREAM_WIDTH, stream.texture.image.height] },
        uStreamLength: { value: stream.length },
        uTime: { value: 0 },
        uIgnite: { value: 0 },
        uAscii: { value: 0 },
        uAsciiFox: { value: asciiTexture },
        uFire: { value: new Color(PALETTE.fire) },
        uCode: { value: new Color('#6f8a7a') },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    });
    const instanced = new InstancedMesh(new BoxGeometry(1, 1, 1), material, count);
    const columns = new Float32Array(count * 4);
    const m = new Matrix4();
    for (let i = 0; i < count; i += 1) {
      // Two rows of monoliths flanking the corridor; the climbed wall's side is taller.
      const left = i % 2 === 0;
      const z = -((i + 1) / (count + 1)) * CORRIDOR_LENGTH;
      const x = left ? WALL_X - 0.6 : 5.6;
      const height = COLUMN_HEIGHT * (left ? 1.4 : 0.8);
      m.makeScale(COLUMN_WIDTH, height, COLUMN_WIDTH).setPosition(x, height / 2, z);
      instanced.setMatrixAt(i, m);
      columns.set([i * 0.137, 0.6 + ((i * 7) % 5) * 0.25, (i + 0.5) / count, i === Math.floor(count * 0.8) ? 1 : 0], i * 4);
    }
    instanced.geometry.setAttribute('aColumn', new InstancedBufferAttribute(columns, 4));
    instanced.frustumCulled = false;
    return instanced;
  }, [source, count]);

  useEffect(
    () => () => {
      mesh.geometry.dispose();
      Object.values(mesh.material.uniforms).forEach((u) => u.value?.dispose?.());
      mesh.material.dispose();
    },
    [mesh],
  );

  const labels = useMemo(
    () =>
      subs.map((name, i) => {
        const label = textTexture(name, { size: 64 });
        const z = -((i + 1) / (subs.length + 1)) * CORRIDOR_LENGTH;
        return {
          label,
          anchor: new Vector3(5.0, 3 + i * 1.2, z),
          at: new Vector3(2.4, 3.6 + i * 1.2, z),
          reveal: 0.12 + i * 0.12,
          text: { uniforms: { uMap: { value: label.texture }, uColor: { value: new Color(PALETTE.ash) }, uOpacity: { value: 0 } }, vertexShader: PLANE_VERTEX, fragmentShader: LABEL_FRAGMENT },
          line: { uniforms: { uColor: { value: new Color(PALETTE.ash) }, uOpacity: { value: 0 } }, vertexShader: PLANE_VERTEX, fragmentShader: `uniform vec3 uColor; uniform float uOpacity; void main() { gl_FragColor = vec4(uColor * uOpacity * 0.7, 1.0); #include <colorspace_fragment> }` },
        };
      }),
    [subs],
  );
  const floorWord = useMemo(() => textTexture('TECHNICAL', { font: '"Mozilla Headline", "Zilla Slab", Georgia, serif', weight: 600, size: 180 }), []);
  useEffect(
    () => () => {
      labels.forEach((l) => l.label.texture.dispose());
      floorWord.texture.dispose();
    },
    [labels, floorWord],
  );

  const lastP = useRef(0);
  const asciiFrame = useRef(false);
  useFrame((state) => {
    const p = progressRef.current;
    const u = mesh.material.uniforms;
    if (!FILM_FREEZE) u.uTime.value = state.clock.elapsedTime;
    u.uIgnite.value = window01(p, 0.08, 0.75);
    // Exactly one frame: the frame the scroll crosses the top of the climb, in either direction.
    const ASCII_AT = 0.72;
    const crossed = (lastP.current < ASCII_AT) !== (p < ASCII_AT);
    u.uAscii.value = crossed && !asciiFrame.current ? 1 : 0;
    asciiFrame.current = crossed;
    lastP.current = p;
    labels.forEach((l) => {
      const o = ease(window01(p, l.reveal, l.reveal + 0.05));
      l.text.uniforms.uOpacity.value = o;
      l.line.uniforms.uOpacity.value = o;
    });
  });

  return (
    <group position={origin}>
      <primitive object={mesh} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.5, 0.01, -CORRIDOR_LENGTH * 0.55]} frustumCulled={false}>
        <planeGeometry args={[9, 9 / floorWord.aspect]} />
        <shaderMaterial
          args={[{ uniforms: { uMap: { value: floorWord.texture }, uColor: { value: new Color(PALETTE.ash) }, uOpacity: { value: 0.16 } }, vertexShader: PLANE_VERTEX, fragmentShader: LABEL_FRAGMENT }]}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
      {labels.map((l, i) => {
        const mid = new Vector3().lerpVectors(l.anchor, l.at, 0.5);
        const length = l.anchor.distanceTo(l.at);
        return (
          <group key={i}>
            <mesh position={mid} frustumCulled={false}>
              <planeGeometry args={[length, 0.02]} />
              <shaderMaterial args={[l.line]} transparent depthWrite={false} blending={AdditiveBlending} />
            </mesh>
            <mesh position={[l.at.x - 0.2 - (0.5 * l.label.aspect) / 2, l.at.y, l.at.z]} rotation={[0, Math.PI / 2, 0]} frustumCulled={false}>
              <planeGeometry args={[0.5 * l.label.aspect, 0.5]} />
              <shaderMaterial args={[l.text]} transparent depthWrite={false} blending={AdditiveBlending} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
