// The Seaside renderer. Chapter 1 (#189) rides the voxel world (WorldView + the Morning director, render/morning.ts);
// Chapter 2a (#190) switches the same view to the belly world (render/belly.ts), Chapter 2b (#191) to the island
// (render/island.ts), Chapters 3a/3b (#192, #193) to the cavern (render/cavern.ts, render/gate.ts); the shops are dioramas;
// Chapter 3c (#194) flies re-entry and the wings over the coast (render/flight.ts) and lands on the Sunset highway (the
// Morning set rides it, the sun low, Lou's shut); the ending (#195: the cliff lift-off, Lou's car, the angel, the credits)
// rides the same coast (render/ending.ts). The HUD pieces (bubble, plate, card, menu, fishing prompts, credits) are a 2D canvas on top.
import type { BikeState, GameRenderer, InputState, Insets, Profile } from '../../../contracts';
import { NO_INSETS } from '../../../contracts';
import type { LookName, SeasideSnapshot } from '../sim/types';
import { getWorld } from '../world/worlds';
import { MorningSet } from './morning';
import { BellySet } from './belly';
import { BELLY_WORLD, type BellyShot } from './bellyShots';
import { IslandSet } from './island';
import { ISLAND_WORLD, type IslandShot } from './islandShots';
import { CavernSet } from './cavern';
import { CAVERN_WORLD, type CavernShot } from './cavernShots';
import { FlightSet } from './flight';
import { FLIGHT_WORLD, type FlightShot } from './flightShots';
import { EndingSet } from './ending';
import { ANGEL, ENDING_WORLD, type EndingShot } from './endingShots';
import { creditsLayout } from './creditsLayout';
import { creditLines } from '../credits';
import { BELLY_LAYERS, GATE_LAYERS, PARTS, type DrillLayer, type DrillView } from '../sim/belly';
import { STORY } from '../sim/story';
import { MORNING_WORLD, type MorningShot } from './morningShots';
import { pixelSetting } from './perf';
import { WorldView } from './worldView';
import { drawShop, type ShopTarget } from './shop';
import { shopLayout } from './shopLayout';
import { ShopDiorama } from './shopView';
import { drawFishing } from './fishing2d';
import { bellyHud, inside, layout, type Box } from './layout';

