// Grand Theft Pedal renderer: blocky three.js neighbourhood + DOM HUD. Reads only the sim snapshot.
import * as THREE from 'three';
import type { BikeState, GameRenderer, InputState, Insets, Profile } from '../../../contracts';
import type { Snapshot } from '../sim/sim';
import { BRIDGE, BUILDINGS, CANAL, COOP, HALF, heightAt, LINES } from '../sim/world';
import { stepCam, type CamState } from './camera';
import { JsrSliver } from './jsr';
import { Characters } from './chars';
import { layout, viewOffsetY } from './layout';

const BIKE_COL: Record<string, number> = { city: 0x3a7bd5, fixie: 0xff4f7b, bmx: 0xffb000, cargo: 0x2e9e5b, tandem: 0x9b59b6, ebike: 0x00d0d0 };
const WEAPON_COL: Record<string, number> = { bazooka: 0xff3030, grenade: 0x3cff6a, oil: 0x222222, bottle: 0x7fe6ff, molotov: 0xff9a1f };
const PATCH_COL: Record<string, number> = { oil: 0x111111, glass: 0xbff3ff, fire: 0xff6a00 };
const PAINT = [0x3a7bd5, 0xff4fd8, 0x2ee6a6, 0xffd23f, 0x9b59b6, 0xff6b35];
const box = (w: number, h: number, d: number, c: number) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: c }));

