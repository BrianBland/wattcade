import { describe, expect, it } from 'vitest';
import { testProfile } from '../core/testProfile';
import { defaultProfile } from '../progression/defaults';
import { COSMETICS_VERSION, ITEMS, item, itemKey } from './catalog';
import { ORIGINAL_ITEMS } from './legacyCatalog';
import { migrateCosmetics } from './migrate';
import { choosePick, equip, isUnlocked, loadout, newUnlocks, pickOptions, riderLook, unlockedItems, withItem } from './unlocks';

const original = (slot: string, id: string) => ORIGINAL_ITEMS.find(i => i.slot === slot && i.id === id)!;

describe('current wardrobe migration', () => {
  it('maps old choices and grants exactly the current rewards for the same progress', () => {
    const old = testProfile({ level: 15, achievements: ['td_boss', 'leg_day'], cosmetics: { picks: { 5: 'bowler', 10: 'tiedye', 15: 'leopard' }, loadout: { hat: 'welder', jersey: 'tiedye' } } });
    const p = migrateCosmetics(old);
    expect(p.cosmetics?.picks).toEqual({ 5: 'cowboy', 10: 'w_tie_dye_hoodie', 15: 'w_leopard_booty_shorts' });
    expect(loadout(p)).toMatchObject({ hat: 'road', jersey: 'plain' });
    expect(p.cosmetics?.loadout).toEqual({});
    expect(isUnlocked(p, item('eyewear', 'w_welding_goggles')!)).toBe(true);
    expect(isUnlocked(p, item('bottoms', 'w_barbarian_fur_briefs')!)).toBe(true);
    const fresh = { ...defaultProfile(), level: p.level, achievements: p.achievements, cosmetics: { picks: p.cosmetics?.picks } };
    expect(unlockedItems(p).map(itemKey)).toEqual(unlockedItems(fresh).map(itemKey));
    expect(migrateCosmetics(p)).toBe(p);
    expect(old.cosmetics?.picks?.['5']).toBe('bowler');
    expect(newUnlocks(p, migrateCosmetics(p))).toEqual([]);
  });
  it('never unlocks decommissioned entries, even with an old ownership snapshot or their former achievements', () => {
    const retired = ORIGINAL_ITEMS.filter(i => !item(i.slot, i.id));
    const p = testProfile({ level: 150, achievements: ORIGINAL_ITEMS.flatMap(i => 'achievement' in i.source ? [i.source.achievement] : []), cosmetics: { rotation: 1, legacy: retired.map(itemKey) } as NonNullable<ReturnType<typeof testProfile>['cosmetics']> });
    for (const it of retired) expect(isUnlocked(p, it), itemKey(it)).toBe(false);
    expect(equip(p, 'hat', 'beanie')).toBe(p);
    const migrated = migrateCosmetics(p);
    expect(migrated.cosmetics).not.toHaveProperty('legacy');
    expect(migrated.cosmetics?.rotation).toBe(COSMETICS_VERSION);
    expect(defaultProfile().cosmetics?.rotation).toBe(COSMETICS_VERSION);
  });
  it('drops snapshot privileges when an active item now requires a reward choice', () => {
    const old = testProfile({ level: 15, cosmetics: { rotation: 1, legacy: ['hat:cowboy'], loadout: { hat: 'cowboy' } } as NonNullable<ReturnType<typeof testProfile>['cosmetics']> });
    expect(isUnlocked(old, original('hat', 'cowboy'))).toBe(false);
    const p = migrateCosmetics(old);
    expect(loadout(p).hat).toBe('road');
    expect(p.cosmetics?.loadout).toEqual({});
    expect(isUnlocked(choosePick(p, 5, 'cowboy'), item('hat', 'cowboy')!)).toBe(true);
  });
  it('keeps mapped late-track choices without reopening completed choices or translating them twice', () => {
    const p = migrateCosmetics(testProfile({ level: 60, cosmetics: { picks: { 5: 'cruiser', 55: 'bowler', 60: 'argyle' } } }));
    expect(p.cosmetics?.picks).toMatchObject({ 55: 'cowboy', 60: 'w_racerback_tank' });
    expect(pickOptions(p, 65).map(i => i.id)).not.toContain('cowboy');
    expect(isUnlocked(p, original('hat', 'bowler'))).toBe(false);
    expect(choosePick(p, 55, 'w_racerback_tank')).toBe(p);
    const prior = { ...p, cosmetics: { ...p.cosmetics, rotation: 1 } };
    expect(migrateCosmetics(prior).cosmetics?.picks).toEqual(p.cosmetics?.picks);
  });
  it('equips each new slot independently and previews without mutation', () => {
    let p = { ...defaultProfile(), level: 50 };
    for (const name of ['Tutu', 'Spiked punk gloves', 'Winged boots', 'Star specs', 'Twin rocket pack']) {
      const it = ITEMS.find(i => i.name === name)!; p = equip(p, it.slot, it.id);
    }
    expect(loadout(p)).toMatchObject({ bottoms: 'w_tutu', hands: 'w_spiked_punk_gloves', feet: 'w_winged_boots', eyewear: 'w_star_specs', back: 'w_twin_rocket_pack' });
    const look = riderLook(p), preview = withItem(look, item('bottoms','w_booty_shorts')!);
    expect(preview.outfit?.bottoms).not.toEqual(look.outfit?.bottoms);
    expect(preview.outfit?.gloves).toEqual(look.outfit?.gloves);
  });
  it('keeps valid active equipment and uses the same independent starter shorts for old and new profiles', () => {
    const old = migrateCosmetics(testProfile({ level: 20, cosmetics: { loadout: { jersey: 'tux', ship: 'lancer' } } }));
    expect(loadout(old).jersey).toBe('tux');
    expect(old.cosmetics?.loadout?.ship).toBe('lancer'); // Cadenza validates its own unlocks.
    expect(riderLook(old).outfit?.bottoms).toMatchObject({ kind: 'shorts' });
    const fresh = equip({ ...defaultProfile(), level: 20 }, 'jersey', 'tux');
    expect(riderLook(old)).toEqual(riderLook({ ...fresh, color: old.color }));
  });
});
