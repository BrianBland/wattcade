// Burning ground left by fireballs: a charred scorch decal, a bed of glowing coals, layered flame tongues and
// rising embers/smoke, then a scar that cools after the fire dies. Pure timing/layout math is exported for tests;
// sprites are pre-rendered once (cached canvases) so a frame is only drawImage calls, cheap enough for iPad.
import type { BurnView } from '../sim/types';

const TAU = Math.PI * 2;
/** Seconds a scorch scar keeps cooling on the road after its fire is out. */
export const SCAR_S = 5;
/** Flame tongues per patch (back layer); the white-hot cores are a subset. */
export const TONGUES = 10;
export const CORES = 5;
/** Flame sprite variants (each bends its tip differently). */
export const SHAPES = 3;
/** Patches tracked at once (sim caps live burns at 24; the rest are cooling scars). */
export const MAX_PATCHES = 40;
/** The road is seen slightly from above: ground footprints squash vertically. */
export const SQUASH = 0.82;

const frac = (v: number) => v - Math.floor(v);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number) => { const x = clamp01((v - a) / (b - a)); return x * x * (3 - 2 * x); };
export const hash = (n: number) => { let h = (n * 374761393) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** Flame height from the share of burn time left: an ignition flare, a steady burn, then dying down to coals. */
export function flameHeat(k: number): number {
  const flare = 1 + 0.3 * smooth(0.85, 1, k);
  return smooth(0, 0.4, k) * flare;
}
/** Coal glow: outlives the flames a little (embers keep glowing) and cools over the first part of the scar. */
export function coalHeat(k: number, cooledS: number): number {
  return cooledS > 0 ? 0.45 * (1 - smooth(0, SCAR_S * 0.5, cooledS)) : 0.45 + 0.55 * smooth(0, 0.6, k);
}
/** Scorch darkness: burns in fast on impact, holds while burning, fades out over the scar time. */
export function scorchAlpha(ageS: number, cooledS: number): number {
  return smooth(0, 0.25, ageS) * (1 - smooth(SCAR_S * 0.3, SCAR_S, cooledS));
}

export interface Tongue {
  /** Base point, in patch radii from the centre (screen space, `dy` already squashed). */
  dx: number; dy: number;
  /** Height and width in patch radii; lean in radians. */
  h: number; w: number; lean: number;
  /** Which flame sprite; how far the tongue has lifted off its base (in patch radii) as it licks up and breaks away. */
  shape: number; rise: number;
  core: boolean;
}
/**
 * The flame tongues of one patch at time `t`, back to front. Each tongue grows, licks up and dies on its own
 * cycle and re-seats somewhere new each cycle, so the fire crawls around the patch instead of pulsing in place.
 */
export function tongues(seed: number, t: number, heat: number, wind = 0): Tongue[] {
  const out: Tongue[] = [];
  if (heat <= 0.01) return out;
  // A dying fire keeps fewer tongues, not just shorter ones.
  const outer = Math.ceil(TONGUES * Math.min(1, heat * 1.4)), cores = Math.ceil(CORES * Math.min(1, heat * 1.2));
  for (let i = 0; i < TONGUES + CORES; i++) {
    const core = i >= TONGUES, j = seed * 31 + i * 7;
    if (core ? i - TONGUES >= cores : i >= outer) continue;
    const period = (core ? 0.42 : 0.6) + 0.35 * hash(j + 1), ph = t / period + hash(j + 2), p = frac(ph), cycle = Math.floor(ph);
    const a = TAU * hash(j + cycle * 13 + 3), d = (core ? 0.38 : 0.62) * Math.sqrt(hash(j + cycle * 13 + 4));
    const life = Math.sin(Math.PI * p); // 0 → 1 → 0 over the cycle
    const flick = 0.85 + 0.15 * Math.sin(t * 17 + j) * Math.sin(t * 9.3 + j * 0.7);
    // Grows fast, then thins and lifts away from its base as it dies (a lick of flame breaking off).
    const grow = Math.min(1, p * 3), fade = 1 - smooth(0.55, 1, p);
    const h = (core ? 0.75 : 1.35) * (0.7 + 0.5 * hash(j + cycle * 13 + 5)) * (0.35 + 0.65 * grow) * (0.3 + 0.7 * fade) * flick * heat;
    if (h < 0.04 || life < 0.02) continue;
    out.push({
      dx: Math.cos(a) * d, dy: Math.sin(a) * d * SQUASH, h, core,
      shape: Math.floor(hash(j + cycle * 13 + 7) * SHAPES), rise: smooth(0.45, 1, p) * 0.45 * heat,
      w: Math.min(h * 0.42, (core ? 0.18 : 0.26) * (0.8 + 0.4 * hash(j + 6)) * (0.45 + 0.55 * fade)),
      lean: wind + 0.22 * Math.sin(t * 3.1 + j) + 0.1 * Math.sin(t * 7.7 + j * 1.3),
    });
  }
  return out.sort((x, y) => x.dy - y.dy);
}

/** A burn patch the renderer is drawing: live, or a cooling scar after its fire went out. */
export interface Patch { key: string; x: number; y: number; r: number; seed: number; bornT: number; k: number; outT: number | null }
/**
 * Matches this frame's live burns to tracked patches (by position), keeps burnt-out ones as scars for SCAR_S,
 * and drops the oldest scars past MAX_PATCHES. A clock that runs backwards (new level) clears everything.
 */
export function trackPatches(prev: Patch[], burns: readonly BurnView[], t: number): Patch[] {
  const live = new Map<string, BurnView>();
  for (const b of burns) live.set(`${Math.round(b.x * 4)},${Math.round(b.y * 4)}`, b);
  const out: Patch[] = [];
  for (const p of prev) {
    if (t < p.bornT) continue;
    const b = live.get(p.key);
    if (b && p.outT == null) { out.push({ ...p, k: b.k, r: b.r }); live.delete(p.key); continue; }
    const outT = p.outT ?? t;
    if (t - outT < SCAR_S) out.push({ ...p, k: 0, outT });
  }
  for (const [key, b] of live) out.push({ key, x: b.x, y: b.y, r: b.r, seed: Math.round(Math.abs(b.x * 97 + b.y * 61)) % 9973, bornT: t, k: b.k, outT: null });
  // Keep every live fire; drop the oldest scars first.
  while (out.length > MAX_PATCHES) { const i = out.findIndex((p) => p.outT != null); out.splice(i < 0 ? 0 : i, 1); }
  return out;
}

/**
 * How much of its own fire each patch shows. Fireballs keep landing on the front of the pack, so patches stack;
 * a newer fire on top of an older one takes over instead of piling more flames and glow onto the same spot.
 */
export function fireShares(patches: readonly Patch[]): number[] {
  return patches.map((p) => {
    if (p.outT != null) return 1;
    let share = 1;
    for (const q of patches) {
      if (q === p || q.outT != null || q.bornT <= p.bornT) continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y) / Math.max(0.1, p.r);
      share *= 1 - 0.75 * (1 - smooth(0.25, 1.1, d));
    }
    return share;
  });
}

