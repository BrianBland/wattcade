// Island layout shared by sim (plot navigation) and renderer (terrain, placement). Pure math, no three.
// World axes: x to the right, z toward the default camera, y up. Sea level is y = 0.

export interface Plot { x: number; z: number; shore: boolean }

/** Building plots. Shore plots sit on the harbour beach; piers can only go there. */
export const PLOTS: Plot[] = [
  // harbour beach (piers run +z into the water)
  { x: -5, z: 14.5, shore: true }, { x: 4, z: 16, shore: true }, { x: 13, z: 15.5, shore: true }, { x: 21, z: 12.5, shore: true },
  // lower terrace
  { x: -11, z: 7.5, shore: false }, { x: -4.5, z: 8.5, shore: false }, { x: 1.5, z: 9.5, shore: false },
  { x: 7.5, z: 10, shore: false }, { x: 13.5, z: 9, shore: false }, { x: 19.5, z: 6, shore: false },
  // middle terrace
  { x: -13, z: 0.5, shore: false }, { x: -7, z: 2, shore: false }, { x: -1, z: 2.5, shore: false },
  { x: 5, z: 3, shore: false }, { x: 11, z: 2.5, shore: false }, { x: 17, z: -0.5, shore: false },
  // hilltop
  { x: -6, z: -6, shore: false }, { x: 0.5, z: -5, shore: false }, { x: 7, z: -5.5, shore: false }, { x: 13, z: -7, shore: false },
];
export const PLOT_COUNT = PLOTS.length;

export const LIGHTHOUSE = { x: -24, z: -3 };
export const HARBOUR = { x: 6, z: 17 };
/** Where ships wait when there is no pier (a mooring buoy in the harbour). */
export const MOORING = { x: 8, z: 24 };
export const PIER_LEN = 7;

const smooth = (e0: number, e1: number, x: number) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
function hash2(x: number, z: number) { let h = (x * 374761393 + z * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
/** Smooth value noise in [0,1]. */
export function noise2(x: number, z: number): number {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const TERRACE = 1.7;
/** Island height before plots are levelled. Terraced plateau, beach ring, rocky headland for the lighthouse. */
function rawHeight(x: number, z: number): number {
  const warp = (noise2(x * 0.09, z * 0.09) - 0.5) * 0.22 + (noise2(x * 0.3 + 7, z * 0.3) - 0.5) * 0.05;
  const d = Math.hypot((x - 3) / 31, (z + 1) / 20) + warp;
  const body = smooth(1.02, 0.7, d);                                       // 0 at coast .. 1 inland
  const hill = 2.6 * smooth(16, 4, Math.hypot(x - 3, z + 9));
  let h = body * 3.2 + hill;
  const tq = h / TERRACE, f = Math.floor(tq);
  h = (f + smooth(0.5, 1, tq - f)) * TERRACE;                              // terraces
  h += body * 0.5 - 0.5 + smooth(1.0, 1.25, d) * -3.5;                      // beach slope, sea floor
  const hd = Math.hypot(x - LIGHTHOUSE.x, (z - LIGHTHOUSE.z) * 1.15) + (noise2(x * 0.4, z * 0.4) - 0.5) * 2.2;
  const c = smooth(9.5, 6.5, hd);
  const cliff = 8.5 * c + 1.2 * smooth(6.5, 0, hd) - 6 * (1 - c);          // sheer headland, drops straight into the sea
  const n = smooth(7, 2, Math.hypot((x + 15) * 0.8, z + 2.5)) * smooth(1.15, 0.8, d);
  const neck = 3.4 * n - 6 * (1 - n);                                       // ridge joining headland to island
  return Math.max(h, cliff, neck);
}

const plotLevel = PLOTS.map((p) => Math.max(0.7, rawHeight(p.x, p.z)));
/** Terrain height with plots levelled into pads. */
export function islandHeight(x: number, z: number): number {
  let h = rawHeight(x, z);
  for (let i = 0; i < PLOTS.length; i++) {
    const p = PLOTS[i];
    const w = smooth(2.8, 1.6, Math.hypot(x - p.x, z - p.z));
    if (w > 0) h = h + (plotLevel[i] - h) * w;
  }
  return h;
}
export const plotHeight = (i: number) => plotLevel[i];
export const LIGHTHOUSE_Y = rawHeight(LIGHTHOUSE.x, LIGHTHOUSE.z);
