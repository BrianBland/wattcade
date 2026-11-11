import { describe, expect, it } from 'vitest';
import { Traffic } from '../render/traffic';

describe('Highway traffic', () => {
  it('sends cars past now and then, both ways', () => {
    const tr = new Traffic(), seen = new Map<number, { dir: number; passed: boolean }>();
    let s = 300;
    for (let t = 0; t < 600; t += 0.1) {
      s += 8 * 0.1;
      for (const c of tr.step(t, 0.1, s, 4.2, true)) {
        const e = seen.get(c.id) ?? { dir: c.dir, passed: false };
        if (Math.abs(c.s - s) < 3) e.passed = true;
        seen.set(c.id, e);
      }
    }
    const passed = [...seen.values()].filter((e) => e.passed);
    expect(passed.length).toBeGreaterThan(12);
    expect(passed.some((e) => e.dir > 0)).toBe(true);
    expect(passed.some((e) => e.dir < 0)).toBe(true);
  });

  it('waits for a rider crossing the lanes, then drives on', () => {
    const tr = new Traffic({ slotS: 1000, chance: 1, toward: 1, ahead: 200, behind: 100, road: [0, 1e4] });
    let minGap = Infinity;
    for (let t = 0; t < 30; t += 0.05) for (const c of tr.step(t, 0.05, 500, 0, true)) minGap = Math.min(minGap, Math.abs(c.s - 500));
    expect(minGap).toBeGreaterThan(5);
    let moved = 0;
    for (let t = 30; t < 40; t += 0.05) for (const c of tr.step(t, 0.05, 500, -16, true)) moved = Math.max(moved, c.v);
    expect(moved).toBeGreaterThan(10);
  });

  it('clears the road outside the highway scenes', () => {
    const tr = new Traffic();
    for (let t = 0; t < 60; t += 0.5) tr.step(t, 0.5, 1000, 4.2, true);
    expect(tr.step(60.5, 0.5, 1000, 4.2, false)).toEqual([]);
  });
});
