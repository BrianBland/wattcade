import type { BikeState, GameRenderer, InputState, Insets, Profile, UnitSystem } from '../../../contracts';
import { formatSpeed, unitsFor } from '../../../units';
import { drawRider } from '../../../cosmetics/draw/rider';
import { riderLook } from '../../../cosmetics/unlocks';
import type { RiderLook } from '../../../cosmetics/types';
// Mockup: the warm-up's biome art, borrowed read-only (see NOTES.md).
import { BIOME_NAMES, biomeWeights, hash01, makeTerrain, type BiomeId, type Terrain } from '../../warmup/sim/terrain';
import { LOOKS, type BiomeLook, type G } from '../../warmup/render/biomes';
import { blendColors, layerAlphas, mixColor } from '../../warmup/render/blend';
import type { FullSendSnapshot, PieceView } from '../sim/sim';
import { MEDAL_NAMES } from '../sim/physics';
import { PIECE_VERB } from '../sim/tour';
import { AIR_CELL, airItemAt, bumpH } from '../sim/track';
import { FullSendSound } from './sound';
import { drawCloudDeck, drawFireball, drawRing, drawSeaSurface, drawSplash, drawStar } from './fx';
import { layout, type FullSendLayout } from './layout';
import { drawCanyonFloor, drawChaser, drawHayOnRider, drawLoop, drawObstacle, drawRocket, drawWater } from './props';

const PPM = 5.2;          // low-res px per metre: the bike sprite is ~5 m long, so the ground has to fly past to read as 80+ mph
const ROWS = 300;        // target low-res rows: a wide view so the rider is small, the road ahead is readable and speed shows
const VPM = PPM;          // vertical px per metre
const MID_PARALLAX = 0.5, FORE_PARALLAX = 1.6, BACK_PARALLAX = 0.05;
const MID_SLOT = 15, FORE_SLOT = 9;
const SURFACE_M = 45; // the sea surface sits this far above the sea floor (matches the sim's default plunge)
const RAMP_M = 14, RAMP_H = 4; // the kicker before a canyon lip and the landing ramp after it
const MEDAL_COLORS = ['#9aa3b5', '#d98a4a', '#d8dde8', '#ffd23b'];
type Scene = Array<[BiomeLook, number]>;

/** Side-view rocket ride. Warm-up style: low-res pixel buffer upscaled crisply, text at full resolution on top. */
export class FullSendRenderer implements GameRenderer {
  private units: UnitSystem = 'imperial';
  private canvas!: HTMLCanvasElement; private g!: G;
  private buf!: HTMLCanvasElement; private b!: G;
  private scratch!: HTMLCanvasElement; private sg!: G;
  private dpr = 1; private px = 3; private LW = 300; private LH = 200; private cssW = 800; private cssH = 600;
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private look: RiderLook | null = null;
  private color = '#00f0ff';
  private terrain: { key: string; t: Terrain } | null = null;
  private camY = NaN; private lastNow = 0; private riderFrac = 0.28; private warp = 0; private riderY = 0;
  /** Screen shake (buffer px), and the event markers it last reacted to. */
  private shake = 0; private seen = { land: -99, crash: -99, splash: -99, hits: 0, caught: -99 };
  private send: ((a: unknown) => void) | null = null;
  private menuHits: Array<{ x: number; y: number; w: number; h: number; act: () => void }> = [];
  private lastSnap: FullSendSnapshot | null = null;
  private sound = new FullSendSound();
  private L!: FullSendLayout;

  mount(container: HTMLElement, ctx: { profile: Readonly<Profile>; insets?: Insets; send?: (action: unknown) => void }) {
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
    this.buf.width = this.scratch.width = this.LW; this.buf.height = this.scratch.height = this.LH;
    this.L = layout(w, h, this.insets.bottom, this.insets.top);
  }
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
    const wantFrac = s.piece?.kind === 'outrun' && (s.phase === 'effort' || s.phase === 'payoff') ? 0.5 : L.riderX / this.cssW;
    this.riderFrac += (wantFrac - this.riderFrac) * Math.min(1, dt * 1.5);
    const RX = Math.round(this.riderFrac * W);
    const terr = this.terr(s);
    const roadH = (x: number) => s.hill * (terr.elev(x / s.stretch) * s.stretch + s.bumpScale * bumpH(x, s.terrainSeed));
    const p = s.piece;
    const lift = (x: number) => rampLift(p, x);
    // A loop is drawn round (PPM both ways) and is taller than the space above the road, so the camera rises to fit it.
    const loopOnScreen = p?.kind === 'loop' && (s.phase === 'effort' || s.phase === 'payoff') && RX + (p.x0 - p.len - s.camX) * PPM < W + 30;
    const loopLift = loopOnScreen ? Math.max(0, (2 * p!.len * PPM + 16 - roadY0) / VPM) : 0;
    // big flights (sky launches, moon shots, falling off the edge): the camera goes with you
    const flyCam = s.alt > 6 ? s.alt - 6 : s.alt < -2 ? s.alt + 2 : 0;
    const camTarget = roadH(s.camX) + (p?.kind === 'leap' ? lift(s.camX) : 0) + loopLift + flyCam;
    if (s.warp !== this.warp) { this.warp = s.warp; this.camY = NaN; } // height re-based mid-fall: cut, don't pan
    this.camY = Number.isFinite(this.camY) ? this.camY + (camTarget - this.camY) * Math.min(1, dt * 5) : camTarget;
    const vAlt = Math.max(-150, Math.min(400, (this.camY - roadH(s.camX)) * VPM)); // the hills sink as you climb
    const sx = (x: number) => RX + (x - s.camX) * PPM;
    const sy = (h: number) => roadY0 - (h - this.camY) * VPM;
    const roadY = (x: number) => sy(roadH(x) + lift(x));

