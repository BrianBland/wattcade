// The cel-shaded city: procedural facades, districts, trees, street furniture, canal water, boats, tram stops.
// Everything static is merged per 100 m chunk into ONE vertex-coloured toon mesh + ONE ink-hull mesh (+ props batch),
// so the whole map is a few dozen draw calls and three.js frustum-culls whole chunks. Render-only, deterministic.
import * as THREE from 'three';
import { HEDGES, KICKERS, TREES, BOATS, CANAL, CORE_BUILDINGS, FOOTBRIDGES, GEN_BLOCKS, HALF, HALFPIPE, hash, heightAt, LINES, nearestOnLine, BOWL, BOWL2, TRAM_ROUTES, buildingAt, PARKED_BIKES, PLAZA, type Block, type Box } from '../sim/world';
import { TRAM } from '../sim/trams';
import { bench, celShadow, INK, JSR, lamp, planter, tree } from './jsr';
import { bakeInPlace, toonVC } from './bake';

// calm natural palette
export const PAL = {
  brick: [0xa8573d, 0xb5683f, 0x8a5a44, 0x9e4f3a], stone: [0xc9a77c, 0xd3b48a, 0xe2d6bb, 0xbfae92], plaster: [0xe8dcc2, 0xd9c7a3, 0xc8cdb6, 0xe3cfb0],
  roof: [0x8e4a34, 0x6f5a52, 0x5e6669, 0x9a5b3e], trim: 0xf1e8d4, glass: 0x4b5a63, wood: 0x6b4a33, door: [0x5b6e5a, 0x7a3e2e, 0x3f5568, 0x6b4a33],
  awning: [[0x7d8a72, 0xe9dcc0], [0xa8573d, 0xe9dcc0], [0x5f7381, 0xe9dcc0], [0xc29a5b, 0xf1e8d4]], leaf: [0x8fa77a, 0x3f6b45, 0x6c8a5a, 0x7e9a63], flower: [0xd98a8a, 0xe8c25a, 0xf1e8d4, 0xb87fa8],
};
const C = new THREE.Color();

/** Geometry collector: boxes / prisms with a per-vertex colour, optional ink hull. */
class Batch {
  body: number[] = []; col: number[] = []; ink: number[] = [];
  private tri(arr: number[], v: number[][], c?: number) {
    for (const p of v) arr.push(p[0], p[1], p[2]);
    if (c !== undefined) { C.setHex(c); for (let i = 0; i < v.length; i++) this.col.push(C.r, C.g, C.b); }
  }
  /** Axis box centred (x,z), bottom at y; optional rotation about y. */
  box(x: number, y: number, z: number, w: number, h: number, d: number, c: number, ink = 0, ry = 0) {
    const put = (arr: number[], W: number, H: number, D: number, y0: number, colr?: number) => {
      const cs = Math.cos(ry), sn = Math.sin(ry);
      const P = (sx: number, sy: number, sz: number) => { const lx = (sx * W) / 2, lz = (sz * D) / 2; return [x + lx * cs + lz * sn, y0 + (sy > 0 ? H : 0), z - lx * sn + lz * cs]; };
      const f = (a: number[], b: number[], cc: number[], dd: number[]) => this.tri(arr, [a, b, cc, a, cc, dd], colr);
      const p = [P(-1, -1, -1), P(1, -1, -1), P(1, 1, -1), P(-1, 1, -1), P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)];
      f(p[0], p[3], p[2], p[1]); f(p[4], p[5], p[6], p[7]); f(p[0], p[4], p[7], p[3]); f(p[1], p[2], p[6], p[5]); f(p[3], p[7], p[6], p[2]); f(p[0], p[1], p[5], p[4]);
    };
    put(this.body, w, h, d, y, c);
    if (ink) put(this.ink, w + ink * 2, h + ink * 2, d + ink * 2, y - ink);
  }
  /** Raw triangles (body only, no ink). */
  tris(v: number[][], c: number) { this.tri(this.body, v, c); }
  /** Gable roof: ridge along local x (length L), span D, rise H, sitting at y. */
  gable(x: number, y: number, z: number, L: number, D: number, H: number, c: number, ink = 0, ry = 0) {
    const put = (arr: number[], l: number, d: number, hh: number, y0: number, colr?: number) => {
      const cs = Math.cos(ry), sn = Math.sin(ry);
      const P = (lx: number, ly: number, lz: number) => [x + lx * cs + lz * sn, y0 + ly, z - lx * sn + lz * cs];
      const a = P(-l / 2, 0, -d / 2), b = P(l / 2, 0, -d / 2), c2 = P(l / 2, 0, d / 2), e = P(-l / 2, 0, d / 2), r0 = P(-l / 2, hh, 0), r1 = P(l / 2, hh, 0);
      this.tri(arr, [a, r0, r1, a, r1, b, e, c2, r1, e, r1, r0, a, e, r0, b, r1, c2, a, b, c2, a, c2, e], colr);
    };
    put(this.body, L, D, H, y, c);
    if (ink) put(this.ink, L + ink * 2, D + ink * 2, H + ink * 1.5, y - ink);
  }
  meshes(): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    if (this.body.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.body, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3)); g.computeVertexNormals();
      out.push(new THREE.Mesh(g, toonVC()));
    }
    if (this.ink.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.ink, 3)); g.computeVertexNormals(); out.push(new THREE.Mesh(g, INK)); }
    return out;
  }
}

