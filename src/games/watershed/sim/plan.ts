// The fixed 45-minute Watershed ride: ERG targets (FTP fraction) and cadence bands per block.

export type Style = 'free' | 'grind' | 'spin' | 'steady' | 'salmon';

export interface Block {
  name: string;
  hint: string;
  minutes: number;
  ftpFrom: number;      // ERG target at the start of the block (FTP fraction)
  ftpTo: number;        // ... and at the end (linear ramp)
  style: Style;
  rpm?: { min: number; max?: number };
}

const GRIND = { min: 60, max: 72 }, SPIN = { min: 98 }, STEADY = { min: 82, max: 95 };

export const PLAN: Block[] = [
  { name: 'Snowmelt', hint: 'Warm up. Spin easy and let the spring fill.', minutes: 6, ftpFrom: 0.5, ftpTo: 0.62, style: 'free' },
  { name: 'Spring flow', hint: 'Steady rpm. Steer the spring to choose your valley.', minutes: 5, ftpFrom: 0.68, ftpTo: 0.68, style: 'steady', rpm: STEADY },
  { name: 'Carve the gorge', hint: 'Grind! Heavy water cuts deep.', minutes: 4, ftpFrom: 0.8, ftpTo: 0.8, style: 'grind', rpm: GRIND },
  { name: 'Still pool', hint: 'Ease off.', minutes: 2, ftpFrom: 0.55, ftpTo: 0.55, style: 'free' },
  { name: 'Flush to the sea', hint: 'Spin! Fast water carries silt to the delta.', minutes: 4, ftpFrom: 0.75, ftpTo: 0.75, style: 'spin', rpm: SPIN },
  { name: 'Still pool', hint: 'Ease off.', minutes: 2, ftpFrom: 0.55, ftpTo: 0.55, style: 'free' },
  { name: 'Flood surge 1', hint: 'Grind through the surge.', minutes: 2, ftpFrom: 0.92, ftpTo: 0.92, style: 'grind', rpm: { min: 65, max: 78 } },
  { name: 'Spill', hint: 'Spin it out.', minutes: 1, ftpFrom: 0.6, ftpTo: 0.6, style: 'spin', rpm: SPIN },
  { name: 'Flood surge 2', hint: 'Grind through the surge.', minutes: 2, ftpFrom: 0.92, ftpTo: 0.92, style: 'grind', rpm: { min: 65, max: 78 } },
  { name: 'Spill', hint: 'Spin it out.', minutes: 1, ftpFrom: 0.6, ftpTo: 0.6, style: 'spin', rpm: SPIN },
  { name: 'Flood surge 3', hint: 'Last surge. Dig!', minutes: 2, ftpFrom: 0.95, ftpTo: 0.95, style: 'grind', rpm: { min: 65, max: 78 } },
  { name: 'Spill', hint: 'Spin it out.', minutes: 1, ftpFrom: 0.6, ftpTo: 0.6, style: 'spin', rpm: SPIN },
  { name: 'Still pool', hint: 'Ease off.', minutes: 2, ftpFrom: 0.55, ftpTo: 0.55, style: 'free' },
  { name: 'Salmon run', hint: 'Guide the school up your river. Spin to leap the falls!', minutes: 6, ftpFrom: 0.68, ftpTo: 0.68, style: 'salmon', rpm: { min: 85 } },
  { name: 'Delta', hint: 'Cool down. Watch the delta grow.', minutes: 5, ftpFrom: 0.55, ftpTo: 0.45, style: 'free' },
];

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
