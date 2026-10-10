import * as THREE from 'three';
import type { BikeState, GameRenderer, InputState, Insets, Profile } from '../../../contracts';
import { NO_INSETS } from '../../../contracts';
import type { SfSnapshot } from '../sim/types';
import { craftName } from '../sim/save';
import { sectionLabel } from '../sim/director';
import { bossModel, disposeModel, geometries, shipModel } from './models';
import { layout } from './layout';
import { createSpace } from './space';
import { SECTORS } from '../sim/content';

export class SfRenderer implements GameRenderer {
  private container?: HTMLElement; private webgl?: THREE.WebGLRenderer; private overlay?: HTMLDivElement;
  private scene = new THREE.Scene(); private camera = new THREE.OrthographicCamera(-55, 55, 50, -50, 0.1, 600);
  private insets: Insets = NO_INSETS; private w = 800; private h = 600; private observer?: ResizeObserver;
  private craft?: THREE.Group; private craftKind = ''; private color = '#5b8cff'; private send?: (a: unknown) => void;
  private enemies = new Map<number, THREE.Group>(); private wings: THREE.Group[] = [];
  private bullets?: THREE.InstancedMesh; private bolts?: THREE.InstancedMesh; private effects?: THREE.InstancedMesh;
  private starfield?: THREE.Points; private halo?: THREE.Mesh; private space?: ReturnType<typeof createSpace>;
  private matrix = new THREE.Object3D(); private lastMenu = ''; private last?: SfSnapshot;
  private header?: HTMLElement; private status?: HTMLElement; private footer?: HTMLElement; private menu?: HTMLElement;
  private controls = (event: Event) => {
    const el = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if (el?.dataset.action === 'nova') this.send?.({ type: 'nova' });
    if (el?.dataset.action === 'launch') this.send?.({ type: 'launch' });
    if (el?.dataset.action === 'craft') this.send?.({ type: 'craft', craft: el.dataset.craft });
  };
  mount(container: HTMLElement, ctx: { profile: Readonly<Profile>; send?: (a: unknown) => void; insets?: Insets }) {
    this.container = container; this.color = ctx.profile.color; this.send = ctx.send; this.insets = ctx.insets ?? NO_INSETS;
    const gl = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    gl.setPixelRatio(Math.min(1.5, devicePixelRatio || 1)); gl.setClearColor('#050917', 0);
    gl.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    this.webgl = gl; container.appendChild(gl.domElement);
    const overlay = document.createElement('div'); overlay.dataset.squadronBackdrop = ''; this.overlay = overlay;
    overlay.style.cssText = 'position:absolute;inset:0;color:#eaf5ff;font:14px system-ui;pointer-events:none;background:radial-gradient(ellipse at 70% 35%,#22456044,transparent 50%),radial-gradient(ellipse at 20% 70%,#6b235333,transparent 55%);';
    // Backdrop beneath the transparent Three.js surface, HUD above it.
    container.insertBefore(overlay, gl.domElement);
    const hud = document.createElement('div'); hud.style.cssText = 'position:absolute;inset:0;pointer-events:none;color:#eaf5ff;font:14px system-ui';
    overlay.appendChild(hud); overlay.style.zIndex = '0'; gl.domElement.style.zIndex = '1';
    container.appendChild(hud); hud.style.zIndex = '2'; this.overlay = hud;
    this.header = document.createElement('div'); this.status = document.createElement('div'); this.footer = document.createElement('div'); this.menu = document.createElement('div');
    for (const el of [this.header, this.status, this.footer, this.menu]) hud.appendChild(el);
    this.header.style.cssText = 'position:absolute;display:flex;justify-content:space-between;gap:12px;padding:12px 20px;box-sizing:border-box;background:linear-gradient(#050917ee,#05091788);';
    this.status.style.cssText = 'position:absolute;text-align:center;font-size:13px;color:#a8bfd5';
    this.footer.innerHTML = '<div style="min-width:0"><div class="sq-song" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div><div class="sq-detail" style="font-size:11px;color:#8aa9c2"></div></div><button data-action="nova" style="pointer-events:auto;border:1px solid #5a879e;background:#102d42;color:#dff8ff;padding:8px 12px;border-radius:8px;white-space:nowrap"></button>';
    this.footer.style.cssText = 'position:absolute;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 20px;box-sizing:border-box;background:#05091799';
    this.menu.style.cssText = 'position:absolute;display:none;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;background:#050917b8;pointer-events:auto;overflow:auto';
    hud.addEventListener('click', this.controls);
    this.scene.add(new THREE.HemisphereLight('#c6e9ff', '#142035', 2.7));
    const key = new THREE.DirectionalLight('#e6f3ff', 3.5); key.position.set(-25, 40, -30); this.scene.add(key);
    const rim = new THREE.DirectionalLight('#9574ff', 2); rim.position.set(30, 15, 40); this.scene.add(rim);
    this.camera.position.set(0, 115, 95); this.camera.lookAt(0, 0, -3);
    const stars = new Float32Array(240 * 3);
    for (let i = 0; i < 240; i++) { stars[i * 3] = ((i * 71) % 240) - 120; stars[i * 3 + 1] = -8 - (i % 7) * 3; stars[i * 3 + 2] = ((i * 43) % 220) - 110; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(stars, 3));
    this.starfield = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#7898bf', size: 0.4, transparent: true, opacity: 0.7 })); this.scene.add(this.starfield);
    this.space = createSpace(this.scene);
    this.halo = new THREE.Mesh(geometries.ring, new THREE.MeshBasicMaterial({ color: '#86e7ff', transparent: true, opacity: 0.35, depthWrite: false })); this.scene.add(this.halo);
    const makePool = (geo: THREE.BufferGeometry, color: string, count: number) => {
      const pool = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }), count);
      pool.count = 0; pool.frustumCulled = false; this.scene.add(pool); return pool;
    };
    this.bullets = makePool(geometries.box, '#a4f3ff', 300); this.bolts = makePool(geometries.sphere, '#ff9072', 160); this.effects = makePool(geometries.ring, '#ffcc8a', 160);
    this.observer = new ResizeObserver(() => this.resize(container.clientWidth, container.clientHeight)); this.observer.observe(container);
    this.resize(container.clientWidth || 800, container.clientHeight || 600);
  }
  setInsets(insets: Insets) { this.insets = { ...insets }; this.resize(this.w, this.h); }
  resize(w: number, h: number) {
    this.w = Math.max(1, w); this.h = Math.max(1, h); this.webgl?.setSize(this.w, this.h, false);
    const l = layout(this.w, this.h, this.insets), aspect = l.field.w / Math.max(1, l.field.h);
    const height = Math.max(82, 110 / Math.max(0.1, aspect)), width = height * aspect;
    this.camera.left = -width / 2; this.camera.right = width / 2; this.camera.top = height / 2; this.camera.bottom = -height / 2; this.camera.updateProjectionMatrix();
    if (this.header) Object.assign(this.header.style, { left: `${l.safe.x}px`, top: `${l.safe.y}px`, width: `${l.safe.w}px`, height: `${Math.min(74, l.header)}px` });
    if (this.status) Object.assign(this.status.style, { left: `${l.safe.x + 12}px`, top: `${l.safe.y + Math.min(74, l.header)}px`, width: `${Math.max(0, l.safe.w - 24)}px`, height: `${Math.max(0, l.header - 74)}px` });
    if (this.footer) Object.assign(this.footer.style, { left: `${l.safe.x}px`, top: `${l.safe.y + l.safe.h - l.footer}px`, width: `${l.safe.w}px`, height: `${l.footer}px` });
    if (this.menu) Object.assign(this.menu.style, { left: `${l.safe.x}px`, top: `${l.safe.y}px`, width: `${l.safe.w}px`, height: `${l.safe.h}px` });
  }
  render(snapshot: unknown, _bike: Readonly<BikeState>, _input: Readonly<InputState>) {
    const s = snapshot as SfSnapshot; this.last = s;
    if (!this.webgl || !this.header || !this.status || !this.footer || !this.menu) return;
    if (this.craftKind !== s.craft) {
      if (this.craft) { this.scene.remove(this.craft); disposeModel(this.craft); }
      this.craft = shipModel(this.color, s.craft === 'escort' ? 'escort' : 'player'); this.craftKind = s.craft; this.scene.add(this.craft);
    }
    this.craft!.position.set(s.shipX, 0, s.shipY - 50); this.craft!.rotation.z = Math.cos(s.t * 0.22) * -0.1;
    this.craft!.scale.setScalar(1 + (s.gunLevel - 1) * 0.055);
    this.craft!.traverse(o => { if (o.name === 'engine') o.scale.z = 1.2 + s.beat * 0.8 + s.quality * 0.6; });
    this.craft!.visible = s.rejoinLeft <= 0 || Math.sin(s.t * 4) > 0;
    while (this.wings.length < s.wingmen) { const wing = shipModel('#658dc5', 'player'); wing.scale.setScalar(0.5); this.wings.push(wing); this.scene.add(wing); }
    this.wings.forEach((wing, i) => { wing.visible = i < s.wingmen; wing.position.set(s.shipX + (i ? 10 : -10), 0, s.shipY - 47); });
    const live = new Set<number>();
    for (const e of s.enemies) {
      live.add(e.id); let model = this.enemies.get(e.id);
      if (!model) { model = e.kind === 'boss' ? bossModel(e.bossStyle) : shipModel(e.kind === 'armor' ? '#b99358' : e.kind === 'weaver' ? '#ad5b88' : '#bc6b5b', e.kind); model.scale.multiplyScalar(e.kind === 'boss' ? 1 : 0.65); this.enemies.set(e.id, model); this.scene.add(model); }
      model.position.set(e.x, 0, e.y - 50); model.rotation.z = Math.sin(e.age) * 0.09;
    }
    for (const [id, model] of this.enemies) if (!live.has(id)) { this.scene.remove(model); disposeModel(model); this.enemies.delete(id); }
    const mat = this.matrix;
    s.shots.slice(0, 300).forEach((b, i) => { mat.position.set(b.x, 0.7, b.y - 50); mat.rotation.set(0, Math.atan2(b.vx, b.vy), 0); mat.scale.set(b.kind === 'missile' ? 0.8 : 0.28, 0.25, b.kind === 'wing' ? 2.5 : 4); mat.updateMatrix(); this.bullets!.setMatrixAt(i, mat.matrix); });
    this.bullets!.count = Math.min(300, s.shots.length); this.bullets!.instanceMatrix.needsUpdate = true;
    s.bolts.slice(0, 160).forEach((b, i) => { mat.position.set(b.x, 0.6, b.y - 50); mat.rotation.set(0, 0, 0); mat.scale.set(0.7, 0.35, 0.7); mat.updateMatrix(); this.bolts!.setMatrixAt(i, mat.matrix); });
    this.bolts!.count = Math.min(160, s.bolts.length); this.bolts!.instanceMatrix.needsUpdate = true;
    s.fx.slice(-160).forEach((f, i) => { const age = s.t - f.at, size = f.kind === 'nova' ? age * 85 : f.kind === 'boom' ? age * 8 + 1 : age * 4 + 0.5;
      mat.position.set(f.x, 0.8, f.y - 50); mat.rotation.set(0, 0, 0); mat.scale.set(size, Math.max(0.1, 1 - age / 1.6), size); mat.updateMatrix(); this.effects!.setMatrixAt(i, mat.matrix); });
    this.effects!.count = Math.min(160, s.fx.length); this.effects!.instanceMatrix.needsUpdate = true;
    this.halo!.position.set(s.shipX, 0.4, s.shipY - 50); this.halo!.scale.setScalar(7 + s.beat * 0.6);
    (this.halo!.material as THREE.MeshBasicMaterial).opacity = (s.coverLeft > 0 ? 0.6 : 0.12 + s.quality * 0.22) * Math.min(1, s.shield / 40);
    this.starfield!.position.z = (s.t * 1.5) % 30; this.space?.update(s.t, s.intensity, SECTORS[(s.sector - 1) % 5].accent);
    const l = layout(this.w, this.h, this.insets);
    this.webgl.setViewport(l.field.x, this.h - l.field.y - l.field.h, l.field.w, l.field.h); this.webgl.render(this.scene, this.camera);
    const status = { on: 'In the groove', under: 'Keep the pedals turning', over: 'Ease off · return to Zone 2', recover: 'Escort cover · easy spin', settling: 'Find your rhythm' }[s.effort.status];
    this.header.innerHTML = `<div><div style="font-size:11px;letter-spacing:2px;color:#7daac8">SPROCKET SQUADRON</div><strong style="font-size:20px">${craftName(s.craft)}</strong><div style="font-size:12px;color:#a7bfd2">${s.effort.erg ? `${s.effort.targetWatts} W · ERG` : `${s.effort.floorWatts}–${s.effort.ceilingWatts} W · Zone 2`}</div></div><div style="text-align:right"><strong style="font-size:22px;font-variant-numeric:tabular-nums">${s.score.toLocaleString()}</strong><div>Arsenal ${s.gunLevel} · Hull ${Math.round(s.hull)}%</div><div style="color:#83dce9">Shield ${Math.round(s.shield)}%</div></div>`;
    this.status.textContent = s.boss ? `${s.boss.name} · ${Math.max(0, Math.round(s.boss.hp / s.boss.maxHp * 100))}% · ${Math.ceil(s.boss.left)}s` : s.bossIn !== null ? `Flagship inbound in ${Math.ceil(s.bossIn)}s` : s.upcoming ? `${s.upcoming.label} · ${s.upcoming.watts} W in ${Math.ceil(s.upcoming.left)}s` : s.banner || status;
    this.status.style.color = s.effort.status === 'over' || s.quality < 0.6 ? '#ffb986' : '#a8d6e6';
    const novaLabel = s.coverLeft > 0 ? `Cover ${Math.ceil(s.coverLeft)}s` : s.charge >= 100 ? 'Nova · take a breather' : `Nova charging ${Math.floor(s.charge)}%`;
    const songEl = this.footer.querySelector<HTMLElement>('.sq-song')!;
    songEl.textContent = s.song; songEl.style.maxWidth = `${Math.max(70, l.safe.w - 200)}px`;
    this.footer.querySelector('.sq-detail')!.textContent = `${sectionLabel(s.section)} · ${s.cadence ? `Optional ${s.cadence.min}–${s.cadence.max} RPM · ${Math.ceil(s.cadence.left)}s` : status}`;
    const novaButton = this.footer.querySelector<HTMLButtonElement>('button')!;
    novaButton.textContent = novaLabel; novaButton.disabled = s.charge < 100 || s.coverLeft > 0 || s.rejoinLeft > 0;
    novaButton.style.opacity = novaButton.disabled ? '0.65' : '1';
    this.menu.style.display = s.phase === 'hangar' ? 'flex' : 'none';
    const menuKey = `${s.craft}:${s.escortUnlocked}:${s.ergAvailable}`;
    if (menuKey !== this.lastMenu) {
      this.lastMenu = menuKey;
      this.menu.innerHTML = `<div style="width:560px;max-width:100%;text-align:center"><div style="letter-spacing:3px;font-size:12px;color:#9bbed8">HOLD THE GROOVE</div><h1 style="font-size:clamp(24px,4vw,38px);margin:12px 0">Choose your riding style</h1><p style="color:#a7bfd2">Your legs power the guns. Your squadron handles the flying.</p><div style="display:flex;gap:12px;flex-wrap:wrap;margin:24px 0">${(['cruiser', 'escort'] as const).map(c => `<button data-action="craft" data-craft="${c}" ${c === 'escort' && (!s.escortUnlocked || !s.ergAvailable) ? 'disabled' : ''} style="flex:1;min-width:180px;padding:20px 12px;border:1px solid ${c === s.craft ? '#9eeaff' : '#334c68'};border-radius:14px;background:${c === s.craft ? '#163749' : '#0b1829'};color:#eaf5ff;text-align:left"><strong style="font-size:18px">${craftName(c)}</strong><p>${c === 'cruiser' ? 'Steady Zone 2 · virtual gears<br>Pulse cannons and spread volleys' : 'ERG endurance · automatic resistance<br>Wingmen and defensive interception'}</p><small style="color:#a5cbdc">${c === 'escort' && !s.ergAvailable ? 'Requires an ERG-capable trainer' : c === 'escort' && !s.escortUnlocked ? `Unlock in ${Math.ceil(s.unlockMinutes)} on-target minutes` : c === s.craft ? 'Selected' : 'Choose craft'}</small></button>`).join('')}</div><button data-action="launch" style="padding:14px 30px;border:0;border-radius:10px;background:#9ce7ed;color:#092031;font-size:17px;font-weight:700">Launch squadron</button><p class="sq-countdown" style="font-size:12px;color:#88a6bd">Pedalling launches in ${Math.ceil(s.menuLeft)}s · A to launch</p></div>`;
    }
    const countdown = this.menu.querySelector('.sq-countdown');
    if (countdown) countdown.textContent = `Pedalling launches in ${Math.ceil(s.menuLeft)}s · A to launch`;
  }
  debugResources() { return { ...this.webgl?.info.memory, programs: this.webgl?.info.programs?.length ?? 0, enemies: this.enemies.size }; }
  unmount() {
    this.observer?.disconnect(); this.overlay?.removeEventListener('click', this.controls);
    const mats = new Set<THREE.Material>(), geos = new Set<THREE.BufferGeometry>();
    this.scene.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.Points) { geos.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m); } });
    for (const m of mats) m.dispose();
    // Shared model geometry lives for the module lifetime and supports repeated renderer mounts.
    for (const g of geos) if (!(Object.values(geometries) as THREE.BufferGeometry[]).includes(g)) g.dispose();
    for (const pool of [this.bullets, this.bolts, this.effects]) pool?.dispose();
    this.webgl?.dispose(); this.webgl?.domElement.remove(); this.overlay?.remove();
    this.container?.querySelector('[data-squadron-backdrop]')?.remove();
  }
}
