// Loads packed ground kits (public/td/kits/<style>/) and bakes a level's ground in slices without stalling a frame.
// The menu bakes the level it would start ahead of time (`prepare`), and a new level waits for its bake behind the
// loading card, so the vector stand-in is only a fallback. DOM side of the compositor (compose.ts).
import type { TdLevel } from '../../sim/level';
import { loadImage, loadManifest } from '../assets';
import { composeGround, scatterPlan, type Img, type KitPixels, type WorldBox } from './compose';
import { decks, type Deck } from './deck';
import type { KitManifest, KitStamp } from './kit';

/** Ground styles with a packed kit; any other style (level 0's 'painted' when narrowed) uses the first. */
export const KIT_STYLES = ['outpost', 'scrapyard', 'badlands', 'volcanic', 'overgrown', 'blight'] as const;
export const kitStyle = (style: string): string => (KIT_STYLES as readonly string[]).includes(style) ? style : KIT_STYLES[0];

export interface Kit { manifest: KitManifest; px: KitPixels; images: Map<string, HTMLImageElement> }
/** A finished bake: the ground and the decks over it, both in world space over `box` at K px per unit. */
export interface Baked { level: TdLevel; box: WorldBox; K: number; ground: HTMLCanvasElement; deck: { canvas: HTMLCanvasElement; box: WorldBox } | null }

/** One map, whatever object carries it (`levelFor` hands out a fresh copy per call). */
export const levelKey = (l: TdLevel) => `${l.id}|${l.seed ?? ''}|${l.style}|${l.roadStyle ?? ''}|${l.pads.length}`;

function pixels(image: HTMLImageElement, ppu: number): Img {
  const c = document.createElement('canvas'); c.width = image.naturalWidth || image.width; c.height = image.naturalHeight || image.height;
  const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(image, 0, 0);
  return { d: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height, ppu };
}
/** Spare the frame: run slices until this much time (ms) has passed, then yield to the browser. */
const BUDGET_MS = 6;
const nextSlice = () => new Promise<void>(r => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));

/** Packed kits, shared by every baker and the menu art (decoded once per page). */
const KITS = new Map<string, Promise<Kit>>();
export function loadKit(base: string, style: string): Promise<Kit> {
  const k = `${base}|${style}`;
  let p = KITS.get(k);
  if (!p) {
    const root = `${base}td/kits/${style}/`;
    p = loadManifest<KitManifest>(root + 'kit.json').then(async manifest => {
      const stamps: KitStamp[] = [manifest.apron, manifest.deck, ...manifest.decals, ...manifest.props];
      if (manifest.clearing) stamps.push(manifest.clearing);
      if (manifest.hiveMouth) stamps.push(manifest.hiveMouth);
      const files = [...new Set([...Object.values(manifest.files), ...stamps.map(s => s.file)])];
      const images = new Map(await Promise.all(files.map(async f => [f, await loadImage(root + f)] as const)));
      const im = (f: string) => pixels(images.get(f)!, manifest.ppu), F = manifest.files;
      const px: KitPixels = { groundA: im(F.groundA), groundB: im(F.groundB), gravel: im(F.gravel), road: im(F.road), hive: im(F.hive),
        apron: im(manifest.apron.file), clearing: manifest.clearing && im(manifest.clearing.file) };
      return { manifest, px, images };
    });
    p.catch(() => KITS.delete(k)); // a failed load may be retried with the next level
    KITS.set(k, p);
  }
  return p;
}

/**
 * Bakes `level`'s ground over `box` at K px per unit in ~6 ms slices (null if `cancelled()` turns true meanwhile).
 * `progress` hears 0..1 as the per-pixel pass runs.
 */
export async function bakeGround(base: string, level: TdLevel, box: WorldBox, K: number, cancelled: () => boolean, progress?: (f: number) => void): Promise<Baked | null> {
  const kit = await loadKit(base, kitStyle(level.style));
  if (cancelled()) return null;
  const W = Math.round(box.w * K), H = Math.round(box.h * K);
  const ground = document.createElement('canvas'); ground.width = W; ground.height = H;
  const g = ground.getContext('2d')!, img = g.createImageData(W, H);
  const steps = composeGround(level, kit.manifest, kit.px, box, K, img.data);
  for (let t0 = performance.now(), r = steps.next(); !r.done; r = steps.next()) {
    if (performance.now() - t0 > BUDGET_MS) { progress?.(r.value); await nextSlice(); if (cancelled()) return null; t0 = performance.now(); }
  }
  g.putImageData(img, 0, 0);
  const at = (x: number, y: number) => ({ x: (x - box.x0) * K, y: (y - box.y0) * K });
  const m = kit.manifest;
  for (const p of scatterPlan(level, m, box)) {
    const st = p.kind === 'decal' ? m.decals[p.i] : p.kind === 'prop' ? m.props[p.i] : m.hiveMouth!;
    const c = at(p.x, p.y); g.globalAlpha = p.alpha;
    g.drawImage(kit.images.get(st.file)!, c.x - st.w * K / 2, c.y - st.h * K / 2, st.w * K, st.h * K);
  }
  g.globalAlpha = 1;
  const ds = decks(level);
  let deck: Baked['deck'] = null;
  if (ds.length) {
    // the deck layer is drawn every frame, so it only covers the decks
    const pts = ds.flatMap(d => d.line), pad = ds[0].width;
    const x0 = Math.floor(Math.min(...pts.map(p => p.x)) - pad), y0 = Math.floor(Math.min(...pts.map(p => p.y)) - pad);
    const dbox = { x0, y0, w: Math.ceil(Math.max(...pts.map(p => p.x)) + pad) - x0, h: Math.ceil(Math.max(...pts.map(p => p.y)) + pad) - y0 };
    const canvas = document.createElement('canvas'); canvas.width = Math.round(dbox.w * K); canvas.height = Math.round(dbox.h * K);
    const dg = canvas.getContext('2d')!, dat = (x: number, y: number) => ({ x: (x - x0) * K, y: (y - y0) * K });
    for (const d of ds) { shadow(g, d, at, K); strip(dg, d, dat, K, kit.images.get(m.deck.file)!); }
    deck = { canvas, box: dbox };
  }
  progress?.(1);
  return { level, box, K, ground, deck };
}

