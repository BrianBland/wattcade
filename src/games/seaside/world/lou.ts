// Lou: the bait-shop fisherman who turns up everywhere (never remarked on). One model, several finishes, so the
// silhouette (watch cap, white beard, big nose, pipe, oilskin bib) reads the same as a shopkeeper, a temple statue or a driver.
// Local metres, feet at the origin, facing +z. Built from the waist up (he's always behind something).
import { VoxelGrid } from '../voxel/grid';
import { definePalette } from '../voxel/palette';
import { hash2 } from '../voxel/noise';

export const LOU = definePalette({
  skin: 0xc98f6b, skin2: 0xb57a58, rosy: 0xdc7f68, eye: 0x1b1b1b, beard: 0xf3f0ea, beard2: 0xe3ded4, beard3: 0xd6d0c4,
  cap: 0xd8372f, cap2: 0xbf2c26, sweater: 0x2a3550, sweater2: 0x35426a, bib: 0xf2c21b, bib2: 0xe0ae12, button: 0x3a3a3a,
  pipe: 0x6b3f22, pipe2: 0x4a2a16, ember: 0xff7a2a, gold: 0xe8b93a,
  stone: 0xa59e8c, stone2: 0x958e7d, stone3: 0xb8b19f, stoneDark: 0x6f695c, moss: 0x6f8f3a, moss2: 0x5d7a2f,
});
const L = LOU.idx;
type Finish = 'live' | 'stone';
type Pose = 'counter' | 'wheel';

