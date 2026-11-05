// Town decorations bought in the Decorate tab, placed automatically along the town's own paths, plus the visitors'
// gifts (carousel, bandstand, telescope) and festival dressing. Rebuilt only when the town or decor changes.
import * as THREE from 'three';
import type { DecorId, GiftId } from '../sim/extras';
import { islandHeight, LIGHTHOUSE, LIGHTHOUSE_Y, PLOTS, plotHeight } from '../sim/layout';
import type { Life } from './life';
import { HUBS } from './life';
import { waveHeight } from './sea';
import { lam, mergeStatic, mesh, mulberry, pick, softTexture } from './util';
import { PointCloud } from '../../../gfx/points';

const FLAG_COLS = [0xff5a5a, 0xffd23f, 0x4fb3ff, 0x7ddc6a, 0xff9fd0, 0xffffff, 0xb07cff, 0xff9f43];
const SQ = HUBS[0];
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ground = (x: number, z: number) => Math.max(0.2, islandHeight(x, z));

export interface DecorState { decor: Record<DecorId, number>; gifts: GiftId[]; festival: boolean; buildings: Array<string | null>; townKey: string }
export interface DecorFrame { t: number; dt: number; night: number; storm: number; amp: number; festival: boolean }

export class Decor {
  readonly group = new THREE.Group();
  private stat = new THREE.Group();
  private key = '';
  private lanternMat = new THREE.SpriteMaterial({ map: softTexture(64, 0.3), color: 0xffc070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
  private carousel?: { g: THREE.Group; horses: THREE.Object3D[] };
  private rowers: Array<{ g: THREE.Group; cx: number; cz: number; r: number; ph: number; oar: THREE.Object3D }> = [];
  private spray?: PointCloud; private sprayAt = V();
  private musicians: THREE.Group[] = [];
  private flags: THREE.Mesh[] = [];

  constructor(private life: Life) { this.group.add(this.stat); }

  sync(s: DecorState) {
    const k = `${s.townKey}|${Object.values(s.decor).join('')}|${s.gifts.join(',')}|${s.festival}`;
    if (k === this.key) return;
    this.key = k;
    for (const c of [...this.group.children]) { this.group.remove(c); c.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); }); }
    this.stat = new THREE.Group(); this.group.add(this.stat);
    this.carousel = undefined; this.rowers = []; this.spray = undefined; this.musicians = []; this.flags = [];
    if (!s.buildings.some(Boolean)) return;
    const taken: Array<[number, number, number]> = [];
    const free = (x: number, z: number, r: number) => taken.every(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) > r + tr);
    const spot = (cx: number, cz: number, r0: number, r1: number, clear: number, seed: number): [number, number] | null => {
      const r = mulberry(seed);
      for (let i = 0; i < 300; i++) {
        const a = r() * Math.PI * 2, d = r0 + r() * (r1 - r0), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (this.life.okSpot(x, z, clear + 0.6) && free(x, z, clear)) { taken.push([x, z, clear]); return [x, z]; }
      }
      return null;
    };
    const d = s.decor, fest = s.festival;
    if (d.fountain) { this.fountain(); taken.push([SQ.x, SQ.z, 1.6]); }
    if (s.gifts.includes('carousel')) { const p = spot(SQ.x, SQ.z, 4, 13, 2.6, 11); if (p) this.makeCarousel(p[0], p[1]); }
    if (s.gifts.includes('bandstand')) { const p = spot(SQ.x, SQ.z, 4, 14, 2.4, 23); if (p) this.bandstand(p[0], p[1], fest); }
    if (s.gifts.includes('telescope')) this.telescope();
    if (d.statue) { const p = spot(SQ.x, SQ.z, 2.5, 9, 1.2, 37); if (p) this.statue(p[0], p[1]); }
    const bunt = fest ? Math.max(2, d.bunting) : d.bunting;
    if (bunt) this.bunting(bunt);
    const lant = fest ? Math.max(1, d.lanterns) : d.lanterns;
    if (lant) this.lanterns(lant);
    if (d.benches) this.benches(d.benches, spot);
    if (d.boats) this.boats(d.boats, s.buildings);
    if (d.arches) this.arches(d.arches, s.buildings);
    mergeStatic(this.stat, (o) => this.flags.includes(o as THREE.Mesh));
  }

  // ---------- pieces ----------
  private bunting(level: number) {
    const edges = this.life.edgeList.filter((e) => {
      if (level >= 3) return true;
      const nearSq = (p: { x: number; z: number }) => Math.hypot(p.x - SQ.x, p.z - SQ.z) < 1;
      return level === 1 ? nearSq(e.a) || nearSq(e.b) : nearSq(e.a) || nearSq(e.b) || (e.a.z > 6 && e.b.z > 6);
    });
    const pos: number[] = [], col: number[] = [], line: number[] = [], c = new THREE.Color();
    const r = mulberry(5), poles = new Set<string>();
    const pole = (x: number, z: number, h: number) => {
      const k = `${x.toFixed(1)},${z.toFixed(1)}`; if (poles.has(k)) return; poles.add(k);
      this.stat.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, h, 4), lam(0x6b4a2e), x, ground(x, z) + h / 2, z, false));
    };
    for (const e of edges) {
      const len = Math.hypot(e.b.x - e.a.x, e.b.z - e.a.z); if (len < 2 || len > 16) continue;
      const nx = -(e.b.z - e.a.z) / len * 0.9, nz = (e.b.x - e.a.x) / len * 0.9; // run the string beside the path
      const ax = e.a.x + nx, az = e.a.z + nz, bx = e.b.x + nx, bz = e.b.z + nz, H = 2.6;
      pole(ax, az, H); pole(bx, bz, H);
      const ya = ground(ax, az) + H, yb = ground(bx, bz) + H, n = Math.max(3, Math.floor(len / 0.7));
      let prev: THREE.Vector3 | null = null;
      for (let i = 0; i <= n; i++) {
        const u = i / n, p = V(ax + (bx - ax) * u, ya + (yb - ya) * u - Math.sin(u * Math.PI) * len * 0.06, az + (bz - az) * u);
        if (prev) line.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
        prev = p;
        if (i === 0 || i === n) continue;
        const tx = (bx - ax) / len * 0.17, tz = (bz - az) / len * 0.17;
        pos.push(p.x - tx, p.y, p.z - tz, p.x + tx, p.y, p.z + tz, p.x, p.y - 0.38, p.z);
        c.setHex(pick(r, FLAG_COLS)); for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
      }
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    const flags = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.group.add(flags); this.flags.push(flags);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(line, 3));
    this.group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x5a4a3a })));
  }

  private lanterns(level: number) {
    let n = 0;
    for (const e of this.life.edgeList) {
      const mid = { x: (e.a.x + e.b.x) / 2, z: (e.a.z + e.b.z) / 2 };
      if (level < 2 && Math.hypot(mid.x - SQ.x, mid.z - SQ.z) > 16) continue;
      const len = Math.hypot(e.b.x - e.a.x, e.b.z - e.a.z);
      for (let u = 1.5, side = 1; u < len - 1 && n < 48; u += 3.6, side = -side) {
        const k = u / len, x = e.a.x + (e.b.x - e.a.x) * k - (e.b.z - e.a.z) / len * 0.95 * side, z = e.a.z + (e.b.z - e.a.z) * k + (e.b.x - e.a.x) / len * 0.95 * side;
        if (PLOTS.some((p) => Math.hypot(p.x - x, p.z - z) < 1.8) || islandHeight(x, z) < 0.6) continue;
        const y = ground(x, z);
        this.stat.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.7, 5), lam(0x2d3138), x, y + 0.85, z, false));
        this.stat.add(mesh(new THREE.BoxGeometry(0.26, 0.32, 0.26), lam(0xffd890), x, y + 1.85, z, false));
        const glow = new THREE.Sprite(this.lanternMat); glow.position.set(x, y + 1.85, z); glow.scale.setScalar(1.6); this.group.add(glow);
        n++;
      }
    }
  }

  private benches(level: number, spot: (cx: number, cz: number, r0: number, r1: number, clear: number, seed: number) => [number, number] | null) {
    const bench = (x: number, z: number, yaw: number) => {
      const g = new THREE.Group(), wood = lam(0x8b6b3e), iron = lam(0x2d3138);
      g.add(mesh(new THREE.BoxGeometry(1.3, 0.08, 0.4), wood, 0, 0.45, 0), mesh(new THREE.BoxGeometry(1.3, 0.35, 0.06), wood, 0, 0.7, -0.2));
      for (const sx of [-0.55, 0.55]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.45, 0.4), iron, sx, 0.22, 0, false));
      g.position.set(x, ground(x, z), z); g.rotation.y = yaw; this.stat.add(g);
    };
    for (const [i, a] of [[0, 0.5], [1, 2.6], [2, 4.4]].slice(0, 2 + (level >= 2 ? 1 : 0))) {
      const x = SQ.x + Math.cos(a) * 2.9, z = SQ.z + Math.sin(a) * 2.9;
      if (islandHeight(x, z) > 0.6) bench(x, z, -a - Math.PI / 2 + (i % 2 ? 0 : 0));
    }
    if (level >= 2) this.life.edgeList.forEach((e, i) => { const g = [e.a, e.b].find((p) => p.kind === 'garden'); if (g && i % 2 === 0) bench(g.x + 1.3, g.z + 0.5, Math.PI); });
    if (level >= 3) {
      const r = mulberry(91);
      for (let i = 0; i < 5; i++) {
        const p = spot(SQ.x, SQ.z - 6, 3, 18, 1.0, 300 + i); if (!p) continue;
        const [x, z] = p, y = ground(x, z), g = new THREE.Group();
        const cloth = mesh(new THREE.BoxGeometry(1.4, 0.03, 1.0), lam(pick(r, [0xe25555, 0x4f8fe0, 0xf2c94c, 0x6cc070])), 0, 0.02, 0, false);
        const basket = mesh(new THREE.CylinderGeometry(0.18, 0.15, 0.22, 6), lam(0xb08850), 0.35, 0.13, 0.2);
        g.add(cloth, basket); g.position.set(x, y, z); g.rotation.y = r() * 3; this.stat.add(g);
      }
    }
  }

  private rowboat(): { g: THREE.Group; oar: THREE.Object3D } {
    const g = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.BoxGeometry(2, 0.35, 0.8), lam(0xc0703a)); shell.position.y = 0.15;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.75), lam(0xe8dcc0)); seat.position.y = 0.33;
    const oar = new THREE.Group(); const o = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 2.4), lam(0x8b6b3e)); oar.add(o); oar.position.y = 0.4;
    g.add(shell, seat, oar);
    g.traverse((x) => { x.castShadow = true; });
    return { g, oar };
  }
  private boats(level: number, buildings: Array<string | null>) {
    let placed = 0;
    PLOTS.forEach((p, i) => {
      if (!p.shore || placed >= 3 || p.district === 'islet') return;
      for (let dz = 1; dz < 7; dz += 0.5) {
        const x = p.x + (buildings[i] ? -2.8 : 0.6), z = p.z + dz, h = islandHeight(x, z);
        if (h > 0.15 && h < 0.7) { const b = this.rowboat(); b.g.position.set(x, h + 0.05, z); b.g.rotation.set(0.12, 0.6 + i, 0.08); this.stat.add(b.g); placed++; return; }
      }
    });
    if (level >= 2) for (const [cx, cz, r, ph] of [[16, 28, 6, 0], [-6, 27, 5, 2]] as const) {
      const b = this.rowboat(); this.group.add(b.g);
      const rower = new THREE.Group();
      rower.add(mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.5, 6), lam(0xd35400), 0, 0.55, 0), mesh(new THREE.IcosahedronGeometry(0.13, 0), lam(0xf2c9a0), 0, 0.92, 0));
      b.g.add(rower);
      this.rowers.push({ g: b.g, cx, cz, r, ph, oar: b.oar });
    }
  }

  private arches(level: number, buildings: Array<string | null>) {
    const r = mulberry(17);
    buildings.forEach((k, i) => {
      if (k !== 'garden' && k !== 'cottage') return;
      if (k === 'cottage' && i % 2) return;
      const p = PLOTS[i], x = p.x, z = p.z + (k === 'garden' ? 2.4 : 1.7) - 0.4, y = plotHeight(i);
      const arch = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.07, 5, 12, Math.PI), lam(0x3f7d3a)); arch.position.set(x, y + 0.9, z);
      this.stat.add(arch);
      for (const sx of [-0.85, 0.85]) this.stat.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 4), lam(0x3f7d3a), x + sx, y + 0.45, z, false));
      const n = level >= 2 ? 14 : 5;
      for (let j = 0; j < n; j++) {
        const a = (j / (n - 1)) * Math.PI;
        this.stat.add(mesh(new THREE.IcosahedronGeometry(0.11, 0), lam(level >= 2 ? pick(r, [0xff5a7a, 0xff9fd0, 0xe8392b, 0xffffff]) : pick(r, [0xffffff, 0xfff27a])), x + Math.cos(a) * 0.85, y + 0.9 + Math.sin(a) * 0.85, z + (r() - 0.5) * 0.15, false));
      }
    });
  }

  private fountain() {
    const x = SQ.x, z = SQ.z, y = ground(x, z), stone = lam(0xc9c3b8);
    this.stat.add(mesh(new THREE.CylinderGeometry(1.35, 1.45, 0.45, 12), stone, x, y + 0.22, z));
    this.stat.add(mesh(new THREE.CylinderGeometry(1.18, 1.18, 0.06, 12), lam(0x5ab0ff), x, y + 0.42, z, false));
    this.stat.add(mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.3, 6), stone, x, y + 1.05, z));
    this.stat.add(mesh(new THREE.CylinderGeometry(0.55, 0.25, 0.18, 10), stone, x, y + 1.7, z));
    const N = 70, g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.spray = new PointCloud(g, { color: 0xdff3ff, size: 0.22, transparent: true, opacity: 0.85, depthWrite: false });
    this.group.add(this.spray); this.sprayAt.set(x, y + 1.8, z);
  }

  private statue(x: number, z: number) {
    const y = ground(x, z), stone = lam(0xb9b4aa);
    this.stat.add(mesh(new THREE.BoxGeometry(1.1, 0.9, 1.1), lam(0x9a948a), x, y + 0.45, z));
    this.stat.add(mesh(new THREE.CylinderGeometry(0.32, 0.42, 1.3, 7), stone, x, y + 1.55, z));
    this.stat.add(mesh(new THREE.IcosahedronGeometry(0.3, 0), stone, x, y + 2.45, z));
    this.stat.add(mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.2, 8), stone, x, y + 2.75, z));
    const arm = mesh(new THREE.BoxGeometry(0.16, 0.8, 0.16), stone, x + 0.35, y + 2.3, z); arm.rotation.z = -2.5; this.stat.add(arm); // a heroic wave
  }

  private makeCarousel(x: number, z: number) {
    const y = ground(x, z), g = new THREE.Group(); g.position.set(x, y, z); this.group.add(g);
    g.add(mesh(new THREE.CylinderGeometry(2.1, 2.2, 0.3, 14), lam(0xf2e3c0), 0, 0.15, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.6, 8), lam(0xd4a63a), 0, 1.5, 0));
    const top = new THREE.Group(); top.position.y = 2.8; g.add(top);
    for (let i = 0; i < 12; i++) { const seg = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.2, 12, 1, true, (i / 12) * Math.PI * 2, Math.PI / 6), lam(i % 2 ? 0xe74c3c : 0xffffff)); seg.position.y = 0.6; top.add(seg); }
    top.add(mesh(new THREE.SphereGeometry(0.2, 6, 5), lam(0xd4a63a), 0, 1.3, 0));
    const horses: THREE.Object3D[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, h = new THREE.Group();
      h.add(mesh(new THREE.BoxGeometry(0.7, 0.32, 0.22), lam(pick(mulberry(i + 3), [0xffffff, 0xf6d6a8, 0x9a6a4a, 0xd0d8ff])), 0, 0, 0), mesh(new THREE.BoxGeometry(0.18, 0.35, 0.18), lam(0xffffff), 0.35, 0.22, 0));
      h.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 4), lam(0xd4a63a), 0, 0.6, 0, false));
      h.position.set(Math.cos(a) * 1.5, 1.1, Math.sin(a) * 1.5); h.rotation.y = -a; h.userData.a = a;
      g.add(h); horses.push(h);
    }
    this.carousel = { g, horses };
  }

  private bandstand(x: number, z: number, fest: boolean) {
    const y = ground(x, z), g = new THREE.Group(); g.position.set(x, y, z);
    g.add(mesh(new THREE.CylinderGeometry(2, 2.1, 0.45, 8), lam(0xf2efe6), 0, 0.22, 0));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 2, 5), lam(0xffffff), Math.cos(a) * 1.8, 1.4, Math.sin(a) * 1.8, false)); }
    g.add(mesh(new THREE.ConeGeometry(2.4, 1.2, 8), lam(0x5b3f8c), 0, 3, 0));
    g.add(mesh(new THREE.SphereGeometry(0.16, 6, 5), lam(0xd4a63a), 0, 3.7, 0));
    this.stat.add(g);
    if (fest) for (let i = 0; i < 3; i++) { // the band plays during festivals
      const m = new THREE.Group(), a = (i / 3) * Math.PI * 2;
      m.add(mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.6, 6), lam([0xc0392b, 0x2e7d32, 0x34495e][i]), 0, 0.3, 0), mesh(new THREE.IcosahedronGeometry(0.15, 0), lam(0xf2c9a0), 0, 0.72, 0));
      m.add(mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.4, 6), lam(0xd4a63a), 0.2, 0.5, 0, false));
      m.position.set(x + Math.cos(a) * 0.9, y + 0.45, z + Math.sin(a) * 0.9); m.rotation.y = -a + Math.PI; m.userData.y = y + 0.45;
      this.group.add(m); this.musicians.push(m);
    }
  }

  private telescope() {
    const x = LIGHTHOUSE.x + 5.6, z = LIGHTHOUSE.z - 3.4, y = Math.max(LIGHTHOUSE_Y - 1, islandHeight(x, z));
    const g = new THREE.Group(); g.position.set(x, y, z);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2, leg = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 4), lam(0x5e472b), Math.cos(a) * 0.3, 0.6, Math.sin(a) * 0.3, false); leg.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3); g.add(leg); }
    const tube = mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.6, 8), lam(0xc9a43a), 0, 1.4, 0); tube.rotation.z = -1.0; g.add(tube);
    this.stat.add(g);
  }

  update(f: DecorFrame) {
    this.lanternMat.opacity = Math.min(1, f.night * 1.2 + f.storm * 0.3 + (f.festival ? 0.3 : 0));
    if (this.carousel) {
      const spin = f.storm > 0.3 ? 0 : f.festival ? 0.9 : 0.4;
      this.carousel.g.rotation.y += f.dt * spin;
      for (const h of this.carousel.horses) h.position.y = 1.1 + Math.sin(f.t * 2.4 + (h.userData.a as number) * 2) * 0.25 * (spin > 0 ? 1 : 0);
    }
    for (const b of this.rowers) {
      const a = f.t * 0.12 + b.ph, x = b.cx + Math.cos(a) * b.r, z = b.cz + Math.sin(a) * b.r * 0.6;
      b.g.visible = f.storm < 0.2;
      b.g.position.set(x, waveHeight(x, z, f.t, f.amp) + 0.1, z);
      b.g.rotation.y = -a - Math.PI / 2; b.oar.rotation.x = Math.sin(f.t * 2.5 + b.ph) * 0.4;
    }
    for (const m of this.musicians) m.position.y = (m.userData.y as number) + Math.abs(Math.sin(f.t * 5 + m.id)) * 0.08; // bobbing to the beat
    if (this.spray) {
      const pa = this.spray.cloud.attributes.position as THREE.BufferAttribute, n = pa.count, o = this.sprayAt;
      for (let i = 0; i < n; i++) {
        const k = ((f.t * 0.9 + i / n) % 1), a = i * 2.39996, r = k * 1.0;
        pa.setXYZ(i, o.x + Math.cos(a) * r, o.y + k * 1.6 - k * k * 2.2, o.z + Math.sin(a) * r);
      }
      pa.needsUpdate = true;
    }
  }
}
