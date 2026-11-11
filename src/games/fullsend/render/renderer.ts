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
import { layout, type FullSendLayout } from './layout';
import { drawCanyonFloor, drawChaser, drawHayOnRider, drawLoop, drawObstacle, drawRocket, drawWater } from './props';

const PPM = 4.5;          // low-res px per metre: the bike is ~6 m long, so the ground has to fly past to read as 80+ mph
const VPM = PPM;          // vertical px per metre
const MID_PARALLAX = 0.5, FORE_PARALLAX = 1.6, BACK_PARALLAX = 0.05;
const MID_SLOT = 15, FORE_SLOT = 9;
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
  private camY = NaN; private lastNow = 0; private riderFrac = 0.28;
  private L!: FullSendLayout;

  mount(container: HTMLElement, ctx: { profile: Readonly<Profile>; insets?: Insets }) {
    this.units = unitsFor(ctx.profile);
    this.color = ctx.profile.color;
    this.look = riderLook({ ...ctx.profile, level: ctx.profile.level ?? 1, achievements: ctx.profile.achievements ?? [] });
    if (ctx.insets) this.insets = ctx.insets;
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'width:100%;height:100%;display:block;background:#4fa3e8';
    container.appendChild(this.canvas);
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
    this.px = Math.max(2, Math.floor(this.canvas.height / 230));
    this.LW = Math.ceil(this.canvas.width / this.px); this.LH = Math.ceil(this.canvas.height / this.px);
    this.buf.width = this.scratch.width = this.LW; this.buf.height = this.scratch.height = this.LH;
    this.L = layout(w, h, this.insets.bottom, this.insets.top);
  }
  unmount() { this.canvas?.remove(); }

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
    const roadH = (x: number) => s.hill * terr.elev(x / s.stretch) * s.stretch;
    const p = s.piece;
    const lift = (x: number) => rampLift(p, x);
    // A loop is drawn round (PPM both ways) and is taller than the space above the road, so the camera rises to fit it.
    const loopOnScreen = p?.kind === 'loop' && (s.phase === 'effort' || s.phase === 'payoff') && RX + (p.x0 - p.len - s.camX) * PPM < W + 30;
    const loopLift = loopOnScreen ? Math.max(0, (2 * p!.len * PPM + 16 - roadY0) / VPM) : 0;
    const camTarget = roadH(s.camX) + (p?.kind === 'leap' ? lift(s.camX) : 0) + loopLift;
    this.camY = Number.isFinite(this.camY) ? this.camY + (camTarget - this.camY) * Math.min(1, dt * 5) : camTarget;
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
    const backY = Math.round(UH * 0.5);
    this.layer(scene, (l, gg) => l.backdrop(gg, W, backY, s.camX * PPM * BACK_PARALLAX, t));
    const solid = 1 - wsum((l) => (l.openSky ? 1 : 0));
    const midBase = Math.round(UH * 0.62), mu = s.camX * PPM * MID_PARALLAX;
    const midY = (lx: number) => midBase + Math.sin(lx / 60) * 2 + Math.sin(lx / 23);
    g.globalAlpha = solid; g.fillStyle = col((l) => l.mid);
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

    // ---- the rider and the rocket ----
    const look = this.look ?? riderLook({ level: 1, achievements: [], color: this.color });
    const air = s.mode === 'air' || s.mode === 'fall' || s.mode === 'rescue';
    const ry = s.y + (p?.kind === 'leap' ? (air ? RAMP_H : lift(s.x)) : 0);
    const inLoop = p?.kind === 'loop' && (s.mode === 'loop' || s.mode === 'drop');
    const rx = sx(s.x), ryy = inLoop ? sy(0) - s.y * PPM : sy(ry);
    let rot = s.pitch;
    if (s.trick) {
      const a = Math.min(1, s.trick.age / 0.9);
      if (s.trick.name === 'Backflip') rot += a * Math.PI * 2;
    }
    const shake = s.mode === 'bounce' ? Math.sin(t * 60) * 1.5 : s.mode === 'smash' ? Math.sin(t * 45) : 0;
    const gearL = LOOKS[s.biome].rider;
    g.save(); g.translate(Math.round(rx + shake), Math.round(ryy)); g.rotate(-rot);
    const flame = s.phase === 'effort' ? Math.min(1.6, s.ftpFrac) : Math.min(0.8, s.ftpFrac);
    drawRocket(g, flame, t, s.v);
    if (s.trick && s.trick.name !== 'Backflip') { g.translate(0, -Math.sin(Math.min(1, s.trick.age / 0.9) * Math.PI) * 4); }
    drawRider(g, look, bike.crankRevs, s.x, { t, speed: Math.min(s.v, 20), gear: gearL === 'road' ? null : gearL });
    if (s.hay > 0.02 || s.mode === 'smash') drawHayOnRider(g, Math.max(s.hay, s.mode === 'smash' ? 0.3 : 0), t);
    g.restore();

    // ---- foreground and speed lines ----
    const fu = s.camX * PPM * FORE_PARALLAX;
    const f0 = Math.floor((fu - RX - 10) / FORE_SLOT), f1 = Math.ceil((fu - RX + W + 10) / FORE_SLOT);
    this.layer(scene, (l, gg) => {
      for (let kk = f0; kk <= f1; kk++) {
        const x = kk * FORE_SLOT - fu + RX;
        if (inGap(x)) continue;
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

    const m = this.g;
    m.imageSmoothingEnabled = false;
    m.drawImage(this.buf, 0, 0, W * this.px, H * this.px);
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

    // speed (top-left)
    panel(L.speed, 0.55);
    m.textAlign = 'left'; m.fillStyle = '#ffffff'; m.font = font(900, 26);
    const spd = formatSpeed(s.v * 3.6, this.units).replace(/\.\d/, '');
    m.fillText(spd, (L.speed.x + 12) * d, (L.speed.y + 22) * d);
    m.font = font(700, 12); m.fillStyle = '#bdb8e8';
    m.fillText(`${s.grade > 0 ? '▲' : s.grade < 0 ? '▼' : '■'} ${Math.abs(s.grade).toFixed(1)}% on the trainer`, (L.speed.x + 12) * d, (L.speed.y + 44) * d);

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
