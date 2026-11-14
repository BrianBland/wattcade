// Portals: how you get to the sea floor and the Moon (and back) on the road. Nothing of the other side shows until
// you ride through; the portal is a window onto it, then the whole scene swaps at once behind a flash and the portal
// closes behind you. Shared by the overworld and Full Send renderers.
import type { BiomeId } from '../sim/terrain';
import type { G } from './paint';
import { GATEWAYS } from './gateway';

/** Portal size (buffer px, fully open), how far behind you it takes to shut (m), and the flash length (s). */
export const PORTAL = { rx: 18, ry: 32, closeM: 6, flashS: 0.45 };

/** How open the portal at `x` is for a rider at `d`: fully open ahead, shrinking shut over `closeM` behind. */
export function portalOpen(x: number, d: number, closeM = PORTAL.closeM): number {
  const past = d - x;
  return past <= 0 ? 1 : Math.max(0, 1 - past / closeM);
}
/** Flash strength `since` seconds after riding through (1 → 0, eased). */
export function portalFlash(since: number, dur = PORTAL.flashS): number {
  if (since < 0 || since >= dur) return 0;
  const q = 1 - since / dur;
  return q * q;
}
export interface PortalColors { rim: string; glow: string }
/** The portal's colours come from where it leads: a biome's gateway trim, or explicit colours (a game's accent). */
export function portalColors(to: BiomeId | PortalColors): PortalColors {
  if (typeof to !== 'string') return to;
  const st = GATEWAYS[to];
  return { rim: st.trim, glow: st.post };
}

/** Half-width (px) of a pixel oval of radii rx, ry on row `dy` (from its centre), or -1 off the oval. */
export function ovalHalf(rx: number, ry: number, dy: number): number {
  if (rx < 0 || ry <= 0 || Math.abs(dy) > ry) return -1;
  return Math.floor(rx * Math.sqrt(Math.max(0, 1 - (dy / ry) * (dy / ry))) + 0.5);
}

function rgb(c: string): [number, number, number] {
  const h = c.trim().replace('#', '');
  const v = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const n = parseInt(v.slice(0, 6), 16);
  return Number.isFinite(n) && v.length >= 6 ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [255, 255, 255];
}
const hex = ([r, g, b]: number[]) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a: number[], b: number[], q: number) => a.map((v, i) => v + (b[i] - v) * q);

let buf: { c: HTMLCanvasElement; g: CanvasRenderingContext2D } | null = null;
function scratch(w: number, h: number) {
  if (typeof document === 'undefined') return null;
  if (!buf) { const c = document.createElement('canvas'); const g = c.getContext('2d', { willReadFrequently: true }); if (!g) return null; buf = { c, g }; }
  if (buf.c.width < w || buf.c.height < h) { buf.c.width = Math.max(buf.c.width, w); buf.c.height = Math.max(buf.c.height, h); }
  return buf;
}

/**
 * Draw a portal standing on the road at (x, y), opened `k` (0..1), in the overworld's pixel style: a hard-edged oval
 * with a 1 px rim, a dithered glow, a banded pixel swirl and running lights. `window` paints the far side (in buffer
 * coordinates; it lands only inside the oval), so the destination shows through before you ride in; without one the
 * oval is a swirl of the portal's own colours. `swirl` (0..1) is how strongly the swirl shows over the window.
 */
