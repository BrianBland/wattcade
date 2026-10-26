// Chapter 3 review stills (#192, #193), from the real game renderer on the fake bike: every cavern and gate shot.
//   npx tsx scripts/seaside-cavern-review.ts [shot names…] [--w 1180 --h 820 --inset 140]
// RUNES=<layout> picks the gate inscription's layout. Stills go to $OUT (default /tmp/seaside-cavern; never committed). CHROMIUM_PATH selects a local browser.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const flag = (k: string, d: number) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const W = flag('w', 1180), H = flag('h', 820), inset = flag('inset', 140);
const out = process.env.OUT ?? '/tmp/seaside-cavern'; mkdirSync(out, { recursive: true });
/** [name, scene, start progress, seconds to ride on from there] */
const SHOTS: Array<[string, string, number, number]> = [
  ['01-passage', 'cavern', 0.01, 1], ['02-torches', 'cavern', 0.2, 1], ['03-descent', 'cavern', 0.6, 1], ['04-red-rock', 'cavern', 0.9, 1],
  ['05-mouth', 'cavern', 0.985, 1], ['06-bridge', 'bridge', 0.1, 1.5], ['07-eels', 'bridge', 0.5, 2], ['08-bridge-late', 'bridge', 0.9, 1],
  ['09-cast', 'magma', 0, 13], ['10-pull', 'magma', 0.37, 30], ['11-fan-hot', 'fan', 0.05, 3], ['12-fan-cooling', 'fan', 0.5, 2], ['13-eat', 'fan', 0.9, 2],
  ['14-causeway', 'toGate', 0.05, 1], ['15-rocks', 'toGate', 0.25, 1], ['16-columns', 'toGate', 0.62, 1], ['17-wall', 'toGate', 0.9, 1], ['18-unfold', 'toGate', 0.985, 1],
  ['19-basalt', 'drill2', 0.25, 1], ['20-obsidian', 'drill2', 0.55, 1], ['21-geode', 'drill2', 0.8, 1], ['22-cracks', 'drill2', 0.97, 1],
  ['23-tip', 'fall', 0.012, 1], ['24-black', 'fall', 0.12, 1], ['25-dot', 'fall', 0.3, 1], ['26-earth', 'fall', 0.95, 1],
];
const pick = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
const server = await createServer({ server: { port: 5303, strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls!.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors: string[] = [];
try {
  for (const [name, scene, progress, ride] of SHOTS.filter(([n]) => !pick.length || pick.some((p) => n.includes(p)))) {
    const t0 = Date.now();
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    await page.goto(`${base}/dev/seaside-play.html?scene=${scene}&progress=${progress}&speed=0&inset=${inset}&cash=150&creel=1${process.env.RUNES ? `&runes=${process.env.RUNES}` : ''}`);
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
