// Menu art: every level drawn with its real ground kit, pads and the outpost, as images for the ride select's cards
// and the campaign grid (in place of vector map sketches). Small tiles are baked here, a few at a time in the
// background; the big preview of a level is cut from the full-screen bake the menu makes so the level starts at once.
import { FIELD_H, FIELD_W } from '../sim/defs';
import { levelGeometry, type TdLevel } from '../sim/level';
import { bakeGround, levelKey, type Baked } from './ground/bake';
import type { Machinery } from './machinery';
import { GROUND_SWATCH } from './levelSelect';

/** Tile resolution, px per unit (the 80×112 field → 160×224, sharp for ~80 px tiles at 2x). */
export const TILE_K = 2;
/** Big preview resolution, px per unit (400×560), cut from a screen bake. */
export const PREVIEW_K = 5;
type Tier = 'tile' | 'preview';
/** Object URLs by level, orientation and tier; module level, so they outlive a renderer (the next visit is instant). */
const URLS = new Map<string, string>();
const artKey = (level: TdLevel, turned: boolean, tier: Tier) => `${levelKey(level)}|${turned ? 'L' : 'P'}|${tier}`;

/** The still's canvas size and the world → canvas transform (landscape turns the field: turret left, hive right). */
export function stillFrame(turned: boolean, k: number): { w: number; h: number; m: [number, number, number, number, number, number] } {
  return turned
    ? { w: Math.round(FIELD_H * k), h: Math.round(FIELD_W * k), m: [0, k, -k, 0, FIELD_H * k, 0] }
    : { w: Math.round(FIELD_W * k), h: Math.round(FIELD_H * k), m: [k, 0, 0, k, 0, 0] };
}

/** Draws `level` from a bake: ground, bridge decks, empty pad markers and the outpost. */
export function drawStill(g: CanvasRenderingContext2D, src: Baked, level: TdLevel, turned: boolean, k: number, machinery: Machinery | null) {
  const f = stillFrame(turned, k), geo = levelGeometry(level);
  g.fillStyle = (GROUND_SWATCH[level.style] ?? GROUND_SWATCH.outpost).ground; g.fillRect(0, 0, f.w, f.h);
  g.save(); g.setTransform(...f.m); g.imageSmoothingQuality = 'high';
  g.drawImage(src.ground, src.box.x0, src.box.y0, src.box.w, src.box.h);
  if (src.deck) g.drawImage(src.deck.canvas, src.deck.box.x0, src.deck.box.y0, src.deck.box.w, src.deck.box.h);
  g.restore();
  const P = (x: number, y: number) => ({ x: f.m[0] * x + f.m[2] * y + f.m[4], y: f.m[1] * x + f.m[3] * y + f.m[5] });
  g.strokeStyle = 'rgba(255,214,110,0.55)'; g.lineWidth = Math.max(1, k * 0.25);
  for (const p of geo.pads) {
    const c = P(p.x, p.y), r = 3.6 * k;
    g.beginPath();
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + Math.PI / 6; g[i ? 'lineTo' : 'moveTo'](c.x + Math.cos(a) * r, c.y + Math.sin(a) * r); }
    g.closePath(); g.stroke();
  }
  const b = P(geo.base.x, geo.base.y);
  machinery?.still(g, geo, b.x, b.y, k, turned ? Math.PI / 2 : 0);
}

/** One picture to make: a level in one orientation, tile-sized or card-sized (`big`). */
export interface ArtWish { level: TdLevel; turned: boolean; big?: boolean }

const toUrl = (c: HTMLCanvasElement) => new Promise<string | null>((resolve) => {
  if (typeof c.toBlob !== 'function') { resolve(c.toDataURL()); return; }
  c.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), 'image/webp', 0.86);
});

export class LevelArt {
  private queue: ArtWish[] = [];
  private busy = false;
  private stopped = false;
  constructor(private base: string, private machinery: Machinery, private onChange: () => void) {}

  /** The level's image: the big preview when asked for and made, else its tile; null while neither exists. */
  url(level: TdLevel, turned: boolean, preview = false): string | null {
    return (preview && URLS.get(artKey(level, turned, 'preview'))) || URLS.get(artKey(level, turned, 'tile')) || null;
  }
  /**
   * Pictures to bake, most wanted first (replaces the previous wish list; the one under way finishes). `big` bakes a
   * card-sized picture (PREVIEW_K) into the preview slot, unless a screen bake already gave one.
   */
  want(wishes: readonly ArtWish[]) {
    const seen = new Set<string>();
    this.queue = wishes.filter((w) => {
      const k = artKey(w.level, w.turned, w.big ? 'preview' : 'tile');
      if (URLS.has(k) || seen.has(k)) return false;
      seen.add(k); return true;
    });
    void this.pump();
  }
  /** A finished screen bake of `level`: cut its big preview (once per level and orientation). */
  offer(b: Baked, turned: boolean) {
    const key = artKey(b.level, turned, 'preview');
    if (URLS.has(key) || this.stopped) return;
    URLS.set(key, ''); // claimed
    void this.machinery.loaded.then(() => this.encode(b, b.level, turned, PREVIEW_K)).then((url) => {
      if (url) { URLS.set(key, url); this.onChange(); } else URLS.delete(key);
    });
  }
  stop() { this.stopped = true; this.queue = []; }

  private async encode(src: Baked, level: TdLevel, turned: boolean, k: number) {
    const f = stillFrame(turned, k), c = document.createElement('canvas'); c.width = f.w; c.height = f.h;
    drawStill(c.getContext('2d')!, src, level, turned, k, this.machinery);
    return toUrl(c);
  }
  private async pump() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.machinery.loaded.catch(() => {});
      for (let job = this.queue.shift(); job && !this.stopped; job = this.queue.shift()) {
        const key = artKey(job.level, job.turned, job.big ? 'preview' : 'tile'), k = job.big ? PREVIEW_K : TILE_K;
        if (URLS.has(key)) continue;
        const b = await bakeGround(this.base, job.level, { x0: 0, y0: 0, w: FIELD_W, h: FIELD_H }, k, () => this.stopped).catch(() => null);
        if (!b || URLS.has(key)) continue;
        const url = await this.encode(b, job.level, job.turned, k);
        if (url) { URLS.set(key, url); this.onChange(); }
      }
    } finally { this.busy = false; }
  }
}
