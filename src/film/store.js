import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

/**
 * Film state. Written by scroll.js and the living layer; read inside useFrame
 * with film.getState() so the render loop never triggers React re-renders.
 * React components subscribe only to coarse values (activeScene, mode, sound).
 *
 * @typedef {'trot'|'sprint'|'overtake'|'sit'|'lie'|'sleep'|'startle'} Mood
 * @typedef {'film'|'still'|'notFound'} Mode
 */

export const film = createStore((set) => ({
  /** @type {Mode} */
  mode: 'film',
  /** 0 to 1 over the whole film */
  progress: 0,
  /** smoothed scroll velocity, px per second, signed (positive = down) */
  velocity: 0,
  /** index into the laid-out timeline */
  activeScene: 0,
  /** 0 to 1 inside the active scene */
  sceneProgress: 0,
  /** true while a chapter jump is animating */
  jumping: false,
  /** ms timestamp of the last scroll input, for idle moods */
  lastScrollAt: 0,
  /** @type {Mood} */
  mood: 'trot',
  /** 0 to 3, see quality.js */
  quality: 2,
  /** null until the viewer chooses */
  /** @type {null|'on'|'off'} */
  sound: null,
  /** assets loaded, 0 to 100 */
  loaded: 0,
  live: {
    /** @type {null|{ condition: string, temperature: number, isDay: boolean, code: number }} */
    weather: null,
  },
  /** Room order for S05, chosen by the cursor at S04's split. */
  /** @type {('technical'|'design'|'management')[]} */
  branchOrder: ['technical', 'design', 'management'],
  /** S06: the slab whose HUD shows, or -1 outside the gallery. */
  galleryIndex: -1,
  /** performance.now() of the last click on a slab, for the dolly-in; 0 before any. */
  galleryDolly: 0,
  /** S09: the board year the sky shows (the dial and the team region share it). */
  teamYear: null,
  /** S09: the star the camera has flown to ('faculty', 'empty' or 'year:index'), or null. */
  skyFocus: null,

  setScroll: (patch) => set(patch),
  setMode: (mode) => set({ mode }),
  setMood: (mood) => set({ mood }),
  setQuality: (quality) => set({ quality }),
  setSound: (sound) => set({ sound }),
  setLoaded: (loaded) => set({ loaded }),
  setJumping: (jumping) => set({ jumping }),
  setLive: (patch) => set((state) => ({ live: { ...state.live, ...patch } })),
  setBranchOrder: (branchOrder) => set({ branchOrder }),
  setGalleryIndex: (galleryIndex) => set({ galleryIndex }),
  dollyGallery: (galleryDolly) => set({ galleryDolly }),
  setTeamYear: (teamYear) => set({ teamYear }),
  setSkyFocus: (skyFocus) => set({ skyFocus }),
}));

/**
 * React hook for coarse subscriptions only.
 * @template T
 * @param {(state: ReturnType<typeof film.getState>) => T} selector
 * @returns {T}
 */
export function useFilm(selector) {
  return useStore(film, selector);
}
