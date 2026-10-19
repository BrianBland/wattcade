import { circle, line, poly, rect, type G } from './prims';

/** What a trail animates with: `speed` m/s (intensity), `color` the rider's, `x0` where it starts (behind the rear wheel). */
export interface TrailCtx { t: number; speed: number; color: string; x0: number }

const N = 14;
const frac = (x: number) => x - Math.floor(x);
const hash = (i: number) => frac(Math.sin(i * 127.1 + 311.7) * 43758.5453);

/**
 * Draws trail `id` streaming back from (x0, −4.5) in rider space. Stateless: each particle's age comes from time and
 * its index. Nothing while stopped; longer and brighter the faster you ride.
 */
export function drawTrail(g: G, id: string, c: TrailCtx) {
  const k = Math.min(1, c.speed / 6);
  if (k <= 0.02 || id === 'none') return;
  const f = TRAILS[id]; if (!f) return;
  g.save(); f(g, c, k); g.restore();
}

/** Particles: `each(i, age, x, y)`; age 0 = just emitted at the wheel, 1 = gone. */
function stream(c: TrailCtx, k: number, rate: number, len: number, each: (i: number, a: number, x: number, y: number) => void) {
  for (let i = 0; i < N; i++) {
    const a = frac(c.t * rate + i / N);
    const x = c.x0 - a * len * (0.5 + k), y = -4.5 + (hash(i + Math.floor(c.t * rate + i / N) * 31) - 0.5) * 3;
    each(i, a, x, y);
  }
}
const alpha = (g: G, a: number, k: number) => { g.globalAlpha = Math.max(0, (1 - a) * k); };

const TRAILS: Record<string, (g: G, c: TrailCtx, k: number) => void> = {
  lightcycle: (g, c, k) => {
    const len = 18 + k * 28;
    for (let i = 0; i < len; i += 2) {
      const fade = (1 - i / len) * k;
      g.globalAlpha = fade * .28; rect(g, c.color, c.x0 - i - 2, -7, 2, 5);
      g.globalAlpha = fade * .9; rect(g, c.color, c.x0 - i - 2, -5.5, 2, 2);
      g.globalAlpha = fade; rect(g, '#e6ffff', c.x0 - i - 2, -5, 2, .5);
    }
  },
  sparks: (g, c, k) => stream(c, k, 1.6, 22, (i, a, x, y) => { alpha(g, a, k); rect(g, i % 3 ? '#ffd23b' : '#ff8a1a', x, y + a * a * 6, 0.7, 0.7); }),
  bubbles: (g, c, k) => stream(c, k, 0.8, 18, (i, a, x, y) => { alpha(g, a, k); g.strokeStyle = '#bfefff'; g.lineWidth = 0.35; g.beginPath(); g.arc(x, y - a * 5, 0.5 + (i % 3) * 0.3, 0, Math.PI * 2); g.stroke(); }),
  confetti: (g, c, k) => stream(c, k, 1, 20, (i, a, x, y) => { alpha(g, a, k); g.save(); g.translate(x, y + a * 4); g.rotate(c.t * 6 + i); rect(g, ['#ff2e93', '#ffd23b', '#00e5ff', '#7dffb0', '#a046ff'][i % 5], -0.5, -0.3, 1, 0.6); g.restore(); }),
  stars: (g, c, k) => stream(c, k, 1.1, 22, (_i, a, x, y) => { alpha(g, a, k); const r = 0.9 * (1 - a * 0.5); poly(g, '#fff3a0', [x, y - r], [x + r * 0.3, y - r * 0.3], [x + r, y], [x + r * 0.3, y + r * 0.3], [x, y + r], [x - r * 0.3, y + r * 0.3], [x - r, y], [x - r * 0.3, y - r * 0.3]); }),
  gold: (g, c, k) => stream(c, k, 1.3, 18, (i, a, x, y) => { alpha(g, a, k); if (i % 4) rect(g, '#ffe066', x, y + a * 3, 0.5, 0.5); else circle(g, '#ffd23b', x, y + a * 4, 0.7); }),
  leaves: (g, c, k) => stream(c, k, 0.7, 20, (i, a, x, y) => { alpha(g, a, k); g.save(); g.translate(x, y + a * 5 + Math.sin(c.t * 4 + i) * 0.8); g.rotate(Math.sin(c.t * 3 + i) * 1.2); g.fillStyle = ['#e8973a', '#c0392b', '#7cb342', '#ffb020'][i % 4]; g.beginPath(); g.ellipse(0, 0, 1, 0.45, 0, 0, Math.PI * 2); g.fill(); g.restore(); }),
  notes: (g, c, k) => stream(c, k, 0.9, 20, (i, a, x, y) => { alpha(g, a, k); const yy = y - a * 4 + Math.sin(c.t * 5 + i) * 0.6, col = i % 2 ? c.color : '#ffffff'; circle(g, col, x, yy, 0.55); line(g, col, 0.25, [x + 0.5, yy], [x + 0.5, yy - 2]); if (i % 3 === 0) line(g, col, 0.35, [x + 0.5, yy - 2], [x + 1.4, yy - 1.5]); }),
  pixels: (g, c, k) => stream(c, k, 1.2, 22, (i, a, x, y) => { alpha(g, a, k); const s = a < 0.5 ? 1 : 0.6; rect(g, i % 2 ? c.color : '#ffffff', Math.round(x), Math.round(y), s, s); }),
  rainbow: (g, c, k) => {
    const len = 14 + k * 24, cols = ['#e8322b', '#ff8a1a', '#ffd23b', '#22b14c', '#2a5bd7', '#a046ff'];
    cols.forEach((col, j) => {
      g.globalAlpha = 0.85 * k; g.strokeStyle = col; g.lineWidth = 0.6; g.beginPath();
      for (let s = 0; s <= 1.0001; s += 0.1) { const x = c.x0 - s * len, y = -6 + j * 0.6 + Math.sin(c.t * 3 - s * 6) * 0.8 * s; if (s === 0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
    });
  },
  flames: (g, c) => {
    const hot = Math.max(0, (c.speed - 4) / 6), len = 3 + hot * 14;
    if (hot <= 0) return;
    for (let j = 0; j < 3; j++) { g.globalAlpha = 0.9 * Math.min(1, hot * 2); const l = len * (1 - j * 0.25) + Math.sin(c.t * 30 + j) * 1.2, y = -4.5 + (j - 1) * 0.9; poly(g, ['#ffd23b', '#ff8a1a', '#e8322b'][j], [c.x0 + 0.6, y - 0.8], [c.x0 - l, y], [c.x0 + 0.6, y + 0.8]); }
  },
  lightning: (g, c, k) => {
    if (Math.floor(c.t * 9) % 3 === 0) return; // flicker
    const len = 12 + k * 22; g.globalAlpha = k; g.shadowColor = '#7fe0ff'; g.shadowBlur = 3;
    const pts: Array<[number, number]> = [];
    for (let s = 0; s <= 6; s++) pts.push([c.x0 - (s / 6) * len, -4.5 + (s ? (hash(s + Math.floor(c.t * 9) * 7) - 0.5) * 3 : 0)]);
    line(g, '#dff8ff', 0.5, ...pts);
  },
};
export const TRAIL_IDS = Object.keys(TRAILS);
