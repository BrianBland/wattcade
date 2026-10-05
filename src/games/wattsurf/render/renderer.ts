import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BikeState, GameRenderer, InputState, Insets, Profile } from '../../../contracts';
import { play } from '../../../audio/sfx';
import { BLOCK, type WattsurfSnapshot } from '../sim/sim';
import { sampleAt, type Track } from '../sim/track';
import { Hud } from './hud';
import { layout } from './layout';

/**
 * Wipeout HD Zone-style renderer: a black void, a flat glowing ribbon with lane lines and chevrons, two-tone
 * colour per zone (hue jumps on the section's first beat), neon blocks, beat-pulsing pylons and phrase arches,
 * a band-energy skyline on the horizon, speed streaks, bloom. Track geometry is built once per ride.
 */
const LW = 3.2;     // lane width (m)
const EXAG = 3;     // visual height exaggeration
const BLOCK_COLORS = ['#9b5cff', '#3d8bff', '#3dff8a', '#ffd23d', '#ff3d5a'].map((c) => new THREE.Color(c).multiplyScalar(0.62)); // below white so bloom keeps the hue
const GREY = new THREE.Color('#2a2a33');
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

const TRACK_VS = `
varying vec2 vUv; varying float vDepth;
void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
const TRACK_FS = `
uniform vec3 uAcc; uniform vec3 uBase; uniform vec3 uFog; uniform float uLanes; uniform float uInner; uniform float uBeat; uniform float uNear; uniform float uFar;
varying vec2 vUv; varying float vDepth;
void main() {
  float u = vUv.x, au = abs(u);
  float edge = smoothstep(0.90, 0.985, au);
  float lc = (u / uInner) * uLanes * 0.5 + uLanes * 0.5;
  float d = abs(fract(lc + 0.5) - 0.5);
  float line = (1.0 - smoothstep(0.015, 0.05, d)) * step(au, uInner + 0.01);
  float chev = step(fract(vUv.y * 0.18 - au * 0.35), 0.06) * step(au, uInner);
  float grid = step(fract(vUv.y * 0.5), 0.03) * 0.25;
  vec3 c = uBase + uAcc * (edge * 1.6 + line * (0.3 + 0.3 * uBeat) + chev * (0.08 + 0.15 * uBeat) + grid * 0.4);
  float f = smoothstep(uNear, uFar, vDepth);
  gl_FragColor = vec4(mix(c, uFog, f), 1.0);
}`;

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class WattsurfRenderer implements GameRenderer {
  private renderer?: THREE.WebGLRenderer;
  private composer?: EffectComposer; private bloom?: UnrealBloomPass;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(70, 4 / 3, 0.3, 900);
  private hud?: Hud; private ro?: ResizeObserver; private flash?: HTMLDivElement;
  private size: [number, number] = [800, 600]; private insetB = 0;
  private color = '#00f0ff';
  // built per track
  private track?: Track; private world = new THREE.Group();
  private pos = new Float32Array(0); private right = new Float32Array(0); private fwd = new Float32Array(0);
  private trackMat?: THREE.ShaderMaterial; private wallMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.16, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  private pylonMat = new THREE.MeshBasicMaterial({ toneMapped: false }); private archMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  private blocks?: THREE.InstancedMesh; private prevState = new Uint8Array(0); private pops: Array<{ i: number; t0: number; sink?: boolean }> = [];
  private craft = new THREE.Group(); private craftBody?: THREE.MeshBasicMaterial; private craftEdge?: THREE.LineBasicMaterial; private glow?: THREE.Sprite;
  private sky = new THREE.Group(); private skyBars?: THREE.InstancedMesh; private skyMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
  private streaks?: THREE.LineSegments; private streakPos = new Float32Array(0);
  // live state
  private hue = 200; private hueTarget = 200; private lastZone = -1; private lastCue = -1; private lastT = now(); private lastX = 0; private bank = 0; private shake = 0;
  private camPos = new THREE.Vector3(); private camLook = new THREE.Vector3(); private camInit = false;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private v = new THREE.Vector3(); private s = new THREE.Vector3(); private up = new THREE.Vector3(0, 1, 0);
  private tmp = { p: new THREE.Vector3(), r: new THREE.Vector3(), f: new THREE.Vector3() };
  private acc = new THREE.Color(); private base = new THREE.Color(); private fog = new THREE.Color();

  mount(container: HTMLElement, ctx: { profile: Readonly<Profile>; send?: (action: unknown) => void; insets?: Insets }) {
    this.insetB = ctx.insets?.bottom ?? 0;
    this.color = ctx.profile.color;
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
    r.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
    container.appendChild(r.domElement);
    this.renderer = r;
    this.scene.background = new THREE.Color('#05040c');
    this.scene.fog = new THREE.Fog('#05040c', 80, 520);
    this.scene.add(this.world, this.craft, this.camera);
    this.camera.add(this.sky);
    this.buildCraft();
    this.buildSky();
    this.buildStreaks();
    const composer = new EffectComposer(r);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(400, 300), 0.7, 0.35, 0.62);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;
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
    this.renderer.setSize(w, h, false); this.composer?.setSize(w, h);
    this.bloom?.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    const L = layout(w, h, this.insetB);
    this.camera.setViewOffset(w, h, 0, L.viewOffsetY, w, h);
    this.camera.updateProjectionMatrix();
    this.hud?.place(L);
  }

  unmount() {
    this.ro?.disconnect(); this.hud?.dispose(); this.flash?.remove();
    this.composer?.dispose(); this.renderer?.dispose(); this.renderer?.domElement.remove();
    this.world.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); });
  }

  // ---------- builders ----------
  private buildCraft() {
    const body = new THREE.MeshBasicMaterial({ color: new THREE.Color(this.color).multiplyScalar(0.35), transparent: true });
    const hull = new THREE.ConeGeometry(0.95, 3.4, 4, 1); hull.rotateX(-Math.PI / 2); hull.rotateZ(Math.PI / 4); hull.scale(1.25, 0.35, 1);
    const wing = new THREE.BoxGeometry(3.4, 0.12, 0.9); wing.translate(0, -0.05, 0.9);
    const geo = mergeGeometries([hull.toNonIndexed(), wing.toNonIndexed()])!;
    const mesh = new THREE.Mesh(geo, body);
    const edge = new THREE.LineBasicMaterial({ color: this.color, transparent: true, toneMapped: false });
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), edge);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: this.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    this.glow.position.set(0, 0, 1.9); this.glow.scale.setScalar(2.2);
    this.craft.add(mesh, lines, this.glow);
    this.craft.scale.setScalar(1.35);
    this.craftBody = body; this.craftEdge = edge;
  }
  private buildSky() {
    const n = 48, bars = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.skyMat, n);
    for (let i = 0; i < n; i++) { this.m.makeTranslation(0, 0, 0); bars.setMatrixAt(i, this.m); }
    bars.frustumCulled = false;
    this.sky.add(bars); this.skyBars = bars;
  }
  private buildStreaks() {
    const n = 90; this.streakPos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) this.respawnStreak(i, -Math.random() * 120);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.streakPos, 3));
    this.streaks = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
    this.streaks.frustumCulled = false;
    this.camera.add(this.streaks);
  }
  private respawnStreak(i: number, z: number) {
    const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 14, x = Math.cos(a) * r, y = Math.sin(a) * r * 0.6;
    this.streakPos.set([x, y, z, x, y, z - 3 - Math.random() * 5], i * 6);
  }

  private build(t: Track) {
    this.track = t;
    this.world.clear();
    const n = t.dist.length;
    this.pos = new Float32Array(n * 3); this.right = new Float32Array(n * 3); this.fwd = new Float32Array(n * 3);
    let x = 0, z = 0;
    for (let i = 0; i < n; i++) {
      const h = t.curve[i], ds = i ? t.dist[i] - t.dist[i - 1] : 0;
      x += Math.sin(h) * ds; z -= Math.cos(h) * ds;
      this.pos.set([x, t.height[i] * EXAG, z], i * 3);
      this.right.set([Math.cos(h), 0, Math.sin(h)], i * 3);
      this.fwd.set([Math.sin(h), 0, -Math.cos(h)], i * 3);
    }
    const inner = (t.lanes * LW) / 2, W = inner + 1.2;
    // track ribbon
    const vp = new Float32Array(n * 6), uv = new Float32Array(n * 4), idx: number[] = [];
    const wp = new Float32Array(n * 12), widx: number[] = [];
    for (let i = 0; i < n; i++) {
      const [px, py, pz] = [this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]], [rx, , rz] = [this.right[i * 3], 0, this.right[i * 3 + 2]];
      vp.set([px - rx * W, py, pz - rz * W, px + rx * W, py, pz + rz * W], i * 6);
      const v = t.dist[i] / LW;
      uv.set([-1, v, 1, v], i * 4);
      // side walls: left (2 verts) and right (2 verts)
      wp.set([px - rx * W, py, pz - rz * W, px - rx * W, py + 0.8, pz - rz * W, px + rx * W, py, pz + rz * W, px + rx * W, py + 0.8, pz + rz * W], i * 12);
      if (i) {
        const a = (i - 1) * 2, b = i * 2; idx.push(a, b, a + 1, a + 1, b, b + 1);
        const c = (i - 1) * 4, d = i * 4; widx.push(c, d, c + 1, c + 1, d, d + 1, c + 2, d + 2, c + 3, c + 3, d + 2, d + 3);
      }
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(vp, 3)); tg.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); tg.setIndex(idx);
    this.trackMat = new THREE.ShaderMaterial({
      vertexShader: TRACK_VS, fragmentShader: TRACK_FS, side: THREE.DoubleSide, toneMapped: false,
      uniforms: { uAcc: { value: new THREE.Color() }, uBase: { value: new THREE.Color() }, uFog: { value: new THREE.Color() }, uLanes: { value: t.lanes }, uInner: { value: inner / W }, uBeat: { value: 0 }, uNear: { value: 80 }, uFar: { value: 520 } },
    });
    const trackMesh = new THREE.Mesh(tg, this.trackMat); trackMesh.frustumCulled = false;
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.BufferAttribute(wp, 3)); wg.setIndex(widx);
    const walls = new THREE.Mesh(wg, this.wallMat); walls.frustumCulled = false;
    this.world.add(trackMesh, walls);

    // pylons every 28 m on both sides
    const total = t.dist[n - 1], np = Math.floor(total / 28);
    const pylons = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 5, 0.35), this.pylonMat, np * 2);
    for (let k = 0; k < np; k++) for (const side of [-1, 1]) {
      this.atDist(k * 28, this.tmp);
      this.v.copy(this.tmp.p).addScaledVector(this.tmp.r, side * (W + 1.6)).add(this.s.set(0, 2.5, 0));
      this.m.makeTranslation(this.v.x, this.v.y, this.v.z); pylons.setMatrixAt(k * 2 + (side > 0 ? 1 : 0), this.m);
    }
    this.world.add(pylons);
    // arches on phrase starts
    const post = new THREE.BoxGeometry(0.5, 7, 0.5), postL = post.clone().translate(-W - 0.6, 3.5, 0), postR = post.clone().translate(W + 0.6, 3.5, 0);
    const bar = new THREE.BoxGeometry(2 * W + 1.7, 0.5, 0.5).translate(0, 7, 0);
    const archGeo = mergeGeometries([postL, postR, bar])!;
    const phrases = t.phrases.filter((p) => p > 1);
    const arches = new THREE.InstancedMesh(archGeo, this.archMat, Math.max(1, phrases.length));
    phrases.forEach((p, k) => {
      const i = Math.min(n - 1, Math.round(p * t.hz));
      const h = t.curve[i];
      this.q.setFromAxisAngle(this.up, -h);
      this.m.compose(this.v.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]), this.q, this.s.set(1, 1, 1));
      arches.setMatrixAt(k, this.m);
    });
    this.world.add(arches);
    // blocks
    const bm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.95, 0.95, 0.95), new THREE.MeshBasicMaterial({ toneMapped: false }), Math.max(1, t.blocks.length));
    t.blocks.forEach((b, k) => { this.placeBlock(bm, k, 1, 0); bm.setColorAt(k, b.color >= 0 ? BLOCK_COLORS[b.color] : GREY); });
    bm.frustumCulled = false;
    this.world.add(bm); this.blocks = bm; this.prevState = new Uint8Array(t.blocks.length); this.pops = [];
  }

  /** Centreline position/right/forward at distance d. */
  private atDist(d: number, o: { p: THREE.Vector3; r: THREE.Vector3; f: THREE.Vector3 }) {
    const t = this.track!, dist = t.dist;
    let lo = 0, hi = dist.length - 1;
    if (d <= 0) hi = 0; else if (d >= dist[hi]) lo = hi; else { while (hi - lo > 1) { const m = (lo + hi) >> 1; if (dist[m] <= d) lo = m; else hi = m; } }
    const f = hi > lo ? (d - dist[lo]) / (dist[hi] - dist[lo]) : 0;
    const lerp = (a: Float32Array, out: THREE.Vector3) => out.set(a[lo * 3] + (a[hi * 3] - a[lo * 3]) * f, a[lo * 3 + 1] + (a[hi * 3 + 1] - a[lo * 3 + 1]) * f, a[lo * 3 + 2] + (a[hi * 3 + 2] - a[lo * 3 + 2]) * f);
    lerp(this.pos, o.p); lerp(this.right, o.r).normalize(); lerp(this.fwd, o.f).normalize();
    if (d > dist[dist.length - 1]) o.p.addScaledVector(o.f, d - dist[dist.length - 1]);
  }
  private distAt(p: number) { const t = this.track!; return sampleAt(t.dist, t.hz, p) + (p > t.durationS ? (p - t.durationS) * t.speed[t.speed.length - 1] : 0); }

  private placeBlock(bm: THREE.InstancedMesh, k: number, scale: number, lift: number) {
    const t = this.track!, b = t.blocks[k];
    this.atDist(this.distAt(b.t), this.tmp);
    this.v.copy(this.tmp.p).addScaledVector(this.tmp.r, b.lane * LW).add(this.s.set(0, 0.7 + lift, 0));
    this.q.setFromUnitVectors(new THREE.Vector3(0, 0, -1), this.tmp.f);
    this.m.compose(this.v, this.q, this.s.set(scale, scale, scale));
    bm.setMatrixAt(k, this.m);
  }

  // ---------- frame ----------
  render(snapshot: unknown, _bike: Readonly<BikeState>, _input: Readonly<InputState>) {
    const s = snapshot as WattsurfSnapshot;
    if (!this.renderer || !this.composer || !this.hud) return;
    if (s.track !== this.track) this.build(s.track);
    const t = this.track!;
    const tNow = now(), dt = Math.min(0.1, tNow - this.lastT); this.lastT = tNow;
    const p = s.menu ? 0 : Math.max(0, s.p);
    const reduced = s.reducedFlash;

    // cues → sounds, callouts (never replay history on mount)
    if (this.lastCue < 0) this.lastCue = s.cues.length ? s.cues[s.cues.length - 1].id : 0;
    for (const c of s.cues) {
      if (c.id <= this.lastCue) continue;
      this.lastCue = c.id;
      if (c.type === 'zone' && c.data) { this.hud.zoneCallout(Number(c.data.n), String(c.data.kind), tNow); play('whoosh', { vol: 0.5 }); this.flashOnce(reduced ? 0.04 : 0.22); }
      else if (c.type === 'dropout') { play('lampOut'); this.hud.text('DROPOUT', 'hit your target to reboot', tNow); }
      else if (c.type === 'reboot') { play('railReady'); this.hud.text('REBOOTED', 'shield back online', tNow, 1.2); }
      else if (c.type === 'cleanZone') { play('reward', { vol: 0.6 }); this.hud.text('CLEAN ZONE', `+${c.data?.bonus ?? ''}`, tNow, 1.4); }
      else if (c.type === 'dropHeld') play('milestone', { vol: 0.6 });
      else if (c.type === 'overdrive') play('overdrive', { vol: 0.4 });
      else if (c.type === 'grey') { play('hurt', { vol: 0.5 }); this.shake = 0.5; this.flashOnce(reduced ? 0 : 0.12, '#ff2040'); }
      else if (c.type === 'newBest') play('levelup');
      else if (c.type === 'menuMove') play('uiMove');
    }

    // zone colours: hue jumps on a zone change (a quick crossfade; slow with reduced flashing)
    if (s.zone.index !== this.lastZone) { this.lastZone = s.zone.index; this.hueTarget = s.zone.hue; if (this.lastZone >= 0 && s.menu) this.hue = s.zone.hue; }
    const dh = ((this.hueTarget - this.hue + 540) % 360) - 180;
    this.hue = (this.hue + dh * Math.min(1, dt * (reduced ? 2 : 12)) + 360) % 360;
    const drop = s.zone.kind === 'drop';
    this.acc.setHSL(this.hue / 360, 1, 0.5); this.base.setHSL(this.hue / 360, 0.5, 0.012); this.fog.setHSL(this.hue / 360, 0.6, drop ? 0.03 : 0.012);
    (this.scene.background as THREE.Color).copy(this.fog); (this.scene.fog as THREE.Fog).color.copy(this.fog);

    // beat pulse (downbeats stronger)
    const bi = lastIndexLE(t.beats, p), lastBeat = bi >= 0 ? t.beats[bi] : -9;
    const down = bi >= 0 && lastIndexLE(t.downbeats, p) >= 0 && Math.abs(t.downbeats[lastIndexLE(t.downbeats, p)] - lastBeat) < 0.02;
    const beat = Math.exp(-(p - lastBeat) * 7) * (down ? 1 : 0.6) * (reduced ? 0.35 : 1) * (s.menu ? 0 : 1);
    const u = this.trackMat!.uniforms;
    (u.uAcc.value as THREE.Color).copy(this.acc); (u.uBase.value as THREE.Color).copy(this.base); (u.uFog.value as THREE.Color).copy(this.fog); u.uBeat.value = beat;
    this.wallMat.color.copy(this.acc);
    this.pylonMat.color.copy(this.acc).multiplyScalar(0.45 + 1.2 * beat);
    this.archMat.color.copy(this.acc).offsetHSL(0.5, 0, 0).multiplyScalar(0.5 + 1.2 * beat);
    if (this.bloom) this.bloom.strength = 0.55 + (drop ? 0.2 : 0) + 0.25 * beat + (s.overdrive ? 0.2 : 0);

    // craft
    const dCraft = this.distAt(p);
    this.atDist(dCraft, this.tmp);
    const lat = s.x * LW, vx = (s.x - this.lastX) / Math.max(dt, 1e-3); this.lastX = s.x;
    this.v.copy(this.tmp.p).addScaledVector(this.tmp.r, lat).add(this.s.set(0, 0.9 + 0.12 * Math.sin(tNow * 3), 0));
    this.craft.position.copy(this.v);
    this.q.setFromUnitVectors(new THREE.Vector3(0, 0, -1), this.tmp.f);
    this.bank += (THREE.MathUtils.clamp(-vx * 0.035, -0.28, 0.28) - this.bank) * Math.min(1, dt * 8);
    this.craft.quaternion.copy(this.q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.bank));
    const ghost = !!s.dropout;
    this.craftBody!.opacity = ghost ? 0.25 + 0.15 * Math.sin(tNow * 20) : 1;
    this.craftEdge!.opacity = ghost ? 0.4 : 1;
    this.craftEdge!.color.set(s.overdrive ? '#ff2bd6' : this.color);
    this.glow!.material.color.set(s.overdrive ? '#ff2bd6' : ghost ? '#666' : this.color);
    this.glow!.scale.setScalar((s.overdrive ? 3.6 : 2.2) * (0.9 + 0.2 * Math.random()));

    // blocks: collected ones zip up into the craft; greys you hit shatter (shrink)
    const bm = this.blocks!;
    for (let k = 0; k < s.blockState.length; k++) {
      const st = s.blockState[k];
      if (st === this.prevState[k]) continue;
      if (st === BLOCK.HIT) { this.pops.push({ i: k, t0: tNow }); play('coin', { vol: 0.16, minGapS: 0.05, pitch: 0.8 + 0.1 * t.blocks[k].color }); }
      if (st === BLOCK.GREY_HIT || st === BLOCK.MISS || st === BLOCK.GREY_DODGED) this.pops.push({ i: k, t0: tNow, sink: st !== BLOCK.GREY_HIT });
      if (st === BLOCK.AHEAD) this.placeBlock(bm, k, 1, 0); // a restart reset the state
      this.prevState[k] = st;
    }
    this.pops = this.pops.filter((pp) => {
      const a = (tNow - pp.t0) / 0.22;
      this.placeBlock(bm, pp.i, Math.max(0, 1 - a), pp.sink ? -a * 0.8 : a * 1.5);
      return a < 1;
    });
    bm.instanceMatrix.needsUpdate = true;

    // skyline: band energy bars on the horizon, attached to the camera
    const sb = this.skyBars!, nb = sb.count;
    for (let i = 0; i < nb; i++) {
      const band = i % 3, e = sampleAt(t.bands[band], t.hz, p), wob = 0.6 + 0.4 * Math.sin(i * 1.7 + tNow * (1 + band));
      const hgt = 4 + 70 * e * wob * (s.menu ? 0.3 : 1), ang = ((i / (nb - 1)) - 0.5) * 2.2;
      this.m.compose(this.v.set(Math.sin(ang) * 420, -40 + hgt / 2, -Math.cos(ang) * 420), this.q.identity(), this.s.set(9, hgt, 2));
      sb.setMatrixAt(i, this.m);
    }
    sb.instanceMatrix.needsUpdate = true;
    this.skyMat.color.copy(this.acc).offsetHSL(0.5, 0, -0.1);

    // speed streaks (stronger in drops / overdrive)
    const speed = sampleAt(t.speed, t.hz, p) * (s.menu ? 0 : 1);
    const sl = this.streaks!;
    (sl.material as THREE.LineBasicMaterial).opacity = Math.min(0.8, (drop ? 0.35 : 0.08) + (s.overdrive ? 0.4 : 0)) * (s.menu ? 0 : 1);
    for (let i = 0; i < this.streakPos.length / 6; i++) {
      const z = this.streakPos[i * 6 + 2] + speed * 1.6 * dt;
      if (z > 2) this.respawnStreak(i, -120 - Math.random() * 20);
      else { this.streakPos[i * 6 + 2] = z; this.streakPos[i * 6 + 5] += speed * 1.6 * dt; }
    }
    (sl.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;

    // chase camera
    this.atDist(dCraft - 9, this.tmp);
    const camTarget = this.v.copy(this.tmp.p).addScaledVector(this.tmp.r, lat * 0.6).add(this.s.set(0, 4.6, 0)).clone();
    this.atDist(dCraft + 24, this.tmp);
    const look = this.tmp.p.clone().addScaledVector(this.tmp.r, lat * 0.3).add(this.s.set(0, 0.6, 0));
    if (!this.camInit) { this.camPos.copy(camTarget); this.camLook.copy(look); this.camInit = true; }
    this.camPos.lerp(camTarget, Math.min(1, dt * 8)); this.camLook.lerp(look, Math.min(1, dt * 10));
    this.shake = Math.max(0, this.shake - dt * 2);
    this.camera.position.copy(this.camPos).add(this.s.set((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, 0));
    this.camera.lookAt(this.camLook);
    const fov = 70 + (drop ? 6 : 0) + (s.overdrive ? 6 : 0);
    if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 3); this.camera.updateProjectionMatrix(); }

    this.hud.update(s, `#${this.acc.getHexString()}`, tNow);
    this.composer.render();
  }

  private flashOnce(opacity: number, color = '#ffffff') {
    const f = this.flash; if (!f || opacity <= 0) return;
    f.style.transition = 'none'; f.style.background = color; f.style.opacity = String(opacity);
    requestAnimationFrame(() => { f.style.transition = 'opacity .35s'; f.style.opacity = '0'; });
  }
}

function lastIndexLE(xs: number[], v: number): number {
  let lo = 0, hi = xs.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (xs[m] <= v) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}
