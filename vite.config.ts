import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

export default defineConfig({
  server: { proxy: { '/media-resolver': { target: 'http://127.0.0.1:8788', rewrite: (path) => path.replace(/^\/media-resolver/, '') } } },
  plugins: [preact()],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        probe: resolve(__dirname, 'probe.html'),
        mediaLab: resolve(__dirname, 'media-lab.html'),
        tdPreview: resolve(__dirname, 'dev/towerdefense.html'),
        seasidePlay: resolve(__dirname, 'dev/seaside-play.html'),
        seasideRide: resolve(__dirname, 'dev/seaside-ride.html'),
        seasideStills: resolve(__dirname, 'dev/seaside.html'),
      },
    },
  },
});
