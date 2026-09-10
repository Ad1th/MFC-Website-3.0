import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { film } from './store.js';
import { layout, locate, totalVh, titleFor, MOBILE_QUERY } from './timeline.js';

gsap.registerPlugin(ScrollTrigger);

/** @type {Lenis|null} */
let lenis = null;
/** @type {ReturnType<typeof layout>} */
let scenes = layout(false);
/** @type {HTMLElement|null} */
let track = null;
let rawVelocity = 0;
let lastUpdate = 0;

const JUMP_DURATION = 1.6;
const VELOCITY_SMOOTHING = 0.12;

export function getScenes() {
  return scenes;
}

/**
 * Boot the single scroll: Lenis drives the window, ScrollTrigger maps the
 * track to film progress, the store receives progress, scene and velocity.
 * @param {HTMLElement} trackEl the element whose height is the whole film
 * @returns {() => void} teardown
 */
export function initScroll(trackEl) {
  track = trackEl;
  const mq = window.matchMedia(MOBILE_QUERY);

  const applyLayout = () => {
    scenes = layout(mq.matches);
    track.style.height = `${totalVh(scenes)}lvh`;
    ScrollTrigger.refresh();
  };
  applyLayout();

  lenis = new Lenis({ autoRaf: false, lerp: 0.1, smoothWheel: true, syncTouch: false });
  lenis.on('scroll', ScrollTrigger.update);

  const raf = (time) => lenis?.raf(time * 1000);
  gsap.ticker.add(raf);
  gsap.ticker.lagSmoothing(0);

  const trigger = ScrollTrigger.create({
    trigger: track,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => write(self.progress, self.getVelocity()),
  });

  const smooth = (_time, deltaMs) => {
    const dt = deltaMs / 1000;
    if (performance.now() - lastUpdate > 120) rawVelocity = 0;
    const state = film.getState();
    const k = 1 - Math.exp(-dt / VELOCITY_SMOOTHING);
    const next = state.velocity + (rawVelocity - state.velocity) * k;
    if (Math.abs(next - state.velocity) > 0.5 || (next === 0) !== (state.velocity === 0)) {
      state.setScroll({ velocity: Math.abs(next) < 1 ? 0 : next });
    }
  };
  gsap.ticker.add(smooth);

  mq.addEventListener('change', applyLayout);
  write(trigger.progress, 0);

  return () => {
    mq.removeEventListener('change', applyLayout);
    gsap.ticker.remove(raf);
    gsap.ticker.remove(smooth);
    trigger.kill();
    lenis?.destroy();
    lenis = null;
    track = null;
  };
}

function write(progress, velocity) {
  rawVelocity = velocity;
  lastUpdate = performance.now();
  const { index, sceneProgress } = locate(scenes, progress * totalVh(scenes));
  const state = film.getState();
  const patch = { progress, sceneProgress, lastScrollAt: lastUpdate };
  if (index !== state.activeScene) patch.activeScene = index;
  state.setScroll(patch);
  if (!document.hidden) {
    const title = titleFor(scenes[index], sceneProgress);
    if (document.title !== title) document.title = title;
  }
}

/** Pixel offset of a scene start inside the document. */
function sceneTop(index) {
  if (!track) return 0;
  const s = scenes[index];
  const top = track.getBoundingClientRect().top + window.scrollY;
  return top + (s.start / totalVh(scenes)) * track.offsetHeight + 1;
}

/**
 * Chapter jump. The fox sprints while the jump runs (store.jumping).
 * @param {number} index scene index
 * @param {{ immediate?: boolean }} [options]
 */
export function jumpToScene(index, { immediate = false } = {}) {
  const target = sceneTop(index);
  const state = film.getState();
  if (!lenis || immediate) {
    window.scrollTo({ top: target, behavior: 'instant' });
    return;
  }
  state.setJumping(true);
  lenis.scrollTo(target, {
    duration: JUMP_DURATION,
    easing: (t) => 1 - Math.pow(1 - t, 4),
    onComplete: () => film.getState().setJumping(false),
  });
}

/** Stop and start smooth scrolling (for modal moments). */
export function setScrollLocked(locked) {
  if (!lenis) return;
  if (locked) lenis.stop();
  else lenis.start();
}
