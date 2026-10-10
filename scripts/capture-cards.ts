// Records the arcade card clips from the real game renderers (dev/capture.html), frame by frame on a virtual clock.
//   npm run dev -- --port 5199 --strictPort    (in another terminal)
//   npm run capture:cards [-- --only hamster] [-- --base http://localhost:5199]
// Writes public/cards/<id>.mp4 (H.264, seamless loop) + <id>.webp (poster). Needs ffmpeg and Playwright's Chromium.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

interface Shot { query: string; crop?: [number, number, number, number]; poster?: number }
const VW = 960, VH = 540, FPS = 30, LOOP_S = 6, FADE_S = 1, OUT_W = 640, OUT_H = 360;
const ap = (o: Record<string, unknown> = {}) => `opts=${encodeURIComponent(JSON.stringify({ autopilot: true, ...o }))}`;
/** What each clip shows: a moment in full swing. crop = [x, y, w, h] in the 960×540 page (16:9 keeps it undistorted). */
const SHOTS: Record<string, Shot> = {
  cadenza: { query: `script=target-follow&sec=75&media=edm&${ap()}` },
  hamster: { query: `script=z2&sec=1200&${ap()}` },
  watershed: { query: `script=cadence-follow&sec=1500&${ap()}`, crop: [96, 100, 768, 432] },
  dungeon: { query: `script=sprints&sec=150&seed=11&${ap()}` },
  lighthouse: { query: `script=z2&sec=900&${ap()}`, crop: [210, 110, 680, 383] },
  towerdefense: { query: `script=sprints&sec=300&${ap()}`, crop: [152, 0, 656, 369] },
  starfighter: { query: `script=sprints&sec=200&${ap()}` },
};

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const base = arg('base') ?? 'http://localhost:5199', only = arg('only');
const outDir = join(process.cwd(), 'public', 'cards');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [id, shot] of Object.entries(SHOTS)) {
  if (only && only !== id) continue;
  const t0 = Date.now(), dir = mkdtempSync(join(tmpdir(), `card-${id}-`));
  const page = await browser.newPage({ viewport: { width: VW, height: VH } });
  page.on('pageerror', (e) => console.warn(`  ${id}: ${e.message}`));
  await page.addInitScript(() => { // virtual clock for the renderers' own animation (Three.js clocks, tweens)
    let vt = performance.now(); const t0 = Date.now() - vt;
    performance.now = () => vt; Date.now = () => Math.floor(t0 + vt);
    (window as unknown as { __vclock: (ms: number) => void }).__vclock = (ms) => { vt += ms; };
  });
  await page.goto(`${base}/dev/capture.html?game=${id}&manual=1&${shot.query}`);
  await page.waitForFunction(() => (window as unknown as { __advance?: unknown }).__advance, null, { polling: 200, timeout: 300_000 });
  const advance = (ms: number) => page.evaluate((m) => (window as unknown as { __advance: (ms: number) => void }).__advance(m), ms);
  const step = 1000 / FPS;
  for (let i = 0; i < FPS * 2; i++) await advance(step); // settle: textures, intro tweens
  const [x, y, w, h] = shot.crop ?? [0, 0, VW, VH];
  const frames = (LOOP_S + FADE_S) * FPS;
  for (let i = 0; i < frames; i++) {
    await advance(step);
    const ts = Date.now();
    await page.screenshot({ path: join(dir, `f${String(i).padStart(4, '0')}.png`), clip: { x, y, width: w, height: h }, timeout: 120_000 });
    if (process.env.CARD_DEBUG) console.log(`  frame ${i}: ${Date.now() - ts} ms`);
  }
  await page.close();
  // seamless loop: play [FADE, LOOP+FADE) and cross-fade its last FADE seconds into the opening [0, FADE)
  const scale = `scale=${OUT_W}:${OUT_H}:flags=lanczos`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(dir, 'f%04d.png'), '-filter_complex',
    `[0]${scale},split[s1][s2];[s1]trim=start=${FADE_S},setpts=PTS-STARTPTS[a];[s2]trim=end=${FADE_S},setpts=PTS-STARTPTS[b];` +
    `[a][b]xfade=transition=fade:duration=${FADE_S}:offset=${LOOP_S - FADE_S},format=yuv420p[v]`,
    '-map', '[v]', '-c:v', 'libx264', '-profile:v', 'main', '-crf', '30', '-preset', 'slow', '-movflags', '+faststart', '-an', join(outDir, `${id}.mp4`)]);
  const poster = join(dir, `f${String(Math.round((shot.poster ?? 0.5) * LOOP_S * FPS) + FADE_S * FPS).padStart(4, '0')}.png`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', poster, '-vf', 'scale=480:270:flags=lanczos', '-quality', '72', join(outDir, `${id}.webp`)]);
  rmSync(dir, { recursive: true, force: true });
  console.log(`${id}: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
await browser.close();
