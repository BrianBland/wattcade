// Painted sprites for shells and blasts: the Fireball's molten ball and fire burst, the Mortar's iron shell, its
// flash, dust, gravel/shrapnel chunks and crater, and the flame puffs of trails and the Flamethrower's jet.
// Painted from noise at the same pixel density as the tower and alien art (baked large, drawn at or below 1:1 with
// smoothing), in the Fireball launcher's molten heat ramp (fireTex) and the road's earth tones, never as flat
// vector gradients. Pure: every generator fills an RGBA byte array (straight alpha), so it runs and tests in Node.
import { cells, fbm, heatColor } from './fireTex';

const TAU = Math.PI * 2;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => { const x = clamp01((v - a) / (b - a)); return x * x * (3 - 2 * x); };

export interface Sprite { w: number; h: number; data: Uint8ClampedArray }
const sprite = (w: number, h: number): Sprite => ({ w, h, data: new Uint8ClampedArray(w * h * 4) });
function put(s: Sprite, x: number, y: number, r: number, g: number, b: number, a: number) {
  const i = (y * s.w + x) * 4; s.data[i] = r; s.data[i + 1] = g; s.data[i + 2] = b; s.data[i + 3] = Math.round(clamp01(a) * 255);
}
const mix = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k);
/** Colour along a palette ramp, `l` in [0, 1], blended between neighbours. */
function ramp(pal: number[][], l: number): number[] {
  const f = clamp01(l) * (pal.length - 1), i = Math.min(pal.length - 2, Math.floor(f));
  return mix(pal[i], pal[i + 1], f - i);
}
/** Anti-aliased edge: 1 inside, 0 outside, over about one pixel (`px` = one pixel in the shape's units). */
const edge = (inside: number, px: number) => clamp01(0.5 + inside / px);

// ---------- Fireball ----------
/** Rolling frames of the molten ball, and its size in pixels. */
export const BALL_FRAMES = 8, BALL_S = 40;
/**
 * One frame of the Fireball in flight: a ball of dark molten crust split by white-hot cracks, like the launcher's
 * mouth, lit from the upper left and rolling as `phase` goes 0 → 1 (seamless loop).
 */
export function ballFrame(phase: number, seed = 1, S = BALL_S): Sprite {
  const out = sprite(S, S), R = S / 2 - 0.5;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const px = (x + 0.5 - S / 2) / R, py = (y + 0.5 - S / 2) / R, d = Math.hypot(px, py);
    if (d > 1 + 1.5 / R) continue;
    const dd = Math.min(d, 0.999);
    // Sphere mapping: the crack pattern rolls across the face and wraps after one loop.
    const z = Math.sqrt(1 - dd * dd), u = Math.atan2(px, z) / Math.PI + phase * 2, v = py;
    const uu = ((u % 2) + 2) % 2, [f1, f2] = cells(uu * 2.5, v * 2.4 + 3, seed), e = f2 - f1;
    const seam = 1 - smooth(0.02, 0.12, e), grain = fbm(uu * 9, v * 9 + 4, seed + 5, 3);
    const light = clamp01(0.55 + 0.45 * (-px * 0.6 - py * 0.7 + z * 0.5)); // hot side faces up-left
    const core = smooth(0.95, 0.1, Math.hypot(px + 0.2, py + 0.25));
    let heat = 0.16 + 0.2 * light + 0.62 * seam + 0.3 * core * (0.4 + 0.6 * seam) + (grain - 0.5) * 0.18;
    heat -= 0.14 * smooth(0.75, 1, dd); // the rim darkens to crust
    const [r, g, b] = heatColor(clamp01(heat));
    put(out, x, y, r, g, b, edge(1 - d, 1 / R));
  }
  return out;
}

