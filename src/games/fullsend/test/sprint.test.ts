import { describe, expect, it } from 'vitest';
import { cardHeadline, cardRows, cardVisible, ghostCall, horizonPreview, pace, sprintIntensity } from '../render/sprint';
import type { SetResult } from '../sim/sim';

describe('sprint screen helpers', () => {
  const th: [number, number, number] = [1.1, 1.25, 1.5];
  it('pace is the medal your mean power is on course for', () => {
    expect([1.0, 1.15, 1.3, 1.6].map((live) => pace({ live, th }))).toEqual([0, 1, 2, 3]);
  });
  it('the set piece shows on the horizon from far off, grows as you close in, and hands over at the edge of the view', () => {
    const far = horizonPreview(1200, 60, 400, 100, 200)!, near = horizonPreview(90, 60, 400, 100, 200)!;
    expect(far).not.toBeNull(); expect(near).not.toBeNull();
    expect(near.sc).toBeGreaterThan(far.sc);
    expect(near.x).toBeGreaterThan(far.x); expect(near.y).toBeGreaterThan(far.y);
    expect(near.x).toBeLessThanOrEqual(400);
    expect(horizonPreview(50, 60, 400, 100, 200)).toBeNull(); // in view: the real one is drawn
    expect(horizonPreview(61, 60, 400, 100, 200)?.alpha ?? 0).toBeLessThan(0.2); // fading out as the real one arrives
  });
  it('escalation rises with pace and power, and is off outside the sprint', () => {
    const p = (live: number) => ({ live, th });
    const lo = sprintIntensity({ phase: 'effort', ftpFrac: 0.9 }, p(0.9)), hi = sprintIntensity({ phase: 'effort', ftpFrac: 1.7 }, p(1.6));
    expect(hi).toBeGreaterThan(lo); expect(hi).toBeLessThanOrEqual(1);
    expect(sprintIntensity({ phase: 'recovery', ftpFrac: 2 }, p(2))).toBe(0);
  });
  it('the ghost call-out says how far ahead or behind your best run you are', () => {
    expect(ghostCall(1000, null)).toBeNull();
    expect(ghostCall(1000, 960)!.text).toBe('+40 m ON YOUR BEST');
    expect(ghostCall(1000, 2300)).toEqual({ text: '1.3 km BEHIND YOUR BEST', ahead: false });
    expect(ghostCall(1000, 998)!.text).toBe('LEVEL WITH YOUR BEST');
  });
  it('the end-of-tour card lists each set piece with watts and new bests, after the last one', () => {
    const r: SetResult = { kind: 'leap', biome: 'desert', title: 'Mesa Gap', medal: 3, detail: '210 m', effortS: 15, avgW: 412, peakW: 655, pb: true };
    expect(cardRows([r])).toEqual([{ title: 'Mesa Gap', medal: 3, medalName: 'Gold', watts: '412 W avg · 655 W peak · 15 s', pb: true }]);
    expect(cardHeadline(900, 0)).toMatch(/FIRST RIDE/);
    expect(cardHeadline(900, 800)).toMatch(/NEW BEST \(\+100\)/);
    expect(cardHeadline(700, 800)).toBe('700 PTS · BEST 800');
    const base = { menu: null, results: [r], setCount: 5 };
    expect(cardVisible({ ...base, phase: 'recovery', phaseT: 10 })).toBe(false);
    expect(cardVisible({ ...base, phase: 'cooldown', phaseT: 5 })).toBe(true);
    expect(cardVisible({ ...base, phase: 'done', phaseT: 0 })).toBe(true);
  });
});
