// Geological events: a seeded deck of 0-2 events per ride (plus a rare meteor), each a heightfield edit at a fitting
// moment. Pure and deterministic. Edits are applied to both `h` and `h0`, so they reshape the land without counting as
// carving or delta; `mat` marks lava / scorched ground / slide debris for the renderer.
//
//  - earthquake (beavers' still pool): the saddle the river is using lifts shut and another drops open. Reroute!
//  - landslide (first flood surge): a valley wall slumps into the river below ridge 2 and dams it into a lake.
//  - volcano (carve the gorge): a lava tongue runs down over ridge 1's easiest saddle and seals it.
//  - meteor (rare, any later river block): a fireball leaves a crater that fills into a lake.

import { hash2, type Terrain } from './terrain';
import type { Block } from './plan';

export type EventKind = 'earthquake' | 'landslide' | 'volcano' | 'meteor';
export const MAT = { none: 0, lava: 1, scorched: 2, debris: 3 } as const;

export interface GeoEvent {
  kind: EventKind;
  block: number;            // plan block index it fires in
  frac: number;             // fraction through that block
  state: 'pending' | 'warning' | 'active' | 'done';
  age: number;              // seconds since it became active (render: glow, shake, smoke)
  x: number; y: number;     // where (grid)
  warnS: number; durS: number;
  /** Per-cell height change to apply over durS (cell index → total delta). */
  edits?: Array<[number, number]>;
  /** Material marks (cell index → MAT), painted when the event hits. */
  marks?: Array<[number, number]>;
  applied: number;          // fraction of edits applied so far
}

export type EventCue = { type: 'eventWarn'; kind: EventKind } | { type: 'eventHit'; kind: EventKind; x: number; y: number } | { type: 'eventDone'; kind: EventKind };

const WARN: Record<EventKind, number> = { earthquake: 4, landslide: 3, volcano: 5, meteor: 4 };
const DUR: Record<EventKind, number> = { earthquake: 6, landslide: 4, volcano: 25, meteor: 0.6 };

/** Deal the deck for a ride: 0-2 of quake/slide/volcano (25/50/25 %) plus a ~6 % meteor; or forced kinds. */
export function dealEvents(seed: number, plan: Block[], forced?: EventKind[]): GeoEvent[] {
  const r = (k: number) => hash2(seed, k, 7331);
  let kinds: EventKind[];
  if (forced) kinds = forced;
  else {
    const pool: EventKind[] = ['earthquake', 'landslide', 'volcano'];
    const n = r(1) < 0.25 ? 0 : r(1) < 0.75 ? 1 : 2;
    kinds = [];
    for (let k = 0; k < n; k++) kinds.push(pool.splice(Math.floor(r(2 + k) * pool.length), 1)[0]);
    if (r(9) < 0.06) kinds.push('meteor');
  }
  const idx = (pred: (b: Block, i: number) => boolean) => plan.findIndex(pred);
  const carve = idx((b) => b.job === 'grist');
  const out: GeoEvent[] = [];
  for (const kind of kinds) {
    const block = kind === 'volcano' ? carve
      : kind === 'earthquake' ? idx((b) => !!b.beavers)
      : kind === 'landslide' ? idx((b) => b.job === 'village')
      : (() => { const river = plan.map((b, i) => (i > carve && b.phase === 'river' && !b.job ? i : -1)).filter((i) => i >= 0); return river.length ? river[Math.floor(r(11) * river.length)] : carve + 1; })();
    if (block < 0) continue;
    out.push({ kind, block, frac: kind === 'volcano' ? 0.25 : kind === 'meteor' ? 0.7 : 0.35, state: 'pending', age: 0, x: 0, y: 0, warnS: WARN[kind], durS: DUR[kind], applied: 0 });
  }
  return out;
}

export class GeoEvents {
  readonly mat: Uint8Array;
  constructor(private t: Terrain, public events: GeoEvent[], private seed: number) { this.mat = new Uint8Array(t.nx * t.ny); }

  /** Advance; `blockIndex`/`blockT`/`blockLen` from planAt; `w` is the water-depth grid (to find the river). */
  update(dt: number, blockIndex: number, blockT: number, blockLen: number, w: Float32Array): EventCue[] {
    const cues: EventCue[] = [];
    for (const e of this.events) {
      if (e.state === 'pending' && blockIndex === e.block && blockT >= Math.max(0, e.frac * blockLen - e.warnS)) {
        e.state = 'warning'; e.age = -e.warnS; this.plan(e, w); cues.push({ type: 'eventWarn', kind: e.kind });
      }
      if (e.state === 'warning') {
        e.age += dt;
        if (e.age >= 0) {
          e.state = 'active'; e.age = 0;
          for (const [k, m] of e.marks ?? []) { this.mat[k] = m; if (m === MAT.lava) this.t.hard[k] = 0.12; }
          cues.push({ type: 'eventHit', kind: e.kind, x: e.x, y: e.y });
          continue;
        }
      }
      if (e.state === 'done') e.age += dt;   // keeps counting (lava cools, smoke thins)
      if (e.state === 'active') {
        e.age += dt;
        const target = Math.min(1, e.age / e.durS), step = target - e.applied;
        if (step > 0 && e.edits) for (const [k, d] of e.edits) { this.t.h[k] += d * step; this.t.h0[k] += d * step; }
        e.applied = target;
        if (target >= 1) { e.state = 'done'; cues.push({ type: 'eventDone', kind: e.kind }); }
      }
    }
    return cues;
  }

