// The streamed voxel world on screen: TileStreamer (streaming.ts) decides which tiles exist; this builds them on a
// Web Worker pool (tileWorker.ts; `workers: 0` builds inline) and turns them into three.js meshes.
//
// The visible set only changes atomically: the previous set stays on screen until every tile of the new one is ready,
// so there are never holes. Visible tiles of the same size merge into clusters (C × C tiles → one mesh per part) to
// keep draw calls low; clusters that change level cross-fade with a screen-door dissolve.
import * as THREE from 'three';
import { geometryFrom, voxelMaterial } from '../voxel/three';
import { mergeMeshData } from '../voxel/merge';
import { lodOf, type WorldDef } from './def';
import { TileBuilder, type PartRole, type TileData, type TileJob } from './tileBuild';
import { TileStreamer, type StreamOpts, type Vec3 } from './streaming';

export interface TerrainLODOpts {
  /** Worker threads (0 = build synchronously on the calling thread). Default: min(4, cores − 1). */ workers?: number;
  water: { time: { value: number }; amp: number };
  /** Tiles at or below this size cast realtime shadows (only without a baked sun). */ shadowTile?: number;
  stream?: StreamOpts;
}
interface Cluster { sig: string; group: THREE.Group; faces: number; fade?: { u: { value: THREE.Vector2 }; t0: number; mats: THREE.Material[] } }

const now = () => globalThis.performance?.now() ?? 0;

export class TerrainLOD {
  readonly root = new THREE.Group();
  readonly streamer: TileStreamer<TileData>;
  stats = { leaves: 0, faces: 0, built: 0, buildMs: 0, pending: 0, clusters: 0, workers: 0, applyMaxMs: 0, onBuiltMaxMs: 0,
    /** terrain clusters that changed level while moving, and their cube size on screen (px at 720p) when they did */ changes: 0, changePxMax: 0, changePxSum: 0 };
  private lod;
  private mats = new Map<string, THREE.Material>();
  private clusters = new Map<string, Cluster>();
  private shownSig = '';
  private waiters: Array<() => void> = [];
  private pool: Array<{ w: Worker; busy: string | null }> = [];
  private inline: TileBuilder | null = null;
  private fading: Cluster[] = [];
  private time = 0;
  private lastCam = new THREE.Vector3(1e9, 0, 0);
  private instant = true;
  private baked: boolean;

