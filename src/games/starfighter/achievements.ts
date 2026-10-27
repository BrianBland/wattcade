import type { AchievementDef } from '../../contracts';
import { feat, num, tally } from '../../progression/kit';

const G = 'starfighter';
const bestSector = tally(G, 'bestDefeatedSector', (r) => r.events.reduce((best, e) =>
  e.type === 'bossDefeated' ? Math.max(best, Number(e.data?.sector) || 0) : best, 0), 'max');

export const achievements: AchievementDef[] = [
  tally(G, 'bosses', (r) => num(r, 'bossesDefeated'))({ id: 'sf_boss', name: 'Boss Rush', desc: 'Defeat 30 Sprocket Squadron flagships', bonusXp: 60, goal: 30, unit: ' bosses' }),
  bestSector({ id: 'sf_maw', name: 'Into the Maw', desc: 'Defeat the flagship in sector 5 or deeper', bonusXp: 80, goal: 5, unit: '' }),
  bestSector({ id: 'sf_deep', name: 'Deep Space', desc: 'Defeat the flagship in sector 10 or deeper', bonusXp: 150, goal: 10, unit: '' }),
  feat(G, { id: 'sf_combo', name: 'Combo Breaker', desc: 'Build a 1,500 combo', bonusXp: 80, check: (r) => num(r, 'maxCombo') >= 1500 }),
  tally(G, 'flawlessFlights', (r) => num(r, 'sectorsCleared') >= 6 && num(r, 'deaths') === 0 ? 1 : 0)({ id: 'sf_flawless', name: 'Flawless', desc: 'Complete 3 flights with 6+ flagship victories and no ships lost', bonusXp: 80, goal: 3, unit: ' flights' }),
  feat(G, { id: 'sf_goldens', name: 'Full Spectrum', desc: 'Build a tier-six arsenal in one flight', bonusXp: 60, check: (r) => num(r, 'gunLevel') >= 6 }),
  tally(G, 'kills', (r) => num(r, 'kills'))({ id: 'sf_kills', name: 'Ace of Aces', desc: 'Shoot down 50,000 enemies', bonusXp: 150, goal: 50000, unit: ' kills' }),
];
