import type { GameEvent, SessionRecord, TrainerCommand } from '../../contracts';

type Summary = Record<string, number | string>;
type Run = { mixerCommands: TrainerCommand[]; isOver: boolean; events: Array<{ t: number } & GameEvent> };
const n = (s: Summary, k: string) => Number(s[k]);

export const scenarios: Array<{
  name: string; script: string; minutes: number; seed: number;
  simOpts?: Record<string, unknown>;
  assert(summary: Summary, stats: SessionRecord['stats'], run: Run): string[];
}> = [
  {
    name: 'sprints', script: 'sprints', minutes: 20, seed: 1, simOpts: { autopilot: true },
    assert(s) {
      const f: string[] = [];
      if (!(n(s, 'wavesSurvived') >= 8)) f.push(`wavesSurvived ${s.wavesSurvived} < 8`);
      if (!(n(s, 'overdriveSeconds') > 0)) f.push('sprints never triggered Overdrive');
      return f;
    },
  },
  {
    // one reactor core: a rider who stops pedalling loses the base fast
    name: 'idle', script: 'idle', minutes: 5, seed: 1, simOpts: { autopilot: true, cores: 1 },
    assert(s, _stats, run) {
      const f: string[] = [];
      if (!run.isOver) f.push('base should be destroyed (isOver)');
      if (!(n(s, 'wavesSurvived') <= 2)) f.push(`wavesSurvived ${s.wavesSurvived} > 2`);
      if (n(s, 'towerKills') !== 0) f.push(`unpowered towers killed ${s.towerKills}`);
      return f;
    },
  },
  {
    // default cores: each core loss rebuilds the base; the last one ends the run
    name: 'idle-cores', script: 'idle', minutes: 15, seed: 1, simOpts: { autopilot: true },
    assert(s, _stats, run) {
      const f: string[] = [];
      if (!run.isOver) f.push('base should be destroyed (isOver)');
      if (n(s, 'coresLost') !== 2) f.push(`coresLost ${s.coresLost} != 2`);
      if (run.events.filter((e) => e.type === 'coreLost').length !== 2) f.push('expected 2 coreLost events');
      return f;
    },
  },
  {
    name: 'intervals', script: 'intervals', minutes: 20, seed: 1, simOpts: { autopilot: true },
    assert(s, _stats, run) {
      const f: string[] = [];
      for (const w of ['gatling', 'flame', 'rail']) {
        const v = n(s, `weaponSeconds_${w}`);
        if (!(v >= 60)) f.push(`weaponSeconds_${w} ${v} < 60`);
      }
      const modes = new Set(run.mixerCommands.map(c => c.mode));
      for (const m of ['sim', 'erg', 'resistance']) if (!modes.has(m as TrainerCommand['mode'])) f.push(`no ${m} mixer command`);
      if (!(n(s, 'railChargesFired') >= 10)) f.push(`railChargesFired ${s.railChargesFired} < 10`);
      return f;
    },
  },
  {
    // steady zone 2 for half an hour: the economy builds every pad and the towers do real work
    name: 'z2-economy', script: 'z2', minutes: 30, seed: 1, simOpts: { autopilot: true },
    assert(s) {
      const f: string[] = [];
      if (!(n(s, 'wavesSurvived') >= 20)) f.push(`wavesSurvived ${s.wavesSurvived} < 20`);
      if (!(n(s, 'towersBuilt') >= 6)) f.push(`towersBuilt ${s.towersBuilt} < 6`);
      if (!(n(s, 'towerUpgrades') >= 6)) f.push(`towerUpgrades ${s.towerUpgrades} < 6`);
      if (!(n(s, 'towerKills') >= 500)) f.push(`towerKills ${s.towerKills} < 500`);
      if (!(n(s, 'bossesKilled') >= 3)) f.push(`bossesKilled ${s.bossesKilled} < 3`);
      if (!(n(s, 'partsEarned') > 0)) f.push('no garage parts earned');
      return f;
    },
  },
  {
    // storm-ready answers hooks.storm (set while a Power Surge is active) with 0.95 FTP
    name: 'surge-ready', script: 'storm-ready', minutes: 30, seed: 1, simOpts: { autopilot: true },
    assert(s, _stats, run) {
      const f: string[] = [];
      if (!(n(s, 'surgesWon') >= 6)) f.push(`surgesWon ${s.surgesWon} < 6`);
      if (n(s, 'surgesFailed') !== 0) f.push(`surgesFailed ${s.surgesFailed} != 0`);
      if (!run.events.some((e) => e.type === 'surgeWon')) f.push('no surgeWon event');
      return f;
    },
  },
];
