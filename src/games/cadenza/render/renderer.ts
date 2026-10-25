import * as THREE from 'three';
import type { BikeState, GameRenderer, InputState, Insets, MusicFx, Profile } from '../../../contracts';
import { play } from '../../../audio/sfx';
import type { CadenzaSnapshot } from '../sim/sim';
import { sampleAt, zoneIndexAt, type Track } from '../sim/track';
import { Blocks } from './blocks';
import { advanceDegradation, type Degradation } from './degradation';
import { disposeObjects } from './dispose';
import { City } from './city';
import { Craft, isCraftKind } from './craft';
import { selectedShip, type ShipId } from '../ships';
import { Gauge, gaugeMarks } from './gauge';
import { Hud } from './hud';
import { layout } from './layout';
import { U } from './look';
import { newFrame, Path } from './path';
import { Post } from './post';
import { buildTrackMeshes } from './trackMesh';

/**
 * Wipeout HD Zone meets Tron / Blade Runner 2049: a neon ribbon through a smoggy megacity whose towers stretch with
 * the music, tunnels of light rings, hard banked turns, blocks that pulse on the beat and get sucked into the ship
 * (or shatter), acid colour in drops. All shaders share the uniforms in look.ts; this file just drives them.
 */
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

export class CadenzaRenderer implements GameRenderer {
  private renderer?: THREE.WebGLRenderer; private post?: Post;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(70, 4 / 3, 0.3, 2000);
  private musicFx?: (fx: MusicFx) => void;
  private hud?: Hud; private ro?: ResizeObserver; private flash?: HTMLDivElement;
  private size: [number, number] = [800, 600]; private insetB = 0;
  private color = '#00f0ff';
  private windowBucket = -1; private track?: Track; private path?: Path; private world = new THREE.Group();
  private blocks?: Blocks; private city?: City; private craft?: Craft; private gauge?: Gauge;
  private craftKind: ShipId = 'triad';
  /** Launch exit burst (0..1 by rating, decays), and queued fireworks [time, kind]. */
  private launchKick = 0; private fireworks: Array<{ at: number; c: THREE.Color }> = []; private lastRecap = -2; // -2 = not primed (never replay a recap on mount)
  private streaks?: THREE.LineSegments; private streakPos = new Float32Array(0);
  private hue = 200; private hueTarget = 200; private lastZone = -1; private lastCue = -1; private lastT = now(); private lastX = 0; private bank = 0;
  private degradation: Degradation = { belowS: 0, level: 0 }; private lastP = 0;
  private shake = 0; private hurt = 0; private down = 0; private lastDown = -1;
  private motion = 0.6;
  private camPos = new THREE.Vector3(); private camLook = new THREE.Vector3(); private camUp = new THREE.Vector3(0, 1, 0); private camInit = false;
  private fr = newFrame(); private fc = newFrame(); private v = new THREE.Vector3(); private s = new THREE.Vector3(); private m = new THREE.Matrix4();
  private white = new THREE.Color('#ffffff'); private worldUp = new THREE.Vector3(0, 1, 0);

  mount(container: HTMLElement, ctx: { profile: Readonly<Profile>; send?: (action: unknown) => void; insets?: Insets; musicFx?: (fx: MusicFx) => void }) {
    this.musicFx = ctx.musicFx;
    this.insetB = ctx.insets?.bottom ?? 0;
    this.color = ctx.profile.color;
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
    r.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
    container.appendChild(r.domElement);
    this.renderer = r;
    this.scene.background = new THREE.Color('#05040c');
    this.scene.add(this.world, this.camera);
    const ship = selectedShip(ctx.profile); this.craftKind = ship;
    this.craft = new Craft(this.color, isCraftKind(ship) ? ship : undefined);
    this.scene.add(this.craft.group, this.craft.trailMesh);
    this.buildStreaks();
    this.post = new Post(r, this.scene, this.camera);
    this.flash = document.createElement('div');
    this.flash.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:#fff;opacity:0;transition:opacity .25s';
    container.appendChild(this.flash);
    this.hud = new Hud(container); this.hud.setSend(ctx.send);
    this.resize(container.clientWidth || 800, container.clientHeight || 600);
    if (typeof ResizeObserver !== 'undefined') { this.ro = new ResizeObserver(() => this.resize(container.clientWidth || 800, container.clientHeight || 600)); this.ro.observe(container); }
  }

