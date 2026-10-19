import { unitsFor, formatSpeed, formatDistance, formatElevation, formatUpcoming } from '../../../units';
import type { UnitSystem } from '../../../contracts';
import type { BikeState, GameRenderer, InputState, Insets, Profile } from '../../../contracts';
import type { WarmupSnapshot } from '../sim/sim';
import { BIOME_NAMES, biomeAt, biomeOfSeg, biomeWeights, hash01, makeTerrain, type Terrain } from '../sim/terrain';
import { LOOKS, noise1, type BiomeLook, type G } from './biomes';
import { drawRider, lensFor } from '../../../cosmetics/draw/rider';
import { riderLook } from '../../../cosmetics/unlocks';
import type { RiderLook } from '../../../cosmetics/types';
import { daylight } from './daylight';
import { blendColors, layerAlphas, mixColor } from './blend';
import { boardCentre, drawGateway, GATEWAYS } from './gateway';
import { DRIVE_IN, drawProjectorBeam, drawScreenFrame, type BufRect } from './driveIn';
import { drawTumbleweed, LANE_PARALLAX, makeWeed, weedAt, weedGone, type Weed, type WeedLane } from './tumbleweed';
import { Soundscape, speedFactor, type SceneId } from './soundscape';
import { ambientDucked, play, setAmbient, stopAmbient } from '../../../audio/sfx';
import { makeRng } from '../../../core/rng';
import { drawRoadStructure } from './biomesNew';

export { mixColor } from './blend';

const PPM = 9;            // low-res px per metre along the road
const RIDGE_M_PER_PX = 4;
const wrap = (x: number, span: number) => ((x % span) + span) % span; // the far ridge shows the same road, zoomed out
const MID_PARALLAX = 0.5, FORE_PARALLAX = 1.35, BACK_PARALLAX = 0.05;
const MID_SLOT = 15, FORE_SLOT = 9;

interface Actor { kind: BiomeLook['actor']; x: number; y: number; vx: number; vy: number; t0: number; seed: number; beamAt: number; color: string; leaveAt: number }
const PARROTS = ['#e74c3c', '#3b82ff', '#ffd23b', '#2de26a'];
const FISH = ['#ffb020', '#ff6b8a', '#4dabf7', '#ffe066', '#c56cf0'];
/** `?hour=21` previews the time of day (debug aid). */
const hourOverride = (() => { try { const v = new URLSearchParams(globalThis.location?.search ?? '').get('hour'); return v == null ? null : Number(v); } catch { return null; } })();
interface Text { s: string; x: number; y: number; size: number; color: string; align?: CanvasTextAlign; alpha?: number; glow?: string }
/** Where the shell put the Drive-In video, in CSS px relative to the render surface. */
export interface ScreenRect { x: number; y: number; w: number; h: number }
type Scene = Array<[BiomeLook, number]>;

/** Side-scrolling pixel scenery. Draws a low-res buffer, upscales it crisply, then overlays text at full resolution. */
export class WarmupRenderer implements GameRenderer {
  private units: UnitSystem = 'imperial';
  private canvas!: HTMLCanvasElement; private g!: G;
  private buf!: HTMLCanvasElement; private b!: G;
  private scratch!: HTMLCanvasElement; private sg!: G;   // one layer of one biome, composited with alpha (the cross-dissolve)
  private dpr = 1; private px = 3; private LW = 300; private LH = 200;
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private color = '#00f0ff';
  private look: RiderLook | null = null;
  private terrain: { key: string; t: Terrain } | null = null;
  private actors: Actor[] = []; private nextActorAt = 0; private actorKind: BiomeLook['actor'] | null = null;
  private crankSample = NaN; private crankSampleAt = 0;
  private distanceSample = NaN; private distanceSampleAt = 0;
  private weeds: Weed[] = []; private nextWeedAt = 0; private weedRng: (() => number) | null = null;
  private lastBiome: string | null = null; private lastDriveIn = false; private titleAt = -99; private title = '';
  private texts: Text[] = [];
  private lastNow = 0;
  private ambientAt = 0;
  private sounds: Soundscape | null = null;
  private actorRng: (() => number) | null = null;
  private screen: ScreenRect | null = null;
  private ridge: number[] = [];
  private profileCache: { terrain: Terrain; hill: number; d: number; at: number; es: number[]; grades: number[]; lo: number; span: number } | null = null;

  mount(container: HTMLElement, ctx: { profile: Readonly<Profile>; insets?: Insets }) {
    this.units = unitsFor(ctx.profile);
    this.color = ctx.profile.color;
    this.look = riderLook({ ...ctx.profile, level: ctx.profile.level ?? 1, achievements: ctx.profile.achievements ?? [] }); // the guest lobby passes a bare { color }
    if (ctx.insets) this.insets = ctx.insets;
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'width:100%;height:100%;display:block;background:#4fa3e8';
    container.appendChild(this.canvas);
    this.g = this.canvas.getContext('2d')!;
    this.buf = document.createElement('canvas');
    this.b = this.buf.getContext('2d')!;
    this.scratch = document.createElement('canvas');
    this.sg = this.scratch.getContext('2d')!;
    this.resize(container.clientWidth || 800, container.clientHeight || 600);
  }
  setInsets(i: Insets) { this.insets = i; }
  /** The Drive-In video rectangle (CSS px, relative to this surface), or null while it is off. Drawn as a frame in the backdrop. */
  setScreen(r: ScreenRect | null) { this.screen = r; }
  resize(w: number, h: number) {
    this.dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
    this.px = Math.max(2, Math.floor(this.canvas.height / 230));
    this.LW = Math.ceil(this.canvas.width / this.px); this.LH = Math.ceil(this.canvas.height / this.px);
    this.buf.width = this.scratch.width = this.LW; this.buf.height = this.scratch.height = this.LH;
  }
  unmount() { this.canvas?.remove(); stopAmbient(); }

