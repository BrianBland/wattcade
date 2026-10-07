import type { AchievementDef, SessionRecord } from '../../contracts';
import { feat, hasEvent, num, tally } from '../../progression/kit';
import { BIOMES } from './sim/terrain';

const G = 'warmup';
/** One bit per biome reached this ride. */
const biomeBits = (r: Readonly<SessionRecord>) =>
  r.events.reduce((m, e) => { const i = (BIOMES as readonly string[]).indexOf(String(e.type === 'biomeReached' ? e.data?.biome : '')); return i < 0 ? m : m | (1 << i); }, 0);

export const achievements: AchievementDef[] = [
  feat(G, { id: 'wu_tourist', name: 'Sightseer', desc: 'Ride through 4 biomes in one warm-up', bonusXp: 30, check: (r) => num(r, 'biomes') >= 4 }),
  feat(G, { id: 'wu_moon', name: 'Moonwalker', desc: 'Ride all the way to the Moon in the warm-up', bonusXp: 60, check: (r) => hasEvent(r, 'biomeReached', (d) => d.biome === 'moon') }),
  tally(G, 'biomes', biomeBits, 'bits')({ id: 'wu_globetrotter', name: 'Globetrotter', desc: 'Reach every warm-up biome (lifetime)', bonusXp: 80, goal: BIOMES.length, unit: ' biomes' }),
  feat(G, { id: 'wu_scenic', name: 'Scenic Route', desc: 'Ride 20 km in one warm-up', bonusXp: 50, check: (r) => num(r, 'distanceKm') >= 20 }),
];
