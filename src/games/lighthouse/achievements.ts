import type { AchievementDef, SessionRecord } from '../../contracts';
import { countEvents, feat, hasEvent, num, tally } from '../../progression/kit';

const G = 'lighthouse';
/** Storms weathered this ride: `stormWeathered` events, else the summary count. */
const storms = (r: Readonly<SessionRecord>) => countEvents(r, 'stormWeathered') || num(r, 'stormsWeathered');

export const achievements: AchievementDef[] = [
  feat(G, { id: 'lh_foundations', name: 'Foundations', desc: 'Open the Hillside by building five island buildings', bonusXp: 30,
    check: r => num(r, 'districtsOpen') >= 2 || hasEvent(r, 'districtUnlocked', d => d.district === 'hillside') }),
  feat(G, { id: 'keeper_20', name: 'Keeper', desc: '45 min in zone 2 in one Lighthouse session', bonusXp: 60, check: (r) => (r.stats.zoneSeconds[1] ?? 0) >= 45 * 60 }),
  tally(G, 'storms', storms)({ id: 'storm_chaser', name: 'Storm Chaser', desc: 'Weather 25 storms (lifetime)', bonusXp: 80, goal: 25, unit: ' storms' }),
  feat(G, { id: 'lh_storm_season', name: 'Storm Season', desc: 'Weather 5 storms in one Lighthouse session', bonusXp: 80, check: (r) => storms(r) >= 5 }),
  tally(G, 'rescues', (r) => Math.max(num(r, 'shipsRescued'), countEvents(r, 'shipRescued')))({ id: 'lh_lifeboat', name: 'Lifeboat Hero', desc: 'Rescue 5 ships in distress (lifetime)', bonusXp: 60, goal: 5, unit: ' ships' }),
  feat(G, { id: 'lh_lens', name: 'Electric Lantern', desc: 'Fit the top lens in your lighthouse', bonusXp: 60, check: (r) => num(r, 'lensTier') >= 4 }),
  feat(G, { id: 'lh_districts', name: 'Whole Island', desc: 'Open all five districts', bonusXp: 60, check: (r) => num(r, 'districtsOpen') >= 5 }),
  feat(G, { id: 'lh_bloom', name: 'In Full Bloom', desc: 'Bring the meadow to full bloom', bonusXp: 50, check: (r) => num(r, 'bloomPct') >= 100 }),
  tally(G, 'windups', (r) => countEvents(r, 'clockworkWound', (d) => d.completed === true))({ id: 'lh_clockwork', name: 'Clockwork Keeper', desc: 'Wind the clockwork all the way 30 times', bonusXp: 60, goal: 30, unit: ' wind-ups' }),
  tally(G, 'docked', (r) => num(r, 'shipsDocked'))({ id: 'lh_harbour', name: 'Harbourmaster', desc: 'Dock 1,000 ships (lifetime)', bonusXp: 150, goal: 1000, unit: ' ships' }),
];
