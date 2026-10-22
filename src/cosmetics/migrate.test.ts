import { describe, expect, it } from 'vitest';
import { testProfile } from '../core/testProfile';
import { defaultProfile } from '../progression/defaults';
import { ARCHIVED_ITEMS, COSMETICS_VERSION, ITEMS, item, itemKey } from './catalog';
import { ORIGINAL_ITEMS } from './legacyCatalog';
import { ROTATION } from './rotation';
import { migrateCosmetics } from './migrate';
import { choosePick, equip, isUnlocked, legacyItems, loadout, newUnlocks, pickOptions, riderLook, withItem } from './unlocks';

describe('wardrobe ownership migration', () => {
  it('freezes earned originals, remaps old picks, and retains equipped originals', () => {
    const old = testProfile({ level: 15, achievements: ['td_boss', 'leg_day'], cosmetics: { picks: { 5: 'bowler', 10: 'tiedye', 15: 'leopard' }, loadout: { hat: 'welder', jersey: 'tiedye' } } });
    const p = migrateCosmetics(old);
    expect(p.cosmetics?.picks).toEqual({ 5: 'cowboy', 10: 'w_tie_dye_hoodie', 15: 'w_leopard_booty_shorts' });
    expect(loadout(p)).toMatchObject({ hat: 'welder', jersey: 'tiedye' });
    expect(isUnlocked(p, item('eyewear', 'w_welding_goggles')!)).toBe(true);
    expect(isUnlocked(p, item('bottoms', 'w_barbarian_fur_briefs')!)).toBe(true);
    expect(isUnlocked(p, item('hat', 'beanie')!)).toBe(true);
    expect(isUnlocked(p, item('hat', 'wizard')!)).toBe(false);
    expect(migrateCosmetics(p)).toBe(p);
    expect(old.cosmetics?.picks?.['5']).toBe('bowler');
    expect(newUnlocks(p, migrateCosmetics(p))).toEqual([]);
  });
  it('new players never earn archived assets by advancing or earning their former achievements', () => {
    const p = { ...defaultProfile(), level: 50, achievements: ['td_boss', 'leg_day'] };
    expect(p.cosmetics?.rotation).toBe(COSMETICS_VERSION);
    expect(legacyItems(p)).toEqual([]);
    for (const it of ARCHIVED_ITEMS) expect(isUnlocked(p, it), itemKey(it)).toBe(false);
    const migrated = migrateCosmetics(testProfile({ level: 3 }));
    expect(isUnlocked({ ...migrated, level: 50 }, item('hat', 'pirate')!)).toBe(false);
  });
  it('keeps late-track chosen rewards and does not reopen previously completed choices', () => {
    const p = migrateCosmetics(testProfile({ level: 60, cosmetics: { picks: { 5: 'cruiser', 55: 'bowler', 60: 'argyle' } } }));
    expect(p.cosmetics?.picks).toMatchObject({ 55: 'cowboy', 60: 'w_racerback_tank' });
    expect(pickOptions(p, 65).map(i => i.id)).not.toContain('cowboy');
    expect(isUnlocked(p, item('hat', 'bowler')!)).toBe(true);
    expect(choosePick(p, 55, 'w_racerback_tank')).toBe(p);
  });
  it('retains every eligible original and grants its replacement from the same source', () => {
    const old = testProfile({ level: 50, achievements: ORIGINAL_ITEMS.flatMap(i => 'achievement' in i.source ? [i.source.achievement] : []), cosmetics: { picks: Object.fromEntries(Array.from({length:10},(_,i)=>[5+i*5, ORIGINAL_ITEMS.filter(it=>'pick' in it.source && it.source.pick===5+i*5)[1].id])) } });
    const p = migrateCosmetics(old);
    for (const original of ORIGINAL_ITEMS) {
      const s = original.source;
      const owns = 'default' in s || 'level' in s || 'achievement' in s || Object.values(old.cosmetics!.picks!).includes(original.id);
      if (!owns) continue;
      expect(isUnlocked(p, item(original.slot, original.id)!), itemKey(original)).toBe(true);
      const replacement = ROTATION[itemKey(original)];
      if (replacement) expect(isUnlocked(p, replacement), replacement.name).toBe(true);
    }
    expect(legacyItems(p).every(i => !ITEMS.some(active => itemKey(active) === itemKey(i)))).toBe(true);
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
  it('keeps old whole-kit pants until explicitly changed while new tops leave starter shorts independent', () => {
    const old=migrateCosmetics(testProfile({level:20,cosmetics:{loadout:{jersey:'tux'}}}));
    expect(riderLook(old).outfit?.bottoms).toMatchObject({kind:'legacy'});
    expect(riderLook(equip(old,'bottoms','none')).outfit?.bottoms).toMatchObject({kind:'shorts'});
    const fresh=equip({...defaultProfile(),level:20},'jersey','tux');
    expect(riderLook(fresh).outfit?.bottoms).toMatchObject({kind:'shorts'});
  });
});
