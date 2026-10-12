// Original simple art, retained for the per-player Classic overworld mode.
// The Drive-In biome: a desert drive-in at dusk (a lobby mode, not in the biome loop). The big screen itself is a DOM
// <video> placed by the shell; the canvas draws the frame, poles, marquee and the glow around the screen.
import { hash01 } from '../../sim/terrain';
import { saguaro } from './biomesMore';
import { DUSK_MESA, drawMesaRange } from './mesa';
import { disc, rect, tri, type BiomeLook, type G } from './paint';

export interface BufRect { x: number; y: number; w: number; h: number }

const CARS = ['#2fb7b0', '#f1e2b6', '#ff7ab8', '#d63a3a', '#8ad8a0'];
function car(g: G, h: number, x: number, y: number) {
  const c = CARS[Math.floor(h * 97) % CARS.length];
  rect(g, c, x - 9, y - 5, 18, 3);                                  // body
  rect(g, c, x - 5, y - 8, 9, 3); rect(g, '#9fd8ff', x - 4, y - 8, 3, 2); rect(g, '#9fd8ff', x, y - 8, 3, 2); // cabin + windows
  tri(g, c, x - 9, y - 5, x - 7, y - 5, x - 9, y - 8);              // tail fin
  rect(g, '#e8e8f0', x - 9, y - 3, 18, 1);                          // chrome
  disc(g, '#15151c', x - 5, y - 1.5, 2); disc(g, '#15151c', x + 5, y - 1.5, 2);
  rect(g, '#ff3030', x - 9, y - 5, 1, 1); rect(g, '#fff4b0', x + 8, y - 5, 1, 1);
  g.fillStyle = '#fff4b01c'; g.beginPath(); g.moveTo(x + 9, y - 5); g.lineTo(x + 24, y - 8); g.lineTo(x + 24, y - 1); g.closePath(); g.fill();
}
function speaker(g: G, x: number, y: number, t: number) {
  rect(g, '#7a7a88', x, y - 9, 1, 9); rect(g, '#2a2a34', x - 1, y - 12, 3, 4);
  if (Math.sin(t * 2 + x) > 0.5) rect(g, '#ff4d6d', x, y - 11, 1, 1);
}
function lamp(g: G, x: number, y: number) {
  rect(g, '#2a2433', x, y - 22, 1, 22); rect(g, '#2a2433', x - 2, y - 23, 5, 1);
  disc(g, '#ffd98a22', x, y - 20, 10); disc(g, '#ffd98a55', x, y - 21, 4); rect(g, '#fff0c0', x - 1, y - 22, 3, 1);
}
function concession(g: G, x: number, y: number, t: number) {
  rect(g, '#6a3a4c', x - 9, y - 11, 18, 11); rect(g, '#ffd98a', x - 6, y - 8, 12, 4);
  for (let i = 0; i < 6; i++) rect(g, i % 2 ? '#ffffff' : '#d63a3a', x - 10 + i * 3.4, y - 13, 3.4, 3);
  if (Math.sin(t * 3) > -0.4) rect(g, '#ff4fd8', x - 5, y - 17, 10, 1);
}

export const DRIVE_IN: BiomeLook = {
  sky: ['#120a2e', '#e0603a'], haze: '#7a4a78', ridge: '#7a4258', mid: '#5a3446', ground: '#4a2c3c', groundDark: '#3a2030',
  road: '#3a3440', roadEdge: '#241f2a', roadKind: 'asphalt', stars: 0.9,
  actor: 'none', weeds: true, particles: 'dust', rider: 'road', outdoor: false, lights: 0.85, dusk: 0.8,
  ambient: { vol: 0.02, freq: 600, q: 0.4 },
  backdrop(g, w, y, u) { drawMesaRange(g, w, y, u, DUSK_MESA); },
  midProp(g, h, x, y, t) {
    if (h < 0.3) { speaker(g, x + 12, y, t); car(g, h, x, y); }
    else if (h < 0.4) speaker(g, x, y, t);
    else if (h < 0.45) concession(g, x, y, t);
    else if (h < 0.52) lamp(g, x, y);
    else if (h < 0.6) { g.globalAlpha = 0.8; saguaro(g, h, x, y); g.globalAlpha = 1; }
    else if (h < 0.68) { disc(g, '#4a5a4a', x, y - 2, 3); disc(g, '#5a6a54', x + 2, y - 2, 2); }
  },
  foreProp(g, h, x, y) {
    if (h < 0.3) rect(g, '#6a4a5a', x, y - 1, 2, 1);
    else if (h < 0.38) { rect(g, '#2f5a46', x, y - 3, 1, 3); rect(g, '#2f5a46', x + 2, y - 4, 1, 4); }
  },
  celestial(g, w) {
    disc(g, '#f4e8c8', w * 0.86, 22, 6); disc(g, '#12183a', w * 0.86 + 2, 21, 5);   // crescent
  },
};

/** Screen frame, poles, marquee lights and a soft glow, in buffer px. `r` is the video rectangle; `foot` is where the poles end. */
export function drawScreenFrame(g: G, r: BufRect, foot: number, t: number) {
  const B = 3; // bezel thickness; sub-pixel misalignment with the DOM video hides under it
  g.fillStyle = '#d8b0ff12'; g.beginPath(); g.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w * 0.78, r.h * 0.9, 0, 0, Math.PI * 2); g.fill(); // glow on the sky
  for (const fx of [0.2, 0.8]) { const px = r.x + r.w * fx; rect(g, '#2a2433', px - 2, r.y + r.h, 4, foot - r.y - r.h); rect(g, '#463a5a', px - 2, r.y + r.h, 1, foot - r.y - r.h); }
  rect(g, '#2a2433', r.x + r.w * 0.2, r.y + r.h + (foot - r.y - r.h) * 0.45, r.w * 0.6, 2);
  rect(g, '#1b1626', r.x - B, r.y - B, r.w + 2 * B, r.h + 2 * B);
  rect(g, '#3b3150', r.x - B, r.y - B, r.w + 2 * B, 1);
  rect(g, '#05040d', r.x - 1, r.y - 1, r.w + 2, r.h + 2);                      // glass (the video covers it)
  const n = Math.max(8, Math.round(r.w / 7));
  for (let i = 0; i <= n; i++) {
    const on = Math.floor(t * 3 + i) % 3 !== 0;
    rect(g, on ? '#ffd98a' : '#6a5a4a', r.x - B + 1 + ((r.w + 2 * B - 3) * i) / n, r.y - B, 1, 1);
  }
}

/** Faint flickering light cone from the projector trailer's lens to the screen's lower corners (buffer px). */
export function drawProjectorBeam(g: G, lx: number, ly: number, r: BufRect, t: number) {
  const flick = 0.05 + 0.025 * Math.sin(t * 24) + 0.02 * hash01(Math.floor(t * 12));
  g.fillStyle = `rgba(210,230,255,${flick})`;
  g.beginPath(); g.moveTo(lx, ly); g.lineTo(r.x + r.w * 0.3, r.y + r.h); g.lineTo(r.x + r.w * 0.7, r.y + r.h); g.closePath(); g.fill();
}
