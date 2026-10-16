import { describe, expect, it, vi } from 'vitest';
import type { GameModule } from '../contracts';
import { defineSaveSchema, saveNumber, saveObject, SaveReadError } from './saveSchema';
import { createGameSession, NullInput, testProfile } from './index';

const schema = defineSaveSchema({
  version: 2, versionKey: 'ver',
  migrations: { 1: (s) => ({ ...s, count: s.legacyCount ?? s.count }) },
  parse: (s) => ({ ...s, ver: 2, count: saveNumber(s.count, 0, 'count') }),
});

describe('game-owned schema contract', () => {
  it('runs explicit migrations on detached data and defaults a new rider', () => {
    const raw = { ver: 1, legacyCount: 7, other: { note: 'kept' } };
    const result = schema.read(raw);
    expect(result).toMatchObject({ ver: 2, count: 7, other: { note: 'kept' } });
    expect((result as Record<string, unknown>).other).not.toBe(raw.other);
    expect(raw.ver).toBe(1);
    expect(schema.read(undefined)).toEqual({ ver: 2, count: 0 });
    expect(schema.read(result)).toEqual(result);
  });

  it('refuses missing migration paths and unsupported or invalid versions', () => {
    expect(() => defineSaveSchema({ version: 3, migrations: {}, parse: (s) => s }).read({ v: 2 })).toThrow(SaveReadError);
    expect(() => schema.read({ ver: 3 })).toThrow('newer version');
    expect(() => schema.read({ ver: -1 })).toThrow();
    expect(() => saveObject(new Date())).toThrow();
  });

  it('prevents a game from loading or writing over an unsupported save', () => {
    const createSim = vi.fn(), onSave = vi.fn();
    const game: GameModule = { id: 'toy', title: 'Toy', blurb: '', tags: [], save: schema, createSim, loadRenderer: vi.fn() };
    const raw = { ver: 4, count: 20, newThing: { value: 8 } };
    const profile = testProfile({ gameData: { toy: raw } });
    expect(() => createGameSession({ game, profile, input: new NullInput(), onSave })).toThrow('newer version');
    expect(createSim).not.toHaveBeenCalled(); expect(onSave).not.toHaveBeenCalled();
    expect(profile.gameData.toy).toEqual(raw);
  });

  it('captures a final detached save once and makes finish idempotent for retry', () => {
    const dispose = vi.fn();
    const game: GameModule = { id: 'toy', title: 'Toy', blurb: '', tags: [], save: schema, loadRenderer: vi.fn(),
      createSim(ctx) {
        return { update() { ctx.save({ ver: 2, count: 100 }); }, isOver: () => false, snapshot: () => ({}), summary: () => ({}),
          dispose() { dispose(); ctx.save({ ver: 2, count: 39 }); } };
      } };
    const original = { ver: 2, count: 23 }, onSave = vi.fn();
    const s = createGameSession({ game, profile: testProfile({ gameData: { toy: original } }), input: new NullInput(), onSave });
    const loaded = s.ctx.load<{ count: number }>()!; loaded.count = 100;
    expect(s.saveData()).toEqual(original);
    const first = s.finish();
    expect(s.finish()).toBe(first); expect(dispose).toHaveBeenCalledOnce();
    s.step(1); s.resume(); s.frame(1); // a pending finish cannot be resumed while its save is retried
    expect(s.saveData()).toMatchObject({ count: 39 });
    expect(onSave).toHaveBeenCalledOnce();
    expect(original.count).toBe(23);
    expect(() => s.ctx.save({ ver: 2, count: 'bad' })).toThrow();
    expect(onSave).toHaveBeenCalledOnce();
  });
});
