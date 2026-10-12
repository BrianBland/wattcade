import { poly as flatPoly, line as flatLine, rect as flatRect } from '../prims';
import { circle, line, oval, poly, quad, rect, shade, SKIN, TAU, type G } from './prims';

/** What a hat may animate with. `color` = the rider's colour. */
export interface HatCtx { t: number; color: string; speed: number; crank: number }

/** Hats that hide the hair/face (the head isn't drawn under them). */
export const FULL_HEAD = new Set(['pumpkin', 'knight', 'football', 'bucket', 'dino']);

/**
 * Draws hat `id` around a head centred at (0,0), radius 2.4, facing +x. Unknown ids draw the road helmet.
 * Keep each one a handful of shapes: the rider is ~24 px tall in the warm-up (bigger in menus).
 */
export function drawHat(g: G, id: string, c: HatCtx) {
  g.save();
  (HATS[id] ?? HATS.road)(g, c, c.color);
  details(g, id, c.color);
  g.restore();
}

/** Material details share the shell's coordinates, so hats still fit every head pose. */
function details(g: G, id: string, accent: string) {
  if (['cap', 'beanie', 'nightcap', 'santa', 'jester', 'ushanka', 'pilot', 'sweatband'].includes(id)) {
    for (let i = 0; i < 7; i++) {
      const x = -2 + i * .6;
      line(g, '#fff2dc55', .13, [x, -1.65], [x + .18, -1.8]);
    }
    if (id === 'beanie') for (let i = 0; i < 6; i++) line(g, shade(accent, .65), .15, [-2 + i * .7, -2.5], [-1.85 + i * .7, -1.1]);
  }
  if (['cowboy', 'sunhat', 'fishing', 'beaver'].includes(id)) {
    line(g, '#fff0bb88', .18, [-1.65, -3.25], [.8, -3.25]);
    for (let i = 0; i < 5; i++) circle(g, '#321f1966', -1.6 + i * .7, -2.8, .09);
  }
  if (['tophat', 'bowler', 'pirate', 'mortarboard'].includes(id)) {
    line(g, '#68758f', .22, [-1.55, -3.1], [-1.55, id === 'tophat' ? -7.3 : -3.65]);
    line(g, '#d5dbe4', .12, [-2.6, -2.2], [-1.4, -2.2]);
  }
  if (['knight', 'bucket', 'football', 'viking', 'hardhat', 'welder', 'captain', 'aero'].includes(id)) {
    line(g, '#fff4cfaa', .2, [-1.7, -2.3], [-.5, -2.7]);
    if (['knight', 'bucket', 'viking'].includes(id)) for (const x of [-1.8, .1]) {
      circle(g, '#273646', x, -.2, .22); circle(g, '#eef5ed', x - .06, -.28, .1);
    }
    if (id === 'knight') for (let i = 0; i < 3; i++) line(g, '#8294aa', .15, [1.1 + i * .5, -.6], [1.15 + i * .5, .65]);
  }
  if (['crown', 'tiara', 'halo', 'laurel', 'unicorn'].includes(id)) {
    line(g, '#fff8d0', .18, [-1.5, -1.9], [.4, -1.9]);
    if (id === 'crown' || id === 'tiara') circle(g, '#fff8ed', .05, -2.65, .14);
  }
  if (id === 'pumpkin') {
    for (const x of [-2.4, -.6, 1.3]) quad(g, '#ffd88777', .17, [x, -2.7], [x - .8, -.5], [x, 1.9]);
    poly(g, '#ffcf4c', [1.15, -.9], [2.1, -1.35], [1.95, -.65]);
  }
  if (id === 'wizard' || id === 'party') line(g, '#fff3ba99', .16, [-1.6, -2.7], [-.8, -6.4]);
  if (id === 'bubble') quad(g, '#ffffffbb', .24, [-2.7, -2.2], [-1.7, -3.9], [.2, -3.4]);
  if (id === 'headphones') {
    oval(g, '#eef4e844', -.8, -.2, .48, .72); line(g, '#142130', .18, [-.65, -.65], [-.65, .45]);
  }
}

