import type { AchievementDef } from '../../contracts';
import { feat, hasEvent, num, tally } from '../../progression/kit';

const G = 'cadenza';

// The first four were `wsurf_*` (the game was Wattsurf); core/renames.ts migrates old profiles.
export const achievements: AchievementDef[] = [
  feat(G, { id: 'cz_first', name: 'First Wave', desc: 'Ride a Cadenza set to the end', bonusXp: 40, check: (r) => hasEvent(r, 'setDone') }),
  feat(G, { id: 'cz_clean', name: 'Clean Zone', desc: 'Clear a Cadenza zone without missing a block or touching a grey', bonusXp: 40, check: (r) => num(r, 'cleanZones') >= 1 }),
  feat(G, { id: 'cz_overdrive', name: 'Overdrive', desc: 'Hold every drop of a Cadenza set (at least two)', bonusXp: 60, check: (r) => num(r, 'drops') >= 2 && num(r, 'dropsHeld') === num(r, 'drops') }),
  feat(G, { id: 'cz_full_set', name: 'Full Set', desc: 'Ride a 5-song Cadenza queue to the end', bonusXp: 80, check: (r) => hasEvent(r, 'setDone') && num(r, 'songsDone') >= 5 }),
  feat(G, { id: 'cz_chain', name: 'Unbroken', desc: 'Build a 500-block chain in Cadenza', bonusXp: 50, check: (r) => num(r, 'maxChain') >= 500 }),
  feat(G, { id: 'cz_launch', name: 'Stuck the Landing', desc: 'Nail a perfect launch on a drop', bonusXp: 40, check: (r) => num(r, 'perfectLaunches') >= 1 }),
  feat(G, { id: 'cz_sharp', name: 'Sharpshooter', desc: 'Finish a Cadenza set with 98% accuracy (200+ blocks)', bonusXp: 60, check: (r) => hasEvent(r, 'setDone') && num(r, 'accuracyPct') >= 98 && num(r, 'collected') >= 200 }),
  tally(G, 'songs', (r) => num(r, 'songsDone'))({ id: 'cz_songs', name: 'Setlist', desc: 'Ride 25 songs to the end in Cadenza', bonusXp: 80, goal: 25, unit: ' songs' }),
];
