// The island's built things (#191), pure: the monkey head and the temple massif as terrain structures (voxelized
// into the tiles at tile size), and the route scatter (boardwalk stilts and rails, palms, the driftwood fire,
// rainforest giants, understory, the cut stones that thicken into pillars).
import type { VoxelGrid } from '../voxel/grid';
import { fbm, hash2, noise2 } from '../voxel/noise';
import type { ScatterRule } from './def';
import type { Structure } from './coastBuild';
import { approachLane, HALL, HEAD, headLocal, headWorld, islandRoute, islandSpan, PLATEAU_Y } from './islandLayout';
import { I } from './islandPalette';

const K = 2.6; // the head is designed in unit space (prototype stills/later/monkey.ts), ~15 units tall
const rnd = (a: number, b: number, c = 0) => hash2(a * 1.31 + c * 7.7, b * 0.73 - c * 3.1, c);

/** The monkey head in unit space: x right, y up from the mouth floor (prototype y − 0.9), z out of the face (+ toward
 *  the rider). Palette index, 0 = open air inside it (mouth, eyes), −1 = not the head. */
export function monkeyUnit(x: number, yy: number, z: number, wx: number, wy: number, wz: number): number {
  const y = yy + 0.9;
  const dx = x, dy = y - 7.4, dz = z + 1.5;
  const head = (dx / 7.5) ** 2 + (dy / 7.6) ** 2 + (dz / 5) ** 2 < 1;
  const base = Math.abs(x) < 8.5 && y < 3.5 && z > -8 && z < 1.2;
  const brow = (dx / 6.4) ** 2 + ((y - 10.1) / 1.1) ** 2 + ((z - 2.4) / 1.5) ** 2 < 1;
  const muzzle = (dx / 4.8) ** 2 + ((y - 4.2) / 3.6) ** 2 + ((z - 2.0) / 2.0) ** 2 < 1;
  const jaw = Math.abs(x) < 4.6 && y < 0.9 && z > -1 && z < 3.4;
  const earAt = (sx: number) => ((x - sx * 8.6) / 2.6) ** 2 + ((y - 8.4) / 2.9) ** 2 + ((z + 0.2) / 1.1) ** 2;
  const ears = earAt(-1) < 1 || earAt(1) < 1;
  if (!(head || base || brow || muzzle || jaw || ears)) return -1;
  if ((earAt(-1) < 0.45 || earAt(1) < 0.45) && z > 0.2) return I.stoneDark;
  const r3 = rnd(Math.round(wx * 3), Math.round(wy * 3), Math.round(wz * 3));
  // eye sockets (the glints are the renderer's) and nostrils
  if ([-1, 1].some((sx) => ((x - sx * 2.4) / 1.35) ** 2 + ((y - 8.7) / 1.05) ** 2 < 1) && z > 0.4) return z < 0.9 ? I.shadowVoid : 0;
  if ([-1, 1].some((sx) => ((x - sx * 0.75) / 0.38) ** 2 + ((y - 6.6) / 0.32) ** 2 < 1) && z > 3.0) return 0;
  const mo = (x / 3.6) ** 2 + ((y - 2.6) / 2.9) ** 2;
  if ((mo < 1 && y > 0.9) || (Math.abs(x) < 3.6 * Math.sqrt(Math.max(0, 1 - ((0.9 - 2.6) / 2.9) ** 2)) && y > 0.9 && y <= 2.6)) {
    const fang = (tx: number, ty: number, len: number, r: number, down: boolean) => {
      const t = down ? (ty - y) / len : (y - ty) / len;
      return t >= 0 && t <= 1 && z > 1.2 && z < 3.4 && Math.abs(x - tx) < r * (1 - t) + 0.05;
    };
    for (const [tx, len, r] of [[-2.6, 0.5, 0.55], [-1.6, 1.8, 0.5], [-0.55, 1.0, 0.4], [0.55, 1.0, 0.4], [1.6, 1.8, 0.5], [2.6, 0.5, 0.55]]) {
      const ty = 2.6 + 2.9 * Math.sqrt(Math.max(0, 1 - (tx / 3.6) ** 2)) - 0.05;
      if (fang(tx, ty, len, r, true)) return r3 < 0.5 ? I.teeth : I.teeth2;
    }
    for (const [tx, len, r] of [[-2.9, 1.7, 0.5], [2.9, 1.7, 0.5], [-3.3, 0.8, 0.35], [3.3, 0.8, 0.35]]) if (fang(tx, 0.9, len, r, false)) return I.teeth;
    return 0;
  }
  if (mo < 1.25 && z > 1.6 && y > 0.6) return I.stoneDark; // lip ring
  if (y > 3 && r3 < 0.1 + 0.5 * Math.max(0, fbm(x / 3, z / 3, 2, 47) - 0.55)) return I.moss;
  const mask = [-1, 1].some((sx) => ((x - sx * 2.4) / 2.5) ** 2 + ((y - 8.6) / 2.4) ** 2 < 1) || (x / 4.6) ** 2 + ((y - 4.2) / 4.0) ** 2 < 1;
  if ((mask && z > 1.0) || muzzle || jaw) return r3 < 0.5 ? I.stone3 : I.stone; // the pale face
  return fbm(x / 4, z / 4 + y / 4, 2, 48) < 0.45 ? I.stoneDark : I.basalt2; // dark fur round it
}

