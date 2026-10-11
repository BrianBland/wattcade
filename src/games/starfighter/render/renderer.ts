import { play } from '../../../audio/sfx';
import * as THREE from 'three';
import type { BikeState, GameRenderer, InputState, Insets, Profile } from '../../../contracts';
import { NO_INSETS } from '../../../contracts';
import type { SfSnapshot } from '../sim/types';
import { bossModel, disposeModel, isSharedGeometry, geometries, heavyModel, shipModel } from './models';
import { layout } from './layout';
import { createSpace } from './space';
import { createCombat } from './combat';
import { SquadronPost } from './post';
import { SECTORS } from '../sim/content';
import { SquadronHud, bigPerfect } from './hud';
import { WING_OFFSETS } from '../sim/progression';

export class SfRenderer implements GameRenderer {
  private container?: HTMLElement; private webgl?: THREE.WebGLRenderer; private overlay?: HTMLDivElement;
  private scene = new THREE.Scene(); private camera = new THREE.PerspectiveCamera(48, 1, 0.1, 800);
  private insets: Insets = NO_INSETS; private w = 800; private h = 600; private observer?: ResizeObserver;
  private craft?: THREE.Group; private craftKind = ''; private color = '#5b8cff'; private send?: (a: unknown) => void;
  private enemies = new Map<number, THREE.Group>(); private wings: THREE.Group[] = [];
  private bullets?: THREE.InstancedMesh; private bolts?: THREE.InstancedMesh; private boltGlow?: THREE.InstancedMesh; private effects?: THREE.InstancedMesh;
  private combat?: ReturnType<typeof createCombat>; private ghosts: THREE.Group[] = [];
  private starfield?: THREE.Points; private halo?: THREE.Mesh; private space?: ReturnType<typeof createSpace>;
  private lastFxId = 0;
  private matrix = new THREE.Object3D(); private lastMenu = ''; private last?: SfSnapshot;
  private cameraBase = new THREE.Vector3(); private post?: SquadronPost;
  private tierSeen = 0; private tierAt = new Map<number, number>(); private liveryKey = '';
  private heavy?: THREE.Group; private beams?: THREE.InstancedMesh;
  private hud!: SquadronHud; private lastGrazeId = 0; private lastPerfectAt = -1;
  private controls = (event: Event) => {
    const el = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if (el?.dataset.action === 'target') this.send?.({ type: 'target', direction: Number(el.dataset.direction) });
    if (el?.dataset.action === 'nova') this.send?.({ type: 'nova' });
    if (el?.dataset.action === 'launch') this.send?.({ type: 'launch' });
    if (el?.dataset.action === 'craft') this.send?.({ type: 'craft', craft: el.dataset.craft });
  };
  mount(container: HTMLElement, ctx: { profile: Readonly<Profile>; send?: (a: unknown) => void; insets?: Insets }) {
    this.container = container; this.color = ctx.profile.color; this.send = ctx.send; this.insets = ctx.insets ?? NO_INSETS;
    const gl = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    gl.setPixelRatio(Math.min(1.5, devicePixelRatio || 1)); gl.setClearColor('#050917', 0); gl.info.autoReset = false;
    gl.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    this.webgl = gl; container.appendChild(gl.domElement); this.post = new SquadronPost(gl, this.scene, this.camera);
    const overlay = document.createElement('div'); overlay.dataset.squadronBackdrop = ''; this.overlay = overlay;
    overlay.style.cssText = 'position:absolute;inset:0;color:#eaf5ff;font:14px system-ui;pointer-events:none;background:radial-gradient(ellipse at 70% 35%,#22456044,transparent 50%),radial-gradient(ellipse at 20% 70%,#6b235333,transparent 55%);';
    // Backdrop beneath the transparent Three.js surface, HUD above it.
    container.insertBefore(overlay, gl.domElement);
    this.hud = new SquadronHud(); const hud = this.hud.root; overlay.style.zIndex = '0'; gl.domElement.style.zIndex = '1';
    container.appendChild(hud); hud.style.zIndex = '2'; this.overlay = hud;
    hud.addEventListener('click', this.controls);
    this.scene.add(new THREE.HemisphereLight('#c6e9ff', '#142035', 2.7));
    const key = new THREE.DirectionalLight('#e6f3ff', 3); key.position.set(-25, 40, -30); this.scene.add(key);
    const rim = new THREE.DirectionalLight('#9574ff', 2); rim.position.set(30, 15, 40); this.scene.add(rim);
    this.camera.position.set(0, 110, 100); this.camera.lookAt(0, 0, -6);
    const stars = new Float32Array(240 * 3);
    for (let i = 0; i < 240; i++) { stars[i * 3] = ((i * 71) % 240) - 120; stars[i * 3 + 1] = -8 - (i % 7) * 3; stars[i * 3 + 2] = ((i * 43) % 220) - 110; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(stars, 3));
    this.starfield = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#7898bf', size: 0.4, transparent: true, opacity: 0.7 })); this.starfield.visible = false; this.scene.add(this.starfield);
    this.space = createSpace(this.scene); this.combat = createCombat(this.scene);
    for (let i=0;i<2;i++) {
      const ghost=shipModel('#26dfff','player'); ghost.traverse(o=>{if(/^(tier|trim|stripe)-/.test(o.name))o.visible=false;});
      ghost.traverse(o=>{if(o instanceof THREE.Mesh) for(const m of Array.isArray(o.material)?o.material:[o.material]) {m.transparent=true;m.opacity=0.14;m.depthWrite=false;} });
      ghost.visible=false;this.ghosts.push(ghost);this.scene.add(ghost);
    }
    this.halo = new THREE.Mesh(geometries.ring, new THREE.MeshBasicMaterial({ color: '#86e7ff', transparent: true, opacity: 0.35, depthWrite: false })); this.scene.add(this.halo);
    const makePool = (geo: THREE.BufferGeometry, color: string, count: number) => {
      const pool = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }), count);
      pool.count = 0; pool.frustumCulled = false; this.scene.add(pool); return pool;
    };
    this.bullets = makePool(geometries.box, '#ffffff', 300); this.bolts = makePool(geometries.sphere, '#ffffff', 640); this.boltGlow = makePool(geometries.sphere, '#ff35c7', 640);
    const glowMat=this.boltGlow.material as THREE.MeshBasicMaterial;glowMat.opacity=0.2;glowMat.depthWrite=false;glowMat.blending=THREE.AdditiveBlending; this.effects = makePool(geometries.ring, '#ffcc8a', 160);
    this.beams = makePool(geometries.box, '#8ff6ff', 4); const beamMat = this.beams.material as THREE.MeshBasicMaterial; beamMat.blending = THREE.AdditiveBlending; beamMat.depthWrite = false; beamMat.opacity = 0.55;
    this.observer = new ResizeObserver(() => this.resize(container.clientWidth, container.clientHeight)); this.observer.observe(container);
    this.resize(container.clientWidth || 800, container.clientHeight || 600);
  }
  setInsets(insets: Insets) { this.insets = { ...insets }; this.resize(this.w, this.h); }
  resize(w: number, h: number) {
    this.w = Math.max(1, w); this.h = Math.max(1, h); this.webgl?.setSize(this.w, this.h, false); this.post?.setSize(this.w, this.h);
    const l = layout(this.w, this.h, this.insets), fw = Math.max(1, l.field.w), fh = Math.max(1, l.field.h), aspect = fw / fh;
    this.camera.aspect = aspect;
    const distance = Math.max(145, 130 / Math.max(0.2, aspect));
    this.camera.position.set(0, distance*0.74, distance*0.67); this.camera.lookAt(0, 0, -6); this.cameraBase.copy(this.camera.position);
    // Frame the play area in `field` while the scene itself fills the whole surface (full-bleed backdrop under the HUDs).
    this.camera.setViewOffset(fw, fh, -l.field.x, -l.field.y, this.w, this.h); this.camera.updateProjectionMatrix();
    this.hud?.place(l);
  }
  render(snapshot: unknown, _bike: Readonly<BikeState>, _input: Readonly<InputState>) {
    const s = snapshot as SfSnapshot;
    if (this.last && s.t > this.last.t && s.t-this.last.t < 0.2) {
      if (s.locks.length > this.last.locks.length) play('uiTick',{vol:0.5,pitch:0.7+s.locks.length*0.09,minGapS:0.12});
      if (s.volleyFlash > this.last.volleyFlash) play('whoosh',{vol:0.35,minGapS:0.5});
      if (s.selectedId !== this.last.selectedId && _input.pressed.size) play('uiMove',{vol:0.6});
    }
    const recentBoom = s.fx.some(f=>f.id>this.lastFxId && f.kind==='boom' && s.t-f.at<0.15);
    if(recentBoom) play('kill',{vol:0.25,minGapS:0.2});
    this.lastFxId=Math.max(this.lastFxId,...s.fx.map(f=>f.id));
    this.last = { ...s, locks: [...s.locks] };
    const grazes = s.fx.filter(f => f.kind === 'graze' && f.id > this.lastGrazeId);
    if (grazes.length) { play('uiTick', { vol: 0.16, pitch: 1.7 + Math.min(0.5, grazes.length * 0.1), minGapS: 0.09 }); this.lastGrazeId = grazes[grazes.length - 1].id; }
    if (s.clear.last?.perfect && s.clear.last.at !== this.lastPerfectAt) { this.lastPerfectAt = s.clear.last.at; if (bigPerfect(s.clear.streak)) play('milestone', { vol: 0.35, minGapS: 1 }); else play('uiTick', { vol: 0.25, pitch: 1.2 }); }
    if (!this.webgl) return;
    this.webgl.info.reset(); // bloom renders in passes; count draw calls per frame
    if (this.craftKind !== s.craft) {
      if (this.craft) { this.scene.remove(this.craft); disposeModel(this.craft); }
      this.craft = shipModel(this.color, s.craft === 'escort' ? 'escort' : 'player'); this.craftKind = s.craft; this.scene.add(this.craft);
      this.liveryKey = '';
    }
    const craft = this.craft!, hangar = s.phase === 'hangar', level = s.crafts[s.craft].level;
    // Hangar: show the craft large and turning, wearing its livery and the arsenal it grows into each ride.
    const tier = hangar ? s.crafts[s.craft].arsenalCap : s.gunLevel, wide = this.w > this.h * 1.1, spin = performance.now() / 1000;
    // Showcase spot: the free side of the hangar, pulled most of the way toward the camera along the same sight line.
    const show = hangar ? new THREE.Vector3(wide ? 27 : 0, 16, wide ? 6 : 34).lerp(this.cameraBase, wide ? 0.5 : 0.22) : null;
    const hx = show ? show.x : s.shipX, hz = show ? show.z : s.shipY - 50, hy = show ? show.y : 10;
    craft.position.set(hx, hy, hz); craft.rotation.set(hangar ? 0.5 : 0, hangar ? spin * 0.45 : 0, hangar ? 0 : s.bank);
    craft.scale.setScalar(hangar ? 3.1 : 1.55 + (tier - 1) * 0.055);
    if (tier > this.tierSeen) { for (let k = this.tierSeen + 1; k <= tier; k++) this.tierAt.set(k, this.tierSeen && !hangar ? s.t : -99); this.tierSeen = tier; }
    if (tier < this.tierSeen) { this.tierSeen = tier; }
    craft.traverse(o => {
      if (o.name === 'engine') o.scale.z = 1.2 + s.beat * 0.8 + s.quality * 0.6;
      if (o.name.startsWith('tier-')) {
        const k = Number(o.name.slice(5)); o.visible = k <= tier;
        // Unfold with a slight overshoot; afterburners breathe with the beat.
        const u = Math.min(1, Math.max(0, (s.t - (this.tierAt.get(k) ?? -99)) / 0.55)), grow = u >= 1 ? 1 : 1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2);
        const base = o.userData.scale as THREE.Vector3 | undefined; if (base) o.scale.copy(base).multiplyScalar(Math.max(0.01, grow));
        if (k === 6 && base) o.scale.z = base.z * grow * (1 + s.beat * 0.35);
      }
      if (o.name === 'trim-3') o.visible = level >= 3;
      if (o.name === 'stripe-5') o.visible = level >= 5;
    });
    const key = `${s.craft}:${level}`;
    if (key !== this.liveryKey) {
      // Craft-level livery: tinted engines at 7, gold trim and accents at 10.
      this.liveryKey = key; const u = craft.userData as { trim: THREE.MeshBasicMaterial; engineGlow: THREE.MeshBasicMaterial; white: THREE.MeshStandardMaterial; plume: THREE.MeshBasicMaterial };
      const rider = new THREE.Color(this.color), gold = new THREE.Color('#ffd34d');
      u.trim.color.copy(level >= 10 ? gold : rider.clone().lerp(new THREE.Color('#ffffff'), 0.45));
      u.engineGlow.color.set(level >= 7 ? rider.clone().lerp(new THREE.Color('#ffffff'), 0.3) : new THREE.Color('#38edff'));
      u.plume.color.copy(level >= 7 ? rider.clone().lerp(new THREE.Color('#ffffff'), 0.5) : new THREE.Color('#7ff4ff'));
      u.white.color.set(level >= 10 ? '#ffe08a' : '#eaf6ff'); u.white.metalness = level >= 10 ? 0.85 : 0.4;
    }
    craft.visible = s.rejoinLeft <= 0 || Math.sin(s.t * 4) > 0;
    while (this.wings.length < s.wingmen) {
      // Wingmen fly in the rider's colours, without the lead craft's arsenal or livery parts.
      const wing = shipModel(new THREE.Color(this.color).lerp(new THREE.Color('#658dc5'), 0.35).getStyle(), 'player'); wing.scale.setScalar(0.5);
      wing.traverse(o => { if (/^(tier|trim|stripe)-/.test(o.name)) o.visible = false; });
      this.wings.push(wing); this.scene.add(wing);
    }
    const lift = hangar ? 2 : 1;
    this.wings.forEach((wing, i) => { wing.visible = i < s.wingmen; wing.scale.setScalar(hangar ? 1 : 0.5); wing.position.set(hx + WING_OFFSETS[i] * lift, hy, hz + 3 * lift + (i > 1 ? 4 : 0)); wing.rotation.set(0, craft.rotation.y, hangar ? 0 : s.bank * 0.8); });
    if (s.heavy && !this.heavy) { this.heavy = heavyModel(this.color); this.heavy.scale.setScalar(1.1); this.scene.add(this.heavy); }
    if (this.heavy) { this.heavy.visible = s.heavy; this.heavy.position.set(hx, hy - 1, hz + 9 * lift); this.heavy.rotation.set(0, craft.rotation.y, hangar ? 0 : s.bank * 0.6); this.heavy.scale.setScalar(hangar ? 2 : 1.1); }
    this.ghosts.forEach((g,i)=>{g.visible=s.dodge>0.12;g.position.set(s.shipX-s.bank*(i+1)*9,10,s.shipY-50+(i+1)*2);g.rotation.z=s.bank*0.6;g.scale.copy(this.craft!.scale);});
    this.combat?.update(s);
    const live = new Set<number>();
    for (const e of s.enemies) {
      live.add(e.id); let model = this.enemies.get(e.id);
      if (!model) { model = e.kind === 'boss' ? bossModel(e.bossStyle) : shipModel(e.elite ? '#ffd34d' : e.kind === 'armor' ? '#ffbc3d' : e.kind === 'weaver' ? '#ed3cc6' : '#ff704a', e.kind); model.scale.multiplyScalar(e.kind === 'boss' ? 1 : 1.1); this.enemies.set(e.id, model); this.scene.add(model);
        const lights: Array<[THREE.MeshBasicMaterial, THREE.Color]> = []; model.traverse(o => { if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial && !lights.some(([m]) => m === o.material)) lights.push([o.material, o.material.color.clone()]); }); model.userData.lights = lights; }
      // Running lights breathe on the beat.
      for (const [m, base] of (model.userData.lights ?? []) as Array<[THREE.MeshBasicMaterial, THREE.Color]>) m.color.copy(base).multiplyScalar(0.7 + s.beat * 0.55);
      model.position.set(e.x,e.ground?-3.8:e.kind==='boss'?13-s.beat*0.25:10+Math.sin(e.age)*1.2-s.beat*0.35,e.y-50);
      model.rotation.z=e.ground?0:e.passing||e.entry&&e.age<e.entry.duration?Math.sin(e.heading??0)*-0.5:Math.sin(e.age*1.4)*0.22;
      model.rotation.y=e.ground?(e.kind==='tank'?Math.sin(e.age*0.6)*0.15:0):Math.PI;
      model.traverse(o=>{if(o.name==='barrel')o.rotation.y=Math.atan2(s.shipX-e.x,s.shipY-e.y)-model!.rotation.y;});
    }
    for (const [id, model] of this.enemies) if (!live.has(id)) { this.scene.remove(model); disposeModel(model); this.enemies.delete(id); }
    const mat = this.matrix;
    // Pulse shots change shape with the arsenal: dots, then bolts, then long spears (white, then gold at the top tiers).
    const pulseColor = new THREE.Color();
    s.shots.slice(0, 300).forEach((b, i) => {
      const len = b.kind === 'wing' ? 2.5 : b.tier >= 4 ? 4.8 : b.tier >= 2 ? 3.2 : 1.4, width = b.kind === 'wing' ? 0.28 : b.tier >= 4 ? 0.36 : b.tier >= 2 ? 0.28 : 0.4;
      mat.position.set(b.x, 10.7, b.y - 50); mat.rotation.set(0, Math.atan2(b.vx, b.vy), 0); mat.scale.set(width, 0.25, len); mat.updateMatrix(); this.bullets!.setMatrixAt(i, mat.matrix);
      this.bullets!.setColorAt(i, pulseColor.set(b.kind === 'wing' ? '#a4f3ff' : b.tier >= 7 ? '#ffe27a' : b.tier >= 4 ? '#effcff' : '#a4f3ff'));
    });
    if (this.bullets!.instanceColor) this.bullets!.instanceColor.needsUpdate = true;
    this.bullets!.count = Math.min(300, s.shots.length); this.bullets!.instanceMatrix.needsUpdate = true;
    const pink=new THREE.Color('#ff45c9'),amber=new THREE.Color('#ffd24f');
    s.bolts.slice(0,640).forEach((b,i)=>{
      // Subtle beat pulse: cores swell a little, glows a little more, so the bullet field breathes with the music.
      // Walls are drawn larger so the gate reads; glows stretch along the flight direction as a short trail.
      const big=b.wall?1.6:1, core=(1+s.beat*0.12)*big, halo=(1+s.beat*0.35)*big;
      mat.position.set(b.x,b.height,b.y-50);mat.rotation.set(0,Math.atan2(b.vx,b.vy),0);mat.scale.set(0.85*core,0.55*core,1.2*core);mat.updateMatrix();this.bolts!.setMatrixAt(i,mat.matrix);this.bolts!.setColorAt(i,b.kind==='amber'?amber:pink);
      mat.position.x-=b.vx*0.04;mat.position.z-=b.vy*0.04;mat.scale.set(1.35*halo,1,2*halo+Math.hypot(b.vx,b.vy)*0.06);mat.updateMatrix();this.boltGlow!.setMatrixAt(i,mat.matrix);this.boltGlow!.setColorAt(i,b.kind==='amber'?amber:pink);
    });
    for(const pool of [this.bolts!,this.boltGlow!]) {pool.count=Math.min(640,s.bolts.length);pool.instanceMatrix.needsUpdate=true;if(pool.instanceColor)pool.instanceColor.needsUpdate=true;}
    const shockwaves = s.fx.filter(f => f.kind !== 'intercept' && f.kind !== 'graze' && f.kind !== 'beam' && s.t-f.at < (f.kind==='boom'?0.6:f.kind==='volley'?0.5:1.6)).slice(-160);
    shockwaves.forEach((f, i) => { const age = s.t - f.at, size = f.kind === 'nova' ? age * 85 : f.kind === 'volley' ? age * 36 + 3 : f.kind === 'perfect' ? age * 40 + 2 : f.kind === 'boom' ? age * 8 + 1 : age * 4 + 0.5;
      mat.position.set(f.x, 0.8, f.y - 50); mat.rotation.set(0, 0, 0); mat.scale.set(size, Math.max(0.1, 1 - age / 1.6), size); mat.updateMatrix(); this.effects!.setMatrixAt(i, mat.matrix); });
    this.effects!.count = shockwaves.length; this.effects!.instanceMatrix.needsUpdate = true;
    // Escort phrase beam: a bright column sweeping up the ship's lane, narrowing as it fades.
    const beams = s.fx.filter(f => f.kind === 'beam' && s.t - f.at < 0.6).slice(-4);
    beams.forEach((f, i) => { const life = 1 - (s.t - f.at) / 0.6, length = 140;
      mat.position.set(f.x, 10.5, f.y - 50 - length / 2); mat.rotation.set(0, 0, 0); mat.scale.set((f.size ?? 9) * 2 * life, 0.8, length); mat.updateMatrix(); this.beams!.setMatrixAt(i, mat.matrix); });
    this.beams!.count = beams.length; this.beams!.instanceMatrix.needsUpdate = true;
    this.halo!.position.set(hx, hy + 0.4, hz); this.halo!.visible = !hangar; this.halo!.scale.setScalar(5 + s.beat * 0.6 + s.dodge*2);
    (this.halo!.material as THREE.MeshBasicMaterial).color.set(s.ace ? '#ffd34d' : '#86e7ff');
    (this.halo!.material as THREE.MeshBasicMaterial).opacity = (s.coverLeft > 0 ? 0.6 : 0.12 + s.quality * 0.22) * Math.min(1, s.shield / 40);
    this.starfield!.position.z = (s.t * 1.5) % 30; this.space?.update(s.t, s.intensity, SECTORS[(s.sector - 1) % 5].accent, s.beat, s.bar, s.bar > 0.0005 ? -Math.log(s.bar) / 3 : 9);
    // A barely-there settle of the camera on each bar line.
    this.camera.position.set(this.cameraBase.x, this.cameraBase.y - s.bar * 0.45, this.cameraBase.z - s.bar * 0.3);
    this.webgl.setViewport(0, 0, this.w, this.h); this.post!.grade(s.section, s.intensity); this.post!.render(this.scene, this.camera, s.bar, performance.now());
    this.hud?.update(s);
  }
  debugResources() { return { ...this.webgl?.info.memory, programs: this.webgl?.info.programs?.length ?? 0, enemies: this.enemies.size, drawCalls: this.webgl?.info.render.calls??0 }; }
  unmount() {
    this.observer?.disconnect(); this.overlay?.removeEventListener('click', this.controls);
    const mats = new Set<THREE.Material>(), geos = new Set<THREE.BufferGeometry>();
    this.scene.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.Points) { geos.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m); } });
    for (const m of mats) m.dispose();
    // Shared model geometry lives for the module lifetime and supports repeated renderer mounts.
    for (const g of geos) if (!isSharedGeometry(g)) g.dispose();
    for (const pool of [this.bullets, this.bolts, this.boltGlow, this.effects, this.beams]) pool?.dispose();
    this.combat?.dispose(); this.space?.dispose();
    this.post?.dispose(); this.webgl?.dispose(); this.webgl?.domElement.remove(); this.overlay?.remove();
    this.container?.querySelector('[data-squadron-backdrop]')?.remove();
  }
}
