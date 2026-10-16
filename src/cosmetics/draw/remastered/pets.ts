import { poly as marking, oval as patch } from '../prims';
import { circle, line, oval, poly, quad, rect, shade, TAU, type G } from './prims';

/** What a pet animates with: `gait` = stride phase (radians, from distance), `speed` m/s, `color` the rider's. */
export interface PetCtx { t: number; speed: number; gait: number; color: string }

/** Runners trot ahead of the front wheel; fliers hover behind the rider's shoulder. */
export const FLIERS = new Set(['bee', 'parrot', 'bat', 'dragon', 'ghost', 'gull', 'drone', 'miniufo']);
/** Where each kind sits in rider space (ground at y = 0). */
export const RUN_AT: [number, number] = [15, 0];
export const FLY_AT: [number, number] = [-12, -25];
/** Below this speed (m/s) a runner sits down and looks back at you. */
const REST = 0.6;

/**
 * Draws pet `id` with its feet (runners) or its centre (fliers) at (0,0), facing +x, ~6–8 px tall.
 * `sitting` forces the resting pose (riding in the cargo box).
 */
let sprite: OffscreenCanvas | HTMLCanvasElement | undefined;
export function drawPet(g: G, id: string, c: PetCtx, sitting = false) {
  const f = PETS[id]; if (!f) return;
  const rest = sitting || (!FLIERS.has(id) && c.speed < REST);
  if (!sprite) {
    if (typeof OffscreenCanvas !== 'undefined') sprite = new OffscreenCanvas(96, 96);
    else if (typeof document !== 'undefined') { sprite = document.createElement('canvas'); sprite.width = sprite.height = 96; }
  }
  const sg = sprite?.getContext('2d') as G | null | undefined;
  if (!sprite || !sg) { f(g, c, rest); return; }
  sg.setTransform(1, 0, 0, 1, 0, 0); sg.clearRect(0, 0, 96, 96);
  sg.save(); sg.scale(4, 4); sg.translate(12, 16); f(sg, c, rest); sg.restore();
  g.save(); g.imageSmoothingEnabled = false; g.drawImage(sprite, -12, -16, 24, 24); g.restore();
}

/** Two pairs of little legs: trotting (phase from distance) or tucked when resting. */
function legs(g: G, col: string, x0: number, x1: number, top: number, c: PetCtx, rest: boolean) {
  for (const [x, ph, near] of [[x0 + .65, Math.PI, false], [x1 + .65, 0, false], [x0, 0, true], [x1, Math.PI, true]] as const) {
    const stride = rest ? .3 : Math.sin(c.gait + ph) * 1.25;
    const foot = rest ? -.25 : -Math.max(0, -Math.cos(c.gait + ph)) * .85;
    const knee = x + stride * .45 - .2;
    poly(g, near ? col : shade(col, .62), [x - .35, top], [x + .4, top], [knee + .3, top * .46],
      [x + stride + .35, foot], [x + stride - .35, foot], [knee - .25, top * .46]);
    if (near) line(g, shade(col, 1.3), .13, [x, top + .25], [knee, top * .46]);
  }
}
const flap = (c: PetCtx) => Math.sin(c.t * (14 + c.speed * 2));
const hover = (c: PetCtx) => Math.sin(c.t * 2.3) * 1.1;
const eye = (g: G, x: number, y: number) => {
  circle(g, '#14202d', x, y, .34); circle(g, '#fdf5de', x - .1, y - .11, .1);
};

