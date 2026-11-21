// The Watershed campaign: one ride = one level = one objective, with an ERG workout shaped around it. Pure data plus a
// small evaluator (no sim state lives here): the sim measures the valley each second and hands the numbers in.
//
// Levels unlock in order (clearing a level's goal unlocks the next). Each earns up to 3 drops: one for the goal and one
// for each bonus goal (bonus drops only count when the goal is cleared). Free Ride (today's multi-job ride) is always open.

import { WARMUP_PHASES, type Block } from './plan';

/** What a level's goal measures (see `LevelMetrics`). */
export type GoalKind = 'carve' | 'grist' | 'harvest' | 'village' | 'dam' | 'salmon' | 'delta';
/** Extra tools a level hands the rider. */
export type Tool = 'gate' | 'levee';

/** Numbers the sim measures for the level (cumulative over the ride). */
export interface LevelMetrics {
  deepestCut: number; carved: number; delta: number; toSea: number;
  /** Mill output (fit-weighted seconds turning). */
  flour: number; planks: number;
  harvests: number;
  /** Field-seconds spent drowned. */
  drownedS: number;
  /** Surges survived so far / surges lost (level with `surge` blocks). */
  surgesHeld: number; surgesLost: number;
  floodS: number;
  /** The old log dam (level `logDam`): 1 = intact, 0 = gone; broken once it falls under half; when (seconds after the spring rose). */
  damHealth: number; damBroken: boolean; damBrokenAt: number;
  salmonHome: number; salmonLost: number;
  bandPct: number;
  /** Ride seconds so far. */
  t: number;
}

export type MetricKey = keyof LevelMetrics;
export interface Bonus { label: string; metric: MetricKey; op: '>=' | '<='; value: number }

export interface LevelDef {
  id: string;
  n: number;
  name: string;
  /** One line for the picker. */
  blurb: string;
  /** What this level teaches (shown under the goal). */
  teaches: string;
  goal: { kind: GoalKind; title: string; hint: string; target: number; unit: string };
  bonus: [Bonus, Bonus];
  /** The workout after the shared warm-up (evaporation, cloud, rain). */
  blocks: Block[];
  tools?: Tool[];
  /** The level starts with an old log dam across the valley's natural first crossing (ridge 1's deepest saddle). */
  logDam?: boolean;
}

const GRIND = { min: 60, max: 72 }, SPIN = { min: 98 }, STEADY = { min: 82, max: 95 }, TEMPO = { min: 85, max: 95 };
const SURGE = { min: 65, max: 78 }, SPRINT = { min: 100 };

/** The shared warm-up: evaporation and cloud (skippable), then the rain that decides where the spring rises. */
export const WARMUP: Block[] = [
  { name: 'Evaporation', hint: 'Warm up. Spin to lift vapor off the sea, and chase the sunlight.', minutes: 2.5, ftpFrom: 0.5, ftpTo: 0.58, phase: 'evaporate', style: 'steady', rpm: { min: 80 } },
  { name: 'Gathering cloud', hint: 'Drift inland. Steer into the cloudlets to grow your cloud.', minutes: 2, ftpFrom: 0.62, ftpTo: 0.65, phase: 'cloud', style: 'steady', rpm: STEADY },
  { name: 'Rain on the peaks', hint: 'Where you rain, the spring rises.', minutes: 2, ftpFrom: 0.68, ftpTo: 0.7, phase: 'rain', style: 'free' },
];

type R = Omit<Block, 'phase'> & { phase?: Block['phase'] };
const river = (b: R): Block => ({ phase: 'river', ...b });
const easy = (minutes: number, name = 'Ease off', hint = 'Recover. Let the river settle.'): Block => river({ name, hint, minutes, ftpFrom: 0.55, ftpTo: 0.55, style: 'free' });
const cool = (minutes: number, hint = 'Cool down. Watch your river run.'): Block => river({ name: 'Cool down', hint, minutes, ftpFrom: 0.55, ftpTo: 0.45, style: 'free' });
const rep = (n: number, f: (k: number) => Block[]): Block[] => Array.from({ length: n }, (_, k) => f(k + 1)).flat();

