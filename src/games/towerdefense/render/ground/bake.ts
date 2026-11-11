// Loads packed ground kits (public/td/kits/<style>/) and bakes a level's ground in slices, so a new level shows the
// vector stand-in for a moment instead of stalling a frame. DOM side of the compositor (compose.ts).
import type { TdLevel } from '../../sim/level';
import { loadImage, loadManifest } from '../assets';
import { composeGround, scatterPlan, type Img, type KitPixels, type WorldBox } from './compose';
import { decks, type Deck } from './deck';
import type { KitManifest, KitStamp } from './kit';

/** Ground styles with a packed kit; any other style (level 0's 'painted' when narrowed) uses the first. */
export const KIT_STYLES = ['outpost', 'scrapyard', 'badlands', 'volcanic', 'overgrown', 'blight'] as const;
export const kitStyle = (style: string): string => (KIT_STYLES as readonly string[]).includes(style) ? style : KIT_STYLES[0];

interface Kit { manifest: KitManifest; px: KitPixels; images: Map<string, HTMLImageElement> }
/** A finished bake: the ground and the decks over it, both in world space over `box` at K px per unit. */
export interface Baked { level: TdLevel; box: WorldBox; K: number; ground: HTMLCanvasElement; deck: { canvas: HTMLCanvasElement; box: WorldBox } | null }

function pixels(image: HTMLImageElement, ppu: number): Img {
  const c = document.createElement('canvas'); c.width = image.naturalWidth || image.width; c.height = image.naturalHeight || image.height;
  const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(image, 0, 0);
  return { d: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height, ppu };
}
/** Spare the frame: run slices until this much time (ms) has passed, then yield to the browser. */
const BUDGET_MS = 6;
const nextSlice = () => new Promise<void>(r => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));

export class GroundBaker {
  private kits = new Map<string, Promise<Kit>>();
  private job: { key: string; cancelled: boolean } | null = null;
  private done: Baked | null = null;
  private doneKey = '';
  constructor(private base: string, private onReady: () => void) {}

  private kit(style: string): Promise<Kit> {
    let p = this.kits.get(style);
    if (!p) {
      const root = `${this.base}td/kits/${style}/`;
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
      p.catch(() => this.kits.delete(style)); // a failed load may be retried with the next level
      this.kits.set(style, p);
    }
    return p;
  }

  /** The bake for this level and box, or null while it is being made (it starts here, and `onReady` fires when done). */
  get(level: TdLevel, box: WorldBox, K: number): Baked | null {
    const key = `${level.id}|${level.seed ?? ''}|${box.x0},${box.y0},${box.w},${box.h}|${K}`;
    if (this.done && this.doneKey === key && this.done.level === level) return this.done;
    if (this.job?.key !== key) {
      if (this.job) this.job.cancelled = true;
      const job = this.job = { key, cancelled: false };
      this.bake(level, box, K, job).then(b => {
        if (job.cancelled || !b) return;
        this.done = b; this.doneKey = key; this.job = null; this.onReady();
      }, e => { if (this.job === job) this.job = null; console.warn('ground bake failed', e); });
    }
    // an older bake of the same level still lines up in world space: show it while the new one is made
    return this.done?.level === level ? this.done : null;
  }

  private async bake(level: TdLevel, box: WorldBox, K: number, job: { cancelled: boolean }): Promise<Baked | null> {
    const kit = await this.kit(kitStyle(level.style));
    if (job.cancelled) return null;
    const W = Math.round(box.w * K), H = Math.round(box.h * K);
    const ground = document.createElement('canvas'); ground.width = W; ground.height = H;
    const g = ground.getContext('2d')!, img = g.createImageData(W, H);
    const steps = composeGround(level, kit.manifest, kit.px, box, K, img.data);
    for (let t0 = performance.now(), r = steps.next(); !r.done; r = steps.next()) {
      if (performance.now() - t0 > BUDGET_MS) { await nextSlice(); if (job.cancelled) return null; t0 = performance.now(); }
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
    return { level, box, K, ground, deck };
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
