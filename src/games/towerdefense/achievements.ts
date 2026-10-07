import type { AchievementDef, SessionRecord } from '../../contracts';
import { feat, hasEvent, num, tally } from '../../progression/kit';

const G = 'towerdefense';
const bestWave = tally(G, 'bestWave', (r) => num(r, 'wavesSurvived'), 'max');
const kills = (r: Readonly<SessionRecord>) => ['blue', 'red', 'purple', 'gold'].reduce((s, k) => s + num(r, `kills_${k}`), 0);
/** Waves cleared before the base first took a hit. */
function spotless(r: Readonly<SessionRecord>): number {
  let n = 0;
  for (const e of r.events) { if (e.type === 'baseHit') break; if (e.type === 'waveCleared') n++; }
  return n;
}

export const achievements: AchievementDef[] = [
  feat(G, { id: 'triple_rail', name: 'Triple Rail', desc: 'Fire the rail with 3 charges', bonusXp: 40, check: (r) => hasEvent(r, 'railFired', (d) => Number(d.charges) === 3) }),
  bestWave({ id: 'td_wave10', name: 'Holding the Line', desc: 'Survive 10 waves of Dynamo Defense', bonusXp: 40, goal: 10, unit: ' waves' }),
  bestWave({ id: 'td_wave25', name: 'Fortress', desc: 'Survive 25 waves of Dynamo Defense', bonusXp: 80, goal: 25, unit: ' waves' }),
  bestWave({ id: 'td_wave50', name: 'Unbreakable', desc: 'Survive 50 waves of Dynamo Defense', bonusXp: 150, goal: 50, unit: ' waves' }),
  feat(G, { id: 'td_boss', name: 'Boss Breaker', desc: 'Destroy a Dynamo Defense boss', bonusXp: 40, check: (r) => num(r, 'bossesKilled') >= 1 || hasEvent(r, 'bossKilled') }),
  feat(G, { id: 'td_spotless', name: 'Spotless', desc: 'Clear 10 waves before the base takes a hit', bonusXp: 60, check: (r) => spotless(r) >= 10 }),
  feat(G, { id: 'td_surges', name: 'Surge Protector', desc: 'Win 5 surges in one run', bonusXp: 50, check: (r) => num(r, 'surgesWon') >= 5 }),
  feat(G, { id: 'td_spin', name: 'Spin Cycle', desc: 'Win a dynamo spin-up', bonusXp: 40, check: (r) => num(r, 'spinsWon') >= 1 }),
  tally(G, 'kills', kills)({ id: 'td_kills', name: 'Scrap Heap', desc: 'Destroy 25,000 enemies in Dynamo Defense', bonusXp: 100, goal: 25000, unit: ' kills' }),
];
