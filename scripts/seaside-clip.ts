// Records the Seaside motion test (dev/seaside-ride.html) to docs/seaside/clips/ride-fish.mp4, frame by frame.
//   npx tsx scripts/seaside-clip.ts [--fps 30] [--from 0 --to 22] [--w 1280 --h 720] [--q 'lod=1&…']  (default: the fast LOD + baked-shadow path)
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const arg = (k: string, d: number) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const FPS = arg('fps', 30), Wd = arg('w', 1280), Ht = arg('h', 720);
const qi = process.argv.indexOf('--q'), Q = qi > 0 ? process.argv[qi + 1] : 'lod=1&lodres=32&lodmin=4&skirt=2&lodk=1.2&bake=1&road=1';
const server = await createServer({ server: { port: 5297, strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls!.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const dir = mkdtempSync(join(tmpdir(), 'seaside-clip-'));
try {
  const page = await browser.newPage({ viewport: { width: Wd, height: Ht } });
  page.on('pageerror', (e) => console.warn(e.message));
  await page.goto(`${base}/dev/seaside-ride.html?capture=1&w=${Wd}&h=${Ht}&${Q}`);
  const ready = await (await page.waitForFunction(() => (window as unknown as { __ready?: unknown }).__ready, null, { timeout: 600_000 })).jsonValue() as { duration: number; buildMs: number };
  const from = arg('from', 0), to = arg('to', ready.duration), n = Math.round((to - from) * FPS);
  console.log(`build ${ready.buildMs} ms; ${n} frames`);
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    await page.evaluate((t) => (window as unknown as { __frame: (t: number) => Promise<void> }).__frame(t), from + i / FPS);
    await page.screenshot({ path: join(dir, `f${String(i).padStart(4, '0')}.png`), clip: { x: 0, y: 0, width: Wd, height: Ht }, timeout: 180_000 });
    if (i % 60 === 0) console.log(`frame ${i}/${n} · ${((Date.now() - t0) / (i + 1)).toFixed(0)} ms/frame`);
  }
  mkdirSync('docs/seaside/clips', { recursive: true });
  const out = join('docs/seaside/clips', 'ride-fish.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(dir, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-preset', 'slow', '-movflags', '+faststart', out]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(dir, `f${String(Math.min(n - 1, Math.round(22.6 * FPS - from * FPS))).padStart(4, '0')}.png`), join('docs/seaside/clips', 'ride-fish-poster.png')]);
  console.log(`wrote ${out} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
} finally { await browser.close(); await server.close(); rmSync(dir, { recursive: true, force: true }); }
