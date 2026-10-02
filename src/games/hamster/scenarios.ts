import type { GameEvent, SessionRecord, TrainerCommand } from '../../contracts';

type Run = { mixerCommands: TrainerCommand[]; isOver: boolean; events: Array<{ t: number } & GameEvent> };
type Summary = Record<string, number | string>;
const n = (s: Summary, k: string) => Number(s[k] ?? 0);
const ERA2 = [10, 10, 10, 5, 5, 5, 1];
const ERA3 = [10, 10, 10, 5, 5, 5, 3, 3, 3, 1];

export const scenarios: Array<{
  name: string; script: string; minutes: number; seed: number;
  simOpts?: Record<string, unknown>;
  assert(summary: Summary, stats: SessionRecord['stats'], run: Run): string[];
}> = [
  {
    name: 'z2-hour', script: 'z2', minutes: 60, seed: 1, simOpts: { autopilot: true },
    assert(s) {
      const f: string[] = [];
      if (n(s, 'Era reached') < 2) f.push(`Era reached ${s['Era reached']} < 2`);
      if (n(s, 'Max Mind-Numbing') < 4) f.push(`Max Mind-Numbing ${s['Max Mind-Numbing']} < 4`);
      if (n(s, 'Peak Kardashev') < -0.1) f.push(`Peak Kardashev ${s['Peak Kardashev']} < -0.1`);
      if (n(s, 'Minutes in Z2') < 55) f.push(`Minutes in Z2 ${s['Minutes in Z2']} < 55`);
      return f;
    },
  },
  {
    name: 'idle', script: 'idle', minutes: 10, seed: 2, simOpts: { autopilot: true },
    assert(s) {
      const f: string[] = [];
      if (s['Energy generated'] !== '0 J') f.push(`Energy generated ${s['Energy generated']} != 0 J (union rules: no pedaling, no hamsters)`);
      if (n(s, 'Generators bought') !== 0) f.push('bought generators while idle');
      return f;
    },
  },
  {
    name: 'mash', script: 'mash', minutes: 20, seed: 3, simOpts: { autopilot: true },
    assert(s) { return n(s, 'Max Mind-Numbing') < 1.5 ? [] : [`Max Mind-Numbing ${s['Max Mind-Numbing']} >= 1.5 (mashing should not be boring)`]; },
  },
  {
    name: 'golden-chaser', script: 'storm-ready', minutes: 30, seed: 4, simOpts: { autopilot: true },
    assert(s, _st, run) {
      const f: string[] = [];
      if (n(s, 'Golden hamsters') < 4) f.push(`Golden hamsters ${s['Golden hamsters']} < 4`);
      if (run.events.filter((e) => e.type === 'goldenHamster').length !== n(s, 'Golden hamsters')) f.push('goldenHamster events != summary');
      return f;
    },
  },
  {
    name: 'strike-breaker', script: 'storm-ready', minutes: 40, seed: 5, simOpts: { autopilot: true, preset: { gens: ERA2 } },
    assert(s) { return n(s, 'Strikes broken') >= 1 && n(s, 'Strikes lost') === 0 ? [] : [`strikes broken ${s['Strikes broken']} lost ${s['Strikes lost']}`]; },
  },
  {
    name: 'strike-ignored', script: 'z2', minutes: 40, seed: 6, simOpts: { autopilot: true, preset: { gens: ERA2 } },
    assert(s, _st, run) {
      const f: string[] = [];
      if (n(s, 'Strikes lost') < 1) f.push('no strike lost');
      if (!run.mixerCommands.some((c) => c.mode === 'sim' && c.gradePct >= 3)) f.push('strike grade never commanded');
      return f;
    },
  },
  {
    name: 'clinical-trial', script: 'z2', minutes: 40, seed: 7, simOpts: { autopilot: true, preset: { gens: ERA3 } },
    assert(s, _st, run) {
      const f: string[] = [];
      if (n(s, 'Clinical trials') < 1) f.push('no clinical trial completed');
      if (!run.mixerCommands.some((c) => c.mode === 'erg')) f.push('no ERG command sent');
      if (!run.mixerCommands.some((c, i) => i > 0 && c.mode === 'sim' && run.mixerCommands[i - 1].mode === 'erg')) f.push('ERG never released');
      return f;
    },
  },
];