    const scene: Scene = biomeWeights({ cur: s.from, next: s.to, mix: s.mix }).filter(([, w]) => w > 0.002).map(([id, w]) => [LOOKS[id], w]);
    const col = (f: (l: BiomeLook) => string) => blendColors(scene.map(([l, w]) => [f(l), w] as const));
    const wsum = (f: (l: BiomeLook) => number) => scene.reduce((a, [l, w]) => a + f(l) * w, 0);

    // ---- sky, sun/moon, clouds ----
    const sky = g.createLinearGradient(0, 0, 0, UH * 0.7);
    sky.addColorStop(0, col((l) => l.sky[0])); sky.addColorStop(1, col((l) => l.sky[1]));
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const stars = wsum((l) => l.stars);
    if (stars > 0.02) for (let i = 0; i < 80; i++) {
      g.globalAlpha = stars * (0.5 + 0.5 * Math.sin(t * (1 + hash01(i) * 2) + i)); g.fillStyle = '#fff';
      g.fillRect(Math.round(hash01(i * 3 + 1) * W), Math.round(hash01(i * 3 + 2) * UH * 0.6), 1, 1);
    }
    for (const [l, w] of scene) { g.globalAlpha = w; l.celestial(g, W, UH, t); }
    g.globalAlpha = 1;
    this.clouds(g, W, UH, t, s.camX, wsum((l) => (l.stars < 0.5 && l.rider !== 'scuba' ? 1 : 0)));

    // ---- backdrop and mid ground (parallax) ----
    const backY = Math.round(UH * 0.5 + vAlt * 0.25);
    this.layer(scene, (l, gg) => l.backdrop(gg, W, backY, s.camX * PPM * BACK_PARALLAX, t));
    const solid = 1 - wsum((l) => (l.openSky ? 1 : 0));
    const midBase = Math.round(UH * 0.62 + vAlt * 0.45), mu = s.camX * PPM * MID_PARALLAX;
    const midY = (lx: number) => midBase + Math.sin(lx / 60) * 2 + Math.sin(lx / 23);
    g.globalAlpha = solid * Math.max(0, 1 + vAlt / 80); g.fillStyle = col((l) => l.mid); // falling: the far hills rise away
    for (let x = 0; x < W; x += 2) { const y = Math.round(midY(x + mu - RX)); g.fillRect(x, y, 2, H - y); }
    g.globalAlpha = 1;
    const k0 = Math.floor((mu - RX - 30) / MID_SLOT), k1 = Math.ceil((mu - RX + W + 30) / MID_SLOT);
    this.layer(scene, (l, gg) => {
      for (let kk = k0; kk <= k1; kk++) {
        const lx = kk * MID_SLOT + (hash01(kk * 17 + 3) - 0.5) * 8;
        l.midProp(gg, hash01(kk * 31 + 5), Math.round(lx - mu + RX), Math.round(midY(lx)) + 1, t);
      }
    });

    // ---- the gap / water / loop sit behind the road surface ----
    const gapX0 = p?.kind === 'leap' ? sx(p.x0) : NaN, gapX1 = p?.kind === 'leap' ? sx(p.x0 + p.len) : NaN;
    const inGap = (x: number) => x > gapX0 && x < gapX1;
    for (const [l, w] of scene) if (l.roadside) {
      this.sg.clearRect(0, 0, W, H);
      l.roadside(this.sg, W, (x) => roadY(s.camX + (x - RX) / PPM), s.camX * PPM - RX, t);
      if (Number.isFinite(gapX0)) this.sg.clearRect(gapX0 - 4, 0, gapX1 - gapX0 + 8, H);
      if (s.edgeX !== null) this.sg.clearRect(sx(s.edgeX), 0, W, H);
      g.globalAlpha = w; g.drawImage(this.scratch, 0, 0); g.globalAlpha = 1;
    }
    if (p?.kind === 'loop') drawLoop(g, sx(p.x0), sy(0) - p.len * PPM, p.len * PPM, p.biome, t, sy(0) + 1);