const pick = <T,>(a: T[], h: number) => a[Math.floor(h * a.length) % a.length];
const baseY = (b: Box) => Math.min(heightAt(b.x0, b.z0), heightAt(b.x1, b.z0), heightAt(b.x0, b.z1), heightAt(b.x1, b.z1), 0);

/** One facade face: windows (frame + glass), flower boxes, balconies. Face runs along local x at z-offset, normal sn. */
function facade(B: Batch, cx: number, cz: number, y0: number, w: number, h: number, depthHalf: number, ry: number, seed: number, opts: { shop: boolean; door: boolean; stoop: boolean }) {
  const cs = Math.cos(ry), sn = Math.sin(ry);
  const at = (lx: number, lz: number) => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs] as const;
  const floors = Math.max(1, Math.floor(h / 3.2)), bays = Math.max(1, Math.floor(w / 2.6)), bw = w / bays;
  const n = depthHalf; // face plane offset
  for (let f = 0; f < floors; f++) for (let b = 0; b < bays; b++) {
    const lx = -w / 2 + bw * (b + 0.5), y = y0 + f * 3.2 + 1.0, hs = hash(seed + f * 7.1, b * 3.3);
    if (f === 0 && opts.door && b === Math.floor(bays / 2)) { // front door + stoop
      const [x, z] = at(lx, n + 0.05); B.box(x, y0, z, 1.2, 2.3, 0.2, PAL.trim, 0, ry);
      const [x2, z2] = at(lx, n + 0.12); B.box(x2, y0, z2, 0.95, 2.1, 0.12, pick(PAL.door, hs), 0, ry);
      if (opts.stoop) for (let s = 0; s < 3; s++) { const [x3, z3] = at(lx, n + 0.4 + s * 0.35); B.box(x3, y0 - 0.02, z3, 1.8, 0.45 - s * 0.15, 0.4, 0xbfae92, 0.03, ry); }
      continue;
    }
    if (f === 0 && opts.shop) { // shopfront: wide glass + awning stripes
      const [x, z] = at(lx, n + 0.06); B.box(x, y0 + 0.3, z, bw * 0.86, 2.4, 0.14, PAL.trim, 0, ry);
      const [x1, z1] = at(lx, n + 0.12); B.box(x1, y0 + 0.45, z1, bw * 0.74, 2.0, 0.1, PAL.glass, 0, ry);
      const aw = pick(PAL.awning, hash(seed, 9)), k = 4;
      for (let i = 0; i < k; i++) { const [x2, z2] = at(lx - bw * 0.45 + (bw * 0.9 * (i + 0.5)) / k, n + 0.7); B.box(x2, y0 + 2.75, z2, (bw * 0.9) / k, 0.14, 1.3, aw[i % 2], 0, ry); }
      continue;
    }
    const [x, z] = at(lx, n + 0.06); B.box(x, y, z, 1.25, 1.75, 0.12, PAL.trim, 0, ry);
    const [x1, z1] = at(lx, n + 0.1); B.box(x1, y + 0.12, z1, 0.95, 1.45, 0.1, PAL.glass, 0, ry);
    const [x4, z4] = at(lx, n + 0.12); B.box(x4, y + 0.8, z4, 0.95, 0.08, 0.06, PAL.trim, 0, ry); // mullion
    if (f > 0 && hs < 0.22) { // balcony
      const [bx, bz] = at(lx, n + 0.55); B.box(bx, y - 0.2, bz, 1.9, 0.15, 1.0, 0xbfae92, 0.03, ry);
      const [rx, rz] = at(lx, n + 1.0); B.box(rx, y + 0.75, rz, 1.9, 0.07, 0.07, 0x3d3a36, 0, ry);
      for (let i = 0; i < 5; i++) { const [px, pz] = at(lx - 0.9 + i * 0.45, n + 1.0); B.box(px, y - 0.05, pz, 0.05, 0.8, 0.05, 0x3d3a36, 0, ry); }
    } else if (hs > 0.7) { // flower box
      const [fx, fz] = at(lx, n + 0.3); B.box(fx, y - 0.25, fz, 1.2, 0.3, 0.35, 0x9a5b3e, 0.02, ry);
      for (let i = 0; i < 4; i++) { const [px, pz] = at(lx - 0.45 + i * 0.3, n + 0.3); B.box(px, y + 0.05, pz, 0.2, 0.18, 0.2, i % 2 ? pick(PAL.flower, hs + i * 0.17) : 0x6c8a5a, 0, ry); }
    }
  }
}

