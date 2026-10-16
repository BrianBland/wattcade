import { expect, it } from 'vitest';
import type { SessionRecord } from '../../../contracts';
import { testProfile } from '../../../core';
import { achievements } from '../achievements';

const check = (id: string, record: Partial<SessionRecord>) => achievements.find((a) => a.id === id)!.check!(testProfile(), { gameId: 'towerdefense', ...record } as SessionRecord, []);
const clear = () => ({ t: 0, type: 'waveCleared' });
const end = { t: 0, type: 'runEnded', data: { reason: 'bail' } };

it('Spotless requires twenty clean waves in a single run, including after an earlier failed run', () => {
  expect(check('td_spotless', { events: [...Array.from({ length: 10 }, clear), end, ...Array.from({ length: 10 }, clear)] })).toBe(false);
  expect(check('td_spotless', { events: [{ t: 0, type: 'baseHit' }, end, ...Array.from({ length: 20 }, clear)] })).toBe(true);
  expect(check('td_spotless', { events: [...Array.from({ length: 10 }, clear), { t: 0, type: 'baseHit' }, ...Array.from({ length: 10 }, clear)] })).toBe(false);
});

it('Surge Protector counts the best single run and supports older ride summaries', () => {
  expect(check('td_surges', { gameSummary: { bestRunSurges: 10, surgesWon: 20 } })).toBe(false);
  expect(check('td_surges', { gameSummary: { bestRunSurges: 20, surgesWon: 30 } })).toBe(true);
  expect(check('td_surges', { gameSummary: { surgesWon: 20 } })).toBe(true);
});
