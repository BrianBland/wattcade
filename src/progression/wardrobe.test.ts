import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { createStore, get } from 'idb-keyval';
import { ProfileStore } from './stores';
import { testProfile } from '../core/testProfile';
import { isUnlocked } from '../cosmetics/unlocks';
import { COSMETICS_VERSION, ITEMS, item } from '../cosmetics/catalog';

it('persists current choices without retired ownership and keeps them through export/import', async () => {
  const db='wardrobe-migration-store', store=new ProfileStore(db);
  const old=testProfile({id:'p_wardrobe',level:5,gameData:{_progression:{rules:2}},cosmetics:{picks:{5:'argyle'},loadout:{hat:'beanie'}}});
  await store.update(old);
  const migrated=(await store.get(old.id))!;
  expect(migrated.cosmetics?.picks?.['5']).toBe('w_racerback_tank');
  const persisted=await get(old.id,createStore(db,'kv'));
  expect(persisted.cosmetics.rotation).toBe(COSMETICS_VERSION);
  expect(persisted.cosmetics).not.toHaveProperty('legacy');
  expect(persisted.cosmetics.loadout).toEqual({});
  const advanced={...migrated,level:50};await store.update(advanced);
  const json=await store.exportJson(), restored=new ProfileStore('wardrobe-import-store');
  await restored.importJson(json);
  const imported=(await restored.get(old.id))!;
  expect(imported.cosmetics).toEqual(advanced.cosmetics);
  expect(isUnlocked(imported,item('jersey','w_racerback_tank')!)).toBe(true);
  expect(item('hat','beanie')).toBeUndefined();
});

it('keeps a simultaneous game checkpoint while migrating reward choices', async () => {
  const store=new ProfileStore('wardrobe-migration-checkpoint');
  const p=testProfile({id:'p_checkpoint',level:4,gameData:{_progression:{rules:2}}});
  await store.update(p);
  await Promise.all([store.get(p.id),store.updateGameData(p.id,'hamster',{era:6})]);
  const saved=(await store.get(p.id))!;
  expect(saved.gameData.hamster).toEqual({era:6});
  expect(saved.cosmetics?.rotation).toBe(COSMETICS_VERSION);
  expect(isUnlocked(saved,ITEMS.find(i=>'level' in i.source && i.source.level===4)!)).toBe(true);
});

it('cleans old ownership snapshots on read and when importing an earlier wardrobe backup', async () => {
  const db='wardrobe-snapshot-cleanup', store=new ProfileStore(db), raw=createStore(db,'kv');
  const old={...testProfile({id:'p_old_snapshot',level:15,gameData:{_progression:{rules:2}}}),cosmetics:{rotation:1,legacy:['hat:beanie','hat:cowboy'],picks:{10:'w_tie_dye_hoodie'},loadout:{hat:'cowboy'}}};
  const {set}=await import('idb-keyval');await set(old.id,old,raw);
  const current=(await store.get(old.id))!;
  expect(current.cosmetics).not.toHaveProperty('legacy');
  expect(current.cosmetics?.picks).toEqual({10:'w_tie_dye_hoodie'});
  expect((await get(old.id,raw)).cosmetics).toEqual(current.cosmetics);
  await store.importJson(JSON.stringify({profiles:[{...old,cosmetics:{...old.cosmetics,rotation:COSMETICS_VERSION}}]}));
  expect((await store.get(old.id))!.cosmetics).not.toHaveProperty('legacy');
  expect(JSON.parse(await store.exportJson()).profiles[0].cosmetics).not.toHaveProperty('legacy');
});
