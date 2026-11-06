// Spike: can generated ground match the painted map, and which ground kit is best?
//   /dev/td-ground.html                 painting vs ground generated from patches of the painting
//   /dev/td-ground.html?kit=a,b         kits from public/td/ground-kits/<folder>/ on the same maps (see
//                                       docs/towerdefense/ground-kit/BRIEF.md); add &blind=1 to hide kit names
//   /dev/td-ground.html?sheet=1         sprite reference sheet at kit scale (16 px per unit) for the generators
// The real turret, towers and aliens draw on top of every panel.
import { createGameSession, NullInput, testProfile } from '../src/core';
import { module } from '../src/games/towerdefense';
import { ROAD } from '../src/games/towerdefense/sim/road';
import { KINDS, PADS, BASE_X, BASE_Y, type Kind } from '../src/games/towerdefense/sim/defs';
import type { EnemyView, TdSnapshot, TowerView } from '../src/games/towerdefense/sim/types';
import { Machinery } from '../src/games/towerdefense/render/machinery';
import { AlienLayer, type View } from '../src/games/towerdefense/render/aliens/layer';
import { loadImage } from '../src/games/towerdefense/render/assets';
import maps from './td-ground-maps.json';

type P = { x: number; y: number };
type Out = number[];
interface MapDef { name: string; line: P[]; pads: P[]; turret: P; tr: number; hw: number; shoulder: number; bridges: P[]; over: 'first' | 'last' }
const q = new URLSearchParams(location.search);
const BOX = { x0: -8, y0: -16, w: 96, h: 132 };          // world area each panel shows (field + some overflow)
const K = Number(q.get('k') ?? 7);
const BASE = import.meta.env.BASE_URL;

// ---------- noise and helpers ----------
const hash = (i: number, j: number) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
function noise(x: number, y: number) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v;
}
const fbm = (x: number, y: number) => noise(x, y) * 0.6 + noise(x * 2.3, y * 2.3) * 0.3 + noise(x * 5.1, y * 5.1) * 0.1;
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const tri = (v: number, n: number) => { const m = ((v % (2 * n)) + 2 * n) % (2 * n); return m < n ? m : 2 * n - m; }; // mirror-repeat
const lerpInto = (col: Out, tmp: Out, w: number) => { for (let k = 0; k < 3; k++) col[k] = col[k] * (1 - w) + tmp[k] * w; };
function withS(line: P[]) { const out: Array<P & { s: number }> = []; let s = 0; line.forEach((p, i) => { if (i) s += Math.hypot(p.x - line[i - 1].x, p.y - line[i - 1].y); out.push({ ...p, s }); }); return out; }

// ---------- images as samplable pixels ----------
/** Pixels plus scale: `ppu` image pixels per world unit. Alpha is kept for keyed stamps. */
interface Img { d: Uint8ClampedArray; w: number; h: number; ppu: number }
function pixels(src: CanvasImageSource & { width: number; height: number }, ppu = 16): Img {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(src, 0, 0);
  return { d: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height, ppu };
}
/** Bilinear RGB into `out` (scaled by w); returns the sampled alpha 0..1. */
function samplePx(im: Img, px: number, py: number, out: Out, w = 1): number {
  px = Math.max(0, Math.min(im.w - 2, px)); py = Math.max(0, Math.min(im.h - 2, py));
  const ix = px | 0, iy = py | 0, fx = px - ix, fy = py - iy, d = im.d, W = im.w;
  const o00 = (iy * W + ix) * 4, o10 = o00 + 4, o01 = o00 + W * 4, o11 = o01 + 4;
  const a00 = (1 - fx) * (1 - fy), a10 = fx * (1 - fy), a01 = (1 - fx) * fy, a11 = fx * fy;
  for (let c = 0; c < 3; c++) out[c] += w * (d[o00 + c] * a00 + d[o10 + c] * a10 + d[o01 + c] * a01 + d[o11 + c] * a11);
  return (d[o00 + 3] * a00 + d[o10 + 3] * a10 + d[o01 + 3] * a01 + d[o11 + 3] * a11) / 255;
}
/** Like samplePx but weights each texel's colour by its alpha (no key-colour fringe); adds rgb·a into `out`, returns alpha. */
function samplePremul(im: Img, px: number, py: number, out: Out, w = 1): number {
  px = Math.max(0, Math.min(im.w - 2, px)); py = Math.max(0, Math.min(im.h - 2, py));
  const ix = px | 0, iy = py | 0, fx = px - ix, fy = py - iy, d = im.d, W = im.w;
  let alpha = 0;
  for (const [o, f] of [[(iy * W + ix) * 4, (1 - fx) * (1 - fy)], [(iy * W + ix + 1) * 4, fx * (1 - fy)], [((iy + 1) * W + ix) * 4, (1 - fx) * fy], [((iy + 1) * W + ix + 1) * 4, fx * fy]]) {
    const a = d[o + 3] / 255 * f; alpha += a; for (let c = 0; c < 3; c++) out[c] += w * d[o + c] * a;
  }
  return alpha;
}
interface Region { x: number; y: number; w: number; h: number } // in image pixels
/**
 * Texture bombing: the plane is cut into jittered cells of size T world units; each cell copies a randomly placed
 * window of a source region (no mirroring or rotation, so the painted light stays put), and neighbouring cells blend
 * over noisy seams with sharpened weights so the material keeps its contrast.
 */