/** Inside the hall (local u across, y up from the floor, w along): hollow where it is open air. */
const hallRoof = (u: number) => HALL.h - 5 * (u / HALL.half) ** 2;
export const POOL = { u0: -11, u1: -3.8, w0: 40, w1: HALL.len - 34 };
export const PLINTH = { half: 2.6, w0: HALL.len - 13, w1: HALL.len - 6, h: 1.6 };
/** Roof wells for the sun shafts: centres along w (at u = 0). */
export const SHAFTS = Array.from({ length: Math.floor((HALL.len - 40) / 22) }, (_, i) => 34 + i * 22);
const PILLAR_W = Array.from({ length: Math.floor((HALL.len - 30) / 12) }, (_, i) => 26 + i * 12);

function hallVoxel(u: number, y: number, w: number, wx: number, wz: number): number {
  const au = Math.abs(u), r = rnd(Math.round(wx * 2), Math.round(y * 2), Math.round(wz * 2));
  if (w < 16 || w > HALL.len) return -1; // not the hall
  if (au >= HALL.half || y >= hallRoof(u)) { // walls and roof: carved glyph bands at eye height, open wells overhead
    if (y >= hallRoof(u) && au < 4.5 && SHAFTS.some((c) => Math.abs(w - c) < 2.5)) return 0;
    if (au < HALL.half + 0.6 && y > 1.2 && y < 6.5 && Math.floor(y / 1.3) % 2 === 0) {
      const g = hash2(Math.floor(w / 0.9), Math.floor(y / 0.65), 31);
      return g < 0.25 ? I.glyph : g < 0.5 ? I.stoneDark : I.stone2;
    }
    return -1; // massif rock
  }
  if (y < 0) { // the floor: big slabs, the pool, the plinth's footing
    if (u > POOL.u0 && u < POOL.u1 && w > POOL.w0 && w < POOL.w1) return y > -0.12 ? 0 : y > -0.62 ? (r < 0.3 ? I.pool2 : I.pool) : I.stoneDark;
    return (Math.floor(u / 1.6) + Math.floor(w / 1.6)) % 2 ? I.stone2 : I.stone;
  }
  // pillars with glyph bands, the statue's plinth, the pool's rim
  if (PILLAR_W.some((c) => Math.abs(w - c) < 1.1) && Math.abs(au - 8.6) < 1.1) return Math.floor(y / 1.8) % 3 === 1 ? (r < 0.5 ? I.glyph : I.stoneDark) : r < 0.5 ? I.stone : I.stone3;
  if (au < PLINTH.half && w > PLINTH.w0 && w < PLINTH.w1 && y < PLINTH.h) return r < 0.5 ? I.stone2 : I.stoneDark;
  if (y < 0.3 && w > POOL.w0 - 0.5 && w < POOL.w1 + 0.5 && u > POOL.u0 - 0.5 && u < POOL.u1 + 0.5 && !(u > POOL.u0 && u < POOL.u1 && w > POOL.w0 && w < POOL.w1)) return I.stone3;
  return 0;
}

