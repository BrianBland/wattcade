import type { BikeState, GameRenderer, InputState, Insets, Profile } from '../../../contracts';
import type { WarmupSnapshot } from '../sim/sim';
import { BIOME_NAMES, biomeAt, biomeIdAt, hash01, makeTerrain, type BiomeId, type Terrain } from '../sim/terrain';
import { LOOKS, noise1, type G } from './biomes';
import { drawRider } from './rider';

const PPM = 9;            // low-res px per metre along the road
const RIDGE_M_PER_PX = 4; // the far ridge shows the same road, zoomed out
const MID_PARALLAX = 0.5, FORE_PARALLAX = 1.35, BACK_PARALLAX = 0.05;
const MID_SLOT = 15, FORE_SLOT = 9;

interface Actor { kind: 'bird' | 'gull' | 'ufo'; x: number; y: number; vx: number; t0: number; seed: number; beamAt: number }
interface Text { s: string; x: number; y: number; size: number; color: string; align?: CanvasTextAlign; alpha?: number }

// ---- colour helpers ----
const rgbCache = new Map<string, [number, number, number]>();
function rgb(hex: string): [number, number, number] {
  let c = rgbCache.get(hex);
  if (!c) { const n = parseInt(hex.slice(1, 7), 16); c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; rgbCache.set(hex, c); }
  return c;
}
export function mixColor(a: string, b: string, t: number): string {
  if (t <= 0) return a; if (t >= 1) return b;
  const x = rgb(a), y = rgb(b);
  return `rgb(${Math.round(x[0] + (y[0] - x[0]) * t)},${Math.round(x[1] + (y[1] - x[1]) * t)},${Math.round(x[2] + (y[2] - x[2]) * t)})`;
}

/** Side-scrolling pixel scenery. Draws a low-res buffer, upscales it crisply, then overlays text at full resolution. */
export class WarmupRenderer implements GameRenderer {
  private canvas!: HTMLCanvasElement; private g!: G;
  private buf!: HTMLCanvasElement; private b!: G;
  private dpr = 1; private px = 3; private LW = 300; private LH = 200;
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private color = '#00f0ff';
  private terrain: { key: string; t: Terrain } | null = null;
  private actors: Actor[] = []; private nextActorAt = 0;
  private lastBiome: BiomeId | null = null; private titleAt = -99;
  private texts: Text[] = [];
  private lastNow = 0;

  mount(container: HTMLElement, ctx: { profile: Readonly<Profile>; insets?: Insets }) {
    this.color = ctx.profile.color;
    if (ctx.insets) this.insets = ctx.insets;
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'width:100%;height:100%;display:block;background:#4fa3e8';
    container.appendChild(this.canvas);
    this.g = this.canvas.getContext('2d')!;
    this.buf = document.createElement('canvas');
    this.b = this.buf.getContext('2d')!;
    this.resize(container.clientWidth || 800, container.clientHeight || 600);
  }
  setInsets(i: Insets) { this.insets = i; }
  resize(w: number, h: number) {
    this.dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
    this.px = Math.max(2, Math.floor(this.canvas.height / 230));
    this.LW = Math.ceil(this.canvas.width / this.px); this.LH = Math.ceil(this.canvas.height / this.px);
    this.buf.width = this.LW; this.buf.height = this.LH;
  }
  unmount() { this.canvas?.remove(); }