    // ---- road + ground ----
    const ground = col((l) => l.ground), groundDark = col((l) => l.groundDark), road = col((l) => l.road), edge = col((l) => l.roadEdge);
    const kind = scene[scene.length > 1 && s.mix > 0.5 ? 1 : 0][0].roadKind;
    const floorY = sy(-10);
    for (let x = 0; x < W; x++) {
      const dd = s.camX + (x - RX) / PPM;
      if (inGap(x)) { drawCanyonFloor(g, x, sy(0) + 6, floorY, H, p!.biome, t, dd); continue; }
      if (s.edgeX !== null && dd > s.edgeX) continue; // off the edge of the island: nothing but sky below
      if (s.edgeX !== null && dd > s.edgeX - 12) { // the island's underside tapers away to a point
        const y0 = Math.round(roadY(dd)), d = (s.edgeX - dd) / 12;
        g.fillStyle = groundDark; g.fillRect(x, y0 + 6, 1, Math.round(6 + d * 60));
        g.fillStyle = road; g.fillRect(x, y0, 1, 5);
        continue;
      }
      const y = Math.round(roadY(dd));
      g.fillStyle = ground; g.fillRect(x, y + 6, 1, H - y);
      if (hash01(Math.floor(dd * 1.2) * 7) < 0.25) { g.fillStyle = groundDark; g.fillRect(x, y + 8 + Math.floor(hash01(Math.floor(dd)) * 20), 1, 1); }
      g.fillStyle = road; g.fillRect(x, y, 1, 5);
      g.fillStyle = edge; g.fillRect(x, y + 5, 1, 1);
      if (kind === 'asphalt' && Math.floor(dd / 4) % 2 === 0) { g.fillStyle = '#f0e6a0'; g.fillRect(x, y + 2, 1, 1); }
      else if (kind === 'planks' && Math.floor(dd / 1.2) % 2 === 0) { g.fillStyle = edge; g.fillRect(x, y + 1, 1, 1); }
    }
    if (p?.kind === 'leap') { // canyon walls
      g.fillStyle = mixColor(groundDark, '#000000', 0.35);
      g.fillRect(Math.round(gapX0), Math.round(sy(0)) + 5, 3, H);
      g.fillRect(Math.round(gapX1) - 3, Math.round(sy(0)) + 5, 3, H);
    }
    if (p?.kind === 'dive') drawWater(g, sx(p.x0), sx(p.x0 + p.len), sy(0), sy(16), H, t);

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
    if (p?.kind === 'outrun' && (s.phase === 'effort' || s.phase === 'payoff')) {
      const cx = sx(s.x - p.gap);
      const caughtAge = s.t - p.caughtAt;
      drawChaser(g, p.chaser, cx, roadY(s.x - p.gap), t, s.phase === 'payoff' ? s.phaseT : -1, caughtAge);
    }

