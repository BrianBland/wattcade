// River jobs, drawn: two water mills (models in buildings.ts) whose wheels turn with the water passing them, the village of
// Millbrook (timber-framed cottages with smoking chimneys; they rock when flooded), crop fields that green and ripen when watered, a beaver dam with its
// beavers, and a bouncing marker over the current objective's target. Render-only.
import * as THREE from 'three';
import type { WatershedSnapshot } from '../sim/sim';
import { damSticks, houseGeometry, millModel } from './buildings';
import { organic } from './models';
import { beaverModel, poseBeaver } from './wildlife';

const ROOFS = [0xb5473a, 0x3f6fa8, 0xc8892f, 0x6e4f9a, 0x3f8f68];
const WALLS = [0xf4ead6, 0xead2b0, 0xe4ebef];
const SHUTTERS = [0x2e6e4a, 0x3f6fa8, 0xa8402e, 0x4a4a4a];

/** A cottage (one merged mesh) in a group, so flooding can rock it; its chimney is a named child for the smoke. */
function house(k: number, s = 1): THREE.Group {
  const g = new THREE.Group();
  const { geo, chimney } = houseGeometry({ w: 2.0 + (k % 3) * 0.3, d: 1.7, wallH: 1.3 + (k % 2) * 0.35, wall: WALLS[k % 3], roof: ROOFS[k % ROOFS.length], shutter: SHUTTERS[k % SHUTTERS.length] });
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
  m.castShadow = true; m.receiveShadow = true; m.scale.setScalar(s); g.add(m);
  const c = new THREE.Object3D(); c.name = 'chimney'; c.position.copy(chimney).multiplyScalar(s); g.add(c);
  return g;
}

/** Chimney smoke: a few soft puffs rising and drifting from each chimney (instanced). */
class Smoke {
  readonly mesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4(); private v = new THREE.Vector3();
  constructor(private sources: THREE.Object3D[], private per = 5) {
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 2), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 1, transparent: true, opacity: 0.55, depthWrite: false }), sources.length * per);
    this.mesh.frustumCulled = false;
  }
  update(time: number) {
    this.sources.forEach((src, i) => {
      src.getWorldPosition(this.v);
      const on = src.parent?.visible !== false;
      for (let k = 0; k < this.per; k++) {
        const age = ((time * 0.25 + k / this.per + i * 0.37) % 1);
        const s = on ? (0.35 + age * 1.1) * (age < 0.1 ? age / 0.1 : 1 - Math.max(0, age - 0.75) / 0.25) : 0;
        this.m.makeScale(s, s, s).setPosition(this.v.x + age * 2.2 + Math.sin(time + k) * 0.2, this.v.y + age * 4.5, this.v.z + Math.sin(time * 0.7 + i) * age);
        this.mesh.setMatrixAt(i * this.per + k, this.m);
      }
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

function cropTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d'); if (!g) return null;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#b5b5b5'; for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 64, 3);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); return t;
}

export class JobsLayer {
  readonly group = new THREE.Group();
  private mills: THREE.Group[] = [];
  private houses: THREE.Group[] = [];
  private fields: THREE.Mesh[] = [];
  private dam = new THREE.Group(); private sticks: THREE.InstancedMesh; private stickLay = damSticks(48, 5.6); private mud: THREE.Mesh; private beavers: THREE.Group[] = []; private carried: THREE.Mesh;
  private smoke: Smoke; private sm = new THREE.Matrix4(); private sq = new THREE.Quaternion(); private se = new THREE.Euler(); private sp = new THREE.Vector3(); private ss = new THREE.Vector3();
  private marker = new THREE.Group();
  private c = new THREE.Color();

