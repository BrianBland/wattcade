// Headless perf bench for the Seaside motion test: render a fixed set of frames under some knobs, report cost + save frames.
//   npx tsx scripts/seaside-bench.ts "greedy=1" ["greedy=0" ...]       (each arg is a query string; frames → /tmp/seaside-bench/<label>/)
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const W = Number(process.env.BENCH_W ?? 1280), Hh = Math.round(W * 9 / 16);
const variants = process.argv.slice(2).length ? process.argv.slice(2) : [''];
const TIMES = [2, 6, 9.5, 13, 17.7, 21.2, 23];
const server = await createServer({ server: { port: 5294, strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls!.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const v of variants) {
    const label = v || 'default', dir = `/tmp/seaside-bench/${label.replace(/[^a-z0-9=&.]/gi, '_')}`;
    mkdirSync(dir, { recursive: true });
    const page = await browser.newPage({ viewport: { width: W, height: Hh } });
    page.on('pageerror', (e) => console.warn(e.message));
    await page.goto(`${base}/dev/seaside-ride.html?capture=1&w=${W}&h=${Hh}&${v}`);
    const ready = await (await page.waitForFunction(() => (window as any).__ready, null, { timeout: 600_000 })).jsonValue() as { buildMs: number };
    const t0 = Date.now();
    await page.evaluate(async () => { const w = window as any; await w.__frame(0); const c = w.__ride.stage.renderer.getContext(); c.readPixels(0, 0, 1, 1, c.RGBA, c.UNSIGNED_BYTE, new Uint8Array(4)); }); // first full set of tiles + shader compiles
    const firstMs = Date.now() - t0;
    const rows: number[] = [];
    let tris = 0, calls = 0;
    for (const t of TIMES) {
      await page.evaluate(async (t) => { const w = window as any; await w.__frame(t); const c = w.__ride.stage.renderer.getContext(); c.readPixels(0, 0, 1, 1, c.RGBA, c.UNSIGNED_BYTE, new Uint8Array(4)); }, t); // stream tiles in first
      const r = await page.evaluate(async (t) => { const w = window as any, gl = w.__ride.stage.renderer; const s = performance.now(); await w.__frame(t); const c = gl.getContext(); c.readPixels(0, 0, 1, 1, c.RGBA, c.UNSIGNED_BYTE, new Uint8Array(4)); /* forces the GPU work to finish */ const ms = performance.now() - s; return { ms, tris: gl.info.render.triangles, calls: gl.info.render.calls }; }, t);
      rows.push(r.ms); tris = Math.max(tris, r.tris); calls = Math.max(calls, r.calls);
      await page.screenshot({ path: `${dir}/t${t}.png`, timeout: 180_000 });
    }
    const faces = await page.evaluate(() => (window as any).__ride.stage.stats.join('\n'));
    const lod = await page.evaluate(() => { const t = (window as any).__ride.terrain; return t ? t.stats : null; });
    const total = [...faces.matchAll(/([\d,]+) faces/g)].reduce((n, m) => n + Number(m[1].replace(/,/g, '')), 0) + (lod ? lod.faces : 0);
    if (lod) {
      const by = await page.evaluate(() => { const t = (window as any).__ride.terrain, out: Record<string, number> = {};
        for (const k of t.wanted) { const d = t.tiles.get(k)?.data, S = k.split(',')[2]; out[S] = (out[S] ?? 0) + (d?.land?.faces ?? 0) + (d?.water?.faces ?? 0); }
        return out; });
      console.log('  faces by tile size (m): ' + Object.entries(by).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => `${k}:${(v / 1000).toFixed(0)}k`).join(' '));
    }
    if (lod) console.log(`  lod: ${lod.leaves} leaves in ${lod.clusters} clusters (last frame), ${lod.built} tiles built in ${lod.buildMs.toFixed(0)} ms of worker time, ${lod.workers} workers`);
    console.log(`${label.padEnd(28)} build ${String(ready.buildMs).padStart(6)} ms · first frame ${firstMs} ms · faces ${(total / 1e6).toFixed(2)} M · max tris ${(tris / 1e6).toFixed(2)} M · calls ${calls} · render avg ${(rows.reduce((a, b) => a + b, 0) / rows.length).toFixed(0)} ms (${rows.map((x) => x.toFixed(0)).join(' ')})`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
