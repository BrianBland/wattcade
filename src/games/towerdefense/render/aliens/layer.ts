// Draws the aliens with the cut-out puppets: per-enemy gait (see ./track), heading, strike pose near the base, hurt
// flash, a death curl into a fading husk, and brood-tinted splats that stay until the wave ends.
import { KINDS, type Element } from '../../sim/defs';
import type { EnemyView, Fx, TdSnapshot } from '../../sim/types';
import { COL } from '../sprites';
import { DEATH_FRAMES, FrameCache, LiveCanvas, husk, loadPuppets, type Frame } from './puppets';
import { matrices, pose, thud } from './rig';
import { MAX_GIBS, gibAlpha, launchGibs, pickGibs, stepGib, type Gib } from './gibs';
import { flinchAt } from '../overdrive';
import { loadImage } from '../assets';
import { SPECIES_LIST, SPECIES_OF_KIND, alienLengthUnits, type SpeciesId } from './species';
import { SPLAT_FADE_S, advanceTrack, newTrack, type Track } from './track';

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const DEATH_S = 0.45;
interface Corpse { species: SpeciesId; x: number; y: number; h: number; t0: number; tint?: string; outline: string; len: number; fadeAt?: number;
  /** a gibbed heavy's husk (missing its flown-off parts), composed once at `huskLen` device px */ husk?: Frame; huskLen?: number; boss?: boolean }
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
  private haloSprites = new Map<string, HTMLCanvasElement>();
  private lastFx = -1; private wave = -1; private lull = false; private sizeKey = '';
  private flinchT = -99;
  private gibs: Array<{ species: SpeciesId; gib: Gib }> = [];
  failed = false;
  readonly loaded: Promise<void> = Promise.resolve();

  constructor(base: string) {
    if (typeof Image === 'undefined' || typeof fetch === 'undefined') { this.failed = true; return; } // no DOM (tests)
    this.loaded = Promise.all([
      loadPuppets(base).then(p => { this.cache = new FrameCache(p); }),
      Promise.all(Array.from({length:6},(_,i)=>loadImage(`${base}td/environment/parts/splat_${i+1}.png`))).then(images => { this.splatSrc = images; }),
    ]).then(() => {}).catch(error => { this.failed = true; throw error; });
  }
  /** Bake the initial poses while the shell holds the simulation on its loading screen. */
  async prepare(v: View, cancelled = () => false) {
    await this.loaded;
    const cache = this.cache!;
    this.sizeKey = `${Math.round(v.k * 100)}|${v.dpr}`; cache.clear();
    for (const sp of SPECIES_LIST) {
      const def=KINDS[sp.kind], length=alienLengthUnits(def.radius,sp)*v.k*v.dpr;
      const colors = sp.tint ? ['blue','red','purple'] as const : [sp.kind === 'boss' ? 'gold' : def.color] as Array<Element|'gold'>;
      for (const color of colors) cache.get(sp.id,length,COL[color],sp.tint?COL[color]:undefined);
    }
    while (cache.pending && !cancelled()) { cache.pump(); await new Promise<void>(resolve => setTimeout(resolve,0)); }
    if (cancelled()) cache.clear();
  }

  get ready() { return !!this.cache; }
  /** Every live alien recoils (a called-effort payoff). */
  flinch(t: number) { this.flinchT = t; }
  get pendingFrames() { return this.cache?.pending ?? 0; }

  /** Per-frame bookkeeping: gait, deaths → husks + splats, wave-end cleanup, and one cached frame set built. */
  update(s: TdSnapshot, v: View, dt: number, onFireBurst: (x: number, y: number, size: number) => void) {
    if (!this.cache) return;
    const sk = `${Math.round(v.k * 100)}|${v.dpr}`;
    if (sk !== this.sizeKey) { this.sizeKey = sk; this.cache.clear(); }
    this.cache.pump();
    if (s.wave !== this.wave || (!this.lull && s.lull > 0)) { for (const c of this.corpses) c.fadeAt ??= s.t; for (const sp of this.splats) sp.fadeAt ??= s.t; this.wave = s.wave; }
    this.lull = s.lull > 0;
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
      const tr = this.tracks.get(f.eid), h = tr?.h ?? Math.atan2(90 - f.y, 50 - f.x), tint = sp.tint ? COL[f.color] : undefined;
      const corpse: Corpse = { species: sp.id, x: f.x, y: f.y, h, t0: s.t, tint, outline: COL[f.color], len, fadeAt: this.lull ? s.t : undefined, boss: f.ekind === 'boss' };
      if (KINDS[f.ekind].heavy && tr) { // heavy deaths come apart: some real parts fly off, the husk is drawn without them
        const P = this.cache.puppet(sp.id), boss = f.ekind === 'boss', pin = { phase: tr.cycles, attack: tr.attack };
        const keys = pickGibs(P.rig, f.eid, 3 + (f.eid % 4), boss);
        for (const gib of launchGibs(P.rig, matrices(P.rig, pose(P.rig, sp, pin)), keys, f.x, f.y, h, len, s.t, f.eid, boss)) this.gibs.push({ species: sp.id, gib });
        if (this.gibs.length > MAX_GIBS) this.gibs.splice(0, this.gibs.length - MAX_GIBS);
        corpse.huskLen = len * v.k * v.dpr; corpse.husk = husk(P, corpse.huskLen, { ...pin, dying: 0.5 }, new Set(keys), tint);
      }
      this.corpses.push(corpse);
      this.addSplat(f.x, f.y, len, f.color, f.eid, s.t);
      if (f.fire && f.color === 'red') onFireBurst(v.X(f.x), v.Y(f.y), len * v.k);
    }
    if (firstPass) this.lastFx = Math.max(this.lastFx, 0);
    this.gibs = this.gibs.filter(({ gib }) => stepGib(gib, s.t, dt));
    for (const id of this.tracks.keys()) if (!live.has(id)) this.tracks.delete(id);
    this.corpses = this.corpses.filter((c) => (c.fadeAt == null || s.t - c.fadeAt < SPLAT_FADE_S) && s.t >= c.t0);
    this.splats = this.splats.filter((sp) => sp.fadeAt == null || s.t - sp.fadeAt < SPLAT_FADE_S);
    if (this.corpses.length > 160) this.corpses.splice(0, this.corpses.length - 160);
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
    this.splats.push({ x, y, rot: (seed * 2.399) % TAU, size: len * 1.1, img, t0: t, wave: this.wave, fadeAt: this.lull ? t : undefined });
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
      const age = t - c.t0, k = Math.min(1, age / DEATH_S), fade = c.fadeAt == null ? 0.8 : Math.max(0, 1 - (t - c.fadeAt) / SPLAT_FADE_S);
      if (c.husk) { this.blit(g, c.husk, v.X(c.x), v.Y(c.y), c.h + k * 0.3, v.dpr, fade * (c.boss ? Math.max(0, 1 - age / 1.5) : 1), (c.len * v.k * v.dpr) / c.huskLen! * (1 - k * 0.08)); continue; }
      const set = cache.get(c.species, c.len * v.k * v.dpr, c.outline, c.tint); if (!set) continue;
      const i = Math.floor(k * DEATH_FRAMES);
      const fr = i < DEATH_FRAMES ? set.death[i] : set.corpse;
      this.blit(g, fr, v.X(c.x), v.Y(c.y), c.h + k * 0.5, v.dpr, fade, 1 - k * 0.12);
    }
    for (const e of [...s.enemies].sort((a, b) => a.y - b.y)) {
      const tr = this.tracks.get(e.id); if (!tr) continue;
      if (!this.drawOne(g, e, tr, v, t)) fallback(e, tr.h);
    }
  }

  /** Flying gibs, drawn above the living: each real part tumbles, bounces and casts a shadow on the ground. */
  drawGibs(g: G, v: View, t: number) {
    const cache = this.cache; if (!cache || !this.gibs.length) return;
    for (const { species, gib } of this.gibs) {
      const P = cache.puppet(species), part = P.rig.parts.get(gib.part); if (!part) continue;
      const a = gibAlpha(gib, t), sc = gib.scale * v.k, x = v.X(gib.x), y = v.Y(gib.y), lift = gib.z * v.k;
      const w = part.w * sc, h = part.h * sc;
      const sr = Math.min(w, h) * 0.5 + Math.max(w, h) * 0.12; // a small soft spot under the part, not its whole outline
      g.save(); g.globalAlpha = a * 0.28 / (1 + gib.z * 0.25); g.fillStyle = '#000';
      g.beginPath(); g.ellipse(x + lift * 0.3, y + lift * 0.2, sr, sr * 0.6, 0, 0, TAU); g.fill(); g.restore();
      g.save(); g.globalAlpha = a; g.translate(x, y - lift); g.rotate(gib.rot); if (gib.flip) g.scale(-1, 1);
      g.drawImage(P.img.get(gib.part)!, -w / 2, -h / 2, w, h);
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = a * 0.6; g.drawImage(P.glow.get(gib.part)!, -w / 2, -h / 2, w, h);
      g.restore();
    }
  }

  private drawOne(g: G, e: EnemyView, tr: Track, v: View, t: number): boolean {
    const sp = SPECIES_OF_KIND[e.kind], cache = this.cache!, lenU = alienLengthUnits(e.radius, sp), lenDev = lenU * v.k * v.dpr;
    const outline = COL[e.element], tint = sp.tint ? COL[e.element] : undefined;
    let fr: Frame;
    const stagger = Math.min(1, e.staggerS / 0.4); // a phase change: the boss buckles
    if (sp.live) fr = this.live.draw(cache.puppet(sp.id), lenDev, { phase: tr.cycles, attack: tr.attack, t, dying: 0.3 * stagger }, outline);
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
    this.halo(g, x, y, lenU * v.k, e.gold ? COL.gold : COL[e.element], e.kind === 'boss');
    if (e.exposed) { // Exposed window: a pulsing gold glow says 'hit it now'
      g.save(); g.globalCompositeOperation = 'lighter'; this.halo(g, x, y, lenU * v.k * (1.25 + 0.12 * Math.sin(t * 9)), COL.gold, true); this.halo(g, x, y, lenU * v.k * 0.9, '#fff2b0', true); g.restore();
    }
    const fk = flinchAt(t - this.flinchT); // payoff recoil: pushed back, puffed up, twisted
    x -= Math.cos(tr.h) * fk * lenU * 0.25 * v.k; y -= Math.sin(tr.h) * fk * lenU * 0.25 * v.k;
    const lift = (sp.flying ? 1.04 : 1) * (1 + 0.14 * fk), h = tr.h + fk * 0.35 * Math.sin(e.id * 2.3) + stagger * 0.08 * Math.sin(t * 40);
    this.blit(g, fr, x, y, h, v.dpr, 1, lift);
    if (e.hurt > 0.05) { // hit flash: add the frame onto itself
      g.globalCompositeOperation = 'lighter'; this.blit(g, fr, x, y, h, v.dpr, Math.min(0.55, e.hurt * 5), lift); g.globalCompositeOperation = 'source-over';
    }
    return true;
  }

  /** Warcraft-style ground aura: identifies the brood without flattening the textured puppet. */
  private halo(g: G, x: number, y: number, len: number, color: string, boss: boolean) {
    let sprite = this.haloSprites.get(color);
    if (!sprite) {
      sprite = document.createElement('canvas'); sprite.width = 128; sprite.height = 64;
      const c = sprite.getContext('2d')!; c.scale(1, 0.5);
      const gradient = c.createRadialGradient(64, 64, 4, 64, 64, 60);
      gradient.addColorStop(0, color + '00'); gradient.addColorStop(0.45, color + '16');
      gradient.addColorStop(0.7, color + '58'); gradient.addColorStop(1, color + '00');
      c.fillStyle = gradient; c.fillRect(0, 0, 128, 128); this.haloSprites.set(color, sprite);
    }
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = boss ? 0.85 : 0.6;
    const w = len * 1.35; g.drawImage(sprite, x - w / 2, y - w / 4, w, w / 2); g.restore();
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
