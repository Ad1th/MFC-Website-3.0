import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { film } from './store.js';
import { layout, locate, totalVh, titleFor, MOBILE_QUERY } from './timeline.js';
import { FILM_TEST } from './testHooks.js';
import { onScrollLockChange, requestScrollLock, scrollLockRequested, titlesAreLive } from './filmGate.js';

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
/** Film distance per wheel or trackpad delta (Lenis default is 1). The recorder compensates for it. */
export const WHEEL_MULTIPLIER = 0.5;

export function initScroll(trackEl) {
  track = trackEl;
  const mq = window.matchMedia(MOBILE_QUERY);

  const applyLayout = () => {
    scenes = layout(mq.matches);
    track.style.height = `${totalVh(scenes)}lvh`;
    ScrollTrigger.refresh();
  };
  applyLayout();

  // Mac trackpads send long momentum streams, and at 1:1 the film raced past (reported as too trippy).
  // Half the distance per wheel delta and a softer follow keep a flick to a readable pace.
  lenis = new Lenis({ autoRaf: false, lerp: 0.07, wheelMultiplier: WHEEL_MULTIPLIER, smoothWheel: true, syncTouch: false });
  // S00 may have asked for a lock before Lenis existed; apply it now and follow changes.
  if (scrollLockRequested()) lenis.stop();
  const offLock = onScrollLockChange((locked) => (locked ? lenis?.stop() : lenis?.start()));
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
  // Tests and benchmarks wait for this instead of guessing when the film is live.
  document.documentElement.dataset.filmReady = 'true';
  if (FILM_TEST) {
    window.__filmTest.scrollToScene = (id, progress = 0) => {
      const index = scenes.findIndex((scene) => scene.id === id);
      if (index < 0 || !track) return false;
      const s = scenes[index];
      const top = track.getBoundingClientRect().top + window.scrollY;
      const range = track.offsetHeight - window.innerHeight;
      const target = top + ((s.start + s.length * progress) / totalVh(scenes)) * range;
      lenis.scrollTo(target, { immediate: true, force: true });
      return true;
    };
    window.__filmTest.layout = () => scenes.map(({ id, start, length }) => ({ id, start, length }));
    window.__filmTest.state = () => {
      const { activeScene, sceneProgress, progress } = film.getState();
      return { scene: scenes[activeScene]?.id, sceneProgress, progress };
    };
  }

  return () => {
    delete document.documentElement.dataset.filmReady;
    mq.removeEventListener('change', applyLayout);
    gsap.ticker.remove(raf);
    gsap.ticker.remove(smooth);
    trigger.kill();
    offLock();
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
  // A fox that fell asleep while the tab was away wakes when you scroll.
  if (state.foxAsleep && Math.abs(velocity) > 1) patch.foxAsleep = false;
  if (index !== state.activeScene) patch.activeScene = index;
  state.setScroll(patch);
  if (titlesAreLive() && !document.hidden) {
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
  if (!lenis) {
    window.scrollTo({ top: target, behavior: 'instant' });
    return;
  }
  if (immediate) {
    // Through Lenis, so its internal position matches and it doesn't ease back.
    lenis.scrollTo(target, { immediate: true, force: true });
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
  requestScrollLock(locked);
}
