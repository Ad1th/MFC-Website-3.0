import { useEffect } from 'react';
import { TITLES } from '../film/timeline.js';
import styles from './NotFound.module.css';

/** Phase 1 404. The torch-and-fox scene replaces the visual in Phase 6. */
export default function NotFound() {
  useEffect(() => {
    document.title = TITLES.notFound;
  }, []);

  return (
    <main id="main" className={styles.page}>
      <h1 className={styles.line}>this page doesn't exist. the fox checked.</h1>
      <a href="/" className={`hud ${styles.home}`}>
        take me home
      </a>
    </main>
  );
}