const roadHelmet = (g: G, col: string, shell = '#f5f5fa') => {
  // A continuous white shell, with recessed vents and a shaded lower lip.
  // Small panels are flat so their contours do not break up the helmet silhouette.
  flatPoly(g, '#142130', [-3.4, -1.1], [-3.5, -2.6], [-2.4, -3.8], [-.7, -4.3],
    [1, -4.1], [2.5, -3.2], [3.2, -1.7], [2.7, -1], [.2, -1.2], [-1.4, -.8]);
  flatPoly(g, shell, [-3, -1.6], [-3.05, -2.55], [-2.15, -3.4], [-.65, -3.85],
    [.9, -3.65], [2.1, -2.95], [2.7, -1.7], [.15, -1.65], [-1.45, -1.25]);
  flatPoly(g, shade(shell, .72), [-3, -1.6], [-1.4, -1.9], [.4, -1.9], [2.7, -1.7],
    [2.45, -1.35], [.2, -1.5], [-1.45, -1.05]);
  flatLine(g, '#fff9df', .25, [-2.25, -3.45], [-.65, -3.85], [.85, -3.65]);
  flatPoly(g, '#233647', [-2.55, -2.85], [-1.1, -3.3], [-.6, -2.95], [-2.05, -2.55]);
  flatPoly(g, '#233647', [-.5, -3.55], [.65, -3.35], [1.05, -2.95], [-.3, -3.15]);
  flatPoly(g, '#233647', [1.3, -2.85], [1.7, -2.7], [2.2, -1.95], [1.7, -2.1]);
  flatRect(g, col, -2.8, -1.85, .75, .25);
  flatLine(g, '#142130', .35, [-1.5, -1], [-.4, 1.4], [1.4, -1.2]);
  flatRect(g, '#788697', -.65, .9, .4, .4);
};
const dome = (g: G, c: string, rx = 2.7, ry = 2.2, y = -0.9) => oval(g, c, -0.2, y, rx, ry, -0.1, true);
const brim = (g: G, c: string, x0: number, x1: number, y: number, w = 0.8) => line(g, c, w, [x0, y], [x1, y]);

