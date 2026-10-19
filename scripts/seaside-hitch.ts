// Main-thread cost of the ride as it plays in real time (30 fps, no rendering): how long setTime() blocks per frame
// while terrain streams. Compares inline tile builds with the worker pool.
//   npx tsx scripts/seaside-hitch.ts "<query>" …
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const server = await createServer({ server: { port: 5292, strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls!.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const v of process.argv.slice(2)) {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    await page.goto(`${base}/dev/seaside-ride.html?capture=1&w=640&h=360&${v}`);
    await page.waitForFunction(() => (window as any).__ready, null, { timeout: 600_000 });
    const r = await page.evaluate(async () => {
      const w = window as any; await w.__frame(0); if (w.__ride.terrain) { w.__ride.terrain.stats.applyMaxMs = 0; w.__ride.terrain.stats.onBuiltMaxMs = 0; }
      const ms: number[] = [];
      for (let i = 0; i < 23.5 * 30; i++) {
        const s = performance.now(); w.__ride.setTime(i / 30); ms.push(performance.now() - s);
        await new Promise((res) => setTimeout(res, 33)); // let worker results arrive (their merge runs inside setTime/onmessage)
      }
      const sorted = [...ms].sort((a, b) => a - b);
      return { max: sorted[sorted.length - 1], p95: sorted[Math.floor(sorted.length * 0.95)], over16: ms.filter((x) => x > 16).length, n: ms.length, pending: w.__ride.terrain?.stats.pending, apply: w.__ride.terrain?.stats.applyMaxMs ?? 0, onBuilt: w.__ride.terrain?.stats.onBuiltMaxMs ?? 0 };
    });
    console.log(`${v.padEnd(60)} setTime max ${r.max.toFixed(0)} ms · p95 ${r.p95.toFixed(1)} ms · frames >16 ms: ${r.over16}/${r.n} · swap max ${r.apply.toFixed(0)} ms · worker-result handler max ${r.onBuilt.toFixed(0)} ms`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
