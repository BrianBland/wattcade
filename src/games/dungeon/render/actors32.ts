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
export interface HeroLook { angle: number; moving: boolean; t: number; stance: string; hurt: boolean; weapon: WeaponLook; kick: number; alpha?: number;
  /** perk race kit (jersey recolour) and kit overlays (`ov.<perk>.<facing>`; some sit behind the body) */
  kit?: string | null; ovs?: readonly string[] }
const UNDER = new Set(['discs.d', 'discs.r', 'musette.r']);
export function drawHero32(g: CanvasRenderingContext2D, x: number, foot: number, h: HeroLook) {
  const { f, flip } = facingFor(h.angle), outfit = OUTFITS.has(h.stance) ? h.stance : 'scout';
  const base = `hero.${outfit}.${f}`, kitName = h.kit ? `hero.${outfit}.${h.kit}.${f}` : '', name = kitName && anim(kitName) ? kitName : base;
  const fr = h.moving ? Math.floor(h.t * 9) % 4 : 0, c = charFrame(name, fr), m = anim(name);
  if (!c || !m) return;
  const hand = HAND32[f], hx = x + (flip ? -hand.x : hand.x), hy = foot + hand.y;
  const old = g.globalAlpha; g.globalAlpha = old * (h.alpha ?? 1);
  const ov = (under: boolean) => { for (const k of h.ovs ?? []) if (UNDER.has(`${k}.${f}`) === under) { const o = charFrame(`ov.${k}.${f}`, fr); if (o) blit(g, h.hurt ? flashOf(o) : o, x - m.ax, foot - m.ay, flip); } };
  if (f === 'u') drawHeld(g, h.weapon, hx, hy, h.angle, h.kick);
  ov(true);
  blit(g, h.hurt ? flashOf(c) : c, x - m.ax, foot - m.ay, flip);
  ov(false);
  if (f !== 'u') drawHeld(g, h.weapon, hx, hy, h.angle, h.kick);
  g.globalAlpha = old;
}

