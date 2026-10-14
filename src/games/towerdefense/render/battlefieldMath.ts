import { BASE_X, BASE_Y, PADS, laneAt, laneLength } from '../sim/defs';
export interface Point { x: number; y: number }
export const LIGHT_BUDGET = 32;
export function trenchStrip(lane: number, halfWidth = 6.5, steps = 80) {
  const left: Point[] = [], right: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const p = laneAt(lane, laneLength(lane) * i / steps);
    left.push({ x: p.x + p.nx * halfWidth, y: p.y + p.ny * halfWidth });
    right.push({ x: p.x - p.nx * halfWidth, y: p.y - p.ny * halfWidth });
  }
  return [...left, ...right.reverse()];
}
/** Two strokes per revolution. Pulses are clocked by crossings, then travel in seconds. */
export function strokeCrossings(previous: number, current: number): number {
  if (!Number.isFinite(previous) || !Number.isFinite(current) || current < previous) return 0;
  return Math.min(8, Math.max(0, Math.floor(current * 2) - Math.floor(previous * 2)));
}
export function pulsePosition(age: number, length: number, speed = 55): number | null {
  if (age < 0 || length <= 0 || age * speed > length) return null;
  return age * speed / length;
}
export function along(points: Point[], fraction: number): Point {
  if (fraction <= 0) return points[0];
  if (fraction >= 1) return points[points.length - 1];
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  let d = lengths.reduce((a, b) => a + b, 0) * Math.max(0, Math.min(1, fraction));
  for (let i = 0; i < lengths.length; i++) {
    if (d <= lengths[i]) { const f = d / (lengths[i] || 1); return { x: points[i].x + (points[i + 1].x - points[i].x) * f, y: points[i].y + (points[i + 1].y - points[i].y) * f }; }
    d -= lengths[i];
  }
  return points[points.length - 1];
}
/** Canonical deck sockets, assigned uniquely to stable pad ids. Coordinates from the outpost manifest. */
const SOCKETS = [[62.01,257.75],[143.64,416.62],[380.03,94.34],[143.07,94.34],[457.69,256.61],[381.73,417.18]];
export const TOWER_CABLE_X = 65 * 8.4 / 136;
/** Smooth armoured conduits; any floor crossings are buried by the renderer. */
export function cableRoute(pad: number): Point[] {
  const p = PADS[pad], socket = SOCKETS[pad];
  const a = { x: BASE_X + (socket[0] - 260) * 22 / 440, y: BASE_Y + (socket[1] - 260) * 22 / 440 };
  const dx = a.x - BASE_X, dy = a.y - BASE_Y, length = Math.hypot(dx,dy);
  const b = { x: a.x + dx / length * 12, y: a.y + dy / length * 12 };
  const d = { x: p.x + TOWER_CABLE_X, y: p.y }, c = { x: d.x + 8, y: d.y + 10 };
  return Array.from({length:97},(_,i)=>{
    const t=i/96,u=1-t;
    return {x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,y:u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y};
  });
}
export function inTrench(p: Point): boolean {
  for (let l = 0; l < 3; l++) for (let i = 0; i <= 80; i++) {
    const q = laneAt(l, laneLength(l) * i / 80);
    if (Math.hypot(p.x - q.x, p.y - q.y) < 7.75) return true;
  }
  return false;
}
export function boundedLights<T>(lights: T[], budget = LIGHT_BUDGET): T[] { return lights.slice(0, Math.max(0, Math.floor(budget))); }

export function strokeTimes(previous: number, current: number, t0: number, t1: number): number[] {
  const count = strokeCrossings(previous, current);
  if (!count || t1 < t0) return [];
  const last = Math.floor(current * 2);
  return Array.from({ length: count }, (_, i) => {
    const crossing = (last - count + i + 1) / 2;
    return t0 + (t1 - t0) * (crossing - previous) / (current - previous);
  });
}
