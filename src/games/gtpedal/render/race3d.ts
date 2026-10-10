// Street-race set dressing: chalk start lines + flares at every start; for the active race, checkpoint gates (two road
// flares + a spray-chalk arch), the next gate pulsing, and a chevron 'route ribbon' on the ground toward the next gates.
// Instanced: gate posts / arches / chevrons are one InstancedMesh each (+ ink) → ~8 draw calls total.
import * as THREE from 'three';
import type { Snapshot } from '../sim/sim';
import { GATE_R, ROUTES } from '../sim/race';
import { heightAt } from '../sim/world';
import { inkMat } from './chars';
import { toon } from './jsr';
import { mesh, Mt, piece } from './weapons3d';

const MAXG = 40, NCH = 420;
export class RaceLayer {
  readonly group = new THREE.Group();
  private posts: THREE.InstancedMesh; private arches: THREE.InstancedMesh; private archInk: THREE.InstancedMesh; private chev: THREE.InstancedMesh; private flame: THREE.InstancedMesh;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private v = new THREE.Vector3(); private one = new THREE.Vector3(1, 1, 1); private col = new THREE.Color();
  constructor() {
    // start lines: chalk stripes + 'RACE' chevrons + two flares, baked per route into one mesh
    const P: THREE.BufferGeometry[] = [];
    for (const r of ROUTES) {
      const y = heightAt(r.start.x, r.start.z), M = Mt(r.start.x, y, r.start.z, 0, r.start.heading, 0);
      for (let i = -3; i <= 3; i++) P.push(piece(new THREE.BoxGeometry(0.7, 0.02, 0.35), i % 2 ? 0xe9e4d6 : 0x2b2a24, M.clone().multiply(Mt(i * 0.75, 0.02, 1.5))));
      for (const s of [-1, 1]) P.push(piece(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 6), 0xc0392b, M.clone().multiply(Mt(s * 3.2, 0.45, 1.5))), piece(new THREE.BoxGeometry(0.5, 0.02, 0.08), 0xe9e4d6, M.clone().multiply(Mt(s * 3.2, 0.02, 1.1, 0, s * 0.7, 0))));
      for (let k = 0; k < 3; k++) for (const s of [-1, 1]) P.push(piece(new THREE.BoxGeometry(0.12, 0.02, 0.9), 0xe9e4d6, M.clone().multiply(Mt(s * 0.35, 0.02, 3 + k * 1.2, 0, s * 0.6, 0))));
    }
    this.group.add(mesh(P, 0.01));
    const post = new THREE.CylinderGeometry(0.07, 0.09, 1.3, 6); post.translate(0, 0.65, 0);
    this.posts = new THREE.InstancedMesh(post, toon(0xc0392b), MAXG * 2 + 8);
    const arch = new THREE.TorusGeometry(1, 0.06, 4, 20, Math.PI);
    this.arches = new THREE.InstancedMesh(arch, toon(0xe9e4d6), MAXG); this.archInk = new THREE.InstancedMesh(arch, inkMat(0.02), MAXG);
    const fl = new THREE.ConeGeometry(0.12, 0.5, 6); fl.translate(0, 0.25, 0);
    this.flame = new THREE.InstancedMesh(fl, new THREE.MeshBasicMaterial({ color: 0xff5a2a, transparent: true, opacity: 0.9, depthWrite: false }), MAXG * 2 + 8);
    const ch = new THREE.BufferGeometry(); ch.setAttribute('position', new THREE.Float32BufferAttribute([-0.55, 0, -0.25, 0, 0, 0.35, 0.55, 0, -0.25, -0.55, 0, -0.25, 0.55, 0, -0.25, 0, 0, 0.05], 3)); ch.computeVertexNormals();
    this.chev = new THREE.InstancedMesh(ch, new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }), NCH);
    for (const o of [this.posts, this.arches, this.archInk, this.flame, this.chev]) { o.instanceMatrix.setUsage(THREE.DynamicDrawUsage); o.frustumCulled = false; this.group.add(o); }
  }
  frame(s: Snapshot) {
    const rc = s.race, r = rc ? ROUTES.find((q) => q.id === rc.id)! : null;
    let np = 0, na = 0, nf = 0, nc = 0;
    const put = (im: THREE.InstancedMesh, i: number, x: number, y: number, z: number, ry: number, sx = 1, sy = 1, sz = 1) => { this.e.set(0, ry, 0); im.setMatrixAt(i, this.m.compose(this.v.set(x, y, z), this.q.setFromEuler(this.e), new THREE.Vector3(sx, sy, sz))); };
    if (r && rc && rc.state !== 'done') {
      const n = r.gates.length;
      for (let i = 0; i < n; i++) {
        const [x, z] = r.gates[i], [px, pz] = i ? r.gates[i - 1] : [r.start.x, r.start.z], h = Math.atan2(x - px, z - pz), y = heightAt(x, z, s.bridge);
        const isNext = rc.passed < rc.total && rc.passed % n === i, done = rc.laps === 1 && i < rc.passed;
        if (done) continue;
        const w = GATE_R * 0.85, rx = Math.cos(h) * w, rz = -Math.sin(h) * w, pulse = isNext ? 1 + Math.sin(s.t * 8) * 0.12 : 1;
        for (const sd of [-1, 1]) { put(this.posts, np++, x + rx * sd, y, z + rz * sd, 0, 1, isNext ? 1.6 : 1, 1); put(this.flame, nf++, x + rx * sd, y + (isNext ? 2.08 : 1.3), z + rz * sd, s.t * 3, pulse, pulse * (1 + Math.sin(s.t * 23 + i + sd) * 0.25), pulse); }
        this.e.set(0, h + Math.PI / 2, 0); this.m.compose(this.v.set(x, y + (isNext ? 0.2 : 0), z), this.q.setFromEuler(this.e), this.v.clone().set(w, w * 0.55, 1).multiplyScalar(1));
        this.arches.setMatrixAt(na, this.m); this.archInk.setMatrixAt(na, this.m);
        this.arches.setColorAt(na, this.col.set(isNext ? 0xf2c14e : 0xe9e4d6)); na++;
      }
      // chevron ribbon: you → next gate → the one after
      const pts: Array<[number, number]> = [[s.rider.x, s.rider.z]]; if (rc.next) pts.push([rc.next.x, rc.next.z]); if (rc.after) pts.push([rc.after.x, rc.after.z]);
      let carry = 2;
      for (let k = 1; k < pts.length && nc < NCH; k++) {
        const [ax, az] = pts[k - 1], [bx, bz] = pts[k], L = Math.hypot(bx - ax, bz - az), h = Math.atan2(bx - ax, bz - az);
        for (let d = carry; d < L && nc < NCH; d += 3.2) { const x = ax + (bx - ax) * d / L, z = az + (bz - az) * d / L; put(this.chev, nc++, x, heightAt(x, z, s.bridge) + 0.06, z, h); }
        carry = 1.5;
      }
    }
    if ((globalThis as { __gtpAllRoutes?: boolean }).__gtpAllRoutes) for (const r2 of ROUTES) { // dev overview: every route's gates + ribbon, chevrons scaled up for an aerial
      const pts: Array<[number, number]> = [[r2.start.x, r2.start.z], ...r2.gates, ...(r2.laps > 1 ? [r2.gates[0]] : [])];
      for (let k = 1; k < pts.length; k++) {
        const [ax, az] = pts[k - 1], [bx, bz] = pts[k], L = Math.hypot(bx - ax, bz - az), h = Math.atan2(bx - ax, bz - az);
        if (na < MAXG) { this.e.set(0, h + Math.PI / 2, 0); this.m.compose(this.v.set(bx, heightAt(bx, bz) , bz), this.q.setFromEuler(this.e), new THREE.Vector3(GATE_R, GATE_R * 0.55, 1)); this.arches.setMatrixAt(na, this.m); this.archInk.setMatrixAt(na, this.m); this.arches.setColorAt(na, this.col.set(0xf2c14e)); na++; }
        for (let d = 2; d < L && nc < NCH; d += 6) { const x = ax + (bx - ax) * d / L, z = az + (bz - az) * d / L; put(this.chev, nc++, x, heightAt(x, z) + 0.3, z, h, 3, 1, 3); }
      }
    }
    // start flares (always, when not racing)
    if (!rc || rc.state === 'done') for (const st of ROUTES) for (const sd of [-1, 1]) {
      const fx = Math.cos(st.start.heading) * 3.2 * sd, fz = -Math.sin(st.start.heading) * 3.2 * sd, ox = Math.sin(st.start.heading) * 1.5, oz = Math.cos(st.start.heading) * 1.5;
      put(this.flame, nf++, st.start.x + fx + ox, heightAt(st.start.x, st.start.z) + 0.9, st.start.z + fz + oz, s.t * 3, 1, 1 + Math.sin(s.t * 19 + sd) * 0.25, 1);
    }
    this.posts.count = np; this.flame.count = nf; this.arches.count = this.archInk.count = na; this.chev.count = nc;
    for (const o of [this.posts, this.flame, this.arches, this.archInk, this.chev]) { o.instanceMatrix.needsUpdate = true; o.visible = o.count > 0; }
    if (this.arches.instanceColor) this.arches.instanceColor.needsUpdate = true;
  }
}