function bombed(im: Img, regions: Region[], T: number, salt: number, keyed = false) {
  const tp = T * im.ppu;
  const cell = (i: number, j: number) => {
    const r = regions[Math.floor(hash(i + salt, j) * regions.length) % regions.length];
    return { cx: (i + 0.5 + (hash(i, j + salt) - 0.5) * 0.5) * T, cy: (j + 0.5 + (hash(j + salt, i) - 0.5) * 0.5) * T,
      sx: r.x + tp + hash(i * 3 + salt, j * 7) * Math.max(0, r.w - 2 * tp), sy: r.y + tp + hash(i * 5, j * 3 + salt) * Math.max(0, r.h - 2 * tp) };
  };
  return (x: number, y: number, out: Out, wt: number): number => {
    const i0 = Math.floor(x / T - 0.5), j0 = Math.floor(y / T - 0.5), jit = (fbm(x * 0.25 + salt, y * 0.25) - 0.5) * 0.6;
    let sum = 0, alpha = 0; const acc = [0, 0, 0];
    for (let i = i0; i <= i0 + 1; i++) for (let j = j0; j <= j0 + 1; j++) {
      const c = cell(i, j), dx = Math.abs(x - c.cx) / T, dy = Math.abs(y - c.cy) / T;
      let w = Math.max(0, 1 - dx + jit) * Math.max(0, 1 - dy - jit); w = w * w * w * w; if (w <= 1e-4) continue;
      alpha += w * (keyed ? samplePremul : samplePx)(im, c.sx + (x - c.cx) * im.ppu, c.sy + (y - c.cy) * im.ppu, acc, w); sum += w;
    }
    // keyed: acc holds rgb·alpha, so divide by the alpha to get straight colour with no key fringe
    const norm = keyed ? alpha : sum;
    if (norm > 1e-6) for (let k = 0; k < 3; k++) out[k] += wt * acc[k] / norm;
    return sum > 0 ? alpha / sum : 0;
  };
}

// ---------- materials: everything the compositor needs from a style ----------
/** A cut-out stamp (alpha from the colour key) and its size in world units. */
interface Stamp { canvas: HTMLCanvasElement; img: Img; wU: number; hU: number }
interface Materials {
  name: string;
  ground(x: number, y: number, out: Out, w: number): void;
  gravel(x: number, y: number, out: Out, w: number): void;
  /** The hive overlay: adds colour, returns its coverage 0..1 at this point. */
  hive(x: number, y: number, out: Out): number;
  /** Road + rim at arc length s and distance `o` from the centre line (world units, already fitted to the kit's road). */
  road(s: number, o: number, out: Out): void;
  roadHw: number; roadSh: number;
  /** Pad clearing / turret apron at offset (dx, dy) from the centre: adds colour, returns coverage. */
  clearing(i: number, dx: number, dy: number, out: Out): number;
  apron(dx: number, dy: number, scale: number, out: Out): number;
  props: Stamp[]; decals: Stamp[]; deck?: Stamp; hiveMouth?: Stamp;
}

/** The current painting, cut into materials (the first spike). */
async function paintingMaterials(): Promise<Materials> {
  const im = pixels(await loadImage(`${BASE}td/environment/road/portrait.webp`));
  const W = (x: number, y: number) => ({ x: (x + 40) * 16, y: (y + 60) * 16 });        // world → painting px
  const R = (x: number, y: number, w: number, h: number): Region => ({ ...W(x, y), w: w * 16, h: h * 16 });
  const flagstone = bombed(im, [R(52, 110, 36, 34), R(84, 76, 34, 24)], 11, 1);
  const creep = bombed(im, [R(-38, -58, 86, 26)], 11, 7);
  const gravel = bombed(im, [R(38, 16, 20, 11), R(37, 41, 11, 14)], 4.5, 3);
  // source strip: the painting's gentle middle run, sampled on one lit side and mirrored so the light stays even
  const SRC = withS([...ROAD]);
  const nearestIdx = (pts: P[], p: P) => pts.reduce((b, c, i) => Math.hypot(c.x - p.x, c.y - p.y) < Math.hypot(pts[b].x - p.x, pts[b].y - p.y) ? i : b, 0);
  const sA = SRC[nearestIdx(SRC, { x: 22, y: 33 })].s, sB = SRC[nearestIdx(SRC, { x: 56, y: 38 })].s;
  const frame = (s: number) => {
    let i = SRC.findIndex(p => p.s >= s); if (i < 1) i = 1;
    const a = SRC[i - 1], b = SRC[i], t = (s - a.s) / Math.max(1e-6, b.s - a.s), len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, nx: -(b.y - a.y) / len, ny: (b.x - a.x) / len };
  };
  const FR = Array.from({ length: Math.ceil((sB - sA) * 4) + 1 }, (_, i) => frame(sA + i / 4));
  const PAINTED_PADS: P[] = [{ x: 32, y: 21 }, { x: 54, y: 50 }, { x: 7, y: 48 }, { x: 32, y: 76 }, { x: 56, y: 79 }, { x: 30, y: 48 }, { x: 10, y: 97 }];
  const at = (x: number, y: number, out: Out) => { const p = W(x, y); samplePx(im, p.x, p.y, out); };
  return {
    name: 'painting patches', roadHw: 5.5, roadSh: 1.25, props: [], decals: [],
    ground: (x, y, out, w) => flagstone(x, y, out, w),
    gravel: (x, y, out, w) => gravel(x, y, out, w),
    hive: (x, y, out) => { const w = smooth(18, -14, y + (fbm(x * 0.15, y * 0.15) - 0.5) * 22); if (w > 0) { const t = [0, 0, 0]; creep(x, y, t, 1); for (let k = 0; k < 3; k++) out[k] += t[k] * w; } return w; },
    road: (s, o, out) => { const f = FR[Math.round(tri(s * 4, FR.length - 1))]; at(f.x - f.nx * o, f.y - f.ny * o, out); },
    clearing: (i, dx, dy, out) => { const s = PAINTED_PADS[i % PAINTED_PADS.length], r = Math.hypot(dx, dy); at(s.x + dx, s.y + dy, out); return 1 - smooth(4.6, 6.4, r + (noise(dx * 0.9 + i, dy * 0.9) - 0.5) * 1.2); },
    apron: (dx, dy, scale, out) => { const r = Math.hypot(dx, dy); at(40 + dx / scale, 101 + dy / scale, out); return 1 - smooth(11 * scale + 1.5, 11 * scale + 4.5, r + (noise(dx, dy) - 0.5) * 1.5); },
  };
}

