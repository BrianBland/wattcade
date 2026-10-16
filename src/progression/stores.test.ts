import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { ProfileStore } from './stores';
import { saveSchema } from '../games/towerdefense/sim/save';

it('merges concurrent game writes atomically without reverting shared profile edits', async () => {
  const store = new ProfileStore('module-writes');
  const p = await store.create('Rider');
  await Promise.all([
    store.updateGameData(p.id, 'towerdefense', { v: 3, bank: 50 }),
    store.updateGameData(p.id, 'future-game', { v: 9, untouched: true }),
    store.update({ ...p, ftp: 250 }),
  ]);
  const result = (await store.get(p.id))!;
  expect(result.ftp).toBe(250);
  expect(result.gameData).toMatchObject({ towerdefense: { v: 3, bank: 50 }, 'future-game': { v: 9, untouched: true } });
  const edited = await store.update({ ...p, name: 'Edited', xp: 40 });
  expect(edited.gameData).toEqual(result.gameData);
  expect(edited).toMatchObject({ name: 'Edited', xp: 40 });
  const backup = await store.exportJson();
  const restored = new ProfileStore('module-restored'); await restored.importJson(backup);
  expect((await restored.get(p.id))!.gameData).toEqual(result.gameData);
});

it('keeps newer progression metadata when an older profile snapshot is edited', async () => {
  const store = new ProfileStore('module-progression');
  const p = await store.create('Rider', { gameData: { _progression: { rules: 9, futureRule: true } } });
  await store.update({ ...p, gameData: { _progression: { rules: 2 } } });
  expect((await store.get(p.id))!.gameData._progression).toEqual({ rules: 9, futureRule: true });
});

it('does not recreate a deleted player through a pending game save', async () => {
  const store = new ProfileStore('module-deleted');
  const p = await store.create('Rider'); await store.delete(p.id);
  await expect(store.updateGameData(p.id, 'towerdefense', {})).rejects.toThrow('no longer exists');
  expect(await store.get(p.id)).toBeUndefined();
});

it('blocks an older session from overwriting a game upgraded by another tab', async () => {
  const store = new ProfileStore('module-newer-tab');
  const p = await store.create('Rider', { gameData: { towerdefense: saveSchema.read({ bank: 50 }) } });
  const oldSession = p.gameData.towerdefense;
  const newer = { v: 4, bank: 900, futureFeature: { rank: 8 } };
  // A different client writes a newer format while the older session is still running.
  await store.updateGameData(p.id, 'towerdefense', newer);
  await expect(store.updateGameData(p.id, 'towerdefense', oldSession, saveSchema)).rejects.toThrow('newer version');
  expect((await store.get(p.id))!.gameData.towerdefense).toEqual(newer);
  await store.updateGameData(p.id, 'other-game', { v: 1, value: 1 });
  expect((await store.get(p.id))!.gameData.towerdefense).toEqual(newer);
});
