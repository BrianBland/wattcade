// Chapter 3b's drill props (#193), pure voxel builders in tunnel space (origin at the bore's mouth on the gate, its
// centre at the bit's height, boring along −z): the bored tunnel's walls banded by the layers cut through (basalt,
// glassy obsidian, a geode's grey rind and its crystals), the face of each layer, the floor that drops away at the
// end, and the cracks that spider out over the walls in Drill II's last minute (lava light coming through).
import { GATE_LAYERS, layerAt } from '../sim/belly';
import { VoxelGrid } from '../voxel/grid';
import { noise2 } from '../voxel/noise';
import { GATE_DEPTH, GATE_TUNNEL_R } from './cavernLayout';
import { L } from './laterPalette';
import { rnd } from './bellyProps';

type V3 = [number, number, number];
const R = GATE_TUNNEL_R, D = GATE_DEPTH;
/** The floor that drops away: under the end of the bore (z below this, |x| < FLOOR_HOLE.half). */
export const FLOOR_HOLE = { z0: -D, z1: -(D - 2.2), half: 1.05 } as const;

function fill(g: VoxelGrid, min: V3, max: V3, fn: (x: number, y: number, z: number) => number) {
  const s = g.size, o = g.origin;
  const lo = [0, 1, 2].map((a) => Math.floor((min[a] - o[a]) / s)), hi = [0, 1, 2].map((a) => Math.ceil((max[a] - o[a]) / s));
  for (let x = lo[0]; x <= hi[0]; x++) for (let z = lo[2]; z <= hi[2]; z++) for (let y = lo[1]; y <= hi[1]; y++) {
    const v = fn(o[0] + (x + 0.5) * s, o[1] + (y + 0.5) * s, o[2] + (z + 0.5) * s);
    if (v) g.set(x, y, z, v);
  }
}

const PAL: Record<string, readonly number[]> = {
  basalt: [L.basalt3, L.basalt, L.basalt2], obsidian: [L.obsidian, L.obsidian2, L.obsidian, L.obsidianEdge], geode: [L.geode, L.geode2, L.geode],
};
const tint = (layer: number, n: number) => { const p = PAL[GATE_LAYERS[layer].id]; return p[Math.min(p.length - 1, Math.floor(n * p.length))]; };
const wallR = (th: number, z: number) => R + 0.07 * Math.sin(th * 7 + z * 9) + 0.04 * noise2(Math.cos(th) * 3, z * 3, 63);
const inHole = (x: number, y: number, z: number) => y < -0.3 && Math.abs(x) < FLOOR_HOLE.half && z > FLOOR_HOLE.z0 - 0.4 && z < FLOOR_HOLE.z1;
/** Crystals poking out of the geode's walls and face: [x, y, z, length, angle]. */
const crystalAt = (i: number, j: number) => rnd(i, j, 64);

/** The bored tunnel's walls over the whole depth (`part` 'walls' everything but the floor that drops, 'floor' just that
 *  patch). Each band shows the layer it was cut through, with spiral gouges; the geode's band is lined with crystals
 *  (in `glow`). */
export function buildGateTunnel(part: 'walls' | 'floor' = 'walls'): { lit: VoxelGrid; glow: VoxelGrid } {
  const s = 0.05, lit = new VoxelGrid(s), glow = new VoxelGrid(0.025), R1 = R + 0.45;
  fill(lit, [-R1, -R1, -(D + 0.5)], [R1, R1, 0.05], (x, y, z) => {
    const r = Math.hypot(x, y), th = Math.atan2(y, x), Rw = wallR(th, z);
    if (r < Rw || r > Rw + 0.38 || inHole(x, y, z) !== (part === 'floor')) return 0;
    const n = rnd(Math.round(x / s), Math.round(y / s), Math.round(z / s)), L0 = layerAt(GATE_LAYERS, -z);
    if (Math.sin(th * 2 + z * 11) > 0.86 && r < Rw + 0.06) return PAL[GATE_LAYERS[L0].id][0];
    return tint(L0, n);
  });
  if (part === 'walls') { // crystals in the geode band, pointing in from the rind
    const g0 = D - GATE_LAYERS[2].m;
    for (let i = 0; i < 70; i++) {
      const th = crystalAt(i, 1) * Math.PI * 2, z = -(g0 + 0.1 + crystalAt(i, 2) * (GATE_LAYERS[2].m - 0.1)), len = 0.12 + crystalAt(i, 3) * 0.22;
      if (Math.sin(th) < -0.5 && Math.abs(Math.cos(th)) < 0.6) continue; // not on the floor you ride on
      const r0 = wallR(th, z) + 0.02, r1 = r0 - len, c = crystalAt(i, 4) < 0.5 ? L.crystal : L.crystal2;
      glow.wsegment([Math.cos(th) * r0, Math.sin(th) * r0, z], [Math.cos(th) * r1, Math.sin(th) * r1, z + (crystalAt(i, 5) - 0.5) * 0.1], 0.03 * (1 - 0.4 * crystalAt(i, 6)), c);
      glow.wellipsoid([Math.cos(th) * r1, Math.sin(th) * r1, z], [0.025, 0.025, 0.025], L.crystalHot);
    }
  }
  return { lit, glow };
}

