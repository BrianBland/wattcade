import type { GameEvent, SessionRecord, TrainerCommand } from '../../contracts';
import { waveRole } from './sim/waves';

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
      if (!(n(s, 'wavesSurvived') >= 6)) f.push(`wavesSurvived ${s.wavesSurvived} < 6`);
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
      if (!(n(s, 'bossesKilled') >= 1 && n(s, 'bossesKilled') <= 2)) f.push(`bossesKilled ${s.bossesKilled} outside baseline 1–2 per 20 min (one per set)`);
      // the garage/neutral 'sim' may lead before the first brood's mode
      const expected = collapse(['sim', ...ann]);
      // A mount on the final tick may still be waiting for the mixer's command rate limit.
      const pendingFinal = expected.length === modes.length + 1 && expected.slice(0, -1).join() === modes.join();
      if (modes.join() !== expected.join() && !pendingFinal) f.push(`mixer modes ${modes.join()} != announced ${ann.join()}`);
      if (!(waves >= 7)) f.push(`only ${waves} waves started`);
      for (const k of ['kills_blue', 'kills_red', 'kills_purple']) if (!(n(s, k) > 30)) f.push(`${k} ${s[k]} <= 30`);
      if (!(n(s, 'towerKills') >= 100)) f.push(`towerKills ${s.towerKills} < 100 (off-colour aliens are the towers' job)`);
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
      const cleared = run.events.some((e) => e.type === 'waveCleared');
      if (cleared && !(n(s, 'partsEarned') > 0)) f.push('a fallen run should bank the parts it earned');
      if (n(s, 'towerKills') !== 0) f.push(`unpowered towers killed ${s.towerKills}`);
      return f;
    },
  },
  {
    name: 'endless-restart', script: 'z2', minutes: 55, seed: 1, simOpts: { autopilot: true },
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
      // Over a full run the share settles near 0.5; in the first 30 minutes the turret-heavy opening (few towers yet)
      // still weighs in, so the band is a little wider on the turret side.
      if (!(share >= 0.4 && share <= 0.65)) f.push(`turret damage share ${share.toFixed(2)} outside 0.40–0.65 (towerDamage ${s.towerDamage} of ${total})`);
      if (!(n(s, 'wavesSurvived') >= 10)) f.push(`wavesSurvived ${s.wavesSurvived} < 10`);
      if (!(n(s, 'towersBuilt') >= 6)) f.push(`towersBuilt ${s.towersBuilt} < 6`);
      if (!(n(s, 'towerUpgrades') >= 6)) f.push(`towerUpgrades ${s.towerUpgrades} < 6`);
      if (!(n(s, 'towerKills') >= 350)) f.push(`towerKills ${s.towerKills} < 350`);
      if (!(n(s, 'bossesKilled') >= 2)) f.push(`bossesKilled ${s.bossesKilled} < 2`);
      if (!(n(s, 'partsEarned') > 0)) f.push('no garage parts earned');
      return f;
    },
  },
  {
    // Legacy storm-ready remains a passive endurance ride; called efforts now follow the weapon.
    name: 'surge-ready', script: 'storm-ready', minutes: 40, seed: 1, simOpts: { autopilot: true },
    assert(s, _stats, run) {
      const f: string[] = [];
      if (!(n(s, 'callsWon') >= 3)) f.push(`callsWon ${s.callsWon} < 3`);
      // A steady rider wins Holds but rarely Spins or Grinds (both are judged against its own recent cadence),
      // so the share depends on the brood mix: one call per work wave, one weapon per wave.
      if (!(n(s, 'callsWon') / Math.max(1, n(s, 'callsWon') + n(s, 'callsFailed')) >= 0.35)) f.push('passive endurance rider won under 35% of the calls');
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
      if (script === 'z2' && !(rate >= 0.3 && rate <= 0.9)) f.push(`z2 call win rate ${rate} outside 0.3–0.9`);
      if (script === 'hook-responsive' && !(rate >= 0.9)) f.push(`responsive call win rate ${rate} < 0.9`);
      if (script !== 'idle' && calls.length < 5) f.push('too few called efforts');
      for (let i = 0; i < calls.length; i++) {
        const e = calls[i], wave = Number(e.data?.wave);
        if (waveRole(wave) === 'boss') f.push('ordinary call in boss ladder');
        if (waveRole(wave) === 'easy') f.push('call in an easy recovery wave');
        if (i > 0 && !run.events.some((x) => x.type === 'runEnded' && x.t > calls[i - 1].t && x.t < e.t) && wave === Number(calls[i - 1].data?.wave)) f.push('two calls in one wave');
        if (({ gatling: 'spin', flame: 'grind', rail: 'hold' } as Record<string, string>)[String(e.data?.weapon)] !== e.data?.kind) f.push('call mismatched weapon');
        const start = run.events.filter((x) => x.type === 'waveStart' && x.data?.wave === wave && x.t <= e.t).at(-1);
        if (!start || e.t < start.t) f.push('call announced during recovery');
      }
      return f;
    },
  })),
  {
    // Award-plumbing fixture: explicit actions and a reinforced base reach the deep-wave achievement.
    // Natural survival and damage share remain covered by the passive scenarios and four-seed comparisons.
    name: 'surge-ready-deep', script: 'hook-responsive', minutes: 40, seed: 1,
    simOpts: { autopilot: true, actionBot: true, baseHp: 1000 },
    assert(s, _stats, run) {
      const f: string[] = [];
      if (!(n(s, 'wavesSurvived') >= 14)) f.push(`wavesSurvived ${s.wavesSurvived} < 14`);
      if (!(n(s, 'surgesWon') >= 3) || n(s, 'surgesFailed') !== 0) f.push('deep rider did not answer the surges');
      if (!run.events.some(e => e.type === 'action')) f.push('deep rider never used combat actions');
      return f;
    },
  },
];
