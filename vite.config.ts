import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [preact()],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        probe: resolve(__dirname, 'probe.html'),
        mediaLab: resolve(__dirname, 'media-lab.html'),
      },
    },
  },
});
