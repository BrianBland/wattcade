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
  { name: '4 · See-saws', levels: ['5:4', 's-seesaw', '9:46', 'bc:11'] },
  { name: '5 · Tide, wind and water', levels: ['m-tide', 'c-tide', 'm-wind', 'n-pool', 'p-mirror', 'bc:26', 'bc:53'] },
  { name: '6 · Walls and ceilings', levels: ['g-wall', 'w-seam', 'w-vane', 'g-under', 't-mast', 'w-canopy', 's-behind'] },
  { name: '7 · Sight', levels: ['p-turn', 'c-bridge', 'm-gyro', 'c-towers', '6:28', 'bc:39', '6:20', 'bc:10'] },
  { name: '8 · Everything at once', levels: ['bc:19', 'bc:30', 'bc:5', 'bc:25', 'bc:40', 'bc:52'] },
  { name: '9 · The Cube', levels: ['x-cube'] },
];