const PETS: Record<string, (g: G, c: PetCtx, rest: boolean) => void> = {
  corgi: (g, c, rest) => {
    const y = rest ? 1 : 0, b = rest ? 0 : Math.abs(Math.sin(c.gait)) * 0.4;
    legs(g, '#d9822b', -2.4, 1.4, -2 + y, c, rest);
    poly(g, '#e8973a', [-3.5, -3.8 + y - b], [-2.7, -4.7 + y - b], [.9, -4.8 + y - b], [2, -4.2 + y - b],
      [2.5, -2.8 + y - b], [1.2, -1.9 + y - b], [-2.5, -2 + y - b], [-3.5, -2.8 + y - b]);
    patch(g, '#fff1d6', 0.6, -2.6 + y - b, 1.8, 0.9);
    for (const [x, dy] of [[-2.5,-4.3],[-1.5,-4.45],[-.5,-4.4],[-2,-3.8]]) rect(g, '#f5ba65', x, dy + y - b, .5, .25);
    const hx = rest ? 2.6 : 3, look = rest ? -1 : 1;
    poly(g, '#e8973a', [hx - 1.4, -5.8 + y - b], [hx -.45, -6.4 + y - b], [hx + .8, -5.9 + y - b], [hx + 1.05, -5 + y - b], [hx + 1.85, -4.85 + y - b], [hx + 1.8, -4.15 + y - b], [hx + .45, -3.9 + y - b], [hx - 1, -4.3 + y - b]); poly(g, '#e8973a', [hx - 1, -5.8 + y - b], [hx - 0.6, -7.8 + y - b], [hx + 0.2, -6.2 + y - b]); poly(g, '#e8973a', [hx + 0.2, -6 + y - b], [hx + 0.8, -7.8 + y - b], [hx + 1.2, -5.8 + y - b]);
    marking(g, '#fff1d6', [hx -.25, -6.1 + y - b], [hx + .15, -6.1 + y - b], [hx + .4, -5.05 + y - b], [hx + 1.5, -4.65 + y - b], [hx + 1.45, -4.2 + y - b], [hx -.1, -4.15 + y - b]);
    marking(g, '#fff1d6', [1.1, -4.8 + y - b], [2.2, -5.2 + y - b], [2.25, -2.75 + y - b], [1.35, -2.2 + y - b]);
    for (const x of [-2.5, -1.75, -.9]) line(g, '#9c5826', .18, [x, -3.25 + y - b], [x + .3, -2.9 + y - b]);
    line(g, '#d44346', .24, [hx + 1.4, -4.05 + y - b], [hx + 1.4, -3.65 + y - b]);
    eye(g, hx + 0.6 * look, -5.2 + y - b); circle(g, '#15151c', hx + 1.4 * look, -4.6 + y - b, 0.3);
    marking(g, '#f6c9a5', [hx - .85, -5.9 + y - b], [hx - .58, -7.1 + y - b], [hx - .15, -6.05 + y - b]);
    quad(g, '#fff2d6', .32, [-2.7, -4.3 + y - b], [-.5, -4.8 + y - b], [1, -4.25 + y - b]);
    patch(g, '#fff4df', hx + .9 * look, -4.4 + y - b, .55, .35);
    line(g, '#e8973a', 0.8, [-3.6, -3.6 + y - b], [-4.6, -4.6 + y - b + Math.sin(c.t * 12) * 0.5]);
  },
  cat: (g, c, rest) => {
    const y = rest ? 0.8 : 0;
    legs(g, '#3a3a48', -2, 1.4, -2.2 + y, c, rest);
    poly(g, '#4a4a5a', [-3.2, -3.5 + y], [-2.1, -4.7 + y], [1.2, -4.35 + y], [2, -3.5 + y],
      [1.6, -2 + y], [-2, -2.1 + y], [-3.1, -2.65 + y]);
    const cx = rest ? 2 : 2.8;
    poly(g, '#4a4a5a', [cx - 1.1, -5.7 + y], [cx + .35, -6 + y], [cx + 1.1, -5.3 + y], [cx + 1.65, -4.55 + y], [cx + .9, -3.95 + y], [cx -.75, -4 + y], [cx - 1.45, -4.75 + y]);
    patch(g, '#626477', -1.8, -3.2 + y, 1, 1.35, -.3);
    marking(g, '#9295a5', [cx + .25, -4.7 + y], [cx + 1.55, -4.6 + y], [cx + .9, -4.15 + y]);
    rect(g, '#d0929f', cx + 1.4, -4.7 + y, .3, .25);
    const hx = rest ? 2 : 2.8;
    poly(g, '#4a4a5a', [hx - 1.2, -5.4 + y], [hx - 0.8, -7 + y], [hx - 0.2, -5.8 + y]); poly(g, '#4a4a5a', [hx + 0.2, -5.8 + y], [hx + 0.8, -7 + y], [hx + 1.2, -5.4 + y]);
    circle(g, '#9fe36b', hx + (rest ? -0.5 : 0.6), -5 + y, 0.35);
    circle(g, '#15262c', hx + (rest ? -.5 : .6), -5 + y, .16);
    for (const dy of [-.15, .25]) line(g, '#b7c0c4', .12, [hx + .8, -4.35 + y], [hx + 1.9, -4.35 + y + dy]);
    for (const dx of [-1.8, -.7, .4]) line(g, '#243245', .25, [dx, -4.15 + y], [dx + .15, -3.3 + y]);
    g.strokeStyle = '#4a4a5a'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(-3.2, -3.4 + y); g.quadraticCurveTo(-5.4, -4 + y, -4.6, -7 + y + Math.sin(c.t * 3)); g.stroke();
  },
  pig: (g, c, rest) => {
    const y = rest ? 0.8 : 0;
    legs(g, '#f29bb0', -1.8, 1.2, -2 + y, c, rest);
    oval(g, '#ffb3c6', 0, -3.4 + y, 3.2, 2); circle(g, '#ffb3c6', 2.8, -4 + y, 1.5); oval(g, '#f29bb0', 4.1, -3.8 + y, 0.6, 0.7);
    marking(g, '#ffdbd0', [-2.25, -4.3 + y], [-.5, -4.95 + y], [1.2, -4.5 + y], [.5, -3.65 + y], [-1.75, -3.7 + y]);
    for (const x of [-1.8, 1.2]) rect(g, '#75445a', x -.45, -.35, .85, .35);
    eye(g, 3, -4.6 + y); poly(g, '#f29bb0', [2, -5.2 + y], [2.4, -6.4 + y], [3, -5.4 + y]);
    for (const dy of [-.22, .18]) circle(g, '#9d5164', 4.25, -3.8 + y + dy, .13);
    quad(g, '#ffe0db', .2, [-1.8, -4.65 + y], [.1, -5.2 + y], [1.5, -4.65 + y]);
    g.strokeStyle = '#f29bb0'; g.lineWidth = 0.5; g.beginPath(); g.arc(-3.6, -4 + y, 0.6, 0, TAU * 0.8); g.stroke();
  },
  chicken: (g, c, rest) => {
    const b = rest ? 0 : Math.abs(Math.sin(c.gait)) * 0.6;
    if (!rest) for (const ph of [0, Math.PI]) line(g, '#ff9a2b', 0.6, [0, -2.4], [Math.sin(c.gait + ph) * 1.2, 0]);
    oval(g, '#f8f8f0', -0.2, -3.6 - b, 2.4, 1.8); circle(g, '#f8f8f0', 1.8, -5.6 - b, 1.2); poly(g, '#e8322b', [1.4, -6.6 - b], [1.8, -7.4 - b], [2.4, -6.6 - b]);
    poly(g, '#ff9a2b', [2.9, -5.8 - b], [4, -5.5 - b], [2.9, -5.2 - b]); eye(g, 2.2, -5.9 - b);
    poly(g, '#e6e6dc', [-2.2, -4 - b], [-3.8, -5.6 - b], [-3, -3.2 - b]); patch(g, '#e6e6dc', -0.4, -3.6 - b, 1.4, 0.8, 0.2 + flap(c) * 0.2);
    for (let i = 0; i < 3; i++) marking(g, '#e2dbc7', [-1.5 + i * .65, -3.8 - b], [-.5 + i * .5, -3.5 - b], [-.9 + i * .5, -2.7 - b], [-1.6 + i * .6, -2.9 - b]);
    poly(g, '#e8322b', [2.05, -5.05 - b], [2.6, -4.6 - b], [2.35, -4.2 - b]);
    for (let i = 0; i < 3; i++) line(g, '#b7b9ad', .13, [-1.2 + i * .5, -3.9 - b], [-.8 + i * .5, -3.25 - b]);
  },
  hamsterball: (g, c) => {
    const r = 3.4, a = c.gait * 0.6;
    g.fillStyle = '#cfefff55'; g.beginPath(); g.arc(0, -r, r, 0, TAU); g.fill();
    const run = Math.sin(c.gait * 2) * 0.5;
    oval(g, '#f2a33a', 0, -1.8, 1.8, 1.2); circle(g, '#f2a33a', 1.4, -2.6, 0.9); eye(g, 1.8, -2.8); line(g, '#d67f1a', 0.5, [-0.6, -0.8], [-0.6 + run, -0.2]); line(g, '#d67f1a', 0.5, [0.6, -0.8], [0.6 - run, -0.2]);
    g.strokeStyle = '#e8f6ffcc'; g.lineWidth = 0.4; g.beginPath(); g.arc(0, -r, r, 0, TAU); g.stroke();
    quad(g, '#ffffffbb', .28, [-2.6, -4.4], [-2.5, -6.3], [-.7, -6.25]);
    for (let i = 0; i < 3; i++) { const q = a + (i * TAU) / 3; line(g, '#e8f6ff88', 0.3, [Math.cos(q) * r * 0.9, -r + Math.sin(q) * r * 0.9], [Math.cos(q) * r * 0.55, -r + Math.sin(q) * r * 0.55]); }
  },
  trex: (g, c, rest) => {
    const b = rest ? 0 : Math.abs(Math.sin(c.gait)) * 0.5;
    if (!rest) for (const ph of [0, Math.PI]) line(g, '#3a8a3a', 1, [0, -3], [Math.sin(c.gait + ph) * 1.4, 0]);
    else line(g, '#3a8a3a', 1, [0, -3], [0.8, 0]);
    poly(g, '#4caf50', [-5, -3.4 - b], [-1, -5 - b], [1.6, -5.4 - b], [1.2, -2.4 - b], [-1, -2.6 - b]);
    poly(g, '#4caf50', [1.1, -6.85 - b], [2.2, -7.65 - b], [4.4, -7.3 - b], [4.75, -6.15 - b], [3.95, -5.5 - b], [1.2, -5.65 - b]);
    poly(g, '#8ecc69', [1.6, -6.9 - b], [2.35, -7.3 - b], [4.1, -7 - b], [4.25, -6.55 - b]);
    line(g, '#193f39', .25, [2.8, -5.95 - b], [4.45, -6.1 - b]);
    for (const x of [3.1, 3.55, 4]) poly(g, '#f5efda', [x, -6 - b], [x + .3, -6.05 - b], [x + .12, -5.65 - b]);
    for (const x of [-.7, .2, .9]) rect(g, '#f5efda', x, -.35, .35, .25); eye(g, 2.8, -6.9 - b); line(g, '#fff', 0.3, [3.4, -5.7 - b], [4.2, -5.9 - b]);
    line(g, '#3a8a3a', 0.5, [1.4, -4.4 - b], [2.2, -4 - b + Math.sin(c.t * 9) * 0.3]);
    poly(g, '#98c97a', [-1.1, -3.1 - b], [1.1, -4.1 - b], [.8, -2.75 - b]);
    for (const x of [-3.6, -2.5, -1.4]) circle(g, '#287247', x, -4.2 - b, .17);
  },
  penguin: (g, c, rest) => {
    const w = rest ? 0 : Math.sin(c.gait) * 0.18;
    g.save(); g.rotate(w);
    oval(g, '#20232c', 0, -3.4, 1.9, 3.2); patch(g, '#f8f8f0', 0.6, -3, 1.2, 2.5); circle(g, '#20232c', 0.4, -6.4, 1.3);
    poly(g, '#ff9a2b', [1.6, -6.5], [2.8, -6.2], [1.6, -5.9]); eye(g, 1, -6.7); rect(g, '#ff9a2b', -1, -0.4, 2.4, 0.5);
    oval(g, '#182536', -.95, -3.9, .45, 1.9, -.25); patch(g, '#d1dce1', .9, -2.2, .55, 1.2);
    g.restore();
  },
  robodog: (g, c, rest) => {
    const y = rest ? 0.8 : 0;
    legs(g, '#7d8494', -2, 1.4, -2.2 + y, c, rest);
    rect(g, '#c6ccd6', -3, -4.4 + y, 5.6, 2.4); rect(g, '#c6ccd6', 2, -6.6 + y, 2.4, 2.2); rect(g, c.color, 3.4, -6 + y, 0.8, 0.6);
    line(g, '#7d8494', 0.4, [2.4, -6.6 + y], [2.2, -8 + y]); circle(g, Math.floor(c.t * 3) % 2 ? '#ff2e93' : '#555', 2.2, -8.1 + y, 0.4);
    line(g, '#7d8494', 0.5, [-3, -4 + y], [-4.4, -5 + y + Math.sin(c.t * 14) * 0.4]);
    poly(g, '#8998ab', [-3, -4.4 + y], [-2.2, -5 + y], [1.9, -5 + y], [2.6, -4.4 + y]);
    for (const x of [-2.2, -.7, .8]) rect(g, '#213849', x, -3.9 + y, .25, .65);
    rect(g, '#435d74', -1.75, -3.85 + y, 2.6, .8);
    for (const x of [-2.4, 1.7]) circle(g, '#eff8f2', x, -3.7 + y, .2);
    line(g, '#eaf5eb', .17, [-2.4, -4.2 + y], [1.7, -4.2 + y]);
  },
  bee: (g, c) => {
    const y = hover(c), w = Math.abs(flap(c));
    oval(g, '#cfefffaa', -0.4, -1.6 + y, 1.1, 1.6 * w + 0.2); oval(g, '#ffd23b', 0, y, 1.8, 1.2);
    for (const x of [-0.6, 0.6]) rect(g, '#15151c', x - 0.25, y - 1.1, 0.5, 2.2); eye(g, 1.3, y - 0.3);
    quad(g, '#fbffffaa', .16, [-.8, -1.25 + y], [-1.4, -2.65 + y], [.1, -2.1 + y]);
  },
  parrot: (g, c) => {
    const y = hover(c), w = flap(c);
    oval(g, '#e74c3c', 0, y, 2.2, 1.2, -0.3); circle(g, '#e74c3c', 1.8, y - 1, 1); poly(g, '#ffd23b', [2.6, y - 1.1], [3.4, y - 0.6], [2.5, y - 0.4]); eye(g, 2, y - 1.2);
    poly(g, '#3b82ff', [-0.6, y - 0.3], [-1.8, y - 2.4 * w], [0.8, y - 0.4]); poly(g, '#22b14c', [-2, y + 0.2], [-4.6, y + 1.4], [-2, y + 0.8]);
    for (let i = 0; i < 3; i++) poly(g, i % 2 ? '#267bc2' : '#68b7ef', [-.5 + i * .4, y -.25], [-1.85 + i * .35, y -2.2 * w], [-1.7 + i * .35, y -1.4 * w]);
    rect(g, '#fff4d5', 2.15, y -1.3, .4, .6);
    line(g, '#b7eaff', .16, [-.7, y - .25], [-1.45, y - 1.9 * w]);
  },
  bat: (g, c) => {
    const y = hover(c), w = flap(c);
    poly(g, '#2a2236', [0, y], [-3.6, y - 2 * w], [-2.4, y - 0.2], [-1.2, y + 0.6]); poly(g, '#3a3048', [0, y], [3.6, y - 2 * w], [2.4, y - 0.2], [1.2, y + 0.6]);
    circle(g, '#3a3048', 0, y, 1.1); poly(g, '#3a3048', [-0.8, y - 0.6], [-0.6, y - 1.8], [-0.1, y - 0.8]); poly(g, '#3a3048', [0.1, y - 0.8], [0.6, y - 1.8], [0.8, y - 0.6]);
    circle(g, '#ff4d4d', 0.4, y - 0.2, 0.22);
    for (const direction of [-1, 1]) line(g, '#7e7192', .16, [direction * .6, y], [direction * 2.8, y - 1.5 * w]);
  },
  dragon: (g, c) => {
    const y = hover(c), w = flap(c);
    poly(g, '#7d3bd1', [-0.4, y - 0.4], [-2.4, y - 3 * w - 0.4], [0.6, y - 0.8]);
    oval(g, '#9b59f6', 0, y, 2.4, 1.3);
    poly(g, '#9b59f6', [1.3, y -1.4], [2, y -2.4], [3, y -2.2], [3.3, y -1.35], [4.2, y -1.15], [4.05, y -.5], [2.1, y -.3]);
    poly(g, '#e3bc85', [1.7, y -2], [1.25, y -3.3], [2.25, y -2.1]);
    line(g, '#362b5c', .2, [3.15, y -.65], [3.85, y -.7]);
    for (const x of [-1, -.25, .5]) { rect(g, '#be8ee4', x, y -.35, .35, .25); rect(g, '#7642b8', x + .35, y, .35, .25); }
    line(g, '#d8a5f1', .2, [-.25, y -.5], [-1.6, y -2.2 * w - .4]); poly(g, '#ffd23b', [2, y - 2.2], [2.2, y - 3], [2.6, y - 2.2]);
    eye(g, 2.8, y - 1.4); g.strokeStyle = '#9b59f6'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(-2.2, y + 0.2); g.quadraticCurveTo(-4, y + 1.6, -5, y + 0.4); g.stroke();
    marking(g, '#d3afef', [-1.3, y + .3], [.5, y + .2], [1.4, y - .2], [.8, y + .9]);
    for (const x of [-1.4, -.5, .4]) poly(g, '#7542aa', [x, y - .9], [x + .3, y - 1.55], [x + .6, y - .9]);
    if (c.speed > 7) { const k = (c.t * 3) % 1; circle(g, '#ff9a2b', 4 + k * 3, y - 1 + k, 0.5 * (1 - k)); } // sprint sneezes
  },
  ghost: (g, c) => {
    const y = hover(c) * 1.4;
    g.save(); g.globalAlpha *= 0.8;
    g.fillStyle = '#f4f4ff'; g.beginPath(); g.arc(0, y - 1, 2.2, Math.PI, 0); g.lineTo(2.2, y + 2);
    for (let i = 0; i < 4; i++) g.lineTo(2.2 - (i + 0.5) * 1.1, y + 2 + ((i + Math.floor(c.t * 4)) % 2 ? -0.6 : 0));
    g.lineTo(-2.2, y + 2); g.closePath(); g.fill();
    g.restore(); eye(g, 0.4, y - 1.2); eye(g, 1.4, y - 1.2); oval(g, '#15151c', 0.9, y, 0.4, 0.5);
    quad(g, '#cfdaff77', .22, [-1.65, y - 1.1], [-1.8, y - 2.5], [-.45, y - 2.65]);
  },
  gull: (g, c) => {
    const y = hover(c), w = flap(c);
    oval(g, '#f8f8f0', 0, y, 2, 0.9); circle(g, '#f8f8f0', 1.8, y - 0.5, 0.8); poly(g, '#ffb020', [2.5, y - 0.6], [3.6, y - 0.3], [2.5, y - 0.1]); eye(g, 2, y - 0.7);
    line(g, '#c6ccd6', 0.8, [-0.6, y - 0.2], [-2, y - 2.2 * w], [-4, y - 1.4 * w]); poly(g, '#9a9aa8', [-2, y], [-3, y - 0.4], [-2.8, y + 0.6]);
    for (let i = 0; i < 3; i++) line(g, '#8294a2', .12, [-2 - i * .45, y - (1.8 - i * .2) * w], [-2.3 - i * .45, y - (1.25 - i * .2) * w]);
  },
  drone: (g, c) => {
    const y = hover(c) * 0.6, s = Math.abs(Math.cos(c.t * 40)) * 1.6;
    rect(g, '#3a3f48', -2.4, y - 0.6, 4.8, 1.2); line(g, '#3a3f48', 0.4, [-2.2, y - 0.6], [-2.2, y - 1.4]); line(g, '#3a3f48', 0.4, [2.2, y - 0.6], [2.2, y - 1.4]);
    line(g, '#c6ccd6', 0.4, [-2.2 - s, y - 1.5], [-2.2 + s, y - 1.5]); line(g, '#c6ccd6', 0.4, [2.2 - s, y - 1.5], [2.2 + s, y - 1.5]);
    circle(g, Math.floor(c.t * 2) % 2 ? '#22e06b' : '#e8322b', 0, y + 0.9, 0.4); circle(g, c.color, 1.6, y, 0.3);
    rect(g, '#99b2c3', -.7, y - .65, 1.4, .8); circle(g, '#101e2b', 0, y -.05, .28);
  },
  miniufo: (g, c) => {
    const y = hover(c);
    oval(g, '#bfefff99', 0, y - 1, 1.4, 1.2, 0, true); oval(g, '#9aa0aa', 0, y, 3, 0.9); circle(g, '#7dffb0', 0, y - 1.3, 0.5);
    for (let i = 0; i < 3; i++) circle(g, Math.floor(c.t * 5 + i) % 3 === 0 ? '#fff3a0' : '#5d636e', -1.6 + i * 1.6, y + 0.2, 0.3);
    quad(g, '#f5ffffbb', .17, [-.95, y - 1.2], [-.6, y - 2.15], [.6, y - 1.8]);
  },
};
/** Every drawable pet id (tests check the catalogue against it). */
export const PET_IDS = Object.keys(PETS);