// ---------- sprites (browser only; built on first draw) ----------

interface Sprites { scorch: HTMLCanvasElement[]; coals: HTMLCanvasElement[]; flame: HTMLCanvasElement[]; core: HTMLCanvasElement[]; glow: HTMLCanvasElement }
let sprites: Sprites | null = null;
const VARIANTS = 4, S = 128;

function canvas(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
/** A lumpy closed outline: radius `r0` wobbled by a few smooth harmonics. */
function blob(g: CanvasRenderingContext2D, cx: number, cy: number, r0: number, seed: number, rough: number) {
  g.beginPath();
  const n = 40, ph = [hash(seed) * TAU, hash(seed + 1) * TAU, hash(seed + 2) * TAU];
  for (let i = 0; i <= n; i++) {
    const a = i / n * TAU, w = 1 + rough * (0.55 * Math.sin(3 * a + ph[0]) + 0.3 * Math.sin(5 * a + ph[1]) + 0.15 * Math.sin(9 * a + ph[2]));
    const x = cx + Math.cos(a) * r0 * w, y = cy + Math.sin(a) * r0 * w;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
}
/** Branching crack polylines from near the centre outward (shared by the scorch and its coals). */
function cracks(seed: number): Array<Array<[number, number]>> {
  const out: Array<Array<[number, number]>> = [];
  const n = 5 + Math.floor(hash(seed + 40) * 3);
  for (let i = 0; i < n; i++) {
    let a = (i + hash(seed + 50 + i) * 0.7) / n * TAU, x = S / 2 + Math.cos(a) * 6, y = S / 2 + Math.sin(a) * 6;
    const line: Array<[number, number]> = [[x, y]], len = 30 + hash(seed + 60 + i) * 22;
    for (let d = 0; d < len; d += 6) { a += (hash(seed * 3 + i * 17 + d) - 0.5) * 0.9; x += Math.cos(a) * 6; y += Math.sin(a) * 6; line.push([x, y]); }
    out.push(line);
    if (hash(seed + 70 + i) < 0.6) { // a side branch
      const m = line[Math.floor(line.length / 2)], b = a + (hash(seed + 80 + i) < 0.5 ? 0.9 : -0.9);
      out.push([m, [m[0] + Math.cos(b) * 9, m[1] + Math.sin(b) * 9], [m[0] + Math.cos(b + 0.3) * 16, m[1] + Math.sin(b + 0.3) * 16]]);
    }
  }
  return out;
}
function strokeLines(g: CanvasRenderingContext2D, lines: Array<Array<[number, number]>>) {
  g.beginPath();
  for (const l of lines) l.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
}
function scorchSprite(seed: number): HTMLCanvasElement {
  const c = canvas(S, S), g = c.getContext('2d')!, m = S / 2;
  // Soft charred halo, then a darker core: stacked translucent blobs give a feathered edge without canvas filters.
  for (let i = 0; i < 6; i++) {
    const rr = m * (0.98 - i * 0.1), gr = g.createRadialGradient(m, m, rr * 0.3, m, m, rr * 1.05);
    gr.addColorStop(0, 'rgba(20,11,6,0.34)'); gr.addColorStop(0.7, 'rgba(20,11,6,0.22)'); gr.addColorStop(1, 'rgba(22,12,6,0)');
    g.fillStyle = gr; blob(g, m, m, rr, seed + i, 0.18); g.fill();
  }
  const core = g.createRadialGradient(m, m, 0, m, m, m * 0.6);
  core.addColorStop(0, 'rgba(6,3,2,0.85)'); core.addColorStop(1, 'rgba(10,6,4,0)');
  g.fillStyle = core; g.fillRect(0, 0, S, S);
  // Soot flecks and pale ash.
  for (let i = 0; i < 90; i++) {
    const a = hash(seed * 7 + i) * TAU, d = Math.sqrt(hash(seed * 7 + i + 500)) * m * 0.92, ash = hash(seed + i * 3) < 0.22;
    g.fillStyle = ash ? `rgba(150,140,128,${0.25 + 0.25 * hash(i + seed)})` : `rgba(0,0,0,${0.3 + 0.4 * hash(i * 5 + seed)})`;
    g.beginPath(); g.arc(m + Math.cos(a) * d, m + Math.sin(a) * d, ash ? 0.8 + hash(i) * 1.2 : 1 + hash(i + 9) * 2.4, 0, TAU); g.fill();
  }
  g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 2.2; strokeLines(g, cracks(seed));
  return c;
}
function coalSprite(seed: number): HTMLCanvasElement {
  const c = canvas(S, S), g = c.getContext('2d')!, m = S / 2, lines = cracks(seed);
  g.lineCap = 'round'; g.lineJoin = 'round';
  // Glowing seams: a wide dim stroke under a thin hot one.
  g.strokeStyle = 'rgba(255,70,10,0.35)'; g.lineWidth = 6; strokeLines(g, lines);
  g.strokeStyle = 'rgba(255,120,30,0.6)'; g.lineWidth = 2.4; strokeLines(g, lines);
  g.strokeStyle = 'rgba(255,220,150,0.45)'; g.lineWidth = 0.9; strokeLines(g, lines);
  // Coals: hot specks with a halo.
  for (let i = 0; i < 26; i++) {
    const a = hash(seed * 11 + i) * TAU, d = Math.sqrt(hash(seed * 11 + i + 300)) * m * 0.7, x = m + Math.cos(a) * d, y = m + Math.sin(a) * d, r = 1.2 + hash(seed + i * 13) * 2.4;
    const gr = g.createRadialGradient(x, y, 0, x, y, r * 2.6);
    gr.addColorStop(0, 'rgba(255,220,140,0.95)'); gr.addColorStop(0.35, 'rgba(255,110,30,0.7)'); gr.addColorStop(1, 'rgba(200,30,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 2.6, 0, TAU); g.fill();
  }
  return c;
}
/** A flame tongue, base at the bottom centre: a round foot, a waisted body and a thin tip bent by `bend`. */
function flameSprite(stops: Array<[number, string]>, bend: number): HTMLCanvasElement {
  const w = 48, h = 112, c = canvas(w, h), g = c.getContext('2d')!, tx = w / 2 + bend * w * 0.3;
  g.beginPath();
  g.moveTo(tx, 1);
  g.bezierCurveTo(w * (0.5 + bend * 0.4), h * 0.34, w * 0.96, h * 0.58, w * 0.82, h * 0.86);
  g.bezierCurveTo(w * 0.72, h * 0.995, w * 0.28, h * 0.995, w * 0.18, h * 0.86);
  g.bezierCurveTo(w * 0.04, h * 0.62, w * (0.42 + bend * 0.3), h * 0.42, tx, 1);
  const gr = g.createLinearGradient(0, h, 0, 0);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fill();
  // Feather the sides so overlapping tongues melt into one body of fire.
  g.globalCompositeOperation = 'destination-in';
  const side = g.createLinearGradient(0, 0, w, 0);
  side.addColorStop(0, 'rgba(0,0,0,0)'); side.addColorStop(0.28, 'rgba(0,0,0,0.75)'); side.addColorStop(0.5, 'rgba(0,0,0,1)'); side.addColorStop(0.72, 'rgba(0,0,0,0.75)'); side.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = side; g.fillRect(0, 0, w, h);
  return c;
}
function glowSprite(): HTMLCanvasElement {
  const c = canvas(64, 64), g = c.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,170,70,1)'); gr.addColorStop(0.3, 'rgba(255,100,30,0.55)'); gr.addColorStop(1, 'rgba(255,60,10,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function getSprites(): Sprites {
  if (sprites) return sprites;
  sprites = {
    scorch: Array.from({ length: VARIANTS }, (_, i) => scorchSprite(i * 101 + 7)),
    coals: Array.from({ length: VARIANTS }, (_, i) => coalSprite(i * 101 + 7)),
    flame: [-0.6, 0.1, 0.7].map((b) => flameSprite([[0, 'rgba(255,140,40,0.95)'], [0.25, 'rgba(240,80,16,0.92)'], [0.6, 'rgba(170,26,6,0.7)'], [1, 'rgba(90,6,0,0)']], b)),
    core: [-0.5, 0, 0.5].map((b) => flameSprite([[0, 'rgba(255,255,236,1)'], [0.3, 'rgba(255,226,120,0.95)'], [0.72, 'rgba(255,140,40,0.35)'], [1, 'rgba(255,90,20,0)']], b)),
    glow: glowSprite(),
  };
  return sprites;
}

type P = (x: number, y: number) => { x: number; y: number };

/** Ground layer (under the actors): the scorch scar and its glowing coals. */
export function drawBurnGround(g: CanvasRenderingContext2D, patches: readonly Patch[], P: P, k: number, t: number) {
  if (!patches.length) return;
  const sp = getSprites();
  for (const p of patches) {
    const { x, y } = P(p.x, p.y), r = p.r * k * 1.05, cooled = p.outT == null ? 0 : t - p.outT, v = p.seed % VARIANTS;
    const a = scorchAlpha(t - p.bornT, cooled);
    if (a <= 0.01) continue;
    g.globalAlpha = a * 0.9; g.drawImage(sp.scorch[v], x - r, y - r * SQUASH, r * 2, r * 2 * SQUASH);
  }
  g.globalCompositeOperation = 'lighter';
  const shares = fireShares(patches);
  for (const [i, p] of patches.entries()) {
    const { x, y } = P(p.x, p.y), r = p.r * k * 0.9, cooled = p.outT == null ? 0 : t - p.outT, v = p.seed % VARIANTS;
    const heat = coalHeat(p.k, cooled) * (0.4 + 0.6 * shares[i]);
    if (heat <= 0.01) continue;
    const breathe = 0.75 + 0.25 * Math.sin(t * 2.3 + p.seed) * Math.sin(t * 3.7 + p.seed * 0.3);
    g.globalAlpha = Math.min(1, heat * breathe); g.drawImage(sp.coals[v], x - r, y - r * SQUASH, r * 2, r * 2 * SQUASH);
    const fh = flameHeat(p.k) * shares[i], gr = p.r * k * (1.1 + 0.25 * fh);
    g.globalAlpha = Math.min(1, 0.22 * heat + 0.3 * fh * breathe); g.drawImage(sp.glow, x - gr, y - gr * SQUASH, gr * 2, gr * 2 * SQUASH);
  }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
}

/** Flame layer (over the ground actors): a dark-red body, additive orange tongues, then white-hot cores. */
export function drawBurnFlames(g: CanvasRenderingContext2D, patches: readonly Patch[], P: P, k: number, t: number) {
  if (!patches.length) return;
  const sp = getSprites(), shares = fireShares(patches);
  for (const [i, p] of patches.entries()) {
    const heat = p.outT == null ? flameHeat(p.k) * shares[i] : 0;
    if (heat <= 0.01) continue;
    const { x, y } = P(p.x, p.y), r = p.r * k, ts = tongues(p.seed, t, heat, 0.1 * Math.sin(t * 0.7 + p.seed));
    // Pass 0 gives the fire body (normal blend, so it reads on bright ground); passes 1-2 add light on top.
    for (let pass = 0; pass < 3; pass++) {
      g.globalCompositeOperation = pass ? 'lighter' : 'source-over';
      g.globalAlpha = pass === 0 ? 0.85 : pass === 1 ? 0.65 : 0.9;
      for (const q of ts) {
        if (q.core !== (pass === 2)) continue;
        const bx = x + q.dx * r, by = y + q.dy * r - q.rise * r, h = q.h * r * (pass === 0 ? 1.08 : 1), w = q.w * r * 2 * (pass === 0 ? 1.15 : 1);
        g.translate(bx, by); g.rotate(q.lean);
        g.drawImage((pass === 2 ? sp.core : sp.flame)[q.shape], -w / 2, -h, w, h * 1.08);
        g.rotate(-q.lean); g.translate(-bx, -by);
      }
    }
  }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
}