  setInsets(insets: Insets) { this.insetB = insets.bottom; this.resize(...this.size); }
  resize(w: number, h: number) {
    this.size = [w, h];
    if (!this.renderer) return;
    this.renderer.setSize(w, h, false); this.post?.setSize(w, h);
    this.camera.aspect = w / h;
    const L = layout(w, h, this.insetB);
    this.camera.setViewOffset(w, h, 0, L.viewOffsetY, w, h);
    this.camera.updateProjectionMatrix();
    this.hud?.place(L);
  }
  unmount() {
    this.musicFx?.({ degrade: 0 });
    this.ro?.disconnect(); this.hud?.dispose(); this.flash?.remove();
    disposeObjects(this.scene); this.scene.clear();
    this.post?.dispose(); this.renderer?.dispose(); this.renderer?.domElement.remove();
  }

  private buildStreaks() {
    const n = 110; this.streakPos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) this.respawnStreak(i, -Math.random() * 140);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.streakPos, 3));
    this.streaks = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
    this.streaks.frustumCulled = false;
    this.camera.add(this.streaks);
  }
  private respawnStreak(i: number, z: number) {
    const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 16, x = Math.cos(a) * r, y = Math.sin(a) * r * 0.65;
    this.streakPos.set([x, y, z, x, y, z - 3 - Math.random() * 7], i * 6);
  }

  private build(t: Track, p: number) {
    if (t !== this.track) this.path = new Path(t);
    this.track = t;
    this.windowBucket = Math.floor(p / 30);
    const fromS = Math.max(0, this.windowBucket * 30 - 20), toS = Math.min(t.durationS, (this.windowBucket + 1) * 30 + 90);
    disposeObjects(this.world); this.world.clear();
    this.world.add(buildTrackMeshes(this.path!, fromS, toS));
    this.blocks = new Blocks(this.path!, fromS, toS);
    this.gauge = new Gauge(this.path!);
    this.world.add(this.blocks.group, this.gauge.mesh);
    this.lastRecap = -2;
    this.city?.removeFrom(this.scene);
    this.city = new City(this.path!, 1, fromS, toS);
    this.city.addTo(this.scene);
  }

  render(snapshot: unknown, _bike: Readonly<BikeState>, _input: Readonly<InputState>) {
    const s = snapshot as CadenzaSnapshot;
    if (!this.renderer || !this.post || !this.hud || !this.craft) return;
    if (s.ship && s.ship !== this.craftKind) {
      this.scene.remove(this.craft.group, this.craft.trailMesh);
      disposeObjects(this.craft.group); disposeObjects(this.craft.trailMesh);
      this.craftKind = s.ship; this.craft = new Craft(this.color, s.ship);
      this.scene.add(this.craft.group, this.craft.trailMesh);
    }
    const p = s.menu ? 0 : Math.max(0, s.p);
    if (Math.abs(p - this.lastP) > 3) this.camInit = false; // seeks snap the chase camera to the new road
    if (s.track !== this.track || Math.floor(p / 30) !== this.windowBucket) this.build(s.track, p);
    const t = this.track!, path = this.path!;
    const tNow = now(), dt = Math.min(0.1, tNow - this.lastT); this.lastT = tNow;
    const reduced = s.reducedFlash;
    const motionTarget = s.effort.phase === 'recover' ? 0.12 : s.effort.phase === 'cruise' ? 0.55 : 1;
    this.motion += (motionTarget - this.motion) * (1 - Math.exp(-dt / 1.2));
    const fx = (reduced ? 0.35 : 1) * this.motion;
    U.uMotion.value = fx;

    // cues → sounds and callouts (never replay history on mount)
    if (this.lastCue < 0) this.lastCue = s.cues.length ? s.cues[s.cues.length - 1].id : 0;
    for (const c of s.cues) {
      if (c.id <= this.lastCue) continue;
      this.lastCue = c.id;
      if (c.type === 'effort' && c.data?.phase === 'sprint') { this.flashOnce(0.25 * fx); this.shake = Math.max(this.shake, 0.35); }
      else if (c.type === 'dropout') play('lampOut');
      else if (c.type === 'reboot') { play('railReady'); this.hud.pop('REBOOTED', tNow); }
      else if (c.type === 'cleanZone') { play('reward', { vol: 0.6 }); this.hud.pop(`+${c.data?.bonus ?? ''}`, tNow); if (s.effort.phase !== 'recover') this.queueFireworks(tNow, 5); }
      else if (c.type === 'launch' && c.data) {
        const k = ({ perfect: 1, great: 0.66, good: 0.33, weak: 0 } as Record<string, number>)[String(c.data.rating)] ?? 0;
        this.launchKick = k; this.shake = Math.max(this.shake, 0.7 * k); this.craft.absorb(this.white); this.craft.ring(k);
        if (k > 0) this.flashOnce(0.3 * fx * k);
        play(k >= 1 ? 'levelup' : k > 0 ? 'reward' : 'deny', { vol: 0.7 });
        if (k >= 1) this.queueFireworks(tNow, 6);
      }
      else if (c.type === 'chain' && c.data) { const n = Number(c.data.n); this.hud.pop(`CHAIN ${n}`, tNow); this.craft.ring(Math.min(1, n / 100)); play('pickup', { vol: 0.5 }); }
      else if (c.type === 'chainBreak' && c.data) { this.hud.pop(`CHAIN ${c.data.n} BROKEN`, tNow, true); }
      else if (c.type === 'dropHeld') play('milestone', { vol: 0.6 });
      else if (c.type === 'overdrive') play('overdrive', { vol: 0.4 });
      else if (c.type === 'grey') play('hurt', { vol: 0.6 });
      else if (c.type === 'newBest') play('levelup');
      else if (c.type === 'menuMove') play('uiMove');
    }

    // music-driven uniforms
    const zone = t.zones[zoneIndexAt(t, p)], drop = s.effort.phase === 'sprint';
    if (s.zone.index !== this.lastZone) { this.lastZone = s.zone.index; this.hueTarget = s.zone.hue; if (s.menu) this.hue = s.zone.hue; }
    const bands = [0, 1, 2].map((b) => sampleAt(t.bands[b], t.hz, p));
    const drift = (18 * Math.sin(tNow * 0.35) + 22 * bands[1]) * fx;
    const dh = ((this.hueTarget - this.hue + 540) % 360) - 180;
    this.hue = (this.hue + dh * Math.min(1, dt * (reduced ? 2 : 10)) + 360) % 360;
    const h = (((this.hue + drift) % 360) + 360) % 360 / 360;
    U.uAcc.value.setHSL(h, 1, 0.5); U.uAcc2.value.setHSL((h + 0.5) % 1, 1, 0.55);
    U.uFog.value.setHSL(h, 0.65, drop ? 0.03 : 0.013).lerp(U.uWarm.value, 0.04);
    (this.scene.background as THREE.Color).copy(U.uFog.value);
    const bi = lastLE(t.beats, p), lastBeat = bi >= 0 ? t.beats[bi] : -9;
    const di = lastLE(t.downbeats, p);
    if (di !== this.lastDown && di >= 0 && !s.menu) { this.lastDown = di; this.down = 1; }
    this.down = Math.max(0, this.down - dt * 3);
    const beat = s.menu ? 0 : Math.exp(-(p - lastBeat) * 7);
    U.uBeat.value = beat * fx; U.uDown.value = this.down * fx; U.uBeatAge.value = s.menu ? 9 : p - lastBeat;
    U.uBands.value.set(bands[0], bands[1], bands[2]).multiplyScalar(s.menu ? 0.3 : fx);
    U.uTime.value = tNow % 1000;
    const buildProg = s.effort.phase === 'climb' && zone.kind === 'build' ? (p - zone.t0) / Math.max(1, zone.t1 - zone.t0) : 0;
    U.uAcid.value = (drop ? 0.85 : s.overdrive ? 0.6 : buildProg * 0.35) * fx;

    // craft on the (banked) track
    const dCraft = path.distAt(p);
    U.uCraftM.value = dCraft;
    path.at(dCraft, this.fr);
    const vx = (s.x - this.lastX) / Math.max(dt, 1e-3); this.lastX = s.x;
    this.bank += (THREE.MathUtils.clamp(-vx * 0.035, -0.3, 0.3) - this.bank) * Math.min(1, dt * 8);
    path.point(dCraft, s.x, 0.9, this.fr, this.v);
    this.craft.group.position.copy(this.v);
    this.m.makeBasis(this.fr.r, this.fr.u, this.s.copy(this.fr.f).negate());
    this.craft.group.quaternion.setFromRotationMatrix(this.m);
    if (s.menu || p < this.lastP) this.degradation = { belowS: 0, level: 0 };
    this.lastP = p;
    this.degradation = advanceDegradation(this.degradation, s.menu ? 0 : s.effort.under, dt);
    const under = this.degradation.level, over = s.menu ? 0 : s.effort.over * this.motion;
    const tier = s.chain >= 100 ? 3 : s.chain >= 50 ? 2 : s.chain >= 25 ? 1 : 0;
    this.craft.update(dt, tNow, { overdrive: s.overdrive, ghost: !!s.dropout, bank: this.bank, beat: beat * fx, over, under, tier }, this.fr.r, this.fr.u);
    this.musicFx?.({ degrade: under });

    // blocks
    const speed = s.menu ? 0 : sampleAt(t.speed, t.hz, p);
    this.blocks!.update(s.blockState, this.craft.group.position, dCraft, this.fr.f, speed, dt, tNow, {
      absorb: (c) => { this.craft!.absorb(c); play('coin', { vol: 0.14, minGapS: 0.05, pitch: 0.9 + 0.3 * Math.random() }); },
      greyHit: () => { this.craft!.greyHit(); this.shake = 1; this.hurt = 1; },
    });

    // the power gauge on the track edges (rpm against 55 in ERG, where the trainer holds the watts)
    const ef = s.effort;
    const gm = ef.erg ? gaugeMarks(ef.cadence, ef.phase === 'recover' ? 0 : 55, 0) : gaugeMarks(ef.ftp, ef.floorFtp, ef.ceilingFtp);
    this.gauge!.update(dCraft, gm, tNow, dt, s.menu || s.launch?.active ? 0 : 1);
    // fireworks (clean zones, perfect launches): bursts high over the track ahead, on a stagger
    this.fireworks = this.fireworks.filter((f) => {
      if (s.effort.phase === 'recover') return false;
      if (tNow < f.at) return true;
      path.point(dCraft + 70 + Math.random() * 30, (Math.random() - 0.5) * 8, 14 + Math.random() * 10, this.fc, this.v);
      this.blocks!.firework(this.v, f.c); play('explode', { vol: 0.25, minGapS: 0.1, pitch: 1.4 + 0.4 * Math.random() });
      return false;
    });

    // speed streaks (stronger in drops / Overdrive / tunnels, and a burst out of a launch)
    this.launchKick = Math.max(0, this.launchKick - dt * 0.6);
    const sl = this.streaks!, sm = sl.material as THREE.LineBasicMaterial;
    sm.opacity = Math.min(0.95, (drop ? 0.35 : 0.1) + (s.overdrive ? 0.35 : 0) + this.fr.tunnel * 0.25 + 0.6 * this.launchKick) * (s.menu ? 0 : fx * fx);
    sm.color.copy(U.uAcc2.value).lerp(this.white, 0.5 + 0.4 * this.launchKick);
    for (let i = 0; i < this.streakPos.length / 6; i++) {
      const step = speed * (1.6 + 2.5 * this.launchKick) * dt, z = this.streakPos[i * 6 + 2] + step;
      if (z > 2) this.respawnStreak(i, -130 - Math.random() * 20);
      else { this.streakPos[i * 6 + 2] = z; this.streakPos[i * 6 + 5] += step; }
    }
    (sl.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;

    // chase camera, rolling with the bank. A launch punches in close for the roll, then flings back out wide.
    const roll = s.launch?.active ? Math.sin(Math.PI * Math.min(1, s.launch.progress * 1.15)) : 0;
    path.at(dCraft - 9.5 + 3.5 * roll, this.fc);
    const camTarget = this.fc.p.clone().addScaledVector(this.fc.r, s.x * 3.2 * 0.6).addScaledVector(this.fc.u, 4.6);
    path.at(dCraft + 24, this.fc);
    const look = this.fc.p.clone().addScaledVector(this.fc.r, s.x * 3.2 * 0.3).addScaledVector(this.fc.u, 0.6);
    if (!this.camInit) { this.camPos.copy(camTarget); this.camLook.copy(look); this.camUp.copy(this.fr.u); this.camInit = true; }
    this.camPos.lerp(camTarget, Math.min(1, dt * 8)); this.camLook.lerp(look, Math.min(1, dt * 10));
    this.camUp.lerp(this.v.copy(this.fr.u).lerp(this.worldUp, 0.12), Math.min(1, dt * 5)).normalize();
    this.shake = Math.max(0, this.shake - dt * 2.5); this.hurt = Math.max(0, this.hurt - dt * 2);
    const sh = this.shake * 0.9 * fx;
    this.camera.position.copy(this.camPos).add(this.s.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh));
    this.camera.up.copy(this.camUp);
    this.camera.lookAt(this.camLook);
    const fov = 70 + (drop ? 7 : 0) + (s.overdrive ? 6 : 0) + 3 * bands[0] * fx - 14 * roll + 16 * this.launchKick;
    if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * (roll > 0 ? 9 : 4)); this.camera.updateProjectionMatrix(); }
    this.city!.follow(this.camera, this.fr.f, tNow);

    this.post.set({
      bloom: (0.32 + 0.3 * this.motion + (drop ? 0.25 : 0) + 0.3 * beat * fx + (s.overdrive ? 0.2 : 0)) * 0.85,
      aberr: (0.0012 + 0.006 * this.down + 0.004 * beat * (drop ? 1 : 0.4) + 0.01 * this.hurt) * fx,
      hurt: this.hurt * fx, time: tNow % 100, gray: under * (reduced ? 0.5 : 1),
    });
    if (this.lastRecap === -2) this.lastRecap = s.recaps.length - 1;
    else if (s.recaps.length - 1 > this.lastRecap) { this.lastRecap = s.recaps.length - 1; this.hud.recap(s.recaps[this.lastRecap], tNow); }
    this.hud.update(s, `#${U.uAcc.value.getHexString()}`, tNow);
    this.post.render();
  }

  private queueFireworks(t: number, n: number) {
    // in the track's palette: accent, its complement, and white-hot
    const palette = [U.uAcc.value, U.uAcc2.value, this.white];
    for (let i = 0; i < n; i++) this.fireworks.push({ at: t + 0.12 + i * 0.28, c: palette[(i + Math.floor(t)) % palette.length].clone() });
  }

  private flashOnce(opacity: number, color = '#ffffff') {
    const f = this.flash; if (!f || opacity <= 0) return;
    f.style.transition = 'none'; f.style.background = color; f.style.opacity = String(opacity);
    requestAnimationFrame(() => { f.style.transition = 'opacity .35s'; f.style.opacity = '0'; });
  }
}

function lastLE(xs: number[], v: number): number {
  let lo = 0, hi = xs.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (xs[m] <= v) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}
