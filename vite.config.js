import fs from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * THE SOURCE (S05) streams the film's own code as falling glyphs. `?source` imports a file as text,
 * like `?raw`, minus every line that names a test-only hook, so the production bundle never carries
 * those names as text either and scripts/check-dist.mjs can stay strict.
 */
const HOOK_LINE = /__filmTest|FILM_TEST|FILM_FREEZE|FOX_REGRESS|regress|freeze|embers-parent|no-hit-radius|no-near-radius/;

function sourceText() {
  return {
    name: 'mfc-source-text',
    enforce: 'pre',
    load(id) {
      const [file, query] = id.split('?');
      if (query !== 'source') return null;
      const text = fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => !HOOK_LINE.test(line))
        .join('\n');
      return `export default ${JSON.stringify(text)};`;
    },
  };
}

export default defineConfig({
  plugins: [sourceText(), react()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/')) return 'three';
          if (id.includes('node_modules/@react-three/') || id.includes('node_modules/postprocessing/')) return 'r3f';
          if (id.includes('node_modules/gsap/') || id.includes('node_modules/lenis/')) return 'scroll';
          return undefined;
        },
      },
    },
  },
});
