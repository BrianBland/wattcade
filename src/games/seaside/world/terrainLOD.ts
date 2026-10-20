// Distance-based detail rings for the coast: a quadtree of square tiles around the camera. Every leaf tile is `res`
// voxels across, so voxel size doubles with each ring (1/8 m next to the rider → tens of metres on the far ridges).
//
// Tiles are built off the main thread (tileWorker.ts pool; `workers: 0` builds inline) and cached. The visible set only
// changes atomically: the previous set stays on screen until every tile of the new one is ready, so there are never
// holes. Visible tiles of the same size are merged into clusters (C × C tiles → one land + one water mesh) to keep
// draw calls low. `prefetch` positions (where the camera will be) are queued at lower priority.
import * as THREE from 'three';
import { geometryFrom, voxelMaterial } from '../voxel/three';
import { mergeMeshData } from '../voxel/merge';
import { buildRoad, buildTile, type TileData, type TileParams } from './tileBuild';
import type { SunShadow } from './sunShadow';

export interface TerrainLODOpts {
  /** Leaf tile width in voxels. */ res?: number;
  /** Smallest tile (m); its voxel size is minTile / res. */ minTile?: number;
  /** Split a tile while the camera is closer than splitK × its size. */ splitK?: number;
  /** World bounds to cover. */ bounds?: { x0: number; x1: number; z0: number; z1: number };
  /** Tiles at or below this size cast realtime shadows (only without a baked sun). */ shadowTile?: number;
  /** Border wall depth in voxels. */ skirt?: number;
  /** Voxel size from which AO is dropped. */ flatAOFrom?: number;
  water: { time: { value: number }; amp: number };
  /** Baked terrain self-shadowing; when set, terrain tiles don't cast realtime shadows (only props do). */
  sun?: SunShadow;
  /** Worker threads (0 = build synchronously on the calling thread). Default: min(4, cores − 1). */
  workers?: number;
  /** Cluster width in tiles. */ cluster?: number;
  /** Road corridor kept at a fixed fine voxel size to the horizon (half-width m, voxel m, segment m, range m). Off when omitted. */
  road?: { half?: number; voxel?: number; seg?: number; range?: number; /** beyond this distance road segments use farVoxel */ near?: number; farVoxel?: number };
}
interface Tile { key: string; kind: 'tile' | 'road'; x0: number; z0: number; S: number; voxel?: number; data?: TileData; lastUsed: number }
interface Job { key: string; prio: number }
interface Cluster { sig: string; group: THREE.Group; faces: number }

export class TerrainLOD {
  readonly root = new THREE.Group();
  readonly res: number; readonly minTile: number; readonly splitK: number;
  stats = { leaves: 0, faces: 0, built: 0, buildMs: 0, pending: 0, clusters: 0, workers: 0, applyMaxMs: 0, onBuiltMaxMs: 0 };
  private tiles = new Map<string, Tile>();
  private mats = new Map<string, THREE.Material>();
  private clusters = new Map<string, Cluster>();
  private wanted: string[] = [];
  private shownSig = '';
  private frame = 0;
  private waiters: Array<() => void> = [];
  private queue = new Map<string, Job>();
  private pool: Array<{ w: Worker; busy: string | null }> = [];
  private params: TileParams;

