import type { GameEvent, SessionRecord, TrainerCommand } from '../../contracts';
import { testProfile } from '../../core/testProfile';
import { achievements } from './achievements';

type Run = { mixerCommands: TrainerCommand[]; isOver: boolean; events: Array<{ t: number } & GameEvent> };
type Summary = Record<string, number | string>;
const n = (s: Summary, k: string) => Number(s[k] ?? 0);
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
      // The one-ride Watershed feats a full autopilot ride should earn (ws_cloud and ws_dam_buster are lifetime tallies).
      const record = { id: 'x', profileId: 'p', gameId: 'watershed', startedAt: 0, durationS: 2760, samples: [], events: run.events, stats: _st, gameSummary: s } as unknown as SessionRecord;
      const got = achievements.filter((a) => a.check?.(testProfile(), record, [])).map((a) => a.id);
      for (const id of ['ws_cycle', 'ws_salmon', 'ws_maestro', 'ws_miller', 'ws_breadbasket']) if (!got.includes(id)) f.push(`achievement ${id} not earned`);
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
];
