// Per-alien animation state, advanced from the sim's positions. Pure (no DOM) so it can be unit-tested.
import { BASE_X, BASE_Y } from '../../sim/defs';
import type { EnemyView } from '../../sim/types';
import { flapPeriod } from './rig';
import type { Species } from './species';

/** Husks and splats persist through the wave, then fade together. */
export const SPLAT_FADE_S = 1.5;
/** Progress along the lane at which an alien rears up to strike the base. */
export const STRIKE_FROM = 0.93;

export interface Track {
  /** last field position */ x: number; y: number;
  /** heading of travel (radians, canvas convention: 0 = +x, π/2 = down) */ h: number;
  /** gait loop position: walkers = gait cycles walked, fliers = wingbeat loops flown */ cycles: number;
  /** 0..1 strike blend near the base */ attack: number;
  /** per-alien offset so fliers and new spawns don't move in lockstep */ offset: number;
}

export function newTrack(e: EnemyView): Track {
  const offset = ((e.id * 0.618034) % 1 + 1) % 1;
  return { x: e.x, y: e.y, h: Math.atan2(BASE_Y - e.y, BASE_X - e.x), cycles: offset, attack: 0, offset };
}

const angleTo = (from: number, to: number) => { let d = to - from; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

/**
 * Advances a track to the alien's new position. Walkers cover `stride` of their own body length (`lengthU`, field
 * units) per gait cycle, so their feet stay planted at any speed (a charging Ram's legs speed up with it). Fliers beat
 * their wings on a clock.
 */
export function advanceTrack(tr: Track, e: EnemyView, s: Species, lengthU: number, t: number, dt: number) {
  const dx = e.x - tr.x, dy = e.y - tr.y, d = Math.hypot(dx, dy);
  if (d > 1e-4) tr.h += angleTo(tr.h, Math.atan2(dy, dx)) * Math.min(1, dt * 10);
  if (s.flying) tr.cycles = t / flapPeriod(s) + tr.offset;
  else if (s.stride > 0 && d < lengthU * 2) tr.cycles += d / (s.stride * lengthU); // ignore teleports (spawns, core resets)
  tr.attack += ((e.progress >= STRIKE_FROM ? 1 : 0) - tr.attack) * Math.min(1, dt * 8);
  tr.x = e.x; tr.y = e.y;
}
