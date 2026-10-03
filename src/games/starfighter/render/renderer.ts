import type { BikeState, GameRenderer, InputState, Insets, Profile } from '../../../contracts';
import { play, setAmbient, stopAmbient, type SfxName } from '../../../audio/sfx';
import { BOSSES, POWERS, SECTORS, sectorTheme } from '../sim/content';
import { SHIP_Y, type SfSnapshot } from '../sim/sim';
import type { EnemyView, HangarView } from '../sim/types';
import { drawBackdrop } from './backdrop';
import { drawBoss } from './bosses';
import { layout, type Box, type SfLayout } from './layout';
import { glow, shade, shipPalette, sprite } from './sprites';

const FONT = "'Trebuchet MS', 'Avenir Next', system-ui, sans-serif";
const CUE_GAP: Partial<Record<SfxName, number>> = { shoot: 0.07, hit: 0.05, kill: 0.04, coin: 0.05, zap: 0.08, explode: 0.08, hurt: 0.2, shootHeavy: 0.1, door: 0.3, select: 0.03 };
const SHOT_COL = { L: '#00f0ff', R: '#ff2bd6' } as const;
const SPIN_COL = '#ffd84a';

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; kind: 'dot' | 'ring' | 'smoke' }

export class SfRenderer implements GameRenderer {
  private canvas!: HTMLCanvasElement;
  private g!: CanvasRenderingContext2D;
  private color = '#4cc9f0';
  private insetB = 0;
  private dpr = 1;
  private cssW = 600; private cssH = 800;
  private send?: (a: unknown) => void;
  private lastCue = -1;
  private seenFx = 0;
  private parts: Particle[] = [];
  private lastT = -1;
  private hangarHits: Array<{ row: number } & Box> = [];
  private onPointer = (e: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const hit = this.hangarHits.find(h => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
    if (hit) { e.preventDefault(); this.send?.({ type: 'hangarRow', row: hit.row }); }
  };

  mount(container: HTMLElement, ctx: { profile: Readonly<Profile>; send?: (a: unknown) => void; insets?: Insets }) {
    this.insetB = ctx.insets?.bottom ?? 0;
    this.color = ctx.profile.color;
    this.send = ctx.send;
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'width:100%;height:100%;display:block;background:#05081a;touch-action:none';
    container.appendChild(this.canvas);
    this.canvas.addEventListener('pointerdown', this.onPointer);
    this.g = this.canvas.getContext('2d')!;
    this.dpr = Math.min(2, (globalThis as { devicePixelRatio?: number }).devicePixelRatio ?? 1);
    this.resize(container.clientWidth || 600, container.clientHeight || 800);
  }
  resize(w: number, h: number) {
    this.cssW = w; this.cssH = h;
    if (this.canvas) { this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr); }
  }
  setInsets(i: Insets) { this.insetB = i.bottom; }
  unmount() { this.canvas?.removeEventListener('pointerdown', this.onPointer); this.canvas?.remove(); stopAmbient(); }