/** The head and the massif the hall is cut into, as one terrain structure on the plateau. */
export function islandStructures(): Structure[] {
  const y0 = PLATEAU_Y(), mh = HALL.massifHalf;
  const corners = [[-mh - 4, -14], [mh + 4, -14], [-mh - 4, HALL.len + 10], [mh + 4, HALL.len + 10]].map(([u, w]) => headWorld(u, w));
  const xs = corners.map((c) => c[0]), zs = corners.map((c) => c[1]);
  return [{
    box: { x0: Math.min(...xs), x1: Math.max(...xs), y0: y0 - 3, y1: y0 + 15.5 * K + 2, z0: Math.min(...zs), z1: Math.max(...zs) },
    column(x, z) {
      const { u, w } = headLocal(x, z);
      const inHead = Math.abs(u) < 11.5 * K && w > -4.4 * K && w < 9.2 * K;
      const top = massifTop(u, w);
      if (!inHead && top <= 0) return null;
      return (wy) => {
        const y = wy - y0;
        if (y < -3 || (Math.abs(u) < 2.45 && y > -0.7 && y < 0.05)) return 0; // the stone road (corridor) runs through
        const hv = hallVoxel(u, y, w, x, z);
        if (w > 18 && hv >= 0) return hv;
        if (inHead) { const m = monkeyUnit(u / K, y / K, -w / K, x, wy, z); if (m >= 0) return m; }
        if (hv === 0) return 0;
        if (y < top) return y > top - 0.6 && noise2(x / 5, z / 5, 33) > 0.45 ? I.moss : fbm(x / 9, (z + wy) / 9, 2, 34) < 0.45 ? I.rock2 : I.rock;
        return 0;
      };
    },
  }];
}

/** Height (m above the plateau) of the massif's rounded back at (u, w), ≤ 0 off it. */
export function massifTop(u: number, w: number): number {
  const mh = HALL.massifHalf;
  if (w < 6 || w > HALL.len + 8 || Math.abs(u) > mh) return 0;
  const k = Math.sqrt(Math.max(0, 1 - (u / mh) ** 2)) * Math.min(1, (w - 6) / 12, (HALL.len + 8 - w) / 10);
  return k * HALL.massifH + 4 * (fbm(u / 9, w / 9, 2, 35) - 0.5);
}
/** Terrain stops below the hall floor and the mouth's (the structure's own floor and pool show), else null. */
export function hallCap(x: number, z: number): number | null {
  const { u, w } = headLocal(x, z);
  if ((Math.abs(u) < HALL.half && w > 14 && w < HALL.len) || (Math.abs(u) < 8 && w > -12 && w <= 14)) return PLATEAU_Y() - 0.7;
  return null;
}

/** Is a ground point under the head or the massif (no jungle there)? */
export function underTemple(x: number, z: number, pad = 4): boolean {
  const { u, w } = headLocal(x, z);
  return Math.abs(u) < HALL.massifHalf + pad && w > -4.4 * K - pad && w < HALL.len + 8 + pad;
}

// ---- route scatter -------------------------------------------------------------------------------------------------

/** A rainforest giant: buttress roots, a tall slightly crooked trunk, branches, a lumpy layered crown. */
function giant(g: VoxelGrid, x: number, y: number, z: number, H: number, R: number, seed: number) {
  const at = (t: number) => [x + Math.sin(t * 5 + seed) * 0.4, y + H * t, z];
  for (let i = 0; i < 12; i++) { const t0 = i / 12, t1 = (i + 1) / 12; g.wsegment(at(t0), at(t1), (0.5 + R * 0.05) * (1 - 0.35 * t0), rnd(i, seed, 60) < 0.25 ? I.barkMoss : i % 3 ? I.bark : I.bark2); }
  for (let f = 0; f < 4; f++) {
    const a = (f / 4) * Math.PI * 2 + seed, reach = 1.6 + rnd(f, seed, 61) * 1.4, hgt = 2 + rnd(f, seed, 62) * 1.6;
    for (let k = 0; k <= 6; k++) { const t = k / 6; g.wsegment([x, y + hgt * (1 - t), z], [x + Math.cos(a) * reach * (0.3 + 0.7 * t), y - 0.1, z + Math.sin(a) * reach * (0.3 + 0.7 * t)], 0.14, I.bark2); }
  }
  const top = at(1), n = 5 + Math.floor(rnd(seed, 1, 63) * 3);
  for (let b = 0; b < n; b++) {
    const a = (b / n) * Math.PI * 2 + rnd(b, seed, 64), d = R * (0.35 + 0.65 * rnd(b, seed, 65)), hy = top[1] - 2 + rnd(b, seed, 66) * 4;
    const c = [top[0] + Math.cos(a) * d, hy, top[2] + Math.sin(a) * d], rr = R * (0.35 + 0.25 * rnd(b, seed, 67));
    g.wsegment([top[0], top[1] - 3, top[2]], c, 0.22, I.bark);
    g.wellipsoid(c, [rr, rr * 0.45, rr], (xx, yy, zz) => {
      // colour in patches (≈1 m), no holes: big flat runs mesh into few faces
      const n2 = noise2(xx * 0.06 + seed, (zz + yy) * 0.06, 68);
      return n2 > 0.64 ? I.leafLime : n2 < 0.35 ? I.leafDark : n2 < 0.5 ? I.jungle2 : I.leafMid;
    });
  }
}

