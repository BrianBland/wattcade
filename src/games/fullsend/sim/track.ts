// Pure, seeded rollers and kickers layered on the cruising road (the Line Rider part). Sims and renderers both use it.
import { hash01 } from '../../warmup/sim/terrain';

const CELL = 140; // m; at most one bump per cell, so a bump never overlaps the next

export type BumpKind = 'roller' | 'kicker';
export interface Bump { kind: BumpKind; x0: number; len: number; h: number; up: number }

/** The bump in the cell containing x, or null. Rollers are cosine humps; kickers rise smoothly and drop off steeply. */
export function bumpAt(x: number, seed: number): Bump | null {
  const k = Math.floor(x / CELL), s = (seed % 9973) * 0.731;
  if (hash01(k * 7.13 + s) > 0.6) return null;
  const kicker = hash01(k * 3.71 + s + 1) < 0.35;
  const x0 = k * CELL + 15 + hash01(k * 5.3 + s + 2) * 40;
  if (kicker) {
    const up = 16 + hash01(k * 2.9 + s + 3) * 14, down = 5 + hash01(k * 4.1 + s + 4) * 4;
    return { kind: 'kicker', x0, len: up + down, h: 2 + hash01(k * 6.7 + s + 5) * 2.5, up };
  }
  if (hash01(k * 1.93 + s + 8) < 0.5) return null; // rollers are occasional: most of the cruise is smooth road
  return { kind: 'roller', x0, len: 40 + hash01(k * 8.3 + s + 6) * 40, h: 1.5 + hash01(k * 9.1 + s + 7) * 2.5, up: 0 };
}

/** The face slope (rise/run) of a kicker whose lip lies in (x0, x1], or null. A lip is a sharp edge: whatever your speed,
 *  crossing it on the road launches you off the face's angle (it never just rolls over). */
export function kickerLip(x0: number, x1: number, seed: number): number | null {
  if (!(x1 > x0)) return null;
  for (let k = Math.floor(x0 / CELL); k <= Math.floor(x1 / CELL); k++) {
    const b = bumpAt(k * CELL + 1, seed);
    if (!b || b.kind !== 'kicker') continue;
    const lip = b.x0 + b.up;
    if (lip > x0 && lip <= x1) return (2 * b.h) / b.up;
  }
  return null;
}

/** Height (m) the bumps add at x. Continuous everywhere. */
export function bumpH(x: number, seed: number): number {
  const b = bumpAt(x, seed);
  if (!b || x < b.x0 || x > b.x0 + b.len) return 0;
  const u = x - b.x0;
  if (b.kind === 'roller') return (b.h / 2) * (1 - Math.cos((2 * Math.PI * u) / b.len));
  if (u <= b.up) { const k = u / b.up; return b.h * k * k; }          // a smooth ramp up to the lip…
  const k = (u - b.up) / (b.len - b.up);                                // …then a steep cosine drop
  return (b.h / 2) * (1 + Math.cos(Math.PI * k));
}

/**
 * Whether a bike at speed v (m/s) leaves the ground: the road curves down faster than gravity can pull the bike
 * round (v² · h″ < −g). `curv` is the road's second derivative (1/m).
 */
export const takesOff = (v: number, curv: number, g: number) => v * v * curv < -g;

/** Things to catch up high (sky islands and the moon): golden rings and stars, at most one per `AIR_CELL` metres. */
export const AIR_CELL = 60;
export type AirKind = 'ring' | 'star';
export interface AirItem { id: number; kind: AirKind; x: number; h: number }
/** The item in cell k (or null), floating `h` metres above the road, between hMin and hMax. */
export function airItemAt(k: number, seed: number, hMin: number, hMax: number): AirItem | null {
  const s = (seed % 7919) * 0.613;
  if (hash01(k * 3.17 + s + 11) > 0.7) return null;
  const kind: AirKind = hash01(k * 5.91 + s + 12) < 0.35 ? 'ring' : 'star';
  return { id: k, kind, x: k * AIR_CELL + 10 + hash01(k * 2.33 + s + 13) * (AIR_CELL - 20), h: hMin + hash01(k * 7.77 + s + 14) * (hMax - hMin) };
}

/** Wind on the cruise: seeded zones (≤ 1 per `WIND_CELL` m), −1 = full headwind … +1 = full tailwind, eased in and out. */
export const WIND_CELL = 900;
export function windAt(x: number, seed: number): number {
  const k = Math.floor(x / WIND_CELL), s = (seed % 6007) * 0.457;
  if (hash01(k * 4.41 + s + 21) > 0.55) return 0;
  const sign = hash01(k * 6.13 + s + 22) < 0.55 ? -1 : 1, mag = 0.5 + 0.5 * hash01(k * 2.71 + s + 23);
  const x0 = k * WIND_CELL + 100 + hash01(k * 3.3 + s + 24) * 200, len = 300 + hash01(k * 5.7 + s + 25) * 250;
  if (x < x0 || x > x0 + len) return 0;
  const u = (x - x0) / len, ease = Math.min(1, u / 0.15, (1 - u) / 0.15);
  return sign * mag * ease;
}

/** The flooded tunnel in a Dive: the road ramps down (cosine) into a sunken tunnel, runs along its floor, and climbs out
 *  at the far end. Depth below the road (m, ≤ 0) at x for a tunnel starting at x0 of length len. The water line sits at
 *  DIVE.water, so you ride down into it; the tunnel roof is DIVE.roof above the floor. */
export const DIVE = { depth: 16, ramp: 28, water: -3, roof: 9 };
export function diveDip(x0: number, len: number, x: number): number {
  if (x <= x0 || x >= x0 + len) return 0;
  const r = Math.min(DIVE.ramp, len / 2), d = Math.min(x - x0, x0 + len - x);
  return d >= r ? -DIVE.depth : -DIVE.depth * 0.5 * (1 - Math.cos((Math.PI * d) / r));
}