    // ---- fork signposts beside the road while you choose ----
    if (s.fork) {
      const pick = s.fork.pick;
      for (let wx = Math.ceil((s.camX - RX / PPM) / 80) * 80 + 30; sx(wx) < W + 40; wx += 80) {
        const px = Math.round(sx(wx)), py = Math.round(roadY(wx));
        drawForkSign(g, px, py, pick, LOOKS[s.fork.options[0].biome].ground, LOOKS[s.fork.options[1].biome].ground);
      }
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
    const ry = s.y + (p?.kind === 'leap' ? (air ? RAMP_H : lift(s.x)) : 0);
    const inLoop = p?.kind === 'loop' && (s.mode === 'loop' || s.mode === 'drop');
    const rx = sx(s.x), ryy = inLoop ? sy(0) - s.y * PPM : sy(ry);
    this.riderY = ryy / k; // CSS px, for call-outs that follow the rider
    let rot = s.pitch;
    if (s.trick) {
      const a = Math.min(1, s.trick.age / 0.9);
      if (s.trick.name === 'Backflip') rot += a * Math.PI * 2;
    }
    const shake = s.mode === 'bounce' ? Math.sin(t * 60) * 1.5 : s.mode === 'smash' ? Math.sin(t * 45) : 0;
    const crash = s.t - s.crashAt; // thrown by a bad landing: the bike flails, the rider sees stars
    if (crash >= 0 && crash < 0.9) rot += Math.sin(crash * 22) * 0.5 * (1 - crash / 0.9);
    const gearL = LOOKS[s.biome].rider;
    g.save(); g.translate(Math.round(rx + shake), Math.round(ryy)); g.rotate(-rot);
    const flame = s.jet === 'on' ? 2.4 : s.jet === 'weak' ? 0.25 + 0.25 * Math.abs(Math.sin(t * 17)) : s.phase === 'effort' ? Math.min(1.6, s.ftpFrac) : Math.min(0.8, s.ftpFrac);
    drawRocket(g, flame, t, s.v);
    if (s.trick && s.trick.name !== 'Backflip') { g.translate(0, -Math.sin(Math.min(1, s.trick.age / 0.9) * Math.PI) * 4); }
    drawRider(g, look, bike.crankRevs, s.x, { t, speed: Math.min(s.v, 20), gear: gearL === 'road' ? null : gearL });
    if (s.hay > 0.02 || s.mode === 'smash') drawHayOnRider(g, Math.max(s.hay, s.mode === 'smash' ? 0.3 : 0), t);
    if (crash >= 0 && crash < 1.6) { // dizzy stars round the helmet
      for (let i = 0; i < 3; i++) { const a = t * 6 + (i * Math.PI * 2) / 3; g.fillStyle = i % 2 ? '#ffd23b' : '#ffffff'; g.fillRect(Math.round(Math.cos(a) * 7) - 1, Math.round(-30 + Math.sin(a) * 2.5), 2, 2); }
    }
    g.restore();
    // ---- transitions: re-entry, cloud decks, the sea surface, splashes ----
    if (s.fromTier === 'moon' && s.toTier === 'sea' && s.vy < -12) {
      drawFireball(g, rx, ryy, Math.atan2(-s.vy, s.v), Math.min(1, (-s.vy - 12) / 30), t);
    }
    const deckScroll = s.camX * PPM * 0.9;
    const deckAt = s.toTier === 'sky' ? 28 : s.toTier === 'moon' ? 38 : s.toTier === 'sea' ? -24 : NaN;
    if (Number.isFinite(deckAt)) drawCloudDeck(g, W, sy(roadH(s.camX) + deckAt), deckScroll, t, 0.9, s.toTier === 'moon' ? '#eef0ff' : '#ffffff');
    const underSea = (s.tier === 'sea' && !s.toTier) || (s.fromTier === 'sea' && s.toTier === 'ground');
    if (underSea) drawSeaSurface(g, W, sy(roadH(s.camX) + SURFACE_M), s.camX * PPM, t);
    drawSplash(g, rx, sy(roadH(s.x) + SURFACE_M), s.t - s.splashAt, s.fromTier !== 'sea', s.reducedFlash);

    // dust kicked up by a hop landing
    const la = s.t - s.landAt;
    if (la >= 0 && la < 0.6 && s.landImpact > 1.5 && !inLoop) {
      const k = la / 0.6, n = Math.min(10, Math.round(s.landImpact));
      g.globalAlpha = 0.7 * (1 - k); g.fillStyle = col((l) => l.groundDark);
      for (let i = 0; i < n; i++) {
        const dx = (hash01(i * 3 + 1) - 0.7) * 30 * k - k * 14, dy = -hash01(i * 3 + 2) * 8 * Math.sin(k * Math.PI);
        g.fillRect(Math.round(rx + dx), Math.round(roadY(s.x) + dy), 2, 2);
      }
      g.globalAlpha = 1;
    }

    // ---- foreground and speed lines ----
    const fu = s.camX * PPM * FORE_PARALLAX;
    const f0 = Math.floor((fu - RX - 10) / FORE_SLOT), f1 = Math.ceil((fu - RX + W + 10) / FORE_SLOT);
    this.layer(scene, (l, gg) => {
      for (let kk = f0; kk <= f1; kk++) {
        const x = kk * FORE_SLOT - fu + RX;
        if (inGap(x) || (s.edgeX !== null && s.camX + (x - RX) / PPM > s.edgeX - 12)) continue;
        l.foreProp(gg, hash01(kk * 13 + 9), Math.round(x), Math.round(roadY(s.camX + (x - RX) / PPM) + 10 + hash01(kk * 5) * 12));
      }
    });
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

    const m = this.g;
    m.imageSmoothingEnabled = false;
    if (dx || dy) { m.fillStyle = '#000'; m.fillRect(0, 0, this.canvas.width, this.canvas.height); }
    m.drawImage(this.buf, dx, dy, W * this.px, H * this.px);
    this.lastSnap = s;
    this.sound.update(s, dt > 0);
    this.overlay(s);
  }

