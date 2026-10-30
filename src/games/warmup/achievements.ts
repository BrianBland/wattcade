import type { AchievementDef, Profile, SessionRecord } from '../../contracts';
import { feat, hasEvent, num, tally } from '../../progression/kit';
import { activeSeconds } from '../../progression/rideStats';
import { BIOMES } from './sim/terrain';

const G = 'warmup';
const VISITS = 'warmup.biomeRideVisits';
const qualified = (r: Readonly<SessionRecord>) => r.gameId === G && activeSeconds(r) >= 600;
// Two bits per biome, saturated at three qualifying rides (12 biomes = 24 bits).
// The sum counter receives only this ride's increments; repeats within a ride count once.
const visits = (p: Readonly<Profile>, i: number) => ((p.counters?.[VISITS] ?? 0) >>> (i * 2)) & 3;
const completeBiomes = (p: Readonly<Profile>) => BIOMES.filter((_, i) => visits(p, i) === 3).length;
const visitIncrement = (r: Readonly<SessionRecord>, p: Readonly<Profile>) => {
  if (!qualified(r)) return 0;
  const reached = new Set(r.events.filter(e => e.type === 'biomeReached').map(e => e.data?.biome));
  return BIOMES.reduce((sum, biome, i) => sum + (reached.has(biome) && visits(p, i) < 3 ? 2 ** (i * 2) : 0), 0);
};

export const achievements: AchievementDef[] = [
  feat(G, { id: 'wu_tourist', name: 'Sightseer', desc: 'Ride through 4 biomes in one warm-up', bonusXp: 30, check: (r) => num(r, 'biomes') >= 4 }),
  tally(G, 'moonRides', r => qualified(r) && hasEvent(r, 'biomeReached', d => d.biome === 'moon') ? 1 : 0)({
    id: 'wu_moon', name: 'Moonwalker', desc: 'Visit the Moon on 5 warm-up rides with 10+ minutes of pedalling each', bonusXp: 60, goal: 5, unit: ' rides' }),
  { id: 'wu_globetrotter', name: 'Globetrotter', desc: 'Visit every biome on 3 warm-up rides each, with 10+ minutes of pedalling per ride',
    bonusXp: 80, goal: BIOMES.length, unit: ' biomes visited on 3 rides', value: completeBiomes,
    count: { key: VISITS, agg: 'sum', of: visitIncrement } },
  feat(G, { id: 'wu_scenic', name: 'Scenic Route', desc: 'Ride 20 km in one warm-up', bonusXp: 50, check: (r) => num(r, 'distanceKm') >= 20 }),
];
