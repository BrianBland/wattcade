import type { GameEvent, SessionRecord, TrainerCommand } from '../../contracts';

type Run = { mixerCommands: TrainerCommand[]; isOver: boolean; events: Array<{ t: number } & GameEvent> };
type Summary = Record<string, number | string>;
const n = (s: Summary, k: string) => Number(s[k] ?? 0);

export const scenarios: Array<{
  name: string; script: string; minutes: number; seed: number;
  simOpts?: Record<string, unknown>;
  assert(summary: Summary, stats: SessionRecord['stats'], run: Run): string[];
}> = [
  {
    name: 'auto-z2-playground', script: 'z2', minutes: 10, seed: 1, simOpts: { autopilot: true },
    assert(s, _st, run) {
      const f: string[] = [];
      if (n(s, 'distanceM') < 4000) f.push(`distanceM ${s.distanceM} < 4000`);
      if (n(s, 'jumps') < 10) f.push(`jumps ${s.jumps} < 10`);
      if (n(s, 'steals') < 3) f.push(`steals ${s.steals} < 3`);
      if (n(s, 'crashes') > 10) f.push(`crashes ${s.crashes} > 10 (autopilot keeps bailing)`);
      if (!run.mixerCommands.some((c) => c.mode === 'sim' && c.gradePct > 0)) f.push('never set a climb grade');
      return f;
    },
  },
  {
    name: 'auto-sprints', script: 'sprints', minutes: 10, seed: 2, simOpts: { autopilot: true },
    assert(s) { return n(s, 'distanceM') > 4000 ? [] : [`distanceM ${s.distanceM} <= 4000`]; },
  },
  {
    name: 'idle', script: 'idle', minutes: 5, seed: 3,
    assert(s) { return n(s, 'distanceM') === 0 ? [] : [`distanceM ${s.distanceM} != 0`]; },
  },
  {
    name: 'mash-no-steer', script: 'mash', minutes: 5, seed: 4,
    assert(s) {
      const f: string[] = [];
      if (!(n(s, 'distanceM') > 100)) f.push(`distanceM ${s.distanceM} <= 100`);
      if (n(s, 'crashes') < 1) f.push('riding straight never hit the wall');
      return f;
    },
  },
];
