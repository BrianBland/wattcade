import { describe, expect, it } from 'vitest';
import { History, POWER_BOUNDS, HR_BOUNDS, effectiveSource, zonePosition } from './zoneMath';

describe('zonePosition', () => {
  it('finds zones by power fraction', () => {
    expect(zonePosition(0.3, POWER_BOUNDS).zone).toBe(1);
    expect(zonePosition(0.55, POWER_BOUNDS).zone).toBe(2);
    expect(zonePosition(0.65, POWER_BOUNDS).within).toBeCloseTo(0.5);
    expect(zonePosition(0.8, POWER_BOUNDS).zone).toBe(3);
    expect(zonePosition(1.0, POWER_BOUNDS).zone).toBe(4);
    expect(zonePosition(1.5, POWER_BOUNDS)).toMatchObject({ zone: 5, within: 1, pos: 1 });
  });
  it('uses hr bounds, handles junk', () => {
    expect(zonePosition(0.85, HR_BOUNDS).zone).toBe(4);
    expect(zonePosition(NaN, POWER_BOUNDS)).toMatchObject({ zone: 1, pos: 0 });
    expect(zonePosition(0.75, POWER_BOUNDS).pos).toBeCloseTo(0.4);
  });
  it('picks source', () => {
    expect(effectiveSource('auto', 120)).toBe('hr');
    expect(effectiveSource('auto', null)).toBe('power');
    expect(effectiveSource('power', 120)).toBe('power');
  });
  it('history averages into bars', () => {
    const h = new History(2, 3);
    for (let i = 0; i < 20; i++) h.push(0.5, 100 + i, null, 2);
    expect(h.bars.length).toBe(3);
    expect(h.bars[0].hr).toBeNull();
  });
});
