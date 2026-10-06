import * as THREE from 'three';
import { sampleAt, type Track } from '../sim/track';

export const LW = 3.2;   // lane width (m)
export const EXAG = 3;   // visual height exaggeration

export interface Frame { p: THREE.Vector3; r: THREE.Vector3; u: THREE.Vector3; f: THREE.Vector3; tunnel: number; roll: number }
export const newFrame = (): Frame => ({ p: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3(), f: new THREE.Vector3(), tunnel: 0, roll: 0 });

/**
 * The track centreline in world space with a rolled frame per sample (right/up tilt with the bank).
 * Sample i ↔ program time i / hz; lookups by distance interpolate between samples.
 */
export class Path {
  readonly n: number;
  readonly pos: Float32Array; readonly right: Float32Array; readonly up: Float32Array; readonly fwd: Float32Array;
  readonly halfWidth: number; readonly inner: number;
  constructor(readonly track: Track) {
    const t = track, n = t.dist.length;
    this.n = n;
    this.pos = new Float32Array(n * 3); this.right = new Float32Array(n * 3); this.up = new Float32Array(n * 3); this.fwd = new Float32Array(n * 3);
    let x = 0, z = 0;
    for (let i = 0; i < n; i++) {
      const h = t.curve[i], ds = i ? t.dist[i] - t.dist[i - 1] : 0, rl = t.roll[i] ?? 0;
      x += Math.sin(h) * ds; z -= Math.cos(h) * ds;
      const R = [Math.cos(h), 0, Math.sin(h)], c = Math.cos(rl), s = Math.sin(rl);
      this.pos.set([x, t.height[i] * EXAG, z], i * 3);
      // roll about the forward axis: right' = R cos − U sin, up' = R sin + U cos (U = world up)
      this.right.set([R[0] * c, -s, R[2] * c], i * 3);
      this.up.set([R[0] * s, c, R[2] * s], i * 3);
      this.fwd.set([Math.sin(h), 0, -Math.cos(h)], i * 3);
    }
    this.inner = (t.lanes * LW) / 2;
    this.halfWidth = this.inner + 1.2;
  }
  get length() { return this.track.dist[this.n - 1]; }
  distAt(p: number) { const t = this.track; return sampleAt(t.dist, t.hz, p) + (p > t.durationS ? (p - t.durationS) * t.speed[t.speed.length - 1] : 0); }
  index(d: number): [number, number, number] {
    const dist = this.track.dist; let lo = 0, hi = this.n - 1;
    if (d <= 0) return [0, 0, 0];
    if (d >= dist[hi]) return [hi, hi, 0];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (dist[m] <= d) lo = m; else hi = m; }
    return [lo, hi, (d - dist[lo]) / (dist[hi] - dist[lo] || 1)];
  }
  at(d: number, o: Frame): Frame {
    const [lo, hi, f] = this.index(d);
    const L = (a: Float32Array, out: THREE.Vector3) => out.set(a[lo * 3] + (a[hi * 3] - a[lo * 3]) * f, a[lo * 3 + 1] + (a[hi * 3 + 1] - a[lo * 3 + 1]) * f, a[lo * 3 + 2] + (a[hi * 3 + 2] - a[lo * 3 + 2]) * f);
    L(this.pos, o.p); L(this.right, o.r).normalize(); L(this.up, o.u).normalize(); L(this.fwd, o.f).normalize();
    o.tunnel = this.track.tunnel[lo] * (1 - f) + this.track.tunnel[hi] * f;
    o.roll = this.track.roll[lo] * (1 - f) + this.track.roll[hi] * f;
    const end = this.track.dist[this.n - 1];
    if (d > end) o.p.addScaledVector(o.f, d - end);
    return o;
  }
  /** World point at distance d, lane offset x (lanes), height h above the surface. */
  point(d: number, lanes: number, h: number, o: Frame, out: THREE.Vector3) {
    this.at(d, o);
    return out.copy(o.p).addScaledVector(o.r, lanes * LW).addScaledVector(o.u, h);
  }
}