  render(snapshot: unknown, _bike: Readonly<BikeState>, _input: Readonly<InputState>) {
    const s = snapshot as SfSnapshot;
    if (!this.canvas || !s) return;
    const g = this.g;
    // sound cues (skip any backlog from before mount)
    if (this.lastCue < 0) this.lastCue = s.cues.length ? s.cues[s.cues.length - 1].id : 0;
    for (const c of s.cues) if (c.id > this.lastCue) { this.lastCue = c.id; play(c.name as SfxName, { minGapS: CUE_GAP[c.name as SfxName] }); }
    setAmbient('engine', s.phase === 'run' && !s.over ? 0.025 + 0.04 * s.thrust : 0.015, 90 + 140 * s.thrust, 1.4);

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    const CW = this.cssW, CH = this.cssH;
    const dt = this.lastT < 0 ? 0 : Math.max(0, Math.min(0.1, s.t - this.lastT));
    this.lastT = s.t;

    if (s.phase === 'hangar' && s.hangar) { this.drawHangar(s, s.hangar, CW, CH); return; }
    this.hangarHits = [];
    const L = layout(CW, CH, this.insetB);
    const X = (u: number) => L.ox + u * L.sc, Y = (u: number) => L.oy + u * L.sc, S = (u: number) => u * L.sc;

    // new fx -> particles
    for (const f of s.fx) if (f.id > this.seenFx) { this.seenFx = f.id; this.spawnFx(f.kind, f.x, f.y, f.color, f.size); }
    this.stepParticles(dt, s);

    const shake = s.shake > 0 ? s.shake * 6 : 0;
    g.save();
    if (shake) g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    const warp = s.stage === 'warp' ? Math.min(1, 1.2 * Math.sin(Math.max(0, Math.min(1, 1 - s.stageLeft / 6)) * Math.PI)) : 0;
    drawBackdrop(g, CW, CH, s.theme, s.scroll, warp, s.t);

    // play field
    g.save();
    g.beginPath(); g.rect(L.field.x, L.field.y, L.field.w, L.field.h); g.clip();
    const th = sectorTheme(s.sector);
    // gun halves divider
    g.strokeStyle = th.accent + '22'; g.setLineDash([6, 10]); g.lineWidth = 1;
    g.beginPath(); g.moveTo(X(50), Y(0)); g.lineTo(X(50), Y(100)); g.stroke(); g.setLineDash([]);
    const ch = s.challenge?.state === 'active' ? s.challenge : null;
    if (ch?.kind === 'slipstream') this.drawSlip(s, X, Y, S);

    // lances
    for (const l of s.lances) {
      if (!l.active) {
        const a = 0.25 + 0.5 * l.tell * (0.5 + 0.5 * Math.sin(s.t * 30));
        g.fillStyle = `rgba(92,242,224,${a * 0.25})`; g.fillRect(X(l.x - l.w), Y(l.y0), S(l.w * 2), Y(100) - Y(l.y0));
        g.strokeStyle = `rgba(255,80,80,${a})`; g.lineWidth = 2; g.setLineDash([8, 6]);
        for (const e of [-1, 1]) { g.beginPath(); g.moveTo(X(l.x + e * l.w), Y(l.y0)); g.lineTo(X(l.x + e * l.w), Y(100)); g.stroke(); }
        g.setLineDash([]);
      } else {
        const gr = g.createLinearGradient(X(l.x - l.w), 0, X(l.x + l.w), 0);
        gr.addColorStop(0, '#5cf2e000'); gr.addColorStop(0.3, '#5cf2e0cc'); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(0.7, '#5cf2e0cc'); gr.addColorStop(1, '#5cf2e000');
        g.fillStyle = gr; g.fillRect(X(l.x - l.w * 1.3), Y(l.y0), S(l.w * 2.6), Y(100) - Y(l.y0));
      }
    }

    // drops
    for (const d of s.drops) {
      if (d.kind === 'scrap') {
        const a = s.t * 6 + d.id, r = S(0.9);
        g.fillStyle = '#d8c48a'; g.save(); g.translate(X(d.x), Y(d.y)); g.rotate(a);
        g.fillRect(-r, -r * 0.4, r * 2, r * 0.8); g.fillRect(-r * 0.4, -r, r * 0.8, r * 2); g.restore();
      } else {
        const p = POWERS[d.power!], bob = Math.sin(s.t * 4 + d.id) * S(0.6), x = X(d.x), y = Y(d.y) + bob, w = S(5.2), h = S(3.4);
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.7;
        g.drawImage(glow(p.color), x - w * 1.3, y - w * 1.3, w * 2.6, w * 2.6);
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
        g.fillStyle = '#0d0a18'; rr(g, x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4, h / 2 + 2); g.fill();
        g.fillStyle = p.color; rr(g, x - w / 2, y - h / 2, w, h, h / 2); g.fill();
        g.fillStyle = '#ffffff55'; rr(g, x - w / 2 + 2, y - h / 2 + 1, w - 4, h * 0.35, h * 0.2); g.fill();
        txt(g, p.letter, x, y + 1, Math.max(10, h * 0.8), '#0d0a18', 'center', 900);
      }
    }

    // hazards
    for (const h of s.hazards) {
      if (h.kind === 'rock') {
        g.fillStyle = th.rock; g.strokeStyle = shade(th.rock, 0.45); g.lineWidth = 2;
        g.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = h.spin * 0.6 + (i * Math.PI) / 4, rr2 = S(h.r) * (0.78 + 0.22 * Math.abs(Math.sin(i * 2.7 + h.r * 3)));
          const px = X(h.x) + Math.cos(a) * rr2, py = Y(h.y) + Math.sin(a) * rr2;
          i ? g.lineTo(px, py) : g.moveTo(px, py);
        }
        g.closePath(); g.fill(); g.stroke();
        g.fillStyle = shade(th.rock, 0.7); g.beginPath(); g.arc(X(h.x) - S(h.r * 0.25), Y(h.y) - S(h.r * 0.2), S(h.r * 0.25), 0, 7); g.fill();
      } else {
        const col = h.kind === 'orb' ? '#c46cff' : '#ff9a3c', r = S(h.r) * (h.kind === 'orb' ? 1 + 0.15 * Math.sin(s.t * 10) : 1);
        g.globalCompositeOperation = 'lighter';
        g.drawImage(glow(col), X(h.x) - r * 3, Y(h.y) - r * 3, r * 6, r * 6);
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = '#fff'; g.beginPath(); g.arc(X(h.x), Y(h.y), r * 0.55, 0, 7); g.fill();
      }
    }

    // enemies
    for (const e of s.enemies) {
      if (e.y < -15) continue;
      if (e.kind === 'boss') this.drawBossPart(e, s, X, Y, S);
      else this.drawEnemy(e, s.t, X, Y, S);
    }

    // friendly shots
    g.globalCompositeOperation = 'lighter';
    for (const b of s.shots) {
      const n = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / n, uy = b.vy / n;
      if (b.kind === 'missile') {
        g.fillStyle = '#ff6b4a'; g.drawImage(glow('#ff6b4a'), X(b.x) - S(2), Y(b.y) - S(2), S(4), S(4));
        g.strokeStyle = '#ffd0a0'; g.lineWidth = Math.max(2, S(0.6));
        g.beginPath(); g.moveTo(X(b.x), Y(b.y)); g.lineTo(X(b.x - ux * 2.5), Y(b.y - uy * 2.5)); g.stroke();
        if (Math.random() < 0.6) this.parts.push({ x: b.x - ux * 2, y: b.y - uy * 2, vx: 0, vy: 4, life: 0.4, max: 0.4, color: '#9a8a80', size: 0.7, kind: 'smoke' });
      } else {
        const col = b.kind === 'wing' ? '#ff9af0' : SHOT_COL[b.side], len = b.kind === 'wing' ? 1.8 : 3;
        g.strokeStyle = col; g.lineWidth = Math.max(2, S(b.kind === 'wing' ? 0.5 : 0.8)); g.lineCap = 'round';
        g.beginPath(); g.moveTo(X(b.x), Y(b.y)); g.lineTo(X(b.x - ux * len), Y(b.y - uy * len)); g.stroke();
        g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(1, S(0.3));
        g.beginPath(); g.moveTo(X(b.x), Y(b.y)); g.lineTo(X(b.x - ux * len * 0.5), Y(b.y - uy * len * 0.5)); g.stroke();
      }
    }
    g.globalCompositeOperation = 'source-over';

