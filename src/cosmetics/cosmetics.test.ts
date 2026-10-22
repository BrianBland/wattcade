import { describe, expect, it } from 'vitest';
import type { Profile } from '../contracts';
import { ACHIEVEMENTS, defaultProfile } from '../progression';
import { ALL_ITEMS, DEFAULTS, ITEMS, LAST_LEVEL, PICK_EVERY, item, itemsIn } from './catalog';
import { choosePick, equip, isPickLevel, isUnlocked, loadout, newUnlocks, nextReward, pendingPicks, pickOptions, riderLook, titleOf, unlockedItems, withItem } from './unlocks';
import { BIKES } from './draw/bikes';
import { HATS } from './draw/hats';
import { PET_IDS } from './draw/pets';
import { TRAIL_IDS } from './draw/trails';
import { SHIP_IDS, drawShip } from './draw/ships';
import { CRAFT_KINDS } from '../games/cadenza/render/craft';
import { drawRider } from './draw/rider';
import { SLOTS, type Slot } from './types';
import { ACHIEVEMENT_GAME } from '../progression/achievements';

const rider = (over: Partial<Profile> = {}): Profile => ({ ...defaultProfile('T'), color: '#ff2e93', ...over });

describe('catalogue rules', () => {
  it('ids are unique per slot and every slot default exists', () => {
    for (const s of SLOTS) {
      const ids = itemsIn(s).map((i) => i.id);
      expect(new Set(ids).size, s).toBe(ids.length);
      expect(item(s, DEFAULTS[s])?.source, s).toEqual({ default: true });
    }
  });
  it('every achievement grants exactly one item, and items only name real achievements', () => {
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
    const by = new Map<string, number>();
    for (const it of ITEMS) if ('achievement' in it.source) {
      expect(ids.has(it.source.achievement), `${it.id} → ${it.source.achievement}`).toBe(true);
      by.set(it.source.achievement, (by.get(it.source.achievement) ?? 0) + 1);
    }
    for (const a of ACHIEVEMENTS) expect(by.get(a.id) ?? 0, a.id).toBe(1);
  });
  it('one reward per level up to the last, three at each pick level', () => {
    for (let l = 2; l <= LAST_LEVEL; l++) {
      const fixed = ITEMS.filter((i) => 'level' in i.source && i.source.level === l).length;
      const picks = ITEMS.filter((i) => 'pick' in i.source && i.source.pick === l).length;
      if (isPickLevel(l)) { expect(picks, `pick ${l}`).toBe(3); expect(fixed, `level ${l}`).toBe(0); }
      else { expect(fixed, `level ${l}`).toBe(1); expect(picks).toBe(0); }
    }
    expect(ITEMS.some((i) => ('level' in i.source && i.source.level > LAST_LEVEL) || ('pick' in i.source && i.source.pick > LAST_LEVEL))).toBe(false);
  });
  it('every bike and hat has a drawer (and every drawer an item)', () => {
    const itemsIn = (slot: Slot) => ALL_ITEMS.filter(it => it.slot === slot);
    expect(new Set(itemsIn('bike').map((i) => i.id))).toEqual(new Set(Object.keys(BIKES)));
    expect(new Set(itemsIn('hat').map((i) => i.id))).toEqual(new Set(Object.keys(HATS)));
    expect(new Set(itemsIn('pet').map((i) => i.id))).toEqual(new Set(['none', ...PET_IDS]));
    expect(new Set(itemsIn('trail').map((i) => i.id))).toEqual(new Set(['none', ...TRAIL_IDS]));
    expect(new Set(itemsIn('ship').map((i) => i.id))).toEqual(new Set(SHIP_IDS));
    expect(new Set(itemsIn('ship').map((i) => i.id))).toEqual(new Set(CRAFT_KINDS)); // Cadenza flies every ship
  });
  it('offers three distinct slots at every pick and exactly one title per game', () => {
    for (let level = 5; level <= LAST_LEVEL; level += 5) expect(new Set(pickOptions(rider(), level).map(it => it.slot)).size).toBe(3);
    const gameTitles = ITEMS.filter(it => it.slot === 'title' && 'achievement' in it.source && ACHIEVEMENT_GAME[it.source.achievement]);
    for (const game of new Set(Object.values(ACHIEVEMENT_GAME))) expect(gameTitles.filter(it => 'achievement' in it.source && ACHIEVEMENT_GAME[it.source.achievement] === game), game).toHaveLength(1);
    expect(ITEMS.some(it => it.slot === 'title' && ('level' in it.source || 'pick' in it.source))).toBe(false);
    expect(ITEMS.some(it => it.slot === 'ship')).toBe(false);
    expect(itemsIn('bottoms').find(it => it.name === 'Tutu')?.source).toEqual({ level: 36 });
  });
});

