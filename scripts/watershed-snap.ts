// Top-down PNG snapshots of a headless Watershed ride, for tuning the water/erosion sim without a browser.
//   npm run snap:watershed -- --script cadence-follow --minutes 45 --every 5 --seed 1 [--autopilot] [--out out/watershed]
// Each PNG: top = shaded terrain + water depth + particles (downstream → right); bottom = change map (red carved, yellow deposited).
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createGameSession, NullInput, testProfile } from '../src/core';
import { module as watershed } from '../src/games/watershed';
import type { WatershedSnapshot } from '../src/games/watershed/sim/sim';
import { SEA } from '../src/games/watershed/sim/terrain';

function args(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2), v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) out[k] = true; else { out[k] = v; i++; }
  }
  return out;
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(b: Uint8Array): number { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function png(w: number, h: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.subarray(y * w * 3, (y + 1) * w * 3).forEach((v, i) => { raw[y * (w * 3 + 1) + 1 + i] = v; }); }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export function renderSnap(s: WatershedSnapshot, S = 4): { w: number; h: number; rgb: Uint8Array } {
  const { nx, ny, h, h0, hard, w } = s;
  const W = ny * S, H = nx * S * 2 + 4;
  const rgb = new Uint8Array(W * H * 3);
  const put = (X: number, Y: number, r: number, g: number, b: number) => {
    if (X < 0 || Y < 0 || X >= W || Y >= H) return;
    const o = (Y * W + X) * 3; rgb[o] = r; rgb[o + 1] = g; rgb[o + 2] = b;
  };
  const at = (i: number, j: number) => h[Math.min(ny - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, z = h[k];
    const shade = Math.max(0.35, Math.min(1.3, 0.85 + 0.35 * ((at(i - 1, j) - at(i + 1, j)) + (at(i, j - 1) - at(i, j + 1)))));
    let r: number, g: number, b: number;
    if (z < SEA) { const d = Math.min(1, (SEA - z) / 5); r = 60 - 40 * d; g = 140 - 60 * d; b = 190 - 40 * d; }
    else if (z > 20) { r = g = b = 235; }
    else { const rock = 1 - Math.min(1, hard[k]); r = 95 + 70 * rock + z * 2; g = 140 - 20 * rock + z; b = 70 + 60 * rock; }
    const wd = Math.min(1, w[k] / 1.2);
    if (wd > 0.02) { r = r * (1 - wd) + 40 * wd; g = g * (1 - wd) + 120 * wd; b = b * (1 - wd) + 230 * wd; }
    const d = z - h0[k];
    let cr = 128 * shade, cg = 128 * shade, cb = 128 * shade;
    if (d < -0.05) { const a = Math.min(1, -d / 4); cr = cr * (1 - a) + 230 * a; cg *= 1 - a; cb *= 1 - a; }
    else if (d > 0.05) { const a = Math.min(1, d / 2); cr = cr * (1 - a) + 240 * a; cg = cg * (1 - a) + 210 * a; cb *= 1 - a; }
    for (let a = 0; a < S; a++) for (let c = 0; c < S; c++) {
      put(j * S + a, i * S + c, Math.min(255, r * shade), Math.min(255, g * shade), Math.min(255, b * shade));
      put(j * S + a, nx * S + 4 + i * S + c, cr, cg, cb);
    }
  }
  for (let q = 0; q < s.n; q++) put(Math.round(s.py[q] * S), Math.round(s.px[q] * S), 255, 255, 255);
  for (let a = -3; a <= 3; a++) put(2, Math.round(s.sourceX * S) + a, 255, 40, 200);
  return { w: W, h: H, rgb };
}

async function main() {
  const a = args(process.argv.slice(2));
  const script = String(a.script ?? 'cadence-follow'), minutes = Number(a.minutes ?? 45), every = Number(a.every ?? 5), seed = Number(a.seed ?? 1);
  const out = String(a.out ?? 'out/watershed');
  mkdirSync(out, { recursive: true });
  const session = createGameSession({
    game: watershed, profile: testProfile(), input: new NullInput(), fake: { script }, seed,
    simOpts: a.autopilot ? { autopilot: true } : {},
  });
  const stepsPerMin = 60 * 30;
  for (let m = every; m <= minutes + 1e-9; m += every) {
    session.step(Math.round(every * stepsPerMin));
    const s = session.sim.snapshot() as WatershedSnapshot;
    const img = renderSnap(s);
    const f = `${out}/${script}-s${seed}-${String(m).padStart(3, '0')}min.png`;
    writeFileSync(f, png(img.w, img.h, img.rgb));
    console.log(JSON.stringify({ file: f, block: s.block.name, n: s.n, carved: Math.round(s.carved), delta: Math.round(s.delta), deepestCut: +s.deepestCut.toFixed(2), toSea: Math.round(s.toSea) }));
    if (session.sim.isOver()) break;
  }
  console.log(JSON.stringify(session.sim.summary()));
}

main();
