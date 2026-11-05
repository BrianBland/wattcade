// The fixed 45-minute Watershed ride: ERG targets (FTP fraction) and cadence bands per block.

export type Style = 'free' | 'grind' | 'spin' | 'steady' | 'salmon';
/** Which part of the water cycle a block plays. */
export type Phase = 'evaporate' | 'cloud' | 'rain' | 'river' | 'salmon';

export interface Block {
  name: string;
  hint: string;
  minutes: number;
  ftpFrom: number;      // ERG target at the start of the block (FTP fraction)
  ftpTo: number;        // ... and at the end (linear ramp)
  style: Style;
  phase: Phase;
  rpm?: { min: number; max?: number };
  /** The river job this block asks for (see objectives.ts). */
  job?: 'grist' | 'saw' | 'village' | 'dam' | 'fields';
  /** Beavers move in during this block. */
  beavers?: boolean;
}

const GRIND = { min: 60, max: 72 }, SPIN = { min: 98 }, STEADY = { min: 82, max: 95 };

const SURGE = { min: 65, max: 78 };
const B = {
  evap: { name: 'Evaporation', hint: 'Warm up. Spin to lift vapor off the sea, and chase the sunlight.', minutes: 4, ftpFrom: 0.5, ftpTo: 0.58, phase: 'evaporate', style: 'steady', rpm: { min: 80 } },
  cloud: { name: 'Gathering cloud', hint: 'Drift inland. Steer into the cloudlets to grow your cloud.', minutes: 4, ftpFrom: 0.62, ftpTo: 0.66, phase: 'cloud', style: 'steady', rpm: STEADY },
  rain: { name: 'Rain on the peaks', hint: 'Grind for a downpour, spin for drizzle. Where you rain, the spring rises.', minutes: 3, ftpFrom: 0.7, ftpTo: 0.72, phase: 'rain', style: 'free' },
  carve: { name: 'Carve the gorge', hint: 'Grind! Heavy water cuts deep.', minutes: 4, ftpFrom: 0.8, ftpTo: 0.8, phase: 'river', job: 'grist', style: 'grind', rpm: GRIND },
  beavers: { name: 'Still pool', hint: 'Ease off.', minutes: 2, ftpFrom: 0.55, ftpTo: 0.55, phase: 'river', beavers: true, style: 'free' },
  flush: { name: 'Flush to the sea', hint: 'Spin! Fast water carries silt and breaks dams.', minutes: 4, ftpFrom: 0.75, ftpTo: 0.75, phase: 'river', job: 'dam', style: 'spin', rpm: SPIN },
  still: { name: 'Still pool', hint: 'Ease off.', minutes: 2, ftpFrom: 0.55, ftpTo: 0.55, phase: 'river', style: 'free' },
  salmon: { name: 'Salmon run', hint: 'Guide the school up your river. Spin to leap the falls!', minutes: 6, ftpFrom: 0.68, ftpTo: 0.68, phase: 'salmon', style: 'salmon', rpm: { min: 85 } },
  delta: { name: 'Delta', hint: 'Cool down. Watch the delta grow.', minutes: 5, ftpFrom: 0.55, ftpTo: 0.45, phase: 'river', style: 'free' },
} satisfies Record<string, Block>;

/** Ride lengths the pre-game menu offers (minutes). */
export const RIDE_LENGTHS = [20, 30, 45, 60] as const;
export const RIDE_BLURB: Record<number, string> = { 20: 'Quick cycle: one flood', 30: 'Short ride: two floods', 45: 'The full water cycle', 60: 'Epic: four floods' };
/** The warm-up phases a rider who is already warm can skip (they start at the rain with a ready-made cloud). */
export const WARMUP_PHASES: readonly Phase[] = ['evaporate', 'cloud'];

/**
 * The ride plan for a length in minutes: the same story at any length. Shorter rides drop still pools and flood
 * cycles (1/2/3/4 surges for 20/30/45/60 min); every block scales to fit (0.5 min steps, at least 1 min) and the
 * salmon run / delta absorb rounding. makePlan(45) is the original 45-minute plan. `skipWarmup` then drops the
 * warm-up phases (the ride gets shorter by their length; the rest is unchanged).
 */
export function makePlan(minutes: number, skipWarmup = false): Block[] {
  const floods = minutes <= 20 ? 1 : minutes <= 30 ? 2 : minutes <= 45 ? 3 : 4;
  const blocks: Block[] = [B.evap, B.cloud, B.rain, B.carve, B.beavers, B.flush];
  if (minutes > 20) blocks.push(B.still);
  for (let k = 1; k <= floods; k++) {
    const last = k === floods && floods > 1;
    blocks.push({ name: `Flood surge ${k}`, hint: last ? 'Last surge. Dig!' : 'Grind through the surge.', minutes: 2, ftpFrom: last ? 0.95 : 0.92, ftpTo: last ? 0.95 : 0.92, phase: 'river', job: 'village', style: 'grind', rpm: SURGE });
    blocks.push({ name: 'Spill', hint: 'Spin it out.', minutes: 1, ftpFrom: 0.6, ftpTo: 0.6, phase: 'river', job: k === 1 ? 'saw' : 'fields', style: 'spin', rpm: SPIN });
  }
  if (minutes > 20) blocks.push(B.still);
  blocks.push(B.salmon, B.delta);
  const base = blocks.reduce((a, b) => a + b.minutes, 0), k = minutes / base;
  const out = blocks.map((b) => ({ ...b, minutes: Math.max(1, Math.round(b.minutes * k * 2) / 2) }));
  let drift = minutes - out.reduce((a, b) => a + b.minutes, 0);
  const salmon = out.find((b) => b.phase === 'salmon')!, delta = out[out.length - 1];
  for (const b of drift > 0 ? [salmon] : [delta, salmon]) {   // overshoot comes out of the cool-down first
    if (Math.abs(drift) < 1e-9) break;
    const step = drift > 0 ? drift : Math.max(drift, 2 - b.minutes);
    b.minutes += step; drift -= step;
  }
  return skipWarmup ? out.filter((b) => !WARMUP_PHASES.includes(b.phase)) : out;
}

export const PLAN: Block[] = makePlan(45);

/** Total minutes of a plan. */
export const planMinutes = (plan: Block[]): number => plan.reduce((a, b) => a + b.minutes, 0);

export const PLAN_MINUTES = PLAN.reduce((a, b) => a + b.minutes, 0);

export interface PlanAt { index: number; block: Block; ftp: number; blockT: number; blockLeft: number; done: boolean }

/** Where `t` seconds lands in the plan (with every block's length multiplied by `scale`). */
export function planAt(t: number, scale = 1, plan: Block[] = PLAN): PlanAt {
  let start = 0;
  for (let index = 0; index < plan.length; index++) {
    const block = plan[index], len = block.minutes * 60 * scale;
    if (t < start + len) {
      const k = (t - start) / len;
      return { index, block, ftp: block.ftpFrom + (block.ftpTo - block.ftpFrom) * k, blockT: t - start, blockLeft: start + len - t, done: false };
    }
    start += len;
  }
  const block = plan[plan.length - 1];
  return { index: plan.length - 1, block, ftp: block.ftpTo, blockT: block.minutes * 60 * scale, blockLeft: 0, done: true };
}

/** A cadence in the middle of a block's band (what a well-behaved rider would hold). */
export function bandMid(b: Block): number {
  if (b.style === 'salmon') return 96;
  if (!b.rpm) return 90;
  return b.rpm.max !== undefined ? (b.rpm.min + b.rpm.max) / 2 : b.rpm.min + 6;
}
