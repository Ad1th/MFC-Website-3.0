import { mulberry32 } from '../fox/rig.js';

/**
 * Voronoi cells over the unit square [0,1]², clipped exactly to its edges, so the
 * cells tile the screen with no gaps or overlaps. Sites cluster around the impact
 * point, so shards are small where the fox hits and large at the edges.
 *
 * @param {{ count?: number, impact?: [number, number], seed?: number, aspect?: number }} options
 *   aspect = width / height of the surface, so cells are round on screen, not in UV space
 * @returns {{ site: [number, number], polygon: [number, number][] }[]}
 */
export function voronoiCells({ count = 60, impact = [0.5, 0.45], seed = 1, aspect = 1.6 } = {}) {
  const rand = mulberry32(seed);
  const sites = [];
  for (let i = 0; i < count; i += 1) {
    // Radius distribution weighted toward the impact; angle uniform.
    const r = Math.pow(rand(), 1.8) * 1.1;
    const a = rand() * Math.PI * 2;
    const x = impact[0] + (Math.cos(a) * r) / aspect;
    const y = impact[1] + Math.sin(a) * r;
    sites.push([Math.min(0.999, Math.max(0.001, x)), Math.min(0.999, Math.max(0.001, y))]);
  }

  // Work in aspect-corrected space (x scaled by aspect) so bisectors are true on screen.
  const toScreen = ([x, y]) => [x * aspect, y];
  const fromScreen = ([x, y]) => [x / aspect, y];
  const square = [
    [0, 0],
    [aspect, 0],
    [aspect, 1],
    [0, 1],
  ];

  return sites.map((site, i) => {
    let polygon = square;
    const si = toScreen(site);
    for (let j = 0; j < sites.length && polygon.length; j += 1) {
      if (j === i) continue;
      const sj = toScreen(sites[j]);
      const mx = (si[0] + sj[0]) / 2;
      const my = (si[1] + sj[1]) / 2;
      const nx = sj[0] - si[0];
      const ny = sj[1] - si[1];
      polygon = clipHalfPlane(polygon, mx, my, nx, ny);
    }
    return { site, polygon: polygon.map(fromScreen) };
  });
}

/** Sutherland-Hodgman: keep the part of `poly` where dot(p - m, n) <= 0. */
function clipHalfPlane(poly, mx, my, nx, ny) {
  const out = [];
  const side = ([x, y]) => (x - mx) * nx + (y - my) * ny;
  for (let k = 0; k < poly.length; k += 1) {
    const a = poly[k];
    const b = poly[(k + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);
    if (sa <= 0) out.push(a);
    if ((sa <= 0) !== (sb <= 0)) {
      const t = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
