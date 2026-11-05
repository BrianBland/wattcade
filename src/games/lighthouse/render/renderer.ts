// Keeper's Light renderer: low-poly island in three.js, plus a DOM HUD. Reads only the sim snapshot.
import * as THREE from 'three/webgpu';
import type { BikeState, GameRenderer, InputState, Insets, Profile } from '../../../contracts';
import type { SfxName } from '../../../audio/sfx';
import { playIsland as play } from './audio';
import { BRIDGE, HARBOUR, islandHeight, LIGHTHOUSE, LIGHTHOUSE_Y, MOORING, PIER_LEN, PLOTS, PLOT_COUNT, plotHeight } from '../sim/layout';
import { NEAR } from '../sim/town';
import { LAMP, WIN, makeBuilding, makeShip, plotYaw, SHORE_KINDS, type BuildingModel, type ShipModel } from './buildings';
import { Hud } from './hud';
import { Life } from './life';
import { createSea, waveHeight, type Sea } from './sea';
import { Sky } from './sky';
import type { ShipView, Snap } from './snap';
import { disposeShared, lam, mergeStatic, mesh } from './util';
import { Fx } from './fx';
import { Wildlife, type WildFrame } from './wildlife';
import { Keeper } from './keeper';
import { Decor } from './decor';
import { HUBS } from './life';
import { IslandMusic } from './music';
import { IslandAmbience } from './ambience';
import { addToAlbum, loadAlbum, popSchedule, postcardLines, snapshot } from './postcard';
import { createGfx, type Gfx } from '../../../gfx/renderer';
import { createLighthouse, createScenery, createTerrain, REEFS, type Lighthouse, type Terrain } from './world';

const VISIT: Record<string, true> = { circus: true, royal: true, research: true };
const CUE_GAP: Partial<Record<SfxName, number>> = { select: 0.05, thunder: 0.8, bell: 2, chime: 1 };
const BONUS_ROWS = new Set(['cottage', 'garden', 'orchard', 'market', 'pier', 'mill']);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const ease = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

function bezier(p: THREE.Vector3[], t: number, out: THREE.Vector3) {
  const u = 1 - t;
  out.set(0, 0, 0)
    .addScaledVector(p[0], u * u * u).addScaledVector(p[1], 3 * u * u * t)
    .addScaledVector(p[2], 3 * u * t * t).addScaledVector(p[3], t * t * t);
  return out;
}

interface ShipObj { m: ShipModel; kind: string; crates?: THREE.Group; fx?: boolean; flashAt?: number }

