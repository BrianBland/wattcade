// The Seaside renderer. Chapter 1 (#189) rides the voxel world (WorldView + the Morning director, render/morning.ts);
// the shops are the counter dioramas; later chapters still use the placeholder stage (grey box and labels) until
// their scenes land. The HUD pieces (bubble, plate, card, menu, fishing prompts) are a 2D canvas on top.
import type { BikeState, GameRenderer, InputState, Insets, Profile } from '../../../contracts';
import { NO_INSETS } from '../../../contracts';
import type { LookName, SeasideSnapshot } from '../sim/types';
import { getWorld } from '../world/worlds';
import { MorningSet } from './morning';
import { MORNING_WORLD, type MorningShot } from './morningShots';
import { pixelSetting } from './perf';
import { WorldView } from './worldView';
import { drawShop, type ShopTarget } from './shop';
import { shopLayout } from './shopLayout';
import { ShopDiorama } from './shopView';
import { drawFishing } from './fishing2d';
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
  private spotBoxes: Box[] = [];
  private shopTargets: ShopTarget[] = [];
  private diorama: ShopDiorama | null = null;
  private shopCanvas: HTMLCanvasElement | null = null;
  private send?: (a: unknown) => void;
  private ro: ResizeObserver | null = null;
  private offTap: (() => void) | null = null;
  private worldCanvas: HTMLCanvasElement | null = null;
  private view: WorldView | null = null;
  private morning: MorningSet | null = null;
  private profile: Readonly<Profile> | null = null;
  private overlayEl: HTMLElement | null = null;
  /** Story clock for the world (advances with the sim's scene time, so pauses freeze it). */
  private clock = 0; private lastScene = ''; private lastSceneT = 0;

  mount(container: HTMLElement, ctx: { profile: Readonly<Profile>; send?: (a: unknown) => void; insets?: Insets }): void {
    this.send = ctx.send; this.profile = ctx.profile;
    if (ctx.insets) this.insets = ctx.insets;
    const world = document.createElement('canvas');
    world.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:none';
    container.appendChild(world); this.worldCanvas = world;
    if (import.meta.env?.DEV) {
      const o = document.createElement('pre');
      o.style.cssText = 'position:absolute;right:6px;top:6px;margin:0;padding:4px 6px;font:11px/1.3 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.45);pointer-events:none;display:none;z-index:2';
      container.appendChild(o); this.overlayEl = o;
    }
    const background = document.createElement('canvas'); container.appendChild(background);
    this.shopCanvas = background; this.diorama = new ShopDiorama(background); this.diorama.hide();
    const c = document.createElement('canvas');
    c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
    container.appendChild(c);
    this.canvas = c; this.g = c.getContext('2d');
    const onDown = (e: PointerEvent) => {
      const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const shopTarget = this.shopTargets.find((t) => inside(t.box, x, y));
      if (shopTarget) { this.send?.({ type: 'shop', action: shopTarget.action }); return; }
      const i = this.menuRows.findIndex((b) => inside(b, x, y));
      if (i >= 0) { this.send?.({ type: 'menu', index: i }); return; }
      const k = this.spotBoxes.findIndex((b) => inside(b, x, y));
      if (k >= 0) this.send?.({ type: 'spot', index: k });
    };
    c.addEventListener('pointerdown', onDown);
    this.offTap = () => c.removeEventListener('pointerdown', onDown);
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize(container.clientWidth, container.clientHeight));
      this.ro.observe(container);
    }
    this.resize(container.clientWidth, container.clientHeight);
  }

  setInsets(insets: Insets): void { this.insets = insets; this.view?.setInsets(insets); }

  resize(w: number, h: number): void {
    if (!this.canvas) return;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    this.W = w; this.H = h;
    this.view?.resize(w, h);
    this.canvas.width = Math.max(1, Math.round(w * dpr)); this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.g?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** The voxel world, built on the first Morning shot (its tile workers start then). */
  private ensureWorld(): MorningSet {
    if (!this.morning) {
      const save = (this.profile?.gameData as Record<string, unknown> | undefined)?.seaside;
      this.view = new WorldView(this.worldCanvas!, getWorld('coast'), { pixel: pixelSetting(save), overlay: this.overlayEl });
      this.view.resize(this.W, this.H); this.view.setInsets(this.insets);
      this.morning = new MorningSet(this.view);
    }
    return this.morning;
  }

  private tickClock(s: SeasideSnapshot): number {
    const before = this.clock;
    this.clock += s.sceneId === this.lastScene ? Math.max(0, s.sceneT - this.lastSceneT) : s.sceneT;
    this.lastScene = s.sceneId; this.lastSceneT = s.sceneT;
    return this.clock - before;
  }

  render(snap: unknown, bike: Readonly<BikeState>, _input: Readonly<InputState>): void {
    const g = this.g, s = snap as SeasideSnapshot;
    if (!g || !s || !this.W) return;
    const { W, H } = this;
    const dt = this.tickClock(s);
    const shopOpen = !!s.shop && s.shop.bonusRemaining === null;
    if (!s.menu && !shopOpen && (MORNING_WORLD.has(s.sceneId) || (s.fishing && (s.sceneId === 'shop1' || s.sceneId === 'pierStand')))) {
      const shot = this.ensureWorld().frame(s, this.clock, dt, bike?.cadence3s ?? 0);
      if (shot) { this.diorama?.hide(); this.worldCanvas!.style.display = 'block'; if (this.overlayEl) this.overlayEl.style.display = 'block'; this.drawWorldHud(g, s, shot); return; }
    }
    this.worldCanvas!.style.display = 'none';
    if (this.overlayEl) this.overlayEl.style.display = 'none';
    const L = layout(W, H, this.insets, s.menu?.items.length ?? 0, s.fishing?.spots.length ?? 3);
    this.menuRows = L.menu;
    this.shopTargets = [];
    this.spotBoxes = s.fishing?.phase === 'spot' ? L.fish.spots : [];

    if (s.shop && s.shop.bonusRemaining === null && !s.menu) {
      this.spotBoxes = [];
      this.diorama?.show(s.shop.id, W, H, this.insets);
      g.clearRect(0, 0, W, H);
      this.shopTargets = drawShop(g, s.shop, shopLayout(W, H, this.insets));
      return;
    }
    this.diorama?.hide();

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

    // stage placeholder (fishing draws its own)
    g.fillStyle = 'rgba(128,128,128,.35)'; g.strokeStyle = 'rgba(40,40,40,.6)'; g.lineWidth = 2;
    g.fillRect(L.stage.x, L.stage.y, L.stage.w, L.stage.h); g.strokeRect(L.stage.x, L.stage.y, L.stage.w, L.stage.h);
    if (s.fishing) drawFishing(g, s.fishing, L.fish, L.stage, s.sceneT);
    g.fillStyle = '#1b1b1b'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (!s.fishing) {
      g.font = `600 ${Math.round(Math.min(40, L.stage.h * 0.12))}px system-ui, sans-serif`;
      g.fillText(s.scene.title, W / 2, L.stage.y + L.stage.h * 0.42);
      g.font = `${Math.round(Math.min(20, L.stage.h * 0.06))}px system-ui, sans-serif`;
      g.fillText(`${s.scene.kind} · ${s.sceneId} · ${s.speed > 0 ? `${(s.speed * 3.6).toFixed(0)} km/h · ` : ''}target ${Math.round(s.effortTarget * 100)}% FTP`,
        W / 2, L.stage.y + L.stage.h * 0.58);
    }

    // plate: chapter, scene n/N, progress
    const p = L.plate;
    g.fillStyle = 'rgba(255,255,255,.8)'; g.fillRect(p.x, p.y, p.w, p.h);
    g.fillStyle = 'rgba(40,110,140,.8)'; g.fillRect(p.x, p.y + p.h - 6, p.w * s.scene.progress, 6);
    g.fillStyle = '#222'; g.textAlign = 'left'; g.font = `${Math.round(p.h * 0.38)}px system-ui, sans-serif`;
    g.fillText(`${['Morning', 'Midday', 'Evening'][s.chapter]} · ${s.scene.index + 1}/${s.scene.count} ${s.scene.title}`, p.x + 12, p.y + p.h * 0.45);
    g.textAlign = 'right'; g.fillText(`${Math.round(s.routeS)} m · dream ${s.look.dream.toFixed(2)}`, p.x + p.w - 12, p.y + p.h * 0.45);
    this.drawBubbleAndCard(g, s, L);
  }

  /** Over the voxel world: the title, fishing prompts, the monologue, the chapter card, a thin progress line. */
  private drawWorldHud(g: CanvasRenderingContext2D, s: SeasideSnapshot, shot: MorningShot): void {
    const { W, H } = this, L = layout(W, H, this.insets, 0, s.fishing?.spots.length ?? 3);
    g.clearRect(0, 0, W, H);
    this.menuRows = []; this.shopTargets = [];
    this.spotBoxes = s.fishing?.phase === 'spot' ? L.fish.spots : [];
    if (s.fishing) drawFishing(g, s.fishing, L.fish, L.stage, s.sceneT, true);
    if (s.sceneId === 'title') { // small serif "Seaside" in the fog
      const al = Math.max(0, Math.min(1, shot.fx.fog * 1.6, s.sceneT / 2));
      g.globalAlpha = al; g.fillStyle = '#3d4446'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `${Math.round(Math.min(64, L.UH * 0.09))}px Georgia, serif`;
      g.fillText('Seaside', W / 2, L.UH * 0.42);
      g.font = `italic ${Math.round(Math.min(20, L.UH * 0.032))}px Georgia, serif`;
      g.fillText('pedal to begin', W / 2, L.UH * 0.42 + Math.min(52, L.UH * 0.075));
      g.globalAlpha = 1;
    }
    // the title is the Morning's card: no second card on top of it
    const card = s.sceneId === 'title' ? null : s.chapterCard;
    if (shot.fx.black > 0) { g.fillStyle = `rgba(0,0,0,${shot.fx.black})`; g.fillRect(0, 0, W, H); }
    const p = L.plate; // progress through the scene: a hairline above the HUD
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(p.x, p.y + p.h - 3, p.w, 3);
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(p.x, p.y + p.h - 3, p.w * s.scene.progress, 3);
    this.drawBubbleAndCard(g, { ...s, chapterCard: card }, L);
  }

  private drawBubbleAndCard(g: CanvasRenderingContext2D, s: SeasideSnapshot, L: ReturnType<typeof layout>): void {
    // monologue bubble, top-left
    if (s.monologue) {
      const m = s.monologue, fade = Math.min(1, m.age / 0.3, (m.life - m.age) / 0.4), bb = L.bubble;
      g.globalAlpha = Math.max(0, fade);
      g.fillStyle = '#fff'; g.strokeStyle = '#2b2b2b'; g.lineWidth = 2;
      g.beginPath(); g.roundRect(bb.x, bb.y, bb.w, bb.h, 12); g.fill(); g.stroke();
      g.fillStyle = '#2b2b2b'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `italic ${Math.round(bb.h * 0.38)}px Georgia, serif`;
      g.fillText(m.text, bb.x + 16, bb.y + bb.h / 2, bb.w - 32);
      g.globalAlpha = 1;
    }

    // chapter card
    if (s.chapterCard) {
      const c = L.card, age = s.chapterCard.age, al = Math.max(0, Math.min(1, age / 0.6, (5 - age) / 0.8));
      g.globalAlpha = al; g.fillStyle = 'rgba(10,10,10,.75)'; g.fillRect(c.x, c.y, c.w, c.h);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `${Math.round(c.h * 0.36)}px Georgia, serif`;
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
    this.morning?.dispose(); this.morning = null; this.view?.dispose(); this.view = null;
    this.worldCanvas?.remove(); this.worldCanvas = null; this.overlayEl?.remove(); this.overlayEl = null;
    this.diorama?.dispose(); this.diorama = null; this.shopCanvas?.remove(); this.shopCanvas = null;
    this.canvas?.remove(); this.canvas = null; this.g = null;
  }
}
