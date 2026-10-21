// Midday, 1:22 — the end of the jungle stone path: rainforest giants, lianas, broad-leaf understory, toppled pillars,
// and the colossal carved monkey head whose gaping, fanged mouth is the temple door.
import * as THREE from 'three';
import { VoxelGrid } from '../../voxel/grid';
import { noise2, fbm } from '../../voxel/noise';
import { makeStage, aimSun, type Stage } from '../stage';
import { L, fillBox, addLit, addGlow, fpBars, rnd } from './kit';

const ground = (x: number, z: number) => 0.7 * fbm(x / 9, z / 9, 3, 31) - 0.35 + 0.025 * Math.abs(x) - (Math.abs(x) < 2.2 ? 0.25 : 0);
const FACE_Z = -46, K = 2.6; // face position and scale (the head is designed in unit space, ~15 units tall)
const PATH_END = FACE_Z + 3.6 * K;

/** A rainforest giant: buttress roots, a tall slightly crooked trunk, branches, and a lumpy layered crown. */
function giant(g: VoxelGrid, x: number, z: number, H: number, R: number, seed: number, lean: [number, number]) {
  const gy = ground(x, z), r0 = 0.55 + R * 0.06;
  const at = (t: number) => [x + lean[0] * t * t + Math.sin(t * 5 + seed) * 0.4, gy + H * t, z + lean[1] * t * t];
  for (let i = 0; i < 16; i++) { const t0 = i / 16, t1 = (i + 1) / 16; g.wsegment(at(t0), at(t1), r0 * (1 - 0.35 * t0), rnd(i, seed, 60) < 0.25 ? L.barkMoss : i % 3 ? L.bark : L.bark2); }
  // buttress fins
  for (let f = 0; f < 5; f++) {
    const a = (f / 5) * Math.PI * 2 + seed * 1.7, reach = 1.8 + rnd(f, seed, 61) * 1.6, hgt = 2.2 + rnd(f, seed, 62) * 1.8;
    for (let k = 0; k <= 8; k++) { const t = k / 8; g.wsegment([x, gy + hgt * (1 - t), z], [x + Math.cos(a) * reach * (0.3 + 0.7 * t), gy - 0.1, z + Math.sin(a) * reach * (0.3 + 0.7 * t)], 0.14, L.bark2); }
  }
  // crown: branches out to 6–9 flattened leaf masses at staggered heights
  const top = at(1), n = 6 + Math.floor(rnd(seed, 1, 63) * 4);
  for (let b = 0; b < n; b++) {
    const a = (b / n) * Math.PI * 2 + rnd(b, seed, 64), d = R * (0.35 + 0.65 * rnd(b, seed, 65)), hy = top[1] - 2 + rnd(b, seed, 66) * 4;
    const c = [top[0] + Math.cos(a) * d, hy, top[2] + Math.sin(a) * d];
    g.wsegment([top[0], top[1] - 3, top[2]], c, 0.22, L.bark);
    const rr = R * (0.35 + 0.25 * rnd(b, seed, 67));
    g.wellipsoid(c, [rr, rr * 0.45, rr], (xx, yy, zz) => {
      const n2 = noise2(xx * 0.18 + seed, zz * 0.18, 68), r = rnd(xx, yy, zz);
      if (r < 0.06) return 0; // ragged, see-through edges
      return n2 > 0.62 ? L.leafLime : n2 < 0.35 ? L.leafDark : r < 0.5 ? L.jungle2 : L.leafMid;
    });
  }
}

