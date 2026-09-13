/**
 * Scenes whose film content is built. Their semantic HTML stays in the page (real, focusable
 * text) but is visually hidden while the film plays, as the brief asks; unbuilt scenes keep
 * showing their HTML panel over a placeholder until they are built.
 */
export const BUILT_SCENES = new Set(['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08']);

/**
 * Built scenes whose region HTML is itself the visible layer over the film (S08: the film paints
 * the paper, the real writing sits on it), so their panel stays painted.
 */
export const DOM_SCENES = new Set(['S08']);
