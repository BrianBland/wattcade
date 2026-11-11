import type { GameEvent, SessionRecord, TrainerCommand } from '../../contracts';

type Summary = Record<string, number | string>;
type Run = { mixerCommands: TrainerCommand[]; isOver: boolean; events: Array<{ t: number } & GameEvent> };
const grades = (run: Run) => run.mixerCommands.flatMap((c) => (c.mode === 'sim' ? [c.gradePct] : []));
const medals = (run: Run) => run.events.filter((e) => e.type === 'setPiece').map((e) => Number(e.data?.medal));

export const scenarios: Array<{
  name: string; script: string; minutes: number; seed: number;
  simOpts?: Record<string, unknown>;
  assert(summary: Summary, stats: SessionRecord['stats'], run: Run): string[];
}> = [
  {
    // hook-responsive sprints at 1.5 FTP whenever hooks.shielded (= a set piece's sprint window) is set.
    name: 'sprinting every set piece earns medals', script: 'hook-responsive', minutes: 20, seed: 1, simOpts: { tour: 'quick' },
    assert(s, st, run) {
      const f: string[] = [];
      const m = medals(run);
      if (m.length !== 5) f.push(`set pieces ${m.length} != 5`);
      if (m.some((x) => x < 1)) f.push(`missed a set piece at 1.5 FTP: ${s.medals}`);
      if (!(Number(s.gold) >= 2)) f.push(`gold ${s.gold} < 2`);
      if (!(st.sprints >= 4)) f.push(`sprints ${st.sprints} < 4`);
      if (!run.isOver) f.push('tour did not finish in 20 min');
      if (grades(run).some((g) => g < -5 || g > 8)) f.push('grade outside [-5, 8]');
      return f;
    },
  },
  {
    name: 'a steady Z2 rider misses but still finishes', script: 'z2', minutes: 20, seed: 2, simOpts: { tour: 'quick' },
    assert(s, _st, run) {
      const f: string[] = [];
      const m = medals(run);
      if (m.length !== 5) f.push(`set pieces ${m.length} != 5`);
      if (m.some((x) => x > 0)) f.push(`Z2 should not medal: ${s.medals}`);
      if (!run.isOver) f.push('tour did not finish');
      return f;
    },
  },
  {
    name: 'classic tour runs to the end', script: 'hook-responsive', minutes: 32, seed: 3,
    assert(s, _st, run) {
      const f: string[] = [];
      if (Number(s.sets) !== 8) f.push(`sets ${s.sets} != 8`);
      if (!run.isOver) f.push('classic tour did not finish in 32 min');
      if (!(Number(s.topKph) > 250)) f.push(`topKph ${s.topKph} <= 250`);
      return f;
    },
  },
];
