// Chapter 2b review stills (#191), from the real game renderer on the fake bike: every island shot, at a few viewports.
//   npx tsx scripts/seaside-island-review.ts [shot names…] [--w 1180 --h 820 --inset 140]
// Stills go to $OUT (default /tmp/seaside-island; never committed). CHROMIUM_PATH selects a local browser.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const flag = (k: string, d: number) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const W = flag('w', 1180), H = flag('h', 820), inset = flag('inset', 140);
const out = process.env.OUT ?? '/tmp/seaside-island'; mkdirSync(out, { recursive: true });
/** [name, scene, start progress, seconds to ride on from there] */
const SHOTS: Array<[string, string, number, number]> = [
  ['01-surface', 'paddle', 0, 1.5], ['02-paddle', 'paddle', 0.4, 2], ['03-landing', 'paddle', 0.97, 1], ['04-beach-cast', 'beach', 0, 13],
  ['05-boardwalk', 'boardwalk', 0.1, 1], ['06-boardwalk-mid', 'boardwalk', 0.5, 1], ['07-boardwalk-late', 'boardwalk', 0.92, 1],
  ['08-planks-to-stone', 'cutStones', 0.05, 1], ['09-rows', 'cutStones', 0.45, 1], ['10-pillars', 'cutStones', 0.85, 1],
  ['11-approach', 'monkeyMouth', 0.08, 1], ['12-head', 'monkeyMouth', 0.5, 1], ['13-fangs', 'monkeyMouth', 0.88, 1],
  ['14-hall', 'temple', 0.15, 1], ['15-pool', 'temple', 0.5, 1], ['16-statue', 'temple', 0.93, 1],
];
const pick = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
const server = await createServer({ server: { port: 5302, strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls!.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors: string[] = [];
try {
  for (const [name, scene, progress, ride] of SHOTS.filter(([n]) => !pick.length || pick.some((p) => n.includes(p)))) {
    const t0 = Date.now();
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    await page.goto(`${base}/dev/seaside-play.html?scene=${scene}&progress=${progress}&speed=0&inset=${inset}&cash=150&creel=1`);
    await page.waitForFunction(() => (window as any).__renderer?.view, null, { timeout: 120_000 });
    await page.evaluate(async (n) => { const w = window as any; for (let i = 0; i < n; i += 15) { w.__session.step(Math.min(15, n - i)); await new Promise((r) => requestAnimationFrame(r)); } }, Math.round(ride * 30));
    await page.evaluate(async () => {
      const w = window as any; // (no named helpers in here: the bundler would wrap them in __name)
      for (let i = 0; i < 6; i++) { await w.__renderer.view.terrain.whenReady(); await new Promise((r) => requestAnimationFrame(r)); }
    });
    await page.waitForTimeout(5000); // the first LOD is coarse: let the fine tiles swap in
    const snap = await page.evaluate(() => { const s = (window as any).__session.sim.snapshot(); return `${s.sceneId} p=${s.scene.progress.toFixed(3)} t=${s.sceneT.toFixed(1)}${s.fishing ? ` ${s.fishing.phase}` : ''}${s.pull ? ' pull' : ''}`; });
    await page.screenshot({ path: join(out, `${name}.png`), timeout: 180_000 });
    console.log(`${name.padEnd(20)} ${snap} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