/** A single house/building volume with roof + four dressed faces. ry = 0 means front faces +z. */
function house(B: Batch, cx: number, cz: number, y0: number, w: number, d: number, h: number, seed: number, ry: number, kind: 'row' | 'shop' | 'tower' | 'villa') {
  const hs = hash(seed, 1.7);
  const wall = kind === 'tower' ? pick([...PAL.stone, ...PAL.plaster], hs) : kind === 'villa' ? pick(PAL.plaster, hs) : pick([...PAL.brick, ...PAL.stone, PAL.plaster[0]], hs);
  const cs = Math.cos(ry), sn = Math.sin(ry);
  B.box(cx, y0 - 2, cz, w, h + 2, d, wall, 0.05, ry); // sunk 2 m so slopes never show a gap
  B.box(cx, y0 + h - 0.35, cz, w + 0.25, 0.35, d + 0.25, PAL.trim, 0, ry); // cornice
  B.box(cx, y0 - 0.1, cz, w + 0.1, 0.7, d + 0.1, 0x8f8579, 0, ry); // plinth
  const shop = kind === 'shop' || (kind === 'tower' && hash(seed, 4) < 0.7);
  facade(B, cx, cz, y0, w, h, d / 2, ry, seed, { shop, door: kind !== 'tower' || !shop, stoop: kind === 'row' });
  facade(B, cx, cz, y0, w, h, d / 2, ry + Math.PI, seed + 50, { shop: false, door: kind === 'tower', stoop: false });
  if (kind === 'tower' || kind === 'villa') { facade(B, cx, cz, y0, d, h, w / 2, ry + Math.PI / 2, seed + 90, { shop: false, door: false, stoop: false }); facade(B, cx, cz, y0, d, h, w / 2, ry - Math.PI / 2, seed + 130, { shop: false, door: false, stoop: false }); }
  const top = y0 + h;
  if (kind !== 'tower' && hash(seed, 2.2) < 0.72) { // pitched roof + chimney
    const rise = Math.min(3.2, d * 0.32), col = pick(PAL.roof, hash(seed, 3));
    B.gable(cx, top, cz, w + 0.4, d + 0.8, rise, col, 0.06, ry);
    const lx = (hash(seed, 5) - 0.5) * w * 0.6, lz = -d * 0.18;
    B.box(cx + lx * cs + lz * sn, top + rise * 0.3, cz - lx * sn + lz * cs, 0.7, rise * 0.9 + 0.6, 0.7, pick(PAL.brick, hash(seed, 6)), 0.04, ry);
    if (hash(seed, 7) < 0.4) { const dz = d * 0.22; B.box(cx + dz * sn, top + rise * 0.15, cz + dz * cs, 1.2, 1.1, 1.0, wall, 0.03, ry); B.gable(cx + dz * sn, top + rise * 0.15 + 1.1, cz + dz * cs, 1.0, 1.5, 0.6, col, 0.03, ry + Math.PI / 2); } // dormer
  } else { // flat roof: parapet + rooftop garden
    B.box(cx, top, cz, w, 0.6, d, 0x8f8579, 0.04, ry);
    if (hash(seed, 8) < 0.7) {
      const gw = w * 0.6, gd = d * 0.5;
      B.box(cx, top + 0.6, cz, gw, 0.5, gd, 0x6b4a33, 0.03, ry); B.box(cx, top + 1.1, cz, gw - 0.2, 0.08, gd - 0.2, 0x7e9a63, 0, ry);
      for (let i = 0; i < 3; i++) { const lx = (i - 1) * gw * 0.3; B.box(cx + lx * cs, top + 1.15, cz - lx * sn, 0.9, 0.9, 0.9, pick(PAL.leaf, hash(seed, i)), 0.04, ry + i); }
    }
  }
}

