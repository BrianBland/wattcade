// Burning ground left by fireballs: a charred scorch decal, a bed of glowing coals, painted flame tufts (fxArt) that
// flare up as the patch catches and burn down to embers as it dies, rising embers/smoke, then a scar that cools.
// Pure timing/layout math is exported for tests; the ground textures are pre-rendered once (cached canvases) so a
// frame is only drawImage calls, cheap enough for iPad.
import type { BurnView } from '../sim/types';
import { GROUND_S, crustTex, veinTex } from './fireTex';
import { FX_FPS, drawFx, oneShot, type FxName } from './fxArt';

const TAU = Math.PI * 2;
/** Seconds a scorch scar keeps cooling on the road after its fire is out. */
export const SCAR_S = 5;
/** Flame tongues per patch (back layer); the white-hot cores are a subset. */
export const TONGUES = 7;
export const CORES = 3;
/** Painted flame-tuft variants (each leans and forks differently). */
export const SHAPES = 4;
/** Frames in each tuft's loop, and in its burn-out. */
const TUFT_FRAMES = 16, DYING_FRAMES = 8;
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
  /** Start offset into the flame loop, [0, 1). */
  phase: number;
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
    const h = (core ? 0.5 : 0.85) * (0.7 + 0.5 * hash(j + cycle * 13 + 5)) * (0.35 + 0.65 * grow) * (0.3 + 0.7 * fade) * flick * heat;
    if (h < 0.04 || life < 0.02) continue;
    out.push({
      dx: Math.cos(a) * d, dy: Math.sin(a) * d * SQUASH, h, core,
      shape: Math.floor(hash(j + cycle * 13 + 7) * SHAPES), phase: hash(j + 8), rise: smooth(0.45, 1, p) * 0.45 * heat,
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

// ---------- sprites (browser only) ----------

interface Sprites { crust: HTMLCanvasElement[]; veins: HTMLCanvasElement[]; glow: HTMLCanvasElement }
let sprites: Sprites | null = null;
/** Painted ground-texture variants (crust + its molten veins). */
const VARIANTS = 3;

function canvas(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function fromPixels(px: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
  const c = canvas(w, h), img = new ImageData(w, h); img.data.set(px); c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}
function glowSprite(): HTMLCanvasElement {
  const c = canvas(64, 64), g = c.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,150,50,1)'); gr.addColorStop(0.3, 'rgba(230,80,20,0.5)'); gr.addColorStop(1, 'rgba(200,40,5,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
/** The texture jobs, smallest first; each is ~5–30 ms, so `prepareBurnSprites` spreads them over frames. */
function jobs(out: Sprites): Array<() => void> {
  const list: Array<() => void> = [() => { out.glow = glowSprite(); }];
  for (let v = 0; v < VARIANTS; v++) {
    const seed = 7 + v * 101;
    list.push(() => { out.crust[v] = fromPixels(crustTex(seed), GROUND_S, GROUND_S); });
    list.push(() => { out.veins[v] = fromPixels(veinTex(seed), GROUND_S, GROUND_S); });
  }
  return list;
}
const empty = (): Sprites => ({ crust: [], veins: [], glow: null as unknown as HTMLCanvasElement });
/** Paints the fire textures a slice at a time (yielding between slices), during the level's loading hold. */
export async function prepareBurnSprites(cancelled: () => boolean = () => false): Promise<void> {
  if (sprites) return;
  const out = empty();
  for (const job of jobs(out)) { if (cancelled()) return; job(); await new Promise((r) => setTimeout(r, 0)); }
  sprites ??= out;
}
function getSprites(): Sprites {
  if (!sprites) { const out = empty(); for (const job of jobs(out)) job(); sprites = out; } // not prepared: paint now
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
    g.globalAlpha = a; g.drawImage(sp.crust[v], x - r, y - r * SQUASH, r * 2, r * 2 * SQUASH);
  }
  g.globalCompositeOperation = 'lighter';
  const shares = fireShares(patches);
  for (const [i, p] of patches.entries()) {
    const { x, y } = P(p.x, p.y), r = p.r * k * 1.05, cooled = p.outT == null ? 0 : t - p.outT, v = p.seed % VARIANTS;
    const heat = coalHeat(p.k, cooled) * (0.4 + 0.6 * shares[i]);
    if (heat <= 0.01) continue;
    const breathe = 0.75 + 0.25 * Math.sin(t * 2.3 + p.seed) * Math.sin(t * 3.7 + p.seed * 0.3);
    g.globalAlpha = Math.min(1, heat * breathe * 1.6); g.drawImage(sp.veins[v], x - r, y - r * SQUASH, r * 2, r * 2 * SQUASH);
    const fh = flameHeat(p.k) * shares[i], gr = p.r * k * (1.1 + 0.25 * fh);
    g.globalAlpha = Math.min(1, 0.22 * heat + 0.3 * fh * breathe); g.drawImage(sp.glow, x - gr, y - gr * SQUASH, gr * 2, gr * 2 * SQUASH);
  }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
}

/** A tuft's box: 64×128 frames with the flame's base at (32, 120). */
function drawTuft(g: CanvasRenderingContext2D, name: FxName, frame: number, bx: number, by: number, h: number, lean: number) {
  const w = h / 2;
  g.translate(bx, by); g.rotate(lean);
  drawFx(g, name, frame, -w / 2, -h * 120 / 128, w, h);
  g.rotate(-lean); g.translate(-bx, -by);
}
/**
 * Flame layer (over the ground actors), back to front: the flare as a patch catches, its tufts while it burns, and
 * each tuft burning down to embers when the fire goes out.
 */
export function drawBurnFlames(g: CanvasRenderingContext2D, patches: readonly Patch[], P: P, k: number, t: number) {
  if (!patches.length) return;
  const shares = fireShares(patches);
  g.globalAlpha = 1;
  for (const [i, p] of patches.entries()) {
    const { x, y } = P(p.x, p.y), r = p.r * k;
    const flare = oneShot(t - p.bornT, FX_FPS.flare, 8);
    if (flare != null) { const w = r * 2.6; drawFx(g, 'ground-flare', flare, x - w / 2, y - w / 2, w, w); }
    if (p.outT != null) { // the tufts it had when the fire went out collapse into embers and a wisp of smoke
      const f = oneShot(t - p.outT, FX_FPS.ground, DYING_FRAMES);
      if (f != null) for (const q of tongues(p.seed, p.outT, 0.5)) {
        drawTuft(g, `ground-dying-${q.shape % SHAPES}` as FxName, f, x + q.dx * r, y + q.dy * r, tuftH(q.h, 0.5) * r, q.lean * 0.5);
      }
      continue;
    }
    const heat = flameHeat(p.k) * shares[i];
    if (heat <= 0.01) continue;
    for (const q of tongues(p.seed, t, heat, 0.1 * Math.sin(t * 0.7 + p.seed))) {
      const frame = Math.floor(t * FX_FPS.ground + q.phase * TUFT_FRAMES) % TUFT_FRAMES;
      drawTuft(g, `ground-tuft-${q.shape % SHAPES}` as FxName, frame, x + q.dx * r, y + q.dy * r, tuftH(q.h, heat) * r, q.lean * 0.5);
    }
  }
}
/** A painted tuft's drawn height (patch radii) for a tongue `h` tall: the frame has headroom over the flame. */
export const tuftH = (h: number, heat: number) => Math.max(h, 0.25 * heat) * 1.95;
