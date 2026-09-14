import { useEffect, useState } from 'react';
import { useFilm } from '../film/store.js';
import { stats } from '../film/debug/stats.js';
import { credits, site } from '../content/index.js';
import styles from './DirectorsCutHud.module.css';

/**
 * The Director's Cut readout (press D): scene, progress, frame rate, draw calls, triangles and
 * particles, a frame around the inset of the real shot, and the credits. Updated four times a second.
 */

const format = new Intl.NumberFormat('en');

export default function DirectorsCutHud() {
  const on = useFilm((s) => s.directorsCut);
  const [reading, setReading] = useState(null);

  // The region panels step aside while the cut is on (global.css).
  useEffect(() => {
    if (!on) return undefined;
    document.documentElement.dataset.directorsCut = '';
    return () => {
      delete document.documentElement.dataset.directorsCut;
    };
  }, [on]);

  useEffect(() => {
    if (!on) return undefined;
    const tick = () => setReading(stats());
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [on]);

  if (!on) return null;
  const builders = credits.builders?.people ?? [];
  return (
    <div className={styles.hud} data-directors-cut-hud="" aria-live="off">
      <section className={styles.readout} aria-label="director's cut">
        <p className={styles.title}>director's cut</p>
        <dl className={styles.grid}>
          <dt>scene</dt>
          <dd data-field="scene">{reading?.scene ?? ''}</dd>
          <dt>progress</dt>
          <dd>{reading ? reading.progress.toFixed(3) : ''}</dd>
          <dt>fps</dt>
          <dd data-field="fps">{reading?.fps ?? ''}</dd>
          <dt>draw calls</dt>
          <dd>{reading ? format.format(reading.drawCalls) : ''}</dd>
          <dt>particles</dt>
          <dd>{reading ? format.format(reading.particles) : ''}</dd>
        </dl>
        <p className={styles.hint}>press D to return to the film</p>
      </section>
      <div className={styles.inset} style={{ aspectRatio: `${window.innerWidth} / ${window.innerHeight}` }}>
        <span className={styles.insetLabel}>the shot</span>
      </div>
      <section className={styles.credits} aria-label="credits">
        <p>{builders.length ? `built by ${builders.map((p) => p.name ?? p).join(', ')}` : `built by the ${site.name}, ${site.institution}`}</p>
        {credits.assets.map((a) => (
          <p key={a.what}>
            {a.what.toLowerCase()}: {a.by} ({a.license})
          </p>
        ))}
      </section>
    </div>
  );
}
