// The ground compositor for generated levels: a level plus a packed kit (kit.ts) → ground pixels in world space.
// Pure (no DOM): pixel buffers in, pixel buffer out, run as a generator so the renderer can bake it in slices.
// Ported from the ground spike (dev/td-ground, docs/towerdefense/ground-kit/BRIEF.md).
import { PAD_R } from '../../sim/road';
import { levelGeometry, type Pt, type TdLevel } from '../../sim/level';
import type { KitManifest } from './kit';

/** Pixels plus scale: `ppu` image pixels per world unit. Alpha is kept for the keyed overlays and stamps. */
export interface Img { d: Uint8ClampedArray | Uint8Array; w: number; h: number; ppu: number }
/** The kit files the per-pixel pass samples (decals, props and the deck are drawn as stamps by the renderer). */
export interface KitPixels { groundA: Img; groundB: Img; gravel: Img; road: Img; hive: Img; apron: Img; clearing?: Img }
/** A world-space rectangle (units). */
export interface WorldBox { x0: number; y0: number; w: number; h: number }
type Out = [number, number, number];

// ---------- noise ----------
const hash = (i: number, j: number) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
export function noise(x: number, y: number) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v;
}
const fbm = (x: number, y: number) => noise(x, y) * 0.6 + noise(x * 2.3, y * 2.3) * 0.3 + noise(x * 5.1, y * 5.1) * 0.1;
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Mirror-repeat into [0, n]. */
const tri = (v: number, n: number) => { const m = ((v % (2 * n)) + 2 * n) % (2 * n); return m < n ? m : 2 * n - m; };
const lerpInto = (col: Out, tmp: Out, w: number) => { for (let k = 0; k < 3; k++) col[k] = col[k] * (1 - w) + tmp[k] * w; };

// ---------- sampling ----------
/** Bilinear RGB added into `out` (scaled by w); returns the sampled alpha 0..1. */
function samplePx(im: Img, px: number, py: number, out: Out, w = 1): number {
  px = Math.max(0, Math.min(im.w - 1.001, px)); py = Math.max(0, Math.min(im.h - 1.001, py));
  const ix = px | 0, iy = py | 0, fx = px - ix, fy = py - iy, d = im.d, W = im.w;
  const o00 = (iy * W + ix) * 4, o10 = ix + 1 < W ? o00 + 4 : o00, o01 = iy + 1 < im.h ? o00 + W * 4 : o00, o11 = o01 + (o10 - o00);
  const a00 = (1 - fx) * (1 - fy), a10 = fx * (1 - fy), a01 = (1 - fx) * fy, a11 = fx * fy;
  for (let c = 0; c < 3; c++) out[c] += w * (d[o00 + c] * a00 + d[o10 + c] * a10 + d[o01 + c] * a01 + d[o11 + c] * a11);
  return (d[o00 + 3] * a00 + d[o10 + 3] * a10 + d[o01 + 3] * a01 + d[o11 + 3] * a11) / 255;
}
/** Like samplePx but weights each texel's colour by its alpha (no fringe from cleared pixels): adds rgb·a, returns alpha. */
function samplePremul(im: Img, px: number, py: number, out: Out, w = 1): number {
  px = Math.max(0, Math.min(im.w - 1.001, px)); py = Math.max(0, Math.min(im.h - 1.001, py));
  const ix = px | 0, iy = py | 0, fx = px - ix, fy = py - iy, d = im.d, W = im.w;
  const o00 = (iy * W + ix) * 4, o10 = ix + 1 < W ? o00 + 4 : o00, o01 = iy + 1 < im.h ? o00 + W * 4 : o00, o11 = o01 + (o10 - o00);
  const a00 = d[o00 + 3] / 255 * (1 - fx) * (1 - fy), a10 = d[o10 + 3] / 255 * fx * (1 - fy), a01 = d[o01 + 3] / 255 * (1 - fx) * fy, a11 = d[o11 + 3] / 255 * fx * fy;
  for (let c = 0; c < 3; c++) out[c] += w * (d[o00 + c] * a00 + d[o10 + c] * a10 + d[o01 + c] * a01 + d[o11 + c] * a11);
  return a00 + a10 + a01 + a11;
}

/**
 * Texture bombing: the plane is cut into jittered cells of T world units; each cell copies a randomly placed window of
 * the image (no mirroring or rotation, so the painted light stays put), and neighbouring cells blend over noisy seams
 * with sharpened weights so the material keeps its contrast. `keyed`: colour is alpha-weighted and alpha returned.
 */
