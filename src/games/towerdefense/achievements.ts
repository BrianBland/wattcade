import type { AchievementDef, SessionRecord } from '../../contracts';
import { countEvents, feat, hasEvent, num, tally } from '../../progression/kit';
import { activeSeconds } from '../../progression/rideStats';

const G = 'towerdefense';
const bestWave = tally(G, 'bestWave', (r) => num(r, 'wavesSurvived'), 'max');
const kills = (r: Readonly<SessionRecord>) => ['blue', 'red', 'purple', 'gold'].reduce((s, k) => s + num(r, `kills_${k}`), 0);
const TOWER_KINDS = ['tesla', 'flamer', 'lens'] as const;

/**
 * Best single run's consecutive Spotless clears. A wave is Spotless when the sim says so (`waveCleared.spotless`:
 * cleared early, nothing leaked, full clean-clear heal). A fall or bail breaks the streak.
 */
function spotlessStreak(r: Readonly<SessionRecord>): number {
  let n = 0, best = 0;
  for (const e of r.events) {
    if (e.type === 'runEnded') n = 0;
    else if (e.type === 'waveCleared' && e.data?.spotless === true) best = Math.max(best, ++n);
    else if (e.type === 'waveCleared') n = 0;
  }
  return Math.max(best, num(r, 'bestRunSpotless'));
}

/** Longest ignition chain: burst ordinals, else the summary (older rides only have the burst count). */
function bestChain(r: Readonly<SessionRecord>): number {
  let best = 0;
  for (const e of r.events) if (e.type === 'burst') best = Math.max(best, Number(e.data?.ordinal) || 0);
  return Math.max(best, num(r, 'bestChain'));
}

