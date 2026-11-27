// The descent (pure): a run is a fixed set of floors through the four zones, ending at the Grim Sweeper.
// Beat him and the run is won; each win unlocks the next Category (a harder tier) for the next descent.
//
//   Keep 1-2 (King Gel, Boneshaker) -> Catacombs 3 (Gear Masher) -> Crypt 4 (Lycra Lich)
//   -> Deep 5-6 (King of the Mountains, Headwind Wyrm) -> floor 7: the Broom Wagon, the Grim Sweeper.
// Bosses keep the order they were tuned in (the endless floors met them 1..6).

/** Boss variants (sprite sheet `boss<variant>`). */
export const BOSS_NAMES = ['King Gel', 'The Boneshaker', 'The Gear Masher', 'The Lycra Lich', 'King of the Mountains', 'The Headwind Wyrm', 'The Grim Sweeper'] as const;
export const SWEEPER = 6;
export const ZONE_NAMES = ['The Keep', 'The Crypt', 'The Catacombs', 'The Deep'] as const;

export interface FloorPlan { floor: number; zone: number; boss: number; final: boolean; name: string }
const plan = (floor: number, zone: number, boss: number, final = false): FloorPlan =>
  ({ floor, zone, boss, final, name: final ? 'The Broom Wagon' : ZONE_NAMES[zone] });
export const DESCENT: readonly FloorPlan[] = [
  plan(1, 0, 0), plan(2, 0, 1), plan(3, 2, 2), plan(4, 1, 3), plan(5, 3, 4), plan(6, 3, 5), plan(7, 1, SWEEPER, true),
];
export const FLOORS = DESCENT.length;
export const planFor = (floor: number): FloorPlan => DESCENT[Math.max(1, Math.min(FLOORS, Math.floor(floor))) - 1];

/** Floors a descent may start on: the first floor of each zone (never the final floor). */
export const ZONE_STARTS: readonly number[] = DESCENT.filter((p, i) => !p.final && (i === 0 || DESCENT[i - 1].zone !== p.zone)).map((p) => p.floor);
/** Shortcut starts unlocked by `delve` levels of the Shortcuts upgrade, up to the deepest floor ever reached. */
export function startFloors(delve: number, bestFloor: number): number[] {
  return ZONE_STARTS.filter((f, i) => i <= delve && f <= Math.max(1, bestFloor));
}

/** Categories: the difficulty ladder. A win at the highest unlocked one unlocks the next. */
export interface Tier { name: string; hp: number; dmg: number; elite: number; curse: number; coins: number; blurb: string }
export const TIERS: readonly Tier[] = [
  { name: 'Cat 4', hp: 1, dmg: 1, elite: 0, curse: 0, coins: 1, blurb: 'the descent as designed' },
  { name: 'Cat 3', hp: 1.4, dmg: 1.4, elite: 0.03, curse: 0.02, coins: 1.35, blurb: 'tougher, harder-hitting foes' },
  { name: 'Cat 2', hp: 1.95, dmg: 1.95, elite: 0.06, curse: 0.04, coins: 1.8, blurb: 'more elites and curses' },
  { name: 'Cat 1', hp: 2.7, dmg: 2.7, elite: 0.09, curse: 0.06, coins: 2.4, blurb: 'for strong legs' },
  { name: 'Pro', hp: 3.8, dmg: 3.8, elite: 0.12, curse: 0.08, coins: 3.2, blurb: 'a race, not a ride' },
  { name: 'World Tour', hp: 5.3, dmg: 5.3, elite: 0.15, curse: 0.1, coins: 4.2, blurb: 'the top of the sport' },
];
export const tierOf = (i: number): Tier => TIERS[Math.max(0, Math.min(TIERS.length - 1, Math.floor(i)))];
/** Highest tier unlocked after a win at `tier` (wins below the top unlocked tier change nothing). */
export const unlockAfterWin = (tier: number, unlocked: number): number => Math.min(TIERS.length - 1, Math.max(unlocked, tier + 1));

/** What the camp shows after a descent ends: a death or a win. */
export interface RunResult {
  won: boolean; floor: number; startFloor: number; tier: number; timeS: number; kills: number; bosses: number;
  /** Total skill points invested during the descent. */
  perks: number; banked: number; level: number; weapon: string; unlocked?: string;
  archetype?: string; buildTitle?: string; forks?: string[]; capstones?: string[];
  climbs?: number; heroUnlocked?: string;
}
