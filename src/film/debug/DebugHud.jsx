import { useEffect, useRef } from 'react';
import { film } from '../store.js';
import { getScenes } from '../scroll.js';
import { stats } from './stats.js';
import styles from './DebugHud.module.css';

/** Mono readout for ?debug. Writes text directly, no React state per frame. */
export default function DebugHud() {
  const ref = useRef(null);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 100 || !ref.current) return;
      last = now;
      const s = film.getState();
      const scene = getScenes()[s.activeScene];
      const perf = stats();
      ref.current.textContent = [
        `scene     ${scene?.id ?? '-'} ${scene?.name ?? ''}`,
        `scene p   ${s.sceneProgress.toFixed(3)}`,
        `film p    ${s.progress.toFixed(4)}`,
        `velocity  ${Math.round(s.velocity)} px/s`,
        `jumping   ${s.jumping}`,
        `mood      ${s.mood}`,
        `tier      ${s.quality}`,
        `fps       ${perf.fps} (1% ${perf.low1})`,
        `draws     ${perf.drawCalls}  tris ${perf.triangles}`,
      ].join('\n');
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <pre ref={ref} className={styles.hud} aria-hidden="true" />;
}
