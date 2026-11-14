// Records the arcade card clips from the real game renderers (dev/capture.html), frame by frame on a virtual clock.
// The clips are build output, not source: CI records them on deploy (deploy.yml) and caches them per game, keyed on
// everything that can change the picture (scripts/cards-key.ts), so only games that changed are re-recorded.
//   npm run capture:cards                      # all games, into public/cards (gitignored); starts its own Vite server
//   npm run capture:cards -- --only hamster    # one game
//   --cache <dir>   reuse <dir>/<id>.{mp4,webp,key} when the key matches; record into it otherwise
//   --cached-only   publish whatever the cache has (even if out of date) and record nothing (the fast first deploy, PR
//                   previews). Games whose clip is out of date or missing go to $GITHUB_OUTPUT as `stale=<ids>`.
//   --base <url>    use a running dev server instead of starting one
// Games are recorded one at a time: pages share the browser's one (software) GPU process, so parallel pages just contend.
// Shots (script, sim time, crop) are in src/shell/cards/shots.ts. Needs ffmpeg and Playwright's Chromium.
// A game that fails keeps its last cached clip, or has none (the card falls back to its drawCard art); exit code stays 0.
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium, type Browser } from 'playwright-core';
import { CARD_SHOTS, shotQuery, STAGE_H as VH, STAGE_W as VW, type CardShot } from '../src/shell/cards/shots';
import { cardKey } from './cards-key';

const FPS = 30, LOOP_S = 6, FADE_S = 1, OUT_W = 640, OUT_H = 360;
const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const only = arg('only'), cachedOnly = process.argv.includes('--cached-only');
const outDir = resolve('public', 'cards'), cacheDir = arg('cache') ? resolve(arg('cache')!) : null;
mkdirSync(outDir, { recursive: true });
if (cacheDir) mkdirSync(cacheDir, { recursive: true });

async function record(browser: Browser, base: string, id: string, shot: CardShot, into: string): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), `card-${id}-`));
  const [x, y, w, h] = shot.crop ?? [0, 0, VW, VH];
  // Render at the clip's resolution, not the page's: software GL cost is per pixel (full-page shots: 2.25× fewer).
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: Math.min(1, OUT_W / w) });
  try {
    page.on('pageerror', (e) => console.warn(`  ${id}: ${e.message}`));
    await page.addInitScript(() => { // virtual clock for the renderers' own animation (Three.js clocks, tweens)
      let vt = performance.now(); const t0 = Date.now() - vt;
      performance.now = () => vt; Date.now = () => Math.floor(t0 + vt);
      (window as unknown as { __vclock: (ms: number) => void }).__vclock = (ms) => { vt += ms; };
    });
    await page.goto(`${base}/dev/capture.html?game=${id}&manual=1&${shotQuery(shot)}`);
    await page.waitForFunction(() => (window as unknown as { __advance?: unknown }).__advance, null, { polling: 200, timeout: 300_000 });
    const advance = (ms: number) => page.evaluate((m) => (window as unknown as { __advance: (ms: number) => void }).__advance(m), ms);
    const step = 1000 / FPS;
    for (let i = 0; i < FPS * 2; i++) await advance(step); // settle: textures, intro tweens
    for (let i = 0; i < (LOOP_S + FADE_S) * FPS; i++) {
      await advance(step);
      await page.screenshot({ path: join(dir, `f${String(i).padStart(4, '0')}.png`), clip: { x, y, width: w, height: h }, timeout: 180_000 });
    }
  } finally { await page.close(); }
  // seamless loop: play [FADE, LOOP+FADE) and cross-fade its last FADE seconds into the opening [0, FADE)
  const scale = `scale=${OUT_W}:${OUT_H}:flags=lanczos`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(dir, 'f%04d.png'), '-filter_complex',
    `[0]${scale},split[s1][s2];[s1]trim=start=${FADE_S},setpts=PTS-STARTPTS,fps=${FPS},settb=AVTB[a];[s2]trim=end=${FADE_S},setpts=PTS-STARTPTS,fps=${FPS},settb=AVTB[b];` +
    `[a][b]xfade=transition=fade:duration=${FADE_S}:offset=${LOOP_S - FADE_S},format=yuv420p[v]`,
    '-map', '[v]', '-c:v', 'libx264', '-profile:v', 'main', '-crf', '30', '-preset', 'slow', '-movflags', '+faststart', '-an', join(dir, 'out.mp4')]);
  const poster = join(dir, `f${String(Math.round((shot.poster ?? 0.5) * LOOP_S * FPS) + FADE_S * FPS).padStart(4, '0')}.png`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', poster, '-vf', 'scale=480:270:flags=lanczos', '-quality', '72', join(dir, 'out.webp')]);
  for (const e of ['mp4', 'webp']) copyFileSync(join(dir, `out.${e}`), join(into, `${id}.${e}`)); // only once both encoded
  rmSync(dir, { recursive: true, force: true });
}

const cached = (id: string) => cacheDir && ['mp4', 'webp'].every((e) => existsSync(join(cacheDir, `${id}.${e}`)));
const publish = (id: string) => { for (const e of ['mp4', 'webp']) copyFileSync(join(cacheDir!, `${id}.${e}`), join(outDir, `${id}.${e}`)); };

const todo: Array<[string, CardShot, string]> = [], stale: string[] = [];
for (const [id, shot] of Object.entries(CARD_SHOTS)) {
  if (only && only !== id) continue;
  const key = cardKey(id, shot);
  const keyFile = cacheDir && join(cacheDir, `${id}.key`);
  if (keyFile && cached(id) && existsSync(keyFile) && readFileSync(keyFile, 'utf8').trim() === key) { publish(id); console.log(`${id}: up to date (${key})`); continue; }
  if (cachedOnly) { stale.push(id); if (cached(id)) publish(id); console.log(`${id}: ${cached(id) ? 'out-of-date clip' : 'no clip'} (needs ${key})`); continue; }
  todo.push([id, shot, key]);
}

if (cachedOnly && process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `stale=${stale.join(' ')}\n`);

if (todo.length) {
  let base = arg('base'), server: { close(): Promise<void> } | null = null;
  if (!base) {
    const { createServer } = await import('vite');
    const s = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error', clearScreen: false });
    await s.listen(); server = s;
    base = s.resolvedUrls?.local[0]?.replace(/\/$/, '') ?? 'http://localhost:5199';
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let failed = 0;
  for (const [id, shot, key] of todo) {
    const t0 = Date.now();
    try {
      await record(browser, base!, id, shot, cacheDir ?? outDir);
      if (cacheDir) { writeFileSync(join(cacheDir, `${id}.key`), key); publish(id); }
      console.log(`${id}: recorded in ${((Date.now() - t0) / 1000).toFixed(0)} s (${key})`);
    } catch (e) {
      failed++;
      const kept = cached(id);
      if (kept) publish(id);
      console.warn(`::warning title=Card clip ${id}::recording failed (${String(e).split('\n')[0]}); ${kept ? 'kept the previous clip' : 'the card shows its art'}`);
    }
  }
  await browser.close();
  await server?.close();
  if (failed) console.warn(`${failed} clip(s) failed`);
}
