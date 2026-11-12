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
/** A boundary's shape: the screen x of the cut at row y (a waterline, for instance). */
export type Edge = (y: number) => number;
/** A screen interval [x0, x1) owned by one biome in one layer (x0/x1 are the seam screen positions, unclamped).
 *  `l` / `r`, when present, give the cut a shape instead of the ragged vertical edge. */
export interface Span { x0: number; x1: number; id: BiomeId; l?: Edge; r?: Edge }

/**
 * Most seams are a gateway on the road. Two biomes need more than a gate: you ride *into* the sea down a slipway (the
 * waterline sweeps up over the camera) and surface out of it, and you launch to the Moon from a gantry (a short rocket
 * hop through the smoke) and come back down with a re-entry glow. Those seams are one place in every layer.
 */
export type SeamKind = 'gate' | 'dive' | 'surface' | 'launch' | 'reentry';
export function seamKind(s: Pick<Seam, 'from' | 'to'>): SeamKind {
  return s.to === 'underwater' ? 'dive' : s.from === 'underwater' ? 'surface' : s.to === 'moon' ? 'launch' : s.from === 'moon' ? 'reentry' : 'gate';
}
/** Waterline: rises from the road (screen x `sx`, row `y0`) by `slope` px up per px across the water side (`dir` +1 =
 *  the sea is to the right, -1 = to the left). Riding in, it climbs past the rider and over the top of the screen. */
export const WATER_SLOPE = 0.6;
/** The sea seen side-on: a shelving beach from the road (`y0`) up to a level surface at row `surf` (rows above it are
 *  dry). `dir` +1 = the sea is to the right. The renderer raises `surf` as you ride in, so the surface sweeps up and
 *  over the camera; riding out it sinks back to the road. */
export function waterEdge(sx: number, y0: number, dir: 1 | -1, surf = -Infinity, slope = WATER_SLOPE): Edge {
  return (y) => (y < surf ? sx + dir * 1e5 : sx + dir * Math.max(0, y0 - y) / slope);
}
/** Row of the sea surface `past` m beyond the shore (negative = not there yet), given the road row there: a shallow sea
 *  ahead, deepening as you go in until it is over the top of the screen. */
export function surfaceRow(y0: number, pastPx: number, shallow = 40): number {
  return y0 - shallow - Math.max(0, pastPx) * 0.7;
}
/** Rocket hop over a launch / re-entry seam: height 0..1 at `dm` metres past the seam (a parabola `halfM` each side). */
export function hopAt(dm: number, halfM: number): number {
  const q = dm / halfM;
  return Math.abs(q) >= 1 ? 0 : 1 - q * q;
}

/** How ragged a cut edge is (buffer px each way) and how wide the sky's weather front is (fraction of the width). */
export const SEAM = { jag: 4, rowPx: 2, skySoft: 0.4 };

/**
 * Split a layer into biome spans. `seams` must be sorted by x and chained (each `from` is the previous `to`);
 * `toScreen` maps a world road position to this layer's screen x. Seams off either edge (by more than `pad`) only
 * decide which biome fills the screen.
 */
export function layerSpans(base: BiomeId, seams: readonly Seam[], toScreen: (x: number, s: Seam) => number, W: number, pad = SEAM.jag + 1,
  shape?: { H: number; edge: (s: Seam, sx: number) => Edge | undefined }): Span[] {
  const out: Span[] = [];
  let id = seams.length ? seams[0].from : base, x0 = -Infinity, l: Edge | undefined;
  for (const sm of seams) {
    const sx = toScreen(sm.x, sm), e = shape?.edge(sm, sx);
    let lo = sx, hi = sx;
    if (e && shape) for (let y = 0; y <= shape.H; y += 8) { const ex = e(y); lo = Math.min(lo, ex); hi = Math.max(hi, ex); }
    if (hi < -pad) { id = sm.to; l = undefined; continue; }
    if (lo > W + pad) break;
    if (sm.to === id) continue; // a seam into the same biome is not a seam
    out.push({ x0, x1: sx, id, ...(l ? { l } : {}), ...(e ? { r: e } : {}) }); x0 = sx; id = sm.to; l = e;
  }
  out.push({ x0, x1: Infinity, id, ...(l ? { l } : {}) });
  return out;
}

/** True when a cut has a shape (a waterline): such layers are clipped along it, props included. */
export const shaped = (spans: readonly Span[]) => spans.some((s) => s.l || s.r);

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
  if (s.l || s.r) { // shaped cut: trace each edge row by row (an unshaped side stays straight)
    const clampX = (x: number) => Math.max(-8, Math.min(W + 8, x));
    const le = s.l ?? (() => Math.max(-8, s.x0)), re = s.r ?? (() => Math.min(W + 8, s.x1));
    g.moveTo(clampX(le(0)), 0);
    for (let y = SEAM.rowPx; y <= H + SEAM.rowPx; y += SEAM.rowPx) g.lineTo(clampX(le(y)), y);
    for (let y = Math.ceil((H + SEAM.rowPx) / SEAM.rowPx) * SEAM.rowPx; y >= 0; y -= SEAM.rowPx) g.lineTo(clampX(re(y)), y);
    g.closePath(); return;
  }
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
    if (!s.l && !s.r && (s.x1 < -amp - 1 || s.x0 > W + amp + 1)) continue;
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

/** The sea surface along a waterline: the shelving shore from the road (`y0`) up to the level surface at row `surf`,
 *  then across the screen on the sea side (`dir`), a bright rippling line with foam where it meets the road. */
export function drawWaterline(g: G, e: Edge, y0: number, surf: number, dir: 1 | -1, W: number, t: number) {
  g.fillStyle = '#e8fbff';
  const top = Math.max(-2, Math.ceil(surf));
  for (let y = Math.floor(y0); y >= top; y -= 1) { // the shore
    const x = e(y) + Math.sin(y * 0.35 + t * 3) * 1.2;
    if (x < -4 || x > W + 4) continue;
    g.globalAlpha = 0.85; g.fillRect(Math.round(x) - 1, y, 2, 1);
  }
  if (surf > -2 && surf < y0) { // the level surface
    const x0 = e(top), xa = dir > 0 ? Math.max(-2, x0) : -2, xb = dir > 0 ? W + 2 : Math.min(W + 2, x0);
    for (let x = Math.floor(xa); x < xb; x += 2) {
      const yy = Math.round(surf + Math.sin(x * 0.25 + t * 2.5) * 1);
      g.globalAlpha = 0.9; g.fillRect(x, yy, 2, 1);
      g.globalAlpha = 0.3; g.fillRect(x, yy + 1, 2, 2);
    }
  }
  for (let i = 0; i < 10; i++) { // foam and spray where the sea meets the road
    const a = t * 2 + i * 1.7, r = (i % 4) + 1;
    g.globalAlpha = 0.5 + 0.4 * Math.sin(a);
    g.fillRect(Math.round(e(y0) + Math.cos(a) * 7 + (i - 5) * 2), Math.round(y0 - 2 - Math.abs(Math.sin(a * 0.7)) * 5 - r), r, 1);
  }
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
