// Chapter 2a review stills (#190), from the real game renderer on the fake bike: every belly shot, at a few viewports.
//   npx tsx scripts/seaside-belly-review.ts [shot names…] [--w 1180 --h 820 --inset 140]
// Stills go to $OUT (default /tmp/seaside-belly; never committed). CHROMIUM_PATH selects a local browser.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const flag = (k: string, d: number) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const W = flag('w', 1180), H = flag('h', 820), inset = flag('inset', 140);
const out = process.env.OUT ?? '/tmp/seaside-belly'; mkdirSync(out, { recursive: true });
/** [name, scene, start progress, seconds to ride on from there] */
const SHOTS: Array<[string, string, number, number]> = [
  ['01-black', 'eyesOpen', 0, 2], ['02-first-blink', 'eyesOpen', 0, 12], ['03-second-blink', 'eyesOpen', 0, 22], ['04-awake', 'eyesOpen', 0.9, 1],
  ['05-old-rod', 'belly', 0.06, 1], ['06-nave', 'belly', 0.25, 1], ['07-sign', 'belly', 0.2, 1], ['08-pools', 'belly', 0.5, 1], ['09-junk', 'belly', 0.8, 1],
  ['10-boat', 'spareParts', 0.1, 1], ['11-bit-in-reach', 'spareParts', 0.27, 1], ['12-gearbox', 'spareParts', 0.45, 1], ['13-unfold', 'spareParts', 0.76, 2],
  ['14-drill-ready', 'spareParts', 0.95, 1], ['15-drill-start', 'drill1', 0.05, 1], ['16-flesh', 'drill1', 0.2, 2], ['17-rest', 'drill1', 0.37, 1],
  ['18-cartilage', 'drill1', 0.5, 2], ['19-bone', 'drill1', 0.8, 2], ['20-cracks', 'drill1', 0.97, 2],
  ['21-burst', 'breakthrough', 0, 0.6], ['22-flood', 'breakthrough', 0.05, 1], ['23-rising', 'breakthrough', 0.5, 1], ['24-surface', 'breakthrough', 0.93, 1],
];
const pick = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
const server = await createServer({ server: { port: 5299, strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
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
    await page.waitForTimeout(5000); // the gut's first LOD is coarse and dark: let the fine tiles swap in
    const snap = await page.evaluate(() => { const s = (window as any).__session.sim.snapshot(); return `${s.sceneId} p=${s.scene.progress.toFixed(3)} t=${s.sceneT.toFixed(1)}${s.fishing ? ` ${s.fishing.phase}` : ''}${s.pull ? ' pull' : ''}`; });
    await page.screenshot({ path: join(out, `${name}.png`), timeout: 180_000 });
    console.log(`${name.padEnd(20)} ${snap} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