/** The brief's key colour: pure green #00FF00, or magenta #FF00FF for green styles, whichever covers more pixels. */
function keyOf(d: Uint8ClampedArray): number[] {
  let green = 0, magenta = 0;
  for (let o = 0; o < d.length; o += 16) {
    if (d[o + 1] > 200 && d[o] < 80 && d[o + 2] < 80) green++;
    else if (d[o] > 200 && d[o + 2] > 200 && d[o + 1] < 80) magenta++;
  }
  return magenta > green ? [255, 0, 255] : [0, 255, 0];
}
/** Cuts a keyed sheet into stamps: alpha from distance to the key colour, green/magenta
 *  spill removed, then connected blobs become separate stamps (sorted largest first). */
function cutSheet(image: HTMLImageElement, ppu: number): Stamp[] {
  const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
  const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(image, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height), d = data.data, W = c.width, H = c.height;
  const key = keyOf(d), greenKey = key[1] > 128;
  for (let i = 0; i < W * H; i++) {
    const o = i * 4, dist = Math.hypot(d[o] - key[0], d[o + 1] - key[1], d[o + 2] - key[2]);
    const a = smooth(60, 140, dist); d[o + 3] = a * 255;
    if (a < 1) { if (greenKey) d[o + 1] = Math.min(d[o + 1], Math.max(d[o], d[o + 2])); else { const m = Math.min(d[o], d[o + 2]); d[o] = Math.min(d[o], Math.max(m, d[o + 1])); d[o + 2] = Math.min(d[o + 2], Math.max(m, d[o + 1])); } }
  }
  g.putImageData(data, 0, 0);
  // blobs on a 4 px grid
  const S = 4, gw = Math.ceil(W / S), gh = Math.ceil(H / S), lab = new Int32Array(gw * gh).fill(-1);
  const solid = (gx: number, gy: number) => d[((gy * S) * W + gx * S) * 4 + 3] > 128;
  const boxes: Array<{ x0: number; y0: number; x1: number; y1: number; n: number }> = [];
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    if (lab[gy * gw + gx] >= 0 || !solid(gx, gy)) continue;
    const b = { x0: gx, y0: gy, x1: gx, y1: gy, n: 0 }, id = boxes.length, stack = [gy * gw + gx]; lab[gy * gw + gx] = id;
    while (stack.length) {
      const i = stack.pop()!, x = i % gw, y = (i / gw) | 0; b.n++;
      b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) if (nx >= 0 && ny >= 0 && nx < gw && ny < gh && lab[ny * gw + nx] < 0 && solid(nx, ny)) { lab[ny * gw + nx] = id; stack.push(ny * gw + nx); }
    }
    boxes.push(b);
  }
  return boxes.filter(b => b.n > 40).sort((a, b) => b.n - a.n).map(b => {
    const x = b.x0 * S, y = b.y0 * S, w = (b.x1 - b.x0 + 1) * S, h = (b.y1 - b.y0 + 1) * S;
    const sc = document.createElement('canvas'); sc.width = w; sc.height = h; sc.getContext('2d')!.drawImage(c, x, y, w, h, 0, 0, w, h);
    return { canvas: sc, img: pixels(sc, ppu), wU: w / ppu, hU: h / ppu };
  });
}

