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

/** Categories: the difficulty & stage-length ladder. A win at the highest unlocked one unlocks the next. */
export interface Tier {
  name: string; stageName: string;
  hp: number; dmg: number; elite: number; curse: number; coins: number;
  roomBonus: number;   // added to base (9 + floor) rooms on floors 1..6 (capped at 18)
  finalRooms: number;  // rooms on Floor 7 (the Broom Wagon)
  blurb: string;
}
export const TIERS: readonly Tier[] = [
  { name: 'Cat 4',      stageName: 'Criterium',   hp: 1,    dmg: 1,    elite: 0,    curse: 0,    coins: 1,    roomBonus: 0, finalRooms: 4, blurb: 'the descent as designed' },
  { name: 'Cat 3',      stageName: 'Road Race',   hp: 1.4,  dmg: 1.4,  elite: 0.03, curse: 0.02, coins: 1.35, roomBonus: 1, finalRooms: 5, blurb: 'longer floors, tougher foes' },
  { name: 'Cat 2',      stageName: 'Classic',     hp: 1.95, dmg: 1.95, elite: 0.06, curse: 0.04, coins: 1.8,  roomBonus: 2, finalRooms: 6, blurb: 'longer classic, more elites & curses' },
  { name: 'Cat 1',      stageName: 'Queen Stage', hp: 2.7,  dmg: 2.7,  elite: 0.09, curse: 0.06, coins: 2.4,  roomBonus: 3, finalRooms: 7, blurb: 'extended climb for strong legs' },
  { name: 'Pro',        stageName: 'Monument',    hp: 3.8,  dmg: 3.8,  elite: 0.12, curse: 0.08, coins: 3.2,  roomBonus: 4, finalRooms: 8, blurb: 'monument distance, race pace' },
  { name: 'World Tour', stageName: 'Grand Tour',  hp: 5.3,  dmg: 5.3,  elite: 0.15, curse: 0.1,  coins: 4.2,  roomBonus: 5, finalRooms: 9, blurb: 'full Grand Tour distance' },
];
export const tierOf = (i: number): Tier => TIERS[Math.max(0, Math.min(TIERS.length - 1, Math.floor(i)))];
/** Compute room count for `floor` at `tierIndex` (respects `baseFinalRooms` override on floor 7). Pure. */
export function floorRoomCount(floor: number, tierIndex: number, baseFinalRooms = 4): number {
  const tr = tierOf(tierIndex);
  if (planFor(floor).final) return Math.max(2, Math.min(14, baseFinalRooms + (tr.finalRooms - 4)));
  return Math.max(4, Math.min(18, 9 + floor + tr.roomBonus));
}
/** Highest tier unlocked after a win at `tier` (wins below the top unlocked tier change nothing). */
export const unlockAfterWin = (tier: number, unlocked: number): number => Math.min(TIERS.length - 1, Math.max(unlocked, tier + 1));

/** What the camp shows after a descent ends: a death or a win. */
export interface RunResult {
  won: boolean; floor: number; startFloor: number; tier: number; timeS: number; kills: number; bosses: number;
  perks: number; banked: number; level: number; weapon: string; unlocked?: string;
}
