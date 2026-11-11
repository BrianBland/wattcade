import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile } from '../../../core';
import { module } from '../index';
import type { FullSendSnapshot } from '../sim/sim';
import { countdown, MonotoneCountdown, planSigns } from '../render/signs';

const ride = () => {
  const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'hook-responsive' }, simOpts: { tour: 'quick' }, seed: 3 });
  const snap = () => (s.sim as unknown as { snapshot(): FullSendSnapshot }).snapshot();
  const until = (f: (q: FullSendSnapshot) => boolean) => { for (let i = 0; i < 30 * 60 * 20 && !f(snap()); i++) s.step(1); return snap(); };
  return { until };
};

describe('road signs and countdowns', () => {
  it('on the approach: a start gate where the sprint begins, distance boards before it, and lights for 3-2-1-GO', () => {
    const r = ride();
    const a = r.until((q) => q.phase === 'approach' && q.phaseT > 2);
    const c = countdown(a)!;
    expect(c.phase).toBe('approach');
    expect(c.m).toBeGreaterThan(300);
    const signs = planSigns(a, a.x - 50, c.x + 50);
    const gate = signs.find((q) => q.kind === 'gate')!;
    expect(gate.x).toBeCloseTo(c.x, 3);
    expect(gate.lights).toBe(0);
    for (const b of signs.filter((q) => q.kind === 'count')) expect(c.x - b.x).toBeGreaterThan(0);
    const last = r.until((q) => q.phase === 'approach' && q.phaseS - q.phaseT < 1.5);
    expect(planSigns(last, last.x - 50, last.x + 5000).find((q) => q.kind === 'gate')!.lights).toBe(2);
  });
  it('in a sprint: the distance to the wall counts down', () => {
    const r = ride();
    const e1 = r.until((q) => q.phase === 'effort' && q.phaseT > 1);
    const mc = new MonotoneCountdown(), key = `${e1.setIndex}:effort`;
    let last = mc.value(key, countdown(e1)!.m);
    for (let t = 2; t < 9; t++) { const e = r.until((q) => q.phase === 'effort' && q.phaseT > t); const v = mc.value(key, countdown(e)!.m); expect(v).toBeLessThanOrEqual(last); last = v; }
    const end = r.until((q) => q.phase === 'effort' && q.phaseS - q.phaseT < 0.5);
    expect(countdown(end)!.m).toBeLessThan(60);
    expect(countdown(end)!.label).toBe('WALL');
  });
  it('keeps a board in view: every ~100 m window on an approach, a sprint or a fork holds at least one sign', () => {
    const r = ride();
    for (const f of [(q: FullSendSnapshot) => q.phase === 'approach' && q.phaseT > 2, (q: FullSendSnapshot) => q.phase === 'effort' && q.phaseT > 1, (q: FullSendSnapshot) => !!q.fork]) {
      const q = r.until(f);
      for (let x = q.x - 40; x < q.x + 40; x += 7) expect(planSigns(q, x, x + 95).length).toBeGreaterThan(0);
    }
  });
  it('a fork puts up route signs with the picked branch highlighted; the menu has no signs', () => {
    const r = ride();
    const f = r.until((q) => !!q.fork);
    const signs = planSigns(f, f.x - 500, f.x + 2000).filter((q) => q.kind === 'fork');
    expect(signs.length).toBeGreaterThan(0);
    expect(signs[0].options!.filter((o) => o.on)).toHaveLength(1);
    expect(planSigns({ ...f, menu: { row: 0, tour: 'quick', tours: [], reducedFlash: false, left: 1 } }, 0, 1e6)).toEqual([]);
  });
});
