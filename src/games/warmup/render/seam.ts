// Biome seams: where one biome ends and the next begins is a place on the road, not a moment in time.
// Shared by the overworld (warm-up) and Full Send renderers (pure maths + thin canvas helpers).
//
// Every parallax layer is split at the seam's position *in that layer*, so the new land slides in depth-first: you
// see its far mountains and sky on the horizon long before you reach it, the mid hills next, and all the layers meet
// under the gateway exactly as you ride through. Nothing cross-fades: props belong wholly to the side they stand on,
// continuous bands (ridge, mid ground, ground) are cut along a ragged natural edge under a mist bank, the far
// backdrop's landmarks are never cut (the old ones sink behind the hills while the new ones rise, `horizonSwap`), and
// the sky, with its own sun or planet, changes along a soft weather front that travels with the far seam.
import type { BiomeId } from '../sim/terrain';
import type { G } from './paint';
import { rgb } from './blend';

/** World road position (m) where `to` begins; `from` is the biome before it. */
export interface Seam { x: number; from: BiomeId; to: BiomeId }
/** A screen interval [x0, x1) owned by one biome in one layer (x0/x1 are the seam screen positions, unclamped). */
export interface Span { x0: number; x1: number; id: BiomeId }

/** How ragged a cut edge is (buffer px each way) and how wide the sky's weather front is (fraction of the width). */
export const SEAM = { jag: 4, rowPx: 2, skySoft: 0.4 };

/**
 * Split a layer into biome spans. `seams` must be sorted by x and chained (each `from` is the previous `to`);
 * `toScreen` maps a world road position to this layer's screen x. Seams off either edge (by more than `pad`) only
 * decide which biome fills the screen.
 */
export function layerSpans(base: BiomeId, seams: readonly Seam[], toScreen: (x: number) => number, W: number, pad = SEAM.jag + 1): Span[] {
  const out: Span[] = [];
  let id = seams.length ? seams[0].from : base, x0 = -Infinity;
  for (const sm of seams) {
    const sx = toScreen(sm.x);
    if (sx < -pad) { id = sm.to; continue; }
    if (sx > W + pad) break;
    if (sm.to === id) continue; // a seam into the same biome is not a seam
    out.push({ x0, x1: sx, id }); x0 = sx; id = sm.to;
  }
  out.push({ x0, x1: Infinity, id });
  return out;
}

/** The biome that owns screen x in a layer (props ask this, so a prop is never cut in half). */
export function ownerAt(spans: readonly Span[], x: number): BiomeId {
  for (const s of spans) if (x < s.x1) return s.id;
  return spans[spans.length - 1].id;
}

/** Ragged edge: offset (px) of the cut at row y. Stepped every `rowPx` rows so it reads as pixel art; `salt` varies it per layer. */
export function edgeOffset(y: number, salt: number, amp = SEAM.jag): number {
  const r = Math.floor(y / SEAM.rowPx) * SEAM.rowPx;
  const v = Math.sin(r * 0.13 + salt * 1.7) * 0.55 + Math.sin(r * 0.41 + salt * 3.1) * 0.3 + Math.sin(r * 1.37 + salt) * 0.15;
  return Math.round(v * amp);
}

/** Coverage of the screen [0, W] by each biome in the spans (sums to 1). Used for whole-scene values like daylight. */
export function coverage(spans: readonly Span[], W: number): Array<[BiomeId, number]> {
  const m = new Map<BiomeId, number>();
  for (const s of spans) {
    const w = Math.max(0, Math.min(W, s.x1) - Math.max(0, s.x0));
    if (w > 0) m.set(s.id, (m.get(s.id) ?? 0) + w / Math.max(1, W));
  }
  if (!m.size) m.set(spans[spans.length - 1].id, 1);
  return [...m];
}

const smooth = (p: number) => { const q = Math.max(0, Math.min(1, p)); return q * q * (3 - 2 * q); };

/** Soft weights at screen x: each boundary is a front `soft` px wide. Used for the sky, stars, weather and tints. */
export function softWeights(spans: readonly Span[], x: number, soft: number): Array<[BiomeId, number]> {
  if (spans.length === 1) return [[spans[0].id, 1]];
  let i = 0;
  while (i < spans.length - 1 && x >= spans[i].x1) i++;
  const s = spans[i], h = Math.max(1, soft / 2);
  if (i > 0 && x < s.x0 + h) { const w = smooth((x - (s.x0 - h)) / (2 * h)); return [[spans[i - 1].id, 1 - w], [s.id, w]]; }
  if (i < spans.length - 1 && x >= s.x1 - h) { const w = smooth((x - (s.x1 - h)) / (2 * h)); return [[s.id, 1 - w], [spans[i + 1].id, w]]; }
  return [[s.id, 1]];
}

/** Weighted value of f at screen x across a soft front. */
export function softValue(spans: readonly Span[], x: number, soft: number, f: (id: BiomeId) => number): number {
  let v = 0;
  for (const [id, w] of softWeights(spans, x, soft)) v += f(id) * w;
  return v;
}

