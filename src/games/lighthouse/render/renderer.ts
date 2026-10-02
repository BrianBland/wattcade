// Keeper's Light renderer: low-poly island in three.js, plus a DOM HUD. Reads only the sim snapshot.
import * as THREE from 'three';
import type { BikeState, GameRenderer, InputState, Profile } from '../../../contracts';
import { play, setAmbient, stopAmbient, type SfxName } from '../../../audio/sfx';
import { HARBOUR, LIGHTHOUSE, MOORING, PIER_LEN, PLOTS, PLOT_COUNT, plotHeight } from '../sim/layout';
import { LAMP, WIN, makeBuilding, makeShip, type BuildingModel, type ShipModel } from './buildings';
import { Hud } from './hud';
import { Life } from './life';
import { createSea, waveHeight, type Sea } from './sea';
import { Sky } from './sky';
import type { ShipView, Snap } from './snap';
import { disposeShared, lam } from './util';
import { createLighthouse, createScenery, createTerrain, REEFS, type Lighthouse, type Terrain } from './world';

const CUE_GAP: Partial<Record<SfxName, number>> = { select: 0.05, thunder: 0.8, bell: 2, chime: 1 };
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const ease = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

function bezier(p: THREE.Vector3[], t: number, out: THREE.Vector3) {
  const u = 1 - t;
  out.set(0, 0, 0)
    .addScaledVector(p[0], u * u * u).addScaledVector(p[1], 3 * u * u * t)
    .addScaledVector(p[2], 3 * u * t * t).addScaledVector(p[3], t * t * t);
  return out;
}

interface ShipObj { m: ShipModel; kind: string; crates?: THREE.Group }

