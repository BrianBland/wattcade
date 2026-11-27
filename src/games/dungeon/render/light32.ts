// Stepped pixel lighting with walls that block light. Pure (no DOM): the renderer hands it a tile grid and lights in world
// pixels and gets back a half-resolution RGBA light buffer to multiply over the world canvas.
//
// Rules (from the art slice): ambient per zone, lights fall off as (1 - d/r)^2, the vertical distance counts 1.25x (3/4 view),
// brightness is snapped to steps of STEP with a 4x4 Bayer dither at each step's edge, and computed on 2x2 pixel blocks.
// A light reaches a floor tile only with a clear line of sight over the tile grid; a wall face only when the light stands in
// front of it (at or below its row) and can see the floor tile at its foot; wall tops only catch a dim spill.

export interface Light { x: number; y: number; r: number; c: readonly [number, number, number]; i: number }
export interface LightGrid { w: number; h: number; wall(x: number, y: number): boolean }
export const STEP = 0.17;
export const LIGHT_SCALE = 2;   // the buffer stores L / LIGHT_SCALE so lights can brighten up to 2x
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** Tiles within `rt` tiles of (lx, ly) (tile coords) that the light can see. */
export interface Los { x0: number; y0: number; n: number; m: Uint8Array }
export function lineOfSight(grid: LightGrid, lx: number, ly: number, rt: number): Los {
  const n = rt * 2 + 1, x0 = lx - rt, y0 = ly - rt, m = new Uint8Array(n * n);
  const sees = (tx: number, ty: number) => {
    // walk the grid from the light's tile to the target; any wall strictly between them blocks
    let x = lx, y = ly; const dx = Math.abs(tx - lx), dy = -Math.abs(ty - ly), sx = lx < tx ? 1 : -1, sy = ly < ty ? 1 : -1;
    let err = dx + dy;
    while (!(x === tx && y === ty)) {
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
      if (x === tx && y === ty) break;
      if (grid.wall(x, y)) return false;
    }
    return true;
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const tx = x0 + i, ty = y0 + j;
    if (tx < 0 || ty < 0 || tx >= grid.w || ty >= grid.h) continue;
    if ((tx - lx) ** 2 + (ty - ly) ** 2 > (rt + 0.5) ** 2) continue;
    if (grid.wall(tx, ty)) {
      // a wall face is lit when the light is in front of it and sees the floor at its foot
      if (!grid.wall(tx, ty + 1) && ly >= ty + 1 && sees(tx, ty + 1)) m[j * n + i] = 1;
    } else if (sees(tx, ty)) m[j * n + i] = 1;
  }
  return { x0, y0, n, m };
}
export const losAt = (l: Los, tx: number, ty: number) => {
  const i = tx - l.x0, j = ty - l.y0;
  return i >= 0 && j >= 0 && i < l.n && j < l.n ? l.m[j * l.n + i] === 1 : false;
};

/** Which tile's lighting a world pixel uses: a wall face's pixels rise `rise` px into the tile above it. */
export function surfaceAt(grid: LightGrid, px: number, py: number, ts: number, rise: number): { tx: number; ty: number; top: boolean } {
  const tx = Math.floor(px / ts), ty = Math.floor(py / ts);
  if (!grid.wall(tx, ty)) return { tx, ty, top: false };
  if (!grid.wall(tx, ty + 1)) return { tx, ty, top: false };                       // a face
  if (py - ty * ts >= ts - rise && !grid.wall(tx, ty + 2)) return { tx, ty: ty + 1, top: false };   // top part of the face below
  return { tx, ty, top: true };
}

