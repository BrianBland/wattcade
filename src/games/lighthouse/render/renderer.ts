import * as THREE from 'three';
import type { BikeState, GameRenderer, InputState, Profile } from '../../../contracts';

interface Snap {
  t: number; fog: number; chop: number; lamp: number; zone: number; requirement: number; inZone: boolean; day: number;
  ships: Array<{ id: number; progress: number; lane: number; state: string }>;
  buildings: Array<string | null>; cursor: { plot: number; building: string; canBuild: boolean };
  options: Array<{ type: string; cost: { coin: number; timber: number }; effect: string; owned: number; max: number; selected: boolean; reason: string | null }>;
  feedback: { text: string; ok: boolean; age: number };
  coin: number; timber: number;
  storm: { phase: string; timeInPhase: number; warnS: number; duration: number; integrity: number; surge: boolean };
}

const PLOT_COUNT = 14;
const plotPos = (i: number) => { const a = (i / (PLOT_COUNT - 1)) * Math.PI * 0.8 - Math.PI * 0.1; return new THREE.Vector3(8 + Math.cos(a) * 5 + (i % 2) * 1.2, 1.2, 6 - Math.sin(a) * 12); };

export class LighthouseRenderer implements GameRenderer {
  private renderer?: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 800);
  private sea?: THREE.Mesh;
  private seaBase?: Float32Array;
  private beam?: THREE.Group;
  private lampLight?: THREE.PointLight;
  private sun = new THREE.DirectionalLight(0xffffff, 1);
  private amb = new THREE.AmbientLight(0x8899aa, 0.6);
  private shipMeshes = new Map<number, THREE.Group>();
  private plotMeshes: Array<THREE.Object3D | null> = Array(PLOT_COUNT).fill(null);
  private plotKinds: Array<string | null> = Array(PLOT_COUNT).fill(null);
  private cursor?: THREE.Mesh;
  private clouds?: THREE.Mesh;
  private hud?: HTMLDivElement;
  private container?: HTMLElement;
  private color = '#ffcc33';
  private ro?: ResizeObserver;
  private pillar?: THREE.Mesh;

  mount(container: HTMLElement, ctx: { profile: Readonly<Profile> }) {
    this.container = container;
    this.color = ctx.profile.color;
    const r = new THREE.WebGLRenderer({ antialias: true });
    r.setClearColor(0x9fc4e8);
    r.setPixelRatio(Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));
    r.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    container.appendChild(r.domElement);
    this.renderer = r;
    const s = this.scene;
    s.fog = new THREE.FogExp2(0x8899aa, 0.01);
    this.sun.position.set(-30, 40, 20);
    s.add(this.sun, this.amb);

    // sea
    const g = new THREE.PlaneGeometry(500, 500, 96, 96); g.rotateX(-Math.PI / 2);
    this.seaBase = new Float32Array(g.attributes.position.array as ArrayLike<number> as number[]);
    this.sea = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x1d5f8a, flatShading: true }));
    s.add(this.sea);

    // cliff + lighthouse
    const cliff = new THREE.Mesh(new THREE.ConeGeometry(14, 14, 7), new THREE.MeshLambertMaterial({ color: 0x6b6258, flatShading: true }));
    cliff.position.set(-6, 4, 0); s.add(cliff);
    const shore = new THREE.Mesh(new THREE.BoxGeometry(22, 2.4, 40), new THREE.MeshLambertMaterial({ color: 0x8a7b5a, flatShading: true }));
    shore.position.set(13, 0, 6); s.add(shore);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 10, 10), new THREE.MeshLambertMaterial({ color: 0xf2efe6 }));
    tower.position.set(-6, 16, 0); s.add(tower);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 2, 10), new THREE.MeshLambertMaterial({ color: new THREE.Color(this.color) }));
    stripe.position.set(-6, 15, 0); s.add(stripe);
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.6, 8), new THREE.MeshBasicMaterial({ color: 0xffe9a0 }));
    lantern.position.set(-6, 21.6, 0); s.add(lantern);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.6, 8), new THREE.MeshLambertMaterial({ color: 0x3a3f4a }));
    roof.position.set(-6, 23.2, 0); s.add(roof);
    this.lampLight = new THREE.PointLight(0xffe9a0, 2, 80); this.lampLight.position.set(-6, 21.6, 0); s.add(this.lampLight);
    this.beam = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(4, 60, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    cone.rotation.z = Math.PI / 2; cone.position.x = 30;
    this.beam.add(cone); this.beam.position.set(-6, 21.6, 0); s.add(this.beam);

    // plots marker
    this.cursor = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.7, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    this.cursor.rotation.x = -Math.PI / 2; s.add(this.cursor);
    this.pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
    s.add(this.pillar);
    for (let i = 0; i < PLOT_COUNT; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 1.6), new THREE.MeshLambertMaterial({ color: 0x5c6b3c }));
      m.position.copy(plotPos(i)); m.position.y = 1.25; s.add(m);
    }

    // storm clouds
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(120, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x20242c, side: THREE.BackSide, transparent: true, opacity: 0 }));
    s.add(this.clouds);

    // Framing for a 4:3 view: lighthouse left, town right, open sea (ship lanes) across the foreground.
    this.camera.position.set(-6, 32, 78); this.camera.lookAt(-6, 8, 14);

    const hud = document.createElement('div');
    hud.style.cssText = 'position:absolute;left:12px;top:12px;color:#fff;font:600 16px system-ui;text-shadow:0 1px 3px #000;pointer-events:none;white-space:pre';
    container.appendChild(hud); this.hud = hud;
    this.resize(container.clientWidth || 800, container.clientHeight || 600);
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize(container.clientWidth || 800, container.clientHeight || 600));
      this.ro.observe(container);
    }
  }

  private makeBuilding(kind: string): THREE.Object3D {
    const grp = new THREE.Group();
    const mat = (c: number) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    if (kind === 'cottage') {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 1.4), mat(0xd9c9a3)); b.position.y = 0.5;
      const r = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.9, 4), mat(0xb5532f)); r.position.y = 1.45; r.rotation.y = Math.PI / 4;
      grp.add(b, r);
    } else if (kind === 'pier') {
      const p = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 1), mat(0x8b6b3e)); p.position.set(-2.5, -0.2, 0); grp.add(p);
    } else if (kind === 'market') {
      const b = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 1.6), mat(0xe0b44c)); b.position.y = 0.4;
      const r = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.15, 1.9), mat(0xc0392b)); r.position.y = 1.2; grp.add(b, r);
    } else if (kind === 'bell') {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6, 6), mat(0x555555)); p.position.y = 0.8;
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.7, 8), mat(0xd4af37)); b.position.y = 1.6; grp.add(p, b);
    } else {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 3, 8), mat(0xf2efe6)); p.position.y = 1.5;
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9a0 })); l.position.y = 3.3; grp.add(p, l);
    }
    return grp;
  }

  private makeShip(): THREE.Group {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 1.2), new THREE.MeshLambertMaterial({ color: 0x7a4a2a, flatShading: true }));
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 0.9), new THREE.MeshLambertMaterial({ color: 0xeeeeee }));
    cab.position.set(-0.6, 0.8, 0);
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.06), new THREE.MeshLambertMaterial({ color: 0xf4efe0 }));
    mast.position.set(0.6, 1.2, 0);
    g.add(hull, cab, mast); return g;
  }

  render(snapshot: unknown, bike: Readonly<BikeState>, _input: Readonly<InputState>) {
    const s = snapshot as Snap;
    if (!this.renderer || !s || s.fog === undefined) return;
    const waveAmp = 0.15 + s.chop * 1.8;
    // sea
    const pos = (this.sea!.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = this.seaBase![i * 3], z = this.seaBase![i * 3 + 2];
      pos.setY(i, Math.sin(x * 0.18 + s.t * 1.4) * waveAmp * 0.6 + Math.cos(z * 0.23 + s.t * 1.1) * waveAmp * 0.4);
    }
    pos.needsUpdate = true; this.sea!.geometry.computeVertexNormals();

    // fog + day/night + storm
    const night = 0.5 - 0.5 * Math.cos(s.day * Math.PI * 2); // 0 at day=0..; peaks at 0.5
    const dark = Math.max(night * 0.8, s.storm.phase === 'storm' ? 0.7 : s.storm.phase === 'warning' ? 0.4 : 0);
    const sky = new THREE.Color(0x9fc4e8).lerp(new THREE.Color(0x0b1226), dark);
    this.scene.background = sky;
    (this.scene.fog as THREE.FogExp2).color.copy(sky);
    (this.scene.fog as THREE.FogExp2).density = 0.004 + s.fog * 0.03;
    this.sun.intensity = 1.1 * (1 - dark); this.amb.intensity = 0.25 + 0.5 * (1 - dark);
    (this.clouds!.material as THREE.MeshBasicMaterial).opacity = s.storm.phase === 'calm' ? 0 : s.storm.phase === 'warning' ? 0.35 : 0.65;

    // lamp
    this.beam!.rotation.y = s.t * (1.2 + s.lamp);
    this.lampLight!.intensity = 0.3 + s.lamp * 4;
    this.beam!.children.forEach((c) => ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.05 + 0.3 * s.lamp);

    // buildings
    for (let i = 0; i < PLOT_COUNT; i++) {
      const k = s.buildings[i];
      if (k !== this.plotKinds[i]) {
        const old = this.plotMeshes[i]; if (old) this.scene.remove(old);
        this.plotMeshes[i] = null; this.plotKinds[i] = k;
        if (k) { const m = this.makeBuilding(k); m.position.copy(plotPos(i)); m.position.y += 0.05; this.scene.add(m); this.plotMeshes[i] = m; }
      }
    }
    const cp = plotPos(s.cursor.plot); this.cursor!.position.set(cp.x, 1.4, cp.z);
    const cc = s.cursor.canBuild ? 0x66ff88 : 0xff6666;
    (this.cursor!.material as THREE.MeshBasicMaterial).color.set(cc);
    const pulse = 1 + Math.sin(s.t * 6) * 0.12; this.cursor!.scale.set(pulse, pulse, pulse);
    this.pillar!.position.set(cp.x, 4.4, cp.z); (this.pillar!.material as THREE.MeshBasicMaterial).color.set(cc);

    // ships: sail from far sea toward harbour (x≈8..)
    const live = new Set<number>();
    for (const sh of s.ships) {
      live.add(sh.id);
      let m = this.shipMeshes.get(sh.id);
      if (!m) { m = this.makeShip(); this.scene.add(m); this.shipMeshes.set(sh.id, m); }
      // lanes run in front of the shore; ships come from the open sea on the left and head for the harbour at x~12
      const x = -28 + sh.progress * 40;
      const z = 28 + sh.lane * 8 - sh.progress * 3;
      m.position.set(x, 0.3 + Math.sin(s.t * 1.5 + sh.id) * waveAmp * 0.4, z);
      m.rotation.y = sh.state === 'lost' ? s.t * 0.5 : 0;
      m.rotation.z = Math.sin(s.t * 1.3 + sh.id) * (0.05 + s.chop * 0.3);
      m.visible = true;
    }
    for (const [id, m] of this.shipMeshes) if (!live.has(id)) { this.scene.remove(m); this.shipMeshes.delete(id); }

    // HUD
    const st = s.storm;
    const lines = [`Lamp ${(s.lamp * 100) | 0}%  Fog ${(s.fog * 100) | 0}%  Chop ${(s.chop * 100) | 0}%   Coin ${s.coin | 0}  Timber ${s.timber | 0}`];
    if (st.phase === 'warning') lines.push(`STORM INCOMING in ${Math.ceil(st.warnS - st.timeInPhase)}s - get ready to push`);
    if (st.phase === 'storm') lines.push(`STORM ${Math.ceil(st.duration - st.timeInPhase)}s left  lamp integrity ${(st.integrity * 100) | 0}%`);
    lines.push('', `BUILD on plot ${s.cursor.plot + 1} (up/down to choose, A to build):`);
    for (const o of s.options) {
      const mark = o.selected ? '>' : ' ';
      lines.push(`${mark} ${o.type} ${o.cost.coin}c/${o.cost.timber}t  [${o.owned}/${o.max}] ${o.effect}${o.reason ? '  X ' + o.reason : '  OK'}`);
    }
    if (s.feedback.age < 4) lines.push('', s.feedback.text);
    this.hud!.textContent = lines.join('\n');
    this.hud!.style.color = '#fff';
    this.renderer.render(this.scene, this.camera);
  }

  resize(w: number, h: number) {
    this.renderer?.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  unmount() {
    this.ro?.disconnect();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.hud?.remove();
    this.shipMeshes.clear();
  }
}
