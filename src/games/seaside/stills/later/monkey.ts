// Midday, 1:22 — the end of the jungle stone path: toppled pillars, ferns, palms, and the giant carved monkey face
// whose open mouth is the temple door.
import * as THREE from 'three';
import { VoxelGrid } from '../../voxel/grid';
import { noise2, fbm } from '../../voxel/noise';
import { makeStage, aimSun, type Stage } from '../stage';
import { L, fillBox, addLit, addGlow, fpBars, rnd } from './kit';

const ground = (x: number, z: number) => 0.6 * fbm(x / 9, z / 9, 3, 31) - 0.3 + 0.03 * Math.abs(x) - (Math.abs(x) < 2.2 ? 0.2 : 0);
const FACE_Z = -30, K = 1.45; // face position and scale

export function stillMonkey(canvas: HTMLCanvasElement, w: number, h: number): Stage {
  const sunDir = new THREE.Vector3(-0.45, 0.85, 0.55);
  const st = makeStage(canvas, w, h, {
    zenith: 0x5fb4e8, horizon: 0xdff2e2, fog: 0xcfe6cf, fogDensity: 0.0055, sunDir, sunColor: 0xfff1d0, sunI: 2.8, hemiSky: 0xcdeccf, hemiGround: 0x5a7a3a, hemiI: 1.0,
  });
  // jungle floor + ferns + flowers
  const g = new VoxelGrid(0.25);
  fillBox(g, [-30, -2, -60], [30, 2.5, 8], (x, y, z) => {
    const hgt = ground(x, z);
    if (y > hgt) {
      return 0;
    }
    if (y < hgt - 0.6) return 0;
    if (Math.abs(x) < 2.0) return 0; // path goes here
    return y > hgt - 0.25 ? (noise2(x / 5, z / 5, 37) > 0.55 ? L.moss : rnd(Math.round(x * 4), Math.round(z * 4), 38) < 0.5 ? L.jungle : L.jungle2) : L.soil;
  });
  // trees: palms bending over the path, broadleaf canopy behind
  const tree = (x: number, z: number, hgt: number, lean: number, seed: number) => {
    const b = [x, ground(x, z), z], top = [x + lean, b[1] + hgt, z + 0.4];
    for (let i = 0; i < 10; i++) { const t0 = i / 10, t1 = (i + 1) / 10; const p = (t: number) => [b[0] + (top[0] - b[0]) * t * t, b[1] + (top[1] - b[1]) * t, b[2] + (top[2] - b[2]) * t]; g.wsegment(p(t0), p(t1), 0.28 - 0.1 * t0, L.trunk); }
    for (let f = 0; f < 7; f++) {
      const a = (f / 7) * Math.PI * 2 + seed, len = 3.2 + rnd(f, seed, 40) * 1.2;
      for (let k = 0; k < 8; k++) { const t = k / 8; g.wellipsoid([top[0] + Math.cos(a) * len * t, top[1] + 0.4 - t * t * 2.0, top[2] + Math.sin(a) * len * t], [0.35 * (1 - t * 0.6), 0.12, 0.35 * (1 - t * 0.6)], (xx, yy) => (rnd(xx, yy, f) < 0.5 ? L.palm : L.palm2)); }
    }
  };
  [[-6, -6, 9, -1.8, 1], [7, -12, 10, 2.2, 2], [-9, -18, 11, -1.5, 3], [8, -2, 8, 1.5, 4], [-14, -26, 12, -2, 5], [14, -24, 11, 2, 6]].forEach(([x, z, hh, l, sd]) => tree(x, z, hh, l, sd));
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 1 : -1, x = side * (9 + rnd(i, 1, 41) * 16), z = -2 - rnd(i, 2, 41) * 50, r = 3 + rnd(i, 3, 41) * 3;
    g.wsegment([x, ground(x, z), z], [x, ground(x, z) + 6 + r, z], 0.35, L.trunk);
    g.wellipsoid([x, ground(x, z) + 7 + r, z], [r * 1.3, r * 0.8, r * 1.3], (xx, yy, zz) => { const n = rnd(xx, yy, zz); return n < 0.4 ? L.jungle : n < 0.75 ? L.jungle2 : L.jungle3; });
  }
  addLit(st, 'jungle', g, 0.08, { cast: true, receive: true });
  // ferns as real fronds, and small flowers, on a finer grid
  const fg = new VoxelGrid(0.06);
  for (let i = 0; i < 150; i++) {
    const side = i % 2 ? 1 : -1, x = side * (2.5 + rnd(i, 1, 50) ** 1.5 * 12), z = 3 - rnd(i, 2, 50) * (-FACE_Z + 2), y0 = ground(x, z), size = 0.6 + rnd(i, 3, 50) * 0.9;
    const n = 6 + Math.floor(rnd(i, 4, 50) * 4);
    for (let f = 0; f < n; f++) {
      const a = (f / n) * Math.PI * 2 + rnd(i, f, 51), pts: number[][] = [];
      for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push([x + Math.cos(a) * size * t, y0 + size * (0.9 * t - 0.75 * t * t), z + Math.sin(a) * size * t]); }
      for (let k = 0; k < 6; k++) fg.wsegment(pts[k], pts[k + 1], 0.07 * (1 - k / 7), (f + k) % 3 ? L.fern : L.fern2);
    }
    if (rnd(i, 9, 52) < 0.25) fg.wellipsoid([x + 0.2, y0 + size * 0.35, z], [0.09, 0.09, 0.09], rnd(i, 10, 52) < 0.5 ? L.flower : L.flower2);
  }
  addLit(st, 'ferns', fg, 0.08, { cast: false, receive: true });

  // cut-stone path and pillars (some toppled), at finer voxels
  const ps = new VoxelGrid(0.1);
  fillBox(ps, [-2.1, -0.6, FACE_Z + 2], [2.1, 0.2, 6], (x, y, z) => {
    const top = 0.02 * Math.sin(x * 2 + z) - Math.max(0, -z - 20) * 0.0; if (y > top || y < top - 0.4) return 0;
    const bx = Math.floor((x + 2.1 + (Math.floor(z / 0.8) % 2) * 0.4) / 0.8), bz = Math.floor(z / 0.8);
    const gap = ((x + 2.1 + (Math.floor(z / 0.8) % 2) * 0.4) % 0.8) < 0.1 || (((z % 0.8) + 0.8) % 0.8) < 0.1;
    if (gap && y > top - 0.1) return noise2(x, z, 43) > 0.5 ? L.moss : 0;
    const n = rnd(bx, bz, 44); return n < 0.33 ? L.stone : n < 0.66 ? L.stone2 : L.stone3;
  });
  for (let i = 0; i < 6; i++) for (const side of [-1, 1]) {
    const z = 0 - i * 5.5, x = side * 3.3, gy = ground(x, z), toppled = rnd(i, side + 5, 45) < 0.3, hgt = 3 + rnd(i, side + 9, 45) * 2.5;
    if (toppled) { ps.wbox([x - 0.4, gy, z - 0.4], [x + 0.4 + side * hgt, gy + 0.8, z + 0.4], L.stone2); continue; }
    ps.wbox([x - 0.42, gy - 0.3, z - 0.42], [x + 0.42, gy + hgt, z + 0.42], rnd(i, side, 46) < 0.5 ? L.stone : L.stone3);
    ps.wbox([x - 0.55, gy + hgt, z - 0.55], [x + 0.55, gy + hgt + 0.3, z + 0.55], L.stone2);
    ps.wbox([x - 0.56, gy + hgt + 0.3, z - 0.56], [x + 0.56, gy + hgt + 0.36, z + 0.56], L.moss);
    for (let k = 0; k < 6; k++) ps.wbox([x - 0.43, gy + 0.6 * k + 0.25, z + 0.42], [x + 0.43, gy + 0.6 * k + 0.29, z + 0.44], L.stoneDark); // carved rings
  }
  addLit(st, 'path + pillars', ps, 0.06);

  // the monkey face, carved from one mass of stone; its open mouth is the door
  const f = new VoxelGrid(0.2);
  const C = [0, 7.2 * K, FACE_Z - 1.5 * K];
  fillBox(f, [-11 * K, -0.5, FACE_Z - 9 * K], [11 * K, 17 * K, FACE_Z + 3.5 * K], (wx, wy, wz) => {
    const x = wx / K, y = wy / K, z = FACE_Z + (wz - FACE_Z) / K; // design in unit space, scaled by K
    const dx = x, dy = y - 7.2, dz = z - (FACE_Z - 1.5);
    const head = (dx / 7.5) ** 2 + (dy / 7.6) ** 2 + (dz / 5) ** 2 < 1;
    const base = Math.abs(x) < 8.5 && y < 3.5 && z > FACE_Z - 8 && z < FACE_Z + 1.2;
    const brow = ((dx / 6.4) ** 2 + ((y - 9.6) / 1.1) ** 2 + ((z - (FACE_Z + 2.4)) / 1.4) ** 2 < 1);
    const muzzle = ((dx / 3.9) ** 2 + ((y - 4.6) / 2.6) ** 2 + ((z - (FACE_Z + 2.2)) / 1.8) ** 2 < 1);
    const ears = [-1, 1].some((sx) => ((x - sx * 7.6) / 1.6) ** 2 + ((y - 8.4) / 2.2) ** 2 + ((z - (FACE_Z - 1)) / 0.9) ** 2 < 1);
    const crown = false;
    if (!(head || base || brow || muzzle || ears || crown)) return 0;
    // carve: eye sockets, nostrils, the mouth doorway (a real opening)
    if ([-1, 1].some((sx) => ((x - sx * 2.3) / 1.3) ** 2 + ((y - 8.3) / 1.05) ** 2 < 1) && z > FACE_Z + 0.4) return z < FACE_Z + 0.9 ? L.shadowVoid : 0; // deep sockets
    if ([-1, 1].some((sx) => ((x - sx * 0.7) / 0.35) ** 2 + ((y - 5.4) / 0.3) ** 2 < 1) && z > FACE_Z + 3.1) return 0;
    const mouth = (x / 2.3) ** 2 + ((y - 0.2) / 3.4) ** 2 < 1 && y > 0;
    if (mouth && z > FACE_Z - 6) return z < FACE_Z - 5.4 ? L.shadowVoid : 0;
    const top = y > 3 && rnd(Math.round(x * 5), Math.round(y * 5), Math.round(z * 5)) < 0.12 + 0.5 * Math.max(0, fbm(x / 3, z / 3, 2, 47) - 0.55);
    if (top) return L.moss;
    if (muzzle || brow) return rnd(Math.round(x * 5), Math.round(y * 5), Math.round(z * 5)) < 0.5 ? L.stone3 : L.stone; // pale face mask
    const band = Math.floor(y / 0.6 + fbm(x / 4, z / 4, 2, 48) * 1.5) % 3;
    return band === 0 ? L.stone2 : band === 1 ? L.stoneDark : L.stone2; // darker head
  });
  // eye glints deep in the sockets, vines over the brow
  const eg = new VoxelGrid(0.12);
  for (const sx of [-1, 1]) eg.wellipsoid([sx * 2.3 * K, 8.25 * K, FACE_Z + 1.0 * K], [0.32 * K, 0.26 * K, 0.1], L.glyph); // a gold glint deep in each eye
  addGlow(st, 'eye glints', eg, 1.6);
  for (let i = 0; i < 18; i++) { if (Math.abs(-6 + i * 0.7) < 4) continue; const x = (-6 + i * 0.7 + rnd(i, 1, 49) * 0.3) * K, len = (1.5 + rnd(i, 2, 49) * 4) * K; f.wsegment([x, 10.6 * K, FACE_Z + 2.9 * K], [x + (rnd(i, 3, 49) - 0.5), 10.6 * K - len, FACE_Z + 3.3 * K], 0.14, rnd(i, 4, 49) < 0.5 ? L.jungle : L.jungle3); }
  addLit(st, 'monkey face', f, 0.07);

  aimSun(st, new THREE.Vector3(0, 4, -18), sunDir, 32);
  st.camera.fov = 70; st.camera.updateProjectionMatrix();
  st.camera.position.set(0.3, 1.55, 4);
  st.camera.lookAt(0, 6.5 * K, FACE_Z);
  fpBars(st);
  return st;
}
