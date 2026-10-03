// Salmon run visuals: the school (instanced, smoothed, wiggling, leaping), bears on the banks, diving eagles,
// and danger markers on the water so dodges are readable from the saddle.
import * as THREE from 'three';
import { SEA, sample } from '../sim/terrain';
import type { SalmonView, WatershedSnapshot } from '../sim/sim';
import { bearModel, eagleModel, salmonGeometry, swimMaterial } from './models';

const MAX_FISH = 24;

interface PredObj { g: THREE.Group; marker: THREE.Mesh; kind: 'bear' | 'eagle'; seen: number }

export class SalmonLayer {
  readonly group = new THREE.Group();
  private fish: THREE.InstancedMesh;
  private ring: THREE.Mesh;
  private shown: Array<{ x: number; y: number; z: number; s: number }> = [];
  private preds = new Map<number, PredObj>();
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private p = new THREE.Vector3(); private sc = new THREE.Vector3();
  private hop = 0;
  private swim = { value: 0 };

  constructor(color: string, private wx: (j: number) => number, private wz: (i: number) => number) {
    const mat = swimMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.05, side: THREE.DoubleSide }), this.swim);
    this.fish = new THREE.InstancedMesh(salmonGeometry(), mat, MAX_FISH + 1);
    this.fish.castShadow = true; this.fish.frustumCulled = false;
    this.fish.setColorAt(0, new THREE.Color(0xffffff).lerp(new THREE.Color(color), 0.45));
    for (let k = 1; k <= MAX_FISH; k++) this.fish.setColorAt(k, new THREE.Color().setScalar(0.92 + (k % 4) * 0.03));
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(2, 0.16, 6, 28), new THREE.MeshBasicMaterial({ color }));
    this.ring.rotation.x = -Math.PI / 2;
    this.group.add(this.fish, this.ring);
    this.group.visible = false;
  }

  /** dt = real seconds since last frame; time = sim seconds (for wiggle). */
  update(s: WatershedSnapshot, view: SalmonView | null, dt: number, time: number): void {
    this.group.visible = !!view;
    if (!view) { for (const [, o] of this.preds) this.dropPred(o); this.preds.clear(); this.shown = []; return; }
    const { nx, ny, h, w } = s;
    const surface = (x: number, y: number) => Math.max(sample(h, nx, ny, x, y), SEA) + sample(w, nx, ny, x, y) * 0.9;
    const k = 1 - Math.exp(-dt * 10);
    this.swim.value = time;
    this.hop = view.leaping ? Math.min(1, this.hop + dt * 3) : Math.max(0, this.hop - dt * 2);
    const all = [{ ...view.leader, alive: true }, ...view.fish].slice(0, MAX_FISH + 1);
    all.forEach((f, idx) => {
      const tx = this.wx(f.y), tz = this.wz(f.x);
      const leap = this.hop * Math.max(0, Math.sin(time * 4 + idx * 0.9)) * 1.8;
      const ty = surface(f.x, f.y) + 0.55 + leap;
      let cur = this.shown[idx];
      if (!cur || view.restarting) cur = this.shown[idx] = { x: tx, y: ty, z: tz, s: f.alive ? 1 : 0 };
      cur.x += (tx - cur.x) * k; cur.y += (ty - cur.y) * k; cur.z += (tz - cur.z) * k;
      cur.s += ((f.alive ? 1 : 0) - cur.s) * (1 - Math.exp(-dt * 6));
      const wig = Math.sin(time * 2.3 + idx * 1.7) * 0.08;  // body undulation is in the shader; this is a slow wander
      // face upstream along the channel: model nose is +X; grid heading (dx, dy) → world (dy, dx)
      const yaw = Math.atan2(-view.heading.x, view.heading.y);
      this.e.set(0, yaw + wig, leap > 0.1 ? 0.5 : 0); this.q.setFromEuler(this.e);
      this.p.set(cur.x, cur.y, cur.z);
      this.sc.setScalar((idx === 0 ? 1.25 : 0.85) * cur.s);
      this.m.compose(this.p, this.q, this.sc);
      this.fish.setMatrixAt(idx, this.m);
    });
    for (let idx = all.length; idx <= MAX_FISH; idx++) { this.m.makeScale(0, 0, 0); this.fish.setMatrixAt(idx, this.m); }
    this.fish.count = MAX_FISH + 1;
    this.fish.instanceMatrix.needsUpdate = true;
    const L = this.shown[0];
    if (L) { this.ring.position.set(L.x, L.y - 0.05, L.z); this.ring.scale.setScalar(1 + 0.1 * Math.sin(time * 5)); }

    // predators
    const live = new Set<number>();
    for (const pr of view.predators) {
      live.add(pr.id);
      let o = this.preds.get(pr.id);
      if (!o) { o = this.makePred(pr.kind); this.preds.set(pr.id, o); }
      o.seen += dt;
      const appear = Math.min(1, o.seen / 0.6);
      const mat = o.marker.material as THREE.MeshBasicMaterial;
      if (pr.kind === 'bear') {
        const bx = pr.x, by = pr.y;
        const ground = sample(h, nx, ny, bx, by);
        const lunge = pr.struck >= 0 ? Math.min(1, pr.struck * 4) * Math.max(0, 1 - (pr.struck - 0.6) * 1.5) : 0;
        o.g.position.set(this.wx(by), ground - (1 - appear) * 3, this.wz(bx - pr.side * lunge * 1.6));
        o.g.rotation.y = pr.side > 0 ? Math.PI / 2 : -Math.PI / 2;
        const paw = o.g.getObjectByName('paw'); if (paw) paw.position.y = 0.65 + lunge * 1.4 + (pr.struck < 0 && pr.t < 1.5 ? 0.4 : 0);
        // danger band: the bear's half of the channel at its row
        const mx = (bx + pr.cx) / 2;
        o.marker.position.set(this.wx(by), surface(mx, by) + 0.08, this.wz(mx));
        o.marker.scale.set(3.2, 1, Math.abs(bx - pr.cx) + 0.6);
        mat.opacity = pr.struck >= 0 ? Math.max(0, 0.5 - pr.struck * 0.3) : 0.18 + 0.3 * Math.max(0, 1 - pr.t / 4) * (0.6 + 0.4 * Math.sin(time * 12));
        if (pr.struck > 2) o.g.position.y -= (pr.struck - 2) * 6;
      } else {
        const ex = pr.x, ey = pr.y;
        const ws = surface(ex, ey);
        const pre = Math.max(0, pr.t), ang = time * 2.2;
        const r = pr.struck >= 0 ? 0 : Math.min(5, pre * 1.6);
        const alt = pr.struck >= 0 ? pr.struck * 9 : pre * 4 + 0.3;
        o.g.position.set(this.wx(ey) + Math.cos(ang) * r, ws + 0.6 + alt, this.wz(ex) + Math.sin(ang) * r);
        o.g.rotation.set(0, -ang + (pr.struck >= 0 ? 0 : Math.PI / 2), pr.struck >= 0 ? -0.6 : pre < 1 ? 0.5 : 0);
        const flap = Math.sin(time * (pre < 1 ? 4 : 9)) * 0.5;
        const wl = o.g.getObjectByName('wl'), wr = o.g.getObjectByName('wr');
        if (wl && wr) { wl.rotation.x = flap; wr.rotation.x = -flap; }
        o.g.scale.setScalar(appear * 1.2);
        o.marker.position.set(this.wx(ey), ws + 0.08, this.wz(ex));
        const rr = 1.2 + Math.min(3, pre) * 0.6;
        o.marker.scale.set(rr, 1, rr);
        mat.opacity = pr.struck >= 0 ? 0 : 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(time * 14));
      }
    }
    for (const [id, o] of this.preds) if (!live.has(id)) { this.dropPred(o); this.preds.delete(id); }
  }

  private makePred(kind: 'bear' | 'eagle'): PredObj {
    const g = kind === 'bear' ? bearModel() : eagleModel();
    const mg = kind === 'bear' ? new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2) : new THREE.RingGeometry(0.75, 1, 28).rotateX(-Math.PI / 2);
    const marker = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.3, depthWrite: false }));
    marker.renderOrder = 3;
    this.group.add(g, marker);
    return { g, marker, kind, seen: 0 };
  }
  private dropPred(o: PredObj) {
    this.group.remove(o.g, o.marker);
    o.g.traverse((x) => { const m = x as THREE.Mesh; m.geometry?.dispose(); });
    o.marker.geometry.dispose();
  }

  /** Smoothed leader position (world), for the camera. */
  leaderWorld(out: THREE.Vector3): THREE.Vector3 | null { const L = this.shown[0]; return L ? out.set(L.x, L.y, L.z) : null; }
}