/** A whole keyed image (alpha from the key, as cutSheet) as samplable pixels. */
function keyedPixels(image: HTMLImageElement, ppu: number): Img {
  const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
  const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(image, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height), d = data.data, W = c.width, H = c.height;
  const key = keyOf(d);
  for (let i = 0; i < W * H; i++) { const o = i * 4; d[o + 3] = smooth(60, 140, Math.hypot(d[o] - key[0], d[o + 1] - key[1], d[o + 2] - key[2])) * 255; }
  return { d, w: W, h: H, ppu };
}
/** A kit from public/td/ground-kits/<folder>/ (files per the brief; optional kit.json: { ppu, roadHalf, roadRim }). */
async function kitMaterials(folder: string): Promise<Materials> {
  const root = `${BASE}td/ground-kits/${folder}/`;
  const meta = await fetch(root + 'kit.json').then(r => r.ok ? r.json() : {}).catch(() => ({})) as { ppu?: number; roadHalf?: number; roadRim?: number };
  const ppu = meta.ppu ?? 16;
  const load = (f: string) => loadImage(root + f).catch(() => null);
  const [ga, gb, gr, rd, hv, pr, dc, br, hm] = await Promise.all(['ground_a', 'ground_b', 'gravel', 'road', 'overlay_hive', 'props', 'decals', 'bridge', 'hive_mouth'].map(f => load(f + '.png')));
  if (!ga || !rd) throw new Error(`kit ${folder}: ground_a.png and road.png are required`);
  const full = (im: Img): Region[] => [{ x: 0, y: 0, w: im.w, h: im.h }];
  const A = pixels(ga, ppu), B = gb ? pixels(gb, ppu) : A, G = gr ? pixels(gr, ppu) : A, RD = pixels(rd, ppu);
  const groundA = bombed(A, full(A), 11, 1), groundB = bombed(B, full(B), 11, 5), gravel = bombed(G, full(G), 4.5, 3);
  const hiveStamp = hv ? cutSheet(hv, ppu) : [];
  const hiveImg = hiveStamp.length ? keyedPixels(hv!, ppu) : null;
  const hive = hiveImg ? bombed(hiveImg, full(hiveImg), 9, 7, true) : null;
  const decals = dc ? cutSheet(dc, ppu) : [];
  // decals sheet: the largest blob is the apron, the next roughly-round one the clearing, the rest are decals
  const apron = decals.shift(), clearIdx = decals.findIndex(s => Math.abs(s.wU - s.hU) < 0.25 * s.wU), clearing = clearIdx >= 0 ? decals.splice(clearIdx, 1)[0] : undefined;
  const bridge = br ? cutSheet(br, ppu) : [];
  const roadHw = meta.roadHalf ?? 4, roadSh = meta.roadRim ?? 1, cy = RD.h / 2, period = RD.w / ppu;
  ((window as unknown as { __kitInfo?: Record<string, unknown> }).__kitInfo ??= {})[folder] = {
    apron: apron && [+apron.wU.toFixed(1), +apron.hU.toFixed(1)], clearing: clearing && [+clearing.wU.toFixed(1), +clearing.hU.toFixed(1)],
    decals: decals.map(d => [+d.wU.toFixed(1), +d.hU.toFixed(1)]) };
  /** A stamp's straight colour into `out` at (u, v) world units from its centre; returns its alpha. */
  const stampAt = (st: Stamp | undefined, u: number, v: number, out: Out) => {
    if (!st) return 0; const t = [0, 0, 0], a = samplePremul(st.img, (u + st.wU / 2) * ppu, (v + st.hU / 2) * ppu, t);
    if (a > 1e-6) for (let k = 0; k < 3; k++) out[k] += t[k] / a; return a;
  };
  return {
    name: folder, roadHw, roadSh, props: pr ? cutSheet(pr, ppu) : [], decals, deck: bridge[0], hiveMouth: hm ? cutSheet(hm, ppu)[0] : undefined,
    ground: (x, y, out, w) => { const m = smooth(0.42, 0.62, fbm(x * 0.05 + 9, y * 0.05)); groundA(x, y, out, w * (1 - m)); groundB(x, y, out, w * m); },
    gravel: (x, y, out, w) => gravel(x, y, out, w),
    hive: (x, y, out) => { const reach = smooth(22, -14, y + (fbm(x * 0.15, y * 0.15) - 0.5) * 22); if (!hive || reach <= 0) return 0; const t = [0, 0, 0], a = hive(x, y, t, 1) * reach; for (let k = 0; k < 3; k++) out[k] += t[k] * a; return a; },
    road: (s, o, out) => { samplePx(RD, tri(s, period) * ppu, cy - o * ppu, out); },
    // stamps fade out over their outer third with a ragged edge, so clearings sit in the ground instead of on it
    // clearings are normalised to a 10-unit disc around the pad, whatever size they were painted at (like the apron)
    clearing: (i, dx, dy, out) => { if (!clearing) return 0; const f = Math.min(clearing.wU, clearing.hU) / 10, r = Math.hypot(dx, dy);
      return stampAt(clearing, dx * f, dy * f, out) * (1 - smooth(3.2, 5.2, r + (noise(dx * 0.9 + i * 7, dy * 0.9) - 0.5) * 1.8)); },
    apron: (dx, dy, scale, out) => { if (!apron) return 0; const u = dx / scale * apron.wU / 26, v = dy / scale * apron.hU / 26, R = Math.min(apron.wU, apron.hU) / 2, r = Math.hypot(u, v);
      return stampAt(apron, u, v, out) * (1 - smooth(R * 0.7, R, r + (noise(u * 0.5, v * 0.5) - 0.5) * R * 0.25)); },
  };
}

