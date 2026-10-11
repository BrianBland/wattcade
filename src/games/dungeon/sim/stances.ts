// Stances: one choice sets both the weapon slot in use and how the hero AI fights (pure).
// A stance rewards a riding *style* (cadence band) at the same power: the bonus never needs more watts.
import type { WeaponStyle } from './loot';

export type StanceId = 'vanguard' | 'ranger' | 'skirmisher' | 'arcanist';
export type StyleBonus = 'armor' | 'fire' | 'move' | 'dmg';
export interface StanceDef {
  id: StanceId; name: string; role: string; color: string;
  styles: WeaponStyle[]; starter: WeaponStyle;
  band: [number, number];          // rpm (cadence3s) for the style bonus
  bonus: StyleBonus;               // what the in-band bonus boosts
  dmgTaken: number; moveMult: number;
  /** stand-off distance from the AI's default (tiles) */
  standoff(base: number): number;
  strafe: number;                  // 0..1 how much the AI circles at range
}

export const STANCES: Record<StanceId, StanceDef> = {
  vanguard: { id: 'vanguard', name: 'Vanguard', role: 'tank melee', color: '#ff8c5a', styles: ['flame', 'pellet'], starter: 'pellet',
    band: [70, 82], bonus: 'armor', dmgTaken: 0.6, moveMult: 0.95, standoff: (b) => Math.min(b, 2.2), strafe: 0.3 },
  ranger: { id: 'ranger', name: 'Ranger', role: 'ranged', color: '#7dff5a', styles: ['arrow', 'bolt'], starter: 'bolt',
    band: [92, 100], bonus: 'fire', dmgTaken: 1, moveMult: 1, standoff: (b) => Math.max(b, 4.5), strafe: 0.6 },
  skirmisher: { id: 'skirmisher', name: 'Skirmisher', role: 'kite', color: '#8fd8ff', styles: ['star', 'spark'], starter: 'star',
    band: [88, 98], bonus: 'move', dmgTaken: 1, moveMult: 1.1, standoff: (b) => Math.max(3.5, Math.min(b, 5)), strafe: 1 },
  arcanist: { id: 'arcanist', name: 'Arcanist', role: 'shield-breaker', color: '#c77dff', styles: ['orb'], starter: 'orb',
    band: [85, 95], bonus: 'dmg', dmgTaken: 1, moveMult: 1, standoff: (b) => Math.max(b, 4), strafe: 0.5 },
};
export const STANCE_ORDER: StanceId[] = ['vanguard', 'ranger', 'skirmisher', 'arcanist'];

/** Which stance's slot a weapon style belongs to. Orbs go to the Ranger until the Arcanist is unlocked. */
export function stanceOfStyle(style: WeaponStyle, arcanistUnlocked: boolean): StanceId {
  for (const id of STANCE_ORDER) if (STANCES[id].styles.includes(style)) return id === 'arcanist' && !arcanistUnlocked ? 'ranger' : id;
  return 'ranger';
}
export const stancesFor = (arcanistUnlocked: boolean): StanceId[] => STANCE_ORDER.filter((s) => s !== 'arcanist' || arcanistUnlocked);
/** Weapon styles that feed a stance's slot (Ranger also takes orbs while the Arcanist is locked). */
export const stylesFor = (id: StanceId, arcanistUnlocked: boolean): WeaponStyle[] =>
  id === 'ranger' && !arcanistUnlocked ? [...STANCES.ranger.styles, 'orb'] : STANCES[id].styles;

/**
 * Style bonus is active when cadence sits in the stance's band AND power is in the working zone (>= minZone,
 * judged on min(5, powerZone)), and no game prompt is asking for a specific cadence right now.
 * Outside the band there is no penalty.
 */
export function styleActive(id: StanceId, cadence: number, powerZone: number, cadenceCalled: boolean, minZone = 2): boolean {
  if (cadenceCalled) return false;
  const [lo, hi] = STANCES[id].band;
  return cadence >= lo && cadence <= hi && Math.min(5, powerZone) >= minZone;
}

/** The AI's suggestion (never applied automatically). */
export function suggestStance(o: { boss: boolean; shielded: boolean; crowd: number; elite: boolean; arcanist: boolean }): StanceId | null {
  if (o.boss) return o.shielded && o.arcanist ? 'arcanist' : 'vanguard';
  if (o.crowd >= 5) return 'skirmisher';
  if (o.elite) return 'ranger';
  return null;
}
