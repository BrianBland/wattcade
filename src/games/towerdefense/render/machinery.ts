import type { BikeState, Profile } from '../../../contracts';
import { riderLook } from '../../../cosmetics/unlocks';
import { drawRider } from '../../../cosmetics/draw/rider';
import type { TdSnapshot, TowerView } from '../sim/types';
import type { View } from './aliens/layer';
import { BASE_X, BASE_Y, PADS } from '../sim/defs';
import { glowAt, WEAPON_COLOR } from './sprites';
interface Part { name: string; file: string; glow?: string; offset: number[]; pivot: number[]; parent: string | null; z: number; minLevel?: number; weapon?: string; minCharge?: number; emissiveOnly?: boolean; damageStage?: number; aims?: boolean; recoil?: { distancePx: number }; axialSpin?: { frames: string[]; frameGlows: string[] } }
interface Animation { durationMs: number; frameDurationMs: number; effectOpacity: number[][]; effect: { file: string; frames: number; frameSize: number[]; offset: number[] } }
interface Manifest { parts: Part[]; size: number[]; padDiameterPx?: number; deckDiameterPx?: number; aim?: { enabled?: boolean }; animations?: { passive: Animation; attack: Animation } }
const TAU = Math.PI * 2;
function curve(keys: number[][], ms: number) {
  for (let i = 1; i < keys.length; i++) if (ms <= keys[i][0]) { const a = keys[i - 1], b = keys[i]; return a[1] + (b[1] - a[1]) * (ms - a[0]) / (b[0] - a[0]); }
  return keys[keys.length - 1][1];
}
class Puppet {
  m: Manifest | null = null;
  private images = new Map<string, HTMLImageElement>();
  private cab: HTMLCanvasElement | null = null;
  constructor(base: string, path: string) {
    const root = `${base}td/${path}/`;
    fetch(root + 'manifest.json').then(r => { if (!r.ok) throw new Error('manifest'); return r.json(); }).then(async (m: Manifest) => {
      const files = new Set<string>();
      for (const p of m.parts) { files.add(p.file); if (p.glow) files.add(p.glow); p.axialSpin?.frames.forEach(f => files.add(f)); p.axialSpin?.frameGlows.forEach(f => files.add(f)); }
      if (path === 'outpost') files.add('masks/cab_window.png');
      if (m.animations) for (const a of Object.values(m.animations)) files.add(a.effect.file);
      await Promise.all([...files].map(file => new Promise<void>((resolve, reject) => {
        const im = new Image(); im.onload = () => { this.images.set(file, im); resolve(); }; im.onerror = reject; im.src = root + file;
      })));
      m.parts.sort((a, b) => a.z - b.z); this.m = m;
      if (path === 'outpost') {
        this.cab = document.createElement('canvas'); this.cab.width = m.size[0]; this.cab.height = m.size[1];
        const g = this.cab.getContext('2d')!, p = m.parts.find(p => p.name === 'cab')!;
        g.drawImage(this.images.get(p.file)!, ...p.offset as [number, number]);
        g.globalCompositeOperation = 'destination-out'; g.drawImage(this.images.get('masks/cab_window.png')!, 0, 0);
      }
    }).catch(() => { this.m = null; });
  }
  draw(g: CanvasRenderingContext2D, x: number, y: number, scale: number, opts: { angle: number; revs: number; level: number; grid: number; weapon?: string; charge?: number; damage?: number; age: number; t: number; rider?: () => void }) {
    const m = this.m; if (!m) return false;
    g.save(); g.translate(x, y); g.scale(scale, scale); g.translate(-m.size[0] / 2, -m.size[1] / 2);
    const aim = (p: Part): boolean => !!p.aims || !!p.parent && aim(m.parts.find(q => q.name === p.parent)!);
    let riderDrawn = false;
    for (const p of m.parts) {
      if ((p.minLevel ?? 1) > opts.level || p.weapon && p.weapon !== opts.weapon || (p.minCharge ?? 0) > (opts.charge ?? 0) || (p.damageStage ?? 0) > (opts.damage ?? 0)) continue;
      if (p.z >= 44 && opts.rider && !riderDrawn) { opts.rider(); riderDrawn = true; }
      g.save();
      if (aim(p)) { const pivot = m.parts.find(q => q.aims)?.pivot ?? p.pivot; g.translate(pivot[0], pivot[1]); g.rotate(opts.angle); g.translate(-pivot[0], -pivot[1]); }
      if (p.name === 'flywheel') { g.translate(p.pivot[0], p.pivot[1]); g.rotate(opts.revs * TAU); g.translate(-p.pivot[0], -p.pivot[1]); }
      if (p.recoil) g.translate(0, p.recoil.distancePx * Math.max(0, 1 - opts.age / 0.3));
      const phase = p.axialSpin ? Math.floor(((opts.revs * 5 % 1) + 1) % 1 * p.axialSpin.frames.length) : 0;
      const file = p.axialSpin?.frames[phase] ?? p.file, glow = p.axialSpin?.frameGlows[phase] ?? p.glow;
      if (!p.emissiveOnly) {
        if (p.name === 'cab' && this.cab) g.drawImage(this.cab, 0, 0);
        else g.drawImage(this.images.get(file)!, p.offset[0], p.offset[1]);
      }
      if (glow) { g.globalCompositeOperation = 'lighter'; g.globalAlpha *= Math.min(0.6, 0.15 + opts.grid * 0.25); g.drawImage(this.images.get(glow)!, p.offset[0], p.offset[1]); }
      g.restore();
    }
    if (m.animations) {
      const attack = opts.age >= 0 && opts.age * 1000 < m.animations.attack.durationMs;
      const a = attack ? m.animations.attack : m.animations.passive, ms = attack ? opts.age * 1000 : opts.t * 1000 % a.durationMs;
      const e = a.effect, f = Math.floor(ms / a.frameDurationMs) % e.frames;
      g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha *= curve(a.effectOpacity, ms) * Math.min(1, opts.grid);
      g.drawImage(this.images.get(e.file)!, f * e.frameSize[0], 0, e.frameSize[0], e.frameSize[1], e.offset[0], e.offset[1], e.frameSize[0], e.frameSize[1]); g.restore();
    }
    g.restore(); return true;
  }
}
export class Machinery {
  private outpost: Puppet;
  private towers: Record<string, Puppet>;
  profile: Readonly<Profile> | null = null;
  constructor(base: string) { this.outpost = new Puppet(base, 'outpost'); this.towers = { tesla: new Puppet(base, 'towers/tesla'), mortar: new Puppet(base, 'towers/mortar'), lens: new Puppet(base, 'towers/prism') }; }
  tower(g: CanvasRenderingContext2D, tw: TowerView, v: View, s: TdSnapshot) {
    const p = PADS[tw.pad], puppet = this.towers[tw.kind];
    const ready = puppet.draw(g, v.X(p.x), v.Y(p.y), 8.4 * v.k / 136, { angle: tw.angle, revs: 0, level: tw.level, grid: s.grid, age: s.t - tw.firedAt, t: s.t });
    const age = s.t - tw.firedAt;
    if (ready && tw.kind === 'mortar' && age >= 0 && age < 0.16) glowAt(g, '#ffc38b', v.X(p.x + Math.sin(tw.angle) * 4), v.Y(p.y - Math.cos(tw.angle) * 4), 1.8 * v.k, 0.7 * (1 - age / 0.16));
    return ready;
  }
  base(g: CanvasRenderingContext2D, v: View, s: TdSnapshot, bike: Readonly<BikeState>) {
    const look = this.profile ? riderLook(this.profile) : null;
    const ready = this.outpost.draw(g, v.X(BASE_X), v.Y(BASE_Y), 22 * v.k / 440, {
      angle: s.aimAngle, revs: bike.crankRevs, level: 5, grid: s.grid, weapon: s.weapon === 'flame' ? 'flamer' : s.weapon,
      charge: Math.floor(3 * (s.railCharges + s.railProgress) / Math.max(1, s.railMaxCharges)), damage: s.baseHp / s.baseMaxHp < 0.25 ? 2 : s.baseHp / s.baseMaxHp < 0.5 ? 1 : 0, age: 99, t: s.t,
      rider: look ? () => { g.save(); g.beginPath(); g.rect(300, 321, 76, 47); g.clip(); g.translate(338, 366); g.scale(1.7, 1.7); drawRider(g, look, bike.crankRevs, 0, { t: s.t }); g.restore(); } : undefined,
    });
    const muzzle = s.fx.some(f => ((f.kind === 'tracer' && f.x0 === BASE_X && f.y0 === BASE_Y) || f.kind === 'beam') && s.t - f.t0 < 0.08);
    if (ready && muzzle) {
      const reach = s.weapon === 'gatling' ? 7.75 : 6.8;
      glowAt(g, WEAPON_COLOR[s.weapon], v.X(BASE_X + Math.sin(s.aimAngle) * reach), v.Y(BASE_Y - Math.cos(s.aimAngle) * reach), 2.5 * v.k, 0.8);
    }
    return ready;
  }
}