export function bombed(im: Img, T: number, salt: number, keyed = false) {
  const tp = T * im.ppu, acc: Out = [0, 0, 0];
  return (x: number, y: number, out: Out, wt: number): number => {
    const i0 = Math.floor(x / T - 0.5), j0 = Math.floor(y / T - 0.5), jit = (fbm(x * 0.25 + salt, y * 0.25) - 0.5) * 0.6;
    let sum = 0, alpha = 0; acc[0] = acc[1] = acc[2] = 0;
    for (let i = i0; i <= i0 + 1; i++) for (let j = j0; j <= j0 + 1; j++) {
      const cx = (i + 0.5 + (hash(i, j + salt) - 0.5) * 0.5) * T, cy = (j + 0.5 + (hash(j + salt, i) - 0.5) * 0.5) * T;
      const dx = Math.abs(x - cx) / T, dy = Math.abs(y - cy) / T;
      let w = Math.max(0, 1 - dx + jit) * Math.max(0, 1 - dy - jit); w = w * w * w * w; if (w <= 1e-4) continue;
      const sx = tp + hash(i * 3 + salt, j * 7) * Math.max(0, im.w - 2 * tp), sy = tp + hash(i * 5, j * 3 + salt) * Math.max(0, im.h - 2 * tp);
      alpha += w * (keyed ? samplePremul : samplePx)(im, sx + (x - cx) * im.ppu, sy + (y - cy) * im.ppu, acc, w); sum += w;
    }
    const norm = keyed ? alpha : sum;
    if (norm > 1e-6) for (let k = 0; k < 3; k++) out[k] += wt * acc[k] / norm;
    return sum > 0 ? alpha / sum : 0;
  };
}

// ---------- the compositor ----------
/** Cleared ground around each pad: the kit's clearing is fitted to a disc this wide (units). */
const CLEARING_D = 10;
/** The kit's turret apron is painted for a 26-unit disc; it is fitted to the level's turret (radius 11 → 26). */
const APRON_D = 26;

/** Distance to a road polyline plus the arc length there, via a coarse bucket grid of segments. */
export function roadIndex(line: readonly Pt[], band: number) {
  const pts: Array<Pt & { s: number }> = []; let s = 0;
  line.forEach((p, i) => { if (i) s += Math.hypot(p.x - line[i - 1].x, p.y - line[i - 1].y); pts.push({ x: p.x, y: p.y, s }); });
  const CELL = 8, buckets = new Map<number, number[]>(), key = (cx: number, cy: number) => (cx + 512) * 4096 + (cy + 512);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    for (let cx = Math.floor((Math.min(a.x, b.x) - band) / CELL); cx <= Math.floor((Math.max(a.x, b.x) + band) / CELL); cx++)
      for (let cy = Math.floor((Math.min(a.y, b.y) - band) / CELL); cy <= Math.floor((Math.max(a.y, b.y) + band) / CELL); cy++) {
        const k = key(cx, cy); (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(i);
      }
  }
  /** Nearest point within `band`: distance (Infinity beyond) and arc length. */
  return (x: number, y: number): { dist: number; s: number } => {
    let best = Infinity, bs = 0;
    for (const i of buckets.get(key(Math.floor(x / CELL), Math.floor(y / CELL))) ?? []) {
      const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)), qx = a.x + dx * t - x, qy = a.y + dy * t - y, dd = qx * qx + qy * qy;
      if (dd < best) { best = dd; bs = a.s + Math.sqrt(l2) * t; }
    }
    return { dist: Math.sqrt(best), s: bs };
  };
}

const BANDS = new WeakMap<TdLevel, number>();
/**
 * How far the gravel reaches from the road's centre line: 7.5 past the shoulder, narrowed where the road passes close
 * to itself (a switchback's rows) so a strip of ground still shows between the passes. Bridges are crossings, not
 * near passes, and stretches within 30 units of each other along the road are the same bend.
 */
export function gravelBand(level: TdLevel): number {
  const known = BANDS.get(level);
  if (known !== undefined) return known;
  const hw = level.roadHalfWidth, sh = level.shoulder, line = levelGeometry(level).road, bridges = level.bridges ?? [];
  const s: number[] = [0];
  for (let i = 1; i < line.length; i++) s.push(s[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y));
  const open = line.map(p => bridges.every(b => Math.hypot(p.x - b.x, p.y - b.y) > hw * 3.4));
  let clear = Infinity;
  for (let i = 0; i < line.length; i++) if (open[i]) for (let j = i + 1; j < line.length; j++)
    if (open[j] && s[j] - s[i] > 30) clear = Math.min(clear, Math.hypot(line[i].x - line[j].x, line[i].y - line[j].y));
  const band = Math.max(hw + sh + 3.7, Math.min(hw + sh + 7.5, clear / 2 - 0.5));
  BANDS.set(level, band);
  return band;
}

