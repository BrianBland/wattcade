// Placeholder renderer: grey boxes and labels for every scene, so the story runtime can be ridden end to end.
// The voxel world (#185) replaces the stage box; the HUD pieces (bubble, plate, card, menu) stay.
import type { BikeState, GameRenderer, InputState, Insets, Profile } from '../../../contracts';
import { NO_INSETS } from '../../../contracts';
import type { LookName, SeasideSnapshot } from '../sim/types';
import { inside, layout, type Box } from './layout';

const SKY: Record<LookName, [string, string]> = {
  morning: ['#cfe6ee', '#7cc3d3'], midday: ['#bfe3f5', '#4fa3c9'], belly: ['#4a1830', '#b4507a'],
  jungle: ['#c9e3b0', '#5aa35a'], lava: ['#2a0c10', '#c2451c'], reentry: ['#1a0a20', '#f07a2a'], fever: ['#141a33', '#7a3a8a'],
};

export class SeasideRenderer implements GameRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private insets: Insets = NO_INSETS;
  private W = 0; H = 0;
  private menuRows: Box[] = [];
  private send?: (a: unknown) => void;
  private ro: ResizeObserver | null = null;
  private offTap: (() => void) | null = null;

  mount(container: HTMLElement, ctx: { profile: Readonly<Profile>; send?: (a: unknown) => void; insets?: Insets }): void {
    this.send = ctx.send;
    if (ctx.insets) this.insets = ctx.insets;
    const c = document.createElement('canvas');
    c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
    container.appendChild(c);
    this.canvas = c; this.g = c.getContext('2d');
    const onDown = (e: PointerEvent) => {
      const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const i = this.menuRows.findIndex((b) => inside(b, x, y));
      if (i >= 0) this.send?.({ type: 'menu', index: i });
    };
    c.addEventListener('pointerdown', onDown);
    this.offTap = () => c.removeEventListener('pointerdown', onDown);
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize(container.clientWidth, container.clientHeight));
      this.ro.observe(container);
    }
    this.resize(container.clientWidth, container.clientHeight);
  }

  setInsets(insets: Insets): void { this.insets = insets; }

  resize(w: number, h: number): void {
    if (!this.canvas) return;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    this.W = w; this.H = h;
    this.canvas.width = Math.max(1, Math.round(w * dpr)); this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.g?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(snap: unknown, _bike: Readonly<BikeState>, _input: Readonly<InputState>): void {
    const g = this.g, s = snap as SeasideSnapshot;
    if (!g || !s || !this.W) return;
    const { W, H } = this;
    const L = layout(W, H, this.insets, s.menu?.items.length ?? 0);
    this.menuRows = L.menu;

    // background: full bleed, tinted by the look and dream dial
    const [a, b] = SKY[s.look.name];
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, a); grad.addColorStop(1, b);
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    if (s.look.dream > 0) { g.fillStyle = `rgba(160,60,200,${0.25 * s.look.dream})`; g.fillRect(0, 0, W, H); }

    // rail: ticks every 10 m scroll with routeS
    const horizon = L.stage.y + L.stage.h * 0.68;
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2;
    for (let k = 0; k < 24; k++) {
      const m = Math.ceil(s.routeS / 10) * 10 + k * 10, d = m - s.routeS + 4;
      const y = horizon + (L.stage.y + L.stage.h - horizon) * Math.min(1, 6 / d);
      g.beginPath(); g.moveTo(W / 2 - 900 / d, y); g.lineTo(W / 2 + 900 / d, y); g.stroke();
    }

    if (s.menu) { this.drawMenu(g, s, L.menu); return; }

    // stage placeholder
    g.fillStyle = 'rgba(128,128,128,.35)'; g.strokeStyle = 'rgba(40,40,40,.6)'; g.lineWidth = 2;
    g.fillRect(L.stage.x, L.stage.y, L.stage.w, L.stage.h); g.strokeRect(L.stage.x, L.stage.y, L.stage.w, L.stage.h);
    g.fillStyle = '#1b1b1b'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `600 ${Math.round(Math.min(40, L.stage.h * 0.12))}px system-ui, sans-serif`;
    g.fillText(s.scene.title, W / 2, L.stage.y + L.stage.h * 0.42);
    g.font = `${Math.round(Math.min(20, L.stage.h * 0.06))}px system-ui, sans-serif`;
    g.fillText(`${s.scene.kind} · ${s.sceneId} · ${s.speed > 0 ? `${(s.speed * 3.6).toFixed(0)} km/h · ` : ''}target ${Math.round(s.effortTarget * 100)}% FTP`,
      W / 2, L.stage.y + L.stage.h * 0.58);

    // plate: chapter, scene n/N, progress
    const p = L.plate;
    g.fillStyle = 'rgba(255,255,255,.8)'; g.fillRect(p.x, p.y, p.w, p.h);
    g.fillStyle = 'rgba(40,110,140,.8)'; g.fillRect(p.x, p.y + p.h - 6, p.w * s.scene.progress, 6);
    g.fillStyle = '#222'; g.textAlign = 'left'; g.font = `${Math.round(p.h * 0.38)}px system-ui, sans-serif`;
    g.fillText(`${['Morning', 'Midday', 'Evening'][s.chapter]} · ${s.scene.index + 1}/${s.scene.count} ${s.scene.title}`, p.x + 12, p.y + p.h * 0.45);
    g.textAlign = 'right'; g.fillText(`${Math.round(s.routeS)} m · dream ${s.look.dream.toFixed(2)}`, p.x + p.w - 12, p.y + p.h * 0.45);

    // monologue bubble, top-left
    if (s.monologue) {
      const m = s.monologue, fade = Math.min(1, m.age / 0.3, (m.life - m.age) / 0.4), bb = L.bubble;
      g.globalAlpha = Math.max(0, fade);
      g.fillStyle = '#fff'; g.strokeStyle = '#2b2b2b'; g.lineWidth = 2;
      g.beginPath(); g.roundRect(bb.x, bb.y, bb.w, bb.h, 12); g.fill(); g.stroke();
      g.fillStyle = '#2b2b2b'; g.textAlign = 'left'; g.font = `italic ${Math.round(bb.h * 0.38)}px Georgia, serif`;
      g.fillText(m.text, bb.x + 16, bb.y + bb.h / 2, bb.w - 32);
      g.globalAlpha = 1;
    }

    // chapter card
    if (s.chapterCard) {
      const c = L.card, age = s.chapterCard.age, al = Math.max(0, Math.min(1, age / 0.6, (5 - age) / 0.8));
      g.globalAlpha = al; g.fillStyle = 'rgba(10,10,10,.75)'; g.fillRect(c.x, c.y, c.w, c.h);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = `${Math.round(c.h * 0.36)}px Georgia, serif`;
      g.fillText(s.chapterCard.name, c.x + c.w / 2, c.y + c.h / 2); g.globalAlpha = 1;
    }
  }

  private drawMenu(g: CanvasRenderingContext2D, s: SeasideSnapshot, rows: Box[]): void {
    const m = s.menu!;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    m.items.forEach((it, i) => {
      const r = rows[i], on = i === m.index;
      g.fillStyle = on ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.6)';
      g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, 10); g.fill();
      if (on) { g.strokeStyle = '#2b2b2b'; g.lineWidth = 3; g.stroke(); }
      g.fillStyle = '#222'; g.font = `${Math.round(r.h * 0.36)}px Georgia, serif`;
      g.fillText(on && m.autoIn >= 0 ? `${it.label}  (${Math.ceil(m.autoIn)})` : it.label, r.x + r.w / 2, r.y + r.h / 2, r.w - 24);
    });
  }

  unmount(): void {
    this.ro?.disconnect(); this.offTap?.();
    this.canvas?.remove(); this.canvas = null; this.g = null;
  }
}
