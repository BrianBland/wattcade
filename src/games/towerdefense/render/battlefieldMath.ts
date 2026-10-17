import { BASE_X, BASE_Y, PADS, laneAt, laneLength, lanePolyline } from '../sim/defs';
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
export const TOWER_CABLE_X = 65 * 8.4 / 136;
/** The painted lane curves are monotonic in y, so interpolate their x at a shared height. */
export function laneXAtY(lane: number, y: number): number {
  const points = lanePolyline(lane, 1);
  for (let i = 1; i < points.length; i++) if (y <= points[i].y) {
    const a = points[i - 1], b = points[i], f = Math.max(0, (y - a.y) / (b.y - a.y));
    return a.x + (b.x - a.x) * f;
  }
  return points[points.length - 1].x;
}
/** Continuous cables start under the turret and finish under the tower pad, never at its outer edge. */
export function cableRoute(pad: number): Point[] {
  const p = PADS[pad], points: Point[] = [{ x: BASE_X, y: BASE_Y }];
  // Walk the outside of the pad's own lane, so the cable stays off the road however the lanes curve.
  const lane = p.lane, steps = 24;
  for (let i = 1; i < steps; i++) {
    const q = laneAt(lane, laneLength(lane) * (1 - i / steps));
    const away = Math.sign((q.x - BASE_X) * q.nx + (q.y - BASE_Y) * q.ny) || 1;
    points.push({ x: q.x + q.nx * 14 * away, y: q.y + q.ny * 14 * away });
  }
  points.push({x:p.x+TOWER_CABLE_X,y:p.y},{x:p.x,y:p.y});
  // Catmull–Rom interpolation rounds the route without cutting across the corridor in big arcs.
  const route: Point[] = [];
  for(let i=0;i<points.length-1;i++) {
    const a=points[Math.max(0,i-1)],b=points[i],c=points[i+1],d=points[Math.min(points.length-1,i+2)];
    for(let j=0;j<12;j++) {
      const t=j/12,t2=t*t,t3=t2*t;
      const axis=(k:'x'|'y')=>0.5*(2*b[k]+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t2+(-a[k]+3*b[k]-3*c[k]+d[k])*t3);
      route.push({x:axis('x'),y:axis('y')});
    }
  }
  route.push(points[points.length-1]); return route;
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
