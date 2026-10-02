// Island layout shared by sim (plot navigation) and renderer (terrain, placement). Pure math, no three.
// World axes: x to the right, z toward the default camera, y up. Sea level is y = 0.

export type DistrictId = 'harbour' | 'hillside' | 'hilltop' | 'headland' | 'islet';
export interface Plot { x: number; z: number; shore: boolean; district: DistrictId }

const P = (district: DistrictId, shore: boolean, ...xz: number[]): Plot[] => {
  const out: Plot[] = [];
  for (let i = 0; i < xz.length; i += 2) out.push({ x: xz[i], z: xz[i + 1], shore, district });
  return out;
};
/** Building plots, grouped into districts that unlock over time. Shore plots sit on a beach; piers etc. run +z into the water. */
export const PLOTS: Plot[] = [
  ...P('harbour', true, -5, 14.5, 4, 16, 13, 15.5, 21, 12.5),
  ...P('harbour', false, -11, 7.5, -4.5, 8.5, 1.5, 9.5, 7.5, 10, 13.5, 9, 19.5, 6),
  ...P('hillside', false, -13, 0.5, -7, 2, -1, 2.5, 5, 3, 11, 2.5, 17, -0.5),
  ...P('hilltop', false, -6, -6, 0.5, -5, 7, -5.5, 13, -7),
  ...P('headland', false, -28.5, -6.5, -27.5, 1.5, -21, -8.5),
  ...P('islet', true, 46, 6, 54, 5.5),
  ...P('islet', false, 45, -1.5, 51, -2.5, 56.5, 0.5),
];
export const PLOT_COUNT = PLOTS.length;

export const LIGHTHOUSE = { x: -24, z: -3 };
export const HARBOUR = { x: 6, z: 17 };
/** Where ships wait when there is no pier (a mooring buoy in the harbour). */
export const MOORING = { x: 8, z: 24 };
export const PIER_LEN = 7;
/** Gull Rock, the islet to the east, joined by a bridge once unlocked. */
export const ISLET = { x: 50, z: 1, rx: 11, rz: 8 };
export const BRIDGE = { x0: 31, x1: 41.5, z: 1.5, y: 1.3 };

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
  // Gull Rock
  const di = Math.hypot((x - ISLET.x) / ISLET.rx, (z - ISLET.z) / ISLET.rz) + warp * 0.8;
  const b2 = smooth(1.02, 0.65, di);
  let h2 = b2 * 2.2 + 1.2 * smooth(6, 1, Math.hypot(x - 51, z + 1));
  const t2 = h2 / TERRACE, f2 = Math.floor(t2);
  h2 = (f2 + smooth(0.5, 1, t2 - f2)) * TERRACE + b2 * 0.5 - 0.5 + smooth(1.0, 1.25, di) * -3.5;
  return Math.max(h, cliff, neck, h2);
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