export interface LightJob {
  grid: LightGrid; ts: number; rise: number;
  ox: number; oy: number; W: number; H: number;    // view origin and size in world px
  amb: readonly [number, number, number];
  lights: Array<Light & { los?: Los }>;   // no los: an open space, nothing occludes
}
/** Fill `out` (RGBA, ceil(W/2) x ceil(H/2)) with the stepped light level of each 2x2 block, divided by LIGHT_SCALE. */
let bits = new Uint8Array(0), accR = new Float32Array(0), accG = new Float32Array(0), accB = new Float32Array(0), surf = new Int32Array(0);
export function shade(job: LightJob, out: Uint8ClampedArray, stepped = true): void {
  const { grid, ts, rise, ox, oy, W, H, amb, lights } = job;
  const BW = Math.ceil(W / 2), BH = Math.ceil(H / 2), N = BW * BH;
  if (accR.length < N) { accR = new Float32Array(N); accG = new Float32Array(N); accB = new Float32Array(N); surf = new Int32Array(N * 3); }
  // pass 1: surface of each block (top-of-wall flag + the tile it shows) and the ambient term
  // tile wall bits for the view (bit0: wall, bit1: wall below, bit2: wall two below), so pass 1 allocates nothing
  const tx0 = Math.floor((ox + 1) / ts), ty0 = Math.floor((oy + 1) / ts), TW = Math.floor((ox + W) / ts) - tx0 + 2, TH = Math.floor((oy + H) / ts) - ty0 + 2;
  if (bits.length < TW * TH) bits = new Uint8Array(TW * TH);
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) { const x = tx0 + i, y = ty0 + j;
    bits[j * TW + i] = (grid.wall(x, y) ? 1 : 0) | (grid.wall(x, y + 1) ? 2 : 0) | (grid.wall(x, y + 2) ? 4 : 0); }
  for (let by = 0, n = 0; by < BH; by++) {
    const py = oy + by * 2 + 1, ty = Math.floor(py / ts), lowFace = py - ty * ts >= ts - rise, row = (ty - ty0) * TW - tx0;
    for (let bx = 0; bx < BW; bx++, n++) {
      const tx = Math.floor((ox + bx * 2 + 1) / ts), w = bits[row + tx];
      let top = 0, sy = ty;
      if ((w & 3) === 3) { if (lowFace && !(w & 4)) sy = ty + 1; else top = 1; }
      const m = top ? 0.8 : 1;
      surf[n * 3] = top; surf[n * 3 + 1] = tx; surf[n * 3 + 2] = sy;
      accR[n] = amb[0] * m; accG[n] = amb[1] * m; accB[n] = amb[2] * m;
    }
  }
  // pass 2: each light only touches the blocks inside its radius (cost scales with lit area, not lights x screen)
  for (const l of lights) {
    const rr = l.r * l.r, cr = l.c[0] / 255, cg = l.c[1] / 255, cb = l.c[2] / 255, ry = l.r / 1.25;
    const bx0 = Math.max(0, Math.floor((l.x - l.r - ox - 1) / 2)), bx1 = Math.min(BW - 1, Math.ceil((l.x + l.r - ox - 1) / 2));
    const by0 = Math.max(0, Math.floor((l.y - ry - oy - 1) / 2)), by1 = Math.min(BH - 1, Math.ceil((l.y + ry - oy - 1) / 2));
    for (let by = by0; by <= by1; by++) {
      const dy = (oy + by * 2 + 1 - l.y) * 1.25, dy2 = dy * dy; if (dy2 > rr) continue;
      for (let bx = bx0, n = by * BW + bx0; bx <= bx1; bx++, n++) {
        const dx = ox + bx * 2 + 1 - l.x, dd = dx * dx + dy2; if (dd > rr) continue;
        let k = 1;
        if (surf[n * 3]) k = 0.3; else if (l.los && !losAt(l.los, surf[n * 3 + 1], surf[n * 3 + 2])) continue;
        let f = 1 - Math.sqrt(dd) / l.r; f = f * f * 1.6 * k * l.i;
        accR[n] += cr * f; accG[n] += cg * f; accB[n] += cb * f;
      }
    }
  }
  // pass 3: stepped, dithered quantisation
  for (let by = 0, n = 0; by < BH; by++) for (let bx = 0; bx < BW; bx++, n++) {
    const r = accR[n], g = accG[n], b = accB[n], Lm = Math.max(r, g, b, 1e-3);
    let sc = 1;
    if (stepped) {
      const q = Lm / STEP; let base = Math.floor(q); const fr = q - base;
      if (fr > 0.7 && (fr - 0.7) / 0.3 > BAY[(by & 3) * 4 + (bx & 3)]) base++;
      sc = Math.max(1, base) * STEP / Lm;
    }
    const o = n * 4, k = 255 / LIGHT_SCALE * sc;
    out[o] = r * k; out[o + 1] = g * k; out[o + 2] = b * k; out[o + 3] = 255;
  }
}