    // overdrive beam
    if (s.overdrive && !s.over) {
      const w = S(s.odWidth), x = X(s.shipX), flick = 0.85 + 0.15 * Math.sin(s.t * 50);
      const gr = g.createLinearGradient(x - w, 0, x + w, 0);
      gr.addColorStop(0, this.color + '00'); gr.addColorStop(0.25, this.color + '88'); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(0.75, this.color + '88'); gr.addColorStop(1, this.color + '00');
      g.globalAlpha = flick; g.fillStyle = gr; g.fillRect(x - w, Y(0) - 20, w * 2, Y(SHIP_Y - 3) - Y(0) + 20); g.globalAlpha = 1;
    }

    // wingmen + ship
    for (const w of s.over ? [] : s.wingmen) {
      const spr = sprite('wing', shipPalette(w.temp ? '#ff5af0' : this.color)), ps = S(5) / spr.width;
      g.drawImage(spr, X(w.x) - (spr.width * ps) / 2, Y(w.y) - (spr.height * ps) / 2, spr.width * ps, spr.height * ps);
    }
    if (!s.over && (ch?.kind === 'spinup' || s.rapidLeft > 0)) this.drawSpin(s, X, Y, S);
    if (!s.over) this.drawShip(s, X, Y, S);

    // particles
    for (const p of this.parts) {
      const a = Math.max(0, p.life / p.max);
      if (p.kind === 'ring') {
        g.strokeStyle = p.color; g.globalAlpha = a; g.lineWidth = Math.max(1, S(0.6) * a + 1);
        g.beginPath(); g.arc(X(p.x), Y(p.y), S(p.size * (1 - a) + 0.5), 0, 7); g.stroke();
      } else if (p.kind === 'smoke') {
        g.fillStyle = p.color; g.globalAlpha = a * 0.5; g.beginPath(); g.arc(X(p.x), Y(p.y), S(p.size * (1.5 - a)), 0, 7); g.fill();
      } else {
        g.fillStyle = p.color; g.globalAlpha = a; const sz = Math.max(1.5, S(p.size)); g.fillRect(X(p.x) - sz / 2, Y(p.y) - sz / 2, sz, sz);
      }
    }
    g.globalAlpha = 1;
    // floating texts
    for (const f of s.fx) {
      if (f.kind !== 'text' && f.kind !== 'pickup') continue;
      const age = s.t - f.t0, a = Math.max(0, 1 - age / 1.4);
      if (a <= 0) continue;
      g.globalAlpha = a; txt(g, f.text ?? '', X(f.x), Y(f.y - age * 6), Math.max(13, S(3)), f.color, 'center', 900, true); g.globalAlpha = 1;
    }
    g.restore(); // clip

    // field edge glow (side mode)
    if (L.mode === 'sides') {
      g.fillStyle = 'rgba(3,4,12,0.45)'; g.fillRect(0, 0, L.field.x, CH); g.fillRect(L.field.x + L.field.w, 0, CW - L.field.x - L.field.w, CH);
      g.fillStyle = th.accent + '55'; g.fillRect(L.field.x - 1, 0, 2, L.UH); g.fillRect(L.field.x + L.field.w - 1, 0, 2, L.UH);
    } else {
      g.fillStyle = 'rgba(3,4,12,0.5)'; g.fillRect(0, 0, CW, L.left.h);
      g.fillStyle = th.accent + '55'; g.fillRect(0, L.left.h - 1, CW, 2);
    }
    g.restore(); // shake

    // hurt vignette
    if (s.hitFlash > 0) {
      const vg = g.createRadialGradient(CW / 2, L.UH / 2, Math.min(CW, L.UH) * 0.3, CW / 2, L.UH / 2, Math.max(CW, L.UH) * 0.75);
      vg.addColorStop(0, '#ff000000'); vg.addColorStop(1, `rgba(255,30,30,${Math.min(0.55, s.hitFlash * 1.6)})`);
      g.fillStyle = vg; g.fillRect(0, 0, CW, CH);
    }