export const LEVELS: LevelDef[] = [
  {
    id: 'first-spring', n: 1, name: 'First Spring', blurb: 'Carve your first valley: grind, and watch the ground give way.',
    teaches: 'Heavy water (grind) carves; light water (spin) carries.',
    goal: { kind: 'carve', title: 'Carve 5,000 of earth', hint: 'Grind: heavy water cuts the valley floor.', target: 5000, unit: '' },
    bonus: [{ label: 'Carve a 32 m gorge', metric: 'deepestCut', op: '>=', value: 8 }, { label: '80% of the ride in the band', metric: 'bandPct', op: '>=', value: 80 }],
    blocks: [
      river({ name: 'Find your line', hint: 'Steady. ◀▶ steer the current down the valley.', minutes: 2, ftpFrom: 0.65, ftpTo: 0.68, style: 'steady', rpm: STEADY }),
      ...rep(3, (k) => [
        river({ name: `Grind push ${k}`, hint: 'Grind! Heavy water cuts the ridge.', minutes: 2, ftpFrom: 0.8, ftpTo: 0.82, style: 'grind', rpm: GRIND }),
        river({ name: 'Steady', hint: 'Steady. Let the lake spill and follow it.', minutes: 1.5, ftpFrom: 0.65, ftpTo: 0.65, style: 'steady', rpm: STEADY }),
      ]),
      cool(2),
    ],
  },
  {
    id: 'grist-mill', n: 2, name: 'The Grist Mill', blurb: 'Route the river through the far saddle and turn the overshot wheel.',
    teaches: 'The current marker: hold it over a saddle to choose the river\'s route.',
    goal: { kind: 'grist', title: 'Mill 4 minutes of flour', hint: 'Steer the current to the mill\'s saddle, then grind: it needs heavy water.', target: 240, unit: ' s' },
    bonus: [{ label: 'Mill 7 minutes of flour', metric: 'flour', op: '>=', value: 420 }, { label: '80% in the band', metric: 'bandPct', op: '>=', value: 80 }],
    blocks: [
      river({ name: 'Find the saddle', hint: 'Steady. Steer the current toward the grist mill.', minutes: 2, ftpFrom: 0.65, ftpTo: 0.68, style: 'steady', rpm: STEADY }),
      ...rep(4, (k) => [
        river({ name: `Grind ${k} of 4`, hint: 'Grind! Heavy water turns the overshot wheel.', minutes: 3, ftpFrom: 0.8, ftpTo: 0.8, style: 'grind', rpm: GRIND }),
        easy(1),
      ]),
      cool(1.5),
    ],
  },
  {
    id: 'beaver-crew', n: 3, name: 'Beaver Crew', blurb: 'Gate off the easy saddle so the whole river turns the grist mill.',
    teaches: 'Beaver gates make a route stick. Time in the band pays the crew.',
    goal: { kind: 'grist', title: 'Mill 9 minutes of flour', hint: 'A: the beavers dam the saddle nearest your current. Gate the easy route, then grind.', target: 540, unit: ' s' },
    bonus: [{ label: 'Mill 12 minutes of flour', metric: 'flour', op: '>=', value: 720 }, { label: '80% in the band', metric: 'bandPct', op: '>=', value: 80 }],
    tools: ['gate'],
    blocks: [
      river({ name: 'Call the crew', hint: 'Tempo. Point the current at the easy saddle and press A: the beavers dam it.', minutes: 3, ftpFrom: 0.68, ftpTo: 0.7, style: 'steady', rpm: TEMPO }),
      ...rep(3, (k) => [
        river({ name: `Grind ${k} of 3`, hint: 'Grind! The gate holds; heavy water turns the wheel.', minutes: 3, ftpFrom: 0.8, ftpTo: 0.8, style: 'grind', rpm: GRIND }),
        river({ name: 'Tempo', hint: 'Hold the band: the beavers keep building while you do.', minutes: 1.5, ftpFrom: 0.7, ftpTo: 0.7, style: 'steady', rpm: TEMPO }),
      ]),
      cool(1.5),
    ],
  },
  {
    id: 'breadbasket', n: 4, name: 'Breadbasket', blurb: 'Water the farms: beside the fields, never over them.',
    teaches: 'Water beside, not over. Spin-ups spread the river into braids.',
    goal: { kind: 'harvest', title: 'Bring in 12 harvests', hint: 'Steer the river beside the fields (not over them).', target: 12, unit: '' },
    bonus: [{ label: 'Drown fields for under 5 minutes in all', metric: 'drownedS', op: '<=', value: 300 }, { label: 'Bring in 18 harvests', metric: 'harvests', op: '>=', value: 18 }],
    blocks: [
      river({ name: 'Open the channel', hint: 'Grind a channel past the first ridge.', minutes: 3, ftpFrom: 0.75, ftpTo: 0.78, style: 'grind', rpm: GRIND }),
      ...rep(4, (k) => [
        river({ name: `Steady ${k}`, hint: 'Steady. Keep the river beside the fields.', minutes: 3, ftpFrom: 0.68, ftpTo: 0.7, style: 'steady', rpm: STEADY }),
        river({ name: 'Spin-up', hint: 'Spin! Light water spreads silt onto the farmland.', minutes: 1, ftpFrom: 0.75, ftpTo: 0.75, style: 'spin', rpm: SPIN }),
      ]),
      cool(2),
    ],
  },
  {
    id: 'millbrook-flood', n: 5, name: 'Millbrook Flood', blurb: 'Keep the village dry through three flood surges.',
    teaches: 'The villagers raise a levee while you hold the band. Plan before the surge.',
    goal: { kind: 'village', title: 'Hold back 3 surges', hint: 'Hold the band to build the levee, and steer each surge away from Millbrook.', target: 3, unit: '' },
    bonus: [{ label: 'Not a drop in Millbrook', metric: 'floodS', op: '<=', value: 0 }, { label: '80% in the band', metric: 'bandPct', op: '>=', value: 80 }],
    tools: ['levee'],
    blocks: [
      river({ name: 'Raise the levee', hint: 'Steady in the band: the villagers build while you do.', minutes: 3, ftpFrom: 0.65, ftpTo: 0.68, style: 'steady', rpm: STEADY }),
      ...rep(3, (k) => [
        river({ name: `Flood surge ${k}`, hint: k === 3 ? 'The big one. Grind it into the far channel!' : 'Grind through the surge. Steer it away from Millbrook.', minutes: 2, ftpFrom: k === 3 ? 0.97 : 0.93, ftpTo: k === 3 ? 0.97 : 0.93, style: 'grind', rpm: SURGE, surge: true }),
        river({ name: 'Under', hint: 'Recover in the band: the villagers patch the levee.', minutes: 3, ftpFrom: 0.62, ftpTo: 0.62, style: 'steady', rpm: STEADY }),
      ]),
      cool(2),
    ],
  },
  {
    id: 'dam-buster', n: 6, name: 'Dam Buster', blurb: 'Break the old log dam and drain the lake before the melt.',
    teaches: 'Fast, light water wears dams away. A: surge.',
    goal: { kind: 'dam', title: 'Break the old log dam', hint: 'Steer the current onto the dam, then sprint: fast water wears it down. A: surge.', target: 1, unit: '' },
    bonus: [{ label: 'Break it within 4 minutes of the spring rising', metric: 'damBrokenAt', op: '<=', value: 4 * 60 }, { label: '80% in the band', metric: 'bandPct', op: '>=', value: 80 }],
    logDam: true,
    blocks: [
      river({ name: 'Fill the lake', hint: 'Steady. Find the dam with the current.', minutes: 2, ftpFrom: 0.65, ftpTo: 0.68, style: 'steady', rpm: STEADY }),
      ...rep(8, (k) => [
        river({ name: `Sprint ${k} of 8`, hint: 'Sprint! Fast water hammers the logs.', minutes: 0.5, ftpFrom: 0.85, ftpTo: 0.85, style: 'spin', rpm: SPRINT }),
        river({ name: 'Recover', hint: 'Easy spin. Keep the current on the dam.', minutes: 1, ftpFrom: 0.55, ftpTo: 0.55, style: 'free' }),
      ]),
      cool(2, 'Cool down. Watch the lake drain.'),
    ],
  },
  {
    id: 'homecoming', n: 7, name: 'Homecoming', blurb: 'Build the salmon a river, then bring them home.',
    teaches: 'Your river\'s shape is the salmon\'s path.',
    goal: { kind: 'salmon', title: 'Bring 60 salmon home', hint: 'Steer the school away from bears and eagles; spin to leap the falls.', target: 60, unit: '' },
    bonus: [{ label: 'Lose 30 fish or fewer', metric: 'salmonLost', op: '<=', value: 30 }, { label: 'Bring 100 home', metric: 'salmonHome', op: '>=', value: 100 }],
    blocks: [
      river({ name: 'Carve the run', hint: 'Grind a deep channel: deep water is safe water.', minutes: 4, ftpFrom: 0.78, ftpTo: 0.8, style: 'grind', rpm: GRIND }),
      easy(1),
      river({ name: 'Flush the falls', hint: 'Spin! Fast water smooths the falls.', minutes: 4, ftpFrom: 0.72, ftpTo: 0.72, style: 'spin', rpm: SPIN }),
      easy(1, 'Still pool', 'Ease off. The salmon are gathering at the sea.'),
      { name: 'Salmon run', hint: 'Guide the school up your river. Spin to leap the falls!', minutes: 12, ftpFrom: 0.68, ftpTo: 0.68, phase: 'salmon', style: 'salmon', rpm: { min: 85 } },
      cool(2),
    ],
  },
  {
    id: 'delta', n: 8, name: 'The Delta', blurb: 'Grow a delta big enough for a harbour town.',
    teaches: 'Silt travels a long way on light, fast water.',
    goal: { kind: 'delta', title: 'Build 5,200 of delta', hint: 'Spin to carry silt to the coast; grind to give it silt to carry. Spread it with the current.', target: 5200, unit: '' },
    bonus: [{ label: 'Build 6,500 of delta', metric: 'delta', op: '>=', value: 6500 }, { label: '85% in the band', metric: 'bandPct', op: '>=', value: 85 }],
    blocks: [
      river({ name: 'Cut the source', hint: 'Grind: carve silt out of the hills.', minutes: 3, ftpFrom: 0.72, ftpTo: 0.75, style: 'grind', rpm: GRIND }),
      ...rep(3, (k) => [
        river({ name: `Long carry ${k}`, hint: 'Steady spin: light water carries silt to the sea.', minutes: 5, ftpFrom: 0.66, ftpTo: 0.68, style: 'steady', rpm: { min: 90, max: 102 } }),
        river({ name: 'Dig', hint: 'Grind: more silt for the delta.', minutes: 2, ftpFrom: 0.72, ftpTo: 0.72, style: 'grind', rpm: GRIND }),
      ]),
      cool(2, 'Cool down. Watch the delta grow.'),
    ],
  },
];

