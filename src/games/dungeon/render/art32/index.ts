// Purgatour 32 px art: PNG atlases exported by tools/purgatour-art/export.py, cut into cached canvases on demand.
// Nothing here generates art; it only crops frames, flips/rotates them with nearest-neighbour pixels, and makes hit flashes.
import atlasJson from './atlas.json';
import charsUrl from './chars.png';
import arsenalUrl from './arsenal.png';
import keepUrl from './zone-keep.png';
import cryptUrl from './zone-crypt.png';
import catacombsUrl from './zone-catacombs.png';
import deepUrl from './zone-deep.png';

export type Rect = [number, number, number, number];
export interface ZoneMeta { rects: Record<string, Rect>; ramp: string[]; lightKind: string; flameKind: string; decor: string[]; hang: string[] }
export interface AnimMeta { n: number; w: number; h: number; ax: number; ay: number; heights?: number[] }
interface Atlas {
  zones: Record<string, ZoneMeta>;
  chars: { rects: Record<string, Rect>; anims: Record<string, AnimMeta> };
  arsenal: { rects: Record<string, Rect>; grip: Record<string, [number, number]>; proj: Record<string, number>; muzzle: Record<string, Array<[number, number]>> };
  amb: Record<string, [number, number, number]>;
  tile: number; faceH: number; rise: number;
}
export const ATLAS = atlasJson as unknown as Atlas;
/** world.theme 0..3 */
export const ZONES = ['keep', 'crypt', 'catacombs', 'deep'] as const;
export type ZoneId = typeof ZONES[number];
export const zoneOf = (theme: number): ZoneId => ZONES[((theme % 4) + 4) % 4];

const URLS: Record<string, string> = { chars: charsUrl, arsenal: arsenalUrl, keep: keepUrl, crypt: cryptUrl, catacombs: catacombsUrl, deep: deepUrl };
const imgs: Record<string, HTMLImageElement> = {};
let loaded = 0, started = false;
/** Start loading every sheet (browser only). Safe to call repeatedly. */
export function loadArt(): void {
  if (started || typeof Image === 'undefined') return;
  started = true;
  for (const [k, u] of Object.entries(URLS)) {
    const im = new Image();
    im.onload = () => { loaded++; };
    im.src = u; imgs[k] = im;
  }
}
/** True once every sheet has decoded; until then the renderer keeps its previous frame contents. */
export const artReady = () => loaded === Object.keys(URLS).length;

const cache = new Map<string, HTMLCanvasElement>();
function canvas(w: number, h: number) { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }
/** A frame from a sheet as its own canvas (cached). */
export function cut(sheet: string, name: string): HTMLCanvasElement | null {
  const key = sheet + '|' + name, hit = cache.get(key);
  if (hit) return hit;
  const rects = sheet === 'chars' ? ATLAS.chars.rects : sheet === 'arsenal' ? ATLAS.arsenal.rects : ATLAS.zones[sheet]?.rects;
  const r = rects?.[name], im = imgs[sheet];
  if (!r || !im || !artReady()) return null;
  const c = canvas(r[2], r[3]); c.getContext('2d')!.drawImage(im, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
  cache.set(key, c); return c;
}
export const sheetImage = (sheet: string) => (artReady() ? imgs[sheet] : undefined);
export const zoneRect = (z: ZoneId, name: string) => ATLAS.zones[z].rects[name];

/** Character animation frame i of `anim` (wraps). */
export function charFrame(anim: string, i: number): HTMLCanvasElement | null {
  const m = ATLAS.chars.anims[anim]; if (!m) return null;
  return cut('chars', `${anim}:${((i % m.n) + m.n) % m.n}`);
}
export const anim = (name: string): AnimMeta | undefined => ATLAS.chars.anims[name];

/** Hit flash: every pixel of the sprite except its dark outline turns pale pink-white. */
export function flashOf(src: HTMLCanvasElement): HTMLCanvasElement {
  const key = 'flash|' + cacheId(src), hit = cache.get(key);
  if (hit) return hit;
  const c = canvas(src.width, src.height), g = c.getContext('2d')!;
  g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
  for (let i = 0; i < p.length; i += 4) if (p[i + 3]) {
    const dark = p[i] + p[i + 1] + p[i + 2] < 60;
    p[i] = dark ? 255 : 241; p[i + 1] = dark ? 214 : 232; p[i + 2] = dark ? 224 : 214;
  }
  g.putImageData(d, 0, 0); cache.set(key, c); return c;
}
const ids = new WeakMap<HTMLCanvasElement, number>(); let nextId = 1;
function cacheId(c: HTMLCanvasElement) { let i = ids.get(c); if (!i) { i = nextId++; ids.set(c, i); } return i; }

export const ROT_STEPS = 32;
/** Nearest-neighbour rotation about a pivot, snapped to ROT_STEPS; returns the canvas and where the pivot landed. */
export function rotated(src: HTMLCanvasElement, angle: number, px: number, py: number): { c: HTMLCanvasElement; ox: number; oy: number } {
  const step = ((Math.round(angle / (2 * Math.PI) * ROT_STEPS) % ROT_STEPS) + ROT_STEPS) % ROT_STEPS;
  const key = `rot|${cacheId(src)}|${step}|${px}|${py}`;
  const R = Math.ceil(Math.hypot(Math.max(px, src.width - px), Math.max(py, src.height - py))) + 1, size = R * 2 + 1;
  let c = cache.get(key);
  if (!c) {
    const a = step / ROT_STEPS * 2 * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
    const sd = src.getContext('2d')!.getImageData(0, 0, src.width, src.height).data;
    c = canvas(size, size); const g = c.getContext('2d')!, out = g.createImageData(size, size), o = out.data;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = x - R, dy = y - R, sx = Math.floor(px + dx * ca + dy * sa), sy = Math.floor(py - dx * sa + dy * ca);
      if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
      const si = (sy * src.width + sx) * 4, di = (y * size + x) * 4;
      o[di] = sd[si]; o[di + 1] = sd[si + 1]; o[di + 2] = sd[si + 2]; o[di + 3] = sd[si + 3];
    }
    g.putImageData(out, 0, 0); cache.set(key, c);
  }
  return { c, ox: R, oy: R };
}
/** Horizontal mirror (cached). */
export function mirrored(src: HTMLCanvasElement): HTMLCanvasElement {
  const key = 'mir|' + cacheId(src), hit = cache.get(key);
  if (hit) return hit;
  const c = canvas(src.width, src.height), g = c.getContext('2d')!;
  g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0); cache.set(key, c); return c;
}
export function hexRgb(h: string): [number, number, number] { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
