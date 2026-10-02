import type { GameEvent, SessionRecord, TrainerCommand } from '../../contracts';

type Summary = Record<string, number | string>;
type Run = { mixerCommands: TrainerCommand[]; isOver: boolean; events: Array<{ t: number } & GameEvent> };

export const scenarios: Array<{
  name: string; script: string; minutes: number; seed: number;
  simOpts?: Record<string, unknown>;
  assert(summary: Summary, stats: SessionRecord['stats'], run: Run): string[];
}> = [
  {
    name: 'sprints', script: 'sprints', minutes: 15, seed: 1, simOpts: { autopilot: true },
    assert(s, _st, run) {
      const f: string[] = [];
      if (run.isOver) f.push('should survive 15 min');
      if (!(Number(s.bossesDefeated) >= 2)) f.push(`bossesDefeated ${s.bossesDefeated} < 2`);
      return f;
    },
  },
  {
    name: 'idle', script: 'idle', minutes: 5, seed: 1, simOpts: { autopilot: true },
    assert(s, _st, run) {
      const f: string[] = [];
      if (!run.isOver && !(Number(s.score) < 0.1 * SPRINTS_REF)) f.push(`idle neither died nor scored < ${0.1 * SPRINTS_REF}`);
      return f;
    },
  },
  {
    name: 'intervals', script: 'intervals', minutes: 20, seed: 1, simOpts: { autopilot: true },
    assert(_s, _st, run) {
      const f: string[] = [];
      const hi = run.mixerCommands.filter(c => c.mode === 'sim' && c.gradePct >= 3).length;
      if (hi < 1) f.push('no sim command with grade >= 3 during attack runs');
      return f;
    },
  },
];
// rough reference for the idle check (sprints ~ tens of thousands); idle should die long before this matters
const SPRINTS_REF = 20000;