  private terr(s: WarmupSnapshot): Terrain {
    const key = `${s.terrainSeed}:${s.maxGrade}`;
    if (this.terrain?.key !== key) this.terrain = { key, t: makeTerrain(s.terrainSeed, s.maxGrade) };
    return this.terrain.t;
  }

  /** Draw one layer for every biome in the scene. In a dissolve each biome's layer goes to the scratch buffer first, so the layer blends as a whole. */
  private layer(scene: Scene, draw: (look: BiomeLook, g: G) => void) {
    if (scene.length === 1) { draw(scene[0][0], this.b); return; }
    const alphas = layerAlphas(scene.map(([, w]) => w));
    scene.forEach(([look], i) => {
      this.sg.clearRect(0, 0, this.LW, this.LH);
      draw(look, this.sg);
      this.b.globalAlpha = alphas[i]; this.b.drawImage(this.scratch, 0, 0); this.b.globalAlpha = 1;
    });
  }

  render(snapshot: unknown, bike: Readonly<BikeState>, _input: Readonly<InputState>) {
    const s = snapshot as WarmupSnapshot;
    if (!s || typeof s.d !== 'number') return;
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, now - (this.lastNow || now)); this.lastNow = now;
    const g = this.b, W = this.LW, H = this.LH, t = now;
    const UH = Math.max(80, H - this.insets.bottom * this.dpr / this.px); // usable height above the HUD
    const terr = this.terr(s);
    const vscale = s.hill * s.exaggeration * PPM;      // screen px per metre of climb
    const di = s.driveIn ?? 0;
    // what the scene is made of right now: the biome pair being dissolved (by position) and the Drive-In (by time)
    const scene: Scene = [];
    for (const [id, w] of biomeWeights({ cur: s.from, next: s.to, mix: s.mix })) if (w * (1 - di) > 0.002) scene.push([LOOKS[id], w * (1 - di)]);
    if (di > 0.002) scene.push([DRIVE_IN, di]);
    const wsum = (f: (l: BiomeLook) => number) => scene.reduce((a, [l, w]) => a + f(l) * w, 0);
    const dom = di > 0.5 ? DRIVE_IN : LOOKS[s.biome];
    const RX = Math.round(W * 0.3), roadY0 = Math.round(UH * 0.8);
    const elevation = terr.elev(s.d);
    const roadY = (dd: number) => roadY0 - (terr.elev(dd) - elevation) * vscale;
    const biomeM = s.biomeM, start = s.startBiome, blendM = s.blendM;
    /** Smoothly blended band colour (ground, road, ...) at a road distance. */
    let bandDistance = NaN;
    let bandBiome: ReturnType<typeof biomeAt>;
    const biome = (dd: number) => {
      if (dd !== bandDistance) { bandDistance = dd; bandBiome = biomeAt(dd, biomeM, start, blendM); }
      return bandBiome;
    };
    const band = (dd: number, k: 'mid' | 'ground' | 'groundDark' | 'road' | 'roadEdge') => {
      const b = biome(dd);
      const c = mixColor(LOOKS[b.cur][k], LOOKS[b.next][k], b.mix);
      return di > 0 ? mixColor(c, DRIVE_IN[k], di) : c;
    };
    const roadKindAt = (dd: number) => { if (di > 0.5) return DRIVE_IN.roadKind; const b = biome(dd); return LOOKS[b.mix < 0.5 ? b.cur : b.next].roadKind; };
    this.texts = [];

    if (s.biome !== this.lastBiome) { if (this.lastBiome) { this.titleAt = t; this.title = BIOME_NAMES[s.biome]; } this.lastBiome = s.biome; }
    if ((di > 0.5) !== this.lastDriveIn) { this.lastDriveIn = di > 0.5; this.titleAt = t; this.title = di > 0.5 ? 'Drive-In' : BIOME_NAMES[s.biome]; }