/** Frames of the Fireball's impact burst and their size in pixels. */
export const BURST_FRAMES = 7, BURST_S = 112;
/** One frame (`i` of `n`) of a fire burst: a ragged ball of flame that swells, tears into tongues and cools to smoke. */
export function burstFrame(i: number, n = BURST_FRAMES, seed = 3, S = BURST_S): Sprite {
  const out = sprite(S, S), p = i / Math.max(1, n - 1), R = 0.4 + 0.55 * Math.sqrt(p);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const px = (x + 0.5) / S * 2 - 1, py = (y + 0.5) / S * 2 - 1, r = Math.hypot(px, py), d = r / R;
    // Noise drifts outward with the blast, so lumps of flame travel rather than shimmer in place.
    const a = Math.atan2(py, px), radial = fbm(Math.cos(a) * 1.6 + 5, Math.sin(a) * 1.6 + (r - p * 0.8) * 3.2, seed, 4);
    const n1 = radial + (fbm(px * 3 + 1, py * 3 - p, seed + 3, 4) - radial) * smooth(0.35, 0, r); // no pinch at the centre
    const fine = fbm(px * 7 + 3, py * 7 - p * 2, seed + 9, 3);
    const dens = 1 - d + (n1 - 0.5) * 0.9 + (fine - 0.5) * 0.25;
    if (dens <= -0.05) continue;
    // It burns through from the middle late on, leaving a broken ring of licks around a smoky heart.
    const hollow = smooth(0.4, 1, p) * smooth(0.55, 0.05, d) * 0.9;
    const heat = clamp01((0.2 + dens * 1.5) * (1 - 0.55 * p) - hollow);
    const soot = smooth(0.3, 0.9, p) * smooth(0.45, 0.12, heat);
    const alpha = Math.max(smooth(0.06, 0.2, heat), soot * smooth(0, 0.25, dens + 0.05) * 0.85) * edge(dens + 0.02, 0.03);
    if (alpha <= 0.01) continue;
    const [r0, g0, b0] = heatColor(Math.max(heat, 0.3)), c = mix([r0, g0, b0], mix([58, 42, 34], [34, 26, 22], fine), soot);
    put(out, x, y, c[0], c[1], c[2], alpha);
  }
  return out;
}

/** Flame puffs for trails and the Flamethrower's spray: soft lumpy blobs, white-hot to ox-blood, then soot. */
export const PUFF_HEATS = 8, PUFF_S = 24;
export function puffSprite(heat: number, seed = 7, S = PUFF_S): Sprite {
  const out = sprite(S, S), sootK = smooth(0.25, 0.05, heat);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const px = (x + 0.5) / S * 2 - 1, py = (y + 0.5) / S * 2 - 1, n = fbm(px * 2.5 + seed, py * 2.5, seed, 3);
    const d = Math.hypot(px, py) / (0.75 + 0.35 * (n - 0.5)), body = 1 - d;
    if (body <= -0.05) continue;
    const h = clamp01(heat * (0.55 + 0.6 * body) + (n - 0.5) * 0.2), [r, g, b] = heatColor(Math.max(h, 0.3));
    const c = mix([r, g, b], [56, 42, 36], sootK);
    put(out, x, y, c[0], c[1], c[2], edge(body, 0.09) * (sootK ? 0.75 : smooth(0.05, 0.3, h + 0.1)));
  }
  return out;
}

/** Frames of the Flamethrower's jet (a seamless flow loop) and its size: long along x, mouth at the left. */
export const JET_FRAMES = 12, JET_W = 200, JET_H = 100;
/** The jet's cel bands, coolest to hottest: a dark ember rim, then orange to a pale cream core (owner reference). */
export const JET_BANDS: number[][] = [[132, 38, 14], [212, 82, 20], [246, 138, 28], [255, 196, 64], [255, 240, 186]];
const SMOKE_DARK = [44, 40, 40], SMOKE_LIT = [86, 80, 78];
/**
 * One frame of the Flamethrower's jet, after the owner's reference: a thin pale stream at the mouth (left edge)
 * thickening into a whipping ribbon of liquid flame, shaded in crisp cel bands with pale swirl highlights and a dark
 * ember rim, its end rolling over and breaking into flame scraps and black smoke. The ribbon's whip and its swirls
 * travel outward as `phase` goes 0 → 1 (seamless loop: the whip moves one wavelength, the noise fields cross-fade).
 */