export class GtpRenderer implements GameRenderer {
  private r?: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(60, 4 / 3, 0.3, 800);
  private rider = new THREE.Group(); private riderBike = box(0.4, 0.8, 1.8, 0x3a7bd5);
  private bikes = new Map<number, THREE.Mesh>(); private npcs: THREE.Mesh[] = [];
  private leaves: THREE.Mesh[] = []; private reticle = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.12, 6, 20), new THREE.MeshBasicMaterial({ color: 0xff3030 }));
  private hud?: HTMLDivElement; private toast?: HTMLDivElement; private container?: HTMLElement; private ro?: ResizeObserver;
  private insetB = 0; private W = 800; private H = 600;
  private chars?: Characters; private charDt = 0; private charT = -1;
  private jsr?: JsrSliver; private buildingMeshes: Array<{ mesh: THREE.Mesh; b: (typeof BUILDINGS)[number] }> = [];
  private camSt: CamState = { y: 0, air: 0 }; private lastT = -1;
  private pools = new Map<string, Map<number, THREE.Object3D>>();
  private fireMat = new THREE.MeshBasicMaterial({ color: 0xffb02e });
  private sync<T extends { id: number }>(key: string, items: T[], make: (it: T) => THREE.Object3D, upd: (o: THREE.Object3D, it: T) => void) {
    let pool = this.pools.get(key); if (!pool) { pool = new Map(); this.pools.set(key, pool); }
    const seen = new Set<number>();
    for (const it of items) { seen.add(it.id); let o = pool.get(it.id); if (!o) { o = make(it); pool.set(it.id, o); this.scene.add(o); } upd(o, it); }
    for (const [id, o] of pool) if (!seen.has(id)) { this.scene.remove(o); o.traverse((q) => { const m = q as THREE.Mesh; m.geometry?.dispose(); }); pool.delete(id); }
  }

  mount(container: HTMLElement, ctx: { profile: Readonly<Profile>; insets?: Insets }) {
    this.container = container; this.insetB = ctx.insets?.bottom ?? 0;
    const r = new THREE.WebGLRenderer({ antialias: true }); this.r = r;
    r.setPixelRatio(Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));
    r.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    container.appendChild(r.domElement);
    this.scene.background = new THREE.Color(0x9fd8ff); this.scene.fog = new THREE.Fog(0x9fd8ff, 120, 320);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x557744, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(60, 100, 30); this.scene.add(sun);
    this.buildWorld(ctx.profile.color);
    this.chars = new Characters(new THREE.Color(ctx.profile.color).lerp(new THREE.Color(0x8a8070), 0.45).getHex()); this.scene.add(this.chars.group);
    this.jsr = new JsrSliver(this.scene); this.jsr.styleBuildings(this.buildingMeshes); this.jsr.styleRider(this.rider.children.filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh));
    this.hud = document.createElement('div');
    this.hud.style.cssText = 'position:absolute;font:600 15px system-ui;color:#fff;text-shadow:0 1px 3px #000;pointer-events:none;white-space:pre';
    this.toast = document.createElement('div');
    this.toast.style.cssText = 'position:absolute;text-align:center;font:800 26px system-ui;color:#ffe14d;text-shadow:0 2px 4px #000;pointer-events:none';
    container.append(this.hud, this.toast);
    this.ro = new ResizeObserver(() => this.resize(container.clientWidth, container.clientHeight)); this.ro.observe(container);
    this.resize(container.clientWidth || 800, container.clientHeight || 600);
  }

  private buildWorld(color: string) {
    const N = 120, S = HALF * 2, geo = new THREE.PlaneGeometry(S, S, N, N); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, cols: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = heightAt(x, z); pos.setY(i, Math.max(h, -CANAL.depth));
      const c = new THREE.Color(h < -3 ? 0x2a6fb0 : h < -0.1 || h > 0.1 ? 0x5cbf4a : Math.abs(z - 18) < 3 ? 0xaaaaaa : 0x7fd36a); cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); geo.computeVertexNormals();
    this.scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
    for (const b of BUILDINGS) { const m = box(b.x1 - b.x0, b.h, b.z1 - b.z0, b.color); m.position.set((b.x0 + b.x1) / 2, b.h / 2, (b.z0 + b.z1) / 2); this.scene.add(m); this.buildingMeshes.push({ mesh: m, b }); }
    for (const l of LINES) {
      const pts = l.pts.map(([x, z]) => new THREE.Vector3(x, Math.max(0, heightAt(x, z)) + 0.08, z));
      const col = l.kind === 'tram' ? 0x444444 : l.kind === 'rail' ? 0xdddddd : l.kind === 'ramp' ? 0xffaa33 : 0xfff2c0;
      this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col })));
    }
    for (let i = 0; i < 2; i++) { const leaf = box(BRIDGE.x1 - BRIDGE.x0, 0.4, (CANAL.z1 - CANAL.z0) / 2, 0xb04030); this.leaves.push(leaf); this.scene.add(leaf); }
    const coop = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(COOP.r, COOP.r, 0.15, 24), new THREE.MeshLambertMaterial({ color: 0xffe14d })); coop.add(pad);
    for (let i = 0; i < 6; i++) { const st = box(0.4, 4, 0.4, PAINT[i]); const a = (i / 6) * Math.PI * 2; st.position.set(Math.cos(a) * COOP.r, 2, Math.sin(a) * COOP.r); coop.add(st); }
    const sign = box(6, 1.2, 0.3, 0x2e9e5b); sign.position.set(0, 4.6, 0); coop.add(sign);
    coop.position.set(COOP.x, heightAt(COOP.x, COOP.z) + 0.05, COOP.z); this.scene.add(coop);
    const body = box(0.6, 1.2, 0.5, new THREE.Color(color).getHex()); body.position.y = 1.4; this.riderBike.position.y = 0.5;
    this.rider.add(body, this.riderBike); this.scene.add(this.rider, this.reticle);
  }

  setInsets(insets: Insets) { this.insetB = insets.bottom; this.resize(this.W, this.H); }

  resize(w: number, h: number) {
    this.W = Math.max(1, w); this.H = Math.max(1, h);
    this.r?.setSize(this.W, this.H, false); this.jsr?.setSize(this.W, this.H);
    this.cam.aspect = this.W / this.H;
    this.cam.setViewOffset(this.W, this.H, 0, viewOffsetY(this.insetB), this.W, this.H);
    this.cam.updateProjectionMatrix();
    const L = layout(this.W, this.H, this.insetB);
    if (this.hud) Object.assign(this.hud.style, { left: `${L.status.x}px`, top: `${L.status.y}px` });
    if (this.toast) Object.assign(this.toast.style, { left: `${L.toast.x}px`, top: `${L.toast.y}px`, width: `${L.toast.w}px` });
  }

  render(snapshot: unknown, _bike: Readonly<BikeState>, _input: Readonly<InputState>) {
    const s = snapshot as Snapshot; if (!this.r) return;
    const R = s.rider, rp = s.ragdoll ?? R;
    this.rider.position.set(rp.x, rp.y, rp.z);
    this.rider.rotation.set(s.ragdoll ? s.ragdoll.spin : 0, R.heading, 0);
    this.riderBike.visible = s.mode === 'bike';
    if (R.kind) (this.riderBike.material as THREE.MeshLambertMaterial).color.setHex(s.paint ? PAINT[s.paint % PAINT.length] : BIKE_COL[R.kind] ?? 0x3a7bd5);
    this.riderBike.rotation.z = R.flat ? Math.sin(s.t * 9) * 0.25 : 0;
    // parked bikes
    const seen = new Set<number>();
    for (const b of s.bikes) {
      seen.add(b.id); let m = this.bikes.get(b.id);
      if (!m) { m = box(0.4, 0.8, 1.8, BIKE_COL[b.kind] ?? 0x888888); this.bikes.set(b.id, m); this.scene.add(m); }
      m.position.set(b.x, heightAt(b.x, b.z) + 0.4, b.z); m.rotation.set(0, b.heading, Math.PI / 2.4);
    }
    for (const [id, m] of this.bikes) if (!seen.has(id)) { this.scene.remove(m); m.geometry.dispose(); this.bikes.delete(id); }
    while (this.npcs.length < s.npcs.length) { const m = box(0.6, 1.7, 0.5, 0xffffff); this.npcs.push(m); this.scene.add(m); }
    s.npcs.forEach((n, i) => {
      const m = this.npcs[i];
      m.position.set(n.x, n.y + (n.stunS > 0 ? 0.3 : 0.85), n.z); m.rotation.set(n.airS > 0 ? n.airS * 8 : n.stunS > 0 ? Math.PI / 2 : 0, n.heading, 0);
      (m.material as THREE.MeshLambertMaterial).color.setHex(n.flailS > 0 ? 0x332211 : 0xf2c38a);
    });
    // flames on anyone flailing (butt on fire)
    const burning = [...s.npcs.filter((n) => n.flailS > 0).map((n) => ({ id: n.id, x: n.x, y: n.y, z: n.z })), ...s.cops.filter((c) => c.flailS > 0).map((c) => ({ id: 1000 + c.id, x: c.x, y: c.y, z: c.z }))];
    this.sync('flame', burning, () => { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.6, 0.35), this.fireMat); f.position.set((i - 1) * 0.25, 0, 0); g.add(f); } return g; },
      (o, b) => { o.position.set(b.x, b.y + 1.1 + Math.abs(Math.sin(s.t * 20 + b.id)) * 0.3, b.z); o.rotation.y = s.t * 6; });
    // cops: Segway (blue + grey platform) / horse (brown body + rider)
    this.sync('cop', s.cops, (c) => {
      const g = new THREE.Group();
      const officer = box(0.6, 1.6, 0.5, 0x1d3fbf); officer.position.y = c.kind === 'horse' ? 2.4 : 1.25; g.add(officer);
      const hat = box(0.7, 0.25, 0.7, 0x0b1a5c); hat.position.y = officer.position.y + 0.9; g.add(hat);
      const light = box(0.25, 0.2, 0.25, 0xff2020); light.name = 'light'; light.position.y = hat.position.y + 0.2; g.add(light);
      if (c.kind === 'horse') { const h = box(0.9, 1.3, 2.4, 0x7a4a24); h.position.y = 1.2; g.add(h); const head = box(0.5, 0.8, 0.8, 0x7a4a24); head.position.set(0, 2, 1.4); g.add(head); }
      else { const pl = box(0.9, 0.2, 0.6, 0x555555); pl.position.y = 0.2; g.add(pl); const st = box(0.12, 1.1, 0.12, 0x888888); st.position.set(0, 0.8, 0.3); g.add(st); }
      return g;
    }, (o, c) => {
      o.position.set(c.x, c.y, c.z);
      o.rotation.set(c.airS > 0 ? c.airS * 7 : 0, c.heading, c.airS > 0 ? c.airS * 4 : 0);
      const l = o.getObjectByName('light') as THREE.Mesh | undefined;
      if (l) (l.material as THREE.MeshLambertMaterial).color.setHex(Math.floor(s.t * 6) % 2 ? 0xff2020 : 0x2050ff);
    });
    // projectiles
    this.sync('proj', s.projectiles, (p) => {
      if (p.kind === 'rocket') { const g = new THREE.Group(); const m = box(0.3, 0.3, 1.1, 0xdddddd); g.add(m); const tip = box(0.32, 0.32, 0.3, 0xff3030); tip.position.z = 0.6; g.add(tip); const fl = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.6), this.fireMat); fl.position.z = -0.8; g.add(fl); return g; }
      return box(0.35, p.kind === 'grenade' ? 0.35 : 0.6, 0.35, p.kind === 'grenade' ? 0x2e6b2e : p.kind === 'bottle' ? 0x7fe6ff : 0xff9a1f);
    }, (o, p) => {
      o.position.set(p.x, p.y + (p.landed ? 0.2 : 0), p.z);
      if (p.kind === 'rocket') o.rotation.y = Math.atan2(p.vx, p.vz); else o.rotation.set(p.age * 9, p.age * 5, 0);
      if (p.kind === 'grenade' && p.landed) o.scale.setScalar(1 + 0.3 * Math.abs(Math.sin(p.fuse * 20)));
    });
    // ground patches: oil (black), glass (sparkly), fire (flickering)
    this.sync('patch', s.patches, (p) => {
      const g = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, 0.06, 20), new THREE.MeshLambertMaterial({ color: PATCH_COL[p.kind], transparent: true, opacity: p.kind === 'glass' ? 0.55 : 0.9 }));
      g.add(disc);
      const n = p.kind === 'fire' ? 9 : p.kind === 'glass' ? 12 : 0;
      for (let i = 0; i < n; i++) {
        const a = i * 2.399, rr = p.r * Math.sqrt((i + 0.5) / n);
        const m = p.kind === 'fire' ? new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 0.5), this.fireMat) : box(0.25, 0.08, 0.15, 0xffffff);
        m.position.set(Math.cos(a) * rr, p.kind === 'fire' ? 0.5 : 0.08, Math.sin(a) * rr); m.name = 'bit'; g.add(m);
      }
      return g;
    }, (o, p) => {
      o.position.set(p.x, heightAt(p.x, p.z, s.bridge) + 0.04, p.z);
      if (p.kind === 'fire') o.children.forEach((c, i) => { if (c.name === 'bit') { c.scale.y = 0.6 + Math.abs(Math.sin(s.t * 12 + i * 1.7)) * (0.6 + Math.min(1, p.ttl / 3)); c.position.y = c.scale.y / 2; } });
      if (p.kind === 'glass') o.children.forEach((c, i) => { if (c.name === 'bit') c.visible = Math.sin(s.t * 6 + i * 2.1) > -0.3; });
    });
    // blasts: expanding fading puffs (boom = fireball + smoke ring, shatter = cyan sparkle, poof = fire bloom)
    this.sync('blast', s.blasts, (b) => {
      const g = new THREE.Group();
      const col = b.kind === 'boom' ? 0xffa020 : b.kind === 'shatter' ? 0xbff3ff : 0xff5a00;
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: col, transparent: true })); ball.name = 'ball'; g.add(ball);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.15, 4, 16), new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true })); ring.rotation.x = Math.PI / 2; ring.name = 'ring'; g.add(ring);
      return g;
    }, (o, b) => {
      const age = Math.max(0, s.t - b.at), u = Math.min(1, age / 0.6);
      o.position.set(b.x, b.y + 0.5, b.z);
      const ball = o.getObjectByName('ball') as THREE.Mesh, ring = o.getObjectByName('ring') as THREE.Mesh;
      ball.scale.setScalar(b.r * (0.3 + 0.9 * u)); (ball.material as THREE.MeshBasicMaterial).opacity = 1 - u;
      ring.scale.setScalar(b.r * (0.5 + 1.2 * Math.min(1, age / 1.2))); (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - age / 1.2);
      ball.rotation.y = age * 3;
    });
    // ammo crates
    this.sync('pickup', s.pickups.map((p, i) => ({ ...p, id: i })), (p) => { const g = new THREE.Group(); g.add(box(1.2, 1.2, 1.2, 0xc8873a)); g.add(box(1.25, 0.3, 1.25, WEAPON_COL[p.kind])); return g; },
      (o, p) => { o.visible = s.t >= p.readyAt; o.position.set(p.x, heightAt(p.x, p.z) + 0.8 + Math.sin(s.t * 2 + p.id) * 0.2, p.z); o.rotation.y = s.t; });
    // 3D lock-on reticle: spins, coloured by weapon, bobs over the target's head
    const tgt = s.lockAt;
    this.reticle.visible = !!tgt;
    if (tgt) {
      this.reticle.position.set(tgt.x, tgt.y + (tgt.cop ? 3.6 : 2.4) + Math.sin(s.t * 5) * 0.15, tgt.z); this.reticle.lookAt(this.cam.position); this.reticle.rotateZ(s.t * 3);
      (this.reticle.material as THREE.MeshBasicMaterial).color.setHex(WEAPON_COL[s.weapon] ?? 0xff3030);
      this.reticle.scale.setScalar(1 + 0.15 * Math.sin(s.t * 10));
    }

    const half = (CANAL.z1 - CANAL.z0) / 2;
    this.leaves.forEach((leaf, i) => {
      const sgn = i === 0 ? 1 : -1, hz = i === 0 ? CANAL.z0 : CANAL.z1;
      leaf.rotation.set(-sgn * s.bridge, 0, 0);
      leaf.position.set(0, Math.sin(s.bridge) * half / 2 - 0.2, hz + sgn * Math.cos(s.bridge) * half / 2);
    });
    // chase camera (pure math in camera.ts): lagged vertical follow + pull-back in the air
    const dt = this.lastT < 0 ? 1 / 30 : Math.max(0, Math.min(0.1, s.t - this.lastT));
    if (this.lastT < 0) this.camSt.y = rp.y;
    this.lastT = s.t;
    const airborne = s.mode === 'bike' ? R.air : !!s.ragdoll;
    const c = stepCam(this.camSt, { x: rp.x, y: rp.y, z: rp.z, heading: R.heading, air: airborne, airS: s.mode === 'bike' ? R.airS : 0.6, groundY: Math.max(-CANAL.depth, heightAt(rp.x, rp.z, s.bridge)), onBike: s.mode === 'bike' }, s.cam, dt);
    const want = new THREE.Vector3(...c.pos);
    this.cam.position.lerp(want, 1 - Math.exp(-8 * dt)); this.cam.lookAt(...c.look);
    if (Math.abs(this.cam.fov - c.fov) > 0.05) { this.cam.fov = c.fov; this.cam.updateProjectionMatrix(); }
    if (this.hud) this.hud.textContent = `${s.mode === 'bike' ? (R.kind ?? '') : s.mode}  ${(R.speed * 3.6).toFixed(0)} km/h${R.flat ? '  FLAT' : ''}\n` +
      `${'★'.repeat(Math.round(s.heat))}${'☆'.repeat(5 - Math.round(s.heat))}  ${s.weapon} ×${s.ammo[s.weapon]}${s.cops.length ? `  🚨${s.cops.filter((c) => c.state !== 'patrol').length}` : ''}${s.lostS > 0.5 ? `  hiding ${s.lostS.toFixed(0)}s` : ''}${s.gradePct > 0 ? `  ⛰ ${s.gradePct.toFixed(1)}%` : ''}`;
    const EV: Record<string, string> = { busted: 'BUSTED! Bike confiscated', lostCops: 'Lost them!', repaint: 'Fresh paint! Heat cleared', flat: 'FLAT TYRE! Steal another', spinOut: 'Whoa, oil!', launch: 'KABOOM!', pickup: `+${s.weapon}` };
    const ev = s.t - s.lastEventAt < 2 ? EV[s.lastEvent] : undefined;
    if (this.toast) this.toast.textContent = ev ?? (s.t - s.lastTrickAt < 1.5 ? `${s.lastTrick}! +boost` : s.mode === 'ragdoll' ? 'BAIL!' : '');
    if (this.chars) {
      const classic = s.art === 'classic';
      this.charDt = this.charT < 0 ? 1 / 30 : Math.max(0, Math.min(0.1, s.t - this.charT)); this.charT = s.t;
      this.chars.setVisible(!classic);
      if (!classic) this.chars.update(s, this.charDt, _bike?.cadence3s ?? 0, s.paint ? PAINT[s.paint % PAINT.length] : undefined);
      this.rider.visible = classic; for (const m of this.npcs) m.visible = classic; for (const m of this.bikes.values()) m.visible = classic;
      for (const o of this.pools.get('cop')?.values() ?? []) o.visible = classic;
      for (const o of this.pools.get('flame')?.values() ?? []) o.visible = true;
    }
    if (this.jsr) { this.jsr.setStyle(s.art ?? 'sliver'); this.jsr.frame(this.r, this.scene, this.cam, { x: rp.x, z: rp.z }); } else this.r.render(this.scene, this.cam);
  }

  unmount() {
    this.ro?.disconnect(); this.jsr?.dispose();
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mat = m.material as THREE.Material | undefined; if (mat && 'dispose' in mat) mat.dispose(); });
    this.r?.dispose(); this.r?.domElement.remove(); this.hud?.remove(); this.toast?.remove(); this.r = undefined;
  }
}
