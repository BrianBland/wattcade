import type { AchievementDef } from '../../contracts';
import { feat, hasEvent, num, tally } from '../../progression/kit';
import { activeSeconds } from '../../progression/rideStats';
import type { SessionRecord } from '../../contracts';

const G = 'watershed';
const completedRide = (r: Readonly<SessionRecord>) => hasEvent(r, 'rideDone') && activeSeconds(r) >= 20 * 60;

export const achievements: AchievementDef[] = [
  feat(G, { id: 'ws_cycle', name: 'The Water Cycle', desc: 'Finish a Watershed ride, sea to sky to sea', bonusXp: 50, check: (r) => hasEvent(r, 'rideDone') }),
  tally(G, 'cloudlets', (r) => num(r, 'cloudlets'))({ id: 'ws_cloud', name: 'Head in the Clouds', desc: 'Soak up 250 cloudlets in Watershed', bonusXp: 60, goal: 250, unit: ' cloudlets' }),
  feat(G, { id: 'ws_canyon', name: 'Grand Canyon', desc: 'Carve a 48 m gorge', bonusXp: 60, check: (r) => num(r, 'deepestCut') >= 12 }),
  feat(G, { id: 'ws_delta', name: 'Delta Builder', desc: 'Build a big delta (8,000+) in one ride', bonusXp: 40, check: (r) => num(r, 'delta') >= 8000 }),
  tally(G, 'salmonHome', r => num(r, 'salmonHome'))({ id: 'ws_salmon', name: 'Salmon Shepherd', desc: 'Bring 500 salmon home across Watershed rides', bonusXp: 60, goal: 500, unit: ' salmon' }),
  feat(G, { id: 'ws_clean_run', name: 'No Fish Left Behind', desc: 'Finish a salmon run without losing a fish', bonusXp: 40, check: (r) => hasEvent(r, 'salmonHome', (d) => Number(d.lost) === 0 && Number(d.fish) >= 10) }),
  tally(G, 'maestroRides', r => completedRide(r) && num(r, 'bandPct') >= 90 ? 1 : 0)({ id: 'ws_maestro', name: 'Cadence Maestro', desc: 'Complete 3 rides with 90% cadence-band accuracy and 20+ minutes of pedalling each', bonusXp: 50, goal: 3, unit: ' rides' }),
  tally(G, 'millRides', r => completedRide(r) && num(r, 'flour') >= 180 && num(r, 'planks') >= 180 ? 1 : 0)({ id: 'ws_miller', name: 'Miller', desc: 'Complete 3 rides with 180 flour, 180 planks and 20+ minutes of pedalling each', bonusXp: 70, goal: 3, unit: ' rides' }),
  feat(G, { id: 'ws_dry_feet', name: 'Dry Feet', desc: 'Finish a Watershed ride without flooding Millbrook', bonusXp: 40, check: (r) => hasEvent(r, 'rideDone') && Number(r.gameSummary.floodS ?? 1) === 0 }),
  tally(G, 'dams', (r) => num(r, 'damsBroken'))({ id: 'ws_dam_buster', name: 'Dam Buster', desc: 'Flush away 15 beaver dams', bonusXp: 50, goal: 15, unit: ' dams' }),
  tally(G, 'harvests', r => num(r, 'harvests'))({ id: 'ws_breadbasket', name: 'Breadbasket', desc: 'Bring in 200 harvests across Watershed rides', bonusXp: 60, goal: 200, unit: ' harvests' }),
  { id: 'ws_meteor', name: 'Extinction Event', desc: 'Witness a meteor strike in Watershed', bonusXp: 60, check: (_p, r) => hasEvent(r, 'eventHit', (d) => d.kind === 'meteor') },
  feat(G, { id: 'ws_act_of_nature', name: 'Act of Nature', desc: 'Finish a Watershed ride after two geological events have completed', bonusXp: 40, check: (r) => hasEvent(r, 'rideDone') && new Set(r.events.filter(e => e.type === 'eventDone').map(e => e.data?.kind).filter(kind => ['earthquake', 'landslide', 'volcano', 'meteor'].includes(String(kind)))).size >= 2 }),
];