  private clouds(g: G, W: number, UH: number, t: number, x: number, alpha: number) {
    if (alpha < 0.02) return;
    g.globalAlpha = alpha * 0.9; g.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) {
      const span = W + 80, sp = 2 + hash01(i * 9) * 4;
      const cx = ((hash01(i * 7) * span - t * sp - x * PPM * 0.03 * (1 + i * 0.2)) % span + span) % span - 40;
      const y = 10 + hash01(i * 11) * UH * 0.3, w = 14 + hash01(i * 13) * 18;
      g.fillRect(Math.round(cx), Math.round(y), Math.round(w), 4); g.fillRect(Math.round(cx + 4), Math.round(y - 3), Math.round(w * 0.5), 3);
    }
    g.globalAlpha = 1;
  }

  /** Banner, sprint meter, speed, medal stamp: full resolution, all inside the usable height. */
  private overlay(s: FullSendSnapshot) {
    const m = this.g, d = this.dpr, L = this.L;
    const font = (w: number, size: number) => `${w} ${Math.round(size * d)}px system-ui, sans-serif`;
    const panel = (b: { x: number; y: number; w: number; h: number }, a = 0.72) => { m.fillStyle = `rgba(5,4,13,${a})`; round(m, b.x * d, b.y * d, b.w * d, b.h * d, 10 * d); m.fill(); };
    m.textBaseline = 'middle';
    if (s.menu) { this.drawMenu(s.menu, font, panel); return; }
    this.menuHits = [];
    if (s.tip) { // first-ride tip card, above the shell HUD
      const T = L.tip, a = Math.min(1, s.tip.age * 3, (7 - s.tip.age) * 2);
      m.globalAlpha = Math.max(0, a); panel(T, 0.82);
      m.fillStyle = '#ffd23b'; m.fillRect(T.x * d, (T.y + 8) * d, 4 * d, (T.h - 16) * d);
      m.textAlign = 'left'; m.fillStyle = '#ffffff'; m.font = font(700, 14);
      wrap(m, s.tip.text, (T.x + 16) * d, (T.y + T.h / 2) * d, (T.w - 28) * d, 17 * d);
      m.globalAlpha = 1;
    }

    // speed (top-left)
    panel(L.speed, 0.55);
    m.textAlign = 'left'; m.fillStyle = '#ffffff'; m.font = font(900, 26);
    const spd = formatSpeed(s.v * 3.6, this.units).replace(/\.\d/, '');
    m.fillText(spd, (L.speed.x + 12) * d, (L.speed.y + 22) * d);
    m.font = font(700, 12); m.fillStyle = '#bdb8e8';
    const windTxt = s.wind < -0.2 ? ' · headwind' : s.wind > 0.2 ? ' · tailwind' : '';
    m.fillText(`${s.grade > 0 ? '▲' : s.grade < 0 ? '▼' : '■'} ${Math.abs(s.grade).toFixed(1)}% on the trainer${windTxt}`, (L.speed.x + 12) * d, (L.speed.y + 44) * d);
    const lm = liftMeter(s);
    m.font = font(800, 11); m.textAlign = 'left'; m.fillStyle = lm.color;
    m.fillText(lm.label, (L.speed.x + 12) * d, (L.speed.y + 62) * d);
    const bx = L.speed.x + 12 + m.measureText(lm.label).width / d + 8, bw = Math.max(16, L.speed.x + L.speed.w - 12 - bx);
    m.fillStyle = 'rgba(255,255,255,0.18)'; m.fillRect(bx * d, (L.speed.y + 59) * d, bw * d, 6 * d);
    m.fillStyle = lm.color; m.fillRect(bx * d, (L.speed.y + 59) * d, bw * Math.max(0, Math.min(1, s.lift)) * d, 6 * d);
    if (s.flow > 0.005 && L.speed.w >= 190) {
      m.textAlign = 'right'; m.font = font(900, 13); m.fillStyle = '#7af0ff';
      m.fillText(`FLOW +${Math.round(s.flow * 100)}%`, (L.speed.x + L.speed.w - 10) * d, (L.speed.y + 22) * d);
    }

    // tour progress (top-right)
    panel(L.status, 0.55);
    m.textAlign = 'right'; m.font = font(800, 14); m.fillStyle = '#ffffff';
    const sx = (L.status.x + L.status.w - 12) * d;
    m.fillText(`${s.tourName} · ${Math.max(0, s.results.length)}/${s.setCount}`, sx, (L.status.y + 18) * d);
    m.font = font(700, 18);
    let mx = sx;
    for (let i = s.setCount - 1; i >= 0; i--) {
      const r = s.results[i];
      m.fillStyle = r ? MEDAL_COLORS[r.medal] : '#ffffff33';
      m.beginPath(); m.arc(mx - 7 * d, (L.status.y + 40) * d, 6 * d, 0, Math.PI * 2); m.fill();
      mx -= 18 * d;
    }

    // banner + meter
    const p = s.piece, B = L.banner;
    const mmss = (sec: number) => { const v = Math.max(0, Math.ceil(sec)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };
    if (s.phase === 'approach' && p) {
      const left = s.phaseS - s.phaseT;
      panel(B);
      m.textAlign = 'center'; m.fillStyle = '#ffd23b'; m.font = font(900, 30);
      m.fillText(p.title.toUpperCase(), (B.x + B.w / 2) * d, (B.y + B.h * 0.36) * d);
      m.fillStyle = '#ffffff'; m.font = font(700, 15);
      m.fillText(left <= 3.2 ? (left > 0.2 ? String(Math.ceil(left)) : 'GO!') : `${PIECE_VERB[p.kind]} · ${Math.ceil(left)} s · shift up`, (B.x + B.w / 2) * d, (B.y + B.h * 0.74) * d);
    } else if (s.phase === 'effort' && p) {
      const left = s.phaseS - s.phaseT;
      panel(B);
      m.textAlign = 'center'; m.fillStyle = '#ff4d6d'; m.font = font(900, 30);
      const word = p.kind === 'dive' ? 'SWIM FOR IT' : p.kind === 'outrun' ? 'RUN!' : 'SPRINT!';
      m.fillText(`${word}  ${p.kind === 'dive' ? '' : mmss(left)}`.trim(), (B.x + B.w / 2) * d, (B.y + B.h * 0.36) * d);
      m.fillStyle = '#ffffff'; m.font = font(700, 15);
      m.fillText(p.title, (B.x + B.w / 2) * d, (B.y + B.h * 0.74) * d);
      this.meter(s, p);
    } else if (s.fork) {
      panel(B);
      const f = s.fork;
      m.textAlign = 'center'; m.fillStyle = '#ffffff'; m.font = font(800, 13);
      m.fillText(`FORK IN THE ROAD · ◀ ▶ to choose · ${Math.ceil(f.closesInS)} s`, (B.x + B.w / 2) * d, (B.y + B.h * 0.2) * d);
      f.options.forEach((o, i) => {
        const bx = B.x + 10 + i * (B.w - 20) / 2, bw = (B.w - 20) / 2 - 6 + (i ? 6 : 0), on = f.pick === i;
        const by = B.y + B.h * 0.36, bh = B.h * 0.56;
        m.fillStyle = on ? 'rgba(255,210,59,0.22)' : 'rgba(255,255,255,0.06)'; m.fillRect((bx + (i ? 6 : 0)) * d, by * d, (bw - (i ? 6 : 0)) * d, bh * d);
        if (on) { m.strokeStyle = '#ffd23b'; m.lineWidth = 2 * d; m.strokeRect((bx + (i ? 6 : 0)) * d, by * d, (bw - (i ? 6 : 0)) * d, bh * d); }
        const cx = bx + bw / 2 + (i ? 3 : 0);
        m.fillStyle = on ? '#ffd23b' : '#cfd3e8'; m.font = font(900, 16);
        m.fillText(`${i ? '' : '◀ '}${o.title}${i ? ' ▶' : ''}`, cx * d, (by + bh * 0.36) * d);
        m.fillStyle = '#ffffff'; m.font = font(600, 12);
        m.fillText(BIOME_NAMES[o.biome], cx * d, (by + bh * 0.74) * d);
      });
    } else if ((s.phase === 'recovery' || s.phase === 'warmup') && s.next) {
      const b2 = { ...B, h: B.h * 0.6 };
      panel(b2, 0.5);
      m.textAlign = 'center'; m.fillStyle = '#ffffff'; m.font = font(800, 16);
      const title = s.phase === 'warmup' ? `Warm-up · ${BIOME_NAMES[s.biome as BiomeId]}` : 'Recover';
      m.fillText(`${title} · next: ${s.next.title} in ${mmss(s.next.inS)}`, (b2.x + b2.w / 2) * d, (b2.y + b2.h / 2) * d);
    } else if (s.phase === 'cooldown' || s.phase === 'done') {
      const b2 = { ...B, h: B.h * 0.6 };
      panel(b2, 0.5);
      m.textAlign = 'center'; m.fillStyle = '#ffffff'; m.font = font(800, 16);
      m.fillText(s.phase === 'done' ? 'Tour complete' : `Cool-down · ${mmss(s.phaseS - s.phaseT)}`, (b2.x + b2.w / 2) * d, (b2.y + b2.h / 2) * d);
    }

    // medal stamp
    if (s.last && s.last.age < 3.5) {
      const a = Math.min(1, s.last.age * 4, (3.5 - s.last.age) / 0.6), S = L.stamp;
      m.globalAlpha = a; m.textAlign = 'center';
      const sc = 1 + Math.max(0, 0.25 - s.last.age) * 2;
      m.font = font(900, 54 * sc); m.fillStyle = '#000a';
      const label = s.last.medal ? MEDAL_NAMES[s.last.medal].toUpperCase() : s.last.detail === 'rescued' ? 'RESCUED!' : 'SO CLOSE';
      m.fillText(label, (S.x + S.w / 2) * d + 3 * d, (S.y + S.h * 0.4) * d + 3 * d);
      m.fillStyle = MEDAL_COLORS[s.last.medal]; m.fillText(label, (S.x + S.w / 2) * d, (S.y + S.h * 0.4) * d);
      m.font = font(800, 16); m.fillStyle = '#ffffff';
      m.fillText(`${s.last.title} · ${s.last.detail}`, (S.x + S.w / 2) * d, (S.y + S.h * 0.85) * d);
      m.globalAlpha = 1;
    }
    if (s.trick && s.trick.age < 1.4) {
      m.globalAlpha = Math.min(1, (1.4 - s.trick.age) * 2); m.textAlign = 'center'; m.font = font(900, 22); m.fillStyle = '#7af0ff';
      m.fillText(`${s.trick.name}!`, L.riderX * d, (L.roadY - 110) * d);
      m.globalAlpha = 1;
    }
    const fly = flightCall(s);
    if (fly) {
      m.textAlign = 'center'; m.font = font(900, s.reducedFlash ? 32 : 32 + 3 * Math.sin(s.t * 12)); m.fillStyle = fly.color;
      m.lineWidth = 5 * d; m.strokeStyle = 'rgba(10,12,40,0.85)'; m.lineJoin = 'round';
      m.strokeText(fly.text, this.cssW / 2 * d, (L.UH * 0.3) * d); m.fillText(fly.text, this.cssW / 2 * d, (L.UH * 0.3) * d);
    }
    if (s.jet) {
      m.textAlign = 'center'; m.font = font(900, s.jet === 'on' ? 16 : 14); m.fillStyle = s.jet === 'on' ? '#ffb030' : '#ff7a5a';
      const txt = s.jet === 'on' ? 'JET!' : `PEDAL HARDER · JET NEEDS ${Math.round(s.jetFtp * 100)}% FTP`;
      m.lineWidth = 4 * d; m.strokeStyle = 'rgba(10,12,40,0.8)'; m.lineJoin = 'round';
      m.strokeText(txt, L.riderX * d, (this.riderY + 26) * d); m.fillText(txt, L.riderX * d, (this.riderY + 26) * d);
    }
    const la = s.t - s.landAt, call = landingCall(s.landGrade, s.flow, s.chain);
    if (call && la >= 0 && la < 1.3) {
      m.globalAlpha = Math.min(1, (1.3 - la) * 2.5); m.textAlign = 'center'; m.font = font(900, call.size); m.fillStyle = call.color;
      const cy = Math.min(L.roadY - 80, this.riderY - 45) - la * 18;
      m.lineWidth = 4 * d; m.strokeStyle = 'rgba(10,12,40,0.8)'; m.lineJoin = 'round';
      m.strokeText(call.text, L.riderX * d, cy * d); m.fillText(call.text, L.riderX * d, cy * d);
      m.globalAlpha = 1;
    }
  }

  /** The setup screen: pick a tour (with your best), fewer flashes, start. Rows are tappable. */
  private drawMenu(menu: NonNullable<FullSendSnapshot['menu']>, font: (w: number, s: number) => string, panel: (b: { x: number; y: number; w: number; h: number }, a?: number) => void) {
    const m = this.g, d = this.dpr, M = this.L.menu;
    panel(M, 0.86);
    this.menuHits = [];
    m.textAlign = 'center'; m.fillStyle = '#ffd23b'; m.font = font(900, 30);
    m.fillText('FULL SEND', (M.x + M.w / 2) * d, (M.y + 32) * d);
    const tours = menu.tours, ti = Math.max(0, tours.findIndex((q) => q.id === menu.tour)), tr = tours[ti];
    const rowH = (M.h - 70) / 3;
    const rows: Array<{ label: string; sub: string; act: () => void }> = [
      { label: `◀  ${tr.name} · ~${tr.minutes} min  ▶`, sub: tr.best ? `Best: ${tr.best}` : 'Not ridden yet', act: () => this.send?.({ type: 'tour', value: tours[(ti + 1) % tours.length].id }) },
      { label: `Fewer flashes: ${menu.reducedFlash ? 'On' : 'Off'}`, sub: 'No screen shake or flashing', act: () => this.send?.({ type: 'flash' }) },
      { label: 'Start ride', sub: `A to start · starts by itself in ${Math.ceil(menu.left)} s`, act: () => this.send?.({ type: 'start' }) },
    ];
    rows.forEach((r, i) => {
      const y = M.y + 60 + i * rowH, on = menu.row === i;
      const box = { x: M.x + 14, y: y + 3, w: M.w - 28, h: rowH - 6 };
      m.fillStyle = on ? 'rgba(255,210,59,0.18)' : 'rgba(255,255,255,0.05)'; round(m, box.x * d, box.y * d, box.w * d, box.h * d, 8 * d); m.fill();
      if (on) { m.strokeStyle = '#ffd23b'; m.lineWidth = 2 * d; m.stroke(); }
      m.fillStyle = on ? '#ffd23b' : '#ffffff'; m.font = font(800, 17);
      m.fillText(r.label, (M.x + M.w / 2) * d, (box.y + box.h * 0.38) * d);
      m.fillStyle = '#bdb8e8'; m.font = font(600, 12);
      m.fillText(r.sub, (M.x + M.w / 2) * d, (box.y + box.h * 0.74) * d);
      this.menuHits.push({ ...box, act: r.act });
    });
  }

  /** Sprint meter: live FTP fraction against bronze / silver / gold, or the air / gap gauge. */
  private meter(s: FullSendSnapshot, p: PieceView) {
    const m = this.g, d = this.dpr, M = this.L.meter;
    const x = M.x * d, y = M.y * d, w = M.w * d, h = M.h * d;
    m.fillStyle = 'rgba(5,4,13,0.72)'; round(m, x, y, w, h, 8 * d); m.fill();
    const ix = x + 8 * d, iw = w - 16 * d, iy = y + 8 * d, ih = h - 16 * d;
    if (p.kind === 'dive') {
      m.fillStyle = p.air > 0.25 ? '#4dc3ff' : '#ff4d6d'; m.fillRect(ix, iy, iw * p.air, ih);
      m.fillStyle = '#ffffff'; m.font = `800 ${Math.round(13 * d)}px system-ui, sans-serif`; m.textAlign = 'left';
      m.fillText('AIR', ix + 6 * d, iy + ih / 2);
      const prog = Math.min(1, Math.max(0, (s.x - p.x0) / p.len));
      m.textAlign = 'right'; m.fillText(`surface ${Math.round(prog * 100)}%`, ix + iw - 6 * d, iy + ih / 2);
      return;
    }
    const maxF = p.th[2] * 1.15, X = (f: number) => ix + (iw * Math.min(maxF, Math.max(0, f))) / maxF;
    m.fillStyle = '#ffffff22'; m.fillRect(ix, iy, iw, ih);
    const live = p.live, medal = live >= p.th[2] * 0.97 ? 3 : live >= p.th[1] * 0.97 ? 2 : live >= p.th[0] * 0.97 ? 1 : 0;
    m.fillStyle = medal ? MEDAL_COLORS[medal] : '#ff4d6d'; m.fillRect(ix, iy, X(live) - ix, ih);
    for (let i = 0; i < 3; i++) {
      m.fillStyle = MEDAL_COLORS[i + 1]; m.fillRect(X(p.th[i]) - d, iy - 3 * d, 2 * d, ih + 6 * d);
    }
    if (p.kind === 'outrun') {
      m.textAlign = 'right'; m.fillStyle = '#ffffff'; m.font = `800 ${Math.round(13 * d)}px system-ui, sans-serif`;
      m.fillText(`${Math.max(0, Math.round(p.gap))} m ahead`, ix + iw - 6 * d, iy + ih / 2);
    }
  }
}

