import type { GameEvent, SessionRecord, TrainerCommand } from '../../contracts';

type Run = { mixerCommands: TrainerCommand[]; isOver: boolean; events: Array<{ t: number } & GameEvent> };

export const scenarios: Array<{
  name: string; script: string; minutes: number; seed: number;
  simOpts?: Record<string, unknown>;
  assert(summary: Record<string, number | string>, stats: SessionRecord['stats'], run: Run): string[];
}> = [
  {
    name: 'sprints-boss', script: 'sprints', minutes: 20, seed: 16, simOpts: { autopilot: true },
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
      // zone 2 with no actions is survivable for a while, not forever: expect a death or two and boss stalls
      if ((s['Deepest floor'] as number) < 3) f.push(`floor ${s['Deepest floor']} < 3 after an hour`);
      if ((s['Deepest floor'] as number) > 10) f.push(`floor ${s['Deepest floor']} > 10 (too easy)`);
      if ((s.Deaths as number) < 1) f.push('never died in an hour of zone 2 (too easy)');
      if ((s.Deaths as number) > 5) f.push(`deaths ${s.Deaths} > 5`);
      return f;
    },
  },
  {
    // a rider who answers ambushes, spin-ups and Exposed windows (sprints) and uses actions goes clearly deeper
    name: 'action-hour', script: 'hook-responsive', minutes: 60, seed: 15, simOpts: { autopilot: true, actionBot: true },
    assert: (s) => {
      const f: string[] = [];
      if ((s['Deepest floor'] as number) < 6) f.push(`floor ${s['Deepest floor']} < 6 after an hour`);
      if ((s.Deaths as number) > 3) f.push(`deaths ${s.Deaths} > 3`);
      return f;
    },
  },
  {
    // interval pacing: ambush efforts and called spin-ups happen every floor, and the cadence-follow rider answers spin-ups
    name: 'pacing-cadence-follow', script: 'cadence-follow', minutes: 30, seed: 13, simOpts: { autopilot: true },
    assert: (s, _st, run) => {
      const f: string[] = [];
      const amb = run.events.filter((e) => e.type === 'ambush').length, spins = run.events.filter((e) => e.type === 'spinup');
      if (amb < 2) f.push(`ambushes ${amb} < 2`);
      if (!spins.some((e) => (e.data as { ok?: boolean }).ok)) f.push('no spin-up answered');
      if ((s['Bosses slain'] as number) < 2) f.push(`bosses ${s['Bosses slain']} < 2`);
      return f;
    },
  },
  {
    name: 'intervals', script: 'intervals', minutes: 25, seed: 14, simOpts: { autopilot: true },
    assert: (s) => ((s['Bosses slain'] as number) >= 2 && (s.Deaths as number) <= 3 ? [] : [`bosses ${s['Bosses slain']}, deaths ${s.Deaths}`]),
  },
  {
    // ERG: the trainer holds a target for every segment (warm-up, explore, ambush, recover, boss, surge, cool-down)
    name: 'erg-target-follow', script: 'target-follow', minutes: 25, seed: 13, simOpts: { autopilot: true, erg: true },
    assert: (_s, _st, run) => {
      const ergs = new Set(run.mixerCommands.filter((c) => (c as { mode?: string }).mode === 'erg').map((c) => Math.round((c as { watts: number }).watts)));
      const firstErg = run.mixerCommands.findIndex((c) => (c as { mode?: string }).mode === 'erg');
      const sims = run.mixerCommands.slice(Math.max(0, firstErg)).filter((c) => (c as { mode?: string }).mode === 'sim').length;
      const f: string[] = [];
      if (ergs.size < 5) f.push(`only ${ergs.size} distinct ERG targets (${[...ergs].join(', ')})`);
      if (sims > 0) f.push(`${sims} grade commands after ERG took over`);
      return f;
    },
  },
  {
    // a tired rider (steady Z2, never sprints, no actions) still beats bosses, with exposed windows doing the work
    name: 'z2-boss', script: 'z2', minutes: 25, seed: 15, simOpts: { autopilot: true },
    assert: (s, _st, run) => {
      const f: string[] = [];
      if ((s['Bosses slain'] as number) < 2) f.push(`bosses ${s['Bosses slain']} < 2`);
      if (!run.events.some((e) => e.type === 'bossExposed')) f.push('no exposed window');
      if (run.events.filter((e) => e.type === 'bossPhase').length < 2) f.push('no phase changes');
      return f;
    },
  },
];
