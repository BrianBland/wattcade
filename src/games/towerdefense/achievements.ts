import type { AchievementDef, SessionRecord } from '../../contracts';
import { countEvents, feat, hasEvent, num, tally } from '../../progression/kit';

const G = 'towerdefense';
const bestWave = tally(G, 'bestWave', (r) => num(r, 'wavesSurvived'), 'max');
const kills = (r: Readonly<SessionRecord>) => ['blue', 'red', 'purple', 'gold'].reduce((s, k) => s + num(r, `kills_${k}`), 0);
/** Best single run's waves cleared before its base first took a hit. */
function spotless(r: Readonly<SessionRecord>): number {
  let n = 0, best = 0, hit = false;
  for (const e of r.events) {
    if (e.type === 'runEnded') { n = 0; hit = false; }
    else if (e.type === 'baseHit') hit = true;
    else if (e.type === 'waveCleared' && !hit) best = Math.max(best, ++n);
  }
  return best;
}

export const achievements: AchievementDef[] = [
  feat(G, { id: 'triple_rail', name: 'Triple Rail', desc: 'Fire the rail with 3 charges', bonusXp: 40, check: (r) => hasEvent(r, 'railFired', (d) => Number(d.charges) === 3) }),
  bestWave({ id: 'td_wave10', name: 'Holding the Line', desc: 'Survive 8 waves of Dynamo Defense', bonusXp: 40, goal: 8, unit: ' waves' }),
  bestWave({ id: 'td_wave25', name: 'Fortress', desc: 'Survive 15 waves of Dynamo Defense', bonusXp: 100, goal: 15, unit: ' waves' }),
  bestWave({ id: 'td_wave50', name: 'Unbreakable', desc: 'Survive 22 waves of Dynamo Defense', bonusXp: 200, goal: 22, unit: ' waves' }),
  tally(G, 'bosses', (r) => Math.max(num(r, 'bossesKilled'), countEvents(r, 'bossKilled')))({ id: 'td_boss', name: 'Boss Breaker', desc: 'Destroy 10 Dynamo Defense bosses', bonusXp: 60, goal: 10, unit: ' bosses' }),
  feat(G, { id: 'td_spotless', name: 'Spotless', desc: 'Clear 8 waves before the base takes a hit', bonusXp: 80, check: (r) => spotless(r) >= 8 }),
  feat(G, { id: 'td_surges', name: 'Surge Protector', desc: 'Win 10 surges in one run', bonusXp: 80, check: (r) => Number(r.gameSummary.bestRunSurges ?? num(r, 'surgesWon')) >= 10 }),
  feat(G, { id: 'td_spin', name: 'Spin Cycle', desc: 'Win a dynamo spin-up', bonusXp: 40, check: (r) => num(r, 'spinsWon') >= 1 }),
  tally(G, 'kills', kills)({ id: 'td_kills', name: 'Scrap Heap', desc: 'Destroy 100,000 enemies in Dynamo Defense', bonusXp: 150, goal: 100000, unit: ' kills' }),
];
