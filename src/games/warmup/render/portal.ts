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
/** The portal's colours come from where it leads. */
export function portalColors(to: BiomeId): { rim: string; glow: string } {
  const st = GATEWAYS[to];
  return { rim: st.trim, glow: st.post };
}

/**
 * Draw a portal standing on the road at (x, y), opened `k` (0..1). `window` paints the far side (full-screen; it is
 * clipped to the portal), so the destination shows through it before you ride in.
 */
export function drawPortal(g: G, x: number, y: number, t: number, k: number, to: BiomeId, window: (g: G) => void) {
  if (k <= 0.02) return;
  const rx = PORTAL.rx * k, ry = PORTAL.ry * k, cy = y - ry - 1, { rim, glow } = portalColors(to);
  // halo
  for (let i = 3; i >= 1; i--) {
    g.globalAlpha = 0.12 + 0.05 * Math.sin(t * 3 + i); g.fillStyle = glow;
    g.beginPath(); g.ellipse(x, cy, rx + i * 3, ry + i * 3, 0, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  // the far side, with a slow swirl over it
  g.save();
  g.beginPath(); g.ellipse(x, cy, rx, ry, 0, 0, Math.PI * 2); g.clip();
  window(g);
  g.strokeStyle = '#ffffff'; g.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    g.globalAlpha = 0.22;
    g.beginPath();
    for (let a = 0; a < Math.PI * 3; a += 0.25) {
      const r = a / (Math.PI * 3), ang = a + t * 2.2 + (i * Math.PI * 2) / 3;
      const px = x + Math.cos(ang) * rx * r, py = cy + Math.sin(ang) * ry * r;
      if (a === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.stroke();
  }
  g.restore();
  // rim: a ring of running lights
  const n = 26;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + t * 1.6, px = x + Math.cos(a) * rx, py = cy + Math.sin(a) * ry;
    g.globalAlpha = 1; g.fillStyle = i % 3 === 0 ? '#ffffff' : rim;
    g.fillRect(Math.round(px) - 1, Math.round(py) - 1, 2, 2);
  }
  // sparks drifting off the rim
  for (let i = 0; i < 10; i++) {
    const ph = (t * 0.8 + i * 0.137) % 1, a = i * 2.4 + t * 0.3;
    const px = x + Math.cos(a) * (rx + 2 + ph * 10), py = cy + Math.sin(a) * (ry + 2 + ph * 10);
    g.globalAlpha = (1 - ph) * 0.9; g.fillStyle = i % 2 ? rim : '#ffffff';
    g.fillRect(Math.round(px), Math.round(py), 1, 1);
  }
  // a glowing pad where it touches the road
  g.globalAlpha = 0.6; g.fillStyle = rim; g.fillRect(Math.round(x - rx - 2), Math.round(y), Math.round(rx * 2 + 4), 1);
  g.globalAlpha = 1;
}

/** The flash as you ride through: the portal's colour, white at the centre, over the whole scene. */
export function drawPortalFlash(g: G, W: number, H: number, cx: number, cy: number, f: number, to: BiomeId) {
  if (f <= 0.01) return;
  const { rim } = portalColors(to);
  g.globalAlpha = 0.7 * f; g.fillStyle = rim; g.fillRect(0, 0, W, H);
  const r = Math.max(W, H) * (0.2 + (1 - f) * 0.8), grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.globalAlpha = 0.85 * f; g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.globalAlpha = 1;
}
