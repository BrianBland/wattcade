import type { AchievementDef } from '../../contracts';
import { feat, hasEvent, num } from '../../progression/kit';

const G = 'watershed';

export const achievements: AchievementDef[] = [
  feat(G, { id: 'ws_cycle', name: 'The Water Cycle', desc: 'Finish a Watershed ride, sea to sky to sea', bonusXp: 50, check: (r) => hasEvent(r, 'rideDone') }),
  feat(G, { id: 'ws_cloud', name: 'Head in the Clouds', desc: 'Soak up 20 cloudlets in one Watershed ride', bonusXp: 40, check: (r) => num(r, 'cloudlets') >= 20 }),
  feat(G, { id: 'ws_canyon', name: 'Grand Canyon', desc: 'Carve a 40 m gorge', bonusXp: 40, check: (r) => num(r, 'deepestCut') >= 10 }),
  feat(G, { id: 'ws_delta', name: 'Delta Builder', desc: 'Build a big delta (800+) in one ride', bonusXp: 40, check: (r) => num(r, 'delta') >= 8000 }),
  feat(G, { id: 'ws_salmon', name: 'Salmon Shepherd', desc: 'Bring 50 salmon home in one ride', bonusXp: 60, check: (r) => num(r, 'salmonHome') >= 50 }),
  feat(G, { id: 'ws_clean_run', name: 'No Fish Left Behind', desc: 'Finish a salmon run without losing a fish', bonusXp: 40, check: (r) => hasEvent(r, 'salmonHome', (d) => Number(d.lost) === 0 && Number(d.fish) >= 10) }),
  feat(G, { id: 'ws_maestro', name: 'Cadence Maestro', desc: 'Hold the cadence band 90% of a Watershed ride', bonusXp: 50, check: (r) => num(r, 'bandPct') >= 90 }),
  feat(G, { id: 'ws_miller', name: 'Miller', desc: 'Keep both water mills busy in one ride (50 flour and 50 planks)', bonusXp: 50, check: (r) => num(r, 'flour') >= 50 && num(r, 'planks') >= 50 }),
  feat(G, { id: 'ws_dry_feet', name: 'Dry Feet', desc: 'Finish a Watershed ride without flooding Millbrook', bonusXp: 40, check: (r) => hasEvent(r, 'rideDone') && Number(r.gameSummary.floodS ?? 1) === 0 }),
  feat(G, { id: 'ws_dam_buster', name: 'Dam Buster', desc: 'Flush away a beaver dam', bonusXp: 30, check: (r) => num(r, 'damsBroken') >= 1 }),
  feat(G, { id: 'ws_breadbasket', name: 'Breadbasket', desc: 'Bring in 20 harvests in one ride', bonusXp: 40, check: (r) => num(r, 'harvests') >= 20 }),
  { id: 'ws_meteor', name: 'Extinction Event', desc: 'Witness a meteor strike in Watershed', bonusXp: 60, check: (_p, r) => hasEvent(r, 'eventHit', (d) => d.kind === 'meteor') },
  feat(G, { id: 'ws_act_of_nature', name: 'Act of Nature', desc: 'Ride out two geological events in one Watershed ride', bonusXp: 40, check: (r) => r.events.filter((e) => e.type === 'eventHit').length >= 2 }),
];