/**
 * Composites the ground for `level` over `box` at K pixels per unit into `out` (RGBA, (box.w·K)×(box.h·K)), yielding
 * after every `rows` rows (the value is the share done). Layers: two bombed ground materials mixed by noise, the hive
 * creep near the hive mouth, the gravel band along the road, the road strip fitted to the level's widths, pad clearings
 * and the turret apron.
 */
export function* composeGround(level: TdLevel, kit: KitManifest, px: KitPixels, box: WorldBox, K: number, out: Uint8ClampedArray, rows = 8): Generator<number, void> {
  const W = Math.round(box.w * K), H = Math.round(box.h * K);
  if (out.length < W * H * 4) throw new Error('composeGround: buffer too small');
  const geo = levelGeometry(level), hw = level.roadHalfWidth, sh = level.shoulder;
  const rim = hw + sh + 2.2, band = gravelBand(level), near = roadIndex(geo.road, band);
  const groundA = bombed(px.groundA, 11, 1), groundB = bombed(px.groundB, 11, 5), gravel = bombed(px.gravel, 4.5, 3), hive = bombed(px.hive, 9, 7, true);
  const RD = px.road, cy = RD.h / 2, period = RD.w / RD.ppu;
  const T = level.turret, apronScale = level.turretR / 11;
  const stampAt = (im: Img, wU: number, hU: number, u: number, v: number, o: Out) => {
    const t: Out = [0, 0, 0], a = samplePremul(im, (u + wU / 2) * im.ppu, (v + hU / 2) * im.ppu, t);
    if (a > 1e-6) for (let k = 0; k < 3; k++) o[k] += t[k] / a; return a;
  };
  const col: Out = [0, 0, 0], tmp: Out = [0, 0, 0];
  for (let py = 0; py < H; py++) {
    for (let pxi = 0; pxi < W; pxi++) {
      const x = box.x0 + (pxi + 0.5) / K, y = box.y0 + (py + 0.5) / K;
      col[0] = col[1] = col[2] = 0;
      const m = smooth(0.42, 0.62, fbm(x * 0.05 + 9, y * 0.05));
      if (m < 0.999) groundA(x, y, col, 1 - m);
      if (m > 0.001) groundB(x, y, col, m);
      // hive creep spreads down from the field's top edge, where the hive is
      const reach = smooth(22, -14, y + (fbm(x * 0.15, y * 0.15) - 0.5) * 22);
      if (reach > 0) { tmp[0] = tmp[1] = tmp[2] = 0; const a = hive(x, y, tmp, 1) * reach; if (a > 0) for (let k = 0; k < 3; k++) col[k] = col[k] * (1 - a) + tmp[k] * a; }
      const { dist, s } = near(x, y), edge = (fbm(x * 0.4, y * 0.4) - 0.5) * 4;
      if (dist < band) { tmp[0] = tmp[1] = tmp[2] = 0; gravel(x, y, tmp, 1); lerpInto(col, tmp, 1 - smooth(band - 3.5, band, dist + edge)); }
      if (dist < rim + 1.5) {
        // the level's road and rim widths fitted onto the kit's
        const o = dist <= hw ? dist * kit.roadHalf / hw : dist <= hw + sh ? kit.roadHalf + (dist - hw) * kit.roadRim / sh : kit.roadHalf + kit.roadRim + (dist - hw - sh);
        tmp[0] = tmp[1] = tmp[2] = 0; samplePx(RD, tri(s, period) * RD.ppu, cy - o * RD.ppu, tmp);
        lerpInto(col, tmp, 1 - smooth(rim - 0.5, rim + 1.5, dist + edge * 0.35));
      }
      if (px.clearing && kit.clearing) {
        const c = kit.clearing, f = Math.min(c.w, c.h) / CLEARING_D;
        for (let i = 0; i < level.pads.length; i++) {
          const p = level.pads[i], dx = x - p.x, dy = y - p.y;
          if (dx * dx + dy * dy > 49) continue;
          tmp[0] = tmp[1] = tmp[2] = 0;
          const w = stampAt(px.clearing, c.w, c.h, dx * f, dy * f, tmp) * (1 - smooth(PAD_R - 1, PAD_R + 1, Math.hypot(dx, dy) + (noise(dx * 0.9 + i * 7, dy * 0.9) - 0.5) * 1.8));
          if (w > 0) lerpInto(col, tmp, w);
        }
      }
      const tdx = x - T.x, tdy = y - T.y;
      if (tdx * tdx + tdy * tdy < (level.turretR + 6) ** 2) {
        const a = kit.apron, u = tdx / apronScale * a.w / APRON_D, v = tdy / apronScale * a.h / APRON_D, R = Math.min(a.w, a.h) / 2, r = Math.hypot(u, v);
        tmp[0] = tmp[1] = tmp[2] = 0;
        const w = stampAt(px.apron, a.w, a.h, u, v, tmp) * (1 - smooth(R * 0.7, R, r + (noise(u * 0.5, v * 0.5) - 0.5) * R * 0.25));
        if (w > 0) lerpInto(col, tmp, w);
      }
      const o = (py * W + pxi) * 4; out[o] = col[0]; out[o + 1] = col[1]; out[o + 2] = col[2]; out[o + 3] = 255;
    }
    if ((py + 1) % rows === 0 && py + 1 < H) yield (py + 1) / H;
  }
}

