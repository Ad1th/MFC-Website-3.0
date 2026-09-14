/**
 * Scenes whose film content is built. Their semantic HTML stays in the page (real, focusable
 * text) but is visually hidden while the film plays, as the brief asks; unbuilt scenes keep
 * showing their HTML panel over a placeholder until they are built.
 */
export const BUILT_SCENES = new Set(['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11']);

/**
 * Built scenes whose region HTML is itself the visible layer over the film (S08: the film paints
 * the paper, the real writing sits on it; S10: the form sits on the reassembled pane; S11: the socials
 * and credits under the burned wordmark), so their panel stays painted.
 */
export const DOM_SCENES = new Set(['S08', 'S10', 'S11']);
