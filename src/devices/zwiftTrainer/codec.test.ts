import { expect, it } from 'vitest';
import { encodeGear, encodeRatioQuery, encodeShiftHello, GEAR_RATIOS } from './codec';

it('encodes CORE hello and ratio query independently from the Ride controller hello', () => {
  expect([...encodeShiftHello()]).toEqual([0x52, 0x69, 0x64, 0x65, 0x4f, 0x6e, 1, 2]);
  expect([...encodeRatioQuery()]).toEqual([0, 8, 0x88, 4]);
});
it('encodes physical gear ratios across the two- and three-byte varint boundary', () => {
  expect([...encodeGear(1)]).toEqual([4, 0x2a, 3, 0x10, 0xcc, 0x3a]);
  expect([...encodeGear(12)]).toEqual([4, 0x2a, 4, 0x10, 0xc0, 0xbb, 1]);
  expect([...encodeGear(24)]).toEqual([4, 0x2a, 4, 0x10, 0xf4, 0xac, 3]);
  for (let gear = 1; gear <= 24; gear++) {
    const bytes = encodeGear(gear);
    const ratio = [...bytes.slice(4)].reduce((n, byte, i) => n + (byte & 127) * 128 ** i, 0);
    expect(ratio).toBe(Math.round(GEAR_RATIOS[gear - 1] * 10000));
    expect(bytes[2]).toBe(bytes.length - 3);
  }
});
it('rejects invalid selections instead of sending an arbitrary ratio', () => {
  for (const value of [0, 25, -1, 1.5, NaN, Infinity]) expect(() => encodeGear(value)).toThrow(RangeError);
});
