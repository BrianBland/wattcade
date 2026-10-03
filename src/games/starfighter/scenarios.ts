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
      if (!(Number(s.overdriveS) > 30)) f.push(`overdriveS ${s.overdriveS} <= 30 (sprints should fire the beam)`);
      if (!(Number(s.powerUps) >= 5)) f.push(`powerUps ${s.powerUps} < 5`);
      return f;
    },
  },
  {
    name: 'idle', script: 'idle', minutes: 5, seed: 1, simOpts: { autopilot: true },
    assert(s, _st, run) {
      const f: string[] = [];
      if (!run.isOver) f.push('idle ship should be lost (no cadence = no shots)');
      if (Number(s.kills) > 20) f.push(`idle killed ${s.kills} (only a stray Nova pick-up should kill anything)`);
      return f;
    },
  },
  {
    name: 'intervals', script: 'intervals', minutes: 20, seed: 1, simOpts: { autopilot: true },
    assert(s, _st, run) {
      const f: string[] = [];
      const hi = run.mixerCommands.filter(c => c.mode === 'sim' && c.gradePct >= 3).length;
      if (hi < 1) f.push('no sim command with grade >= 3 during attack runs');
      if (!(Number(s.sectorsCleared) >= 2)) f.push(`sectorsCleared ${s.sectorsCleared} < 2`);
      if (!(Number(s.slipstreams) >= 1)) f.push('no slipstream ridden on intervals');
      return f;
    },
  },
  {
    name: 'z2-half-hour', script: 'z2', minutes: 30, seed: 1, simOpts: { autopilot: true },
    assert(s) {
      const f: string[] = [];
      if (!(Number(s.sector) >= 4)) f.push(`fresh ship reached sector ${s.sector} < 4`);
      if (!(Number(s.scrap) > 1000)) f.push(`scrap ${s.scrap} <= 1000`);
      if (Number(s.slipstreams) > 0) f.push('z2 should not ride slipstreams (zone 3+)');
      return f;
    },
  },
];