  constructor(private o: TerrainLODOpts) {
    this.res = o.res ?? 64; this.minTile = o.minTile ?? 8; this.splitK = o.splitK ?? 1.6;
    this.params = { res: this.res, skirt: o.skirt ?? 3, flatAOFrom: o.flatAOFrom ?? 1, corridor: o.road ? (o.road.half ?? 6.2) : 0, roadVoxel: o.road?.voxel ?? 0.125 };
    const n = o.workers ?? Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1));
    for (let i = 0; i < n && typeof Worker !== 'undefined'; i++) {
      const w = new Worker(new URL('./tileWorker.ts', import.meta.url), { type: 'module' });
      w.postMessage({ type: 'init', params: this.params, sun: o.sun?.serialize() ?? null });
      const slot = { w, busy: null as string | null };
      w.onmessage = (e) => this.onBuilt(slot, e.data as { land: TileData['land']; water: TileData['water']; ms: number });
      this.pool.push(slot);
    }
    this.stats.workers = this.pool.length;
  }

  dispose() { this.pool.forEach((p) => p.w.terminate()); }

  /** Pick leaves for a camera position, queue missing tiles (and prefetch positions), swap in the new set when complete. */
  update(cam: THREE.Vector3, prefetch: THREE.Vector3[] = []) {
    this.frame++;
    const sel = this.select(cam);
    this.wanted = sel.map((l) => l.key);
    for (const l of sel) this.want(l, l.d);
    for (const p of prefetch) for (const l of this.select(p)) this.want(l, 1e6 + l.d);
    this.pump();
    this.tryApply();
  }

  /** Resolves once the tiles for the latest update() are on screen. */
  whenReady(): Promise<void> {
    return this.ready() ? Promise.resolve() : new Promise((r) => this.waiters.push(r));
  }

  private ready() { return this.shownSig === this.wanted.join('|'); }

  private select(cam: THREE.Vector3) {
    const b = this.o.bounds ?? { x0: -2400, x1: 1800, z0: -3600, z1: 120 };
    let R = this.minTile; while (R < 2048) R *= 2;
    const out: Array<{ key: string; kind: 'tile' | 'road'; x0: number; z0: number; S: number; d: number; voxel?: number }> = [];
    const visit = (x0: number, z0: number, S: number) => {
      if (x0 >= b.x1 || z0 >= b.z1 || x0 + S <= b.x0 || z0 + S <= b.z0) return;
      const dx = Math.max(x0 - cam.x, 0, cam.x - (x0 + S)), dz = Math.max(z0 - cam.z, 0, cam.z - (z0 + S));
      const d = Math.hypot(dx, dz, Math.max(0, Math.abs(cam.y) - 30) * 0.5);
      if (S > this.minTile && d < this.splitK * S) { const h = S / 2; visit(x0, z0, h); visit(x0 + h, z0, h); visit(x0, z0 + h, h); visit(x0 + h, z0 + h, h); }
      else out.push({ key: `${x0},${z0},${S}`, kind: 'tile', x0, z0, S, d });
    };
    // roots aligned to multiples of R, so every tile's origin is a multiple of its voxel size (keeps shader noise on-grid)
    for (let x = Math.floor(b.x0 / R) * R; x < b.x1; x += R) for (let z = Math.floor(b.z0 / R) * R; z < b.z1; z += R) visit(x, z, R);
    if (this.o.road) { // road segments along z (the route runs roughly along z), by distance from the camera
      const seg = this.o.road.seg ?? 32, range = this.o.road.range ?? 1500;
      for (let z = Math.floor(b.z0 / seg) * seg; z < b.z1; z += seg) {
        const d = Math.abs(cam.z - Math.min(Math.max(cam.z, z), z + seg));
        const v = d < (this.o.road.near ?? 200) ? this.params.roadVoxel : (this.o.road.farVoxel ?? 0.5);
        if (d < range) out.push({ key: `road:${z}:${v}`, kind: 'road', x0: 0, z0: z, S: seg, d, voxel: v });
      }
    }
    return out;
  }

  private want(l: { key: string; kind: 'tile' | 'road'; x0: number; z0: number; S: number; voxel?: number }, prio: number) {
    let t = this.tiles.get(l.key);
    if (!t) { t = { key: l.key, kind: l.kind, x0: l.x0, z0: l.z0, S: l.S, voxel: l.voxel, lastUsed: this.frame }; this.tiles.set(l.key, t); }
    t.lastUsed = this.frame;
    if (t.data || this.pool.some((p) => p.busy === l.key)) return;
    const j = this.queue.get(l.key);
    if (!j) this.queue.set(l.key, { key: l.key, prio }); else j.prio = Math.min(j.prio, prio);
  }

  private pump() {
    if (!this.pool.length) { // inline builds: only what's needed now (prefetch is pointless synchronously)
      for (const j of [...this.queue.values()]) {
        if (j.prio >= 1e6) continue;
        const t = this.tiles.get(j.key)!;
        t.data = t.kind === 'road' ? buildRoad(t.z0, t.S, this.params, this.o.sun ?? null, t.voxel) : buildTile(t.x0, t.z0, t.S, this.params, this.o.sun ?? null);
        this.stats.built++; this.stats.buildMs += t.data.ms; this.queue.delete(j.key);
      }
      this.queue.clear();
    } else {
      for (const slot of this.pool) {
        if (slot.busy || !this.queue.size) continue;
        let best: Job | null = null;
        for (const j of this.queue.values()) if (!best || j.prio < best.prio) best = j;
        this.queue.delete(best!.key);
        const t = this.tiles.get(best!.key)!;
        slot.busy = t.key;
        slot.w.postMessage({ type: 'build', id: 0, kind: t.kind, x0: t.x0, z0: t.z0, S: t.S, voxel: t.voxel });
      }
    }
    this.stats.pending = this.queue.size + this.pool.filter((p) => p.busy).length;
  }

  private onBuilt(slot: { busy: string | null }, d: { land: TileData['land']; water: TileData['water']; ms: number }) {
    const t0 = performance.now();
    const t = this.tiles.get(slot.busy!);
    slot.busy = null;
    if (t) { t.data = { land: d.land, water: d.water, ms: d.ms }; this.stats.built++; this.stats.buildMs += d.ms; }
    this.pump();
    this.tryApply();
    this.stats.onBuiltMaxMs = Math.max(this.stats.onBuiltMaxMs, performance.now() - t0);
  }

  private mat(size: number, water: boolean) {
    const k = `${size}:${water}`;
    let m = this.mats.get(k);
    if (!m) { const baked = !!this.o.sun; m = voxelMaterial(water ? { size, jitter: 0.025, wave: this.o.water, baked } : { size, jitter: 0.1, baked }); this.mats.set(k, m); }
    return m;
  }

  /** Swap in the wanted set if every tile is built; rebuild only clusters whose membership changed. */
  private tryApply() {
    const sig = this.wanted.join('|');
    if (sig === this.shownSig || !this.wanted.every((k) => this.tiles.get(k)?.data)) return;
    const t0 = performance.now();
    const C = this.o.cluster ?? 2;
    const groups = new Map<string, Tile[]>();
    for (const k of this.wanted) {
      const t = this.tiles.get(k)!;
      const ck = t.kind === 'road' ? `road:${t.voxel}:${Math.floor(t.z0 / (t.S * C * 2))}` : `${t.S}:${Math.floor(t.x0 / (t.S * C))}:${Math.floor(t.z0 / (t.S * C))}`;
      (groups.get(ck) ?? groups.set(ck, []).get(ck)!).push(t);
    }
    let faces = 0;
    for (const [ck, members] of groups) {
      const csig = members.map((m) => m.key).sort().join('|');
      let c = this.clusters.get(ck);
      if (!c || c.sig !== csig) {
        if (c) this.dropCluster(ck, c);
        const road = members[0].kind === 'road', S = road ? 0 : members[0].S, s = road ? members[0].voxel! : S / this.res, group = new THREE.Group();
        let cf = 0;
        const land = mergeMeshData(members.map((m) => m.data!.land).filter((x): x is NonNullable<typeof x> => !!x));
        if (land) {
          const mesh = new THREE.Mesh(geometryFrom(land), this.mat(s, false));
          mesh.castShadow = !this.o.sun && S <= (this.o.shadowTile ?? 32); mesh.receiveShadow = S <= 64;
          group.add(mesh); cf += land.faces;
        }
        const water = mergeMeshData(members.map((m) => m.data!.water).filter((x): x is NonNullable<typeof x> => !!x));
        if (water) { const mesh = new THREE.Mesh(geometryFrom(water), this.mat(s, true)); mesh.receiveShadow = S <= 64; group.add(mesh); cf += water.faces; }
        c = { sig: csig, group, faces: cf };
        this.clusters.set(ck, c);
        this.root.add(group);
      }
      faces += c.faces;
    }
    for (const [ck, c] of this.clusters) if (!groups.has(ck)) this.dropCluster(ck, c);
    // forget tile data nobody has wanted for a while
    for (const [k, t] of this.tiles) if (this.frame - t.lastUsed > 900 && !this.queue.has(k)) this.tiles.delete(k);
    this.shownSig = sig;
    this.stats.leaves = this.wanted.length; this.stats.faces = faces; this.stats.clusters = this.clusters.size;
    this.stats.applyMaxMs = Math.max(this.stats.applyMaxMs, performance.now() - t0);
    const w = this.waiters; this.waiters = []; w.forEach((r) => r());
  }

  private dropCluster(ck: string, c: Cluster) {
    this.root.remove(c.group);
    c.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.clusters.delete(ck);
  }
}
