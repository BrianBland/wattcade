// River jobs, drawn: two cartoon water mills whose wheels turn with the water passing them, the village of Millbrook
// (houses wobble and go blue when flooded), crop fields that green and ripen when watered, a beaver dam with its
// beavers, and a bouncing marker over the current objective's target. Render-only.
import * as THREE from 'three';
import type { WatershedSnapshot } from '../sim/sim';

const toon = (c: number, rough = 0.75) => new THREE.MeshStandardMaterial({ color: c, roughness: rough });
const ROOFS = [0xd9483b, 0x3b7dd9, 0xe8a23a, 0x8a4fd9, 0x3bb07a];

function house(wall: number, roof: number, s = 1): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2 * s, 1.6 * s, 1.7 * s), toon(wall)); body.position.y = 0.8 * s;
  const r = new THREE.Mesh(new THREE.ConeGeometry(1.65 * s, 1.1 * s, 4), toon(roof)); r.rotation.y = Math.PI / 4; r.position.y = 2.15 * s; r.scale.z = 0.85;
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8 * s, 0.5 * s), toon(0x6b4423)); door.position.set(1.0 * s, 0.4 * s, 0);
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4 * s, 0.4 * s), toon(0xfff1a8, 0.3)); win.position.set(1.0 * s, 1.05 * s, 0.5 * s);
  for (const m of [body, r, door, win]) { m.castShadow = true; g.add(m); }
  return g;
}

function millModel(kind: 'grist' | 'saw'): THREE.Group {
  const g = house(0xf3e6c8, kind === 'grist' ? 0xc0392b : 0x2e7d4f, 1.3);
  const wheel = new THREE.Group(); wheel.name = 'wheel';
  const wood = toon(0x7a5230);
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.12, 8, 24), wood));
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.8), wood); paddle.position.set(Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0); paddle.rotation.z = a;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.5, 0.08), wood); spoke.position.set(Math.cos(a) * 0.75, Math.sin(a) * 0.75, 0); spoke.rotation.z = a - Math.PI / 2;
    wheel.add(paddle, spoke);
  }
  wheel.rotation.y = Math.PI / 2; wheel.position.set(0, 1.4, 1.6);
  g.add(wheel);
  if (kind === 'grist') for (let k = 0; k < 3; k++) { const sack = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), toon(0xe8d7a8)); sack.scale.y = 1.3; sack.position.set(-1.6, 0.4, -0.6 + k * 0.6); g.add(sack); }
  else for (let k = 0; k < 4; k++) { const log = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2, 8), wood); log.rotation.z = Math.PI / 2; log.position.set(0, 0.25 + (k > 2 ? 0.4 : 0), -1.8 - (k % 3) * 0.45); g.add(log); }
  return g;
}

function beaver(): THREE.Group {
  const g = new THREE.Group(), fur = toon(0x7a4a26), dark = toon(0x4a2c16), white = toon(0xffffff, 0.3), black = toon(0x111111, 0.3);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), fur); body.scale.set(1.3, 0.9, 0.9); body.position.y = 0.5;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 10), fur); head.position.set(0.7, 0.7, 0);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.45), dark); tail.position.set(-0.85, 0.2, 0); tail.name = 'tail';
  const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.14), white); teeth.position.set(1.06, 0.55, 0);
  g.add(body, head, tail, teeth);
  for (const z of [0.14, -0.14]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), white); e.position.set(0.98, 0.84, z);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), black); p.position.set(1.05, 0.84, z);
    g.add(e, p);
  }
  g.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
  return g;
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
  private dam = new THREE.Group(); private logs: THREE.Mesh[] = []; private beavers: THREE.Group[] = [];
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
      const g = house([0xfff4e0, 0xf3d9b8, 0xe9f0f7][k % 3], ROOFS[k % ROOFS.length], 0.75 + (k % 2) * 0.15);
      g.position.set(wx(hy), heightAt(hx, hy), wz(hx)); g.rotation.y = a; g.scale.setScalar(1.5);
      this.houses.push(g); this.group.add(g);
    }
    const tex = cropTexture();
    for (const f of J.fields) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(f.r * 2, f.r * 2, 6, 6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, map: tex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.position.set(wx(f.y), 0, wz(f.x)); m.receiveShadow = true;
      this.fields.push(m); this.group.add(m);
    }
    for (let k = 0; k < 9; k++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.6, 8), toon(0x7a5230)); log.rotation.x = Math.PI / 2; log.rotation.z = (k % 3 - 1) * 0.3;
      log.castShadow = true; this.logs.push(log); this.dam.add(log);
    }
    for (let k = 0; k < 2; k++) { const b = beaver(); b.scale.setScalar(1.8); this.beavers.push(b); this.dam.add(b); }
    this.dam.scale.setScalar(1.3);
    this.dam.visible = false; this.group.add(this.dam);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.8, 16), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffb000, emissiveIntensity: 0.6 }));
    arrow.rotation.x = Math.PI; arrow.name = 'arrow';
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.18, 6, 40), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8 }));
    ring.rotation.x = -Math.PI / 2; ring.name = 'ring';
    arrow.scale.setScalar(2); this.marker.add(arrow, ring); this.group.add(this.marker);
  }

  update(s: WatershedSnapshot, dt: number, time: number): void {
    const J = s.jobs, river = s.phase === 'river' || s.phase === 'salmon';
    this.group.visible = true;
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
      this.logs.forEach((l, n) => { l.position.set((n % 3 - 1) * 0.4, 0.3 + Math.floor(n / 3) * 0.45, (n % 3 - 1) * 2.4 + (n % 2) * 0.6); l.scale.setScalar(Math.max(0.01, Math.min(1, k01 * 3 - Math.floor(n / 3)))); });
      this.beavers.forEach((b, n) => {
        const away = d.broken ? Math.min(1, (1 - d.health) * 2) : 0;
        b.position.set(1.4 + n * 0.6 + away * 8, 0.2 + Math.abs(Math.sin(time * 6 + n)) * 0.15, (n ? -1 : 1) * 2.2);
        b.rotation.y = n ? Math.PI : 0;
        const tail = b.getObjectByName('tail'); if (tail) tail.rotation.z = Math.sin(time * 8 + n) * 0.4;
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
