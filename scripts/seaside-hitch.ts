// Main-thread cost of streaming during a real-time ride (30 fps, no rendering): how long each frame's pose + stream +
// swap blocks while tiles build on the worker pool. Acceptance (#185): no frame over 33 ms in a 10 min ride.
//   npx tsx scripts/seaside-hitch.ts ["world=coast" …] [--minutes 10]
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const mi = process.argv.indexOf('--minutes'), minutes = mi > 0 ? Number(process.argv[mi + 1]) : 10;
const variants = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
const server = await createServer({ server: { port: 5292, strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls!.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = false;
try {
  for (const v of variants.length ? variants : ['world=coast']) {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    page.on('pageerror', (e) => console.warn(e.message));
    await page.goto(`${base}/dev/seaside-ride.html?capture=1&w=640&h=360&${v}`);
    await page.waitForFunction(() => (window as any).__ready, null, { timeout: 600_000 });
    const r = await page.evaluate(async (minutes) => {
      const w = window as any, T = w.__view.terrain;
      await w.__frame(0); T.stats.applyMaxMs = 0; T.stats.onBuiltMaxMs = 0;
      const n = Math.min(minutes * 60, w.__ready.duration) * 30, ms: number[] = [];
      for (let i = 0; i < n; i++) {
        const s = performance.now(); w.__pose(i / 30); ms.push(performance.now() - s);
        await new Promise((res) => setTimeout(res, 33)); // let worker results arrive (their merge runs inside pose/onmessage)
      }
      const sorted = [...ms].sort((a, b) => a - b);
      return { max: sorted[sorted.length - 1], p95: sorted[Math.floor(sorted.length * 0.95)], over16: ms.filter((x) => x > 16).length, over33: ms.filter((x) => x > 33).length, n: ms.length,
        apply: T.stats.applyMaxMs, onBuilt: T.stats.onBuiltMaxMs, built: T.stats.built, pending: T.stats.pending, tiles: T.streamer.tiles.size };
    }, minutes);
    const worst = Math.max(r.max, r.onBuilt);
    if (worst > 33) failed = true;
    console.log(`${v.padEnd(32)} ${(r.n / 1800).toFixed(1)} min · pose max ${r.max.toFixed(0)} ms · p95 ${r.p95.toFixed(1)} ms · >16 ms ${r.over16} · >33 ms ${r.over33}/${r.n} · swap max ${r.apply.toFixed(0)} ms · worker-result handler max ${r.onBuilt.toFixed(0)} ms · ${r.built} tiles built, ${r.tiles} cached, ${r.pending} pending${worst > 33 ? '  ✗ FAIL' : '  ✓'}`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
process.exit(failed ? 1 : 0);
