import type { BikeState, GameRenderer, InputState, Insets, Profile } from '../../../contracts';
import { play, unlockAudio, type SfxName } from '../../../audio/sfx';
import { fmtDur, fmtJ, fmtW } from '../sim/econ';
import type { HamsterSnapshot, ShopItem } from '../sim/sim';
import { COMIC, FONT, FURS, TAU, glow, hamster, rr } from './draw';
import { SCENES, type Box, type SceneState } from './scenes';
import { layout } from './layout';

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; kind: 'confetti' | 'spark' | 'text' | 'seed' | 'fw'; color: string; text?: string; size: number; rot: number }
interface Rect { x: number; y: number; w: number; h: number }
type Font = (px: number, weight?: number) => string;

const CUE_GAP: Partial<Record<SfxName, number>> = { select: 0.05, buy: 0.05, shrine: 0.4, potion: 0.2 };
const C = {
  panel: '#140e24', panel2: '#0d0918', card: 'rgba(16,11,32,0.78)', line: 'rgba(255,255,255,0.08)',
  text: '#f4f0ff', dim: '#a49cc4', faint: '#6c6490', gold: '#ffcf4a', green: '#6dffb0', pink: '#ff5fa8', cyan: '#4fd6ff', red: '#ff6a7a',
};
const GEN_ICON = ['🐹', '🐭', '🐷', '🏋️', '🦦', '🦫', '🏢', '🤳', '📈', '🔌', '🌊', '🌬️', '☢️', '🌀', '🍩', '🌍', '🌋', '🌕', '💍', '🪐', '☀️', '🕳️', '🌌', '♾️'];
const SPECIAL_ICON: Record<string, string> = { manager: '👔', hr: '📋', union: '✊', seedsub: '📦', dealer: '🕶️', zen: '🧘', trialpro: '🧪', cloning: '🧬' };
const PEP_ICON: Record<string, string> = { seeds: '🌻', bpc: '💉', tb: '💉', pre: '⚡', ozem: '💊', mk: '🦍', tren: '💪', vial: '🧪', stack: '🐉' };
const VIBE_ICON: Record<string, string> = { shades: '😎', confetti: '🎉', rgb: '🌈', shake: '📳', disco: '🪩', comic: '🔤', lasers: '🔦', tesla: '⚡', crt: '📺', vapor: '🌴', bighead: '🗿', hypno: '🌀', fried: '🍳', halo: '😇' };
const TAB_ICON: Record<string, string> = { gens: '🐹', upgrades: '⬆️', market: '💉', vibes: '✨', rebirth: '☸️' };
const EFFECT_ICON: Record<string, string> = { seeds: '🌻', bpc: '🩹', tb: '💉', pre: '⚡', crash: '😵', ozem: '💊', mk: '🦍', tren: '💪', vial: '🧪', stack: '🐉', frenzy: '🌟', quads: '🦵', solidarity: '🤝' };
const TIER_HUES = [30, 45, 300, 210, 160, 200, 40, 270];

function itemIcon(it: ShopItem): { icon: string; hue: number } {
  const [kind, a] = it.key.split(':');
  if (it.locked) return { icon: '❔', hue: 250 };
  if (kind === 'gen') return { icon: GEN_ICON[+a] ?? '🐹', hue: TIER_HUES[Math.floor(+a / 3)] };
  if (kind === 'g') return { icon: GEN_ICON[+a] ?? '⬆️', hue: TIER_HUES[Math.floor(+a / 3)] };
  if (kind === 'leg') return { icon: '🦵', hue: 210 };
  if (kind === 'mono') return { icon: '😐', hue: 40 };
  if (kind === 'sp') return { icon: SPECIAL_ICON[a] ?? '⭐', hue: 320 };
  if (kind === 'pep') return { icon: PEP_ICON[a] ?? '💉', hue: 140 };
  if (kind === 'vibe') return { icon: VIBE_ICON[a] ?? '✨', hue: 280 };
  return { icon: '☸️', hue: 50 };
}
const monoFace = (m: number) => (m < 1.5 ? '🙂' : m < 3 ? '😐' : m < 5 ? '😑' : m < 8 ? '😶' : '🫥');
const ease = (k: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, k)), 3);

export class HamsterRenderer implements GameRenderer {
  private canvas!: HTMLCanvasElement;
  private g!: CanvasRenderingContext2D;
  private dpr = 1; private W = 800; private H = 600; private insetB = 0;
  private send?: (a: unknown) => void;
  private last = 0; private time = 0; private spin = 0; private hue = 0;
  private parts: Particle[] = [];
  private lastCue = -1; private lastBuy = -1; private lastToast = -1; private textAcc = 0;
  private prevEra = -1; private trans: { from: number; t0: number } | null = null; private eraBanner: { text: string; sub: string; t0: number } | null = null;
  private shake = 0; private scroll = 0; private tickerX = 0; private tickerId = -1; private shownBank = 0; private bankPulse = 0;
  private tabRects: Array<Rect & { i: number }> = [];
  private rowRects: Array<Rect & { i: number }> = [];
  private acceptRect: Rect | null = null;
  private onPointer = (e: PointerEvent) => {
    unlockAudio();
    const r = this.canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const inR = (b: Rect) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    if (this.acceptRect && inR(this.acceptRect)) { this.send?.({ type: 'accept' }); return; }
    for (const t of this.tabRects) if (inR(t)) { this.send?.({ type: 'tab', i: t.i }); return; }
    for (const t of this.rowRects) if (inR(t)) { this.send?.({ type: 'row', i: t.i }); return; }
  };

