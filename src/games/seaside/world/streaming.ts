// Route streaming, pure (no three.js): which tiles the camera needs now, which it will need soon, and which to forget.
//   - terrain: a quadtree of square tiles; every leaf is `res` voxels across, so voxel size doubles per ring. Detail
//     follows max(route distance, camera distance / routeAlpha) — anchored to the route, so terrain beside the path
//     does not re-quantize as the rider passes — with hysteresis on merges.
//   - road: corridor segments by route distance, fine voxels near the camera, coarse beyond `near`.
//   - props: scatter segments within `propRange`.
// Positions ahead on the route (speed × lookahead seconds, plus fixed distances) are queued at lower priority, and
// tiles nobody has wanted for `keepS` seconds are evicted (so tiles behind the rider go once they fall out of range).
import { lodOf, type WorldDef } from './def';
import type { TileJob } from './tileBuild';

export interface Vec3 { x: number; y: number; z: number }
export interface Leaf { key: string; job: TileJob; d: number }
interface Entry<D> { key: string; job: TileJob; data?: D; building: boolean; seen: number }

export interface StreamOpts {
  /** Seconds of travel ahead to prefetch, and fixed distances (m) ahead. */ lookaheadS?: number[]; lookaheadM?: number[];
  /** Forget tiles unwanted for this long (s). */ keepS?: number;
  /** Hard cap on cached tiles (least recently wanted go first). */ maxTiles?: number;
  /** Prop segments: length (m) and range (m). */ propSeg?: number; propRange?: number;
  /** Off-route cameras (cuts, set pieces) count as route; set false to anchor detail to the camera only. */ useRoute?: boolean;
}

const PREFETCH = 1e6;

export class TileStreamer<D> {
  readonly tiles = new Map<string, Entry<D>>();
  /** The display set for the latest update. */ wanted: Leaf[] = [];
  stats = { requested: 0, evicted: 0, prefetched: 0 };
  private queue = new Map<string, number>();
  private split = new Set<string>();
  private routeD = new Map<string, number>();
  private segBox = new Map<string, { x0: number; x1: number; z0: number; z1: number }>();
  private time = 0;
  private readonly o: Required<StreamOpts>;
  private readonly lod;

  constructor(readonly world: WorldDef, o: StreamOpts = {}) {
    this.lod = lodOf(world);
    this.o = { lookaheadS: [1.5, 3, 6], lookaheadM: [40, 120], keepS: 8, maxTiles: 1600, propSeg: 64, propRange: 320, useRoute: true, ...o };
  }

  /** Pick the display set for a camera, queue what's missing, prefetch ahead on the route, evict stale tiles. */
  update(cam: Vec3, time: number, at?: { routeS: number; speed: number }, extra: Vec3[] = []): void {
    this.time = time;
    const sel = this.select(cam, true);
    this.wanted = sel;
    for (const l of sel) this.want(l, l.d);
    const ahead: Vec3[] = [...extra];
    if (at) {
      const r = this.world.route, eye = this.world.eye;
      const ds = [...this.o.lookaheadS.map((t) => at.speed * t), ...this.o.lookaheadM].filter((d) => d > 1);
      for (const d of ds) { const p = r.at(Math.min(r.length, at.routeS + d)); ahead.push({ x: p.x, y: p.y + eye, z: p.z }); }
    }
    for (const p of ahead) for (const l of this.select(p, false)) if (this.want(l, PREFETCH + l.d)) this.stats.prefetched++;
    this.evict();
  }

  /** True when every tile of the display set has data. */
  ready(): boolean { return this.wanted.every((l) => this.tiles.get(l.key)?.data !== undefined); }

  /** Highest-priority queued job (marked as building), or null. */
  next(): { key: string; job: TileJob } | null {
    let best: string | null = null, bp = Infinity;
    for (const [k, p] of this.queue) if (p < bp) { bp = p; best = k; }
    if (best === null) return null;
    this.queue.delete(best);
    const e = this.tiles.get(best)!;
    e.building = true;
    return { key: best, job: e.job };
  }

  /** Is there a queued job at display (not prefetch) priority? */
  urgent(): boolean { for (const p of this.queue.values()) if (p < PREFETCH) return true; return false; }
  pending(): number { return this.queue.size; }

  /** A job finished. Returns false if the tile was evicted meanwhile (the data is dropped). */
  done(key: string, data: D): boolean {
    const e = this.tiles.get(key);
    if (!e) return false;
    e.data = data; e.building = false;
    return true;
  }

  get(key: string): D | undefined { return this.tiles.get(key)?.data; }

