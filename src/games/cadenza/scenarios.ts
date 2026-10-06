import type { GameEvent, SessionRecord, TrainerCommand } from '../../contracts';
import type { MediaSpec } from '../../core';

type Run = { mixerCommands: TrainerCommand[]; isOver: boolean; events: Array<{ t: number } & GameEvent> };
type Summary = Record<string, number | string>;
const n = (s: Summary, k: string) => Number(s[k] ?? 0);
const grades = (run: Run) => run.mixerCommands.flatMap((c) => (c.mode === 'sim' ? [c.gradePct] : []));

export const scenarios: Array<{
  name: string; script: string; minutes: number; seed: number; simOpts?: Record<string, unknown>; media?: MediaSpec;
  assert(summary: Summary, stats: SessionRecord['stats'], run: Run): string[];
}> = [
  {
    name: 'autopilot rides an automixed EDM set', script: 'target-follow', minutes: 20, seed: 1,
    simOpts: { autopilot: true }, media: { synth: { style: 'edm', songs: 3, mix: 'automix' } },
    assert(s, _st, run) {
      const f: string[] = [];
      if (!run.isOver) f.push('set did not finish');
      if (n(s, 'songsDone') !== 3) f.push(`songsDone ${s.songsDone} != 3`);
      if (n(s, 'accuracyPct') < 85) f.push(`accuracy ${s.accuracyPct}% < 85`);
      if (n(s, 'greysHit') > 2) f.push(`greysHit ${s.greysHit} > 2 with an autopilot dodging`);
      if (n(s, 'dropouts') !== 0) f.push(`dropouts ${s.dropouts} while riding the targets`);
      if (n(s, 'drops') < 4) f.push(`drops ${s.drops} < 4`);
      if (n(s, 'dropsHeld') !== n(s, 'drops')) f.push(`held ${s.dropsHeld}/${s.drops} drops while following the power target`);
      if (Math.max(...grades(run)) < 4) f.push(`steepest climb ${Math.max(...grades(run))}% < 4`);
      if (!run.events.some((e) => e.type === 'zone' && e.data?.kind === 'build')) f.push('no build zone');
      return f;
    },
  },
  {
    name: 'idle drops out but the music plays on', script: 'idle', minutes: 12, seed: 2,
    simOpts: { difficulty: 'pro' }, media: { synth: { style: 'edm', songs: 2, mix: 'automix' } },
    assert(s, _st, run) {
      const f: string[] = [];
      if (!run.isOver) f.push('set did not finish');
      if (n(s, 'dropouts') < 1) f.push('no dropout with nobody steering or pedalling');
      if (n(s, 'dropsHeld') !== 0) f.push('held a drop at 0 W');
      return f;
    },
  },
  {
    name: 'mixed album, continuous, casual', script: 'z2', minutes: 15, seed: 3,
    simOpts: { autopilot: true, difficulty: 'casual' }, media: { synth: { style: 'mixed', songs: 3, mix: 'continuous' } },
    assert(s, _st, run) {
      const f: string[] = [];
      if (!run.isOver) f.push('album did not finish');
      if (n(s, 'songsDone') !== 3) f.push(`songsDone ${s.songsDone} != 3`);
      if (n(s, 'collected') < 100) f.push(`collected ${s.collected} < 100`);
      return f;
    },
  },
];
