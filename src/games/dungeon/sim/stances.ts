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
  cdRefillBonus: number;           // extra cooldown refill speed while In Rhythm (+0.2 = +20%)
  dmgTaken: number; moveMult: number;
  strikeRadiusMult: number;        // Vanguard wider Strike AoE
  rollCdMult: number;              // Skirmisher quicker dodge-roll recovery
  projSpeedMult: number;           // Ranger faster/longer shots
  critBonus: number;               // Ranger flat crit bonus
  exposeBonusS: number;            // Arcanist extra Exposed seconds on bosses
  statusDurMult: number;           // Arcanist longer slow/DoT duration
  /** stand-off distance from the AI's default (tiles) */
  standoff(base: number): number;
  strafe: number;                  // 0..1 how much the AI circles at range
}

export const STANCES: Record<StanceId, StanceDef> = {
  vanguard: { id: 'vanguard', name: 'Vanguard', role: 'tank grinder', color: '#ff8c5a', styles: ['flame', 'pellet', 'axe'], starter: 'pellet',
    band: [70, 82], bonus: 'armor', cdRefillBonus: 0.2, dmgTaken: 0.58, moveMult: 0.94, strikeRadiusMult: 1.25, rollCdMult: 1, projSpeedMult: 1, critBonus: 0, exposeBonusS: 0, statusDurMult: 1,
    standoff: (b) => Math.min(b, 2.1), strafe: 0.28 },
  arcanist: { id: 'arcanist', name: 'Arcanist', role: 'expose-extender', color: '#c77dff', styles: ['orb'], starter: 'orb',
    band: [78, 88], bonus: 'dmg', cdRefillBonus: 0.25, dmgTaken: 1, moveMult: 1, strikeRadiusMult: 1, rollCdMult: 1, projSpeedMult: 1, critBonus: 0, exposeBonusS: 1.5, statusDurMult: 1.25,
    standoff: (b) => Math.max(b, 4.2), strafe: 0.5 },
  skirmisher: { id: 'skirmisher', name: 'Skirmisher', role: 'agile kiter', color: '#8fd8ff', styles: ['star', 'spark', 'knife'], starter: 'star',
    band: [84, 94], bonus: 'move', cdRefillBonus: 0.2, dmgTaken: 1, moveMult: 1.12, strikeRadiusMult: 1, rollCdMult: 0.75, projSpeedMult: 1, critBonus: 0, exposeBonusS: 0, statusDurMult: 1,
    standoff: (b) => Math.max(3.5, Math.min(b, 5.2)), strafe: 1 },
  ranger: { id: 'ranger', name: 'Ranger', role: 'sniper spinner', color: '#7dff5a', styles: ['arrow', 'bolt', 'spear'], starter: 'bolt',
    band: [90, 100], bonus: 'fire', cdRefillBonus: 0.2, dmgTaken: 1, moveMult: 1, strikeRadiusMult: 1, rollCdMult: 1, projSpeedMult: 1.15, critBonus: 0.04, exposeBonusS: 0, statusDurMult: 1,
    standoff: (b) => Math.max(b, 4.8), strafe: 0.6 },
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
