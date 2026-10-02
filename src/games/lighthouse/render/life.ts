// Everything that makes the island feel alive and reacts to nearby buildings:
// paths between buildings, flowers/trees/gardens that grow with in-zone riding, villagers, fishers, porters, gulls, butterflies, smoke.
import * as THREE from 'three';
import { BRIDGE, HARBOUR, islandHeight, LIGHTHOUSE, PIER_LEN, PLOTS, plotHeight } from '../sim/layout';
import { plotYaw, SHORE_KINDS } from './buildings';
import type { Seg, Terrain } from './world';
import { lam, mergeStatic, mulberry, pick, softTexture } from './util';

const FLOWER_COLS = [0xff6fa8, 0xffd23f, 0xffffff, 0xb07cff, 0xff5a4f, 0xff9f43, 0x6cb4ff, 0xffb3e6];
const WILD_COLS = [0xffffff, 0xfff27a, 0xd9b8ff, 0xffc2dd, 0xfff6c8];
const CLOTHES = [0x3b6ea5, 0xc0392b, 0x2e7d32, 0xf1c40f, 0x8e44ad, 0xe67e22, 0x34495e, 0xd35400, 0x16a085];
const SKIN = [0xf2c9a0, 0xd9a577, 0xa7754d, 0x7a5236, 0xf5d5b8];
const HUBS = [{ x: HARBOUR.x - 2, z: HARBOUR.z - 4 }, { x: LIGHTHOUSE.x + 7, z: LIGHTHOUSE.z + 1.5 }];

interface Node { x: number; z: number; kind: string; plot: number; deck?: number; land: number }
interface Walker {
  g: THREE.Group; body: THREE.Mesh; crate?: THREE.Mesh; rod?: THREE.Mesh;
  role: 'villager' | 'fisher' | 'porter';
  home: number; at: number; route: number[]; x: number; z: number; wait: number; speed: number; seed: number; hidden: boolean;
  a?: number; b?: number; pier?: number; // porter endpoints / fisher pier plot
}

export interface LifeFrame {
  t: number; dt: number; night: number; storm: number;
  dockedPiers: Set<number>; bellAge: number; smokeExtra: THREE.Vector3[];
}

export class Life {
  readonly group = new THREE.Group();
  private terrain: Terrain;
  private townKey = ''; private decorKey = '';
  private flowers: THREE.InstancedMesh; private grass: THREE.InstancedMesh;
  private trunks: THREE.InstancedMesh; private crowns: THREE.InstancedMesh; private pines: THREE.InstancedMesh;
  private patches: THREE.InstancedMesh;
  private extras = new THREE.Group();
  private walkers: Walker[] = [];
  private nodes: Node[] = []; private adj: number[][] = [];
  private gulls: Array<{ g: THREE.Group; l: THREE.Object3D; r: THREE.Object3D; ph: number; rad: number; h: number; cx: number; cz: number; sp: number }> = [];
  private flies: Array<{ g: THREE.Group; l: THREE.Mesh; r: THREE.Mesh; cx: number; cz: number; ph: number; y: number }> = [];
  private washing: THREE.Mesh[] = [];
  private smoke: THREE.Points;
  private buildings: Array<string | null> = []; private levels: number[] = []; private islet = false;
  private dummy = new THREE.Object3D(); private col = new THREE.Color();

