import type { GameEvent, SessionRecord, TrainerCommand } from '../../contracts';

type Summary = Record<string, number | string>;
type Run = { mixerCommands: TrainerCommand[]; isOver: boolean; events: Array<{ t: number } & GameEvent> };
const grades = (run: Run) => run.mixerCommands.flatMap((c) => (c.mode === 'sim' ? [c.gradePct] : []));

export const scenarios: Array<{
  name: string; script: string; minutes: number; seed: number;
  simOpts?: Record<string, unknown>;
  assert(summary: Summary, stats: SessionRecord['stats'], run: Run): string[];
}> = [
  {
    name: 'z2 rolls along', script: 'z2', minutes: 10, seed: 1,
    assert(s, _st, run) {
      const f: string[] = [];
      if (run.isOver) f.push('warm-up never ends');
      if (!(Number(s.distanceKm) > 3)) f.push(`distanceKm ${s.distanceKm} <= 3`);
      if (!(Number(s.biomes) >= 2)) f.push(`biomes ${s.biomes} < 2`);
      const g = grades(run);
      if (!(Math.max(...g) > 1 && Math.min(...g) < -1)) f.push(`grades ${Math.min(...g)}..${Math.max(...g)} not rolling`);
      if (g.some((x) => Math.abs(x) > 4)) f.push('grade beyond maxGrade (+gear)');
      return f;
    },
  },
  {
    name: 'idle stands still', script: 'idle', minutes: 3, seed: 1,
    assert(s) { return Number(s.distanceKm) < 0.05 ? [] : [`idle moved ${s.distanceKm} km`]; },
  },
  {
    name: 'drive-in rides the same road', script: 'z2', minutes: 10, seed: 1, simOpts: { driveIn: true },
    assert(s, _st, run) {
      const f: string[] = [];
      if (!(Number(s.distanceKm) > 3)) f.push(`distanceKm ${s.distanceKm} <= 3`);
      if (grades(run).some((x) => Math.abs(x) > 4)) f.push('grade beyond maxGrade (+gear)');
      return f;
    },
  },
];
