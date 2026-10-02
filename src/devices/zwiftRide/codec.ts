// Pure Zwift Ride V1 message codec. No Bluetooth / DOM access here.
import type { Button } from '../../contracts';

export const RIDE_BUTTON_BITS: Record<Button, number> = {
  left: 0x1, up: 0x2, right: 0x4, down: 0x8,
  a: 0x10, b: 0x20, y: 0x40, z: 0x80,
  shiftUpL: 0x100, shiftDnL: 0x200, powerUpL: 0x400, onOffL: 0x800,
  shiftUpR: 0x1000, shiftDnR: 0x2000, powerUpR: 0x4000, onOffR: 0x8000,
};
const ALL_BUTTONS = Object.keys(RIDE_BUTTON_BITS) as Button[];
export const ALL_RELEASED_MAP = 0xffff;

export type RideMessage =
  | { kind: 'status'; buttonMapRaw: number | null; paddles: { 0?: number; 1?: number } }
  | { kind: 'battery'; pct: number }
  | { kind: 'other'; opcode: number; malformed?: boolean };

interface Varint { value: number; next: number }
function readVarint(buf: Uint8Array, pos: number): Varint | null {
  let value = 0; let mul = 1;
  for (let i = 0; i < 10; i++) {
    if (pos + i >= buf.length) return null;
    const b = buf[pos + i];
    value += (b & 0x7f) * mul;
    if ((b & 0x80) === 0) return { value, next: pos + i + 1 };
    mul *= 128;
  }
  return null;
}
export function zigzagDecode(n: number): number { return n % 2 === 0 ? n / 2 : -(n + 1) / 2; }

type Field = { num: number; wire: number; value?: number; bytes?: Uint8Array };
/** Parse a flat protobuf message; returns null if truncated/malformed. Unknown fields are returned (caller skips). */
function parseFields(buf: Uint8Array, start = 0): Field[] | null {
  const out: Field[] = [];
  let p = start;
  while (p < buf.length) {
    const tag = readVarint(buf, p); if (!tag) return null;
    p = tag.next;
    const num = Math.floor(tag.value / 8); const wire = tag.value % 8;
    if (wire === 0) {
      const v = readVarint(buf, p); if (!v) return null;
      p = v.next; out.push({ num, wire, value: v.value });
    } else if (wire === 2) {
      const len = readVarint(buf, p); if (!len) return null;
      p = len.next;
      if (p + len.value > buf.length) return null;
      out.push({ num, wire, bytes: buf.subarray(p, p + len.value) });
      p += len.value;
    } else if (wire === 1) { if (p + 8 > buf.length) return null; p += 8; out.push({ num, wire }); }
    else if (wire === 5) { if (p + 4 > buf.length) return null; p += 4; out.push({ num, wire }); }
    else return null; // groups / invalid wire types
  }
  return out;
}

/** Analog press {1: location varint, 2: sint32 zig-zag value}. proto3 omits zeros, so missing = 0. */
function parsePress(bytes: Uint8Array): { loc: number; value: number } | null {
  const inner = parseFields(bytes);
  if (!inner) return null;
  let loc = 0; let value = 0;
  for (const g of inner) {
    if (g.num === 1 && g.wire === 0) loc = g.value!;
    else if (g.num === 2 && g.wire === 0) value = zigzagDecode(g.value!);
  }
  return { loc, value: Math.max(-100, Math.min(100, value)) };
}