// ---------- scatter ----------
export interface Placement { kind: 'decal' | 'prop' | 'mouth'; i: number; x: number; y: number; alpha: number }
/**
 * Where decals (on gravel and ground) and props (open ground only) go, plus the hive mouth: clear of the road, pads and
 * turret, props apart from each other. Seeded from the level, so a level always looks the same.
 */
export function scatterPlan(level: TdLevel, kit: KitManifest, box: WorldBox): Placement[] {
  const geo = levelGeometry(level), hw = level.roadHalfWidth, sh = level.shoulder, band = gravelBand(level);
  const clear = (p: Pt, r: number) => geo.distanceToRoad(p) > hw + sh + r && level.pads.every(q => Math.hypot(q.x - p.x, q.y - p.y) > 6 + r)
    && Math.hypot(p.x - level.turret.x, p.y - level.turret.y) > level.turretR + 6 + r;
  let seed = 11 + ((level.seed ?? 0) % 100000) * 7 + level.id.length; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const placed: Array<Pt & { r: number }> = [], out: Placement[] = [];
  const area = box.w * box.h / (96 * 132), maxDecals = Math.round(14 * area), maxAll = Math.round(40 * area);
  for (let n = 0; n < 400 * area && kit.decals.length && out.length < maxDecals; n++) {
    const p = { x: box.x0 + rnd() * box.w, y: box.y0 + rnd() * box.h }, i = Math.floor(rnd() * kit.decals.length);
    if (clear(p, 1)) { placed.push({ ...p, r: 3 }); out.push({ kind: 'decal', i, ...p, alpha: 0.85 }); }
  }
  for (let n = 0; n < 800 * area && kit.props.length && placed.length < maxAll; n++) {
    const i = Math.floor(rnd() * kit.props.length), st = kit.props[i], r = Math.max(st.w, st.h) / 2, p = { x: box.x0 + rnd() * box.w, y: box.y0 + rnd() * box.h };
    if (geo.distanceToRoad(p) > band - 2 + r && clear(p, r) && placed.every(o => Math.hypot(o.x - p.x, o.y - p.y) > o.r + r + 2)) { placed.push({ ...p, r }); out.push({ kind: 'prop', i, ...p, alpha: 1 }); }
  }
  if (kit.hiveMouth) { const e = geo.road.find(p => p.y >= box.y0 + 4) ?? geo.road[0]; out.push({ kind: 'mouth', i: 0, x: e.x, y: e.y, alpha: 1 }); }
  return out;
}

/**
 * The world rectangle a screen of W×H CSS px shows through `P` (world → screen, axis-aligned or turned 90°), grown
 * to whole multiples of `snap` units so small layout changes reuse the same bake.
 */
export function screenBox(P: (x: number, y: number) => Pt, W: number, H: number, snap = 8): WorldBox {
  const o = P(0, 0), ex = P(1, 0), ey = P(0, 1);
  // invert the affine map world → screen
  const a = ex.x - o.x, b = ey.x - o.x, c = ex.y - o.y, d = ey.y - o.y, det = a * d - b * c;
  const toW = (sx: number, sy: number) => ({ x: (d * (sx - o.x) - b * (sy - o.y)) / det, y: (-c * (sx - o.x) + a * (sy - o.y)) / det });
  const cs = [toW(0, 0), toW(W, 0), toW(0, H), toW(W, H)];
  const x0 = Math.floor(Math.min(...cs.map(p => p.x)) / snap) * snap, x1 = Math.ceil(Math.max(...cs.map(p => p.x)) / snap) * snap;
  const y0 = Math.floor(Math.min(...cs.map(p => p.y)) / snap) * snap, y1 = Math.ceil(Math.max(...cs.map(p => p.y)) / snap) * snap;
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}
