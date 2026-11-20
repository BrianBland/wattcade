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
    name: 'sprints', script: 'sprints', minutes: 20, seed: 1, simOpts: { stars: 99, autopilot: true },
    assert(s) {
      const f: string[] = [];
      if (!(n(s, 'wavesSurvived') >= 6)) f.push(`wavesSurvived ${s.wavesSurvived} < 6`);
      if (!(n(s, 'overdriveSeconds') > 0)) f.push('sprints never triggered Overdrive');
      return f;
    },
  },
  {
    // One trainer mode for the whole run (the game is the gearbox) and every boss phase announced.
    name: 'brood-z2', script: 'z2', minutes: 20, seed: 1, simOpts: { stars: 99, autopilot: true },
    assert(s, _stats, run) {
      const f: string[] = [];
      const collapse = (xs: string[]) => xs.filter((x, i) => i === 0 || x !== xs[i - 1]);
      const modes = collapse(run.mixerCommands.map((c) => c.mode));
      // The game is the gearbox: one resistance-mode run after the neutral menu; the brood never changes the mode.
      const waves = run.events.filter((e) => e.type === 'waveStart').length;
      if (modes.join() !== 'sim,resistance' && modes.join() !== 'resistance') f.push(`mixer modes ${modes.join()} (want sim,resistance)`);
      const bosses = run.events.filter((e) => e.type === 'bossKilled');
      for (const b of bosses) {
        const starts = run.events.filter((e) => e.type === 'bossPhaseStarted' && e.data?.wave === b.data?.wave);
        if (starts.length !== Number(b.data?.phases)) f.push('boss skipped a phase');
        if (new Set(starts.map((e) => e.data?.color)).size !== 1) f.push('boss changed colour mid-fight');
      }
      if (!(n(s, 'bossesKilled') >= 1 && n(s, 'bossesKilled') <= 2)) f.push(`bossesKilled ${s.bossesKilled} outside baseline 1–2 per 20 min (one per set)`);
      if (!(waves >= 7)) f.push(`only ${waves} waves started`);
      for (const k of ['kills_blue', 'kills_red', 'kills_purple']) if (!(n(s, k) > 30)) f.push(`${k} ${s[k]} <= 30`);
      if (!(n(s, 'towerKills') >= 100)) f.push(`towerKills ${s.towerKills} < 100 (off-colour aliens are the towers' job)`);
      return f;
    },
  },
  {
    name: 'idle-falls', script: 'idle', minutes: 5, seed: 1, simOpts: { stars: 99, autopilot: true },
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
    name: 'endless-restart', script: 'z2', minutes: 90, seed: 1, simOpts: { stars: 99, autopilot: true },
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
    name: 'intervals', script: 'intervals', minutes: 20, seed: 1, simOpts: { stars: 99, autopilot: true },
    assert(s, _stats, run) {
      const f: string[] = [];
      for (const w of ['gatling', 'flame', 'rail']) {
        const v = n(s, `weaponSeconds_${w}`);
        if (!(v >= 60)) f.push(`weaponSeconds_${w} ${v} < 60`);
      }
      const modes = new Set(run.mixerCommands.map(c => c.mode));
      if (!modes.has('resistance') || modes.has('erg')) f.push(`mixer modes ${[...modes].join()} (want the resistance gearbox, no ERG)`);
      if (!(n(s, 'railChargesFired') >= 10)) f.push(`railChargesFired ${s.railChargesFired} < 10`);
      return f;
    },
  },
  {
    // steady zone 2 for half an hour: the economy builds every pad, and the hands-off turret and the towers share the work
    // (effective damage, not kills: a kill count is mostly swarm drones and says little about who stops the heavies)
    name: 'z2-economy', script: 'z2', minutes: 30, seed: 1, simOpts: { stars: 99, autopilot: true },
    assert(s) {
      const f: string[] = [];
      const total = n(s, 'turretDamage') + n(s, 'towerDamage');
      const share = n(s, 'turretDamage') / total;
      // With the continuous flow the towers always have work, and a zone-2 rider sits in tier II, so the towers
      // carry more than half; the phase-5 balance pass settles this band (it was 0.40–0.65 with waves and lulls).
      if (!(share >= 0.25 && share <= 0.65)) f.push(`turret damage share ${share.toFixed(2)} outside 0.25–0.65 (towerDamage ${s.towerDamage} of ${total})`);
      if (!(n(s, 'wavesSurvived') >= 10)) f.push(`wavesSurvived ${s.wavesSurvived} < 10`);
      if (!(n(s, 'towersBuilt') >= 6)) f.push(`towersBuilt ${s.towersBuilt} < 6`);
      if (!(n(s, 'towerUpgrades') >= 6)) f.push(`towerUpgrades ${s.towerUpgrades} < 6`);
      if (!(n(s, 'towerKills') >= 350)) f.push(`towerKills ${s.towerKills} < 350`);
      if (!(n(s, 'bossesKilled') >= 2)) f.push(`bossesKilled ${s.bossesKilled} < 2`);
      return f;
    },
  },
  {
    // The flow never stops: after the quiet start each segment starts the moment the last one ends, and nothing
    // calls an effort any more.
    name: 'continuous-flow', script: 'storm-ready', minutes: 40, seed: 1, simOpts: { stars: 99, autopilot: true },
    assert(s, _stats, run) {
      const f: string[] = [];
      const starts = run.events.filter((e) => e.type === 'waveStart'), clears = run.events.filter((e) => e.type === 'waveCleared');
      for (const c of clears) {
        const next = starts.find((e) => e.t >= c.t);
        if (next && next.t - c.t > 0.5 && !run.events.some((e) => e.type === 'runEnded' && e.t >= c.t && e.t <= next.t)) f.push(`a ${(next.t - c.t).toFixed(1)} s gap after segment ${c.data?.wave}`);
      }
      if (run.events.some((e) => /^effort|^surge|^spin/.test(e.type))) f.push('a called effort happened');
      if (!(n(s, 'wavesSurvived') >= 12)) f.push(`wavesSurvived ${s.wavesSurvived} < 12`);
      return [...new Set(f)];
    },
  },
  ...(['z2', 'hook-responsive', 'idle'] as const).map((script) => ({
    name: `workout-${script}`, script, minutes: 30, seed: 1, simOpts: { stars: 99, autopilot: true },
    assert(s: Summary) {
      const f: string[] = [];
      if (script === 'idle' && !(n(s, 'runsFallen') >= 1)) f.push('an idle rider should fall');
      if (script === 'idle' && n(s, 'highTierSeconds') !== 0) f.push('an idle rider logged tier IV+ time');
      if (script !== 'idle' && !(n(s, 'wavesSurvived') >= 10)) f.push(`wavesSurvived ${s.wavesSurvived} < 10`);
      if (script === 'hook-responsive' && !(n(s, 'bossesKilled') >= 1)) f.push('a rider following the suggested tiers killed no boss');
      return f;
    },
  })),
  {
    // Award-plumbing fixture: a reinforced base reaches the deep-wave achievements.
    // Natural survival and damage share remain covered by the passive scenarios and four-seed comparisons.
    name: 'surge-ready-deep', script: 'hook-responsive', minutes: 40, seed: 1,
    simOpts: { stars: 99, autopilot: true, baseHp: 1000 },
    assert(s, _stats, run) {
      const f: string[] = [];
      if (!(n(s, 'wavesSurvived') >= 14)) f.push(`wavesSurvived ${s.wavesSurvived} < 14`);
      return f;
    },
  },
];
