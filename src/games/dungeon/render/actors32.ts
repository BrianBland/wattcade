// Characters, held weapons, shots and pickups in the 32 px art. Each draw call takes the world-pixel foot point.
import { ELEMENT_COLORS, type Element } from '../sim/loot';
import type { BulletView } from '../sim/types';
import { ATLAS, anim, charFrame, cut, flashOf, mirrored, rotated, zoneRect, sheetImage, type ZoneId } from './art32';
import type { WeaponLook } from './weapons';

export type Facing = 'd' | 'r' | 'u';
/** Hero facing from the aim: mostly down shows the front, mostly up the back, else the side (mirrored for left). */
export function facingFor(angle: number): { f: Facing; flip: boolean } {
  const s = Math.sin(angle), c = Math.cos(angle);
  if (s > 0.72) return { f: 'd', flip: false };
  if (s < -0.72) return { f: 'u', flip: false };
  return { f: 'r', flip: c < 0 };
}
/** Where the weapon hand is, relative to the hero's foot point, per facing (from the hero sheet). */
export const HAND32: Record<Facing, { x: number; y: number }> = { d: { x: 5, y: -9 }, r: { x: 0, y: -9 }, u: { x: -5, y: -9 } };
const OUTFITS = new Set(['vanguard', 'ranger', 'skirmisher', 'arcanist']);

function blit(g: CanvasRenderingContext2D, c: HTMLCanvasElement, x: number, y: number, flip = false) {
  g.drawImage(flip ? mirrored(c) : c, Math.round(x), Math.round(y));
}
export function weaponArt(w: WeaponLook): { c: HTMLCanvasElement; gx: number; gy: number } | null {
  const key = `${w.base}.${Math.max(0, Math.min(2, w.variant ?? 0))}.${w.element ?? 'normal'}.${w.rarity ?? 0}`;
  const c = cut('arsenal', key), gp = ATLAS.arsenal.grip[key];
  return c && gp ? { c, gx: gp[0], gy: gp[1] } : null;
}
/** The held weapon, gripped at its handle by the hand and rotated to the aim (kept upright when aiming left). */
export function drawHeld(g: CanvasRenderingContext2D, w: WeaponLook, hx: number, hy: number, angle: number, kick = 0) {
  const a = weaponArt(w); if (!a) return;
  const left = Math.cos(angle) < 0;
  const src = left ? mirrored(a.c) : a.c, gx = left ? a.c.width - 1 - a.gx : a.gx;
  const r = rotated(src, left ? angle - Math.PI : angle, gx, a.gy);
  g.drawImage(r.c, Math.round(hx - Math.cos(angle) * kick - r.ox), Math.round(hy - Math.sin(angle) * kick - r.oy));
}
export interface HeroLook { angle: number; moving: boolean; t: number; stance: string; hurt: boolean; weapon: WeaponLook; kick: number; alpha?: number }
export function drawHero32(g: CanvasRenderingContext2D, x: number, foot: number, h: HeroLook) {
  const { f, flip } = facingFor(h.angle), outfit = OUTFITS.has(h.stance) ? h.stance : 'scout';
  const name = `hero.${outfit}.${f}`, fr = h.moving ? Math.floor(h.t * 9) % 4 : 0, c = charFrame(name, fr), m = anim(name);
  if (!c || !m) return;
  const hand = HAND32[f], hx = x + (flip ? -hand.x : hand.x), hy = foot + hand.y;
  const old = g.globalAlpha; g.globalAlpha = old * (h.alpha ?? 1);
  if (f === 'u') drawHeld(g, h.weapon, hx, hy, h.angle, h.kick);
  blit(g, h.hurt ? flashOf(c) : c, x - m.ax, foot - m.ay, flip);
  if (f !== 'u') drawHeld(g, h.weapon, hx, hy, h.angle, h.kick);
  g.globalAlpha = old;
}

/** Enemy kinds map to their own sheets; bosses use boss<variant>. */
export function enemyAnim(kind: string, variant: number) { return kind === 'boss' ? `boss${((variant % 6) + 6) % 6}` : kind; }
export interface EnemyLook { kind: string; variant: number; moving: boolean; tell: number; flash: boolean; face: number; t: number; id: number }
/** Returns the drawn height (for labels and bars). */
export function drawEnemy32(g: CanvasRenderingContext2D, x: number, foot: number, e: EnemyLook): number {
  const base = enemyAnim(e.kind, e.variant), atk = e.tell > 0.05 && anim(base + '.atk');
  const name = atk ? base + '.atk' : base, m = anim(name); if (!m) return 0;
  let fr = 0;
  if (!atk) {
    if (e.kind === 'bat') fr = Math.floor(e.t * 10 + e.id) % m.n;
    else if (e.kind === 'spitter') fr = e.moving ? Math.floor((e.t + e.id * 0.37) * 12) % m.n : 0;
    else if (e.kind === 'boss') fr = Math.floor(e.t * 2.5 + e.id) % m.n;
    else fr = e.moving ? Math.floor(e.t * 7 + e.id) % m.n : Math.floor(e.t * 1.5 + e.id) % Math.min(2, m.n);
  }
  const c = charFrame(name, fr); if (!c) return 0;
  blit(g, e.flash ? flashOf(c) : c, x - m.ax, foot - m.ay, e.face < 0);
  return m.ay;
}