  constructor(s: WatershedSnapshot, private wx: (j: number) => number, private wz: (i: number) => number, private heightAt: (x: number, y: number) => number) {
    const J = s.jobs;
    for (const m of J.mills) {
      const g = millModel(m.kind);
      g.position.set(wx(m.y), heightAt(m.x, m.y), wz(m.x + 3)); g.scale.setScalar(1.7);   // cartoon-big: readable from the overview
      this.mills.push(g); this.group.add(g);
    }
    const v = J.village;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2, r = k === 0 ? 0 : 4.2;
      const hx = v.x + Math.cos(a) * r, hy = v.y + Math.sin(a) * r;
      const g = house(k, 0.8 + (k % 2) * 0.12);
      g.position.set(wx(hy), heightAt(hx, hy), wz(hx)); g.rotation.y = a; g.scale.setScalar(1.5);
      this.houses.push(g); this.group.add(g);
    }
    const tex = cropTexture();
    for (const f of J.fields) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(f.r * 2, f.r * 2, 6, 6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, map: tex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.position.set(wx(f.y), 0, wz(f.x)); m.receiveShadow = true;
      this.fields.push(m); this.group.add(m);
    }
    // the dam: crossed sticks piled in a wedge on a mud bank, built bottom-up as the beavers work
    this.sticks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.1, 1, 6).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a6038, roughness: 0.9 }), this.stickLay.length);
    this.sticks.castShadow = true;
    const stickC = new THREE.Color();
    this.stickLay.forEach((_, n) => this.sticks.setColorAt(n, stickC.setHSL(0.08, 0.38, 0.22 + (n * 0.37 % 1) * 0.16)));
    const mudG = new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2); mudG.scale(1.5, 0.9, 6.2);
    this.mud = new THREE.Mesh(organic(mudG, 0.1, 1.2, new THREE.Color(0x3e2a18), new THREE.Color(0x5a4028), 0, 0.9, 4), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    this.mud.receiveShadow = true;
    this.dam.add(this.sticks, this.mud);
    for (let k = 0; k < 2; k++) { const b = beaverModel(); b.scale.setScalar(1.5); this.beavers.push(b); this.dam.add(b); }
    this.carried = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.6, 6).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a6038 }));
    this.carried.position.set(0.95, 0.5, 0); this.beavers[1].add(this.carried);
    this.dam.scale.setScalar(1.3);
    this.dam.visible = false; this.group.add(this.dam);
    this.smoke = new Smoke([...this.mills, ...this.houses].map((g) => g.getObjectByName('chimney')!).filter(Boolean));
    this.group.add(this.smoke.mesh);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.8, 16), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffb000, emissiveIntensity: 0.6 }));
    arrow.rotation.x = Math.PI; arrow.name = 'arrow';
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.18, 6, 40), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8 }));
    ring.rotation.x = -Math.PI / 2; ring.name = 'ring';
    arrow.scale.setScalar(2); this.marker.add(arrow, ring); this.group.add(this.marker);
  }

  update(s: WatershedSnapshot, dt: number, time: number): void {
    const J = s.jobs, river = s.phase === 'river' || s.phase === 'salmon';
    this.group.visible = true;
    this.smoke.update(time);
    J.mills.forEach((m, k) => {
      const g = this.mills[k];
      g.position.y = this.heightAt(m.x, m.y);
      const w = g.getObjectByName('wheel'); if (w) w.rotation.x -= dt * (0.4 + 3.2 * m.spin) * (m.spin > 0.05 ? 1 : 0);
    });
    const v = J.village, flooded = v.wet > 0.12 && river;
    this.houses.forEach((g, k) => {
      g.position.y = this.heightAt(v.x + Math.cos((k / 6) * Math.PI * 2) * (k === 0 ? 0 : 4.2), v.y + Math.sin((k / 6) * Math.PI * 2) * (k === 0 ? 0 : 4.2));
      g.rotation.z = flooded ? Math.sin(time * 9 + k) * 0.04 : 0;
    });
    J.fields.forEach((f, k) => {
      const m = this.fields[k], mat = m.material as THREE.MeshStandardMaterial;
      m.position.y = this.heightAt(f.x, f.y) + 0.06;
      if (f.drowned) this.c.set(0x5a4a32);
      else this.c.set(0x8a6a3a).lerp(this.c.clone().set(0x5fbf3a), Math.min(1, f.growth * 1.6)).lerp(new THREE.Color(0xe8c23a), Math.max(0, f.growth - 0.6) / 0.4);
      mat.color.lerp(this.c, 1 - Math.exp(-dt * 3));
    });
    const d = J.dam;
    this.dam.visible = !!d && (!d.broken || d.health > 0.05) && river;
    if (d) {
      this.dam.position.set(this.wx(d.y), this.heightAt(d.x, d.y), this.wz(d.x));
      const k01 = Math.min(d.build, d.health);
      this.stickLay.forEach((st, n) => {
        // each layer appears as the build passes it, and washes out (top first) as the dam wears
        const show = Math.max(0, Math.min(1, k01 * 4.5 - st.layer - (n % 5) * 0.12));
        this.se.set(0, st.ry, st.rz); this.sq.setFromEuler(this.se);
        this.sp.set(st.x, st.y * Math.max(0.3, k01), st.z); this.ss.set(show, show, st.len * show);
        this.sm.compose(this.sp, this.sq, this.ss); this.sticks.setMatrixAt(n, this.sm);
      });
      this.sticks.instanceMatrix.needsUpdate = true;
      this.mud.scale.set(1, Math.max(0.05, k01), 1);
      const away = d.broken ? Math.min(1, (1 - d.health) * 2) : 0;
      this.beavers.forEach((b, n) => {
        if (n === 0) {
          // the builder: perched on the crest, chewing and tamping
          b.position.set(-0.3 + away * 9, 0.35 + 0.95 * Math.max(0.3, k01), 1.2 + Math.sin(time * 0.3) * 0.6 + away * 3);
          b.rotation.y = away > 0 ? -Math.PI / 2 : Math.PI + Math.sin(time * 0.4) * 0.5;
          poseBeaver(b, away > 0 ? 0 : 1, away > 0 ? (time * 2) % 1 : 0, away, time);
        } else {
          // the hauler: swims along the upstream face with a stick, turns at each end
          const u = (time * 0.12) % 1, leg = u < 0.5 ? u * 2 : 2 - u * 2, dir = u < 0.5 ? 1 : -1;
          b.position.set(-1.7 - away * 9, 0.05 + Math.sin(time * 5) * 0.04, -4.5 + leg * 9 + away * 2);
          b.rotation.y = away > 0 ? Math.PI : dir > 0 ? -Math.PI / 2 : Math.PI / 2;
          this.carried.visible = !d.broken && d.build < 1;
          poseBeaver(b, 0, away > 0 ? (time * 2.3) % 1 : 0, 1, time);
        }
      });
    }
    // marker over the current objective's target
    const o = J.objective, tg = o && o.state === 'active' ? o.target : null;
    this.marker.visible = !!tg && river;
    if (tg) {
      const y = this.heightAt(tg.x, tg.y);
      this.marker.position.set(this.wx(tg.y), y, this.wz(tg.x));
      const arrow = this.marker.getObjectByName('arrow')!; arrow.position.y = 11 + Math.abs(Math.sin(time * 3)) * 2.5;
      const ring = this.marker.getObjectByName('ring')!; ring.position.y = 0.3; ring.scale.setScalar(1 + 0.15 * Math.sin(time * 4));
    }
  }
}
