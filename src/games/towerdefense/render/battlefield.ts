import type { BikeState } from '../../../contracts';
import { BASE_X, BASE_Y, laneAt, laneLength, PADS } from '../sim/defs';
import type { TdSnapshot } from '../sim/types';
import type { View } from './aliens/layer';
import { along, boundedLights, cableRoute, pulsePosition, strokeTimes, trenchStrip, type Point } from './battlefieldMath';
import { cableHeat } from './overdrive';
import { COL, glowAt } from './sprites';
import { loadImage, loadManifest } from './assets';
interface Overlay { name: string; file: string; glow?: string; offset: number[]; pivot: number[]; size: number[] }
interface Light extends Point { r: number; color: string; strength: number }
const TAU = Math.PI * 2;
export class Battlefield {
  background: HTMLImageElement;
  readonly loaded: Promise<void>;
  private parts = new Map<string, { p: Overlay; image: HTMLImageElement; glow?: HTMLImageElement }>();
  private eggs: HTMLImageElement | null = null;
  private tinted = new Map<string, HTMLCanvasElement>();
  private strips = [0, 1, 2].map(l => trenchStrip(l));
  private cables = PADS.map(p => {
    const route = cableRoute(p.id), samples = Array.from({ length: 121 }, (_, i) => along(route, i / 120));
    const length = route.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - route[i].x, p.y - route[i].y), 0);
    return { route, samples, length };
  });
  private revs: number | null = null;
  private pulseT = 0;
  private pulses: number[] = [];
  private wave = -1;
  private char = new Set<string>();
  private lastT = -1;
  private darkness: HTMLCanvasElement | null = null;
  private lightKey = '';
  constructor(base: string, onBackground: () => void) {
    this.background = new Image();
    const background = loadImage(`${base}td/environment/background.webp`, this.background).then(() => onBackground());
    const overlays = loadManifest<{parts: Overlay[]}>(`${base}td/environment/manifest.json`).then(async m => {
      await Promise.all(m.parts.map(async p => {
        const [image, glow] = await Promise.all([loadImage(`${base}td/environment/${p.file}`), p.glow ? loadImage(`${base}td/environment/${p.glow}`) : undefined]);
        this.parts.set(p.name, {p,image,glow});
      }));
      onBackground();
    });
    const eggs = loadImage(`${base}td/aliens/broodmother/egg_sac.webp`).then(image => { this.eggs = image; });
    this.loaded = Promise.all([background,overlays,eggs]).then(() => {});
  }

  get ready() { return this.background.complete && this.background.naturalWidth > 0; }
  paint(g: CanvasRenderingContext2D, v: View, W: number, H: number) {
    if (!this.ready) return false;
    // Draw the registered map once. Portrait/HUD margins are atmosphere, never copies of lanes.
    const night = '#0d1118';
    g.fillStyle = night; g.fillRect(0, 0, W, H);
    const scale = v.k / 9;
    const x = v.X(0) - 318 * scale, y = v.Y(0) - 32 * scale, w = 1536 * scale, h = 1024 * scale;
    g.drawImage(this.background, x, y, w, h);
    // Feather only the painting's perimeter; keep the playable field and turret crisp.
    // These strips also cover partially offscreen edges without changing world registration.
    const feather = 6 * v.k;
    for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
      [x, y, x, y + feather, x, y, w, feather],
      [x, y + h, x, y + h - feather, x, y + h - feather, w, feather],
      [x, y, x + feather, y, x, y, feather, h],
      [x + w, y, x + w - feather, y, x + w - feather, y, feather, h],
    ]) {
      const edge = g.createLinearGradient(x0, y0, x1, y1);
      edge.addColorStop(0, night); edge.addColorStop(1, 'rgba(13,17,24,0)');
      g.fillStyle = edge; g.fillRect(rx, ry, rw, rh);
    }
    const fog = g.createLinearGradient(0, 0, 0, Math.max(1, y + 12 * v.k));
    fog.addColorStop(0, 'rgba(7,10,17,0.8)'); fog.addColorStop(1, 'rgba(7,10,17,0)');
    g.fillStyle = fog; g.fillRect(0, 0, W, Math.max(0, y + 12 * v.k));
    for (const [name, x, y, size] of [['props_crate', 34, 88, 4], ['props_coolant_barrel', 65, 86, 4], ['props_sandbags_curve', 49, 76, 8]] as const) this.overlay(g, v, name, x, y, size);
    return true;
  }
  private overlay(g: CanvasRenderingContext2D, v: View, name: string, x: number, y: number, width: number, rotation = 0, color?: string) {
    const part = this.parts.get(name); if (!part?.image.complete || !part.image.naturalWidth) return;
    const { p, image } = part, scale = width * v.k / p.size[0];
    g.save(); g.translate(v.X(x), v.Y(y)); g.rotate(rotation); g.scale(scale, scale);
    g.drawImage(image, p.offset[0] - p.pivot[0], p.offset[1] - p.pivot[1]);
    if (color && part.glow?.complete && part.glow.naturalWidth) {
      const key = `${name}|${color}`;
      let tinted = this.tinted.get(key);
      if (!tinted) {
        tinted = document.createElement('canvas'); tinted.width = part.glow.naturalWidth; tinted.height = part.glow.naturalHeight;
        const c = tinted.getContext('2d')!; c.drawImage(part.glow, 0, 0); c.globalCompositeOperation = 'source-in'; c.fillStyle = color; c.fillRect(0, 0, tinted.width, tinted.height); this.tinted.set(key, tinted);
      }
      g.globalCompositeOperation = 'lighter'; g.globalAlpha *= 0.18; g.drawImage(tinted, p.offset[0] - p.pivot[0], p.offset[1] - p.pivot[1]);
    }
    g.restore();
  }
  ground(g: CanvasRenderingContext2D, v: View, s: TdSnapshot) {
    if (s.wave !== this.wave || s.t < this.lastT) { this.wave = s.wave; this.char.clear(); this.pulses = []; this.revs = null; }
    this.lastT = s.t;
    for (let lane = 0; lane < 3; lane++) {
      // A colony at the entry, not an isolated portal dropped into the walking floor.
      const spawn = laneAt(lane, 2), rotation = Math.atan2(-spawn.nx, spawn.ny);
      for (let i = 0; i < 7; i++) {
        const a=i/7*TAU, radius=i===0?0:6.5;
        g.save(); g.globalAlpha=0.8;
        this.overlay(g,v,`creep_${i%6+1}`,spawn.x+Math.cos(a)*radius,spawn.y+Math.sin(a)*radius,11+(i%3),a+rotation,COL[s.brood.color]);
        g.restore();
      }
      this.overlay(g,v,`burrow_${lane+1}`,spawn.x,spawn.y,8,rotation,COL[s.brood.color]);
      if (this.eggs) for (const side of [-1,1]) {
        const x=spawn.x+spawn.nx*side*7, y=spawn.y+spawn.ny*side*7;
        g.save(); g.translate(v.X(x),v.Y(y)); g.rotate(rotation+side*0.4);
        const width=6.4*v.k, height=width*this.eggs.naturalHeight/this.eggs.naturalWidth;
        g.drawImage(this.eggs,-width/2,-height/2,width,height); g.restore();
      }
      if (s.phase !== 'run' || s.lull > 0 || s.over) continue;
      const advance = Math.min(0.92, s.waveElapsed / Math.max(1, s.waveMaxS) * 1.15);
      // Clip organic decals to the actual floor so shoulders retain their painted texture.
      g.save(); const strip = this.strips[lane]; g.beginPath(); strip.forEach((p, i) => i ? g.lineTo(v.X(p.x), v.Y(p.y)) : g.moveTo(v.X(p.x), v.Y(p.y))); g.closePath(); g.clip();
      for (let i = 0; i < 16; i++) {
        if ((i + 0.5) / 16 > advance) break;
        const p = laneAt(lane, laneLength(lane) * (i + 0.5) / 16), key = `${lane}:${i}`;
        const a = Math.atan2(p.x - BASE_X, BASE_Y - p.y);
        let da = a - s.aimAngle; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
        if (s.flaming && Math.hypot(p.x - BASE_X, p.y - BASE_Y) < s.flameRange && Math.abs(da) < s.flameHalfAngle + 0.08) this.char.add(key);
        if (this.char.has(key)) {
          g.fillStyle = 'rgba(15,12,10,0.6)'; g.beginPath(); g.ellipse(v.X(p.x), v.Y(p.y), 4.8 * v.k, 3 * v.k, Math.atan2(-p.nx, p.ny), 0, TAU); g.fill();
        } else {
          g.globalAlpha = 0.65; this.overlay(g, v, `creep_${i % 6 + 1}`, p.x, p.y, 9, Math.atan2(-p.nx, p.ny), COL[s.brood.color]); g.globalAlpha = 1;
        }
      }
      g.restore();
    }
  }
  /** `heat` 0..1: Overdrive turns the cables white-hot and speeds up their pulses. */
  wiring(g: CanvasRenderingContext2D, v: View, s: TdSnapshot, bike: Readonly<BikeState>, heat = 0) {
    const H = cableHeat(heat);
    if (this.revs !== null) this.pulses.push(...strokeTimes(this.revs, bike.crankRevs, this.pulseT, s.t));
    this.pulseT = s.t;
    this.revs = bike.crankRevs;
    this.pulses = this.pulses.filter(t => s.t - t <= 3).slice(-12);
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    for (const tw of s.towers) {
      const c = this.cables[tw.pad];
      // Machinery covers the ends naturally; the entire cable remains connected, including its pulses.
      const path = () => { g.beginPath(); c.samples.forEach((p, i) => { if (i === 0) g.moveTo(v.X(p.x), v.Y(p.y)); else g.lineTo(v.X(p.x), v.Y(p.y)); }); };
      if (H.glow) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = H.glow.alpha; g.strokeStyle = H.glow.color; g.lineWidth = H.glow.width * v.k; path(); g.stroke(); g.restore(); }
      for (const [color, width] of [['#0b0e12', 1.1], [H.sheath, 0.56], [H.core, 0.3]] as const) {
        g.strokeStyle = color; g.lineWidth = Math.max(0.6, width * v.k); path(); g.stroke();
      }
      for (const t of this.pulses) {
        const fraction = pulsePosition((s.t - t) * H.pulseSpeed, c.length); if (fraction === null) continue;
        const p = along(c.route, fraction);
        glowAt(g, H.pulseColor, v.X(p.x), v.Y(p.y), 1.6 * v.k * H.pulseSize, 0.7);
        g.fillStyle = heat > 0.3 ? '#ffffff' : '#b8faff'; g.beginPath(); g.arc(v.X(p.x), v.Y(p.y), 0.4 * v.k * H.pulseSize, 0, TAU); g.fill();
      }
    }
    g.restore();
  }
  lighting(g: CanvasRenderingContext2D, v: View, s: TdSnapshot, W: number, H: number) {
    const lights: Light[] = [{ x: BASE_X, y: BASE_Y, r: 16, color: '#71e8ff', strength: 0.22 }];
    for (const tw of s.towers) { const p = PADS[tw.pad]; lights.push({ x: p.x, y: p.y, r: 8, color: COL[tw.kind === 'tesla' ? 'blue' : tw.kind === 'mortar' ? 'red' : 'purple'], strength: 0.14 }); }
    const ambientCount = lights.length;
    if (s.flaming) for (let i = 1; i <= 3; i++) lights.push({ x: BASE_X + Math.sin(s.aimAngle) * s.flameRange * i / 4, y: BASE_Y - Math.cos(s.aimAngle) * s.flameRange * i / 4, r: 10, color: '#ff9449', strength: 0.25 });
    for (const f of s.fx) {
      const strength = Math.max(0, 1 - (s.t - f.t0) / f.life) * 0.3; if (!strength || s.t < f.t0) continue;
      if (f.kind === 'tracer') lights.push({ x: f.x0, y: f.y0, r: 7, color: '#9bdcff', strength });
      else if (f.kind === 'boom' || f.kind === 'burst') lights.push({ x: f.x, y: f.y, r: Math.max(7, f.r * 1.5), color: '#ff9b50', strength });
      else if (f.kind === 'zap') for (const p of f.pts) lights.push({ ...p, r: 7, color: '#7cecff', strength });
      else if (f.kind === 'lens') lights.push({ x: f.x1, y: f.y1, r: 9, color: '#c694ff', strength });
      else if (f.kind === 'beam') for (let i = 1; i <= 4; i++) lights.push({ x: BASE_X + Math.sin(f.angle) * i * 22, y: BASE_Y - Math.cos(f.angle) * i * 22, r: 12, color: '#be91ff', strength });
    }
    const selected = boundedLights(lights);
    // Cache the punched ambient map until structures or layout change. Transient weapon light
    // uses additive sprites below, keeping dynamic canvas uploads out of the per-frame path.
    const w = Math.max(1, Math.ceil(W / 4)), h = Math.max(1, Math.ceil(H / 4));
    const key = `${w}|${h}|${v.k}|${v.X(0)}|${v.Y(0)}|${s.towers.map(t => t.pad).join(',')}`;
    if (!this.darkness) this.darkness = document.createElement('canvas');
    if (key !== this.lightKey) {
      this.lightKey = key; this.darkness.width = w; this.darkness.height = h;
      const d = this.darkness.getContext('2d')!;
      d.fillStyle = 'rgba(6,9,18,0.28)'; d.fillRect(0, 0, w, h); d.globalCompositeOperation = 'destination-out';
      for (const light of selected.slice(0, ambientCount)) {
        const x = v.X(light.x) / 4, y = v.Y(light.y) / 4, r = light.r * v.k / 4;
        const gradient = d.createRadialGradient(x, y, 0, x, y, r); gradient.addColorStop(0, 'rgba(0,0,0,0.9)'); gradient.addColorStop(1, 'rgba(0,0,0,0)');
        d.fillStyle = gradient; d.fillRect(x - r, y - r, r * 2, r * 2);
      }
      d.globalCompositeOperation = 'source-over';
    }
    g.drawImage(this.darkness, 0, 0, W, H);
    g.save(); g.globalCompositeOperation = 'lighter'; for (const light of selected) glowAt(g, light.color, v.X(light.x), v.Y(light.y), light.r * v.k, light.strength); g.restore();
  }
}
