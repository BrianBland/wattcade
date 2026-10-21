import type { BikeState, Profile } from '../../../contracts';
import { riderLook } from '../../../cosmetics/unlocks';
import { drawRider } from '../../../cosmetics/draw/rider';
import type { TdSnapshot, TowerView } from '../sim/types';
import type { View } from './aliens/layer';
import { BASE_X, BASE_Y, PADS } from '../sim/defs';
import { glowAt, WEAPON_COLOR } from './sprites';
import { loadImage, loadManifest } from './assets';
import { levelPosition, partPose, posedPoint } from './puppetPose';
import { dropPose, dropsFor } from './structureFx';
interface Part { name: string; file: string; glow?: string; offset: number[]; pivot: number[]; parent: string | null; z: number; minLevel?: number; weapon?: string; minCharge?: number; emissiveOnly?: boolean; damageStage?: number; aims?: boolean; recoil?: { distancePx: number }; axialSpin?: { frames: string[]; frameGlows: string[] } }
interface Animation { durationMs: number; frameDurationMs: number; glowGain?: number[][]; glowStrength?: number[][]; effectOpacity: number[][]; effect: { file: string; frames: number; frameSize: number[]; offset: number[]; offsetsByLevel?: Record<string, number[]>; parent?: string } }
interface Anchor { parent: string; position: number[]; positionsByLevel?: Record<string, number[]> }
interface Manifest { parts: Part[]; size: number[]; padDiameterPx?: number; deckDiameterPx?: number; aim?: { enabled?: boolean }; animations?: { passive: Animation; attack: Animation }; anchors?: Record<string, Anchor> }
function curve(keys: number[][], ms: number) {
  for (let i = 1; i < keys.length; i++) if (ms <= keys[i][0]) { const a = keys[i - 1], b = keys[i]; return a[1] + (b[1] - a[1]) * (ms - a[0]) / (b[0] - a[0]); }
  return keys[keys.length - 1][1];
}
class Puppet {
  m: Manifest | null = null;
  readonly loaded: Promise<void>;
  private images = new Map<string, HTMLImageElement>();
  private cab: HTMLCanvasElement | null = null;
  constructor(base: string, path: string) {
    const root = `${base}td/${path}/`;
    this.loaded = loadManifest<Manifest>(root + 'manifest.json').then(async m => {
      const files = new Set<string>();
      for (const p of m.parts) { files.add(p.file); if (p.glow) files.add(p.glow); p.axialSpin?.frames.forEach(f => files.add(f)); p.axialSpin?.frameGlows.forEach(f => files.add(f)); }
      if (path === 'outpost') files.add('masks/cab_window.png');
      if (m.animations) for (const a of Object.values(m.animations)) files.add(a.effect.file);
      await Promise.all([...files].map(async file => { this.images.set(file, await loadImage(root + file)); }));
      m.parts.sort((a, b) => a.z - b.z); this.m = m;
      if (path === 'outpost') {
        this.cab = document.createElement('canvas'); this.cab.width = m.size[0]; this.cab.height = m.size[1];
        const g = this.cab.getContext('2d')!, p = m.parts.find(p => p.name === 'cab')!;
        g.drawImage(this.images.get(p.file)!, ...p.offset as [number, number]);
        g.globalCompositeOperation = 'destination-out'; g.drawImage(this.images.get('masks/cab_window.png')!, 0, 0);
      }
    });
  }
  /**
   * Where a manifest anchor (e.g. `muzzle_gatling`) lands on screen for a puppet drawn at (x, y) with `scale` and aim
   * `angle`: anchors on aiming parts turn with the aim pivot, exactly as draw() turns those parts. Null if absent.
   */
  anchor(name: string, x: number, y: number, scale: number, angle: number, age = 99, level = 1): { x: number; y: number } | null {
    const m = this.m, a = m?.anchors?.[name]; if (!m || !a) return null;
    const [cx, cy] = [m.size[0] / 2, m.size[1] / 2];
    const { x: px, y: py } = posedPoint(partPose(m.parts, a.parent, { angle, age, revs: 0 }), levelPosition(a.position, a.positionsByLevel, level));
    return { x: x + (px - cx) * scale, y: y + (py - cy) * scale };
  }
  /** `drop`: parts animating in (a build or an upgrade to `level`), `age` seconds after it happened. */
  draw(g: CanvasRenderingContext2D, x: number, y: number, scale: number, opts: { angle: number; revs: number; level: number; grid: number; weapon?: string; charge?: number; damage?: number; age: number; t: number; rider?: () => void; drop?: { level: number; from: number; built: boolean; age: number } }) {
    const m = this.m; if (!m) return false;
    g.save(); g.translate(x, y); g.scale(scale, scale); g.translate(-m.size[0] / 2, -m.size[1] / 2);
    const attack = !!m.animations && opts.age >= 0 && opts.age * 1000 < m.animations.attack.durationMs;
    const animation = m.animations?.[attack ? 'attack' : 'passive'];
    const ms = animation ? (attack ? opts.age * 1000 : opts.t * 1000 % animation.durationMs) : 0;
    let riderDrawn = false;
    for (const p of m.parts) {
      if ((p.minLevel ?? 1) > opts.level || p.weapon && p.weapon !== opts.weapon || (p.minCharge ?? 0) > (opts.charge ?? 0) || (p.damageStage ?? 0) > (opts.damage ?? 0)) continue;
      if (p.z >= 44 && opts.rider && !riderDrawn) { opts.rider(); riderDrawn = true; }
      g.save();
      if (opts.drop) { // falls in from above, then squashes on landing (about the part's pivot)
        const d = dropsFor(p, opts.drop.level, opts.drop.built, opts.drop.from);
        if (d.drops) {
          const dp = dropPose(opts.drop.age, d.delay);
          if (!dp.visible) { g.restore(); continue; }
          g.translate(0, -dp.lift); g.translate(p.pivot[0], p.pivot[1]); g.scale(1 + (1 - dp.sy) * 0.5, dp.sy); g.translate(-p.pivot[0], -p.pivot[1]);
        }
      }
      g.transform(...partPose(m.parts, p.name, opts));
      const phase = p.axialSpin ? Math.floor(((opts.revs * 5 % 1) + 1) % 1 * p.axialSpin.frames.length) : 0;
      const file = p.axialSpin?.frames[phase] ?? p.file, glow = p.axialSpin?.frameGlows[phase] ?? p.glow;
      if (!p.emissiveOnly) {
        if (p.name === 'cab' && this.cab) g.drawImage(this.cab, 0, 0);
        else g.drawImage(this.images.get(file)!, p.offset[0], p.offset[1]);
      }
      if (glow) {
        g.globalCompositeOperation = 'lighter';
        const gain = animation?.glowGain ? curve(animation.glowGain, ms) : 1;
        const strength = animation?.glowStrength ? curve(animation.glowStrength, ms) : 1;
        g.globalAlpha *= Math.min(0.6, (0.15 + opts.grid * 0.25) * gain * strength);
        g.drawImage(this.images.get(glow)!, p.offset[0], p.offset[1]);
      }
      g.restore();
    }
    if (animation) {
      const a = animation;
      const e = a.effect, f = Math.floor(ms / a.frameDurationMs) % e.frames;
      const offset = levelPosition(e.offset, e.offsetsByLevel, opts.level);
      g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha *= curve(a.effectOpacity, ms) * Math.min(1, opts.grid);
      g.transform(...partPose(m.parts, e.parent, opts));
      g.drawImage(this.images.get(e.file)!, f * e.frameSize[0], 0, e.frameSize[0], e.frameSize[1], offset[0], offset[1], e.frameSize[0], e.frameSize[1]); g.restore();
    }
    g.restore(); return true;
  }
}
export class Machinery {
  private outpost: Puppet;
  private towers: Record<TowerView['kind'], Puppet>;
  profile: Readonly<Profile> | null = null;
  readonly loaded: Promise<void>;
  constructor(base: string) {
    this.outpost = new Puppet(base, 'outpost');
    this.towers = { tesla: new Puppet(base, 'towers/tesla'), flamer: new Puppet(base, 'towers/flamer'), lens: new Puppet(base, 'towers/prism') };
    this.loaded = Promise.all([this.outpost.loaded, ...Object.values(this.towers).map(p => p.loaded)]).then(() => {});
  }
  /** Towers stay upright on screen; only their aim turns with the field. */
  tower(g: CanvasRenderingContext2D, tw: TowerView, v: View, s: TdSnapshot, drop?: { level: number; from: number; built: boolean; age: number }) {
    const p = PADS[tw.pad], at = v.P(p.x, p.y);
    const puppet = this.towers[tw.kind];
    return puppet.draw(g, at.x, at.y, 8.4 * v.k / 136, { angle: tw.angle + v.rot, revs: 0, level: tw.level, grid: s.grid, age: s.t - tw.firedAt, t: s.t, drop });
  }
  /** Screen position of a tower's nozzle or muzzle: its manifest anchor, else a point just ahead of the pad. */
  towerMuzzle(tw: TowerView, v: View, t = tw.firedAt + 99) {
    const p = PADS[tw.pad], at = v.P(p.x, p.y), a = tw.angle + v.rot;
    const puppet = this.towers[tw.kind], age = t - tw.firedAt;
    return puppet.anchor('muzzle', at.x, at.y, 8.4 * v.k / 136, a, age, tw.level) ?? { x: at.x + Math.sin(a) * 3.5 * v.k, y: at.y - Math.cos(a) * 3.5 * v.k };
  }
  /** Screen position of the outpost's current weapon muzzle, from its manifest anchor. */
  muzzle(v: View, s: TdSnapshot) {
    const b = v.P(BASE_X, BASE_Y), name = `muzzle_${s.weapon === 'flame' ? 'flamer' : s.weapon}`, a = s.aimAngle + v.rot;
    return this.outpost.anchor(name, b.x, b.y, 22 * v.k / 440, a) ?? { x: b.x + Math.sin(a) * 7 * v.k, y: b.y - Math.cos(a) * 7 * v.k };
  }
  base(g: CanvasRenderingContext2D, v: View, s: TdSnapshot, bike: Readonly<BikeState>) {
    const look = this.profile ? riderLook(this.profile) : null, b = v.P(BASE_X, BASE_Y);
    const ready = this.outpost.draw(g, b.x, b.y, 22 * v.k / 440, {
      angle: s.aimAngle + v.rot, revs: bike.crankRevs, level: 5, grid: s.grid, weapon: s.weapon === 'flame' ? 'flamer' : s.weapon,
      charge: Math.floor(3 * (s.railCharges + s.railProgress) / Math.max(1, s.railMaxCharges)), damage: s.baseHp / s.baseMaxHp < 0.25 ? 2 : s.baseHp / s.baseMaxHp < 0.5 ? 1 : 0, age: 99, t: s.t,
      rider: look ? () => { g.save(); g.beginPath(); g.rect(300, 321, 76, 47); g.clip(); g.translate(338, 366); g.scale(1.7, 1.7); drawRider(g, look, bike.crankRevs, 0, { t: s.t }); g.restore(); } : undefined,
    });
    const flash = s.fx.some(f => (f.kind === 'tracer' || f.kind === 'beam') && s.t - f.t0 < 0.08) || s.shells.some(sh => sh.k < 0.12);
    if (ready && flash) { const m = this.muzzle(v, s); glowAt(g, WEAPON_COLOR[s.weapon], m.x, m.y, 2.5 * v.k, 0.8); }
    return ready;
  }
}
