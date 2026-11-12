import { describe, expect, it } from 'vitest';
import { bumpAt, kickerLip, DIVE, diveDip } from '../sim/track';

describe('road bumps', () => {
  it('finds every kicker lip, whatever the step size, so a kicker always launches you', () => {
    for (const step of [0.4, 1.3, 2.7]) {
      let lips = 0, kickers = 0;
      for (let x = 0; x < 20000; x += step) if (kickerLip(x, x + step, 42) !== null) lips++;
      for (let k = 0; k < 20000 / 140; k++) if (bumpAt(k * 140 + 1, 42)?.kind === 'kicker') kickers++;
      expect(lips).toBe(kickers);
    }
  });
  it('keeps most of the cruise smooth', () => {
    let bumps = 0; const n = 400;
    for (let k = 0; k < n; k++) if (bumpAt(k * 140 + 1, 7)) bumps++;
    expect(bumps / n).toBeLessThan(0.45);
  });
});

describe('flooded tunnel dip', () => {
  it('ramps smoothly down under the water line and back up', () => {
    const x0 = 100, len = 400;
    expect(diveDip(x0, len, x0 - 1)).toBe(0); expect(diveDip(x0, len, x0 + len + 1)).toBe(0);
    expect(diveDip(x0, len, x0 + len / 2)).toBe(-DIVE.depth);
    expect(DIVE.roof - DIVE.depth).toBeLessThan(DIVE.water); // the tunnel's roof is under the water line: fully flooded
    let prev = 0;
    for (let x = x0; x <= x0 + len; x += 0.5) { const d = diveDip(x0, len, x); expect(Math.abs(d - prev)).toBeLessThan(0.5); prev = d; }
  });
});
