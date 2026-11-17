// Packs the winning ground kits (PNG masters, docs/towerdefense/ground-kit/BRIEF.md) for the game: keyed sheets are cut
// into stamps with alpha and despill, swatches and the road strip are downscaled and cropped, everything is WebP, and
// each kit gets a manifest the renderer's compositor reads (render/ground/kit.ts).
//   git archive origin/td-ground-kits-winners public/td/ground-kits | tar -x -C /tmp/kitsrc
//   npx tsx scripts/td-pack-kits.ts /tmp/kitsrc/public/td/ground-kits
// Writes public/td/kits/<style>/{kit.json, *.webp}. Needs ImageMagick (`magick` or `convert`) with WebP.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { KitManifest, KitStamp } from '../src/games/towerdefense/render/ground/kit';

const src = process.argv[2];
if (!src) { console.error('usage: tsx scripts/td-pack-kits.ts <ground-kits dir>'); process.exit(1); }
const IM = (() => { try { execFileSync('magick', ['-version']); return 'magick'; } catch { return 'convert'; } })();
/** Output scale: the masters are 16 px per unit; the game's field shows ~9 CSS px per unit, so 12 is plenty. */
const PPU = 12;
const QUALITY = '82';

/** style id → source folder and import cleanup (handoff §6). */
const KITS: Record<string, { folder: string; despill?: number; dropDecals?: (b: Blob, mean: [number, number, number]) => boolean }> = {
  // the pale ochre dust patches read as empty pads: keep only the dark decals (scorch, cracks, rubble)
  outpost: { folder: 'outpost-codex', dropDecals: (_b, [r, , b]) => r - b > 28 },
  scrapyard: { folder: 'scrapyard-grok-b' },
  badlands: { folder: 'badlands-grok-c', despill: 1.6 }, // green key fringe on clearings/decals
  volcanic: { folder: 'volcanic-grok' },
  overgrown: { folder: 'overgrown-grok-b' },
  blight: { folder: 'blight-grok-c' },
};

interface Raw { d: Uint8Array; w: number; h: number }
const read = (file: string): Raw => {
  const [w, h] = execFileSync(IM, [file, '-format', '%w %h', 'info:']).toString().trim().split(' ').map(Number);
  return { d: new Uint8Array(execFileSync(IM, [file, '-depth', '8', 'rgba:-'], { maxBuffer: 1 << 28 })), w, h };
};
/** Writes RGBA (cropped to x,y,w,h) as WebP at PPU, from 16 ppu masters. */
function write(r: Raw, out: string, crop?: { x: number; y: number; w: number; h: number }, alpha = false) {
  const c = crop ?? { x: 0, y: 0, w: r.w, h: r.h }, buf = new Uint8Array(c.w * c.h * 4);
  for (let y = 0; y < c.h; y++) buf.set(r.d.subarray(((c.y + y) * r.w + c.x) * 4, ((c.y + y) * r.w + c.x + c.w) * 4), y * c.w * 4);
  const args = ['-size', `${c.w}x${c.h}`, '-depth', '8', 'rgba:-', '-filter', 'Lanczos', '-resize', `${(PPU / 16 * 100).toFixed(3)}%`, '-quality', QUALITY];
  if (alpha) args.push('-define', 'webp:alpha-quality=90'); else args.push('-alpha', 'off');
  execFileSync(IM, [...args, out], { input: buf });
}

/** Key colour: #00FF00, or #FF00FF for green styles, whichever covers more of the sheet. */
function keyOf(d: Uint8Array): [number, number, number] {
  let green = 0, magenta = 0;
  for (let o = 0; o < d.length; o += 16) {
    if (d[o + 1] > 200 && d[o] < 80 && d[o + 2] < 80) green++;
    else if (d[o] > 200 && d[o + 2] > 200 && d[o + 1] < 80) magenta++;
  }
  return magenta > green ? [255, 0, 255] : [0, 255, 0];
}
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Alpha from distance to the key, then despill: the key hue is pulled out of partly transparent edge pixels. */
function keyOut(r: Raw, despill = 1): void {
  const d = r.d, key = keyOf(d), green = key[1] > 128;
  for (let o = 0; o < d.length; o += 4) {
    const dist = Math.hypot(d[o] - key[0], d[o + 1] - key[1], d[o + 2] - key[2]);
    const a = smooth(60 * despill, 140 * despill, dist);
    d[o + 3] = Math.round(a * 255);
    if (a < 1 || despill > 1) {
      if (green) d[o + 1] = Math.min(d[o + 1], Math.max(d[o], d[o + 2]));
      else { const m = Math.min(d[o], d[o + 2]); d[o] = Math.min(d[o], Math.max(m, d[o + 1])); d[o + 2] = Math.min(d[o + 2], Math.max(m, d[o + 1])); }
    }
    if (a === 0) d[o] = d[o + 1] = d[o + 2] = 0;
  }
}
interface Blob { x: number; y: number; w: number; h: number; n: number }
/** Connected opaque blobs on a 4 px grid, largest first (tiny specks dropped). */
function blobs(r: Raw): Blob[] {
  const S = 4, gw = Math.ceil(r.w / S), gh = Math.ceil(r.h / S), lab = new Int32Array(gw * gh).fill(-1);
  const solid = (gx: number, gy: number) => r.d[((gy * S) * r.w + gx * S) * 4 + 3] > 128;
  const out: Array<Blob & { x1: number; y1: number }> = [];
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    if (lab[gy * gw + gx] >= 0 || !solid(gx, gy)) continue;
    const b = { x: gx, y: gy, x1: gx, y1: gy, w: 0, h: 0, n: 0 }, id = out.length, stack = [gy * gw + gx]; lab[gy * gw + gx] = id;
    while (stack.length) {
      const i = stack.pop()!, x = i % gw, y = (i / gw) | 0; b.n++;
      b.x = Math.min(b.x, x); b.x1 = Math.max(b.x1, x); b.y = Math.min(b.y, y); b.y1 = Math.max(b.y1, y);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) if (nx >= 0 && ny >= 0 && nx < gw && ny < gh && lab[ny * gw + nx] < 0 && solid(nx, ny)) { lab[ny * gw + nx] = id; stack.push(ny * gw + nx); }
    }
    out.push(b);
  }
  return out.filter(b => b.n > 40).sort((a, b) => b.n - a.n).map(b => {
    // a 4 px margin keeps the soft edge
    const x = Math.max(0, b.x * S - 4), y = Math.max(0, b.y * S - 4);
    return { x, y, w: Math.min(r.w - x, (b.x1 - b.x + 1) * S + 8), h: Math.min(r.h - y, (b.y1 - b.y + 1) * S + 8), n: b.n };
  });
}

