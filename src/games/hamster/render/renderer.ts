import type { BikeState, GameRenderer, InputState, Profile } from '../../../contracts';
import { play, unlockAudio, type SfxName } from '../../../audio/sfx';
import { fmtJ, fmtW } from '../sim/econ';
import type { HamsterSnapshot } from '../sim/sim';
import { SCENES, hamster, type Box, type SceneState } from './scenes';

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; kind: 'confetti' | 'spark' | 'text' | 'seed' | 'fw'; color: string; text?: string; size: number; rot: number }
const TAU = Math.PI * 2;
const CUE_GAP: Partial<Record<SfxName, number>> = { select: 0.05, buy: 0.05, shrine: 0.4, potion: 0.2 };
const ZONE_COL = ['#888', '#7a8a9a', '#3aa0ff', '#3aff8a', '#ffd23a', '#ff4a4a'];

export class HamsterRenderer implements GameRenderer {
  private canvas!: HTMLCanvasElement;
  private g!: CanvasRenderingContext2D;
  private dpr = 1; private W = 800; private H = 600;
  private send?: (a: unknown) => void;
  private last = 0; private time = 0; private spin = 0; private hue = 0;
  private parts: Particle[] = [];
  private lastCue = -1; private lastBuy = -1; private lastToast = -1; private textAcc = 0;
  private prevEra = -1; private trans: { from: number; t0: number } | null = null; private eraBanner: { text: string; sub: string; t0: number } | null = null;
  private shake = 0; private scroll = 0; private tickerX = 0; private tickerId = -1;
  private tabRects: Array<{ x: number; y: number; w: number; h: number; i: number }> = [];
  private rowRects: Array<{ x: number; y: number; w: number; h: number; i: number }> = [];
  private acceptRect: { x: number; y: number; w: number; h: number } | null = null;
  private onPointer = (e: PointerEvent) => {
    unlockAudio();
    const r = this.canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const inR = (b: { x: number; y: number; w: number; h: number }) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    if (this.acceptRect && inR(this.acceptRect)) { this.send?.({ type: 'accept' }); return; }
    for (const t of this.tabRects) if (inR(t)) { this.send?.({ type: 'tab', i: t.i }); return; }
    for (const t of this.rowRects) if (inR(t)) { this.send?.({ type: 'row', i: t.i }); return; }
  };

