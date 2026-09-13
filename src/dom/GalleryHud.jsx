import { projects } from '../content/index.js';
import { useFilm } from '../film/store.js';
import { openProject } from '../film/gallery/open.js';
import styles from './GalleryHud.module.css';

/**
 * S06's HUD: which slab of five, the project's name, tagline, stack, and its one link. The film
 * sets the slab index in the store (on change only). It is hidden from assistive tech because the
 * semantic projects region already carries the same text and focusable links; the visible link
 * here dollies the camera in, then opens the project in a new tab.
 */
export default function GalleryHud() {
  const index = useFilm((s) => s.galleryIndex);
  const project = index >= 0 ? projects[index] : null;
  if (!project) return null;
  return (
    <div className={styles.hud} data-gallery-hud aria-hidden="true">
      <p className={`hud ${styles.count}`} data-field="count">
        {project.number} / {String(projects.length).padStart(2, '0')}
      </p>
      <p className={styles.name} data-field="name">
        {project.name}
      </p>
      <p className={styles.tagline} data-field="tagline">
        {project.tagline}
      </p>
      <p className={`hud ${styles.stack}`} data-field="stack">
        {project.stack.join('  ')}
      </p>
      <a
        className={`hud ${styles.link}`}
        data-field="link"
        data-cursor="link"
        href={project.link}
        target="_blank"
        rel="noopener"
        tabIndex={-1}
        onClick={(event) => {
          event.preventDefault();
          openProject(index);
        }}
      >
        {project.linkType} ↗
      </a>
    </div>
  );
}
