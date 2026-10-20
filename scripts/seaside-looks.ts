// Renders the same ride frames under every look preset → docs/seaside/looks/<look>-<shot>.png + a labelled contact sheet.
//   npx tsx scripts/seaside-looks.ts [look …]
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { LOOKS } from '../src/games/seaside/render/looks';

const FAST = 'lod=1&lodres=32&lodmin=4&skirt=2&lodk=0.85&bake=1&road=1&routelod=3&hyst=1.3&fade=0.5';
const SHOTS: Array<[string, number]> = [['highway', 2.2], ['turnout', 14.6], ['catch', 22.6]];
const looks = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(LOOKS);
const out = 'docs/seaside/looks';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5291, strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls!.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const look of looks) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => console.warn(`${look}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.warn(`${look}: ${m.text().slice(0, 300)}`); });
    await page.goto(`${base}/dev/seaside-ride.html?capture=1&w=1280&h=720&${FAST}&look=${look}`);
    await page.waitForFunction(() => (window as any).__ready, null, { timeout: 600_000 });
    for (const [shot, t] of SHOTS) {
      const ms = await page.evaluate(async (t) => { const w = window as any; await w.__frame(t); const s = performance.now(); w.__frame(t); const c = w.__ride.stage.renderer.getContext(); c.readPixels(0, 0, 1, 1, c.RGBA, c.UNSIGNED_BYTE, new Uint8Array(4)); return performance.now() - s; }, t);
      await page.screenshot({ path: `${out}/${look}-${shot}.png`, clip: { x: 0, y: 0, width: 1280, height: 720 } });
      console.log(`${look.padEnd(12)} ${shot.padEnd(8)} ${ms.toFixed(0)} ms`);
    }
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
// two labelled contact sheets: the crafting options (A–D) and the story's dream dial (B → Morning → Midday → Evening)
const sheet = (name: string, rows: string[]) => {
  const args = ['montage'];
  for (const look of rows) for (const [shot] of SHOTS) args.push('-label', shot === 'highway' ? LOOKS[look].label : '', `${out}/${look}-${shot}.png`);
  args.push('-tile', `${SHOTS.length}x`, '-geometry', '640x360+6+6', '-pointsize', '22', '-background', '#f6f2e9', `${out}/${name}.jpg`);
  execFileSync('magick', args);
  console.log(`wrote ${out}/${name}.jpg`);
};
sheet('sheet-craft', ['raw', 'crafted', 'illustrated', 'pixel']);
sheet('sheet-dream', ['crafted', 'morning', 'midday', 'fever']);
