import type { AchievementDef, SessionRecord } from '../../contracts';
import { countEvents, feat, hasEvent, num, tally } from '../../progression/kit';

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
  bestWave({ id: 'td_wave10', name: 'Holding the Line', desc: 'Survive 20 waves of Dynamo Defense', bonusXp: 40, goal: 20, unit: ' waves' }),
  bestWave({ id: 'td_wave25', name: 'Fortress', desc: 'Survive 40 waves of Dynamo Defense', bonusXp: 100, goal: 40, unit: ' waves' }),
  bestWave({ id: 'td_wave50', name: 'Unbreakable', desc: 'Survive 60 waves of Dynamo Defense', bonusXp: 200, goal: 60, unit: ' waves' }),
  tally(G, 'bosses', (r) => Math.max(num(r, 'bossesKilled'), countEvents(r, 'bossKilled')))({ id: 'td_boss', name: 'Boss Breaker', desc: 'Destroy 30 Dynamo Defense bosses', bonusXp: 60, goal: 30, unit: ' bosses' }),
  feat(G, { id: 'td_spotless', name: 'Spotless', desc: 'Clear 20 waves before the base takes a hit', bonusXp: 80, check: (r) => spotless(r) >= 20 }),
  feat(G, { id: 'td_surges', name: 'Surge Protector', desc: 'Win 20 surges in one run', bonusXp: 80, check: (r) => num(r, 'surgesWon') >= 20 }),
  feat(G, { id: 'td_spin', name: 'Spin Cycle', desc: 'Win a dynamo spin-up', bonusXp: 40, check: (r) => num(r, 'spinsWon') >= 1 }),
  tally(G, 'kills', kills)({ id: 'td_kills', name: 'Scrap Heap', desc: 'Destroy 100,000 enemies in Dynamo Defense', bonusXp: 150, goal: 100000, unit: ' kills' }),
];