  mount(container: HTMLElement, ctx: { profile: Readonly<Profile>; send?: (a: unknown) => void; insets?: Insets }) {
    this.send = ctx.send;
    this.insetB = ctx.insets?.bottom ?? 0;
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'width:100%;height:100%;display:block;background:#0b0812;touch-action:none';
    container.appendChild(this.canvas);
    this.canvas.addEventListener('pointerdown', this.onPointer);
    this.g = this.canvas.getContext('2d')!;
    this.dpr = Math.min(2, globalThis.devicePixelRatio ?? 1);
    this.resize(container.clientWidth || 800, container.clientHeight || 600);
  }
  resize(w: number, h: number) { this.W = w; this.H = h; this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr); }
  setInsets(i: Insets) { this.insetB = i.bottom; }
  unmount() { this.canvas?.removeEventListener('pointerdown', this.onPointer); this.canvas?.remove(); }

  render(snapshot: unknown, bike: Readonly<BikeState>, _input: Readonly<InputState>) {
    const s = snapshot as HamsterSnapshot, g = this.g;
    const now = performance.now() / 1000, dt = this.last ? Math.min(0.1, now - this.last) : 0.016; this.last = now;
    this.time += dt; this.hue = (this.hue + dt * 90) % 360;
    const vibes = new Set(s.vibesOn), stopped = !s.unionOn;
    const speed = bike.cadence3s / 60;
    this.spin += speed * TAU * dt;
    this.audio(s);
    // the counter eases toward the real bank (in log space so big jumps still feel smooth)
    if (this.shownBank <= 0 || s.bank < this.shownBank * 0.5 || s.bank <= 0) this.shownBank = s.bank;
    else this.shownBank = Math.exp(Math.log(this.shownBank) + (Math.log(Math.max(1e-9, s.bank)) - Math.log(this.shownBank)) * Math.min(1, dt * 10));
    this.bankPulse = Math.max(0, this.bankPulse - dt * 3);

    const W = this.W, H = this.H;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#0b0812'; g.fillRect(0, 0, W, H);
    const { scene, panel, UH } = layout(W, H, this.insetB); // foreground lives above the HUD band; backgrounds are stretched under it below
    const family = vibes.has('comic') ? COMIC : FONT;
    const F: Font = (px, weight = 600) => `${weight} ${px}px ${family}`;

    this.spawn(s, scene, panel, vibes, stopped, dt);

    // ---------- scene ----------
    g.save();
    if (this.shake > 0) { this.shake -= dt; const a = this.shake * 30; g.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a); }
    if (s.effects.some((e) => e.id === 'pre') || s.rage) g.translate((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
    g.beginPath(); g.rect(scene.x, scene.y, scene.w, scene.h); g.clip();
    const st: SceneState = { s, time: this.time, spin: this.spin, speed, vibes, strikeOn: s.strike?.phase === 'active', stopped, hue: this.hue };
    const tr = this.trans && this.time - this.trans.t0 < 2.4 ? this.trans : null;
    if (tr) {
      const p = (this.time - tr.t0) / 2.4, e = p * p * (3 - 2 * p), cx = scene.x + scene.w / 2, cy = scene.y + scene.h / 2;
      g.save(); g.translate(cx, cy); g.scale(3 - 2 * e, 3 - 2 * e); g.translate(-cx, -cy); SCENES[s.era](g, scene, st); g.restore();
      g.save(); g.globalAlpha = 1 - e; g.translate(cx, cy); const k = 1 - 0.92 * e; g.scale(k, k); g.rotate(e * 1.5); g.translate(-cx, -cy); SCENES[tr.from](g, scene, st); g.restore();
    } else SCENES[s.era](g, scene, st);
    this.vibeOverlays(g, scene, s, vibes);
    this.pepOverlays(g, scene, s);
    // depth vignette
    const vg = g.createRadialGradient(scene.x + scene.w / 2, scene.y + scene.h * 0.55, Math.min(scene.w, scene.h) * 0.35, scene.x + scene.w / 2, scene.y + scene.h * 0.55, Math.max(scene.w, scene.h) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)'); g.fillStyle = vg; g.fillRect(scene.x, scene.y, scene.w, scene.h);
    if (stopped) this.breakOverlay(g, scene, F);
    if (s.golden) this.drawGolden(g, s, scene);
    this.drawParticles(g, dt, F);
    this.drawHeader(g, s, scene, F);
    this.drawEvents(g, s, scene, F);
    this.drawToasts(g, s, scene, F);
    this.drawTicker(g, s, scene, F, dt);
    this.drawEraBanner(g, scene, F);
    g.restore();

    this.drawPanel(g, s, panel, F, dt);

    // keep backgrounds full-bleed: stretch the last rows above the HUD down over the band it covers
    const band = H - UH;
    if (band > 0.5) {
      const d = this.dpr, sy = Math.max(0, Math.round(UH * d) - 3);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(this.canvas, 0, sy, this.canvas.width, 3, 0, Math.round(UH * d), this.canvas.width, this.canvas.height - Math.round(UH * d));
    }
  }

  // ---------- bookkeeping ----------
  private audio(s: HamsterSnapshot) {
    if (this.lastCue < 0) { this.lastCue = s.cues.length ? s.cues[s.cues.length - 1].id : 0; return; }
    for (const c of s.cues) if (c.id > this.lastCue) { this.lastCue = c.id; play(c.name as SfxName, { minGapS: CUE_GAP[c.name as SfxName] }); }
  }
  private spawn(s: HamsterSnapshot, scene: Box, panel: Box, vibes: Set<string>, stopped: boolean, dt: number) {
    if (this.lastBuy < 0) this.lastBuy = s.buySeq;
    if (s.buySeq > this.lastBuy) {
      this.lastBuy = s.buySeq; this.bankPulse = 1;
      if (vibes.has('shake')) this.shake = 0.3;
      const row = this.rowRects.find((r) => r.i === s.row), cx = row ? row.x + 32 : panel.x + 40, cy = row ? row.y + row.h / 2 : panel.y + 120;
      for (let i = 0; i < 18; i++) { const a = Math.random() * TAU, v = 80 + Math.random() * 220; this.parts.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: 0, max: 0.7, kind: 'spark', color: i % 2 ? C.gold : '#fff', size: 3, rot: 0 }); }
      if (vibes.has('confetti')) for (let i = 0; i < 80; i++) this.parts.push({ x: scene.x + Math.random() * scene.w, y: scene.y - 10, vx: (Math.random() - 0.5) * 80, vy: 40 + Math.random() * 160, life: 0, max: 3, kind: 'confetti', color: `hsl(${Math.random() * 360},90%,60%)`, size: 7, rot: Math.random() * 6 });
    }
    for (const t of s.toasts) if (t.id > this.lastToast) {
      this.lastToast = t.id;
      if (t.kind === 'milestone' || t.kind === 'era') this.firework(scene.x + scene.w * (0.2 + Math.random() * 0.6), scene.y + scene.h * (0.25 + Math.random() * 0.2), t.kind === 'era' ? 80 : 36);
    }
    if (this.prevEra >= 0 && s.era !== this.prevEra) {
      this.trans = { from: this.prevEra, t0: this.time };
      this.eraBanner = { text: s.eraName.toUpperCase(), sub: s.eraBlurb, t0: this.time };
      for (let i = 0; i < 5; i++) this.firework(scene.x + scene.w * (0.15 + i * 0.17), scene.y + scene.h * 0.35, 60);
    }
    this.prevEra = s.era;
    if (s.rate > 0 && !stopped) {
      this.textAcc += dt;
      if (this.textAcc > 0.8) {
        this.textAcc = 0;
        this.parts.push({ x: scene.x + scene.w * (0.12 + Math.random() * 0.4), y: scene.y + scene.h * (0.55 + Math.random() * 0.15), vx: (Math.random() - 0.5) * 20, vy: -46, life: 0, max: 1.8, kind: 'text', color: s.glow ? C.gold : C.green, text: `+${fmtJ(s.rate * 0.8)}`, size: 15, rot: 0 });
      }
    }
    if (s.effects.some((e) => e.id === 'seeds') && Math.random() < dt * 25) this.parts.push({ x: scene.x + Math.random() * scene.w, y: scene.y, vx: 0, vy: 120 + Math.random() * 80, life: 0, max: 4, kind: 'seed', color: '#2a2a2a', size: 5, rot: Math.random() * 6 });
    if (s.golden && Math.random() < dt * 40) { const gp = this.goldenPos(s, scene); this.parts.push({ x: gp.x + (Math.random() - 0.5) * 30, y: gp.y, vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 60, life: 0, max: 0.8, kind: 'spark', color: '#fff6a0', size: 2.5, rot: 0 }); }
  }
  private firework(x: number, y: number, n: number) {
    const hue = Math.random() * 360;
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = 60 + Math.random() * 220; this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 1.2 + Math.random() * 0.6, kind: 'fw', color: `hsl(${hue + Math.random() * 60},95%,65%)`, size: 2.6, rot: 0 }); }
  }
  private drawParticles(g: CanvasRenderingContext2D, dt: number, F: Font) {
    const keep: Particle[] = [];
    for (const p of this.parts) {
      p.life += dt; if (p.life >= p.max) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 5;
      if (p.kind === 'fw' || p.kind === 'spark') { p.vy += 160 * dt; p.vx *= 0.99; }
      const a = 1 - p.life / p.max;
      g.globalAlpha = Math.max(0, a);
      if (p.kind === 'text') {
        const k = Math.min(1, p.life * 6), sz = p.size * (0.6 + 0.4 * ease(k));
        g.font = F(sz, 800); g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.strokeText(p.text ?? '', p.x, p.y);
        g.fillStyle = p.color; g.fillText(p.text ?? '', p.x, p.y);
      } else if (p.kind === 'confetti') { g.save(); g.translate(p.x + Math.sin(p.rot) * 10, p.y); g.rotate(p.rot); g.scale(1, Math.cos(p.rot * 1.7)); g.fillStyle = p.color; g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); g.restore(); }
      else if (p.kind === 'seed') { g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = '#333'; g.beginPath(); g.ellipse(0, 0, 3, 6, 0, 0, TAU); g.fill(); g.strokeStyle = '#ddd'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -5); g.lineTo(0, 5); g.stroke(); g.restore(); }
      else { g.fillStyle = p.color; g.beginPath(); g.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, TAU); g.fill(); }
      keep.push(p);
    }
    g.globalAlpha = 1;
    this.parts = keep.length > 900 ? keep.slice(-900) : keep;
  }

  // ---------- scene overlays ----------
  private breakOverlay(g: CanvasRenderingContext2D, b: Box, F: Font) {
    g.fillStyle = 'rgba(6,4,14,0.55)'; g.fillRect(b.x, b.y, b.w, b.h);
    const w = Math.min(420, b.w - 40), x = b.x + (b.w - w) / 2, y = b.y + b.h * 0.4;
    this.glass(g, x, y, w, 96, 18);
    g.textAlign = 'center';
    g.font = F(34); g.fillText('💤', b.x + b.w / 2, y + 40);
    g.fillStyle = C.text; g.font = F(19, 800); g.fillText('The hamsters are on break', b.x + b.w / 2, y + 66);
    g.fillStyle = C.dim; g.font = F(13); g.fillText('They only run when you run. Pedal to resume.', b.x + b.w / 2, y + 86);
    g.textAlign = 'left';
  }
  private goldenPos(s: HamsterSnapshot, b: Box) {
    const gd = s.golden!, p = (this.time * 0.16 + gd.x) % 1;
    return { x: b.x + b.w * (0.1 + 0.8 * (p < 0.5 ? p * 2 : 2 - p * 2)), y: b.y + b.h * 0.42 + Math.sin(this.time * 7) * 8, flip: p >= 0.5 };
  }
  private drawGolden(g: CanvasRenderingContext2D, s: HamsterSnapshot, b: Box) {
    const gp = this.goldenPos(s, b), gd = s.golden!;
    g.save(); g.globalCompositeOperation = 'lighter'; glow(g, gp.x, gp.y, 70, 'rgba(255,210,80,A)', 0.45); g.restore();
    for (let i = 0; i < 8; i++) { const a = this.time * 1.5 + (i / 8) * TAU; g.strokeStyle = 'rgba(255,230,140,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(gp.x + Math.cos(a) * 34, gp.y + Math.sin(a) * 34); g.lineTo(gp.x + Math.cos(a) * 54, gp.y + Math.sin(a) * 54); g.stroke(); }
    hamster(g, gp.x - 2, gp.y + 20, 54, this.time * 20, { fur: FURS.golden, flip: gp.flip, shades: true, noShadow: true }, this.time);
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,255,255,0.2)'; g.lineWidth = 6; g.beginPath(); g.arc(gp.x, gp.y, 44, 0, TAU); g.stroke();
    g.strokeStyle = C.gold; g.beginPath(); g.arc(gp.x, gp.y, 44, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, gd.progress / gd.need)); g.stroke();
  }
  private vibeOverlays(g: CanvasRenderingContext2D, b: Box, s: HamsterSnapshot, v: Set<string>) {
    const t = this.time;
    if (v.has('disco')) {
      const cx = b.x + b.w / 2, cy = b.y + 140;
      g.strokeStyle = '#888'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, b.y); g.lineTo(cx, cy - 22); g.stroke();
      g.save(); g.beginPath(); g.arc(cx, cy, 22, 0, TAU); g.clip();
      for (let i = 0; i < 64; i++) { const col = i % 8, row = Math.floor(i / 8); g.fillStyle = `hsl(${(i * 47 + this.hue) % 360},20%,${55 + 40 * Math.abs(Math.sin(t * 3 + i))}%)`; g.fillRect(cx - 22 + ((col * 6 + t * 20) % 48) - 2, cy - 22 + row * 6, 5, 5); }
      g.restore();
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 10; i++) { const x = b.x + b.w * (0.5 + 0.45 * Math.sin(t * 0.7 + i * 2.1)), y = b.y + b.h * (0.5 + 0.4 * Math.cos(t * 0.9 + i * 1.3)); glow(g, x, y, 46, `hsla(${(i * 40 + this.hue) % 360},100%,60%,A)`, 0.25); }
      g.restore();
    }
    if (v.has('lasers')) {
      g.save(); g.globalCompositeOperation = 'lighter'; g.lineWidth = 3;
      for (let i = 0; i < 6; i++) { const ox = i % 2 ? b.x + b.w : b.x, a = (i % 2 ? Math.PI : 0) + (i % 2 ? 1 : -1) * (0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.3 + i))); g.strokeStyle = `hsla(${[120, 300, 180][i % 3]},100%,60%,0.7)`; g.beginPath(); g.moveTo(ox, b.y + b.h); g.lineTo(ox + Math.cos(a) * b.w * 1.5, b.y + b.h - Math.abs(Math.sin(a)) * b.w * 1.5); g.stroke(); }
      g.restore();
    }
    if (v.has('tesla') && s.unionOn) {
      g.save(); g.strokeStyle = '#d0e4ff'; g.shadowColor = '#7ab0ff'; g.shadowBlur = 14; g.lineWidth = 2;
      for (let k = 0; k < 2; k++) if (Math.random() < 0.5) {
        let x = b.x + b.w * (0.1 + Math.random() * 0.8), y = b.y + 120; g.beginPath(); g.moveTo(x, y);
        for (let i = 0; i < 10; i++) { x += (Math.random() - 0.5) * 40; y += b.h * 0.06; g.lineTo(x, y); }
        g.stroke();
      }
      g.restore();
    }
    if (s.mono > 1.5) { g.fillStyle = `rgba(200,180,140,${Math.min(0.16, (s.mono - 1.5) / 50)})`; g.fillRect(b.x, b.y, b.w, b.h); }
    if (v.has('fried')) {
      g.save(); g.globalCompositeOperation = 'overlay'; g.fillStyle = 'rgba(255,90,0,0.45)'; g.fillRect(b.x, b.y, b.w, b.h);
      g.globalCompositeOperation = 'color-dodge'; g.fillStyle = 'rgba(90,40,0,0.5)'; g.fillRect(b.x, b.y, b.w, b.h); g.restore();
      g.font = '28px sans-serif'; const em = ['😂', '💯', '🔥', '👌', '🅱️'];
      for (let i = 0; i < 7; i++) g.fillText(em[i % em.length], b.x + b.w * ((i * 0.37 + 0.1) % 1), b.y + b.h * ((i * 0.53 + 0.2) % 1));
    }
    if (v.has('crt')) {
      g.fillStyle = 'rgba(0,0,0,0.22)'; for (let y = b.y; y < b.y + b.h; y += 3) g.fillRect(b.x, y, b.w, 1);
      g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,0,60,0.03)'; g.fillRect(b.x + 1, b.y, b.w, b.h); g.fillStyle = 'rgba(0,120,255,0.03)'; g.fillRect(b.x - 1, b.y, b.w, b.h); g.restore();
    }
  }
  private pepOverlays(g: CanvasRenderingContext2D, b: Box, s: HamsterSnapshot) {
    const has = (id: string) => s.effects.some((e) => e.id === id);
    if (has('pre')) { g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; for (let i = 0; i < 16; i++) { const y = b.y + ((i * 97 + this.time * 30) % b.h), x = b.x + b.w - ((this.time * 1400 + i * 211) % (b.w + 300)); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 120, y); g.stroke(); } }
    if (has('crash')) { g.fillStyle = 'rgba(60,60,70,0.4)'; g.fillRect(b.x, b.y, b.w, b.h); }
    if (has('tren') || s.rage) {
      const p = 0.35 + 0.25 * Math.sin(this.time * (s.rage ? 12 : 5));
      const vg = g.createRadialGradient(b.x + b.w / 2, b.y + b.h / 2, Math.min(b.w, b.h) * 0.3, b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h) * 0.7);
      vg.addColorStop(0, 'rgba(255,0,0,0)'); vg.addColorStop(1, `rgba(220,0,0,${p})`); g.fillStyle = vg; g.fillRect(b.x, b.y, b.w, b.h);
    }
    if (s.glow) { g.save(); g.globalCompositeOperation = 'lighter'; glow(g, b.x + b.w * 0.3, b.y + b.h * 0.65, b.w * 0.6, 'rgba(255,210,60,A)', 0.3); g.restore(); }
    if (s.trial?.phase === 'active') { g.fillStyle = 'rgba(80,160,255,0.1)'; g.fillRect(b.x, b.y, b.w, b.h); }
    if (s.strike?.phase === 'active') { g.fillStyle = 'rgba(120,0,0,0.16)'; g.fillRect(b.x, b.y, b.w, b.h); }
  }

  // ---------- HUD ----------
  private glass(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 14, border = C.line) {
    g.save(); g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 18; g.shadowOffsetY = 4;
    g.fillStyle = C.card; rr(g, x, y, w, h, r); g.fill(); g.restore();
    g.strokeStyle = border; g.lineWidth = 1; rr(g, x + 0.5, y + 0.5, w - 1, h - 1, r); g.stroke();
    g.fillStyle = C.text;
  }
  private bar(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, fill: string | CanvasGradient, glowCol?: string) {
    g.fillStyle = 'rgba(255,255,255,0.08)'; rr(g, x, y, w, h, h / 2); g.fill();
    const fw = Math.max(h, w * Math.max(0, Math.min(1, frac)));
    if (frac <= 0) return;
    g.save(); if (glowCol) { g.shadowColor = glowCol; g.shadowBlur = 10; }
    g.fillStyle = fill; rr(g, x, y, fw, h, h / 2); g.fill(); g.restore();
    g.fillStyle = 'rgba(255,255,255,0.25)'; rr(g, x + 2, y + 1, fw - 4, h * 0.35, h * 0.2); g.fill();
  }
  private drawHeader(g: CanvasRenderingContext2D, s: HamsterSnapshot, b: Box, F: Font) {
    const pad = 12, narrow = b.w < 560;
    const lw = narrow ? b.w - pad * 2 : Math.min(360, b.w * 0.5 - pad * 1.5), lx = b.x + pad, ly = b.y + pad;
    // bank card
    this.glass(g, lx, ly, lw, 92);
    const scale = 1 + this.bankPulse * 0.06;
    g.save(); g.translate(lx + 16, ly + 44); g.scale(scale, scale);
    const bankTxt = fmtJ(this.shownBank);
    g.font = F(Math.min(36, lw / 9), 900);
    const tg = g.createLinearGradient(0, -30, 0, 4); tg.addColorStop(0, '#fff6c8'); tg.addColorStop(1, C.gold);
    g.shadowColor = 'rgba(255,200,60,0.5)'; g.shadowBlur = 12; g.fillStyle = tg; g.fillText(bankTxt, 0, 0);
    g.restore();
    // rate pill
    const rateTxt = `⚡ ${s.rate >= 0 ? '+' : ''}${fmtW(s.rate)}`;
    g.font = F(13, 800); const rw = g.measureText(rateTxt).width + 18;
    g.fillStyle = s.rate < 0 ? 'rgba(255,90,110,0.2)' : 'rgba(109,255,176,0.16)'; rr(g, lx + 14, ly + 54, rw, 22, 11); g.fill();
    g.fillStyle = s.rate < 0 ? C.red : C.green; g.fillText(rateTxt, lx + 23, ly + 70);
    g.font = F(12, 500); g.fillStyle = C.dim;
    g.save(); g.beginPath(); g.rect(lx + rw + 20, ly + 50, lw - rw - 26, 30); g.clip(); g.fillText(s.equiv, lx + rw + 22, ly + 70); g.restore();
    g.font = F(10.5, 600); g.fillStyle = C.faint;
    g.fillText(`🐹 ${fmtW(s.hamRate)}   🦵 ${fmtW(s.legRate)}   ·   Z${s.zone}  ${Math.round(s.cadence)} rpm`, lx + 16, ly + 86);
    // meters card
    const mw = narrow ? lw : b.w - lw - pad * 3, mx = narrow ? lx : lx + lw + pad, my = narrow ? ly + 100 : ly;
    if (mw < 160) return;
    this.glass(g, mx, my, mw, 92);
    const ix = mx + 14, iw = mw - 28;
    g.font = F(10.5, 800); g.fillStyle = C.dim; g.fillText('🌌 KARDASHEV', ix, my + 20);
    g.font = F(15, 900); g.fillStyle = C.text; g.textAlign = 'right'; g.fillText(s.k.toFixed(2), ix + iw, my + 21); g.textAlign = 'left';
    const kn = (k: number) => Math.max(0, Math.min(1, (k + 0.6) / 3.6));
    const kg = g.createLinearGradient(ix, 0, ix + iw, 0); kg.addColorStop(0, '#7a5aff'); kg.addColorStop(0.45, C.cyan); kg.addColorStop(0.72, C.gold); kg.addColorStop(1, C.pink);
    this.bar(g, ix, my + 27, iw, 9, kn(s.k), kg, 'rgba(120,200,255,0.6)');
    g.font = F(8.5, 700); g.fillStyle = C.faint;
    for (const [k, lab] of [[0, 'I'], [1, 'PLANET'], [2, 'STAR'], [3, 'GALAXY']] as const) { const tx = ix + iw * kn(k); g.fillRect(tx, my + 38, 1, 4); g.textAlign = k === 3 ? 'right' : 'center'; g.fillText(lab, k === 3 ? tx + 1 : tx, my + 50); }
    g.textAlign = 'left';
    const frac = (s.mono - 1) / Math.max(0.01, s.monoCap - 1);
    g.font = F(10.5, 800); g.fillStyle = C.dim; g.fillText(`${monoFace(s.mono)} MIND-NUMBING`, ix, my + 68);
    const trend = s.monoTrend > 0 ? 'stay boring ▲' : s.monoTrend < 0 ? 'too exciting ▼' : '';
    g.font = F(15, 900); g.fillStyle = C.text; g.textAlign = 'right'; g.fillText(`×${s.mono.toFixed(2)}`, ix + iw, my + 69);
    g.font = F(9.5, 700); g.fillStyle = s.monoTrend < 0 ? C.red : '#e8d8a8'; g.fillText(`${trend}  cap ×${s.monoCap}`, ix + iw - 58, my + 68); g.textAlign = 'left';
    const mg = g.createLinearGradient(ix, 0, ix + iw, 0); mg.addColorStop(0, '#a8987a'); mg.addColorStop(1, s.monoTrend < 0 ? '#ff8a6a' : '#ffe6a0');
    this.bar(g, ix, my + 74, iw, 9, frac, mg);
    if (s.monoTrend > 0) { // barber-pole shimmer while building
      g.save(); rr(g, ix, my + 74, iw * Math.max(0, Math.min(1, frac)), 9, 4.5); g.clip();
      g.fillStyle = 'rgba(255,255,255,0.18)'; for (let k = -2; k < iw / 10 + 2; k++) { const sx = ix + k * 10 + ((this.time * 20) % 10); g.beginPath(); g.moveTo(sx, my + 83); g.lineTo(sx + 5, my + 83); g.lineTo(sx + 10, my + 74); g.lineTo(sx + 5, my + 74); g.fill(); }
      g.restore();
    }
    // effect chips
    let cx = b.x + pad; const cy = (narrow ? my : ly) + 100;
    for (const e of s.effects) {
      const label = `${EFFECT_ICON[e.id] ?? '✨'} ${e.label}`;
      g.font = F(11, 800); const tw = g.measureText(label).width + 40;
      if (cx + tw > b.x + b.w - pad) break;
      const col = e.mult < 1 ? 'rgba(255,90,110,0.85)' : e.kind === 'leg' ? 'rgba(79,150,255,0.85)' : e.kind === 'nodecay' || e.kind === 'cheap' ? 'rgba(80,200,140,0.85)' : 'rgba(170,90,255,0.85)';
      g.fillStyle = col; rr(g, cx, cy, tw, 24, 12); g.fill();
      g.fillStyle = '#fff'; g.fillText(label, cx + 10, cy + 16);
      const rx = cx + tw - 14, ry = cy + 12, k = Math.max(0, e.left / e.total);
      g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 2.5; g.beginPath(); g.arc(rx, ry, 7, 0, TAU); g.stroke();
      g.strokeStyle = '#fff'; g.beginPath(); g.arc(rx, ry, 7, -Math.PI / 2, -Math.PI / 2 + TAU * k); g.stroke();
      cx += tw + 6;
    }
  }

  private drawEvents(g: CanvasRenderingContext2D, s: HamsterSnapshot, b: Box, F: Font) {
    this.acceptRect = null;
    let y = b.y + (b.w < 560 ? 240 : 140);
    const w = Math.min(460, b.w - 24), x = b.x + (b.w - w) / 2;
    const card = (accent: string, icon: string, title: string, sub: string, frac: number | null, pulse = false) => {
      const h = frac == null ? 64 : 76;
      this.glass(g, x, y, w, h, 16, accent);
      g.save(); rr(g, x, y, w, h, 16); g.clip();
      const ag = g.createLinearGradient(x, 0, x + w * 0.5, 0); ag.addColorStop(0, accent.replace(')', ',0.28)').replace('rgb', 'rgba')); ag.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = ag; g.fillRect(x, y, w, h); g.restore();
      const sc = pulse ? 1 + 0.08 * Math.sin(this.time * 8) : 1;
      g.save(); g.translate(x + 32, y + 36); g.scale(sc, sc); g.font = F(30); g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(icon, 0, 10); g.restore();
      g.textAlign = 'left';
      g.font = F(15, 900); g.fillStyle = C.text; g.fillText(title, x + 62, y + 26);
      g.font = F(12, 500); g.fillStyle = C.dim; g.fillText(sub, x + 62, y + 45);
      if (frac != null) this.bar(g, x + 62, y + 56, w - 78, 9, frac, accent, accent);
      const r = { x, y, w, h }; y += h + 8; return r;
    };
    if (s.rage) card('rgb(255,70,90)', '😡', `ROID RAGE — ${Math.ceil(s.rage.left)}s`, `Gerald is running BACKWARDS. Sprint to power Z4+ to out-pedal him (power Z${s.hardZone} now).`, s.rage.progress / s.rage.need, true);
    if (s.golden) card('rgb(255,207,74)', '🌟', `GOLDEN HAMSTER — ${Math.ceil(s.golden.left)}s`, s.hardZone >= 4 ? 'GO GO GO! Keep sprinting!' : `Sprint to power Z4+ to catch it (power Z${s.hardZone} now)`, s.golden.progress / s.golden.need, true);
    if (s.spin) {
      const on = s.cadence >= s.spin.rpm;
      card('rgb(120,220,255)', '🚴', `SPIN CLASS — ${Math.ceil(s.spin.left)}s`, on ? `That's it! Keep spinning  ·  ${Math.floor(s.spin.progress)}/${s.spin.need}s` : `Easy gear, spin ${s.spin.rpm}+ rpm (you're at ${Math.round(s.cadence)})`, s.spin.progress / s.spin.need, !on);
    }
    if (s.strike) {
      if (s.strike.phase === 'warn') card('rgb(255,140,70)', '📢', `Union meeting… strike in ${Math.ceil(s.strike.left)}s`, 'When they walk out, hold power Z3+ to carry the grid.', null, true);
      else card('rgb(255,110,70)', '✊', `STRIKE! ${Math.ceil(s.strike.left)}s — hamsters at 10%`, `Hold power Z3+ to break it  ·  ${Math.floor(s.strike.progress)}/${s.strike.need}s`, s.strike.progress / s.strike.need);
    }
    if (s.trial) {
      if (s.trial.phase === 'offer') {
        const r = card('rgb(79,180,255)', '💉', `CLINICAL TRIAL offered — ${Math.ceil(s.trial.left)}s`, 'ERG block · big payout + free sample', null, true);
        const bw = 104, bx = r.x + r.w - bw - 12, by = r.y + 18;
        const bg = g.createLinearGradient(0, by, 0, by + 30); bg.addColorStop(0, '#6ac8ff'); bg.addColorStop(1, '#2a8ad8');
        g.fillStyle = bg; rr(g, bx, by, bw, 30, 15); g.fill();
        g.fillStyle = '#fff'; g.font = F(13, 900); g.textAlign = 'center'; g.fillText('Accept  (Z)', bx + bw / 2, by + 20); g.textAlign = 'left';
        this.acceptRect = r;
      } else card('rgb(79,180,255)', '🧪', `TRIAL IN PROGRESS — ${Math.ceil(s.trial.left)}s`, `ERG holds the watts. Keep the cranks turning · compliance ${Math.round(s.trial.compliance * 100)}%`, s.trial.compliance);
    }
  }
  private drawToasts(g: CanvasRenderingContext2D, s: HamsterSnapshot, b: Box, F: Font) {
    const list = s.toasts.slice(-4);
    let y = b.y + b.h - 50 - list.length * 34;
    for (const t of list) {
      const age = s.t - t.t, a = age > 6 ? Math.max(0, 7 - age) : Math.min(1, age * 4), slide = (1 - ease(age * 4)) * 24;
      g.globalAlpha = a; g.font = F(13, 700);
      const tw = Math.min(b.w - 24, g.measureText(t.text).width + 28), x = b.x + (b.w - tw) / 2, yy = y + slide;
      const border = t.kind === 'milestone' ? 'rgba(255,207,74,0.6)' : t.kind === 'bad' ? 'rgba(255,90,110,0.6)' : t.kind === 'era' ? 'rgba(200,120,255,0.7)' : t.kind === 'event' ? 'rgba(79,214,255,0.5)' : C.line;
      this.glass(g, x, yy, tw, 28, 14, border);
      g.fillStyle = t.kind === 'milestone' ? C.gold : t.kind === 'bad' ? '#ffb0b8' : t.kind === 'era' ? '#e8c0ff' : C.text;
      g.save(); g.beginPath(); g.rect(x + 8, yy, tw - 16, 28); g.clip(); g.fillText(t.text, x + 14, yy + 19); g.restore();
      y += 34;
    }
    g.globalAlpha = 1;
  }
  private drawTicker(g: CanvasRenderingContext2D, s: HamsterSnapshot, b: Box, F: Font, dt: number) {
    const h = 30, y = b.y + b.h - h;
    const tg = g.createLinearGradient(0, y, 0, y + h); tg.addColorStop(0, 'rgba(10,6,20,0.85)'); tg.addColorStop(1, 'rgba(10,6,20,0.98)');
    g.fillStyle = tg; g.fillRect(b.x, y, b.w, h);
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(b.x, y, b.w, 1);
    if (s.news.id !== this.tickerId) { this.tickerId = s.news.id; this.tickerX = b.w; }
    this.tickerX -= dt * 75;
    g.save(); g.beginPath(); g.rect(b.x + 118, y, b.w - 118, h); g.clip();
    g.font = F(13, 600); g.fillStyle = '#ffe8a8'; g.fillText(s.news.text, b.x + 118 + Math.max(12, this.tickerX), y + 20);
    g.restore();
    const lg = g.createLinearGradient(0, y + 5, 0, y + 25); lg.addColorStop(0, '#ff5a6a'); lg.addColorStop(1, '#d81a3a');
    g.fillStyle = lg; rr(g, b.x + 8, y + 5, 104, 20, 10); g.fill();
    g.fillStyle = '#fff'; g.font = F(10.5, 900); g.fillText('📰 HAMSTER NEWS', b.x + 15, y + 19);
  }
  private drawEraBanner(g: CanvasRenderingContext2D, b: Box, F: Font) {
    if (!this.eraBanner || this.time - this.eraBanner.t0 > 4.5) return;
    const p = (this.time - this.eraBanner.t0) / 4.5, a = p < 0.08 ? p / 0.08 : p > 0.8 ? (1 - p) * 5 : 1;
    const cx = b.x + b.w / 2, cy = b.y + b.h * 0.45;
    g.save(); g.globalAlpha = a;
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 16; i++) { const an = this.time * 0.4 + (i / 16) * TAU; g.fillStyle = `hsla(${(this.hue + i * 22) % 360},100%,60%,0.12)`; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, b.w, an, an + 0.12); g.closePath(); g.fill(); }
    g.restore();
    const sc = 0.7 + 0.3 * ease(p * 6);
    g.translate(cx, cy); g.scale(sc, sc); g.textAlign = 'center';
    g.font = F(14, 900); g.fillStyle = C.dim; g.fillText('NEW ERA UNLOCKED', 0, -44);
    g.font = F(Math.min(54, b.w / 11), 900);
    const tg = g.createLinearGradient(-200, 0, 200, 0); tg.addColorStop(0, `hsl(${this.hue},100%,70%)`); tg.addColorStop(1, `hsl(${(this.hue + 120) % 360},100%,70%)`);
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.strokeText(this.eraBanner.text, 0, 6);
    g.fillStyle = tg; g.fillText(this.eraBanner.text, 0, 6);
    g.font = F(16, 600); g.fillStyle = C.text; g.fillText(this.eraBanner.sub, 0, 36);
    g.restore(); g.textAlign = 'left';
  }

  // ---------- shop panel ----------
  private drawPanel(g: CanvasRenderingContext2D, s: HamsterSnapshot, p: Box, F: Font, dt: number) {
    const bg = g.createLinearGradient(0, p.y, 0, p.y + p.h); bg.addColorStop(0, C.panel); bg.addColorStop(1, C.panel2);
    g.fillStyle = bg; g.fillRect(p.x, p.y, p.w, p.h);
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(p.x, p.y, 1, p.h);
    // logo: a tiny spinning wheel + gradient wordmark
    const lx = p.x + 18, ly = p.y + 26;
    g.strokeStyle = C.gold; g.lineWidth = 2.5; g.beginPath(); g.arc(lx + 9, ly - 6, 10, 0, TAU); g.stroke();
    g.lineWidth = 1.5; for (let i = 0; i < 4; i++) { const a = this.spin + (i / 4) * TAU; g.beginPath(); g.moveTo(lx + 9, ly - 6); g.lineTo(lx + 9 + Math.cos(a) * 10, ly - 6 + Math.sin(a) * 10); g.stroke(); }
    g.font = F(20, 900);
    const wg = g.createLinearGradient(lx + 26, 0, lx + 200, 0); wg.addColorStop(0, C.gold); wg.addColorStop(1, C.pink);
    g.fillStyle = wg; g.fillText('HAMSTERGRID', lx + 26, ly);
    g.font = F(11, 600); g.fillStyle = C.dim;
    g.fillText(`${s.eraName}  ·  ${s.totalOwned} rodents & contraptions${s.seeds ? `  ·  🌻 ${s.seeds}` : ''}`, lx, ly + 20);
    // tabs (segmented control)
    this.tabRects = [];
    const tx = p.x + 10, ty = p.y + 56, tw = p.w - 20, th = 50, n = s.tabs.length, cw = tw / n;
    g.fillStyle = 'rgba(255,255,255,0.05)'; rr(g, tx, ty, tw, th, 12); g.fill();
    s.tabs.forEach((t, i) => {
      const x = tx + i * cw, sel = t.id === s.tab;
      if (sel) { const sg = g.createLinearGradient(0, ty, 0, ty + th); sg.addColorStop(0, '#5a3aa8'); sg.addColorStop(1, '#3a2478'); g.fillStyle = sg; rr(g, x + 3, ty + 3, cw - 6, th - 6, 9); g.fill(); g.strokeStyle = 'rgba(255,207,74,0.6)'; g.lineWidth = 1; rr(g, x + 3.5, ty + 3.5, cw - 7, th - 7, 9); g.stroke(); }
      g.textAlign = 'center';
      g.font = F(16); g.fillStyle = '#fff'; g.globalAlpha = sel ? 1 : 0.7; g.fillText(TAB_ICON[t.id], x + cw / 2, ty + 22); g.globalAlpha = 1;
      g.font = F(cw < 80 ? 9 : 10, 800); g.fillStyle = sel ? '#fff' : C.dim; g.fillText(t.label, x + cw / 2, ty + 40);
      g.textAlign = 'left';
      if (t.badge) { g.fillStyle = C.pink; g.beginPath(); g.arc(x + cw - 10, ty + 9, 4.5, 0, TAU); g.fill(); g.strokeStyle = C.panel; g.lineWidth = 2; g.stroke(); }
      this.tabRects.push({ x, y: ty, w: cw, h: th, i });
    });
    const label = s.tabs.find((t) => t.id === s.tab)?.label ?? '';
    // list
    const ly0 = ty + th + 10, lh = p.y + p.h - ly0, rh = 68, gap = 6;
    g.font = F(10, 800); g.fillStyle = C.faint; g.fillText(label.toUpperCase(), p.x + 14, ly0 + 2);
    const listY = ly0 + 10, listH = lh - 10;
    const target = Math.max(0, Math.min(s.row * (rh + gap) - listH / 2 + rh, s.items.length * (rh + gap) - listH + 8));
    this.scroll += (Math.max(0, target) - this.scroll) * Math.min(1, dt * 12);
    this.rowRects = [];
    g.save(); g.beginPath(); g.rect(p.x, listY, p.w, listH); g.clip();
    const cheap = s.effects.some((e) => e.kind === 'cheap');
    s.items.forEach((it, i) => {
      const y = listY + 4 + i * (rh + gap) - this.scroll; if (y + rh < listY || y > p.y + p.h) return;
      const x = p.x + 10, w = p.w - 20, sel = i === s.row, owned = it.owned === true;
      const usable = it.can && !it.locked;
      // card
      g.fillStyle = sel ? 'rgba(120,90,220,0.22)' : 'rgba(255,255,255,0.035)'; rr(g, x, y, w, rh, 14); g.fill();
      if (sel) { g.save(); g.shadowColor = s.armed ? C.red : 'rgba(255,207,74,0.6)'; g.shadowBlur = 12; g.strokeStyle = s.armed ? C.red : C.gold; g.lineWidth = 2; rr(g, x + 1, y + 1, w - 2, rh - 2, 13); g.stroke(); g.restore(); }
      else { g.strokeStyle = usable ? 'rgba(109,255,176,0.25)' : C.line; g.lineWidth = 1; rr(g, x + 0.5, y + 0.5, w - 1, rh - 1, 14); g.stroke(); }
      g.globalAlpha = it.locked ? 0.45 : 1;
      // icon tile
      const ic = itemIcon(it), ix = x + 10, iy = y + 11, is = 46;
      const ig = g.createLinearGradient(ix, iy, ix + is, iy + is); ig.addColorStop(0, `hsl(${ic.hue},70%,${usable || owned ? 42 : 26}%)`); ig.addColorStop(1, `hsl(${(ic.hue + 40) % 360},70%,${usable || owned ? 24 : 14}%)`);
      g.fillStyle = ig; rr(g, ix, iy, is, is, 12); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.12)'; rr(g, ix + 2, iy + 2, is - 4, is * 0.4, 10); g.fill();
      g.font = F(24); g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(ic.icon, ix + is / 2, iy + is / 2 + 9); g.textAlign = 'left';
      if (it.key.startsWith('g:')) { g.fillStyle = C.gold; g.beginPath(); g.arc(ix + is - 4, iy + 4, 8, 0, TAU); g.fill(); g.fillStyle = '#3a2a00'; g.font = F(10, 900); g.textAlign = 'center'; g.fillText('×2', ix + is - 4, iy + 8); g.textAlign = 'left'; }
      if (typeof it.owned === 'number' && it.owned > 0) {
        const t = `${it.owned}`; g.font = F(10.5, 900); const bw = g.measureText(t).width + 10;
        g.fillStyle = '#fff'; rr(g, ix + is - bw + 4, iy + is - 12, bw, 16, 8); g.fill(); g.fillStyle = '#1a1030'; g.fillText(t, ix + is - bw + 9, iy + is);
      }
      // text
      const tx2 = ix + is + 12, costW = 104;
      g.save(); g.beginPath(); g.rect(tx2, y, w - (tx2 - x) - costW - 8, rh); g.clip();
      let nx = tx2;
      const nameW = w - (tx2 - x) - costW - 8;
      g.font = F(15, 800); const nmw = g.measureText(it.name).width;
      g.font = F(8.5, 900);
      if (it.tag && !it.key.startsWith('g:') && g.measureText(it.tag).width + 16 + nmw < nameW) {
        const tw2 = g.measureText(it.tag).width + 10;
        g.fillStyle = it.tag === 'LEGS' ? 'rgba(79,150,255,0.3)' : it.tag === 'BOREDOM' ? 'rgba(200,180,120,0.3)' : it.tag === 'SPECIAL' ? 'rgba(255,95,168,0.3)' : 'rgba(255,255,255,0.12)';
        rr(g, nx, y + 12, tw2, 15, 7.5); g.fill(); g.fillStyle = '#fff'; g.fillText(it.tag, nx + 5, y + 23); nx += tw2 + 6;
      }
      g.fillStyle = it.on === false ? C.dim : C.text; g.font = F(15, 800); g.fillText(it.name, nx, y + 25);
      g.fillStyle = C.dim; g.font = F(11.5, 500);
      const desc = it.desc;
      this.wrap(g, desc, tx2, y + 43, w - (tx2 - x) - costW - 10, 14, 2);
      g.restore();
      // cost column
      const cx2 = x + w - costW - 8;
      if (it.key.startsWith('vibe:') && owned) {
        const on = !!it.on, sw = 46, sx = cx2 + costW - sw, sy = y + 18;
        g.fillStyle = on ? C.green : 'rgba(255,255,255,0.15)'; rr(g, sx, sy, sw, 26, 13); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(on ? sx + sw - 13 : sx + 13, sy + 13, 10, 0, TAU); g.fill();
      } else if (!it.locked) {
        g.font = F(13, 900); const cw2 = Math.min(costW, g.measureText(it.costLabel).width + 18), px = cx2 + costW - cw2, py = y + 14;
        if (usable) { const cg = g.createLinearGradient(0, py, 0, py + 26); cg.addColorStop(0, cheap && it.key.startsWith('gen:') ? '#9affd0' : '#7affb8'); cg.addColorStop(1, '#2ac87a'); g.fillStyle = cg; }
        else g.fillStyle = 'rgba(255,255,255,0.07)';
        rr(g, px, py, cw2, 26, 13); g.fill();
        g.fillStyle = usable ? '#062a18' : C.red; g.textAlign = 'center'; g.fillText(it.costLabel, px + cw2 / 2, py + 18); g.textAlign = 'left';
        const eta = s.rate > 0 ? (it.cost - s.bank) / s.rate : Infinity;
        if (!usable && it.cost > 0 && it.cost > s.bank && eta < 86400) {
          g.font = F(10.5, 700); g.fillStyle = C.faint; g.textAlign = 'right';
          g.fillText(`⏳ ${fmtDur(eta)}`, cx2 + costW, y + 56); g.textAlign = 'left';
        } else if (usable && it.key.startsWith('gen:') && sel) { g.font = F(10, 800); g.fillStyle = C.green; g.textAlign = 'right'; g.fillText('A buy · B ×10', cx2 + costW, y + 56); g.textAlign = 'left'; }
      }
      // progress toward affordability
      if (!usable && !it.locked && it.cost > 0 && !owned) {
        const k = Math.max(0, Math.min(1, s.bank / it.cost));
        g.fillStyle = 'rgba(255,255,255,0.06)'; rr(g, x + 10, y + rh - 5, w - 20, 3, 1.5); g.fill();
        g.fillStyle = 'rgba(255,207,74,0.6)'; rr(g, x + 10, y + rh - 5, (w - 20) * k, 3, 1.5); g.fill();
      }
      g.globalAlpha = 1;
      this.rowRects.push({ x, y, w, h: rh, i });
    });
    g.restore();
    // scroll fades
    const fade = (y0: number, up: boolean) => { const fg = g.createLinearGradient(0, y0, 0, y0 + (up ? 24 : -24)); fg.addColorStop(0, C.panel2); fg.addColorStop(1, 'rgba(13,9,24,0)'); g.fillStyle = fg; g.fillRect(p.x + 1, up ? y0 : y0 - 24, p.w, 24); };
    if (this.scroll > 4) fade(listY, true);
    if (s.items.length * (rh + gap) - this.scroll > listH) fade(p.y + p.h, false);
  }
  private wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, lh: number, maxLines: number) {
    const words = text.split(' '); let line = '', n = 0;
    for (let i = 0; i < words.length; i++) {
      const test = line ? `${line} ${words[i]}` : words[i];
      if (g.measureText(test).width > w && line) {
        if (n === maxLines - 1) { g.fillText(`${line}…`, x, y + n * lh); return; }
        g.fillText(line, x, y + n * lh); n++; line = words[i];
      } else line = test;
    }
    if (line) g.fillText(line, x, y + n * lh);
  }
}
