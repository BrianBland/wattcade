// Draws the aliens with the cut-out puppets: per-enemy gait (see ./track), heading, strike pose near the base, hurt
// flash, a death curl into a fading husk, and brood-tinted splats that stay until the wave ends.
import { KINDS, type Element } from '../../sim/defs';
import type { EnemyView, Fx, TdSnapshot } from '../../sim/types';
import { COL } from '../sprites';
import { DEATH_FRAMES, FrameCache, LiveCanvas, loadPuppets, type Frame } from './puppets';
import { thud } from './rig';
import { SPECIES_OF_KIND, alienLengthUnits, type SpeciesId } from './species';
import { CORPSE_S, SPLAT_FADE_S, advanceTrack, newTrack, type Track } from './track';

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const DEATH_S = 0.45;
interface Corpse { species: SpeciesId; x: number; y: number; h: number; t0: number; tint?: string; outline: string; len: number; life: number }
interface Splat { x: number; y: number; rot: number; size: number; img: HTMLCanvasElement; t0: number; wave: number; fadeAt?: number }

/** Field → screen mapping supplied by the renderer each frame. */
export interface View { X(x: number): number; Y(y: number): number; k: number; dpr: number }

export class AlienLayer {
  private cache: FrameCache | null = null;
  private live = new LiveCanvas();
  private tracks = new Map<number, Track>();
  private corpses: Corpse[] = [];
  private splats: Splat[] = [];
  private splatSrc: HTMLImageElement[] = [];
  private splatTinted = new Map<string, HTMLCanvasElement>();
  private shadowSprite: HTMLCanvasElement | null = null;
  private lastFx = -1; private wave = -1; private sizeKey = '';
  failed = false;

  constructor(base: string) {
    loadPuppets(base).then((p) => { this.cache = new FrameCache(p); }).catch(() => { this.failed = true; });
    for (let i = 1; i <= 6; i++) { const im = new Image(); im.src = `${base}td/environment/parts/splat_${i}.png`; this.splatSrc.push(im); }
  }
  get ready() { return !!this.cache; }
  get pendingFrames() { return this.cache?.pending ?? 0; }

  /** Per-frame bookkeeping: gait, deaths → husks + splats, wave-end cleanup, and one cached frame set built. */
  update(s: TdSnapshot, v: View, dt: number, onFireBurst: (x: number, y: number, size: number) => void) {
    if (!this.cache) return;
    const sk = `${Math.round(v.k * 100)}|${v.dpr}`;
    if (sk !== this.sizeKey) { this.sizeKey = sk; this.cache.clear(); }
    this.cache.pump();
    if (s.wave !== this.wave) { for (const sp of this.splats) sp.fadeAt ??= s.t; this.wave = s.wave; }
    const live = new Set<number>();
    for (const e of s.enemies) {
      live.add(e.id);
      const sp = SPECIES_OF_KIND[e.kind];
      let tr = this.tracks.get(e.id);
      if (!tr) { tr = newTrack(e); this.tracks.set(e.id, tr); }
      advanceTrack(tr, e, sp, alienLengthUnits(e.radius, sp), s.t, dt);
    }
    const firstPass = this.lastFx < 0;
    for (const f of s.fx as Fx[]) {
      if (f.id <= this.lastFx) continue;
      this.lastFx = Math.max(this.lastFx, f.id);
      if (f.kind !== 'death' || firstPass) continue; // don't replay history on mount
      const sp = SPECIES_OF_KIND[f.ekind], len = alienLengthUnits(KINDS[f.ekind].radius, sp);
      const h = this.tracks.get(f.eid)?.h ?? Math.atan2(90 - f.y, 50 - f.x);
      this.corpses.push({ species: sp.id, x: f.x, y: f.y, h, t0: s.t, tint: sp.tint ? COL[f.color] : undefined, outline: COL[f.color], len, life: CORPSE_S * (f.big ? 1.6 : 1) });
      this.addSplat(f.x, f.y, len, f.color, f.eid, s.t);
      if (f.fire && f.color === 'red') onFireBurst(v.X(f.x), v.Y(f.y), len * v.k);
    }
    if (firstPass) this.lastFx = Math.max(this.lastFx, 0);
    for (const id of this.tracks.keys()) if (!live.has(id)) this.tracks.delete(id);
    this.corpses = this.corpses.filter((c) => s.t - c.t0 < c.life && s.t >= c.t0);
    this.splats = this.splats.filter((sp) => sp.fadeAt == null || s.t - sp.fadeAt < SPLAT_FADE_S);
    if (this.splats.length > 160) this.splats.splice(0, this.splats.length - 160);
  }

  private addSplat(x: number, y: number, len: number, color: Element | 'gold', seed: number, t: number) {
    const i = seed % 6, src = this.splatSrc[i];
    if (!src.complete || !src.naturalWidth) return;
    const key = `${i}|${color}`;
    let img = this.splatTinted.get(key);
    if (!img) { // neutral grey × brood colour, keeping the decal's alpha
      img = document.createElement('canvas'); img.width = src.naturalWidth; img.height = src.naturalHeight;
      const g = img.getContext('2d')!; g.drawImage(src, 0, 0);
      g.globalCompositeOperation = 'multiply'; g.fillStyle = COL[color]; g.fillRect(0, 0, img.width, img.height);
      g.globalCompositeOperation = 'destination-in'; g.drawImage(src, 0, 0);
      this.splatTinted.set(key, img);
    }
    this.splats.push({ x, y, rot: (seed * 2.399) % TAU, size: len * 1.1, img, t0: t, wave: this.wave });
  }

