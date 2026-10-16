// Dynamo Defense renderer (Canvas 2D). Loaded via dynamic import; reads TdSnapshot only.
import type { BikeState, GameRenderer, InputState, Insets, Profile } from '../../../contracts';
import { play, stopAmbient, type SfxName } from '../../../audio/sfx';
import { BASE_X, BASE_Y, FIELD, LANE_NAMES, PADS, TOWERS, LEVEL_RANGE, lanePolyline } from '../sim/defs';
import type { EnemyView, Fx, TdSnapshot } from '../sim/types';
import { layout, type TdLayout } from './layout';
import { COL, LIGHT, WEAPON_COLOR, drawBase, drawEnemy, drawTower, glowAt } from './sprites';
import { TdHud, type Hit } from './panels';
import { drawConstruction, drawDock } from './construction';
import { AlienLayer, type View } from './aliens/layer';
import { Battlefield } from './battlefield';
import { Machinery } from './machinery';
import { DynamoSound } from './dynamoSound';
import { PAYOFF_STYLE, shimmerBands, stepBlend } from './overdrive';
import { HitFeedback, type Callout, type HitEvent } from './hitFeedback';

const TAU = Math.PI * 2;
// cue -> sound, with a rate limit (s) and volume
const CUES: Record<string, { s: SfxName; gap?: number; vol?: number; pitch?: number }> = {
  shoot: { s: 'shoot', gap: 0.07, vol: 0.45 }, zap: { s: 'teslaCrack', gap: 0.08, vol: 0.7 }, mortar: { s: 'mortarThump', gap: 0.12, vol: 0.8 },
  explode: { s: 'explode', gap: 0.12, vol: 0.55 }, lens: { s: 'prismBeam', gap: 0.1 }, rail: { s: 'railShot' }, railReady: { s: 'railReady' },
  swap: { s: 'swap' }, kill: { s: 'chitinCrunchBig', gap: 0.05, vol: 0.9 }, bossStart: { s: 'bossStart' }, bossDie: { s: 'bossDie' },
  build: { s: 'rivetBuild' }, upgrade: { s: 'boltOn' }, deny: { s: 'deny' }, coin: { s: 'coin' }, repair: { s: 'potion' }, buy: { s: 'buy' },
  select: { s: 'uiMove' }, uiOpen: { s: 'uiSelect' }, uiClose: { s: 'uiBack' }, waveStart: { s: 'hiveHorn' }, waveClear: { s: 'waveClearTd' },
  baseHit: { s: 'hurt', gap: 0.15, vol: 0.5 }, baseHitHeavy: { s: 'hurt', gap: 0.15, vol: 1, pitch: 0.8 }, baseFell: { s: 'lampOut' },
  surge: { s: 'surge' }, emp: { s: 'emp' }, overdrive: { s: 'overdrive' }, spin: { s: 'chime' }, overclock: { s: 'overdrive', pitch: 1.5 }, alarm: { s: 'alarm' }, go: { s: 'go' }, gameOver: { s: 'gameOver' },
};

