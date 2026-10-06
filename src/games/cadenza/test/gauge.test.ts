import { describe, expect, it } from 'vitest';
import { GAUGE, gaugeMarks } from '../render/gauge';

describe('track power gauge', () => {
  it('reaches the target bar exactly at the target, caps, and flags over the ceiling', () => {
    expect(gaugeMarks(0.91, 0.91, 1.21)).toMatchObject({ fill: GAUGE.targetM, target: GAUGE.targetM, state: 'ok' });
    expect(gaugeMarks(0.45, 0.91, 1.21).state).toBe('under');
    expect(gaugeMarks(0.45, 0.91, 1.21).fill).toBeCloseTo(GAUGE.targetM * 0.45 / 0.91, 5);
    expect(gaugeMarks(3, 0.91, 1.21)).toMatchObject({ fill: GAUGE.maxM, state: 'over' });
    expect(gaugeMarks(0.91, 0.91, 1.21).ceil!).toBeGreaterThan(GAUGE.targetM);
  });
  it('recovering (no floor): only a ceiling, scaled to the target distance', () => {
    expect(gaugeMarks(0.5, 0, 0.76)).toMatchObject({ target: null, ceil: GAUGE.targetM, state: 'free' });
    expect(gaugeMarks(0.9, 0, 0.76).state).toBe('over');
  });
});