export function jetFrame(phase: number, seed = 3, W = JET_W, H = JET_H): Sprite {
  const out = sprite(W, H), D = 1.4;
  const field = (u: number, v: number, sd: number, oct = 3) => {
    const a = fbm(u - phase * D, v, sd, oct), b = fbm(u - (phase - 1) * D, v, sd, oct);
    return a * (1 - phase) + b * phase;
  };
  const bandAt = (h: number) => JET_BANDS[Math.max(0, Math.min(JET_BANDS.length - 1, Math.floor(h * JET_BANDS.length)))];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = (x + 0.5) / W, v = ((y + 0.5) / H) * 2 - 1;
    // The ribbon whips: a wave along it that grows toward the end and travels outward.
    const c = 0.2 * Math.pow(s, 1.6) * Math.sin(TAU * (s * 1.1 - phase)) - 0.04 * s * s;
    // noise fields roughly isotropic in pixels (the sprite is W/H = 2.5 wide)
    const n = field(s * 3.4, (v - c) * 3, seed), sw = field(s * 6.5, (v - c) * 3.2, seed + 9, 2), n3 = field(s * 11, (v - c) * 5.5, seed + 5, 2);
    // thin at the mouth, thickening, then billowing into a rounded rolling head
    const tip = 0.85 + (n - 0.5) * 0.08, capS = smooth(tip - 0.13, tip, s);
    const hw = (0.06 + 0.55 * Math.pow(s, 1.2)) * (1 + 0.5 * smooth(0.5, 0.76, s)) * (0.82 + 0.5 * (n - 0.5) * (0.4 + s)) * Math.sqrt(Math.max(0, 1 - capS * capS));
    // the head tears at its edge into scraps
    const tear = s > 0.55 ? smooth(0.55, 0.85, s) * (0.55 - n3) * 1.4 : 0;
    const body = 1 - Math.abs(v - c) / Math.max(hw, 1e-3) + Math.min(0, tear * 2) + Math.max(0, tear) * 0.3;
    // loose scraps of flame flung past the head
    const scrap = s > tip - 0.04 && s < 0.97 ? n3 - 0.64 - Math.abs(v - c) * 0.5 - (s - tip) * 1.5 : -1;
    // black smoke rolling off the head, to the outside of the whip
    const sv = v - c + 0.3 * s, sm = field(s * 9 + 11, sv * 4.5, seed + 23, 3);
    const smoke = s > 0.6 && s < 0.98 ? sm - 0.53 + smooth(0.6, 0.85, s) * 0.14 - Math.abs(sv) * 0.55 - smooth(0.9, 0.98, s) * 0.3 : -1;
    if ((body > -0.12 || scrap > -0.02) && s > 0.004) {
      const inScrap = body <= 0;
      const core = inScrap ? 0.3 : clamp01(body);
      let h = inScrap ? 0.3 + (n3 - 0.64) * 2 : core * 0.75 + (1 - s) * 0.45 + (n - 0.5) * 0.5 - 0.05;
      // swirl contours: pale curling highlight lines inside the ribbon
      if (!inScrap && Math.abs(((sw * 7) % 1) - 0.5) < 0.06 && core > 0.25) h += 0.3;
      if (!inScrap && body < 0.16) h = Math.min(h, 0.15); // the dark ember rim
      const col = bandAt(clamp01(h));
      const a = inScrap ? edge(scrap, 0.03) : edge(body, 2.4 / (Math.max(hw, 0.02) * H)) * smooth(0, 0.03, s);
      if (a > 0.01) { put(out, x, y, col[0], col[1], col[2], a); continue; }
    }
    if (smoke > 0) {
      const lit = smooth(0.02, 0.08, smoke) * smooth(0.25, -0.25, sv); // lit on the side away from the flame
      const col = mix(SMOKE_DARK, SMOKE_LIT, lit * 0.7);
      put(out, x, y, col[0], col[1], col[2], edge(smoke, 0.015) * 0.95);
    }
  }
  return out;
}

