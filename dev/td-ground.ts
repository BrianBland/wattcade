// Spike: can generated ground match the painted map? Composites terrain for any road from patches of the current
// painting (road-relative sampling for road/rim/gravel, tiled flagstone, hive creep, pad clearings), then draws the
// real turret, towers and aliens over it. Compare: /dev/td-ground.html (screenshots: scripts or the page itself).
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
interface MapDef { name: string; line: P[]; pads: P[]; turret: P; tr: number; hw: number; shoulder: number; bridges: P[]; over: 'first' | 'last' }
const BOX = { x0: -8, y0: -16, w: 96, h: 132 };          // world area each panel shows (field + some overflow)
const K = Number(new URLSearchParams(location.search).get('k') ?? 7);
const OLD_HW = 5.5, OLD_SH = 1.25;

// ---------- painting sampler (portrait.webp: 16 px per world unit, origin -40,-60) ----------
const paintImg = await loadImage(`${import.meta.env.BASE_URL}td/environment/road/portrait.webp`);
const pc = document.createElement('canvas'); pc.width = paintImg.width; pc.height = paintImg.height;
const pg = pc.getContext('2d', { willReadFrequently: true })!; pg.drawImage(paintImg, 0, 0);
const paint = pg.getImageData(0, 0, pc.width, pc.height).data, PW = pc.width, PH = pc.height;
function sample(x: number, y: number, out: number[], w = 1) {
  const px = Math.max(0, Math.min(PW - 2, (x + 40) * 16)), py = Math.max(0, Math.min(PH - 2, (y + 60) * 16));
  const ix = px | 0, iy = py | 0, fx = px - ix, fy = py - iy;
  for (let c = 0; c < 3; c++) {
    const a = paint[(iy * PW + ix) * 4 + c], b = paint[(iy * PW + ix + 1) * 4 + c], d = paint[((iy + 1) * PW + ix) * 4 + c], e = paint[((iy + 1) * PW + ix + 1) * 4 + c];
    out[c] += w * ((a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy);
  }
}
const tri = (v: number, n: number) => { const m = ((v % (2 * n)) + 2 * n) % (2 * n); return m < n ? m : 2 * n - m; }; // mirror-repeat
/** Tiled patch of the painting (mirror-repeated so it never seams). */
const patch = (x0: number, y0: number, w: number, h: number) => (x: number, y: number, out: number[], wt: number) => sample(x0 + tri(x, w), y0 + tri(y, h), out, wt);
interface Region { x: number; y: number; w: number; h: number }
/**
 * Texture bombing: the plane is cut into jittered cells of size T; each cell copies a randomly placed window of a
 * source region (no mirroring, no rotation, so the painted light stays put), and neighbouring cells blend over
 * noisy seams with sharpened weights so the stones keep their contrast.
 */
function bombed(regions: Region[], T: number, salt: number) {
  const cell = (i: number, j: number) => {
    const r = regions[Math.floor(hash(i + salt, j) * regions.length) % regions.length];
    return { cx: (i + 0.5 + (hash(i, j + salt) - 0.5) * 0.5) * T, cy: (j + 0.5 + (hash(j + salt, i) - 0.5) * 0.5) * T,
      sx: r.x + T + hash(i * 3 + salt, j * 7) * (r.w - 2 * T), sy: r.y + T + hash(i * 5, j * 3 + salt) * (r.h - 2 * T) };
  };
  return (x: number, y: number, out: number[], wt: number) => {
    const i0 = Math.floor(x / T - 0.5), j0 = Math.floor(y / T - 0.5), jit = (fbm(x * 0.25 + salt, y * 0.25) - 0.5) * 0.6;
    let sum = 0; const acc = [0, 0, 0];
    for (let i = i0; i <= i0 + 1; i++) for (let j = j0; j <= j0 + 1; j++) {
      const c = cell(i, j), dx = Math.abs(x - c.cx) / T, dy = Math.abs(y - c.cy) / T;
      let w = Math.max(0, 1 - dx + jit) * Math.max(0, 1 - dy - jit); w = w * w * w * w; if (w <= 1e-4) continue;
      sample(c.sx + (x - c.cx), c.sy + (y - c.cy), acc, w); sum += w;
    }
    if (sum > 0) for (let k = 0; k < 3; k++) out[k] += wt * acc[k] / sum;
  };
}
const flagstone = bombed([{ x: 52, y: 110, w: 36, h: 34 }, { x: 84, y: 76, w: 34, h: 24 }], 11, 1);
const creep = bombed([{ x: -38, y: -58, w: 86, h: 26 }], 11, 7);
/** The fine gravel halo the painting puts around its road, from two clear pockets of it. */
const gravel = bombed([{ x: 38, y: 16, w: 20, h: 11 }, { x: 37, y: 41, w: 11, h: 14 }], 4.5, 3);

// value noise for ragged edges
const hash = (i: number, j: number) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
function noise(x: number, y: number) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v;
}
const fbm = (x: number, y: number) => noise(x, y) * 0.6 + noise(x * 2.3, y * 2.3) * 0.3 + noise(x * 5.1, y * 5.1) * 0.1;
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- polylines with arc length ----------
function withS(line: P[]) { const out: Array<P & { s: number }> = []; let s = 0; line.forEach((p, i) => { if (i) s += Math.hypot(p.x - line[i - 1].x, p.y - line[i - 1].y); out.push({ ...p, s }); }); return out; }
/** Source strip: the painting's middle run, a gentle straight-ish stretch (s range picked around (20,33)→(58,38)). */
const SRC = withS([...ROAD]);
const nearestIdx = (pts: P[], q: P) => pts.reduce((b, p, i) => Math.hypot(p.x - q.x, p.y - q.y) < Math.hypot(pts[b].x - q.x, pts[b].y - q.y) ? i : b, 0);
const sA = SRC[nearestIdx(SRC, { x: 22, y: 33 })].s, sB = SRC[nearestIdx(SRC, { x: 56, y: 38 })].s;
function srcFrame(s: number) {
  let i = SRC.findIndex(p => p.s >= s); if (i < 1) i = 1;
  const a = SRC[i - 1], b = SRC[i], t = (s - a.s) / Math.max(1e-6, b.s - a.s), len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, nx: -(b.y - a.y) / len, ny: (b.x - a.x) / len };
}
const SRC_FRAMES = Array.from({ length: Math.ceil((sB - sA) * 4) + 1 }, (_, i) => srcFrame(sA + i / 4));
const PAINTED_PADS: P[] = [{ x: 32, y: 21 }, { x: 54, y: 50 }, { x: 7, y: 48 }, { x: 32, y: 76 }, { x: 56, y: 79 }, { x: 30, y: 48 }, { x: 10, y: 97 }];

