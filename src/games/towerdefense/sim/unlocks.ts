// Star-earned unlocks (docs/towerdefense/LEVELS-DESIGN.md §5): campaign stars open options, never stats. Pure.
import { CAMPAIGN, LEVELS_PER_STYLE } from './campaign';
import { GROUND_STYLES, type GroundStyle } from './generator';

export type UnlockId = 'slow' | 'overcharge' | 'tier4' | 'hard' | 'tier5';
export interface UnlockDef { id: UnlockId; stars: number; name: string; desc: string }
/**
 * In star order. Every tower kind is open from the start: each answers one brood colour, so a locked kind would leave
 * a colour with no tower to counter it. Tower levels 1–3, the rail, Easy and Steady are open from the start too.
 */
export const UNLOCKS: readonly UnlockDef[] = [
  { id: 'slow', stars: 4, name: 'Slow field', desc: 'Slows the back of the road for a few seconds' },
  { id: 'overcharge', stars: 8, name: 'Overcharge', desc: 'Towers fire faster for a few seconds' },
  { id: 'tier4', stars: 12, name: 'Tower Lv 4', desc: 'Towers upgrade to level 4' },
  { id: 'hard', stars: 20, name: 'Hard intensity', desc: 'Harder work waves, tougher aliens' },
  { id: 'tier5', stars: 30, name: 'Tower Lv 5', desc: 'Towers upgrade to level 5' },
];
/** Riders with Garage progress from before the rework start with the unlocks up to here (Lv 4). */
export const VETERAN_STARS = 12;

/** Stars earned across the campaign (best per level). */
export const starTotal = (campaign: Readonly<Record<string, number>>) =>
  CAMPAIGN.reduce((s, c) => s + Math.max(0, Math.min(3, campaign[c.id] ?? 0)), 0);
export const isUnlocked = (id: UnlockId, stars: number) => stars >= UNLOCKS.find((u) => u.id === id)!.stars;
/** The highest tower level the rider can build up to. */
export const maxTowerLevel = (stars: number) => isUnlocked('tier5', stars) ? 5 : isUnlocked('tier4', stars) ? 4 : 3;
/** The next unlock still to earn, or null when everything is open. */
export const nextUnlock = (stars: number): UnlockDef | null => UNLOCKS.find((u) => stars < u.stars) ?? null;
/** Grounds a Quick Ride may use: those whose first campaign level is open (Outpost always). */
export function quickGrounds(open: number): GroundStyle[] {
  return GROUND_STYLES.filter((_, gi) => gi * LEVELS_PER_STYLE <= open);
}
