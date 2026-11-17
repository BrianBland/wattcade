// Full Send's big biome crossings. The overworld reaches the sea and the Moon through portals (flat, casual riding);
// in Full Send you get there the dramatic way: off a kicker and dive into the sea, rocket up out of it in a breach,
// blast off a launch pad to the Moon, and come home in a re-entry burn. The biome swaps at the seam, hidden by the
// splash / smoke / flash. The hop is visual (the trainer keeps the road's grade); pure profile + thin canvas helpers.
import type { BiomeId } from '../../warmup/sim/terrain';
import type { G } from '../../warmup/render/biomes';
import { hash01 } from '../../warmup/sim/terrain';

export type Crossing = 'dive' | 'surface' | 'launch' | 'reentry';
export function crossingOf(s: { from: BiomeId; to: BiomeId }): Crossing | null {
  return s.to === 'underwater' ? 'dive' : s.from === 'underwater' ? 'surface' : s.to === 'moon' ? 'launch' : s.from === 'moon' ? 'reentry' : null;
}
/** Each crossing's flight, in metres relative to the seam: take off at `a`, land at `b`, peak `h` m up. A dive ends in
 *  the splash at the seam; the others swap biome on the way up and land on the far side. */
export const HOPS: Record<Crossing, { a: number; b: number; h: number }> = {
  dive: { a: -50, b: 0, h: 13 },
  surface: { a: -20, b: 60, h: 16 },
  launch: { a: -14, b: 70, h: 20 },
  reentry: { a: -14, b: 70, h: 20 },
};
/** Where the kicker's lip is before a dive (m before the seam) and how long the ramp is. */
export const KICKER = { lipM: -50, lenM: 12, hM: 2.5 };
/** Height (m) and slope (dh/dm) of the crossing's flight `dm` m past the seam. */
export function hopAt(kind: Crossing, dm: number): { h: number; slope: number } {
  const { a, b, h } = HOPS[kind];
  if (dm <= a || dm >= b) return { h: 0, slope: 0 };
  const q = (dm - a) / (b - a);
  return { h: 4 * h * q * (1 - q), slope: (4 * h * (1 - 2 * q)) / (b - a) };
}

/** The sea ahead of a dive: from the kicker's lip on, the road runs out into open water. */
export function drawSeaAhead(g: G, x0: number, y: number, W: number, H: number, t: number) {
  if (x0 > W + 4) return;
  const a = Math.max(-4, Math.round(x0)), top = Math.round(y) + 1;
  g.fillStyle = '#1f6fb8'; g.fillRect(a, top, W + 4 - a, H - top);
  g.fillStyle = '#2f8fd8'; g.fillRect(a, top, W + 4 - a, 3);
  g.fillStyle = '#e8fbff';
  for (let x = a; x < W + 4; x += 2) if (Math.sin(x * 0.35 + t * 3) > 0.55) g.fillRect(x, top - 1 + Math.round(Math.sin(x * 0.2 + t * 2)), 2, 1);
  for (let i = 0; i < 6; i++) { // foam where the road meets the water
    const ph = t * 2 + i * 1.3;
    g.globalAlpha = 0.5 + 0.4 * Math.sin(ph); g.fillRect(a + i * 2 - 2, top - 1 - Math.round(Math.abs(Math.sin(ph)) * 3), 2, 1);
  }
  g.globalAlpha = 1;
}
/** A wooden kicker ending at the lip (x, y), `len` × `h` buffer px. */
export function drawKicker(g: G, x: number, y: number, len: number, h: number) {
  g.fillStyle = '#8a5a32'; g.beginPath(); g.moveTo(x - len, y); g.lineTo(x, y - h); g.lineTo(x, y); g.closePath(); g.fill();
  g.fillStyle = '#c8935a'; g.beginPath(); g.moveTo(x - len, y); g.lineTo(x, y - h); g.lineTo(x, y - h + 1); g.lineTo(x - len + 2, y); g.closePath(); g.fill();
  g.fillStyle = '#ff4d4d'; g.fillRect(Math.round(x) - 1, Math.round(y - h) - 1, 2, 2);
}
/** A rush of bubbles up from the sea floor where you launch out of the sea. */
export function drawVent(g: G, x: number, y: number, top: number, t: number) {
  g.fillStyle = '#d8f6ff';
  for (let i = 0; i < 30; i++) {
    const hgt = Math.max(10, y - top), ph = (t * (0.6 + hash01(i) * 0.5) + hash01(i * 3 + 1)) % 1;
    g.globalAlpha = 0.8 * (1 - ph);
    const r = 1 + Math.round(hash01(i * 7) * 1.5);
    g.fillRect(Math.round(x + (hash01(i * 5 + 2) - 0.5) * 18 + Math.sin(t * 3 + i) * 2), Math.round(y - ph * hgt), r, r);
  }
  g.globalAlpha = 0.25; g.fillStyle = '#9fe6ff'; g.fillRect(Math.round(x) - 9, Math.round(top), 18, Math.round(y - top)); // a light shaft
  g.globalAlpha = 1;
}
/** Launch / landing smoke billowing from the pad at (x, y): a broad bank at the foot thinning into a drifting plume up to
 *  `top`, hiding the cut between Earth and the Moon. */
export function drawLaunchSmoke(g: G, x: number, y: number, top: number, t: number, dusty: boolean) {
  const hgt = Math.max(20, y - top), n = 56;
  const hs = (i: number) => { const v = Math.sin(i * 12.9898) * 43758.5453; return v - Math.floor(v); };
  for (let i = 0; i < n; i++) {
    const k = Math.pow(hs(i), 1.25), ph = t * (0.5 + hs(i + 7) * 0.6) + i;   // most puffs low and wide
    const cy = y - k * hgt + Math.sin(ph) * 2, spread = (1 - k) * 40 + 12;
    const cx = x + (hs(i + 3) - 0.5) * 2 * spread + k * k * 18 + Math.sin(ph * 0.7) * 3; // the plume leans with the wind
    const r = 7 + (1 - k) * 13 * (0.6 + hs(i + 11) * 0.6);
    g.fillStyle = dusty ? (i % 3 ? '#c9c2b5' : '#a59d90') : (i % 3 ? '#f3f5f9' : '#d4d9e2');
    g.globalAlpha = 0.95 - k * 0.35;
    g.beginPath(); g.arc(Math.round(cx), Math.round(cy), r, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
}

/** Launch gantry beside the pad (feet on the road at x, y). */
export function drawGantry(g: G, x: number, y: number, t: number) {
  const H = 64;
  g.fillStyle = '#c7372f'; g.fillRect(x - 2, y - H, 5, H);
  g.fillStyle = '#e9e4da';
  for (let k = 6; k < H; k += 8) g.fillRect(x - 2, y - k, 5, 2);
  g.strokeStyle = '#8a2a25'; g.lineWidth = 1;
  for (let k = 0; k < H - 8; k += 8) { g.beginPath(); g.moveTo(x - 2, y - k); g.lineTo(x + 3, y - k - 8); g.stroke(); }
  g.fillStyle = '#5d6470'; g.fillRect(x + 3, y - H + 14, 16, 3); g.fillRect(x + 3, y - H + 34, 12, 3); // service arms
  g.fillStyle = Math.sin(t * 4) > 0 ? '#ff4d4d' : '#5a1a1a'; g.fillRect(x - 1, y - H - 3, 3, 3);
}
