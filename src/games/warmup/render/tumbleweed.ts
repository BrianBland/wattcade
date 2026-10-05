// Tumbleweeds: wind-blown balls that roll and bounce along the ground. Motion is a pure function of (params, age);
// params come from a seeded rng, so a given seed + timeline always gives the same weeds.
import type { G } from './paint';
import { hash01 } from '../sim/terrain';

/** far = on the mid-ground band (parallax .5, behind the rider), road = on the road behind the rider, near = in front of the rider. */
export type WeedLane = 'far' | 'road' | 'near';
export const LANE_PARALLAX: Record<WeedLane, number> = { far: 0.5, road: 1, near: 1 };

export interface Weed {
  seed: number; lane: WeedLane;
  r: number;          // radius, buffer px
  speed: number;      // px/s the wind carries it leftwards along its lane
  u0: number;         // lane-space x at spawn (px)
  t0: number;
  hopA: number;       // bounce height, px
  hopHz: number; phase: number;
}

const LANE_R: Record<WeedLane, [number, number]> = { far: [1.6, 3], road: [2.6, 5], near: [4.5, 8] };

/** Spawn a weed just off the right edge. `scroll` = the lane's current scroll offset (px), so u0 is in lane space. */
export function makeWeed(rng: () => number, lane: WeedLane, t0: number, offRightPx: number, scroll: number): Weed {
  const [r0, r1] = LANE_R[lane], r = r0 + rng() * (r1 - r0);
  return {
    seed: rng(), lane, r, speed: 34 + rng() * 46, u0: offRightPx + scroll, t0,
    hopA: r * (0.5 + rng() * 1.9), hopHz: 0.7 + rng() * 0.9, phase: rng(),
  };
}

/** Parabolic bounces: 0 on the ground, `a` at the apex, repeating at `hz`. */
export function hop(age: number, a: number, hz: number, phase: number): number {
  const f = (((age * hz + phase) % 1) + 1) % 1;
  return a * (1 - (2 * f - 1) ** 2);
}

export interface WeedPose { u: number; hop: number; spin: number }
/** Position in lane space, bounce height and spin (radians): it rolls without slipping, so spin follows ground speed. */
export function weedAt(w: Weed, t: number): WeedPose {
  const age = Math.max(0, t - w.t0);
  return { u: w.u0 - w.speed * age, hop: hop(age, w.hopA, w.hopHz, w.phase), spin: -(w.speed * age) / w.r };
}

/** True once the weed has rolled off the left edge (`screenX` = its current screen x) or lived too long. */
export const weedGone = (screenX: number, r: number, age: number) => screenX < -r - 20 || age > 60;

/** A tangled ball of twigs, rotated by `spin`. */
export function drawTumbleweed(g: G, x: number, y: number, r: number, spin: number, seed: number, alpha = 1) {
  g.globalAlpha = alpha * 0.55; g.fillStyle = '#9a7242'; g.beginPath(); g.arc(x, y, r * 0.85, 0, Math.PI * 2); g.fill();
  g.globalAlpha = alpha; g.lineWidth = r > 4 ? 1.2 : 0.9; g.lineCap = 'round';
  const n = r > 4 ? 9 : 6;
  for (let i = 0; i < n; i++) {
    const a = spin + (i * Math.PI * 2) / n + hash01(Math.floor(seed * 1e6) + i) * 0.5, b = a + Math.PI * (0.75 + hash01(i * 7 + 3) * 0.4);
    g.strokeStyle = i % 2 ? '#c9a066' : '#7a5530';
    g.beginPath(); g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r); g.stroke();
  }
  g.globalAlpha = 1;
}
