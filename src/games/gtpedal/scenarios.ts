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
    name: 'auto-z2-playground', script: 'z2', minutes: 10, seed: 1, simOpts: { autopilot: true, cops: false },
    assert(s, _st, run) {
      const f: string[] = [];
      if (n(s, 'distanceM') < 4000) f.push(`distanceM ${s.distanceM} < 4000`);
      if (n(s, 'jumps') < 6) f.push(`jumps ${s.jumps} < 6`);
      if (n(s, 'steals') < 2) f.push(`steals ${s.steals} < 2`);
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
    // daredevil autopilot shuttles over the drawbridge; target-follow rides 5 % over the sim's hooks.powerFtp (1.0)
    name: 'daredevil-ftp-clears-bridge', script: 'target-follow', minutes: 10, seed: 5, simOpts: { autopilot: true, daredevil: true, sprintFtp: 1.0 },
    assert(s, _st, run) {
      const at = run.events.filter((e) => e.type === 'bridgeAttempt');
      const f: string[] = [];
      if (at.length < 5) f.push(`only ${at.length} bridge attempts`);
      const miss = at.filter((e) => !e.data?.cleared);
      if (miss.length) f.push(`${miss.length}/${at.length} attempts at ~FTP fell in (efforts ${miss.map((e) => e.data?.effort).join(',')})`);
      if (n(s, 'bridgeJumps') < 5) f.push(`bridgeJumps ${s.bridgeJumps} < 5`);
      return f;
    },
  },
  {
    name: 'daredevil-z2-mostly-splashes', script: 'z2', minutes: 10, seed: 6, simOpts: { autopilot: true, daredevil: true },
    assert(_s, _st, run) {
      const at = run.events.filter((e) => e.type === 'bridgeAttempt');
      const ok = at.filter((e) => e.data?.cleared).length;
      return at.length >= 5 && ok / at.length < 0.5 ? [] : [`z2 cleared ${ok}/${at.length} (want >= 5 attempts, < 50 % cleared)`];
    },
  },
  {
    // stealing raises heat; cops spawn, chase on the nav graph and either bust the autopilot or lose it
    name: 'auto-z2-cops', script: 'z2', minutes: 10, seed: 1, simOpts: { autopilot: true, autoFire: true },
    assert(s, _st, run) {
      const f: string[] = [];
      if (!run.events.some((e) => e.type === 'copSpawn')) f.push('no cops spawned');
      if (n(s, 'busts') + n(s, 'lostCops') + n(s, 'repaints') < 1) f.push('chases never resolved (no bust / lose / repaint)');
      if (n(s, 'shots') < 3) f.push(`shots ${s.shots} < 3`);
      if (n(s, 'distanceM') < 2500) f.push(`distanceM ${s.distanceM} < 2500`);
      return f;
    },
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
