import type { AchievementDef } from '../../contracts';
import { countEvents, feat, num, tally } from '../../progression/kit';

const G = 'gtpedal';
export const achievements: AchievementDef[] = [
  feat(G, { id: 'gtp_first_steal', name: 'Five-Finger Discount', desc: 'Steal a bike in Grand Theft Pedal', bonusXp: 20, check: (r) => num(r, 'steals') >= 1 }),
  feat(G, { id: 'gtp_drawbridge', name: 'Bridge Over Troubled Water', desc: 'Jump the open drawbridge', bonusXp: 60, check: (r) => countEvents(r, 'bridgeJump') >= 1 }),
  feat(G, { id: 'gtp_bail', name: 'Wile E.', desc: 'Bail 10 times in one ride', bonusXp: 30, check: (r) => num(r, 'crashes') >= 10 }),
  feat(G, { id: 'gtp_big_air', name: 'Hang Time', desc: '3 seconds of air in one jump', bonusXp: 40, check: (r) => num(r, 'maxAirS') >= 3 }),
  tally(G, 'steals', (r) => num(r, 'steals'))({ id: 'gtp_kingpin', name: 'Bike Kingpin', desc: 'Steal 100 bikes (lifetime)', bonusXp: 100, goal: 100, unit: ' bikes' }),
  tally(G, 'launches', (r) => num(r, 'launches'))({ id: 'gtp_acme', name: 'ACME Customer', desc: 'Launch 50 people skyward (lifetime)', bonusXp: 80, goal: 50, unit: ' launches' }),
];
