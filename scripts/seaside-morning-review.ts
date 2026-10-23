// Chapter 1 review stills (#189), from the real game renderer on the fake bike: every Morning shot, at a few viewports.
//   npx tsx scripts/seaside-morning-review.ts [shot names…] [--w 1180 --h 820 --inset 140]
// Stills go to $OUT (default /tmp/seaside-morning; never committed). CHROMIUM_PATH selects a local browser.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const flag = (k: string, d: number) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const W = flag('w', 1180), H = flag('h', 820), inset = flag('inset', 140);
const out = process.env.OUT ?? '/tmp/seaside-morning'; mkdirSync(out, { recursive: true });
/** [name, scene, start progress, seconds to ride on from there] */
const SHOTS: Array<[string, string, number, number]> = [
  ['01-title-fog', 'title', 0, 4], ['02-title-clearing', 'title', 0.8, 1],
  ['03-highway', 'highway', 0.15, 2], ['04-big-bird', 'highway', 0.8, 1], ['05-highway-late', 'highway', 0.93, 1],
  ['06-turnout-cast', 'turnout1', 0, 13], ['07-rollers-climb', 'rollers', 0.4, 1], ['08-rollers-crest', 'rollers', 0.66, 1],
  ['09-bridge', 'rollers', 0.853, 1], ['10-lous-lot', 'rollers', 0.97, 1], ['11-descent', 'toPier', 0.4, 1], ['12-town', 'toPier', 0.68, 1],
  ['13-pier-entrance', 'toPier', 0.72, 1], ['14-on-the-pier', 'toPier', 0.88, 1], ['15-pier-fishing', 'pier', 0, 14],
  ['16-big-one-wait', 'bigOne', 0.2, 2], ['17-gulls-leave', 'bigOne', 0.28, 3], ['18-shadow', 'bigOne', 0.42, 2],
  ['19-the-pull', 'bigOne', 0.49, 8], ['20-yanked', 'bigOne', 0.64, 1.2], ['21-splash', 'bigOne', 0.65, 1.5], ['22-dragged', 'bigOne', 0.8, 1],
  ['23-under', 'under', 0.2, 1], ['24-mouth', 'under', 0.7, 1], ['25-black', 'under', 0.97, 1],
];
const pick = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
const server = await createServer({ server: { port: 5298, strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
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
    const snap = await page.evaluate(() => { const s = (window as any).__session.sim.snapshot(); return `${s.sceneId} p=${s.scene.progress.toFixed(3)} t=${s.sceneT.toFixed(1)}${s.fishing ? ` ${s.fishing.phase}` : ''}${s.pull ? ' pull' : ''}`; });
    await page.screenshot({ path: join(out, `${name}.png`), timeout: 180_000 });
    console.log(`${name.padEnd(20)} ${snap} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
