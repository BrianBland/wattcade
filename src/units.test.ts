import { expect, it } from 'vitest';
import { formatDistance, formatElevation, formatSpeed, formatUpcoming, measurementText } from './units';
it('converts ride displays with standard imperial factors', () => {
  expect(formatDistance(1.609344, 'imperial')).toBe('1.00 mi');
  expect(formatElevation(30.48, 'imperial')).toBe('100 ft');
  expect(formatSpeed(16.09344, 'imperial')).toBe('10.0 mph');
  expect(formatDistance(1.609344, 'metric')).toBe('1.61 km');
  expect(formatUpcoming(100, 'imperial')).toBe('330 ft');
  expect(formatUpcoming(1609.344, 'imperial')).toBe('1.0 mi');
  expect(measurementText('Ride 100 km', 'imperial')).toBe('Ride 62.1 mi');
  expect(measurementText('1,000/3,400 km', 'imperial')).toBe('621.4/2,112.7 mi');
});
