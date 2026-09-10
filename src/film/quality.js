/**
 * Quality tiers. Phase 1 picks an initial tier from cheap signals only;
 * the warm-up benchmark and PerformanceMonitor downgrades arrive in Phase 7.
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
