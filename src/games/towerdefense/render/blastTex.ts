// Painted flame puffs: the small soft licks at the Flamethrower's mouth, shell fuse sparks and smoke. Painted from
// noise in the Fireball launcher's molten heat ramp (fireTex), never as flat vector gradients. The big effects
// (shells, impacts, the Flamethrower's burst) are painted animation strips: see fxArt.ts.
// Pure: the generator fills an RGBA byte array (straight alpha), so it runs and tests in Node.
import { fbm, heatColor } from './fireTex';

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => { const x = clamp01((v - a) / (b - a)); return x * x * (3 - 2 * x); };

export interface Sprite { w: number; h: number; data: Uint8ClampedArray }
const sprite = (w: number, h: number): Sprite => ({ w, h, data: new Uint8ClampedArray(w * h * 4) });
function put(s: Sprite, x: number, y: number, r: number, g: number, b: number, a: number) {
  const i = (y * s.w + x) * 4; s.data[i] = r; s.data[i + 1] = g; s.data[i + 2] = b; s.data[i + 3] = Math.round(clamp01(a) * 255);
}
const mix = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k);
/** Anti-aliased edge: 1 inside, 0 outside, over about one pixel (`px` = one pixel in the shape's units). */
const edge = (inside: number, px: number) => clamp01(0.5 + inside / px);

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
