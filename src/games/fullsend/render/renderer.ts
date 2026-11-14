import type { BikeState, GameRenderer, InputState, Insets, Profile, UnitSystem } from '../../../contracts';
import { formatSpeed, unitsFor } from '../../../units';
import { drawRider } from '../../../cosmetics/draw/rider';
import { riderLook } from '../../../cosmetics/unlocks';
import type { RiderLook } from '../../../cosmetics/types';
// Mockup: the warm-up's biome art, borrowed read-only (see NOTES.md).
import { BIOME_NAMES, biomeWeights, hash01, makeTerrain, type BiomeId, type Terrain } from '../../warmup/sim/terrain';
import { LOOKS, type BiomeLook, type G } from '../../warmup/render/biomes';
import { blendColors, layerAlphas, mixColor } from '../../warmup/render/blend';
import { coverage, drawSoft, drawSpans, drawVeil, horizonSwap, layerSpans, seamKind, visibleSeams, ownerAt, SEAM, softValue, type Span } from '../../warmup/render/seam';
import { drawPortalFlash, portalFlash } from '../../warmup/render/portal';
import { crossingOf, drawGantry, drawKicker, drawLaunchSmoke, drawSeaAhead, drawVent, HOPS, hopAt, KICKER } from './crossing';
import { boardCentre, drawGateway, GATEWAYS } from '../../warmup/render/gateway';
import { daylight } from '../../warmup/render/daylight';
import type { FullSendSnapshot, PieceView } from '../sim/sim';
import { MEDAL_NAMES } from '../sim/physics';
import { CHASER_REACH, PIECE_VERB } from '../sim/tour';
import { AIR_CELL, airItemAt, bumpH, DIVE, diveDip, MEGA, megaLift } from '../sim/track';
import { FullSendSound } from './sound';
import { countdown, distantSignRect, DISTANT, MonotoneCountdown, planSigns, signMessage, type SignSpec } from './signs';
import { drawCloudDeck, drawFireball, drawTrail, drawRing, drawSeaSurface, drawSplash, drawStar } from './fx';
import { layout, type FullSendLayout } from './layout';
import { fsFont, loadFonts } from './fonts';
import { HANDOFF, handoffMix, handoffRect, speedZoom } from './handoff';
import { drawMegaRamp } from './mega';
import { drawCanyonFloor, drawCave, drawChaser, drawFlood, drawHazard, drawHayOnRider, drawLoop, drawObstacle, drawRocket, drawSlipstream } from './props';

const PPM = 5.2;          // low-res px per metre: the bike sprite is ~5 m long, so the ground has to fly past to read as 80+ mph
/** `?hour=21` previews a time of day (the overworld reads the same parameter). */
const HOUR = (() => { try { const v = new URLSearchParams(globalThis.location?.search ?? '').get('hour'); return v == null ? null : Number(v); } catch { return null; } })();
const ROWS = 360;        // target low-res rows: a wide view so the rider is small, the road ahead is readable and speed shows
const VPM = PPM;          // vertical px per metre
const MID_PARALLAX = 0.5, FORE_PARALLAX = 1.6, BACK_PARALLAX = 0.05;
/** How fast a biome seam travels in each layer (the far hills see it first). Faster than the layers' own parallax so a
 *  seam placed a few hundred metres ahead still rolls in from the horizon within a recovery; a haze squall hides that. */
const SEAM_BACK = 0.3, SEAM_MID = 0.6;
const MID_SLOT = 15, FORE_SLOT = 9;
const SURFACE_M = 45; // the sea surface sits this far above the sea floor (matches the sim's default plunge)
const RAMP_M = 40, RAMP_H = 12; // the big launch ramp before a canyon lip and the landing ramp after it (its slope ≈ the sim's LANDING_RAMP_SLOPE)
const MEDAL_COLORS = ['#9aa3b5', '#d98a4a', '#d8dde8', '#ffd23b'];
type Scene = Array<[BiomeLook, number]>;

/** Side-view rocket ride. Warm-up style: low-res pixel buffer upscaled crisply, text at full resolution on top. */
export class FullSendRenderer implements GameRenderer {
  private units: UnitSystem = 'imperial';
  private canvas!: HTMLCanvasElement; private g!: G;
  private buf!: HTMLCanvasElement; private b!: G;
  /** Sky + far backdrop, split off so the distant sign can stand between it and the rest of the scene. */
  private far!: HTMLCanvasElement; private fg!: G;
  private scratch!: HTMLCanvasElement; private sg!: G;
  private dpr = 1; private px = 3; private LW = 300; private LH = 200; private cssW = 800; private cssH = 600;
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private look: RiderLook | null = null;
  private color = '#00f0ff';
  private terrain: { key: string; t: Terrain } | null = null;
  private lastX: number | null = null; private portalAt = -99; private portalTo: BiomeId = 'underwater';
  private camY = NaN; private lastNow = 0; private riderFrac = 0.28; private warp = 0; private riderY = 0;
  /** Screen shake (buffer px), and the event markers it last reacted to. */
  private trail: Array<{ x: number; y: number; t: number }> = []; private trailWarp = 0;
  private shake = 0; private seen = { land: -99, crash: -99, splash: -99, hits: 0, caught: -99, cave: -99 };
  private send: ((a: unknown) => void) | null = null;
  private menuHits: Array<{ x: number; y: number; w: number; h: number; act: () => void }> = [];
  private lastSnap: FullSendSnapshot | null = null;
  /** The gateway's name board this frame (buffer px; drawn at full resolution in the overlay). */
  private gate: { x: number; y: number; text: string; color: string; alpha: number } | null = null;
  private dusk = 0; private zoom = NaN; private cam = { x: 0, y: 0, s: 1 };
  /** Overworld hand-off: when we first drew, when the ride ended (s), and the rider's buffer position. */
  private handIn = NaN; private handOut: number | null = null; private riderBuf = { x: 0, y: 0 };
  private sound = new FullSendSound();
  /** Boards to draw this frame: spec + bottom-centre anchor in CSS px. */
  private signs: Array<{ sp: SignSpec; x: number; y: number }> = [];
  private cd = new MonotoneCountdown();
  /** The distant sign: which message it shows and where the far layer was when that message went up. */
  private signKey = ''; private signBase = 0; private farOff = 0;
  private L!: FullSendLayout;

  mount(container: HTMLElement, ctx: { profile: Readonly<Profile>; insets?: Insets; send?: (action: unknown) => void }) {
    void loadFonts();
    this.send = ctx.send ?? null;
    this.units = unitsFor(ctx.profile);
    this.color = ctx.profile.color;
    this.look = riderLook({ ...ctx.profile, level: ctx.profile.level ?? 1, achievements: ctx.profile.achievements ?? [] });
    if (ctx.insets) this.insets = ctx.insets;
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'width:100%;height:100%;display:block;background:#4fa3e8';
    container.appendChild(this.canvas);
    this.canvas.addEventListener('pointerdown', (e) => { // taps on the setup screen
      if (!this.lastSnap?.menu) return;
      const r = this.canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      for (const h of this.menuHits) if (px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) { h.act(); break; }
    });
    this.g = this.canvas.getContext('2d')!;
    this.buf = document.createElement('canvas'); this.b = this.buf.getContext('2d')!;
    this.far = document.createElement('canvas'); this.fg = this.far.getContext('2d')!;
    this.scratch = document.createElement('canvas'); this.sg = this.scratch.getContext('2d')!;
    this.resize(container.clientWidth || 800, container.clientHeight || 600);
  }
  setInsets(i: Insets) { this.insets = i; this.L = layout(this.cssW, this.cssH, i.bottom, i.top); }
  resize(w: number, h: number) {
    this.cssW = w; this.cssH = h;
    this.dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
    this.px = Math.max(2, Math.floor(this.canvas.height / ROWS));
    this.LW = Math.ceil(this.canvas.width / this.px); this.LH = Math.ceil(this.canvas.height / this.px);
    this.buf.width = this.scratch.width = this.far.width = this.LW; this.buf.height = this.scratch.height = this.far.height = this.LH;
    this.L = layout(w, h, this.insets.bottom, this.insets.top);
  }
  /** The ride is over: ease back into the overworld's framing before the shell cuts to it. */
  ending(_info: { over: boolean }): number { this.handOut = performance.now() / 1000; return HANDOFF.outS + 0.3; }
  unmount() { this.sound.dispose(); this.canvas?.remove(); }

  private terr(s: FullSendSnapshot): Terrain {
    const key = `${s.terrainSeed}:${s.maxGrade}`;
    if (this.terrain?.key !== key) this.terrain = { key, t: makeTerrain(s.terrainSeed, s.maxGrade) };
    return this.terrain.t;
  }
  private layer(scene: Scene, draw: (look: BiomeLook, g: G) => void) {
    if (scene.length === 1) { draw(scene[0][0], this.b); return; }
    const alphas = layerAlphas(scene.map(([, w]) => w));
    scene.forEach(([look], i) => {
      this.sg.clearRect(0, 0, this.LW, this.LH); draw(look, this.sg);
      this.b.globalAlpha = alphas[i]; this.b.drawImage(this.scratch, 0, 0); this.b.globalAlpha = 1;
    });
  }

