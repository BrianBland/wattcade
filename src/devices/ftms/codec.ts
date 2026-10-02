// Pure FTMS codecs. No Web Bluetooth here.
import type { DeviceSample } from '../../contracts';

export const FTMS_SERVICE = 0x1826;
export const CHAR = {
  indoorBikeData: 0x2ad2, controlPoint: 0x2ad9, machineStatus: 0x2ada,
  feature: 0x2acc, resistanceRange: 0x2ad6, powerRange: 0x2ad8,
} as const;
export const OP = { requestControl: 0x00, setResistance: 0x04, setPower: 0x05, start: 0x07, setSim: 0x11, response: 0x80 } as const;
export const RESULT = { success: 1, notSupported: 2, invalidParam: 3, failed: 4, notPermitted: 5 } as const;

export interface IndoorBikeData extends DeviceSample {
  avgSpeedKph?: number; avgCadence?: number; distanceM?: number; avgPower?: number;
  energyKcal?: number; energyPerHour?: number; energyPerMin?: number; met?: number;
  elapsedS?: number; remainingS?: number;
}

/** Parse Indoor Bike Data (0x2AD2). Only fields present in the packet are set, so partial packets can be merged. Tolerates truncation. */
export function parseIndoorBikeData(dv: DataView): IndoorBikeData {
  const out: IndoorBikeData = {};
  if (dv.byteLength < 2) return out;
  const flags = dv.getUint16(0, true);
  let o = 2;
  const has = (n: number) => o + n <= dv.byteLength;
  const u16 = () => { const v = dv.getUint16(o, true); o += 2; return v; };
  const s16 = () => { const v = dv.getInt16(o, true); o += 2; return v; };
  const u8 = () => dv.getUint8(o++);
  if (!(flags & 0x1)) { if (!has(2)) return out; out.speedKph = u16() * 0.01; }
  if (flags & 0x2) { if (!has(2)) return out; out.avgSpeedKph = u16() * 0.01; }
  if (flags & 0x4) { if (!has(2)) return out; out.cadence = u16() * 0.5; }
  if (flags & 0x8) { if (!has(2)) return out; out.avgCadence = u16() * 0.5; }
  if (flags & 0x10) { if (!has(3)) return out; out.distanceM = dv.getUint16(o, true) | (dv.getUint8(o + 2) << 16); o += 3; }
  if (flags & 0x20) { if (!has(2)) return out; out.resistanceLevel = s16(); }
  if (flags & 0x40) { if (!has(2)) return out; out.power = s16(); }
  if (flags & 0x80) { if (!has(2)) return out; out.avgPower = s16(); }
  if (flags & 0x100) { if (!has(5)) return out; out.energyKcal = u16(); out.energyPerHour = u16(); out.energyPerMin = u8(); }
  if (flags & 0x200) { if (!has(1)) return out; out.hr = u8(); }
  if (flags & 0x400) { if (!has(1)) return out; out.met = u8() * 0.1; }
  if (flags & 0x800) { if (!has(2)) return out; out.elapsedS = u16(); }
  if (flags & 0x1000) { if (!has(2)) return out; out.remainingS = u16(); }
  return out;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const encodeRequestControl = (): Uint8Array => Uint8Array.of(OP.requestControl);
export const encodeStart = (): Uint8Array => Uint8Array.of(OP.start);

export function encodeSetPower(watts: number): Uint8Array {
  const b = new Uint8Array(3); b[0] = OP.setPower;
  new DataView(b.buffer).setInt16(1, clamp(Math.round(watts), -32768, 32767), true);
  return b;
}

/** `raw` is in the trainer's 0.1 resolution units. */
export function encodeSetResistance(raw: number, form: 'u8' | 's16' = 'u8'): Uint8Array {
  if (form === 'u8') return Uint8Array.of(OP.setResistance, clamp(Math.round(raw), 0, 255));
  const b = new Uint8Array(3); b[0] = OP.setResistance;
  new DataView(b.buffer).setInt16(1, clamp(Math.round(raw), -32768, 32767), true);
  return b;
}

export function encodeSetSim(gradePct: number, windMps = 0, crr = 0.004, cw = 0.51): Uint8Array {
  const b = new Uint8Array(7); const dv = new DataView(b.buffer);
  b[0] = OP.setSim;
  dv.setInt16(1, clamp(Math.round(windMps * 1000), -32768, 32767), true);
  dv.setInt16(3, clamp(Math.round(gradePct * 100), -32768, 32767), true);
  dv.setUint8(5, clamp(Math.round(crr * 10000), 0, 255));
  dv.setUint8(6, clamp(Math.round(cw * 100), 0, 255));
  return b;
}

export interface ControlPointResponse { requestOpcode: number; result: number; ok: boolean; params: Uint8Array }
export function parseControlPointResponse(data: DataView | Uint8Array): ControlPointResponse | null {
  const u = data instanceof Uint8Array ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (u.length < 3 || u[0] !== OP.response) return null;
  return { requestOpcode: u[1], result: u[2], ok: u[2] === RESULT.success, params: u.slice(3) };
}

/** Real units (resolution 0.1 applied): [min, max, increment]. */
export function parseResistanceRange(dv: DataView): [number, number, number] | undefined {
  if (dv.byteLength < 6) return undefined;
  return [dv.getInt16(0, true) * 0.1, dv.getInt16(2, true) * 0.1, dv.getUint16(4, true) * 0.1];
}
/** Watts: [min, max, increment]. */
export function parsePowerRange(dv: DataView): [number, number, number] | undefined {
  if (dv.byteLength < 6) return undefined;
  return [dv.getInt16(0, true), dv.getInt16(2, true), dv.getUint16(4, true)];
}

/** Map 0..100 % onto the supported resistance range; returns the value in 0.1 raw units. */
export function resistancePctToRaw(pct: number, range: [number, number, number]): number {
  const p = clamp(pct, 0, 100) / 100;
  const target = range[0] + p * (range[1] - range[0]);
  return Math.round(target / 0.1);
}
