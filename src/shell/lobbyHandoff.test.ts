import { expect, it } from 'vitest';
import { biomeAt } from '../games/warmup/sim/terrain';
import { lobbyBiomeOf, startBiomeFor } from './lobbyHandoff';

it('resumes the overworld in the biome a game ended in, at the same road distance', () => {
  for (const [b, d, m] of [['snow', 0, 1200], ['jungle', 5300, 1200], ['countryside', 99999, 800]] as const) {
    const start = startBiomeFor(b, d, m)!;
    expect(biomeAt(d, m, start).dom).toBe(b);
  }
  expect(startBiomeFor('nowhere', 0, 1000)).toBeNull();
  expect(lobbyBiomeOf({ hooks: { lobbyBiome: 'desert' } })).toBe('desert');
  expect(lobbyBiomeOf({ hooks: {} })).toBeNull();
  expect(lobbyBiomeOf(null)).toBeNull();
});
