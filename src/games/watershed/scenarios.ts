import type { GameEvent, SessionRecord, TrainerCommand } from '../../contracts';
import { testProfile } from '../../core/testProfile';
import { achievements } from './achievements';
import { LEVELS, levelPlan } from './sim/levels';
import { planMinutes } from './sim/plan';

type Run = { mixerCommands: TrainerCommand[]; isOver: boolean; events: Array<{ t: number } & GameEvent> };
type Summary = Record<string, number | string>;
const n = (s: Summary, k: string) => Number(s[k] ?? 0);
const has = (run: Run, type: string) => run.events.some((e) => e.type === type);
type Scenario = (typeof scenarios)[number];

/** A campaign level ridden by the autopilot (it steers for the goal): it must clear the goal, plus level checks. */
function levelScenario(id: string, extra: (s: Summary, run: Run) => string[] = () => []): Scenario {
  const def = LEVELS.find((l) => l.id === id)!;
  return {
    name: `level ${def.n}: ${def.name}`, script: 'cadence-follow', minutes: planMinutes(levelPlan(def)) + 0.5, seed: 1, simOpts: { level: id, autopilot: true },
    assert(s, _st, run) {
      const f: string[] = [];
      if (!run.isOver) f.push('level did not finish');
      if (s.level !== id) f.push(`played ${s.level}, not ${id}`);
      if (n(s, 'levelGoal') !== 1) f.push(`goal not cleared: ${def.goal.title}`);
      if (n(s, 'levelDrops') < 2) f.push(`only ${s.levelDrops} drops with an autopilot`);
      if (!has(run, 'levelDone')) f.push('no levelDone event');
      if (n(s, 'bandPct') < 85) f.push(`bandPct ${s.bandPct} < 85 while following the band`);
      if (s.events !== 'none') f.push(`geological events in a level: ${s.events}`);
      if (has(run, 'beavers')) f.push('random beavers in a level');
      return [...f, ...extra(s, run)];
    },
  };
}

const ergWatts = (run: Run) => run.mixerCommands.flatMap((c) => (c.mode === 'erg' ? [c.watts] : []));

