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
    // One mode per brood plus announced boss phases; the trainer follows that complete ladder.
    name: 'brood-z2', script: 'z2', minutes: 20, seed: 1, simOpts: { autopilot: true },
    assert(s, _stats, run) {
      const f: string[] = [];
      const collapse = (xs: string[]) => xs.filter((x, i) => i === 0 || x !== xs[i - 1]);
      const modes = collapse(run.mixerCommands.map((c) => c.mode));
      const announced = run.events.filter((e) => e.type === 'broodAnnounced' || (e.type === 'bossPhaseStarted' && Number(e.data?.phase) > 1));
      const waves = run.events.filter((e) => e.type === 'waveStart').length;
      const ann = collapse(announced.map((e) => String(e.data?.mode)));
      if (modes.length - 1 > announced.length) f.push(`${modes.length - 1} trainer-mode changes for ${announced.length} waves`);
      for (const e of run.events.filter((e) => e.type === 'bossPhaseStarted' && Number(e.data?.phase) > 1)) {
        const a = run.events.find((a) => a.type === 'bossPhaseAnnounced' && a.data?.wave === e.data?.wave && a.data?.phase === e.data?.phase);
        if (!a || e.t - a.t < Number(a.data?.countdownS) - 0.05) f.push('boss mode changed without its full countdown');
      }
      const bosses = run.events.filter((e) => e.type === 'bossKilled');
      for (const b of bosses) {
        const starts = run.events.filter((e) => e.type === 'bossPhaseStarted' && e.data?.wave === b.data?.wave);
        if (starts.length !== Number(b.data?.phases)) f.push('boss skipped a phase');
        const switches = run.events.filter((e) => e.type === 'weaponSwitched' && e.data?.wave === b.data?.wave);
        if (switches.length !== starts.length) f.push('boss weapon switches != phase count');
      }
      if (!(n(s, 'bossesKilled') >= 3 && n(s, 'bossesKilled') <= 5)) f.push(`bossesKilled ${s.bossesKilled} outside baseline 3–5 per 20 min`);
      // the garage/neutral 'sim' may lead before the first brood's mode
      const expected = collapse(['sim', ...ann]);
      // A mount on the final tick may still be waiting for the mixer's command rate limit.
      const pendingFinal = expected.length === modes.length + 1 && expected.slice(0, -1).join() === modes.join();
      if (modes.join() !== expected.join() && !pendingFinal) f.push(`mixer modes ${modes.join()} != announced ${ann.join()}`);
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
    name: 'intervals', script: 'intervals', minutes: 20, seed: 1, simOpts: { autopilot: true, actionBot: true },
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
    // Legacy storm-ready remains a passive endurance ride; called efforts now follow the weapon.
    name: 'surge-ready', script: 'storm-ready', minutes: 40, seed: 1, simOpts: { autopilot: true },
    assert(s, _stats, run) {
      const f: string[] = [];
      if (!(n(s, 'surgesWon') >= 6)) f.push(`surgesWon ${s.surgesWon} < 6`);
      if (!(n(s, 'callsWon') / Math.max(1, n(s, 'callsWon') + n(s, 'callsFailed')) >= 0.5)) f.push('passive endurance rider won fewer than half the calls');
      if (!run.events.some((e) => e.type === 'surgeWon')) f.push('no surgeWon event');
      return f;
    },
  },
  ...(['z2', 'hook-responsive', 'idle'] as const).map((script) => ({
    name: `workout-${script}`, script, minutes: 30, seed: 1, simOpts: { autopilot: true },
    assert(s: Summary, _stats: SessionRecord['stats'], run: Run) {
      const f: string[] = [];
      const calls = run.events.filter((e) => e.type === 'effortAnnounced');
      const finished = n(s, 'callsWon') + n(s, 'callsFailed');
      const rate = n(s, 'callsWon') / Math.max(1, finished);
      if (script === 'idle' && n(s, 'callsWon') !== 0) f.push('idle rider won a call');
      if (script === 'z2' && !(rate >= 0.5 && rate <= 0.9)) f.push(`z2 call win rate ${rate} outside 0.5–0.9`);
      if (script === 'hook-responsive' && !(rate >= 0.9)) f.push(`responsive call win rate ${rate} < 0.9`);
      if (script !== 'idle' && calls.length < 8) f.push('too few called efforts');
      for (let i = 0; i < calls.length; i++) {
        const e = calls[i], wave = Number(e.data?.wave);
        if (wave % 5 === 0) f.push('ordinary call in boss ladder');
        if (i > 0 && wave - Number(calls[i - 1].data?.wave) < 2) f.push('back-to-back calls');
        if (({ gatling: 'spin', flame: 'grind', rail: 'hold' } as Record<string, string>)[String(e.data?.weapon)] !== e.data?.kind) f.push('call mismatched weapon');
        const start = run.events.find((x) => x.type === 'waveStart' && x.data?.wave === wave);
        if (!start || e.t < start.t) f.push('call announced during recovery');
      }
      return f;
    },
  })),
  {
    // Award-plumbing fixture: explicit actions and unlimited rebuilds reach the deep-wave achievement.
    // Natural survival and damage share remain covered by the passive scenarios and four-seed comparisons.
    name: 'surge-ready-deep', script: 'hook-responsive', minutes: 40, seed: 1,
    simOpts: { autopilot: true, actionBot: true, cores: 0 },
    assert(s, _stats, run) {
      const f: string[] = [];
      if (!(n(s, 'wavesSurvived') >= 40)) f.push(`wavesSurvived ${s.wavesSurvived} < 40`);
      if (!(n(s, 'surgesWon') >= 6) || n(s, 'surgesFailed') !== 0) f.push('deep rider did not answer the surges');
      if (!run.events.some(e => e.type === 'action')) f.push('deep rider never used combat actions');
      return f;
    },
  },
];