  render(snapshot: unknown, bike: Readonly<BikeState>, _input: Readonly<InputState>) {
    const s = snapshot as FullSendSnapshot;
    if (!s || typeof s.x !== 'number') return;
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, now - (this.lastNow || now)); this.lastNow = now;
    const g = this.b, W = this.LW, H = this.LH, t = now;
    const k = this.dpr / this.px; // CSS px -> buffer px
    const L = this.L, UH = L.UH * k, roadY0 = Math.round(L.roadY * k);
    // In an Outrun the rider moves right so whatever is chasing fits on screen behind them.
    const wantFrac = s.piece?.kind === 'outrun' && s.phase === 'payoff' ? 0.68 // room behind for the chaser hitting the cave
      : (s.piece?.kind === 'outrun' && s.phase === 'effort') || (s.piece?.kind === 'loop' && s.phase === 'payoff') ? 0.5 : L.riderX / this.cssW;
    this.riderFrac += (wantFrac - this.riderFrac) * Math.min(1, dt * 1.5);
    const RX = Math.round(this.riderFrac * W);
    const terr = this.terr(s);
    const roadH = (x: number) => s.hill * (terr.elev(x / s.stretch) * s.stretch + s.bumpScale * bumpH(x, s.terrainSeed));
    const p = s.piece;
    const lift = (x: number) => rampLift(p, x) + megaLift(s.mega, x);
    // A loop is drawn round (PPM both ways) and is taller than the space above the road, so the camera rises to fit it.
    const loopOnScreen = p?.kind === 'loop' && (s.phase === 'effort' || s.phase === 'payoff') && RX + (p.x0 - p.len - s.camX) * PPM < W + 30;
    const inLoopNow = p?.kind === 'loop' && s.phase === 'payoff' && (s.mode === 'loop' || s.mode === 'drop');
    // approaching: lift a little so the loop's shape reads; inside it: follow the rider so they stay mid-screen
    const loopLift = inLoopNow ? Math.max(0, s.y - (roadY0 - UH * 0.5) / VPM)
      : loopOnScreen ? Math.min(Math.max(0, (2 * p!.len * PPM + 16 - roadY0) / VPM), (roadY0 - UH * 0.3) / VPM) : 0;
    // big flights (sky launches, moon shots, falling off the edge): the camera goes with you
    // into / out of the sea and to / from the Moon: a dive, a breach, a launch or a re-entry over the seam (crossing.ts)
    const cross = s.seam ? crossingOf(s.seam) : null, cdm = s.seam ? s.x - s.seam.x : 0;
    const hop = cross ? hopAt(cross, cdm) : { h: 0, slope: 0 };
    const leaping = p?.kind === 'leap' && s.phase === 'payoff' && (s.mode === 'air' || s.mode === 'fall');
    // in a leap the camera frames the pit and you together (so you see what's coming up at you); otherwise it goes with you
    const falling = s.toTier === 'sea' && s.alt < -2; // falling to the sea: hold yourself high in the frame, looking down
    const flyCam = inLoopNow ? 0 : leaping ? Math.max(0, s.y * 0.65 - 2) : falling ? s.alt + 2 - Math.min(1, -s.alt / 30) * (UH * 0.3) / VPM : s.alt > 6 ? s.alt - 6 : s.alt < -2 ? s.alt + 2 : 0;
    // the camera rides a smoothed road (±30 m average) so rollers and kickers don't bob the whole picture
    let smooth = 0; for (let i = -3; i <= 3; i++) smooth += roadH(s.camX + i * 10) / 7;
    const camTarget = (leaping ? 0 : smooth + (p?.kind === 'leap' ? lift(s.camX) : p?.kind === 'dive' ? lift(s.camX) * 0.75 : megaLift(s.mega, s.camX) * 0.8)) + loopLift + flyCam + hop.h * 0.5;
    if (s.warp !== this.warp) { this.warp = s.warp; this.camY = NaN; } // height re-based mid-fall: cut, don't pan
    this.camY = Number.isFinite(this.camY) ? this.camY + (camTarget - this.camY) * Math.min(1, dt * (falling ? 10 : 5)) : camTarget;
    const vAlt = Math.max(-150, Math.min(400, (this.camY - roadH(s.camX)) * VPM)); // the hills sink as you climb
    const sx = (x: number) => RX + (x - s.camX) * PPM;
    const sy = (h: number) => roadY0 - (h - this.camY) * VPM;
    const roadY = (x: number) => sy(roadH(x) + lift(x));

    // Biome seam: each layer splits where the seam falls in it; whole-scene values weigh biomes by how much sky they own.
    // to and from the sea and the Moon the seam is a portal: nothing beyond it shows until you ride through
    const seams = visibleSeams(s.seam ? [s.seam] : [], s.x);
    if (s.seam && seamKind(s.seam) === 'portal' && this.lastX != null && this.lastX < s.seam.x && s.x >= s.seam.x && s.x - this.lastX < 20) { this.portalAt = t; this.portalTo = s.seam.to; }
    this.lastX = s.x;
    const spansAt = (p: number) => layerSpans(s.biome, seams, (x) => RX + (x - s.camX) * PPM * p, W);
    // a gateway that went up closer than usual still has to first show up beyond the right edge, even in the far hills
    const far = s.seam ? Math.min(1, Math.max(SEAM_BACK, (W - RX + 40) / (s.seam.lead * PPM))) : SEAM_BACK;
    const skySp = spansAt(far), midSp = spansAt(Math.max(SEAM_MID, far)), roadSp = spansAt(1), foreSp = spansAt(FORE_PARALLAX);
    const soft = W * SEAM.skySoft;
    const scene: Scene = (skySp.length > 1 ? coverage(skySp, W) : biomeWeights({ cur: s.from, next: s.to, mix: s.mix }))
      .filter(([, w]) => w > 0.002).map(([id, w]) => [LOOKS[id], w]);
    /** Only between altitude layers (no seam) do whole layers still dissolve, under the cloud decks and splashes. */
    const blend = !seams.length && scene.length > 1 ? scene : null;
    const col = (f: (l: BiomeLook) => string) => blendColors(scene.map(([l, w]) => [f(l), w] as const));
    const wsum = (f: (l: BiomeLook) => number) => scene.reduce((a, [l, w]) => a + f(l) * w, 0);

