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
  /** Notches in the ridges: where the river can break through (carving one decides the route). */
  saddles: Array<{ ridge: number; x: number; depth: number }>;
  /** A lake basin between the ridges and a side basin on the floodplain (for fields and the village). */
  lake: { x: number; y: number; r: number };
  side: { x: number; y: number; r: number };
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
  const rnd = (k: number) => hash2(seed, k, 911);
  const phase = rnd(1) * Math.PI * 2;
  const coastT = 0.79;
  const ridges = [Math.round(ny * 0.28), Math.round(ny * 0.55)];
  // two or three saddles per ridge at different x and depths; the deepest is the "easy" route, the others need carving
  const saddles: Terrain['saddles'] = [];
  ridges.forEach((r, ri) => {
    const xs = ri === 0 ? [0.27, 0.52, 0.76] : [0.36, 0.68];
    xs.forEach((fx, k) => saddles.push({ ridge: r, x: Math.round(nx * (fx + (rnd(10 + ri * 5 + k) - 0.5) * 0.08)), depth: 0.55 + 0.35 * rnd(20 + ri * 5 + k) }));
  });
  const lakeLeft = rnd(3) < 0.5;
  const lake = { x: Math.round(nx * (lakeLeft ? 0.36 : 0.64)), y: Math.round(ny * 0.42), r: 10 };
  const side = { x: Math.round(nx * (lakeLeft ? 0.74 : 0.26)), y: Math.round(ny * 0.69), r: 9 };
  for (let j = 0; j < ny; j++) {
    const t = j / (ny - 1);
    const along = 24 * Math.pow(1 - t, 1.4) - 3.5 * t + (t < 0.1 ? 10 * Math.pow(1 - t / 0.1, 2) : 0);
    const cx = nx / 2 + 6 * Math.sin(j * 0.045 + phase);
    const landK = 1 - smooth(clamp01((t - (coastT - 0.1)) / 0.16));
    // a gentle cross-tilt that changes sign down the valley: the river has more than one natural path
    const tilt = 2.2 * Math.sin(j * 0.06 + phase * 1.7);
    for (let i = 0; i < nx; i++) {
      const d = Math.abs(i - cx) / (nx / 2);
      const wall = Math.pow(smooth(clamp01((d - 0.55) / 0.45)), 1.3) * (16 - 6 * t) * landK;
      let ridge = 0, rock = 0;
      for (let ri = 0; ri < ridges.length; ri++) {
        const g = Math.exp(-((j - ridges[ri]) ** 2) / 12);
        if (g < 0.01) continue;
        let notch = 0;
        for (const sd of saddles) if (sd.ridge === ridges[ri]) notch = Math.max(notch, sd.depth * Math.exp(-(((i - sd.x) / 4.5) ** 2)));
        ridge += 4.5 * g * (1 - notch); rock = Math.max(rock, g * (1 - 0.5 * notch));
      }
      const basin = (b: { x: number; y: number; r: number }, depth: number) => {
        const q = Math.hypot(i - b.x, (j - b.y) * 1.2) / b.r;
        return q < 1 ? -depth * (1 - q * q) : 0;
      };
      const n = fbm(i * 0.08, j * 0.08, seed) * 1.4 * (0.4 + 0.6 * landK) + fbm(i * 0.03, j * 0.03, seed + 7) * 1.2;
      const k = j * nx + i;
      h[k] = along + wall + n + (ridge + tilt * ((i - cx) / (nx / 2))) * landK + basin(lake, 2.2) + basin(side, 1.4);
      const soil = 0.7 + 0.3 * clamp01(fbm(i * 0.11, j * 0.11, seed + 999) + 0.5);
      hard[k] = soil * (1 - 0.8 * rock * landK);
    }
  }
  // spring basin at the head of the valley
  for (let j = 0; j < 10; j++) for (let i = 0; i < nx; i++) {
    const d = Math.hypot((i - nx / 2) / 18, j / 8);
    if (d < 1) h[j * nx + i] -= 2.2 * (1 - d * d);
  }
  return { nx, ny, h, h0: h.slice(), hard, coastY: Math.round(coastT * (ny - 1)), ridges, saddles, lake, side };
}

/** Bilinear sample of a grid field at fractional cell coordinates (clamped to the grid). */
export function sample(f: Float32Array, nx: number, ny: number, x: number, y: number): number {
  const cx = Math.min(nx - 1.001, Math.max(0, x)), cy = Math.min(ny - 1.001, Math.max(0, y));
  const i = Math.floor(cx), j = Math.floor(cy), fx = cx - i, fy = cy - j, k = j * nx + i;
  const a = f[k], b = f[k + 1], c = f[k + nx], d = f[k + nx + 1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