export const FREE_RIDE = { id: 'free', n: LEVELS.length + 1, name: 'Whole Watershed', blurb: 'The full water cycle with every job: Free Ride.' } as const;
export type LevelId = string;

export const levelById = (id: string | undefined): LevelDef | null => LEVELS.find((l) => l.id === id) ?? null;

/** A level's full ride plan: the shared warm-up (minus evaporation and cloud when skipped), then its workout. */
export function levelPlan(def: LevelDef, skipWarmup = false): Block[] {
  const warm = skipWarmup ? WARMUP.filter((b) => !WARMUP_PHASES.includes(b.phase)) : WARMUP;
  return [...warm, ...def.blocks].map((b) => ({ ...b }));
}

/** Best drops per level id, from the save. */
export type Progress = Record<string, number>;

/** Levels open to play: level 1, and each level after one whose goal was cleared (≥ 1 drop). */
export function unlocked(progress: Progress | undefined, def: LevelDef): boolean {
  if (def.n === 1) return true;
  const prev = LEVELS[def.n - 2];
  return (progress?.[prev.id] ?? 0) >= 1;
}

/** The level a returning rider most likely wants: the first unlocked level without 3 drops, else Free Ride. */
export function suggestedLevel(progress: Progress | undefined): string {
  const open = LEVELS.filter((l) => unlocked(progress, l));
  const next = open.find((l) => (progress?.[l.id] ?? 0) < 1) ?? open.find((l) => (progress?.[l.id] ?? 0) < 3);
  return next?.id ?? FREE_RIDE.id;
}

