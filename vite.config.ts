import { defineConfig } from 'vite';

export default defineConfig({
  base: '/globe-pretext/',
  worker: {
    format: 'es',
  },
  build: {
    target: 'esnext' // Needed for top-level await
  },
  server: {
    proxy: {
      '/api/flights': {
        target: 'https://opensky-network.org/api/states/all',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/flights/, '')
      },
      '/api/satellites': {
        target: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/satellites/, '')
      }
    }
  }
});
