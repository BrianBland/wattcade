import type { AchievementDef } from '../../contracts';
import { feat, hasEvent, num, tally } from '../../progression/kit';

const G = 'cadenza';

// The first four were `wsurf_*` (the game was Wattsurf); core/renames.ts migrates old profiles.
export const achievements: AchievementDef[] = [
  feat(G, { id: 'cz_first', name: 'First Wave', desc: 'Ride a Cadenza set to the end', bonusXp: 40, check: (r) => hasEvent(r, 'setDone') }),
  tally(G, 'cleanZones', (r) => num(r, 'cleanZones'))({ id: 'cz_clean', name: 'Clean Section', desc: 'Clear 100 Cadenza sections without missing a block or touching a gray', bonusXp: 60, goal: 100, unit: ' sections' }),
  feat(G, { id: 'cz_overdrive', name: 'Overdrive', desc: 'Hold every drop of a Cadenza set (at least two)', bonusXp: 60, check: (r) => num(r, 'drops') >= 2 && num(r, 'dropsHeld') === num(r, 'drops') }),
  feat(G, { id: 'cz_full_set', name: 'Full Set', desc: 'Ride a 5-song Cadenza queue to the end', bonusXp: 80, check: (r) => hasEvent(r, 'setDone') && num(r, 'songsDone') >= 5 }),
  feat(G, { id: 'cz_chain', name: 'Unbroken', desc: 'Build a 1,500-block chain in Cadenza', bonusXp: 80, check: (r) => num(r, 'maxChain') >= 1500 }),
  feat(G, { id: 'cz_launch', name: 'Stuck the Landing', desc: 'Nail a perfect launch on a drop', bonusXp: 40, check: (r) => num(r, 'perfectLaunches') >= 1 }),
  feat(G, { id: 'cz_sharp', name: 'Sharpshooter', desc: 'Finish a Cadenza set with 98% accuracy (1,500+ blocks)', bonusXp: 80, check: (r) => hasEvent(r, 'setDone') && num(r, 'accuracyPct') >= 98 && num(r, 'collected') >= 1500 }),
  tally(G, 'sets', (r) => (hasEvent(r, 'setDone') ? 1 : 0))({ id: 'cz_sets', name: 'Encore', desc: 'Ride 10 Cadenza sets to the end', bonusXp: 80, goal: 10, unit: ' sets' }),
  tally(G, 'launches', (r) => num(r, 'perfectLaunches'))({ id: 'cz_launches', name: 'Launch Pad', desc: 'Nail 25 perfect launches in Cadenza', bonusXp: 80, goal: 25, unit: ' launches' }),
  tally(G, 'songs', (r) => num(r, 'songsDone'))({ id: 'cz_songs', name: 'Setlist', desc: 'Ride 100 songs to the end in Cadenza', bonusXp: 150, goal: 100, unit: ' songs' }),
];
