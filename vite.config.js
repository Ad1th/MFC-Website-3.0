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

/**
 * SEO files that need the site's absolute address. robots.txt is always written; the sitemap, the
 * canonical link and the og/twitter image tags are added only when SITE_URL is set at build time
 * (the production domain is not decided yet, see CONTENT_NEEDED), so nothing points at a guess.
 */
function seo() {
  const site = (process.env.SITE_URL ?? '').trim().replace(/\/+$/, '');
  return {
    name: 'mfc-seo',
    transformIndexHtml(html) {
      if (!site) return html;
      const tags = [
        `<link rel="canonical" href="${site}/" />`,
        `<meta property="og:url" content="${site}/" />`,
        `<meta property="og:image" content="${site}/og.jpg" />`,
        '<meta property="og:image:width" content="1200" />',
        '<meta property="og:image:height" content="630" />',
        `<meta name="twitter:image" content="${site}/og.jpg" />`,
      ];
      return html.replace('</head>', `    ${tags.join('\n    ')}\n  </head>`);
    },
    generateBundle() {
      const robots = ['User-agent: *', 'Allow: /', ...(site ? [`Sitemap: ${site}/sitemap.xml`] : [])].join('\n');
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `${robots}\n` });
      if (site) {
        const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${site}/</loc><changefreq>monthly</changefreq></url>\n</urlset>\n`;
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap });
      }
    },
  };
}

export default defineConfig({
  plugins: [sourceText(), seo(), react()],
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
