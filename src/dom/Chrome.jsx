import { useEffect, useRef } from 'react';
import { film, useFilm } from '../film/store.js';
import { SCENES } from '../film/timeline.js';
import styles from './Chrome.module.css';

/**
 * Film chrome: skip link (first focusable element), chapter rail, the burning
 * fuse on the right edge, the always-visible "get in touch" jump, and once the viewer has chosen
 * how to watch, a sound on/off toggle in the same place the choice was offered.
 * @param {{ onJump: (index: number) => void, onSkip: () => void }} props
 */
export default function Chrome({ onJump, onSkip }) {
  const active = useFilm((s) => s.activeScene);
  const fuseRef = useRef(null);
  const contactIndex = SCENES.findIndex((s) => s.region === 'contact');
  const sound = useFilm((s) => s.sound);

  const toggleSound = () => {
    const next = sound === 'on' ? 'off' : 'on';
    film.getState().setSound(next);
    try {
      sessionStorage.setItem('mfc.sound', next);
    } catch {
      // Not remembered for this session; the choice still applies now.
    }
  };

  useEffect(() => {
    const paint = (state) => {
      if (fuseRef.current) fuseRef.current.style.setProperty('--progress', String(state.progress));
    };
    paint(film.getState());
    return film.subscribe(paint);
  }, []);

  return (
    <>
      <a
        href="#main"
        className={styles.skip}
        onClick={(event) => {
          event.preventDefault();
          onSkip();
        }}
      >
        skip the film
      </a>

      <button type="button" className={`hud ${styles.contact}`} onClick={() => onJump(contactIndex)} data-cursor="link">
        get in touch
      </button>

      {sound !== null ? (
        <button type="button" className={`hud ${styles.soundToggle}`} onClick={toggleSound} aria-pressed={sound === 'on'} data-cursor="link">
          sound {sound === 'on' ? 'on' : 'off'}
        </button>
      ) : null}

      <nav className={styles.rail} aria-label="chapters">
        <ol>
          {SCENES.map((scene, index) => (
            <li key={scene.id}>
              <button
                type="button"
                className={styles.chapter}
                aria-current={index === active ? 'step' : undefined}
                onClick={() => onJump(index)}
                data-cursor="link"
              >
                <span className={`hud ${styles.chapterLabel}`}>{scene.chapter}</span>
                <span className={styles.tick} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div ref={fuseRef} className={styles.fuse} aria-hidden="true">
        <span className={styles.burnt} />
        <span className={styles.ember} />
      </div>
    </>
  );
}