  private terr(s: WarmupSnapshot): Terrain {
    const key = `${s.terrainSeed}:${s.maxGrade}`;
    if (this.terrain?.key !== key) this.terrain = { key, t: makeTerrain(s.terrainSeed, s.maxGrade) };
    return this.terrain.t;
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
    const cur = LOOKS[s.biome], nxt = LOOKS[s.nextBiome], mix = s.mix;
    const RX = Math.round(W * 0.3), roadY0 = Math.round(UH * 0.8);
    const roadY = (dd: number) => roadY0 - (terr.elev(dd) - terr.elev(s.d)) * vscale;
    const biomeM = s.biomeM, start = s.startBiome;
    const lookAt = (dd: number) => LOOKS[biomeIdAt(dd, biomeM, start)];
    /** Smoothly blended band colour (ground, road, ...) at a road distance; props use lookAt() instead. */
    const band = (dd: number, k: 'mid' | 'ground' | 'groundDark' | 'road' | 'roadEdge') => {
      const b = biomeAt(dd, biomeM, start);
      return mixColor(LOOKS[b.cur][k], LOOKS[b.next][k], b.mix);
    };
    const roadKindAt = (dd: number) => { const b = biomeAt(dd, biomeM, start); return LOOKS[b.mix < 0.5 ? b.cur : b.next].roadKind; };
    this.texts = [];

    if (s.biome !== this.lastBiome) { if (this.lastBiome) this.titleAt = t; this.lastBiome = s.biome; }

    // ---- sky ----
    const sky = g.createLinearGradient(0, 0, 0, UH * 0.7);
    sky.addColorStop(0, mixColor(cur.sky[0], nxt.sky[0], mix)); sky.addColorStop(1, mixColor(cur.sky[1], nxt.sky[1], mix));
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const stars = cur.stars + (nxt.stars - cur.stars) * mix;
    if (stars > 0.02) {
      for (let i = 0; i < 90; i++) {
        const x = hash01(i * 3 + 1) * W, y = hash01(i * 3 + 2) * UH * 0.6;
        g.globalAlpha = stars * (0.5 + 0.5 * Math.sin(t * (1 + hash01(i) * 2) + i));
        g.fillStyle = '#fff'; g.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
      g.globalAlpha = 1;
    }
    g.globalAlpha = 1 - mix; cur.celestial(g, W, UH, t);
    g.globalAlpha = mix; if (mix > 0) nxt.celestial(g, W, UH, t);
    g.globalAlpha = 1;
    if (stars < 0.6) this.clouds(g, W, UH, t, s.d, Math.pow(1 - stars / 0.6, 2));

    // ---- distant backdrop ----
    const backY = Math.round(UH * 0.5), bu = s.d * PPM * BACK_PARALLAX;
    g.globalAlpha = 1; cur.backdrop(g, W, backY, bu, t);
    if (mix > 0) { g.globalAlpha = mix; nxt.backdrop(g, W, backY, bu, t); g.globalAlpha = 1; }

    // ---- the real road, seen from afar (rolling ridge) ----
    const ridgeBase = Math.round(UH * 0.6), ridgeV = Math.max(0.6, s.hill * s.exaggeration * 0.7);
    const ridgeAt = (x: number) => { const uu = s.d + (x - RX) * RIDGE_M_PER_PX; return ridgeBase - (terr.elev(uu) - terr.elev(s.d)) * ridgeV; };
    g.fillStyle = mixColor(cur.ridge, nxt.ridge, mix);
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 2) g.lineTo(x, ridgeAt(x));
    g.lineTo(W, H); g.closePath(); g.fill();
    g.strokeStyle = '#ffffff40'; g.lineWidth = 1; g.beginPath();
    for (let x = 0; x <= W; x += 2) { const y = ridgeAt(x) + 2; if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();

    // ---- mid layer: ground band + props ----
    const midBase = Math.round(UH * 0.7), mu = s.d * PPM * MID_PARALLAX;
    const midY = (lx: number) => midBase + Math.sin(lx / 60) * 2 + Math.sin(lx / 23) * 1;
    for (let x = 0; x < W; x += 2) {
      const lx = x + mu - RX;
      g.fillStyle = band(lx / (PPM * MID_PARALLAX), 'mid');
      const y = Math.round(midY(lx)); g.fillRect(x, y, 2, H - y);
    }
    const k0 = Math.floor((mu - RX - 30) / MID_SLOT), k1 = Math.ceil((mu - RX + W + 30) / MID_SLOT);
    for (let k = k0; k <= k1; k++) {
      const lx = k * MID_SLOT + (hash01(k * 17 + 3) - 0.5) * 8;
      const x = lx - mu + RX, h = hash01(k * 31 + 5);
      lookAt(lx / (PPM * MID_PARALLAX)).midProp(g, h, Math.round(x), Math.round(midY(lx)) + 1, t);
    }

    // ---- boundary sign (before the next biome) ----
    const signD = (Math.floor(s.d / biomeM) + 1) * biomeM - 25;
    for (const sd of [signD, signD - biomeM]) {
      const sx = RX + (sd - s.d) * PPM;
      if (sx < -40 || sx > W + 40) continue;
      const sy = roadY(sd);
      const toward = biomeAt(sd + 30, biomeM, start).cur;
      g.fillStyle = '#6b4a2a'; g.fillRect(Math.round(sx), Math.round(sy - 16), 2, 16);
      g.fillStyle = '#f4ecd8'; g.fillRect(Math.round(sx - 14), Math.round(sy - 24), 30, 9);
      g.fillStyle = '#6b4a2a'; g.fillRect(Math.round(sx - 14), Math.round(sy - 16), 30, 1);
      // text sits over everything at full res, so fade it while the rider passes in front of the board
      const clear = Math.min(1, Math.max(0, (Math.abs(sx - RX) - 12) / 14));
      if (clear > 0) this.texts.push({ s: `${BIOME_NAMES[toward]} ›`, x: sx + 1, y: sy - 19.5, size: 5, color: '#3a2a1a', align: 'center', alpha: clear });
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
      else if (kind === 'dust' && hash01(Math.floor(dd * PPM)) < 0.2) { g.fillStyle = edge; g.fillRect(x, y + 1 + Math.floor(hash01(x + Math.floor(dd)) * 3), 1, 1); }
    }

    // ---- rider ----
    const slope = (s.grade / 100) * s.exaggeration;   // drawn slope (exaggerated like the road)
    const moonBob = s.biome === 'moon' && s.v > 1 ? -Math.abs(Math.sin(t * 2.2)) * 2 : 0;
    g.save(); g.translate(RX, roadY0 + 0.5 + moonBob); g.rotate(-Math.atan(slope));
    drawRider(g, { jersey: this.color, helmet: s.biome === 'moon' ? 'bubble' : 'road' }, bike.crankRevs, s.d);
    g.restore();

    // ---- foreground bits ----
    const fu = s.d * PPM * FORE_PARALLAX;
    const f0 = Math.floor((fu - RX - 10) / FORE_SLOT), f1 = Math.ceil((fu - RX + W + 10) / FORE_SLOT);
    for (let k = f0; k <= f1; k++) {
      const lx = k * FORE_SLOT, x = lx - fu + RX, dd = s.d + (x - RX) / PPM;
      const h = hash01(k * 13 + 9);
      lookAt(lx / (PPM * FORE_PARALLAX)).foreProp(g, h, Math.round(x), Math.round(roadY(dd) + 10 + hash01(k * 5) * 12));
    }

    this.updateActors(g, W, UH, t, dt, s);

    // ---- blit + full-res overlay ----
    const m = this.g;
    m.imageSmoothingEnabled = false;
    m.drawImage(this.buf, 0, 0, W * this.px, H * this.px);
    this.overlay(s, RX, roadY0, UH, t);
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

  private updateActors(g: G, W: number, UH: number, t: number, dt: number, s: WarmupSnapshot) {
    if (t >= this.nextActorAt) {
      const kind: Actor['kind'] | null = s.biome === 'moon' ? 'ufo' : s.biome === 'seaside' ? 'gull' : 'bird';
      const n = kind === 'ufo' ? 1 : 2 + Math.floor(Math.random() * 4);
      const fromLeft = Math.random() < 0.5;
      for (let i = 0; i < n; i++) {
        const vx = (kind === 'ufo' ? 28 + Math.random() * 30 : 10 + Math.random() * 6) * (fromLeft ? 1 : -1);
        this.actors.push({ kind, x: (fromLeft ? -20 : W + 20) - i * 7 * Math.sign(vx), y: 18 + Math.random() * UH * 0.25 + i * 3, vx, t0: t, seed: Math.random(), beamAt: kind === 'ufo' && Math.random() < 0.6 ? 0.3 + Math.random() * 0.4 : -1 });
      }
      this.nextActorAt = t + (kind === 'ufo' ? 9 + Math.random() * 14 : 6 + Math.random() * 10);
    }
    this.actors = this.actors.filter((a) => a.x > -60 && a.x < W + 60 && t - a.t0 < 60);
    for (const a of this.actors) {
      const age = t - a.t0;
      if (a.kind === 'ufo') {
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
      } else {
        a.x += a.vx * dt;
        const flap = Math.sin(age * (a.kind === 'gull' ? 5 : 9) + a.seed * 6) > 0 ? -1.5 : 0.5;
        const y = a.y + Math.sin(age * 0.8 + a.seed * 4) * 2, w = a.kind === 'gull' ? 4 : 2.5;
        g.strokeStyle = a.kind === 'gull' ? '#ffffff' : '#2b2b36'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(a.x - w, y + flap); g.lineTo(a.x, y); g.lineTo(a.x + w, y + flap); g.stroke();
      }
    }
    // shooting stars on the moon
    if (s.biome === 'moon' && noise1(t * 0.7, 5) > 0.93) {
      const x = (t * 140) % (W + 60) - 30, y = 12 + noise1(Math.floor(t / 4), 6) * 30;
      g.strokeStyle = '#ffffffcc'; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 10, y - 3); g.stroke();
    }
  }

  /** Text and the upcoming-road profile at full resolution. */
  private overlay(s: WarmupSnapshot, RX: number, roadY0: number, UH: number, t: number) {
    const m = this.g, px = this.px, dpr = this.dpr;
    m.textBaseline = 'middle';
    for (const tx of this.texts) {
      m.globalAlpha = tx.alpha ?? 1; m.fillStyle = tx.color; m.textAlign = tx.align ?? 'left';
      m.font = `800 ${Math.round(tx.size * px)}px system-ui, sans-serif`;
      m.fillText(tx.s, tx.x * px, tx.y * px);
    }
    m.globalAlpha = 1;

    // grade chip above the rider
    const g = s.grade, up = g > 0.25, down = g < -0.25;
    const label = !s.hillsOn && s.hill < 0.01 ? 'FLAT' : `${up ? '▲' : down ? '▼' : '■'} ${Math.abs(g).toFixed(1)}%`;
    const kph = `${(s.v * 3.6).toFixed(1)} km/h`;
    const cx = RX * px, cy = (roadY0 - 36) * px;
    m.font = `800 ${Math.round(15 * dpr)}px system-ui, sans-serif`; m.textAlign = 'center';
    const w = Math.max(m.measureText(label).width, m.measureText(kph).width) + 18 * dpr;
    m.fillStyle = '#05040dcc'; this.round(m, cx - w / 2, cy - 22 * dpr, w, 40 * dpr, 8 * dpr); m.fill();
    m.fillStyle = up ? '#ffb020' : down ? '#2de2a6' : '#e9e6ff'; m.fillText(label, cx, cy - 10 * dpr);
    m.font = `700 ${Math.round(12 * dpr)}px system-ui, sans-serif`; m.fillStyle = '#bdb8e8'; m.fillText(kph, cx, cy + 8 * dpr);

    this.profile(s, UH, t);

    // biome title when you arrive
    const age = t - this.titleAt;
    if (age < 4.5) {
      m.globalAlpha = Math.min(1, age * 2, (4.5 - age) / 1.2);
      m.font = `900 ${Math.round(40 * dpr)}px system-ui, sans-serif`; m.textAlign = 'center';
      m.fillStyle = '#000a'; m.fillText(BIOME_NAMES[s.biome].toUpperCase(), this.canvas.width / 2 + 3 * dpr, UH * px * 0.42 + 3 * dpr);
      m.fillStyle = '#fff'; m.fillText(BIOME_NAMES[s.biome].toUpperCase(), this.canvas.width / 2, UH * px * 0.42);
      m.globalAlpha = 1;
    }
  }

  /** Mini elevation profile of the next ~1.5 km (drawn as tall as on screen), bottom-right above the HUD. */
  private profile(s: WarmupSnapshot, UH: number, _t: number) {
    const m = this.g, dpr = this.dpr, terr = this.terr(s);
    const w = 230 * dpr, h = 56 * dpr, x0 = this.canvas.width - w - 14 * dpr, y0 = UH * this.px - h - 12 * dpr;
    const back = 150, ahead = 1500, n = 92;
    const xs: number[] = [], es: number[] = [];
    for (let i = 0; i <= n; i++) { const dd = s.d - back + ((back + ahead) * i) / n; xs.push(dd); es.push(terr.elev(dd) * s.hill); }
    const lo = Math.min(...es), hi = Math.max(...es), span = Math.max(hi - lo, (s.maxGrade / 100) * 120);
    const X = (i: number) => x0 + (w * i) / n, Y = (e: number) => y0 + h - 8 * dpr - ((e - lo) / span) * (h - 22 * dpr);
    m.fillStyle = '#05040db0'; this.round(m, x0, y0, w, h, 10 * dpr); m.fill();
    for (let i = 0; i < n; i++) {
      const gr = s.hill * terr.grade((xs[i] + xs[i + 1]) / 2);
      m.fillStyle = gr > 2 ? '#ff4d6d' : gr > 1 ? '#ffb020' : gr > 0 ? '#b6ff3b' : '#2de2a6';
      m.globalAlpha = xs[i] < s.d ? 0.35 : 0.9;
      const yy = Y((es[i] + es[i + 1]) / 2);
      m.fillRect(X(i), yy, w / n + 0.5, y0 + h - 6 * dpr - yy);
    }
    m.globalAlpha = 1;
    const ix = (back / (back + ahead)) * n;
    m.fillStyle = this.color; m.beginPath(); m.arc(X(ix), Y(terr.elev(s.d) * s.hill) - 3 * dpr, 4 * dpr, 0, Math.PI * 2); m.fill();
    m.font = `700 ${Math.round(11 * dpr)}px system-ui, sans-serif`; m.textAlign = 'left'; m.fillStyle = '#e9e6ff';
    m.fillText(`${(s.rodeM / 1000).toFixed(2)} km · ▲${Math.round(s.climbM)} m`, x0 + 8 * dpr, y0 + 9 * dpr);
    m.textAlign = 'right'; m.fillStyle = '#bdb8e8';
    m.fillText(`${BIOME_NAMES[s.nextBiome]} in ${s.toNextM >= 1000 ? `${(s.toNextM / 1000).toFixed(1)} km` : `${Math.round(s.toNextM / 10) * 10} m`}`, x0 + w - 8 * dpr, y0 + 9 * dpr);
  }

  private round(m: G, x: number, y: number, w: number, h: number, r: number) {
    m.beginPath(); m.moveTo(x + r, y); m.arcTo(x + w, y, x + w, y + h, r); m.arcTo(x + w, y + h, x, y + h, r);
    m.arcTo(x, y + h, x, y, r); m.arcTo(x, y, x + w, y, r); m.closePath();
  }
}
