import { describe, expect, it, vi } from 'vitest';
import { games } from './registry';
import { PLOT_COUNT } from './lighthouse/sim/layout';
import { createGameSession, NullInput, testProfile } from '../core';

describe('arcade save boundaries', () => {
  for (const game of games) {
    it(`${game.id} owns an idempotent reader and preserves unsupported newer saves`, () => {
      expect(game.save).toBeDefined();
      const schema = game.save!, fresh = schema.read(undefined) as Record<string, unknown>;
      expect(schema.read(fresh)).toEqual(fresh);
      const key = schema.versionKey;
      const future = { ...fresh, [key]: schema.version + 1, futureOnly: { keep: 'everything' } };
      const profile = testProfile({ gameData: { [game.id]: future } }), onSave = vi.fn();
      expect(() => createGameSession({ game, profile, input: new NullInput(), onSave })).toThrow('newer version');
      expect(onSave).not.toHaveBeenCalled();
      expect(profile.gameData[game.id]).toEqual(future);
      expect(() => schema.read({ ...fresh, [key]: String(schema.version) })).toThrow('Invalid');
      expect(() => schema.read([])).toThrow('Invalid');
    });
  }

  it('validates each game’s own numbers and choices', () => {
    const invalid: Record<string, unknown> = {
      cadenza: { v: 1, lastMode: 'broken' }, hamster: { v: 1, bank: Infinity },
      watershed: { v: 1, lastLength: 7 }, dungeon: { ver: 2, upgrades: { flask: 100 } },
      lighthouse: { v: 2, buildings: ['unknown'] }, towerdefense: { v: 2, bank: 'oops' },
      starfighter: { v: 3, craft: 'unknown' },
    };
    for (const game of games) expect(() => game.save!.read(invalid[game.id])).toThrow('Invalid');
  });

  it('loads an unversioned current Keeper\'s Light town and blocks the short layout', () => {
    const town = { buildings: Array.from({ length: PLOT_COUNT }, () => null), coin: 40 };
    expect(games.find((g) => g.id === 'lighthouse')!.save!.read(town)).toMatchObject({ v: 2, coin: 40, buildings: town.buildings });
    expect(() => games.find((g) => g.id === 'lighthouse')!.save!.read({ buildings: ['cottage', 'pier'], coin: 999 })).toThrow('unsupported');
  });

  it('retains existing unversioned Cadenza and Watershed progress', () => {
    expect(games.find((g) => g.id === 'cadenza')!.save!.read({ plays: 4, bestScore: 500, best: { song: 450 } })).toMatchObject({ v: 1, plays: 4, bestScore: 500, best: { song: 450 } });
    expect(games.find((g) => g.id === 'watershed')!.save!.read({ rides: 3, bestScore: 600, lastLength: 30 })).toMatchObject({ v: 1, rides: 3, bestScore: 600, lastLength: 30 });
  });
});
