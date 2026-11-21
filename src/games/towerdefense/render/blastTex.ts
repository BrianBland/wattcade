// Pixel sprites for shells and blasts: the Fireball's molten ball and fire burst, the Mortar's iron shell, its
// flash, dust, gravel/shrapnel chunks and crater. Painted from noise in a few hard palette steps so, drawn with
// nearest-neighbour scaling, they read as pixel art beside the Flamethrower's pixel flare strips and the Fireball
// launcher's cracked molten mouth (fireTex's heat ramp), never as smooth vector gradients.
// Pure: every generator fills an RGBA byte array (straight alpha), so it runs and tests in Node.
import { cells, fbm, heatColor } from './fireTex';

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => { const x = clamp01((v - a) / (b - a)); return x * x * (3 - 2 * x); };
/** Snap a level in [0, 1] to `n` hard steps: the posterised look of hand-placed pixel art. */
export const steps = (v: number, n: number) => Math.round(clamp01(v) * n) / n;
/** 4×4 ordered dither threshold in (0, 1): feathered edges become stippled pixels instead of soft alpha. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const dither = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

export interface Sprite { w: number; h: number; data: Uint8ClampedArray }
const sprite = (w: number, h: number): Sprite => ({ w, h, data: new Uint8ClampedArray(w * h * 4) });
function put(s: Sprite, x: number, y: number, r: number, g: number, b: number, a: number) {
  const i = (y * s.w + x) * 4; s.data[i] = r; s.data[i + 1] = g; s.data[i + 2] = b; s.data[i + 3] = Math.round(clamp01(a) * 255);
}
const mix = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k);

// ---------- Fireball ----------
/** Rolling frames of the molten ball, and its texel size. */
export const BALL_FRAMES = 8, BALL_S = 13;
/**
 * One frame of the Fireball in flight: a ball of dark molten crust split by white-hot cracks, like the launcher's
 * mouth, lit from the upper left and rolling as `phase` goes 0 → 1 (seamless loop).
 */
export function ballFrame(phase: number, seed = 1, S = BALL_S): Sprite {
  const out = sprite(S, S), R = S / 2 - 0.4;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const px = (x + 0.5 - S / 2) / R, py = (y + 0.5 - S / 2) / R, d = Math.hypot(px, py);
    if (d > 1) continue;
    // Sphere mapping: the crack pattern rolls across the face and wraps after one loop.
    const z = Math.sqrt(1 - d * d), u = Math.atan2(px, z) / Math.PI + phase * 2, v = py;
    const wrap = (uu: number) => { const [f1, f2] = cells(((uu % 2) + 2) % 2 * 2.5, v * 2.4 + 3, seed); return f2 - f1; };
    const e = wrap(u), seam = 1 - smooth(0.04, 0.16, e);
    const light = clamp01(0.55 + 0.45 * (-px * 0.6 - py * 0.7 + z * 0.5)); // hot side faces up-left
    const core = smooth(0.95, 0.1, Math.hypot(px + 0.2, py + 0.25));
    let heat = 0.2 + 0.2 * light + 0.6 * seam + 0.3 * core * (0.4 + 0.6 * seam);
    heat -= 0.12 * smooth(0.75, 1, d); // the rim darkens to crust
    const [r, g, b] = heatColor(steps(clamp01(heat), 7));
    put(out, x, y, r, g, b, 1);
  }
  return out;
}

