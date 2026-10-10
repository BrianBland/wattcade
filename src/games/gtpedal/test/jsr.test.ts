import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile } from '../../../core';
import { module } from '../index';
import { sliverAmt, SLIVER } from '../render/jsr';

describe('JSR beauty sliver', () => {
  it('full inside the plaza corner, fades out, zero across town', () => {
    expect(sliverAmt((SLIVER.x0 + SLIVER.x1) / 2, (SLIVER.z0 + SLIVER.z1) / 2)).toBe(1);
    const edge = sliverAmt(SLIVER.x0 - 10, 50); expect(edge).toBeGreaterThan(0); expect(edge).toBeLessThan(1);
    expect(sliverAmt(0, -100)).toBe(0);
  });
  it('artStyle defaults to sliver, overridable (render-only: sim stats identical)', () => {
    const go = (artStyle?: 'classic') => { const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 1, simOpts: artStyle ? { artStyle } : {} } as any); s.step(300); return s.sim.snapshot() as any; };
    const a = go(), b = go('classic');
    expect(a.art).toBe('sliver'); expect(b.art).toBe('classic');
    expect(a.stats).toEqual(b.stats);
  });
});