export const scenarios: Array<{
  name: string; script: string; minutes: number; seed: number;
  simOpts?: Record<string, unknown>;
  assert(summary: Summary, stats: SessionRecord['stats'], run: Run): string[];
}> = [
  {
    name: 'full ride', script: 'cadence-follow', minutes: 46, seed: 1, simOpts: { autopilot: true },
    assert(s, _st, run) {
      const f: string[] = [];
      if (!run.isOver) f.push('ride did not finish in 45 min');
      if (n(s, 'blocks') !== 16) f.push(`blocks ${s.blocks} != 16`);
      if (n(s, 'vapor') < 30) f.push(`vapor ${s.vapor} < 30`);
      if (n(s, 'cloudlets') < 15) f.push(`cloudlets ${s.cloudlets} < 15 with an autopilot steering`);
      if (n(s, 'rainfall') <= 0) f.push('no rain');
      if (!run.events.some((e) => e.type === 'springRises')) f.push('spring never rose');
      if (n(s, 'objectives') < 4) f.push(`objectives ${s.objectives} < 4 with an autopilot chasing them`);
      if (!run.events.some((e) => e.type === 'beavers')) f.push('beavers never came');
      if (n(s, 'flour') <= 0) f.push('grist mill never turned');
      if (n(s, 'salmonHome') < 40) f.push(`salmonHome ${s.salmonHome} < 40 with an autopilot dodging`);
      if (!run.events.some((e) => e.type === 'salmonRun')) f.push('no salmon run');
      if (n(s, 'bandPct') < 85) f.push(`bandPct ${s.bandPct} < 85 while following the band`);
      if (n(s, 'carved') < 3000) f.push(`carved ${s.carved} < 3000`);
      if (n(s, 'delta') < 1000) f.push(`delta ${s.delta} < 1000`);
      if (n(s, 'toSea') <= 0) f.push('no silt reached the sea');
      const w = ergWatts(run);                      // testProfile FTP 200
      if (!w.length) f.push('no ERG commands');
      else if (Math.min(...w) > 100 || Math.max(...w) < 180) f.push(`ERG range ${Math.min(...w)}..${Math.max(...w)} W too narrow`);
      if (run.mixerCommands.some((c) => c.mode === 'sim' && c.gradePct !== 0)) f.push('sent a sim grade');
      if (!run.events.some((e) => e.type === 'rideDone')) f.push('no rideDone event');
      // The introductory feat remains immediate; production and mastery goals accumulate across rides.
      const record = { id: 'x', profileId: 'p', gameId: 'watershed', startedAt: 0, durationS: 2760, samples: [], events: run.events, stats: _st, gameSummary: s } as unknown as SessionRecord;
      const got = achievements.filter((a) => a.check?.(testProfile(), record, [])).map((a) => a.id);
      for (const id of ['ws_cycle']) if (!got.includes(id)) f.push(`achievement ${id} not earned`);
      for (const id of ['ws_salmon', 'ws_breadbasket']) {
        const a = achievements.find(a => a.id === id)!;
        if (!(a.count!.of(record, testProfile()) > 0)) f.push(`${id} made no progress`);
      }
      return f;
    },
  },
  {
    name: 'grind digs a gorge', script: 'grind', minutes: 26, seed: 2, simOpts: { length: 45 },
    assert(s) { return n(s, 'deepestCut') >= 8 ? [] : [`deepestCut ${s.deepestCut} < 8`]; },
  },
  {
    name: 'spin reaches the sea', script: 'spin', minutes: 26, seed: 2, simOpts: { length: 45 },
    assert(s) { return n(s, 'toSea') >= 100 ? [] : [`toSea ${s.toSea} < 100`]; },
  },
  {
    name: 'idle', script: 'idle', minutes: 3, seed: 1, simOpts: { length: 45 },
    assert(s) { return n(s, 'parcels') === 0 && n(s, 'carved') <= 5 ? [] : [`idle made water: ${JSON.stringify(s)}`]; },
  },
  // the campaign: every level can be cleared by a rider who steers for its goal
  levelScenario('first-spring'),
  levelScenario('grist-mill', (s) => (n(s, 'flour') >= 240 ? [] : [`flour ${s.flour} < 240`])),
  levelScenario('beaver-crew', (s, run) => [
    ...(has(run, 'gate') && has(run, 'gateBuilt') ? [] : ['the beaver crew never built a gate']),
    ...(n(s, 'flour') >= 540 ? [] : [`flour ${s.flour} < 540`]),
  ]),
  levelScenario('breadbasket', (s) => (n(s, 'harvests') >= 12 ? [] : [`harvests ${s.harvests} < 12`])),
  levelScenario('millbrook-flood', (s, run) => [
    ...(run.events.filter((e) => e.type === 'levee').length >= 4 ? [] : ['the levee was never finished']),
    ...(n(s, 'surgesHeld') === 3 ? [] : [`held ${s.surgesHeld} of 3 surges`]),
  ]),
  levelScenario('dam-buster', (s, run) => (has(run, 'damBroken') && n(s, 'damsBroken') === 1 ? [] : ['the log dam never broke'])),
  levelScenario('homecoming', (s) => (n(s, 'salmonHome') >= 60 ? [] : [`salmonHome ${s.salmonHome} < 60`])),
  levelScenario('delta', (s) => (n(s, 'delta') >= 5200 ? [] : [`delta ${s.delta} < 5200`])),
  {
    // the steering levels aren't free: riding the workout without steering misses the mill
    name: 'level 2 without steering', script: 'cadence-follow', minutes: planMinutes(levelPlan(LEVELS[1])) + 0.5, seed: 1, simOpts: { level: 'grist-mill', menu: false },
    assert(s) { return n(s, 'levelGoal') === 0 && n(s, 'flour') < 120 ? [] : [`cleared the mill without steering (flour ${s.flour})`]; },
  },
];
