import type { P } from './lib.ts';
/** Builds a waypoint list from straight runs and circular arcs, so bends are deliberate (sampled every ~4 units). */
export class Path {
  pts: P[] = [];
  constructor(...start: P[]) { this.pts.push(...start); }
  get at() { return this.pts[this.pts.length - 1]; }
  line(to: P, step = 6) { const a = this.at, n = Math.max(1, Math.round(Math.hypot(to.x - a.x, to.y - a.y) / step)); for (let i = 1; i <= n; i++) this.pts.push({ x: a.x + (to.x - a.x) * i / n, y: a.y + (to.y - a.y) * i / n }); return this; }
  /** Arc around centre c from the current point, sweeping `deg` degrees (positive = clockwise on screen). */
  arc(c: P, deg: number, step = 4) {
    const a = this.at, r = Math.hypot(a.x - c.x, a.y - c.y), a0 = Math.atan2(a.y - c.y, a.x - c.x), sweep = deg * Math.PI / 180;
    const n = Math.max(2, Math.round(Math.abs(sweep) * r / step));
    for (let i = 1; i <= n; i++) { const t = a0 + sweep * i / n; this.pts.push({ x: c.x + Math.cos(t) * r, y: c.y + Math.sin(t) * r }); }
    return this;
  }
  /** Spiral around c from the current point, sweeping `deg` while the radius eases to r1 (x stretched by `sx`). */
  spiral(c: P, deg: number, r1: number, sx = 1, step = 4) {
    const a = this.at, dx = (a.x - c.x) / sx, dy = a.y - c.y, r0 = Math.hypot(dx, dy), a0 = Math.atan2(dy, dx), sweep = deg * Math.PI / 180;
    const n = Math.max(2, Math.round(Math.abs(sweep) * Math.max(r0, r1) / step));
    for (let i = 1; i <= n; i++) { const k = i / n, t = a0 + sweep * k, r = r0 + (r1 - r0) * k; this.pts.push({ x: c.x + Math.cos(t) * r * sx, y: c.y + Math.sin(t) * r }); }
    return this;
  }
}
