// Grand Theft Pedal renderer: blocky three.js neighbourhood + DOM HUD. Reads only the sim snapshot.
import * as THREE from 'three';
import { buildWeapon, flicker, type WeaponModel } from './weapons3d';
import { Fx } from './fx';
/** Grit-pass light moods (cel only): hazy late afternoon, overcast, late dusk. */
const MOODS = [
  { hemi: 0xd6dadb, ground: 0x6b5a44, hemiI: 1.2, sun: 0xf0cc9c, sunI: 1.9, sunPos: [-90, 55, -40] as [number, number, number], fog: 0xddd2bf, fogNear: 140, fogFar: 420, top: 0x8ea3b4, mid: 0xc0c6c6, low: 0xddd2bf, dusk: 0 },
  { hemi: 0xc7cbcd, ground: 0x5e5a50, hemiI: 1.5, sun: 0xd9d6cf, sunI: 0.85, sunPos: [-30, 90, -20] as [number, number, number], fog: 0xbcbdb8, fogNear: 90, fogFar: 330, top: 0x8c949a, mid: 0xaeb2b1, low: 0xc3c1b8, dusk: 0 },
  { hemi: 0x8a90a8, ground: 0x4a3a30, hemiI: 0.95, sun: 0xff9a5a, sunI: 1.7, sunPos: [-140, 16, -60] as [number, number, number], fog: 0x9c8884, fogNear: 80, fogFar: 300, top: 0x3c4868, mid: 0x9a7a7a, low: 0xd9926a, dusk: 1 },
];
import type { BikeState, GameRenderer, InputState, Insets, Profile } from '../../../contracts';
import type { Snapshot } from '../sim/sim';
import { BRIDGE, BUILDINGS, CANAL, COOP, HALF, heightAt, LINES, nearestOnLine } from '../sim/world';
import { stepCam, type CamState } from './camera';
import { JsrSliver } from './jsr';
import { Characters } from './chars';
import { Reticle } from './reticle';
import { bakeInPlace, toonVC } from './bake';
import { buildTram, CelWorld, groundColour } from './world3d';
import { inked, toon } from './jsr';
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
  private leaves: THREE.Mesh[] = []; private reticle = new Reticle();
  private hud?: HTMLDivElement; private toast?: HTMLDivElement; private container?: HTMLElement; private ro?: ResizeObserver;
  private insetB = 0; private W = 800; private H = 600;
  private chars?: Characters; private charDt = 0; private charT = -1;
  private poster?: HTMLDivElement; private posterKey = '';
  private moodKey = ''; private mood?: (typeof MOODS)[number];
  private fx = new Fx(); private stokerMark?: THREE.Group;
  private cel?: CelWorld; private classic = new THREE.Group(); private celGround?: THREE.Mesh; private art = '';
  private hemi?: THREE.HemisphereLight; private sun?: THREE.DirectionalLight;
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
    const r = new THREE.WebGLRenderer({ antialias: true }); this.r = r; r.info.autoReset = false;
    r.setPixelRatio(Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));
    r.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    container.appendChild(r.domElement);
    this.scene.background = new THREE.Color(0x9fd8ff); this.scene.fog = new THREE.Fog(0x9fd8ff, 120, 320);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x557744, 1.6); this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(60, 100, 30); this.scene.add(sun); this.sun = sun;
    this.buildWorld(ctx.profile.color);
    this.chars = new Characters(new THREE.Color(ctx.profile.color).lerp(new THREE.Color(0x8a8070), 0.45).getHex()); this.scene.add(this.chars.group);
    this.jsr = new JsrSliver(this.scene); this.jsr.styleRider(this.rider.children.filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh));
    this.hud = document.createElement('div');
    this.hud.style.cssText = 'position:absolute;font:600 15px system-ui;color:#fff;text-shadow:0 1px 3px #000;pointer-events:none;white-space:pre';
    this.toast = document.createElement('div');
    this.toast.style.cssText = 'position:absolute;text-align:center;font:800 26px system-ui;color:#ffe14d;text-shadow:0 2px 4px #000;pointer-events:none';
    this.poster = document.createElement('div'); // wanted poster heat HUD (grit pass)
    this.poster.style.cssText = 'position:absolute;right:18px;top:64px;width:132px;padding:8px 8px 7px;background:linear-gradient(160deg,#e9dcbc,#d4c194 70%,#bfa874);color:#3a2214;font:700 11px Georgia,serif;text-align:center;box-shadow:2px 3px 0 #2a1a10,0 0 0 2px #6b4a2a inset;transform:rotate(-3deg);pointer-events:none;display:none;filter:sepia(.25) contrast(1.05)';
    container.append(this.hud, this.toast, this.poster);
    this.ro = new ResizeObserver(() => this.resize(container.clientWidth, container.clientHeight)); this.ro.observe(container);
    this.resize(container.clientWidth || 800, container.clientHeight || 600);
  }

  private buildWorld(color: string) {
    const N = HALF, S = HALF * 2, geo = new THREE.PlaneGeometry(S, S, N, N); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, cols: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      // the drawbridge deck is drawn ONLY by the leaf meshes: the static ground keeps open water under the bridge,
      // otherwise heightAt's closed deck (y=0) is coplanar with the leaf tops and z-fights / hides a leaf.
      const x = pos.getX(i), z = pos.getZ(i), inCanal = z > CANAL.z0 + 0.01 && z < CANAL.z1 - 0.01 && x > CANAL.xWest, h = inCanal ? -CANAL.depth : heightAt(x, z); pos.setY(i, Math.max(h, -CANAL.depth));
      const c = new THREE.Color(h < -3 ? 0x2a6fb0 : h < -0.1 || h > 0.1 ? 0x5cbf4a : Math.abs(z - 18) < 3 ? 0xaaaaaa : 0x7fd36a); cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); geo.computeVertexNormals();
    this.scene.add(this.classic);
    this.classic.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
    { // cel ground: same terrain, calm district colours, toon-shaded
      const cg = geo.clone(), cp = cg.attributes.position, cc: number[] = [], k = new THREE.Color();
      for (let i = 0; i < cp.count; i++) { k.setHex(groundColour(cp.getX(i), cp.getZ(i), cp.getY(i))); cc.push(k.r, k.g, k.b); }
      cg.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
      this.celGround = new THREE.Mesh(cg, toonVC()); this.scene.add(this.celGround);
    }
    for (const b of BUILDINGS) { const y0 = Math.min(0, heightAt(b.x0, b.z0), heightAt(b.x1, b.z1)); const m = box(b.x1 - b.x0, b.h, b.z1 - b.z0, b.color); m.position.set((b.x0 + b.x1) / 2, y0 + b.h / 2, (b.z0 + b.z1) / 2); this.classic.add(m); this.buildingMeshes.push({ mesh: m, b }); }
    this.cel = new CelWorld(); this.scene.add(this.cel.group); this.scene.add(this.fx.group);
    { // all nav lines in one LineSegments draw
      const pos: number[] = [], col: number[] = [], c = new THREE.Color();
      for (const l of LINES) {
        c.set(l.kind === 'tram' ? 0x444444 : l.kind === 'rail' ? 0xdddddd : l.kind === 'ramp' ? 0xffaa33 : 0xfff2c0);
        for (let i = 0; i < l.pts.length - 1; i++) for (const [x, z] of [l.pts[i], l.pts[i + 1]]) { pos.push(x, Math.max(0, heightAt(x, z)) + 0.08, z); col.push(c.r, c.g, c.b); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      this.classic.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true })));
    }
    for (let i = 0; i < 2; i++) { const leaf = inked(new THREE.Mesh(new THREE.BoxGeometry(BRIDGE.x1 - BRIDGE.x0, 0.4, (CANAL.z1 - CANAL.z0) / 2), toon(0x8a5a44)), 0.05); this.leaves.push(leaf); this.scene.add(leaf); }
    const coop = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(COOP.r, COOP.r, 0.15, 24), toon(0xd3bf98)); coop.add(pad);
    for (let i = 0; i < 6; i++) { const st = box(0.4, 4, 0.4, PAINT[i]); const a = (i / 6) * Math.PI * 2; st.position.set(Math.cos(a) * COOP.r, 2, Math.sin(a) * COOP.r); coop.add(st); }
    const sign = box(6, 1.2, 0.3, 0x3f6b45); sign.position.set(0, 4.6, 0); coop.add(sign);
    coop.position.set(COOP.x, heightAt(COOP.x, COOP.z) + 0.05, COOP.z); this.scene.add(coop); bakeInPlace(coop);
    const body = box(0.6, 1.2, 0.5, new THREE.Color(color).getHex()); body.position.y = 1.4; this.riderBike.position.y = 0.5;
    this.rider.add(body, this.riderBike); this.scene.add(this.rider, this.reticle.group);
  }

  private lockMesh?: THREE.InstancedMesh; private lockRing?: THREE.Mesh;
  /** Steering-lock indicator: cream chevrons down the locked line ahead, or a ring + bobbing chevron on the locked target. */
  private lockMarks(s: Snapshot) {
    if (!this.lockMesh) {
      const sh = new THREE.Shape(); sh.moveTo(-0.7, -0.35); sh.lineTo(0, 0.35); sh.lineTo(0.7, -0.35); sh.lineTo(0.7, -0.05); sh.lineTo(0, 0.65); sh.lineTo(-0.7, -0.05); sh.closePath();
      const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI);
      this.lockMesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xf1e8d4, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }), 10);
      this.lockMesh.frustumCulled = false; this.lockMesh.renderOrder = 2; this.scene.add(this.lockMesh);
      this.lockRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.2, 24), new THREE.MeshBasicMaterial({ color: 0xf1e8d4, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
      this.lockRing.rotation.x = -Math.PI / 2; this.scene.add(this.lockRing);
    }
    const im = this.lockMesh, M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
    let n = 0; this.lockRing!.visible = false;
    const L0 = s.steerLock;
    const put = (x: number, y: number, z: number, h: number, sc: number) => { Q.setFromAxisAngle(Y, h); M.compose(new THREE.Vector3(x, y, z), Q, new THREE.Vector3(sc, sc, sc)); im.setMatrixAt(n++, M); };
    if (L0?.kind === 'line' && LINES[L0.id] && s.mode === 'bike') {
      const l = LINES[L0.id], R = s.rider, pts = l.pts;
      const near = nearestOnLine(l, R.x, R.z);
      const fwd = Math.cos(near.heading - R.heading) >= 0 ? 1 : -1;
      let i = near.seg, px = near.px, pz = near.pz, travelled = 0, nextAt = 3 + ((s.t * 6) % 3);
      while (n < 10 && i >= 0 && i < pts.length - 1) {
        const [tx, tz] = fwd > 0 ? pts[i + 1] : pts[i], dx = tx - px, dz = tz - pz, seg = Math.hypot(dx, dz);
        if (travelled + seg >= nextAt) { const u = (nextAt - travelled) / seg; const x = px + dx * u, z = pz + dz * u; put(x, Math.max(heightAt(x, z, s.bridge), -1) + 0.12, z, Math.atan2(dx, dz), 1); nextAt += 3; continue; }
        travelled += seg; px = tx; pz = tz; i += fwd;
      }
    } else if (L0 && L0.x !== undefined && L0.z !== undefined) {
      const y = heightAt(L0.x, L0.z, s.bridge);
      this.lockRing!.visible = true; this.lockRing!.position.set(L0.x, y + 0.08, L0.z); this.lockRing!.scale.setScalar(1 + 0.1 * Math.sin(s.t * 6));
      Q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2); const q2 = new THREE.Quaternion().setFromAxisAngle(Y, s.t * 2); q2.multiply(Q);
      M.compose(new THREE.Vector3(L0.x, y + 2.9 + Math.sin(s.t * 4) * 0.15, L0.z), q2, new THREE.Vector3(0.8, 0.8, 0.8)); im.setMatrixAt(n++, M);
    }
    im.count = n; im.instanceMatrix.needsUpdate = true;
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
    this.sync('proj', s.projectiles, (p) => { // the same models you hold: rocket (with exhaust), bottle, lit molotov, pin-less grenade
      const w = buildWeapon(p.kind === 'rocket' ? 'rocket' : p.kind); if (w.pin) w.pin.visible = false;
      const g = new THREE.Group(); w.root.scale.setScalar(p.kind === 'rocket' ? 1.6 : 2.2); g.add(w.root); g.userData.w = w; return g;
    }, (o, p) => {
      const w = o.userData.w as WeaponModel;
      o.position.set(p.x, p.y + (p.landed ? 0.15 : 0), p.z);
      if (p.kind === 'rocket') { o.rotation.set(-Math.atan2(p.vy, Math.hypot(p.vx, p.vz)), Math.atan2(p.vx, p.vz), 0, 'YXZ'); flicker(w, s.t); }
      else if (p.landed) o.rotation.set(Math.PI / 2, 0, 0);
      else { o.rotation.set(p.age * 11, Math.atan2(p.vx, p.vz), 0, 'YXZ'); flicker(w, s.t + p.id, p.kind === 'molotov'); }
      if (p.kind === 'grenade' && p.landed) o.scale.setScalar(1 + 0.25 * Math.abs(Math.sin(p.fuse * 20)));
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
    // lock-on reticle (render/reticle.ts): billboarded brackets, on top of everything; updated after the camera moves
    const tgt = s.lockAt;
    const lockPt = tgt ? new THREE.Vector3(tgt.x, tgt.y + (tgt.cop ? 1.5 : 0.95), tgt.z) : null;
    const lockSize = tgt?.cop ? 2.6 : 1.9;
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
    if (s.t - (s.jackCamT ?? -99) < 3 && s.mode === 'bike') { // just jacked a bike: rise & pull back so the tumbling, fist-shaking victim stays in shot
      const k = Math.sin(Math.min(1, (s.t - s.jackCamT) / 3) * Math.PI);
      want.x -= Math.sin(R.heading) * 4 * k; want.z -= Math.cos(R.heading) * 4 * k; want.y += 3 * k;
    }
    this.cam.position.sub(this.fx.shake);
    this.cam.position.lerp(want, 1 - Math.exp(-8 * dt)); this.cam.lookAt(...c.look);
    if (Math.abs(this.cam.fov - c.fov) > 0.05) { this.cam.fov = c.fov; this.cam.updateProjectionMatrix(); }
    if (this.hud) this.hud.textContent = `${s.mode === 'bike' ? (R.kind ?? '') : s.mode}  ${(R.speed * 3.6).toFixed(0)} km/h${R.flat ? '  FLAT' : ''}\n` +
      (s.steerLock ? `🔒 ${s.steerLock.kind === 'line' ? `${LINES[s.steerLock.id]?.kind ?? 'line'} line` : s.steerLock.kind === 'npc' ? (s.npcs.find((n) => n.id === s.steerLock!.id)?.bike ? 'cyclist' : 'person') : 'bike'}  ◀ ▶ next · paddle = free\n` : '') +
      `${s.art === 'classic' ? `${'★'.repeat(Math.round(s.heat))}${'☆'.repeat(5 - Math.round(s.heat))}  ` : ''}${s.weapon} ×${s.ammo[s.weapon]}${s.cops.length ? `  🚨${s.cops.filter((c) => c.state !== 'patrol').length}` : ''}${s.lostS > 0.5 ? `  hiding ${s.lostS.toFixed(0)}s` : ''}${s.gradePct > 0 ? `  ⛰ ${s.gradePct.toFixed(1)}%` : ''}`;
    const EV: Record<string, string> = { scream: 'AAAAAAH!', stoker: 'STOKER ACQUIRED! Pedal, hostage!', bikejack: 'BIKE-JACKED!', cyclistKnocked: 'Sorry!', hitch: 'Hitching!', tramHit: 'TRAM!', busted: 'BUSTED! Bike confiscated', lostCops: 'Lost them!', repaint: 'Fresh paint! Heat cleared', flat: 'FLAT TYRE! Steal another', spinOut: 'Whoa, oil!', launch: 'KABOOM!', pickup: `+${s.weapon}` };
    const ev = s.t - s.lastEventAt < 2 ? EV[s.lastEvent] : undefined;
    (globalThis as { __gtpInfo?: unknown }).__gtpInfo = { calls: this.r.info.render.calls, triangles: this.r.info.render.triangles, geometries: this.r.info.memory.geometries };
    if (this.toast) this.toast.textContent = ev ?? (s.t - s.lastTrickAt < 1.5 ? `${s.lastTrick}! +boost` : s.mode === 'ragdoll' ? 'BAIL!' : s.jackId >= 0 ? 'Ⓐ JACK THAT BIKE!' : s.stokerAt?.near ? 'Ⓐ GRAB THEM!' : s.goal || '');
    if (this.toast) { const isGoal = !!s.goal && this.toast.textContent === s.goal; this.toast.style.whiteSpace = isGoal ? 'nowrap' : ''; this.toast.style.fontSize = isGoal ? '20px' : ''; }
    if (this.poster) {
      const stars = Math.round(s.heat), show = s.art !== 'classic' && s.heat > 0.05;
      const key = `${show}:${stars}:${s.cops.length > 0}`;
      if (key !== this.posterKey) {
        this.posterKey = key; this.poster.style.display = show ? 'block' : 'none';
        this.poster.innerHTML = `<div style="font:900 22px Georgia,serif;letter-spacing:2px;border-bottom:2px solid #3a2214;margin-bottom:3px">WANTED</div>` +
          `<div style="font-size:9px;letter-spacing:1px">FOR CRIMES AGAINST CYCLING</div>` +
          `<div style="font-size:20px;color:#8a1c12;margin:3px 0;text-shadow:1px 1px 0 #2a1a10">${'★'.repeat(stars)}<span style="color:#a89468">${'★'.repeat(5 - stars)}</span></div>` +
          `<div style="font-size:9px">${s.cops.length ? 'APPROACH WITH CAUTION' : 'REWARD: 1 BIKE LIGHT'}</div>`;
      }
      if (show && stars >= 3) this.poster.style.transform = `rotate(${-3 + Math.sin(s.t * 18) * 1.2}deg)`; else if (show) this.poster.style.transform = 'rotate(-3deg)';
    }
    this.lockMarks(s);
    { // bouncing arrow over the nearest bystander you could snatch onto the tandem
      if (!this.stokerMark) { const g = new THREE.Group(), cone = new THREE.ConeGeometry(0.32, 0.7, 4); cone.rotateX(Math.PI); const m = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ color: 0xf2a541, depthTest: false })); m.renderOrder = 20; const ink = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ color: 0x2b1d14, side: THREE.BackSide, depthTest: false })); ink.scale.setScalar(1.18); ink.renderOrder = 19; g.add(ink, m); this.stokerMark = g; this.scene.add(g); }
      const st = s.stokerAt; this.stokerMark.visible = !!st;
      if (st) { this.stokerMark.position.set(st.x, heightAt(st.x, st.z, s.bridge) + 2.5 + Math.abs(Math.sin(s.t * 4)) * 0.35, st.z); this.stokerMark.rotation.y = s.t * 2; this.stokerMark.scale.setScalar(st.near ? 1.3 : 1); }
    }
    this.reticle.update(this.cam, lockPt, lockSize, s.weapon, s.t, Math.max(1 / 60, this.charT < 0 ? 1 / 30 : s.t - this.charT));
    if (this.chars) {
      const classic = s.art === 'classic';
      this.charDt = this.charT < 0 ? 1 / 30 : Math.max(0, Math.min(0.1, s.t - this.charT)); this.charT = s.t;
      this.chars.setVisible(!classic);
      if (!classic) this.chars.update(s, this.charDt, _bike?.cadence3s ?? 0, s.paint ? PAINT[s.paint % PAINT.length] : undefined);
      this.rider.visible = classic; for (const m of this.npcs) m.visible = classic; for (const m of this.bikes.values()) m.visible = classic;
      for (const o of this.pools.get('cop')?.values() ?? []) o.visible = classic;
      for (const o of this.pools.get('flame')?.values() ?? []) o.visible = true;
    }
    // trams (cel models; classic gets them too so the debug view still shows what can hit you)
    this.sync('tram', s.trams ?? [], () => buildTram(), (o, t) => {
      const h = heightAt(t.x, t.z), sl = (heightAt(t.x + 3, t.z) - heightAt(t.x - 3, t.z)) / 6;
      o.position.set(t.x, h, t.z); o.rotation.set(0, t.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0); o.rotateX(-Math.atan(sl * t.dir));
    });
    const art = s.art === 'classic' ? 'classic' : 'cel';
    const moodKey = `${art}:${s.look?.mood ?? 0}`;
    if (moodKey !== this.moodKey) { this.moodKey = moodKey; this.art = ''; }
    if (art !== this.art) {
      this.art = art; const cel = art === 'cel';
      this.classic.visible = !cel; if (this.cel) this.cel.group.visible = cel; if (this.celGround) this.celGround.visible = cel;
      // warm late-afternoon light + haze for the cel city; flat daylight for classic
      this.hemi?.color.setHex(cel ? 0xdfe6ea : 0xffffff); this.hemi?.groundColor.setHex(cel ? 0x6b5a40 : 0x557744); if (this.hemi) this.hemi.intensity = cel ? 1.25 : 1.6;
      this.sun?.color.setHex(cel ? 0xffd6a0 : 0xffffff); this.sun?.position.set(cel ? -90 : 60, cel ? 55 : 100, cel ? -40 : 30); if (this.sun) this.sun.intensity = cel ? 2.1 : 1.6;
      if (this.scene.fog instanceof THREE.Fog) { this.scene.fog.near = cel ? 150 : 120; this.scene.fog.far = cel ? 430 : 320; }
      (this.scene.background as THREE.Color).setHex(cel ? 0xeee3cf : 0x9fd8ff);
      if (cel) { // grit pass moods
        const M = MOODS[s.look?.mood ?? 0] ?? MOODS[0];
        this.hemi?.color.setHex(M.hemi); this.hemi?.groundColor.setHex(M.ground); if (this.hemi) this.hemi.intensity = M.hemiI;
        this.sun?.color.setHex(M.sun); this.sun?.position.set(...M.sunPos); if (this.sun) this.sun.intensity = M.sunI;
        if (this.scene.fog instanceof THREE.Fog) { this.scene.fog.near = M.fogNear; this.scene.fog.far = M.fogFar; }
        (this.scene.background as THREE.Color).setHex(M.fog); this.mood = M;
      }
    }
    if (this.mood) this.jsr?.setLook({ top: this.mood.top, mid: this.mood.mid, low: this.mood.low, fog: this.mood.fog, grit: s.look?.grit ?? 1, dusk: this.mood.dusk, t: s.t });
    this.cel?.update(s.t);
    this.fx.frame(s, this.cam); this.cam.position.add(this.fx.shake); if (this.chars) this.chars.squash = this.fx.squash;
    const ov = (globalThis as { __gtpCam?: { pos: [number, number, number]; look: [number, number, number]; fov?: number } }).__gtpCam;
    if (ov && this.scene.fog instanceof THREE.Fog) { this.scene.fog.near = 500; this.scene.fog.far = 1600; }
    if (ov) { this.cam.position.set(...ov.pos); this.cam.lookAt(...ov.look); this.cam.fov = ov.fov ?? 60; this.cam.updateProjectionMatrix(); } // capture/debug only
    this.r.info.reset();
    if (this.jsr) { this.jsr.setStyle(art); this.jsr.frame(this.r, this.scene, this.cam, { x: rp.x, z: rp.z }); } else this.r.render(this.scene, this.cam);
  }

  unmount() {
    this.ro?.disconnect(); this.jsr?.dispose();
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mat = m.material as THREE.Material | undefined; if (mat && 'dispose' in mat) mat.dispose(); });
    this.r?.dispose(); this.r?.domElement.remove(); this.hud?.remove(); this.toast?.remove(); this.poster?.remove(); this.r = undefined;
  }
}
