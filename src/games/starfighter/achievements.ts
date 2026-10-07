import type { AchievementDef } from '../../contracts';
import { feat, num, tally } from '../../progression/kit';

const G = 'starfighter';
const bestSector = tally(G, 'bestSector', (r) => num(r, 'sector'), 'max');

export const achievements: AchievementDef[] = [
  feat(G, { id: 'sf_boss', name: 'First Blood', desc: 'Defeat a Sprocket Squadron sector boss', bonusXp: 40, check: (r) => num(r, 'bossesDefeated') >= 1 }),
  bestSector({ id: 'sf_maw', name: 'Into the Maw', desc: 'Fly into sector 5, The Maw', bonusXp: 80, goal: 5, unit: '' }),
  bestSector({ id: 'sf_deep', name: 'Deep Space', desc: 'Reach sector 10', bonusXp: 150, goal: 10, unit: '' }),
  feat(G, { id: 'sf_combo', name: 'Combo Breaker', desc: 'Build a 150 combo', bonusXp: 50, check: (r) => num(r, 'maxCombo') >= 150 }),
  feat(G, { id: 'sf_flawless', name: 'Flawless', desc: 'Clear 3 sectors in one flight without losing a ship', bonusXp: 60, check: (r) => num(r, 'sectorsCleared') >= 3 && num(r, 'deaths') === 0 }),
  feat(G, { id: 'sf_goldens', name: 'Gold Rush', desc: 'Grab 20 golden power-ups in one flight', bonusXp: 40, check: (r) => num(r, 'goldens') >= 20 }),
  tally(G, 'kills', (r) => num(r, 'kills'))({ id: 'sf_kills', name: 'Ace of Aces', desc: 'Shoot down 10,000 enemies', bonusXp: 100, goal: 10000, unit: ' kills' }),
];