export const HATS: Record<string, (g: G, c: HatCtx, col: string) => void> = {
  road: (g, _c, col) => roadHelmet(g, col),
  cap: (g, _c, col) => { dome(g, col, 2.6, 1.9); line(g, '#f5f5fa', 0.7, [1.8, -1.5], [3.7, -2.4]); },
  beanie: (g, _c, col) => { dome(g, col, 2.8, 2.6, -0.6); line(g, shade(col, 0.7), 0.6, [-2.8, -0.9], [2.6, -0.6]); circle(g, '#f5f5fa', -0.5, -3.6, 0.9); },
  cowboy: (g) => { oval(g, '#8a5a2b', 0, -2.1, 5, 0.9); poly(g, '#a8733d', [-2.1, -2.2], [-1.8, -5.6], [0, -4.8], [1.8, -5.6], [2.1, -2.2]); rect(g, '#3a2410', -2.1, -3, 4.2, 0.6); },
  tophat: (g, _c, col) => { brim(g, '#15151c', -3.2, 3.2, -2.3, 1); rect(g, '#15151c', -2, -8, 4, 5.8); rect(g, col, -2, -3.6, 4, 0.9); },
  pirate: (g) => { poly(g, '#15151c', [-4.2, -1.6], [-1.6, -5.4], [1.6, -5.4], [4.2, -1.6], [0, -2.8]); circle(g, '#f5f5fa', 0, -3.8, 0.6); },
  chef: (g) => { rect(g, '#f5f5fa', -2, -5.8, 4, 3.8); for (const x of [-1.6, 0, 1.6]) circle(g, '#ffffff', x, -6, 1.4); },
  cone: (g) => { poly(g, '#ff7a1a', [-2.8, -1.6], [2.8, -1.6], [0, -9.5]); poly(g, '#f5f5fa', [-1.9, -4.3], [1.9, -4.3], [1.4, -5.6], [-1.4, -5.6]); brim(g, '#ff7a1a', -3.4, 3.4, -1.6, 0.9); },
  jester: (g, c, col) => {
    const s = Math.sin(c.t * 5) * 0.6;
    poly(g, col, [-2.4, -1.6], [-6, -4 + s], [-0.6, -3.4]); poly(g, '#ffd23b', [2.2, -1.6], [5.8, -4.4 - s], [0.4, -3.4]);
    circle(g, '#ffd23b', -6, -4 + s, 0.8); circle(g, col, 5.8, -4.4 - s, 0.8); dome(g, '#2a2a3a', 2.5, 1.6);
  },
  antlers: (g) => { for (const sx of [-1, 1]) { line(g, '#8a5a2b', 0.7, [sx * 0.8, -2], [sx * 2.4, -6], [sx * 4.4, -7.6]); line(g, '#8a5a2b', 0.6, [sx * 1.9, -4.8], [sx * 3.6, -5]); line(g, '#8a5a2b', 0.6, [sx * 2.8, -6.6], [sx * 3, -8.6]); } },
  unicorn: (g, _c, col) => { poly(g, '#ffe8a8', [0.4, -2], [1.8, -2.2], [3.4, -8.2]); for (let i = 0; i < 3; i++) line(g, '#e3b04b', 0.3, [0.8 + i * 0.6, -3 - i * 1.6], [1.6 + i * 0.6, -3.4 - i * 1.6]); quad(g, col, 1.2, [-1.2, -2.4], [-3.4, -1.6], [-3, 1.6]); },
  mohawk: (g, _c, col) => { roadHelmet(g, '#15151c', '#2a2a3a'); for (let i = 0; i < 5; i++) poly(g, col, [-2.4 + i * 1, -3], [-1.8 + i * 1, -6.2 + (i % 2) * 0.8], [-1.4 + i * 1, -3]); },
  cat: (g) => { for (const x of [-1.6, 1.2]) { poly(g, '#15151c', [x - 1, -1.8], [x, -4.6], [x + 1, -1.8]); poly(g, '#ff9ac2', [x - 0.5, -2.1], [x, -3.7], [x + 0.5, -2.1]); } },
  wizard: (g) => { brim(g, '#4b2a8a', -3.6, 3.6, -2, 1.1); poly(g, '#4b2a8a', [-2.4, -2.2], [2.4, -2.2], [-1.4, -10]); circle(g, '#ffd23b', 0.2, -5, 0.6); circle(g, '#ffd23b', -0.9, -7.4, 0.4); },
  bowler: (g) => { brim(g, '#15151c', -3, 3, -1.9, 0.9); oval(g, '#15151c', 0, -2, 2.3, 2.6, 0, true); },
  santa: (g) => { poly(g, '#d42a2a', [-2.6, -1.8], [2.4, -1.8], [-1, -5.4], [-4.6, -3.4]); circle(g, '#f5f5fa', -4.8, -3.2, 0.9); line(g, '#f5f5fa', 1.3, [-2.8, -1.8], [2.6, -1.8]); },
  deely: (g, c, col) => {
    line(g, '#15151c', 0.5, [-2.2, -1.2], [-0.2, -2.6], [2, -1.4]);
    const s = Math.sin(c.t * 7) * 0.8;
    for (const x of [-0.8, 0.8]) { line(g, '#9a9aa8', 0.3, [x, -2.4], [x * 2 + s, -6.2]); circle(g, col, x * 2 + s, -6.4, 0.8); }
  },
  pumpkin: (g) => { circle(g, '#f28c28', 0, -0.4, 3.6); line(g, '#c05f12', 0.4, [-1.2, -3.8], [-1.6, 3]); line(g, '#c05f12', 0.4, [1.2, -3.8], [1.6, 3]); rect(g, '#3b6b2a', -0.4, -5.2, 0.8, 1.4); poly(g, '#3a1d05', [1, -1.2], [2.4, -1.8], [2.2, -0.4]); poly(g, '#3a1d05', [0.4, 0.8], [3, 0.6], [2.4, 1.8], [1, 1.8]); },
  duck: (g, c, col) => { roadHelmet(g, col); const b = Math.abs(Math.sin(c.t * 4)) * 0.4; oval(g, '#ffd23b', -0.4, -3.8 - b, 1.9, 1.2); circle(g, '#ffd23b', 1.1, -5.2 - b, 1); poly(g, '#ff8a1a', [1.9, -5.3 - b], [3, -5 - b], [1.9, -4.7 - b]); circle(g, '#15151c', 1.4, -5.5 - b, 0.2); },
  ushanka: (g) => { oval(g, '#6b4a2b', -0.2, -1.2, 3.2, 2.6, 0, true); rect(g, '#8a6a48', -3.2, -2, 6.2, 1.2); rect(g, '#6b4a2b', -2.2, -1, 1.6, 3.4); },
  tiara: (g) => { poly(g, '#ffd23b', [-2.2, -1.8], [-1.6, -3.4], [-0.7, -2.4], [0.2, -4.2], [1.1, -2.4], [2, -3.4], [2.4, -1.8]); circle(g, '#ff2e93', 0.2, -3.2, 0.45); },
  football: (g, _c, col) => { circle(g, col, -0.3, -0.5, 3.1); rect(g, '#f5f5fa', -3, -1, 3.4, 0.7); line(g, '#9a9aa8', 0.5, [1.6, -1.2], [3.4, -0.6], [3.2, 1.6], [1.4, 2]); line(g, '#9a9aa8', 0.4, [2, 0.4], [3.3, 0.5]); },
  bucket: (g) => { poly(g, '#9aa0aa', [-2.6, -4.6], [2.6, -4.6], [3.4, 1.2], [-3.4, 1.2]); line(g, '#c6ccd6', 0.4, [-3, 0.4], [3, 0.4]); quad(g, '#5d636e', 0.3, [-3.2, -0.5], [0, 4.2], [3.2, -0.5]); },
  crown: (g) => { poly(g, '#ffd23b', [-2.4, -1.6], [-2.6, -4.6], [-1.3, -3], [0, -5.2], [1.3, -3], [2.6, -4.6], [2.4, -1.6]); circle(g, '#e8322b', 0, -2.4, 0.5); circle(g, '#2a5bd7', -1.6, -2.3, 0.35); circle(g, '#22b14c', 1.6, -2.3, 0.35); },
  propeller: (g, c, col) => {
    dome(g, col, 2.7, 2.3, -0.7); line(g, '#ffd23b', 0.5, [0, -2.8], [0, -4.2]);
    const a = c.t * (4 + c.speed * 3), w = Math.abs(Math.cos(a)) * 3;
    line(g, '#e8322b', 0.6, [-w, -4.3], [0, -4.3]); line(g, '#2a5bd7', 0.6, [0, -4.3], [w, -4.3]);
  },
  popcorn: (g) => { poly(g, '#f5f5fa', [-2.4, -1.4], [2.4, -1.4], [3, -5], [-3, -5]); for (const x of [-2, 0, 2]) rect(g, '#e8322b', x - 0.4, -4.9, 0.8, 3.4); for (const [x, y] of [[-2, -5.6], [-0.6, -6.2], [0.9, -5.8], [2.2, -5.4], [0, -5.2]]) circle(g, '#fff6c8', x, y, 0.9); },
  laurel: (g) => { for (let i = 0; i < 6; i++) { const a = Math.PI + 0.25 + i * 0.5; oval(g, '#3b9a3a', Math.cos(a) * 2.6, Math.sin(a) * 2.2 - 0.6, 0.9, 0.45, a + 1.2); } },
  nightcap: (g, c) => { const s = Math.sin(c.t * 2) * 0.5; poly(g, '#3b5bd7', [-2.6, -1.6], [2.4, -1.6], [-2, -4.6], [-5.6, -2.4 + s]); line(g, '#f5f5fa', 0.5, [-1, -2.4], [-3.4, -3]); circle(g, '#f5f5fa', -5.8, -2.2 + s, 0.8); line(g, '#f5f5fa', 1, [-2.8, -1.6], [2.6, -1.6]); },
  birdnest: (g, c) => { oval(g, '#8a5a2b', 0, -2.6, 2.8, 1.1); const b = Math.abs(Math.sin(c.t * 6)) * 0.4; circle(g, '#ffd23b', 0.6, -3.8 - b, 1); poly(g, '#ff8a1a', [1.5, -3.9 - b], [2.4, -3.7 - b], [1.5, -3.4 - b]); circle(g, '#15151c', 1, -4 - b, 0.18); },
  party: (g, _c, col) => { poly(g, col, [-1.8, -2], [1.8, -2], [0.2, -8]); line(g, '#ffd23b', 0.5, [-1.2, -3.6], [1.3, -3.6]); line(g, '#ffd23b', 0.5, [-0.6, -5.6], [0.9, -5.6]); circle(g, '#ffd23b', 0.2, -8.2, 0.7); },
  aero: (g, _c, col) => { poly(g, '#f5f5fa', [2.6, -1.4], [1, -3.2], [-2.4, -2.8], [-6.4, -0.6], [-2.4, -0.6]); line(g, col, 0.6, [-1.8, -2.2], [-5.2, -0.8]); poly(g, '#2a3a5a', [2.6, -1.4], [3, 0.2], [1.6, 0.2]); },
  hardhat: (g) => { dome(g, '#ffd23b', 2.8, 2.4, -1); brim(g, '#e8b800', -3.2, 3.6, -1.1, 0.8); line(g, '#e8b800', 0.5, [0, -3.3], [0, -1.2]); },
  viking: (g) => { dome(g, '#9aa0aa', 2.8, 2.4, -1); for (const sx of [-1, 1]) quad(g, '#f2e6c8', 1, [sx * 2.4, -1.8], [sx * 4.6, -2.6], [sx * 4, -5.6]); line(g, '#c6ccd6', 0.6, [-2.8, -1.2], [2.6, -1.2]); },
  bunny: (g, c) => { const s = Math.sin(c.t * 3) * 0.3; for (const [x, r] of [[-1, -0.25 + s], [0.8, 0.2 + s]] as const) { oval(g, '#f5f5fa', x + Math.sin(r) * 2.6, -5, 0.9, 3, r); oval(g, '#ff9ac2', x + Math.sin(r) * 2.6, -5, 0.4, 2.1, r); } },
  mortarboard: (g, c) => { poly(g, '#15151c', [-3.6, -3.4], [0.6, -4.6], [3.8, -3.4], [-0.4, -2.2]); rect(g, '#15151c', -1.8, -3, 3.4, 1.2); const s = Math.sin(c.t * 3) * 0.5; line(g, '#ffd23b', 0.35, [0.2, -3.4], [-2.6 + s, -3], [-2.8 + s, -0.8]); },
  knight: (g, _c, col) => { circle(g, '#9aa0aa', -0.2, -0.6, 3); rect(g, '#15151c', 0.6, -1.2, 2.6, 0.6); line(g, '#c6ccd6', 0.4, [-3, 1.2], [2.6, 1.2]); quad(g, col, 1.4, [-0.4, -3.4], [-3, -6], [-5.4, -4]); },
  halo: (g, c) => { g.save(); g.shadowColor = '#ffe066'; g.shadowBlur = 3; g.strokeStyle = '#ffe066'; g.lineWidth = 0.6; g.beginPath(); g.ellipse(0, -4.4 + Math.sin(c.t * 2) * 0.3, 2.4, 0.7, 0, 0, TAU); g.stroke(); g.restore(); },
  horns: (g) => { for (const sx of [-1, 1]) poly(g, '#d42a2a', [sx * 0.6, -2.2], [sx * 2, -2], [sx * 2.4, -4.6]); },
  lamp: (g, c) => {
    rect(g, '#f5f5fa', -1, -4, 2, 2.2); rect(g, '#e8322b', -1, -3.4, 2, 0.6); rect(g, '#15151c', -1.3, -5.4, 2.6, 1.4); circle(g, '#fff3a0', 0, -4.7, 0.6); poly(g, '#e8322b', [-1.5, -5.4], [1.5, -5.4], [0, -6.6]);
    const dir = Math.cos(c.t * 1.6); g.save(); g.globalAlpha *= 0.35 * Math.abs(dir); poly(g, '#fff3a0', [0, -4.7], [dir * 12, -6.5], [dir * 12, -2.9]); g.restore();
  },
  souwester: (g) => { oval(g, '#ffd23b', -0.4, -1.2, 2.8, 2.3, 0, true); poly(g, '#ffd23b', [-2.8, -1.4], [-5, 0.4], [-4.6, 1.2], [-2, -0.6]); brim(g, '#e8b800', -1, 3.2, -1.3, 0.7); },
  flowers: (g) => { const cs = ['#ff6b8a', '#ffd23b', '#c56cf0', '#ffffff', '#4dabf7']; for (let i = 0; i < 5; i++) { const a = Math.PI + 0.35 + i * 0.6; circle(g, cs[i], Math.cos(a) * 2.4, Math.sin(a) * 2.2 - 0.6, 0.75); } },
  captain: (g) => { oval(g, '#f5f5fa', -0.4, -2.4, 3, 1.2); rect(g, '#15151c', -2.4, -2.2, 4.6, 0.8); line(g, '#15151c', 0.8, [1.6, -1.6], [3.6, -1.2]); circle(g, '#ffd23b', 0.8, -2.8, 0.4); },
  welder: (g) => { poly(g, '#3a3f48', [0.4, -2.8], [3.2, -2], [3.4, 2], [0.6, 2.6]); rect(g, '#3bdc6b', 1.8, -0.8, 1.4, 0.8); line(g, '#3a3f48', 0.6, [-2, -2], [0.6, -2.6]); },
  alien: (g, c) => { line(g, '#15151c', 0.4, [-2, -1.6], [0, -2.6], [2, -1.6]); const s = Math.sin(c.t * 6) * 0.6; for (const x of [-0.9, 0.9]) { line(g, '#3bdc6b', 0.3, [x, -2.4], [x * 2.4 + s, -6]); circle(g, '#7dffb0', x * 2.4 + s, -6.2, 0.75); } },
  pilot: (g) => { oval(g, '#7a4a24', -0.2, -0.8, 2.8, 2.6, 0, true); rect(g, '#7a4a24', -2.8, -1, 1.4, 2.4); circle(g, '#9fd3ff', 1, -2.4, 0.75); circle(g, '#9fd3ff', -0.6, -2.6, 0.75); line(g, '#3a2410', 0.3, [-2.6, -2.4], [1.8, -2.4]); },
  hamster: (g, c) => {
    const b = Math.abs(Math.sin(c.crank * TAU)) * 0.5;
    oval(g, '#f2a33a', -0.4, -3.6 - b, 2.2, 1.5); oval(g, '#fff1d6', 0.3, -3.2 - b, 1.2, 0.8); circle(g, '#f2a33a', 1.4, -4.6 - b, 1.1);
    circle(g, '#d67f1a', 0.9, -5.6 - b, 0.45); circle(g, '#15151c', 1.9, -4.8 - b, 0.22); circle(g, '#ff9ac2', 2.4, -4.4 - b, 0.2);
  },
  sweatband: (g, _c, col) => { line(g, col, 1.1, [-2.4, -1.2], [2.4, -1.4]); line(g, '#f5f5fa', 0.3, [-2.2, -1.3], [2.3, -1.4]); },
  sunhat: (g) => { oval(g, '#e6c27a', 0, -2.1, 4.8, 1); oval(g, '#e6c27a', 0, -2.3, 2.2, 2.2, 0, true); rect(g, '#e8322b', -2.2, -2.9, 4.4, 0.6); },
  bubble: (g) => { g.fillStyle = '#d7f1ff55'; g.strokeStyle = '#e8f6ff'; g.lineWidth = 0.6; g.beginPath(); g.arc(0, 0, 4, 0, TAU); g.fill(); g.stroke(); rect(g, '#ffffffaa', 1, -3, 1.2, 1.2); rect(g, '#c6ccd6', -2.6, 3.2, 5.2, 0.9); },
  headphones: (g, _c, col) => { g.strokeStyle = '#2a2a3a'; g.lineWidth = 0.6; g.beginPath(); g.arc(-0.2, -0.2, 2.9, Math.PI * 1.05, Math.PI * 1.95); g.stroke(); oval(g, col, -0.6, 0.2, 1, 1.4); oval(g, '#2a2a3a', -0.6, 0.2, 0.5, 0.9); },
  fishing: (g, c) => { oval(g, '#b7a77a', -0.2, -1.6, 2.6, 2, 0, true); poly(g, '#a8986a', [-3.6, -1.2], [3.4, -1.2], [2.6, -2], [-2.8, -2]); const s = Math.sin(c.t * 3) * 0.5; line(g, '#9a9aa8', 0.2, [2, -1.4], [3 + s, 0.6]); circle(g, '#e8322b', 3 + s, 0.9, 0.4); },
  umbrella: (g) => { line(g, '#15151c', 0.4, [0, -2.4], [0, -5]); const cs = ['#e8322b', '#ffd23b', '#2a5bd7', '#22b14c']; for (let i = 0; i < 4; i++) { g.fillStyle = cs[i]; g.beginPath(); g.moveTo(0, -7.4); g.arc(0, -4.4, 4.6, Math.PI + (i * Math.PI) / 4, Math.PI + ((i + 1) * Math.PI) / 4); g.closePath(); g.fill(); } },
  beaver: (g) => { oval(g, '#6b4a2b', -0.2, -1, 2.9, 2.6, 0, true); oval(g, '#4a3220', -4.4, -0.4, 1.8, 0.8, 0.5); line(g, '#8a6a48', 0.4, [-2.6, -1.8], [2.4, -1.6]); },
  dino: (g) => { circle(g, '#3bb54a', -0.4, -0.4, 3.1); for (let i = 0; i < 4; i++) poly(g, '#2a8a36', [-3 + i * 1.2, -2.6 + i * 0.1], [-2.4 + i * 1.2, -4.4], [-1.8 + i * 1.2, -2.8]); circle(g, '#f5f5fa', 1.6, -2.4, 0.7); circle(g, '#15151c', 1.8, -2.4, 0.3); circle(g, SKIN, 1.4, 0.6, 1.3); },
  cloud: (g, c) => {
    const y = -7 + Math.sin(c.t * 1.5) * 0.4;
    for (const [x, r] of [[-1.6, 1.3], [0, 1.8], [1.7, 1.3]] as const) circle(g, '#b8c2d0', x, y, r);
    g.fillStyle = '#7fb8ff'; for (let i = 0; i < 4; i++) { const k = (c.t * 1.4 + i / 4) % 1; g.fillRect(-1.8 + i * 1.1, y + 1.2 + k * 5, 0.3, 0.7); }
  },
};
