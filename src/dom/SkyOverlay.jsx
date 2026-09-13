import { useEffect, useRef } from 'react';
import { team, years } from '../content/index.js';
import { film, useFilm } from '../film/store.js';
import { SCENES } from '../film/timeline.js';
import styles from './SkyOverlay.module.css';

/**
 * S09's DOM layer over the sky: the year dial carved into the rock (click a year, drag along it,
 * or use the arrow keys while it has focus), and the card for the star the camera has flown to,
 * with only that member's own links. Esc or clicking outside the card returns to the hilltop.
 * The team region carries the same years and members as ordinary HTML for screen readers.
 */

const SKY_INDEX = SCENES.findIndex((scene) => scene.id === 'S09');
const LINK_LABEL = { linkedin: 'linkedin', github: 'github', instagram: 'instagram', website: 'website' };

function memberFor(key) {
  if (!key || key === 'empty') return null;
  if (key === 'faculty') return team.faculty;
  const [year, index] = key.split(':');
  return team.years[year]?.[Number(index)] ?? null;
}

export default function SkyOverlay() {
  const active = useFilm((s) => s.activeScene === SKY_INDEX);
  const year = useFilm((s) => s.teamYear) ?? years[0];
  const focus = useFilm((s) => s.skyFocus);
  const dialRef = useRef(null);
  const drag = useRef(null);
  const cardRef = useRef(null);

  const setYear = (next) => film.getState().setTeamYear(years[Math.max(0, Math.min(years.length - 1, next))]);
  const index = Math.max(0, years.indexOf(year));

  useEffect(() => {
    if (focus) cardRef.current?.querySelector('a, button')?.focus({ preventScroll: true });
  }, [focus]);

  if (!active) return null;
  const member = memberFor(focus);

  return (
    <>
      {member ? null : (
      <div
        ref={dialRef}
        className={styles.dial}
        data-sky-dial
        role="radiogroup"
        aria-label="board year"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            event.preventDefault();
            setYear(index + 1);
          }
          if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            event.preventDefault();
            setYear(index - 1);
          }
        }}
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, index, captured: false };
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          // Capture only once it is really a drag: capturing on press retargets the click to the
          // dial, and a year's own button would never hear it.
          if (!drag.current.captured && Math.abs(event.clientX - drag.current.x) > 8) {
            drag.current.captured = true;
            try {
              event.currentTarget.setPointerCapture?.(event.pointerId);
            } catch {
              // A pointer the browser cannot capture (already released) still drags while it is over the dial.
            }
          }
          // One year per 70px dragged along the arc.
          const steps = Math.round((event.clientX - drag.current.x) / 70);
          const next = Math.max(0, Math.min(years.length - 1, drag.current.index + steps));
          if (next !== index) setYear(next);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        {years.map((y, i) => (
          <button
            key={y}
            type="button"
            role="radio"
            aria-checked={y === year}
            tabIndex={-1}
            className={styles.year}
            style={{ '--i': i - (years.length - 1) / 2 }}
            onClick={() => setYear(i)}
          >
            {y}
          </button>
        ))}
      </div>
      )}

      {member ? (
        <div className={styles.backdrop} onClick={() => film.getState().setSkyFocus(null)}>
          <div
            ref={cardRef}
            role="dialog"
            aria-label={member.name}
            className={styles.card}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') film.getState().setSkyFocus(null);
            }}
          >
            <p className={styles.name}>{member.name}</p>
            <p className={`hud ${styles.role}`}>{member.role.toLowerCase()}</p>
            <ul className={styles.links}>
              {Object.entries(member.links ?? {}).map(([kind, href]) => (
                <li key={kind}>
                  <a href={href} target="_blank" rel="noopener noreferrer" className="hud" data-cursor="link">
                    {LINK_LABEL[kind] ?? kind} ↗
                  </a>
                </li>
              ))}
            </ul>
            <button type="button" className={`hud ${styles.close}`} onClick={() => film.getState().setSkyFocus(null)}>
              back to the hill
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