// ---------- the compositor ----------
/** Ground for one map, in portrait world space at K px/unit. */
function composite(m: MapDef): HTMLCanvasElement {
  const W = BOX.w * K, H = BOX.h * K, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!, img = g.createImageData(W, H), d = img.data;
  const line = withS(m.line), rim = m.hw + m.shoulder + 2.2, band = m.hw + m.shoulder + 7.5;
  // segment buckets for nearest-road queries
  const CELL = 8, buckets = new Map<string, number[]>();
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    for (let cx = Math.floor((Math.min(a.x, b.x) - band) / CELL); cx <= Math.floor((Math.max(a.x, b.x) + band) / CELL); cx++)
      for (let cy = Math.floor((Math.min(a.y, b.y) - band) / CELL); cy <= Math.floor((Math.max(a.y, b.y) + band) / CELL); cy++) {
        const k = `${cx},${cy}`; (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(i);
      }
  }
  const col = [0, 0, 0], tmp = [0, 0, 0];
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const x = BOX.x0 + (px + 0.5) / K, y = BOX.y0 + (py + 0.5) / K;
    col[0] = col[1] = col[2] = 0;
    // base: flagstone, creep toward the hive (top)
    const creepW = smooth(18, -14, y + (fbm(x * 0.15, y * 0.15) - 0.5) * 22);
    flagstone(x, y, col, 1 - creepW); if (creepW > 0) creep(x, y, col, creepW);
    // road band: nearest segment → arc length + offset → sample the painted road strip
    let best = Infinity, bs = 0;
    for (const i of buckets.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`) ?? []) {
      const a = line[i - 1], b = line[i], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)), qx = a.x + dx * t - x, qy = a.y + dy * t - y, dd = qx * qx + qy * qy;
      if (dd < best) { best = dd; bs = a.s + Math.sqrt(l2) * t; }
    }
    const dist = Math.sqrt(best);
    const edge = (fbm(x * 0.4, y * 0.4) - 0.5) * 4;
    if (dist < band) { // gravel halo, texture-bombed, fading into the flagstone
      const w = 1 - smooth(band - 3.5, band, dist + edge);
      tmp[0] = tmp[1] = tmp[2] = 0; gravel(x, y, tmp, 1);
      for (let k = 0; k < 3; k++) col[k] = col[k] * (1 - w) + tmp[k] * w;
    }
    if (dist < rim + 1.5) {
      // road + rim: copy the painted road along this road; road and shoulder scale to fit the new width
      const o = dist <= m.hw ? dist * OLD_HW / m.hw : dist <= m.hw + m.shoulder ? OLD_HW + (dist - m.hw) * OLD_SH / m.shoulder : OLD_HW + OLD_SH + (dist - m.hw - m.shoulder);
      const f = SRC_FRAMES[Math.round(tri(bs * 4, SRC_FRAMES.length - 1))];
      tmp[0] = tmp[1] = tmp[2] = 0; sample(f.x - f.nx * o, f.y - f.ny * o, tmp); // one (lit) side, mirrored: lighting stays even
      const w = 1 - smooth(rim - 0.5, rim + 1.5, dist + edge * 0.35);
      for (let k = 0; k < 3; k++) col[k] = col[k] * (1 - w) + tmp[k] * w;
    }
    // pad clearings, cut from the painted ones
    m.pads.forEach((p, i) => {
      const r = Math.hypot(x - p.x, y - p.y); if (r > 6.6) return;
      const s = PAINTED_PADS[i % PAINTED_PADS.length], w = 1 - smooth(4.6, 6.4, r + (noise(x * 0.9, y * 0.9) - 0.5) * 1.2);
      tmp[0] = tmp[1] = tmp[2] = 0; sample(s.x + x - p.x, s.y + y - p.y, tmp);
      for (let k = 0; k < 3; k++) col[k] = col[k] * (1 - w) + tmp[k] * w;
    });
    // turret apron, cut from the painted one and scaled to the deck
    const ar = Math.hypot(x - m.turret.x, y - m.turret.y), ascale = m.tr / 11;
    if (ar < (m.tr + 5)) {
      const w = 1 - smooth(m.tr + 1.5, m.tr + 4.5, ar + (noise(x, y) - 0.5) * 1.5);
      tmp[0] = tmp[1] = tmp[2] = 0; sample(40 + (x - m.turret.x) / ascale, 101 + (y - m.turret.y) / ascale, tmp);
      for (let k = 0; k < 3; k++) col[k] = col[k] * (1 - w) + tmp[k] * w;
    }
    const o = (py * W + px) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (const b of m.bridges) bridge(g, m, b);
  return c;
}
/** A plank deck over the crossing for the pass that rides on top, with a drop shadow on the road below. */
function bridge(g: CanvasRenderingContext2D, m: MapDef, b: P) {
  const near = (p: P) => Math.hypot(p.x - b.x, p.y - b.y) < 2;
  let idx = m.line.findIndex(near);
  if (m.over === 'last') for (let i = m.line.length - 1; i >= 0; i--) if (near(m.line[i])) { idx = i; break; }
  let a = idx, z = idx; const reach = m.hw * 3.4;
  while (a > 0 && Math.hypot(m.line[a].x - b.x, m.line[a].y - b.y) < reach) a--;
  while (z < m.line.length - 1 && Math.hypot(m.line[z].x - b.x, m.line[z].y - b.y) < reach) z++;
  const seg = m.line.slice(a, z + 1).map(p => ({ x: (p.x - BOX.x0) * K, y: (p.y - BOX.y0) * K }));
  const path = (dx = 0, dy = 0) => { g.beginPath(); seg.forEach((p, i) => i ? g.lineTo(p.x + dx, p.y + dy) : g.moveTo(p.x + dx, p.y + dy)); };
  g.save(); g.lineCap = 'butt'; g.lineJoin = 'round';
  path(0.6 * K, 1.4 * K); g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = (m.hw * 2 + 3) * K; g.filter = `blur(${K * 0.8}px)`; g.stroke(); g.filter = 'none';
  path(); g.strokeStyle = '#2b1f16'; g.lineWidth = (m.hw * 2 + 2.2) * K; g.stroke();          // stringers / rail
  path(); g.strokeStyle = '#7a5a3a'; g.lineWidth = (m.hw * 2 + 0.4) * K; g.stroke();          // deck
  path(); g.strokeStyle = 'rgba(30,20,12,0.65)'; g.lineWidth = (m.hw * 2 + 0.4) * K; g.setLineDash([0.18 * K, 1.0 * K]); g.stroke(); g.setLineDash([]); // plank gaps
  path(); g.strokeStyle = 'rgba(255,220,170,0.12)'; g.lineWidth = m.hw * 1.2 * K; g.stroke(); // worn centre
  g.restore();
}

// ---------- sprites: the real turret, towers and aliens ----------
const profile = testProfile({ color: '#4cc9f0' });
const session = createGameSession({ game: module, profile, input: new NullInput(), fake: { script: 'z2' }, seed: 2, simOpts: { autopilot: true } });
session.step(30 * 120);
const base = session.sim.snapshot() as TdSnapshot;
const machinery = new Machinery(import.meta.env.BASE_URL); machinery.profile = profile;
const aliens = new AlienLayer(import.meta.env.BASE_URL);
await Promise.all([machinery.loaded, aliens.loaded]);

function view(turned: boolean): View & { ox: number; oy: number } {
  // portrait: world → panel px; turned (landscape): the field rotates 90° (turret left, hive right), like the game
  return { ox: 0, oy: 0, rot: turned ? Math.PI / 2 : 0, turned, k: K, dpr: 1,
    P: (x: number, y: number) => turned ? { x: (BOX.y0 + BOX.h - y) * K, y: (x - BOX.x0) * K } : { x: (x - BOX.x0) * K, y: (y - BOX.y0) * K } };
}
const shift = (v: View, dx: number, dy: number, f = 1, c: P = { x: 0, y: 0 }): View =>
  ({ ...v, k: v.k * f, P: (x, y) => v.P(c.x + (x - c.x) * f + dx, c.y + (y - c.y) * f + dy) });

/** Aliens strung along the road, a mix of kinds, two frames apart so they get headings. */
function enemiesAlong(m: MapDef, t: number): EnemyView[] {
  const line = withS(m.line), L = line[line.length - 1].s;
  const kinds: Kind[] = ['mini', 'mini', 'brute', 'mini', 'armor', 'charger', 'mini', 'carrier', 'mini', 'prism', 'brute', 'boss'];
  return kinds.map((kind, i) => {
    const s = L * (0.12 + i * 0.07) + t * 2, j = line.findIndex(p => p.s >= s), p = line[Math.max(0, j)], def = KINDS[kind];
    return { id: 500 + i, kind, route: -1, flying: false, x: p.x, y: p.y, angle: 0, dist: Math.hypot(p.x - BASE_X, p.y - BASE_Y), radius: def.radius,
      element: def.color === 'blue' || def.color === 'red' || def.color === 'purple' ? def.color : 'purple', gold: kind === 'boss', hp: def.hp, maxHp: def.hp, hurt: 0,
      charging: false, shiftIn: 5, next: null, progress: s / L, bossPhase: 1, telegraph: false, exposed: false, staggerS: 0, shield: 0, hitT: -1, hitCls: 'neutral', hitDmg: 0 };
  });
}

async function panel(title: string, m: MapDef, ground: HTMLCanvasElement | 'painting', turned: boolean) {
  const v = view(turned), W = turned ? BOX.h * K : BOX.w * K, H = turned ? BOX.w * K : BOX.h * K;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
  g.save();
  if (turned) { g.translate(W, 0); g.rotate(Math.PI / 2); }
  if (ground === 'painting') g.drawImage(paintImg, (-40 - BOX.x0) * K, (-60 - BOX.y0) * K, paintImg.width / 16 * K, paintImg.height / 16 * K);
  else g.drawImage(ground, 0, 0);
  g.restore();
  // towers on most pads, a mix of kinds and levels (machinery draws at PADS[0]; shift it onto each pad)
  const kinds: TowerView['kind'][] = ['tesla', 'flamer', 'lens'];
  m.pads.forEach((p, i) => { if (i % 4 === 3) return;
    machinery.tower(g, { pad: 0, kind: kinds[i % 3], level: 1 + (i * 2) % 5, angle: 0.4 * i, charge: 1, firedAt: -9 }, shift(v, p.x - PADS[0].x, p.y - PADS[0].y), base); });
  // the turret, scaled to this map's deck
  machinery.base(g, shift(v, m.turret.x - BASE_X, m.turret.y - BASE_Y, m.tr / 11, { x: BASE_X, y: BASE_Y }), base, session.bikeStore.get());
  // aliens: two update frames so the puppets face along the road
  await aliens.prepare(v);
  for (const t of [0, 0.15]) aliens.update({ ...base, enemies: enemiesAlong(m, t) }, v, 0.15, () => {});
  aliens.draw(g, { ...base, enemies: enemiesAlong(m, 0.15) }, v, base.t, () => {});
  const wrap = document.createElement('figure'); wrap.append(c);
  const cap = document.createElement('figcaption'); cap.textContent = title; wrap.append(cap);
  document.getElementById('panels')!.append(wrap);
}

const all = maps as MapDef[];
const [now, ring, trident] = all;
const grounds = new Map(all.map(m => [m.name, composite(m)]));
await panel('Today · the painting', now, 'painting', false);
await panel('Today’s road · generated', now, grounds.get(now.name)!, false);
await panel('Ring in, bridge out · generated', ring, grounds.get(ring.name)!, false);
await panel('Trident · generated', trident, grounds.get(trident.name)!, false);
await panel('Today · landscape', now, 'painting', true);
await panel('Ring in, bridge out · landscape', ring, grounds.get(ring.name)!, true);
document.body.dataset.ready = '1';
