// Watershed valley heightfield. Grid x = across the valley, y = downstream (y = 0 is the spring, high y is the sea).
// Units: 1 cell = 1 unit horizontally, heights in the same units. Sea level is 0.

export const NX = 96;
export const NY = 144;
export const SEA = 0;
/** Bedrock: erosion never cuts below this. */
export const FLOOR = -8;

export interface Terrain {
  nx: number; ny: number;
  h: Float32Array;      // current height
  h0: Float32Array;     // height at the start of the ride (for carved/deposited maps)
  hard: Float32Array;   // erodibility multiplier, 1 = soft soil, ~0.2 = rock
  coastY: number;       // first row (roughly) below sea level along the valley floor
  /** Rows where the rock ridges cross the valley (lakes form behind them until they're cut). */
  ridges: number[];
}

const fract = (v: number) => v - Math.floor(v);
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Deterministic integer hash → [0,1). */
export function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth(fract(x)), fy = smooth(fract(y));
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy) * 2 - 1;
}

/** Fractal value noise in about [-1, 1]. */
export function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < octaves; o++) { s += amp * valueNoise(x * f, y * f, seed + o * 101); norm += amp; amp *= 0.5; f *= 2; }
  return s / norm;
}

export function makeTerrain(seed: number, nx = NX, ny = NY): Terrain {
  const h = new Float32Array(nx * ny), hard = new Float32Array(nx * ny);
  const phase = hash2(seed, 7, 3) * Math.PI * 2;
  const ridges = [Math.round(ny * 0.3), Math.round(ny * 0.55)];
  const coastT = 0.78;
  for (let j = 0; j < ny; j++) {
    const t = j / (ny - 1);
    const along = 30 * Math.pow(1 - t, 1.5) - 4 * t;
    const cx = nx / 2 + 6 * Math.sin(j * 0.05 + phase) + 4 * Math.sin(j * 0.11 + phase * 2);
    const landK = 1 - smooth(clamp01((t - (coastT - 0.12)) / 0.17)); // valley walls fade out at the coast
    for (let i = 0; i < nx; i++) {
      const d = Math.abs(i - cx) / (nx / 2);
      const walls = (12 * (1 - 0.6 * t) * Math.pow(d, 1.5) + 6 * Math.pow(Math.max(0, d - 0.75) / 0.25, 2)) * landK;
      let ridge = 0, rock = 0;
      for (const r of ridges) {
        const g = Math.exp(-((j - r) ** 2) / 10);
        ridge += 3 * g; rock = Math.max(rock, g);
      }
      const n = fbm(i * 0.07, j * 0.07, seed) * 3 * (1 - 0.6 * t) * (0.3 + 0.7 * landK);
      const k = j * nx + i;
      h[k] = along + walls + n + ridge * landK;
      const soil = 0.65 + 0.35 * clamp01(fbm(i * 0.11, j * 0.11, seed + 999) + 0.5);
      hard[k] = soil * (1 - 0.8 * rock * landK);
    }
  }
  // Spring basin: a gentle bowl at the head of the valley so water collects before it runs.
  for (let j = 0; j < 10; j++) for (let i = 0; i < nx; i++) {
    const d = Math.hypot((i - nx / 2) / 14, j / 8);
    if (d < 1) h[j * nx + i] -= 2.5 * (1 - d * d);
  }
  return { nx, ny, h, h0: h.slice(), hard, coastY: Math.round(coastT * (ny - 1)), ridges };
}

/** Bilinear sample of a grid field at fractional cell coordinates (clamped to the grid). */
export function sample(f: Float32Array, nx: number, ny: number, x: number, y: number): number {
  const cx = Math.min(nx - 1.001, Math.max(0, x)), cy = Math.min(ny - 1.001, Math.max(0, y));
  const i = Math.floor(cx), j = Math.floor(cy), fx = cx - i, fy = cy - j, k = j * nx + i;
  const a = f[k], b = f[k + 1], c = f[k + nx], d = f[k + nx + 1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
