// Game entrances on the overworld road: a portal (or, for games drawn in the overworld's own style, a start gate) that
// the rider rides into to start a game, and the one they ride back out of afterwards. The shell decides where it
// stands (road metres) and what it leads to; this file only says how open it is and draws it.
import type { G } from './paint';
import { PORTAL, portalOpen } from './portal';

/** Art painted through the portal (a game's `drawCard`), in canvas px; `t` in seconds. */
export type EntranceArt = (g: CanvasRenderingContext2D, w: number, h: number, t: number) => void;
export interface LobbyEntrance {
  /** 'enter': stands ahead, you ride into it. 'exit': you just came out of it; it shuts behind you. */
  kind: 'enter' | 'exit';
  style: 'portal' | 'gate';
  /** Road distance (m) where it stands. */
  x: number;
  color: string;
  label?: string;
  art?: EntranceArt;
}

/** Seconds a new entrance takes to open, and how long an exit portal stays open if the rider doesn't move off. */
export const ENTRANCE = { growS: 0.6, exitHoldS: 2.4, exitShutS: 0.5, confettiS: 3 };

/** How open (0..1) an entrance is `age` seconds after it appeared, for a rider at road distance `d`. */
export function entranceOpen(e: Pick<LobbyEntrance, 'kind' | 'x'>, d: number, age: number): number {
  if (e.kind === 'enter') return Math.min(1, Math.max(0, age / ENTRANCE.growS)) * portalOpen(e.x, d);
  const byTime = age < ENTRANCE.exitHoldS ? 1 : Math.max(0, 1 - (age - ENTRANCE.exitHoldS) / ENTRANCE.exitShutS);
  return Math.min(byTime, portalOpen(e.x, d));
}

/** A start gate over the road at (x, y): two posts, a banner in the game's colour and a row of lights. */
export function drawStartGate(g: G, x: number, y: number, t: number, color: string, k: number) {
  if (k <= 0.02) return;
  const w = 48, hgt = 40, top = Math.round(y - hgt), l = Math.round(x - w / 2);
  g.globalAlpha = k;
  g.fillStyle = '#26262e'; g.fillRect(l, top, 4, hgt); g.fillRect(l + w - 4, top, 4, hgt);
  g.fillStyle = '#1b1b22'; g.fillRect(l - 2, top - 3, w + 4, 12);
  g.fillStyle = color; g.fillRect(l, top - 1, w, 8);
  for (let i = 0; i < 6; i++) {
    const on = (Math.floor(t * 3) + i) % 6 < 3;
    g.fillStyle = on ? '#fff3b0' : '#5a2a1a'; g.fillRect(l + 5 + i * 7, top + 1, 4, 4);
  }
  for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#1b1b22'; g.fillRect(l + i * 8, Math.round(y) + 1, 8, 2); } // start line
  g.globalAlpha = 1;
}
/** Where the gate's name board text goes, relative to its foot. */
export const GATE_BOARD = { dy: -46 };

const CONFETTI = ['#ff7a45', '#efca70', '#66e6b8', '#5fd6ff', '#c6a1ff', '#ff4d6d'];
/** A celebratory burst from (cx, cy) `age` seconds in (falls under gravity, fades out). */
export function drawConfetti(g: G, cx: number, cy: number, age: number, floorY: number, color?: string) {
  if (age < 0 || age > ENTRANCE.confettiS) return;
  for (let i = 0; i < 80; i++) {
    const side = i % 2 ? 1 : -1, sp = 30 + ((i * 37) % 55), ang = -Math.PI / 2 + side * (0.2 + ((i * 13) % 45) / 100);
    const x = cx + Math.cos(ang) * sp * age + Math.sin(age * 6 + i) * 2, y = cy + Math.sin(ang) * sp * age + 32 * age * age;
    if (y > floorY) continue;
    g.globalAlpha = Math.max(0, 1 - age / ENTRANCE.confettiS);
    g.fillStyle = color && i % 3 === 0 ? color : CONFETTI[i % CONFETTI.length];
    g.fillRect(Math.round(x), Math.round(y), i % 3 ? 2 : 1, i % 3 ? 1 : 2);
  }
  g.globalAlpha = 1;
}

/** The window art canvas size (CSS-ish px) a portal's art is rendered at before being drawn into the oval. */
export const ART = { w: 72, h: 128, fps: 15 };
/** Paint `art` (a ~23:10 card) to cover a tall `w`×`h` canvas, centred. */
export function paintArt(c: CanvasRenderingContext2D, art: EntranceArt, w: number, h: number, t: number) {
  const cw = h * 2.3;
  c.save(); c.clearRect(0, 0, w, h); c.translate(-(cw - w) / 2, 0);
  try { art(c, cw, h, t); } catch { /* bad art: leave the swirl */ }
  c.restore();
}
export { PORTAL };
