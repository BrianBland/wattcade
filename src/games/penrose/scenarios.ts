import type { SessionRecord, TrainerCommand } from '../../contracts';

/** Headless scenarios for Penrose Pedals (run by `npm run sim:all` and Vitest). */
export const scenarios: Array<{
  name: string;
  script: string;
  minutes: number;
  seed: number;
  simOpts?: Record<string, unknown>;
  assert(
    summary: Record<string, number | string>,
    stats: SessionRecord['stats'],
    run: { mixerCommands: TrainerCommand[]; isOver: boolean; events: Array<{ t: number; type: string; data?: Record<string, number | string | boolean> }> },
  ): string[];
}> = [
  {
    name: 'autopilot-tour',
    script: 'z2',
    minutes: 5,
    seed: 1,
    simOpts: { autopilot: true, level: 0 },
    assert(summary, _stats, run) {
      const fail: string[] = [];
      if (run.isOver) fail.push('Penrose should never end early');
      if (Number(summary.at) <= 1) fail.push(`expected autopilot to advance past level 1, stuck at ${summary.at}`);
      if (run.mixerCommands.length === 0) fail.push('expected trainer resistance commands');
      return fail;
    },
  },
  {
    name: 'idle-safe-z2',
    script: 'z2',
    minutes: 3,
    seed: 2,
    simOpts: { level: 0 },
    assert(summary, _stats, run) {
      const fail: string[] = [];
      if (Number(summary.falls) > 0) fail.push(`idle Z2 riding fell ${summary.falls} times on level 1`);
      if (Number(summary.levelsCleared) > 0) fail.push('idle Z2 riding should not clear level 1 without pressing Y');
      if (!run.mixerCommands.some((c) => c.mode === 'sim')) fail.push('expected sim grade commands');
      return fail;
    },
  },
  {
    name: 'intervals-effort-level',
    script: 'intervals',
    minutes: 3,
    seed: 3,
    simOpts: { level: 18 }, // m-tide
    assert(_summary, _stats, run) {
      const fail: string[] = [];
      if (run.isOver) fail.push('should not end');
      if (run.mixerCommands.length === 0) fail.push('expected trainer commands');
      return fail;
    },
  },
];
