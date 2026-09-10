import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