// ---------- the compositor ----------
/** Ground for one map, in portrait world space at K px/unit. */
function composite(m: MapDef, mat: Materials): HTMLCanvasElement {
  const W = BOX.w * K, H = BOX.h * K, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!, img = g.createImageData(W, H), d = img.data;
  const line = withS(m.line), rim = m.hw + m.shoulder + 2.2, band = m.hw + m.shoulder + 7.5;
  const CELL = 8, buckets = new Map<string, number[]>(); // segment buckets for nearest-road queries
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    for (let cx = Math.floor((Math.min(a.x, b.x) - band) / CELL); cx <= Math.floor((Math.max(a.x, b.x) + band) / CELL); cx++)
      for (let cy = Math.floor((Math.min(a.y, b.y) - band) / CELL); cy <= Math.floor((Math.max(a.y, b.y) + band) / CELL); cy++) {
        const k = `${cx},${cy}`; (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(i);
      }
  }
  const col = [0, 0, 0], tmp = [0, 0, 0], hv = [0, 0, 0];
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const x = BOX.x0 + (px + 0.5) / K, y = BOX.y0 + (py + 0.5) / K;
    col[0] = col[1] = col[2] = 0;
    mat.ground(x, y, col, 1);
    hv[0] = hv[1] = hv[2] = 0; const hiveW = mat.hive(x, y, hv); if (hiveW > 0) for (let k = 0; k < 3; k++) col[k] = col[k] * (1 - hiveW) + hv[k];
    let best = Infinity, bs = 0;
    for (const i of buckets.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`) ?? []) {
      const a = line[i - 1], b = line[i], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)), qx = a.x + dx * t - x, qy = a.y + dy * t - y, dd = qx * qx + qy * qy;
      if (dd < best) { best = dd; bs = a.s + Math.sqrt(l2) * t; }
    }
    const dist = Math.sqrt(best), edge = (fbm(x * 0.4, y * 0.4) - 0.5) * 4;
    if (dist < band) { tmp[0] = tmp[1] = tmp[2] = 0; mat.gravel(x, y, tmp, 1); lerpInto(col, tmp, 1 - smooth(band - 3.5, band, dist + edge)); }
    if (dist < rim + 1.5) {
      // road and rim fitted from this map's widths onto the material's
      const o = dist <= m.hw ? dist * mat.roadHw / m.hw : dist <= m.hw + m.shoulder ? mat.roadHw + (dist - m.hw) * mat.roadSh / m.shoulder : mat.roadHw + mat.roadSh + (dist - m.hw - m.shoulder);
      tmp[0] = tmp[1] = tmp[2] = 0; mat.road(bs, o, tmp); lerpInto(col, tmp, 1 - smooth(rim - 0.5, rim + 1.5, dist + edge * 0.35));
    }
    m.pads.forEach((p, i) => { if (Math.hypot(x - p.x, y - p.y) > 7) return; tmp[0] = tmp[1] = tmp[2] = 0; const w = mat.clearing(i, x - p.x, y - p.y, tmp); if (w > 0) lerpInto(col, tmp, w); });
    if (Math.hypot(x - m.turret.x, y - m.turret.y) < m.tr + 6) { tmp[0] = tmp[1] = tmp[2] = 0; const w = mat.apron(x - m.turret.x, y - m.turret.y, m.tr / 11, tmp); if (w > 0) lerpInto(col, tmp, w); }
    const o = (py * W + px) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  scatter(g, m, mat, line, band);
  for (const b of m.bridges) bridge(g, m, b, mat.deck);
  return c;
}
const toPx = (p: P) => ({ x: (p.x - BOX.x0) * K, y: (p.y - BOX.y0) * K });
/** Decals on the gravel and ground, props on open ground only (clear of the road, pads and turret), hive mouth at the road's entry. */
function scatter(g: CanvasRenderingContext2D, m: MapDef, mat: Materials, line: Array<P & { s: number }>, band: number) {
  const roadDist = (p: P) => line.reduce((b, c) => Math.min(b, Math.hypot(c.x - p.x, c.y - p.y)), Infinity);
  const clear = (p: P, r: number) => roadDist(p) > m.hw + m.shoulder + r && m.pads.every(q => Math.hypot(q.x - p.x, q.y - p.y) > 6 + r) && Math.hypot(p.x - m.turret.x, p.y - m.turret.y) > m.tr + 6 + r;
  const draw = (st: Stamp, p: P, alpha = 1) => { const c = toPx(p); g.globalAlpha = alpha; g.drawImage(st.canvas, c.x - st.wU * K / 2, c.y - st.hU * K / 2, st.wU * K, st.hU * K); g.globalAlpha = 1; };
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const placed: Array<P & { r: number }> = [];
  for (let n = 0; n < 400 && mat.decals.length; n++) { const p = { x: BOX.x0 + rnd() * BOX.w, y: BOX.y0 + rnd() * BOX.h }; if (placed.length < 14 && clear(p, 1)) { placed.push({ ...p, r: 3 }); draw(mat.decals[Math.floor(rnd() * mat.decals.length)], p, 0.85); } }
  for (let n = 0; n < 800 && mat.props.length; n++) {
    const st = mat.props[Math.floor(rnd() * mat.props.length)], r = Math.max(st.wU, st.hU) / 2, p = { x: BOX.x0 + rnd() * BOX.w, y: BOX.y0 + rnd() * BOX.h };
    if (placed.length < 40 && roadDist(p) > band - 2 + r && clear(p, r) && placed.every(o => Math.hypot(o.x - p.x, o.y - p.y) > o.r + r + 2)) { placed.push({ ...p, r }); draw(st, p); }
  }
  if (mat.hiveMouth) { const e = line.find(p => p.y >= BOX.y0 + 4)!; draw(mat.hiveMouth, e); }
}
/** A deck over the crossing for the pass that rides on top, with a drop shadow on the road below: the kit's deck
 *  strip stamped along the road, else a drawn plank deck. */
function bridge(g: CanvasRenderingContext2D, m: MapDef, b: P, deck?: Stamp) {
  const near = (p: P) => Math.hypot(p.x - b.x, p.y - b.y) < 2;
  let idx = m.line.findIndex(near);
  if (m.over === 'last') for (let i = m.line.length - 1; i >= 0; i--) if (near(m.line[i])) { idx = i; break; }
  let a = idx, z = idx; const reach = m.hw * 3.4;
  while (a > 0 && Math.hypot(m.line[a].x - b.x, m.line[a].y - b.y) < reach) a--;
  while (z < m.line.length - 1 && Math.hypot(m.line[z].x - b.x, m.line[z].y - b.y) < reach) z++;
  const seg = m.line.slice(a, z + 1).map(toPx);
  const path = (dx = 0, dy = 0) => { g.beginPath(); seg.forEach((p, i) => i ? g.lineTo(p.x + dx, p.y + dy) : g.moveTo(p.x + dx, p.y + dy)); };
  g.save(); g.lineCap = 'butt'; g.lineJoin = 'round';
  path(0.6 * K, 1.4 * K); g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = (m.hw * 2 + 3) * K; g.filter = `blur(${K * 0.8}px)`; g.stroke(); g.filter = 'none';
  if (deck) {
    const width = (m.hw * 2 + 2.2) * K, step = deck.wU * K * (width / (deck.hU * K));
    for (let i = 1; i < seg.length; i++) {
      const p0 = seg[i - 1], p1 = seg[i], len = Math.hypot(p1.x - p0.x, p1.y - p0.y), ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
      g.save(); g.translate(p0.x, p0.y); g.rotate(ang); g.drawImage(deck.canvas, 0, 0, deck.canvas.width * Math.min(1, len / step), deck.canvas.height, 0, -width / 2, len + 1, width); g.restore();
    }
  } else {
    path(); g.strokeStyle = '#2b1f16'; g.lineWidth = (m.hw * 2 + 2.2) * K; g.stroke();
    path(); g.strokeStyle = '#7a5a3a'; g.lineWidth = (m.hw * 2 + 0.4) * K; g.stroke();
    path(); g.strokeStyle = 'rgba(30,20,12,0.65)'; g.lineWidth = (m.hw * 2 + 0.4) * K; g.setLineDash([0.18 * K, 1.0 * K]); g.stroke(); g.setLineDash([]);
    path(); g.strokeStyle = 'rgba(255,220,170,0.12)'; g.lineWidth = m.hw * 1.2 * K; g.stroke();
  }
  g.restore();
}

// ---------- sprites: the real turret, towers and aliens ----------
const profile = testProfile({ color: '#4cc9f0' });
const session = createGameSession({ game: module, profile, input: new NullInput(), fake: { script: 'z2' }, seed: 2, simOpts: { autopilot: true } });
session.step(30 * 120);
const base = session.sim.snapshot() as TdSnapshot;
const machinery = new Machinery(BASE); machinery.profile = profile;
const aliens = new AlienLayer(BASE);
await Promise.all([machinery.loaded, aliens.loaded]);

function view(turned: boolean, k = K): View {
  // portrait: world → panel px; turned (landscape): the field rotates 90° (turret left, hive right), like the game
  return { rot: turned ? Math.PI / 2 : 0, turned, k, dpr: 1,
    P: (x: number, y: number) => turned ? { x: (BOX.y0 + BOX.h - y) * k, y: (x - BOX.x0) * k } : { x: (x - BOX.x0) * k, y: (y - BOX.y0) * k } };
}
const shift = (v: View, dx: number, dy: number, f = 1, c: P = { x: 0, y: 0 }): View =>
  ({ ...v, k: v.k * f, P: (x, y) => v.P(c.x + (x - c.x) * f + dx, c.y + (y - c.y) * f + dy) });
const enemy = (id: number, kind: Kind, p: P, progress: number): EnemyView => {
  const def = KINDS[kind];
  return { id, kind, route: -1, flying: false, x: p.x, y: p.y, angle: 0, dist: Math.hypot(p.x - BASE_X, p.y - BASE_Y), radius: def.radius,
    element: def.color === 'blue' || def.color === 'red' || def.color === 'purple' ? def.color : 'purple', gold: kind === 'boss', hp: def.hp, maxHp: def.hp, hurt: 0,
    charging: false, shiftIn: 5, next: null, progress, bossPhase: 1, telegraph: false, exposed: false, staggerS: 0, shield: 0, hitT: -1, hitCls: 'neutral', hitDmg: 0 };
};
/** Aliens strung along the road, a mix of kinds, two frames apart so they get headings. */
function enemiesAlong(m: MapDef, t: number): EnemyView[] {
  const line = withS(m.line), L = line[line.length - 1].s;
  const kinds: Kind[] = ['mini', 'mini', 'brute', 'mini', 'armor', 'charger', 'mini', 'carrier', 'mini', 'prism', 'brute', 'boss'];
  return kinds.map((kind, i) => { const s = L * (0.12 + i * 0.07) + t * 2, p = line[Math.max(0, line.findIndex(c => c.s >= s))]; return enemy(500 + i, kind, p, s / L); });
}

async function panel(title: string, m: MapDef, ground: HTMLCanvasElement | 'painting', turned: boolean, paint?: HTMLImageElement) {
  const v = view(turned), W = turned ? BOX.h * K : BOX.w * K, H = turned ? BOX.w * K : BOX.h * K;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
  g.save();
  if (turned) { g.translate(W, 0); g.rotate(Math.PI / 2); }
  if (ground === 'painting') g.drawImage(paint!, (-40 - BOX.x0) * K, (-60 - BOX.y0) * K, paint!.width / 16 * K, paint!.height / 16 * K);
  else g.drawImage(ground, 0, 0);
  g.restore();
  // towers on most pads, a mix of kinds and levels (machinery draws at PADS[0]; shift it onto each pad)
  const kinds: TowerView['kind'][] = ['tesla', 'flamer', 'lens'];
  m.pads.forEach((p, i) => { if (i % 4 === 3) return;
    machinery.tower(g, { pad: 0, kind: kinds[i % 3], level: 1 + (i * 2) % 5, angle: 0.4 * i, charge: 1, firedAt: -9 }, shift(v, p.x - PADS[0].x, p.y - PADS[0].y), base); });
  machinery.base(g, shift(v, m.turret.x - BASE_X, m.turret.y - BASE_Y, m.tr / 11, { x: BASE_X, y: BASE_Y }), base, session.bikeStore.get());
  await aliens.prepare(v);
  for (const t of [0, 0.15]) aliens.update({ ...base, enemies: enemiesAlong(m, t) }, v, 0.15, () => {});
  aliens.draw(g, { ...base, enemies: enemiesAlong(m, 0.15) }, v, base.t, () => {});
  const wrap = document.createElement('figure'); wrap.append(c);
  const cap = document.createElement('figcaption'); cap.textContent = title; wrap.append(cap);
  document.getElementById('panels')!.append(wrap);
}

/** Reference sheet for the generators: the turret, three towers at levels 1/3/5, every alien, a 10-unit bar, at 16 px per unit. */
async function sheet() {
  const k = 16, c = document.createElement('canvas'); c.width = 1536; c.height = 1344; const g = c.getContext('2d')!;
  g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, c.width, c.height);
  const v = { ...view(false, k), P: (x: number, y: number) => ({ x: x * k, y: y * k }) };
  machinery.base(g, shift(v, 16 - BASE_X, 16 - BASE_Y), base, session.bikeStore.get());
  const kinds: TowerView['kind'][] = ['tesla', 'flamer', 'lens'];
  kinds.forEach((kind, r) => [1, 3, 5].forEach((level, i) => machinery.tower(g, { pad: 0, kind, level, angle: 0, charge: 1, firedAt: -9 }, shift(v, 38 + i * 11 - PADS[0].x, 7 + r * 11 - PADS[0].y), base)));
  const kindsA = Object.keys(KINDS).filter(k2 => k2 !== 'dart') as Kind[];
  const at = (i: number, t: number): P => ({ x: 10 + (i % 4) * 23 + t, y: 46 + Math.floor(i / 4) * 20 });
  await aliens.prepare(v);
  for (const t of [0, 0.3]) aliens.update({ ...base, enemies: kindsA.map((kind, i) => enemy(900 + i, kind, at(i, t), 0.5)) }, v, 0.15, () => {});
  aliens.draw(g, { ...base, enemies: kindsA.map((kind, i) => enemy(900 + i, kind, at(i, 0.3), 0.5)) }, v, base.t, () => {});
  g.fillStyle = '#fff'; g.fillRect(4 * k, 80 * k, 10 * k, 0.5 * k); g.font = '24px system-ui'; g.fillText('10 units = 160 px · road 8 units wide · pad clearing ~10 · turret apron ~26', 4 * k, 79 * k);
  document.getElementById('panels')!.append(c);
}

// ---------- automated kit checks (the brief's gates, measurable) ----------
const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function hsv(r: number, g: number, b: number) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, s = mx ? d / mx : 0;
  let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, v: mx / 255 };
}
/** Share of strongly saturated pixels in the brood hues (blue, red, purple) — large areas must stay clear of them. */
function broodShare(im: Img) {
  let blue = 0, red = 0, purple = 0, n = 0;
  for (let o = 0; o < im.d.length; o += 4 * 7) {
    const { h, s, v } = hsv(im.d[o], im.d[o + 1], im.d[o + 2]); n++;
    if (s < 0.45 || v < 0.25) continue;
    if (h >= 190 && h < 255) blue++; else if (h >= 255 && h < 320) purple++; else if (h >= 340 || h < 15) red++;
  }
  return { blue: +(blue / n).toFixed(3), red: +(red / n).toFixed(3), purple: +(purple / n).toFixed(3) };
}
/** Low-frequency gradient: spread of 4×4 block mean luminance (vignettes and light gradients show up here). */
function gradient(im: Img) {
  const m: number[] = [];
  for (let by = 0; by < 4; by++) for (let bx = 0; bx < 4; bx++) {
    let t = 0, n = 0;
    for (let y = Math.floor(by * im.h / 4); y < (by + 1) * im.h / 4; y += 3) for (let x = Math.floor(bx * im.w / 4); x < (bx + 1) * im.w / 4; x += 3) { const o = (y * im.w + x) * 4; t += lum(im.d[o], im.d[o + 1], im.d[o + 2]); n++; }
    m.push(t / n);
  }
  return +((Math.max(...m) - Math.min(...m)) / 255).toFixed(3);
}
const meanLum = (im: Img, x0: number, y0: number, x1: number, y1: number) => { let t = 0, n = 0; for (let y = Math.max(0, y0 | 0); y < Math.min(im.h, y1); y += 2) for (let x = Math.max(0, x0 | 0); x < Math.min(im.w, x1); x += 2) { const o = (y * im.w + x) * 4; t += lum(im.d[o], im.d[o + 1], im.d[o + 2]); n++; } return t / Math.max(1, n); };
/** Measures one kit folder against the brief; `fails` lists the gates it misses. */
async function checkKit(folder: string) {
  const root = `${BASE}td/ground-kits/${folder}/`;
  const meta = await fetch(root + 'kit.json').then(r => r.ok ? r.json() : {}).catch(() => ({})) as { ppu?: number; roadHalf?: number };
  const ppu = meta.ppu ?? 16, half = (meta.roadHalf ?? 4) * ppu;
  const spec: Record<string, [number, number, number?]> = { ground_a: [1024, 1024], ground_b: [1024, 1024], gravel: [1024, 1024], road: [1536, 1024], overlay_hive: [1024, 1024, 1], props: [1536, 1024, 8], decals: [1536, 1024, 8], bridge: [1536, 1024, 4], hive_mouth: [1024, 1024, 1] };
  const out: Record<string, unknown> = { kit: folder }, fails: string[] = [];
  const imgs: Record<string, Img> = {};
  for (const [f, [w, h, blobs]] of Object.entries(spec)) {
    const image = await loadImage(root + f + '.png').catch(() => null);
    if (!image) { out[f] = 'missing'; if (f === 'ground_a' || f === 'road') fails.push(`${f} missing`); continue; }
    const im = pixels(image, ppu); imgs[f] = im;
    const r: Record<string, unknown> = { size: `${im.w}x${im.h}` };
    if (im.w !== w || im.h !== h) r.sizeNote = `brief asks ${w}x${h}`;
    if (blobs) {
      // key flatness: pixels near the key colour should be exactly the key
      const key = keyOf(im.d); let near = 0, exact = 0;
      for (let o = 0; o < im.d.length; o += 4 * 5) { const dd = Math.hypot(im.d[o] - key[0], im.d[o + 1] - key[1], im.d[o + 2] - key[2]); if (dd < 90) { near++; if (dd < 24) exact++; } }
      r.keyFlat = +(exact / Math.max(1, near)).toFixed(3); if ((r.keyFlat as number) < 0.97) fails.push(`${f}: key colour not flat (${r.keyFlat})`);
      const stamps = cutSheet(image, ppu); r.stamps = stamps.length;
      if (f !== 'overlay_hive' && stamps.length < blobs) fails.push(`${f}: ${stamps.length} cut-outs, brief asks ${blobs}`);
    } else {
      r.broodShare = broodShare(im); r.gradient = gradient(im);
      const b = r.broodShare as { blue: number; red: number; purple: number };
      if (b.blue + b.red + b.purple > 0.03) fails.push(`${f}: ${((b.blue + b.red + b.purple) * 100).toFixed(1)}% saturated blue/red/purple`);
      if ((r.gradient as number) > 0.12 && f !== 'road') fails.push(`${f}: light gradient/vignette ${r.gradient}`);
    }
    out[f] = r;
  }
  const rd = imgs.road, ga = imgs.ground_a;
  if (rd) {
    // Road band from brightness, robust to painted ruts: the ground level is the strip's outer rows, the road level its
    // brightest smoothed rows; the band is where a column block's smoothed profile stays above their midpoint.
    const rowLum = (x0: number, x1: number) => Array.from({ length: rd.h }, (_, y) => meanLum(rd, x0, y, x1, y + 1));
    const smoothRows = (p: number[], k: number) => p.map((_, i) => { let t = 0, n = 0; for (let j = Math.max(0, i - k); j <= Math.min(p.length - 1, i + k); j++) { t += p[j]; n++; } return t / n; });
    const all = smoothRows(rowLum(0, rd.w), 6), edge = Math.round(rd.h * 0.15);
    const groundLvl = [...all.slice(0, edge), ...all.slice(-edge)].sort((a, b) => a - b)[edge], roadLvl = Math.max(...all.slice(edge, -edge));
    const cut = (groundLvl + roadLvl) / 2;
    // the band may contain dark ruts: step across dips up to `gap` rows when the profile comes back above the cut
    const gap = Math.round(half * 0.45);
    const band = (p: number[]) => {
      let i = p.indexOf(Math.max(...p.slice(edge, -edge))), a = i, z = i;
      const reach = (from: number, dir: -1 | 1) => { for (let k = 1; k <= gap; k++) { const j = from + dir * k; if (j < 0 || j >= p.length) return -1; if (p[j] > cut) return j; } return -1; };
      for (let j = reach(a, -1); j >= 0; j = reach(a, -1)) a = j;
      for (let j = reach(z, 1); j >= 0; j = reach(z, 1)) z = j;
      return { a, z };
    };
    const whole = band(all), centres: number[] = [];
    for (let x = 0; x + 96 <= rd.w; x += 96) { const b = band(smoothRows(rowLum(x, x + 96), 10)); centres.push((b.a + b.z) / 2); }
    const mid = (whole.a + whole.z) / 2, mean = centres.reduce((a, b) => a + b, 0) / centres.length;
    const wobble = Math.sqrt(centres.reduce((a, b) => a + (b - mean) ** 2, 0) / centres.length);
    const seam = meanLum(rd, 0, mid - half, 3, mid + half) - meanLum(rd, rd.w - 3, mid - half, rd.w, mid + half);
    const road = meanLum(rd, 0, mid - half * 0.6, rd.w, mid + half * 0.6), ground = ga ? meanLum(ga, 0, 0, ga.w, ga.h) : 0;
    out.roadStrip = { centreOffsetPx: Math.round(mid - rd.h / 2), bandPx: whole.z - whole.a, surfacePx: Math.round(2 * half), wobblePx: Math.round(wobble), edgeSeamLum: +Math.abs(seam).toFixed(1), roadVsGround: ground ? +(road / ground).toFixed(2) : null };
    if (Math.abs(mid - rd.h / 2) > half * 0.25) fails.push(`road: band ${Math.round(mid - rd.h / 2)} px off centre`);
    if (wobble > half * 0.2) fails.push(`road: band not level/straight (wobble ${Math.round(wobble)} px)`);
    // the bright band is the surface plus its worn rims: brief ≈128 px surface, ≈224 px with rims
    const bw = whole.z - whole.a;
    if (bw < 1.6 * half) fails.push(`road: bright band only ${bw} px; the road surface should be about ${Math.round(2 * half)} px (≈224 with rims). Paint it wider, or set kit.json roadHalf to your surface's half-width in units`);
    if (bw > 4.2 * half) fails.push(`road: bright band ${bw} px is wider than surface + rims (≈224 px)`);
    if (Math.abs(seam) > 12) fails.push(`road: left/right edges differ (seam ${Math.abs(seam).toFixed(1)})`);
    if (ground && road / ground < 1.25) fails.push(`road only ${(road / ground).toFixed(2)}× brighter than ground_a (want ≥ 1.25)`);
  }
  out.fails = fails; out.pass = fails.length === 0;
  return out;
}