    this.drawPanels(s, L);
    if (s.boss) this.drawBossBar(s, L);
    this.drawBanners(s, L);
  }

  // ---------- entities ----------
  private drawShip(s: SfSnapshot, X: (u: number) => number, Y: (u: number) => number, S: (u: number) => number) {
    const g = this.g;
    if (s.invuln > 0 && Math.floor(s.t * 12) % 2 === 0) return;
    const spr = sprite('ship', shipPalette(this.color)), ps = S(9) / spr.width;
    const x = X(s.shipX), y = Y(SHIP_Y);
    // engine flame
    const fl = S(2 + 3 * s.thrust) * (0.8 + 0.4 * Math.random());
    g.globalCompositeOperation = 'lighter';
    g.drawImage(glow('#ffb020'), x - S(2.5), y + S(3) - S(1), S(5), fl + S(3));
    g.fillStyle = '#fff3c0'; g.fillRect(x - S(0.5), y + S(3.5), S(1), fl * 0.6);
    g.globalCompositeOperation = 'source-over';
    // shield bubble
    if (s.shield > 1) {
      const a = 0.12 + 0.25 * (s.shield / s.shieldMax) + s.hitFlash;
      g.strokeStyle = `rgba(90,170,255,${Math.min(0.8, a)})`; g.lineWidth = 2;
      g.beginPath(); g.ellipse(x, y, S(6.5), S(6), 0, 0, 7); g.stroke();
    }
    g.drawImage(spr, x - (spr.width * ps) / 2, y - (spr.height * ps) / 2, spr.width * ps, spr.height * ps);
    // gun lights
    for (const [side, on] of [['L', s.gunL], ['R', s.gunR]] as const) {
      const gx = x + (side === 'L' ? -1 : 1) * S(4.2), gy = y - S(0.5);
      g.fillStyle = on ? SHOT_COL[side] : '#2a3040'; g.fillRect(gx - S(0.5), gy - S(1.2), S(1), S(1.2));
      if (on) { g.globalCompositeOperation = 'lighter'; g.drawImage(glow(SHOT_COL[side]), gx - S(2), gy - S(2.5), S(4), S(4)); g.globalCompositeOperation = 'source-over'; }
    }
    if (Math.random() < 0.8) this.parts.push({ x: s.shipX + (Math.random() - 0.5), y: SHIP_Y + 4.5, vx: (Math.random() - 0.5) * 3, vy: 12 + 10 * s.thrust, life: 0.35, max: 0.35, color: Math.random() < 0.5 ? '#ffb020' : '#ff6b2a', size: 0.7, kind: 'dot' });
  }

  private drawEnemy(e: EnemyView, t: number, X: (u: number) => number, Y: (u: number) => number, S: (u: number) => number) {
    const g = this.g;
    const spr = sprite(e.kind, undefined, e.hurt > 0 ? 'flash' : e.golden ? 'gold' : 'normal');
    const size = S(e.r * 2.4), ps = size / spr.width;
    const x = X(e.x), y = Y(e.y) + (e.kind === 'drone' || e.kind === 'weaver' ? Math.sin(t * 5 + e.id) * S(0.4) : 0);
    if (e.golden) { g.globalCompositeOperation = 'lighter'; g.drawImage(glow('#ffd84a'), x - size, y - size, size * 2, size * 2); g.globalCompositeOperation = 'source-over'; }
    if (e.tell > 0) { // wind-up glow (diver lock-on / gunner charge)
      const col = e.kind === 'diver' ? '#ff4a4a' : '#ffec5a';
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.4 + 0.6 * e.tell;
      g.drawImage(glow(col), x - size * 0.8 * (0.5 + e.tell), y - size * 0.8 * (0.5 + e.tell), size * 1.6 * (0.5 + e.tell), size * 1.6 * (0.5 + e.tell));
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
    if (e.diving) { g.strokeStyle = '#ff8a3c66'; g.lineWidth = S(1.5); g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - S(6)); g.stroke(); }
    g.drawImage(spr, x - (spr.width * ps) / 2, y - (spr.height * ps) / 2, spr.width * ps, spr.height * ps);
    if (e.hp < e.maxHp && (e.kind === 'armor' || e.kind === 'gunner' || e.kind === 'splitter' || e.golden)) {
      const bw = size, by = y - size * 0.6 - 5;
      g.fillStyle = '#000a'; g.fillRect(x - bw / 2 - 1, by - 1, bw + 2, 5);
      g.fillStyle = e.golden ? '#ffd84a' : '#7dff5a'; g.fillRect(x - bw / 2, by, bw * Math.max(0, e.hp / e.maxHp), 3);
    }
  }

  private drawBossPart(e: EnemyView, s: SfSnapshot, X: (u: number) => number, Y: (u: number) => number, S: (u: number) => number) {
    const g = this.g, col = BOSSES[e.boss!].color;
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35;
    g.drawImage(glow(col), X(e.x) - S(e.r * 2.2), Y(e.y) - S(e.r * 2.2), S(e.r * 4.4), S(e.r * 4.4));
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    drawBoss(g, e.boss!, { x: X(e.x), y: Y(e.y), r: S(e.r), t: s.t, tell: e.tell, hurt: e.hurt > 0.05, part: e.part, frac: e.hp / e.maxHp });
  }

  private drawSlip(s: SfSnapshot, X: (u: number) => number, Y: (u: number) => number, S: (u: number) => number) {
    const g = this.g, sl = s.challenge!;
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const lane = sl.x + Math.sin(i * 2.3) * 18, y = ((i * 37 + s.t * (60 + (i % 5) * 12)) % 120) - 10;
      const a = 0.15 + 0.35 * sl.progress;
      g.strokeStyle = `rgba(92,242,224,${a})`; g.lineWidth = Math.max(1, S(0.4 + (i % 3) * 0.2));
      g.beginPath(); g.moveTo(X(lane), Y(y)); g.lineTo(X(lane + Math.sin(s.t + i) * 1.5), Y(y + 8 + (i % 4) * 3)); g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
  }

  /** Spin-Up: gun barrels whirl around the ship; the arc fills with progress. Rapid Fire keeps them spinning. */
  private drawSpin(s: SfSnapshot, X: (u: number) => number, Y: (u: number) => number, S: (u: number) => number) {
    const g = this.g, ch = s.challenge?.state === 'active' ? s.challenge : null;
    const x = X(s.shipX), y = Y(SHIP_Y), r = S(8.5), speed = ch ? 3 + 9 * ch.progress : 14;
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const a = s.t * speed + (i * Math.PI) / 3;
      g.fillStyle = SPIN_COL; g.globalAlpha = 0.5 + 0.5 * (i % 2);
      g.beginPath(); g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.55, Math.max(2, S(0.7)), 0, 7); g.fill();
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    if (ch) {
      g.strokeStyle = '#ffffff22'; g.lineWidth = Math.max(3, S(0.8));
      g.beginPath(); g.arc(x, y, r * 1.25, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = SPIN_COL; g.beginPath(); g.arc(x, y, r * 1.25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ch.progress); g.stroke();
    }
  }

  // ---------- particles ----------
  private spawnFx(kind: string, x: number, y: number, color: string, size: number) {
    const P = this.parts, R = Math.random;
    if (kind === 'boom') {
      const n = Math.min(40, 10 + size * 3);
      for (let i = 0; i < n; i++) { const a = R() * 6.28, v = (8 + R() * 22) * (0.6 + size * 0.08); P.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + R() * 0.4, max: 0.75, color: R() < 0.4 ? '#ffffff' : R() < 0.5 ? '#ffb020' : color, size: 0.5 + R() * 0.8, kind: 'dot' }); }
      P.push({ x, y, vx: 0, vy: 0, life: 0.4, max: 0.4, color, size: size * 2.2, kind: 'ring' });
      for (let i = 0; i < 4; i++) P.push({ x: x + (R() - 0.5) * size, y: y + (R() - 0.5) * size, vx: 0, vy: 3, life: 0.8, max: 0.8, color: '#5a5060', size: size * 0.5, kind: 'smoke' });
    } else if (kind === 'spark' || kind === 'hurt') {
      for (let i = 0; i < 8; i++) { const a = R() * 6.28, v = 10 + R() * 20; P.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.25 + R() * 0.2, max: 0.45, color, size: 0.5, kind: 'dot' }); }
      if (kind === 'hurt') P.push({ x, y, vx: 0, vy: 0, life: 0.35, max: 0.35, color, size: 10, kind: 'ring' });
    } else if (kind === 'nova') {
      P.push({ x, y, vx: 0, vy: 0, life: 0.8, max: 0.8, color: '#ffffff', size: 120, kind: 'ring' });
      P.push({ x, y, vx: 0, vy: 0, life: 0.6, max: 0.6, color: '#c46cff', size: 90, kind: 'ring' });
    } else if (kind === 'pickup') {
      P.push({ x, y: y + 6, vx: 0, vy: 0, life: 0.4, max: 0.4, color, size: 9, kind: 'ring' });
    } else if (kind === 'muzzle') {
      P.push({ x, y, vx: 0, vy: -10, life: 0.06, max: 0.06, color: '#ffffff', size: 1.2, kind: 'dot' });
    }
    if (P.length > 900) P.splice(0, P.length - 900);
  }
  private stepParticles(dt: number, s: SfSnapshot) {
    if (s.frozen) return;
    for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(0.15, dt); p.vy *= p.kind === 'dot' ? Math.pow(0.15, dt) : 1; p.life -= dt; }
    let j = 0;
    for (const p of this.parts) if (p.life > 0) this.parts[j++] = p;
    this.parts.length = j;
  }

  // ---------- HUD panels ----------
  private drawPanels(s: SfSnapshot, L: SfLayout) {
    const g = this.g, th = sectorTheme(s.sector);
    const ch = s.challenge?.state === 'active' ? s.challenge : null;
    const chName = ch?.kind === 'spinup' ? 'SPIN-UP' : 'SLIPSTREAM', chCol = ch?.kind === 'spinup' ? SPIN_COL : '#5cf2e0';
    const stageName = s.stage === 'cruise' ? (ch ? chName : 'CRUISE') : s.stage === 'attack' ? 'ATTACK RUN' : s.stage === 'boss' ? 'BOSS' : 'WARP';
    const stageCol = s.stage === 'attack' || s.stage === 'boss' ? '#ff8a3c' : ch ? chCol : '#9fb4d8';
    if (L.mode === 'sides') {
      const lb = L.left, rb = L.right, pad = Math.max(12, Math.min(22, lb.w * 0.08)), w = lb.w - pad * 2;
      if (w < 60) return;
      const fs = Math.max(12, Math.min(18, w / 13));
      let y = pad + 4;
      txt(g, `SECTOR ${s.sector}`, lb.x + pad, y + fs * 1.4, fs * 1.6, th.accent, 'left', 900); y += fs * 2.1;
      txt(g, s.sectorName, lb.x + pad, y + fs, fs, '#c8d4ee', 'left', 700); y += fs * 2;
      txt(g, stageName, lb.x + pad, y + fs, fs, stageCol, 'left', 900);
      txt(g, fmtTime(s.stageLeft), lb.x + pad + w, y + fs, fs, '#c8d4ee', 'right', 700); y += fs * 2.2;
      y = bar(g, lb.x + pad, y, w, fs, 'HULL', s.hp / s.hpMax, s.hp / s.hpMax > 0.35 ? '#6fff8a' : '#ff5a4a', `${Math.ceil(s.hp)}`);
      y = bar(g, lb.x + pad, y, w, fs, 'SHIELD', s.shield / s.shieldMax, '#4aa3ff', `${Math.ceil(s.shield)}`);
      // lives
      txt(g, 'SHIPS', lb.x + pad, y + fs, fs * 0.8, '#8899bb', 'left', 800);
      if (s.livesMax === 0) txt(g, '∞', lb.x + pad + w, y + fs, fs, '#fff', 'right', 900);
      else for (let i = 0; i < s.lives; i++) { const spr = sprite('wing', shipPalette(this.color)), ps = fs * 1.1 / spr.width; g.drawImage(spr, lb.x + pad + w - (i + 1) * fs * 1.3, y + fs * 0.1, spr.width * ps, spr.height * ps); }
      y += fs * 1.9;
      // gun level
      txt(g, 'GUN', lb.x + pad, y + fs, fs * 0.8, '#8899bb', 'left', 800);
      for (let i = 0; i < 5; i++) { g.fillStyle = i < s.gunLevel ? '#ffd84a' : '#2a3040'; g.fillRect(lb.x + pad + w - (5 - i) * (fs * 0.95), y + fs * 0.15, fs * 0.75, fs * 0.9); }
      y += fs * 1.9;
      // crank ammo
      txt(g, 'CRANK', lb.x + pad, y + fs, fs * 0.8, '#8899bb', 'left', 800);
      const cap = Math.max(3, Math.ceil(s.credits));
      for (let i = 0; i < cap; i++) { const f = Math.max(0, Math.min(1, s.credits - i)); g.fillStyle = '#2a3040'; g.fillRect(lb.x + pad + w - (cap - i) * (fs * 0.95), y + fs * 0.15, fs * 0.75, fs * 0.9); g.fillStyle = '#e8f0ff'; g.fillRect(lb.x + pad + w - (cap - i) * (fs * 0.95), y + fs * 0.15 + fs * 0.9 * (1 - f), fs * 0.75, fs * 0.9 * f); }
      y += fs * 2.1;
      if (s.missilesLeft > 0) { txt(g, `MISSILES ${Math.ceil(s.missilesLeft)}s`, lb.x + pad, y + fs, fs * 0.9, POWERS.missiles.color, 'left', 900); y += fs * 1.6; }
      if (s.wingmen.some(w2 => w2.temp)) { txt(g, 'WINGMAN', lb.x + pad, y + fs, fs * 0.9, POWERS.wingman.color, 'left', 900); y += fs * 1.6; }
      if (s.overdrive) { txt(g, 'OVERDRIVE!', lb.x + pad, y + fs, fs * 1.1, this.color, 'left', 900); y += fs * 1.8; }
      if (s.rapidLeft > 0) { txt(g, `RAPID FIRE ${Math.ceil(s.rapidLeft)}s`, lb.x + pad, y + fs, fs * 0.9, SPIN_COL, 'left', 900); y += fs * 1.6; }
      if (ch) {
        txt(g, `${chName} ${Math.ceil(ch.left)}s`, lb.x + pad, y + fs, fs * 0.9, chCol, 'left', 900);
        txt(g, ch.kind === 'spinup' ? `${ch.rpm}+ rpm` : 'power Z3+', lb.x + pad + w, y + fs, fs * 0.8, chCol, 'right', 800); y += fs * 1.3;
        y = bar(g, lb.x + pad, y, w, fs, '', ch.progress, chCol, `${Math.round(ch.progress * ch.need)}/${ch.need}s`);
      }
      // right panel
      const rx = rb.x + pad, rw = rb.w - pad * 2;
      let ry = pad + 4;
      txt(g, 'SCORE', rx + rw, ry + fs, fs * 0.8, '#8899bb', 'right', 800); ry += fs * 1.2;
      txt(g, Math.round(s.score).toLocaleString(), rx + rw, ry + fs * 1.6, Math.min(fs * 2, rw / 6.5), '#ffffff', 'right', 900); ry += fs * 2.4;
      txt(g, `x${s.mult.toFixed(1)}`, rx + rw, ry + fs, fs * 1.2, s.combo > 0 ? '#ffd84a' : '#556', 'right', 900);
      if (s.combo > 1) txt(g, `${s.combo} chain`, rx, ry + fs, fs * 0.9, '#ffd84a', 'left', 700);
      ry += fs * 2.2;
      txt(g, 'SCRAP', rx + rw, ry + fs, fs * 0.8, '#8899bb', 'right', 800); ry += fs * 1.2;
      txt(g, `+${Math.floor(s.scrap).toLocaleString()}`, rx + rw, ry + fs * 1.2, fs * 1.4, '#d8c48a', 'right', 900); ry += fs * 1.7;
      txt(g, `bank ${s.bank.toLocaleString()}`, rx + rw, ry + fs, fs * 0.85, '#8a7d5a', 'right', 700); ry += fs * 2;
      // toasts
      for (const tt of s.toasts.slice(-4)) {
        const a = Math.max(0, Math.min(1, 5 - (s.t - tt.t0)));
        g.globalAlpha = a; ry = wrapTxt(g, tt.text, rx + rw, ry + fs, rw, fs * 0.9, tt.color, 'right') + fs * 0.4; g.globalAlpha = 1;
      }
    } else {
      const h = L.left.h, pad = Math.max(8, Math.min(14, h * 0.1)), fs = Math.max(11, Math.min(16, h / 7));
      const lw = L.left.w - pad * 2;
      let y = pad;
      txt(g, `S${s.sector} ${stageName}`, pad, y + fs, fs, stageCol, 'left', 900);
      txt(g, fmtTime(s.stageLeft), pad + lw, y + fs, fs, '#c8d4ee', 'right', 700); y += fs * 1.5;
      y = bar(g, pad, y, lw, fs * 0.85, 'HULL', s.hp / s.hpMax, s.hp / s.hpMax > 0.35 ? '#6fff8a' : '#ff5a4a', `${Math.ceil(s.hp)}`);
      y = bar(g, pad, y, lw, fs * 0.85, 'SHIELD', s.shield / s.shieldMax, '#4aa3ff', `${Math.ceil(s.shield)}`);
      const rx = L.right.x + pad, rw = L.right.w - pad * 2;
      txt(g, Math.round(s.score).toLocaleString(), rx + rw, pad + fs * 1.3, fs * 1.6, '#fff', 'right', 900);
      txt(g, `x${s.mult.toFixed(1)}  GUN ${s.gunLevel}  ${s.livesMax === 0 ? '∞' : '▲'.repeat(s.lives)}`, rx + rw, pad + fs * 2.9, fs, '#ffd84a', 'right', 800);
      txt(g, `+${Math.floor(s.scrap)} scrap`, rx + rw, pad + fs * 4.3, fs, '#d8c48a', 'right', 800);
      const last = s.toasts[s.toasts.length - 1];
      if (last && s.t - last.t0 < 4) txt(g, last.text, rx + rw, Math.min(h - pad, pad + fs * 5.7), fs * 0.85, last.color, 'right', 700);
      if (ch) txt(g, `${chName}${ch.kind === 'spinup' ? ` ${ch.rpm}+ rpm` : ''} ${Math.round(ch.progress * 100)}%`, pad, Math.min(h - pad, y + fs), fs, chCol, 'left', 900);
      else if (s.rapidLeft > 0) txt(g, `RAPID FIRE ${Math.ceil(s.rapidLeft)}s`, pad, Math.min(h - pad, y + fs), fs, SPIN_COL, 'left', 900);
    }
  }

  private drawBossBar(s: SfSnapshot, L: SfLayout) {
    const g = this.g, b = s.boss!, f = L.field;
    const w = f.w * 0.8, x = f.x + (f.w - w) / 2, y = Math.max(f.y, L.mode === 'top' ? L.left.h : 0) + 10, h = Math.max(8, f.w * 0.014);
    txt(g, b.name.toUpperCase(), x, y + 12, 13, '#ffd0d0', 'left', 900, true);
    txt(g, fmtTime(b.leftS), x + w, y + 12, 12, '#ffd0d0aa', 'right', 700, true);
    g.fillStyle = '#000a'; g.fillRect(x - 2, y + 17, w + 4, h + 4);
    g.fillStyle = '#ff4a4a'; g.fillRect(x, y + 19, w * Math.max(0, b.hp / b.maxHp), h);
    g.fillStyle = '#ffffff44'; g.fillRect(x, y + 19, w * Math.max(0, b.hp / b.maxHp), h * 0.35);
  }

  private drawBanners(s: SfSnapshot, L: SfLayout) {
    const g = this.g, f = L.field;
    let cy = f.y + f.h * 0.36;
    for (const b of s.banners.slice(-2)) {
      const age = s.t - b.t0, a = Math.min(1, age * 4, (b.life - age) * 2);
      if (a <= 0) continue;
      const fs = Math.max(26, Math.min(64, f.w / 9)), sc = 1 + Math.max(0, 0.3 - age) * 1.5;
      g.globalAlpha = a;
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(f.x, cy - fs * 1.1, f.w, fs * (b.sub ? 2.1 : 1.5));
      txt(g, b.text, f.x + f.w / 2, cy, fs * sc, b.color, 'center', 900, true);
      if (b.sub) txt(g, b.sub, f.x + f.w / 2, cy + fs * 0.75, fs * 0.38, '#e8f0ff', 'center', 700, true);
      g.globalAlpha = 1;
      cy += fs * 2.4;
    }
  }

  // ---------- hangar ----------
  private drawHangar(s: SfSnapshot, h: HangarView, CW: number, CH: number) {
    const g = this.g, UH = Math.max(200, CH - this.insetB);
    const theme = (h.startSector - 1) % SECTORS.length, th = SECTORS[theme];
    drawBackdrop(g, CW, CH, theme, s.t * 4, 0, s.t);
    g.fillStyle = 'rgba(3,4,12,0.55)'; g.fillRect(0, 0, CW, CH);
    const wide = CW > UH * 1.1, pad = Math.max(14, Math.min(28, CW * 0.025));
    const listX = wide ? CW * 0.42 : pad, listW = wide ? CW - listX - pad : CW - pad * 2;
    // header
    const hfs = Math.max(18, Math.min(34, CW / 28));
    txt(g, 'SPROCKET SQUADRON', pad, pad + hfs, hfs, th.accent, 'left', 900, true);
    txt(g, 'HANGAR', pad, pad + hfs * 2.1, hfs * 0.7, '#c8d4ee', 'left', 800);
    txt(g, `${h.bank.toLocaleString()} scrap`, CW - pad, pad + hfs, hfs * 0.9, '#d8c48a', 'right', 900, true);
    txt(g, `best: sector ${h.bestSector} · ${h.best.toLocaleString()} pts · ${h.runs} sorties`, CW - pad, pad + hfs * 2.1, hfs * 0.5, '#8899bb', 'right', 700);
    const top = pad + hfs * 2.8;
    // ship preview (wide) or small banner ship
    if (wide) {
      const spr = sprite('ship', shipPalette(this.color)), size = Math.min(listX - pad * 2, UH * 0.4), ps = size / spr.width;
      const cx = listX / 2, cy = top + (UH - top) * 0.42 + Math.sin(s.t * 1.5) * 8;
      g.globalCompositeOperation = 'lighter'; g.drawImage(glow('#ffb020'), cx - size * 0.15, cy + size * 0.35, size * 0.3, size * 0.4 + Math.random() * 10); g.globalCompositeOperation = 'source-over';
      g.drawImage(spr, cx - (spr.width * ps) / 2, cy - (spr.height * ps) / 2, spr.width * ps, spr.height * ps);
      const sel = h.rows[h.sel];
      if (sel) wrapTxt(g, sel.kind === 'upgrade' ? `${sel.name}: ${sel.desc}` : sel.kind === 'launch' ? `Launch into ${sectorTheme(h.startSector).name}` : 'Spends your scrap on the cheapest upgrades every launch', cx, cy + size * 0.75, listX - pad * 2, Math.max(13, hfs * 0.55), '#c8d4ee', 'center');
    }
    // footer: auto-launch
    const ffs = Math.max(12, Math.min(18, CW / 60));
    const fy = UH - pad - ffs * 2.2;
    const left = Math.max(0, h.autoLaunchLeft), frac = 1 - left / h.autoLaunchS;
    g.fillStyle = '#ffffff18'; g.fillRect(listX, fy, listW, ffs * 0.6);
    g.fillStyle = th.accent; g.fillRect(listX, fy, listW * frac, ffs * 0.6);
    txt(g, `Pedal to launch in ${Math.ceil(left)}s  ·  B launches now`, listX, fy + ffs * 1.9, ffs, '#c8d4ee', 'left', 700);
    // rows
    const avail = fy - top - ffs, rowH = Math.max(30, Math.min(52, avail / h.rows.length));
    const nFit = Math.max(3, Math.floor(avail / rowH));
    const first = Math.max(0, Math.min(h.rows.length - nFit, h.sel - Math.floor(nFit / 2)));
    this.hangarHits = [];
    const rfs = Math.max(12, Math.min(20, rowH * 0.42));
    for (let i = first; i < Math.min(h.rows.length, first + nFit); i++) {
      const r = h.rows[i], y = top + (i - first) * rowH, sel = i === h.sel;
      g.fillStyle = sel ? th.accent + '44' : i % 2 ? '#ffffff08' : '#ffffff10';
      rr(g, listX, y + 2, listW, rowH - 4, 6); g.fill();
      if (sel) { g.strokeStyle = th.accent; g.lineWidth = 2; rr(g, listX, y + 2, listW, rowH - 4, 6); g.stroke(); }
      const cy = y + rowH / 2 + rfs * 0.35;
      if (r.kind === 'launch') {
        txt(g, '▶ LAUNCH', listX + 12, cy, rfs * 1.1, '#ffffff', 'left', 900);
        txt(g, `${h.maxStartSector > 1 ? '◀ ' : ''}Sector ${h.startSector}${h.maxStartSector > 1 ? ' ▶' : ''}  ${sectorTheme(h.startSector).name}`, listX + listW - 12, cy, rfs, th.accent, 'right', 800);
      } else if (r.kind === 'auto') {
        txt(g, r.name, listX + 12, cy, rfs, '#c8d4ee', 'left', 700);
        txt(g, r.desc, listX + listW - 12, cy, rfs, r.desc === 'ON' ? '#7dff5a' : '#8899bb', 'right', 900);
      } else {
        const maxed = r.cost === undefined;
        txt(g, r.name, listX + 12, cy, rfs, maxed ? '#8899bb' : '#ffffff', 'left', 800);
        const px = listX + listW * 0.3, bw = Math.min(90, listW * 0.14), frac = (r.level ?? 0) / Math.max(1, r.max ?? 1);
        g.fillStyle = '#ffffff22'; g.fillRect(px, cy - rfs * 0.55, bw, rfs * 0.5);
        g.fillStyle = th.accent; g.fillRect(px, cy - rfs * 0.55, bw * frac, rfs * 0.5);
        txt(g, `${r.level}/${r.max}`, px + bw + 8, cy, rfs * 0.8, th.accent, 'left', 800);
        const costW = rfs * 4.2, dx = px + bw + rfs * 3.2;
        if (listX + listW - 12 - costW - dx > 80) txt(g, fit(g, r.desc, listX + listW - 12 - costW - dx, rfs * 0.75), dx, cy, rfs * 0.75, '#8899bb', 'left', 600);
        txt(g, maxed ? 'MAX' : `${r.cost!.toLocaleString()}`, listX + listW - 12, cy, rfs, maxed ? '#8899bb' : r.affordable ? '#d8c48a' : '#ff6b6b', 'right', 900);
      }
      this.hangarHits.push({ row: i, x: listX, y, w: listW, h: rowH });
    }
  }
}