export const totalDrops = (progress: Progress | undefined): number => LEVELS.reduce((a, l) => a + Math.min(3, progress?.[l.id] ?? 0), 0);
export const levelsCleared = (progress: Progress | undefined): number => LEVELS.filter((l) => (progress?.[l.id] ?? 0) >= 1).length;

const test = (b: Bonus, m: LevelMetrics): boolean => {
  const v = b.metric === 'damBrokenAt' ? (m.damBroken ? m.damBrokenAt : Infinity) : Number(m[b.metric]);
  return b.op === '>=' ? v >= b.value : v <= b.value;
};

export interface GoalView { title: string; hint: string; progress: number; state: 'active' | 'done' | 'failed'; value: number; target: number; unit: string }
export interface LevelView { id: string; n: number; name: string; teaches: string; goal: GoalView; bonus: Array<{ label: string; got: boolean }>; drops: number; tools: Tool[] }

/** Goal progress (0..1) and its value in the goal's own unit. */
export function goalValue(def: LevelDef, m: LevelMetrics): number {
  switch (def.goal.kind) {
    case 'carve': return m.carved;
    case 'grist': return m.flour;
    case 'harvest': return m.harvests;
    case 'village': return m.surgesHeld;
    case 'dam': return m.damBroken ? 1 : Math.min(0.99, 2 * (1 - m.damHealth));
    case 'salmon': return m.salmonHome;
    case 'delta': return m.delta;
  }
}

