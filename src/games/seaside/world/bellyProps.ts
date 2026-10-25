// Chapter 2a's props as voxel grids (#190), pure (no three.js): the swallowed junk on the gut floor, the survey boat
// and its three spare parts, the drill rig that replaces the bars, and the drill tunnel (walls banded by the layers
// already cut, one end face per layer, the cracks that let the sea light in). World-space grids are built in world
// coordinates around an origin at their spot; rig grids are in the rig's own space.
import { VoxelGrid } from '../voxel/grid';
import { noise2 } from '../voxel/noise';
import { BELLY_LAYERS, type PartId } from '../sim/belly';
import { textAt, textWidth } from './coastBuild';
import { drillAxis, gutFloor, gutPoint, JUNK, PART_SPOTS, TUNNEL_R } from './bellyLayout';
import { L } from './laterPalette';

export const rnd = (a: number, b: number, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 982451653) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
type V3 = [number, number, number];
const at = (u: number, d: number): V3 => { const p = gutPoint(u, d); return [p.x, p.y, p.z]; };
const grid = (size: number, o: V3) => new VoxelGrid(size, [Math.round(o[0] / size) * size, Math.round(o[1] / size) * size, Math.round(o[2] / size) * size]);
/** Fill voxels of `g` in a world box whose centre passes fn. */
function fill(g: VoxelGrid, min: V3, max: V3, fn: (x: number, y: number, z: number) => number) {
  const s = g.size, o = g.origin;
  const lo = [0, 1, 2].map((a) => Math.floor((min[a] - o[a]) / s)), hi = [0, 1, 2].map((a) => Math.ceil((max[a] - o[a]) / s));
  for (let x = lo[0]; x <= hi[0]; x++) for (let z = lo[2]; z <= hi[2]; z++) for (let y = lo[1]; y <= hi[1]; y++) {
    const v = fn(o[0] + (x + 0.5) * s, o[1] + (y + 0.5) * s, o[2] + (z + 0.5) * s);
    if (v) g.set(x, y, z, v);
  }
}

// ---- swallowed junk -----------------------------------------------------------------------------------------------

