import { expect, it } from 'vitest';
import { fakeKeyAdjust } from './fakeKeys';
it('maps fake bike keys', () => {
  expect(fakeKeyAdjust('KeyW')).toEqual({ k: 'cadence', delta: 5 });
  expect(fakeKeyAdjust('KeyD')).toEqual({ k: 'power', delta: -10 });
  expect(fakeKeyAdjust('KeyF')).toEqual({ k: 'hr', delta: -5 });
  expect(fakeKeyAdjust('KeyK')).toBeNull();
});
