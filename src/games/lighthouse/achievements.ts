import type { AchievementDef, SessionRecord } from '../../contracts';
import { countEvents, feat, hasEvent, num, tally } from '../../progression/kit';

const G = 'lighthouse';
/** Storms weathered this ride: `stormWeathered` events, else the summary count. */
const storms = (r: Readonly<SessionRecord>) => countEvents(r, 'stormWeathered') || num(r, 'stormsWeathered');

export const achievements: AchievementDef[] = [
  feat(G, { id: 'keeper_20', name: 'Keeper', desc: '20 min in zone 2 in one Lighthouse session', bonusXp: 50, check: (r) => (r.stats.zoneSeconds[1] ?? 0) >= 20 * 60 }),
  tally(G, 'storms', storms)({ id: 'storm_chaser', name: 'Storm Chaser', desc: 'Weather 3 storms (lifetime)', bonusXp: 50, goal: 3, unit: ' storms' }),
  feat(G, { id: 'lh_storm_season', name: 'Storm Season', desc: 'Weather 3 storms in one Lighthouse session', bonusXp: 60, check: (r) => storms(r) >= 3 }),
  feat(G, { id: 'lh_lifeboat', name: 'Lifeboat Hero', desc: 'Rescue a ship in distress', bonusXp: 40, check: (r) => num(r, 'shipsRescued') >= 1 || hasEvent(r, 'shipRescued') }),
  feat(G, { id: 'lh_lens', name: 'Electric Lantern', desc: 'Fit the top lens in your lighthouse', bonusXp: 60, check: (r) => num(r, 'lensTier') >= 4 }),
  feat(G, { id: 'lh_districts', name: 'Whole Island', desc: 'Open all five districts', bonusXp: 60, check: (r) => num(r, 'districtsOpen') >= 5 }),
  feat(G, { id: 'lh_bloom', name: 'In Full Bloom', desc: 'Bring the meadow to full bloom', bonusXp: 50, check: (r) => num(r, 'bloomPct') >= 100 }),
  feat(G, { id: 'lh_clockwork', name: 'Clockwork Keeper', desc: 'Wind the clockwork all the way', bonusXp: 40, check: (r) => hasEvent(r, 'clockworkWound', (d) => d.completed === true) }),
  tally(G, 'docked', (r) => num(r, 'shipsDocked'))({ id: 'lh_harbour', name: 'Harbourmaster', desc: 'Dock 250 ships (lifetime)', bonusXp: 80, goal: 250, unit: ' ships' }),
];
