import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile } from '../../../core';
import { module } from '../index';

describe('cel look', () => {
  it('artStyle defaults to cel everywhere, classic is a debug override (render-only: sim stats identical)', () => {
    const go = (artStyle?: 'classic') => { const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 1, simOpts: artStyle ? { artStyle } : {} } as any); s.step(300); return s.sim.snapshot() as any; };
    const a = go(), b = go('classic');
    expect(a.art).toBe('cel'); expect(b.art).toBe('classic');
    expect(a.stats).toEqual(b.stats);
  });
});