/** Height of the kicker ramp before a canyon lip and the landing ramp after it (m). */
export function rampLift(p: PieceView | null, x: number): number {
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

/** A fork signpost: two arrow boards (left / right), each with a swatch of its biome; the picked one glows. */
function drawForkSign(g: G, x: number, y: number, pick: 0 | 1, colA: string, colB: string) {
  g.fillStyle = '#5a3b22'; g.fillRect(x - 1, y - 30, 2, 30);
  const board = (dir: -1 | 1, yy: number, col: string, on: boolean) => {
    const x0 = dir < 0 ? x - 18 : x + 1, x1 = dir < 0 ? x - 1 : x + 18;
    g.fillStyle = on ? '#ffd23b' : '#d8c8a0';
    g.beginPath(); g.moveTo(x0, yy); g.lineTo(x1, yy); g.lineTo(dir > 0 ? x1 + 4 : x1, yy + 4); g.lineTo(x1, yy + 8); g.lineTo(x0, yy + 8);
    if (dir < 0) g.lineTo(x0 - 4, yy + 4); g.closePath(); g.fill();
    g.fillStyle = col; g.fillRect(dir < 0 ? x0 + 3 : x1 - 9, yy + 2, 6, 4);
  };
  board(-1, y - 30, colA, pick === 0);
  board(1, y - 20, colB, pick === 1);
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
