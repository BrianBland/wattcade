import * as THREE from 'three';
import { newFrame, type Path } from './path';

/**
 * The power gauge, painted on the inside of both track walls: a light bar fills forward from the craft as you push,
 * a tall white post marks the target (a fixed distance ahead) and a red post the ceiling. Reach the post: on target.
 */
export const GAUGE = { targetM: 16, maxM: 25, backM: 3 } as const;
export type GaugeState = 'under' | 'ok' | 'over' | 'free';
export interface GaugeMarks { fill: number; target: number | null; ceil: number | null; state: GaugeState }

/** Pure: value (FTP fraction, or rpm in ERG) against target / ceiling (0 = none) → metres ahead of the craft. */
export function gaugeMarks(value: number, target: number, ceiling: number): GaugeMarks {
  const ref = target > 0 ? target : ceiling > 0 ? ceiling : 1, m = (x: number) => Math.min(GAUGE.maxM, Math.max(0, (x / ref) * GAUGE.targetM));
  const state: GaugeState = ceiling > 0 && value > ceiling ? 'over' : target > 0 ? (value >= target ? 'ok' : 'under') : 'free';
  return { fill: m(value), target: target > 0 ? GAUGE.targetM : null, ceil: ceiling > 0 ? m(ceiling) : null, state };
}

const SEG = 28;
const COL: Record<GaugeState, THREE.Color> = { under: new THREE.Color('#ffffff'), ok: new THREE.Color('#b6ff3b'), over: new THREE.Color('#ff4a1c'), free: new THREE.Color('#5fd7ff') };
const TARGET = new THREE.Color('#ffffff'), CEIL = new THREE.Color('#ff2a10');

export class Gauge {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array; private col: Float32Array; private fr = newFrame(); private c = new THREE.Color(); private shown = 0;
  // 2 edge strips × (SEG+1) rows × 2 verts, then 2 ticks × 2 sides × 4 verts
  constructor(private path: Path) {
    const nStrip = 2 * (SEG + 1) * 2, n = nStrip + 16;
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    const idx: number[] = [];
    for (let side = 0; side < 2; side++) for (let i = 0; i < SEG; i++) { const a = side * (SEG + 1) * 2 + i * 2, b = a + 2; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    for (let q = 0; q < 4; q++) { const a = nStrip + q * 4; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3)); g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
  }

  /** Per frame. `dCraft` = craft distance; `visible` 0..1 (fades out in menus). */
  update(dCraft: number, g: GaugeMarks, t: number, dt: number, visible: number) {
    this.shown += (g.fill - this.shown) * Math.min(1, dt * 10); // glide, don't jitter with every watt
    const wall = this.path.halfWidth - 0.06, base = COL[g.state];
    const pulse = g.state === 'under' ? 0.55 + 0.45 * Math.sin(t * 9) : 1;
    let v = 0;
    const put = (d: number, x: number, h: number, c: THREE.Color, a: number) => {
      this.path.at(d, this.fr);
      const p = this.fr.p, r = this.fr.r, u = this.fr.u;
      this.pos.set([p.x + r.x * x + u.x * h, p.y + r.y * x + u.y * h, p.z + r.z * x + u.z * h], v * 3);
      this.col.set([c.r * a, c.g * a, c.b * a], v * 3); v++;
    };
    const len = GAUGE.backM + this.shown;
    for (const side of [-1, 1]) for (let i = 0; i <= SEG; i++) {
      const u = i / SEG, d = dCraft - GAUGE.backM + u * len;
      const a = visible * pulse * (0.45 + 0.55 * u) * (u > 0.97 ? 1.5 : 1); // brightest at the leading edge
      for (const h of [0.08, 0.95]) put(d, side * wall, h, base, a);
    }
    const tick = (at: number | null, c: THREE.Color, k: number) => {
      for (const side of [-1, 1]) {
        const a = at === null ? 0 : visible * k, d = dCraft + (at ?? 0);
        for (const dd of [-0.3, 0.3]) for (const h of [0, 2.4]) put(d + dd, side * wall, h, c, a);
      }
    };
    const hit = g.state === 'ok' ? 1.4 : 1, ta = (0.9 + 0.3 * Math.sin(t * 6)) * hit;
    tick(g.target, this.c.copy(TARGET), ta);
    tick(g.ceil, CEIL, g.state === 'over' ? 1.4 + 0.6 * Math.sin(t * 14) : 0.7);
    (this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
}
