import type { CraftId } from './types';
/**
 * Persistent craft levels, earned from each craft's own on-target minutes. Levels never add raw damage: they add
 * companions, a higher in-ride arsenal ceiling, faster locks, and craft-specific signature upgrades.
 */
export const LEVEL_MINUTES = [0, 45, 90, 150, 210, 285, 360, 450, 540, 630];
export const MAX_LEVEL = LEVEL_MINUTES.length;
/** In-ride arsenal tiers unlock at these on-target minutes, capped by the craft's ceiling. */
export const TIER_MINUTES = [0, 2, 6, 12, 20, 30, 40, 50];
export const CRAFTS: CraftId[] = ['cruiser', 'escort', 'striker'];
export const ESCORT_UNLOCK_LEVEL = 3;
/** The Tempo Striker (the harder ride) unlocks at Cruiser level 5 or Escort level 3. */
export const STRIKER_UNLOCK = { cruiser: 5, escort: 3 };
export const TIER_NAMES = ['', 'Pulse', 'Twin pulse', 'Spread cannons', 'Prism array', 'Full squadron', 'Nova lattice', 'Star lance', 'Supernova'];
/** Lateral offsets of wingmen beside the ship (sim and renderer agree). */
export const WING_OFFSETS = [-10, 10, -19, 19];

export interface Perks {
  arsenalCap: number; wingmen: number; heavy: boolean; lockS: number;
  /** Escort: bullet-intercept radius around each wingman, and the phrase beam's half-width. */
  interceptRange: number; beamWidth: number; ace: boolean;
  /** Striker: flank-move strike damage multiplier and half-width (0 = no strike). */
  strike: number; strikeWidth: number;
}
const REWARDS: Record<CraftId, string[]> = {
  cruiser: ['', 'Wingman', 'Arsenal 6 · Escort unlocked', 'Quick lock', 'Second wingman', 'Arsenal 7', 'Heavy escort', 'Arsenal 8', 'Quick lock II', 'Ace finish'],
  escort: ['', 'Wider interception', 'Arsenal 6', 'Wider beam', 'Third wingman', 'Arsenal 7', 'Heavy escort', 'Arsenal 8', 'Wider beam II', 'Ace finish'],
  striker: ['', 'Wider strike', 'Arsenal 6', 'Quick lock', 'Wingman', 'Arsenal 7', 'Heavy escort', 'Arsenal 8', 'Strike II', 'Ace finish'],
};
export function craftLevel(seconds: number): { level: number; progress: number; nextAtS: number | null } {
  const minutes = Math.max(0, seconds) / 60;
  let level = 1;
  while (level < MAX_LEVEL && minutes >= LEVEL_MINUTES[level]) level++;
  if (level >= MAX_LEVEL) return { level, progress: 1, nextAtS: null };
  const from = LEVEL_MINUTES[level - 1], to = LEVEL_MINUTES[level];
  return { level, progress: (minutes - from) / (to - from), nextAtS: to * 60 };
}
/** Reward granted on reaching `level` (2..10); '' for level 1 or beyond the table. */
export const rewardFor = (craft: CraftId, level: number) => REWARDS[craft][level - 1] ?? '';
export function perks(craft: CraftId, level: number): Perks {
  const at = (l: number) => level >= l;
  const arsenalCap = at(8) ? 8 : at(6) ? 7 : at(3) ? 6 : 5;
  if (craft === 'escort') return { arsenalCap, wingmen: at(5) ? 3 : 2, heavy: at(7), lockS: 0.5,
    interceptRange: at(2) ? 20 : 15, beamWidth: at(9) ? 15 : at(4) ? 12 : 9, ace: at(10), strike: 0, strikeWidth: 0 };
  if (craft === 'striker') return { arsenalCap, wingmen: at(5) ? 1 : 0, heavy: at(7), lockS: at(4) ? 0.34 : 0.37,
    interceptRange: 0, beamWidth: 0, ace: at(10), strike: at(9) ? 1.6 : 1, strikeWidth: at(2) ? 6 : 4.5 };
  return { arsenalCap, wingmen: at(5) ? 2 : at(2) ? 1 : 0, heavy: at(7), lockS: at(9) ? 0.31 : at(4) ? 0.345 : 0.38,
    interceptRange: 0, beamWidth: 0, ace: at(10), strike: 0, strikeWidth: 0 };
}
export function arsenalTier(onTargetS: number, cap: number, pace = 1): number {
  const minutes = onTargetS * pace / 60;
  let tier = 1;
  while (tier < TIER_MINUTES.length && minutes >= TIER_MINUTES[tier]) tier++;
  return Math.min(cap, tier);
}