// ---------- drawing helpers ----------
function txt(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left', weight = 700, shadow = false) {
  g.font = `${weight} ${Math.round(size)}px ${FONT}`; g.textAlign = align; g.textBaseline = 'alphabetic';
  if (shadow) { g.fillStyle = '#000000aa'; g.fillText(s, x + 2, y + 2); }
  g.fillStyle = color; g.fillText(s, x, y);
}
/** Ellipsize `s` to fit `w` px at the given size. */
function fit(g: CanvasRenderingContext2D, s: string, w: number, size: number): string {
  g.font = `600 ${Math.round(size)}px ${FONT}`;
  if (g.measureText(s).width <= w) return s;
  while (s.length > 1 && g.measureText(s + '…').width > w) s = s.slice(0, -1);
  return s + '…';
}
function wrapTxt(g: CanvasRenderingContext2D, s: string, x: number, y: number, w: number, size: number, color: string, align: CanvasTextAlign): number {
  g.font = `700 ${Math.round(size)}px ${FONT}`;
  const words = s.split(' '); let line = '';
  for (const wd of words) {
    const tryL = line ? line + ' ' + wd : wd;
    if (g.measureText(tryL).width > w && line) { txt(g, line, x, y, size, color, align); y += size * 1.25; line = wd; } else line = tryL;
  }
  if (line) txt(g, line, x, y, size, color, align);
  return y + size * 0.3;
}
function bar(g: CanvasRenderingContext2D, x: number, y: number, w: number, fs: number, label: string, f: number, color: string, value: string): number {
  if (label) txt(g, label, x, y + fs * 0.85, fs * 0.8, '#8899bb', 'left', 800);
  txt(g, value, x + w, y + fs * 0.85, fs * 0.8, '#c8d4ee', 'right', 800);
  const by = y + fs * 1.15, bh = Math.max(6, fs * 0.55);
  g.fillStyle = '#ffffff14'; g.fillRect(x, by, w, bh);
  g.fillStyle = color; g.fillRect(x, by, w * Math.max(0, Math.min(1, f)), bh);
  g.fillStyle = '#ffffff33'; g.fillRect(x, by, w * Math.max(0, Math.min(1, f)), bh * 0.35);
  return by + bh + fs * 0.7;
}
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function fmtTime(s: number) { const m = Math.floor(s / 60), ss = Math.floor(s % 60); return `${m}:${ss.toString().padStart(2, '0')}`; }