// ---------- Mortar ----------
/** The Mortar shell: a dull iron ball with a brass band and a soft highlight. */
export const SHELL_S = 22;
export function shellSprite(S = SHELL_S): Sprite {
  const out = sprite(S, S), R = S / 2 - 0.5;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const px = (x + 0.5 - S / 2) / R, py = (y + 0.5 - S / 2) / R, d = Math.hypot(px, py);
    if (d > 1 + 1.5 / R) continue;
    const grain = fbm(px * 6, py * 6, 3, 2), l = clamp01(0.5 - px * 0.35 - py * 0.45 - Math.min(d, 1) * 0.25 + (grain - 0.5) * 0.15);
    let c = mix([22, 23, 22], [132, 136, 122], l);
    const band = Math.abs(py + px * 0.25);
    if (band < 0.2) c = mix(c, mix([92, 64, 22], [220, 174, 78], l), smooth(0.2, 0.14, band)); // brass band
    c = mix(c, [240, 238, 220], smooth(0.32, 0.05, Math.hypot(px + 0.38, py + 0.42))); // highlight
    put(out, x, y, c[0], c[1], c[2], edge(1 - d, 1 / R));
  }
  return out;
}

/** Hazard-lamp ramp for the Mortar's flash: hot brown edges, amber, lemon, a white heart. */
const FLASH_RAMP = [[60, 34, 18], [150, 74, 22], [236, 142, 34], [246, 222, 84], [255, 250, 214]];
export const FLASH_FRAMES = 3, FLASH_S = 64;
/** One frame of the Mortar's detonation flash: a spiky star of light that swells and cools to amber (the dust takes over). */
export function flashFrame(i: number, n = FLASH_FRAMES, seed = 5, S = FLASH_S): Sprite {
  const out = sprite(S, S), p = i / n;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const px = (x + 0.5) / S * 2 - 1, py = (y + 0.5) / S * 2 - 1, a = Math.atan2(py, px), d = Math.hypot(px, py);
    const spikes = 0.55 + 0.45 * Math.pow(Math.abs(Math.cos(a * 4 + seed)), 6) + 0.25 * (fbm(a * 2 + 9, p * 3, seed, 3) - 0.5);
    const tex = fbm(px * 6 + seed, py * 6, seed + 2, 3), reach = spikes * (0.55 + 0.45 * Math.sqrt(p)) * (0.85 + 0.3 * tex), h = (1 - d / reach) * (1.15 - 0.8 * p) + (tex - 0.5) * 0.25;
    if (h <= -0.02) continue;
    const c = ramp(FLASH_RAMP, h * 1.3);
    put(out, x, y, c[0], c[1], c[2], edge(h, 0.05));
  }
  return out;
}

/** Earth palette for gravel and the crater (the painted road's tans, browns and grey stone). */
export const EARTH = [[48, 36, 28], [86, 66, 48], [124, 98, 70], [160, 132, 98], [196, 172, 136]];
export const STONE = [[40, 40, 42], [82, 80, 78], [122, 118, 110], [176, 170, 158]];
/** Dust is greyer than the road, so a puff reads against the tan dirt instead of melting into it. */
const DUST = [[66, 56, 48], [100, 88, 76], [138, 124, 106], [178, 166, 146]];
export const DUST_S = 56;
/** A dust puff: a lumpy cloud lit from above, thinning to a soft ragged edge. */
export function dustSprite(seed: number, S = DUST_S): Sprite {
  const out = sprite(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const px = (x + 0.5) / S * 2 - 1, py = (y + 0.5) / S * 2 - 1;
    const n = fbm(px * 2.2 + seed, py * 2.2, seed + 11, 4), d = Math.hypot(px, py * 1.1) / (0.72 + 0.4 * (n - 0.5));
    const dens = smooth(1, 0.4, d) * (0.75 + 0.5 * fbm(px * 6, py * 6, seed + 13, 2));
    if (dens <= 0.02) continue;
    const c = ramp(DUST, 0.5 - py * 0.45 - px * 0.15 + (n - 0.5) * 0.7);
    put(out, x, y, c[0], c[1], c[2], Math.min(1, dens * 1.3));
  }
  return out;
}