  /** Splats, under everything else on the field. */
  drawGround(g: G, v: View, t: number) {
    for (const sp of this.splats) {
      const a = 0.85 * Math.min(1, (t - sp.t0) * 6) * (sp.fadeAt == null ? 1 : Math.max(0, 1 - (t - sp.fadeAt) / SPLAT_FADE_S));
      if (a <= 0) continue;
      const w = sp.size * v.k, h = w * (sp.img.height / sp.img.width);
      g.save(); g.globalAlpha = a; g.translate(v.X(sp.x), v.Y(sp.y)); g.rotate(sp.rot); g.drawImage(sp.img, -w / 2, -h / 2, w, h); g.restore();
    }
  }

  /** Husks under the living, then every live alien back to front. Aliens whose frames aren't built yet go to `fallback`. */
  draw(g: G, s: TdSnapshot, v: View, t: number, fallback: (e: EnemyView, h: number) => void) {
    const cache = this.cache; if (!cache) return;
    for (const c of this.corpses) {
      const set = cache.get(c.species, c.len * v.k * v.dpr, c.outline, c.tint); if (!set) continue;
      const age = t - c.t0, k = Math.min(1, age / DEATH_S), i = Math.floor(k * DEATH_FRAMES);
      const fr = i < DEATH_FRAMES ? set.death[i] : set.corpse;
      this.blit(g, fr, v.X(c.x), v.Y(c.y), c.h + k * 0.5, v.dpr, Math.min(1, (c.life - age) / 1.2), 1 - k * 0.12);
    }
    for (const e of [...s.enemies].sort((a, b) => a.y - b.y)) {
      const tr = this.tracks.get(e.id); if (!tr) continue;
      if (!this.drawOne(g, e, tr, v, t)) fallback(e, tr.h);
    }
  }

  private drawOne(g: G, e: EnemyView, tr: Track, v: View, t: number): boolean {
    const sp = SPECIES_OF_KIND[e.kind], cache = this.cache!, lenU = alienLengthUnits(e.radius, sp), lenDev = lenU * v.k * v.dpr;
    const outline = COL[e.element], tint = sp.tint ? COL[e.element] : undefined;
    let fr: Frame;
    if (sp.live) fr = this.live.draw(cache.puppet(sp.id), lenDev, { phase: tr.cycles, attack: tr.attack, t }, outline);
    else {
      const set = cache.get(sp.id, lenDev, outline, tint); if (!set) return false;
      if (tr.attack > 0.15) fr = set.attack[Math.min(set.attack.length - 1, Math.floor(tr.attack * set.attack.length))];
      else { const n = set.walk.length; fr = set.walk[Math.floor((tr.cycles - Math.floor(tr.cycles)) * n) % n]; }
    }
    let x = v.X(e.x), y = v.Y(e.y);
    if (sp.thud) { // the body surges ahead during each burst and settles on the thud
      const lead = thud(tr.cycles).lead * sp.stride * lenU * 0.5 * v.k;
      x += Math.cos(tr.h) * lead; y += Math.sin(tr.h) * lead;
    }
    this.shadow(g, x, y, lenU * v.k, !!sp.flying, tr.h);
    const lift = sp.flying ? 1.04 : 1;
    this.blit(g, fr, x, y, tr.h, v.dpr, 1, lift);
    if (e.hurt > 0.05) { // hit flash: add the frame onto itself
      g.globalCompositeOperation = 'lighter'; this.blit(g, fr, x, y, tr.h, v.dpr, Math.min(0.55, e.hurt * 5), lift); g.globalCompositeOperation = 'source-over';
    }
    return true;
  }

  private blit(g: G, fr: Frame, x: number, y: number, h: number, dpr: number, alpha: number, sc = 1) {
    if (alpha <= 0) return;
    g.save(); g.globalAlpha = alpha; g.translate(x, y); g.rotate(h + Math.PI / 2); g.scale(sc / dpr, sc / dpr);
    g.drawImage(fr.c, -fr.ax, -fr.ay); g.restore();
  }

  private shadow(g: G, x: number, y: number, len: number, fly: boolean, h: number) {
    if (!this.shadowSprite) {
      const c = document.createElement('canvas'); c.width = c.height = 64; const sg = c.getContext('2d')!;
      const gr = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      sg.fillStyle = gr; sg.fillRect(0, 0, 64, 64); this.shadowSprite = c;
    }
    const off = fly ? len * 0.55 : len * 0.1, w = len * (fly ? 0.75 : 0.62), hh = len * (fly ? 0.45 : 0.74);
    g.save(); g.globalAlpha = fly ? 0.45 : 0.8; g.translate(x + off * 0.6, y + off); g.rotate(h + Math.PI / 2);
    g.drawImage(this.shadowSprite, -w / 2, -hh / 2, w, hh); g.restore();
  }
}
