import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import type { GameModule, Profile } from '../contracts';
import { defineSaveSchema, saveNumber } from '../core/saveSchema';
import { ProfileStore, SessionStore } from '../progression/stores';
import { module as td } from '../games/towerdefense';
import { activeSession, createProfile, exportBackup, finishSession, startSession } from './services';

afterEach(() => { vi.restoreAllMocks(); });

function game(dispose = vi.fn()): GameModule {
  return { id: 'save-test', title: 'Save test', blurb: '', tags: [], loadRenderer: vi.fn(),
    save: defineSaveSchema({ version: 1, migrations: {}, parse: (s) => ({ v: 1, kills: saveNumber(s.kills, 0, 'kills') }) }),
    createSim(ctx) {
      return { update() {}, isOver: () => false, snapshot: () => ({}), summary: () => ({}),
        dispose() { dispose(); ctx.save({ v: 1, kills: 39 }); } };
    } };
}

it('persists the final checkpoint with XP even when finish receives the earlier profile snapshot', async () => {
  let live = await createProfile('Final save');
  const dispose = vi.fn();
  const s = startSession(game(dispose), live, (data) => { live = { ...live, gameData: { ...live.gameData, 'save-test': data } }; });
  // Use the shared context to reproduce the pre-finish 23 -> disposal 39 checkpoint.
  const context = (s as unknown as { ctx: { save(data: unknown): void } }).ctx;
  context.save({ v: 1, kills: 23 }); await exportBackup();
  const earlier = live;
  const result = await finishSession(earlier);
  expect(earlier.gameData['save-test']).toEqual({ v: 1, kills: 23 });
  expect(result.profile.gameData['save-test']).toEqual({ v: 1, kills: 39 });
  const stored = (await new ProfileStore().get(live.id))!;
  expect(stored.gameData['save-test']).toEqual({ v: 1, kills: 39 });
  expect(stored.xp).toBe(result.profile.xp);
  expect(dispose).toHaveBeenCalledOnce(); expect(activeSession()).toBeNull();
});

it('retains a failed finish for retry without disposing, logging or awarding twice', async () => {
  let live: Profile = await createProfile('Retry save');
  const dispose = vi.fn();
  const s = startSession(game(dispose), live, (data) => { live = { ...live, gameData: { ...live.gameData, 'save-test': data } }; });
  vi.spyOn(ProfileStore.prototype, 'update').mockRejectedValueOnce(new Error('quota exceeded'));
  await expect(finishSession(live)).rejects.toThrow('quota exceeded');
  expect(activeSession()).toBe(s);
  expect(s.saveData()).toEqual({ v: 1, kills: 39 });
  const result = await finishSession(live);
  expect(dispose).toHaveBeenCalledOnce();
  expect((await new SessionStore().list(live.id))).toHaveLength(1);
  expect((await new ProfileStore().get(live.id))!.xp).toBe(result.profile.xp);
  expect(result.profile.lifetime.sessions).toBe(1);
  expect(result.profile.gameData['save-test']).toEqual({ v: 1, kills: 39 });
  expect(activeSession()).toBeNull();
});

it('blocks launching a newer game save and keeps it in storage and backups', async () => {
  const p = await createProfile('Newer save');
  const newer = { v: 4, bank: 400, futureFeature: { rank: 8 } };
  await new ProfileStore().updateGameData(p.id, 'towerdefense', newer);
  const profile = (await new ProfileStore().get(p.id))!;
  const onSave = vi.fn();
  expect(() => startSession(td, profile, onSave)).toThrow('newer version');
  expect(onSave).not.toHaveBeenCalled(); expect(activeSession()).toBeNull();
  expect((await new ProfileStore().get(p.id))!.gameData.towerdefense).toEqual(newer);
  const backup = JSON.parse(await exportBackup());
  expect(backup.profiles.find((r: Profile) => r.id === p.id).gameData.towerdefense).toEqual(newer);
});

it('waits for a failed final game write before recording or awarding the ride', async () => {
  let live = await createProfile('Checkpoint retry');
  const dispose = vi.fn();
  startSession(game(dispose), live, (data) => { live = { ...live, gameData: { ...live.gameData, 'save-test': data } }; });
  vi.spyOn(ProfileStore.prototype, 'updateGameData').mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(finishSession(live)).rejects.toThrow('storage unavailable');
  expect(await new SessionStore().list(live.id)).toHaveLength(0);
  expect((await new ProfileStore().get(live.id))!.lifetime.sessions).toBe(0);
  const result = await finishSession(live);
  expect(dispose).toHaveBeenCalledOnce();
  expect(result.profile.lifetime.sessions).toBe(1);
  expect(result.profile.gameData['save-test']).toEqual({ v: 1, kills: 39 });
  expect(await new SessionStore().list(live.id)).toHaveLength(1);
});
