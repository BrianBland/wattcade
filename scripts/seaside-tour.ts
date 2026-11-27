// Whole-story review tour: stills from the real renderer on the fake bike, a few per scene from the rollers to the end.
//   npx tsx scripts/seaside-tour.ts [name or scene filters…] [--w 1180 --h 820 --inset 140]
// Stills go to $OUT (default /tmp/seaside-tour; never committed). CHROMIUM_PATH selects a local browser.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { STORY } from '../src/games/seaside/sim/story';

const flag = (k: string, d: number) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const W = flag('w', 1180), H = flag('h', 820), inset = flag('inset', 140);
const out = process.env.OUT ?? '/tmp/seaside-tour'; mkdirSync(out, { recursive: true });
const FIRST = STORY.findIndex((s) => s.id === 'rollers');
/** [name, scene, start progress, seconds to ride on from there] */
const SHOTS: Array<[string, string, number, number]> = [];
STORY.slice(FIRST).forEach((s, i) => {
  const n = String(i + 1).padStart(2, '0');
  for (const [tag, p] of [['a', 0.03], ['b', 0.5], ['c', 0.94]] as const) SHOTS.push([`${n}${tag}-${s.id}`, s.id, p, 1.5]);
});
const pick = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
const server = await createServer({ server: { port: 5312, strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls!.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors: string[] = [];
try {
  for (const [name, scene, progress, ride] of SHOTS.filter(([n, sc]) => !pick.length || pick.some((p) => n.includes(p) || sc === p))) {
    const t0 = Date.now();
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    await page.goto(`${base}/dev/seaside-play.html?scene=${scene}&progress=${progress}&speed=0&inset=${inset}&cash=150&creel=1`);
    await page.waitForFunction(() => (window as any).__frames > 2, null, { timeout: 120_000 });
    await page.evaluate(async (n) => { const w = window as any; for (let i = 0; i < n; i += 15) { w.__session.step(Math.min(15, n - i)); await new Promise((r) => requestAnimationFrame(r)); } }, Math.round(ride * 30));
    await page.evaluate(async () => {
      const w = window as any;
      for (let i = 0; i < 6; i++) { await w.__renderer.view?.terrain.whenReady(); await new Promise((r) => requestAnimationFrame(r)); }
    });
    await page.waitForTimeout(4000);
    const snap = await page.evaluate(() => { const s = (window as any).__session.sim.snapshot(); return `${s.sceneId} p=${s.scene.progress.toFixed(3)} t=${s.sceneT.toFixed(1)}${s.fishing ? ` ${s.fishing.phase}` : ''}${s.pull ? ' pull' : ''}`; });
    await page.screenshot({ path: join(out, `${name}.png`), timeout: 180_000 });
    console.log(`${name.padEnd(24)} ${snap} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