/** How many finished bakes stay around: the level on screen plus the menu's likely next ones. */
const KEEP = 3;
const bakeKey = (level: TdLevel, box: WorldBox, K: number) => `${levelKey(level)}|${box.x0},${box.y0},${box.w},${box.h}|${K}`;

/**
 * The ground on screen, baked in slices (the caller draws a stand-in meanwhile), plus background bakes the menu asks
 * for with `prepare` so the level it starts next is ready at once. One bake runs at a time; the screen's wins.
 */
export class GroundBaker {
  private job: { key: string; level: TdLevel; cancelled: boolean; background: boolean; progress: number } | null = null;
  /** Finished bakes, most recently used last. */
  private done: Array<{ key: string; baked: Baked }> = [];
  constructor(private base: string, private onReady: (b: Baked) => void) {}

  private start(level: TdLevel, box: WorldBox, K: number, background: boolean) {
    const key = bakeKey(level, box, K);
    if (this.job?.key === key) { if (!background) this.job.background = false; return; }
    if (this.job) this.job.cancelled = true;
    const job = this.job = { key, level, cancelled: false, background, progress: 0 };
    bakeGround(this.base, level, box, K, () => job.cancelled, f => { job.progress = f; }).then(b => {
      if (job.cancelled || !b) return;
      this.done = [...this.done.filter(d => d.key !== key), { key, baked: b }].slice(-KEEP);
      this.job = null; this.onReady(b);
    }, e => { if (this.job === job) this.job = null; console.warn('ground bake failed', e); });
  }
  private find(key: string) {
    const hit = this.done.find(d => d.key === key);
    if (hit) this.done = [...this.done.filter(d => d !== hit), hit]; // most recently used
    return hit?.baked ?? null;
  }
  /** The bake for this level and box, or null while it is being made (it starts here, and `onReady` fires when done). */
  get(level: TdLevel, box: WorldBox, K: number): Baked | null {
    const hit = this.find(bakeKey(level, box, K));
    if (hit) return hit;
    this.start(level, box, K, false);
    // an older bake of the same level still lines up in world space: show it while the new one is made
    const lk = levelKey(level);
    return [...this.done].reverse().find(d => levelKey(d.baked.level) === lk)?.baked ?? null;
  }
  /** Bakes in the background unless the screen's bake is running; true once it is ready. */
  prepare(level: TdLevel, box: WorldBox, K: number): boolean {
    const key = bakeKey(level, box, K);
    if (this.done.some(d => d.key === key)) return true;
    if (!this.job || this.job.background) this.start(level, box, K, true);
    return false;
  }
  /** 0..1 for the bake under way for `level` (1 when one is ready, 0 when none has started). */
  progress(level: TdLevel): number {
    const lk = levelKey(level);
    if (this.done.some(d => levelKey(d.baked.level) === lk)) return 1;
    return this.job && levelKey(this.job.level) === lk ? this.job.progress : 0;
  }
}

type At = (x: number, y: number) => { x: number; y: number };
const path = (g: CanvasRenderingContext2D, d: Deck, at: At, dx = 0, dy = 0) => {
  g.beginPath(); d.line.forEach((p, i) => { const q = at(p.x, p.y); i ? g.lineTo(q.x + dx, q.y + dy) : g.moveTo(q.x + dx, q.y + dy); });
};
/** The deck's drop shadow, on the ground (the road below it darkens). */
function shadow(g: CanvasRenderingContext2D, d: Deck, at: At, K: number) {
  g.save(); g.lineCap = 'butt'; g.lineJoin = 'round';
  path(g, d, at, 0.6 * K, 1.4 * K); g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = (d.width + 1) * K;
  g.filter = `blur(${K * 0.8}px)`; g.stroke(); g.filter = 'none';
  g.restore();
}
/** The kit's deck strip run continuously along the over pass: each segment draws the next slice of the strip at its
 *  natural aspect (strip height → deck width), wrapping at the strip's end, so the planks keep their proportions. */
function strip(g: CanvasRenderingContext2D, d: Deck, at: At, K: number, image: HTMLImageElement) {
  const width = d.width * K, IW = image.naturalWidth || image.width, IH = image.naturalHeight || image.height, srcPerPx = IH / width;
  let u = 0;
  for (let i = 1; i < d.line.length; i++) {
    const p0 = at(d.line[i - 1].x, d.line[i - 1].y), p1 = at(d.line[i].x, d.line[i].y), len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    g.save(); g.translate(p0.x, p0.y); g.rotate(Math.atan2(p1.y - p0.y, p1.x - p0.x));
    for (let done = 0; done < len;) {
      const sx = u % IW, take = Math.min(len - done, (IW - sx) / srcPerPx);
      g.drawImage(image, sx, 0, Math.max(1, take * srcPerPx), IH, done, -width / 2, take + 0.6, width);
      done += take; u += take * srcPerPx;
    }
    g.restore();
  }
}
