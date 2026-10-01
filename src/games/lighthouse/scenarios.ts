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
    name: 'z2-docks', script: 'z2', minutes: 30, seed: 1, simOpts: { autopilot: true },
    assert(s) {
      const f: string[] = [];
      if (n(s, 'shipsDocked') < 15) f.push(`shipsDocked ${s.shipsDocked} < 15`);
      if (n(s, 'minutesInZone') < 25) f.push(`minutesInZone ${s.minutesInZone} < 25`);
      if (n(s, 'buildingsBuilt') < 1) f.push('autopilot built nothing');
      return f;
    },
  },
  {
    name: 'idle', script: 'idle', minutes: 10, seed: 2,
    assert(s) { return n(s, 'shipsDocked') === 0 ? [] : [`shipsDocked ${s.shipsDocked} != 0`]; },
  },
  {
    name: 'mash', script: 'mash', minutes: 20, seed: 3,
    assert(s) {
      return n(s, 'shipsLost') > n(s, 'shipsDocked') * 0.3 ? [] : [`shipsLost ${s.shipsLost} <= 0.3 x shipsDocked ${s.shipsDocked}`];
    },
  },
  {
    name: 'storm-ready', script: 'storm-ready', minutes: 30, seed: 4,
    assert(s) { return n(s, 'stormsWeathered') >= 2 ? [] : [`stormsWeathered ${s.stormsWeathered} < 2`]; },
  },
  {
    name: 'z2-no-storm-response', script: 'z2', minutes: 30, seed: 5,
    assert(s, _st, run) {
      const f: string[] = [];
      if (n(s, 'stormsFailed') < 1) f.push('no storm failed');
      if (!run.events.some((e) => e.type === 'stormFailed')) f.push('no stormFailed event');
      return f;
    },
  },
];