export function parseRideMessage(data: Uint8Array): RideMessage {
  if (!data || data.length === 0) return { kind: 'other', opcode: -1, malformed: true };
  const opcode = data[0];
  if (opcode === 0x23) {
    const fields = parseFields(data, 1);
    if (!fields) return { kind: 'other', opcode, malformed: true };
    let buttonMapRaw: number | null = null;
    const paddles: { 0?: number; 1?: number } = {};
    const addPress = (bytes: Uint8Array): boolean => {
      const p = parsePress(bytes);
      if (!p) return false;
      if (p.loc === 0 || p.loc === 1) paddles[p.loc] = p.value;
      return true;
    };
    for (const f of fields) {
      if (f.num === 1 && f.wire === 0) buttonMapRaw = f.value! % 4294967296;
      // Layout A (spec): field 3 = repeated analog press {1: location, 2: sint32 value}.
      else if (f.num === 3 && f.wire === 2) {
        if (!addPress(f.bytes!)) return { kind: 'other', opcode, malformed: true };
      }
      // Layout B (seen on Ride V1 firmware): field 2 = analog group {repeated 1: analog press}.
      else if (f.num === 2 && f.wire === 2) {
        const group = parseFields(f.bytes!);
        if (!group) return { kind: 'other', opcode, malformed: true };
        for (const g of group) {
          if (g.num === 1 && g.wire === 2 && !addPress(g.bytes!)) return { kind: 'other', opcode, malformed: true };
        }
      }
    }
    return { kind: 'status', buttonMapRaw, paddles };
  }
  if (opcode === 0x19) {
    const fields = parseFields(data, 1);
    if (!fields) return { kind: 'other', opcode, malformed: true };
    // Unverified field layout: prefer field 2, then field 1.
    const f = fields.find((x) => x.num === 2 && x.wire === 0) ?? fields.find((x) => x.num === 1 && x.wire === 0);
    if (!f) return { kind: 'other', opcode, malformed: true };
    return { kind: 'battery', pct: Math.max(0, Math.min(100, f.value!)) };
  }
  return { kind: 'other', opcode };
}

/** Decode a ButtonMap. Default polarity: a 0 bit means pressed. */
export function buttonsFromMap(raw: number, flipped = false): Set<Button> {
  const out = new Set<Button>();
  for (const b of ALL_BUTTONS) {
    const bit = (raw & RIDE_BUTTON_BITS[b]) !== 0;
    if (flipped ? bit : !bit) out.add(b);
  }
  return out;
}

/** Polarity safety net: if any of the first 3 status messages shows >8 buttons pressed, flip polarity. */
export class PolarityDetector {
  flipped = false;
  private seen = 0;
  private decided = false;
  /** Feed a raw map; returns true if this call flipped the polarity. */
  feed(raw: number): boolean {
    if (this.decided) return false;
    this.seen++;
    let flippedNow = false;
    if (buttonsFromMap(raw, this.flipped).size > 8) { this.flipped = !this.flipped; this.decided = true; flippedNow = true; }
    if (this.seen >= 3) this.decided = true;
    return flippedNow;
  }
  decode(raw: number): Set<Button> { return buttonsFromMap(raw, this.flipped); }
}

/** True if firmware string (e.g. "1.3.0", "v1.2.4-beta") is >= min. Unparseable -> false. */
export function firmwareAtLeast(fw: string, min: string): boolean {
  const parse = (s: string) => { const m = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(s); return m ? [+m[1], +m[2], +(m[3] ?? 0)] : null; };
  const a = parse(fw); const b = parse(min);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return true;
}

export const RIDE_ON = new Uint8Array([0x52, 0x69, 0x64, 0x65, 0x4f, 0x6e]);
export function startsWithRideOn(d: Uint8Array): boolean {
  return d.length >= RIDE_ON.length && RIDE_ON.every((b, i) => d[i] === b);
}

/** Pick characteristics by exact UUID, falling back to first notify / first write. */
export interface CharInfo { uuid: string; notify: boolean; indicate: boolean; write: boolean; writeNoResp: boolean }
export const RIDE_UUIDS = {
  service: 0xfc82,
  async: '00000002-19ca-4651-86e5-fa29dcdd09d1',
  syncRx: '00000003-19ca-4651-86e5-fa29dcdd09d1',
  syncTx: '00000004-19ca-4651-86e5-fa29dcdd09d1',
};
export function pickCharacteristics(chars: CharInfo[]): { async?: string; syncRx?: string; syncTx?: string; fallback: string[] } {
  const has = (u: string) => chars.some((c) => c.uuid.toLowerCase() === u);
  const fallback: string[] = [];
  let async = has(RIDE_UUIDS.async) ? RIDE_UUIDS.async : undefined;
  let syncRx = has(RIDE_UUIDS.syncRx) ? RIDE_UUIDS.syncRx : undefined;
  const syncTx = has(RIDE_UUIDS.syncTx) ? RIDE_UUIDS.syncTx : undefined;
  if (!async) { async = chars.find((c) => c.notify)?.uuid; if (async) fallback.push('async=' + async); }
  if (!syncRx) { syncRx = chars.find((c) => c.write || c.writeNoResp)?.uuid; if (syncRx) fallback.push('syncRx=' + syncRx); }
  return { async, syncRx, syncTx, fallback };
}
