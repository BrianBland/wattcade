// Shared fill-up action button for canvas renderers (Canvas 2D only; no DOM, Preact or three imports).
// The button itself is the cooldown: it fills bottom-to-top as the action refills, tinted by the rider's
// current effort, then glows in its own colour and pulses when ready. Pair with `core/cooldown.ts`.

export interface ActionButtonSpec {
  x: number; y: number; w: number; h: number;   // canvas px
  label: string;                                // e.g. 'Strike'
  glyph?: string;                               // controller button or icon character, e.g. 'A'
  fill: number;                                 // 0..1 (1 = ready)
  readyColor: string;                           // '#rrggbb'
  effortTint?: string;                          // '#rrggbb' fill colour while refilling (see effortTint())
  ready: boolean;                               // full and usable now
  usable?: boolean;                             // false = ready but nothing to do (dimmed, no pulse). Default true.
  t?: number;                                   // seconds, drives pulse and flourish
  flourish?: number;                            // 0..1 effort intensity: 0 none, >0.3 shimmer, >0.6 embers, >0.85 flames
  scale?: number;                               // text scale (default derives from h)
}

/** Effort palette (matches the shell's zone widget colours), zone 1..5. */
export const ZONE_TINTS = ['#8a8aa0', '#8a8aa0', '#3b82ff', '#2de26a', '#ffd23b', '#ff4d4d'];
export const effortTint = (zone: number) => ZONE_TINTS[Math.max(1, Math.min(5, Math.round(zone)))];
/** Flourish intensity for a power zone: none in Z1, rising to 1 in Z5. */
export const effortFlourish = (zone: number) => Math.max(0, Math.min(1, (Math.round(zone) - 1) / 4));

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', ''), n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Mix a colour toward its grey (amt 0..1). */
export function desaturate(hex: string, amt: number, darken = 0): string {
  const [r, g, b] = rgb(hex), y = 0.3 * r + 0.59 * g + 0.11 * b, k = 1 - darken;
  const m = (c: number) => Math.round((c + (y - c) * amt) * k);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
const rgba = (hex: string, a: number) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };

function round(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/** Pure: the y of the fill edge for a button (bottom-to-top). */
export const fillEdgeY = (b: Pick<ActionButtonSpec, 'y' | 'h' | 'fill'>) => b.y + b.h * (1 - Math.max(0, Math.min(1, b.fill)));

export function drawActionButton(g: CanvasRenderingContext2D, b: ActionButtonSpec): void {
  const { x, y, w, h } = b, t = b.t ?? 0, usable = b.usable ?? true, r = Math.min(w, h) * 0.18;
  const fill = Math.max(0, Math.min(1, b.fill)), live = b.ready && usable;
  const s = b.scale ?? h / 60;
  g.save();
  // ready glow
  if (live) {
    const p = 0.55 + 0.45 * Math.sin(t * 5);
    g.shadowColor = b.readyColor; g.shadowBlur = 10 + 14 * p;
  }
  // body: greyed version of the ready colour
  round(g, x, y, w, h, r);
  g.fillStyle = desaturate(b.readyColor, 0.85, 0.72); g.fill();
  g.shadowBlur = 0;
  // fill from the bottom
  g.save(); round(g, x, y, w, h, r); g.clip();
  const ey = fillEdgeY(b);
  if (fill > 0) {
    g.fillStyle = b.ready ? (usable ? b.readyColor : desaturate(b.readyColor, 0.8, 0.55)) : desaturate(b.effortTint ?? b.readyColor, 0.25, 0.15);
    g.fillRect(x, ey, w, y + h - ey);
    g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(x, ey, w, Math.min(h * 0.08, y + h - ey)); // edge highlight
  }
  // effort flourish on the rising edge
  const fl = b.ready ? 0 : (b.flourish ?? 0);
  if (fl > 0.3 && fill > 0 && fill < 1) {
    const tint = b.effortTint ?? b.readyColor;
    const sh = (Math.sin(t * 6) + 1) / 2;
    g.fillStyle = rgba(tint, 0.25 + 0.35 * sh); g.fillRect(x, ey - 2 * s, w, 3 * s); // shimmer
    if (fl > 0.6) for (let i = 0; i < 6; i++) { // embers rising off the edge
      const ph = (t * 1.3 + i * 0.37) % 1, ex = x + w * ((i * 0.618 + t * 0.07) % 1);
      g.fillStyle = rgba(fl > 0.85 ? '#ffe08a' : tint, 1 - ph); g.fillRect(ex, ey - ph * h * 0.3, 2.5 * s, 2.5 * s);
    }
    if (fl > 0.85) { // flame tongues
      g.fillStyle = rgba('#ff7a2a', 0.55);
      for (let i = 0; i < 5; i++) { const fx = x + (w * (i + 0.5)) / 5, fh = h * (0.06 + 0.06 * Math.abs(Math.sin(t * 9 + i * 1.7)));
        g.beginPath(); g.moveTo(fx - w * 0.07, ey); g.lineTo(fx, ey - fh); g.lineTo(fx + w * 0.07, ey); g.fill(); }
    }
  }
  g.restore();
  // border
  round(g, x, y, w, h, r);
  g.lineWidth = Math.max(1.5, 2 * s);
  g.strokeStyle = live ? b.readyColor : desaturate(b.readyColor, 0.6, 0.35); g.stroke();
  if (live) { g.globalAlpha = 0.35 + 0.35 * Math.sin(t * 5); g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(1, s); round(g, x + 2 * s, y + 2 * s, w - 4 * s, h - 4 * s, r * 0.8); g.stroke(); g.globalAlpha = 1; }
  // text: outlined so it reads over any fill level
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  const txt = (str: string, cy: number, px: number, col: string) => {
    g.font = `900 ${Math.round(px)}px sans-serif`;
    g.lineWidth = Math.max(2, px * 0.22); g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText(str, x + w / 2, cy, w - 6 * s);
    g.fillStyle = col; g.fillText(str, x + w / 2, cy, w - 6 * s);
  };
  const textCol = live ? '#ffffff' : '#c9c9d4';
  if (b.glyph) { txt(b.glyph, y + h * 0.38, 22 * s, textCol); txt(b.label, y + h * 0.76, 12 * s, textCol); }
  else txt(b.label, y + h / 2, 14 * s, textCol);
  g.restore();
}