/** Frames of the Fireball's impact burst and their texel size. */
export const BURST_FRAMES = 7, BURST_S = 30;
/** One frame (`i` of `n`) of a fire burst: a ragged ball of flame that swells, tears into tongues and cools to smoke. */
export function burstFrame(i: number, n = BURST_FRAMES, seed = 3, S = BURST_S): Sprite {
  const out = sprite(S, S), p = i / Math.max(1, n - 1), R = 0.4 + 0.55 * Math.sqrt(p);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const px = (x + 0.5) / S * 2 - 1, py = (y + 0.5) / S * 2 - 1, r = Math.hypot(px, py), d = r / R;
    // Noise drifts outward with the blast, so lumps of flame travel rather than shimmer in place.
    const a = Math.atan2(py, px), n1 = fbm(Math.cos(a) * 1.6 + 5, Math.sin(a) * 1.6 + (r - p * 0.8) * 3.2, seed, 3);
    const dens = 1 - d + (n1 - 0.5) * 0.9;
    if (dens <= 0) continue;
    // It burns through from the middle late on, leaving a broken ring of licks around a smoky heart.
    const hollow = smooth(0.4, 1, p) * smooth(0.55, 0.05, d) * 0.9;
    const heat = steps(clamp01((0.2 + dens * 1.5) * (1 - 0.55 * p) - hollow), 7);
    const soot = smooth(0.3, 0.9, p) * smooth(0.45, 0.15, heat);
    if (heat < 0.12 && soot < 0.3) continue;
    if (soot > 0 && soot * 0.9 < dither(x, y) && heat < 0.2) continue; // thin smoke is stippled
    const [r0, g0, b0] = heatColor(Math.max(heat, 0.3)), c = mix([r0, g0, b0], [52, 38, 32], soot);
    put(out, x, y, c[0], c[1], c[2], 1);
  }
  return out;
}

// ---------- Mortar ----------
/** The Mortar shell: a dull iron ball with a brass band and one bright highlight. */
export function shellSprite(S = 7): Sprite {
  const out = sprite(S, S), R = S / 2 - 0.2;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const px = (x + 0.5 - S / 2) / R, py = (y + 0.5 - S / 2) / R, d = Math.hypot(px, py);
    if (d > 1) continue;
    const l = steps(clamp01(0.5 - px * 0.35 - py * 0.45 - d * 0.25), 4);
    let c = mix([26, 27, 26], [128, 132, 118], l);
    if (Math.abs(py + px * 0.25) < 0.17) c = mix([92, 64, 22], [214, 168, 72], l); // brass band
    put(out, x, y, c[0], c[1], c[2], 1);
  }
  put(out, Math.floor(S * 0.32), Math.floor(S * 0.28), 236, 236, 214, 1);
  return out;
}

/** Hazard-lamp ramp for the Mortar's flash: white, lemon, amber, then hot brown going out. */
const FLASH_RAMP = [[60, 34, 18], [150, 74, 22], [236, 142, 34], [246, 222, 84], [255, 250, 214]];
export const FLASH_FRAMES = 3, FLASH_S = 22;
/** One frame of the Mortar's detonation flash: a spiky star of hot pixels that swells and cools to amber (the dust takes over). */
export function flashFrame(i: number, n = FLASH_FRAMES, seed = 5, S = FLASH_S): Sprite {
  const out = sprite(S, S), p = i / n;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const px = (x + 0.5) / S * 2 - 1, py = (y + 0.5) / S * 2 - 1, a = Math.atan2(py, px), d = Math.hypot(px, py);
    const spikes = 0.55 + 0.45 * Math.pow(Math.abs(Math.cos(a * 4 + seed)), 6) + 0.25 * (fbm(a * 2 + 9, p * 3, seed, 2) - 0.5);
    const reach = spikes * (0.55 + 0.45 * Math.sqrt(p)), h = (1 - d / reach) * (1.15 - 0.8 * p);
    if (h <= 0.04) continue;
    const q = steps(clamp01(h * 1.3), FLASH_RAMP.length - 1), c = FLASH_RAMP[Math.round(q * (FLASH_RAMP.length - 1))];
    put(out, x, y, c[0], c[1], c[2], 1);
  }
  return out;
}

