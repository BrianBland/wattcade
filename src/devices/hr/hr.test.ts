import { expect, it } from 'vitest';
import { parseHeartRate } from './codec';
const dv = (...b: number[]) => new DataView(Uint8Array.from(b).buffer);
it('uint8', () => expect(parseHeartRate(dv(0x00, 0x8c))).toBe(140));
it('uint16', () => expect(parseHeartRate(dv(0x01, 0x2c, 0x01))).toBe(300));
it('ignores extra fields', () => expect(parseHeartRate(dv(0x10, 72, 0x10, 0x03))).toBe(72));
it('truncated', () => { expect(parseHeartRate(dv(0x01, 0x2c))).toBeUndefined(); expect(parseHeartRate(dv(0))).toBeUndefined(); });
