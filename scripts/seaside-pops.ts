// How much does the terrain "reshape" while riding? Steps the 10 s ride at 30 fps (waiting for tiles each frame) and
// reports how many terrain clusters changed level, and how large their cubes were on screen when they did.
//   npx tsx scripts/seaside-pops.ts "<query>" …
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const server = await createServer({ server: { port: 5288, strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls!.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const v of process.argv.slice(2)) {
    const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
    await page.goto(`${base}/dev/seaside-ride.html?capture=1&w=320&h=180&${v}`);
    await page.waitForFunction(() => (window as any).__ready, null, { timeout: 600_000 });
    const r = await page.evaluate(async () => {
      const w = window as any, T = w.__ride.terrain;
      await w.__frame(0); T.stats.changes = 0; T.stats.changePxMax = 0; T.stats.changePxSum = 0;
      for (let i = 1; i < 300; i++) { w.__ride.setTime(i / 30); await T.whenReady(); }
      return { ...T.stats };
    });
    console.log(`${v.padEnd(70)} changes ${String(r.changes).padStart(4)} · cube px at change: avg ${(r.changePxSum / Math.max(1, r.changes)).toFixed(1)} max ${r.changePxMax.toFixed(1)} · faces ${(r.faces / 1e6).toFixed(2)} M · leaves ${r.leaves}`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
