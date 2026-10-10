// Grand Theft Pedal renderer: blocky three.js neighbourhood + DOM HUD. Reads only the sim snapshot.
import * as THREE from 'three';
import type { BikeState, GameRenderer, InputState, Insets, Profile } from '../../../contracts';
import type { Snapshot } from '../sim/sim';
import { BRIDGE, BUILDINGS, CANAL, HALF, heightAt, LINES } from '../sim/world';
import { layout, viewOffsetY } from './layout';

const BIKE_COL: Record<string, number> = { city: 0x3a7bd5, fixie: 0xff4f7b, bmx: 0xffb000, cargo: 0x2e9e5b, tandem: 0x9b59b6, ebike: 0x00d0d0 };
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
    for (const b of BUILDINGS) { const m = box(b.x1 - b.x0, b.h, b.z1 - b.z0, b.color); m.position.set((b.x0 + b.x1) / 2, b.h / 2, (b.z0 + b.z1) / 2); this.scene.add(m); }
    for (const l of LINES) {
      const pts = l.pts.map(([x, z]) => new THREE.Vector3(x, Math.max(0, heightAt(x, z)) + 0.08, z));
      const col = l.kind === 'tram' ? 0x444444 : l.kind === 'rail' ? 0xdddddd : l.kind === 'ramp' ? 0xffaa33 : 0xfff2c0;
      this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col })));
    }
    for (let i = 0; i < 2; i++) { const leaf = box(BRIDGE.x1 - BRIDGE.x0, 0.4, (CANAL.z1 - CANAL.z0) / 2, 0xb04030); this.leaves.push(leaf); this.scene.add(leaf); }
    const body = box(0.6, 1.2, 0.5, new THREE.Color(color).getHex()); body.position.y = 1.4; this.riderBike.position.y = 0.5;
    this.rider.add(body, this.riderBike); this.scene.add(this.rider, this.reticle);
  }

  setInsets(insets: Insets) { this.insetB = insets.bottom; this.resize(this.W, this.H); }

  resize(w: number, h: number) {
    this.W = Math.max(1, w); this.H = Math.max(1, h);
    this.r?.setSize(this.W, this.H, false);
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
    if (R.kind) (this.riderBike.material as THREE.MeshLambertMaterial).color.setHex(BIKE_COL[R.kind] ?? 0x3a7bd5);
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
      const m = this.npcs[i]; m.position.set(n.x, n.y + 0.85, n.z); m.rotation.set(n.airS > 0 ? n.airS * 8 : 0, n.heading, 0);
      (m.material as THREE.MeshLambertMaterial).color.setHex(n.cop ? 0x1d3fbf : 0xf2c38a);
    });
    const tgt = s.lock >= 0 ? s.npcs[s.lock] : undefined;
    this.reticle.visible = !!tgt;
    if (tgt) { this.reticle.position.set(tgt.x, tgt.y + 2.4, tgt.z); this.reticle.lookAt(this.cam.position); }
    const half = (CANAL.z1 - CANAL.z0) / 2;
    this.leaves.forEach((leaf, i) => {
      const sgn = i === 0 ? 1 : -1, hz = i === 0 ? CANAL.z0 : CANAL.z1;
      leaf.rotation.set(-sgn * s.bridge, 0, 0);
      leaf.position.set(0, Math.sin(s.bridge) * half / 2 - 0.2, hz + sgn * Math.cos(s.bridge) * half / 2);
    });
    // chase camera
    const back = s.mode === 'bike' ? 9 : 6, fx = Math.sin(R.heading), fz = Math.cos(R.heading);
    const want = new THREE.Vector3(rp.x - fx * back, Math.max(rp.y, 0) + 4.5, rp.z - fz * back);
    this.cam.position.lerp(want, 0.12); this.cam.lookAt(rp.x + fx * 4, rp.y + 1.2, rp.z + fz * 4);
    if (this.hud) this.hud.textContent = `${s.mode === 'bike' ? (R.kind ?? '') : s.mode}  ${(R.speed * 3.6).toFixed(0)} km/h${R.flat ? '  FLAT' : ''}\n` +
      `${'★'.repeat(Math.round(s.heat))}${'☆'.repeat(5 - Math.round(s.heat))}  ${s.weapon}${s.gradePct > 0 ? `  ⛰ ${s.gradePct.toFixed(1)}%` : ''}`;
    if (this.toast) this.toast.textContent = s.t - s.lastTrickAt < 1.5 ? `${s.lastTrick}! +boost` : s.mode === 'ragdoll' ? 'BAIL!' : '';
    this.r.render(this.scene, this.cam);
  }

  unmount() {
    this.ro?.disconnect();
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mat = m.material as THREE.Material | undefined; if (mat && 'dispose' in mat) mat.dispose(); });
    this.r?.dispose(); this.r?.domElement.remove(); this.hud?.remove(); this.toast?.remove(); this.r = undefined;
  }
}