function palm(g: VoxelGrid, x: number, y: number, z: number, h: number, seed: number) {
  const lean = (rnd(seed, 1, 70) - 0.5) * 2, top = [x + lean * h * 0.25, y + h, z + lean * h * 0.1];
  for (let k = 0; k < 10; k++) { const t0 = k / 10, t1 = (k + 1) / 10, p = (t: number) => [x + (top[0] - x) * t * t, y + h * t, z + (top[2] - z) * t * t]; g.wsegment(p(t0), p(t1), 0.16 - 0.05 * t0, k % 2 ? I.trunk : I.trunk2); }
  for (let f = 0; f < 8; f++) {
    const a = (f / 8) * Math.PI * 2 + seed, len = 2.2 + rnd(f, seed, 71);
    for (let k = 0; k <= 10; k++) { const t = k / 10, p = [top[0] + Math.cos(a) * len * t, top[1] + 0.5 * t - 1.6 * t * t, top[2] + Math.sin(a) * len * t]; g.wellipsoid(p, [0.16, 0.06, 0.16], f % 2 ? I.palm : I.palm2); }
  }
  g.wellipsoid([top[0], top[1] - 0.2, top[2]], [0.3, 0.25, 0.3], I.trunk2);
}

const leaf = (g: VoxelGrid, base: number[], a: number, len: number, wid: number, rise: number, droop: number, col: number) => {
  for (let k = 0; k <= 8; k++) {
    const t = k / 8, wv = wid * Math.sin(Math.PI * Math.min(1, t * 1.1)) + 0.02;
    const p = [base[0] + Math.cos(a) * len * t, base[1] + rise * t - droop * t * t, base[2] + Math.sin(a) * len * t];
    for (let s = -1; s <= 1; s += 0.34) g.wellipsoid([p[0] - Math.sin(a) * wv * s, p[1], p[2] + Math.cos(a) * wv * s], [0.08, 0.05, 0.08], Math.abs(s) < 0.2 ? I.leafLime : col);
  }
};

function understory(g: VoxelGrid, x: number, y: number, z: number, seed: number) {
  const kind = rnd(seed, 3, 71);
  if (kind < 0.45) { // broad leaves
    const n = 4 + Math.floor(rnd(seed, 4, 71) * 3), size = 0.9 + rnd(seed, 5, 71) * 1.2;
    for (let f = 0; f < n; f++) { const a = (f / n) * Math.PI * 2 + rnd(seed, f, 72), stem = [x + Math.cos(a) * 0.3 * size, y + size * 0.8, z + Math.sin(a) * 0.3 * size]; g.wsegment([x, y, z], stem, 0.04, I.vine); leaf(g, stem, a, size * 1.1, size * 0.32, 0.3 * size, 0.9 * size, f % 2 ? I.leafMid : I.jungle2); }
  } else { // fern, sometimes a flower
    const n = 7, size = 0.7 + rnd(seed, 5, 71);
    for (let f = 0; f < n; f++) { const a = (f / n) * Math.PI * 2 + rnd(seed, f, 74), pts: number[][] = []; for (let k = 0; k <= 5; k++) { const t = k / 5; pts.push([x + Math.cos(a) * size * t, y + size * (0.9 * t - 0.75 * t * t), z + Math.sin(a) * size * t]); } for (let k = 0; k < 5; k++) g.wsegment(pts[k], pts[k + 1], 0.07 * (1 - k / 6), (f + k) % 3 ? I.fern : I.fern2); }
    if (rnd(seed, 9, 75) < 0.35) g.wellipsoid([x + 0.2, y + size * 0.4, z], [0.1, 0.1, 0.1], rnd(seed, 10, 75) < 0.5 ? I.flower : I.flower2);
  }
}