const outRoot = join(process.cwd(), 'public', 'td', 'kits');
let total = 0;
const size = (f: string) => { const n = readFileSync(f).length; total += n; return n; };
for (const [style, cfg] of Object.entries(KITS)) {
  const dir = join(src, cfg.folder), out = join(outRoot, style);
  if (!existsSync(dir)) { console.warn(`skip ${style}: ${dir} missing`); continue; }
  rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
  const meta = existsSync(join(dir, 'kit.json')) ? JSON.parse(readFileSync(join(dir, 'kit.json'), 'utf8')) as { roadHalf?: number; roadRim?: number } : {};
  const roadHalf = meta.roadHalf ?? 4, roadRim = meta.roadRim ?? 1;
  let bytes = 0;
  const put = (r: Raw, name: string, crop?: Blob, alpha = false) => { const f = join(out, `${name}.webp`); write(r, f, crop, alpha); bytes += size(f); return `${name}.webp`; };
  // swatches
  for (const f of ['ground_a', 'ground_b', 'gravel']) put(read(join(dir, `${f}.png`)), f);
  // the road strip: only the band around the centre line is ever sampled (road + rim + a margin)
  const road = read(join(dir, 'road.png')), band = Math.round((roadHalf + roadRim + 4) * 16);
  put(road, 'road', { x: 0, y: Math.round(road.h / 2) - band, w: road.w, h: band * 2, n: 0 });
  // keyed hive overlay (bombed as a whole, so it keeps its own alpha)
  const hive = read(join(dir, 'overlay_hive.png')); keyOut(hive, cfg.despill); put(hive, 'hive', undefined, true);
  // cut-out sheets: blobs first (sizes in units), written once their role is known
  const sheet = (file: string) => { const r = read(join(dir, file)); keyOut(r, cfg.despill); return { r, list: blobs(r) }; };
  const stamp = (r: Raw, b: Blob, name: string): KitStamp => ({ file: put(r, name, b, true), w: +(b.w / 16).toFixed(2), h: +(b.h / 16).toFixed(2) });
  const dc = sheet('decals.png');
  // decals sheet: the largest blob is the turret apron, the next roughly round one the pad clearing, the rest decals
  const [apronB, ...rest] = dc.list, ci = rest.findIndex(b => Math.abs(b.w - b.h) < 0.25 * b.w);
  const clearingB = ci >= 0 ? rest.splice(ci, 1)[0] : undefined;
  const apron = stamp(dc.r, apronB, 'apron'), clearing = clearingB && stamp(dc.r, clearingB, 'clearing');
  const meanOf = (r: Raw, b: Blob): [number, number, number] => {
    const t = [0, 0, 0]; let n = 0;
    for (let y = b.y; y < b.y + b.h; y += 2) for (let x = b.x; x < b.x + b.w; x += 2) { const o = (y * r.w + x) * 4; if (r.d[o + 3] > 200) { for (let k = 0; k < 3; k++) t[k] += r.d[o + k]; n++; } }
    return [t[0] / Math.max(1, n), t[1] / Math.max(1, n), t[2] / Math.max(1, n)];
  };
  const decals = rest.filter((b) => !cfg.dropDecals?.(b, meanOf(dc.r, b))).map((b, i) => stamp(dc.r, b, `decal${i}`));
  const pr = sheet('props.png'), props = pr.list.map((b, i) => stamp(pr.r, b, `prop${i}`));
  const br = sheet('bridge.png'), deck = stamp(br.r, br.list[0], 'deck');
  const hm = existsSync(join(dir, 'hive_mouth.png')) ? sheet('hive_mouth.png') : null, hiveMouth = hm && hm.list[0] ? stamp(hm.r, hm.list[0], 'mouth') : undefined;
  const manifest: KitManifest = {
    style, source: cfg.folder, ppu: PPU, roadHalf, roadRim, roadBand: band / 16,
    files: { groundA: 'ground_a.webp', groundB: 'ground_b.webp', gravel: 'gravel.webp', road: 'road.webp', hive: 'hive.webp' },
    apron, clearing, decals, props, deck, hiveMouth,
  };
  writeFileSync(join(out, 'kit.json'), JSON.stringify(manifest, null, 1) + '\n');
  console.log(`${style}: ${(bytes / 1024).toFixed(0)} KB, ${decals.length} decals (${rest.length - decals.length} dropped), ${props.length} props, clearing ${clearing ? 'yes' : 'no'}`);
}
console.log(`total ${(total / 1024 / 1024).toFixed(2)} MB`);
