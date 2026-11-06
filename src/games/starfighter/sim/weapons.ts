import type { CraftId } from './types';
/**
 * Beat weapons (pure): every craft fires its signature weapon on the music's grid instead of painting locks and
 * waiting for a volley. Cruiser missiles launch on each beat (a bigger gold salvo on the bar line) and land on the
 * next beat; the Escort's arc lightning jumps between nearby enemies on each beat; the Striker's twin rails fire
 * instantly on every eighth note; the Gunship lobs a flak shell on each beat that bursts over a cluster on the next.
 */
export type WeaponKind = 'missiles' | 'arc' | 'rail' | 'flak';
export const WEAPON: Record<CraftId, WeaponKind> = { cruiser: 'missiles', gunship: 'flak', escort: 'arc', striker: 'rail' };
export const WEAPON_LABEL: Record<WeaponKind, string> = { missiles: 'Missiles', arc: 'Arc', rail: 'Rails', flak: 'Flak' };

interface Pos { id: number; x: number; y: number }

/** Missiles launched now: one or more on a beat (by tier), a salvo on the bar line (by tier and the craft's salvo perk). */
export function missileCount(tier: number, barLine: boolean, salvo = 0): number {
  const beat = tier >= 6 ? 3 : tier >= 3 ? 2 : 1;
  return barLine ? beat + 2 + Math.floor(tier / 2) + salvo : beat;
}
/** `n` targets, distinct while they last (in the order given), then cycling through them again. */
export function spread<T>(targets: readonly T[], n: number): T[] {
  return targets.length ? Array.from({ length: n }, (_, i) => targets[i % targets.length]) : [];
}
/** Arc lightning: from `first`, jump to the nearest enemy not yet struck within `range`, up to `hops` more times. */
export function arcChain<T extends Pos>(first: T, pool: readonly T[], hops: number, range: number): T[] {
  const chain = [first];
  for (let h = 0; h < hops; h++) {
    const cur = chain[chain.length - 1];
    let best: T | null = null, bestD = range;
    for (const e of pool) {
      if (chain.includes(e)) continue;
      const d = Math.hypot(e.x - cur.x, e.y - cur.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best) break;
    chain.push(best);
  }
  return chain;
}
/** Jumps an arc of `hops` makes at arsenal tier `tier` (2 targets at tier 1, up to 6). */
export const arcHops = (tier: number) => 1 + Math.floor(tier / 2) + (tier >= 8 ? 1 : 0);
/** Flak aim: the candidate whose burst of `radius` would catch the most enemies (ties: the nearest the ship). */
export function flakAim<T extends Pos>(cands: readonly T[], radius: number): T | null {
  let best: T | null = null, bestN = -1;
  for (const c of cands) {
    let n = 0;
    for (const e of cands) if (Math.hypot(e.x - c.x, e.y - c.y) <= radius) n++;
    if (n > bestN || n === bestN && best && c.y > best.y) { bestN = n; best = c; }
  }
  return best;
}
/** Enemies a flak burst at (x, y) catches. */
export const inBurst = <T extends Pos>(pool: readonly T[], x: number, y: number, radius: number) => pool.filter(e => Math.hypot(e.x - x, e.y - y) <= radius);
/** Rails per eighth note: twin at tier 4+, plus the craft's salvo perk. */
export const railCount = (tier: number, salvo = 0) => (tier >= 4 ? 2 : 1) + salvo;
/** Base damage per weapon hit by tier (before the music's amp, full-salvo and flagship multipliers). */
export const DAMAGE = {
  missile: (tier: number) => 12 + tier * 3,
  arc: (tier: number, hop: number) => (10 + tier * 3) * Math.pow(0.8, hop),
  rail: (tier: number) => 8 + tier * 2,
  flak: (tier: number) => 17 + tier * 4,
};