/** Path for a span's region with ragged left/right edges (only edges that are on screen get the jag). */
function spanPath(g: G, s: Span, W: number, H: number, salt: number, amp: number) {
  const L = Math.max(-amp - 2, s.x0), R = Math.min(W + amp + 2, s.x1);
  g.beginPath();
  if (Number.isFinite(s.x0) && s.x0 > -amp - 1) {
    g.moveTo(L + edgeOffset(0, salt, amp), 0);
    for (let y = SEAM.rowPx; y <= H + SEAM.rowPx; y += SEAM.rowPx) { g.lineTo(L + edgeOffset(y - SEAM.rowPx, salt, amp), y); g.lineTo(L + edgeOffset(y, salt, amp), y); }
  } else { g.moveTo(L, 0); g.lineTo(L, H + SEAM.rowPx); }
  if (Number.isFinite(s.x1) && s.x1 < W + amp + 1) {
    const top = Math.ceil((H + SEAM.rowPx) / SEAM.rowPx) * SEAM.rowPx;
    for (let y = top; y >= 0; y -= SEAM.rowPx) { g.lineTo(R + edgeOffset(y, salt, amp), y); g.lineTo(R + edgeOffset(y - SEAM.rowPx, salt, amp), y - SEAM.rowPx); }
  } else { g.lineTo(R, H + SEAM.rowPx); g.lineTo(R, 0); }
  g.closePath();
}

/** Draw a continuous layer once per biome span, each clipped to its side of the ragged cut. */
export function drawSpans(g: G, spans: readonly Span[], W: number, H: number, salt: number, draw: (id: BiomeId, span: Span) => void, amp = SEAM.jag) {
  if (spans.length === 1) { draw(spans[0].id, spans[0]); return; }
  for (const s of spans) {
    if (s.x1 < -amp - 1 || s.x0 > W + amp + 1) continue;
    g.save(); spanPath(g, s, W, H, salt, amp); g.clip();
    draw(s.id, s);
    g.restore();
  }
}

/**
 * Paint a full-screen layer per biome (sky + its sun or planet) and lay each later biome over the earlier one along
 * a soft front: vertical strips stepped in alpha, so the change reads as a weather front travelling with the far seam.
 * `scratch` must be the same size as the target.
 */
export function drawSoft(g: G, scratch: G, spans: readonly Span[], W: number, H: number, soft: number, paint: (id: BiomeId, g: G) => void) {
  if (spans.length === 1) { paint(spans[0].id, g); return; }
  const STEP = 3, cv = scratch.canvas;
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i], a = i === 0 ? -Infinity : s.x0 - soft / 2, b = i < spans.length - 1 ? s.x1 + soft / 2 : Infinity;
    if (b <= 0 || a >= W) continue;
    scratch.clearRect(0, 0, W, H); paint(s.id, scratch);
    const from = Math.max(0, Math.floor(a)), to = Math.min(W, Math.ceil(b));
    let x = from;
    if (i > 0) for (; x < to; x += STEP) { // the front: this biome strengthens left to right
      const w = smooth((x + STEP / 2 - a) / Math.max(1, soft));
      if (w >= 0.99) break;
      if (w > 0.01) { g.globalAlpha = w; g.drawImage(cv, x, 0, STEP, H, x, 0, STEP, H); }
    }
    g.globalAlpha = 1;
    if (to > x) g.drawImage(cv, x, 0, to - x, H, x, 0, to - x, H);
  }
}

/** A bank of haze over a far cut (a distant squall or mist), thickest at the foot, so the backdrop seam reads as
 *  weather rather than a glitch. */
export function drawVeil(g: G, x: number, top: number, bottom: number, color: string, width: number, alpha = 0.6) {
  if (bottom <= top) return;
  const grad = g.createLinearGradient(0, top, 0, bottom);
  const [r, gr, b] = rgb(color), c = (a: number) => `rgba(${r},${gr},${b},${a})`;
  grad.addColorStop(0, c(0)); grad.addColorStop(0.55, c(0.66)); grad.addColorStop(1, c(1));
  g.fillStyle = grad;
  const half = Math.max(2, width / 2);
  for (let dx = -half; dx < half; dx += 2) {
    const k = 1 - Math.abs(dx + 1) / half;
    g.globalAlpha = alpha * Math.sqrt(Math.max(0, k)); g.fillRect(Math.round(x + dx), Math.round(top), 2, Math.round(bottom - top));
  }
  g.globalAlpha = 1;
}

/** The overworld's seams within `range` m either side of d: one at every biome boundary (k × biomeM). */
export function roadSeams(d: number, range: number, biomeM: number, biomeOfSeg: (k: number) => BiomeId): Seam[] {
  const out: Seam[] = [];
  const k0 = Math.max(1, Math.floor((d - range) / biomeM)), k1 = Math.min(k0 + 64, Math.ceil((d + range) / biomeM));
  for (let k = k0; k <= k1; k++) out.push({ x: k * biomeM, from: biomeOfSeg(k - 1), to: biomeOfSeg(k) });
  return out;
}

/**
 * The far backdrop is never cut: its landmarks (a volcano, the mesas, the sea) are whole pictures. Instead, as the far
 * seam sweeps across the screen, the outgoing biome's backdrop sinks behind the near ridge and the incoming one rises
 * over it, like cresting a hill into new country. Returns each biome with how far it has sunk (0 = up, 1 = hidden),
 * in drawing order (most sunk first, so the one coming up is in front).
 */
export function horizonSwap(spans: readonly Span[], W: number): Array<[BiomeId, number]> {
  if (spans.length === 1) return [[spans[0].id, 0]];
  const order = new Map(spans.map((s, i) => [s.id, i]));
  return coverage(spans, W)
    .map(([id, c]) => [id, 1 - smooth((c - 0.3) / 0.4)] as [BiomeId, number])
    .filter(([, d]) => d < 0.999)
    .sort((a, b) => b[1] - a[1] || order.get(a[0])! - order.get(b[0])!);
}
