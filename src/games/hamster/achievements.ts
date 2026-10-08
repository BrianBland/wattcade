import type { AchievementDef, SessionRecord } from '../../contracts';
import { countEvents, feat, hasEvent, num, tally } from '../../progression/kit';

const G = 'hamster';
const era = tally(G, 'bestEra', (r) => num(r, 'Era reached'), 'max');
const sum = (key: string, of: (r: Readonly<SessionRecord>) => number) => tally(G, key, of);

export const achievements: AchievementDef[] = [
  era({ id: 'hm_era3', name: 'Hamster-as-a-Service', desc: 'Reach The Startup era', bonusXp: 40, goal: 3, unit: '' }),
  era({ id: 'hm_era4', name: 'Critical Infrastructure', desc: 'Reach The Utility era', bonusXp: 60, goal: 4, unit: '' }),
  era({ id: 'hm_era6', name: 'Earth Is a Wheel', desc: 'Reach The Planet era', bonusXp: 120, goal: 6, unit: '' }),
  era({ id: 'hm_era8', name: 'No Outside of the Wheel', desc: 'Reach The Galaxy era', bonusXp: 250, goal: 8, unit: '' }),
  feat(G, { id: 'hm_k1', name: 'Kardashev I', desc: 'Peak at Kardashev 1.0 (a whole planet of power)', bonusXp: 200, check: (r) => num(r, 'Peak Kardashev') >= 1 }),
  sum('goldens', (r) => Math.max(num(r, 'Golden hamsters'), countEvents(r, 'goldenHamster')))({ id: 'hm_golden', name: 'Golden Hamster', desc: 'Catch 100 golden hamsters', bonusXp: 50, goal: 100, unit: ' hamsters' }),
  sum('strikes', (r) => num(r, 'Strikes broken'))({ id: 'hm_strike', name: 'Labour Relations', desc: 'Win back 10 hamster strikes', bonusXp: 60, goal: 10, unit: ' strikes' }),
  sum('trials', (r) => countEvents(r, 'clinicalTrial', (d) => d.completed === true))({ id: 'hm_trial', name: 'Peer Reviewed', desc: 'Complete 5 clinical trials', bonusXp: 60, goal: 5, unit: ' trials' }),
  sum('spins', (r) => countEvents(r, 'spinClass', (d) => d.completed === true))({ id: 'hm_spin', name: 'Spin Class', desc: 'Finish 25 hamster spin classes', bonusXp: 60, goal: 25, unit: ' classes' }),
  feat(G, { id: 'hm_reincarnate', name: 'Circle of Life', desc: 'Reincarnate your hamster empire', bonusXp: 80, check: (r) => hasEvent(r, 'reincarnated') }),
];
