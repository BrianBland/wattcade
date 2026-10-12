import { circle, line, poly, rect, oval, ring, quad, shade, type G } from './prims';

/** What a trail animates with: `speed` m/s (intensity), `color` the rider's, `x0` where it starts (behind the rear wheel). */
export interface TrailCtx { t: number; speed: number; color: string; x0: number }

const N = 18;
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
  sparks: (g, c, k) => stream(c, k, 1.6, 22, (i, a, x, y) => {
    alpha(g, a, k); const yy = y + a * a * 6;
    line(g, '#e79a34', .35, [x + .65, yy - .5], [x - .35, yy + .25]); circle(g, '#fff4c6', x, yy, .22);
  }),
  bubbles: (g, c, k) => stream(c, k, .8, 18, (i, a, x, y) => {
    alpha(g, a, k); const yy = y - a * 5, r = .5 + (i % 3) * .3;
    circle(g, '#aedcee33', x, yy, r); ring(g, '#8fcbdc', .17, x, yy, r);
    quad(g, '#f0ffff', .16, [x - r * .6, yy - r * .35], [x - r * .3, yy - r], [x + r * .3, yy - r * .7]);
  }),
  confetti: (g, c, k) => stream(c, k, 1, 20, (i, a, x, y) => {
    alpha(g, a, k); g.save(); g.translate(x, y + a * 4); g.rotate(c.t * 6 + i);
    const col = ['#ff2e93', '#ffd23b', '#00e5ff', '#7dffb0', '#a046ff'][i % 5];
    poly(g, col, [-.65, -.4], [.55, -.3], [.7, .2], [-.45, .4]); line(g, shade(col, 1.5), .14, [-.55, -.3], [.5, -.22]); g.restore();
  }),
  stars: (g, c, k) => stream(c, k, 1.1, 22, (_i, a, x, y) => {
    alpha(g, a, k); const r = .9 * (1 - a * .5);
    poly(g, '#e8b656', [x, y - r], [x + r * .3, y - r * .3], [x + r, y], [x + r * .3, y + r * .3], [x, y + r], [x - r * .3, y + r * .3], [x - r, y], [x - r * .3, y - r * .3]);
    poly(g, '#fff2bd', [x, y - r], [x, y], [x - r, y], [x - r * .3, y - r * .3]); circle(g, '#fffdf0', x, y, .16);
  }),
  gold: (g, c, k) => stream(c, k, 1.3, 18, (i, a, x, y) => {
    alpha(g, a, k); const yy = y + a * 4;
    if (i % 3) circle(g, '#fff0a5', x, yy, .18);
    else { const w = .2 + Math.abs(Math.cos(c.t * 5 + i)) * .6; oval(g, '#e1a43b', x, yy, w, .85); oval(g, '#ffe28a', x - .08, yy - .06, w * .66, .59); }
  }),
  leaves: (g, c, k) => stream(c, k, .7, 20, (i, a, x, y) => {
    alpha(g, a, k); g.save(); g.translate(x, y + a * 5 + Math.sin(c.t * 4 + i) * .8); g.rotate(Math.sin(c.t * 3 + i) * 1.2);
    const col = ['#e8973a', '#c0392b', '#7cb342', '#ffb020'][i % 4];
    poly(g, col, [-1.2, 0], [-.35, -.55], [.8, -.4], [1.25, 0], [.3, .48], [-.8, .3]);
    line(g, shade(col, 1.45), .14, [-1.1, 0], [.9, 0]); g.restore();
  }),
  notes: (g, c, k) => stream(c, k, .9, 20, (i, a, x, y) => {
    alpha(g, a, k); const yy = y - a * 4 + Math.sin(c.t * 5 + i) * .6, col = i % 2 ? c.color : '#eff5f3';
    oval(g, '#253347', x, yy, .72, .55, -.25); oval(g, col, x -.07, yy -.07, .57, .38, -.25);
    line(g, col, .3, [x + .5, yy], [x + .5, yy - 2]); line(g, shade(col, 1.4), .12, [x + .4, yy -.35], [x + .4, yy - 1.85]);
    if (i % 3 === 0) quad(g, col, .35, [x + .5, yy - 2], [x + 1.9, yy - 1.7], [x + 1.3, yy - .9]);
  }),
  pixels: (g, c, k) => stream(c, k, 1.2, 22, (i, a, x, y) => {
    alpha(g, a, k); const s = a < .5 ? 1 : .6, col = i % 2 ? c.color : '#eef6ff';
    rect(g, col, x, y, s, s); poly(g, shade(col, 1.5), [x, y], [x + s, y], [x + s * .7, y + s * .3], [x + s * .2, y + s * .3]);
  }),
  rainbow: (g, c, k) => {
    const len = 14 + k * 24, cols = ['#e8322b', '#ff8a1a', '#ffd23b', '#22b14c', '#2a5bd7', '#a046ff'];
    cols.forEach((col, j) => {
      g.globalAlpha = 0.85 * k; g.strokeStyle = col; g.lineWidth = 0.6; g.beginPath();
      for (let s = 0; s <= 1.0001; s += 0.1) { const x = c.x0 - s * len, y = -6 + j * 0.6 + Math.sin(c.t * 3 - s * 6) * 0.8 * s; if (s === 0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
      g.globalAlpha *= .25; g.lineWidth = .12; g.strokeStyle = '#fff9e6'; g.stroke();
    });
  },
  flames: (g, c) => {
    const hot = Math.max(0, (c.speed - 4) / 6), len = 3 + hot * 14;
    if (hot <= 0) return;
    for (let j = 0; j < 3; j++) {
      g.globalAlpha = .85 * Math.min(1, hot * 2); const l = len * (1 - j * .25), y = -4.5 + (j - 1) * .65;
      const wave = Math.sin(c.t * 18 + j) * .7;
      const fire = g.createLinearGradient(c.x0 - l, 0, c.x0 + .6, 0);
      fire.addColorStop(0, '#de424300'); fire.addColorStop(.5, ['#e74832', '#ff9638', '#ffd982'][j]); fire.addColorStop(1, '#fff5ce');
      g.fillStyle = fire; g.beginPath(); g.moveTo(c.x0 + .6, y - .65);
      g.quadraticCurveTo(c.x0 - l * .4, y - 1.2 + wave, c.x0 - l, y + wave);
      g.quadraticCurveTo(c.x0 - l * .55, y + .85 - wave, c.x0 + .6, y + .65); g.closePath(); g.fill();
    }
  },
  lightning: (g, c, k) => {
    if (Math.floor(c.t * 9) % 3 === 0) return; // flicker
    const len = 12 + k * 22; g.globalAlpha = k; g.shadowColor = '#7fe0ff'; g.shadowBlur = 3;
    const pts: Array<[number, number]> = [];
    for (let s = 0; s <= 6; s++) pts.push([c.x0 - (s / 6) * len, -4.5 + (s ? (hash(s + Math.floor(c.t * 9) * 7) - 0.5) * 3 : 0)]);
    line(g, '#4a9cca', 1.3, ...pts); line(g, '#c6efff', .55, ...pts); line(g, '#fffdf2', .18, ...pts);
  },
};
export const TRAIL_IDS = Object.keys(TRAILS);
