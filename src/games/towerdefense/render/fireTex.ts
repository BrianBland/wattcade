// Pixel textures for the burning ground, painted from noise so they sit with the game's painted art (the
// Fireball head's molten mouth, the kits' charred soil) instead of reading as flat vector shapes.
// Pure: every generator fills an RGBA byte array (straight alpha), so it runs and tests in Node.

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => { const x = clamp01((v - a) / (b - a)); return x * x * (3 - 2 * x); };
const ihash = (x: number, y: number, s: number) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Smooth value noise in [0, 1]. */
export function noise(x: number, y: number, s = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = ihash(xi, yi, s), b = ihash(xi + 1, yi, s), c = ihash(xi, yi + 1, s), d = ihash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Fractal noise, roughly [0, 1]. */
export function fbm(x: number, y: number, s = 0, octaves = 4): number {
  let sum = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < octaves; i++) { sum += amp * noise(x, y, s + i * 17); norm += amp; x = x * 2.03 + 11.7; y = y * 2.03 + 3.1; amp *= 0.5; }
  return sum / norm;
}
/** Cellular noise: distance to the nearest and second-nearest jittered feature point (cell units). */
export function cells(x: number, y: number, s = 0): [number, number] {
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j, px = cx + 0.15 + 0.7 * ihash(cx, cy, s), py = cy + 0.15 + 0.7 * ihash(cx, cy, s + 1);
    const d = Math.hypot(px - x, py - y);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return [f1, f2];
}

/** Fire colour for a heat in [0, 1]: smoky ox-blood edges, orange body, yellow, near-white core (the Fireball mouth's ramp). */
const RAMP: Array<[number, number, number, number, number]> = [ // heat, r, g, b, alpha
  [0.0, 70, 8, 2, 0], [0.12, 120, 18, 4, 0.55], [0.3, 205, 52, 8, 0.9], [0.5, 250, 112, 18, 1],
  [0.7, 255, 176, 46, 1], [0.86, 255, 222, 120, 1], [1, 255, 248, 214, 1],
];
export function heatColor(h: number): [number, number, number, number] {
  h = clamp01(h);
  for (let i = 1; i < RAMP.length; i++) {
    const a = RAMP[i - 1], b = RAMP[i];
    if (h <= b[0]) { const k = (h - a[0]) / (b[0] - a[0]); return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k, a[4] + (b[4] - a[4]) * k]; }
  }
  const e = RAMP[RAMP.length - 1]; return [e[1], e[2], e[3], e[4]];
}
function put(out: Uint8ClampedArray, i: number, r: number, g: number, b: number, a: number) {
  out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = a * 255;
}

/** Ground textures are square, S×S, centred on the burn. */
export const GROUND_S = 128;
/** Ragged disc mask in [0, 1]: 1 inside, feathering to 0 at a noisy edge. */
function blobMask(px: number, py: number, seed: number, reach = 0.5): number {
  const r = Math.hypot(px, py) / reach, edge = 0.78 + 0.32 * (fbm(px * 5 + 7, py * 5 + 3, seed + 90, 3) - 0.5) * 2;
  return smooth(edge, edge - 0.3, r);
}
/** Domain warp so crack cells come out irregular, not a honeycomb. */
function warp(px: number, py: number, seed: number): [number, number] {
  return [px + (fbm(px * 3, py * 3, seed + 21, 3) - 0.5) * 0.22, py + (fbm(px * 3 + 9, py * 3, seed + 23, 3) - 0.5) * 0.22];
}
/** Charred ground: grainy black-brown crust with cracks, ash flecks and a feathered soot halo (normal blend). */
export function crustTex(seed: number, S = GROUND_S): Uint8ClampedArray {
  const out = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const px = (x + 0.5) / S - 0.5, py = (y + 0.5) / S - 0.5, i = (y * S + x) * 4;
    const m = blobMask(px, py, seed), core = blobMask(px, py, seed + 3, 0.4);
    if (m <= 0.003) { put(out, i, 0, 0, 0, 0); continue; }
    const grain = fbm(px * 22, py * 22, seed + 5, 3), [wx, wy] = warp(px, py, seed), [f1, f2] = cells(wx * 11 + 4, wy * 11 + 4, seed + 7);
    const crack = 1 - smooth(0.015, 0.06, f2 - f1), ash = smooth(0.8, 0.86, fbm(px * 26 + 2, py * 26, seed + 9, 2)) * (1 - core);
    let l = 14 + 30 * grain; // charcoal
    l *= 1 - 0.6 * crack * core;
    const r = l + 10 * (1 - core) + 70 * ash, g = l * 0.78 + 4 * (1 - core) + 64 * ash, b = l * 0.62 + 58 * ash;
    put(out, i, r, g, b, Math.min(1, m * (0.7 + 0.3 * core) + 0.25 * crack * core * m));
  }
  return out;
}
/** Molten seams in the crust: glowing cracks and a hot heart, coloured by heat (drawn additively). */
export function veinTex(seed: number, S = GROUND_S): Uint8ClampedArray {
  const out = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const px = (x + 0.5) / S - 0.5, py = (y + 0.5) / S - 0.5, i = (y * S + x) * 4;
    const core = blobMask(px, py, seed + 3, 0.4);
    if (core <= 0.003) { put(out, i, 0, 0, 0, 0); continue; }
    const [wx, wy] = warp(px, py, seed), [f1, f2] = cells(wx * 11 + 4, wy * 11 + 4, seed + 7), e = f2 - f1;
    const centre = smooth(0.32, 0.0, Math.hypot(px, py)), var1 = fbm(px * 8, py * 8, seed + 11, 3);
    const live = smooth(0.38, 0.6, var1 + 0.3 * centre); // only some cracks run hot, more of them near the heart
    const seam = ((1 - smooth(0.0, 0.03, e)) + 0.45 * (1 - smooth(0.0, 0.1, e))) * live;
    const pool = centre * centre * 0.35 * (0.5 + var1);
    const heat = clamp01((seam * (0.55 + 0.5 * var1) + pool) * core);
    const [r, g, b] = heatColor(heat * 0.95);
    const a = smooth(0.08, 0.35, heat);
    put(out, i, r * a, g * a, b * a, a); // premultiplied-looking: additive layers want dark edges, not halos
  }
  return out;
}