export class LighthouseRenderer implements GameRenderer {
  private renderer?: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 4 / 3, 0.5, 1400);
  private camPos = V(0, 40, 80); private camTgt = V(0, 2, 4);
  private sun = new THREE.DirectionalLight(0xffffff, 2.6);
  private hemi = new THREE.HemisphereLight(0xcfe9f7, 0x4a5a3a, 1.4);
  private lampLight = new THREE.PointLight(0xffe2a0, 0, 70, 1.2);
  private sea!: Sea; private terrain!: Terrain; private lighthouse!: Lighthouse; private life!: Life; private sky!: Sky;
  private hud?: Hud;
  private models: Array<{ kind: string; model: BuildingModel } | null> = Array(PLOT_COUNT).fill(null);
  private ships = new Map<number, ShipObj>();
  private cursor = new THREE.Group(); private ring!: THREE.Mesh; private ghost?: THREE.Object3D; private ghostKey = '';
  private ghostMat = new THREE.MeshLambertMaterial({ color: 0x66ff88, transparent: true, opacity: 0.45, depthWrite: false });
  private markers: THREE.Mesh[] = [];
  private container?: HTMLElement; private ro?: ResizeObserver;
  private color = '#d64545';
  private send?: (a: unknown) => void;
  private lastCue = -1; private lastT = -1; private beamAngle = 0; private nextGull = 8;
  private aspect = 4 / 3;
  private ray = new THREE.Raycaster();
  private onDown = (e: PointerEvent) => this.pick(e);
  private tmp = new THREE.Vector3(); private tmp2 = new THREE.Vector3();

  mount(container: HTMLElement, ctx: { profile: Readonly<Profile>; send?: (action: unknown) => void }) {
    this.container = container; this.color = ctx.profile.color; this.send = ctx.send;
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    r.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
    container.appendChild(r.domElement);
    r.domElement.addEventListener('pointerdown', this.onDown);
    this.renderer = r;

    const s = this.scene;
    s.fog = new THREE.FogExp2(0xcfe9f7, 0.006);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -48; sc.right = 48; sc.top = 36; sc.bottom = -36; sc.near = 1; sc.far = 220;
    this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.04;
    s.add(this.sun, this.sun.target, this.hemi);

    this.sky = new Sky(); s.add(this.sky.group);
    this.sea = createSea(); s.add(this.sea.mesh);
    this.terrain = createTerrain(); s.add(this.terrain.mesh);
    s.add(createScenery());
    this.lighthouse = createLighthouse(this.color); s.add(this.lighthouse.group);
    this.lampLight.position.copy(this.lighthouse.lanternPos); s.add(this.lampLight);
    this.life = new Life(this.terrain); s.add(this.life.group);

    // build cursor: pulsing ring + ghost preview; faint markers on free plots
    this.ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.6, 32), new THREE.MeshBasicMaterial({ color: 0x66ff88, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2; this.cursor.add(this.ring); this.cursor.visible = false; s.add(this.cursor);
    const mGeo = new THREE.RingGeometry(1.5, 1.75, 24); mGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < PLOT_COUNT; i++) {
      const m = new THREE.Mesh(mGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
      m.position.set(PLOTS[i].x, plotHeight(i) + 0.08, PLOTS[i].z); m.visible = false; s.add(m); this.markers.push(m);
    }

    this.hud = new Hud(container, ctx.send);
    this.resize(container.clientWidth || 800, container.clientHeight || 600);
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize(container.clientWidth || 800, container.clientHeight || 600));
      this.ro.observe(container);
    }
  }

  private pick(e: PointerEvent) {
    if (!this.renderer || !this.send) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hit = this.ray.intersectObject(this.terrain.mesh, false)[0];
    if (!hit) return;
    let best = -1, bd = 4;
    for (let i = 0; i < PLOT_COUNT; i++) { const d = Math.hypot(hit.point.x - PLOTS[i].x, hit.point.z - PLOTS[i].z); if (d < bd) { bd = d; best = i; } }
    if (best >= 0) this.send({ type: 'plot', plot: best });
  }

  // ---------- camera ----------
  private updateCamera(s: Snap, dt: number) {
    const drift = Math.sin(s.t * 0.025) * 0.12;
    let tgt: THREE.Vector3, R: number, el: number, az: number;
    if (s.mode === 'build') {
      const p = PLOTS[s.cursor.plot];
      tgt = this.tmp.set(p.x, plotHeight(s.cursor.plot) + 1, p.z + (s.cursor.building === 'pier' ? 3 : 0));
      R = 32; el = 0.62; az = 0.1 + drift * 0.3;
    } else if (s.view === 1) { tgt = this.tmp.set(HARBOUR.x, 1.5, HARBOUR.z + 3); R = 36; el = 0.36; az = 0.4 + drift; }
    else if (s.view === 2) { tgt = this.tmp.set(LIGHTHOUSE.x + 4, 9, LIGHTHOUSE.z + 6); R = 48; el = 0.16; az = -0.35 + drift * 0.5; }
    else { tgt = this.tmp.set(-2, 4.5, 5); R = 62; el = 0.36; az = drift; }
    if (this.aspect < 1.5) R *= Math.min(1.6, 1.5 / this.aspect);
    const pos = this.tmp2.set(tgt.x + Math.sin(az) * Math.cos(el) * R, tgt.y + Math.sin(el) * R, tgt.z + Math.cos(az) * Math.cos(el) * R);
    const k = this.lastT < 0 ? 1 : 1 - Math.exp(-dt * 2.2);
    this.camPos.lerp(pos, k); this.camTgt.lerp(tgt, k);
    this.camera.position.copy(this.camPos); this.camera.lookAt(this.camTgt);
  }

  // ---------- buildings ----------
  private syncBuildings(s: Snap) {
    for (let i = 0; i < PLOT_COUNT; i++) {
      const k = s.buildings[i], cur = this.models[i];
      if ((cur?.kind ?? null) === k) continue;
      if (cur) this.scene.remove(cur.model.group);
      this.models[i] = null;
      if (!k) continue;
      const model = makeBuilding(k, i + 1);
      const p = PLOTS[i];
      model.group.position.set(p.x, plotHeight(i), p.z);
      if (k !== 'pier') model.group.rotation.y = (((i * 37) % 7) - 3) * 0.06 + (p.x < -8 ? 0.3 : p.x > 14 ? -0.3 : 0);
      model.group.scale.setScalar(0.01);
      this.scene.add(model.group);
      this.models[i] = { kind: k, model };
    }
  }

  private updateBuildings(s: Snap, dt: number, night: number, storm: number) {
    const smoke: THREE.Vector3[] = [];
    for (let i = 0; i < PLOT_COUNT; i++) {
      const m = this.models[i]; if (!m) continue;
      const g = m.model.group;
      if (g.scale.x < 1) { const sc = Math.min(1, g.scale.x + dt * 1.6); g.scale.set(sc, sc * (sc < 1 ? 0.6 + 0.4 * sc + Math.sin(sc * Math.PI) * 0.25 : 1), sc); }
      for (const gl of m.model.glows) (gl.material as THREE.SpriteMaterial).opacity = Math.min(1, night * 0.9 + storm * 0.4);
      if (m.model.chimney) smoke.push(g.localToWorld(m.model.chimney.clone()));
      if (m.model.bell) { const a = s.bellAge; m.model.bell.rotation.z = a < 6 ? Math.sin(a * 7) * 0.55 * Math.exp(-a * 0.7) : 0; }
    }
    return smoke;
  }

  private updateCursor(s: Snap) {
    const on = s.mode === 'build';
    this.cursor.visible = on;
    for (let i = 0; i < PLOT_COUNT; i++) this.markers[i].visible = on && !s.buildings[i] && (s.cursor.building !== 'pier' || PLOTS[i].shore) && i !== s.cursor.plot;
    if (!on) { if (this.ghost) { this.scene.remove(this.ghost); this.ghost = undefined; this.ghostKey = ''; } return; }
    const i = s.cursor.plot, p = PLOTS[i];
    this.cursor.position.set(p.x, plotHeight(i) + 0.12, p.z);
    const pulse = 1 + Math.sin(s.t * 5) * 0.08; this.ring.scale.set(pulse, pulse, pulse);
    const ok = s.cursor.canBuild;
    (this.ring.material as THREE.MeshBasicMaterial).color.set(ok ? 0x66ff88 : 0xff6a5a);
    this.ghostMat.color.set(ok ? 0x88ffaa : 0xff8a7a);
    const key = `${s.cursor.building}@${i}`;
    if (key !== this.ghostKey) {
      if (this.ghost) this.scene.remove(this.ghost);
      this.ghost = undefined; this.ghostKey = key;
      if (!s.buildings[i]) {
        const m = makeBuilding(s.cursor.building, i + 1).group;
        m.traverse((o) => { if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).material = this.ghostMat; o.castShadow = false; } if ((o as THREE.Sprite).isSprite) o.visible = false; });
        m.position.set(p.x, plotHeight(i), p.z);
        this.ghost = m; this.scene.add(m);
      }
    }
    if (this.ghost) this.ghost.position.y = plotHeight(i) + 0.15 + Math.sin(s.t * 3) * 0.12;
  }

  // ---------- ships ----------
  private shipPose(sh: ShipView, s: Snap, out: THREE.Vector3): { heading: THREE.Vector3; sink: number; roll: number; wake: number } {
    const lane = sh.lane;
    const route = [V(-120, 0, 44 + lane * 16), V(-55, 0, 50 + lane * 8), V(-14, 0, 40), V(HARBOUR.x, 0, 31)];
    const ahead = new THREE.Vector3();
    if (sh.state === 'sailing') {
      bezier(route, sh.progress, out); bezier(route, Math.min(1, sh.progress + 0.01), ahead);
      return { heading: ahead.sub(out).normalize(), sink: 0, roll: 0, wake: 1 };
    }
    const app = route[3];
    if (sh.state === 'docked') {
      let berth: THREE.Vector3;
      if (sh.dock >= 0) { const p = PLOTS[sh.dock]; berth = V(p.x + 3.9, 0, p.z + PIER_LEN + 1.3); } else berth = V(MOORING.x, 0, MOORING.z);
      if (sh.age > 19) {
        const k = ease((sh.age - 19) / 6);
        out.copy(berth).lerp(V(110, 0, 50), k);
        return { heading: V(1, 0, 0.3).normalize(), sink: 0, roll: 0, wake: k > 0 ? 1 : 0 };
      }
      const k = ease(sh.age / 6);
      out.copy(app).lerp(berth, k);
      const h = k < 0.95 ? berth.clone().sub(app).normalize() : V(1, 0, 0);
      return { heading: h, sink: 0, roll: 0, wake: 1 - k };
    }
    if (sh.state === 'lost') {
      const reef = V(REEFS[0][0] + 1.5, 0, REEFS[0][1] + 0.8);
      const k = ease(sh.age / 4);
      out.copy(app).lerp(reef, k);
      const sink = Math.max(0, (sh.age - 4) / 10);
      return { heading: reef.clone().sub(app).normalize(), sink, roll: sink * 0.6, wake: 1 - k };
    }
    // spilled: wallow, then limp back out to sea
    if (sh.age < 7) { out.copy(app); return { heading: V(1, 0, -0.2).normalize(), sink: 0, roll: Math.sin(s.t * 2.2) * 0.35, wake: 0 }; }
    const k = ease((sh.age - 7) / 5);
    out.copy(app).lerp(V(-60, 0, 55), k);
    return { heading: V(-1, 0, 0.3).normalize(), sink: 0, roll: 0, wake: k };
  }

  private updateShips(s: Snap, amp: number, night: number, smoke: THREE.Vector3[]) {
    const live = new Set<number>();
    const p = new THREE.Vector3();
    for (const sh of s.ships) {
      live.add(sh.id);
      let o = this.ships.get(sh.id);
      if (!o) { o = { m: makeShip(sh.kind, sh.id), kind: sh.kind }; this.scene.add(o.m.group); this.ships.set(sh.id, o); }
      const pose = this.shipPose(sh, s, p);
      const g = o.m.group;
      const wy = waveHeight(p.x, p.z, s.t, amp);
      g.position.set(p.x, wy + 0.35 - pose.sink * 3, p.z);
      g.rotation.y = Math.atan2(-pose.heading.z, pose.heading.x);
      o.m.body.rotation.x = Math.sin(s.t * 1.3 + sh.id) * (0.04 + amp * 0.12) + pose.roll;
      o.m.body.rotation.z = Math.sin(s.t * 1.1 + sh.id * 2) * (0.03 + amp * 0.08) + pose.sink * 0.5;
      (o.m.wake.material as THREE.MeshBasicMaterial).opacity = 0.45 * pose.wake;
      for (const l of o.m.lights) (l.material as THREE.SpriteMaterial).opacity = Math.max(night, s.fog * 0.6) * (1 - pose.sink);
      if (o.m.smoke && pose.sink < 0.2) smoke.push(o.m.body.localToWorld(o.m.smoke.clone()));
      // floating cargo for spilled ships
      if (sh.state === 'spilled' && !o.crates) {
        o.crates = new THREE.Group();
        for (let i = 0; i < 7; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), lam(0xa07a4a)); c.userData.a = i * 0.9; c.userData.r = 1.5 + (i % 3); o.crates.add(c); }
        o.crates.position.copy(p); this.scene.add(o.crates);
      }
      if (o.crates) {
        for (const c of o.crates.children) {
          const a = c.userData.a as number, rr = (c.userData.r as number) * (1 + sh.age * 0.15);
          const cx = Math.cos(a) * rr, cz = Math.sin(a) * rr;
          c.position.set(cx, waveHeight(o.crates.position.x + cx, o.crates.position.z + cz, s.t, amp), cz);
          c.rotation.set(s.t * 0.3 + a, a, Math.sin(s.t + a) * 0.3);
        }
      }
    }
    for (const [id, o] of this.ships) if (!live.has(id)) { this.scene.remove(o.m.group); if (o.crates) this.scene.remove(o.crates); this.ships.delete(id); }
  }

  // ---------- sound ----------
  private sounds(s: Snap, storm: number, night: number) {
    if (this.lastCue < 0) this.lastCue = s.cues.length ? s.cues[s.cues.length - 1].id : 0;
    for (const c of s.cues) if (c.id > this.lastCue) {
      this.lastCue = c.id;
      if (c.name === 'thunder') { const d = 300 + Math.random() * 900; setTimeout(() => play('thunder', { minGapS: 0.6, pitch: 0.8 + Math.random() * 0.4 }), d); }
      else play(c.name as SfxName, { minGapS: CUE_GAP[c.name as SfxName] });
    }
    const surf = 0.5 + 0.5 * Math.sin(s.t * 0.9);
    setAmbient('sea', 0.05 + 0.06 * surf + s.chop * 0.08, 380 + surf * 260, 0.6);
    setAmbient('wind', storm * 0.16 + s.fog * 0.02, 700 + Math.sin(s.t * 0.4) * 200, 1.2);
    setAmbient('rain', Math.max(0, storm - 0.15) * 0.18, 2800, 0.3);
    this.nextGull -= 1 / 30;
    if (this.nextGull <= 0) { this.nextGull = 12 + Math.random() * 20; if (night < 0.5 && storm < 0.3) play('gull', { pitch: 0.85 + Math.random() * 0.3 }); }
  }

  render(snapshot: unknown, _bike: Readonly<BikeState>, _input: Readonly<InputState>) {
    const s = snapshot as Snap;
    if (!this.renderer || !s || s.fog === undefined || !s.grow) return;
    const dt = this.lastT < 0 ? 1 / 30 : Math.max(0, Math.min(0.1, s.t - this.lastT));
    const st = s.storm;
    const storm = st.phase === 'storm' ? Math.max(0.5, st.intensity) : st.phase === 'warning' ? st.intensity : 0;
    const warn = st.phase === 'warning' ? Math.min(1, st.timeInPhase / Math.max(1, st.warnS)) : 0;

    this.updateCamera(s, dt);
    const sky = this.sky.update({ t: s.t, dt, day: s.day, fog: s.fog, storm, warn, lightningAge: st.lightningAge, camTarget: this.camTgt });
    this.sky.group.position.copy(this.camera.position).setY(0);
    const night = Math.max(sky.night, storm * 0.6);
    this.scene.background = sky.horizon;
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(sky.horizon);
    fog.density = 0.0025 + s.fog * s.fog * 0.03 + storm * 0.004;

    // light
    const sunUp = sky.sunI > 0.02;
    this.sun.color.copy(sunUp ? sky.sunColor : new THREE.Color(0x8fa8ff));
    this.sun.intensity = sunUp ? 2.7 * sky.sunI : 0.5 * sky.night;
    const ld = sunUp ? sky.sunDir : this.tmp.set(-sky.sunDir.x, -sky.sunDir.y, sky.sunDir.z);
    this.sun.target.position.set(2, 0, 0);
    this.sun.position.set(2 + ld.x * 120, Math.max(12, ld.y * 120), ld.z * 120);
    this.hemi.color.copy(sky.horizon);
    this.hemi.intensity = 0.55 + 1.1 * (1 - night) + sky.flash * 2.5;
    this.lampLight.intensity = s.lamp * (8 + 40 * night);

    // lighthouse + sea
    this.beamAngle += dt * (0.5 + 0.7 * s.lamp);
    this.lighthouse.update({ t: s.t, lamp: s.lamp, night, bloom: Math.min(1, s.meadow * 0.8 + (s.grow.reduce((a, g, i) => a + (s.buildings[i] === 'garden' ? g : 0), 0) / 4) * 0.4), beamAngle: this.beamAngle, camera: this.camera, lens: s.buildings.includes('lamp2') ? 1 : 0 });
    const amp = 0.25 + s.chop * 1.6;
    this.sea.update(s.t, amp, night, storm);
    WIN.color.setRGB(0.16 + 0.84 * night, 0.23 + 0.55 * night, 0.29 + 0.1 * night);
    LAMP.color.setRGB(0.5 + 0.5 * night, 0.45 + 0.45 * night, 0.3 + 0.3 * night);

    // town
    this.syncBuildings(s);
    this.life.setTown(s.buildings, s.grow, s.meadow);
    const smoke = this.updateBuildings(s, dt, night, storm);
    this.updateCursor(s);
    this.updateShips(s, amp, night, smoke);
    const docked = new Set<number>(s.ships.filter((x) => x.state === 'docked' && x.dock >= 0 && x.age > 5 && x.age < 19).map((x) => x.dock));
    this.life.update({ t: s.t, dt, night: sky.night, storm, dockedPiers: docked, bellAge: s.bellAge, smokeExtra: smoke });

    this.sounds(s, storm, sky.night);
    this.hud?.update(s);
    this.lastT = s.t;
    this.renderer.render(this.scene, this.camera);
  }

  resize(w: number, h: number) {
    this.renderer?.setSize(w, h, false);
    this.aspect = w / Math.max(1, h);
    this.camera.aspect = this.aspect; this.camera.updateProjectionMatrix();
  }

  unmount() {
    this.ro?.disconnect();
    this.renderer?.domElement.removeEventListener('pointerdown', this.onDown);
    stopAmbient();
    this.hud?.unmount();
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
    disposeShared();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.ships.clear();
  }
}