const EL_BY_COLOR = new Map(Object.entries(ELEMENT_COLORS).map(([k, v]) => [v.toLowerCase(), k as Element]));
export function drawShot32(g: CanvasRenderingContext2D, b: BulletView, TS: number): boolean {
  const x = b.x * TS, y = b.y * TS;
  if (!b.friendly || b.style === 'enemy') {
    const m = anim('ebullet'), c = charFrame('ebullet', Math.floor(b.age * 10)); if (!c || !m) return false;
    g.drawImage(c, Math.round(x - c.width / 2), Math.round(y - c.height / 2)); return true;
  }
  const el = EL_BY_COLOR.get(b.color.toLowerCase()) ?? 'normal', key = `${b.style}.${Math.max(0, Math.min(2, b.variant ?? 0))}.${el}`;
  const n = ATLAS.arsenal.proj[key]; if (!n) return false;
  const c = cut('arsenal', `p:${key}:${Math.floor(b.age * 14) % n}`); if (!c) return false;
  const r = rotated(c, b.angle, c.width >> 1, c.height >> 1);
  g.drawImage(r.c, Math.round(x - r.ox), Math.round(y - r.oy)); return true;
}
export function drawWeaponIcon32(g: CanvasRenderingContext2D, w: WeaponLook, x: number, y: number): boolean {
  const a = weaponArt(w); if (!a) return false;
  g.drawImage(a.c, Math.round(x - a.c.width / 2), Math.round(y - a.c.height / 2)); return true;
}
export function drawCoin32(g: CanvasRenderingContext2D, x: number, y: number, t: number, id: number): boolean {
  const c = charFrame('coin', Math.floor(t * 8 + id)); if (!c) return false;
  g.drawImage(c, Math.round(x - c.width / 2), Math.round(y - c.height)); return true;
}
export function drawPuff(g: CanvasRenderingContext2D, x: number, y: number, k: number): boolean {
  const c = charFrame('puff', Math.min(4, Math.floor(k * 5))); if (!c) return false;
  g.drawImage(c, Math.round(x - c.width / 2), Math.round(y - c.height + 4)); return true;
}
export function drawShrine32(g: CanvasRenderingContext2D, kind: string, x: number, foot: number, t: number, failed: boolean): boolean {
  const name = `shrine.${kind}`, m = anim(name), c = charFrame(name, Math.floor(t * 5)); if (!c || !m) return false;
  const old = g.globalAlpha; if (failed) g.globalAlpha = old * 0.45;
  g.drawImage(c, Math.round(x - m.ax), Math.round(foot - m.ay)); g.globalAlpha = old; return true;
}
export function drawSigil(g: CanvasRenderingContext2D, kind: string, x: number, y: number, scale: number): boolean {
  const c = charFrame(`sigil.${kind}`, 0); if (!c) return false;
  g.imageSmoothingEnabled = false; g.drawImage(c, Math.round(x), Math.round(y), c.width * scale, c.height * scale); return true;
}
/** A zone prop (door, stairs, chest, light) from the zone sheet. */
export function drawZoneProp(g: CanvasRenderingContext2D, zone: ZoneId, name: string, x: number, y: number, frame = 0, frames = 1): boolean {
  const r = zoneRect(zone, name), im = sheetImage(zone); if (!r || !im) return false;
  const fw = Math.floor(r[2] / frames);
  g.drawImage(im, r[0] + fw * (frame % frames), r[1], fw, r[3], Math.round(x), Math.round(y), fw, r[3]); return true;
}
export const zonePropSize = (zone: ZoneId, name: string) => { const r = zoneRect(zone, name); return r ? { w: r[2], h: r[3] } : null; };
/** A drop or HUD icon (item.potion, item.helm, ...) centred on x with its bottom at y, scaled by an integer `s`. */
export function drawItem32(g: CanvasRenderingContext2D, name: string, x: number, y: number, s = 1): boolean {
  const c = charFrame(`item.${name}`, 0); if (!c) return false;
  g.imageSmoothingEnabled = false;
  g.drawImage(c, Math.round(x - c.width * s / 2), Math.round(y - c.height * s), c.width * s, c.height * s); return true;
}
