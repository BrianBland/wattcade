/**
 * The campaign: chapters in play order. Each level is one of:
 * - a hand-built level id (levels.ts, studies.ts, persp.ts, machines2.ts, combos.ts, gravity.ts, gravity2.ts),
 * - `'<tier>:<seed>'`, a level from the main generator (gen9.ts: TIERS[tier], planned from seed),
 * - `'cg:<seed>'`, a level from the curtain generator (curtain.ts).
 * Generated picks come from seed sweeps (scripts/penrose-gen-sweep.mjs); check edits with scripts/penrose-solve-check.mjs.
 */
export interface Chapter { name: string; levels: string[] }

export const CAMPAIGN: Chapter[] = [
  { name: '1 · Turntables', levels: ['turntable', '3:11', '3:28', '10:5', '10:45'] },
  { name: '2 · Crossovers', levels: ['cross', 'crosshub', '0:7', '8:4', '8:30'] },
  { name: '3 · Cadence lifts', levels: ['m-lift', 'c-curtain', '7:38', 'c-under'] },
  { name: '4 · See-saws', levels: ['5:4', '5:23', '9:46'] },
  { name: '5 · Tide and wind', levels: ['m-tide', 'c-tide', 'm-wind'] },
  { name: '6 · Walls and ceilings', levels: ['g-wall', 'w-vane', 'g-under', 't-mast', 'w-canopy'] },
  { name: '7 · Sight', levels: ['p-turn', 'c-bridge', 'm-gyro', 'c-towers', '6:28', '6:20'] },
  { name: '8 · Generated curtains', levels: ['cg:297', 'cg:187', 'cg:86', 'cg:510'] },
];