function dressBlock(B: Batch, b: Block) {
  const y0 = baseY(b), W = b.x1 - b.x0, D = b.z1 - b.z0, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  if (b.kind === 'stall') { // market stall: counter, posts, striped canopy, crates
    const aw = pick(PAL.awning, hash(b.seed));
    B.box(cx, y0, cz, W, 1.0, D, 0x8a6a4a, 0.04);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(cx + (sx * W) / 2.1, y0, cz + (sz * D) / 2.1, 0.12, 2.6, 0.12, PAL.wood);
    for (let i = 0; i < 6; i++) B.gable(cx - W / 2 + (W * (i + 0.5)) / 6, y0 + 2.6, cz, W / 6, D + 0.8, 0.8, aw[i % 2], 0, 0);
    for (let i = 0; i < 4; i++) B.box(cx - W * 0.35 + i * W * 0.23, y0 + 1.0, cz + D * 0.25, 0.6, 0.35, 0.5, pick([0xd98a5a, 0xe8c25a, 0x8fa77a, 0xb5543a], hash(b.seed, i)), 0.02);
    return;
  }
  if (b.kind === 'villa') { house(B, cx, cz, y0, W, D, b.h, b.seed, 0, 'villa'); return; }
  // rowhouses / shops: subdivide along x into narrow houses with varied height, colour, roof
  let x = b.x0, k = 0;
  while (x < b.x1 - 0.1) {
    const seed = b.seed * 100 + k++, w = Math.min(b.x1 - x, 6 + Math.floor(hash(seed) * 4) * 1.0);
    const hh = Math.max(7, b.h + Math.round((hash(seed, 2) - 0.5) * 5));
    house(B, x + w / 2, cz, y0, w - 0.05, D, hh, seed, b.front > 0 ? 0 : Math.PI, b.kind === 'shops' ? 'shop' : 'row');
    x += w;
  }
}

function towerBlock(B: Batch, b: Box, i: number) {
  const y0 = baseY(b), W = b.x1 - b.x0, D = b.z1 - b.z0;
  house(B, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, y0, W, D, b.h, 900 + i * 13, 0, 'tower');
}

const nearLine = (x: number, z: number, r: number, kinds = ['path', 'tram', 'rail', 'ramp']) => LINES.some((l) => kinds.includes(l.kind) && nearestOnLine(l, x, z).d < r);
const inCanal = (z: number, pad = 0) => z > CANAL.z0 - pad && z < CANAL.z1 + pad;

export class CelWorld {
  readonly group = new THREE.Group();
  readonly water: THREE.Mesh;
  private waterU = { uT: { value: 0 }, uDeep: { value: new THREE.Color(0x3f6f78) }, uLite: { value: new THREE.Color(0x8fb7b0) }, uFoam: { value: new THREE.Color(0xeef0e2) }, uZ0: { value: CANAL.z0 }, uZ1: { value: CANAL.z1 } };
  chunks = 0;