  constructor(terrain: Terrain) {
    this.terrain = terrain;
    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number, shadow = false) => {
      const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.castShadow = shadow; m.receiveShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(m); return m;
    };
    const white = () => new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    this.flowers = inst(new THREE.IcosahedronGeometry(0.14, 0), white(), 3500);
    const grassGeo = new THREE.ConeGeometry(0.1, 0.55, 3); grassGeo.translate(0, 0.27, 0);
    this.grass = inst(grassGeo, white(), 2200);
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1, 5); trunkGeo.translate(0, 0.5, 0);
    this.trunks = inst(trunkGeo, lam(0x6b4a2e), 260, true);
    this.crowns = inst(new THREE.IcosahedronGeometry(1, 0), white(), 260, true);
    const pineGeo = new THREE.ConeGeometry(0.9, 2.4, 6); pineGeo.translate(0, 1.2, 0);
    this.pines = inst(pineGeo, white(), 80, true);
    this.patches = inst(new THREE.BoxGeometry(1, 0.12, 0.6), lam(0x6e4b2f), 40);
    this.group.add(this.extras);
    // smoke puffs (per-vertex alpha)
    const N = 240;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 4), 4));
    this.smoke = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, map: softTexture(64, 0.2), vertexColors: true, transparent: true, depthWrite: false }));
    this.smoke.frustumCulled = false;
    this.group.add(this.smoke);
    this.makeGulls();
  }

  /** Rebuild paths, decor and villagers when the town or its growth changes. */
  setTown(buildings: Array<string | null>, levels: number[], grow: number[], meadow: number, islet: boolean) {
    const tk = buildings.map((b, i) => (b ? b + levels[i] : '')).join(',') + (islet ? '|islet' : '');
    this.levels = levels.slice(); this.islet = islet;
    const dk = tk + '|' + grow.map((g) => Math.floor(g * 10)).join('') + '|' + Math.floor(meadow * 40);
    if (tk !== this.townKey) { this.townKey = tk; this.buildings = buildings.slice(); this.buildGraph(grow); this.spawnWalkers(); }
    if (dk !== this.decorKey) { this.decorKey = dk; this.buildGraph(grow, true); this.buildDecor(grow, meadow); }
  }

  private nodePos(i: number) {
    const p = PLOTS[i], k = this.buildings[i];
    if (k === 'pier') return { x: p.x - 1.2, z: p.z - 1.4 };
    if (k && SHORE_KINDS.has(k)) return { x: p.x - 2.6, z: p.z - 1.2 };
    if (k === 'orchard') return { x: p.x, z: p.z + 2.3 };
    return { x: p.x, z: p.z + (k === 'garden' || k === 'market' ? 2.4 : 1.7) };
  }

  private buildGraph(grow: number[], paintOnly = false) {
    const nodes: Node[] = HUBS.map((h, i) => ({ x: h.x, z: h.z, kind: i === 0 ? 'square' : 'lighthouse', plot: -1, land: 0 }));
    if (this.islet) nodes.push({ x: BRIDGE.x0 - 0.6, z: BRIDGE.z, kind: 'bridge', plot: -1, land: 0 }, { x: BRIDGE.x1 + 0.6, z: BRIDGE.z, kind: 'bridge', plot: -1, land: 1 });
    this.buildings.forEach((k, i) => { if (k) { const p = this.nodePos(i); nodes.push({ x: p.x, z: p.z, kind: k, plot: i, land: PLOTS[i].district === 'islet' ? 1 : 0 }); } });
    // Prim's MST over the land nodes so paths look like they grew between neighbours
    const n = nodes.length, inTree = new Array(n).fill(false), best = new Array(n).fill(Infinity), parent = new Array(n).fill(-1);
    best[0] = 0;
    const edges: Array<[number, number]> = [];
    for (let it = 0; it < n; it++) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!inTree[i] && (u < 0 || best[i] < best[u])) u = i;
      if (best[u] === Infinity) break; // islet buildings without a bridge stay unconnected
      inTree[u] = true; if (parent[u] >= 0) edges.push([parent[u], u]);
      for (let v = 0; v < n; v++) if (!inTree[v]) {
        const bridge = nodes[u].kind === 'bridge' && nodes[v].kind === 'bridge';
        const d = nodes[u].land !== nodes[v].land && !bridge ? Infinity : bridge ? 0 : Math.hypot(nodes[u].x - nodes[v].x, nodes[u].z - nodes[v].z) * (v === 1 || u === 1 ? 1.4 : 1);
        if (d < best[v]) { best[v] = d; parent[v] = u; }
      }
    }
    const segs: Seg[] = [], age: number[] = [];
    const g = (nd: Node) => (nd.plot >= 0 ? grow[nd.plot] : 1);
    const show = this.buildings.some((k) => k);
    if (show) for (const [a, b] of edges) { segs.push([nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z]); age.push(Math.min(g(nodes[a]), g(nodes[b]))); }
    // short spur from each building's node to its door/plot
    if (show) nodes.forEach((nd) => { if (nd.plot >= 0 && nd.kind !== 'pier') { const p = PLOTS[nd.plot]; segs.push([nd.x, nd.z, p.x, p.z + 0.9]); age.push(g(nd)); } });
    this.terrain.paintPaths(segs, age);
    if (paintOnly) return;
    // pier ends become walkable nodes on the deck
    const adj: number[][] = nodes.map(() => []);
    for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }
    nodes.forEach((nd, i) => {
      if (nd.kind !== 'pier') return;
      const p = PLOTS[nd.plot], deck = plotHeight(nd.plot) + 0.25;
      const s = nodes.push({ x: p.x, z: p.z + 0.5, kind: 'deck', plot: nd.plot, deck, land: nd.land }) - 1;
      const e = nodes.push({ x: p.x, z: p.z + PIER_LEN - 0.4, kind: 'pierEnd', plot: nd.plot, deck, land: nd.land }) - 1;
      adj.push([i, e], [s]); adj[i].push(s);
    });
    this.nodes = nodes; this.adj = adj;
  }

  private heightAt(x: number, z: number): number {
    for (let i = 0; i < PLOTS.length; i++) {
      if (this.buildings[i] !== 'pier') continue;
      const p = PLOTS[i];
      if (Math.abs(x - p.x) < 0.8 && z > p.z - 0.2 && z < p.z + PIER_LEN + 0.5) return plotHeight(i) + 0.25;
    }
    if (this.islet && x > BRIDGE.x0 - 0.5 && x < BRIDGE.x1 + 0.5 && Math.abs(z - BRIDGE.z) < 0.9) return Math.max(BRIDGE.y + 0.1, islandHeight(x, z));
    return Math.max(0.2, islandHeight(x, z));
  }

  private okSpot(x: number, z: number, plotClear = 2.1): boolean {
    const h = islandHeight(x, z);
    if (h < 0.95) return false;
    if (Math.abs(islandHeight(x + 0.6, z) - h) > 0.35 || Math.abs(islandHeight(x, z + 0.6) - h) > 0.35) return false;
    if (Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z) < 4.2) return false;
    if (Math.hypot(x - LIGHTHOUSE.x - 4.2, z - LIGHTHOUSE.z - 2.6) < 2.6) return false;
    for (let i = 0; i < PLOTS.length; i++) if (this.buildings[i] && Math.hypot(x - PLOTS[i].x, z - PLOTS[i].z) < plotClear) return false;
    return !this.terrain.onPath(x, z);
  }

  private buildDecor(grow: number[], meadow: number) {
    const d = this.dummy;
    let nf = 0, ng = 0, nt = 0, np = 0, nv = 0;
    const flower = (x: number, z: number, c: number, s = 1) => {
      if (nf >= this.flowers.instanceMatrix.count) return;
      d.position.set(x, islandHeight(x, z) + 0.12 * s, z); d.rotation.set(0, x * 3, 0); d.scale.setScalar(s); d.updateMatrix();
      this.flowers.setMatrixAt(nf, d.matrix); this.flowers.setColorAt(nf, this.col.setHex(c)); nf++;
    };
    const tuft = (x: number, z: number, s: number, light: number) => {
      if (ng >= this.grass.instanceMatrix.count) return;
      d.position.set(x, islandHeight(x, z) - 0.05, z); d.rotation.set((x % 1) * 0.3, z * 5, (z % 1) * 0.3); d.scale.set(s, s * (0.8 + (x * 7 % 1) * 0.6), s); d.updateMatrix();
      this.grass.setMatrixAt(ng, d.matrix); this.grass.setColorAt(ng, this.col.setHSL(0.27 + light * 0.04, 0.5, 0.32 + light * 0.12)); ng++;
    };
    const tree = (x: number, z: number, s: number, crown: number, pine = false) => {
      const y = islandHeight(x, z);
      if (pine) {
        if (np >= this.pines.instanceMatrix.count) return;
        d.position.set(x, y - 0.1, z); d.rotation.set(0, x, 0); d.scale.set(s, s * 1.1, s); d.updateMatrix();
        this.pines.setMatrixAt(np, d.matrix); this.pines.setColorAt(np, this.col.setHex(crown)); np++;
        return;
      }
      if (nt >= this.trunks.instanceMatrix.count) return;
      d.position.set(x, y - 0.05, z); d.rotation.set(0, x * 2, 0); d.scale.set(s, s * 1.3, s); d.updateMatrix();
      this.trunks.setMatrixAt(nt, d.matrix);
      d.position.set(x, y + s * 1.75, z); d.scale.set(s * 1.05, s * 0.95, s * 1.05); d.updateMatrix();
      this.crowns.setMatrixAt(nt, d.matrix); this.crowns.setColorAt(nt, this.col.setHex(crown)); nt++;
    };
    // remove old extras (washing lines etc.)
    for (const c of [...this.extras.children]) this.extras.remove(c);
    this.washing = [];

    for (let i = 0; i < PLOTS.length; i++) {
      const k = this.buildings[i]; if (!k) continue;
      const g = grow[i], p = PLOTS[i], r = mulberry(i * 101 + 3), lv = this.levels[i] || 1;
      const ring = (n: number, r0: number, r1: number, cb: (x: number, z: number) => void) => {
        let placed = 0;
        for (let tries = 0; tries < n * 5 && placed < n; tries++) {
          const a = r() * Math.PI * 2, rr = r0 + r() * (r1 - r0);
          const x = p.x + Math.cos(a) * rr, z = p.z + Math.sin(a) * rr;
          if (this.okSpot(x, z, r0 * 0.95)) { cb(x, z); placed++; }
        }
      };
      if (k === 'garden') {
        // beds inside the fence fill up as the garden grows
        const beds = [[-0.9, -0.6, 1.3, 0.8], [0.9, -0.6, 1.3, 0.8], [0, 0.7, 1.3, 0.8]];
        const n = Math.floor((12 + 54 * g) * (1 + 0.35 * (lv - 1)));
        for (let j = 0; j < n; j++) {
          const b = beds[j % 3];
          const fx = p.x + b[0] + (r() - 0.5) * b[2] * 0.9, fz = p.z + b[1] + (r() - 0.5) * b[3] * 0.85;
          const c = pick(r, FLOWER_COLS);
          d.position.set(fx, plotHeight(i) + 0.22, fz); d.scale.setScalar(0.7 + g * 0.6); d.rotation.set(0, 0, 0); d.updateMatrix();
          if (nf < this.flowers.instanceMatrix.count) { this.flowers.setMatrixAt(nf, d.matrix); this.flowers.setColorAt(nf, this.col.setHex(c)); nf++; }
        }
        ring(Math.floor(6 + 26 * g), 2.3, 4.2, (x, z) => flower(x, z, pick(r, FLOWER_COLS)));
        ring(2, 2.6, 3.6, (x, z) => tree(x, z, 0.35 + 0.65 * g, pick(r, [0xffb7d5, 0xffc8e0, 0xf7a1c4])));
        ring(Math.floor(6 + 10 * g), 2.2, 4, (x, z) => tuft(x, z, 0.9, r()));
      } else if (k === 'orchard') {
        // rows of fruit trees inside the fence; they fill out and fruit as the orchard grows
        const yaw = plotYaw(k, i, p.x), cs = Math.cos(yaw), sn = Math.sin(yaw);
        const cols = lv >= 2 ? [-1.5, 0, 1.5] : [-1.2, 1.2], rows = [-0.8, 0.8];
        for (const lx of cols) for (const lz of rows) {
          const x = p.x + lx * cs + lz * sn, z = p.z - lx * sn + lz * cs;
          const sc = 0.3 + 0.45 * g;
          tree(x, z, sc, 0x5f9e3f);
          if (g > 0.35) for (let q = 0; q < 5; q++) { const a = q * 1.3 + i; flower(x + Math.cos(a) * sc * 0.9, z + Math.sin(a) * sc * 0.9, pick(r, [0xe8392b, 0xff8a1a, 0xffd23f]), 1.1); }
        }
        ring(Math.floor(4 + 6 * g), 2.8, 4, (x, z) => tuft(x, z, 0.9, r()));
      } else if (k === 'cottage') {
        ring(Math.floor((3 + 14 * g) * (1 + 0.3 * (lv - 1))), 1.9 + 0.3 * (lv - 1), 3.4 + 0.4 * (lv - 1), (x, z) => flower(x, z, pick(r, FLOWER_COLS)));
        ring(1, 2.4, 3.4, (x, z) => tree(x, z, 0.3 + 0.75 * g, pick(r, [0x5f9e3f, 0x6aaa45, g > 0.6 ? 0xffc8e0 : 0x58963a])));
        ring(2, 1.9, 2.8, (x, z) => tree(x, z, 0.28 + 0.12 * g, 0x4f8a3c));
        ring(Math.floor(5 + 8 * g), 1.9, 3.5, (x, z) => tuft(x, z, 0.9, r()));
        if (g > 0.3) ring(1, 2.2, 3, (x, z) => {
          if (nv >= 40) return;
          d.position.set(x, islandHeight(x, z) + 0.02, z); d.rotation.set(0, r() * 3, 0); d.scale.setScalar(1); d.updateMatrix(); this.patches.setMatrixAt(nv++, d.matrix);
          for (let q = 0; q < 6; q++) flower(x + (q % 3 - 1) * 0.28, z + (q < 3 ? -0.15 : 0.15), 0x3e8e2e, 0.9);
        });
        if (g > 0.15) ring(1, 2.0, 2.8, (x, z) => this.addWashing(x, z, r));
      } else {
        ring(Math.floor(2 + 8 * g), 2.2, 3.6, (x, z) => flower(x, z, pick(r, FLOWER_COLS)));
        if (!SHORE_KINDS.has(k)) ring(1, 2.6, 3.6, (x, z) => tree(x, z, 0.4 + 0.6 * g, 0x5f9e3f));
      }
    }
    mergeStatic(this.extras, (o) => this.washing.includes(o as THREE.Mesh));
    // island-wide meadow: a fixed candidate list so more riding adds flowers without reshuffling old ones
    const r = mulberry(4242);
    const wild = Math.floor(meadow * 700), tufts = Math.floor(450 + 900 * meadow);
    let w = 0, tf = 0;
    for (let it = 0; it < 9000 && (w < wild || tf < tufts); it++) {
      const x = -30 + r() * 90, z = -21 + r() * 38, c = r(), s = r();
      if ((x > 37 && !this.islet) || !this.okSpot(x, z)) continue;
      if (tf < tufts) { tuft(x, z, 0.7 + s * 0.6, c); tf++; }
      else if (w < wild) { const cl = Math.floor(1 + c * 4); for (let q = 0; q < cl; q++) flower(x + (q - 1) * 0.3, z + ((q * 7) % 3 - 1) * 0.25, pick(r, w % 2 === 0 ? FLOWER_COLS : WILD_COLS), 0.75); w++; }
    }
    // hillside trees: always some; more and bigger as the island blooms
    const tr = mulberry(777);
    const nTrees = Math.floor(16 + 30 * meadow);
    let placed = 0;
    for (let it = 0; it < 1500 && placed < nTrees; it++) {
      const x = -26 + tr() * 62, z = -20 + tr() * 22, s = tr(), c = tr();
      if (!this.okSpot(x, z, 3.2)) continue;
      const pine = islandHeight(x, z) > 3.5 && c < 0.6;
      tree(x, z, (0.55 + s * 0.5) * (0.75 + 0.35 * meadow), pine ? pick(tr, [0x2f6b3a, 0x3a7a44, 0x2a5f35]) : pick(tr, [0x5f9e3f, 0x6aaa45, 0x4f8a3c, meadow > 0.5 && c > 0.85 ? 0xffc8e0 : 0x58963a]), pine);
      placed++;
    }
    for (const m of [this.flowers, this.grass, this.trunks, this.crowns, this.pines, this.patches]) {
      m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.flowers.count = nf; this.grass.count = ng; this.trunks.count = nt; this.crowns.count = nt; this.pines.count = np; this.patches.count = nv;
    this.flowers.computeBoundingSphere(); this.grass.computeBoundingSphere(); this.trunks.computeBoundingSphere(); this.crowns.computeBoundingSphere(); this.pines.computeBoundingSphere();
    // butterflies around gardens
    for (const f of this.flies) this.group.remove(f.g);
    this.flies = [];
    this.buildings.forEach((k, i) => {
      if (k !== 'garden') return;
      for (let j = 0; j < 2 + Math.floor(grow[i] * 4); j++) {
        const g = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial({ color: pick(mulberry(i * 9 + j), [0xffe14d, 0xffffff, 0xff9fd0, 0x9fd0ff, 0xffa53d]), side: THREE.DoubleSide });
        const wing = new THREE.PlaneGeometry(0.22, 0.16);
        const l = new THREE.Mesh(wing, mat), rr = new THREE.Mesh(wing, mat);
        l.position.x = -0.11; rr.position.x = 0.11; g.add(l, rr);
        this.group.add(g);
        this.flies.push({ g, l, r: rr, cx: PLOTS[i].x, cz: PLOTS[i].z, ph: j * 1.7 + i, y: plotHeight(i) + 0.7 });
      }
    });
  }

  private addWashing(x: number, z: number, r: () => number) {
    const h = islandHeight(x, z), a = r() * Math.PI;
    const dx = Math.cos(a) * 0.9, dz = Math.sin(a) * 0.9;
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), lam(0x6b4a2e)); p.position.set(x + dx * s, h + 0.6, z + dz * s); this.extras.add(p); }
    const line = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.02, 0.02), lam(0xdddddd)); line.position.set(x, h + 1.15, z); line.rotation.y = -a; this.extras.add(line);
    for (let k = 0; k < 3; k++) {
      const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.45), new THREE.MeshLambertMaterial({ color: pick(r, [0xffffff, 0x6cb4ff, 0xff8f8f, 0xfff27a, 0xa0e0a0]), side: THREE.DoubleSide }));
      const f = (k - 1) * 0.5;
      cl.position.set(x + Math.cos(a) * f, h + 0.92, z + Math.sin(a) * f); cl.rotation.y = -a;
      this.extras.add(cl); this.washing.push(cl);
    }
  }

  private makePerson(seed: number): { g: THREE.Group; body: THREE.Mesh } {
    const r = mulberry(seed * 53 + 11);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.24, 0.62, 6), lam(pick(r, CLOTHES))); body.position.y = 0.31;
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), lam(pick(r, SKIN))); head.position.y = 0.76;
    g.add(body, head);
    if (r() < 0.45) { const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, 0.12, 6), lam(pick(r, [0xf4e2a1, 0x34495e, 0xc0392b, 0x2e7d32]))); hat.position.y = 0.9; g.add(hat); }
    this.group.add(g);
    return { g, body };
  }

  private spawnWalkers() {
    for (const w of this.walkers) this.group.remove(w.g);
    this.walkers = [];
    const b = this.buildings;
    const count = (k: string) => b.filter((x) => x === k).length;
    const homes = this.nodes.map((n, i) => (n.kind === 'cottage' ? i : -1)).filter((i) => i >= 0);
    const homeLv = b.reduce((sum, k, i) => sum + (k === 'cottage' ? (this.levels[i] || 1) + 1 : 0), 0);
    const nVill = Math.min(28, homeLv + count('market') * 2 + count('orchard') + (count('cottage') ? 1 : 0));
    for (let i = 0; i < nVill; i++) {
      const home = homes.length ? homes[i % homes.length] : 0;
      const { g, body } = this.makePerson(i + 1);
      const n = this.nodes[home];
      this.walkers.push({ g, body, role: 'villager', home, at: home, route: [], x: n.x, z: n.z, wait: 1 + i * 1.3, speed: 0.9 + (i % 4) * 0.12, seed: i, hidden: false });
    }
    // a fisher at the end of every pier, porters for unloading
    const market = this.nodes.findIndex((n) => n.kind === 'market');
    this.nodes.forEach((n, i) => {
      if (n.kind !== 'pierEnd') return;
      const { g, body } = this.makePerson(100 + i);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 2.2, 4), lam(0x5e472b)); rod.position.set(0, 0.55, 0.6); rod.rotation.x = 1.0; g.add(rod);
      this.walkers.push({ g, body, rod, role: 'fisher', home: i, at: i, route: [], x: n.x + 0.45, z: n.z, wait: 0, speed: 0, seed: 100 + i, hidden: false, pier: n.plot });
      const dest = market >= 0 ? market : (homes[0] ?? 0);
      for (let k = 0; k < 2; k++) {
        const p = this.makePerson(200 + i * 2 + k);
        const crate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.4), lam(0xa07a4a)); crate.position.y = 1.05; p.g.add(crate);
        this.walkers.push({ g: p.g, body: p.body, crate, role: 'porter', home: dest, at: i, route: [], x: n.x, z: n.z, wait: k * 4, speed: 1.3, seed: 200 + k, hidden: true, a: i, b: dest, pier: n.plot });
      }
    });
  }

  private routeTo(from: number, to: number): number[] {
    if (from === to) return [];
    const prev = new Array(this.nodes.length).fill(-1); prev[from] = from;
    const q = [from];
    while (q.length) { const u = q.shift()!; if (u === to) break; for (const v of this.adj[u] ?? []) if (prev[v] < 0) { prev[v] = u; q.push(v); } }
    if (prev[to] < 0) return [];
    const path: number[] = [];
    for (let v = to; v !== from; v = prev[v]) path.unshift(v);
    return path;
  }

  private pickDest(w: Walker): number {
    const r = mulberry(w.seed * 7919 + Math.floor(w.x * 13 + w.z * 7));
    const weights = this.nodes.map((n, i): number => (i === w.at ? 0 : n.kind === 'market' ? 3 : n.kind === 'garden' ? 2.5 : n.kind === 'pierEnd' ? 1.2 : n.kind === 'square' ? 1.5 : n.kind === 'lighthouse' ? 0.7 : n.kind === 'deck' ? 0 : 1));
    let tot = weights.reduce((a, b) => a + b, 0) * r();
    for (let i = 0; i < weights.length; i++) { tot -= weights[i]; if (tot <= 0) return i; }
    return w.home;
  }

  update(f: LifeFrame) {
    const { t, dt, night, storm } = f;
    const indoors = night > 0.62 || storm > 0.35;
    for (const w of this.walkers) {
      if (w.role === 'fisher') {
        const n = this.nodes[w.at];
        w.hidden = indoors;
        w.g.position.set(n.x + 0.45, (n.deck ?? 0) - 0.15, n.z);
        w.g.rotation.y = 0;
        w.body.scale.y = 0.75;
        const tug = Math.sin(t * 0.7 + w.seed) > 0.96 ? 0.25 : 0;
        w.rod!.rotation.x = 1.0 + Math.sin(t * 1.3 + w.seed) * 0.05 - tug;
        w.g.visible = !w.hidden;
        continue;
      }
      if (w.role === 'porter') {
        const active = f.dockedPiers.has(w.pier!) && !indoors;
        if (!active && w.route.length === 0) { w.hidden = true; w.g.visible = false; const n = this.nodes[w.a!]; w.x = n.x; w.z = n.z; w.at = w.a!; continue; }
        w.hidden = false;
        if (w.route.length === 0) {
          w.wait -= dt;
          if (w.wait <= 0 && active) { const to = w.at === w.a ? w.b! : w.a!; w.route = this.routeTo(w.at, to); w.wait = 1.5; }
        }
        w.crate!.visible = w.route.length > 0 && w.route[w.route.length - 1] === w.b;
      } else {
        if (w.route.length === 0) {
          w.wait -= dt;
          if (indoors && w.at !== w.home) w.route = this.routeTo(w.at, w.home);
          else if (!indoors && w.wait <= 0) { w.route = this.routeTo(w.at, this.pickDest(w)); w.wait = 3 + ((w.seed * 37 + Math.floor(t)) % 9); }
        }
        w.hidden = indoors && w.at === w.home && w.route.length === 0;
      }
      // walk
      if (w.route.length) {
        const n = this.nodes[w.route[0]];
        const dx = n.x - w.x, dz = n.z - w.z, d = Math.hypot(dx, dz), step = w.speed * dt * (indoors ? 1.6 : 1);
        if (d <= step) { w.x = n.x; w.z = n.z; w.at = w.route.shift()!; }
        else { w.x += (dx / d) * step; w.z += (dz / d) * step; w.g.rotation.y = Math.atan2(dx, dz); }
      }
      const moving = w.route.length > 0;
      const kind = this.nodes[w.at]?.kind;
      w.body.scale.y = !moving && kind === 'garden' ? 0.65 : 1;
      w.g.position.set(w.x, this.heightAt(w.x, w.z) + (moving ? Math.abs(Math.sin(t * 9 + w.seed)) * 0.08 : 0), w.z);
      w.g.visible = !w.hidden;
    }
    // washing flaps in the wind
    for (let i = 0; i < this.washing.length; i++) this.washing[i].rotation.x = Math.sin(t * 3 + i) * (0.15 + storm * 0.6);
    // butterflies
    for (const b of this.flies) {
      const vis = night < 0.4 && storm < 0.2; b.g.visible = vis; if (!vis) continue;
      const a = t * 0.6 + b.ph;
      b.g.position.set(b.cx + Math.sin(a) * 2.2 + Math.sin(a * 2.3) * 0.5, b.y + Math.sin(a * 3.1) * 0.4, b.cz + Math.cos(a * 0.8) * 1.8);
      b.g.rotation.y = a;
      const flap = Math.sin(t * 22 + b.ph) * 1.1; b.l.rotation.y = flap; b.r.rotation.y = -flap;
    }
    // gulls circle the harbour by day
    for (const gl of this.gulls) {
      gl.g.visible = night < 0.55 && storm < 0.5;
      const a = t * gl.sp + gl.ph;
      gl.g.position.set(gl.cx + Math.cos(a) * gl.rad, gl.h + Math.sin(t * 0.7 + gl.ph) * 1.2, gl.cz + Math.sin(a) * gl.rad * 0.6);
      gl.g.rotation.y = -a + (gl.sp > 0 ? 0 : Math.PI);
      const flap = Math.sin(t * 7 + gl.ph * 3) * 0.5 * (Math.sin(t * 0.5 + gl.ph) > 0 ? 1 : 0.15);
      gl.l.rotation.x = 0.35 + flap; gl.r.rotation.x = -0.35 - flap;
    }
    this.updateSmoke(f);
  }

  private makeGulls() {
    const wing = new THREE.BoxGeometry(0.12, 0.03, 0.9);
    const white = lam(0xf6f6f6);
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.14), white);
      const l = new THREE.Mesh(wing, white), r = new THREE.Mesh(wing, white);
      l.position.z = -0.45; r.position.z = 0.45;
      const lp = new THREE.Group(); lp.add(l); const rp = new THREE.Group(); rp.add(r);
      g.add(body, lp, rp); g.scale.setScalar(0.7);
      this.group.add(g);
      this.gulls.push({ g, l: lp, r: rp, ph: i * 1.9, rad: 8 + (i % 3) * 5, h: 9 + (i % 4) * 2, cx: HARBOUR.x + (i % 2 ? 6 : -4), cz: HARBOUR.z + 4, sp: (i % 3 === 0 ? -1 : 1) * (0.18 + (i % 4) * 0.04) });
    }
  }

  private updateSmoke(f: LifeFrame) {
    const src = f.smokeExtra; // chimneys and steamer funnels, in world space
    const pos = this.smoke.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.smoke.geometry.attributes.color as THREE.BufferAttribute;
    const per = 8, N = pos.count;
    const grey = 0.85 - f.night * 0.5;
    for (let i = 0; i < N; i++) {
      const s = src[Math.floor(i / per)];
      if (!s) { col.setW(i, 0); continue; }
      const k = i % per, life = ((f.t * 0.35 + k / per + Math.floor(i / per) * 0.37) % 1);
      const wind = 1.5 + f.storm * 6;
      pos.setXYZ(i, s.x + life * wind + Math.sin(f.t + i) * 0.15, s.y + life * 3.2, s.z + Math.cos(f.t * 0.7 + i) * 0.2 * life);
      col.setXYZW(i, grey, grey, grey, (1 - life) * 0.55 * Math.min(1, life * 6));
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  }
}
