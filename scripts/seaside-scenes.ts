// Records the animated later-story scenes (dev/seaside.html?still=…) to $OUT (default /tmp/seaside/clips)/<scene>.mp4.
//   npx tsx scripts/seaside-scenes.ts [belly drill monkey lava reentry] [--w 1280 --h 720 --fps 30]
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const flag = (k: string, d: number) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const W = flag('w', 1280), H = flag('h', 720), FPS = flag('fps', 30);
const names = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
const scenes = names.length ? names : ['belly', 'drill', 'monkey', 'lava', 'reentry'];
const out = process.env.OUT ?? '/tmp/seaside/clips'; // never committed (no media in main)
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5285, strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls!.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const sc of scenes) {
    const dir = mkdtempSync(join(tmpdir(), `seaside-${sc}-`)), t0 = Date.now();
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', (e) => console.warn(`${sc}: ${e.message}`));
    await page.goto(`${base}/dev/seaside.html?still=${sc}&w=${W}&h=${H}`);
    await page.waitForFunction(() => (window as any).__done, null, { timeout: 600_000 });
    const dur = await page.evaluate(() => (window as any).__duration || 8), n = Math.round(dur * FPS);
    for (let i = 0; i < n; i++) {
      await page.evaluate((t) => (window as any).__frame(t), i / FPS);
      await page.screenshot({ path: join(dir, `f${String(i).padStart(4, '0')}.png`), clip: { x: 0, y: 0, width: W, height: H }, timeout: 180_000 });
    }
    await page.close();
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(dir, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-preset', 'slow', '-movflags', '+faststart', join(out, `${sc}.mp4`)]);
    rmSync(dir, { recursive: true, force: true });
    console.log(`${sc}: ${n} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
} finally { await browser.close(); await server.close(); }