interface Particle { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; color: string; kind: 'spark' | 'flame' | 'smoke' | 'ring' | 'text' | 'shard' | 'streak'; text?: string; grow?: number; rot?: number; spin?: number; key?: string }
const hash = (n: number) => { let h = (n * 374761393) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export class TdRenderer implements GameRenderer {
  private canvas!: HTMLCanvasElement;
  private mounted = false;
  private g!: CanvasRenderingContext2D;
  private color = '#4cc9f0';
  private insetB = 0;
  private W = 800; private H = 600; private dpr = 1;
  private L!: TdLayout;
  private bg: HTMLCanvasElement | null = null;
  private send?: (a: unknown) => void;
  private hits: Hit[] = [];
  private hud!: TdHud;
  private dynamo = new DynamoSound();
  private particles: Particle[] = [];
  private lastCue = -1; private lastFx = 0;
  private heading = new Map<number, { x: number; y: number; h: number }>();
  private laneShown = { lane: -2, at: -99 };
  private shake = 0; private flash = { color: '#fff', a: 0 }; private lastT = -1; private wall = 0;
  private hitStopUntil = 0;
  /** 0..1 smoothed Overdrive (sprinting) for cable heat, flame, muzzle and edge shimmer */
  private odBlend = 0;
  private hitFx = new HitFeedback();
  /** boss arrival name card start (wall clock) and wave; Exposed window bookkeeping for the first-hit slow-down */
  private intro = { at: -99, wave: 0 };
  private exposedWindow = { open: false, since: 0, slowed: false };
  private snap: TdSnapshot | null = null;
  /** cut-out alien puppets (falls back to the vector sprites until their frames are built) */
  private aliens: AlienLayer | null = null;
  private battlefield!: Battlefield;
  private machinery!: Machinery;
  private view: View = { X: (x) => this.X(x), Y: (y) => this.Y(y), k: 1, dpr: 1 };
  private onPointer = (e: PointerEvent) => this.tap(e);
  private heldPointers = new Map<number, { epoch: number; kind: 'rail' | 'boost' }>();
  private onUp = (e: PointerEvent) => this.releaseHold(e.pointerId, false);
  private onCancel = (e: PointerEvent) => this.releaseHold(e.pointerId, true);
  private onBlur = () => {
    for (const id of [...this.heldPointers.keys()]) this.releaseHold(id, true);
    this.send?.({ type: 'railCancel' }); this.send?.({ type: 'boostCancel' });
  };
  private onVisibility = () => { if (document.hidden) this.onBlur(); };
  private onMove = (e: PointerEvent) => {
    if (!this.heldPointers.has(e.pointerId)) return;
    const r = this.canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) * this.W / r.width, py = (e.clientY - r.top) * this.H / r.height;
    const b = this.heldPointers.get(e.pointerId)!.kind === 'boost' ? this.L.dock.workshop : this.L.dock.actions[2];
    if (px < b.x || px > b.x + b.w || py < b.y || py > b.y + b.h) this.releaseHold(e.pointerId, true);
  };

  private hudControls = false;
  mount(container: HTMLElement, ctx: { profile: Readonly<Profile>; send?: (a: unknown) => void; insets?: Insets; hudControls?: boolean }) {
    this.mounted = true;
    this.hudControls = !!ctx.hudControls;
    this.insetB = ctx.insets?.bottom ?? 0;
    this.color = ctx.profile.color || this.color;
    this.aliens = new AlienLayer(import.meta.env.BASE_URL);
    this.battlefield = new Battlefield(import.meta.env.BASE_URL, () => { this.bg = null; });
    this.machinery = new Machinery(import.meta.env.BASE_URL);
    this.machinery.profile = ctx.profile;
    this.send = ctx.send;
    this.dpr = Math.min(2, (globalThis as { devicePixelRatio?: number }).devicePixelRatio ?? 1);
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'width:100%;height:100%;display:block;background:#0a0e16;touch-action:none';
    container.appendChild(this.canvas);
    this.hud = new TdHud(ctx.send);
    container.appendChild(this.hud.root);
    this.g = this.canvas.getContext('2d')!;
    this.canvas.addEventListener('pointerdown', this.onPointer);
    this.canvas.addEventListener('pointerup', this.onUp);
    this.canvas.addEventListener('pointercancel', this.onCancel);
    this.canvas.addEventListener('lostpointercapture', this.onCancel);
    this.canvas.addEventListener('pointermove', this.onMove);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resize(container.clientWidth || 800, container.clientHeight || 600);
  }
  async ready() {
    await Promise.all([this.battlefield.loaded, this.machinery.loaded, this.aliens!.loaded]);
    if (!this.mounted) return;
    let scale: number;
    do {
      scale = this.k; this.view.k = scale; this.view.dpr = this.dpr;
      await this.aliens!.prepare(this.view, () => !this.mounted);
    } while (this.mounted && this.k !== scale);
    this.bg = null;
  }
  resize(w: number, h: number) {
    for (const id of [...this.heldPointers.keys()]) this.releaseHold(id, true);
    this.W = Math.max(1, w); this.H = Math.max(1, h);
    if (!this.canvas) return;
    this.canvas.width = Math.round(this.W * this.dpr); this.canvas.height = Math.round(this.H * this.dpr);
    this.relayout();
  }
  setInsets(i: Insets) { if (i.bottom !== this.insetB) { this.insetB = i.bottom; this.relayout(); } }
  unmount() {
    this.mounted = false;
    this.onBlur(); window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas?.removeEventListener('pointerdown', this.onPointer);
    this.canvas?.removeEventListener('pointerup', this.onUp);
    this.canvas?.removeEventListener('pointercancel', this.onCancel);
    this.canvas?.removeEventListener('lostpointercapture', this.onCancel);
    this.canvas?.removeEventListener('pointermove', this.onMove);
    this.canvas?.remove();
    this.hud?.root.remove();
    stopAmbient(); this.dynamo.stop();
  }
  private relayout() { this.L = layout(this.W, this.H, this.insetB, this.hudControls); this.hud?.resize(this.L, this.W); this.bg = null; }

  // ---------- coordinates ----------
  private X(x: number) { return this.L.field.x + x * this.L.field.s / FIELD; }
  private Y(y: number) { return this.L.field.y + y * this.L.field.s / FIELD; }
  private get k() { return this.L.field.s / FIELD; }

  // ---------- taps ----------
  private tap(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) * (this.W / r.width), py = (e.clientY - r.top) * (this.H / r.height);
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) {
        e.preventDefault();
        const a = h.action as { type?: string; epoch?: number } | null;
        if (a?.type === 'railHold' || a?.type === 'boostHold') {
          const kind = a.type === 'railHold' ? 'rail' : 'boost';
          this.heldPointers.set(e.pointerId, { epoch: a.epoch!, kind });
          this.canvas.setPointerCapture?.(e.pointerId);
          this.send?.({ type: `${kind}Down`, pointer: e.pointerId, epoch: a.epoch });
        } else if (h.action) this.send?.(h.action);
        return;
      }
    }
    const s = this.snap; if (!s || s.phase !== 'run' || s.over || py > this.L.UH) return;
    const fx = (px - this.L.field.x) / this.k, fy = (py - this.L.field.y) / this.k;
    const targets = [...PADS, { id: 6, x: BASE_X, y: BASE_Y }].map(p => ({ ...p, distance: Math.hypot(fx - p.x, fy - p.y) }))
      .sort((a, b) => a.distance - b.distance);
    const closest = targets[0];
    if (closest.distance < Math.max(closest.id === 6 ? 8 : 5.5, 22 / this.k)) {
      e.preventDefault(); this.send?.({ type: 'pad', pad: closest.id, epoch: s.inputEpoch });
    }
  }
  private releaseHold(id: number, cancel: boolean) {
    const pointer = this.heldPointers.get(id); if (!pointer) return;
    this.heldPointers.delete(id);
    this.send?.({ type: `${pointer.kind}${cancel ? 'Cancel' : 'Up'}`, pointer: id, epoch: pointer.epoch });
    if (this.canvas.hasPointerCapture?.(id)) this.canvas.releasePointerCapture(id);
  }

  // ---------- background (cached per size) ----------
  private buildBg(): HTMLCanvasElement {
    const c = document.createElement('canvas'); c.width = this.canvas.width; c.height = this.canvas.height;
    const g = c.getContext('2d')!; g.scale(this.dpr, this.dpr);
    this.view.k = this.k; this.view.dpr = this.dpr;
    if (this.battlefield.paint(g, this.view, this.W, this.H)) return c;
    const W = this.W, H = this.H, k = this.k, cx = this.X(50), cy = this.Y(55);
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.75);
    gr.addColorStop(0, '#1a2332'); gr.addColorStop(0.6, '#111824'); gr.addColorStop(1, '#070a10');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // deck plates
    const ps = Math.max(18, 8 * k);
    g.strokeStyle = 'rgba(120,150,200,0.05)'; g.lineWidth = 1;
    const ox = this.L.field.x % ps, oy = this.L.field.y % ps;
    for (let x = ox; x < W; x += ps) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = oy; y < H; y += ps) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    for (let i = 0; i < 260; i++) { // rivets, scorch marks, craters, rocks
      const x = hash(i * 3 + 1) * W, y = hash(i * 3 + 2) * H, r = hash(i * 3 + 3);
      if (r < 0.55) { g.fillStyle = 'rgba(160,190,230,0.06)'; g.fillRect(x, y, 2, 2); }
      else if (r < 0.75) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(x, y, (2 + r * 4) * k, (1.2 + r * 2) * k, r * 6, 0, TAU); g.fill(); }
      else if (r < 0.88) {
        const cr = (1.5 + r * 3) * k;
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(x, y, cr, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(150,170,200,0.08)'; g.lineWidth = Math.max(1, k * 0.4); g.beginPath(); g.arc(x, y - cr * 0.1, cr, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      } else {
        g.fillStyle = '#1f2836'; g.beginPath();
        const rr = (0.8 + r) * k;
        for (let j = 0; j < 6; j++) { const a = j / 6 * TAU, q = rr * (0.7 + 0.3 * hash(i * 7 + j)); j ? g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q) : g.moveTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
        g.closePath(); g.fill();
      }
    }
    // lanes: extend the first segment off-screen, then road layers
    for (let l = 0; l < 3; l++) {
      const pts = lanePolyline(l, 2).map((p) => ({ x: this.X(p.x), y: this.Y(p.y) }));
      const a = pts[0], b = pts[1], dx = a.x - b.x, dy = a.y - b.y, dl = Math.hypot(dx, dy) || 1;
      pts.unshift({ x: a.x + dx / dl * Math.max(W, H), y: a.y + dy / dl * Math.max(W, H) });
      const path = () => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); };
      g.lineCap = 'round'; g.lineJoin = 'round';
      path(); g.strokeStyle = '#0b0f17'; g.lineWidth = 11 * k; g.stroke();
      path(); g.strokeStyle = '#2a3446'; g.lineWidth = 9 * k; g.stroke();
      path(); g.strokeStyle = '#1b2230'; g.lineWidth = 7.4 * k; g.stroke();
      path(); g.setLineDash([2.2 * k, 3.2 * k]); g.strokeStyle = 'rgba(255,210,74,0.16)'; g.lineWidth = Math.max(1, 0.5 * k); g.stroke(); g.setLineDash([]);
    }
    // pads
    for (const p of PADS) {
      const x = this.X(p.x), y = this.Y(p.y), r = 4.2 * k;
      g.fillStyle = '#151b27'; this.hex(g, x, y + k * 0.5, r * 1.05); g.fill();
      g.fillStyle = '#232c3c'; this.hex(g, x, y, r); g.fill();
      g.strokeStyle = 'rgba(255,210,74,0.22)'; g.lineWidth = Math.max(1, k * 0.3); this.hex(g, x, y, r * 0.8); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.12)';
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + Math.PI / 6; g.beginPath(); g.arc(x + Math.cos(a) * r * 0.82, y + Math.sin(a) * r * 0.82, Math.max(1, k * 0.25), 0, TAU); g.fill(); }
    }
    // base platform
    const bx = this.X(BASE_X), by = this.Y(BASE_Y);
    g.fillStyle = '#0d121b'; g.beginPath(); g.arc(bx, by, 10 * k, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,210,74,0.25)'; g.lineWidth = Math.max(1, k * 0.5); g.setLineDash([1.5 * k, 1.5 * k]);
    g.beginPath(); g.arc(bx, by, 9 * k, 0, TAU); g.stroke(); g.setLineDash([]);
    // top fog where enemies come from
    const fog = g.createLinearGradient(0, 0, 0, this.Y(20));
    fog.addColorStop(0, 'rgba(5,7,12,0.85)'); fog.addColorStop(1, 'rgba(5,7,12,0)');
    g.fillStyle = fog; g.fillRect(0, 0, W, this.Y(20));
    return c;
  }
  private hex(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
    g.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + Math.PI / 6; i ? g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath();
  }

  // ---------- particles ----------
  private burst(x: number, y: number, color: string, n: number, speed: number, size: number, life = 0.6) {
    for (let i = 0; i < n && this.particles.length < 600; i++) {
      const a = Math.random() * TAU, v = speed * (0.3 + Math.random());
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: life * (0.5 + Math.random() * 0.7), size: size * (0.5 + Math.random()), color, kind: 'spark' });
    }
  }
  /** Hit feedback by matchup: strong = a brood-coloured spray, resisted = grey sparks, a ricochet streak and a clank. */
  private hitFeedback(h: HitEvent) {
    const k = this.k, x = this.X(h.x), y = this.Y(h.y), room = () => this.particles.length < 600;
    if (h.cls === 'strong') {
      if (h.element === 'blue') for (let i = 0; i < 5 && room(); i++) { // crystal shards
        const a = Math.random() * TAU, v = (14 + Math.random() * 22) * k;
        this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 0.35 + Math.random() * 0.2, size: (0.5 + Math.random() * 0.5) * k, color: Math.random() < 0.5 ? '#bfefff' : COL.blue, kind: 'shard', rot: a, spin: (Math.random() - 0.5) * 20 });
      } else if (h.element === 'red') { // fuel burst
        for (let i = 0; i < 3 && room(); i++) { const a = Math.random() * TAU, v = (6 + Math.random() * 10) * k; this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 0.3, size: 1.1 * k, color: '', kind: 'flame' }); }
      } else { // armour plate chips
        for (let i = 0; i < 4 && room(); i++) { const a = Math.random() * TAU, v = (10 + Math.random() * 16) * k; this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 0.4, size: (0.6 + Math.random() * 0.4) * k, color: Math.random() < 0.5 ? '#3d2a5c' : COL.purple, kind: 'shard', rot: a, spin: (Math.random() - 0.5) * 14 }); }
      }
    } else if (h.cls === 'resisted') {
      this.burst(x, y, '#c8ccd2', 3, 24 * k, 0.35 * k, 0.22);
      if (room()) { const a = Math.random() * TAU, v = 60 * k; this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 0.16, size: 2.2 * k, color: '#eef2f6', kind: 'streak' }); }
      play('clank', { minGapS: 0.07, vol: 0.55, pitch: 0.9 + Math.random() * 0.2 });
    }
    if (h.big && h.dmg >= 1) this.particles.push({ x: x + (Math.random() - 0.5) * 2 * k, y: y - 3 * k, vx: 0, vy: -14 * k, age: 0, life: 0.6, size: Math.max(11, 2.2 * k), color: h.cls === 'strong' ? '#ffe9a8' : h.cls === 'resisted' ? '#b8bcc4' : '#ffffff', kind: 'text', text: `${Math.round(h.dmg)}` });
  }
  /** Chain / multikill callouts: one text per key, updated in place as a chain counts up. */
  private callout(c: Callout) {
    const k = this.k, size = Math.max(14, 3.2 * k * c.size);
    const p = this.particles.find((q) => q.key === c.key);
    if (p) { p.text = c.text; p.age = Math.min(p.age, 0.2); p.size = size; return; }
    this.particles.push({ x: this.X(c.x), y: this.Y(c.y), vx: 0, vy: -4 * k, age: 0, life: 1.6, size, color: c.color, kind: 'text', text: c.text, key: c.key });
  }
  /** A fuel-blooded red alien killed by fire bursts into flame. */
  private fireBurst(x: number, y: number, size: number) {
    for (let i = 0; i < 14 && this.particles.length < 600; i++) {
      const a = Math.random() * TAU, v = size * (1.2 + Math.random() * 2.2);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 0.35 + Math.random() * 0.25, size: size * 0.18, color: '', kind: 'flame' });
    }
    this.ring(x, y, '#ffb050', size * 0.2, size * 0.9, 0.35);
    this.shake = Math.max(this.shake, 0.3);
  }
  private ring(x: number, y: number, color: string, r0: number, grow: number, life: number) {
    this.particles.push({ x, y, vx: 0, vy: 0, age: 0, life, size: r0, grow, color, kind: 'ring' });
  }
  private stepParticles(dt: number) {
    for (const p of this.particles) {
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'spark' || p.kind === 'shard') { const d = Math.exp(-5 * dt); p.vx *= d; p.vy *= d; }
      else if (p.kind === 'flame') { const d = Math.exp(-3 * dt); p.vx *= d; p.vy *= d; p.size *= 1 + dt * 1.6; }
      else if (p.kind === 'smoke') { p.vy -= 8 * dt; p.size *= 1 + dt * 1.2; }
      else if (p.kind === 'text') p.vy *= 0.94;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
  }
  private drawParticles(g: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      const f = 1 - p.age / p.life;
      if (p.kind === 'ring') {
        g.strokeStyle = p.color; g.globalAlpha = f * 0.9; g.lineWidth = Math.max(1.5, 3 * f * this.k * 0.4);
        g.beginPath(); g.arc(p.x, p.y, p.size + (p.grow ?? 0) * (p.age / p.life), 0, TAU); g.stroke(); g.globalAlpha = 1;
      } else if (p.kind === 'shard') {
        g.save(); g.translate(p.x, p.y); g.rotate((p.rot ?? 0) + (p.spin ?? 0) * p.age); g.globalAlpha = f; g.fillStyle = p.color;
        g.beginPath(); g.moveTo(p.size * 1.4, 0); g.lineTo(-p.size, p.size * 0.7); g.lineTo(-p.size * 0.6, -p.size * 0.6); g.closePath(); g.fill(); g.restore();
      } else if (p.kind === 'streak') {
        const sp = Math.hypot(p.vx, p.vy) || 1;
        g.strokeStyle = p.color; g.globalAlpha = f; g.lineWidth = Math.max(1, 0.25 * this.k); g.lineCap = 'round';
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx / sp * p.size * 3, p.y - p.vy / sp * p.size * 3); g.stroke(); g.globalAlpha = 1;
      } else if (p.kind === 'smoke') {
        g.fillStyle = `rgba(40,40,48,${0.35 * f})`; g.beginPath(); g.arc(p.x, p.y, p.size, 0, TAU); g.fill();
      } else if (p.kind === 'text') {
        g.globalAlpha = Math.min(1, f * 2); g.font = `800 ${Math.round(p.size)}px system-ui, sans-serif`; g.textAlign = 'center';
        g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.strokeText(p.text ?? '', p.x, p.y); g.fillStyle = p.color; g.fillText(p.text ?? '', p.x, p.y);
        g.textAlign = 'left'; g.globalAlpha = 1;
      } else if (p.kind === 'flame') {
        g.globalCompositeOperation = 'lighter';
        const c = f > 0.65 ? '#fff0b0' : f > 0.35 ? '#ff9a3a' : '#c0301a';
        glowAt(g, c, p.x, p.y, p.size, f * 0.45);
        g.globalCompositeOperation = 'source-over';
      } else { // sparks: normal blending so a burst doesn't saturate to white
        g.fillStyle = p.color; g.globalAlpha = f; g.beginPath(); g.arc(p.x, p.y, p.size * f + 0.5, 0, TAU); g.fill(); g.globalAlpha = 1;
      }
    }
  }

  /** New sim fx (by id) become particles / shake / flashes once. */
  private consumeFx(s: TdSnapshot, allowHitStop: boolean) {
    const k = this.k;
    for (const f of s.fx) {
      if (f.id <= this.lastFx) continue;
      this.lastFx = Math.max(this.lastFx, f.id);
      if (f.kind === 'burst' && allowHitStop) play('ignite', { minGapS: 0.08, vol: 0.8 });
      if (f.kind === 'death') {
        const c = COL[f.color], x = this.X(f.x), y = this.Y(f.y);
        if (allowHitStop && !f.big) play('chitinCrunch', { minGapS: 0.05, vol: 0.7, pitch: 0.85 + Math.random() * 0.3 });
        this.burst(x, y, c, f.big ? (this.aliens?.ready ? 10 : 26) : 8, (f.big ? 40 : 26) * k, (f.big && !this.aliens?.ready ? 1 : 0.6) * k, f.big ? 0.6 : 0.45); // puppets: gibs carry heavy deaths
        if (f.big) { this.ring(x, y, c, 1 * k, 9 * k, 0.45); for (let i = 0; i < 4; i++) this.particles.push({ x, y, vx: (Math.random() - 0.5) * 8 * k, vy: (Math.random() - 0.5) * 8 * k, age: 0, life: 1.2, size: 2 * k, color: '', kind: 'smoke' }); }
        if (f.color === 'gold') { // the Hive Tyrant comes apart in a gold shard shower
          this.shake = Math.max(this.shake, 1.2); this.flash = { color: COL.gold, a: 0.5 };
          for (let i = 0; i < 46 && this.particles.length < 600; i++) {
            const a = Math.random() * TAU, v = (20 + Math.random() * 50) * k;
            this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 0.8 + Math.random() * 0.8, size: (0.6 + Math.random() * 0.8) * k, color: Math.random() < 0.6 ? COL.gold : '#fff2b0', kind: 'shard', rot: a, spin: (Math.random() - 0.5) * 16 });
          }
          this.ring(x, y, COL.gold, 3 * k, 40 * k, 0.8);
        }
      } else if (f.kind === 'payoff') {
        if (!allowHitStop) continue;
        const st = PAYOFF_STYLE[f.effort], x = this.X(BASE_X), y = this.Y(BASE_Y);
        if (f.won) {
          this.ring(x, y, st.color, 4 * k, 110 * k, 0.9); this.ring(x, y, '#ffffff', 3 * k, 80 * k, 0.6);
          this.flash = { color: st.color, a: Math.max(this.flash.a, 0.22) }; this.shake = Math.max(this.shake, 0.6);
          this.aliens?.flinch(s.t); play('payoffSting');
        } else this.particles.push({ x, y: y - 12 * k, vx: 0, vy: -6 * k, age: 0, life: 1.4, size: Math.max(11, 2.4 * k), color: 'rgba(200,205,215,0.8)', kind: 'text', text: `${st.label} missed` });
      } else if (f.kind === 'bossIntro') {
        if (!allowHitStop) continue;
        this.intro = { at: this.wall, wave: f.wave }; this.shake = Math.max(this.shake, 0.55); play('rumble', { vol: 1.2 }); play('roar', { vol: 0.6, pitch: 0.7 });
      } else if (f.kind === 'hitStop') {
        if (allowHitStop) this.hitStopUntil = Math.max(this.hitStopUntil, performance.now() + Math.min(0.1, f.seconds) * 1000);
      } else if (f.kind === 'boom' || f.kind === 'burst') {
        const x = this.X(f.x), y = this.Y(f.y);
        this.ring(x, y, '#ffb070', f.r * k * 0.3, f.r * k * 0.8, 0.35);
        this.burst(x, y, '#ff9a50', 8, 26 * k, 0.6 * k, 0.4);
        for (let i = 0; i < 3; i++) this.particles.push({ x, y, vx: (Math.random() - 0.5) * 6 * k, vy: -Math.random() * 4 * k, age: 0, life: 1, size: 2.5 * k, color: '', kind: 'smoke' });
        this.shake = Math.max(this.shake, 0.25);
      } else if (f.kind === 'emp') {
        const x = this.X(BASE_X), y = this.Y(BASE_Y);
        this.ring(x, y, '#7df9ff', 5 * k, 140 * k, 1.1); this.ring(x, y, '#ffffff', 3 * k, 120 * k, 0.9);
        this.flash = { color: '#7df9ff', a: 0.5 }; this.shake = Math.max(this.shake, 1);
      } else if (f.kind === 'baseHit') {
        this.shake = Math.max(this.shake, Math.min(1, 0.2 + f.dmg / 15));
        if (f.dmg >= 5) this.flash = { color: '#ff3020', a: Math.min(0.45, 0.12 + f.dmg / 60) };
        this.burst(this.X(BASE_X), this.Y(BASE_Y - 5), '#ff7a5a', 8, 30 * k, 0.7 * k, 0.4);
      } else if (f.kind === 'beam') {
        this.flash = { color: COL.purple, a: Math.max(this.flash.a, 0.28) }; this.shake = Math.max(this.shake, 0.5);
      } else if (f.kind === 'text') {
        this.particles.push({ x: this.X(f.x), y: this.Y(f.y), vx: 0, vy: -16 * k, age: 0, life: 1.1, size: Math.max(12, 3.2 * k), color: f.color, kind: 'text', text: f.text });
      } else if (f.kind === 'tracer' && f.hit) {
        this.burst(this.X(f.x1), this.Y(f.y1), LIGHT.blue, 2, 20 * k, 0.4 * k, 0.2);
      }
    }
  }

  private playCues(s: TdSnapshot) {
    if (this.lastCue < 0) { this.lastCue = s.cues.length ? s.cues[s.cues.length - 1].id : 0; return; } // don't replay history on mount
    for (const c of s.cues) {
      if (c.id <= this.lastCue) continue;
      this.lastCue = c.id;
      const m = CUES[c.name]; if (m) play(m.s, { minGapS: m.gap, vol: m.vol, pitch: m.pitch });
      this.dynamo.cue(c.name);
    }
  }

  // ---------- frame ----------
  render(snapshot: unknown, bike: Readonly<BikeState>, _input: Readonly<InputState>) {
    const s = snapshot as TdSnapshot;
    for (const [id, pointer] of this.heldPointers) if (s.inputEpoch !== pointer.epoch || s.phase !== 'run' || s.over ||
      (pointer.kind === 'boost' && (s.workshop || s.boss?.weapon !== 'rail' || !(s.boss.telegraph || s.boss.exposed)))) this.releaseHold(id, true);
    this.snap = s;
    if (!this.L) this.relayout();
    this.hud.render(s, this.L, this.W);
    const g = this.g, k = this.k, L = this.L;
    const firstFrame = this.lastT < 0;
    const dt = this.lastT < 0 ? 0 : Math.max(0, Math.min(0.1, s.t - this.lastT));
    const realDt = 1 / 60;
    this.lastT = s.t; this.wall += realDt;
    const t = s.t;
    if (!this.bg) this.bg = this.buildBg();
    this.playCues(s);
    this.consumeFx(s, !firstFrame);
    if (s.phase === 'run') { for (const h of this.hitFx.hits(s.enemies, s.t)) this.hitFeedback(h); for (const c of this.hitFx.callouts(s.fx, s.t)) this.callout(c); }
    { // Exposed window: the first hit on the boss lands in slow motion (one short freeze, capped like hit-stop)
      const b = s.enemies.find((e) => e.kind === 'boss'), w = this.exposedWindow;
      if (b?.exposed && !w.open) { w.open = true; w.since = s.t; w.slowed = false; } else if (!b?.exposed) w.open = false;
      if (b && w.open && !w.slowed && b.hitT >= w.since && b.hitT > 0 && !firstFrame) { w.slowed = true; this.hitStopUntil = Math.max(this.hitStopUntil, performance.now() + 100); this.flash = { color: COL.gold, a: Math.max(this.flash.a, 0.18) }; }
    }
    this.dynamo.update({
      active: s.phase === 'run' && !s.over, cadence: bike.cadence3s, ftpFraction: bike.ftpFraction, crankRevs: bike.crankRevs, overdrive: s.overdrive,
      weapon: s.weapon, gatlingFiring: s.fx.reduce((n, f) => n + (f.kind === 'tracer' && t - f.t0 < 0.2 ? 1 : 0), 0),
      flaming: s.flaming, flamePower: s.flamePower, railCharging: s.railCharging, railProgress: s.railProgress, railFull: s.railCharges >= s.railMaxCharges,
    }, s.t, realDt);
    if (performance.now() < this.hitStopUntil) return;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.bg, 0, 0);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.hits = [];

    // camera shake (field only)
    this.shake = Math.max(0, this.shake - realDt * 2.5);
    const sh = this.shake * this.shake * 1.6 * k;
    g.save(); g.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);

    const bx = this.X(BASE_X), by = this.Y(BASE_Y);
    this.view.k = k; this.view.dpr = this.dpr;
    this.battlefield.ground(g, this.view, s);
    // Shade and light the ground before actors: coloured silhouettes retain their contrast.
    this.battlefield.lighting(g, this.view, s, this.W, this.H);
    if (s.phase === 'run') {
      this.drawLanes(g, s, t);
      this.view.k = k; this.view.dpr = this.dpr;
      this.aliens?.update(s, this.view, dt, (x, y, size) => this.fireBurst(x, y, size));
      this.aliens?.drawGround(g, this.view, t);
      this.odBlend = stepBlend(this.odBlend, s.overdrive && !s.over, realDt);
      this.battlefield.wiring(g, this.view, s, bike, this.odBlend);
      this.drawPads(g, s, t);
      for (const tw of s.towers) { const p = PADS[tw.pad]; if (!this.machinery.tower(g, tw, this.view, s)) drawTower(g, tw, this.X(p.x), this.Y(p.y), k, t, s.grid); }
      // aim line
      const ac = WEAPON_COLOR[s.weapon];
      g.strokeStyle = ac; g.globalAlpha = s.targetId ? 0.18 : 0; g.lineWidth = Math.max(1, k * 0.3); g.setLineDash([2 * k, 2 * k]);
      g.beginPath(); g.moveTo(bx + Math.sin(s.aimAngle) * 8 * k, by - Math.cos(s.aimAngle) * 8 * k);
      const reach = s.weapon === 'flame' ? s.flameRange : 100;
      g.lineTo(bx + Math.sin(s.aimAngle) * reach * k, by - Math.cos(s.aimAngle) * reach * k); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
      // enemies, back to front: cut-out puppets, or the vector sprites until their frames exist
      const puppets = this.aliens?.ready ? this.aliens : null;
      if (puppets) puppets.draw(g, s, this.view, t, (e, h) => drawEnemy(g, e, this.X(e.x), this.Y(e.y), k, h, t));
      puppets?.drawGibs(g, this.view, t);
      const live = new Set<number>();
      for (const e of [...s.enemies].sort((a, b) => a.y - b.y)) {
        live.add(e.id);
        const x = this.X(e.x), y = this.Y(e.y);
        const prev = this.heading.get(e.id);
        let h = prev?.h ?? Math.atan2(by - y, bx - x);
        if (prev && Math.hypot(x - prev.x, y - prev.y) > 0.3) { const nh = Math.atan2(y - prev.y, x - prev.x); h = prev.h + angleLerp(prev.h, nh, 0.3); }
        this.heading.set(e.id, { x, y, h });
        if (!puppets) drawEnemy(g, e, x, y, k, h, t);
        if (e.id === s.targetId) this.reticle(g, e, x, y, t);
      }
      for (const id of this.heading.keys()) if (!live.has(id)) this.heading.delete(id);
      this.drawShells(g, s);
      this.drawFlame(g, s, bx, by, dt);
      this.drawFx(g, s, bx, by, t);
      this.drawParticles(g);
      const muzzle = s.fx.some((f) => f.kind === 'tracer' && t - f.t0 < 0.05) ? 1 : 0;
      if (!this.machinery.base(g, this.view, s, bike)) drawBase(g, {
        x: bx, y: by, k, t, spin: bike.crankRevs * TAU * 0.5, grid: s.grid, color: this.color, hpFrac: s.baseHp / s.baseMaxHp, hurt: s.baseHurt,
        weapon: s.weapon, aim: s.aimAngle, swapK: s.swapLeft > 0 ? 1 - s.swapLeft / s.swapS : 1, muzzle, overdrive: s.overdrive,
        railCharge: s.railCharges / Math.max(1, s.railMaxCharges), flaming: s.flaming,
      });
      if (this.odBlend > 0.02) { // Overdrive: a white-hot muzzle that flares with each shot
        const mx = bx + Math.sin(s.aimAngle) * 9 * k, my = by - Math.cos(s.aimAngle) * 9 * k, fl = 0.75 + 0.25 * Math.sin(t * 37);
        g.globalCompositeOperation = 'lighter';
        glowAt(g, '#ff8a2a', mx, my, (5 + 4 * muzzle) * k * this.odBlend, 0.55 * fl);
        glowAt(g, '#fff4d0', mx, my, (2 + 2 * muzzle) * k * this.odBlend, 0.8 * fl);
        g.globalCompositeOperation = 'source-over';
      }
    } else {
      this.drawLanes(g, s, t);
      this.drawPads(g, s, t);
      if (!this.machinery.base(g, this.view, s, bike)) drawBase(g, { x: bx, y: by, k, t, spin: bike.crankRevs * TAU * 0.5, grid: 0.5, color: this.color, hpFrac: 1, hurt: 99, weapon: 'gatling', aim: Math.sin(t * 0.5) * 0.6, swapK: 1, muzzle: 0, overdrive: false, railCharge: 0, flaming: false });
    }
    this.stepParticles(realDt);
    g.restore();
    if (s.phase === 'run') for (const b of shimmerBands(this.wall, this.W, L.UH, this.odBlend)) { // heat haze at the edges
      const gr = b.x === 0 ? g.createLinearGradient(0, 0, b.w, 0) : b.y === 0 ? g.createLinearGradient(0, 0, 0, b.h) : g.createLinearGradient(b.x + b.w, 0, b.x, 0);
      gr.addColorStop(0, `rgba(255,140,50,${b.alpha})`); gr.addColorStop(1, 'rgba(255,140,50,0)');
      g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(b.x, b.y, b.w, Math.min(b.h, L.UH - b.y)); g.globalCompositeOperation = 'source-over';
    }

    // foreground UI (never under the HUD band)
    if (s.phase === 'run') {
      if (!this.hudControls) this.hits.push(...drawDock(g, s, L, bike.powerZone));
      if (s.workshop) this.hits.push(...drawConstruction(g, s, L, this.W));
    }

    { // boss arrival name card: slams in, holds, fades (2.8 s), centred where the event banner sits
      const age = this.wall - this.intro.at;
      if (s.phase === 'run' && age >= 0 && age < 2.8) {
        const k2 = Math.min(1, age / 0.25), a = age < 2.2 ? 1 : 1 - (age - 2.2) / 0.6, scale = 1.35 - 0.35 * (1 - Math.pow(1 - k2, 3));
        const size = Math.round(Math.min(this.W * 0.075, 64 * L.u)), y = L.banner.y;
        g.save(); g.globalAlpha = a * k2; g.translate(this.W / 2, y); g.scale(scale, scale); g.textAlign = 'center';
        g.font = `900 ${size}px system-ui, sans-serif`; g.lineWidth = Math.max(4, size * 0.12); g.strokeStyle = 'rgba(20,12,0,0.85)';
        const title = 'H I V E   T Y R A N T';
        g.strokeText(title, 0, 0); const gr = g.createLinearGradient(0, -size, 0, 0); gr.addColorStop(0, '#fff2b0'); gr.addColorStop(1, COL.gold);
        g.fillStyle = gr; g.fillText(title, 0, 0);
        g.font = `700 ${Math.round(size * 0.32)}px system-ui, sans-serif`; g.fillStyle = 'rgba(255,236,190,0.9)'; g.lineWidth = 3;
        const sub = `Wave ${this.intro.wave} boss · announced phases · sprint when Exposed`;
        g.strokeText(sub, 0, size * 0.62); g.fillText(sub, 0, size * 0.62); g.restore();
      }
    }
    // full-screen flashes
    if (this.flash.a > 0) {
      g.globalAlpha = this.flash.a; g.fillStyle = this.flash.color; g.fillRect(0, 0, this.W, this.H); g.globalAlpha = 1;
      this.flash.a = Math.max(0, this.flash.a - realDt * 1.6);
    }
    if (s.baseHp / s.baseMaxHp < 0.25 && s.phase === 'run' && !s.over) { // low-HP vignette pulse
      const a = 0.18 + 0.12 * Math.sin(this.wall * 6);
      const vg = g.createRadialGradient(this.W / 2, L.UH / 2, Math.min(this.W, L.UH) * 0.35, this.W / 2, L.UH / 2, Math.max(this.W, L.UH) * 0.75);
      vg.addColorStop(0, 'rgba(255,40,30,0)'); vg.addColorStop(1, `rgba(255,40,30,${a})`);
      g.fillStyle = vg; g.fillRect(0, 0, this.W, this.H);
    }
    if (s.over) { g.fillStyle = 'rgba(5,6,10,0.5)'; g.fillRect(0, 0, this.W, this.H); }
  }

  private drawLanes(g: CanvasRenderingContext2D, s: TdSnapshot, t: number) {
    const k = this.k;
    for (let l = 0; l < 3; l++) {
      const pts = lanePolyline(l, 4);
      if (s.slowLane === l) {
        g.save(); g.strokeStyle = '#55baff'; g.globalAlpha = 0.35 + 0.1 * Math.sin(t * 4); g.lineWidth = 7 * k;
        g.setLineDash([3 * k, 2 * k]); g.beginPath();
        pts.forEach((p, i) => i ? g.lineTo(this.X(p.x), this.Y(p.y)) : g.moveTo(this.X(p.x), this.Y(p.y))); g.stroke(); g.restore();
      }
      const nk = s.nudge?.lane === l ? s.nudge.k : 0;
      if (s.phase === 'run' && nk > 0) {
        g.strokeStyle = `rgba(160,200,255,${(0.04 + 0.08 * nk).toFixed(3)})`; g.lineWidth = 8 * k; g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(this.X(p.x), this.Y(p.y)) : g.moveTo(this.X(p.x), this.Y(p.y)))); g.stroke();
      }
      // Painted burrows carry spawn identity; keep guidance subtle and temporary.
      const sp = pts[Math.min(3, pts.length - 1)], gx = this.X(Math.max(3, Math.min(97, sp.x))), gy = this.Y(Math.max(3, sp.y));
      const nl = s.nudge?.lane ?? -1;
      if (this.laneShown.lane !== nl) this.laneShown = { lane: nl, at: this.wall };
      const since = this.wall - this.laneShown.at;
      if (s.phase === 'run' && nl === l && since < 2 && this.laneShown.at > 0.5) {
        g.globalAlpha = Math.min(1, (2 - since) * 2);
        g.font = `800 ${Math.max(10, Math.round(2.6 * k))}px system-ui, sans-serif`; g.textAlign = 'center';
        g.fillStyle = 'rgba(200,225,255,0.85)'; g.fillText(`${LANE_NAMES[l].toUpperCase()} · NUDGE`, gx, gy + 7 * k); g.textAlign = 'left';
        g.globalAlpha = 1;
      }
    }
  }

  private drawPads(g: CanvasRenderingContext2D, s: TdSnapshot, t: number) {
    const k = this.k, ws = s.workshop;
    for (const p of PADS) {
      const x = this.X(p.x), y = this.Y(p.y), sel = ws?.pad === p.id, built = s.towers.find((q) => q.pad === p.id);
      if (sel) {
        const kind = built?.kind ?? ws!.rows[ws!.row]?.tower, lv = built ? Math.min(5, built.level + (ws!.rows[ws!.row]?.kind === 'upgrade' ? 1 : 0)) : 1;
        if (kind) {
          const rr = TOWERS[kind].range * LEVEL_RANGE[lv - 1] * k;
          g.fillStyle = COL[TOWERS[kind].element] + '14'; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
          g.strokeStyle = COL[TOWERS[kind].element] + '88'; g.lineWidth = Math.max(1, k * 0.3); g.setLineDash([1.5 * k, 1.5 * k]);
          g.beginPath(); g.arc(x, y, rr, 0, TAU); g.stroke(); g.setLineDash([]);
        }
        g.strokeStyle = '#ffd24a'; g.lineWidth = Math.max(2, k * 0.5);
        this.hex(g, x, y, (5.2 + Math.sin(t * 6) * 0.3) * k); g.stroke();
        if (!built && kind) { g.globalAlpha = 0.45; drawTower(g, { pad: p.id, kind, level: 1, angle: 0, charge: 1, firedAt: -9 }, x, y, k, t, 1); g.globalAlpha = 1; }
      } else if (!built && s.phase === 'run') {
        g.fillStyle = s.scrap >= 60 ? `rgba(255,210,74,${0.35 + 0.25 * Math.sin(t * 3 + p.id)})` : 'rgba(255,255,255,0.15)';
        g.fillRect(x - 1.6 * k, y - 0.3 * k, 3.2 * k, 0.6 * k); g.fillRect(x - 0.3 * k, y - 1.6 * k, 0.6 * k, 3.2 * k);
      }
    }
    if (ws?.pad === 6) { g.strokeStyle = '#ffd24a'; g.lineWidth = Math.max(2, k * 0.5); g.beginPath(); g.arc(this.X(BASE_X), this.Y(BASE_Y), 10 * k, 0, TAU); g.stroke(); }
  }

  private reticle(g: CanvasRenderingContext2D, e: EnemyView, x: number, y: number, t: number) {
    const r = (e.radius + 1.6) * this.k, a = t * 2;
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) { const q = a + i * Math.PI / 2; g.beginPath(); g.arc(x, y, r, q, q + 0.6); g.stroke(); }
  }

  private drawShells(g: CanvasRenderingContext2D, s: TdSnapshot) {
    const k = this.k;
    for (const sh of s.shells) {
      const x = this.X(sh.x0 + (sh.x1 - sh.x0) * sh.k), y0 = this.Y(sh.y0 + (sh.y1 - sh.y0) * sh.k), lift = Math.sin(Math.PI * sh.k) * 9 * k;
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(x, y0, 1.1 * k, 0.5 * k, 0, 0, TAU); g.fill();
      glowAt(g, '#ff8a4a', x, y0 - lift, 2.2 * k, 0.8);
      g.fillStyle = '#ffe0c0'; g.beginPath(); g.arc(x, y0 - lift, 0.8 * k, 0, TAU); g.fill();
    }
  }

  private drawFlame(g: CanvasRenderingContext2D, s: TdSnapshot, bx: number, by: number, dt: number) {
    if (!s.flaming) return;
    const k = this.k, a = s.aimAngle, od = this.odBlend, n = Math.round((2 + 4 * Math.min(1.5, s.flamePower)) * (1 + 0.6 * od) * Math.max(1, dt * 60));
    const mx = bx + Math.sin(a) * 9 * k, my = by - Math.cos(a) * 9 * k;
    for (let i = 0; i < n && this.particles.length < 600; i++) {
      // exp(-3t) damping over ~0.45 s travels ~v/4: spread the puffs along the whole cone
      const sa = a + (Math.random() - 0.5) * 2 * s.flameHalfAngle * 0.85, v = s.flameRange * k * (1.6 + Math.random() * 2.6);
      this.particles.push({ x: mx, y: my, vx: Math.sin(sa) * v, vy: -Math.cos(sa) * v, age: 0, life: 0.38 + Math.random() * 0.12, size: 1.3 * k * (1 + 0.4 * od), color: '', kind: 'flame' });
    }
    g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(mx, my, 0, mx, my, s.flameRange * k);
    gr.addColorStop(0, `rgba(255,${170 + 60 * od},${80 + 100 * od},${0.28 + 0.17 * od})`); gr.addColorStop(1, 'rgba(255,60,20,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(mx, my);
    g.arc(bx, by, s.flameRange * k, a - Math.PI / 2 - s.flameHalfAngle, a - Math.PI / 2 + s.flameHalfAngle); g.closePath(); g.fill();
    g.globalCompositeOperation = 'source-over';
  }

  private drawFx(g: CanvasRenderingContext2D, s: TdSnapshot, bx: number, by: number, t: number) {
    const k = this.k;
    g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
    for (const f of s.fx as Fx[]) {
      const age = t - f.t0, life = 1 - age / f.life;
      if (life <= 0) continue;
      if (f.kind === 'tracer') {
        g.strokeStyle = COL.blue; g.globalAlpha = life; g.lineWidth = Math.max(1, k * 0.45);
        const x1 = this.X(f.x1), y1 = this.Y(f.y1), x0 = this.X(f.x0), y0 = this.Y(f.y0), q = Math.min(1, age / f.life + 0.3);
        g.beginPath(); g.moveTo(x0 + (x1 - x0) * (q - 0.3), y0 + (y1 - y0) * (q - 0.3)); g.lineTo(x0 + (x1 - x0) * q, y0 + (y1 - y0) * q); g.stroke();
        g.globalAlpha = 1;
      } else if (f.kind === 'beam') {
        const ex = bx + Math.sin(f.angle) * 140 * k, ey = by - Math.cos(f.angle) * 140 * k;
        g.strokeStyle = COL.purple; g.globalAlpha = life * 0.6; g.lineWidth = (f.spread ? 3.5 : 4.5) * k * life;
        g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.stroke();
        g.strokeStyle = '#ffffff'; g.globalAlpha = life; g.lineWidth = 1.2 * k * life;
        g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.stroke(); g.globalAlpha = 1;
      } else if (f.kind === 'zap') {
        g.strokeStyle = LIGHT.blue; g.globalAlpha = life; g.lineWidth = Math.max(1, k * 0.4);
        g.beginPath();
        f.pts.forEach((p, i) => {
          const x = this.X(p.x), y = this.Y(p.y);
          if (!i) { g.moveTo(x, y); return; }
          const pr = f.pts[i - 1], px = this.X(pr.x), py = this.Y(pr.y);
          for (let j = 1; j < 5; j++) g.lineTo(px + (x - px) * j / 5 + (Math.random() - 0.5) * 2.2 * k, py + (y - py) * j / 5 + (Math.random() - 0.5) * 2.2 * k);
          g.lineTo(x, y);
        });
        g.stroke();
        for (const p of f.pts.slice(1)) glowAt(g, COL.blue, this.X(p.x), this.Y(p.y), 2.5 * k, life);
        g.globalAlpha = 1;
      } else if (f.kind === 'lens') {
        const x0 = this.X(f.x0), y0 = this.Y(f.y0), x1 = this.X(f.x1), y1 = this.Y(f.y1);
        g.strokeStyle = COL.purple; g.globalAlpha = life * 0.7; g.lineWidth = 2 * k * life;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        g.strokeStyle = '#fff'; g.globalAlpha = life; g.lineWidth = 0.6 * k;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.globalAlpha = 1;
        glowAt(g, COL.purple, x1, y1, 3 * k, life);

      } else if (f.kind === 'boom' || f.kind === 'burst') {
        glowAt(g, '#ff7a2a', this.X(f.x), this.Y(f.y), f.r * k * (0.45 + 0.35 * (1 - life)), life * 0.45);
      }
    }
    // rail targeting laser
    if (s.laserId) {
      const e = s.enemies.find((q) => q.id === s.laserId);
      if (e) {
        const x = this.X(e.x), y = this.Y(e.y), fl = 0.6 + 0.4 * Math.sin(t * 40);
        g.strokeStyle = COL.purple; g.globalAlpha = 0.5 * fl; g.lineWidth = Math.max(1, 0.6 * k);
        g.beginPath(); g.moveTo(bx + Math.sin(s.aimAngle) * 8 * k, by - Math.cos(s.aimAngle) * 8 * k); g.lineTo(x, y); g.stroke(); g.globalAlpha = 1;
        glowAt(g, COL.purple, x, y, 2.4 * k, fl);
      }
    }
    g.globalCompositeOperation = 'source-over';
  }
}

function angleLerp(a: number, b: number, f: number) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d * f;
}