/** Earth palette for dust, gravel and the crater (the painted road's tans, browns and grey stone). */
export const EARTH = [[48, 36, 28], [86, 66, 48], [124, 98, 70], [160, 132, 98], [196, 172, 136]];
export const STONE = [[44, 44, 46], [82, 80, 78], [122, 118, 110], [168, 162, 150]];
/** Dust is greyer than the road, so a puff reads against the tan dirt instead of melting into it. */
const DUST = [[66, 56, 48], [100, 88, 76], [138, 124, 106], [178, 166, 146]];
export const DUST_S = 18;
/** A dust puff: a lumpy cloud lit from above, its feathered edge stippled with the dither pattern. */
export function dustSprite(seed: number, S = DUST_S): Sprite {
  const out = sprite(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const px = (x + 0.5) / S * 2 - 1, py = (y + 0.5) / S * 2 - 1;
    const n = fbm(px * 2.2 + seed, py * 2.2, seed + 11, 3), d = Math.hypot(px, py * 1.1) / (0.72 + 0.4 * (n - 0.5));
    const dens = smooth(1, 0.45, d);
    if (dens <= dither(x, y) * 0.9 + 0.05) continue;
    const l = steps(clamp01(0.5 - py * 0.45 - px * 0.15 + (n - 0.5) * 0.7), 3);
    const c = DUST[Math.round(l * 3)];
    put(out, x, y, c[0], c[1], c[2], 1);
  }
  return out;
}

/** Thrown debris: rough stones (`gravel`) and dark torn metal (`shrapnel`), each a few pixels, lit top-left. */
export function chunkSprite(seed: number, kind: 'gravel' | 'shrapnel'): Sprite {
  const h1 = (k: number) => { let h = (seed * 2654435761 + k * 40503) | 0; h = Math.imul(h ^ (h >>> 15), 2246822519); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };
  const w = kind === 'gravel' ? 2 + Math.floor(h1(1) * 4) : 1 + Math.floor(h1(1) * 3), hh = kind === 'gravel' ? 2 + Math.floor(h1(2) * 3) : 1 + Math.floor(h1(2) * 2);
  const out = sprite(w, hh), pal = kind === 'gravel' ? (h1(3) < 0.5 ? EARTH : STONE) : STONE;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    // Knock off a corner or two so stones aren't rectangles.
    const corner = (x === 0 || x === w - 1) && (y === 0 || y === hh - 1);
    if (corner && w > 2 && hh > 1 && h1(10 + x + y * 7) < 0.6) continue;
    const lit = (w - 1 - x) / Math.max(1, w - 1) * 0.5 + (hh - 1 - y) / Math.max(1, hh - 1) * 0.5;
    const idx = kind === 'shrapnel' ? Math.min(3, Math.round(lit * 2.4 + h1(20 + x) * 0.8)) : Math.min(pal.length - 1, Math.round(lit * (pal.length - 2) + h1(20 + x + y) * 1.2));
    const c = pal[idx];
    put(out, x, y, c[0], c[1], c[2], 1);
  }
  return out;
}

export const CRATER_S = 30;
/** The Mortar's crater: a dark scorched pit, a broken rim of lit earth and stones, flecks of thrown dirt around it. */
export function craterSprite(seed: number, S = CRATER_S): Sprite {
  const out = sprite(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const px = (x + 0.5) / S * 2 - 1, py = (y + 0.5) / S * 2 - 1, n = fbm(px * 3 + seed, py * 3, seed + 31, 3);
    const d = Math.hypot(px, py) / (0.82 + 0.3 * (n - 0.5));
    if (d > 1) continue;
    let c: number[] | null = null;
    if (d < 0.42) c = mix(EARTH[0], [22, 16, 12], smooth(0.42, 0.1, d)); // pit, scorched at the bottom
    else if (d < 0.58) c = py < 0 ? EARTH[1] : EARTH[3 + (n > 0.55 ? 1 : 0)]; // far wall shaded, near rim catches the light
    else if (n > 0.52 + d * 0.25 - dither(x, y) * 0.2) c = EARTH[n > 0.62 ? 3 : 2]; // thrown dirt, thinning out
    else if (fbm(px * 9, py * 9, seed + 41, 2) > 0.74 - 0.1 * (1 - d)) c = STONE[2]; // scattered stones
    if (c) put(out, x, y, c[0], c[1], c[2], 1);
  }
  return out;
}
