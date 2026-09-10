/**
 * The single source of truth for the film: scene order, scroll length in vh,
 * chapter labels, tab titles and which semantic DOM region each scene carries.
 * Lengths are desktop and mobile (max-width: 767px). Tune here only.
 */

export const MOBILE_QUERY = '(max-width: 767px)';

/**
 * @typedef {object} SceneDef
 * @property {string} id          stable id, S01 to S11
 * @property {string} name        human name, used in debug HUD
 * @property {string|null} chapter chapter rail label, lowercase
 * @property {{ desktop: number, mobile: number }} vh scroll length per breakpoint
 * @property {string[]} titles    tab titles; several titles split the scene evenly
 * @property {string|null} region id of the semantic DOM region this scene tells
 */

/** @type {SceneDef[]} */
export const SCENES = [
  { id: 'S01', name: 'Cold Open', chapter: 'open', vh: { desktop: 240, mobile: 170 }, titles: ['mozilla firefox club'], region: 'intro' },
  { id: 'S02', name: 'The Break', chapter: 'break', vh: { desktop: 120, mobile: 85 }, titles: ['falling'], region: null },
  { id: 'S03', name: 'The Dive', chapter: 'dive', vh: { desktop: 300, mobile: 210 }, titles: ['falling'], region: null },
  { id: 'S04', name: 'The Packet', chapter: 'about', vh: { desktop: 280, mobile: 195 }, titles: ['inside the wire'], region: 'about' },
  { id: 'S05', name: 'The Three Rooms', chapter: 'domains', vh: { desktop: 600, mobile: 420 }, titles: ['the source', 'the prism', 'the web'], region: 'domains' },
  { id: 'S06', name: 'The Gallery', chapter: 'projects', vh: { desktop: 850, mobile: 520 }, titles: ['the gallery'], region: 'projects' },
  { id: 'S07', name: 'The Spiral', chapter: 'events', vh: { desktop: 680, mobile: 475 }, titles: ['the spiral'], region: 'events' },
  { id: 'S08', name: 'The Burn', chapter: 'writing', vh: { desktop: 450, mobile: 315 }, titles: ['reading'], region: 'writing' },
  { id: 'S09', name: 'The Sky', chapter: 'team', vh: { desktop: 560, mobile: 390 }, titles: ['stargazing'], region: 'team' },
  { id: 'S10', name: 'The Return', chapter: 'contact', vh: { desktop: 420, mobile: 295 }, titles: ['your move.'], region: 'contact' },
  { id: 'S11', name: 'End Card', chapter: 'end', vh: { desktop: 180, mobile: 125 }, titles: ['shh. fox is sleeping.'], region: 'end' },
];

export const TITLES = {
  loading: '.',
  ready: 'mozilla firefox club',
  hidden: 'the fox is waiting.',
  notFound: 'the fox checked.',
};

/**
 * @typedef {SceneDef & { index: number, start: number, end: number, length: number }} PlacedScene
 */

/**
 * Lay scenes end to end for a breakpoint.
 * @param {boolean} isMobile
 * @returns {PlacedScene[]}
 */
export function layout(isMobile) {
  let start = 0;
  return SCENES.map((scene, index) => {
    const length = isMobile ? scene.vh.mobile : scene.vh.desktop;
    const placed = { ...scene, index, start, end: start + length, length };
    start += length;
    return placed;
  });
}

/** @param {PlacedScene[]} scenes */
export function totalVh(scenes) {
  return scenes[scenes.length - 1].end;
}

/**
 * Find the scene at a position (in vh from the top of the film).
 * @param {PlacedScene[]} scenes
 * @param {number} positionVh
 * @returns {{ index: number, sceneProgress: number }}
 */
export function locate(scenes, positionVh) {
  const total = totalVh(scenes);
  const pos = Math.min(Math.max(positionVh, 0), total);
  for (let i = 0; i < scenes.length; i += 1) {
    const s = scenes[i];
    if (pos < s.end || i === scenes.length - 1) {
      return { index: i, sceneProgress: Math.min(Math.max((pos - s.start) / s.length, 0), 1) };
    }
  }
  return { index: scenes.length - 1, sceneProgress: 1 };
}

/**
 * The tab title for a scene at a given progress.
 * @param {SceneDef} scene
 * @param {number} sceneProgress
 */
export function titleFor(scene, sceneProgress) {
  const { titles } = scene;
  return titles[Math.min(titles.length - 1, Math.floor(sceneProgress * titles.length))];
}

/** @param {string} region */
export function sceneForRegion(region) {
  return SCENES.findIndex((s) => s.region === region);
}
