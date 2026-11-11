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

/** Answered every called effort, and the ride was long enough that there were calls to answer. */
function ironLungs(r: Readonly<SessionRecord>): boolean {
  if (activeSeconds(r) < 30 * 60) return false;
  if (num(r, 'callsMissed') > 0 || countEvents(r, 'effortFailed') > 0) return false;
  const won = countEvents(r, 'effortWon');
  return won >= 12 && Math.max(num(r, 'callsStarted'), countEvents(r, 'effortAnnounced')) <= won
    && ['spin', 'grind', 'hold'].every(kind => hasEvent(r, 'effortWon', d => d.kind === kind));
}

export const achievements: AchievementDef[] = [
  tally(G, 'tripleVolleys', r => countEvents(r, 'railFired', d => Number(d.charges) === 3))({ id: 'triple_rail', name: 'Triple Rail', desc: 'Fire 25 fully charged rail volleys', bonusXp: 40, goal: 25, unit: ' volleys' }),
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
  feat(G, { id: 'td_surges', name: 'Surge Protector', desc: 'Win 8 called efforts in one run', bonusXp: 80, check: (r) => Math.max(num(r, 'bestRunCalls'), num(r, 'bestRunSurges')) >= 8 }),
  feat(G, { id: 'td_spin', name: 'Spin Cycle', desc: 'Win 3 dynamo spin-ups in one ride', bonusXp: 40, check: (r) => num(r, 'spinsWon') >= 3 || countEvents(r, 'spinWon') >= 3 }),
  tally(G, 'kills', kills)({ id: 'td_kills', name: 'Scrap Heap', desc: 'Destroy 100,000 enemies in Dynamo Defense', bonusXp: 200, goal: 100000, unit: ' kills' }),

  feat(G, { id: 'td_kindling', name: 'Kindling', desc: 'Start an ignition chain of 3 in one ride', bonusXp: 40, check: (r) => bestChain(r) >= 3 }),
  tally(G, 'calls', (r) => Math.max(num(r, 'callsWon'), countEvents(r, 'effortWon')))({ id: 'td_on_call', name: 'On Call', desc: 'Answer 40 called efforts', bonusXp: 40, goal: 40, unit: ' calls' }),
  feat(G, { id: 'td_bonfire', name: 'Bonfire', desc: 'Start an ignition chain of 4 in one ride', bonusXp: 80, check: (r) => bestChain(r) >= 4 }),
  tally(G, 'strongKills', (r) => Math.max(num(r, 'strongKills'), countEvents(r, 'enemyKilled', (d) => d.matchup === 'strong')))({ id: 'td_matchmaker', name: 'Matchmaker', desc: 'Kill 8,000 aliens with a strong matchup', bonusXp: 80, goal: 8000, unit: ' kills' }),
  feat(G, { id: 'td_overbuilt', name: 'Overbuilt', desc: 'Own a level 5 tower', bonusXp: 80, check: (r) => hasEvent(r, 'towerUpgraded', (d) => Number(d.level) >= 5) }),
  tally(G, 'exposedVictories', r => countEvents(r, 'bossKilled', d => d.exposedSprinted === true))({ id: 'td_exposed', name: 'Exposed!', desc: 'Defeat 5 Hive Tyrants after sprinting in their Exposed windows', bonusXp: 120, goal: 5, unit: ' bosses' }),
  feat(G, { id: 'td_iron_lungs', name: 'Iron Lungs', desc: 'Answer every call (12+, including spin, grind and hold) while pedalling 30+ minutes', bonusXp: 120, check: ironLungs }),
  tally(G, 'scrap', (r) => num(r, 'scrapEarned'))({ id: 'td_salvage', name: 'Salvage King', desc: 'Bank 250,000 scrap', bonusXp: 200, goal: 250000, unit: ' scrap' }),
  { id: 'td_hours', name: 'Dynamo Hours', desc: 'Ride Dynamo Defense for 20 hours', bonusXp: 250, goal: 20, unit: ' h', count: { key: 'towerdefense.hours', agg: 'sum', of: (r) => (r.gameId === G ? r.durationS / 3600 : 0) } },
  tally(G, 'tyrants', (r) => Math.max(num(r, 'bossesKilled'), countEvents(r, 'bossKilled')))({ id: 'td_brood', name: 'Brood Breaker', desc: 'Destroy 50 Hive Tyrants', bonusXp: 200, goal: 50, unit: ' bosses' }),
];
