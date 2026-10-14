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
    // brood waves: the trainer changes mode at most once per wave, always to the announced weapon's mode
    name: 'brood-z2', script: 'z2', minutes: 20, seed: 1, simOpts: { autopilot: true },
    assert(s, _stats, run) {
      const f: string[] = [];
      const collapse = (xs: string[]) => xs.filter((x, i) => i === 0 || x !== xs[i - 1]);
      const modes = collapse(run.mixerCommands.map((c) => c.mode));
      const announced = run.events.filter((e) => e.type === 'broodAnnounced');
      const waves = run.events.filter((e) => e.type === 'waveStart').length;
      const ann = collapse(announced.map((e) => String(e.data?.mode)));
      if (modes.length - 1 > announced.length) f.push(`${modes.length - 1} trainer-mode changes for ${announced.length} waves`);
      // the garage/neutral 'sim' may lead before the first brood's mode
      if (modes.join() !== ann.join() && modes.join() !== ['sim', ...ann].join()) f.push(`mixer modes ${modes.join()} != announced ${ann.join()}`);
      if (!(waves >= 15)) f.push(`only ${waves} waves started`);
      for (const k of ['kills_blue', 'kills_red', 'kills_purple']) if (!(n(s, k) > 50)) f.push(`${k} ${s[k]} <= 50`);
      if (!(n(s, 'towerKills') >= 300)) f.push(`towerKills ${s.towerKills} < 300 (off-colour aliens are the towers' job)`);
      return f;
    },
  },
  {
    // one reactor core: a rider who stops pedalling stalls the dynamo (shields down) and loses the base in wave 2
    name: 'idle', script: 'idle', minutes: 5, seed: 1, simOpts: { autopilot: true, cores: 1 },
    assert(s, _stats, run) {
      const f: string[] = [];
      if (!run.isOver) f.push('base should be destroyed (isOver)');
      if (!(n(s, 'wavesSurvived') <= 2)) f.push(`wavesSurvived ${s.wavesSurvived} > 2`);
      const over = run.events.find((e) => e.type === 'gameOver');
      if (!over || over.t > 150) f.push(`base fell at ${over ? Math.round(over.t) : '-'} s, want <= 150 s`);
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
    // steady zone 2 for half an hour: the economy builds every pad, and the hands-off turret and the towers share the work
    // (effective damage, not kills: a kill count is mostly swarm drones and says little about who stops the heavies)
    name: 'z2-economy', script: 'z2', minutes: 30, seed: 1, simOpts: { autopilot: true },
    assert(s) {
      const f: string[] = [];
      const total = n(s, 'turretDamage') + n(s, 'towerDamage') + n(s, 'empDamage');
      const share = n(s, 'turretDamage') / total;
      if (!(share >= 0.4 && share <= 0.6)) f.push(`turret damage share ${share.toFixed(2)} outside 0.40–0.60 (towerDamage ${s.towerDamage} of ${total})`);
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
    // storm-ready answers hooks.storm (set while a Power Surge is active) with 0.95 FTP; 40 min reaches wave 40 (td_wave25) with the 15 s lulls
    name: 'surge-ready', script: 'storm-ready', minutes: 40, seed: 1, simOpts: { autopilot: true },
    assert(s, _stats, run) {
      const f: string[] = [];
      if (!(n(s, 'surgesWon') >= 6)) f.push(`surgesWon ${s.surgesWon} < 6`);
      if (n(s, 'surgesFailed') !== 0) f.push(`surgesFailed ${s.surgesFailed} != 0`);
      if (!run.events.some((e) => e.type === 'surgeWon')) f.push('no surgeWon event');
      return f;
    },
  },
];