/** The end face for a layer, cut into stepped rings round the bit (obsidian in glassy conchoidal shells, the geode a
 *  cave of crystals inside its rind). Face at z = 0, material behind it; the previous layer still shows at the rim. */
export function buildGateFace(layer: number): { lit: VoxelGrid; glow: VoxelGrid } {
  const s = 0.04, lit = new VoxelGrid(s), glow = new VoxelGrid(0.025), R1 = R + 0.5, id = GATE_LAYERS[layer].id;
  fill(lit, [-R1, -R1, -0.5], [R1, R1, 0.05], (x, y, z) => {
    const r = Math.hypot(x, y), n = rnd(Math.round(x / s), Math.round(y / s), Math.round(z / s));
    if (r > R1) return 0;
    const ring = Math.floor(r / 0.22);
    const depth = id === 'obsidian' ? -0.08 * Math.abs(Math.sin(r * 9 + Math.atan2(y, x) * 2)) : id === 'geode' ? -0.35 * Math.max(0, 1 - r / (R - 0.25)) : -0.05 * ring - 0.04 * Math.sin(ring * 2.1);
    if (z > depth) return 0;
    if (r > wallR(Math.atan2(y, x), 0) - 0.15 && layer > 0) return tint(layer - 1, n);
    if (id === 'geode') return r > R - 0.4 ? (n < 0.5 ? L.geode : L.geode2) : L.obsidian2; // rind; dark hollow behind the crystals
    return tint(layer, n);
  });
  if (id === 'geode') for (let i = 0; i < 90; i++) { // the hollow's crystals: a bed of points facing you
    const a = crystalAt(i, 11) * Math.PI * 2, r = Math.sqrt(crystalAt(i, 12)) * (R - 0.45), len = 0.1 + crystalAt(i, 13) * 0.28;
    const z0 = -0.35 * Math.max(0, 1 - r / (R - 0.25)), c = crystalAt(i, 14) < 0.55 ? L.crystal : L.crystal2;
    glow.wsegment([Math.cos(a) * r, Math.sin(a) * r, z0], [Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9, z0 + len], 0.03, c);
    glow.wellipsoid([Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9, z0 + len], [0.022, 0.022, 0.022], L.crystalHot);
  }
  return { lit, glow };
}

/** Cracks spidering over the walls and floor from the face back toward the mouth, lava light glowing through, in
 *  `stage` 0..2 growing sets (each set includes the last). */
export function buildGateCracks(stage: number): VoxelGrid {
  const g = new VoxelGrid(0.03), lines = 5 + stage * 5;
  for (let i = 0; i < lines; i++) {
    let th = rnd(i, 1, 65) * Math.PI * 2, z = -D + 0.05 + rnd(i, 2, 65) * 0.4;
    if (i % 3 === 0) th = -Math.PI / 2 + (rnd(i, 3, 65) - 0.5) * 0.8; // a third of them across the floor
    const len = 1 + (stage + 1) * 0.9 * rnd(i, 4, 65), dz = 0.6 + rnd(i, 5, 65) * 0.4;
    for (let k = 0; k * 0.035 < len; k++) {
      const turn = (rnd(i, k, 66) - 0.5) * 0.9;
      th += turn * 0.035 / R; z += 0.035 * dz * (0.6 + 0.4 * Math.cos(turn));
      if (z > -0.2) break;
      const r = wallR(th, z) + 0.01;
      g.wellipsoid([Math.cos(th) * r, Math.sin(th) * r, z], [0.022, 0.022, 0.022], rnd(i, k, 67) < 0.25 ? L.lavaHot : rnd(i, k, 68) < 0.6 ? L.lava : L.ember);
      if (rnd(i, k, 69) < 0.03) { // a branch
        let bt = th, bz = z;
        for (let q = 0; q < 12; q++) { bt += (rnd(i * 31 + k, q, 70) - 0.3) * 0.05; bz += 0.02; const br = wallR(bt, bz) + 0.01; g.wellipsoid([Math.cos(bt) * br, Math.sin(bt) * br, bz], [0.018, 0.018, 0.018], L.ember); }
      }
    }
  }
  return g;
}
