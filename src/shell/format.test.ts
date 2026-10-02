import { describe, expect, it } from 'vitest';
import { formatDuration, formatNum, formatValue, levelProgress, packetsPerSecond, zoneFractions } from './format';

describe('format', () => {
  it('durations', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(-3)).toBe('0:00');
  });
  it('numbers', () => {
    expect(formatNum(null)).toBe('--');
    expect(formatNum(NaN)).toBe('--');
    expect(formatNum(3.14159, 2)).toBe('3.14');
    expect(formatValue(2)).toBe('2');
    expect(formatValue(2.5)).toBe('2.50');
    expect(formatValue(true)).toBe('true');
  });
  it('zones, packets, level', () => {
    expect(zoneFractions([0, 0])).toEqual([0, 0]);
    expect(zoneFractions([10, 30])).toEqual([0.25, 0.75]);
    expect(packetsPerSecond({ packets: 10 }, { packets: 20 }, 2)).toBe(5);
    expect(packetsPerSecond({ packets: 10 }, { packets: 20 }, 0)).toBe(0);
    expect(levelProgress(150, 100, 200)).toBe(0.5);
    expect(levelProgress(300, 100, 200)).toBe(1);
  });
});
