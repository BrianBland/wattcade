import type { AchievementDef } from '../../contracts';
import { feat, hasEvent, num, tally } from '../../progression/kit';

const G = 'hamster';
const era = tally(G, 'bestEra', (r) => num(r, 'Era reached'), 'max');

export const achievements: AchievementDef[] = [
  era({ id: 'hm_era3', name: 'Hamster-as-a-Service', desc: 'Reach The Startup era', bonusXp: 40, goal: 3, unit: '' }),
  era({ id: 'hm_era4', name: 'Critical Infrastructure', desc: 'Reach The Utility era', bonusXp: 60, goal: 4, unit: '' }),
  era({ id: 'hm_era6', name: 'Earth Is a Wheel', desc: 'Reach The Planet era', bonusXp: 120, goal: 6, unit: '' }),
  era({ id: 'hm_era8', name: 'No Outside of the Wheel', desc: 'Reach The Galaxy era', bonusXp: 250, goal: 8, unit: '' }),
  feat(G, { id: 'hm_k1', name: 'Kardashev I', desc: 'Peak at Kardashev 1.0 (a whole planet of power)', bonusXp: 200, check: (r) => num(r, 'Peak Kardashev') >= 1 }),
  feat(G, { id: 'hm_golden', name: 'Golden Hamster', desc: 'Catch a golden hamster', bonusXp: 30, check: (r) => hasEvent(r, 'goldenHamster') || num(r, 'Golden hamsters') >= 1 }),
  feat(G, { id: 'hm_strike', name: 'Labour Relations', desc: 'Win back a hamster strike', bonusXp: 40, check: (r) => num(r, 'Strikes broken') >= 1 }),
  feat(G, { id: 'hm_trial', name: 'Peer Reviewed', desc: 'Complete a clinical trial', bonusXp: 40, check: (r) => hasEvent(r, 'clinicalTrial', (d) => d.completed === true) }),
  feat(G, { id: 'hm_spin', name: 'Spin Class', desc: 'Finish a hamster spin class', bonusXp: 40, check: (r) => hasEvent(r, 'spinClass', (d) => d.completed === true) }),
  feat(G, { id: 'hm_reincarnate', name: 'Circle of Life', desc: 'Reincarnate your hamster empire', bonusXp: 80, check: (r) => hasEvent(r, 'reincarnated') }),
];
