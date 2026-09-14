/**
 * Quality tiers. The initial tier comes from cheap signals (GPU renderer string, pointer, cores),
 * then a one second warm-up benchmark can lower it before the film is revealed (App.jsx), and
 * drei's PerformanceMonitor lowers it live if the frame rate stays low (Film.jsx). Tiers never
 * rise on their own, and never drop below 1 while the film plays (tier 0 is still mode).
 *
 * | tier | target       | dpr   | particles |
 * | 3    | desktop dGPU | <=2   | 60k       |
 * | 2    | laptop iGPU  | <=1.5 | 30k       |
 * | 1    | phones       | <=1.25| 12k       |
 * | 0    | weak/no GL2  | none  | still mode|
 */

export const TIERS = {
  3: { dpr: 2, particles: 60000, clouds: 3, shatterCells: 80 },
  2: { dpr: 1.5, particles: 30000, clouds: 2, shatterCells: 60 },
  1: { dpr: 1.25, particles: 12000, clouds: 1, shatterCells: 40 },
  0: { dpr: 1, particles: 0, clouds: 0, shatterCells: 0 },
};

/** @returns {{ webgl2: boolean, renderer: string }} */
export function probeWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    if (!gl) return { webgl2: false, renderer: '' };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { webgl2: true, renderer };
  } catch {
    return { webgl2: false, renderer: '' };
  }
}

const WARM_UP_MS = 1000;
const WARM_UP_SIZE = 512;

const BENCH_VERTEX = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

// Roughly the film's heaviest per-pixel work: layered noise, as the fire, clouds and burn do.
const BENCH_FRAGMENT = `#version 300 es
precision highp float;
uniform float uTime;
out vec4 color;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.0), f.x), f.y);
}
void main() {
  vec2 p = gl_FragCoord.xy / 64.0;
  float v = 0.0; float a = 0.5;
  for (int k = 0; k < 7; k++) { v += a * noise(p + uTime); p *= 2.03; a *= 0.5; }
  color = vec4(vec3(v), 1.0);
}`;

/**
 * The warm-up benchmark: draws a noise-heavy full-screen pass off screen for about a second,
 * forcing each frame to finish (a one-pixel read), and returns the median frame time in ms,
 * or null when it cannot run.
 * @returns {Promise<number|null>}
 */
export function warmUpBenchmark() {
  return new Promise((resolve) => {
    let gl;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = WARM_UP_SIZE;
      canvas.height = WARM_UP_SIZE;
      gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false });
    } catch {
      gl = null;
    }
    if (!gl) {
      resolve(null);
      return;
    }
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, BENCH_VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, BENCH_FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      resolve(null);
      return;
    }
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const location = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    const uTime = gl.getUniformLocation(program, 'uTime');
    const pixel = new Uint8Array(4);
    const times = [];
    const start = performance.now();

    const frame = () => {
      const t0 = performance.now();
      // Several passes per frame, about the fill of a laptop-sized film frame.
      for (let i = 0; i < 4; i += 1) {
        gl.uniform1f(uTime, t0 / 1000 + i);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      times.push(performance.now() - t0);
      if (performance.now() - start < WARM_UP_MS) {
        requestAnimationFrame(frame);
        return;
      }
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      // Drop the first frames (shader compile and warm caches).
      const settled = times.slice(Math.min(3, times.length - 1)).sort((a, b) => a - b);
      resolve(settled[Math.floor(settled.length / 2)] ?? null);
    };
    requestAnimationFrame(frame);
  });
}

/**
 * Tier after the warm-up: a GPU that needs more than a frame's budget for the benchmark drops a
 * tier, one that is far over it drops two. Never below 1 (still mode is decided before).
 * @param {0|1|2|3} tier @param {number|null} medianMs
 * @returns {0|1|2|3}
 */
export function tierAfterWarmUp(tier, medianMs) {
  if (tier <= 1 || medianMs === null) return tier;
  if (medianMs > 24) return /** @type {0|1|2|3} */ (Math.max(1, tier - 2));
  if (medianMs > 10) return /** @type {0|1|2|3} */ (Math.max(1, tier - 1));
  return tier;
}

/** @returns {0|1|2|3} */
export function initialTier() {
  const { webgl2, renderer } = probeWebGL();
  if (!webgl2) return 0;
  if (/swiftshader|llvmpipe|software|basic render/i.test(renderer)) return 0;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (coarse || cores <= 4) return 1;
  if (/nvidia|geforce|rtx|radeon rx|apple m\d (pro|max|ultra)/i.test(renderer)) return 3;
  return 2;
}
