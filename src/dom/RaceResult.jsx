import { useFilm } from '../film/store.js';
import { jumpToScene } from '../film/scroll.js';
import { SCENES } from '../film/timeline.js';
import styles from './RaceResult.module.css';

const END_INDEX = SCENES.findIndex((scene) => scene.id === 'S11');

/** The race home's last word at the top of the film (live/race.js): `rematch?` or `again?`. */
export default function RaceResult() {
  const race = useFilm((s) => s.race);
  if (race.phase !== 'done') return null;
  const label = race.result === 'viewer' ? 'rematch?' : 'again?';
  return (
    <div className={styles.result} role="status" aria-live="polite">
      <span className="visually-hidden">{race.result === 'viewer' ? 'you beat the fox to the top.' : 'the fox beat you to the top.'} </span>
      <button type="button" className={styles.button} data-cursor="link" data-race-result={race.result} onClick={() => jumpToScene(END_INDEX, { progress: 0.8 })}>
        {label}
      </button>
    </div>
  );
}