const PARTS_PLAN_S = STORY.find((x) => x.id === 'spareParts')!.planS;
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
  private belly: BellySet | null = null;
  private island: IslandSet | null = null;
  private cavern: CavernSet | null = null;
  private flight: FlightSet | null = null;
  private endSet: EndingSet | null = null;
  /** Seconds since the beach's first fish went on the fire (null before). */
  private cooked: number | null = null;
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

  /** The voxel view on `world` (made on the first world shot: its tile workers start then; switched after). */
  private ensureView(world: string): WorldView {
    if (!this.view) {
      const save = (this.profile?.gameData as Record<string, unknown> | undefined)?.seaside;
      this.view = new WorldView(this.worldCanvas!, getWorld(world), { pixel: pixelSetting(save), overlay: this.overlayEl });
      this.view.resize(this.W, this.H); this.view.setInsets(this.insets);
    } else this.view.setWorld(getWorld(world));
    return this.view;
  }

  /** The Morning set on the coast world. */
  private ensureWorld(): MorningSet {
    if (!this.morning) {
      this.dropSets();
      this.morning = new MorningSet(this.ensureView('coast'));
    }
    return this.morning;
  }

  /** The island set on the island world. */
  private ensureIsland(): IslandSet {
    if (!this.island) {
      this.dropSets();
      this.island = new IslandSet(this.ensureView('island'));
    }
    return this.island;
  }

  /** The belly set on the belly world. */
  private ensureBelly(): BellySet {
    if (!this.belly) {
      this.dropSets();
      this.belly = new BellySet(this.ensureView('belly'));
    }
    return this.belly;
  }

  /** The cavern set on the cavern world. */
  private ensureCavern(): CavernSet {
    if (!this.cavern) {
      this.dropSets();
      this.cavern = new CavernSet(this.ensureView('cavern'));
    }
    return this.cavern;
  }

  /** Re-entry and the wings over the coast world. */
  private ensureFlight(): FlightSet {
    if (!this.flight) {
      this.dropSets();
      this.flight = new FlightSet(this.ensureView('coast'));
    }
    return this.flight;
  }

  /** The ending (the cliff, the angel) over the coast world. */
  private ensureEnding(): EndingSet {
    if (!this.endSet) {
      this.dropSets();
      this.endSet = new EndingSet(this.ensureView('coast'));
    }
    return this.endSet;
  }

  /** Release whichever set is up (each holds GPU resources on the shared view). */
  private dropSets(): void {
    this.morning?.dispose(); this.morning = null; this.belly?.dispose(); this.belly = null;
    this.island?.dispose(); this.island = null; this.cavern?.dispose(); this.cavern = null;
    this.flight?.dispose(); this.flight = null; this.endSet?.dispose(); this.endSet = null;
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
    if (!s.menu && ENDING_WORLD.has(s.sceneId)) {
      const shot = this.ensureEnding().frame(s, this.clock, dt, bike?.cadence3s ?? 0);
      if (shot) { this.diorama?.hide(); this.worldCanvas!.style.display = 'block'; if (this.overlayEl) this.overlayEl.style.display = 'block'; this.drawEndingHud(g, s, shot); return; }
    }
    if (!s.menu && FLIGHT_WORLD.has(s.sceneId)) {
      const shot = this.ensureFlight().frame(s, this.clock, dt, bike?.cadence3s ?? 0);
      if (shot) { this.diorama?.hide(); this.worldCanvas!.style.display = 'block'; if (this.overlayEl) this.overlayEl.style.display = 'block'; this.drawFlightHud(g, s, shot); return; }
    }
    if (!s.menu && CAVERN_WORLD.has(s.sceneId)) {
      const shot = this.ensureCavern().frame(s, this.clock, dt, bike?.cadence3s ?? 0);
      if (shot) { this.diorama?.hide(); this.worldCanvas!.style.display = 'block'; if (this.overlayEl) this.overlayEl.style.display = 'block'; this.drawCavernHud(g, s, shot); return; }
    }
    if (!s.menu && ISLAND_WORLD.has(s.sceneId)) {
      const shot = this.ensureIsland().frame(s, this.clock, dt, bike?.cadence3s ?? 0);
      if (shot) { this.diorama?.hide(); this.worldCanvas!.style.display = 'block'; if (this.overlayEl) this.overlayEl.style.display = 'block'; this.drawIslandHud(g, s, shot, dt); return; }
    }
    if (!s.menu && BELLY_WORLD.has(s.sceneId)) {
      const ftp = this.profile?.ftp || 200;
      const shot = this.ensureBelly().frame(s, this.clock, dt, { cadence: bike?.cadence3s ?? 0, powerFtp: (bike?.power3s ?? 0) / ftp });
      if (shot) { this.diorama?.hide(); this.worldCanvas!.style.display = 'block'; if (this.overlayEl) this.overlayEl.style.display = 'block'; this.drawBellyHud(g, s, shot); return; }
    }
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

  /** Over the gut: eyelids and the heartbeat in the dark, the parts tally and the drill popup, the depth meter,
   *  the white-out at the surface, then the usual bubble, card and progress line. */
  private drawBellyHud(g: CanvasRenderingContext2D, s: SeasideSnapshot, shot: BellyShot): void {
    const { W, H } = this, L = layout(W, H, this.insets), B = bellyHud(W, H, this.insets), fx = shot.fx;
    g.clearRect(0, 0, W, H);
    this.menuRows = []; this.shopTargets = []; this.spotBoxes = [];
    if (fx.lids < 1) { // eyelids: black with an eye-shaped opening; a red heartbeat glow while they're shut
      const cx = W / 2, cy = L.UH * 0.45, ry = Math.max(0.5, fx.lids * L.UH * 0.8), rx = W * 0.8;
      g.save(); g.beginPath(); g.rect(0, 0, W, H); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fillStyle = '#000'; g.fill('evenodd');
      if (fx.lids < 0.98) { g.lineWidth = Math.max(8, L.UH * 0.06); g.strokeStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.stroke(); }
      g.restore();
      const glow = fx.heart * (1 - fx.lids) * 0.5;
      if (glow > 0.01) { const r = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, L.UH) * 0.5); r.addColorStop(0, `rgba(120,10,30,${glow})`); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, W, L.UH); }
    }
    const font = (px: number, style = '') => `${style}${Math.round(px)}px Georgia, serif`;
    if (s.parts) { // three scratched icons: what's in hand
      const T = B.tally, w = T.w / PARTS.length;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(T.h * 0.42);
      s.parts.items.forEach((it, i) => {
        const x = T.x + w * i, on = it.got, near = s.parts!.reach === it.id;
        g.fillStyle = on ? 'rgba(255,246,216,.92)' : near ? 'rgba(159,248,255,.85)' : 'rgba(20,6,18,.55)';
        g.beginPath(); g.roundRect(x + 4, T.y, w - 8, T.h, 8); g.fill();
        g.fillStyle = on ? '#2b1a12' : '#f7e7f0';
        g.fillText(`${on ? '✓ ' : ''}${it.name.replace('the ', '')}`, x + w / 2, T.y + T.h / 2, w - 16);
      });
      const since = s.parts.allAt === null ? -1 : (s.scene.progress - s.parts.allAt) * PARTS_PLAN_S;
      if (since >= 2.5 && since < 9) this.popup(g, B.popup, 'Drill. Keep it turning.', Math.min(1, (since - 2.5) / 0.5, (9 - since) / 0.8));
    }
    const d = fx.drill;
    if (d && fx.since === null) this.drawDrillMeter(g, B.meter, d, BELLY_LAYERS, d.phase === 'rest' ? 'clear the chips' : d.phase === 'crack' ? 'cracking…' : BELLY_LAYERS[d.layer].name, 'rgba(20,6,18,.55)');
    if (fx.white > 0) { g.fillStyle = `rgba(250,253,255,${fx.white})`; g.fillRect(0, 0, W, H); }
    const p = L.plate;
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(p.x, p.y + p.h - 3, p.w, 3);
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(p.x, p.y + p.h - 3, p.w * s.scene.progress, 3);
    this.drawBubbleAndCard(g, s, L);
  }

  /** A scratched depth meter: a band per layer, ticks every 25 cm, the bit's mark at the bored depth, a label. */
  private drawDrillMeter(g: CanvasRenderingContext2D, M: Box, d: DrillView, layers: readonly DrillLayer[], label: string, bg: string): void {
    const k = (m: number) => M.y + (m / d.total) * M.h;
    g.fillStyle = bg; g.beginPath(); g.roundRect(M.x - 6, M.y - 6, M.w + 12, M.h + 12, 8); g.fill();
    let acc = 0;
    for (const l of layers) {
      g.fillStyle = `#${l.color.toString(16).padStart(6, '0')}`; g.globalAlpha = 0.85;
      g.fillRect(M.x + M.w * 0.35, k(acc), M.w * 0.3, k(acc + l.m) - k(acc)); acc += l.m;
    }
    g.globalAlpha = 1; g.strokeStyle = 'rgba(255,240,230,.8)'; g.lineWidth = 1.5;
    for (let m = 0; m <= d.total + 1e-6; m += 0.25) { const y = k(m), long = Math.abs(m - Math.round(m)) < 1e-6; g.beginPath(); g.moveTo(M.x + (long ? 0 : M.w * 0.12), y + (m * 7 % 2 - 1)); g.lineTo(M.x + M.w * 0.32, y - (m * 5 % 2 - 1)); g.stroke(); }
    const y = k(d.depth);
    g.fillStyle = '#fff6d8'; g.beginPath(); g.moveTo(M.x + M.w * 0.66, y); g.lineTo(M.x + M.w, y - 7); g.lineTo(M.x + M.w, y + 7); g.closePath(); g.fill();
    g.textAlign = 'left'; g.textBaseline = 'top'; g.fillStyle = '#fff6d8'; g.font = `italic ${Math.round(Math.max(12, M.w * 0.28))}px Georgia, serif`;
    g.fillText(label, M.x, M.y + M.h + 10);
  }

  /** Over the island: fishing prompts on the beach, the white of the surface fading, the fire's warmth once the
   *  fish is cooking, then the usual bubble, card and progress line. */
  private drawIslandHud(g: CanvasRenderingContext2D, s: SeasideSnapshot, shot: IslandShot, dt: number): void {
    const { W, H } = this, L = layout(W, H, this.insets, 0, s.fishing?.spots.length ?? 3);
    g.clearRect(0, 0, W, H);
    this.menuRows = []; this.shopTargets = [];
    this.spotBoxes = s.fishing?.phase === 'spot' ? L.fish.spots : [];
    if (s.fishing) drawFishing(g, s.fishing, L.fish, L.stage, s.sceneT, true);
    // the screen warms once something is cooking (the beach's first catch), and stays warm a while after
    if (s.sceneId === 'beach' && s.fishing?.caught.length && this.cooked === null) this.cooked = 0;
    if (this.cooked !== null) {
      this.cooked += dt;
      const k = Math.min(1, this.cooked / 6) * (s.sceneId === 'beach' ? 1 : Math.max(0, 1 - s.scene.progress * 3));
      if (k > 0) {
        const r = g.createRadialGradient(W / 2, L.UH * 0.6, 0, W / 2, L.UH * 0.6, Math.max(W, L.UH) * 0.75);
        r.addColorStop(0, `rgba(255,170,90,${0.1 * k})`); r.addColorStop(1, `rgba(255,120,40,${0.24 * k})`);
        g.fillStyle = r; g.fillRect(0, 0, W, H);
      }
      if (s.sceneId !== 'beach' && s.scene.progress > 0.4) this.cooked = null;
    }
    if (shot.fx.white > 0) { g.fillStyle = `rgba(250,253,255,${shot.fx.white})`; g.fillRect(0, 0, W, H); }
    const p = L.plate;
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(p.x, p.y + p.h - 3, p.w, 3);
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(p.x, p.y + p.h - 3, p.w * s.scene.progress, 3);
    this.drawBubbleAndCard(g, s, L);
  }

  /** Over the cavern: fishing prompts at the magma, the fan's glow gauge (the eel's heat, creeping back out of the
   *  band), then the usual bubble, card and progress line. */
  private drawCavernHud(g: CanvasRenderingContext2D, s: SeasideSnapshot, shot: CavernShot): void {
    const { W, H } = this, L = layout(W, H, this.insets, 0, s.fishing?.spots.length ?? 3);
    g.clearRect(0, 0, W, H);
    this.menuRows = []; this.shopTargets = [];
    this.spotBoxes = s.fishing?.phase === 'spot' ? L.fish.spots : [];
    if (s.fishing) drawFishing(g, s.fishing, L.fish, L.stage, s.sceneT, true);
    const gd = shot.fx.gate?.drill;
    if (gd) this.drawDrillMeter(g, bellyHud(W, H, this.insets).meter, gd, GATE_LAYERS, shot.fx.gate!.crack > 0.08 ? 'cracking…' : gd.phase === 'start' ? 'Keep it turning' : GATE_LAYERS[gd.layer].name, 'rgba(20,8,6,.6)');
    const fan = shot.fx.fan;
    if (fan && fan.eat < 1) { // a scratched gauge down the left: how hot the eel still is
      const M = bellyHud(W, H, this.insets).meter, al = Math.max(0, 1 - fan.eat * 3), k = fan.glow;
      g.globalAlpha = al;
      g.fillStyle = 'rgba(20,8,6,.6)'; g.beginPath(); g.roundRect(M.x - 6, M.y - 6, M.w + 12, M.h + 12, 8); g.fill();
      const hot = `rgb(${Math.round(110 + 145 * k)},${Math.round(120 - 10 * k + 30 * k * k)},${Math.round(100 - 90 * k)})`;
      g.fillStyle = hot; g.fillRect(M.x + M.w * 0.3, M.y + M.h * (1 - k), M.w * 0.4, M.h * k);
      if (fan.heat > 0.005) { g.fillStyle = 'rgba(255,200,120,.9)'; g.fillRect(M.x + M.w * 0.3, M.y + M.h * (1 - k), M.w * 0.4, Math.max(2, M.h * fan.heat)); }
      g.strokeStyle = 'rgba(255,240,230,.8)'; g.lineWidth = 1.5; g.strokeRect(M.x + M.w * 0.3, M.y, M.w * 0.4, M.h);
      g.textAlign = 'left'; g.textBaseline = 'top'; g.fillStyle = '#fff2e0'; g.font = `italic ${Math.round(Math.max(12, M.w * 0.28))}px Georgia, serif`;
      g.fillText(fan.eat > 0 ? 'done' : fan.inBand ? 'cooling' : 'heating up', M.x, M.y + M.h + 10);
      g.globalAlpha = 1;
    }
    const p = L.plate;
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(p.x, p.y + p.h - 3, p.w, 3);
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(p.x, p.y + p.h - 3, p.w * s.scene.progress, 3);
    this.drawBubbleAndCard(g, s, L);
  }

  /** Over re-entry and the wings: the white of the cloud deck, a soft chevron toward the ribbon when you've
   *  drifted off it, then the usual bubble, card and progress line. */
  private drawFlightHud(g: CanvasRenderingContext2D, s: SeasideSnapshot, shot: FlightShot): void {
    const { W, H } = this, L = layout(W, H, this.insets), w = shot.fx.wings;
    g.clearRect(0, 0, W, H);
    this.menuRows = []; this.shopTargets = []; this.spotBoxes = [];
    if (shot.fx.white > 0) { g.fillStyle = `rgba(252,250,246,${shot.fx.white})`; g.fillRect(0, 0, W, H); }
    if (w && !w.inRibbon && w.align < 0.5) {
      const side = Math.sign(w.ribbon - w.x) || 1, x = side > 0 ? W - 34 : 34, y = L.UH * 0.5, k = Math.min(18, L.UH * 0.04);
      g.globalAlpha = 0.55 + 0.25 * Math.sin(s.sceneT * 5); g.strokeStyle = '#fff4dc'; g.lineWidth = 4; g.lineCap = 'round';
      for (const d of [0, 14]) { g.beginPath(); g.moveTo(x - side * (k + d), y - k); g.lineTo(x - side * d, y); g.lineTo(x - side * (k + d), y + k); g.stroke(); }
      g.globalAlpha = 1;
    }
    const p = L.plate;
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(p.x, p.y + p.h - 3, p.w, 3);
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(p.x, p.y + p.h - 3, p.w * s.scene.progress, 3);
    this.drawBubbleAndCard(g, s, L);
  }

  /** Over the ending: the credits rolling in the space above the HUD (soft shadow, no panel), the white cut to the
   *  morning, then the usual bubble, card and progress line. */
  private drawEndingHud(g: CanvasRenderingContext2D, s: SeasideSnapshot, shot: EndingShot): void {
    const { W, H } = this, L = layout(W, H, this.insets), fx = shot.fx;
    g.clearRect(0, 0, W, H);
    this.menuRows = []; this.shopTargets = []; this.spotBoxes = [];
    if (fx.credits !== null) {
      const top = Math.max(0, this.insets.top), band = top + (L.UH - top) * 0.6; // the upper band: you're below it
      const lines = creditsLayout(creditLines(), band, top, fx.credits, ANGEL.creditsEndS - ANGEL.creditsS);
      g.save(); g.beginPath(); g.rect(0, 0, W, band); g.clip();
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = 'rgba(40,20,10,.55)'; g.shadowBlur = 8;
      for (const l of lines) {
        g.globalAlpha = l.alpha; g.fillStyle = l.kind === 'head' ? '#ffe7c4' : '#fffaf0';
        g.font = l.kind === 'title' ? `${Math.round(l.px)}px Georgia, serif` : l.kind === 'head' ? `600 ${Math.round(l.px)}px system-ui, sans-serif` : `italic ${Math.round(l.px)}px Georgia, serif`;
        g.fillText(l.kind === 'head' ? l.text.toUpperCase() : l.text, W / 2, l.y, W - 48);
      }
      g.restore(); g.globalAlpha = 1;
    }
    if (fx.white > 0) { g.fillStyle = `rgba(255,252,246,${fx.white})`; g.fillRect(0, 0, W, H); }
    const p = L.plate;
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(p.x, p.y + p.h - 3, p.w, 3);
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(p.x, p.y + p.h - 3, p.w * s.scene.progress, 3);
    this.drawBubbleAndCard(g, s, L);
  }

  private popup(g: CanvasRenderingContext2D, b: Box, text: string, alpha: number): void {
    g.globalAlpha = Math.max(0, alpha);
    g.fillStyle = 'rgba(255,250,240,.94)'; g.strokeStyle = '#2b2b2b'; g.lineWidth = 2;
    g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, 10); g.fill(); g.stroke();
    g.fillStyle = '#2b2b2b'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `${Math.round(b.h * 0.4)}px Georgia, serif`;
    g.fillText(text, b.x + b.w / 2, b.y + b.h / 2, b.w - 24);
    g.globalAlpha = 1;
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
    this.dropSets(); this.view?.dispose(); this.view = null;
    this.worldCanvas?.remove(); this.worldCanvas = null; this.overlayEl?.remove(); this.overlayEl = null;
    this.diorama?.dispose(); this.diorama = null; this.shopCanvas?.remove(); this.shopCanvas = null;
    this.canvas?.remove(); this.canvas = null; this.g = null;
  }
}
