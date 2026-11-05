import { clamp } from './director';
/**
 * Choreographed flight. The ship's lateral route is scheduled seconds ahead as holds and eased moves, so its position
 * is a pure function of time. Enemy fire is then authored against that route (see `choreograph`): an on-target ship
 * never needs to react, and never jitters.
 */
export interface Move { start: number; end: number; from: number; to: number }
/** `weave` (optional) adds a music-locked sway on top of the planned lanes; it must be a pure function of time. */
export interface Route { moves: Move[]; field: number; weave?: (t: number) => number }
export interface Shot { vx: number; vy: number }
export const ROUTE = { field: 30, speed: 22, minMove: 8, maxMove: 26, holdMin: 1.2, holdMax: 3.4, ahead: 8, clearance: 5.5, graze: 9 };
export const newRoute = (x = 0, t = 0): Route => ({ moves: [{ start: t, end: t, from: x, to: x }], field: ROUTE.field });
const ease = (u: number) => u * u * u * (u * (u * 6 - 15) + 10);
export function routeX(r: Route, t: number): number { return laneX(r, t) + (r.weave ? r.weave(t) : 0); }
/** 0..1: how much a lane change is under way at t (a smooth bump over each move). */
export function moveActivity(r: Route, t: number): number {
  for (const m of r.moves) if (t > m.start && t < m.end && m.end > m.start && m.to !== m.from) { const u = (t - m.start) / (m.end - m.start), b = Math.sin(Math.PI * u); return b * b; }
  return 0;
}
/** Planned lane position (without the weave). */
export function laneX(r: Route, t: number): number {
  let m = r.moves[0];
  for (const move of r.moves) { if (move.start <= t) m = move; else break; }
  if (t >= m.end) return m.to;
  return m.from + (m.to - m.from) * ease(clamp((t - m.start) / Math.max(1e-6, m.end - m.start), 0, 1));
}
export const routeEnd = (r: Route) => r.moves[r.moves.length - 1].end;
/**
 * Extend the schedule to `t + ahead`. `rand` is the sim rng; `snap` moves a time to the next beat (sim seconds), so moves
 * both leave and land on beats. `phrase` gives the next phrase boundary: when one falls inside a hold, the ship launches a
 * long sweep exactly on it. Lanes wander away from the edges and toward a slow cruise line.
 */
export function extendRoute(r: Route, t: number, rand: () => number, cruise: (t: number) => number,
  snap: (t: number) => number = s => s, phrase: (t: number) => number = () => Infinity): void {
  while (r.moves.length > 1 && r.moves[1].end < t) r.moves.shift();
  while (routeEnd(r) < t + ROUTE.ahead) {
    const last = r.moves[r.moves.length - 1], from = last.to;
    const planned = snap(last.end + ROUTE.holdMin + rand() * (ROUTE.holdMax - ROUTE.holdMin));
    // Hold a little longer rather than start a move that would straddle an imminent phrase.
    const nextPhrase = phrase(last.end + ROUTE.holdMin * 0.5), sweep = nextPhrase <= planned + 1.2;
    const start = sweep ? nextPhrase : planned;
    const toward = clamp(cruise(start) - from, -1, 1) * 0.6 + (rand() - 0.5);
    // Phrase sweeps cross toward the far side of the field; ordinary moves wander.
    const dir = sweep ? (from > 0 ? -1 : 1) : Math.abs(from) > r.field * 0.7 ? -Math.sign(from) : toward >= 0 ? 1 : -1;
    const dist = sweep ? ROUTE.maxMove + 8 : ROUTE.minMove + rand() * (ROUTE.maxMove - ROUTE.minMove);
    const to = clamp(from + dir * dist, -r.field, r.field);
    r.moves.push({ start, end: snap(start + 0.3 + Math.abs(to - from) / ROUTE.speed), from, to });
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
    if (t + tt > routeEnd(r)) return 0;
    best = Math.min(best, Math.abs(bx - routeX(r, t + tt)));
  }
  return best;
}
/**
 * Re-aim a pattern so every shot misses the route by at least `clearance`. Try rotating the whole pattern by small
 * angles (keeps its shape, usually yields a close graze); shots that still connect are dropped, opening a gate.
 */
export function choreograph<T extends Shot>(r: Route, t: number, ex: number, ey: number, shots: T[], shipY: number, gate = false): T[] {
  // Walls keep their shape and open a wide, readable gate instead of rotating.
  if (gate) return shots.filter(s => missDistance(r, t, ex, ey, s, shipY) >= ROUTE.clearance * 1.8);
  const rotate = (s: T, a: number): T => ({ ...s, vx: s.vx * Math.cos(a) - s.vy * Math.sin(a), vy: s.vx * Math.sin(a) + s.vy * Math.cos(a) });
  const safe = (s: T) => missDistance(r, t, ex, ey, s, shipY) >= ROUTE.clearance;
  for (const a of [0, 0.05, -0.05, 0.1, -0.1, 0.16, -0.16]) {
    const turned = shots.map(s => rotate(s, a));
    if (turned.every(safe)) return turned;
  }
  return shots.filter(safe);
}
/**
 * Flanks: the field has three stations (left, centre, right). The ship holds its station (the weave plays around it)
 * until the rider (or the hands-off pilot) commands a move, which starts on a beat and lasts a whole number of beats.
 */
export const FLANK = { x: 22, lean: 4, reach: 13, spill: 26 };
export const stationX = (station: number) => station * FLANK.x;
/** Keep the schedule `ROUTE.ahead` long by holding the last lane; drops moves that ended long ago. */
export function holdRoute(r: Route, t: number): void {
  while (r.moves.length > 1 && r.moves[1].end < t - 1) r.moves.shift();
  while (routeEnd(r) < t + ROUTE.ahead) { const last = r.moves[r.moves.length - 1]; r.moves.push({ start: last.end, end: last.end + 1, from: last.to, to: last.to }); }
}
/** True when a lateral move (not a hold) is running or scheduled after t. */
export const movePending = (r: Route, t: number) => r.moves.some(m => m.end > t && m.to !== m.from);
/**
 * Schedule a move to `to` over `dur` from `start`; a running move finishes first (the new one queues behind it), and
 * any queued move or hold after that is replaced. Returns the actual start.
 */
export function commandMove(r: Route, start: number, dur: number, to: number): number {
  const running = r.moves.find(m => m.start < start && m.end > start && m.to !== m.from);
  const at = running ? running.end : start;
  r.moves = r.moves.filter(m => m.start < at);
  const last = r.moves[r.moves.length - 1];
  if (last && last.end > at) last.end = at;
  const from = laneX(r, at);
  r.moves.push({ start: at, end: at + dur, from, to });
  holdRoute(r, at);
  return at;
}
