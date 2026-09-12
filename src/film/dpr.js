import { TIERS } from './quality.js';

/**
 * The one device pixel ratio the film renders at for a quality tier. The DOM hero
 * canvas draws at exactly this ratio too, so its pixels map 1:1 onto the WebGL
 * texture when the page shatters (S02).
 * @param {number} tier
 */
export function filmDpr(tier) {
  const device = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const cap = TIERS[tier]?.dpr ?? TIERS[2].dpr;
  return Math.min(Math.max(device, 1), cap);
}
