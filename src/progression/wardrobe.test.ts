import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { createStore, get } from 'idb-keyval';
import { ProfileStore } from './stores';
import { testProfile } from '../core/testProfile';
import { isUnlocked } from '../cosmetics/unlocks';
import { item } from '../cosmetics/catalog';

it('persists the ownership snapshot on read and preserves it through export/import', async () => {
  const db='wardrobe-migration-store', store=new ProfileStore(db);
  const old=testProfile({id:'p_wardrobe',level:5,gameData:{_progression:{rules:2}},cosmetics:{picks:{5:'argyle'},loadout:{hat:'beanie'}}});
  await store.update(old);
  const migrated=(await store.get(old.id))!;
  expect(migrated.cosmetics?.picks?.['5']).toBe('w_racerback_tank');
  expect((await get(old.id,createStore(db,'kv'))).cosmetics.rotation).toBe(1);
  const advanced={...migrated,level:50};await store.update(advanced);
  expect(isUnlocked((await store.get(old.id))!,item('hat','pirate')!)).toBe(false);
  const json=await store.exportJson(), restored=new ProfileStore('wardrobe-import-store');
  await restored.importJson(json);
  const imported=(await restored.get(old.id))!;
  expect(imported.cosmetics).toEqual(advanced.cosmetics);
  expect(isUnlocked(imported,item('hat','beanie')!)).toBe(true);
  expect(isUnlocked(imported,item('hat','pirate')!)).toBe(false);
});

it('keeps a simultaneous game checkpoint while freezing original ownership', async () => {
  const store=new ProfileStore('wardrobe-migration-checkpoint');
  const p=testProfile({id:'p_checkpoint',level:4,gameData:{_progression:{rules:2}}});
  await store.update(p);
  await Promise.all([store.get(p.id),store.updateGameData(p.id,'hamster',{era:6})]);
  const saved=(await store.get(p.id))!;
  expect(saved.gameData.hamster).toEqual({era:6});
  expect(saved.cosmetics?.rotation).toBe(1);
  expect(isUnlocked(saved,item('jersey','vstripes')!)).toBe(true);
});