/** Thrown debris: rough stones (`gravel`) and dark torn metal (`shrapnel`), lit top-left, a few pixels to a dozen across. */
export function chunkSprite(seed: number, kind: 'gravel' | 'shrapnel'): Sprite {
  const h1 = (k: number) => { let h = (seed * 2654435761 + k * 40503) | 0; h = Math.imul(h ^ (h >>> 15), 2246822519); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };
  const metal = kind === 'shrapnel', w = metal ? 5 + Math.floor(h1(1) * 6) : 6 + Math.floor(h1(1) * 9), hh = metal ? 3 + Math.floor(h1(2) * 4) : 5 + Math.floor(h1(2) * 6);
  const out = sprite(w, hh), pal = metal ? STONE : (h1(3) < 0.5 ? EARTH : STONE), rot = h1(4) * Math.PI;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    const px = (x + 0.5) / w * 2 - 1, py = (y + 0.5) / hh * 2 - 1, a = Math.atan2(py, px);
    // Lumpy (stone) or jagged (metal) outline.
    const rim = metal ? 0.7 + 0.3 * Math.abs(Math.sin(a * 3 + rot)) : 0.82 + 0.18 * Math.sin(a * 2 + rot) + 0.1 * (fbm(Math.cos(a) * 2 + seed, Math.sin(a) * 2, seed, 2) - 0.5);
    const inside = rim - Math.hypot(px, py);
    if (inside <= -0.15) continue;
    const lit = clamp01(0.55 - px * 0.3 - py * 0.4 + (fbm(px * 3 + seed, py * 3, seed + 2, 2) - 0.5) * 0.5);
    const c = ramp(pal, metal ? lit * 0.85 + 0.05 : lit);
    put(out, x, y, c[0], c[1], c[2], edge(inside, 2 / Math.min(w, hh)));
  }
  return out;
}

export const CRATER_S = 112;
/** The Mortar's crater: a dark scorched pit, a broken rim of lit earth and stones, thrown dirt fading around it. */
export function craterSprite(seed: number, S = CRATER_S): Sprite {
  const out = sprite(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const px = (x + 0.5) / S * 2 - 1, py = (y + 0.5) / S * 2 - 1, n = fbm(px * 3 + seed, py * 3, seed + 31, 4);
    const d = Math.hypot(px, py) / (0.82 + 0.3 * (n - 0.5)), grain = fbm(px * 14, py * 14, seed + 51, 3);
    if (d > 1) continue;
    let c: number[], a = 1;
    if (d < 0.44) c = mix(mix(EARTH[0], [22, 16, 12], smooth(0.44, 0.1, d)), EARTH[1], (grain - 0.5) * 0.6); // pit, scorched
    else if (d < 0.6) { // rim: far wall in shadow, near lip catching the light
      const lip = smooth(-0.3, 0.3, py) * (0.6 + 0.4 * grain);
      c = ramp(EARTH, 0.2 + 0.7 * lip);
    } else { // thrown dirt and a few stones, thinning out
      const dirt = smooth(0.45 + d * 0.3, 0.6 + d * 0.3, n + grain * 0.25), stone = smooth(0.7, 0.76, fbm(px * 10, py * 10, seed + 41, 2)) * (1 - d);
      a = Math.max(dirt * smooth(1, 0.7, d), stone);
      c = stone > dirt ? ramp(STONE, 0.4 + 0.4 * grain) : ramp(EARTH, 0.35 + 0.5 * grain);
    }
    if (a > 0.01) put(out, x, y, c[0], c[1], c[2], a);
  }
  return out;
}
