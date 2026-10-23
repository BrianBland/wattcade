import { describe, expect, it } from 'vitest';
import { FISH, type FishCatch } from '../sim/catalogue';
import { bankCatch, buy, canHookBigOne, ensureRod, item, migrateEconomy, saleCents, sellCreel, shortForRod, type ItemId } from '../sim/economy';
import { migrateSave } from '../sim/save';

const catchFish: FishCatch = { id: 'rockfish', name: 'Rockfish', kg: 2.1, lenM: 0.4, value: 9, size: 0.5, credit: 0.5 };
describe('Lou’s economy', () => {
  it('starts with a Pier Rod, and keeps the storyboard prices in cents', () => {
    expect(migrateEconomy(null)).toMatchObject({ cash: 0, rod: 'pier', rods: ['pier'], extras: [], creel: [] });
    expect(['surf', 'deep', 'lures', 'bucketHat', 'bobber', 'barBell'].map((id) => item(id as ItemId).cents)).toEqual([4000, 9000, 600, 800, 400, 1000]);
  });
  it('sells by measured weight at catalogue rates, applying the fishing late-hook rate; never sells twice', () => {
    const e = migrateEconomy(null); bankCatch(e, catchFish);
    expect(saleCents(catchFish)).toBe(945); // 2.10 kg × $9/kg × half credit
    expect(sellCreel(e, 'shop1')).toBe(945);
    expect(e.cash).toBe(945);
    expect(e.receipts[0].lines).toEqual([{ label: 'Rockfish 2.10 kg (late)', cents: 945 }]);
    expect(sellCreel(e, 'shop1')).toBe(0); expect(e.cash).toBe(945);
    for (const f of Object.values(FISH)) expect(saleCents({ id: f.id, kg: 1 })).toBe(f.perKg * 100);
  });
  it('only triggers assistance when a required rod is unowned and cash is short', () => {
    const e = migrateEconomy({ cash: 3999 }); expect(shortForRod(e, 'shop1')).toBe(true);
    e.cash++; expect(shortForRod(e, 'shop1')).toBe(false);
    expect(buy(e, 'shop1', 'surf')).toBe('bought'); expect(e.cash).toBe(0);
    expect(shortForRod(e, 'shop1')).toBe(false); expect(shortForRod(e, 'pierStand')).toBe(true);
  });
  it('keeps the rod chain and extras with paid purchases; duplicate / wrong-store buys cost nothing', () => {
    const e = migrateEconomy({ cash: 15000 });
    buy(e, 'shop1', 'bucketHat'); buy(e, 'shop1', 'surf');
    expect(buy(e, 'shop1', 'deep', true)).toBe('short');
    expect(buy(e, 'shop1', 'surf')).toBe('owned');
    buy(e, 'pierStand', 'deep');
    expect(e).toMatchObject({ cash: 1200, rod: 'deep', rods: ['pier', 'surf', 'deep'], extras: ['bucketHat'], debt: 0 });
    expect(canHookBigOne(e)).toBe(true);
  });
  it('credit packs the required rod, consumes cash, forfeits extras and records the remaining account', () => {
    const e = migrateEconomy({ cash: 200, extras: ['lures', 'bucketHat'] });
    expect(ensureRod(e, 'shop1')).toBe('credit');
    expect(e).toMatchObject({ cash: 0, debt: 3800, extras: [], rod: 'surf' });
    expect(e.receipts[0].lines.map((l) => l.label)).toContain('Left behind: Bucket hat');
    expect(buy(e, 'shop1', 'bobber', true)).toBe('short');
    ensureRod(e, 'pierStand'); expect(canHookBigOne(e)).toBe(true);
    expect(e.debt).toBe(12800); expect(e.cash).toBeGreaterThanOrEqual(0);
  });
  it('pays Lou’s account first when later fish are sold', () => {
    const e = migrateEconomy({ debt: 1000 }); bankCatch(e, { ...catchFish, credit: 1 }); sellCreel(e, 'pierStand');
    expect(e.debt).toBe(0); expect(e.cash).toBe(890);
  });
  it('migrates legacy saves and preserves other chapter fields and paid ownership', () => {
    const old = { v: 1, checkpoint: null, pixelLook: 'on' };
    expect(migrateSave(old)).toMatchObject({ pixelLook: 'on', economy: { rod: 'pier' } });
    const e = migrateEconomy({ cash: 5500, rod: 'deep', rods: ['pier', 'surf', 'deep'], extras: ['barBell', 'barBell'], bonusUsed: ['shop1'] });
    expect(migrateSave({ ...old, economy: e }).economy).toEqual(e);
    expect(e.extras).toEqual(['barBell']);
    expect(migrateEconomy({ cash: NaN, debt: -100 })).toMatchObject({ cash: 0, debt: 0 });
  });
});