/** A level 5 of each tower kind standing at once (a sell ends it). */
function fullWorkshop(r: Readonly<SessionRecord>): boolean {
  const level = new Map<string, number>(), kind = new Map<string, string>();
  const have = () => TOWER_KINDS.every((k) => [...kind.entries()].some(([pad, name]) => name === k && (level.get(pad) ?? 0) >= 5));
  for (const e of r.events) {
    const pad = e.data?.pad;
    if ((e.type === 'towerBuilt' || e.type === 'towerUpgraded') && pad != null && e.data?.tower != null) {
      kind.set(`${pad}`, String(e.data.tower));
      level.set(`${pad}`, e.type === 'towerBuilt' ? 1 : Number(e.data.level) || 0);
    } else if (e.type === 'towerSold' && pad != null) { level.delete(`${pad}`); kind.delete(`${pad}`); }
    else if (e.type === 'runEnded') { level.clear(); kind.clear(); }
    if (have()) return true;
  }
  return false;
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
  bestWave({ id: 'td_wave10', name: 'Holding the Line', desc: 'Survive 8 waves of Dynamo Defense', bonusXp: 40, goal: 8, unit: ' waves' }),
  bestWave({ id: 'td_wave25', name: 'Fortress', desc: 'Survive 15 waves of Dynamo Defense', bonusXp: 80, goal: 15, unit: ' waves' }),
  bestWave({ id: 'td_wave50', name: 'Unbreakable', desc: 'Survive 22 waves of Dynamo Defense', bonusXp: 150, goal: 22, unit: ' waves' }),
  tally(G, 'bosses', (r) => Math.max(num(r, 'bossesKilled'), countEvents(r, 'bossKilled')))({ id: 'td_boss', name: 'Boss Breaker', desc: 'Destroy 30 Hive Tyrants', bonusXp: 80, goal: 30, unit: ' bosses' }),
  tally(G, 'spotless', (r) => Math.max(num(r, 'spotlessWaves'), countEvents(r, 'waveCleared', (d) => d.spotless === true)))({ id: 'td_spotless', name: 'Clean Sweep', desc: 'Clear 25 Spotless waves (early, no leak, full heal)', bonusXp: 60, goal: 25, unit: ' waves' }),
  feat(G, { id: 'td_surges', name: 'Surge Protector', desc: 'Win 8 called efforts in one run', bonusXp: 80, check: (r) => Math.max(num(r, 'bestRunCalls'), num(r, 'bestRunSurges')) >= 8 }),
  feat(G, { id: 'td_spin', name: 'Spin Cycle', desc: 'Win 3 dynamo spin-ups in one ride', bonusXp: 40, check: (r) => num(r, 'spinsWon') >= 3 || countEvents(r, 'spinWon') >= 3 }),
  tally(G, 'kills', kills)({ id: 'td_kills', name: 'Scrap Heap', desc: 'Destroy 100,000 enemies in Dynamo Defense', bonusXp: 200, goal: 100000, unit: ' kills' }),

  feat(G, { id: 'td_kindling', name: 'Kindling', desc: 'Start an ignition chain of 3 in one ride', bonusXp: 40, check: (r) => bestChain(r) >= 3 }),
  tally(G, 'calls', (r) => Math.max(num(r, 'callsWon'), countEvents(r, 'effortWon')))({ id: 'td_on_call', name: 'On Call', desc: 'Answer 40 called efforts', bonusXp: 40, goal: 40, unit: ' calls' }),
  feat(G, { id: 'td_bonfire', name: 'Bonfire', desc: 'Start an ignition chain of 4 in one ride', bonusXp: 80, check: (r) => bestChain(r) >= 4 }),
  tally(G, 'strongKills', (r) => Math.max(num(r, 'strongKills'), countEvents(r, 'enemyKilled', (d) => d.matchup === 'strong')))({ id: 'td_matchmaker', name: 'Matchmaker', desc: 'Kill 8,000 aliens with a strong matchup', bonusXp: 80, goal: 8000, unit: ' kills' }),
  feat(G, { id: 'td_overbuilt', name: 'Overbuilt', desc: 'Own a level 5 tower', bonusXp: 80, check: (r) => hasEvent(r, 'towerUpgraded', (d) => Number(d.level) >= 5) }),
  tally(G, 'exposedVictories', r => countEvents(r, 'bossKilled', d => d.exposedSprinted === true))({ id: 'td_exposed', name: 'Exposed!', desc: 'Defeat 5 Hive Tyrants after sprinting in their Exposed windows', bonusXp: 120, goal: 5, unit: ' bosses' }),
  feat(G, { id: 'td_untouchable', name: 'Untouchable', desc: 'Clear 4 Spotless waves in a row', bonusXp: 120, check: (r) => spotlessStreak(r) >= 4 }),
  feat(G, { id: 'td_iron_lungs', name: 'Iron Lungs', desc: 'Answer every call (12+, including spin, grind and hold) while pedalling 30+ minutes', bonusXp: 120, check: ironLungs }),
  feat(G, { id: 'td_workshop', name: 'Full Workshop', desc: 'Have a level 5 of each tower at the same time', bonusXp: 150, check: fullWorkshop }),
  tally(G, 'scrap', (r) => num(r, 'scrapEarned'))({ id: 'td_salvage', name: 'Salvage King', desc: 'Bank 250,000 scrap', bonusXp: 200, goal: 250000, unit: ' scrap' }),
  { id: 'td_hours', name: 'Dynamo Hours', desc: 'Ride Dynamo Defense for 20 hours', bonusXp: 250, goal: 20, unit: ' h', count: { key: 'towerdefense.hours', agg: 'sum', of: (r) => (r.gameId === G ? r.durationS / 3600 : 0) } },
  tally(G, 'tyrants', (r) => Math.max(num(r, 'bossesKilled'), countEvents(r, 'bossKilled')))({ id: 'td_brood', name: 'Brood Breaker', desc: 'Destroy 50 Hive Tyrants', bonusXp: 200, goal: 50, unit: ' bosses' }),
];