export function stillMonkey(canvas: HTMLCanvasElement, w: number, h: number): Stage {
  const sunDir = new THREE.Vector3(-0.35, 0.9, 0.45);
  const st = makeStage(canvas, w, h, {
    zenith: 0x6fbde6, horizon: 0xe2f0dc, fog: 0xb9d8b4, fogDensity: 0.0042, sunDir, sunColor: 0xfff0c8, sunI: 2.9, hemiSky: 0xc8e8c4, hemiGround: 0x3a5a2a, hemiI: 0.9,
  });

  // forest floor with leaf litter and roots
  const g = new VoxelGrid(0.25);
  fillBox(g, [-45, -2, FACE_Z - 50], [45, 2.5, 8], (x, y, z) => {
    const hgt = ground(x, z);
    if (y > hgt || y < hgt - 0.6) return 0;
    if (Math.abs(x) < 2.0 && z > PATH_END - 1) return 0; // the stone path goes here
    if (y < hgt - 0.25) return L.soil;
    const n = noise2(x / 4, z / 4, 37), r = rnd(Math.round(x * 4), Math.round(z * 4), 38);
    return n > 0.62 ? L.moss : n < 0.22 ? (r < 0.5 ? L.litter : L.soil) : r < 0.5 ? L.jungle2 : L.leafDark;
  });
  // rainforest giants: an arch over the path in front, walls of trees down both sides, a backdrop behind the head
  const giants: Array<[number, number, number, number, [number, number]]> = [
    [-10.5, 1, 22, 7, [2.5, 0]], [10, -2, 24, 7, [-2.5, 0]], [-19, -14, 26, 7, [0, 0]], [20, -18, 27, 7, [0, 0]],
    [-26, -30, 30, 8, [0, 0]], [27, -33, 28, 8, [0, 0]], [-30, -6, 31, 9, [0, 0]], [31, -4, 30, 9, [0, 0]],
    [-34, -44, 34, 10, [0, 0]], [35, -48, 33, 10, [0, 0]], [-40, -22, 32, 9, [0, 0]], [41, -26, 31, 9, [0, 0]],
    [-30, FACE_Z - 30, 30, 10, [0, 0]], [30, FACE_Z - 34, 30, 10, [0, 0]], [-44, FACE_Z - 14, 36, 12, [0, 0]], [44, FACE_Z - 10, 37, 12, [0, 0]],
  ];
  giants.forEach(([x, z, H, R, lean], i) => giant(g, x, z, H, R, i + 1, lean));
  addLit(st, 'jungle giants', g, 0.08, { cast: true, receive: true });

  // lianas (hanging from crowns, some looping between trees), understory: broad leaves, ferns, palms
  const u = new VoxelGrid(0.08);
  for (let i = 0; i < 70; i++) {
    const [tx, tz, H] = giants[i % giants.length], a = rnd(i, 1, 70) * Math.PI * 2, d = 2 + rnd(i, 2, 70) * 6;
    const x = tx + Math.cos(a) * d, z = tz + Math.sin(a) * d;
    if ((Math.abs(x) < 3 && z < 2 && z > PATH_END) || (Math.abs(x) < 20 && z < -12)) continue; // nothing hanging in front of the face
    const y0 = ground(tx, tz) + H - 3, y1 = ground(x, z) + rnd(i, 3, 70) * 6, sway = (rnd(i, 4, 70) - 0.5) * 1.5;
    for (let k = 0; k < 24; k++) { const t0 = k / 24, t1 = (k + 1) / 24; u.wsegment([x + sway * Math.sin(t0 * 3), y0 + (y1 - y0) * t0, z], [x + sway * Math.sin(t1 * 3), y0 + (y1 - y0) * t1, z], 0.06, L.vine); if (k % 3 === 0) u.wellipsoid([x + sway * Math.sin(t0 * 3) + 0.12, y0 + (y1 - y0) * t0, z], [0.14, 0.05, 0.1], L.jungle3); }
  }
  for (const [ia, ib] of [[0, 1], [6, 0], [7, 1], [2, 6], [3, 7]]) { // swags between giants, only over the near path
    const [ax, az, ah] = giants[ia], [bx, bz, bh] = giants[ib];
    const A = [ax, ground(ax, az) + ah * 0.75, az], B = [bx, ground(bx, bz) + bh * 0.75, bz];
    for (let k = 0; k < 30; k++) { const t0 = k / 30, t1 = (k + 1) / 30, p = (t: number) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t - Math.sin(Math.PI * t) * 5, A[2] + (B[2] - A[2]) * t]; u.wsegment(p(t0), p(t1), 0.07, L.vine); }
  }
  const leaf = (base: number[], a: number, len: number, wid: number, rise: number, droop: number, col: number) => {
    for (let k = 0; k <= 10; k++) {
      const t = k / 10, wv = wid * Math.sin(Math.PI * Math.min(1, t * 1.1)) + 0.02;
      const p = [base[0] + Math.cos(a) * len * t, base[1] + rise * t - droop * t * t, base[2] + Math.sin(a) * len * t];
      for (let s = -1; s <= 1; s += 0.25) u.wellipsoid([p[0] - Math.sin(a) * wv * s, p[1], p[2] + Math.cos(a) * wv * s], [0.07, 0.04, 0.07], Math.abs(s) < 0.1 ? L.leafLime : col);
    }
  };
  for (let i = 0; i < 120; i++) {
    const side = i % 2 ? 1 : -1, x = side * (2.6 + rnd(i, 1, 71) ** 1.4 * 20), z = 4 - rnd(i, 2, 71) * (8 - FACE_Z), y0 = ground(x, z);
    if (z < PATH_END - 6 && Math.abs(x) < 12) continue; // keep the mouth clear
    const kind = rnd(i, 3, 71);
    if (kind < 0.45) { // big broad-leaf clump (elephant ear / banana)
      const n = 4 + Math.floor(rnd(i, 4, 71) * 4), size = 0.9 + rnd(i, 5, 71) * 1.4;
      for (let f = 0; f < n; f++) { const a = (f / n) * Math.PI * 2 + rnd(i, f, 72), stem = [x + Math.cos(a) * 0.3 * size, y0 + size * (0.6 + rnd(i, f, 73) * 0.6), z + Math.sin(a) * 0.3 * size]; u.wsegment([x, y0, z], stem, 0.04, L.vine); leaf(stem, a, size * 1.1, size * 0.32, 0.3 * size, 0.9 * size, f % 2 ? L.leafMid : L.jungle2); }
    } else if (kind < 0.85) { // fern
      const n = 7 + Math.floor(rnd(i, 4, 71) * 4), size = 0.7 + rnd(i, 5, 71) * 1.0;
      for (let f = 0; f < n; f++) { const a = (f / n) * Math.PI * 2 + rnd(i, f, 74), pts: number[][] = []; for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push([x + Math.cos(a) * size * t, y0 + size * (0.9 * t - 0.75 * t * t), z + Math.sin(a) * size * t]); } for (let k = 0; k < 6; k++) u.wsegment(pts[k], pts[k + 1], 0.07 * (1 - k / 7), (f + k) % 3 ? L.fern : L.fern2); }
      if (rnd(i, 9, 75) < 0.3) u.wellipsoid([x + 0.2, y0 + size * 0.4, z], [0.09, 0.09, 0.09], rnd(i, 10, 75) < 0.5 ? L.flower : L.flower2);
    } else { // small palm
      const hh = 2 + rnd(i, 4, 71) * 3, top = [x, y0 + hh, z];
      u.wsegment([x, y0, z], top, 0.1, L.trunk);
      for (let f = 0; f < 7; f++) leaf(top, (f / 7) * Math.PI * 2, 1.6, 0.25, 0.4, 1.4, f % 2 ? L.palm : L.palm2);
    }
  }
  addLit(st, 'lianas + understory', u, 0.08, { cast: false, receive: true });

  // cut-stone path and pillars (some toppled)
  const ps = new VoxelGrid(0.1);
  fillBox(ps, [-2.1, -0.6, PATH_END - 2], [2.1, 0.2, 6], (x, y, z) => {
    const top = 0.02 * Math.sin(x * 2 + z); if (y > top || y < top - 0.4) return 0;
    const bx = Math.floor((x + 2.1 + (Math.floor(z / 0.8) % 2) * 0.4) / 0.8), bz = Math.floor(z / 0.8);
    const gap = ((x + 2.1 + (Math.floor(z / 0.8) % 2) * 0.4) % 0.8) < 0.1 || (((z % 0.8) + 0.8) % 0.8) < 0.1;
    if (gap && y > top - 0.1) return noise2(x, z, 43) > 0.5 ? L.moss : 0;
    const n = rnd(bx, bz, 44); return n < 0.33 ? L.stone : n < 0.66 ? L.stone2 : L.stone3;
  });
  for (let i = 0; i < 6; i++) for (const side of [-1, 1]) {
    const z = 0 - i * 5.2, x = side * 3.3, gy = ground(x, z), toppled = rnd(i, side + 5, 45) < 0.3, hgt = 3 + rnd(i, side + 9, 45) * 2.5;
    if (toppled) { ps.wbox([x - 0.4, gy, z - 0.4], [x + 0.4 + side * hgt, gy + 0.8, z + 0.4], L.stone2); continue; }
    ps.wbox([x - 0.42, gy - 0.3, z - 0.42], [x + 0.42, gy + hgt, z + 0.42], rnd(i, side, 46) < 0.5 ? L.stone : L.stone3);
    ps.wbox([x - 0.55, gy + hgt, z - 0.55], [x + 0.55, gy + hgt + 0.3, z + 0.55], L.stone2);
    ps.wbox([x - 0.56, gy + hgt + 0.3, z - 0.56], [x + 0.56, gy + hgt + 0.36, z + 0.56], L.moss);
    for (let k = 0; k < 6; k++) ps.wbox([x - 0.43, gy + 0.6 * k + 0.25, z + 0.42], [x + 0.43, gy + 0.6 * k + 0.29, z + 0.44], L.stoneDark);
  }
  addLit(st, 'path + pillars', ps, 0.06);

  // the monkey head, carved from one mass of stone; its gaping mouth is the door
  const f = new VoxelGrid(0.3);
  const fang = (x: number, y: number, z: number, tx: number, ty: number, len: number, r: number, down: boolean) => {
    const t = down ? (ty - y) / len : (y - ty) / len; // 0 at the root, 1 at the tip
    if (t < 0 || t > 1 || z < FACE_Z + 1.2 || z > FACE_Z + 3.4) return false;
    return Math.abs(x - tx) < r * (1 - t) + 0.05;
  };
  fillBox(f, [-11 * K, -0.5, FACE_Z - 9 * K], [11 * K, 16 * K, FACE_Z + 4.2 * K], (wx, wy, wz) => {
    const x = wx / K, y = wy / K, z = FACE_Z + (wz - FACE_Z) / K; // unit space
    const dx = x, dy = y - 7.4, dz = z - (FACE_Z - 1.5);
    const head = (dx / 7.5) ** 2 + (dy / 7.6) ** 2 + (dz / 5) ** 2 < 1;
    const base = Math.abs(x) < 8.5 && y < 3.5 && z > FACE_Z - 8 && z < FACE_Z + 1.2;
    const brow = (dx / 6.4) ** 2 + ((y - 10.1) / 1.1) ** 2 + ((z - (FACE_Z + 2.4)) / 1.5) ** 2 < 1;
    const muzzle = (dx / 4.8) ** 2 + ((y - 4.2) / 3.6) ** 2 + ((z - (FACE_Z + 2.0)) / 2.0) ** 2 < 1;
    const jaw = Math.abs(x) < 4.6 && y < 0.9 && z > FACE_Z - 1 && z < FACE_Z + 3.4; // lower jaw / threshold
    const earAt = (sx: number) => ((x - sx * 8.6) / 2.6) ** 2 + ((y - 8.4) / 2.9) ** 2 + ((z - (FACE_Z - 0.2)) / 1.1) ** 2;
    const ears = [-1, 1].some((sx) => earAt(sx) < 1);
    const earCup = [-1, 1].some((sx) => earAt(sx) < 0.45 && z > FACE_Z + 0.2);
    // heart-shaped face mask: two eye lobes + the muzzle
    const mask = [-1, 1].some((sx) => ((x - sx * 2.4) / 2.5) ** 2 + ((y - 8.6) / 2.4) ** 2 < 1) || (x / 4.6) ** 2 + ((y - 4.2) / 4.0) ** 2 < 1;
    if (!(head || base || brow || muzzle || jaw || ears)) return 0;
    if (earCup) return L.stoneDark;
    // eye sockets and nostrils
    if ([-1, 1].some((sx) => ((x - sx * 2.4) / 1.35) ** 2 + ((y - 8.7) / 1.05) ** 2 < 1) && z > FACE_Z + 0.4) return z < FACE_Z + 0.9 ? L.shadowVoid : 0;
    if ([-1, 1].some((sx) => ((x - sx * 0.75) / 0.38) ** 2 + ((y - 6.6) / 0.32) ** 2 < 1) && z > FACE_Z + 3.0) return 0;
    // the gaping mouth: a wide oval doorway down to the jaw, with fangs
    const mo = (x / 3.6) ** 2 + ((y - 2.6) / 2.9) ** 2;
    if (mo < 1 && y > 0.9) {
      const upper = [[-2.6, 0.5, 0.55], [-1.6, 1.8, 0.5], [-0.55, 1.0, 0.4], [0.55, 1.0, 0.4], [1.6, 1.8, 0.5], [2.6, 0.5, 0.55]]; // x, length, radius
      for (const [tx, len, r] of upper) { const ty = 2.6 + 2.9 * Math.sqrt(Math.max(0, 1 - (tx / 3.6) ** 2)) - 0.05; if (fang(x, y, z, tx, ty, len, r, true)) return rnd(Math.round(wx * 3), Math.round(wy * 3), 5) < 0.5 ? L.teeth : L.teeth2; }
      for (const [tx, len, r] of [[-2.9, 1.7, 0.5], [2.9, 1.7, 0.5], [-3.3, 0.8, 0.35], [3.3, 0.8, 0.35]]) if (fang(x, y, z, tx, 0.9, len, r, false)) return L.teeth;
      return z > FACE_Z - 6 ? (z < FACE_Z - 5.4 ? L.shadowVoid : 0) : L.stoneDark;
    }
    if (mo < 1.25 && z > FACE_Z + 1.6 && y > 0.6) return L.stoneDark; // lip ring
    const mossy = y > 3 && rnd(Math.round(wx * 3), Math.round(wy * 3), Math.round(wz * 3)) < 0.1 + 0.5 * Math.max(0, fbm(x / 3, z / 3, 2, 47) - 0.55);
    if (mossy) return L.moss;
    if ((mask && z > FACE_Z + 1.0) || muzzle || jaw) return rnd(Math.round(wx * 3), Math.round(wy * 3), Math.round(wz * 3)) < 0.5 ? L.stone3 : L.stone; // pale face mask
    const n = fbm(x / 4, z / 4 + y / 4, 2, 48);
    return n < 0.45 ? L.stoneDark : L.basalt2; // a dark-furred head around the pale face
  });
  const eg = new VoxelGrid(0.15);
  for (const sx of [-1, 1]) eg.wellipsoid([sx * 2.4 * K, 8.65 * K, FACE_Z + 1.0 * K], [0.3 * K, 0.24 * K, 0.15], L.glyph);
  addGlow(st, 'eye glints', eg, 1.6);
  for (let i = 0; i < 26; i++) { // vines spilling over the brow and ears, clear of the eyes and mouth
    const ux = -7 + i * 0.56; if (Math.abs(ux) < 5.5) continue;
    const x = (ux + rnd(i, 1, 49) * 0.3) * K, len = (2 + rnd(i, 2, 49) * 6) * K;
    f.wsegment([x, 12.5 * K, FACE_Z + 1.5 * K], [x + (rnd(i, 3, 49) - 0.5) * 2, 12.5 * K - len, FACE_Z + 2.4 * K], 0.2, rnd(i, 4, 49) < 0.5 ? L.vine : L.jungle3);
  }
  addLit(st, 'monkey head', f, 0.07);

  aimSun(st, new THREE.Vector3(0, 8, -24), sunDir, 46);
  st.camera.fov = 72; st.camera.updateProjectionMatrix();
  st.camera.position.set(0.3, 1.55, 5);
  st.camera.lookAt(0, 13.5, FACE_Z);
  fpBars(st);
  return st;
}
