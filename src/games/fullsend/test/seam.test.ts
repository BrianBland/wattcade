import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile } from '../../../core';
import { module } from '../index';
import { SEAM_MIN_M, type FullSendSnapshot } from '../sim/sim';

describe('biome seams', () => {
  it('the next biome begins at a gateway on the road ahead: no cross-fade, the change happens as you ride through it', () => {
    const events: Array<{ type: string; data?: unknown }> = [];
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'hook-responsive' }, seed: 1,
      simOpts: { tour: 'quick', menu: false }, onEmit: (e) => events.push(e as never) });
    const snap = () => (s.sim as unknown as { snapshot(): FullSendSnapshot }).snapshot();
    const crossings: Array<{ x: number; seamX: number; to: string }> = [];
    let seams = 0, last: FullSendSnapshot['seam'] = null, prev = snap().biome;
    for (let i = 0; i < 30 * 60 * 14; i++) {
      s.step(1);
      const q = snap();
      expect(q.tier !== 'ground' || q.toTier || q.mix === 0).toBe(true); // the ground never blends
      if (q.seam && q.seam !== last && q.seam.x !== last?.x) {
        seams++;
        expect(q.seam.lead).toBeGreaterThanOrEqual(SEAM_MIN_M); // went up far enough ahead to roll in from off screen
        expect(q.seam.x - q.x).toBeGreaterThan(SEAM_MIN_M - 50);
        expect(q.seam.from).toBe(prev);
      }
      if (q.tier === 'ground' && !q.toTier && q.biome !== prev) crossings.push({ x: q.x, seamX: last?.x ?? q.seam?.x ?? NaN, to: q.biome });
      last = q.seam; prev = q.tier === 'ground' && !q.toTier ? q.biome : prev;
    }
    expect(seams).toBeGreaterThanOrEqual(3);
    expect(crossings.length).toBeGreaterThanOrEqual(3);
    for (const c of crossings) expect(c.x - c.seamX).toBeGreaterThanOrEqual(0), expect(c.x - c.seamX).toBeLessThan(5); // within a tick of the gateway
    expect(events.filter((e) => e.type === 'biomeReached').length).toBeGreaterThanOrEqual(crossings.length);
  });
});
