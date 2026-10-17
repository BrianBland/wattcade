import type { BikeState } from '../../../contracts';
import { BASE_X, BASE_Y, laneAt, laneLength, lanePolyline, PADS } from '../sim/defs';
import type { TdSnapshot } from '../sim/types';
import type { View } from './aliens/layer';
import { along, boundedLights, cableRoute, pulsePosition, strokeTimes, trenchStrip, type Point } from './battlefieldMath';
import { COL, glowAt } from './sprites';
import { loadImage, loadManifest } from './assets';
interface Overlay { name: string; file: string; glow?: string; offset: number[]; pivot: number[]; size: number[] }
interface Light extends Point { r: number; color: string; strength: number }
const TAU = Math.PI * 2;
const at = (v: View, x: number, y: number) => v.P?.(x, y) ?? { x: v.X(x), y: v.Y(y) };
export class Battlefield {
  background: HTMLImageElement;
  readonly loaded: Promise<void>;
  private parts = new Map<string, { p: Overlay; image: HTMLImageElement; glow?: HTMLImageElement }>();
  private eggs: HTMLImageElement | null = null;
  private rock: HTMLImageElement | null = null;
  private rockB: HTMLImageElement | null = null;
  private rockC: HTMLImageElement | null = null;
  private dirt: HTMLImageElement | null = null;
  private pipe: HTMLImageElement | null = null;
  private pipes: HTMLImageElement[] = [];
  private boil: HTMLImageElement | null = null;
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
    const tiles = Promise.all([
      loadImage(`${base}td/environment/tiles/rock.png`).then(image => { this.rock = image; onBackground(); }),
      loadImage(`${base}td/environment/tiles/rock-b.png`).then(image => { this.rockB = image; onBackground(); }),
      loadImage(`${base}td/environment/tiles/rock-c.png`).then(image => { this.rockC = image; onBackground(); }),
      loadImage(`${base}td/environment/tiles/dirt.png`).then(image => { this.dirt = image; onBackground(); }),
      loadImage(`${base}td/environment/tiles/pipe.png`).then(image => { this.pipe = image; onBackground(); }),
      ...['pipe-a', 'pipe-b', 'pipe-c'].map(name => loadImage(`${base}td/environment/tiles/${name}.png`).then(image => { this.pipes.push(image); onBackground(); })),
      loadImage(`${base}td/environment/tiles/boil.png`).then(image => { this.boil = image; onBackground(); }),
    ]);
    this.loaded = Promise.all([background, overlays, eggs, tiles]).then(() => {});
  }

  get ready() { return this.parts.size > 0 && !!this.rock?.complete && !!this.dirt?.complete; }
  paint(g: CanvasRenderingContext2D, v: View, W: number, H: number) {
    if (!this.ready) return false;
    // A wrapping rock tile, cut from the original painting. Corruption is a tint by distance from the
    // outpost, so one tile covers owned ground, the scrap band, and the hive.
    // Tiles, road, rubble edge, then debris and creep. Filters come after, in stain().
    g.fillStyle = '#0d1118'; g.fillRect(0, 0, W, H);
    this.tileGround(g, v, W, H);
    this.roads(g, v, W, H);
    this.scatter(g, v, W, H);
    this.anchors(g, v);
    for (const [name, x, y, size] of [['props_crate', 34, 88, 4], ['props_coolant_barrel', 65, 86, 4], ['props_sandbags_curve', 49, 76, 8]] as const) this.overlay(g, v, name, x, y, size);
    return true;
  }
  /** Two rock tiles, offset by half a cell, so the repeat does not line up into a grid. */
  private tileGround(g: CanvasRenderingContext2D, v: View, W: number, H: number) {
    const a = this.rock, b = this.rockB ?? a, c = this.rockC;
    if (!a?.complete || !a.naturalWidth) return;
    const size = 30 * v.k, half = size / 2;
    const origin = (p: number) => p - Math.ceil(p / size) * size;
    const x0 = origin(v.X(0)), y0 = origin(v.Y(0));
    const tiles = [a, b!, c?.complete ? c : a];
    for (let y = y0; y < H; y += size) for (let x = x0; x < W; x += size) {
      const cx = Math.round((x - x0) / size), cy = Math.round((y - y0) / size);
      g.drawImage(tiles[(cx + cy * 2) % tiles.length], x, y, size + 1, size + 1);
    }
    // The second tile shifted half a cell covers the first tile's seams.
    if (b && b !== a) {
      g.save(); g.globalAlpha = 0.5;
      for (let y = y0 - half; y < H; y += size) for (let x = x0 - half; x < W; x += size) g.drawImage(b, x, y, size + 1, size + 1);
      g.restore();
    }
  }
  /** Drawn per frame: the cached ground is built before the field position is known. */
  stain(g: CanvasRenderingContext2D, v: View, W: number, H: number) {
    // Rotated: world y runs across the screen. Y() samples x = 0, so it cannot show that.
    const a = v.P?.(0, 0) ?? { x: v.X(0), y: v.Y(0) }, b = v.P?.(0, 50) ?? { x: v.X(0), y: v.Y(50) };
    const turned = Math.abs(a.x - b.x) > Math.abs(a.y - b.y);
    // On the spawn edge, not past it and not on the turret. Landscape hive is the right edge.
    const hive = turned ? { x: W * 0.92, y: H / 2 } : { x: W / 2, y: H * 0.02 };
    const reach = turned ? W * 0.42 : H * 0.46;
    const stain = g.createRadialGradient(hive.x, hive.y, reach * 0.15, hive.x, hive.y, reach);
    stain.addColorStop(0, 'rgba(28,8,48,0.82)');
    stain.addColorStop(0.4, 'rgba(40,12,72,0.5)');
    stain.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = stain; g.fillRect(0, 0, W, H);
  }
  /** Stamps already in the kit, placed by distance from the outpost. Owned ground gets scrap, the hive gets creep. */
  private scatter(g: CanvasRenderingContext2D, v: View, W: number, H: number) {
    const playBottom = v.Y(104);
    g.save(); g.beginPath(); g.rect(0, 0, W, Math.max(0, playBottom)); g.clip();
    const scrap = ['props_crate', 'props_barrel', 'props_barrier_broken', 'props_boulder', 'props_junction', 'props_vent'];
    const creep = ['creep_1', 'creep_2', 'creep_3', 'creep_4', 'creep_5', 'creep_6'];
    const hive = ['burrow_1', 'burrow_2', 'burrow_3'];
    const step = 14;
    const x0 = Math.floor((0 - v.X(0)) / v.k / step) - 1, x1 = Math.ceil((W - v.X(0)) / v.k / step) + 1;
    const y0 = Math.floor((0 - v.Y(0)) / v.k / step) - 1, y1 = Math.ceil((v.Y(104) - v.Y(0)) / v.k / step) + 1;
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
      const n = Math.abs((gx * 374761393 + gy * 668265263) | 0);
      if ((n & 7) > 2) continue; // most cells stay bare ground
      const x = gx * step + ((n >>> 3) % step) - step / 2, y = gy * step + ((n >>> 8) % step) - step / 2;
      if (PADS.some(p => Math.hypot(x - p.x, y - p.y) < 6.5)) continue; // pads stay clear; the hex is the build marker
      if (Math.hypot(x - 50, y - 90) < 12) continue; // the turret sits on the road, not on scrap
      const dist = Math.hypot(x - 50, y - 90);
      const rot = ((n >>> 16) % 628) / 100;
      if (dist < 34) this.overlay(g, v, scrap[n % scrap.length], x, y, 3.5 + (n % 3), rot);
      else if (dist < 62 && (n & 3) === 0) this.overlay(g, v, scrap[n % scrap.length], x, y, 3, rot);
      else this.overlay(g, v, dist > 78 && (n & 15) === 0 ? hive[n % hive.length] : creep[n % creep.length], x, y, dist > 78 ? 7 : 5, rot, '#6a4ad4');
    }
    g.restore();
  }
  /** Pipe pieces and large boils, fixed in world space. The boils only grow in the hive, behind the spawns. */
  private anchors(g: CanvasRenderingContext2D, v: View) {
    const pieces = this.pipes.filter(p => p.complete && p.naturalWidth);
    const pipe = pieces.length ? pieces : this.pipe?.complete ? [this.pipe] : [];
    const spots: Array<readonly [number, number, number, number]> = [[-4, 36, 12, 0.5], [106, 34, 11, -0.8], [14, 4, 10, 1.4], [88, 2, 10, 2.2], [30, -2, 9, 0.9], [70, -4, 9, -1.5], [6, 58, 8, 2.6], [96, 60, 8, -2.2]];
    spots.forEach(([x, y, size, rot], i) => {
      const img = pipe[i % Math.max(1, pipe.length)]; if (!img) return;
      g.save(); g.translate(at(v,x,y).x, at(v,x,y).y); g.rotate(rot);
      const w = size * v.k; g.drawImage(img, -w / 2, -w / 2, w, w * img.height / img.width); g.restore();
    });
    const boil = this.boil;
    if (boil?.complete && boil.naturalWidth) for (const [x, y, size, rot] of [[18, -6, 22, 0.3], [78, -8, 20, -0.6], [48, 2, 16, 1.2]] as const) {
      g.save(); g.translate(at(v,x,y).x, at(v,x,y).y); g.rotate(rot); g.globalAlpha = 0.9;
      const w = size * v.k; g.drawImage(boil, -w / 2, -w / 2, w, w * boil.height / boil.width); g.restore();
    }
  }
  /** The sim owns the roads. The dirt floor runs under the turret; rubble stops where the lanes meet so the join is road, not a wedge. */
  private roads(g: CanvasRenderingContext2D, v: View, W: number, H: number) {
    const dirt = this.dirt, rock = this.rock ?? this.rockB;
    const path = (strip: Array<{ x: number; y: number }>) => { g.beginPath(); strip.forEach((p, i) => i ? g.lineTo(at(v,p.x,p.y).x, at(v,p.x,p.y).y) : g.moveTo(at(v,p.x,p.y).x, at(v,p.x,p.y).y)); g.closePath(); };
    g.save();
    // Gravel chunks along each lane edge, dense at the dirt and sparse at the rock, so the road
    // reads as cut out of the ground rather than stroked onto it. Nothing is drawn where lanes meet.
    if (rock?.complete) this.gravel(g, v, rock);
    // One lane at a time. Three subpaths in one fill drop the lane whose winding disagrees.
    for (const strip of this.strips) {
      g.save();
      path(strip); g.clip();
      g.fillStyle = '#c4a27a'; g.fillRect(0, 0, W, H);
      if (dirt?.complete && dirt.naturalWidth) {
        const size = 22 * v.k;
        for (let y = -size; y < H + size; y += size) for (let x = -size; x < W + size; x += size) g.drawImage(dirt, x, y, size + 1, size + 1);
      }
      g.restore();
    }
    // Stones on the dirt edge, drawn after the fill so they break the clip line.
    if (rock?.complete) this.edgeStones(g, v, rock);
    g.restore();
  }
  private edgeStones(g: CanvasRenderingContext2D, v: View, rock: HTMLImageElement) {
    for (let lane = 0; lane < 3; lane++) {
      const line = lanePolyline(lane, 1);
      for (let i = 0; i < line.length; i += 2) {
        const p = laneAt(lane, laneLength(lane) * i / (line.length - 1));
        for (const side of [-1, 1]) {
          const n = Math.abs((i * 1274126177 + lane * 97 + side * 13) | 0);
          const x = p.x + p.nx * side * (5.6 + (n % 4) * 0.2), y = p.y + p.ny * side * (5.6 + (n % 4) * 0.2);
          const q = at(v, x, y), rad = (1.6 + (n % 3) * 0.6) * v.k;
          g.save(); g.translate(q.x, q.y); g.rotate((n % 12) / 4);
          g.beginPath(); g.ellipse(0, 0, rad, rad * 0.6, 0, 0, Math.PI * 2); g.clip();
          g.filter = 'brightness(1.5) saturate(0.3)';
          g.drawImage(rock, -rad, -rad, rad * 2, rad * 2);
          g.restore();
        }
      }
    }
  }
  /** Stones along a lane edge. `band` 0 sits on the dirt, 1 fades into the rock. */
  private gravel(g: CanvasRenderingContext2D, v: View, rock: HTMLImageElement) {
    const onRoad = (x: number, y: number) => {
      for (let lane = 0; lane < 3; lane++) {
        const line = lanePolyline(lane, 4);
        for (const p of line) if (Math.hypot(p.x - x, p.y - y) < 4.4) return true;
      }
      return false;
    };
    g.save();
    for (let lane = 0; lane < 3; lane++) {
      const line = lanePolyline(lane, 1);
      for (let i = 0; i < line.length; i++) {
        const p = laneAt(lane, laneLength(lane) * i / (line.length - 1));
        for (const side of [-1, 1]) for (let band = 0; band < 3; band++) {
          const n = Math.abs((i * 374761393 + lane * 668265263 + band * 1274126177 + side * 97) | 0);
          if (band > 1 && (n & 3) > 1) continue; // the band on the dirt and the one beside it stay solid
          const reach = 4.6 + band * 1.2 + (n % 4) * 0.3;
          const x = p.x + p.nx * side * reach, y = p.y + p.ny * side * reach;
          if (onRoad(x, y)) continue;
          const q = at(v, x, y), rad = (band === 0 ? 3.2 : 1.8 + (n % 3) * 0.6) * v.k;
          g.save();
          g.translate(q.x, q.y); g.rotate((n % 16) / 5);
          g.beginPath(); g.ellipse(0, 0, rad, rad * 0.62, 0, 0, Math.PI * 2); g.clip();
          g.filter = `brightness(${1.8 - band * 0.5}) saturate(0.25)`;
          g.globalAlpha = 1 - band * 0.3;
          g.drawImage(rock, -rad * 1.4, -rad, rad * 2.8, rad * 2);
          g.restore();
        }
      }
    }
    g.restore();
  }
  private overlay(g: CanvasRenderingContext2D, v: View, name: string, x: number, y: number, width: number, rotation = 0, color?: string) {
    const part = this.parts.get(name); if (!part?.image.complete || !part.image.naturalWidth) return;
    const { p, image } = part, scale = width * v.k / p.size[0];
    g.save(); g.translate(at(v,x,y).x, at(v,x,y).y); g.rotate(rotation); g.scale(scale, scale);
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
        { const q = at(v, x, y); g.save(); g.translate(q.x, q.y); g.rotate(rotation+side*0.4); }
        const width=6.4*v.k, height=width*this.eggs.naturalHeight/this.eggs.naturalWidth;
        g.drawImage(this.eggs,-width/2,-height/2,width,height); g.restore();
      }
      if (s.phase !== 'run' || s.lull > 0 || s.over) continue;
      const advance = Math.min(0.92, s.waveElapsed / Math.max(1, s.waveMaxS) * 1.15);
      // Clip organic decals to the actual floor so shoulders retain their painted texture.
      g.save(); const strip = this.strips[lane]; g.beginPath(); strip.forEach((p, i) => i ? g.lineTo(at(v,p.x,p.y).x, at(v,p.x,p.y).y) : g.moveTo(at(v,p.x,p.y).x, at(v,p.x,p.y).y)); g.closePath(); g.clip();
      for (let i = 0; i < 16; i++) {
        if ((i + 0.5) / 16 > advance) break;
        const p = laneAt(lane, laneLength(lane) * (i + 0.5) / 16), key = `${lane}:${i}`;
        const a = Math.atan2(p.x - BASE_X, BASE_Y - p.y);
        let da = a - s.aimAngle; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
        if (s.flaming && Math.hypot(p.x - BASE_X, p.y - BASE_Y) < s.flameRange && Math.abs(da) < s.flameHalfAngle + 0.08) this.char.add(key);
        if (this.char.has(key)) {
          g.fillStyle = 'rgba(15,12,10,0.6)'; g.beginPath(); g.ellipse(at(v,p.x,p.y).x, at(v,p.x,p.y).y, 4.8 * v.k, 3 * v.k, Math.atan2(-p.nx, p.ny), 0, TAU); g.fill();
        } else {
          g.globalAlpha = 0.65; this.overlay(g, v, `creep_${i % 6 + 1}`, p.x, p.y, 9, Math.atan2(-p.nx, p.ny), COL[s.brood.color]); g.globalAlpha = 1;
        }
      }
      g.restore();
    }
  }
  wiring(g: CanvasRenderingContext2D, v: View, s: TdSnapshot, bike: Readonly<BikeState>) {
    if (this.revs !== null) this.pulses.push(...strokeTimes(this.revs, bike.crankRevs, this.pulseT, s.t));
    this.pulseT = s.t;
    this.revs = bike.crankRevs;
    this.pulses = this.pulses.filter(t => s.t - t <= 3).slice(-12);
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    for (const tw of s.towers) {
      const c = this.cables[tw.pad];
      // Machinery covers the ends naturally; the entire cable remains connected, including its pulses.
      for (const [color, width] of [['#0b0e12', 1.1], ['#737475', 0.56], ['#2b393d', 0.3]] as const) {
        g.strokeStyle = color; g.lineWidth = Math.max(0.6, width * v.k); g.beginPath();
        c.samples.forEach((p, i) => { if (i === 0) g.moveTo(at(v,p.x,p.y).x, at(v,p.x,p.y).y); else g.lineTo(at(v,p.x,p.y).x, at(v,p.x,p.y).y); }); g.stroke();
      }
      for (const t of this.pulses) {
        const fraction = pulsePosition(s.t - t, c.length); if (fraction === null) continue;
        const p = along(c.route, fraction);
        glowAt(g, '#75edff', at(v,p.x,p.y).x, at(v,p.x,p.y).y, 1.6 * v.k, 0.7);
        g.fillStyle = '#b8faff'; g.beginPath(); g.arc(at(v,p.x,p.y).x, at(v,p.x,p.y).y, 0.4 * v.k, 0, TAU); g.fill();
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
      d.fillStyle = 'rgba(6,9,18,0.12)'; d.fillRect(0, 0, w, h); d.globalCompositeOperation = 'destination-out';
      for (const light of selected.slice(0, ambientCount)) {
        const q = at(v, light.x, light.y), x = q.x / 4, y = q.y / 4, r = light.r * v.k / 4;
        const gradient = d.createRadialGradient(x, y, 0, x, y, r); gradient.addColorStop(0, 'rgba(0,0,0,0.9)'); gradient.addColorStop(1, 'rgba(0,0,0,0)');
        d.fillStyle = gradient; d.fillRect(x - r, y - r, r * 2, r * 2);
      }
      d.globalCompositeOperation = 'source-over';
    }
    g.drawImage(this.darkness, 0, 0, W, H);
    g.save(); g.globalCompositeOperation = 'lighter'; for (const light of selected) glowAt(g, light.color, at(v,light.x,light.y).x, at(v,light.x,light.y).y, light.r * v.k, light.strength); g.restore();
  }
}
