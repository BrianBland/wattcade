import { expect, it } from 'vitest';
import type { SessionRecord } from '../../../contracts';
import { achievements } from '../achievements';
import { testProfile, runHeadless } from '../../../core';
import { module } from '../index';
const rec = (gameSummary = {}, done = true) => ({ gameId: 'cadenza', gameSummary, events: done ? [{ t: 0, type: 'setDone' }] : [] }) as unknown as SessionRecord;
const check = (id: string, r: SessionRecord) => achievements.find(a => a.id === id)!.check!(testProfile(), r, []);
it('Overdrive requires completing the set as well as holding every drop', () => {
  expect(check('cz_overdrive', rec({ drops: 2, dropsHeld: 2 }, false))).toBe(false);
  expect(check('cz_overdrive', rec({ drops: 1, dropsHeld: 1 }))).toBe(false);
  expect(check('cz_overdrive', rec({ drops: 3, dropsHeld: 2 }))).toBe(false);
  expect(check('cz_overdrive', rec({ drops: 3, dropsHeld: 3 }))).toBe(true);
});
it('Unbroken reads a clean streak, never the legacy scoring combo', () => {
  expect(check('cz_chain', rec({ maxChain: 5000 }))).toBe(false);
  expect(check('cz_chain', rec({ maxChain: 5000, maxCleanChain: 1499 }))).toBe(false);
  expect(check('cz_chain', rec({ maxCleanChain: 1500 }))).toBe(true);
  expect(check('cz_chain', { ...rec({ maxCleanChain: 1500 }), gameId: 'dungeon' })).toBe(false);
});
it('Sharpshooter rejects dropouts and retains its accuracy and collection gates', () => {
  const g = { accuracyPct: 98, collected: 1500, dropouts: 0 };
  expect(check('cz_sharp', rec(g))).toBe(true);
  for (const override of [{ dropouts: 1 }, { accuracyPct: 97 }, { collected: 1499 }]) expect(check('cz_sharp', rec({ ...g, ...override }))).toBe(false);
  expect(check('cz_sharp', rec(g, false))).toBe(false);
});
it('real dropouts break the clean streak while a perfect ride can still earn mastery', () => {
  const casual = runHeadless({ game: module, script: 'z2', minutes: 20, seed: 11, simOpts: { autopilot: true, difficulty: 'casual' }, media: { synth: { style: 'mixed', songs: 5, mix: 'continuous' } } });
  expect(casual.summary.dropouts).toBeGreaterThan(0);
  expect(casual.summary.maxChain).toBeGreaterThanOrEqual(1500);
  expect(casual.summary.maxCleanChain).toBeLessThan(1500);
  expect(check('cz_sharp', rec(casual.summary))).toBe(false);
  const pro = runHeadless({ game: module, script: 'target-follow', minutes: 20, seed: 11, simOpts: { autopilot: true }, media: { synth: { style: 'edm', songs: 5, mix: 'automix' } } });
  expect(pro.summary.maxCleanChain).toBe(pro.summary.maxChain);
  expect(check('cz_chain', rec(pro.summary))).toBe(true);
}, 30_000);
