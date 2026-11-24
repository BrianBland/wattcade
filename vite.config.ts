import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { liveBuildPlugin, SHARED_MODULES } from './scripts/live/vitePlugin';
import { runtimeExports } from './scripts/live/hashing';

// Live builds (see src/live/NOTES.md): LIVE_BASE is this version's absolute URL, so every chunk and asset resolves
// against it when the prod page import()s a game from here.
const LIVE_BASE = process.env.LIVE_BASE;
const liveGames = readdirSync(resolve(__dirname, 'src/games')).filter((d) => existsSync(resolve(__dirname, `src/games/${d}/index.ts`)));
const sharedExports = Object.fromEntries(Object.entries(SHARED_MODULES).map(([n, p]) => [n, runtimeExports(readFileSync(resolve(__dirname, p), 'utf8'))]));

export default defineConfig({
  // the commit this build is from (GitHub Actions sets GITHUB_SHA): live updates compare against it
  define: { 'import.meta.env.VITE_BUILD_SHA': JSON.stringify(process.env.LIVE_SHA ?? process.env.GITHUB_SHA ?? '') },
  ...(LIVE_BASE ? { base: LIVE_BASE } : {}),
  server: { proxy: { '/media-resolver': { target: 'http://127.0.0.1:8788', rewrite: (path) => path.replace(/^\/media-resolver/, '') } } },
  plugins: [preact(), ...(LIVE_BASE ? [liveBuildPlugin({ root: __dirname, base: LIVE_BASE, gameIds: liveGames, sharedExports })] : [])],
  build: {
    target: 'es2022',
    rollupOptions: {
      ...(LIVE_BASE ? { preserveEntrySignatures: 'exports-only' as const } : {}),
      input: {
        ...(LIVE_BASE ? Object.fromEntries(liveGames.map((id) => [`game-${id}`, resolve(__dirname, `src/games/${id}/index.ts`)])) : {}),
        main: resolve(__dirname, 'index.html'),
        probe: resolve(__dirname, 'probe.html'),
        shiftProbe: resolve(__dirname, 'shift-probe.html'),
        mediaLab: resolve(__dirname, 'media-lab.html'),
        tdPreview: resolve(__dirname, 'dev/towerdefense.html'),
        seasidePlay: resolve(__dirname, 'dev/seaside-play.html'),
        seasideRide: resolve(__dirname, 'dev/seaside-ride.html'),
        seasideFishing: resolve(__dirname, 'dev/seaside-fishing.html'),
        seasideStills: resolve(__dirname, 'dev/seaside.html'),
        fullsendPreview: resolve(__dirname, 'dev/fullsend.html'),
        scrapjetPreview: resolve(__dirname, 'dev/scrapjet.html'),
      },
    },
  },
});
