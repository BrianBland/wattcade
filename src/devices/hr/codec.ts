/** Heart Rate Measurement (0x2A37): flags bit0 = 0 → uint8 HR, 1 → uint16 HR. Returns undefined if truncated. */
export function parseHeartRate(dv: DataView): number | undefined {
  if (dv.byteLength < 2) return undefined;
  if (dv.getUint8(0) & 1) return dv.byteLength >= 3 ? dv.getUint16(1, true) : undefined;
  return dv.getUint8(1);
}
