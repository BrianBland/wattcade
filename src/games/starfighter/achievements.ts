import type { AchievementDef } from '../../contracts';
import { feat, num, tally } from '../../progression/kit';

const G = 'starfighter';
const bestSector = tally(G, 'bestSector', (r) => num(r, 'sector'), 'max');

export const achievements: AchievementDef[] = [
  tally(G, 'bosses', (r) => num(r, 'bossesDefeated'))({ id: 'sf_boss', name: 'Boss Rush', desc: 'Defeat 30 Sprocket Squadron sector bosses', bonusXp: 60, goal: 30, unit: ' bosses' }),
  bestSector({ id: 'sf_maw', name: 'Into the Maw', desc: 'Fly into sector 5, The Maw', bonusXp: 80, goal: 5, unit: '' }),
  bestSector({ id: 'sf_deep', name: 'Deep Space', desc: 'Reach sector 10', bonusXp: 150, goal: 10, unit: '' }),
  feat(G, { id: 'sf_combo', name: 'Combo Breaker', desc: 'Build a 300 combo', bonusXp: 80, check: (r) => num(r, 'maxCombo') >= 300 }),
  feat(G, { id: 'sf_flawless', name: 'Flawless', desc: 'Clear 6 sectors in one flight without losing a ship', bonusXp: 80, check: (r) => num(r, 'sectorsCleared') >= 6 && num(r, 'deaths') === 0 }),
  feat(G, { id: 'sf_goldens', name: 'Gold Rush', desc: 'Grab 40 golden power-ups in one flight', bonusXp: 60, check: (r) => num(r, 'goldens') >= 40 }),
  tally(G, 'kills', (r) => num(r, 'kills'))({ id: 'sf_kills', name: 'Ace of Aces', desc: 'Shoot down 50,000 enemies', bonusXp: 150, goal: 50000, unit: ' kills' }),
];
