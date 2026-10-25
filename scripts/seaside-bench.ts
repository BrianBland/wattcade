// Headless perf bench for the Seaside engine: render a fixed set of frames of a world's ride, report cost + save frames.
//   npx tsx scripts/seaside-bench.ts "world=coast" ["world=belly&look=belly" ...]   (each arg is a query string for
//   /dev/seaside-ride.html; frames → /tmp/seaside-bench/<label>/). Swiftshader timings are relative, not iPad fps.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const W = Number(process.env.BENCH_W ?? 1280), Hh = Math.round(W * 9 / 16);
const variants = process.argv.slice(2).length ? process.argv.slice(2) : ['world=coast'];
const TIMES = (process.env.BENCH_T ?? '2,6,9.5,13,17.7,21.2,23').split(',').map(Number);
const server = await createServer({ server: { port: 5294, strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls!.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const finish = (w: any) => { const c = w.__view.stage.renderer.getContext(); c.readPixels(0, 0, 1, 1, c.RGBA, c.UNSIGNED_BYTE, new Uint8Array(4)); }; // forces the GPU work to finish
try {
  for (const v of variants) {
    const label = v || 'default', dir = `/tmp/seaside-bench/${label.replace(/[^a-z0-9=&.]/gi, '_')}`;
    mkdirSync(dir, { recursive: true });
    const page = await browser.newPage({ viewport: { width: W, height: Hh } });
    page.on('pageerror', (e) => console.warn(e.message));
    await page.goto(`${base}/dev/seaside-ride.html?capture=1&w=${W}&h=${Hh}&${v}`);
    const ready = await (await page.waitForFunction(() => (window as any).__ready, null, { timeout: 600_000 })).jsonValue() as { buildMs: number };
    const t0 = Date.now();
    await page.evaluate(async (fin) => { const w = window as any; await w.__frame(0); new Function('w', `(${fin})(w)`)(w); }, finish.toString()); // first tiles + shader compiles
    const firstMs = Date.now() - t0;
    const rows: number[] = [];
    let tris = 0, calls = 0;
    for (const t of TIMES) {
      await page.evaluate(async ([t, fin]) => { const w = window as any; await w.__frame(t); new Function('w', `(${fin})(w)`)(w); }, [t, finish.toString()] as const); // stream tiles in first
      const r = await page.evaluate(async ([t, fin]) => {
        const w = window as any, gl = w.__view.stage.renderer, s = performance.now();
        await w.__frame(t); new Function('w', `(${fin})(w)`)(w);
        return { ms: performance.now() - s, tris: gl.info.render.triangles, calls: gl.info.render.calls };
      }, [t, finish.toString()] as const);
      rows.push(r.ms); tris = Math.max(tris, r.tris); calls = Math.max(calls, r.calls);
      await page.screenshot({ path: `${dir}/t${t}.png`, timeout: 180_000 });
    }
    const lod = await page.evaluate(() => (window as any).__view.terrain.stats);
    console.log(`  lod: ${lod.leaves} leaves in ${lod.clusters} clusters, ${lod.built} tiles built in ${lod.buildMs.toFixed(0)} ms of worker time, ${lod.workers} workers`);
    console.log(`${label.padEnd(28)} build ${String(ready.buildMs).padStart(6)} ms · first frame ${firstMs} ms · faces ${(lod.faces / 1e6).toFixed(2)} M · max tris ${(tris / 1e6).toFixed(2)} M · calls ${calls} · render avg ${(rows.reduce((a, b) => a + b, 0) / rows.length).toFixed(0)} ms (${rows.map((x) => x.toFixed(0)).join(' ')})`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