/** A squared block, a row of them, a toppled pillar or a standing one (moss on top, glyph bands). */
function cutStone(g: VoxelGrid, x: number, y: number, z: number, tx: number, tz: number, kind: 'block' | 'row' | 'toppled' | 'pillar', seed: number) {
  const box = (cx: number, cz: number, hx: number, hz: number, y0: number, y1: number, c: number) => g.wbox([cx - hx, y0, cz - hz], [cx + hx, y1, cz + hz], c);
  const st = () => (rnd(seed, 2, 80) < 0.5 ? I.stone : I.stone3);
  if (kind === 'block' || kind === 'row') {
    const n = kind === 'row' ? 3 + Math.floor(rnd(seed, 1, 80) * 3) : 1;
    for (let i = 0; i < n; i++) { const cx = x + tx * i * 1.1, cz = z + tz * i * 1.1, h = 0.5 + rnd(seed, i, 81) * 0.4; box(cx, cz, 0.5, 0.5, y - 0.3, y + h, st()); if (rnd(seed, i, 82) < 0.6) box(cx, cz, 0.5, 0.5, y + h, y + h + 0.06, I.moss); }
  } else if (kind === 'toppled') {
    const L = 3 + rnd(seed, 1, 83) * 2.5;
    for (let k = 0; k < L / 0.8; k++) { const cx = x + tx * k * 0.8, cz = z + tz * k * 0.8; box(cx, cz, 0.42, 0.42, y - 0.2, y + 0.75, k % 3 === 1 ? I.stoneDark : st()); }
  } else {
    const h = 3 + rnd(seed, 1, 84) * 2.5;
    box(x, z, 0.42, 0.42, y - 0.3, y + h, st());
    box(x, z, 0.55, 0.55, y + h, y + h + 0.3, I.stone2);
    box(x, z, 0.56, 0.56, y + h + 0.3, y + h + 0.36, I.moss);
    for (let k = 0; k < 5; k++) box(x, z, 0.43, 0.43, y + 0.6 * k + 0.25, y + 0.6 * k + 0.29, I.stoneDark);
  }
}

