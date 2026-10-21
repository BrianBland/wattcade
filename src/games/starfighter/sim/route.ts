/**
 * The ship's path through the world, as a function of route distance `s`: straight legs joined by constant-curvature
 * arcs. Heading h: forward = (−sin h, −cos h) in world (x, z), right = (cos h, −sin h); positive h turns left.
 * Combat stays in the flight frame; the world (terrain, ground units) is placed with `pose`.
 */
export interface Pose { x: number; z: number; h: number }
interface Piece { s0: number; x0: number; z0: number; h0: number; k: number }
export const TURN = { curvature: 0.0035, minDeg: 30, maxDeg: 70, firstAfter: 450, gapMin: 1100, gapMax: 2200, endClear: 550 };
export const fwd = (h: number) => ({ x: -Math.sin(h), z: -Math.cos(h) });
export const right = (h: number) => ({ x: Math.cos(h), z: -Math.sin(h) });
function at(p: Piece, s: number): Pose {
  const d = s - p.s0;
  if (Math.abs(p.k) < 1e-9) { const f = fwd(p.h0); return { x: p.x0 + f.x * d, z: p.z0 + f.z * d, h: p.h0 }; }
  const h = p.h0 + p.k * d;
  // ∫ fwd(h0 + k u) du = [cos(h)/k, −sin(h)/k]: x' = −sin h, z' = −cos h.
  return { x: p.x0 + (Math.cos(h) - Math.cos(p.h0)) / p.k, z: p.z0 - (Math.sin(h) - Math.sin(p.h0)) / p.k, h };
}
export class WorldRoute {
  private pieces: Piece[] = [{ s0: -1e6, x0: 0, z0: 0, h0: 0, k: 0 }];
  constructor(start: Pose = { x: 0, z: 0, h: 0 }) { this.pieces = [{ s0: 0, x0: start.x, z0: start.z, h0: start.h, k: 0 }]; }
  private piece(s: number): Piece { let p = this.pieces[0]; for (const q of this.pieces) { if (q.s0 <= s) p = q; else break; } return p; }
  pose(s: number): Pose { return at(this.piece(s), s); }
  /** Curvature (rad per unit) at s; times ground speed = turn rate. */
  curvature(s: number): number { return this.piece(s).k; }
  /** Replace everything after `from` with a straight leg continuing the current heading. */
  straighten(from: number) {
    const p = this.pose(from);
    this.pieces = this.pieces.filter(q => q.s0 < from); this.pieces.push({ s0: from, x0: p.x, z0: p.z, h0: p.h, k: 0 });
  }
  /** Turn by `angle` (rad, + = left) starting at s0 (everything after s0 is replaced). */
  turn(s0: number, angle: number, curvature = TURN.curvature) {
    this.straighten(s0);
    const p = this.pose(s0), k = Math.sign(angle) * curvature, len = Math.abs(angle) / curvature;
    this.pieces[this.pieces.length - 1].k = k;
    const e = at({ s0, x0: p.x, z0: p.z, h0: p.h, k }, s0 + len);
    this.pieces.push({ s0: s0 + len, x0: e.x, z0: e.z, h0: e.h, k: 0 });
  }
}
/**
 * Plan a segment's turns from `sNow` to `sEnd` (route distance). Only open biomes turn; turns start on the earliest
 * phrase at or after their planned point (`snap`), keep clear of segment ends, alternate direction mostly.
 */
export function planTurns(route: WorldRoute, sNow: number, sEnd: number, turns: boolean, rand: () => number, snap: (s: number) => number = s => s) {
  route.straighten(sNow);
  if (!turns) return;
  let s = sNow + TURN.firstAfter + rand() * 300, dir = rand() < 0.5 ? -1 : 1;
  while (true) {
    const start = snap(s), deg = TURN.minDeg + rand() * (TURN.maxDeg - TURN.minDeg), len = deg * Math.PI / 180 / TURN.curvature;
    if (start + len > sEnd - TURN.endClear) break;
    route.turn(start, dir * deg * Math.PI / 180);
    s = start + len + TURN.gapMin + rand() * (TURN.gapMax - TURN.gapMin); if (rand() < 0.75) dir = -dir;
  }
}
/** World point for flight-frame coords (lateral x, `ahead` of the ship's route point) at pose p. */
export const toWorld = (p: Pose, lx: number, ahead: number) => { const f = fwd(p.h), r = right(p.h); return { x: p.x + r.x * lx + f.x * ahead, z: p.z + r.z * lx + f.z * ahead }; };
/** Flight-frame coords of a world point. */
export const toLocal = (p: Pose, wx: number, wz: number) => { const dx = wx - p.x, dz = wz - p.z, f = fwd(p.h), r = right(p.h); return { lx: dx * r.x + dz * r.z, ahead: dx * f.x + dz * f.z }; };
