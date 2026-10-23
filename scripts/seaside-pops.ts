// How much does the terrain "reshape" while riding? Steps the ride at 30 fps (waiting for tiles each frame) and reports
// how many terrain clusters changed level, and how large their cubes were on screen when they did.
// Acceptance (#185): cube size at a level change ≤ 8 px.
//   npx tsx scripts/seaside-pops.ts ["world=coast" …] [--seconds 10]
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const si = process.argv.indexOf('--seconds'), seconds = si > 0 ? Number(process.argv[si + 1]) : 10;
const variants = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
const server = await createServer({ server: { port: 5288, strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls!.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = false;
try {
  for (const v of variants.length ? variants : ['world=coast']) {
    const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
    page.on('pageerror', (e) => console.warn(e.message));
    await page.goto(`${base}/dev/seaside-ride.html?capture=1&w=320&h=180&${v}`);
    await page.waitForFunction(() => (window as any).__ready, null, { timeout: 600_000 });
    const r = await page.evaluate(async (seconds) => {
      const w = window as any, T = w.__view.terrain;
      await w.__frame(0); T.stats.changes = 0; T.stats.changePxMax = 0; T.stats.changePxSum = 0;
      for (let i = 1; i < seconds * 30; i++) { w.__pose(i / 30); await T.whenReady(); }
      return { ...T.stats };
    }, seconds);
    if (r.changePxMax > 8) failed = true;
    console.log(`${v.padEnd(40)} changes ${String(r.changes).padStart(4)} · cube px at change: avg ${(r.changePxSum / Math.max(1, r.changes)).toFixed(1)} max ${r.changePxMax.toFixed(1)} · faces ${(r.faces / 1e6).toFixed(2)} M · leaves ${r.leaves}${r.changePxMax > 8 ? '  ✗ FAIL' : '  ✓'}`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
process.exit(failed ? 1 : 0);