/** Enemy kinds map to their own sheets; bosses use boss<variant>. */
export function enemyAnim(kind: string, variant: number) { return kind === 'boss' ? `boss${((variant % 6) + 6) % 6}` : kind; }
export interface EnemyLook { kind: string; variant: number; moving: boolean; tell: number; flash: boolean; face: number; t: number; id: number; /** Gear Masher with its chainring out on the chain */ free?: boolean }
/** Returns the drawn height (for labels and bars). */
export function drawEnemy32(g: CanvasRenderingContext2D, x: number, foot: number, e: EnemyLook): number {
  const base = enemyAnim(e.kind, e.variant), free = e.free && anim(base + '.free'), atk = !free && e.tell > 0.05 && anim(base + '.atk');
  const name = free ? base + '.free' : atk ? base + '.atk' : base, m = anim(name); if (!m) return 0;
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

/** Where the Gear Masher's raised fist is, relative to its foot point (sprite pixels, facing right). */
export const FLAIL_HAND = { x: 23, y: -49 };
const LINK = ['#1a1720', '#565262', '#848094', '#bcb8c8'];
export interface FlailLook { hx: number; hy: number; gx: number; gy: number; groundY: number; spin: number; sag: number; onFloor: boolean }
/** The chain from the fist to the chainring (screen pixels), then the chainring, spun with nearest-neighbour rotation. */
export function drawFlail32(g: CanvasRenderingContext2D, f: FlailLook): void {
  const dx = f.gx - f.hx, dy = f.gy - f.hy, len = Math.hypot(dx, dy), n = Math.max(1, Math.round(len / 3.2));
  if (!f.onFloor) { g.fillStyle = 'rgba(8,6,12,0.35)'; g.fillRect(Math.round(f.gx - 6), Math.round(f.groundY - 1), 12, 3); g.fillRect(Math.round(f.gx - 4), Math.round(f.groundY - 2), 8, 5); }
  for (let i = 1; i < n; i++) {
    const k = i / n, x = Math.round(f.hx + dx * k), y = Math.round(f.hy + dy * k + Math.sin(Math.PI * k) * f.sag);
    g.fillStyle = LINK[0]; g.fillRect(x - 1, y - 1, 3, 3);
    if (i % 2) { g.fillStyle = LINK[2]; g.fillRect(x - 1, y - 1, 2, 1); g.fillStyle = LINK[1]; g.fillRect(x - 1, y, 2, 1); }
    else { g.fillStyle = LINK[3]; g.fillRect(x, y - 1, 1, 1); g.fillStyle = LINK[1]; g.fillRect(x, y, 1, 1); }
  }
  const c = charFrame('flailgear', 0); if (!c) return;
  const r = rotated(c, f.spin, 11, 11);
  g.drawImage(r.c, Math.round(f.gx - r.ox), Math.round(f.gy - r.oy));
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
/** Wick points of a candle prop (local peaks of its top outline), relative to its top-left; cached. */
const wickCache = new Map<string, Array<[number, number]>>();
export function wicks(zone: ZoneId, name: string): Array<[number, number]> {
  const key = zone + name, hit = wickCache.get(key); if (hit) return hit;
  const c = cut(zone, 'decor:' + name); if (!c) return [];
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data, top: number[] = [];
  for (let x = 0; x < c.width; x++) { let y = 0; while (y < c.height && d[(y * c.width + x) * 4 + 3] === 0) y++; top.push(y); }
  const out: Array<[number, number]> = [];
  for (let x = 0; x < c.width; x++) {
    const l = x > 0 ? top[x - 1] : c.height, r = x < c.width - 1 ? top[x + 1] : c.height;
    if (top[x] < c.height && top[x] < l && top[x] < r && top[x] < c.height * 0.6) out.push([x, top[x]]);
  }
  wickCache.set(key, out); return out;
}
/** Where the held weapon's barrel tip is in world px (hero foot point, aim angle), from the arsenal muzzle and grip data. */
export function muzzleTip(x: number, foot: number, angle: number, w: WeaponLook): { x: number; y: number } {
  const { f, flip } = facingFor(angle), hand = HAND32[f], hx = x + (flip ? -hand.x : hand.x), hy = foot + hand.y;
  const key = `${w.base}.${Math.max(0, Math.min(2, w.variant ?? 0))}.${w.element ?? 'normal'}.${w.rarity ?? 0}`;
  const gp = ATLAS.arsenal.grip[key], mz = ATLAS.arsenal.muzzle[w.base]?.[Math.max(0, Math.min(2, w.variant ?? 0))];
  if (!gp || !mz) return { x: hx + Math.cos(angle) * 14, y: hy + Math.sin(angle) * 14 };
  const dx = mz[0] - gp[0], dy = (Math.cos(angle) < 0 ? -1 : 1) * (mz[1] - gp[1]), c = Math.cos(angle), s = Math.sin(angle);
  return { x: hx + dx * c - dy * s, y: hy + dx * s + dy * c };
}
/** A 3-step pixel muzzle flash at the barrel tip: white core, element-coloured star with a forward spike, then sparks. */
export function drawMuzzle32(g: CanvasRenderingContext2D, x: number, y: number, angle: number, color: string, k: number) {
  const st = Math.min(2, Math.floor(k * 3)), c = Math.cos(angle), s = Math.sin(angle), px = (u: number, v: number, col: string, n = 1) => {
    g.fillStyle = col; g.fillRect(Math.round(x + u * c - v * s), Math.round(y + u * s + v * c), n, n); };
  if (st === 0) {
    for (let u = 0; u <= 6; u++) px(u, 0, u < 3 ? '#ffffff' : color);
    for (const v of [-2, -1, 1, 2]) px(1, v, Math.abs(v) === 1 ? '#fff2c0' : color);
    px(3, -1, color); px(3, 1, color); px(-1, 0, color);
  } else if (st === 1) {
    for (const [u, v] of [[2, -2], [2, 2], [4, 0], [0, -1], [0, 1], [5, -1], [5, 1]]) px(u, v, color);
    px(2, 0, '#fff2c0', 2);
  } else for (const [u, v] of [[3, -3], [6, 0], [3, 3]]) px(u, v, color);
}