    // ---- sky ----
    const now2 = new Date();
    const day = daylight(hourOverride ?? now2.getHours() + now2.getMinutes() / 60);
    const outdoor = wsum((l) => (l.outdoor ? 1 : 0));
    const night = day.night * outdoor, glow = day.glow * outdoor;
    const dusk = Math.max(night, wsum((l) => l.dusk ?? 0)), lights = Math.max(night, wsum((l) => l.lights ?? 0));
    const sky = g.createLinearGradient(0, 0, 0, UH * 0.7);
    sky.addColorStop(0, mixColor(blendColors(scene.map(([l, w]) => [l.sky[0], w] as const)), '#0a0f2a', night * 0.92));
    sky.addColorStop(1, mixColor(mixColor(blendColors(scene.map(([l, w]) => [l.sky[1], w] as const)), '#ff9a5a', glow * 0.65), '#1c2348', night * 0.85));
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const stars = Math.max(wsum((l) => l.stars), night);
    if (stars > 0.02) {
      for (let i = 0; i < 90; i++) {
        const x = hash01(i * 3 + 1) * W, y = hash01(i * 3 + 2) * UH * 0.6;
        g.globalAlpha = stars * (0.5 + 0.5 * Math.sin(t * (1 + hash01(i) * 2) + i));
        g.fillStyle = '#fff'; g.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
      g.globalAlpha = 1;
    }
    for (const [l, w] of scene) { g.globalAlpha = w * (l.outdoor ? 1 - day.night : 1); if (g.globalAlpha > 0.01) l.celestial(g, W, UH, t); }
    g.globalAlpha = night; if (night > 0.02) { g.fillStyle = '#f4f1dc'; g.beginPath(); g.arc(W * 0.8, 24, 7, 0, Math.PI * 2); g.fill(); g.fillStyle = '#0a0f2a'; g.beginPath(); g.arc(W * 0.8 + 3, 22, 6, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
    const clouds = wsum((l) => (l.stars < 0.5 && l.rider !== 'scuba' ? 1 : 0)) * (1 - night * 0.92);
    if (clouds > 0.02) this.clouds(g, W, UH, t, s.d, clouds);

    // ---- distant backdrop ----
    const backY = Math.round(UH * 0.5), bu = s.d * PPM * BACK_PARALLAX;
    this.layer(scene, (l, gg) => l.backdrop(gg, W, backY, bu, t));

    const solidGroundWeight = 1 - wsum(l => l.openSky ? 1 : 0);
    // ---- the real road, seen from afar (rolling ridge) ----
    const ridgeBase = Math.round(UH * 0.6), ridgeV = Math.max(0.6, s.hill * s.exaggeration * 0.7);
    const ridgeAt = (x: number) => { const uu = s.d + (x - RX) * RIDGE_M_PER_PX; return ridgeBase - (terr.elev(uu) - elevation) * ridgeV; };
    g.globalAlpha = solidGroundWeight;
    g.fillStyle = blendColors(scene.map(([l, w]) => [l.ridge, w] as const));
    g.beginPath(); g.moveTo(0, H);
    const ridge = this.ridge;
    for (let x = 0; x <= W; x += 2) { const y = ridgeAt(x); ridge[x / 2] = y; g.lineTo(x, y); }
    g.lineTo(W, H); g.closePath(); g.fill();
    g.strokeStyle = '#ffffff16'; g.lineWidth = 1; g.beginPath();
    for (let x = 0; x <= W; x += 2) { const y = ridge[x / 2] + 2; if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
    g.globalAlpha = 1;

    // ---- the Drive-In screen: pinned (no parallax), in front of the ridge, behind the ground ----
    let screenBuf: BufRect | null = null;
    if (di > 0.01 && this.screen) {
      const k = this.dpr / this.px, r = this.screen;
      screenBuf = { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k };
      g.globalAlpha = di; drawScreenFrame(g, screenBuf, Math.round(UH * 0.7), t); g.globalAlpha = 1;
      const fade = Math.min(1, di * 2);
      this.texts.push({ s: 'WATTCADE DRIVE-IN', x: screenBuf.x + screenBuf.w / 2, y: screenBuf.y - 9, size: Math.max(4, Math.min(8, screenBuf.w / 70)), color: '#ff7ae8', align: 'center', alpha: fade * (0.85 + 0.15 * Math.sin(t * 9) * (Math.sin(t * 0.7) > 0.8 ? 1 : 0)), glow: '#ff2bd6' });
    }

    // ---- mid layer: ground band + props ----
    const midBase = Math.round(UH * 0.7), mu = s.d * PPM * MID_PARALLAX;
    const midY = (lx: number) => midBase + Math.sin(lx / 60) * 2 + Math.sin(lx / 23) * 1;
    for (let x = 0; x < W; x += 2) {
      const lx = x + mu - RX;
      g.fillStyle = band(lx / (PPM * MID_PARALLAX), 'mid');
      g.globalAlpha = solidGroundWeight;
      const y = Math.round(midY(lx)); g.fillRect(x, y, 2, H - y);
    }
    g.globalAlpha = 1;
    const k0 = Math.floor((mu - RX - 30) / MID_SLOT), k1 = Math.ceil((mu - RX + W + 30) / MID_SLOT);
    this.layer(scene, (l, gg) => {
      for (let k = k0; k <= k1; k++) {
        const lx = k * MID_SLOT + (hash01(k * 17 + 3) - 0.5) * 8;
        l.midProp(gg, hash01(k * 31 + 5), Math.round(lx - mu + RX), Math.round(midY(lx)) + 1, t);
      }
    });
    const weedW = wsum((l) => (l.weeds ? 1 : 0));
    this.updateWeeds(t, s, W, weedW);
    const weedAtLane = (lane: WeedLane) => this.drawWeeds(g, lane, t, s, RX, roadY, midY, weedW);
    weedAtLane('far');

    // Scenery uses the road's own world coordinates and grade. Extended culling
    // keeps broad canopies and landmarks visible before their root enters view.
    for (const [l, weight] of scene) if (l.roadside) {
      this.sg.clearRect(0, 0, W, H);
      l.roadside(this.sg, W, x => roadY(s.d + (x - RX) / PPM), s.d * PPM - RX, t);
      g.globalAlpha = weight; g.drawImage(this.scratch, 0, 0); g.globalAlpha = 1;
    }

    // ---- road + near ground ----
    for (let x = 0; x < W; x++) {
      const dd = s.d + (x - RX) / PPM;
      const y = Math.round(roadY(dd)), kind = roadKindAt(dd), edge = band(dd, 'roadEdge');
      g.fillStyle = band(dd, 'ground'); g.fillRect(x, y + 6, 1, H - y);
      if (hash01(Math.floor(dd * 3) * 7) < 0.25) { g.fillStyle = band(dd, 'groundDark'); g.fillRect(x, y + 8 + Math.floor(hash01(Math.floor(dd * 3)) * 20), 1, 1); }
      g.fillStyle = band(dd, 'road'); g.fillRect(x, y, 1, 5);
      g.fillStyle = edge; g.fillRect(x, y + 5, 1, 1);
      if (kind === 'asphalt' && Math.floor(dd / 1.5) % 2 === 0) { g.fillStyle = '#f0e6a0'; g.fillRect(x, y + 2, 1, 1); }
      else if (kind === 'planks' && ((dd % 0.8) + 0.8) % 0.8 < 1 / PPM) { g.fillStyle = edge; g.fillRect(x, y, 1, 5); }
      else if (kind === 'stone' && ((dd % 1.6) + 1.6) % 1.6 < 1 / PPM) { g.fillStyle = edge; g.fillRect(x, y + 1, 1, 4); }
      else if (kind === 'dust' && hash01(Math.floor(dd * PPM)) < 0.2) { g.fillStyle = edge; g.fillRect(x, y + 1 + Math.floor(hash01(x + Math.floor(dd)) * 3), 1, 1); }
    }

    // Deck supports / floating undersides use the same road profile and blend
    // as a complete layer at biome boundaries.
    for (const [l, weight] of scene) if (l.roadStructure) {
      this.sg.clearRect(0, 0, W, H);
      drawRoadStructure(this.sg, l.roadStructure, W, H,
        (x) => roadY(s.d + (x - RX) / PPM), s.d * PPM - RX, t);
      g.globalAlpha = weight; g.drawImage(this.scratch, 0, 0); g.globalAlpha = 1;
    }

    // ---- gateway landmarks at the biome boundaries (centre of each dissolve) ----
    const kb = Math.round(s.d / biomeM);
    for (let k = kb - 1; k <= kb + 1; k++) {
      if (k < 1) continue;
      const bd = k * biomeM, sx = RX + (bd - s.d) * PPM;
      if (sx < -50 || sx > W + 50) continue;
      const sy = roadY(bd), to = biomeOfSeg(k, start), st = GATEWAYS[to];
      g.globalAlpha = 1 - di; drawGateway(g, st, Math.round(sx), Math.round(sy), t); g.globalAlpha = 1;
      const [bx, by] = boardCentre(), clear = Math.min(1, Math.max(0, (Math.abs(sx - RX) - 12) / 14)) * (1 - di);
      if (clear > 0) this.texts.push({ s: BIOME_NAMES[to], x: sx + bx, y: sy + by + 0.5, size: 4.4, color: st.text, align: 'center', alpha: clear });
    }
    weedAtLane('road');

    // ---- rider (towing the projector in the Drive-In) ----
    const slope = (s.grade / 100) * s.exaggeration;   // drawn slope (exaggerated like the road)
    const gear = dom.rider, look = this.look ?? riderLook({ level: 1, achievements: [], color: this.color });
    const bob = s.v > 1 ? (s.biome === 'moon' && di < 0.5 ? -Math.abs(Math.sin(t * 2.2)) * 2 : gear === 'scuba' ? Math.sin(t * 1.4) * 1 : 0) : 0;
    if (screenBuf && di > 0.5) { // light beam from the trailer's lens (rotated with the road under the rider)
      const c = Math.cos(-Math.atan(slope)), sn = Math.sin(-Math.atan(slope));
      g.globalAlpha = Math.min(1, (di - 0.5) * 2);
      const lens = lensFor(look.bike);
      drawProjectorBeam(g, RX + lens[0] * c - lens[1] * sn, roadY0 + bob + lens[0] * sn + lens[1] * c, screenBuf, t);
      g.globalAlpha = 1;
    }
    g.save(); g.translate(RX, roadY0 + 0.5 + bob); g.rotate(-Math.atan(slope));
    if (lights > 0.3) { // headlight
      g.fillStyle = `rgba(255,244,200,${0.18 * lights})`; g.beginPath(); g.moveTo(8, -10); g.lineTo(60, -18); g.lineTo(60, 4); g.closePath(); g.fill();
    }
    // Trainer samples arrive at the fixed sim rate. Extrapolate at most one
    // tick using raw cadence so a 60 Hz display doesn't repeat every pose twice.
    // Stopped cadence freezes the feet immediately rather than using a 3s tail.
    if (bike.crankRevs !== this.crankSample) { this.crankSample = bike.crankRevs; this.crankSampleAt = t; }
    const crank = bike.crankRevs + Math.min(1 / 30, Math.max(0, t - this.crankSampleAt)) * Math.max(0, bike.raw.cadence) / 60;
    // Distance has its own clock: wheels keep turning smoothly while coasting
    // after cadence (and therefore the crank sample) has stopped changing.
    if (s.d !== this.distanceSample) { this.distanceSample = s.d; this.distanceSampleAt = t; }
    const wheelDistance = s.d + Math.min(1 / 30, Math.max(0, t - this.distanceSampleAt)) * s.v;
    drawRider(g, look, crank, wheelDistance, { t, speed: s.v, gear: gear === 'road' ? null : gear, trailer: di > 0.5 });
    g.restore();
    weedAtLane('near');

    // ---- foreground bits ----
    const fu = s.d * PPM * FORE_PARALLAX;
    const f0 = Math.floor((fu - RX - 10) / FORE_SLOT), f1 = Math.ceil((fu - RX + W + 10) / FORE_SLOT);
    this.layer(scene, (l, gg) => {
      for (let k = f0; k <= f1; k++) {
        const lx = k * FORE_SLOT, x = lx - fu + RX, dd = s.d + (x - RX) / PPM;
        l.foreProp(gg, hash01(k * 13 + 9), Math.round(x), Math.round(roadY(dd) + 10 + hash01(k * 5) * 12));
      }
    });

    this.particles(g, W, H, t, s, scene, night);
    this.updateActors(g, W, UH, t, dt, s, dom);
    if (dusk > 0.01) { g.globalAlpha = dusk * 0.42; g.fillStyle = '#0a1030'; g.fillRect(0, 0, W, H); }
    if (glow > 0.01) { g.globalAlpha = glow * 0.14; g.fillStyle = '#ff7a3a'; g.fillRect(0, 0, W, H); }
    g.globalAlpha = 1;
    this.audio(now, s, scene);

    // ---- blit + full-res overlay ----
    const m = this.g;
    m.imageSmoothingEnabled = false;
    m.drawImage(this.buf, 0, 0, W * this.px, H * this.px);
    this.overlay(s, RX, roadY0, UH, t);
  }

  /** Ambient bed (blended across the scene) plus per-biome one-shots; both fade out when the rider stops and duck for music / the Drive-In video. */
  private audio(now: number, s: WarmupSnapshot, scene: Scene) {
    if (now - this.ambientAt < 0.5) return;
    this.ambientAt = now;
    const sp = speedFactor(s.v);
    let vol = 0, lf = 0, q = 0;
    for (const [l, w] of scene) { const a = l.ambient; if (!a) continue; vol += a.vol * w; lf += Math.log(a.freq) * w; q += (a.q ?? 0.7) * w; }
    const wt = scene.reduce((a, [l, w]) => a + (l.ambient ? w : 0), 0) || 1;
    setAmbient('warmup', vol * sp, Math.exp(lf / wt), q / wt);
    this.sounds ??= new Soundscape(makeRng(s.terrainSeed ^ 0x5eed));
    const weights: Array<[SceneId, number]> = [];
    for (const [id, w] of biomeWeights({ cur: s.from, next: s.to, mix: s.mix })) weights.push([id, w * (1 - s.driveIn)]);
    if (s.driveIn > 0) weights.push(['driveIn', s.driveIn]);
    for (const sh of this.sounds.tick(now, weights, sp, ambientDucked())) play(sh.sfx, { vol: sh.vol, pitch: sh.pitch });
  }

  /** Spawn and retire tumbleweeds while the scene has any desert in it (seeded, so a given seed rolls the same weeds). */
  private updateWeeds(t: number, s: WarmupSnapshot, W: number, weight: number) {
    this.weedRng ??= makeRng(s.terrainSeed ^ 0x7ee0d);
    if (weight > 0.3 && t >= this.nextWeedAt && this.weeds.length < 6) {
      const R = this.weedRng, lane: WeedLane = R() < 0.3 ? 'far' : R() < 0.55 ? 'road' : 'near';
      const scroll = s.d * PPM * LANE_PARALLAX[lane];
      this.weeds.push(makeWeed(R, lane, t, W + 14 - Math.round(W * 0.3), scroll));
      this.nextWeedAt = t + 2 + R() * 5;
    }
    if (weight < 0.02) this.weeds.length = 0;
  }
  private drawWeeds(g: G, lane: WeedLane, t: number, s: WarmupSnapshot, RX: number, roadY: (d: number) => number, midY: (x: number) => number, weight: number) {
    const keep: Weed[] = [];
    for (const w of this.weeds) {
      const pose = weedAt(w, t), scroll = s.d * PPM * LANE_PARALLAX[w.lane], x = RX + pose.u - scroll;
      if (weedGone(x, w.r, t - w.t0)) continue;
      keep.push(w);
      if (w.lane !== lane) continue;
      const ground = w.lane === 'far' ? midY(pose.u) + 1 : roadY(pose.u / PPM) + (w.lane === 'near' ? 7 : 3);
      drawTumbleweed(g, Math.round(x), Math.round(ground - w.r * 0.8 - pose.hop), w.r, pose.spin, w.seed, Math.min(1, weight * 2));
    }
    if (lane === 'near') this.weeds = keep; // prune once per frame, after the last pass
  }

  private clouds(g: G, W: number, UH: number, t: number, d: number, alpha: number) {
    g.globalAlpha = alpha * 0.9; g.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) {
      const span = W + 80, sp = 2 + hash01(i * 9) * 4;
      const x = ((hash01(i * 7) * span - t * sp - d * PPM * 0.02 * (1 + i * 0.2)) % span + span) % span - 40;
      const y = 10 + hash01(i * 11) * UH * 0.3, w = 14 + hash01(i * 13) * 18;
      g.fillRect(Math.round(x), Math.round(y), Math.round(w), 4); g.fillRect(Math.round(x + 4), Math.round(y - 3), Math.round(w * 0.5), 3);
      g.fillRect(Math.round(x + w * 0.45), Math.round(y - 5), Math.round(w * 0.3), 5);
    }
    g.globalAlpha = 1;
  }

  /** Flyers / swimmers for the current biome; spawned in small groups from either side. */
  private updateActors(g: G, W: number, UH: number, t: number, dt: number, s: WarmupSnapshot, look: BiomeLook) {
    const kind = look.actor;
    if (kind !== this.actorKind) { // new biome: the old biome's creatures fade away (no fish in the jungle sky)
      this.actorKind = kind;
      for (const x of this.actors) if (x.leaveAt < 0 && x.kind !== kind && !(kind === 'fish' && x.kind === 'none')) x.leaveAt = t;
      this.nextActorAt = Math.min(this.nextActorAt, t + 2);
    }
    if (t >= this.nextActorAt && kind !== 'none') {
      const R = this.actorRng ??= makeRng(s.terrainSeed ^ 0xb17d);
      const fromLeft = R() < 0.5, dir = fromLeft ? 1 : -1;
      const n = kind === 'ufo' ? 1 : kind === 'skywhale' ? 2 : kind === 'vulture' ? 1 + Math.floor(R() * 2) : kind === 'fish' ? 4 + Math.floor(R() * 6) : kind === 'ember' ? 1 + Math.floor(R() * 3) : 2 + Math.floor(R() * 4);
      const baseY = 18 + R() * UH * (kind === 'fish' ? 0.45 : 0.25);
      const color = kind === 'parrot' ? PARROTS[Math.floor(R() * 4)] : FISH[Math.floor(R() * FISH.length)];
      for (let i = 0; i < n; i++) {
        const speed = kind === 'skywhale' ? 7 + R() * 3 : kind === 'ufo' ? 28 + R() * 30 : kind === 'fish' ? 12 + R() * 4 : kind === 'vulture' ? 6 : kind === 'parrot' ? 18 + R() * 6 : 10 + R() * 6;
        if (kind === 'ember') { // lava bombs lobbed from the crater (backdrop, upper right)
          this.actors.push({ kind, x: W * (0.45 + R() * 0.25), y: UH * 0.3, vx: (R() - 0.5) * 50, vy: -50 - R() * 30, t0: t, seed: R(), beamAt: -1, color: '#ff8a2a', leaveAt: -1 });
          continue;
        }
        const jelly = kind === 'fish' && i === 0 && R() < 0.3;
        this.actors.push({
          kind: jelly ? 'none' : kind === 'skywhale' && i > 0 ? 'bird' : kind, x: (fromLeft ? -20 : W + 20) - i * (kind === 'fish' ? 5 : 7) * dir, y: baseY + (kind === 'fish' ? (R() - 0.5) * 14 : i * 3),
          vx: jelly ? dir * 3 : speed * dir, vy: jelly ? -3 : 0, t0: t, seed: R(), beamAt: kind === 'ufo' && R() < 0.6 ? 0.3 + R() * 0.4 : -1, color: jelly ? '#e8b8ff' : color, leaveAt: -1,
        });
      }
      this.nextActorAt = t + (kind === 'skywhale' ? 28 + R() * 16 : kind === 'ufo' ? 9 + R() * 14 : kind === 'ember' ? 2 + R() * 4 : kind === 'fish' ? 4 + R() * 6 : 6 + R() * 10);
    }
    this.actors = this.actors.filter((a) => a.x > -60 && a.x < W + 60 && a.y < UH + 20 && t - a.t0 < 70 && (a.leaveAt < 0 || t - a.leaveAt < 2.5));
    for (const a of this.actors) {
      const age = t - a.t0, fade = Math.min(1, age / 1.2) * (a.leaveAt < 0 ? 1 : 1 - (t - a.leaveAt) / 2.5);
      g.globalAlpha = fade;
      if (a.kind === 'skywhale') {
        a.x += a.vx * dt;
        const y = a.y + Math.sin(age * 0.65 + a.seed * 9) * 3, dir = Math.sign(a.vx), flap = Math.sin(age * 1.3) * 2;
        g.save(); g.translate(Math.round(a.x), Math.round(y)); g.scale(dir, 1);
        g.fillStyle = '#8f94c6'; g.beginPath(); g.ellipse(0, 0, 11, 4.5, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#c3c7e2'; g.fillRect(-6, 1, 13, 2);
        g.fillStyle = '#8f94c6'; g.beginPath(); g.moveTo(-9, 0); g.lineTo(-17, -4 + flap); g.lineTo(-15, 1); g.lineTo(-17, 5 + flap); g.closePath(); g.fill();
        g.fillStyle = '#747da9'; g.beginPath(); g.moveTo(0, 1); g.lineTo(-2, 6 + flap); g.lineTo(4, 2); g.closePath(); g.fill();
        g.fillStyle = '#303c68'; g.fillRect(7, -1, 1, 1); g.restore();
      } else if (a.kind === 'ufo') {
        // hover to beam something up partway across, then zip off
        const frac = a.vx > 0 ? a.x / W : 1 - a.x / W;
        const beaming = a.beamAt > 0 && frac > a.beamAt && frac < a.beamAt + 0.12;
        a.x += a.vx * dt * (beaming ? 0.08 : 1);
        const y = a.y + Math.sin(age * 3 + a.seed * 9) * 3;
        if (beaming) { g.fillStyle = '#c8ff8a40'; g.beginPath(); g.moveTo(a.x - 3, y + 2); g.lineTo(a.x + 3, y + 2); g.lineTo(a.x + 10, UH * 0.72); g.lineTo(a.x - 10, UH * 0.72); g.closePath(); g.fill(); }
        g.fillStyle = '#8ef2ff'; g.beginPath(); g.ellipse(a.x, y - 2, 4, 3, 0, Math.PI, 0); g.fill();
        g.fillStyle = '#b8bcc8'; g.beginPath(); g.ellipse(a.x, y, 10, 2.6, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#6c7080'; g.fillRect(Math.round(a.x - 9), Math.round(y + 1), 18, 1);
        for (let i = 0; i < 4; i++) { g.fillStyle = Math.floor(age * 6 + i) % 2 ? '#ffe066' : '#ff4d6d'; g.fillRect(Math.round(a.x - 6 + i * 4), Math.round(y), 1, 1); }
      } else if (a.kind === 'fish') {
        a.x += a.vx * dt;
        const y = a.y + Math.sin(age * 2 + a.seed * 7) * 2, d = Math.sign(a.vx), wag = Math.sin(age * 12 + a.seed * 9) > 0 ? 1 : 0;
        g.fillStyle = a.color; g.beginPath(); g.ellipse(a.x, y, 3, 1.6, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.moveTo(a.x - d * 2.5, y); g.lineTo(a.x - d * 5, y - 2 + wag); g.lineTo(a.x - d * 5, y + 2 - wag); g.closePath(); g.fill();
        g.fillStyle = '#111'; g.fillRect(Math.round(a.x + d * 1.5), Math.round(y - 1), 1, 1);
      } else if (a.kind === 'none') { // jellyfish: pulse and drift up
        const pulse = 0.5 + 0.5 * Math.sin(age * 3 + a.seed * 5);
        a.x += a.vx * dt; a.y += a.vy * dt * (0.4 + pulse);
        g.globalAlpha = 0.75 * fade; g.fillStyle = a.color; g.beginPath(); g.ellipse(a.x, a.y, 4 + pulse, 3, 0, Math.PI, 0); g.fill();
        g.strokeStyle = a.color; g.lineWidth = 0.6;
        for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(a.x + i * 2, a.y); g.lineTo(a.x + i * 2 + Math.sin(age * 2 + i) * 1.5, a.y + 6 + pulse); g.stroke(); }
        g.globalAlpha = fade;
      } else if (a.kind === 'ember') { // lava bomb: ballistic, glowing trail
        a.vy += 40 * dt; a.x += a.vx * dt; a.y += a.vy * dt;
        g.fillStyle = '#ffd23b'; g.fillRect(Math.round(a.x), Math.round(a.y), 2, 2);
        g.fillStyle = '#ff6a1a88'; g.fillRect(Math.round(a.x - a.vx * 0.04), Math.round(a.y - a.vy * 0.04), 2, 2);
        if (a.y > UH * 0.68) a.y = UH + 100; // landed
      } else if (a.kind === 'vulture') { // lazy circles while drifting across
        a.x += a.vx * dt;
        const cx = a.x + Math.cos(age * 0.7 + a.seed * 6) * 14, cy = a.y + Math.sin(age * 0.7 + a.seed * 6) * 5;
        g.strokeStyle = '#2b2026'; g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(cx - 6, cy - 1); g.quadraticCurveTo(cx - 3, cy - 3, cx, cy); g.quadraticCurveTo(cx + 3, cy - 3, cx + 6, cy - 1); g.stroke();
      } else {
        a.x += a.vx * dt;
        const flap = Math.sin(age * (a.kind === 'gull' ? 5 : a.kind === 'parrot' ? 11 : 9) + a.seed * 6) > 0 ? -1.5 : 0.5;
        const y = a.y + Math.sin(age * 0.8 + a.seed * 4) * 2, w = a.kind === 'gull' ? 4 : a.kind === 'parrot' ? 3 : 2.5;
        g.strokeStyle = a.kind === 'gull' ? '#ffffff' : a.kind === 'parrot' ? a.color : '#2b2b36'; g.lineWidth = a.kind === 'parrot' ? 1.4 : 1;
        g.beginPath(); g.moveTo(a.x - w, y + flap); g.lineTo(a.x, y); g.lineTo(a.x + w, y + flap); g.stroke();
        if (a.kind === 'parrot') { g.fillStyle = a.color; g.fillRect(Math.round(a.x - Math.sign(a.vx) * 3), Math.round(y), 2, 1); }
      }
    }
    g.globalAlpha = 1;
    // shooting stars on the moon
    if (s.biome === 'moon' && s.driveIn < 0.5 && noise1(t * 0.7, 5) > 0.93) {
      const x = (t * 140) % (W + 60) - 30, y = 12 + noise1(Math.floor(t / 4), 6) * 30;
      g.strokeStyle = '#ffffffcc'; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 10, y - 3); g.stroke();
    }
  }

  /** Stateless weather: each particle's position is a function of its index and time, so nothing to simulate. */
  private particles(g: G, W: number, H: number, t: number, s: WarmupSnapshot, scene: Scene, night: number) {
    const scroll = s.d * PPM * 0.6;
    const field = (kind: BiomeLook['particles'], alpha: number) => {
      if (!kind || alpha <= 0.02) return;
      const n = kind === 'leaves' ? 10 : kind === 'dust' ? 24 : kind === 'fireflies' ? 26 : 70;
      for (let i = 0; i < n; i++) {
        const h1 = hash01(i * 7 + 1), h2 = hash01(i * 7 + 2), h3 = hash01(i * 7 + 3);
        let x: number, y: number, c: string, sz = 1, a = alpha;
        if (kind === 'leaves') { x = wrap(h1 * W - scroll * 0.3 + Math.sin(t * 1.5 + i) * 5, W); y = wrap(h2 * H + t * (5 + h3 * 4), H); c = h3 < 0.5 ? '#d59b3e' : '#b96b3c'; sz = 1; }
        else if (kind === 'snow') { x = wrap(h1 * W - scroll * (0.4 + h3) + Math.sin(t + i) * 4, W); y = wrap(h2 * H + t * (10 + h3 * 14), H); c = '#ffffff'; sz = h3 > 0.7 ? 2 : 1; }
        else if (kind === 'ash') { x = wrap(h1 * W - scroll * 0.5 + Math.sin(t * 0.5 + i) * 6, W); y = wrap(h2 * H + t * (5 + h3 * 6), H); c = h3 > 0.85 ? '#ff8a2a' : '#7a6a6a'; }
        else if (kind === 'bubbles') { x = wrap(h1 * W - scroll * 0.3 + Math.sin(t * 2 + i) * 2, W); y = wrap(h2 * H - t * (8 + h3 * 12), H); c = '#d8f6ffaa'; sz = h3 > 0.8 ? 2 : 1; }
        else if (kind === 'fireflies') { x = wrap(h1 * W - scroll * 0.5 + Math.sin(t * 0.7 + i * 3) * 10, W); y = H * 0.45 + h2 * H * 0.35 + Math.sin(t * 0.9 + i) * 6; c = '#f4ff8a'; a = alpha * (0.15 + 0.85 * night) * Math.max(0, Math.sin(t * (1.5 + h3) + i * 2)); }
        else { x = wrap(h1 * W - scroll * 1.6 - t * 30, W); y = H * 0.55 + h2 * H * 0.4; c = '#e8c894'; sz = 1; a = alpha * 0.6; }
        if (a <= 0.02) continue;
        g.globalAlpha = a; g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), sz, sz);
      }
      g.globalAlpha = 1;
    };
    const kinds = new Map<BiomeLook['particles'], number>();
    for (const [l, w] of scene) kinds.set(l.particles, (kinds.get(l.particles) ?? 0) + w);
    for (const [kind, w] of kinds) field(kind, w);
  }

  /** Text and the upcoming-road profile at full resolution. */
  private overlay(s: WarmupSnapshot, RX: number, roadY0: number, UH: number, t: number) {
    const m = this.g, px = this.px, dpr = this.dpr;
    m.textBaseline = 'middle';
    for (const tx of this.texts) {
      m.globalAlpha = tx.alpha ?? 1; m.fillStyle = tx.color; m.textAlign = tx.align ?? 'left';
      m.font = `800 ${Math.round(tx.size * px)}px system-ui, sans-serif`;
      if (tx.glow) { m.shadowColor = tx.glow; m.shadowBlur = 10 * dpr; }
      m.fillText(tx.s, tx.x * px, tx.y * px);
      m.shadowBlur = 0;
    }
    m.globalAlpha = 1;

    // grade chip above the rider
    const g = s.grade, up = g > 0.25, down = g < -0.25;
    const label = !s.hillsOn && s.hill < 0.01 ? 'FLAT' : `${up ? '▲' : down ? '▼' : '■'} ${Math.abs(g).toFixed(1)}%`;
    const kph = formatSpeed(s.v * 3.6, this.units);
    const cx = RX * px, cy = (roadY0 - 36) * px;
    m.font = `800 ${Math.round(15 * dpr)}px system-ui, sans-serif`; m.textAlign = 'center';
    const w = Math.max(m.measureText(label).width, m.measureText(kph).width) + 18 * dpr;
    m.fillStyle = '#05040dcc'; this.round(m, cx - w / 2, cy - 22 * dpr, w, 40 * dpr, 8 * dpr); m.fill();
    m.fillStyle = up ? '#ffb020' : down ? '#2de2a6' : '#e9e6ff'; m.fillText(label, cx, cy - 10 * dpr);
    m.font = `700 ${Math.round(12 * dpr)}px system-ui, sans-serif`; m.fillStyle = '#bdb8e8'; m.fillText(kph, cx, cy + 8 * dpr);

    this.profile(s, UH, t);

    // biome title when you arrive
    const age = t - this.titleAt, title = (this.title || BIOME_NAMES[s.biome]).toUpperCase();
    if (age < 4.5) {
      m.globalAlpha = Math.min(1, age * 2, (4.5 - age) / 1.2);
      m.font = `900 ${Math.round(40 * dpr)}px system-ui, sans-serif`; m.textAlign = 'center';
      m.fillStyle = '#000a'; m.fillText(title, this.canvas.width / 2 + 3 * dpr, UH * px * 0.42 + 3 * dpr);
      m.fillStyle = '#fff'; m.fillText(title, this.canvas.width / 2, UH * px * 0.42);
      m.globalAlpha = 1;
    }
  }

  /** Mini elevation profile of the next ~1.5 km (drawn as tall as on screen), bottom-right above the HUD. */
  private profile(s: WarmupSnapshot, UH: number, _t: number) {
    const m = this.g, dpr = this.dpr, terr = this.terr(s);
    const w = 230 * dpr, h = 56 * dpr, x0 = this.canvas.width - w - 14 * dpr, y0 = UH * this.px - h - 12 * dpr;
    const back = 150, ahead = 1500, n = 92;
    let cache = this.profileCache;
    // Terrain bars change slowly; keep the rider marker and labels live below.
    if (!cache || cache.terrain !== terr || cache.hill !== s.hill || Math.abs(cache.d - s.d) > 10 || _t - cache.at >= 0.1) {
      const es: number[] = [], grades: number[] = [];
      for (let i = 0; i <= n; i++) {
        const dd = s.d - back + ((back + ahead) * i) / n;
        es.push(terr.elev(dd) * s.hill);
        if (i < n) grades.push(s.hill * terr.grade(dd + (back + ahead) / n / 2));
      }
      const lo = Math.min(...es), hi = Math.max(...es);
      cache = this.profileCache = { terrain: terr, hill: s.hill, d: s.d, at: _t, es, grades, lo, span: Math.max(hi - lo, (s.maxGrade / 100) * 120) };
    }
    const { es, grades, lo, span } = cache;
    const X = (i: number) => x0 + (w * i) / n, Y = (e: number) => y0 + h - 8 * dpr - ((e - lo) / span) * (h - 22 * dpr);
    m.fillStyle = '#05040db0'; this.round(m, x0, y0, w, h, 10 * dpr); m.fill();
    for (let i = 0; i < n; i++) {
      const gr = grades[i];
      m.fillStyle = gr > 2 ? '#ff4d6d' : gr > 1 ? '#ffb020' : gr > 0 ? '#b6ff3b' : '#2de2a6';
      m.globalAlpha = i < back / (back + ahead) * n ? 0.35 : 0.9;
      const yy = Y((es[i] + es[i + 1]) / 2);
      m.fillRect(X(i), yy, w / n + 0.5, y0 + h - 6 * dpr - yy);
    }
    m.globalAlpha = 1;
    const ix = ((s.d - cache.d + back) / (back + ahead)) * n;
    m.fillStyle = this.color; m.beginPath(); m.arc(X(ix), Y(terr.elev(s.d) * s.hill) - 3 * dpr, 4 * dpr, 0, Math.PI * 2); m.fill();
    m.font = `700 ${Math.round(11 * dpr)}px system-ui, sans-serif`; m.textAlign = 'left'; m.fillStyle = '#e9e6ff';
    m.fillText(`${formatDistance(s.rodeM / 1000, this.units)} · ▲${formatElevation(s.climbM, this.units)}`, x0 + 8 * dpr, y0 + 9 * dpr);
    m.textAlign = 'right'; m.fillStyle = '#bdb8e8';
    m.fillText(`${BIOME_NAMES[s.nextBiome]} in ${formatUpcoming(s.toNextM, this.units)}`, x0 + w - 8 * dpr, y0 + 9 * dpr);
  }

  private round(m: G, x: number, y: number, w: number, h: number, r: number) {
    m.beginPath(); m.moveTo(x + r, y); m.arcTo(x + w, y, x + w, y + h, r); m.arcTo(x + w, y + h, x, y + h, r);
    m.arcTo(x, y + h, x, y, r); m.arcTo(x, y, x + w, y, r); m.closePath();
  }
}