/** Your old Pier Rod, lying across the floor: blue blank, cork grip, reel, line guides. */
export function buildRod(): VoxelGrid {
  const c = at(JUNK.rod.u, JUNK.rod.d), g = grid(0.03, c), fy = (x: number, z: number) => gutFloor(x, z) + 0.06;
  const a: V3 = [c[0] - 1.1, 0, c[2] + 0.7], b: V3 = [c[0] + 1.2, 0, c[2] - 1.5];
  a[1] = fy(a[0], a[2]); b[1] = fy(b[0], b[2]);
  g.wsegment(a, b, 0.026, L.rodBlue);
  const p = (t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  g.wsegment(a, p(0.14), 0.045, L.cork);
  const r = p(0.2); g.wellipsoid([r[0], r[1] + 0.05, r[2]], [0.08, 0.08, 0.07], L.steel2);
  for (let i = 0; i < 6; i++) { const q = p(0.3 + i * 0.12); g.wsegment(q, [q[0], q[1] + 0.06, q[2]], 0.02, L.signWhite); }
  return g;
}

export function buildHubcap(i: number): VoxelGrid {
  const s = JUNK.hubcap[i], c = at(s.u, s.d), g = grid(0.03, c), tilt = 0.25 + 0.1 * i;
  for (let a = 0; a < Math.PI * 2; a += 0.04) for (let r = 0; r < 0.36; r += 0.025) {
    const x = c[0] + Math.cos(a) * r, z = c[2] + Math.sin(a) * r * 0.9, y = c[1] + 0.06 + Math.sin(a) * r * tilt;
    g.set(g.vi(x, 0), g.vi(y, 1), g.vi(z, 2), r > 0.3 || r < 0.1 || Math.floor(a / (Math.PI / 5)) % 2 ? L.hubcap2 : L.hubcap);
  }
  return g;
}

/** VISTA POINT, on its post, leaning back against a rib. */
export function buildSign(): VoxelGrid {
  const c = at(JUNK.sign.u, JUNK.sign.d), g = grid(0.02, c), lean = 0.22;
  const up: V3 = [Math.sin(lean), Math.cos(lean), 0], foot: V3 = [c[0] - 0.1, c[1], c[2]];
  const top = (k: number): V3 => [foot[0] + up[0] * k, foot[1] + up[1] * k, foot[2]];
  g.wsegment(foot, top(1.9), 0.035, L.post);
  const text = 'VISTA POINT', cell = 0.02, tw = textWidth(text, cell), bw = tw + 0.16, bh = 0.32;
  for (let u = -bw / 2; u <= bw / 2; u += 0.02) for (let v = -bh / 2; v <= bh / 2; v += 0.02) {
    const base = top(1.62 + v), x = base[0] + u, y = base[1] + u * 0.08, z = c[2] + 0.06;
    const border = Math.abs(u) > bw / 2 - 0.04 || Math.abs(v) > bh / 2 - 0.04;
    const lit = textAt(text, u + tw / 2, v + 0.07, cell);
    g.set(g.vi(x, 0), g.vi(y, 1), g.vi(z, 2), border || lit ? L.signWhite : L.signGreen);
    g.set(g.vi(x, 0), g.vi(y, 1), g.vi(z, 2) - 1, L.signGreen);
  }
  return g;
}

/** A capsized dinghy, keel up, half sunk in the floor. */
export function buildDinghy(): VoxelGrid {
  const c = at(JUNK.dinghy.u, JUNK.dinghy.d), g = grid(0.05, c), y0 = c[1] - 0.1;
  fill(g, [c[0] - 0.8, y0, c[2] - 1.6], [c[0] + 0.8, y0 + 0.7, c[2] + 1.6], (x, y, z) => {
    const lx = (x - c[0]) / 0.68, ly = (y - y0) / 0.58, lz = (z - c[2]) / 1.45, q = Math.hypot(lx, ly, lz);
    if (q > 1 || q < 0.8 || ly < 0) return 0;
    if (Math.abs(lx) < 0.08 && ly > 0.9) return L.boatStripe; // keel
    return Math.abs(ly - 0.3) < 0.08 ? L.signWhite : L.boatOrange;
  });
  return g;
}

export function buildTyre(): VoxelGrid {
  const c = at(JUNK.tyre.u, JUNK.tyre.d), g = grid(0.03, c);
  fill(g, [c[0] - 0.5, c[1] - 0.1, c[2] - 0.5], [c[0] + 0.5, c[1] + 0.3, c[2] + 0.5], (x, y, z) => {
    const r = Math.hypot(x - c[0], z - c[2]), d = Math.hypot(r - 0.34, y - c[1] - 0.1);
    return d < 0.13 ? (d > 0.1 && Math.sin(Math.atan2(z - c[2], x - c[0]) * 24) > 0.3 ? L.drillDark : L.steel2) : 0;
  });
  return g;
}

/** A crab trap: wire frame and mesh, an orange float on its line. */
export function buildTrap(): VoxelGrid {
  const c = at(JUNK.trap.u, JUNK.trap.d), g = grid(0.025, c), h = 0.45, w = 0.4;
  fill(g, [c[0] - w, c[1], c[2] - w], [c[0] + w, c[1] + h, c[2] + w], (x, y, z) => {
    const ex = Math.abs(Math.abs(x - c[0]) - w) < 0.02, ez = Math.abs(Math.abs(z - c[2]) - w) < 0.02, ey = y - c[1] < 0.03 || Math.abs(y - c[1] - h) < 0.02;
    const edge = (ex && ez) || (ex && ey) || (ez && ey);
    const mesh = (ex || ez || ey) && (Math.abs(((x - c[0]) / 0.1) % 1) < 0.2 || Math.abs(((y - c[1]) / 0.1) % 1) < 0.2 || Math.abs(((z - c[2]) / 0.1) % 1) < 0.2);
    return edge ? L.steel : mesh ? L.chain : 0;
  });
  g.wsegment([c[0] + w, c[1] + h, c[2]], [c[0] + w + 0.5, c[1] + 0.12, c[2] - 0.4], 0.012, L.signWhite);
  g.wellipsoid([c[0] + w + 0.55, c[1] + 0.12, c[2] - 0.45], [0.12, 0.1, 0.12], L.boatOrange);
  return g;
}

/** The half-digested survey boat, on its side: hull shell eaten through in places, cabin, the coring A-frame. */
export function buildBoat(): VoxelGrid {
  const c = at(JUNK.boat.u, JUNK.boat.d), g = grid(0.08, c), roll = 1.25, cr = Math.cos(roll), sr = Math.sin(roll);
  const C: V3 = [c[0], c[1] + 1.05, c[2]];
  // world → boat space (x across the beam, y up from the keel line, z along): undo the roll about z
  const local = (x: number, y: number): [number, number] => { const dx = x - C[0], dy = y - C[1]; return [dx * cr + dy * sr, -dx * sr + dy * cr]; };
  fill(g, [C[0] - 2.4, c[1] - 0.2, C[2] - 4.8], [C[0] + 2.4, C[1] + 2.4, C[2] + 4.8], (x, y, z) => {
    if (y < gutFloor(x, z) - 0.15) return 0;
    const [bx, by] = local(x, y), bz = z - C[2];
    const q = Math.hypot(bx / 1.15, (by + 0.1) / 1.5, bz / 4.4);
    if (by < 0.75 && q <= 1 && q > 0.86) { // the hull, open on deck
      if (noise2(bz * 0.7 + 3, Math.atan2(by, bx) * 2, 21) > 0.66) return Math.abs((bz * 2.2) % 1) < 0.2 ? L.steel2 : 0; // digested: ribs through holes
      return Math.abs(by - 0.45) < 0.12 ? L.boatOrange : Math.abs(by - 0.22) < 0.05 ? L.boatStripe : L.boatWhite;
    }
    if (by >= 0.75 && by < 1.9 && Math.abs(bx) < 0.75 && bz > -1.6 && bz < 0.8) { // cabin shell, windows
      const shell = Math.abs(bx) > 0.66 || by > 1.8 || bz < -1.5 || bz > 0.7;
      if (!shell) return 0;
      return by > 1.25 && by < 1.6 && Math.abs(bx) > 0.66 && Math.abs((bz + 3) % 0.6 - 0.3) < 0.18 ? L.boatStripe : L.boatWhite;
    }
    return 0;
  });
  // the coring A-frame off the stern, sticking out toward the ride
  const sx = (bx: number, by: number, bz: number): V3 => [C[0] + bx * cr - by * sr, C[1] + bx * sr + by * cr, C[2] + bz];
  g.wsegment(sx(-0.5, 0.8, 3.6), sx(0, 2.8, 4.4), 0.07, L.boatOrange);
  g.wsegment(sx(0.5, 0.8, 3.6), sx(0, 2.8, 4.4), 0.07, L.boatOrange);
  g.wsegment(sx(0, 2.8, 4.4), sx(0, 1.6, 5.4), 0.05, L.steel);
  return g;
}

// ---- the spare parts ----------------------------------------------------------------------------------------------

/** One of the coring rig's parts, on the floor at its spot. */
export function buildPart(id: PartId): VoxelGrid {
  const s = PART_SPOTS[id], c = at(s.u, s.d), g = grid(0.025, c), fy = (x: number, z: number) => gutFloor(x, z);
  if (id === 'bit') { // a long fluted bit lying across the floor, point toward the ride
    const dir = Math.sign(-s.d);
    for (let k = 0; k <= 120; k++) {
      const t = k / 120, x = c[0] - dir * 0.5 + dir * 1.3 * t, z = c[2] + 0.2 - 0.4 * t, r = 0.09 * (1 - t * 0.75), y = fy(x, z) + 0.1;
      g.wellipsoid([x, y, z], [0.02, r * 0.55, r * 0.55], L.steel2);
      for (const ph of [0, Math.PI]) { const a = t * 34 + ph; g.wellipsoid([x, y + Math.cos(a) * r, z + Math.sin(a) * r], [0.02, 0.02, 0.02], L.steel); }
    }
    g.wbox([c[0] - dir * 0.62 - 0.08, fy(c[0], c[2]) - 0.02, c[2] + 0.12], [c[0] - dir * 0.62 + 0.08, fy(c[0], c[2]) + 0.2, c[2] + 0.3], L.drillBody);
  } else if (id === 'gearbox') {
    const y = fy(c[0], c[2]);
    g.wbox([c[0] - 0.32, y - 0.05, c[2] - 0.3], [c[0] + 0.32, y + 0.42, c[2] + 0.3], L.steel2);
    g.wbox([c[0] - 0.35, y + 0.42, c[2] - 0.33], [c[0] + 0.35, y + 0.5, c[2] + 0.33], L.drillBody);
    g.wsegment([c[0] + 0.32, y + 0.22, c[2]], [c[0] + 0.55, y + 0.22, c[2]], 0.05, L.steel);
    for (const [dx, dz] of [[-0.27, -0.25], [0.27, -0.25], [-0.27, 0.25], [0.27, 0.25]]) g.wellipsoid([c[0] + dx, y + 0.52, c[2] + dz], [0.03, 0.025, 0.03], L.steel);
  } else {
    for (let i = 0; i < 18; i++) {
      const x = c[0] - 0.9 + i * 0.1, z = c[2] + Math.sin(i * 0.6) * 0.22, y = fy(x, z) + 0.04;
      g.wellipsoid([x, y, z], i % 2 ? [0.06, 0.02, 0.035] : [0.06, 0.035, 0.02], i % 2 ? L.chain : L.steel2);
    }
  }
  return g;
}

/** Glowing motes around a part (it glints as you come up on it). */
export function buildSparkle(id: PartId): VoxelGrid {
  const s = PART_SPOTS[id], c = at(s.u, s.d), g = grid(0.025, c);
  for (let a = 0; a < 46; a++) {
    const r = 0.8, p: V3 = [c[0] + (rnd(a, 1, 7) - 0.5) * 2 * r, c[1] + 0.1 + rnd(a, 2, 7) * 0.9, c[2] + (rnd(a, 3, 7) - 0.5) * 2 * r];
    g.wellipsoid(p, [0.022, 0.022, 0.022], L.partGlow);
  }
  return g;
}

// ---- the drill rig (in rig space: origin between the grips, −z ahead) ---------------------------------------------

/** The scavenged drill: housing where the stem was, two grips with gloves on them, a work lamp. The bit is separate. */
export function buildDrillRig(): VoxelGrid {
  const d = new VoxelGrid(0.008), Y = -0.14, Z = 0; // housing centre below the grips
  d.wbox([-0.12, Y - 0.06, Z - 0.22], [0.12, Y + 0.1, Z + 0.12], L.drillBody);
  d.wbox([-0.125, Y + 0.02, Z - 0.22], [0.125, Y + 0.035, Z + 0.12], L.drillDark);
  d.wbox([-0.09, Y + 0.1, Z - 0.16], [0.09, Y + 0.13, Z + 0.06], L.drillBody2);
  for (let k = 0; k < 5; k++) d.wbox([-0.1 + k * 0.045, Y + 0.13, Z - 0.12], [-0.085 + k * 0.045, Y + 0.145, Z + 0.02], L.drillDark);
  d.wellipsoid([0, Y + 0.02, Z - 0.24], [0.07, 0.07, 0.04], L.drillSteel2); // chuck
  d.wbox([-0.03, Y + 0.13, Z - 0.2], [0.03, Y + 0.16, Z - 0.17], L.lamp);
  for (const sx of [-1, 1]) {
    const gx = sx * 0.2;
    d.wbox([gx - 0.025, -0.12, -0.05], [gx + 0.025, 0.12, 0.05], L.drillDark);
    d.wsegment([gx - sx * 0.02, 0, 0], [sx * 0.12, Y + 0.04, -0.04], 0.02, L.drillSteel2);
    d.wellipsoid([gx, 0.03, 0.02], [0.045, 0.06, 0.05], L.gloveG);
    for (let f = 0; f < 4; f++) d.wsegment([gx + sx * 0.03, 0.075 - f * 0.026, -0.035], [gx - sx * 0.03, 0.07 - f * 0.026, -0.05], 0.012, L.gloveG2);
    d.wsegment([gx - sx * 0.03, 0.08, 0.01], [gx - sx * 0.04, 0.09, -0.04], 0.012, L.gloveTop);
    d.wsegment([gx, 0.04, 0.06], [gx + sx * 0.12, -0.12, 0.45], 0.045, L.drillDark);
  }
  return d;
}
/** Where the bit leaves the chuck, in rig space. */
export const CHUCK: V3 = [0, -0.12, -0.26];

/** A unit-length fluted bit along +z (the renderer scales it to reach the face): two cutting edges round a core. */
export function buildBit(): VoxelGrid {
  const g = new VoxelGrid(0.006);
  for (let k = 0; k <= 160; k++) {
    const u = k / 160, zz = u, r = 0.055 * (1 - u * 0.75);
    g.wellipsoid([0, 0, zz], [r * 0.55, r * 0.55, 0.008], L.drillSteel2);
    for (const ph of [0, Math.PI]) { const a = u * 40 + ph; g.wellipsoid([Math.cos(a) * r, Math.sin(a) * r, zz], [0.012, 0.012, 0.01], L.drillSteel); }
  }
  return g;
}

// ---- the tunnel (in tunnel space: origin at the hole's centre on the stomach wall, boring along −z) --------------

const TOTAL = BELLY_LAYERS.reduce((a, l) => a + l.m, 0);
const LAYER_PAL: Record<string, [number, number, number]> = { flesh: [L.fleshDark, L.flesh2, L.flesh], cartilage: [L.cartDark, L.cart2, L.cart], bone: [L.bone2, L.bone, L.ribEdge] };
/** The layer at bored depth `m` (index into BELLY_LAYERS). */
export function layerAtDepth(m: number): number {
  let acc = 0;
  for (let i = 0; i < BELLY_LAYERS.length; i++) { acc += BELLY_LAYERS[i].m; if (m < acc) return i; }
  return BELLY_LAYERS.length - 1;
}
const tint = (layer: number, n: number) => { const p = LAYER_PAL[BELLY_LAYERS[layer].id]; return n < 0.33 ? p[0] : n < 0.66 ? p[1] : p[2]; };
const wallR = (th: number, z: number) => TUNNEL_R + 0.08 * Math.sin(th * 7 + z * 9) + 0.05 * noise2(Math.cos(th) * 3, z * 3, 3);

/** The bored tunnel's walls over the whole depth: each band shows the layer it was cut through, with spiral gouges. */
export function buildTunnel(): VoxelGrid {
  const s = 0.05, g = new VoxelGrid(s), R1 = TUNNEL_R + 0.45;
  fill(g, [-R1, -R1, -(TOTAL + 0.5)], [R1, R1, 0.05], (x, y, z) => {
    const r = Math.hypot(x, y), th = Math.atan2(y, x), R = wallR(th, z);
    if (r < R || r > R + 0.38) return 0;
    const n = rnd(Math.round(x / s), Math.round(y / s), Math.round(z / s)), L0 = layerAtDepth(-z);
    if (Math.sin(th * 2 + z * 11) > 0.85 && r < R + 0.06) return LAYER_PAL[BELLY_LAYERS[L0].id][0];
    return tint(L0, n);
  });
  return g;
}

/** The end face for a layer, cut into stepped rings round the bit (flesh is soft: lumps, no rings). Face at z = 0,
 *  material behind it; the previous layer still shows at the rim. */
export function buildFace(layer: number): VoxelGrid {
  const s = 0.04, g = new VoxelGrid(s), R1 = TUNNEL_R + 0.5, id = BELLY_LAYERS[layer].id;
  fill(g, [-R1, -R1, -0.5], [R1, R1, 0.05], (x, y, z) => {
    const r = Math.hypot(x, y), n = rnd(Math.round(x / s), Math.round(y / s), Math.round(z / s));
    if (r > R1) return 0;
    const ring = Math.floor(r / 0.22);
    const depth = id === 'flesh' ? -0.06 * noise2(x * 4, y * 4, 5) - 0.05 * Math.max(0, 1 - r / 0.3) : -0.05 * ring - 0.04 * Math.sin(ring * 2.1);
    if (z > depth) return 0;
    if (r > wallR(Math.atan2(y, x), 0) - 0.15 && layer > 0) return tint(layer - 1, n);
    if (id === 'bone') return ring % 2 ? (n < 0.5 ? L.bone2 : L.bone) : n < 0.6 ? L.ribEdge : L.bone;
    return tint(layer, n);
  });
  return g;
}

/** Cracks across the bone face (glowing: sea light coming through), in `stages` growing sets. */
export function buildCracks(stage: number): VoxelGrid {
  const g = new VoxelGrid(0.02), lines = 3 + stage * 3;
  for (let i = 0; i < lines; i++) {
    let x = (rnd(i, 1, 41) - 0.5) * 0.3, y = (rnd(i, 2, 41) - 0.5) * 0.3, a = rnd(i, 3, 41) * Math.PI * 2;
    const len = 0.5 + (stage + 1) * 0.3 * rnd(i, 4, 41);
    for (let k = 0; k * 0.03 < len; k++) {
      a += (rnd(i, k, 42) - 0.5) * 0.7; x += Math.cos(a) * 0.03; y += Math.sin(a) * 0.03;
      if (Math.hypot(x, y) > TUNNEL_R) break;
      g.wellipsoid([x, y, 0.03], [0.018, 0.018, 0.02], rnd(i, k, 43) < 0.3 ? L.bile2 : L.partGlow);
    }
  }
  return g;
}

/** World placement of the tunnel space. */
export const tunnelOrigin = () => drillAxis();
export const TUNNEL_TOTAL = TOTAL;