describe('unlocks', () => {
  it('light cycle and its trail unlock and equip independently', () => {
    const bikeOwner=rider({achievements:['arcade_rat']});
    expect(isUnlocked(bikeOwner,item('bike','tron')!)).toBe(true);
    expect(isUnlocked(bikeOwner,item('trail','lightcycle')!)).toBe(false);
    expect(loadout(equip(bikeOwner,'bike','tron')).trail).toBe('none');
    const trailOwner=equip(rider({achievements:['afterglow']}),'trail','lightcycle');
    expect(loadout(trailOwner)).toMatchObject({bike:'road',trail:'lightcycle'});
    expect(isUnlocked(trailOwner,item('bike','tron')!)).toBe(false);
    const both= equip({...trailOwner,achievements:['afterglow','arcade_rat']},'bike','tron');
    expect(loadout(both)).toMatchObject({bike:'tron',trail:'lightcycle'});
  });
  it('level, achievement and default items', () => {
    const p = rider({ level: 12, achievements: ['arcade_rat'] });
    const got = new Set(unlockedItems(p).map((i) => `${i.slot}:${i.id}`));
    expect(got.has('bike:pennyfarthing')).toBe(true);
    expect(got.has('bike:tricycle')).toBe(false);
    expect(got.has('bike:tron')).toBe(true);
    expect(got.has('bike:road')).toBe(true);
    expect(got.has('bike:cruiser')).toBe(false); // a pick, not taken
  });
  it('picks: pending, choose one (equipped), the rest stay locked, no double picks', () => {
    let p = rider({ level: 11 });
    expect(pendingPicks(p)).toEqual([5, 10]);
    const [a, b] = pickOptions(p, 5);
    p = choosePick(p, 5, a.id);
    expect(pendingPicks(p)).toEqual([10]);
    expect(loadout(p)[a.slot]).toBe(a.id);
    expect(unlockedItems(p).some((i) => i.id === b.id && i.slot === b.slot)).toBe(false);
    expect(choosePick(p, 5, b.id)).toBe(p);
    expect(choosePick(p, 15, pickOptions(p, 15)[0].id)).toBe(p); // not reached
  });
  it('after the last level, passed-over picks come back three at a time', () => {
    let p = rider({ level: LAST_LEVEL + PICK_EVERY });
    for (let l = PICK_EVERY; l <= LAST_LEVEL; l += PICK_EVERY) p = choosePick(p, l, pickOptions(p, l)[0].id);
    const back = pickOptions(p, LAST_LEVEL + PICK_EVERY);
    expect(back).toHaveLength(3);
    expect(back.every((i) => 'pick' in i.source && !Object.values(p.cosmetics!.picks!).includes(i.id))).toBe(true);
    expect(pendingPicks(p)).toEqual([LAST_LEVEL + PICK_EVERY]);
  });
  it('equip ignores locked items; loadout falls back to defaults', () => {
    const p = rider({ level: 3 });
    expect(equip(p, 'bike', 'tron')).toBe(p);
    const q = equip(p, 'eyewear', 'w_club_shades');
    expect(loadout(q).eyewear).toBe('w_club_shades');
    expect(loadout({ ...q, level: 1 }).eyewear).toBe('none');
  });
  it('look resolves rider colours; titles and previews', () => {
    const p = equip(equip(rider({ level: 27, achievements: ['km_1000'] }), 'jersey', 'w_crop_top'), 'title', 't_hauler');
    const look = riderLook(p);
    expect(look.jersey.base).toBe('#ff2e93');
    expect(titleOf(p)).toBe('Long Hauler');
    expect(look.jersey.cut).toBe('crop');
    expect(withItem(look, item('bike', 'tron')!).bike).toBe('tron');
  });
  it('new unlocks and the next reward', () => {
    const a = rider({ level: 11 }), b = rider({ level: 12, achievements: ['leg_day'] });
    expect(newUnlocks(a, b).map((i) => i.id).sort()).toEqual(['pennyfarthing', 'w_barbarian_fur_briefs']);
    expect(nextReward(a)).toMatchObject({ level: 12, pick: false });
    expect(nextReward(rider({ level: 14 }))).toMatchObject({ level: 15, pick: true });
  });
});

/** A canvas context that accepts everything (drawing code must not throw for any item). */
function stubContext(): CanvasRenderingContext2D {
  const grad = { addColorStop() {} };
  return new Proxy({} as Record<string, unknown>, {
    get: (t, k) => (k in t ? t[k as string] : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => grad : () => {}),
    set: (t, k, v) => { t[k as string] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
}

describe('drawing', () => {
  it('every item draws without throwing, in every biome gear', () => {
    const g = stubContext(), base = riderLook(rider());
    for (const it of ITEMS) for (const gear of [null, 'bubble', 'scuba'] as const) for (const speed of [0, 6, 12]) {
      expect(() => drawRider(g, withItem(base, it), 0.3, 12, { t: 2, speed, gear, trailer: speed > 6 }), `${it.slot}:${it.id}`).not.toThrow();
    }
    for (const id of SHIP_IDS) expect(() => drawShip(g, id, '#ff2e93', 1.3), id).not.toThrow();
    // a runner rides in the cargo box
    expect(() => drawRider(g, { ...base, bike: 'cargo', pet: 'corgi' }, 0, 0, { t: 1, speed: 3 })).not.toThrow();
  });
});