  private want(l: Leaf, prio: number): boolean {
    let e = this.tiles.get(l.key);
    if (!e) { e = { key: l.key, job: l.job, building: false, seen: this.time }; this.tiles.set(l.key, e); }
    e.seen = this.time;
    if (e.data !== undefined || e.building) return false;
    const q = this.queue.get(l.key);
    if (q === undefined) { this.queue.set(l.key, prio); this.stats.requested++; return true; }
    if (prio < q) this.queue.set(l.key, prio);
    return false;
  }

  private evict() {
    const shown = new Set(this.wanted.map((l) => l.key));
    const stale = (e: Entry<D>) => !shown.has(e.key) && !e.building && this.time - e.seen > this.o.keepS;
    for (const [k, e] of this.tiles) if (stale(e)) { this.tiles.delete(k); this.queue.delete(k); this.stats.evicted++; }
    if (this.tiles.size > this.o.maxTiles) {
      const old = [...this.tiles.values()].filter((e) => !shown.has(e.key) && !e.building).sort((a, b) => a.seen - b.seen);
      for (const e of old.slice(0, this.tiles.size - this.o.maxTiles)) { this.tiles.delete(e.key); this.queue.delete(e.key); this.stats.evicted++; }
    }
    if (this.routeD.size > 50_000) this.routeD.clear();
  }

  private routeDist(x0: number, z0: number, S: number): number {
    const k = `${x0},${z0},${S}`;
    let d = this.routeD.get(k);
    if (d === undefined) { d = this.world.route.distToRect(x0, z0, S); this.routeD.set(k, d); }
    return d;
  }

  private box(i: number, seg: number, pad: number) {
    const k = `${seg}:${pad}:${i}`;
    let b = this.segBox.get(k);
    if (!b) { const r = this.world.route.bbox(i * seg, (i + 1) * seg); b = { x0: r.x0 - pad, x1: r.x1 + pad, z0: r.z0 - pad, z1: r.z1 + pad }; this.segBox.set(k, b); }
    return b;
  }

  /** Leaves for a camera position (display = true updates the hysteresis state). */
  select(cam: Vec3, display: boolean): Leaf[] {
    const w = this.world, L = this.lod, b = w.bounds, out: Leaf[] = [];
    const nextSplit = new Set<string>();
    let R = L.minTile; while (R < 2048) R *= 2;
    const visit = (x0: number, z0: number, S: number) => {
      if (x0 >= b.x1 || z0 >= b.z1 || x0 + S <= b.x0 || z0 + S <= b.z0) return;
      const dx = Math.max(x0 - cam.x, 0, cam.x - (x0 + S)), dz = Math.max(z0 - cam.z, 0, cam.z - (z0 + S));
      const dc = Math.hypot(dx, dz, Math.max(0, Math.abs(cam.y) - 30) * 0.5);
      const d = this.o.useRoute ? Math.max(Math.min(this.routeDist(x0, z0, S), dc), dc / L.routeAlpha) : dc;
      const key = `${x0},${z0},${S}`;
      const thr = L.splitK * S * (display && this.split.has(key) ? L.hysteresis : 1);
      if (S > L.minTile && d < thr) { nextSplit.add(key); const h = S / 2; visit(x0, z0, h); visit(x0 + h, z0, h); visit(x0, z0 + h, h); visit(x0 + h, z0 + h, h); }
      else out.push({ key, job: { kind: 'tile', x0, z0, S }, d });
    };
    // roots aligned to multiples of R, so every tile's origin is a multiple of its voxel size (keeps shader noise on-grid)
    for (let x = Math.floor(b.x0 / R) * R; x < b.x1; x += R) for (let z = Math.floor(b.z0 / R) * R; z < b.z1; z += R) visit(x, z, R);
    const boxD = (bb: { x0: number; x1: number; z0: number; z1: number }) => Math.hypot(Math.max(0, bb.x0 - cam.x, cam.x - bb.x1), Math.max(0, bb.z0 - cam.z, cam.z - bb.z1));
    const c = w.corridor, len = w.route.length;
    if (c) {
      const seg = c.seg ?? 32, range = c.range ?? 1500, v0 = c.voxel ?? 0.125, v1 = c.farVoxel ?? 0.5;
      for (let i = 0; i * seg < len; i++) {
        const d = boxD(this.box(i, seg, c.half));
        if (d >= range) continue;
        const v = d < (c.near ?? 200) ? v0 : v1;
        out.push({ key: `road:${i}:${v}`, job: { kind: 'road', s0: i * seg, len: seg, voxel: v }, d });
      }
    }
    if (w.scatter?.length) {
      const seg = this.o.propSeg;
      for (let i = 0; i * seg < len; i++) {
        const d = boxD(this.box(i, seg, 60));
        if (d < this.o.propRange) out.push({ key: `props:${i}`, job: { kind: 'props', s0: i * seg, len: seg }, d });
      }
    }
    if (display) this.split = nextSplit;
    return out;
  }
}
