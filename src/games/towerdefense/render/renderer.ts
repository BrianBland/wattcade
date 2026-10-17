// Dynamo Defense renderer (Canvas 2D). Loaded via dynamic import; reads TdSnapshot only.
import type { BikeState, GameRenderer, InputState, Insets, Profile } from '../../../contracts';
import { play, setAmbient, stopAmbient, type SfxName } from '../../../audio/sfx';
import { BASE_PAD, BASE_X, BASE_Y, PADS, ROAD_LENGTH, TOWERS, LEVEL_RANGE, roadAt } from '../sim/defs';
import { HIVE_MOUTH, ROAD, ROAD_HALF_WIDTH, SHOULDER, TURRET_R } from '../sim/road';
import { toScreen, toWorld } from './fieldView';
import type { EnemyView, Fx, TdSnapshot, TowerView } from '../sim/types';
import { layout, type TdLayout } from './layout';
import { COL, LIGHT, WEAPON_COLOR, drawBase, drawEnemy, drawTower, glowAt } from './sprites';
import { TdHud, type Hit } from './panels';
import { drawConstruction, drawDock } from './construction';
import { AlienLayer, type View } from './aliens/layer';
import { Battlefield } from './battlefield';
import { Machinery } from './machinery';

const TAU = Math.PI * 2;
// cue -> sound, with a rate limit (s) and volume
const CUES: Record<string, { s: SfxName; gap?: number; vol?: number; pitch?: number }> = {
  shoot: { s: 'shoot', gap: 0.07, vol: 0.45 }, zap: { s: 'zap', gap: 0.08, vol: 0.6 }, fireball: { s: 'shootHeavy', gap: 0.12, vol: 0.6 }, flameTower: { s: 'shoot', gap: 0.5, vol: 0.12, pitch: 0.5 },
  explode: { s: 'explode', gap: 0.12, vol: 0.55 }, lens: { s: 'lens', gap: 0.1 }, rail: { s: 'rail' }, railReady: { s: 'railReady' },
  swap: { s: 'swap' }, kill: { s: 'kill', gap: 0.05, vol: 0.8 }, bossStart: { s: 'bossStart' }, bossDie: { s: 'bossDie' },
  build: { s: 'build' }, upgrade: { s: 'upgrade' }, deny: { s: 'deny' }, coin: { s: 'coin' }, repair: { s: 'potion' }, buy: { s: 'buy' },
  select: { s: 'uiMove' }, uiOpen: { s: 'uiSelect' }, uiClose: { s: 'uiBack' }, waveStart: { s: 'siren', vol: 0.8 }, waveClear: { s: 'chime' },
  baseHit: { s: 'hurt', gap: 0.15, vol: 0.5 }, baseHitHeavy: { s: 'hurt', gap: 0.15, vol: 1, pitch: 0.8 }, baseFell: { s: 'lampOut' },
  surge: { s: 'surge' }, emp: { s: 'emp' }, overdrive: { s: 'overdrive' }, spin: { s: 'chime' }, overclock: { s: 'overdrive', pitch: 1.5 }, alarm: { s: 'alarm' }, go: { s: 'go' }, gameOver: { s: 'gameOver' },
};