    // ---- sky, sun/moon, clouds ----
    // Same clock-driven daylight as the overworld, so riding in from it (or back out) keeps the time of day.
    const now2 = new Date(), day = daylight(HOUR ?? now2.getHours() + now2.getMinutes() / 60);
    const outdoor = wsum((l) => (l.outdoor ? 1 : 0)), night = day.night * outdoor, glow = day.glow * outdoor;
    this.dusk = Math.max(night, wsum((l) => l.dusk ?? 0));
    const skyPaint = (l: BiomeLook, gg: G) => {
      const out = l.outdoor ? 1 : 0, sky = gg.createLinearGradient(0, 0, 0, UH * 0.7);
      sky.addColorStop(0, mixColor(l.sky[0], '#0a0f2a', day.night * out * 0.92));
      sky.addColorStop(1, mixColor(mixColor(l.sky[1], '#ff9a5a', day.glow * out * 0.65), '#1c2348', day.night * out * 0.85));
      gg.fillStyle = sky; gg.fillRect(0, 0, W, H);
      gg.globalAlpha = out ? 1 - day.night : 1; if (gg.globalAlpha > 0.01) l.celestial(gg, W, UH, t); gg.globalAlpha = 1;
    };
    if (skySp.length > 1) { // across a seam: each sky (with its own sun or planet) meets the next along a weather front
      drawSoft(g, this.sg, skySp, W, H, soft, (id, gg) => skyPaint(LOOKS[id], gg));
    } else {
      const sky = g.createLinearGradient(0, 0, 0, UH * 0.7);
      sky.addColorStop(0, mixColor(col((l) => l.sky[0]), '#0a0f2a', night * 0.92));
      sky.addColorStop(1, mixColor(mixColor(col((l) => l.sky[1]), '#ff9a5a', glow * 0.65), '#1c2348', night * 0.85));
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      for (const [l, w] of scene) { g.globalAlpha = w * (l.outdoor ? 1 - day.night : 1); if (g.globalAlpha > 0.01) l.celestial(g, W, UH, t); }
    }
    /** A per-biome number at screen x: across the seam's soft front, or the (altitude) blend. */
    const skyAt = (x: number, f: (l: BiomeLook) => number) => (skySp.length > 1 ? softValue(skySp, x, soft, (id) => f(LOOKS[id])) : wsum(f));
    for (let i = 0; i < 80; i++) {
      const x = hash01(i * 3 + 1) * W, stars = Math.max(skyAt(x, (l) => l.stars), day.night * skyAt(x, (l) => (l.outdoor ? 1 : 0)));
      if (stars <= 0.02) continue;
      g.globalAlpha = stars * (0.5 + 0.5 * Math.sin(t * (1 + hash01(i) * 2) + i)); g.fillStyle = '#fff';
      g.fillRect(Math.round(x), Math.round(hash01(i * 3 + 2) * UH * 0.6), 1, 1);
    }
    g.globalAlpha = night; if (night > 0.02) { g.fillStyle = '#f4f1dc'; g.beginPath(); g.arc(W * 0.8, 24, 7, 0, Math.PI * 2); g.fill(); g.fillStyle = '#0a0f2a'; g.beginPath(); g.arc(W * 0.8 + 3, 22, 6, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
    this.clouds(g, W, UH, t, s.camX, (x) => skyAt(x, (l) => (l.stars < 0.5 && l.rider !== 'scuba' ? 1 : 0)) * (1 - night * 0.92));

    // ---- backdrop and mid ground (parallax) ----
    const backY = Math.round(UH * 0.5 + vAlt * 0.25);
    // far landmarks are never cut: across a seam the old biome's sink behind the hills while the new one's rise
    if (blend) this.layer(blend, (l, gg) => l.backdrop(gg, W, backY, s.camX * PPM * BACK_PARALLAX, t));
    else for (const [id, d] of horizonSwap(skySp, W)) LOOKS[id].backdrop(g, W, Math.round(backY + d * UH * 0.45), s.camX * PPM * BACK_PARALLAX, t);
    // everything so far is the far layer; the rest (hills, trees, road, you) is drawn over the distant sign
    this.fg.clearRect(0, 0, W, H); this.fg.drawImage(this.buf, 0, 0); g.clearRect(0, 0, W, H);
    const solid = 1 - wsum((l) => (l.openSky ? 1 : 0));
    const midBase = Math.round(UH * 0.62 + vAlt * 0.45), mu = s.camX * PPM * MID_PARALLAX;
    const midY = (lx: number) => midBase + Math.sin(lx / 60) * 2 + Math.sin(lx / 23);
    const farHills = Math.max(0, 1 + vAlt / 80); // falling: the far hills rise away
    if (!blend) drawSpans(g, midSp, W, H, 3, (id, sp) => {
      if (LOOKS[id].openSky) return;
      g.globalAlpha = farHills; g.fillStyle = LOOKS[id].mid;
      for (let x = Math.max(0, Math.floor((sp.x0 - SEAM.jag - 2) / 2) * 2); x < Math.min(W, sp.x1 + SEAM.jag + 2); x += 2) { const y = Math.round(midY(x + mu - RX)); g.fillRect(x, y, 2, H - y); }
      g.globalAlpha = 1;
    });
    else {
      g.globalAlpha = solid * farHills; g.fillStyle = col((l) => l.mid);
      for (let x = 0; x < W; x += 2) { const y = Math.round(midY(x + mu - RX)); g.fillRect(x, y, 2, H - y); }
      g.globalAlpha = 1;
    }
    for (let i = 1; i < midSp.length; i++) { // a low mist bank over the mid-ground cut
      const x = midSp[i].x0;
      if (x > -20 && x < W + 20) drawVeil(g, x, midBase - 34, midBase + 26, mixColor(LOOKS[midSp[i - 1].id].haze, LOOKS[midSp[i].id].haze, 0.5), 26, 0.6 * farHills);
    }
    const k0 = Math.floor((mu - RX - 30) / MID_SLOT), k1 = Math.ceil((mu - RX + W + 30) / MID_SLOT);
    const midProps = (only: BiomeLook | null, gg: G) => {
      for (let kk = k0; kk <= k1; kk++) {
        const lx = kk * MID_SLOT + (hash01(kk * 17 + 3) - 0.5) * 8, x = Math.round(lx - mu + RX);
        (only ?? LOOKS[ownerAt(midSp, x)]).midProp(gg, hash01(kk * 31 + 5), x, Math.round(midY(lx)) + 1, t);
      }
    };
    if (!blend) midProps(null, g); else this.layer(blend, (l, gg) => midProps(l, gg)); // props are never cut

    // ---- the gap / water / loop sit behind the road surface ----
    const gapX0 = p?.kind === 'leap' ? sx(p.x0) : NaN, gapX1 = p?.kind === 'leap' ? sx(p.x0 + p.len) : NaN;
    const inGap = (x: number) => x > gapX0 && x < gapX1;
    const seaX = cross === 'dive' && cdm < 0 ? sx(s.seam!.x + KICKER.lipM) + 1 : Infinity;
    const roadside = (l: BiomeLook, w: number, spans: readonly Span[] | null) => {
      this.sg.clearRect(0, 0, W, H);
      const draw = (ll: BiomeLook) => ll.roadside?.(this.sg, W, (x) => roadY(s.camX + (x - RX) / PPM), s.camX * PPM - RX, t);
      // at a seam each group is drawn whole by the biome it is rooted in (never cut)
      if (spans) for (const id of new Set(spans.map((sp) => sp.id))) LOOKS[id].roadside?.(this.sg, W, (x) => roadY(s.camX + (x - RX) / PPM), s.camX * PPM - RX, t, (a, b) => ownerAt(spans, a) === id && ownerAt(spans, b) === id);
      else draw(l);
      if (Number.isFinite(gapX0)) this.sg.clearRect(gapX0 - 4, 0, gapX1 - gapX0 + 8, H);
      if (s.edgeX !== null) this.sg.clearRect(sx(s.edgeX), 0, W, H);
      if (seaX < W) this.sg.clearRect(seaX, 0, W, H); // open sea past the kicker
      g.globalAlpha = w; g.drawImage(this.scratch, 0, 0); g.globalAlpha = 1;
    };
    if (!blend) roadside(scene[0][0], 1, roadSp);
    else for (const [l, w] of scene) if (l.roadside) roadside(l, w, null);
    if (p?.kind === 'loop') drawLoop(g, sx(p.x0), sy(0) - p.len * PPM, p.len * PPM, p.biome, t, sy(0) + 1);

    // ---- road + ground ----
    // across a seam each side keeps its own ground and road surface; the cut sits under the gateway
    const here = LOOKS[ownerAt(roadSp, RX)];
    const groundDark = !blend ? here.groundDark : col((l) => l.groundDark);
    const ground = !blend ? here.ground : col((l) => l.ground), edge = !blend ? here.roadEdge : col((l) => l.roadEdge); // the flooded tunnel's roof
    const floorY = sy(-10);
    const roadBand = (ground: string, gDark: string, road: string, edge: string, kind: BiomeLook['roadKind'], xa: number, xb: number) => {
      for (let x = Math.max(0, Math.floor(xa)); x < Math.min(W, xb); x++) {
        const dd = s.camX + (x - RX) / PPM;
        if (inGap(x)) { drawCanyonFloor(g, x, sy(0) + 6, floorY, H, p!.biome, t, dd); continue; }
        if (s.edgeX !== null && dd > s.edgeX) continue; // off the edge of the island: nothing but sky below
        if (s.edgeX !== null && dd > s.edgeX - 12) { // the island's underside tapers away to a point
          const y0 = Math.round(roadY(dd)), d = (s.edgeX - dd) / 12;
          g.fillStyle = gDark; g.fillRect(x, y0 + 6, 1, Math.round(6 + d * 60));
          g.fillStyle = road; g.fillRect(x, y0, 1, 5);
          continue;
        }
        const y = Math.round(roadY(dd));
        g.fillStyle = ground; g.fillRect(x, y + 6, 1, H - y);
        if (hash01(Math.floor(dd * 1.2) * 7) < 0.25) { g.fillStyle = gDark; g.fillRect(x, y + 8 + Math.floor(hash01(Math.floor(dd)) * 20), 1, 1); }
        g.fillStyle = road; g.fillRect(x, y, 1, 5);
        g.fillStyle = edge; g.fillRect(x, y + 5, 1, 1);
        if (kind === 'asphalt' && Math.floor(dd / 4) % 2 === 0) { g.fillStyle = '#f0e6a0'; g.fillRect(x, y + 2, 1, 1); }
        else if (kind === 'planks' && Math.floor(dd / 1.2) % 2 === 0) { g.fillStyle = edge; g.fillRect(x, y + 1, 1, 1); }
      }
    };
    if (!blend) drawSpans(g, roadSp, W, H, 5, (id, sp) => {
      const l = LOOKS[id];
      roadBand(l.ground, l.groundDark, l.road, l.roadEdge, l.roadKind, sp.x0 - SEAM.jag - 2, sp.x1 + SEAM.jag + 2);
    });
    else roadBand(col((l) => l.ground), groundDark, col((l) => l.road), col((l) => l.roadEdge), scene[scene.length > 1 && s.mix > 0.5 ? 1 : 0][0].roadKind, 0, W);
    if (p?.kind === 'leap') { // canyon walls
      g.fillStyle = mixColor(groundDark, '#000000', 0.35);
      g.fillRect(Math.round(gapX0), Math.round(sy(0)) + 5, 3, H);
      g.fillRect(Math.round(gapX1) - 3, Math.round(sy(0)) + 5, 3, H);
    }
    // the flooded tunnel: the road dips under the ground into a dark, water-filled bore
    const diveOn = p?.kind === 'dive' && sx(p.x0) < W && sx(p.x0 + p.len) > 0;
    if (diveOn) {
      const a = Math.max(0, Math.floor(sx(p!.x0))), b = Math.min(W, Math.ceil(sx(p!.x0 + p!.len)));
      for (let x = a; x < b; x++) {
        const dd = s.camX + (x - RX) / PPM, top = roadH(dd), dip = diveDip(p!.x0, p!.len, dd);
        const floorY = Math.round(sy(top + dip)), roofY = Math.round(sy(top + dip + DIVE.roof)), surfY = Math.round(sy(top));
        if (roofY > surfY) { // the ground over the tunnel
          g.fillStyle = ground; g.fillRect(x, surfY, 1, roofY - surfY);
          g.fillStyle = edge; g.fillRect(x, surfY, 1, 2);
          if (hash01(Math.floor(dd * 1.2) * 7) < 0.3) { g.fillStyle = groundDark; g.fillRect(x, surfY + 4 + Math.floor(hash01(Math.floor(dd)) * Math.max(1, roofY - surfY - 6)), 1, 1); }
          g.fillStyle = '#3a3448'; g.fillRect(x, roofY - 2 - Math.round(hash01(x * 7) * 2), 1, 3); // rough roof
        }
        g.fillStyle = '#1a2230'; g.fillRect(x, Math.max(roofY, surfY), 1, Math.max(0, floorY - Math.max(roofY, surfY))); // the bore
      }
    }
    if (p?.kind === 'leap') for (const z of s.hazards) if (z.y > -11) drawHazard(g, p.biome, sx(z.x), sy(z.y), z.vy, t, z.hit);

    // ---- the mega ramp: a booster pad on the road, then a steel-lipped quarter-pipe ----
    if (s.mega !== null && sx(s.mega) > -40 && sx(s.mega - MEGA.len - MEGA.padFrom) < W + 40) drawMegaRamp(g, s.mega, sx, roadY, (x) => roadH(x), sy, PPM, t);

    // ---- obstacles and chasers ----
    if (p?.kind === 'smash') {
      for (let i = 0; i < p.n; i++) {
        const ox = sx(p.x0 + i * p.spacing);
        if (ox < -40 || ox > W + 40) continue;
        const hit = i < p.hitAt.length ? s.t - p.hitAt[i] : -1;
        const topple = p.toppledAt >= 0 && i >= p.hitAt.length ? s.t - p.toppledAt : -1;
        drawObstacle(g, ox, roadY(p.x0 + i * p.spacing), p.biome, i, hit, topple);
      }
    }
    const caveOn = p?.kind === 'outrun' && s.phase !== 'approach' && sx(p.x0) < W + 10 && sx(p.x0 + p.len) + 14 * PPM > -10;
    if (caveOn) drawCave(g, 'back', sx(p!.x0), sx(p!.x0 + p!.len), roadY(p!.x0), PPM, p!.biome, t, -1);
    if (p?.kind === 'outrun' && (s.phase === 'effort' || s.phase === 'payoff' || (p.crashAt > 0 && caveOn))) {
      // slammed into the bluff: creatures faceplant and stay there; boulders, snow and water burst against it (into the dust)
      const crashed = p.crashAt > 0, ca = s.t - p.crashAt, cxm = crashed ? p.x0 - CHASER_REACH[p.chaser] : s.x - p.gap;
      const bursts = p.chaser === 'boulder' || p.chaser === 'avalanche' || p.chaser === 'wave';
      if (!crashed || !bursts || ca < 0.25) drawChaser(g, p.chaser, sx(cxm), roadY(cxm), crashed ? 0 : t, crashed && !bursts ? ca : -1, s.t - p.caughtAt);
    }

    // ---- the biome gateway: the seam itself, standing over the road where the next biome begins ----
    this.gate = null;
    if (s.seam) {
      const gx = Math.round(sx(s.seam.x)), st = GATEWAYS[s.seam.to], to = s.seam.to;
      if (cross) { // the way in or out: a kicker into the sea, a vent out of it, a launch pad, a burn
        const sm = s.seam, past = cdm >= 0, H0 = HOPS[cross], ax = sx(sm.x + H0.a), ay = roadY(sm.x + H0.a);
        const since = t - this.portalAt;
        if (cross === 'dive' && !past) {
          const lip = sm.x + KICKER.lipM;
          drawSeaAhead(g, sx(lip) + 1, roadY(lip), W, H, t);
          drawKicker(g, sx(lip), roadY(lip), KICKER.lenM * PPM, KICKER.hM * VPM);
        }
        if (cross === 'surface' && !past) drawVent(g, ax, ay, 0, t);
        if (cross === 'launch' && cdm < 10) drawGantry(g, Math.round(ax - 18), Math.round(ay), t);
        if ((cross === 'launch' || cross === 'reentry') && cdm < 40) drawLaunchSmoke(g, ax, ay + 10, UH * 0.35, t, cross === 'reentry');
        if (past && (cross === 'dive' || cross === 'surface')) drawSplash(g, sx(sm.x), sy(roadH(sm.x) + hopAt(cross, 0).h), since, true, s.reducedFlash);
        if (!past && gx > -50 && gx < W + 50) {
          const lx = cross === 'dive' ? sx(sm.x + KICKER.lipM) : ax;
          this.gate = { x: lx, y: roadY(sm.x + (cross === 'dive' ? KICKER.lipM : H0.a)) - 30, text: BIOME_NAMES[sm.to], color: '#ffffff', alpha: Math.min(1, Math.max(0, (lx - RX - 12) / 14)) };
        }
      } else if (gx > -50 && gx < W + 50) {
        const gy = Math.round(roadY(s.seam.x)), [bx, by] = boardCentre();
        drawGateway(g, st, gx, gy, t);
        this.gate = { x: gx + bx, y: gy + by + 0.5, text: BIOME_NAMES[s.seam.to], color: st.text, alpha: Math.min(1, Math.max(0, (Math.abs(gx - RX) - 12) / 14)) };
      }
    }

    // ---- road signs: posts here (behind the rider), boards + text at full resolution in the overlay ----
    this.signs = [];
    for (const sp of planSigns(s, s.camX - RX / PPM - 40, s.camX + (W - RX) / PPM + 40)) {
      const px = Math.round(sx(sp.x)), py = Math.round(roadY(sp.x)), postH = sp.kind === 'gate' ? 52 : 40;
      g.fillStyle = '#3a3f4c';
      if (sp.kind === 'gate') { g.fillRect(px - 26, py - postH, 3, postH); g.fillRect(px + 23, py - postH, 3, postH); }
      else if (sp.kind === 'fork' || sp.kind === 'next') { g.fillRect(px - 16, py - postH, 2, postH); g.fillRect(px + 14, py - postH, 2, postH); }
      else g.fillRect(px - 1, py - postH, 2, postH);
      this.signs.push({ sp, x: px, y: py - postH }); // buffer px; drawSigns maps them through the camera
    }

    // ---- rings and stars up high ----
    if (s.airH) {
      const d0 = s.camX + (0 - RX) / PPM - 10, d1 = s.camX + (W - RX) / PPM + 10;
      for (let kk = Math.floor(d0 / AIR_CELL); kk <= Math.floor(d1 / AIR_CELL); kk++) {
        const it = airItemAt(kk, s.terrainSeed, s.airH[0], s.airH[1]);
        if (!it) continue;
        const caught = s.got.find((q) => q.id === it.id), age = caught ? s.t - caught.at : -1;
        if (caught && age > 0.7) continue;
        const ix = Math.round(sx(it.x)), iy = Math.round(sy(roadH(it.x) + it.h) - 6);
        if (it.kind === 'ring') drawRing(g, ix, iy, t, age); else drawStar(g, ix, iy, t, age);
      }
    }

    // ---- the rider and the rocket ----
    const look = this.look ?? riderLook({ level: 1, achievements: [], color: this.color });
    const air = s.mode === 'air' || s.mode === 'fall' || s.mode === 'rescue';
    const ry = s.y + (p?.kind === 'leap' ? (air ? RAMP_H : rampLift(p, s.x)) : p?.kind === 'dive' ? rampLift(p, s.x) : 0) + (s.mode === 'road' ? megaLift(s.mega, s.x) : 0) + hop.h;
    const inLoop = p?.kind === 'loop' && (s.mode === 'loop' || s.mode === 'drop');
    const rx = sx(s.x), ryy = inLoop ? sy(0) - s.y * PPM : sy(ry);
    this.riderY = ryy / k; // CSS px, for call-outs that follow the rider
    this.riderBuf = { x: rx, y: ryy };
    let rot = s.pitch + Math.atan(hop.slope) * 0.8;
    const shake = s.mode === 'bounce' ? Math.sin(t * 60) * 1.5 : s.mode === 'smash' ? Math.sin(t * 45) : 0;
    const crash = s.t - s.crashAt; // thrown by a bad landing: the bike flails, the rider sees stars
    if (crash >= 0 && crash < 0.9) rot += Math.sin(crash * 22) * 0.5 * (1 - crash / 0.9);
    const gearL = LOOKS[s.biome].rider;
    g.save(); g.translate(Math.round(rx + shake), Math.round(ryy)); g.rotate(-rot);
    drawRocket(g, cross && cross !== 'dive' && hop.slope > 0 ? 2.4 : rocketThrust(s), t, s.v);
    if (s.trick) { g.translate(0, -Math.sin(Math.min(1, s.trick.age / 0.9) * Math.PI) * 4); }
    drawRider(g, look, bike.crankRevs, s.x, { t, speed: Math.min(s.v, 20), gear: gearL === 'road' ? null : gearL });
    drawSlipstream(g, s.v, t);
    if (s.hay > 0.02 || s.mode === 'smash') drawHayOnRider(g, Math.max(s.hay, s.mode === 'smash' ? 0.3 : 0), t);
    if (crash >= 0 && crash < 1.6) { // dizzy stars round the helmet
      for (let i = 0; i < 3; i++) { const a = t * 6 + (i * Math.PI * 2) / 3; g.fillStyle = i % 2 ? '#ffd23b' : '#ffffff'; g.fillRect(Math.round(Math.cos(a) * 7) - 1, Math.round(-30 + Math.sin(a) * 2.5), 2, 2); }
    }
    g.restore();
    if (diveOn) drawFlood(g, Math.max(-10, sx(p!.x0)), Math.min(W + 10, sx(p!.x0 + p!.len)), (x) => { const dd = s.camX + (x - RX) / PPM, top = roadH(dd), dip = diveDip(p!.x0, p!.len, dd); return [sy(top + dip) + 5, sy(top + Math.min(DIVE.water, dip + DIVE.roof)), dip + DIVE.roof > DIVE.water]; }, t);
    if (caveOn) drawCave(g, 'front', sx(p!.x0), sx(p!.x0 + p!.len), roadY(p!.x0), PPM, p!.biome, t, p!.crashAt > 0 ? s.t - p!.crashAt : -1);
    // ---- transitions: re-entry, cloud decks, the sea surface, splashes ----
    if (cross === 'reentry' && cdm >= 0 && hop.slope < 0) drawFireball(g, rx, ryy, Math.atan2(-hop.slope * 3, 1), Math.min(1, hop.h / 8), t);
    // re-entry: a long smoke-and-fire trail behind you (world points, so it streams away as you fall)
    const burning = s.fromTier === 'moon' && s.toTier === 'sea';
    if (!burning || s.warp !== this.trailWarp) this.trail.length = 0;
    this.trailWarp = s.warp;
    if (burning) {
      const last = this.trail[this.trail.length - 1];
      if (!last || last.t !== s.t) this.trail.push({ x: s.x, y: s.y, t: s.t });
      while (this.trail.length && s.t - this.trail[0].t > 3) this.trail.shift();
      drawTrail(g, this.trail.map((q) => ({ x: sx(q.x), y: sy(q.y) - 6, age: s.t - q.t })), Math.min(1, Math.max(0, (-s.vy - 8) / 25)));
    }
    if (s.fromTier === 'moon' && s.toTier === 'sea' && s.vy < -12) {
      drawFireball(g, rx, ryy, Math.atan2(-s.vy, s.v), Math.min(1, (-s.vy - 12) / 30), t);
    }
    const deckScroll = s.camX * PPM * 0.9;
    const deckAt = s.toTier === 'sky' ? 28 : s.toTier === 'moon' ? 38 : s.toTier === 'sea' ? (s.fromTier === 'moon' ? -90 : -24) : NaN;
    if (Number.isFinite(deckAt)) drawCloudDeck(g, W, sy(roadH(s.camX) + deckAt), deckScroll, t, 0.9, s.toTier === 'moon' ? '#eef0ff' : '#ffffff');
    const underSea = (s.tier === 'sea' && !s.toTier) || (s.fromTier === 'sea' && s.toTier === 'ground');
    if (underSea) drawSeaSurface(g, W, sy(roadH(s.camX) + SURFACE_M), s.camX * PPM, t);
    drawSplash(g, rx, sy(roadH(s.x) + SURFACE_M), s.t - s.splashAt, s.fromTier !== 'sea', s.reducedFlash);

    // dust kicked up by a hop landing
    const la = s.t - s.landAt;
    if (la >= 0 && la < 0.6 && s.landImpact > 1.5 && !inLoop) {
      const k = la / 0.6, n = Math.min(10, Math.round(s.landImpact));
      g.globalAlpha = 0.7 * (1 - k); g.fillStyle = groundDark;
      for (let i = 0; i < n; i++) {
        const dx = (hash01(i * 3 + 1) - 0.7) * 30 * k - k * 14, dy = -hash01(i * 3 + 2) * 8 * Math.sin(k * Math.PI);
        g.fillRect(Math.round(rx + dx), Math.round(roadY(s.x) + dy), 2, 2);
      }
      g.globalAlpha = 1;
    }

    // ---- foreground and speed lines ----
    const fu = s.camX * PPM * FORE_PARALLAX;
    const f0 = Math.floor((fu - RX - 10) / FORE_SLOT), f1 = Math.ceil((fu - RX + W + 10) / FORE_SLOT);
    const foreProps = (only: BiomeLook | null, gg: G) => {
      for (let kk = f0; kk <= f1; kk++) {
        const x = kk * FORE_SLOT - fu + RX;
        if (inGap(x) || x > seaX - 4 || (s.edgeX !== null && s.camX + (x - RX) / PPM > s.edgeX - 12)) continue;
        (only ?? LOOKS[ownerAt(foreSp, x)]).foreProp(gg, hash01(kk * 13 + 9), Math.round(x), Math.round(roadY(s.camX + (x - RX) / PPM) + 10 + hash01(kk * 5) * 12));
      }
    };
    if (!blend) foreProps(null, g); else this.layer(blend, (l, gg) => foreProps(l, gg));
    // riding through a portal: the scene has already swapped behind this flash
    drawPortalFlash(g, W, H, rx, ryy - 10, portalFlash(t - this.portalAt) * (s.reducedFlash ? 0.3 : cross === 'dive' || cross === 'surface' || this.portalTo === 'underwater' ? 0.35 : 0.7), this.portalTo);
    const lines = Math.max(0, Math.min(1, (s.v - 20) / 50));
    if (lines > 0) {
      g.globalAlpha = 0.35 * lines; g.fillStyle = '#ffffff';
      for (let i = 0; i < 14; i++) {
        const y = hash01(i * 5 + 1) * UH, len = 10 + hash01(i * 5 + 2) * 30;
        const x = W - (((t * (300 + hash01(i) * 300)) + hash01(i * 5 + 3) * W) % (W + len));
        g.fillRect(Math.round(x), Math.round(y), Math.round(len), 1);
      }
      g.globalAlpha = 1;
    }

    // screen shake on big moments (never with fewer flashes on)
    const sn = this.seen, hits = s.piece?.hitAt.length ?? 0;
    if (s.landAt !== sn.land) { if (s.landImpact > 12) this.shake = Math.max(this.shake, 2 + s.landImpact * 0.08); sn.land = s.landAt; }
    if (s.crashAt !== sn.crash) { this.shake = Math.max(this.shake, 5); sn.crash = s.crashAt; }
    if (s.splashAt !== sn.splash) { this.shake = Math.max(this.shake, 6); sn.splash = s.splashAt; }
    if (hits > sn.hits) this.shake = Math.max(this.shake, 2.5);
    sn.hits = hits;
    if (s.piece && s.piece.crashAt !== sn.cave) { if (s.piece.crashAt > 0) this.shake = Math.max(this.shake, 9); sn.cave = s.piece.crashAt; }
    if (s.piece && s.piece.caughtAt !== sn.caught) { if (s.piece.caughtAt > 0) this.shake = Math.max(this.shake, 5); sn.caught = s.piece.caughtAt; }
    if (s.jet === 'on') this.shake = Math.max(this.shake, 0.8);
    this.shake *= Math.exp(-dt * 7);
    const sh = s.reducedFlash ? 0 : this.shake;
    const dx = Math.round(Math.sin(t * 91) * sh) * this.px, dy = Math.round(Math.cos(t * 77) * sh) * this.px;

    if (Math.abs(s.wind) > 0.05) { // wind: leaves / dust blowing past (fast toward you in a headwind, drifting along in a tailwind)
      g.globalAlpha = Math.min(0.8, Math.abs(s.wind)); g.fillStyle = s.wind < 0 ? '#e8e2c8' : '#c8f0d8';
      for (let i = 0; i < 24; i++) {
        const sp = (s.wind < 0 ? 420 : 90) + hash01(i * 3) * 120, y = UH * 0.25 + hash01(i * 7) * UH * 0.6;
        const x = W - (((t * sp) + hash01(i * 11) * W) % W);
        g.fillRect(Math.round(x), Math.round(y + Math.sin(t * 4 + i) * 3), s.wind < 0 ? 5 : 2, 1);
      }
      g.globalAlpha = 1;
    }

    if (s.leapSlow < 0.95) { // bullet time: the edges darken and cool
      const bt = (1 - s.leapSlow) / 0.7;
      g.globalAlpha = 0.35 * bt; g.fillStyle = '#0a1438';
      for (let i = 0; i < 10; i++) { const e = 10 - i; g.globalAlpha = 0.025 * bt * e / 2; g.fillRect(0, 0, W, i * 3); g.fillRect(0, H - i * 3, W, i * 3); g.fillRect(0, 0, i * 4, H); g.fillRect(W - i * 4, 0, i * 4, H); }
      g.globalAlpha = 1;
    }
    if (this.dusk > 0.01) { g.globalAlpha = this.dusk * 0.42; g.fillStyle = '#0a1030'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
    const m = this.g;
    m.imageSmoothingEnabled = false;
    if (!Number.isFinite(this.handIn)) this.handIn = now;
    const hand = handoffMix(s.fromLobby, now - this.handIn, this.handOut == null ? null : now - this.handOut);
    // speed zoom: closer when slow, out to the full buffer flat out (eased, so a landing or a crash doesn't snap it)
    const zt = s.menu ? speedZoom(0) : speedZoom(s.v);
    this.zoom = Number.isFinite(this.zoom) ? this.zoom + (zt - this.zoom) * Math.min(1, dt * 0.8) : zt;
    const r = handoffRect(hand, { canvasW: this.canvas.width, canvasH: this.canvas.height, px: this.px, bufW: W, bufH: H, rider: this.riderBuf, uh: UH * this.px, zoom: this.zoom });
    if (dx || dy) { m.fillStyle = '#000'; m.fillRect(0, 0, this.canvas.width, this.canvas.height); }
    this.cam = { x: Math.round(r.x + dx), y: Math.round(r.y + dy), s: r.w / W };
    this.farOff = s.camX * (PPM / k) * DISTANT.parallax;
    m.drawImage(this.far, this.cam.x, this.cam.y, Math.round(r.w), Math.round(r.h));
    if (hand < 0.35 && !s.menu) { // the distant sign stands behind the hills and trees
      m.globalAlpha = 1 - hand / 0.35;
      const c0 = countdown(s), c = c0 ? { ...c0, m: this.cd.value(`${s.setIndex}:${c0.phase}`, c0.m) } : null;
      this.drawDistant(s, signMessage(s, c?.m ?? null));
      m.globalAlpha = 1;
    }
    m.drawImage(this.buf, this.cam.x, this.cam.y, Math.round(r.w), Math.round(r.h));
    this.lastSnap = s;
    this.sound.update(s, dt > 0);
    if (hand < 0.35) { m.globalAlpha = 1 - hand / 0.35; this.overlay(s); m.globalAlpha = 1; } // HUD + signs fade with the hand-off
  }

  /** Clouds: each as solid as the sky it drifts through (`alphaAt(x)`), so they stay on their side of a weather front. */
  private clouds(g: G, W: number, UH: number, t: number, x: number, alphaAt: (x: number) => number) {
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) {
      const span = W + 80, sp = 2 + hash01(i * 9) * 4;
      const cx = ((hash01(i * 7) * span - t * sp - x * PPM * 0.03 * (1 + i * 0.2)) % span + span) % span - 40;
      const a = alphaAt(cx + 12);
      if (a < 0.02) continue;
      g.globalAlpha = a * 0.9;
      const y = 10 + hash01(i * 11) * UH * 0.3, w = 14 + hash01(i * 13) * 18;
      g.fillRect(Math.round(cx), Math.round(y), Math.round(w), 4); g.fillRect(Math.round(cx + 4), Math.round(y - 3), Math.round(w * 0.5), 3);
    }
    g.globalAlpha = 1;
  }

  /** Banner, sprint meter, speed, medal stamp: full resolution, all inside the usable height. */
  private overlay(s: FullSendSnapshot) {
    const m = this.g, d = this.dpr, L = this.L;
    const font = (w: number, size: number, it = false) => fsFont(w, size * d, it);
    const panel = (b: { x: number; y: number; w: number; h: number }, a = 0.72) => { m.fillStyle = `rgba(5,4,13,${a})`; round(m, b.x * d, b.y * d, b.w * d, b.h * d, 10 * d); m.fill(); };
    m.textBaseline = 'middle';
    if (s.menu) { this.drawMenu(s.menu, font, panel); return; }
    this.menuHits = [];
    this.drawSigns();
    if (this.gate && this.gate.alpha > 0) { // the gateway's name board, at full resolution
      const gt = this.gate, gx = (this.cam.x + gt.x * this.cam.s) / d, gy = (this.cam.y + gt.y * this.cam.s) / d;
      m.globalAlpha = gt.alpha; m.textAlign = 'center'; m.fillStyle = gt.color; m.font = font(800, Math.max(8, 4.4 * this.cam.s / d));
      m.fillText(gt.text, gx * d, gy * d); m.globalAlpha = 1;
    }
    const c0 = countdown(s), c = c0 ? { ...c0, m: this.cd.value(`${s.setIndex}:${c0.phase}`, c0.m) } : null;
    const txt = (t: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', weight = 900, italic = true, outline = 4) => {
      m.textAlign = align; m.font = font(weight, size, italic);
      if (outline) { m.lineWidth = outline * d; m.strokeStyle = 'rgba(8,8,20,0.9)'; m.lineJoin = 'round'; m.strokeText(t, x * d, y * d); }
      m.fillStyle = color; m.fillText(t, x * d, y * d);
    };
    const slant = (x: number, y: number, w: number, h: number, sk: number) => { // a racing plate: a parallelogram
      m.beginPath(); m.moveTo((x + sk) * d, y * d); m.lineTo((x + w) * d, y * d); m.lineTo((x + w - sk) * d, (y + h) * d); m.lineTo(x * d, (y + h) * d); m.closePath();
    };
    if (s.tip) { // first-ride tip: a yellow caution plate with hazard stripes, above the shell HUD
      const T = L.tip, a = Math.max(0, Math.min(1, s.tip.age * 3, (7 - s.tip.age) * 2));
      m.globalAlpha = a;
      slant(T.x, T.y, T.w, T.h, 14); m.fillStyle = '#ffd23b'; m.fill(); m.lineWidth = 3 * d; m.strokeStyle = '#1a1a1a'; m.stroke();
      m.save(); slant(T.x, T.y, 46, T.h, 14); m.clip();
      for (let i = -2; i < 8; i++) { m.fillStyle = i % 2 ? '#1a1a1a' : '#ffd23b'; m.beginPath(); m.moveTo((T.x + i * 10) * d, (T.y + T.h) * d); m.lineTo((T.x + i * 10 + 10) * d, (T.y + T.h) * d); m.lineTo((T.x + i * 10 + 24) * d, T.y * d); m.lineTo((T.x + i * 10 + 14) * d, T.y * d); m.fill(); }
      m.restore();
      m.textAlign = 'left'; m.fillStyle = '#1a1a1a'; m.font = font(800, 14);
      wrap(m, s.tip.text, (T.x + 56) * d, (T.y + T.h / 2) * d, (T.w - 76) * d, 17 * d);
      m.globalAlpha = 1;
    }

    // speed plate (top-left): slanted, big italic numerals, accent stripe in the layer's colour
    const lm = liftMeter(s), S = L.speed;
    slant(S.x, S.y, S.w, S.h, 14);
    const gr = m.createLinearGradient(0, S.y * d, 0, (S.y + S.h) * d); gr.addColorStop(0, 'rgba(20,18,40,0.88)'); gr.addColorStop(1, 'rgba(8,6,20,0.88)');
    m.fillStyle = gr; m.fill();
    slant(S.x, S.y, 22, S.h, 14); m.fillStyle = lm.color; m.fill();
    const spd = formatSpeed(s.v * 3.6, this.units).replace(/\.\d/, '');
    txt(spd, S.x + 26, S.y + 22, 28, '#ffffff', 'left', 900, true, 0);
    const windTxt = s.wind < -0.2 ? ' · HEADWIND' : s.wind > 0.2 ? ' · TAILWIND' : '';
    txt(`${s.grade > 0 ? '▲' : s.grade < 0 ? '▼' : '■'} ${Math.abs(s.grade).toFixed(1)}% TRAINER${windTxt}`, S.x + 24, S.y + 44, 11, '#bdb8e8', 'left', 800, false, 0);
    // lift as chevrons
    txt(lm.label, S.x + 20, S.y + 62, 10, lm.color, 'left', 900, false, 0);
    const cx0 = S.x + 22 + m.measureText(lm.label).width / d + 8, n = 10, cw = Math.max(4, (S.x + S.w - 18 - cx0) / n);
    for (let i = 0; i < n; i++) {
      const on = s.lift * n > i + 0.5;
      m.fillStyle = on ? lm.color : 'rgba(255,255,255,0.15)';
      m.beginPath(); const xx = cx0 + i * cw;
      m.moveTo(xx * d, (S.y + 57) * d); m.lineTo((xx + cw * 0.6) * d, (S.y + 57) * d); m.lineTo((xx + cw * 0.9) * d, (S.y + 62) * d);
      m.lineTo((xx + cw * 0.6) * d, (S.y + 67) * d); m.lineTo(xx * d, (S.y + 67) * d); m.lineTo((xx + cw * 0.3) * d, (S.y + 62) * d); m.closePath(); m.fill();
    }
    if (s.flow > 0.005) txt(`FLOW +${Math.round(s.flow * 100)}%`, S.x + 14, S.y + S.h + 14, 14, '#7af0ff', 'left', 900, true, 0);

    // tour progress (top-right): medal coins, no box
    const st = L.status, rx0 = st.x + st.w - 6;
    txt(`${s.tourName.toUpperCase()} · ${s.results.length}/${s.setCount}`, rx0, st.y + 14, 14, '#ffffff', 'right', 900, true, 4);
    let mx = rx0 - 9;
    for (let i = s.setCount - 1; i >= 0; i--) {
      const r = s.results[i], cy = st.y + 38;
      m.beginPath(); m.arc(mx * d, cy * d, 8 * d, 0, Math.PI * 2); m.fillStyle = 'rgba(8,8,20,0.85)'; m.fill();
      m.beginPath(); m.arc(mx * d, cy * d, 6 * d, 0, Math.PI * 2); m.fillStyle = r ? MEDAL_COLORS[r.medal] : 'rgba(255,255,255,0.18)'; m.fill();
      if (r && r.medal) { m.fillStyle = 'rgba(255,255,255,0.7)'; m.fillRect((mx - 3) * d, (cy - 4) * d, 2 * d, 2 * d); }
      mx -= 20;
    }

    // the big countdown (no boxes): title + distance on approach, giant 3-2-1-GO, then the sprint clock + distance
    const p = s.piece, B = L.banner, cxm = B.x + B.w / 2;
    const mmss = (sec: number) => { const v = Math.max(0, Math.ceil(sec)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };
    // (what's coming and how far is on the distant sign; up here only the sprint clock, the meter and 3-2-1-GO)
    if (s.phase === 'approach' && p && c) {
      if (c.s <= 3.2) {
        const n = c.s > 0.2 ? String(Math.ceil(c.s)) : 'GO!', k2 = s.reducedFlash ? 0 : 1 - (c.s % 1);
        txt(n, this.cssW / 2, L.UH * 0.5, 110 + 30 * k2, n === 'GO!' ? '#6dff8a' : '#ff4d6d', 'center', 900, true, 8);
      }
    } else if (s.phase === 'effort' && p && c) {
      const word = p.kind === 'dive' ? 'SWIM FOR IT!' : p.kind === 'outrun' ? 'RUN!' : 'SPRINT!';
      txt(`${word} ${p.kind === 'dive' ? '' : mmss(c.s)}`.trim(), cxm, B.y + 26, 34, '#ff4d6d');
      if (c.s < 0.6 && p.kind !== 'dive' && p.kind !== 'outrun' && !s.reducedFlash) txt('GO GO GO', this.cssW / 2, L.UH * 0.38, 60, '#ffd23b', 'center', 900, true, 6);
      this.meter(s, p);
    } else if (s.phase === 'payoff' && p?.kind === 'loop' && s.mode === 'loop') {
      txt('KEEP PEDALLING!', cxm, B.y + 26, 34, s.reducedFlash ? '#ffd23b' : (Math.sin(s.t * 10) > 0 ? '#ffd23b' : '#ffffff'));
      this.meter(s, p);
    } else if (s.phase === 'recovery' || s.phase === 'warmup') {
      txt(s.phase === 'warmup' ? `WARM-UP · ${BIOME_NAMES[s.biome as BiomeId].toUpperCase()}` : 'RECOVER', cxm, B.y + 18, 18, '#ffffff', 'center', 900, true, 4);
    } else if (s.phase === 'done') {
      txt(s.phase === 'done' ? 'TOUR COMPLETE!' : `COOL-DOWN · ${mmss(s.phaseS - s.phaseT)}`, cxm, B.y + 22, s.phase === 'done' ? 34 : 20, s.phase === 'done' ? '#ffd23b' : '#ffffff');
    }

    // medal stamp
    if (s.last && s.last.age < 3.5) {
      const a = Math.min(1, s.last.age * 4, (3.5 - s.last.age) / 0.6), S = L.stamp;
      m.globalAlpha = a; m.textAlign = 'center';
      const sc = 1 + Math.max(0, 0.25 - s.last.age) * 2;
      m.font = font(900, 54 * sc, true); m.fillStyle = '#000a';
      const label = s.last.medal ? MEDAL_NAMES[s.last.medal].toUpperCase() : s.last.detail === 'rescued' ? 'RESCUED!' : 'SO CLOSE';
      m.fillText(label, (S.x + S.w / 2) * d + 3 * d, (S.y + S.h * 0.4) * d + 3 * d);
      m.fillStyle = MEDAL_COLORS[s.last.medal]; m.fillText(label, (S.x + S.w / 2) * d, (S.y + S.h * 0.4) * d);
      m.font = font(800, 16); m.fillStyle = '#ffffff';
      m.fillText(`${s.last.title} · ${s.last.detail}`, (S.x + S.w / 2) * d, (S.y + S.h * 0.85) * d);
      m.globalAlpha = 1;
    }
    if (s.trick && s.trick.age < 1.4) {
      m.globalAlpha = Math.min(1, (1.4 - s.trick.age) * 2); m.textAlign = 'center'; m.font = font(900, 22, true); m.fillStyle = '#7af0ff';
      m.fillText(`${s.trick.name}!`, L.riderX * d, (L.roadY - 110) * d);
      m.globalAlpha = 1;
    }
    if (s.flip && s.flip.age < 1.6) { // a landed flip: big and proud, above the rider
      const fa = s.flip.age, sc = 1 + Math.max(0, 0.2 - fa) * 2;
      m.globalAlpha = Math.min(1, (1.6 - fa) * 2.5); m.textAlign = 'center'; m.font = font(900, 30 * sc, true); m.fillStyle = '#ffd23b';
      const fy = Math.min(L.roadY - 120, this.riderY - 80) - fa * 14;
      m.lineWidth = 5 * d; m.strokeStyle = 'rgba(10,12,40,0.85)'; m.lineJoin = 'round';
      m.strokeText(`${s.flip.name.toUpperCase()}!`, L.riderX * d, fy * d); m.fillText(`${s.flip.name.toUpperCase()}!`, L.riderX * d, fy * d);
      m.globalAlpha = 1;
    }
    const sca = s.t - s.scorchAt;
    if (sca >= 0 && sca < 1.2 && s.piece) {
      const word = s.piece.biome === 'volcano' ? 'SCORCHED!' : s.piece.biome === 'snow' ? 'SHARDED!' : s.piece.biome === 'desert' ? 'ROCKED!' : 'CHOMPED!';
      m.globalAlpha = Math.min(1, (1.2 - sca) * 2.5); m.textAlign = 'center'; m.font = font(900, 26, true); m.fillStyle = '#ff7a3a';
      m.lineWidth = 5 * d; m.strokeStyle = 'rgba(10,12,40,0.85)'; m.lineJoin = 'round';
      m.strokeText(word, L.riderX * d, (this.riderY - 60) * d); m.fillText(word, L.riderX * d, (this.riderY - 60) * d);
      m.globalAlpha = 1;
    }
    const fly = flightCall(s);
    if (fly) {
      m.textAlign = 'center'; m.font = font(900, s.reducedFlash ? 32 : 32 + 3 * Math.sin(s.t * 12), true); m.fillStyle = fly.color;
      m.lineWidth = 5 * d; m.strokeStyle = 'rgba(10,12,40,0.85)'; m.lineJoin = 'round';
      m.strokeText(fly.text, this.cssW / 2 * d, (L.UH * 0.3) * d); m.fillText(fly.text, this.cssW / 2 * d, (L.UH * 0.3) * d);
    }
    if (s.jet) {
      m.textAlign = 'center'; m.font = font(900, s.jet === 'on' ? 16 : 14, s.jet === 'on'); m.fillStyle = s.jet === 'on' ? '#ffb030' : '#ff7a5a';
      const txt = s.jet === 'on' ? 'JET!' : `PEDAL HARDER · JET NEEDS ${Math.round(s.jetFtp * 100)}% FTP`;
      m.lineWidth = 4 * d; m.strokeStyle = 'rgba(10,12,40,0.8)'; m.lineJoin = 'round';
      m.strokeText(txt, L.riderX * d, (this.riderY + 26) * d); m.fillText(txt, L.riderX * d, (this.riderY + 26) * d);
    }
    const la = s.t - s.landAt, call = landingCall(s.landGrade, s.flow, s.chain);
    if (call && la >= 0 && la < 1.3) {
      m.globalAlpha = Math.min(1, (1.3 - la) * 2.5); m.textAlign = 'center'; m.font = font(900, call.size, true); m.fillStyle = call.color;
      const cy = Math.min(L.roadY - 80, this.riderY - 45) - la * 18;
      m.lineWidth = 4 * d; m.strokeStyle = 'rgba(10,12,40,0.8)'; m.lineJoin = 'round';
      m.strokeText(call.text, L.riderX * d, cy * d); m.fillText(call.text, L.riderX * d, cy * d);
      m.globalAlpha = 1;
    }
  }

  /** The setup screen, as a big green highway sign on two posts: pick a tour (with your best), fewer flashes, start. Rows are tappable. */
  private drawMenu(menu: NonNullable<FullSendSnapshot['menu']>, font: (w: number, s: number, it?: boolean) => string, _panel: unknown) {
    const m = this.g, d = this.dpr, M = this.L.menu;
    this.menuHits = [];
    m.fillStyle = '#5a5f6c'; m.fillRect((M.x + 40) * d, (M.y + M.h) * d, 8 * d, (this.L.UH - M.y - M.h) * d); m.fillRect((M.x + M.w - 48) * d, (M.y + M.h) * d, 8 * d, (this.L.UH - M.y - M.h) * d);
    m.fillStyle = 'rgba(0,0,0,0.35)'; m.fillRect((M.x + 5) * d, (M.y + 5) * d, M.w * d, M.h * d);
    m.fillStyle = '#0e6b3c'; m.fillRect(M.x * d, M.y * d, M.w * d, M.h * d);
    m.lineWidth = 3 * d; m.strokeStyle = '#ffffff'; m.strokeRect((M.x + 6) * d, (M.y + 6) * d, (M.w - 12) * d, (M.h - 12) * d);
    // exit tab
    m.fillStyle = '#0e6b3c'; m.fillRect((M.x + M.w - 110) * d, (M.y - 22) * d, 96 * d, 24 * d);
    m.strokeRect((M.x + M.w - 106) * d, (M.y - 18) * d, 88 * d, 18 * d);
    m.textBaseline = 'middle'; m.textAlign = 'center'; m.fillStyle = '#ffffff'; m.font = font(800, 11);
    m.fillText('EXIT 1 ▸ RIDE', (M.x + M.w - 62) * d, (M.y - 9) * d);
    m.font = font(900, 32, true); m.fillStyle = '#ffffff';
    m.fillText('FULL SEND', (M.x + M.w / 2) * d, (M.y + 34) * d);
    const tours = menu.tours, ti = Math.max(0, tours.findIndex((q) => q.id === menu.tour)), tr = tours[ti];
    const rowH = (M.h - 70) / 3;
    const rows: Array<{ label: string; sub: string; act: () => void }> = [
      { label: `◀  ${tr.name.toUpperCase()} · ~${tr.minutes} MIN  ▶`, sub: tr.best ? `Best: ${tr.best}` : 'Not ridden yet', act: () => this.send?.({ type: 'tour', value: tours[(ti + 1) % tours.length].id }) },
      { label: `FEWER FLASHES: ${menu.reducedFlash ? 'ON' : 'OFF'}`, sub: 'No screen shake or flashing', act: () => this.send?.({ type: 'flash' }) },
      { label: 'START ▸', sub: `A to start · starts by itself in ${Math.ceil(menu.left)} s`, act: () => this.send?.({ type: 'start' }) },
    ];
    rows.forEach((r, i) => {
      const y = M.y + 60 + i * rowH, on = menu.row === i;
      const box = { x: M.x + 16, y: y + 3, w: M.w - 32, h: rowH - 6 };
      if (i) { m.fillStyle = 'rgba(255,255,255,0.35)'; m.fillRect((box.x + 10) * d, (y - 1) * d, (box.w - 20) * d, 1 * d); }
      if (on) { m.fillStyle = '#ffd23b'; m.fillRect(box.x * d, (box.y + 4) * d, 6 * d, (box.h - 8) * d); m.fillRect((box.x + box.w - 6) * d, (box.y + 4) * d, 6 * d, (box.h - 8) * d); }
      m.fillStyle = on ? '#ffd23b' : '#ffffff'; m.font = font(900, 18, true);
      m.fillText(r.label, (M.x + M.w / 2) * d, (box.y + box.h * 0.4) * d);
      m.fillStyle = '#cfe8d8'; m.font = font(600, 12);
      m.fillText(r.sub, (M.x + M.w / 2) * d, (box.y + box.h * 0.76) * d);
      this.menuHits.push({ ...box, act: r.act });
    });
  }

  /** Sprint meter: a slanted, segmented bar (live FTP fraction vs bronze / silver / gold flags), or the air / gap gauge. */
  private meter(s: FullSendSnapshot, p: PieceView) {
    const m = this.g, d = this.dpr, M = this.L.meter;
    const segs = 24, sk = 6, gap = 2, sw = (M.w - sk) / segs;
    const seg = (i: number, col: string) => {
      const x = M.x + i * sw; m.fillStyle = col; m.beginPath();
      m.moveTo((x + sk) * d, M.y * d); m.lineTo((x + sw - gap + sk) * d, M.y * d); m.lineTo((x + sw - gap) * d, (M.y + M.h * 0.7) * d); m.lineTo(x * d, (M.y + M.h * 0.7) * d); m.closePath(); m.fill();
      m.lineWidth = 1.5 * d; m.strokeStyle = 'rgba(8,8,20,0.9)'; m.stroke();
    };
    if (p.kind === 'dive') {
      for (let i = 0; i < segs; i++) seg(i, i / segs < p.air ? (p.air > 0.25 ? '#4dc3ff' : '#ff4d6d') : 'rgba(255,255,255,0.12)');
      return;
    }
    const maxF = p.th[2] * 1.15, live = p.live;
    const medal = live >= p.th[2] * 0.97 ? 3 : live >= p.th[1] * 0.97 ? 2 : live >= p.th[0] * 0.97 ? 1 : 0;
    for (let i = 0; i < segs; i++) seg(i, (i + 0.5) / segs * maxF <= live ? (medal ? MEDAL_COLORS[medal] : '#ff4d6d') : 'rgba(255,255,255,0.12)');
    for (let i = 0; i < 3; i++) { // medal flags
      const fx = M.x + (M.w - sk) * Math.min(1, p.th[i] / maxF) + sk / 2;
      m.fillStyle = MEDAL_COLORS[i + 1]; m.fillRect((fx - 1) * d, (M.y - 4) * d, 2 * d, (M.h * 0.7 + 8) * d);
      m.beginPath(); m.moveTo((fx + 1) * d, (M.y - 4) * d); m.lineTo((fx + 9) * d, (M.y - 1) * d); m.lineTo((fx + 1) * d, (M.y + 2) * d); m.fill();
    }
  }

  /** The one big sign everything is on: it stands far off (slow parallax) so it stays put long enough to read, and it is
   *  an LED board, so its numbers count live. Fades if the rider flies in front of it. */
  private drawDistant(s: FullSendSnapshot, msg: SignSpec | null) {
    if (!msg) { this.signKey = ''; return; }
    const key = `${s.phase}:${s.setIndex}:${msg.kind}`;
    if (key !== this.signKey) { this.signKey = key; this.signBase = this.farOff; }
    const r = distantSignRect(this.cssW, this.L.UH, this.farOff - this.signBase);
    if (!r) return;
    const m = this.g, d = this.dpr, sc = r.w / DISTANT.w;
    const f = (w: number, size: number, it = false) => fsFont(w, size * sc * d, it);
    const TONE: Record<string, [string, string, string]> = { green: ['#0e6b3c', '#ffffff', '#ffd23b'], yellow: ['#ffd23b', '#1a1a1a', '#b3202c'], red: ['#b3202c', '#ffffff', '#ffd23b'], blue: ['#1d4fa8', '#ffffff', '#ffd23b'] };
    const [bg, fg, hi] = TONE[msg.tone];
    // the legs run down behind the hills (they fade out low, for open-sky layers with no hills to hide them)
    const legTop = r.y + r.h, legBot = Math.max(legTop + 10, this.L.UH * 0.8);
    const lg = m.createLinearGradient(0, legTop * d, 0, legBot * d); lg.addColorStop(0, '#3a3f4c'); lg.addColorStop(1, 'rgba(58,63,76,0)');
    m.fillStyle = lg; m.fillRect((r.x + r.w * 0.2) * d, legTop * d, 5 * d, (legBot - legTop) * d); m.fillRect((r.x + r.w * 0.8 - 5) * d, legTop * d, 5 * d, (legBot - legTop) * d);
    m.fillStyle = 'rgba(0,0,0,0.35)'; m.fillRect((r.x + 5) * d, (r.y + 5) * d, r.w * d, r.h * d);
    m.fillStyle = bg; m.fillRect(r.x * d, r.y * d, r.w * d, r.h * d);
    m.lineWidth = 3 * d; m.strokeStyle = fg; m.strokeRect((r.x + 6) * d, (r.y + 6) * d, (r.w - 12) * d, (r.h - 12) * d);
    m.textAlign = 'center'; m.textBaseline = 'middle'; m.fillStyle = fg;
    const cx = r.x + r.w / 2, maxW = (r.w - 28) * d;
    if (msg.kind === 'fork' && msg.options) {
      m.font = f(900, 15); m.fillText(msg.title, cx * d, (r.y + 22 * sc) * d, maxW);
      msg.options.forEach((o, i) => {
        const ow = (r.w - 28) / 2, ox = r.x + 14 + i * ow;
        if (o.on) { m.fillStyle = hi; m.fillRect((ox + 4) * d, (r.y + 38 * sc) * d, (ow - 8) * d, 60 * sc * d); }
        m.fillStyle = o.on ? bg : fg; m.font = f(900, 17);
        m.fillText(`${i ? '' : '◀ '}${o.title}${i ? ' ▶' : ''}`, (ox + ow / 2) * d, (r.y + 58 * sc) * d, (ow - 14) * d);
        m.font = f(700, 13); m.fillText(o.biome, (ox + ow / 2) * d, (r.y + 82 * sc) * d, (ow - 14) * d);
      });
      m.fillStyle = fg; m.font = f(700, 12); m.fillText(msg.sub ?? '', cx * d, (r.y + r.h - 16 * sc) * d, maxW);
    } else {
      m.font = f(900, 20); m.fillText(msg.title, cx * d, (r.y + 26 * sc) * d, maxW);
      m.font = f(900, 50, true); m.fillText(msg.big ?? '', cx * d, (r.y + 66 * sc) * d, maxW);
      m.font = f(700, 14); m.fillText(msg.sub ?? '', cx * d, (r.y + r.h - 20 * sc) * d, maxW);
    }
  }

  /** Road-sign boards (full resolution) on the posts drawn in the buffer: highway green / caution yellow / start-gate red / blue. */
  private drawSigns() {
    const m = this.g, d = this.dpr;
    const TONE: Record<string, [string, string]> = { green: ['#0e6b3c', '#ffffff'], yellow: ['#ffd23b', '#1a1a1a'], red: ['#b3202c', '#ffffff'], blue: ['#1d4fa8', '#ffffff'] };
    const f = (w: number, size: number, it = false) => fsFont(w, size * d, it);
    const board = (x: number, y: number, w: number, h: number, tone: string) => {
      const [bg, fg] = TONE[tone];
      m.fillStyle = 'rgba(0,0,0,0.35)'; m.fillRect((x + 3) * d, (y + 3) * d, w * d, h * d);
      m.fillStyle = bg; m.fillRect(x * d, y * d, w * d, h * d);
      m.lineWidth = 2 * d; m.strokeStyle = fg; m.strokeRect((x + 4) * d, (y + 4) * d, (w - 8) * d, (h - 8) * d);
      return fg;
    };
    m.textBaseline = 'middle';
    for (const sg of this.signs) {
      const sp = sg.sp, x = (this.cam.x + sg.x * this.cam.s) / d, y = (this.cam.y + sg.y * this.cam.s) / d;
      if (sp.kind === 'count') {
        const w = 96, h = 54, fg = board(x - w / 2, y - h, w, h, sp.tone);
        m.textAlign = 'center'; m.fillStyle = fg; m.font = f(800, 10); m.fillText(sp.title, x * d, (y - h + 15) * d);
        m.font = f(900, 22, true); m.fillText(sp.big ?? '', x * d, (y - h + 35) * d);
      } else if (sp.kind === 'gate') {
        const w = 190, h = 62, fg = board(x - w / 2, y - h, w, h, sp.tone);
        m.fillStyle = '#111'; m.fillRect((x - w / 2) * d, (y - h) * d, w * d, 6 * d);
        for (let i = 0; i < 12; i++) if (i % 2) { m.fillStyle = '#fff'; m.fillRect((x - w / 2 + i * w / 12) * d, (y - h) * d, (w / 12) * d, 3 * d); m.fillRect((x - w / 2 + (i - 1) * w / 12) * d, (y - h + 3) * d, (w / 12) * d, 3 * d); }
        m.textAlign = 'center'; m.fillStyle = fg; m.font = f(900, 17, true); m.fillText(sp.title, x * d, (y - h + 22) * d);
        for (let i = 0; i < 3; i++) {
          const lit = sp.lights === 4 ? '#3dff6a' : (sp.lights ?? 0) > i ? '#ff3030' : '#3a1010';
          m.beginPath(); m.arc((x - 22 + i * 22) * d, (y - 18) * d, 7 * d, 0, Math.PI * 2); m.fillStyle = '#111'; m.fill();
          m.beginPath(); m.arc((x - 22 + i * 22) * d, (y - 18) * d, 5 * d, 0, Math.PI * 2); m.fillStyle = lit; m.fill();
        }
      } else if (sp.kind === 'next') {
        const w = 230, h = 58, fg = board(x - w / 2, y - h, w, h, sp.tone);
        m.textAlign = 'center'; m.fillStyle = fg; m.font = f(900, 15); m.fillText(sp.title, x * d, (y - h + 22) * d);
        m.font = f(700, 12); m.fillText(sp.sub ?? '', x * d, (y - h + 41) * d);
      } else if (sp.kind === 'fork' && sp.options) {
        const w = 280, h = 92, fg = board(x - w / 2, y - h, w, h, sp.tone);
        m.textAlign = 'center'; m.fillStyle = fg; m.font = f(800, 11); m.fillText(sp.title, x * d, (y - h + 15) * d);
        sp.options.forEach((o, i) => {
          const ox = x - w / 2 + 10 + i * (w - 20) / 2, ow = (w - 20) / 2, col = o.on ? '#ffd23b' : fg;
          if (o.on) { m.lineWidth = 2.5 * d; m.strokeStyle = '#ffd23b'; m.strokeRect((ox + 3) * d, (y - h + 26) * d, (ow - 6) * d, 46 * d); }
          m.fillStyle = col; m.font = f(900, 13);
          m.fillText(`${i ? '' : '◀ '}${o.title}${i ? ' ▶' : ''}`, (ox + ow / 2) * d, (y - h + 40) * d, (ow - 10) * d);
          m.font = f(600, 11); m.fillText(o.biome, (ox + ow / 2) * d, (y - h + 58) * d, (ow - 10) * d);
        });
        m.fillStyle = fg; m.font = f(600, 10); m.fillText(sp.sub ?? '', x * d, (y - 9) * d);
      }
    }
  }
}

/** Height of the kicker ramp before a canyon lip and the landing ramp after it (m). */
export function rampLift(p: PieceView | null, x: number): number {
  if (p?.kind === 'dive') return diveDip(p.x0, p.len, x);
  if (!p || p.kind !== 'leap') return 0;
  if (x > p.x0 - RAMP_M && x <= p.x0) { const k = (x - (p.x0 - RAMP_M)) / RAMP_M; return RAMP_H * k * k; }
  const far = p.x0 + p.len;
  if (x >= far && x < far + RAMP_M) { const k = 1 - (x - far) / RAMP_M; return RAMP_H * k; }
  if (x > p.x0 && x < far) return 0;
  return 0;
}

function round(m: G, x: number, y: number, w: number, h: number, r: number) {
  m.beginPath(); m.moveTo(x + r, y); m.arcTo(x + w, y, x + w, y + h, r); m.arcTo(x + w, y + h, x, y + h, r);
  m.arcTo(x, y + h, x, y, r); m.arcTo(x, y, x + w, y, r); m.closePath();
}

/** Rocket thrust for the flame (0..3): your power, scaled up by speed (a weak push when slow and easy, a roaring plume
 *  flat out); the jet and launches blast at the top. */
export function rocketThrust(s: Pick<FullSendSnapshot, 'jet' | 'ftpFrac' | 'v' | 'phase' | 'toTier' | 'vy' | 'fromTier' | 'x'> & { mega?: number | null }): number {
  if (s.jet === 'on' || (s.toTier && s.toTier !== 'sea' && s.vy > 0)) return 3;
  const mega = s.mega ?? null; // the booster pad lights the rocket all the way up the mega ramp
  if (mega !== null && s.x >= mega - MEGA.len - MEGA.padFrom && s.x <= mega + 2) return 3;
  if (s.jet === 'weak') return 0.3;
  const k = 0.35 + 0.65 * Math.min(1, Math.max(0, s.v / 55));
  return Math.min(3, Math.max(0, s.ftpFrac) * k * (s.phase === 'effort' ? 1.5 : 1));
}

/** Landing call-out text near the rider (null for an ordinary landing). */
export function landingCall(grade: FullSendSnapshot['landGrade'], flow: number, chain = 0): { text: string; color: string; size: number } | null {
  const x = chain >= 2 ? ` ×${chain}` : '';
  if (grade === 'perfect') return { text: `PERFECT${x} · FLOW +${Math.round(flow * 100)}%`, color: '#7af0ff', size: 20 };
  if (grade === 'good') return { text: `CLEAN${x}`, color: '#b6f59a', size: 17 };
  if (grade === 'bad') return { text: 'BAD LANDING', color: '#ff7a5a', size: 20 };
  return null;
}

/** Lift meter label and colour: what a full meter gets you (or, up high, how long you've got). */
export function liftMeter(s: Pick<FullSendSnapshot, 'tier' | 'lift'>): { label: string; color: string } {
  switch (s.tier) {
    case 'ground': return { label: s.lift >= 1 ? 'LAUNCH READY' : 'LIFT → SKY', color: '#9fe8ff' };
    case 'sky': return { label: s.lift >= 1 ? 'MOON SHOT READY' : 'LIFT → MOON', color: '#e6dcff' };
    case 'moon': return { label: 'MOON TIME', color: '#fff3b0' };
    case 'sea': return { label: 'SURFACING', color: '#6fe0d0' };
  }
}

/** Big banner while flying between layers. */
export function flightCall(s: Pick<FullSendSnapshot, 'tier' | 'toTier' | 'fromTier' | 'vy'>): { text: string; color: string } | null {
  if (!s.toTier) return null;
  if (s.toTier === 'sea' && s.fromTier === 'moon') return s.vy < -12 ? { text: 'RE-ENTRY!', color: '#ffb030' } : { text: 'LOST THE MOON!', color: '#ff9a6a' };
  if (s.toTier === 'sea') return { text: 'OFF THE EDGE!', color: '#ff9a6a' };
  if (s.toTier === 'sky') return { text: 'SKY LAUNCH!', color: '#9fe8ff' };
  if (s.toTier === 'moon') return { text: 'MOON SHOT!', color: '#fff3b0' };
  return { text: 'BREACH!', color: '#6fe0d0' };
}


/** Left-aligned word wrap, vertically centred on y (at most 3 lines). */
function wrap(m: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) {
  const words = text.split(' '), lines: string[] = [];
  let cur = '';
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (m.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  const ls = lines.slice(0, 3), y0 = y - ((ls.length - 1) * lineH) / 2;
  ls.forEach((l, i) => m.fillText(l, x, y0 + i * lineH));
}
