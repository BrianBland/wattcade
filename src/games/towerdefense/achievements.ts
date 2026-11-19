import type { AchievementDef, SessionRecord } from '../../contracts';
import { countEvents, feat, hasEvent, num, tally } from '../../progression/kit';
import { activeSeconds } from '../../progression/rideStats';

const G = 'towerdefense';
/** Campaign progress is read from the save the ride ended with (the summary carries it), so it counts once per level. */
const levels = tally(G, 'levels', (r) => num(r, 'campaignCleared'), 'max');
const cleared = (r: Readonly<SessionRecord>, pred: (d: Record<string, number | string | boolean>) => boolean) =>
  hasEvent(r, 'levelCleared', (d) => Number(d.stars) > 0 && pred(d));
const kills = (r: Readonly<SessionRecord>) => ['blue', 'red', 'purple', 'gold'].reduce((s, k) => s + num(r, `kills_${k}`), 0);

/** Longest ignition chain: burst ordinals, else the summary (older rides only have the burst count). */
function bestChain(r: Readonly<SessionRecord>): number {
  let best = 0;
  for (const e of r.events) if (e.type === 'burst') best = Math.max(best, Number(e.data?.ordinal) || 0);
  return Math.max(best, num(r, 'bestChain'));
}

export const achievements: AchievementDef[] = [
  tally(G, 'tripleVolleys', r => countEvents(r, 'railFired', d => Number(d.hits) >= 3))({ id: 'triple_rail', name: 'Triple Rail', desc: 'Hit 3 aliens with one Railgun pulse 25 times', bonusXp: 40, goal: 25, unit: ' pulses' }),
  levels({ id: 'td_levels5', name: 'Holding the Line', desc: 'Clear 5 Dynamo Defense campaign levels', bonusXp: 40, goal: 5, unit: ' levels' }),
  levels({ id: 'td_levels15', name: 'Fortress', desc: 'Clear 15 campaign levels', bonusXp: 80, goal: 15, unit: ' levels' }),
  levels({ id: 'td_levels30', name: 'Unbreakable', desc: 'Clear all 30 campaign levels', bonusXp: 150, goal: 30, unit: ' levels' }),
  tally(G, 'threeStars', (r) => num(r, 'campaignThreeStars'), 'max')({ id: 'td_three_stars', name: 'Clean Sweep', desc: 'Earn 3★ on 10 campaign levels', bonusXp: 60, goal: 10, unit: ' levels' }),
  feat(G, { id: 'td_hard', name: 'Hard Line', desc: 'Clear a level on Hard', bonusXp: 120, check: (r) => cleared(r, (d) => d.intensity === 'hard') }),
  feat(G, { id: 'td_double_shift', name: 'Double Shift', desc: 'Clear two levels back to back in one ride', bonusXp: 150, check: (r) => cleared(r, (d) => Number(d.chain) >= 2) }),
  tally(G, 'bossColors', (r) => num(r, 'bossColors'), 'max')({ id: 'td_brood_hunter', name: 'Brood Hunter', desc: 'Destroy a Hive Tyrant of every brood colour', bonusXp: 60, goal: 3, unit: ' colours' }),
  tally(G, 'roadStyles', (r) => num(r, 'roadStyles'), 'max')({ id: 'td_cartographer', name: 'Cartographer', desc: 'Clear a level on all 8 road styles (campaign or Quick Ride)', bonusXp: 100, goal: 8, unit: ' roads' }),
  feat(G, { id: 'td_full_shift', name: 'Full Shift', desc: 'Clear a 40-minute level', bonusXp: 80, check: (r) => cleared(r, (d) => Number(d.minutes) >= 40) }),
  feat(G, { id: 'td_night_watch', name: 'Night Watch', desc: 'Survive 20 waves in Endless', bonusXp: 120, check: (r) => num(r, 'endlessBest') >= 20 }),
  tally(G, 'bosses', (r) => Math.max(num(r, 'bossesKilled'), countEvents(r, 'bossKilled')))({ id: 'td_boss', name: 'Boss Breaker', desc: 'Destroy 30 Hive Tyrants', bonusXp: 80, goal: 30, unit: ' bosses' }),
  // Called efforts are gone (continuous combat, Nov 2026): these four take over the rewards of Surge Protector,
  // Spin Cycle, On Call and Iron Lungs (cosmetics/catalog.ts RESOURCED; progression/rebalance.ts V4_RETIRED).
  tally(G, 'switches', (r) => Math.max(num(r, 'weaponSwitches'), countEvents(r, 'weaponSwitched')))({ id: 'td_quick_change', name: 'Quick Change', desc: 'Switch turret weapons 200 times', bonusXp: 80, goal: 200, unit: ' switches' }),
  feat(G, { id: 'td_top_gear', name: 'Top Gear', desc: 'Destroy a Hive Tyrant without leaving tier V', bonusXp: 40, check: (r) => hasEvent(r, 'bossKilled', (d) => d.topGear === true) }),
  tally(G, 'redline', (r) => num(r, 'highTierSeconds') / 60)({ id: 'td_redline', name: 'Redline', desc: 'Ride 120 minutes at tier IV or V', bonusXp: 40, goal: 120, unit: ' min' }),
  feat(G, { id: 'td_long_haul', name: 'Long Haul', desc: 'Clear a level after 30+ active minutes of pedalling', bonusXp: 120, check: (r) => activeSeconds(r) >= 30 * 60 && cleared(r, () => true) }),
  tally(G, 'kills', kills)({ id: 'td_kills', name: 'Scrap Heap', desc: 'Destroy 100,000 enemies in Dynamo Defense', bonusXp: 200, goal: 100000, unit: ' kills' }),

  feat(G, { id: 'td_kindling', name: 'Kindling', desc: 'Start an ignition chain of 3 in one ride', bonusXp: 40, check: (r) => bestChain(r) >= 3 }),
  feat(G, { id: 'td_bonfire', name: 'Bonfire', desc: 'Start an ignition chain of 4 in one ride', bonusXp: 80, check: (r) => bestChain(r) >= 4 }),
  tally(G, 'strongKills', (r) => Math.max(num(r, 'strongKills'), countEvents(r, 'enemyKilled', (d) => d.matchup === 'strong')))({ id: 'td_matchmaker', name: 'Matchmaker', desc: 'Kill 8,000 aliens with a strong matchup', bonusXp: 80, goal: 8000, unit: ' kills' }),
  feat(G, { id: 'td_overbuilt', name: 'Overbuilt', desc: 'Own a level 5 tower', bonusXp: 80, check: (r) => hasEvent(r, 'towerUpgraded', (d) => Number(d.level) >= 5) }),
  tally(G, 'exposedVictories', r => countEvents(r, 'bossKilled', d => d.exposedSprinted === true))({ id: 'td_exposed', name: 'Exposed!', desc: 'Defeat 5 Hive Tyrants after sprinting in their Exposed windows', bonusXp: 120, goal: 5, unit: ' bosses' }),
  tally(G, 'scrap', (r) => num(r, 'scrapEarned'))({ id: 'td_salvage', name: 'Salvage King', desc: 'Bank 250,000 scrap', bonusXp: 200, goal: 250000, unit: ' scrap' }),
  { id: 'td_hours', name: 'Dynamo Hours', desc: 'Ride Dynamo Defense for 20 hours', bonusXp: 250, goal: 20, unit: ' h', count: { key: 'towerdefense.hours', agg: 'sum', of: (r) => (r.gameId === G ? r.durationS / 3600 : 0) } },
  tally(G, 'tyrants', (r) => Math.max(num(r, 'bossesKilled'), countEvents(r, 'bossKilled')))({ id: 'td_brood', name: 'Brood Breaker', desc: 'Destroy 50 Hive Tyrants', bonusXp: 200, goal: 50, unit: ' bosses' }),
];