interface Particle { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; color: string; kind: 'spark' | 'flame' | 'smoke' | 'ring' | 'text'; text?: string; grow?: number }
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
  private particles: Particle[] = [];
  private lastCue = -1; private lastFx = 0;
  private heading = new Map<number, { x: number; y: number; h: number }>();
  private shake = 0; private flash = { color: '#fff', a: 0 }; private lastT = -1; private wall = 0;
  private hitStopUntil = 0;
  private snap: TdSnapshot | null = null;
  /** cut-out alien puppets (falls back to the vector sprites until their frames are built) */
  private aliens: AlienLayer | null = null;
  private battlefield!: Battlefield;
  private machinery!: Machinery;
  private view: View = { P: (x, y) => this.P(x, y), rot: 0, turned: false, k: 1, dpr: 1 };
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
    stopAmbient();
  }
  private relayout() {
    this.L = layout(this.W, this.H, this.insetB, this.hudControls); this.hud?.resize(this.L, this.W); this.bg = null;
    this.view.turned = this.L.field.turned; this.view.rot = this.L.field.turned ? Math.PI / 2 : 0;
  }

  // ---------- coordinates ----------
  private P(x: number, y: number) { return toScreen(this.L.field, { x, y }); }
  private get k() { return this.L.field.k; }

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
    const w = toWorld(this.L.field, { x: px, y: py });
    const targets = [...PADS, { id: BASE_PAD, x: BASE_X, y: BASE_Y }].map(p => ({ ...p, distance: Math.hypot(w.x - p.x, w.y - p.y) }))
      .sort((a, b) => a.distance - b.distance);
    const closest = targets[0];
    if (closest.distance < Math.max(closest.id === BASE_PAD ? 10 : 5.5, 22 / this.k)) {
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
    if (!this.battlefield.paint(g, this.view, this.W, this.H)) this.vectorGround(g);
    return c;
  }
  /** Stand-in ground until a painting loads: rock, the road from the hive mouth, pad clearings and the turret apron. */
  private vectorGround(g: CanvasRenderingContext2D) {
    const W = this.W, H = this.H, k = this.k, mid = this.P(40, 56);
    const gr = g.createRadialGradient(mid.x, mid.y, 0, mid.x, mid.y, Math.max(W, H) * 0.75);
    gr.addColorStop(0, '#1d2230'); gr.addColorStop(0.6, '#141923'); gr.addColorStop(1, '#090c12');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 320; i++) { // rocks and scorch
      const x = hash(i * 3 + 1) * W, y = hash(i * 3 + 2) * H, r = hash(i * 3 + 3);
      g.fillStyle = r < 0.6 ? 'rgba(0,0,0,0.25)' : 'rgba(150,160,190,0.05)';
      g.beginPath(); g.ellipse(x, y, (1.5 + r * 4) * k, (1 + r * 2.5) * k, r * 6, 0, TAU); g.fill();
    }
    const hive = this.P(HIVE_MOUTH.x, HIVE_MOUTH.y), hg = g.createRadialGradient(hive.x, hive.y, 0, hive.x, hive.y, 60 * k);
    hg.addColorStop(0, 'rgba(70,24,100,0.7)'); hg.addColorStop(1, 'rgba(70,24,100,0)');
    g.fillStyle = hg; g.fillRect(0, 0, W, H);
    const path = () => { g.beginPath(); ROAD.forEach((p, i) => { const q = this.P(p.x, p.y); i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y); }); };
    g.lineCap = 'round'; g.lineJoin = 'round';
    path(); g.strokeStyle = '#3b3328'; g.lineWidth = (ROAD_HALF_WIDTH + SHOULDER) * 2 * k; g.stroke();
    path(); g.strokeStyle = '#7a6448'; g.lineWidth = ROAD_HALF_WIDTH * 2 * k; g.stroke();
    g.fillStyle = '#12080f'; g.beginPath(); g.arc(hive.x, hive.y, 8 * k, 0, TAU); g.fill();
    for (const p of PADS) { const q = this.P(p.x, p.y); g.fillStyle = '#4a3f33'; g.beginPath(); g.arc(q.x, q.y, 4.8 * k, 0, TAU); g.fill(); }
    const b = this.P(BASE_X, BASE_Y);
    g.fillStyle = '#2a2620'; g.beginPath(); g.arc(b.x, b.y, (TURRET_R + 1) * k, 0, TAU); g.fill();
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
      if (p.kind === 'spark') { const d = Math.exp(-5 * dt); p.vx *= d; p.vy *= d; }
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
      if (f.kind === 'death') {
        const c = COL[f.color], { x, y } = this.P(f.x, f.y);
        this.burst(x, y, c, f.big ? 26 : 8, (f.big ? 40 : 26) * k, (f.big ? 1 : 0.6) * k, f.big ? 0.8 : 0.45);
        if (f.big) { this.ring(x, y, c, 1 * k, 9 * k, 0.45); for (let i = 0; i < 4; i++) this.particles.push({ x, y, vx: (Math.random() - 0.5) * 8 * k, vy: (Math.random() - 0.5) * 8 * k, age: 0, life: 1.2, size: 2 * k, color: '', kind: 'smoke' }); }
        if (f.color === 'gold') { this.shake = Math.max(this.shake, 1); this.flash = { color: COL.gold, a: 0.45 }; }
      } else if (f.kind === 'hitStop') {
        if (allowHitStop) this.hitStopUntil = Math.max(this.hitStopUntil, performance.now() + Math.min(0.1, f.seconds) * 1000);
      } else if (f.kind === 'boom' || f.kind === 'burst') {
        const { x, y } = this.P(f.x, f.y);
        this.ring(x, y, '#ffb070', f.r * k * 0.3, f.r * k * 0.8, 0.35);
        this.burst(x, y, '#ff9a50', 8, 26 * k, 0.6 * k, 0.4);
        for (let i = 0; i < 3; i++) this.particles.push({ x, y, vx: (Math.random() - 0.5) * 6 * k, vy: -Math.random() * 4 * k, age: 0, life: 1, size: 2.5 * k, color: '', kind: 'smoke' });
        this.shake = Math.max(this.shake, 0.25);
      } else if (f.kind === 'emp') {
        const { x, y } = this.P(BASE_X, BASE_Y);
        this.ring(x, y, '#7df9ff', 5 * k, 140 * k, 1.1); this.ring(x, y, '#ffffff', 3 * k, 120 * k, 0.9);
        this.flash = { color: '#7df9ff', a: 0.5 }; this.shake = Math.max(this.shake, 1);
      } else if (f.kind === 'baseHit') {
        this.shake = Math.max(this.shake, Math.min(1, 0.2 + f.dmg / 15));
        if (f.dmg >= 5) this.flash = { color: '#ff3020', a: Math.min(0.45, 0.12 + f.dmg / 60) };
        const b = this.P(BASE_X, BASE_Y - 5); this.burst(b.x, b.y, '#ff7a5a', 8, 30 * k, 0.7 * k, 0.4);
      } else if (f.kind === 'beam') {
        this.flash = { color: COL.purple, a: Math.max(this.flash.a, 0.28) }; this.shake = Math.max(this.shake, 0.5);
      } else if (f.kind === 'text') {
        const q = this.P(f.x, f.y);
        this.particles.push({ x: q.x, y: q.y, vx: 0, vy: -16 * k, age: 0, life: 1.1, size: Math.max(12, 3.2 * k), color: f.color, kind: 'text', text: f.text });
      } else if (f.kind === 'tracer' && f.hit) {
        const q = this.P(f.x1, f.y1); this.burst(q.x, q.y, LIGHT.blue, 2, 20 * k, 0.4 * k, 0.2);
      }
    }
  }

  private playCues(s: TdSnapshot) {
    if (this.lastCue < 0) { this.lastCue = s.cues.length ? s.cues[s.cues.length - 1].id : 0; return; } // don't replay history on mount
    for (const c of s.cues) {
      if (c.id <= this.lastCue) continue;
      this.lastCue = c.id;
      const m = CUES[c.name]; if (m) play(m.s, { minGapS: m.gap, vol: m.vol, pitch: m.pitch });
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
    if (performance.now() < this.hitStopUntil) return;
    setAmbient('td-flame', s.flaming ? 0.06 + 0.1 * Math.min(1, s.flamePower) : 0, 700, 0.6);
    setAmbient('td-hum', s.phase === 'run' && !s.over ? 0.015 + 0.03 * Math.min(1.6, s.grid) : 0, 110 + 60 * s.grid, 3);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.bg, 0, 0);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.hits = [];

    // camera shake (field only)
    this.shake = Math.max(0, this.shake - realDt * 2.5);
    const sh = this.shake * this.shake * 1.6 * k;
    g.save(); g.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);

    const { x: bx, y: by } = this.P(BASE_X, BASE_Y), rot = this.view.rot;
    this.view.k = k; this.view.dpr = this.dpr;
    this.battlefield.hive(g, this.view, s);
    // Shade and light the ground before actors: coloured silhouettes retain their contrast.
    this.battlefield.lighting(g, this.view, s, this.W, this.H);
    if (s.phase === 'run') {
      this.drawRoadFx(g, s, t);
      this.drawBurns(g, s, t);
      this.aliens?.update(s, this.view, dt, (x, y, size) => this.fireBurst(x, y, size));
      this.aliens?.drawGround(g, this.view, t);
      this.drawPads(g, s, t);
      for (const tw of s.towers) {
        const p = this.P(PADS[tw.pad].x, PADS[tw.pad].y);
        this.contactShadow(g, p.x, p.y, k);
        if (!this.machinery.tower(g, tw, this.view, s)) drawTower(g, { ...tw, angle: tw.angle + rot }, p.x, p.y, k, t, s.grid);
      }
      this.drawTowerFlames(g, s, t, dt);
      // aim line, from the muzzle along the turret's screen heading
      const muzzle = this.machinery.muzzle(this.view, s), aim = s.aimAngle + rot;
      g.strokeStyle = WEAPON_COLOR[s.weapon]; g.globalAlpha = s.targetId ? 0.18 : 0; g.lineWidth = Math.max(1, k * 0.3); g.setLineDash([2 * k, 2 * k]);
      const reach = (s.weapon === 'flame' ? s.flameRange : 100) * k;
      g.beginPath(); g.moveTo(muzzle.x, muzzle.y); g.lineTo(bx + Math.sin(aim) * reach, by - Math.cos(aim) * reach); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
      // enemies, back to front: cut-out puppets, or the vector sprites until their frames exist
      const puppets = this.aliens?.ready ? this.aliens : null;
      if (puppets) puppets.draw(g, s, this.view, t, (e, h) => { const q = this.P(e.x, e.y); drawEnemy(g, e, q.x, q.y, k, h + rot, t); });
      const live = new Set<number>();
      for (const e of [...s.enemies].sort((a, b) => a.y - b.y)) {
        live.add(e.id);
        const { x, y } = this.P(e.x, e.y);
        const prev = this.heading.get(e.id);
        let h = prev?.h ?? Math.atan2(by - y, bx - x);
        if (prev && Math.hypot(x - prev.x, y - prev.y) > 0.3) { const nh = Math.atan2(y - prev.y, x - prev.x); h = prev.h + angleLerp(prev.h, nh, 0.3); }
        this.heading.set(e.id, { x, y, h });
        if (!puppets) drawEnemy(g, e, x, y, k, h, t);
        if (e.id === s.targetId || e.id === s.lock?.id) this.reticle(g, e, x, y, t, e.id === s.lock?.id);
      }
      for (const id of this.heading.keys()) if (!live.has(id)) this.heading.delete(id);
      this.drawFx(g, s, muzzle, t);
      this.drawParticles(g);
      this.contactShadow(g, bx, by, k * 2.4);
      if (!this.machinery.base(g, this.view, s, bike)) drawBase(g, {
        x: bx, y: by, k, t, spin: bike.crankRevs * TAU * 0.5, grid: s.grid, color: this.color, hpFrac: s.baseHp / s.baseMaxHp, hurt: s.baseHurt,
        weapon: s.weapon, aim, swapK: s.swapLeft > 0 ? 1 - s.swapLeft / s.swapS : 1, muzzle: s.fx.some((f) => f.kind === 'tracer' && t - f.t0 < 0.05) ? 1 : 0, overdrive: s.overdrive,
        railCharge: s.railCharges / Math.max(1, s.railMaxCharges), flaming: s.flaming,
      });
      // Fireballs arc over everything, from the launcher.
      this.drawShells(g, s, muzzle);
    } else {
      this.drawPads(g, s, t);
      if (!this.machinery.base(g, this.view, s, bike)) drawBase(g, { x: bx, y: by, k, t, spin: bike.crankRevs * TAU * 0.5, grid: 0.5, color: this.color, hpFrac: 1, hurt: 99, weapon: 'gatling', aim: Math.sin(t * 0.5) * 0.6 + rot, swapK: 1, muzzle: 0, overdrive: false, railCharge: 0, flaming: false });
    }
    this.stepParticles(realDt);
    g.restore();

    // foreground UI (never under the HUD band)
    if (s.phase === 'run') {
      if (!this.hudControls) this.hits.push(...drawDock(g, s, L, bike.powerZone));
      if (s.workshop) this.hits.push(...drawConstruction(g, s, L, this.W));
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

  /** The slow field over the back stretch of the road. */
  private drawRoadFx(g: CanvasRenderingContext2D, s: TdSnapshot, t: number) {
    if (s.slowFrom < 0) return;
    const k = this.k;
    g.save(); g.strokeStyle = '#55baff'; g.globalAlpha = 0.3 + 0.1 * Math.sin(t * 4); g.lineWidth = ROAD_HALF_WIDTH * 2 * k;
    g.lineCap = 'round'; g.lineJoin = 'round'; g.setLineDash([3 * k, 2 * k]); g.beginPath();
    for (let d = s.slowFrom, i = 0; d <= ROAD_LENGTH; d += 2, i++) { const p = roadAt(d), q = this.P(p.x, p.y); i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y); }
    g.stroke(); g.restore();
  }
  /** Burning road left by the fireballs: a scorched patch with flame tongues licking up across it. */
  private drawBurns(g: CanvasRenderingContext2D, s: TdSnapshot, _t: number) {
    const k = this.k;
    for (const b of s.burns) {
      const { x, y } = this.P(b.x, b.y), r = b.r * k, f = Math.min(1, b.k * 1.5), seed = Math.round(b.x * 7 + b.y * 13);
      g.fillStyle = `rgba(18,10,6,${0.5 * f})`; g.beginPath();
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, q = r * (0.75 + 0.25 * hash(seed + i)); i ? g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q * 0.85) : g.moveTo(x + Math.cos(a) * q, y + Math.sin(a) * q * 0.85); }
      g.closePath(); g.fill();
      g.save(); g.globalCompositeOperation = 'lighter'; glowAt(g, '#ff6a20', x, y, r * 0.8, 0.12 * f); g.restore();
      // a few flame tongues per frame, rising and fading
      for (let i = 0; i < 2 && this.particles.length < 600; i++) {
        if (Math.random() > 0.6 * f) continue;
        const a = Math.random() * TAU, d = r * 0.8 * Math.sqrt(Math.random());
        this.particles.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.85, vx: (Math.random() - 0.5) * k, vy: -(2 + Math.random() * 3) * k, age: 0, life: 0.35 + Math.random() * 0.3, size: 0.8 * k, color: '', kind: 'flame' });
      }
    }
  }
  /** A soft shadow under machinery, falling downward with the top light, so towers sit in their clearings. */
  private contactShadow(g: CanvasRenderingContext2D, x: number, y: number, k: number) {
    const r = 4.4 * k, gr = g.createRadialGradient(x, y + r * 0.35, r * 0.2, x, y + r * 0.35, r * 1.15);
    gr.addColorStop(0, 'rgba(0,0,0,0.42)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y + r * 0.35, r * 1.15, r * 0.9, 0, 0, TAU); g.fill();
  }
  /** Flame towers spray a short cone from the nozzle while they burn something. */
  private drawTowerFlames(g: CanvasRenderingContext2D, s: TdSnapshot, t: number, dt: number) {
    const k = this.k;
    for (const tw of s.towers) {
      if (tw.kind !== 'flamer' || t - tw.firedAt > 0.3 || s.grid <= 0) continue;
      const m = this.machinery.towerMuzzle(tw as TowerView, this.view, t), a = tw.angle + this.view.rot;
      const range = TOWERS.flamer.range * LEVEL_RANGE[tw.level - 1] * k, half = TOWERS.flamer.cone ?? 0.5;
      g.save(); g.globalCompositeOperation = 'lighter';
      const gr = g.createRadialGradient(m.x, m.y, 0, m.x, m.y, range);
      gr.addColorStop(0, 'rgba(255,170,80,0.32)'); gr.addColorStop(1, 'rgba(255,60,20,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(m.x, m.y); g.arc(m.x, m.y, range, a - Math.PI / 2 - half, a - Math.PI / 2 + half); g.closePath(); g.fill();
      g.restore();
      const n = Math.round(2 * Math.max(1, dt * 60));
      for (let i = 0; i < n && this.particles.length < 600; i++) {
        const sa = a + (Math.random() - 0.5) * 2 * half * 0.8, v = range * (2 + Math.random() * 2);
        this.particles.push({ x: m.x, y: m.y, vx: Math.sin(sa) * v, vy: -Math.cos(sa) * v, age: 0, life: 0.3 + Math.random() * 0.1, size: 0.9 * k, color: '', kind: 'flame' });
      }
    }
  }

  private drawPads(g: CanvasRenderingContext2D, s: TdSnapshot, t: number) {
    const k = this.k, ws = s.workshop;
    for (const p of PADS) {
      const { x, y } = this.P(p.x, p.y), sel = ws?.pad === p.id, built = s.towers.find((q) => q.pad === p.id);
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
        // The build marker: a hex outline, brighter when a tower is affordable.
        g.strokeStyle = s.scrap >= 60 ? `rgba(255,210,74,${0.45 + 0.25 * Math.sin(t * 3 + p.id)})` : 'rgba(255,255,255,0.18)';
        g.lineWidth = Math.max(1.5, k * 0.3); this.hex(g, x, y, 3.6 * k); g.stroke();
      }
    }
    if (ws?.pad === BASE_PAD) { const b = this.P(BASE_X, BASE_Y); g.strokeStyle = '#ffd24a'; g.lineWidth = Math.max(2, k * 0.5); g.beginPath(); g.arc(b.x, b.y, (TURRET_R + 1) * k, 0, TAU); g.stroke(); }
  }

  /** The turret's target gets a white reticle; a rider's lock gets a gold one that holds still. */
  private reticle(g: CanvasRenderingContext2D, e: EnemyView, x: number, y: number, t: number, locked = false) {
    const r = (e.radius + 1.6) * this.k, a = locked ? Math.PI / 4 : t * 2;
    g.strokeStyle = locked ? '#ffd24a' : 'rgba(255,255,255,0.75)'; g.lineWidth = locked ? 2.5 : 1.5;
    for (let i = 0; i < 4; i++) { const q = a + i * Math.PI / 2; g.beginPath(); g.arc(x, y, r, q, q + 0.6); g.stroke(); }
  }

  /** Fireballs climb from the launcher's mouth and drop onto their road point. */
  private drawShells(g: CanvasRenderingContext2D, s: TdSnapshot, muzzle: { x: number; y: number }) {
    const k = this.k;
    for (const sh of s.shells) {
      const end = this.P(sh.x1, sh.y1), x = muzzle.x + (end.x - muzzle.x) * sh.k, y0 = muzzle.y + (end.y - muzzle.y) * sh.k;
      const lift = Math.sin(Math.PI * sh.k) * 12 * k;
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(x, y0, 1.2 * k, 0.6 * k, 0, 0, TAU); g.fill();
      g.save(); g.globalCompositeOperation = 'lighter'; glowAt(g, '#ff8a3a', x, y0 - lift, 2.8 * k, 0.9); g.restore();
      g.fillStyle = '#ffe2b0'; g.beginPath(); g.arc(x, y0 - lift, 0.9 * k, 0, TAU); g.fill();
      if (this.particles.length < 600 && Math.random() < 0.6) this.particles.push({ x, y: y0 - lift, vx: (Math.random() - 0.5) * 3 * k, vy: (Math.random() - 0.5) * 3 * k, age: 0, life: 0.3, size: 0.9 * k, color: '', kind: 'flame' });
    }
  }

  /** Turret shots start at the muzzle; tower effects at their pads. */
  private drawFx(g: CanvasRenderingContext2D, s: TdSnapshot, muzzle: { x: number; y: number }, t: number) {
    const k = this.k, rot = this.view.rot;
    g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
    for (const f of s.fx as Fx[]) {
      const age = t - f.t0, life = 1 - age / f.life;
      if (life <= 0) continue;
      if (f.kind === 'tracer') {
        g.strokeStyle = COL.blue; g.globalAlpha = life; g.lineWidth = Math.max(1, k * 0.45);
        const end = this.P(f.x1, f.y1), x0 = muzzle.x, y0 = muzzle.y, q = Math.min(1, age / f.life + 0.3);
        g.beginPath(); g.moveTo(x0 + (end.x - x0) * (q - 0.3), y0 + (end.y - y0) * (q - 0.3)); g.lineTo(x0 + (end.x - x0) * q, y0 + (end.y - y0) * q); g.stroke();
        g.globalAlpha = 1;
      } else if (f.kind === 'beam') {
        const a = f.angle + rot, ex = muzzle.x + Math.sin(a) * 160 * k, ey = muzzle.y - Math.cos(a) * 160 * k;
        g.strokeStyle = COL.purple; g.globalAlpha = life * 0.6; g.lineWidth = (f.spread ? 3.5 : 4.5) * k * life;
        g.beginPath(); g.moveTo(muzzle.x, muzzle.y); g.lineTo(ex, ey); g.stroke();
        g.strokeStyle = '#ffffff'; g.globalAlpha = life; g.lineWidth = 1.2 * k * life;
        g.beginPath(); g.moveTo(muzzle.x, muzzle.y); g.lineTo(ex, ey); g.stroke(); g.globalAlpha = 1;
      } else if (f.kind === 'zap') {
        g.strokeStyle = LIGHT.blue; g.globalAlpha = life; g.lineWidth = Math.max(1, k * 0.4);
        g.beginPath();
        f.pts.forEach((p, i) => {
          const { x, y } = this.P(p.x, p.y);
          if (!i) { g.moveTo(x, y); return; }
          const pr = this.P(f.pts[i - 1].x, f.pts[i - 1].y);
          for (let j = 1; j < 5; j++) g.lineTo(pr.x + (x - pr.x) * j / 5 + (Math.random() - 0.5) * 2.2 * k, pr.y + (y - pr.y) * j / 5 + (Math.random() - 0.5) * 2.2 * k);
          g.lineTo(x, y);
        });
        g.stroke();
        for (const p of f.pts.slice(1)) { const q = this.P(p.x, p.y); glowAt(g, COL.blue, q.x, q.y, 2.5 * k, life); }
        g.globalAlpha = 1;
      } else if (f.kind === 'lens') {
        const a = this.P(f.x0, f.y0), b = this.P(f.x1, f.y1);
        g.strokeStyle = COL.purple; g.globalAlpha = life * 0.7; g.lineWidth = 2 * k * life;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        g.strokeStyle = '#fff'; g.globalAlpha = life; g.lineWidth = 0.6 * k;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.globalAlpha = 1;
        glowAt(g, COL.purple, b.x, b.y, 3 * k, life);
      } else if (f.kind === 'boom' || f.kind === 'burst') {
        const q = this.P(f.x, f.y); glowAt(g, '#ff7a2a', q.x, q.y, f.r * k * (0.45 + 0.35 * (1 - life)), life * 0.45);
      }
    }
    // rail targeting laser
    if (s.laserId) {
      const e = s.enemies.find((q) => q.id === s.laserId);
      if (e) {
        const { x, y } = this.P(e.x, e.y), fl = 0.6 + 0.4 * Math.sin(t * 40);
        g.strokeStyle = COL.purple; g.globalAlpha = 0.5 * fl; g.lineWidth = Math.max(1, 0.6 * k);
        g.beginPath(); g.moveTo(muzzle.x, muzzle.y); g.lineTo(x, y); g.stroke(); g.globalAlpha = 1;
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
