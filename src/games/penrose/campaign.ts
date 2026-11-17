/**
 * The campaign: chapters in play order. Each level is one of:
 * - a hand-built level id (levels.ts, studies.ts, persp.ts, machines2.ts, combos.ts, gravity.ts, gravity2.ts, levels3.ts),
 * - `'<tier>:<seed>'`, a level from the main generator (gen9.ts: TIERS[tier], planned from seed),
 * - `'cg:<seed>'`, a level from the curtain generator (curtain.ts),
 * - `'bc:<seed>'`, a level from the beat composer (engine/compose.ts; sweep with a solve + idle + audit pass).
 * Generated picks come from seed sweeps (scripts/penrose-gen-sweep.mjs); check edits with scripts/penrose-solve-check.mjs.
 */
export interface Chapter { name: string; levels: string[] }

export const CAMPAIGN: Chapter[] = [
  { name: '1 · Turntables and doors', levels: ['turntable', '3:11', '3:28', 'w-doors', '10:5', '10:45', 'd-peek'] },
  { name: '2 · Crossovers', levels: ['cross', 'crosshub', '0:7', '8:4', '8:30'] },
  { name: '3 · Cadence lifts', levels: ['m-lift', 'c-curtain', '7:38', 'c-under', 'w-lanes', 'd-lanes'] },
  { name: '4 · See-saws', levels: ['5:4', 's-seesaw', '9:46', 'bc:24'] },
  { name: '5 · Tide, wind and water', levels: ['m-tide', 'c-tide', 'm-wind', 'n-pool', 'p-mirror', 'bc:23', 'bc:47'] },
  { name: '6 · Walls and ceilings', levels: ['g-wall', 'w-seam', 'w-vane', 'g-under', 't-mast', 'w-canopy', 's-behind'] },
  { name: '7 · Sight', levels: ['p-turn', 'c-bridge', 'm-gyro', 'c-towers', '6:28', 'bc:39', '6:20', 'bc:1'] },
  { name: '8 · Everything at once', levels: ['bc:22', 'bc:3', 'bc:13', 'bc:9', 'bc:29', 'bc:52'] },
  { name: '9 · The Cube', levels: ['x-cube'] },
];

/**
 * For each main-generator campaign level, the sub-seed that plans first (`plan3For(...).sub`). Planning tries sub-seeds
 * in order and the failing ones cost up to a second of CPU per level; starting at the known one makes the same level
 * in a few ms. Re-take these (the sweep prints `sub`) when gen9.ts changes; a stale entry falls back to the full search.
 */
export const PLAN_SUB: Record<string, number> = {
  '3:11': 2, '3:28': 20, '10:5': 24, '10:45': 13, '0:7': 33, '8:4': 18, '8:30': 39, '7:38': 20, '5:4': 0, '9:46': 9, '6:28': 4, '6:20': 35,
};