  /** Decide where the event lands and what it does to the terrain (computed when it is announced). */
  private plan(e: GeoEvent, w: Float32Array): void {
    const { nx, ny, ridges, saddles, coastY } = this.t;
    const edits = new Map<number, number>(), marks = new Map<number, number>();
    const add = (i: number, j: number, d: number) => { if (i < 1 || i >= nx - 1 || j < 1 || j >= ny - 1) return; const k = j * nx + i; edits.set(k, (edits.get(k) ?? 0) + d); };
    const bump = (cx: number, cy: number, r: number, d: number, mat?: number) => {
      for (let j = Math.floor(cy - r); j <= cy + r; j++) for (let i = Math.floor(cx - r); i <= cx + r; i++) {
        const q = Math.hypot(i - cx, j - cy) / r; if (q >= 1) continue;
        add(i, j, d * (1 - q * q));
        if (mat !== undefined && i >= 0 && i < nx && j >= 0 && j < ny) marks.set(j * nx + i, mat);
      }
    };
    const wetAt = (i: number, j: number) => { let s = 0; for (let dj = -2; dj <= 2; dj++) for (let di = -3; di <= 3; di++) s += w[(j + dj) * nx + i + di] ?? 0; return s; };
    if (e.kind === 'earthquake') {
      const r0 = ridges[0], mine = saddles.filter((s) => s.ridge === r0);
      const used = mine.reduce((a, s) => (wetAt(s.x, r0) > wetAt(a.x, r0) ? s : a));
      const other = mine.filter((s) => s !== used).reduce((a, s) => (hash2(this.seed, s.x, 3) > hash2(this.seed, a.x, 3) ? s : a), mine.find((s) => s !== used) ?? used);
      bump(used.x, r0, 6, 3.2); bump(other.x, r0, 6, -2.6);
      e.x = used.x; e.y = r0;
    } else if (e.kind === 'landslide') {
      // the river's x below ridge 2, and the nearer valley wall
      const j = Math.round((ridges[1] + coastY) / 2);
      let best = 0, x = nx / 2; for (let i = 4; i < nx - 4; i++) { const s = wetAt(i, j); if (s > best) { best = s; x = i; } }
      const wallSide = x < nx / 2 ? -1 : 1;
      bump(x, j, 5, 3.4, MAT.debris); bump(x + wallSide * 10, j - 2, 6, -2.4);
      e.x = x; e.y = j;
    } else if (e.kind === 'volcano') {
      // a vent up on the wall above ridge 1's deepest (easiest) saddle; lava runs down over the saddle
      const s = saddles.filter((q) => q.ridge === ridges[0]).reduce((a, q) => (q.depth > a.depth ? q : a));
      const vx = s.x < nx / 2 ? Math.max(4, s.x - 10) : Math.min(nx - 5, s.x + 10), vy = ridges[0] - 10;
      bump(vx, vy, 4, 3.5, MAT.lava);
      for (let k = 0; k <= 24; k++) { const f = k / 24; bump(vx + (s.x - vx) * f, vy + (ridges[0] + 4 - vy) * f, 3.2, 2.6, MAT.lava); }
      e.x = vx; e.y = vy;
    } else {
      // meteor: a crater on the valley floor (rim and all), scorched
      const cx = 14 + hash2(this.seed, 21, 5) * (nx - 28), cy = ridges[0] + 8 + hash2(this.seed, 22, 5) * (coastY - ridges[0] - 18);
      for (let j = Math.floor(cy - 8); j <= cy + 8; j++) for (let i = Math.floor(cx - 8); i <= cx + 8; i++) {
        const q = Math.hypot(i - cx, j - cy) / 5;
        if (q < 1) add(i, j, -3.6 * (1 - q * q)); else if (q < 1.5) add(i, j, 1.2 * (1 - Math.abs(q - 1.2) / 0.3));
        if (q < 1.6 && i >= 0 && i < nx && j >= 0 && j < ny) marks.set(j * nx + i, MAT.scorched);
      }
      e.x = cx; e.y = cy;
    }
    e.edits = [...edits.entries()]; e.marks = [...marks.entries()];
  }
}