  constructor() {
    const chunk = new Map<string, Batch>(), props = new Map<string, THREE.Group>();
    const key = (x: number, z: number) => `${Math.floor(x / 100)},${Math.floor(z / 100)}`;
    const B = (x: number, z: number) => { const k = key(x, z); let b = chunk.get(k); if (!b) { b = new Batch(); chunk.set(k, b); } return b; };
    const Pg = (x: number, z: number) => { const k = key(x, z); let g = props.get(k); if (!g) { g = new THREE.Group(); props.set(k, g); } return g; };
    const put = (o: THREE.Object3D, x: number, z: number, ry = 0) => { o.position.set(x, heightAt(x, z), z); o.rotation.y = ry; Pg(x, z).add(o); };

    CORE_BUILDINGS.forEach((b, i) => towerBlock(B((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2), b, i));
    for (const b of GEN_BLOCKS) dressBlock(B((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2), b);

    // canal: stone quay walls + coping, footbridges, moored boats
    for (let x = CANAL.xWest; x < HALF; x += 10) for (const [z, s] of [[CANAL.z0, 1], [CANAL.z1, -1]] as const) {
      if (x + 5 > -9.5 && x + 5 < 9.5) continue;
      const bb = B(x + 5, z); bb.box(x + 5, -CANAL.depth, z + s * 0.3, 10, CANAL.depth - 0.05, 0.6, 0x9b8c78); bb.box(x + 5, -0.05, z - s * 0.2, 10, 0.25, 0.9, 0xd8c29a, 0.03);
      for (const sx of [-1, 1]) if (FOOTBRIDGES.some((f) => Math.abs(x + 5 + sx * 2.5 - f.x) < 4)) continue; // (railings below)
    }
    for (const f of FOOTBRIDGES) {
      const bb = B(f.x, CANAL.z0), L = CANAL.z1 - CANAL.z0 + 2, cz = (CANAL.z0 + CANAL.z1) / 2;
      bb.box(f.x, -0.35, cz, f.hw * 2, 0.35, L, 0x8a6a4a, 0.04);
      for (const sx of [-1, 1]) { bb.box(f.x + sx * f.hw, 0, cz, 0.12, 1.0, L, 0x3d3a36); for (let i = 0; i <= 8; i++) bb.box(f.x + sx * f.hw, 0, CANAL.z0 - 1 + (L * i) / 8, 0.14, 1.0, 0.14, 0x3d3a36); }
      for (const z of [CANAL.z0 + 3, CANAL.z1 - 3]) bb.box(f.x, -CANAL.depth, z, 1.2, CANAL.depth - 0.35, 1.2, 0x9b8c78, 0.04);
    }
    for (const bt of BOATS) {
      const bb = B(bt.x, bt.z), hs = hash(bt.seed, 11), y = -1.0;
      bb.box(bt.x, y - 0.4, bt.z, bt.len, 0.9, 2.2, pick([0x5f7381, 0x7a3e2e, 0x3f6b45, 0xe2d6bb], hs), 0.05);
      bb.gable(bt.x + bt.len / 2 + 0.6, y - 0.4, bt.z, 1.4, 2.0, 0.85, pick([0x5f7381, 0x7a3e2e, 0x3f6b45, 0xe2d6bb], hs), 0.04, Math.PI / 2); // prow
      bb.box(bt.x, y + 0.5, bt.z, bt.len, 0.12, 2.3, PAL.trim);
      bb.box(bt.x - bt.len * 0.15, y + 0.5, bt.z, bt.len * 0.45, 1.2, 1.6, 0xe9dcc0, 0.04); bb.gable(bt.x - bt.len * 0.15, y + 1.7, bt.z, bt.len * 0.47, 1.8, 0.4, 0x6f5a52, 0.03);
      for (let i = 0; i < 3; i++) bb.box(bt.x - bt.len * 0.3 + i * bt.len * 0.15, y + 1.0, bt.z + 0.81, 0.5, 0.4, 0.04, PAL.glass);
      if (hs > 0.5) for (let i = 0; i < 3; i++) bb.box(bt.x + bt.len * 0.25 + i * 0.5, y + 0.6, bt.z, 0.35, 0.35, 0.35, pick(PAL.flower, hash(bt.seed, i)), 0.02);
    }
    // tram stops: platform, shelter, sign
    for (const r of TRAM_ROUTES) for (const sx of r.stops) {
      const z = r.z + 3.4, bb = B(sx, z), y = heightAt(sx, z);
      bb.box(sx, y, z, 12, 0.3, 2.6, 0xd8c29a, 0.03);
      bb.box(sx, y + 0.3, z + 1.0, 4.5, 2.4, 0.08, 0x9fb7b5); // glass back
      for (const px of [-2.2, 2.2]) bb.box(sx + px, y + 0.3, z + 1.0, 0.12, 2.5, 0.12, 0x3d3a36);
      bb.box(sx, y + 2.8, z + 0.6, 5, 0.18, 1.6, 0x5f7381, 0.04);
      bb.box(sx + 3.4, y + 0.3, z - 0.6, 0.1, 2.6, 0.1, 0x3d3a36); bb.box(sx + 3.4, y + 2.9, z - 0.6, 0.8, 0.8, 0.12, 0x3f6b45, 0.03);
      put(bench(), sx - 1, z + 0.4, Math.PI);
    }
    // tram overhead wire poles
    for (const r of TRAM_ROUTES) for (let x = r.x0; x <= r.x1; x += 30) { const z = r.z - 3.2, bb = B(x, z), y = heightAt(x, z); bb.box(x, y, z, 0.18, 6.2, 0.18, 0x4f5a5e, 0.03); bb.box(x, y + 6, z + 1.8, 0.1, 0.1, 3.8, 0x4f5a5e); }
    for (const r of TRAM_ROUTES) { const L = r.x1 - r.x0; for (let i = 0; i < Math.ceil(L / 50); i++) { const x = r.x0 + i * 50 + 25, bb = B(x, r.z); bb.box(x, heightAt(x, r.z) + 5.9, r.z, 50, 0.04, 0.04, 0x2f2a26); } }

    // trees / hedges / grass / lamps / benches / bike racks (deterministic scatter)
    for (const tr of TREES) if (tr.seed >= 0) { const t = tree(tr.seed); t.scale.setScalar(tr.s); put(t, tr.x, tr.z, hash(tr.seed, 4) * 6); } // same list the sim collides with
    // kickers: slatted wooden wedges following the sim's height profile
    for (const k of KICKERS) {
      const fx = Math.sin(k.dir), fz = Math.cos(k.dir), rx = fz, rz = -fx, bb = B(k.x, k.z), N = 8;
      const at = (along: number, side: number, up = 0.12) => { const x = k.x + fx * along + rx * side, z = k.z + fz * along + rz * side; return [x, heightAt(x, z) + up, z]; };
      for (let i = 0; i < N; i++) {
        const a0 = (k.len * i) / N, a1 = (k.len * (i + 1)) / N, c = i % 2 ? 0x9a7a55 : 0xa9875e;
        const p = [at(a0, -k.w / 2), at(a1, -k.w / 2), at(a1, k.w / 2), at(a0, k.w / 2)];
        bb.tris([p[0], p[2], p[1], p[0], p[3], p[2]], c); bb.tris([p[0], p[1], p[2], p[0], p[2], p[3]], c);
      }
      const lip = [at(k.len, -k.w / 2), at(k.len, k.w / 2), at(k.len, k.w / 2, 0.12 - k.h), at(k.len, -k.w / 2, 0.12 - k.h)];
      bb.box((lip[0][0] + lip[1][0]) / 2, heightAt(k.x + fx * k.len, k.z + fz * k.len) + 0.02, (lip[0][2] + lip[1][2]) / 2, k.w + 0.2, 0.14, 0.25, 0x5c4a3a, 0.03, k.dir); // steel lip
    }
    // grind rails: steel bar on posts (stoops, quays, market, hillside)
    for (const l of LINES) if (l.kind === 'rail' && l.id >= 29) for (let i = 0; i < l.pts.length - 1; i++) {
      const [ax, az] = l.pts[i], [bx, bz] = l.pts[i + 1], L = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az), n = Math.max(1, Math.round(L / 6));
      for (let k = 0; k < n; k++) {
        const x0 = ax + ((bx - ax) * k) / n, z0 = az + ((bz - az) * k) / n, x1 = ax + ((bx - ax) * (k + 1)) / n, z1 = az + ((bz - az) * (k + 1)) / n, bb = B(x0, z0);
        const y0 = heightAt(x0, z0), y1 = heightAt(x1, z1);
        bb.box(x0, y0, z0, 0.1, 0.5, 0.1, 0x4f5a5e, 0.025);
        bb.box((x0 + x1) / 2, (y0 + y1) / 2 + 0.45, (z0 + z1) / 2, 0.09, 0.09, L / n, 0xb8bcb4, 0.025, ry);
      }
    }
    for (let i = 0; i < 900; i++) { // grass tufts (no ink)
      const x = (hash(i, 21) * 2 - 1) * (HALF - 4), z = (hash(i, 22) * 2 - 1) * (HALF - 4);
      if (buildingAt(x, z) || inCanal(z, 1) || nearLine(x, z, 2.5)) continue;
      const bb = B(x, z), y = heightAt(x, z), c = pick(PAL.leaf, hash(i, 23));
      for (let k = 0; k < 3; k++) bb.box(x + (k - 1) * 0.18, y, z + (k % 2) * 0.15, 0.08, 0.35 + hash(i, k) * 0.3, 0.08, c, 0, k);
    }
    // hedges (solid in the sim: HEDGES)
    for (const h of HEDGES) { const x = (h.x0 + h.x1) / 2, z = (h.z0 + h.z1) / 2, bb = B(x, z); bb.box(x, h.y0 ?? 0, z, h.x1 - h.x0, 1.1, h.z1 - h.z0, 0x4f7a4c, 0.05); bb.box(x, (h.y0 ?? 0) + 1.1, z, h.x1 - h.x0 - 0.4, 0.25, h.z1 - h.z0 - 0.3, 0x6c8a5a); }
    // street lamps + benches along paths
    for (const l of LINES) if (l.kind === 'path' && l.id >= 8) for (let i = 0; i < l.pts.length - 1; i++) {
      const [ax, az] = l.pts[i], [bx, bz] = l.pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.floor(L / 26), nx = (bz - az) / L, nz = -(bx - ax) / L;
      for (let k = 1; k < n; k++) {
        const x = ax + ((bx - ax) * k) / n + nx * 3.2, z = az + ((bz - az) * k) / n + nz * 3.2;
        if (buildingAt(x, z) || inCanal(z, 1) || LINES.some((o) => o !== l && nearestOnLine(o, x, z).d < 3)) continue;
        if (k % 2) put(lamp(), x, z, Math.atan2(-nx, -nz) + Math.PI / 2); else put(bench(), x, z, Math.atan2(nx, nz) + Math.PI);
      }
    }
    // bike racks by every parked-bike spot + market planters
    const rack = () => { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const u = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.05, 4, 10, Math.PI), new THREE.MeshToonMaterial({ color: 0x4f5a5e })); u.position.set((i - 1) * 0.8, 0, 0); u.rotation.y = Math.PI / 2; g.add(u); } g.add(celShadow(1.2, 0.8)); return g; };
    for (const pb of PARKED_BIKES) put(rack(), pb.x + 2, pb.z + 1.5, 0);
    for (const [x, z] of [[-30, -140], [30, -140], [-30, -160], [30, -160], [-100, 130], [100, 130], [150, -30]]) put(rack(), x, z, 0);
    [[-20, -143], [20, -143], [-20, -157], [20, -157]].forEach(([x, z], k) => put(planter([JSR.pink, JSR.cyan, JSR.violet, JSR.orange][k]), x, z));

    for (const [k, b] of chunk) { const g = new THREE.Group(); g.name = `chunk ${k}`; for (const m of b.meshes()) g.add(m); this.group.add(g); this.chunks++; }
    for (const g of props.values()) { bakeInPlace(g); this.group.add(g); }

    { // countryside backdrop beyond the map edge so wide shots never show a void
      const E = 1200, parts: THREE.BufferGeometry[] = [];
      for (const [cx, cz, w, d] of [[0, HALF + E / 2, 2 * (HALF + E), E], [0, -HALF - E / 2, 2 * (HALF + E), E], [HALF + E / 2, 0, E, 2 * HALF], [-HALF - E / 2, 0, E, 2 * HALF]]) {
        const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); g.translate(cx, -0.3, cz); parts.push(g);
      }
      const pos: number[] = []; for (const g of parts) { const a = g.toNonIndexed().attributes.position; for (let i = 0; i < a.count; i++) pos.push(a.getX(i), a.getY(i), a.getZ(i)); }
      const bgG = new THREE.BufferGeometry(); bgG.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bgG.computeVertexNormals();
      this.group.add(new THREE.Mesh(bgG, new THREE.MeshToonMaterial({ color: 0x86a070 })));
    }
    // toon water: banded ripples, foam at the quay walls
    const wg = new THREE.PlaneGeometry(HALF - CANAL.xWest, CANAL.z1 - CANAL.z0, 1, 1); wg.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(wg, new THREE.ShaderMaterial({
      uniforms: this.waterU, fog: false,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uT; uniform vec3 uDeep; uniform vec3 uLite; uniform vec3 uFoam; uniform float uZ0; uniform float uZ1; varying vec3 vW;
        void main(){
          float r = sin(vW.x * 0.35 + uT * 1.1 + sin(vW.z * 0.9 + uT * 0.7) * 1.6) + sin(vW.x * 0.11 - uT * 0.5 + vW.z * 0.4);
          float band = step(1.25, r);                                  // hard-edged toon ripple bands
          vec3 c = mix(uDeep, uLite, 0.35 + 0.65 * band * 0.6);
          float edge = min(vW.z - uZ0, uZ1 - vW.z);
          c = mix(c, uFoam, step(edge, 0.55 + 0.25 * sin(vW.x * 0.8 + uT * 2.0)));
          gl_FragColor = vec4(c, 1.0); }`,
    }));
    this.water.position.set((HALF + CANAL.xWest) / 2, -1.05, (CANAL.z0 + CANAL.z1) / 2);
    this.group.add(this.water);
  }
  update(t: number) { this.waterU.uT.value = t; }
}

/** Ground colours for the cel style (per vertex): paving on paths, rails grey, district greens, market cream, stone banks. */
export function groundColour(x: number, z: number, h: number): number {
  if (h < -CANAL.depth + 0.5) return 0x3f6f78;
  if (Math.hypot(x - BOWL.x, z - BOWL.z) < BOWL.r || Math.hypot(x - BOWL2.x, z - BOWL2.z) < BOWL2.r) return 0xbfb4a0;
  if (Math.abs(x - HALFPIPE.x) < HALFPIPE.w && z > HALFPIPE.z0 && z < HALFPIPE.z1) return 0xc4b8a2;
  for (const r of TRAM_ROUTES) if (Math.abs(z - r.z) < 2.2 && x > r.x0 - 4 && x < r.x1 + 4) return 0x8f8579;
  if (nearLine(x, z, 2.6, ['path'])) return z < -124 ? 0xdcc8a2 : z > 122 ? 0xa89a85 : 0xd3bf98;
  if (z < -124 && x > -122 && x < 124) return 0xe2d1ae; // market paving
  if (z > 122 && x > -122) return 0xb5a58c;            // old-town cobbles
  if (inCanal(z, 1.2)) return 0xcdb894;
  const n = hash(Math.floor(x / 6), Math.floor(z / 6));
  const greens = x < -126 ? [0x6c8a5a, 0x5f7f50, 0x7e9a63] : [0x8fa77a, 0x86a070, 0x9ab083];
  return h > 0.6 ? 0x7e9a63 : greens[Math.floor(n * 3)];
}

/** Cel tram: cream body with a sage band, rounded noses, window strip, roof gear, bogies. ~2 draw calls. */
export function buildTram(): THREE.Group {
  const B = new Batch(), L = TRAM.len, W = TRAM.w, H = TRAM.roof;
  B.box(0, 0.35, 0, L - 1.2, H - 0.55, W, 0xefe4c9, 0.06, Math.PI / 2);
  for (const s of [-1, 1]) { // tapered noses
    B.box(0, 0.35, s * (L / 2 - 0.45), 0.9, H - 0.8, W * 0.86, 0xefe4c9, 0.05, Math.PI / 2);
    B.box(0, 1.5, s * (L / 2 - 0.05), 0.12, 1.2, W * 0.7, PAL.glass, 0, Math.PI / 2);
    B.box(0, 0.6, s * (L / 2), 0.15, 0.25, W * 0.8, 0x3d3a36, 0, Math.PI / 2);
  }
  B.box(0, 0.75, 0, L - 1.1, 0.45, W + 0.04, 0x7d8a72, 0, Math.PI / 2); // sage band
  B.box(0, H - 0.5, 0, L - 1.1, 0.12, W + 0.04, 0xa8573d, 0, Math.PI / 2);
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) B.box(s * (W / 2 + 0.03), 1.45, -L / 2 + 1.6 + i * ((L - 3.2) / 5), 0.05, 1.1, 1.5, PAL.glass, 0);
  B.box(0, H - 0.2, 0, L - 2, 0.25, W - 0.5, 0x8f8579, 0.04, Math.PI / 2); // roof deck (surfable)
  B.box(0, H + 0.05, 1.5, 1.4, 0.3, 1.2, 0x4f5a5e, 0.03); // pantograph base
  B.box(0, H + 0.35, 1.5, 0.08, 1.4, 0.08, 0x3d3a36, 0, 0.5); B.box(0, H + 1.6, 1.0, 1.4, 0.08, 0.12, 0x3d3a36);
  for (const s of [-1, 1]) B.box(0, 0, s * (L / 2 - 2.6), W - 0.3, 0.45, 2.2, 0x3d3a36, 0.03);
  const g = new THREE.Group(); for (const m of B.meshes()) g.add(m);
  return g;
}