export class LighthouseRenderer implements GameRenderer {
  private renderer?: THREE.WebGPURenderer; private gfx?: Gfx;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 4 / 3, 0.5, 1400);
  private camPos = V(0, 40, 80); private camTgt = V(0, 2, 4);
  private sun = new THREE.DirectionalLight(0xffffff, 2.6);
  private hemi = new THREE.HemisphereLight(0xcfe9f7, 0x4a5a3a, 1.4);
  private lampLight = new THREE.PointLight(0xffe2a0, 0, 70, 1.2);
  private sea!: Sea; private terrain!: Terrain; private lighthouse!: Lighthouse; private life!: Life; private sky!: Sky;
  private fx!: Fx; private wild!: Wildlife; private lastLens = 0; private escort: WildFrame['ships'] = [];
  private keeper = new Keeper(); private decor!: Decor; private music = new IslandMusic();
  private ambience = new IslandAmbience();
  /** Dusk lamp-lighting / dawn chorus, in sim seconds. */
  private duskAt = -999; private dawnAt = -999; private prevNight = -1; private flared = true;
  private lastDockAt = -999; private dockAt = { x: HARBOUR.x, z: HARBOUR.z }; private nextFireworks = 0;
  private timers = { baa: 20, puffin: 30, giggle: 15 };
  // end-of-ride recap: wall-clock driven (the sim has stopped); this ride's new buildings pop in, then the postcard
  private startTown: Array<string | null> | null = null; private profileId = '';
  private last?: Snap;
  private recap: { at: number; pops: Map<number, number>; shotAt: number; shot: boolean; az: number; popped: Set<number> } | null = null;
  private hud?: Hud;
  private models: Array<{ kind: string; level: number; model: BuildingModel; boatHome?: THREE.Vector3 } | null> = Array(PLOT_COUNT).fill(null);
  private bridge?: THREE.Group;
  private links!: THREE.LineSegments; private range!: THREE.LineLoop; private rangeKey = '';
  private ships = new Map<number, ShipObj>();
  private cursor = new THREE.Group(); private ring!: THREE.Mesh; private ghost?: THREE.Object3D; private ghostKey = '';
  private ghostMat = new THREE.MeshLambertMaterial({ color: 0x66ff88, transparent: true, opacity: 0.45, depthWrite: false });
  private markers: THREE.Mesh[] = [];
  private container?: HTMLElement; private ro?: ResizeObserver;
  private color = '#d64545';
  private send?: (a: unknown) => void;
  private lastCue = -1; private lastT = -1; private beamAngle = 0; private nextGull = 8;
  private aspect = 4 / 3; private shadowFrame = 0;
  private insetB = 0; private size: [number, number] = [800, 600];
  private ray = new THREE.Raycaster();
  private onDown = (e: PointerEvent) => this.pick(e);
  private tmp = new THREE.Vector3(); private tmp2 = new THREE.Vector3();

  mount(container: HTMLElement, ctx: { profile: Readonly<Profile>; send?: (action: unknown) => void; insets?: Insets }) {
    this.insetB = ctx.insets?.bottom ?? 0;
    this.container = container; this.color = ctx.profile.color; this.send = ctx.send;
    this.gfx = createGfx(); const r = this.gfx.renderer;
    r.setPixelRatio(Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    r.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
    container.appendChild(r.domElement);
    r.domElement.addEventListener('pointerdown', this.onDown);
    this.renderer = r;

    const s = this.scene;
    s.fog = new THREE.FogExp2(0xcfe9f7, 0.006);
    this.sun.castShadow = true; this.sun.shadow.autoUpdate = false;
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
    this.fx = new Fx(); s.add(this.fx.group);
    this.wild = new Wildlife(this.fx, (x, z) => this.life.okSpot(x, z, 2.8)); s.add(this.wild.group);
    this.decor = new Decor(this.life); s.add(this.decor.group);
    s.add(this.keeper.group);

    // build cursor: pulsing ring + ghost preview; faint markers on free plots
    this.ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.6, 32), new THREE.MeshBasicMaterial({ color: 0x66ff88, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2; this.cursor.add(this.ring); this.cursor.visible = false; s.add(this.cursor);
    const mGeo = new THREE.RingGeometry(1.5, 1.75, 24); mGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < PLOT_COUNT; i++) {
      const m = new THREE.Mesh(mGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
      m.position.set(PLOTS[i].x, plotHeight(i) + 0.08, PLOTS[i].z); m.visible = false; s.add(m); this.markers.push(m);
    }

    // neighbour links (cursor -> plots it would boost / be boosted by) and the neighbourhood range
    this.links = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.95, depthTest: false }));
    this.links.renderOrder = 5; this.links.frustumCulled = false; s.add(this.links);
    this.range = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }));
    this.range.frustumCulled = false; s.add(this.range);
    this.bridge = this.makeBridge(); this.bridge.visible = false; s.add(this.bridge);

    this.hud = new Hud(container, ctx.send);
    this.profileId = ctx.profile.id;
    void loadAlbum(this.profileId).then((l) => this.hud?.setAlbum(l));
    this.hud.setInsetBottom(this.insetB);
    this.resize(container.clientWidth || 800, container.clientHeight || 600);
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize(container.clientWidth || 800, container.clientHeight || 600));
      this.ro.observe(container);
    }
  }

  private makeBridge(): THREE.Group {
    const g = new THREE.Group(), wood = lam(0x8b6b3e), dark = lam(0x5e472b);
    const { x0, x1, z, y } = BRIDGE, L = x1 - x0, cx = (x0 + x1) / 2;
    g.add(mesh(new THREE.BoxGeometry(L, 0.2, 1.8), wood, cx, y, z));
    for (let x = x0 + 1; x < x1; x += 2.2) for (const dz of [-0.85, 0.85]) {
      g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, y + 3, 5), dark, x, (y - 3) / 2, z + dz, false));
      g.add(mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), dark, x, y + 0.5, z + dz, false));
    }
    for (const dz of [-0.85, 0.85]) g.add(mesh(new THREE.BoxGeometry(L, 0.08, 0.08), dark, cx, y + 0.95, z + dz, false));
    mergeStatic(g);
    return g;
  }

  private pick(e: PointerEvent) {
    if (!this.renderer || !this.send) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hit = this.ray.intersectObject(this.terrain.mesh, false)[0];
    if (!hit) return;
    if (Math.hypot(hit.point.x - LIGHTHOUSE.x, hit.point.z - LIGHTHOUSE.z) < 4.5) { this.send({ type: 'plot', plot: -1 }); return; }
    let best = -2, bd = 4;
    for (let i = 0; i < PLOT_COUNT; i++) { const d = Math.hypot(hit.point.x - PLOTS[i].x, hit.point.z - PLOTS[i].z); if (d < bd) { bd = d; best = i; } }
    if (best >= 0) this.send({ type: 'plot', plot: best });
  }

  // ---------- camera ----------
  private updateCamera(s: Snap, dt: number) {
    const drift = Math.sin(s.t * 0.025) * 0.12;
    let tgt: THREE.Vector3, R: number, el: number, az: number;
    const islet = s.districts.some((d) => d.id === 'islet' && d.open);
    if (s.mode === 'build' && s.tab === 'decor') { tgt = this.tmp.set(HUBS[0].x, 3, HUBS[0].z - 2); R = 44; el = 0.5; az = 0.15 + drift * 0.3; }
    else if (s.mode === 'build' && s.cursor.plot < 0) { tgt = this.tmp.set(LIGHTHOUSE.x, LIGHTHOUSE_Y + 8, LIGHTHOUSE.z); R = 34; el = 0.2; az = 0.45; }
    else if (s.mode === 'build') {
      const p = PLOTS[s.cursor.plot];
      const shoreFront = SHORE_KINDS.has(s.cursor.building ?? '');
      tgt = this.tmp.set(p.x, plotHeight(s.cursor.plot) + 1, p.z + (shoreFront ? 3 : 0));
      R = 34; el = 0.62; az = 0.1 + drift * 0.3;
    } else if (s.view === 1) { tgt = this.tmp.set(HARBOUR.x, 1.5, HARBOUR.z + 3); R = 36; el = 0.36; az = 0.4 + drift; }
    else if (s.view === 2) { tgt = this.tmp.set(LIGHTHOUSE.x + 3, 12, LIGHTHOUSE.z + 4); R = 46; el = 0.2; az = -0.35 + drift * 0.5; }
    // default: the whole island with the lighthouse in frame (it's the star), tilted low enough to see the sea it guards
    else if (islet) { tgt = this.tmp.set(8, 9, 1); R = 90; el = 0.3; az = drift; }
    else { tgt = this.tmp.set(-5, 8, 1); R = 68; el = 0.31; az = 0.06 + drift; }
    if (this.aspect < 1.5) R *= Math.min(1.6, 1.5 / this.aspect);
    const pos = this.tmp2.set(tgt.x + Math.sin(az) * Math.cos(el) * R, tgt.y + Math.sin(el) * R, tgt.z + Math.cos(az) * Math.cos(el) * R);
    const k = this.lastT < 0 ? 1 : 1 - Math.exp(-dt * 2.2);
    this.camPos.lerp(pos, k); this.camTgt.lerp(tgt, k);
    this.camera.position.copy(this.camPos); this.camera.lookAt(this.camTgt);
  }

  // ---------- buildings ----------
  private syncBuildings(s: Snap) {
    for (let i = 0; i < PLOT_COUNT; i++) {
      const k = s.buildings[i], lv = s.levels[i] || 1, cur = this.models[i];
      if ((cur?.kind ?? null) === k && (!k || cur!.level === lv)) continue;
      const upgraded = !!cur && cur.kind === k;
      if (k && this.lastT >= 0) { // celebrate new buildings and upgrades (not the town loading in)
        const at = V(PLOTS[i].x, plotHeight(i) + 0.4, PLOTS[i].z);
        this.fx.dust(at); this.fx.sparkle(at.setY(at.y + 2.2), upgraded ? [0xffe98a, 0xffffff, 0xffb627] : [0x9cf59c, 0xffffff, 0xffe98a]);
      }
      if (cur) this.scene.remove(cur.model.group);
      this.models[i] = null;
      if (!k) continue;
      const model = makeBuilding(k, i + 1, lv);
      const p = PLOTS[i];
      model.group.position.set(p.x, plotHeight(i), p.z);
      model.group.rotation.y = plotYaw(k, i, p.x);
      model.group.scale.setScalar(upgraded ? 0.7 : 0.01);
      this.scene.add(model.group);
      model.group.updateMatrixWorld(true);
      this.models[i] = { kind: k, level: lv, model, boatHome: model.boat?.position.clone() };
    }
  }

  private updateBuildings(s: Snap, dt: number, night: number, storm: number) {
    const smoke: THREE.Vector3[] = [];
    // after the lamp is lit at dusk, the windows come on one by one, nearest the lighthouse first
    const since = s.t - this.duskAt, staged = since >= 0 && since < 40;
    for (let i = 0; i < PLOT_COUNT; i++) {
      const m = this.models[i]; if (!m) continue;
      const g = m.model.group;
      if (g.scale.x < 1) { const sc = Math.min(1, g.scale.x + dt * 1.6); g.scale.set(sc, sc * (sc < 1 ? 0.6 + 0.4 * sc + Math.sin(sc * Math.PI) * 0.25 : 1), sc); }
      const lit = staged ? Math.max(0, Math.min(1, (since - 6 - Math.hypot(PLOTS[i].x - LIGHTHOUSE.x, PLOTS[i].z - LIGHTHOUSE.z) * 0.12) / 0.5)) : 1;
      for (const gl of m.model.glows) (gl.material as THREE.SpriteMaterial).opacity = Math.min(1, night * 0.9 * lit + storm * 0.4);
      for (const c of m.model.chimney ?? []) smoke.push(g.localToWorld(c.clone()));
      if (m.model.bell) { const a = s.bellAge; m.model.bell.rotation.z = a < 6 ? Math.sin(a * 7) * 0.55 * Math.exp(-a * 0.7) : 0; }
      if (m.model.spin) m.model.spin.rotation.z -= dt * (0.6 + storm * 2.5);
      if (m.model.boat && m.boatHome) this.animateLifeboat(s, i, m.model.boat, m.boatHome);
    }
    return smoke;
  }

  /** The lifeboat runs out to the reef, tows the ship in, then returns to its ramp. */
  private animateLifeboat(s: Snap, plot: number, boat: THREE.Object3D, home: THREE.Vector3) {
    const r = s.rescue, a = r.age;
    const g = boat.parent!;
    if (r.plot !== plot || a > 18) { boat.position.copy(home); boat.rotation.set(0, -Math.PI / 2, 0); return; }
    const homeW = g.localToWorld(home.clone());
    const reef = V(REEFS[0][0] + 3, 0.3, REEFS[0][1] + 1.5);
    const ship = s.ships.find((x) => x.id === r.ship);
    const tow = ship && ship.dock >= 0 ? V(PLOTS[ship.dock].x + 3.9, 0.3, PLOTS[ship.dock].z + PIER_LEN + 3) : V(MOORING.x, 0.3, MOORING.z + 2);
    let w: THREE.Vector3, to: THREE.Vector3;
    if (a < 5) { w = homeW.clone().lerp(reef, ease(a / 5)); to = reef; }
    else if (a < 12) { w = reef.clone().lerp(tow, ease((a - 5) / 7)); to = tow; }
    else { w = tow.clone().lerp(homeW, ease((a - 12) / 6)); to = homeW; }
    w.y = 0.3 + waveHeight(w.x, w.z, s.t, 0.4);
    boat.position.copy(g.worldToLocal(w));
    const d = to.clone().sub(w);
    boat.rotation.set(0, Math.atan2(-d.z, d.x) - g.rotation.y, 0);
  }

  private updateCursor(s: Snap) {
    const on = s.mode === 'build' && s.tab !== 'decor';
    this.cursor.visible = on;
    const row = s.cursor.row;
    const open = new Set(s.districts.filter((d) => d.open).map((d) => d.id));
    const shoreOnly = SHORE_KINDS.has(row);
    const links = new Set(s.cursor.links);
    for (let i = 0; i < PLOT_COUNT; i++) {
      const mk = this.markers[i], mat = mk.material as THREE.MeshBasicMaterial;
      const valid = row === 'upgrade' || row === 'demolish' ? !!s.buildings[i] : row !== 'lens' && !s.buildings[i] && open.has(PLOTS[i].district) && (!shoreOnly || PLOTS[i].shore);
      mk.visible = on && i !== s.cursor.plot && (valid || links.has(i));
      mat.color.set(links.has(i) ? 0xffd84a : 0xffffff); mat.opacity = links.has(i) ? 0.9 : 0.35;
    }
    const ghostOff = () => { if (this.ghost) { this.scene.remove(this.ghost); this.ghost = undefined; this.ghostKey = ''; } };
    if (!on) { ghostOff(); this.links.visible = false; this.range.visible = false; return; }
    const i = s.cursor.plot;
    const cx = i < 0 ? LIGHTHOUSE.x : PLOTS[i].x, cz = i < 0 ? LIGHTHOUSE.z : PLOTS[i].z, cy = i < 0 ? LIGHTHOUSE_Y : plotHeight(i);
    this.cursor.position.set(cx, cy + 0.12, cz);
    const pulse = (i < 0 ? 1.6 : 1) * (1 + Math.sin(s.t * 5) * 0.08); this.ring.scale.set(pulse, pulse, pulse);
    const ok = s.cursor.canBuild && row !== 'demolish';
    (this.ring.material as THREE.MeshBasicMaterial).color.set(ok ? 0x66ff88 : 0xff6a5a);
    this.ghostMat.color.set(ok ? 0x88ffaa : 0xff8a7a);
    // ghost: the new building, or the next level of the building being upgraded
    const upg = row === 'upgrade' && i >= 0 && s.buildings[i] && s.options.find((o) => o.type === 'upgrade')!.owned < s.options.find((o) => o.type === 'upgrade')!.max;
    const ghostKind = row === 'upgrade' ? (upg ? s.buildings[i] : null) : row === 'lens' || row === 'demolish' ? null : (i >= 0 && !s.buildings[i] ? row : null);
    const ghostLevel = row === 'upgrade' ? s.cursor.level + 1 : 1;
    const key = `${ghostKind}@${i}/${ghostLevel}`;
    if (key !== this.ghostKey) {
      ghostOff(); this.ghostKey = key;
      if (ghostKind) {
        const m = makeBuilding(ghostKind, i + 1, ghostLevel).group;
        m.traverse((o) => { if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).material = this.ghostMat; o.castShadow = false; } if ((o as THREE.Sprite).isSprite) o.visible = false; });
        m.position.set(cx, cy, cz);
        const real = this.models[i]?.model.group;
        if (row === 'upgrade' && real) { m.rotation.y = real.rotation.y; m.scale.setScalar(1.06); }
        else m.rotation.y = plotYaw(ghostKind, i, cx);
        this.ghost = m; this.scene.add(m);
      }
    }
    if (this.ghost) this.ghost.position.y = cy + (row === 'upgrade' ? 0.05 : 0.15) + Math.sin(s.t * 3) * 0.12;
    // neighbour links as arcs, and the neighbourhood range hugging the ground
    const pts: number[] = [];
    if (i >= 0) for (const j of s.cursor.links) {
      const a = V(cx, cy + 1, cz), b = V(PLOTS[j].x, plotHeight(j) + 1, PLOTS[j].z);
      let prev = a;
      for (let k = 1; k <= 8; k++) { const q = a.clone().lerp(b, k / 8); q.y += Math.sin((k / 8) * Math.PI) * 2.2; pts.push(prev.x, prev.y, prev.z, q.x, q.y, q.z); prev = q; }
    }
    this.links.geometry.dispose();
    this.links.geometry = new THREE.BufferGeometry(); this.links.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.links.visible = pts.length > 0;
    (this.links.material as THREE.LineBasicMaterial).opacity = 0.6 + 0.35 * Math.sin(s.t * 4);
    const showRange = i >= 0 && BONUS_ROWS.has(row);
    this.range.visible = showRange;
    if (showRange && this.rangeKey !== String(i)) {
      this.rangeKey = String(i);
      const rp: number[] = [];
      for (let k = 0; k < 64; k++) { const a = (k / 64) * Math.PI * 2, x = cx + Math.cos(a) * NEAR, z = cz + Math.sin(a) * NEAR; rp.push(x, Math.max(0.15, islandHeight(x, z)) + 0.25, z); }
      this.range.geometry.dispose();
      this.range.geometry = new THREE.BufferGeometry(); this.range.geometry.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    }
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
      if (sh.rescued && sh.age <= 19) { // stranded on the reef until the lifeboat tows her in
        const reef = V(REEFS[0][0] + 1.5, 0, REEFS[0][1] + 0.8);
        if (sh.age < 5) { out.copy(app).lerp(reef, ease(sh.age / 3)); return { heading: reef.clone().sub(app).normalize(), sink: 0.05, roll: Math.sin(s.t * 2) * 0.25, wake: 0 }; }
        const k = ease((sh.age - 5) / 7);
        out.copy(reef).lerp(berth, k);
        return { heading: k < 0.95 ? berth.clone().sub(reef).normalize() : V(1, 0, 0), sink: 0, roll: 0, wake: k < 0.95 ? 0.6 : 0 };
      }
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
    this.escort = [];
    for (const sh of s.ships) {
      live.add(sh.id);
      let o = this.ships.get(sh.id);
      if (!o) { o = { m: makeShip(sh.kind, sh.id), kind: sh.kind }; this.scene.add(o.m.group); this.ships.set(sh.id, o); }
      const pose = this.shipPose(sh, s, p);
      const g = o.m.group;
      const wy = waveHeight(p.x, p.z, s.t, amp);
      if (sh.state === 'sailing' && sh.progress > 0.3) this.escort.push({ x: p.x, z: p.z, hx: pose.heading.x, hz: pose.heading.z });
      // when the beam sweeps over a ship in the dark or fog, she flashes her lantern back and gives a little toot
      if (sh.state === 'sailing' && (night > 0.3 || s.fog > 0.3) && s.lamp > 0.2) {
        const bx = p.x - LIGHTHOUSE.x, bz = p.z - LIGHTHOUSE.z, bl = Math.hypot(bx, bz) || 1;
        const a = this.beamAngle, d1 = Math.abs((Math.cos(a) * bx - Math.sin(a) * bz) / bl), d2 = s.lens >= 3 ? Math.abs((-Math.sin(a) * bx - Math.cos(a) * bz) / bl) : 0;
        if (Math.max(d1, d2) > 0.997 && s.t - (o.flashAt ?? -99) > 8) { o.flashAt = s.t; play('horn', { vol: 0.35, pitch: 1.5, minGapS: 2 }); }
      }
      // a shower of coins when she ties up; a splash when she hits the reef
      if (!o.fx && sh.state === 'docked' && sh.age > (sh.rescued ? 12 : 5.5) && sh.age < 19) {
        o.fx = true; this.fx.coins(V(p.x, wy + 2.2, p.z));
        this.lastDockAt = s.t; this.dockAt = { x: p.x, z: p.z };
        const sc = V(p.x, wy + 2.2, p.z).project(this.camera);
        this.hud?.flyCoins((sc.x + 1) / 2 * this.size[0], (1 - sc.y) / 2 * this.size[1], sh.kind in VISIT ? 14 : 8);
        if (s.buildings.includes('cottage')) play('cheer', { minGapS: 3 });
      }
      if (!o.fx && sh.state === 'lost' && sh.age > 3.5) { o.fx = true; this.fx.splash(V(p.x, wy, p.z), 2.5); }
      g.position.set(p.x, wy + 0.35 - pose.sink * 3, p.z);
      g.rotation.y = Math.atan2(-pose.heading.z, pose.heading.x);
      o.m.body.rotation.x = Math.sin(s.t * 1.3 + sh.id) * (0.04 + amp * 0.12) + pose.roll;
      o.m.body.rotation.z = Math.sin(s.t * 1.1 + sh.id * 2) * (0.03 + amp * 0.08) + pose.sink * 0.5;
      (o.m.wake.material as THREE.MeshBasicMaterial).opacity = 0.45 * pose.wake;
      const flash = Math.max(0, 1 - (s.t - (o.flashAt ?? -99)) / 0.8);
      for (const l of o.m.lights) { (l.material as THREE.SpriteMaterial).opacity = Math.max(Math.max(night, s.fog * 0.6) * (1 - pose.sink), flash); l.scale.setScalar(1.6 + flash * 3); }
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
  private sounds(s: Snap, storm: number, night: number, dt: number) {
    if (this.lastCue < 0) this.lastCue = s.cues.length ? s.cues[s.cues.length - 1].id : 0;
    for (const c of s.cues) if (c.id > this.lastCue) {
      this.lastCue = c.id;
      if (c.name === 'unlock' || c.name === 'reward' || c.name === 'festival') this.fx.fireworks(V(HARBOUR.x, 2, HARBOUR.z + 8), c.name === 'reward' ? 6 : c.name === 'festival' ? 12 : 9);
      if (c.name === 'thunder') this.ambience.lightning(s.t, s.storm.surge);
      else play(c.name as SfxName, { minGapS: CUE_GAP[c.name as SfxName] });
    }
    const wk = this.weatherK(s);
    if (!this.ambience.update({ t: s.t, chop: s.chop, fog: s.fog, storm, windy: wk('windy'), shower: wk('shower') })) return;
    // village life: sheep, puffins on the cliff, children at play (by day, out of storms)
    const day = night < 0.5 && storm < 0.3, T = this.timers, step = dt;
    T.baa -= step; T.puffin -= step; T.giggle -= step;
    if (T.baa <= 0) { T.baa = 25 + Math.random() * 30; if (day) play('baa', { pitch: 0.9 + Math.random() * 0.25 }); }
    if (T.puffin <= 0) { T.puffin = 35 + Math.random() * 30; if (day) play('puffin', { vol: s.view === 2 ? 1.4 : 0.7 }); }
    if (T.giggle <= 0) { T.giggle = 20 + Math.random() * 25; if (day && s.buildings.includes('cottage') && s.season !== 'winter') play('giggle', { pitch: 0.9 + Math.random() * 0.3 }); }
    // festival nights get fireworks every so often
    if (s.festival && night > 0.4 && s.t > this.nextFireworks) { this.nextFireworks = s.t + 22; this.fx.fireworks(V(HARBOUR.x, 2, HARBOUR.z + 8), 5); }
    this.nextGull -= dt;
    if (this.nextGull <= 0) { this.nextGull = 12 + Math.random() * 20; if (night < 0.5 && storm < 0.3) play('gull', { pitch: 0.85 + Math.random() * 0.3 }); }
  }

  /** Weight (0..1) of a cosmetic weather kind, blending over 20 s from the previous one. */
  private weatherK(s: Snap) {
    const k = Math.min(1, Math.max(0, s.weather.age / 20));
    return (name: string) => (s.weather.kind === name ? k : 0) + (s.weather.prev === name ? 1 - k : 0);
  }

  /** Dusk: the keeper climbs up, the lamp flares on, windows light one by one. Dawn: a burst of birdsong. */
  private ceremony(s: Snap, night: number) {
    if (this.prevNight >= 0) {
      if (this.prevNight < 0.3 && night >= 0.3) { this.duskAt = s.t; this.flared = false; }
      if (this.prevNight >= 0.3 && night < 0.3) { this.dawnAt = s.t; play('songbird'); setTimeout(() => play('birdTrill'), 700); setTimeout(() => play('songbird', { pitch: 1.2 }), 1500); }
    }
    this.prevNight = night;
    if (!this.flared && s.t - this.duskAt >= 4.5) {
      this.flared = true;
      this.fx.sparkle(this.lighthouse.lanternPos.clone(), [0xfff2a8, 0xffffff, 0xffd84a]);
      play('shrine');
    }
  }

  ending(): number {
    const s = this.last;
    if (!s || !this.startTown || s.t < 60 || !this.hud) return 0; // too short a ride for a postcard
    const fresh = s.buildings.map((b, i) => (b && this.startTown![i] !== b ? i : -1)).filter((i) => i >= 0)
      .sort((a, b) => Math.hypot(PLOTS[a].x - LIGHTHOUSE.x, PLOTS[a].z - LIGHTHOUSE.z) - Math.hypot(PLOTS[b].x - LIGHTHOUSE.x, PLOTS[b].z - LIGHTHOUSE.z));
    const when = popSchedule(fresh.length);
    const shotAt = Math.max(7.5, (when[when.length - 1] ?? 0) + 1.4);
    const az = Math.atan2(this.camPos.x - this.camTgt.x, this.camPos.z - this.camTgt.z);
    this.ambience.dispose();
    this.recap = { at: performance.now() / 1000, pops: new Map(fresh.map((p, i) => [p, when[i]])), shotAt, shot: false, az, popped: new Set() };
    this.hud.setRecap(true);
    return Math.min(14, shotAt + 4.5);
  }

  render(snapshot: unknown, _bike: Readonly<BikeState>, _input: Readonly<InputState>) {
    let s = snapshot as Snap;
    if (!this.renderer || !s || s.fog === undefined || !s.grow) return;
    if (!this.startTown) this.startTown = s.buildings.slice();
    const rc = this.recap, rt = rc ? performance.now() / 1000 - rc.at : 0;
    if (rc) s = { ...s, t: s.t + rt, mode: 'watch', logOpen: false }; // keep the world moving on wall-clock time
    else this.last = s;
    const dt = this.lastT < 0 ? 1 / 30 : Math.max(0, Math.min(0.1, s.t - this.lastT));
    const st = s.storm;
    const storm = st.phase === 'storm' ? Math.max(0.5, st.intensity) : st.phase === 'warning' ? st.intensity : 0;
    const warn = st.phase === 'warning' ? Math.min(1, st.timeInPhase / Math.max(1, st.warnS)) : 0;

    if (rc) this.recapCamera(rt, dt); else this.updateCamera(s, dt);
    const rainbow = st.phase === 'calm' && st.lastWeathered ? Math.min(1, st.sinceEnd / 8) * Math.min(1, Math.max(0, (100 - st.sinceEnd) / 20)) : 0;
    const wk = Math.min(1, Math.max(0, s.weather.age / 20));
    const sky = this.sky.update({ t: s.t, dt, day: s.day, fog: s.fog, storm, warn, lightningAge: st.lightningAge, camTarget: this.camTgt, rainbow, weather: { kind: s.weather.kind, prev: s.weather.prev, k: wk } });
    this.ceremony(s, sky.night);
    // before the keeper lights it at dusk, the lamp stays dim; then it flares up
    const since = s.t - this.duskAt, preLit = since >= 0 && since < 4.5, flare = since >= 4.5 && since < 7 ? 1 - (since - 4.5) / 2.5 : 0;
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
    const lampNight = preLit ? night * 0.1 : night;
    this.lampLight.intensity = s.lamp * (8 + 40 * lampNight) + flare * 60;

    // lighthouse + sea
    this.beamAngle += dt * (0.5 + 0.7 * s.lamp) * (s.lens >= 3 ? 0.7 : 1);
    this.lighthouse.update({ t: s.t, lamp: preLit ? s.lamp * 0.2 : Math.min(1.4, s.lamp + flare * 0.6), night: lampNight, bloom: Math.min(1, s.meadow * 0.8 + (s.grow.reduce((a, g, i) => a + (s.buildings[i] === 'garden' ? g : 0), 0) / 4) * 0.4), beamAngle: this.beamAngle, camera: this.camera, lens: s.lens });
    const amp = 0.25 + s.chop * 1.6;
    this.sea.update(s.t, amp, night, storm);
    WIN.color.setRGB(0.16 + 0.84 * night, 0.23 + 0.55 * night, 0.29 + 0.1 * night);
    LAMP.color.setRGB(0.5 + 0.5 * night, 0.45 + 0.45 * night, 0.3 + 0.3 * night);

    // town
    this.syncBuildings(s);
    const isletOpen = s.districts.some((d) => d.id === 'islet' && d.open);
    this.bridge!.visible = isletOpen;
    this.terrain.setSeason(s.season); this.life.setSeason(s.season);
    this.life.setTown(s.buildings, s.levels, s.grow, s.meadow, isletOpen);
    this.decor.sync({ decor: s.decor, gifts: s.gifts, festival: !!s.festival, buildings: s.buildings, townKey: s.buildings.map((b, i) => (b ? b + s.levels[i] : '')).join(',') + isletOpen });
    const smoke = this.updateBuildings(s, dt, night, storm);
    this.updateCursor(s);
    this.updateShips(s, amp, night, smoke);
    const docked = new Set<number>(s.ships.filter((x) => x.state === 'docked' && x.dock >= 0 && x.age > 5 && x.age < 19).map((x) => x.dock));
    const windy = this.weatherK(s)('windy');
    this.life.update({ t: s.t, dt, night: sky.night, storm, dockedPiers: docked, bellAge: s.bellAge, smokeExtra: smoke, festival: !!s.festival && storm < 0.2, windy });
    this.decor.update({ t: s.t, dt, night: sky.night, storm, amp, festival: !!s.festival });
    this.keeper.update({ t: s.t, dt, inZone: s.inZone, storm: st.phase === 'storm', night: sky.night, dockAge: s.t - this.lastDockAt, harbour: this.dockAt, wantUp: since >= -1 && since < 12, festival: !!s.festival });
    this.music.update({ t: s.t, streakS: s.streak.s, night: sky.night, storm: st.phase !== 'calm', festival: !!s.festival && st.phase === 'calm', paused: false });
    if (this.lastLens && s.lens > this.lastLens) this.fx.sparkle(this.lighthouse.lanternPos.clone(), [0xffe98a, 0xffffff, 0xfff2a8]);
    this.lastLens = s.lens;
    this.wild.update({ t: s.t, dt, night: sky.night, storm, amp, meadow: s.meadow, ships: this.escort, whale: s.whale });
    this.fx.update(dt);

    if (rc) this.recapPops(rc, rt);
    else this.sounds(s, storm, sky.night, dt);
    this.hud?.update(s);
    this.lastT = s.t;
    if (!this.gfx?.ready) return;
    // The shadow pass is ~a quarter of the frame; redraw it every other frame (the sun and ships move slowly)
    this.sun.shadow.needsUpdate = (this.shadowFrame++ & 1) === 0;
    this.renderer.render(this.scene, this.camera);
    if (rc && !rc.shot && rt >= rc.shotAt) this.takePostcard(rc, s);
  }

  /** A slow orbit around the whole island. */
  private recapCamera(rt: number, dt: number) {
    const islet = this.last?.districts.some((d) => d.id === 'islet' && d.open);
    const tgt = this.tmp.set(islet ? 8 : -3, 6, 2), R = (islet ? 92 : 74) * (this.aspect < 1.5 ? Math.min(1.6, 1.5 / this.aspect) : 1), el = 0.4, az = this.recap!.az + rt * 0.07;
    const pos = this.tmp2.set(tgt.x + Math.sin(az) * Math.cos(el) * R, tgt.y + Math.sin(el) * R, tgt.z + Math.cos(az) * Math.cos(el) * R);
    const k = 1 - Math.exp(-dt * 1.2);
    this.camPos.lerp(pos, k); this.camTgt.lerp(tgt, k);
    this.camera.position.copy(this.camPos); this.camera.lookAt(this.camTgt);
  }

  /** This ride's new buildings vanish, then pop back in one by one with a sparkle and a rising note. */
  private recapPops(rc: NonNullable<LighthouseRenderer['recap']>, rt: number) {
    for (const [plot, at] of rc.pops) {
      const m = this.models[plot]; if (!m) continue;
      if (rt < at) { m.model.group.visible = false; continue; }
      if (!rc.popped.has(plot)) {
        rc.popped.add(plot); m.model.group.visible = true; m.model.group.scale.setScalar(0.01);
        this.fx.sparkle(V(PLOTS[plot].x, plotHeight(plot) + 2.4, PLOTS[plot].z));
        play('build', { pitch: Math.min(2, 1 + rc.popped.size * 0.06) });
      }
    }
  }

  private takePostcard(rc: NonNullable<LighthouseRenderer['recap']>, s: Snap) {
    rc.shot = true;
    let img = '';
    try { img = snapshot(this.renderer!.domElement); } catch { return; }
    const st = s.stats;
    const card = {
      img, season: s.season, ride: s.ride,
      date: new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
      lines: postcardLines({ ...st, stormsWeathered: st.stormsWeathered, festivalsHeld: s.festivalsHeld }),
    };
    this.hud?.showPostcard(card);
    play('chime');
    void addToAlbum(this.profileId, card).then((l) => this.hud?.setAlbum(l));
  }

  resize(w: number, h: number) {
    this.renderer?.setSize(w, h, false);
    this.aspect = w / Math.max(1, h); this.size = [w, h];
    this.camera.aspect = this.aspect; this.applyView();
  }

  setInsets(i: Insets) { this.insetB = i.bottom; this.hud?.setInsetBottom(i.bottom); this.applyView(); }
  /** Render edge-to-edge, but shift the view up so the framed island is centred above the controller HUD. */
  private applyView() {
    const [w, h] = this.size, b = Math.min(this.insetB, h / 2);
    if (b > 0) this.camera.setViewOffset(w, Math.max(1, h), 0, b / 2, w, Math.max(1, h)); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  unmount() {
    this.ro?.disconnect();
    this.renderer?.domElement.removeEventListener('pointerdown', this.onDown);
    this.ambience.dispose(); this.music.dispose();
    this.hud?.unmount();
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
    disposeShared();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.ships.clear();
  }
}
