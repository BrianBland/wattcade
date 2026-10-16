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
    name: 'idle-falls', script: 'idle', minutes: 5, seed: 1, simOpts: { autopilot: true },
    assert(s, _stats, run) {
      const f: string[] = [];
      if (run.isOver) f.push('falling should keep the session open');
      const falls = run.events.filter((e) => e.type === 'runEnded' && e.data?.reason === 'fell');
      if (falls.length !== 1) f.push(`expected one fall, got ${falls.length}`);
      if (!(Number(falls[0]?.data?.wave) <= 2)) f.push('idle base did not fall by wave 2');
      if (!(n(s, 'runs') === 1 && n(s, 'runsFallen') === 1)) f.push('summary should include the fallen run');
      if (n(s, 'towerKills') !== 0) f.push(`unpowered towers killed ${s.towerKills}`);
      return f;
    },
  },
  {
    name: 'endless-restart', script: 'z2', minutes: 45, seed: 1, simOpts: { autopilot: true },
    assert(s, _stats, run) {
      const f: string[] = [];
      if (run.isOver) f.push('falling should keep the session open');
      if (!(n(s, 'runs') >= 2 && n(s, 'runsFallen') >= 1)) f.push('expected a fall and a second run');
      const end = run.events.findIndex((e) => e.type === 'runEnded');
      if (end < 0 || !run.events.slice(end + 1).some((e) => e.type === 'waveStart')) f.push('no waves after returning to the Garage');
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