const all = maps as MapDef[];
const [now, ring, trident] = all;
if (q.get('sheet')) await sheet();
else if (q.get('check')) {
  const results = await Promise.all(q.get('check')!.split(',').filter(Boolean).map(checkKit));
  Object.assign(window, { __kitCheck: results });
  const pre = document.createElement('pre'); pre.style.cssText = 'padding:12px;font:13px ui-monospace,monospace;white-space:pre-wrap'; pre.textContent = JSON.stringify(results, null, 2);
  document.getElementById('panels')!.append(pre);
} else {
  const paint = await loadImage(`${BASE}td/environment/road/portrait.webp`);
  const kits = (q.get('kit') ?? '').split(',').filter(Boolean);
  const blind = q.get('blind') === '1';
  const mats = kits.length ? await Promise.all(kits.map(kitMaterials)) : [await paintingMaterials()];
  if (blind) for (let i = mats.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [mats[i], mats[j]] = [mats[j], mats[i]]; } // order hidden too
  await panel('Today · the painting', now, 'painting', false, paint);
  for (const [i, mat] of mats.entries()) {
    const label = blind ? `Kit ${String.fromCharCode(65 + i)}` : mat.name;
    for (const m of [now, ring, trident]) await panel(`${label} · ${m.name}`, m, composite(m, mat), false);
    await panel(`${label} · ${ring.name} · landscape`, ring, composite(ring, mat), true);
  }
}
document.body.dataset.ready = '1';
