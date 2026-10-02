import { it, expect } from 'vitest';
import { toHex, propsList, fmtLine, isPrintable } from './format';
it('format', () => {
  expect(toHex(new Uint8Array([0, 0xab, 0x10]))).toBe('00 ab 10');
  expect(toHex(new Uint8Array([1, 2, 3]).subarray(1))).toBe('02 03');
  expect(propsList({ read: true, write: false, notify: true })).toBe('read,notify');
  expect(propsList({})).toBe('-');
  expect(fmtLine(1500, 'NOTIFY', 'x')).toContain('1.500');
  expect(isPrintable(new Uint8Array([0x52, 0x69]))).toBe(true); expect(isPrintable(new Uint8Array([0]))).toBe(false);
});