/**
 * The level's live state. The goal is done the moment it's reached (and stays done); a flood surge lost fails the
 * village goal at once; anything else not reached by the end of the ride fails then (`over`).
 */
export class LevelRun {
  state: GoalView['state'] = 'active';
  doneAt = -1;
  private bonusGot: boolean[] = [false, false];
  constructor(readonly def: LevelDef) {}

  /** Re-evaluate; returns the cue to raise, if the goal just finished or failed. */
  update(m: LevelMetrics, over: boolean): 'done' | 'failed' | null {
    const v = goalValue(this.def, m);
    this.bonusGot = this.def.bonus.map((b) => test(b, m));
    if (this.state !== 'active') return null;
    if (v >= this.def.goal.target) { this.state = 'done'; this.doneAt = m.t; return 'done'; }
    if (this.def.goal.kind === 'village' && m.surgesLost > 0) { this.state = 'failed'; return 'failed'; }
    if (over) { this.state = 'failed'; return 'failed'; }
    return null;
  }

  /** Drops earned so far (bonus drops count only once the goal is done). */
  drops(): number { return this.state === 'done' ? 1 + this.bonusGot.filter(Boolean).length : 0; }

  view(m: LevelMetrics): LevelView {
    const d = this.def, v = goalValue(d, m);
    return {
      id: d.id, n: d.n, name: d.name, teaches: d.teaches, tools: d.tools ?? [],
      goal: { title: d.goal.title, hint: d.goal.hint, progress: this.state === 'done' ? 1 : Math.max(0, Math.min(1, v / d.goal.target)), state: this.state, value: v, target: d.goal.target, unit: d.goal.unit },
      bonus: d.bonus.map((b, k) => ({ label: b.label, got: this.bonusGot[k] })),
      drops: this.drops(),
    };
  }
}
