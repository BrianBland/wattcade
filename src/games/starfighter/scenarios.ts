import type { Scenario } from '../../../scripts/sim';
const music = { synth: { style: 'mixed' as const, songs: 20, seed: 3, mix: 'automix' as const } };
export const scenarios: Scenario[] = [
  { name: 'z2-half-hour', script: 'z2', minutes: 30, seed: 1, simOpts: { skipHangar: true }, media: music,
    assert(s, _stats, run) { return [Number(s.sector) < 5 ? 'must reach sector five on steady endurance' : '', Number(s.bossesDefeated) < 3 ? 'must defeat three flagships' : '', Number(s.deaths) > 0 ? 'steady rider should stay protected' : '', Number(s.gunLevel) < 5 ? 'must grow full arsenal' : '', run.isOver ? 'long mix should continue' : ''].filter(Boolean); } },
  { name: 'idle-regroup', script: 'idle', minutes: 10, seed: 1, simOpts: { skipHangar: true }, media: music,
    assert(s, _stats, run) { return [Number(s.deaths) < 1 ? 'idle must lose protection and regroup' : '', Number(s.onTargetS) > 0 ? 'idle must earn no groove time' : '', run.isOver ? 'regroup must not terminate music' : ''].filter(Boolean); } },
  { name: 'mixed-set', script: 'z2', minutes: 10, seed: 3, simOpts: { skipHangar: true }, media: { synth: { style: 'mixed', songs: 2, seed: 2 } },
    assert(s, _stats, run) { return [!run.isOver ? 'set should end cleanly' : '', Number(s.kills) < 10 ? 'automatic guns must kill enemies' : '', !run.events.some((e: { type: string }) => e.type === 'setDone') ? 'setDone missing' : ''].filter(Boolean); } },
];
