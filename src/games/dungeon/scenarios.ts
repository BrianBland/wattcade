import type { GameEvent, SessionRecord, TrainerCommand } from '../../contracts';

type Run = { mixerCommands: TrainerCommand[]; isOver: boolean; events: Array<{ t: number } & GameEvent> };

export const scenarios: Array<{
  name: string; script: string; minutes: number; seed: number;
  simOpts?: Record<string, unknown>;
  assert(summary: Record<string, number | string>, stats: SessionRecord['stats'], run: Run): string[];
}> = [
  {
    name: 'sprints-boss', script: 'sprints', minutes: 20, seed: 11, simOpts: { autopilot: true },
    assert: (s) => ((s['Bosses slain'] as number) >= 1 ? [] : [`bossDefeated expected >=1, got ${s['Bosses slain']} (rooms ${s['Rooms cleared']}, deaths ${s.Deaths})`]),
  },
  {
    name: 'idle', script: 'idle', minutes: 5, seed: 12, simOpts: { autopilot: true },
    assert: (s) => (s['Rooms cleared'] === 0 ? [] : [`roomsCleared expected 0, got ${s['Rooms cleared']}`]),
  },
  {
    name: 'z2-progress', script: 'z2', minutes: 20, seed: 13, simOpts: { autopilot: true },
    assert: (s) => {
      const f: string[] = [];
      if ((s.Deaths as number) > 3) f.push(`deaths ${s.Deaths} > 3`);
      if ((s['Rooms cleared'] as number) < 4) f.push(`roomsCleared ${s['Rooms cleared']} < 4`);
      return f;
    },
  },
  {
    name: 'z2-hour', script: 'z2', minutes: 60, seed: 21, simOpts: { autopilot: true },
    assert: (s) => {
      const f: string[] = [];
      if ((s['Deepest floor'] as number) < 6) f.push(`floor ${s['Deepest floor']} < 6 after an hour`);
      if ((s['Deepest floor'] as number) > 16) f.push(`floor ${s['Deepest floor']} > 16 (too easy)`);
      if ((s['Hero level'] as number) < 8) f.push(`level ${s['Hero level']} < 8`);
      if ((s.Deaths as number) > 5) f.push(`deaths ${s.Deaths} > 5`);
      return f;
    },
  },
];