  mount(container: HTMLElement, ctx: { profile: Readonly<Profile>; send?: (a: unknown) => void }) {
    this.send = ctx.send;
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'width:100%;height:100%;display:block;background:#0b0812;touch-action:none';
    container.appendChild(this.canvas);
    this.canvas.addEventListener('pointerdown', this.onPointer);
    this.g = this.canvas.getContext('2d')!;
    this.dpr = Math.min(2, globalThis.devicePixelRatio ?? 1);
    this.resize(container.clientWidth || 800, container.clientHeight || 600);
  }
  resize(w: number, h: number) { this.W = w; this.H = h; this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr); }
  unmount() { this.canvas?.removeEventListener('pointerdown', this.onPointer); this.canvas?.remove(); }

  render(snapshot: unknown, bike: Readonly<BikeState>, _input: Readonly<InputState>) {
    const s = snapshot as HamsterSnapshot, g = this.g;
    const now = performance.now() / 1000, dt = this.last ? Math.min(0.1, now - this.last) : 0.016; this.last = now;
    this.time += dt; this.hue = (this.hue + dt * 90) % 360;
    const vibes = new Set(s.vibesOn);
    const stopped = !s.unionOn;
    // wheels turn at your cadence (1 rev per crank rev), backwards in roid rage
    this.spin += (bike.cadence3s / 60) * TAU * dt;
    this.audio(s);

    const W = this.W, H = this.H;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#0b0812'; g.fillRect(0, 0, W, H);
    const wide = W / H > 1.05;
    const pw = wide ? Math.max(300, Math.min(460, W * 0.38)) : W, ph = wide ? H : H * 0.46;
    const scene: Box = wide ? { x: 0, y: 0, w: W - pw, h: H } : { x: 0, y: 0, w: W, h: H - ph };
    const panel: Box = wide ? { x: W - pw, y: 0, w: pw, h: H } : { x: 0, y: H - ph, w: W, h: ph };
    const font = vibes.has('comic') ? '"Comic Sans MS","Chalkboard SE","Comic Neue",cursive' : 'system-ui,-apple-system,"Segoe UI",sans-serif';
    const F = (px: number, bold = false) => `${bold ? 'bold ' : ''}${px}px ${font}`;

    // new events → particles / shake / banners
    if (this.lastBuy < 0) this.lastBuy = s.buySeq;
    if (s.buySeq > this.lastBuy) {
      this.lastBuy = s.buySeq;
      if (vibes.has('shake')) this.shake = 0.3;
      const cx = panel.x + panel.w * 0.5, cy = this.rowRects.find((r) => r.i === s.row)?.y ?? panel.y + 80;
      for (let i = 0; i < 14; i++) this.parts.push({ x: cx, y: cy + 20, vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 200, life: 0, max: 0.7, kind: 'spark', color: '#ffd23a', size: 3, rot: 0 });
      if (vibes.has('confetti')) for (let i = 0; i < 70; i++) this.parts.push({ x: scene.x + Math.random() * scene.w, y: scene.y - 10, vx: (Math.random() - 0.5) * 80, vy: 40 + Math.random() * 160, life: 0, max: 3, kind: 'confetti', color: `hsl(${Math.random() * 360},90%,60%)`, size: 6, rot: Math.random() * 6 });
    }
    for (const t of s.toasts) if (t.id > this.lastToast) {
      this.lastToast = t.id;
      if (t.kind === 'milestone' || t.kind === 'era') this.firework(scene.x + scene.w * (0.2 + Math.random() * 0.6), scene.y + scene.h * (0.25 + Math.random() * 0.2), t.kind === 'era' ? 80 : 30);
    }
    if (this.prevEra >= 0 && s.era !== this.prevEra) {
      this.trans = { from: this.prevEra, t0: this.time };
      this.eraBanner = { text: s.eraName.toUpperCase(), sub: s.eraBlurb, t0: this.time };
      for (let i = 0; i < 4; i++) this.firework(scene.x + scene.w * (0.2 + i * 0.2), scene.y + scene.h * 0.35, 60);
    }
    this.prevEra = s.era;
    // ambient particles
    if (s.rate > 0 && !stopped) {
      this.textAcc += dt;
      if (this.textAcc > 0.7) {
        this.textAcc = 0;
        this.parts.push({ x: scene.x + scene.w * (0.15 + Math.random() * 0.5), y: scene.y + scene.h * 0.62, vx: 0, vy: -40, life: 0, max: 1.6, kind: 'text', color: s.glow ? '#ffd23a' : '#9affc0', text: `+${fmtJ(s.rate * 0.7)}`, size: 14, rot: 0 });
      }
    }
    if (s.effects.some((e) => e.id === 'seeds') && Math.random() < dt * 25) this.parts.push({ x: scene.x + Math.random() * scene.w, y: scene.y, vx: 0, vy: 120 + Math.random() * 80, life: 0, max: 4, kind: 'seed', color: '#2a2a2a', size: 5, rot: Math.random() * 6 });
    if (s.golden && Math.random() < dt * 30) { const gp = this.goldenPos(s, scene); this.parts.push({ x: gp.x, y: gp.y, vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 60, life: 0, max: 0.8, kind: 'spark', color: '#fff6a0', size: 2.5, rot: 0 }); }

    // ---------- scene ----------
    g.save();
    if (this.shake > 0) { this.shake -= dt; const a = this.shake * 30; g.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a); }
    const jitter = s.effects.some((e) => e.id === 'pre') || !!s.rage;
    if (jitter) g.translate((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
    g.beginPath(); g.rect(scene.x, scene.y, scene.w, scene.h); g.clip();
    const st: SceneState = { s, time: this.time, spin: this.spin, vibes, strikeOn: s.strike?.phase === 'active', stopped, hue: this.hue };
    const tr = this.trans && this.time - this.trans.t0 < 2.4 ? this.trans : null;
    if (tr) {
      const p = (this.time - tr.t0) / 2.4, e = p * p * (3 - 2 * p), cx = scene.x + scene.w / 2, cy = scene.y + scene.h / 2;
      g.save(); g.translate(cx, cy); g.scale(3 - 2 * e, 3 - 2 * e); g.translate(-cx, -cy); SCENES[s.era](g, scene, st); g.restore();
      g.save(); g.globalAlpha = 1 - e; g.translate(cx, cy); const k = 1 - 0.92 * e; g.scale(k, k); g.rotate(e * 1.5); g.translate(-cx, -cy); SCENES[tr.from](g, scene, st); g.restore();
    } else SCENES[s.era](g, scene, st);
    this.vibeOverlays(g, scene, s, vibes);
    this.pepOverlays(g, scene, s);
    if (stopped) {
      g.fillStyle = '#000a'; g.fillRect(scene.x, scene.y, scene.w, scene.h);
      g.fillStyle = '#fff'; g.font = F(Math.min(26, scene.w / 22), true); g.textAlign = 'center';
      g.fillText('💤 The hamsters are on break.', scene.x + scene.w / 2, scene.y + scene.h * 0.45);
      g.font = F(15); g.fillStyle = '#ccc'; g.fillText('They only run when you run. Pedal to resume.', scene.x + scene.w / 2, scene.y + scene.h * 0.45 + 28);
      g.textAlign = 'left';
    }
    if (s.golden) this.drawGolden(g, s, scene);
    this.drawParticles(g, dt);
    this.drawHeader(g, s, scene, F);
    this.drawEvents(g, s, scene, F);
    this.drawToasts(g, s, scene, F);
    this.drawTicker(g, s, scene, F, dt);
    if (this.eraBanner && this.time - this.eraBanner.t0 < 4.5) {
      const p = (this.time - this.eraBanner.t0) / 4.5, a = p < 0.1 ? p * 10 : p > 0.8 ? (1 - p) * 5 : 1;
      g.save(); g.globalAlpha = a; g.textAlign = 'center';
      g.fillStyle = '#000b'; g.fillRect(scene.x, scene.y + scene.h * 0.38, scene.w, 90);
      g.fillStyle = `hsl(${this.hue},90%,65%)`; g.font = F(Math.min(44, scene.w / 14), true);
      g.fillText(`NEW ERA: ${this.eraBanner.text}`, scene.x + scene.w / 2, scene.y + scene.h * 0.38 + 46);
      g.fillStyle = '#fff'; g.font = F(16); g.fillText(this.eraBanner.sub, scene.x + scene.w / 2, scene.y + scene.h * 0.38 + 74);
      g.restore();
    }
    g.restore();

    // ---------- panel ----------
    this.drawPanel(g, s, panel, F, dt);
  }

  // ---------- helpers ----------
  private audio(s: HamsterSnapshot) {
    if (this.lastCue < 0) { this.lastCue = s.cues.length ? s.cues[s.cues.length - 1].id : 0; return; }
    for (const c of s.cues) if (c.id > this.lastCue) { this.lastCue = c.id; play(c.name as SfxName, { minGapS: CUE_GAP[c.name as SfxName] }); }
  }
  private firework(x: number, y: number, n: number) {
    const hue = Math.random() * 360;
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = 60 + Math.random() * 200; this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 1.2 + Math.random() * 0.6, kind: 'fw', color: `hsl(${hue + Math.random() * 60},95%,65%)`, size: 2.5, rot: 0 }); }
  }
  private drawParticles(g: CanvasRenderingContext2D, dt: number) {
    const keep: Particle[] = [];
    for (const p of this.parts) {
      p.life += dt; if (p.life >= p.max) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 5;
      if (p.kind === 'fw' || p.kind === 'spark') p.vy += 160 * dt;
      const a = 1 - p.life / p.max;
      g.globalAlpha = Math.max(0, a);
      if (p.kind === 'text') { g.fillStyle = p.color; g.font = `bold ${p.size}px system-ui,sans-serif`; g.fillText(p.text ?? '', p.x, p.y); }
      else if (p.kind === 'confetti') { g.save(); g.translate(p.x + Math.sin(p.rot) * 10, p.y); g.rotate(p.rot); g.fillStyle = p.color; g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); g.restore(); }
      else if (p.kind === 'seed') { g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = '#333'; g.beginPath(); g.ellipse(0, 0, 3, 6, 0, 0, TAU); g.fill(); g.strokeStyle = '#ddd'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -5); g.lineTo(0, 5); g.stroke(); g.restore(); }
      else { g.fillStyle = p.color; g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
      keep.push(p);
    }
    g.globalAlpha = 1;
    this.parts = keep.length > 900 ? keep.slice(-900) : keep;
  }
  private goldenPos(s: HamsterSnapshot, b: Box) {
    const gd = s.golden!, p = (this.time * 0.18 + gd.x) % 1;
    return { x: b.x + b.w * (0.08 + 0.84 * (p < 0.5 ? p * 2 : 2 - p * 2)), y: b.y + b.h * 0.3 + Math.sin(this.time * 7) * 8, flip: p >= 0.5 };
  }
  private drawGolden(g: CanvasRenderingContext2D, s: HamsterSnapshot, b: Box) {
    const gp = this.goldenPos(s, b), gd = s.golden!;
    g.save(); g.shadowColor = '#ffd23a'; g.shadowBlur = 25;
    hamster(g, gp.x, gp.y + 18, 46, this.time * 18, { golden: true, flip: gp.flip, shades: true }, this.time);
    g.restore();
    g.strokeStyle = '#ffffff44'; g.lineWidth = 5; g.beginPath(); g.arc(gp.x, gp.y, 40, 0, TAU); g.stroke();
    g.strokeStyle = '#ffd23a'; g.beginPath(); g.arc(gp.x, gp.y, 40, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, gd.progress / gd.need)); g.stroke();
  }

  private vibeOverlays(g: CanvasRenderingContext2D, b: Box, s: HamsterSnapshot, v: Set<string>) {
    const t = this.time;
    if (v.has('disco')) {
      const cx = b.x + b.w / 2, cy = b.y + 26;
      g.strokeStyle = '#888'; g.beginPath(); g.moveTo(cx, b.y); g.lineTo(cx, cy - 16); g.stroke();
      for (let i = 0; i < 24; i++) { const a = t * 2 + i; g.fillStyle = `hsl(0,0%,${60 + 35 * Math.abs(Math.sin(a))}%)`; g.fillRect(cx - 16 + (i % 6) * 5.3, cy - 16 + Math.floor(i / 6) * 8, 5, 7); }
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 9; i++) { const x = b.x + b.w * (0.5 + 0.45 * Math.sin(t * 0.7 + i * 2.1)), y = b.y + b.h * (0.5 + 0.4 * Math.cos(t * 0.9 + i * 1.3)); g.fillStyle = `hsla(${(i * 40 + this.hue) % 360},100%,60%,0.18)`; g.beginPath(); g.arc(x, y, 40, 0, TAU); g.fill(); }
      g.restore();
    }
    if (v.has('lasers')) {
      g.save(); g.globalCompositeOperation = 'lighter'; g.lineWidth = 3;
      for (let i = 0; i < 6; i++) { const ox = i % 2 ? b.x + b.w : b.x, a = (i % 2 ? Math.PI : 0) + (i % 2 ? 1 : -1) * (0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.3 + i))); g.strokeStyle = `hsla(${[120, 300, 180][i % 3]},100%,60%,0.7)`; g.beginPath(); g.moveTo(ox, b.y + b.h); g.lineTo(ox + Math.cos(a) * b.w * 1.5, b.y + b.h - Math.abs(Math.sin(a)) * b.w * 1.5); g.stroke(); }
      g.restore();
    }
    if (v.has('tesla') && s.unionOn) {
      g.save(); g.strokeStyle = '#c0d8ff'; g.shadowColor = '#7ab0ff'; g.shadowBlur = 12; g.lineWidth = 2;
      for (let k = 0; k < 2; k++) if (Math.random() < 0.5) {
        let x = b.x + b.w * (0.1 + Math.random() * 0.8), y = b.y + 60; g.beginPath(); g.moveTo(x, y);
        for (let i = 0; i < 10; i++) { x += (Math.random() - 0.5) * 40; y += b.h * 0.06; g.lineTo(x, y); }
        g.stroke();
      }
      g.restore();
    }
    if (s.mono > 1.5) { g.fillStyle = `rgba(200,180,140,${Math.min(0.18, (s.mono - 1.5) / 50)})`; g.fillRect(b.x, b.y, b.w, b.h); }
    if (v.has('fried')) {
      g.save(); g.globalCompositeOperation = 'overlay'; g.fillStyle = 'rgba(255,90,0,0.45)'; g.fillRect(b.x, b.y, b.w, b.h);
      g.globalCompositeOperation = 'color-dodge'; g.fillStyle = 'rgba(90,40,0,0.5)'; g.fillRect(b.x, b.y, b.w, b.h); g.restore();
      g.font = '28px sans-serif'; const em = ['😂', '💯', '🔥', '👌', '🅱️'];
      for (let i = 0; i < 7; i++) g.fillText(em[i % em.length], b.x + b.w * ((i * 0.37 + 0.1) % 1), b.y + b.h * ((i * 0.53 + 0.2) % 1));
    }
    if (v.has('crt')) {
      g.fillStyle = 'rgba(0,0,0,0.22)'; for (let y = b.y; y < b.y + b.h; y += 3) g.fillRect(b.x, y, b.w, 1);
      const vg = g.createRadialGradient(b.x + b.w / 2, b.y + b.h / 2, Math.min(b.w, b.h) * 0.4, b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)'); g.fillStyle = vg; g.fillRect(b.x, b.y, b.w, b.h);
    }
  }
  private pepOverlays(g: CanvasRenderingContext2D, b: Box, s: HamsterSnapshot) {
    const has = (id: string) => s.effects.some((e) => e.id === id);
    if (has('pre')) { g.strokeStyle = '#ffffff55'; g.lineWidth = 2; for (let i = 0; i < 14; i++) { const y = b.y + ((i * 97 + this.time * 30) % b.h), x = b.x + b.w - ((this.time * 1400 + i * 211) % (b.w + 300)); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 120, y); g.stroke(); } }
    if (has('crash')) { g.fillStyle = 'rgba(60,60,70,0.4)'; g.fillRect(b.x, b.y, b.w, b.h); }
    if (has('tren') || s.rage) {
      const p = 0.35 + 0.25 * Math.sin(this.time * (s.rage ? 12 : 5));
      const vg = g.createRadialGradient(b.x + b.w / 2, b.y + b.h / 2, Math.min(b.w, b.h) * 0.3, b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h) * 0.7);
      vg.addColorStop(0, 'rgba(255,0,0,0)'); vg.addColorStop(1, `rgba(220,0,0,${p})`); g.fillStyle = vg; g.fillRect(b.x, b.y, b.w, b.h);
    }
    if (s.glow) { g.save(); g.globalCompositeOperation = 'lighter'; const r = g.createRadialGradient(b.x + b.w * 0.3, b.y + b.h * 0.6, 10, b.x + b.w * 0.3, b.y + b.h * 0.6, b.w * 0.6); r.addColorStop(0, 'rgba(255,210,60,0.35)'); r.addColorStop(1, 'rgba(255,210,60,0)'); g.fillStyle = r; g.fillRect(b.x, b.y, b.w, b.h); g.restore(); }
    if (s.trial?.phase === 'active') { g.fillStyle = 'rgba(80,160,255,0.12)'; g.fillRect(b.x, b.y, b.w, b.h); }
    if (s.strike?.phase === 'active') { g.fillStyle = 'rgba(120,0,0,0.18)'; g.fillRect(b.x, b.y, b.w, b.h); }
  }

  private drawHeader(g: CanvasRenderingContext2D, s: HamsterSnapshot, b: Box, F: (px: number, bold?: boolean) => string) {
    const pad = 12, w = b.w;
    const gr = g.createLinearGradient(0, b.y, 0, b.y + 112); gr.addColorStop(0, '#000000d0'); gr.addColorStop(1, '#00000000');
    g.fillStyle = gr; g.fillRect(b.x, b.y, w, 112);
    g.fillStyle = '#fff'; g.font = F(Math.min(34, w / 16), true); g.fillText(fmtJ(s.bank), b.x + pad, b.y + 36);
    g.font = F(15, true); g.fillStyle = s.rate < 0 ? '#ff6a6a' : '#9affc0';
    g.fillText(`${s.rate >= 0 ? '+' : ''}${fmtW(s.rate)}`, b.x + pad, b.y + 58);
    const rw = g.measureText(`+${fmtW(s.rate)}`).width;
    g.font = F(13); g.fillStyle = '#c8c0e0'; g.fillText(s.equiv, b.x + pad + rw + 10, b.y + 58);
    g.fillStyle = '#8a84a8'; g.font = F(11);
    g.fillText(`hamsters ${fmtW(s.hamRate)} · your legs ${fmtW(s.legRate)} · ${s.zone ? `Z${s.zone}` : ''} ${Math.round(s.cadence)} rpm`, b.x + pad, b.y + 76);
    // Kardashev meter
    const kx = b.x + w * 0.52, kw = w * 0.46 - pad, ky = b.y + 14;
    const kn = (k: number) => kx + kw * Math.max(0, Math.min(1, (k + 0.6) / 3.6));
    g.fillStyle = '#ffffff18'; g.fillRect(kx, ky + 12, kw, 8);
    const kg = g.createLinearGradient(kx, 0, kx + kw, 0); kg.addColorStop(0, '#6a5acd'); kg.addColorStop(0.45, '#3ad0ff'); kg.addColorStop(0.72, '#ffd23a'); kg.addColorStop(1, '#ff4fd8');
    g.fillStyle = kg; g.fillRect(kx, ky + 12, kn(s.k) - kx, 8);
    g.fillStyle = '#ccc'; g.font = F(9);
    for (const [k, lab] of [[0, 'I'], [1, 'Planet'], [2, 'Star'], [3, 'Galaxy']] as const) { const x = kn(k); g.fillRect(x, ky + 10, 1, 12); g.textAlign = k === 3 ? 'right' : 'left'; g.fillText(String(lab), k === 3 ? x - 2 : x + 2, ky + 32); }
    g.textAlign = 'left';
    g.font = F(11, true); g.fillStyle = '#fff'; g.fillText(`KARDASHEV ${s.k.toFixed(2)}`, kx, ky + 7);
    // Mind-numbing meter
    const my = ky + 46, frac = (s.mono - 1) / Math.max(0.01, s.monoCap - 1);
    g.fillStyle = '#ffffff18'; g.fillRect(kx, my + 12, kw, 8);
    g.fillStyle = s.monoTrend > 0 ? '#c8b48a' : s.monoTrend < 0 ? '#ff8a6a' : '#a89a7a'; g.fillRect(kx, my + 12, kw * Math.max(0, Math.min(1, frac)), 8);
    g.font = F(11, true); g.fillStyle = '#f0e0c0';
    g.fillText(`MIND-NUMBING ×${s.mono.toFixed(2)} / ${s.monoCap}  ${s.monoTrend > 0 ? '▲ stay boring' : s.monoTrend < 0 ? '▼ too exciting!' : ''}`, kx, my + 7);
    // effects chips
    let cx = b.x + pad; const cy = b.y + 88;
    g.font = F(11, true);
    for (const e of s.effects) {
      const label = `${e.label} ${Math.ceil(e.left)}s`, tw = g.measureText(label).width + 14;
      if (cx + tw > b.x + w - pad) break;
      g.fillStyle = e.mult < 1 ? '#6a2a2a' : e.kind === 'leg' ? '#2a4a6a' : '#4a2a6a'; g.fillRect(cx, cy, tw, 18);
      g.fillStyle = '#ffffff30'; g.fillRect(cx, cy + 16, tw * Math.max(0, e.left / e.total), 2);
      g.fillStyle = '#fff'; g.fillText(label, cx + 7, cy + 13); cx += tw + 6;
    }
  }

  private card(g: CanvasRenderingContext2D, b: Box, y: number, h: number, color: string) {
    const w = Math.min(520, b.w - 24), x = b.x + (b.w - w) / 2;
    g.fillStyle = '#0b0812e8'; g.fillRect(x, y, w, h); g.strokeStyle = color; g.lineWidth = 2; g.strokeRect(x, y, w, h);
    return { x, y, w, h };
  }
  private bar(g: CanvasRenderingContext2D, x: number, y: number, w: number, frac: number, color: string) {
    g.fillStyle = '#ffffff20'; g.fillRect(x, y, w, 8); g.fillStyle = color; g.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), 8);
  }
  private drawEvents(g: CanvasRenderingContext2D, s: HamsterSnapshot, b: Box, F: (px: number, bold?: boolean) => string) {
    this.acceptRect = null;
    let y = b.y + 116;
    const line = (c: { x: number; w: number }, txt: string, yy: number, col: string, px = 15, bold = true) => { g.fillStyle = col; g.font = F(px, bold); g.fillText(txt, c.x + 12, yy); };
    if (s.rage) {
      const c = this.card(g, b, y, 62, '#ff3a3a');
      line(c, `😡 ROID RAGE — Gerald runs BACKWARDS (${Math.ceil(s.rage.left)}s)`, y + 22, '#ff8a8a');
      line(c, 'Sprint Z4+ to out-pedal him', y + 40, '#fff', 12, false);
      this.bar(g, c.x + 12, y + 48, c.w - 24, s.rage.progress / s.rage.need, '#ff3a3a'); y += 70;
    }
    if (s.golden) {
      const c = this.card(g, b, y, 62, '#ffd23a');
      line(c, `🌟 GOLDEN HAMSTER! (${Math.ceil(s.golden.left)}s)`, y + 22, '#ffd23a');
      line(c, `Sprint Z4+ to catch it — ${s.hardZone >= 4 ? 'GO GO GO' : `you're in Z${s.hardZone}`}`, y + 40, '#fff', 12, false);
      this.bar(g, c.x + 12, y + 48, c.w - 24, s.golden.progress / s.golden.need, '#ffd23a'); y += 70;
    }
    if (s.strike) {
      const c = this.card(g, b, y, 62, '#ff6a3a');
      if (s.strike.phase === 'warn') { line(c, `📢 Union meeting... strike in ${Math.ceil(s.strike.left)}s`, y + 22, '#ffb08a'); line(c, 'When they walk out, hold Z3+ to carry the grid.', y + 42, '#fff', 12, false); }
      else { line(c, `✊ STRIKE! ${Math.ceil(s.strike.left)}s — hamsters at 10%`, y + 22, '#ffb08a'); line(c, `Hold Z3+ (${Math.floor(s.strike.progress)}/${s.strike.need}s) to break it`, y + 40, '#fff', 12, false); this.bar(g, c.x + 12, y + 48, c.w - 24, s.strike.progress / s.strike.need, '#ff6a3a'); }
      y += 70;
    }
    if (s.trial) {
      const c = this.card(g, b, y, 62, '#5ab0ff');
      if (s.trial.phase === 'offer') {
        line(c, `💉 CLINICAL TRIAL offered (${Math.ceil(s.trial.left)}s)`, y + 22, '#9ad0ff');
        line(c, 'ERG block. Big payout + free sample. Press Z or tap here.', y + 42, '#fff', 12, false);
        this.acceptRect = c;
      } else {
        line(c, `💉 TRIAL IN PROGRESS — ${Math.ceil(s.trial.left)}s`, y + 22, '#9ad0ff');
        line(c, `ERG holds the watts. Just keep the cranks turning. Compliance ${Math.round(s.trial.compliance * 100)}%`, y + 40, '#fff', 12, false);
        this.bar(g, c.x + 12, y + 48, c.w - 24, s.trial.compliance, s.trial.compliance >= 0.8 ? '#5ab0ff' : '#ff6a6a');
      }
    }
  }
  private drawToasts(g: CanvasRenderingContext2D, s: HamsterSnapshot, b: Box, F: (px: number, bold?: boolean) => string) {
    const list = s.toasts.slice(-4);
    let y = b.y + b.h - 40 - list.length * 30;
    g.font = F(13, true);
    for (const t of list) {
      const age = s.t - t.t, a = age > 6 ? Math.max(0, 7 - age) : Math.min(1, age * 5);
      g.globalAlpha = a;
      const tw = Math.min(b.w - 24, g.measureText(t.text).width + 20), x = b.x + (b.w - tw) / 2;
      g.fillStyle = t.kind === 'milestone' ? '#3a2a0ae0' : t.kind === 'bad' ? '#4a0a0ae0' : t.kind === 'era' ? '#2a0a4ae0' : '#0a0a1ae0';
      g.fillRect(x, y, tw, 24);
      g.fillStyle = t.kind === 'milestone' ? '#ffd23a' : t.kind === 'bad' ? '#ff9a9a' : t.kind === 'era' ? '#e0b0ff' : '#e8e8ff';
      g.save(); g.beginPath(); g.rect(x, y, tw, 24); g.clip(); g.fillText(t.text, x + 10, y + 17); g.restore();
      y += 30;
    }
    g.globalAlpha = 1;
  }
  private drawTicker(g: CanvasRenderingContext2D, s: HamsterSnapshot, b: Box, F: (px: number, bold?: boolean) => string, dt: number) {
    const y = b.y + b.h - 28;
    g.fillStyle = '#000c'; g.fillRect(b.x, y, b.w, 28);
    g.fillStyle = '#ff3a3a'; g.fillRect(b.x, y, 78, 28);
    g.fillStyle = '#fff'; g.font = F(12, true); g.fillText('HAMSTER NEWS', b.x + 4, y + 18);
    if (s.news.id !== this.tickerId) { this.tickerId = s.news.id; this.tickerX = b.w; }
    this.tickerX -= dt * 70;
    g.save(); g.beginPath(); g.rect(b.x + 80, y, b.w - 80, 28); g.clip();
    g.font = F(13); g.fillStyle = '#ffe8a0'; g.fillText(s.news.text, b.x + 80 + Math.max(10, this.tickerX), y + 19);
    g.restore();
  }

  private drawPanel(g: CanvasRenderingContext2D, s: HamsterSnapshot, p: Box, F: (px: number, bold?: boolean) => string, dt: number) {
    g.fillStyle = '#120e1c'; g.fillRect(p.x, p.y, p.w, p.h);
    g.fillStyle = '#2a2240'; g.fillRect(p.x, p.y, 2, p.h);
    // title
    g.fillStyle = `hsl(${this.hue},80%,70%)`; g.font = F(18, true); g.fillText('HAMSTERGRID', p.x + 14, p.y + 26);
    g.fillStyle = '#8a84a8'; g.font = F(11);
    g.fillText(`${s.eraName} · ${s.totalOwned} rodents & contraptions${s.seeds ? ` · 🌻${s.seeds}` : ''}`, p.x + 14, p.y + 42);
    // tabs
    this.tabRects = [];
    const ty = p.y + 52, th = 34, tw = (p.w - 16) / s.tabs.length;
    s.tabs.forEach((t, i) => {
      const x = p.x + 8 + i * tw, sel = t.id === s.tab;
      g.fillStyle = sel ? '#3a2a60' : '#1c1630'; g.fillRect(x + 2, ty, tw - 4, th);
      if (sel) { g.fillStyle = '#ffd23a'; g.fillRect(x + 2, ty + th - 3, tw - 4, 3); }
      g.fillStyle = sel ? '#fff' : '#a8a0c8'; g.font = F(tw < 80 ? 10 : 12, true); g.textAlign = 'center';
      g.fillText(t.label, x + tw / 2, ty + 21); g.textAlign = 'left';
      if (t.badge) { g.fillStyle = '#ff4a6a'; g.beginPath(); g.arc(x + tw - 9, ty + 8, 4, 0, TAU); g.fill(); }
      this.tabRects.push({ x, y: ty, w: tw, h: th, i });
    });
    // list
    const ly = ty + th + 8, lh = p.y + p.h - ly, rh = 60;
    const target = Math.max(0, Math.min(s.row * rh - lh / 2 + rh, s.items.length * rh - lh + 8));
    this.scroll += (Math.max(0, target) - this.scroll) * Math.min(1, dt * 12);
    this.rowRects = [];
    g.save(); g.beginPath(); g.rect(p.x, ly, p.w, lh); g.clip();
    const cheap = s.effects.some((e) => e.kind === 'cheap');
    s.items.forEach((it, i) => {
      const y = ly + i * rh - this.scroll; if (y + rh < ly || y > p.y + p.h) return;
      const x = p.x + 8, w = p.w - 16, sel = i === s.row;
      g.fillStyle = sel ? '#2c2248' : i % 2 ? '#17122a' : '#1a1430'; g.fillRect(x, y, w, rh - 4);
      if (sel) { g.strokeStyle = s.armed ? '#ff4a4a' : '#ffd23a'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, rh - 6); }
      g.globalAlpha = it.locked ? 0.4 : it.can || it.owned === true ? 1 : 0.62;
      if (typeof it.owned === 'number') { g.fillStyle = '#ffffff22'; g.font = F(30, true); g.textAlign = 'right'; g.fillText(String(it.owned), x + w - 8, y + 40); g.textAlign = 'left'; }
      let nx = x + 10;
      if (it.tag) { g.font = F(9, true); const tw2 = g.measureText(it.tag).width + 8; g.fillStyle = it.tag === 'LEGS' ? '#2a5a8a' : it.tag === 'BOREDOM' ? '#7a6a4a' : it.tag === 'SPECIAL' ? '#8a2a6a' : '#3a3a5a'; g.fillRect(nx, y + 7, tw2, 13); g.fillStyle = '#fff'; g.fillText(it.tag, nx + 4, y + 17); nx += tw2 + 6; }
      g.fillStyle = it.on === false ? '#888' : '#fff'; g.font = F(14, true); g.fillText(it.name, nx, y + 19);
      g.fillStyle = it.can ? (cheap && it.key.startsWith('gen:') ? '#5aff9a' : '#9affc0') : '#ff8a8a'; g.font = F(12, true);
      g.fillText(it.costLabel, x + 10, y + 50);
      g.fillStyle = '#a8a0c8'; g.font = F(11);
      g.save(); g.beginPath(); g.rect(x + 8, y + 22, w - 60, 16); g.clip(); g.fillText(it.desc, x + 10, y + 34); g.restore();
      g.globalAlpha = 1;
      this.rowRects.push({ x, y, w, h: rh - 4, i });
    });
    g.restore();
    // zone pip (tiny; the shell HUD has the real widget)
    g.fillStyle = ZONE_COL[s.zone] ?? '#888'; g.beginPath(); g.arc(p.x + p.w - 16, p.y + 20, 6, 0, TAU); g.fill();
  }
}