export function islandScatter(height: (x: number, z: number) => number): ScatterRule[] {
  const sp = (id: Parameters<typeof islandSpan>[0]) => islandSpan(id);
  const [bw0, bw1] = sp('boardwalk'), [cs0, cs1] = sp('cutStones'), [mm0, mm1] = sp('monkeyMouth'), beach = sp('beach')[0];
  const off = (s: number, a: number, b: number) => s < a || s > b;
  const clearOfTemple = (s: number) => s > mm0 + 20;
  // jungle thickens along the ride: 0 on the beach, 1 by the end of the stone road
  const jungle = (s: number) => Math.min(1, Math.max(0, (s - bw0 - 150) / (cs1 - bw0 - 600)));
  const route = islandRoute();
  return [
    { // stilts and rails, both sides, every 2 m along the boardwalk
      id: 'stilts', every: 2, d: 0, voxel: 0.08, skip: (s) => off(s, bw0 + 4, bw1 + 60),
      place(g, p) {
        const deckY = route.at(p.s).y, nx = -p.tz, nz = p.tx;
        for (const side of [-1, 1]) {
          const x = p.x + nx * side * 1.65, z = p.z + nz * side * 1.65, gy = Math.max(height(x, z), -1.5);
          g.wbox([x - 0.08, gy - 0.3, z - 0.08], [x + 0.08, deckY + 1.0, z + 0.08], I.post);
          const ex = x + p.tx * 2, ez = z + p.tz * 2, ey = route.at(p.s + 2).y;
          g.wsegment([x, deckY + 1.0, z], [ex, ey + 1.0, ez], 0.05, I.plank2);
          g.wsegment([x, deckY + 0.5, z], [ex, ey + 0.5, ez], 0.035, I.plank);
          if (Math.round(p.s / 2) % 3 === 0) g.wsegment([x, gy + 0.2, z], [x - p.tx * 1.9, deckY - 0.2, z - p.tz * 1.9], 0.04, I.post); // cross-brace
        }
      },
    },
    { id: 'palms', every: 7, d: [-9, -3.5], chance: 0.6, voxel: 0.15, skip: (s) => off(s, beach + 8, bw0 + 900),
      place: (g, p) => palm(g, p.x, p.y, p.z, 5 + (p.seed % 5), p.seed) },
    { id: 'palms-sea', every: 23, d: [3.5, 6], chance: 0.35, voxel: 0.15, skip: (s) => off(s, bw0 + 10, bw0 + 900),
      place: (g, p) => palm(g, p.x, Math.max(p.y, 0.2), p.z, 4 + (p.seed % 4), p.seed) },
    { // the driftwood fire on the beach: logs leaned into a cone, a ring of stones, ash (the flames are the renderer's)
      id: 'fire', every: 1e9, offset: beach, d: 0, voxel: 0.05,
      place(g, p) {
        const c = FIRE(), y = height(c[0], c[2]);
        for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.wellipsoid([c[0] + Math.cos(a) * 0.75, y + 0.08, c[2] + Math.sin(a) * 0.75], [0.16, 0.12, 0.16], i % 2 ? I.emberRock : I.rock2); }
        g.wellipsoid([c[0], y + 0.02, c[2]], [0.55, 0.06, 0.55], I.ash);
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; g.wsegment([c[0] + Math.cos(a) * 0.55, y + 0.05, c[2] + Math.sin(a) * 0.55], [c[0] + Math.cos(a) * 0.08, y + 0.75, c[2] + Math.sin(a) * 0.08], 0.06, i % 2 ? I.drift : I.drift2); }
        g.wsegment([c[0] + 1.6, y + 0.2, c[2] - 0.6], [c[0] + 0.6, y + 0.2, c[2] + 1.4], 0.22, I.drift); // a driftwood log to sit on
        void p;
      },
    },
    { id: 'giants', every: 27, d: [9, 16], chance: 1, voxel: 0.35, skip: (s) => off(s, bw0 + 250, cs1 - 30),
      place(g, p) {
        if (hash2(p.s, 3, 90) > 0.25 + 0.6 * jungle(p.s)) return;
        const side = hash2(p.s, 4, 90) < 0.6 ? -1 : 1, x = p.x + -p.tz * (side - 1) * p.d, z = p.z + p.tx * (side - 1) * p.d; // mostly inland
        if (approachLane(x, z) < 24 || underTemple(x, z)) return;
        giant(g, x, height(x, z), z, 16 + (p.seed % 10), 5 + (p.seed % 3), p.seed);
      } },
    { id: 'understory', every: 5, d: [2.8, 7], voxel: 0.12, skip: (s) => off(s, bw0 + 120, mm1) || clearOfTemple(s + 40),
      place(g, p) {
        if (hash2(p.s, 5, 91) > 0.25 + 0.75 * jungle(p.s)) return;
        const side = hash2(p.s, 6, 91) < 0.55 ? -1 : 1, x = p.x - p.tz * (side - 1) * p.d, z = p.z + p.tx * (side - 1) * p.d;
        if (approachLane(x, z) < 6 || underTemple(x, z, 0)) return;
        understory(g, x, height(x, z), z, p.seed);
      } },
    { // the cut stones: a squared block in the ferns, then rows, then toppled pillars, then standing ones
      id: 'stones', every: 9, d: [3.2, 5.5], voxel: 0.1, skip: (s) => off(s, cs0, mm1 - 30),
      place(g, p) {
        const k = (p.s - cs0) / (cs1 - cs0), side = hash2(p.s, 7, 92) < 0.5 ? -1 : 1;
        const x = p.x - p.tz * (side - 1) * p.d, z = p.z + p.tx * (side - 1) * p.d, y = height(x, z);
        if (p.s > mm0) { if (Math.round((p.s - mm0) / 9) % 2 === 0) for (const sd of [-1, 1]) cutStone(g, p.x - p.tz * sd * 5, height(p.x - p.tz * sd * 5, p.z + p.tx * sd * 5), p.z + p.tx * sd * 5, p.tx, p.tz, 'pillar', p.seed + sd); return; }
        const chance = 0.12 + 0.8 * k;
        if (hash2(p.s, 8, 92) > chance) return;
        const kind = k < 0.3 ? 'block' : k < 0.55 ? (hash2(p.s, 9, 92) < 0.5 ? 'row' : 'block') : k < 0.8 ? (hash2(p.s, 9, 92) < 0.6 ? 'toppled' : 'row') : 'pillar';
        cutStone(g, x, y, z, p.tx, p.tz, kind, p.seed);
      } },
  ];
}

/** The driftwood fire: a few metres inland of the landing, off the line. */
export const FIRE = (): [number, number, number] => {
  const r = islandRoute(), s = islandSpan('beach')[0], p = r.offset(s, -5.5), q = r.tangent(s);
  return [p.x + q.x * 4, 0, p.z + q.z * 4];
};
export { HEAD };
