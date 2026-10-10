import { clamp } from './director';
/**
 * Choreographed flight. The ship's lateral route is scheduled seconds ahead as holds and eased moves, so its position
 * is a pure function of time. Enemy fire is then authored against that route (see `choreograph`): an on-target ship
 * never needs to react, and never jitters.
 */
export interface Move { start: number; end: number; from: number; to: number }
export interface Route { moves: Move[]; field: number }
export interface Shot { vx: number; vy: number }
export const ROUTE = { field: 30, speed: 22, minMove: 8, maxMove: 26, holdMin: 0.5, holdMax: 1.9, ahead: 6, clearance: 5.5, graze: 9 };
export const newRoute = (x = 0, t = 0): Route => ({ moves: [{ start: t, end: t, from: x, to: x }], field: ROUTE.field });
const ease = (u: number) => u * u * u * (u * (u * 6 - 15) + 10);
export function routeX(r: Route, t: number): number {
  let m = r.moves[0];
  for (const move of r.moves) { if (move.start <= t) m = move; else break; }
  if (t >= m.end) return m.to;
  return m.from + (m.to - m.from) * ease(clamp((t - m.start) / Math.max(1e-6, m.end - m.start), 0, 1));
}
export const routeEnd = (r: Route) => r.moves[r.moves.length - 1].end;
/**
 * Extend the schedule to `t + ahead`. `rand` is the sim rng; `snap` aligns move starts to musical beats (sim seconds).
 * Lanes wander away from the edges and toward a slow cruise line so the route reads as deliberate flying.
 */
export function extendRoute(r: Route, t: number, rand: () => number, cruise: (t: number) => number, snap: (t: number) => number = s => s): void {
  while (r.moves.length > 1 && r.moves[1].end < t) r.moves.shift();
  while (routeEnd(r) < t + ROUTE.ahead) {
    const last = r.moves[r.moves.length - 1], from = last.to;
    const start = snap(last.end + ROUTE.holdMin + rand() * (ROUTE.holdMax - ROUTE.holdMin));
    const toward = clamp(cruise(start) - from, -1, 1) * 0.6 + (rand() - 0.5);
    const dir = Math.abs(from) > r.field * 0.7 ? -Math.sign(from) : toward >= 0 ? 1 : -1;
    const dist = ROUTE.minMove + rand() * (ROUTE.maxMove - ROUTE.minMove);
    const to = clamp(from + dir * dist, -r.field, r.field);
    r.moves.push({ start, end: start + 0.3 + Math.abs(to - from) / ROUTE.speed, from, to });
  }
}
/** Closest approach of a shot fired from (ex, ey) to the route while it crosses the ship row; Infinity if it never does. */
export function missDistance(r: Route, t: number, ex: number, ey: number, s: Shot, shipY: number, halfRow = 5): number {
  if (s.vy <= 0.5) return Infinity;
  const t0 = (shipY - halfRow - ey) / s.vy, t1 = (shipY + halfRow - ey) / s.vy;
  if (t1 < 0) return Infinity;
  let best = Infinity;
  // Sample every 50ms: shallow shots linger in the row for seconds while sliding sideways.
  const n = Math.max(4, Math.ceil((t1 - t0) / 0.05));
  for (let i = 0; i <= n; i++) {
    const tt = Math.max(0, t0 + (t1 - t0) * i / n), bx = ex + s.vx * tt;
    if (Math.abs(bx) > 100) continue;
    // Shots crossing beyond the scheduled route are unpredictable; treat them as hits so they get re-aimed or dropped.
    if (t + tt > routeEnd(r) + ROUTE.ahead * 0.5) return 0;
    best = Math.min(best, Math.abs(bx - routeX(r, t + tt)));
  }
  return best;
}
/**
 * Re-aim a pattern so every shot misses the route by at least `clearance`. Try rotating the whole pattern by small
 * angles (keeps its shape, usually yields a close graze); shots that still connect are dropped, opening a gate.
 */
export function choreograph<T extends Shot>(r: Route, t: number, ex: number, ey: number, shots: T[], shipY: number): T[] {
  const rotate = (s: T, a: number): T => ({ ...s, vx: s.vx * Math.cos(a) - s.vy * Math.sin(a), vy: s.vx * Math.sin(a) + s.vy * Math.cos(a) });
  const safe = (s: T) => missDistance(r, t, ex, ey, s, shipY) >= ROUTE.clearance;
  for (const a of [0, 0.05, -0.05, 0.1, -0.1, 0.16, -0.16]) {
    const turned = shots.map(s => rotate(s, a));
    if (turned.every(safe)) return turned;
  }
  return shots.filter(safe);
}