  constructor(readonly world: WorldDef, private o: TerrainLODOpts) {
    this.lod = lodOf(world);
    this.streamer = new TileStreamer<TileData>(world, o.stream);
    this.baked = !!world.sun && world.terrain.kind === 'height';
    const n = o.workers ?? Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1));
    for (let i = 0; i < n && typeof Worker !== 'undefined'; i++) {
      const w = new Worker(new URL('./tileWorker.ts', import.meta.url), { type: 'module' });
      w.postMessage({ type: 'init', worldId: world.id });
      const slot = { w, busy: null as string | null };
      w.onmessage = (e) => this.onBuilt(slot, (e.data as { data: TileData }).data);
      this.pool.push(slot);
    }
    if (!this.pool.length) this.inline = new TileBuilder(world);
    this.stats.workers = this.pool.length;
  }

  dispose() {
    this.pool.forEach((p) => p.w.terminate());
    for (const [k, c] of this.clusters) this.dropCluster(k, c);
    this.fading.forEach((c) => this.dropGroup(c));
    this.mats.forEach((m) => m.dispose());
  }

  /** Stream for a camera position (and its place on the route, for prefetch); swap in the new set when complete. */
  update(cam: Vec3, time = this.time + 1 / 60, at?: { routeS: number; speed: number }, extra: Vec3[] = []) {
    const c = new THREE.Vector3(cam.x, cam.y, cam.z);
    // camera cuts (or time jumping) swap instantly; continuous motion cross-fades
    this.instant = c.distanceTo(this.lastCam) > 20 || time < this.time || time - this.time > 0.5;
    this.time = time; this.lastCam.copy(c);
    this.stepFades();
    this.streamer.update(cam, time, at, extra);
    this.pump();
    this.tryApply();
  }

  /** Resolves once the tiles for the latest update() are on screen. */
  whenReady(): Promise<void> {
    return this.ready() ? Promise.resolve() : new Promise((r) => this.waiters.push(r));
  }

  private ready() { return this.shownSig === this.sig(); }
  private sig() { return this.streamer.wanted.map((l) => l.key).join('|'); }

  private pump() {
    const st = this.streamer;
    if (this.inline) { // inline builds: only what's needed now (prefetch is pointless synchronously)
      while (st.urgent()) {
        const j = st.next()!;
        const d = this.inline.build(j.job);
        st.done(j.key, d); this.stats.built++; this.stats.buildMs += d.ms;
      }
    } else {
      for (const slot of this.pool) {
        if (slot.busy) continue;
        const j = st.next();
        if (!j) break;
        slot.busy = j.key;
        slot.w.postMessage({ type: 'build', id: 0, job: j.job });
      }
    }
    this.stats.pending = st.pending() + this.pool.filter((p) => p.busy).length;
  }

  private onBuilt(slot: { busy: string | null }, d: TileData) {
    const t0 = now();
    const key = slot.busy!;
    slot.busy = null;
    if (this.streamer.done(key, d)) { this.stats.built++; this.stats.buildMs += d.ms; }
    this.pump();
    this.tryApply();
    this.stats.onBuiltMaxMs = Math.max(this.stats.onBuiltMaxMs, now() - t0);
  }

  private mat(role: PartRole, size: number, fade?: { value: THREE.Vector2 }): THREE.Material {
    if (role === 'glow') return this.mats.get('glow') ?? this.mats.set('glow', new THREE.MeshBasicMaterial({ vertexColors: true })).get('glow')!;
    const baked = this.baked && role !== 'prop', water = role === 'water';
    const make = () => voxelMaterial(water ? { size, jitter: 0.025, wave: this.o.water, baked, fade } : { size, jitter: 0.1, baked, fade });
    if (fade) return make();
    const k = `${role === 'prop' ? 'p' : baked ? 'b' : 'u'}:${size}:${water}`;
    return this.mats.get(k) ?? this.mats.set(k, make()).get(k)!;
  }

  private clusterKey(job: TileJob): string {
    const C = this.lod.cluster;
    if (job.kind === 'road') return `road:${job.voxel}:${Math.floor(job.s0 / (job.len * C * 2))}`;
    if (job.kind === 'props') return `props:${Math.floor(job.s0 / (job.len * 2))}`;
    return `${job.S}:${Math.floor(job.x0 / (job.S * C))}:${Math.floor(job.z0 / (job.S * C))}`;
  }

  /** Swap in the wanted set if every tile is built; rebuild only clusters whose membership changed. */
  private tryApply() {
    const st = this.streamer, sig = this.sig();
    if (sig === this.shownSig || !st.ready()) return;
    const t0 = now();
    const groups = new Map<string, Array<{ key: string; job: TileJob; data: TileData }>>();
    for (const l of st.wanted) {
      const ck = this.clusterKey(l.job);
      (groups.get(ck) ?? groups.set(ck, []).get(ck)!).push({ key: l.key, job: l.job, data: st.get(l.key)! });
    }
    let faces = 0;
    for (const [ck, members] of groups) {
      const csig = members.map((m) => m.key).sort().join('|');
      let c = this.clusters.get(ck);
      if (!c || c.sig !== csig) {
        if (c) this.retire(ck, c);
        c = this.makeCluster(members);
        c.sig = csig;
        this.clusters.set(ck, c);
        this.root.add(c.group);
        if (!this.instant && this.lod.fade > 0) this.startFade(c, 1);
        const m = members[0].job;
        if (!this.instant && m.kind === 'tile') { // pop metric: how big are this cluster's cubes on screen right now?
          const s = m.S / this.lod.res, dist = Math.max(1, Math.hypot(m.x0 + m.S - this.lastCam.x, m.z0 + m.S - this.lastCam.z));
          const px = (s / dist) * 514; // 720p, 70° vertical fov
          this.stats.changes++; this.stats.changePxSum += px; this.stats.changePxMax = Math.max(this.stats.changePxMax, px);
        }
      }
      faces += c.faces;
    }
    for (const [ck, c] of this.clusters) if (!groups.has(ck)) this.retire(ck, c);
    this.shownSig = sig;
    this.stats.leaves = st.wanted.length; this.stats.faces = faces; this.stats.clusters = this.clusters.size;
    this.stats.applyMaxMs = Math.max(this.stats.applyMaxMs, now() - t0);
    const w = this.waiters; this.waiters = []; w.forEach((r) => r());
  }

  private makeCluster(members: Array<{ job: TileJob; data: TileData }>): Cluster {
    const group = new THREE.Group(), byPart = new Map<string, { role: PartRole; voxel: number; meshes: TileData['parts'][number]['mesh'][] }>();
    for (const m of members) for (const p of m.data.parts) {
      const k = `${p.role}:${p.voxel}`;
      (byPart.get(k) ?? byPart.set(k, { role: p.role, voxel: p.voxel, meshes: [] }).get(k)!).meshes.push(p.mesh);
    }
    const job = members[0].job, S = job.kind === 'tile' ? job.S : 0;
    let faces = 0;
    for (const { role, voxel, meshes } of byPart.values()) {
      const merged = mergeMeshData(meshes);
      if (!merged) continue;
      const mesh = new THREE.Mesh(geometryFrom(merged), this.mat(role, voxel));
      mesh.userData.voxel = voxel; mesh.userData.role = role;
      mesh.castShadow = role === 'prop' || (role === 'land' && !this.baked && S > 0 && S <= (this.o.shadowTile ?? 32));
      mesh.receiveShadow = role !== 'glow' && S <= 64;
      group.add(mesh); faces += merged.faces;
    }
    return { sig: '', group, faces };
  }

  private dropGroup(c: Cluster) {
    this.root.remove(c.group);
    c.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    c.fade?.mats.forEach((m) => m.dispose());
  }
  private dropCluster(ck: string, c: Cluster) { this.dropGroup(c); this.clusters.delete(ck); }

  /** Remove a cluster from the live set: dissolve it out (or drop it now on cuts). */
  private retire(ck: string, c: Cluster) {
    this.clusters.delete(ck);
    if (this.instant || !this.lod.fade) { this.dropGroup(c); return; }
    this.startFade(c, -1);
    this.fading.push(c);
  }

  /** Give a cluster per-cluster dissolve materials; dir 1 = fading in, -1 = fading out (complementary dither). */
  private startFade(c: Cluster, dir: 1 | -1) {
    const u = { value: new THREE.Vector2(0, dir) };
    const mats: THREE.Material[] = [];
    c.group.children.forEach((o) => {
      const m = o as THREE.Mesh;
      if (m.userData.role === 'glow') return;
      const mat = this.mat(m.userData.role, m.userData.voxel, u);
      m.material = mat; mats.push(mat);
    });
    c.fade?.mats.forEach((m) => m.dispose());
    c.fade = { u, t0: this.time, mats };
  }

  private stepFades() {
    const T = this.lod.fade;
    const step = (c: Cluster) => { const f = c.fade!, k = Math.min(1, (this.time - f.t0) / T); f.u.value.x = k; return k >= 1; };
    for (const c of this.clusters.values()) if (c.fade && step(c)) { // faded in: back to the shared materials
      c.group.children.forEach((o) => { const m = o as THREE.Mesh; m.material = this.mat(m.userData.role, m.userData.voxel); });
      c.fade.mats.forEach((m) => m.dispose()); c.fade = undefined;
    }
    this.fading = this.fading.filter((c) => { if (this.instant || step(c)) { this.dropGroup(c); return false; } return true; });
  }
}