export function buildLou(opts: { finish?: Finish; pose?: Pose; scale?: number; voxel?: number } = {}): VoxelGrid {
  const finish = opts.finish ?? 'live', k = opts.scale ?? 1;
  const g = new VoxelGrid(opts.voxel ?? 0.02);
  const P = (x: number, y: number, z: number) => [x * k, y * k, z * k];
  const R = (x: number, y: number, z: number) => [x * k, y * k, z * k];
  // stone finish: keep the shapes, swap paint for weathered stone with moss in the hollows
  const paint = (c: number, x: number, y: number, z: number) => {
    if (finish === 'live') return c;
    const r = hash2(x * 7 + y, z, 21);
    if (c === L.eye || c === L.pipe2 || c === L.button || c === L.cap2) return L.stoneDark;
    if (y * g.size < 1.1 * k && r < 0.25) return r < 0.12 ? L.moss : L.moss2;
    if (c === L.beard || c === L.beard2 || c === L.beard3) return r < 0.6 ? L.stone3 : L.stone;
    if (c === L.cap || c === L.sweater || c === L.sweater2) return r < 0.7 ? L.stone2 : L.stoneDark;
    if (c === L.rosy || c === L.pipe) return L.stone2;
    return r < 0.5 ? L.stone : L.stone3;
  };
  const ell = (c: readonly number[], r: readonly number[], col: number | ((x: number, y: number, z: number) => number)) =>
    g.wellipsoid(c, r, (x, y, z) => paint(typeof col === 'number' ? col : col(x, y, z), x, y, z));
  const seg = (a: readonly number[], b: readonly number[], r: number, col: number) => {
    g.wsegment(a, b, r * k, finish === 'live' ? col : col === L.eye || col === L.pipe2 ? L.stoneDark : L.stone2);
  };
  const ly = (y: number) => y * g.size / k; // voxel index → local unscaled metres

  // torso: cable-knit sweater under a yellow oilskin bib with straps
  ell(P(0, 1.2, 0), R(0.26, 0.4, 0.16), (x, y, z) => {
    const wx = x * g.size / k, wy = ly(y), wz = z * g.size / k;
    const front = wz > 0.06;
    if (front && Math.abs(wx) < 0.16 && wy < 1.4) return wy > 1.36 ? L.bib2 : hash2(x >> 1, y >> 1, 4) < 0.5 ? L.bib : L.bib2;
    if (front && Math.abs(Math.abs(wx) - 0.11) < 0.028 && wy < 1.56) return L.bib;
    return Math.floor((wx + 1) / 0.05) % 3 === 0 ? L.sweater2 : L.sweater;
  });
  for (const s of [1, -1]) ell(P(s * 0.11, 1.385, 0.155), R(0.016, 0.016, 0.012), L.button);
  ell(P(0, 1.57, 0), R(0.1, 0.045, 0.1), L.sweater2); // roll neck

  // shoulders + arms
  for (const s of [1, -1]) {
    ell(P(s * 0.23, 1.47, 0), R(0.1, 0.09, 0.1), L.sweater);
    if ((opts.pose ?? 'counter') === 'counter') {
      seg(P(s * 0.27, 1.44, 0), P(s * 0.3, 1.1, 0.16), 0.065, L.sweater);
      seg(P(s * 0.3, 1.07, 0.16), P(s * 0.21, 1.05, 0.62), 0.055, L.sweater2);
      ell(P(s * 0.18, 1.05, 0.71), R(0.06, 0.04, 0.07), L.skin); // big weathered hands
    } else { // hands on a steering wheel in front of the chest
      seg(P(s * 0.27, 1.44, 0), P(s * 0.25, 1.2, 0.2), 0.06, L.sweater);
      seg(P(s * 0.25, 1.2, 0.2), P(s * 0.17, 1.33, 0.42), 0.05, L.sweater2);
      ell(P(s * 0.16, 1.34, 0.46), R(0.05, 0.05, 0.05), L.skin);
    }
  }

  // head: slightly oversized for readability
  const H = [0, 1.75, 0.01];
  ell(P(0, 1.62, 0), R(0.065, 0.06, 0.065), L.skin2); // neck
  ell(P(H[0], H[1], H[2]), R(0.13, 0.145, 0.125), L.skin);
  for (const s of [1, -1]) ell(P(s * 0.128, H[1] - 0.01, H[2]), R(0.025, 0.04, 0.025), L.skin2); // ears
  ell(P(-0.137, H[1] - 0.045, H[2] + 0.005), R(0.01, 0.014, 0.01), L.gold); // a single gold earring
  // red watch cap with a ribbed cuff
  ell(P(0, H[1] + 0.12, H[2] - 0.005), R(0.135, 0.105, 0.13), (_x, y) => (ly(y) < H[1] + 0.07 ? L.skin : L.cap));
  ell(P(0, H[1] + 0.085, H[2] - 0.005), R(0.142, 0.035, 0.137), (x) => (Math.floor((x * g.size / k + 1) / 0.03) % 2 ? L.cap : L.cap2));
  // white hair poking out under the cap at the back
  for (const s of [1, -1]) ell(P(s * 0.1, H[1] + 0.03, H[2] - 0.07), R(0.04, 0.04, 0.05), L.beard2);
  // the beard: full, white, jaw to chest
  ell(P(0, H[1] - 0.085, H[2] + 0.05), R(0.14, 0.13, 0.1), (x, y) => { const r = hash2(x, y, 9); return ly(y) > H[1] - 0.03 ? L.skin : r < 0.5 ? L.beard : r < 0.85 ? L.beard2 : L.beard3; });
  ell(P(0, H[1] - 0.14, H[2] + 0.07), R(0.1, 0.09, 0.08), (x, y) => (hash2(x, y, 10) < 0.6 ? L.beard : L.beard2));
  // walrus moustache
  ell(P(0, H[1] - 0.04, H[2] + 0.125), R(0.085, 0.026, 0.035), L.beard);
  for (const s of [1, -1]) ell(P(s * 0.07, H[1] - 0.06, H[2] + 0.11), R(0.03, 0.03, 0.03), L.beard2);
  // big rosy nose + cheeks
  ell(P(0, H[1] + 0.0, H[2] + 0.135), R(0.034, 0.04, 0.035), L.rosy);
  for (const s of [1, -1]) ell(P(s * 0.075, H[1] - 0.005, H[2] + 0.1), R(0.03, 0.022, 0.02), L.rosy);
  // squinting eyes under bushy white brows
  for (const s of [1, -1]) {
    seg(P(s * 0.03, H[1] + 0.04, H[2] + 0.122), P(s * 0.07, H[1] + 0.035, H[2] + 0.112), 0.007, L.eye);
    ell(P(s * 0.055, H[1] + 0.078, H[2] + 0.116), R(0.036, 0.013, 0.02), L.beard);
  }
  // corncob pipe from the corner of the mouth
  seg(P(0.04, H[1] - 0.07, H[2] + 0.13), P(0.105, H[1] - 0.085, H[2] + 0.215), 0.013, L.pipe2);
  ell(P(0.11, H[1] - 0.07, H[2] + 0.215), R(0.024, 0.032, 0.024), L.pipe);
  if (finish === 'live') g.wellipsoid(P(0.11, H[1] - 0.04, H[2] + 0.215), R(0.012, 0.006, 0.012), L.ember);
  return g;
}
