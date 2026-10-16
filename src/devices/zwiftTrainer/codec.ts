// CORE protocol facts: https://github.com/csanz91/kickr_esp32
// Independently encoded HubCommand physical field 5 / GearRatioX10000 field 2.
export const SHIFT_SERVICES = [0xfc82, '00000001-19ca-4651-86e5-fa29dcdd09d1'] as const;
export const SHIFT_CHARS = {
  write: '00000003-19ca-4651-86e5-fa29dcdd09d1',
  response: '00000004-19ca-4651-86e5-fa29dcdd09d1',
  data: '00000002-19ca-4651-86e5-fa29dcdd09d1',
};
// User-supplied ratios; not claimed to be an authoritative Zwift preset.
export const GEAR_RATIOS = [
  0.75, 0.87, 0.99, 1.11, 1.23, 1.38, 1.53, 1.68, 1.86, 2.04, 2.22, 2.40,
  2.61, 2.82, 3.03, 3.24, 3.49, 3.74, 3.99, 4.24, 4.54, 4.84, 5.14, 5.49,
] as const;
export function encodeShiftHello(): Uint8Array {
  return Uint8Array.of(0x52, 0x69, 0x64, 0x65, 0x4f, 0x6e, 0x01, 0x02);
}
export function encodeRatioQuery(): Uint8Array { return Uint8Array.of(0x00, 0x08, 0x88, 0x04); }
export function encodeGear(gear: number): Uint8Array {
  if (!Number.isInteger(gear) || gear < 1 || gear > GEAR_RATIOS.length) throw new RangeError('Gear must be 1–24');
  let value = Math.round(GEAR_RATIOS[gear - 1] * 10000);
  const encoded: number[] = [];
  do {
    const digit = value % 128;
    value = Math.floor(value / 128);
    encoded.push(digit | (value ? 0x80 : 0));
  } while (value);
  return Uint8Array.of(0x04, 0x2a, encoded.length + 1, 0x10, ...encoded);
}
