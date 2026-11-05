import { describe, expect, it } from 'vitest';
import { downsample, formatDuration, formatNum, formatValue, levelProgress, packetsPerSecond, prettyKey, timeAgo, zoneFractions, rideMetricLabel, rideMetricValue } from './format';

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

describe('format extras', () => {
  it('prettyKey', () => {
    expect(prettyKey('distanceKm')).toBe('Distance km');
    expect(prettyKey('rooms_cleared')).toBe('Rooms cleared');
  });
  it('downsample averages buckets and keeps null gaps', () => {
    expect(downsample([1, 3, 5, 7], 2)).toEqual([2, 6]);
    expect(downsample([null, null, 4, 6], 2)).toEqual([null, 5]);
    expect(downsample([1, 2], 5)).toEqual([1, 2]);
  });
  it('timeAgo', () => {
    expect(timeAgo(undefined)).toBe('Not played yet');
    expect(timeAgo(1000 - 30 * 60000, 1000)).toBe('30 min ago');
    expect(timeAgo(0, 3 * 86400000)).toBe('Not played yet');
    expect(timeAgo(1, 3 * 86400000)).toBe('3 days ago');
  });
});

it('keeps result and summary measurements in the rider units',()=>{expect(rideMetricLabel('distanceKm')).toBe('Distance');expect(rideMetricValue('distanceKm',1.609344,'imperial')).toBe('1.00 mi');expect(rideMetricValue('climbM',30.48,'imperial')).toBe('100 ft');expect(rideMetricValue('topKph',16.09344,'imperial')).toBe('10.0 mph');expect(rideMetricValue('distanceKm',1,'metric')).toBe('1.00 km');expect(rideMetricValue('status','Complete','metric')).toBe('Complete');});