export function drawPortal(g: G, x: number, y: number, t: number, k: number, to: BiomeId | PortalColors, window: ((g: G) => void) | null, swirl = 0.3) {
  if (k <= 0.02) return;
  const rx = Math.max(1, Math.round(PORTAL.rx * k)), ry = Math.max(1, Math.round(PORTAL.ry * k));
  const cx = Math.round(x), cy = Math.round(y) - ry - 1, { rim, glow } = portalColors(to);
  const R = rgb(rim), GL = rgb(glow), white = [255, 255, 255], black = [8, 10, 20];
  // dithered glow: three rings outside the oval, every other pixel, fading out and shimmering
  const phase = Math.floor(t * 6);
  g.fillStyle = glow;
  for (let i = 1; i <= 3; i++) {
    g.globalAlpha = 0.55 - i * 0.13;
    for (let dy = -ry - i; dy <= ry + i; dy++) {
      const o = ovalHalf(rx + i, ry + i, dy), n = ovalHalf(rx + i - 1, ry + i - 1, dy);
      if (o < 0) continue;
      for (let dx = n + 1; dx <= o; dx++) for (const sx of [cx - dx, cx + dx]) if (((sx + cy + dy + i + phase) & 1) === 0) g.fillRect(sx, cy + dy, 1, 1);
      if (n < 0) for (let dx = -o; dx <= o; dx++) if (((cx + dx + cy + dy + i + phase) & 1) === 0) g.fillRect(cx + dx, cy + dy, 1, 1);
    }
  }
  g.globalAlpha = 1;
  // the window: painted off screen, cut to the oval pixel by pixel, a banded swirl over it
  const w = rx * 2 + 1, h = ry * 2 + 1, sc = scratch(w, h);
  if (sc) {
    const o = sc.g;
    o.clearRect(0, 0, w, h);
    if (window) { o.save(); o.translate(-(cx - rx), -(cy - ry)); try { window(o); } catch { /* bad window: swirl only */ } o.restore(); }
    const img = o.getImageData(0, 0, w, h), px = img.data;
    const deep = mix(R, black, 0.72), mid = mix(R, black, 0.35);
    for (let j = 0; j < h; j++) {
      const dy = j - ry, half = ovalHalf(rx, ry, dy);
      for (let i = 0; i < w; i++) {
        const q = (j * w + i) * 4, dx = i - rx;
        if (half < 0 || Math.abs(dx) > half) { px[q + 3] = 0; continue; }
        const nx = dx / rx, ny = dy / ry, r = Math.sqrt(nx * nx + ny * ny);
        const arm = (((Math.atan2(ny, nx) / (Math.PI * 2)) * 3 + r * 1.7 - t * 0.55) % 1 + 1) % 1;
        if (!window || px[q + 3] === 0) { // no far side: the portal's own colours, in hard bands
          const c = arm < 0.3 ? mid : deep;
          px[q] = c[0]; px[q + 1] = c[1]; px[q + 2] = c[2]; px[q + 3] = 255;
        }
        const s = arm < 0.16 && r > 0.12 ? swirl : 0; // swirl arms, stepped, no gradients; they meet in the dark middle
        if (s > 0) { px[q] += (255 - px[q]) * s; px[q + 1] += (255 - px[q + 1]) * s; px[q + 2] += (255 - px[q + 2]) * s; }
      }
    }
    o.putImageData(img, 0, 0);
    g.drawImage(sc.c, 0, 0, w, h, cx - rx, cy - ry, w, h);
  }
  // a crisp 1 px rim, a shade lighter where the light catches it
  for (let dy = -ry; dy <= ry; dy++) {
    const o = ovalHalf(rx, ry, dy), n = ovalHalf(rx - 1, ry - 1, dy), from = n < 0 ? 0 : n + 1;
    g.fillStyle = dy < -ry * 0.4 ? hex(mix(R, white, 0.35)) : rim;
    g.fillRect(cx - o, cy + dy, Math.max(1, o - from + 1), 1);
    g.fillRect(cx + from, cy + dy, Math.max(1, o - from + 1), 1);
  }
  // running lights around the rim
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + t * 1.6, px = Math.round(cx + Math.cos(a) * rx), py = Math.round(cy + Math.sin(a) * ry);
    g.fillStyle = i % 3 === 0 ? '#ffffff' : hex(mix(GL, white, 0.3));
    g.fillRect(px - (i % 3 === 0 ? 1 : 0), py - (i % 3 === 0 ? 1 : 0), i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
  }
  // sparks drifting off the rim
  for (let i = 0; i < 10; i++) {
    const ph = (t * 0.8 + i * 0.137) % 1, a = i * 2.4 + t * 0.3;
    if (ph > 0.75) continue;
    g.fillStyle = i % 2 ? rim : '#ffffff';
    g.fillRect(Math.round(cx + Math.cos(a) * (rx + 2 + ph * 10)), Math.round(cy + Math.sin(a) * (ry + 2 + ph * 10)), 1, 1);
  }
  // a glowing pad where it touches the road
  g.fillStyle = rim; g.fillRect(cx - rx - 2, Math.round(y), rx * 2 + 5, 1);
  g.fillStyle = hex(mix(R, black, 0.4)); g.fillRect(cx - rx - 1, Math.round(y) + 1, rx * 2 + 3, 1);
}

/** The flash as you ride through: the portal's colour, white at the centre, over the whole scene. */
export function drawPortalFlash(g: G, W: number, H: number, cx: number, cy: number, f: number, to: BiomeId | PortalColors) {
  if (f <= 0.01) return;
  const { rim } = portalColors(to);
  g.globalAlpha = 0.7 * f; g.fillStyle = rim; g.fillRect(0, 0, W, H);
  const r = Math.max(W, H) * (0.2 + (1 - f) * 0.8), grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.globalAlpha = 0.85 * f; g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.globalAlpha = 1;
}
