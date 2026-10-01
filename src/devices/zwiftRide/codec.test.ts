import { describe, it, expect } from 'vitest';
import { parseRideMessage, buttonsFromMap, PolarityDetector, firmwareAtLeast, pickCharacteristics, RIDE_UUIDS, startsWithRideOn } from './codec';

const u = (...b: number[]) => new Uint8Array(b);
describe('parseRideMessage', () => {
  it('all released', () => {
    const m = parseRideMessage(u(0x23, 0x08, 0xff, 0xff, 0x03));
    expect(m).toEqual({ kind: 'status', buttonMapRaw: 0xffff, paddles: {} });
    expect(buttonsFromMap(0xffff).size).toBe(0);
  });
  it('A held', () => {
    const m = parseRideMessage(u(0x23, 0x08, 0xef, 0xff, 0x03));
    expect(m.kind === 'status' && [...buttonsFromMap(m.buttonMapRaw!)]).toEqual(['a']);
  });
  it('left paddle -100', () => {
    const m = parseRideMessage(u(0x23, 0x08, 0xff, 0xff, 0x03, 0x1a, 0x05, 0x08, 0x00, 0x10, 0xc7, 0x01));
    expect(m).toEqual({ kind: 'status', buttonMapRaw: 0xffff, paddles: { 0: -100 } });
  });
  it('right paddle +50', () => {
    const m = parseRideMessage(u(0x23, 0x08, 0xff, 0xff, 0x03, 0x1a, 0x04, 0x08, 0x01, 0x10, 0x64));
    expect(m).toEqual({ kind: 'status', buttonMapRaw: 0xffff, paddles: { 1: 50 } });
  });
  it('ignores paddle locations 2/3 and unknown fields', () => {
    const m = parseRideMessage(u(0x23, 0x08, 0xff, 0xff, 0x03, 0x20, 0x05, 0x1a, 0x04, 0x08, 0x02, 0x10, 0x64, 0x2a, 0x01, 0x07));
    expect(m).toEqual({ kind: 'status', buttonMapRaw: 0xffff, paddles: {} });
  });
  it('truncated / malformed', () => {
    expect(parseRideMessage(u(0x23, 0x08, 0xff)).kind).toBe('other');
    expect(parseRideMessage(u(0x23, 0x08, 0xff, 0xff, 0x03, 0x1a, 0x09, 0x08)).kind).toBe('other');
    expect(parseRideMessage(u())).toMatchObject({ kind: 'other', malformed: true });
  });
  it('status without button map keeps null', () => {
    expect(parseRideMessage(u(0x23))).toEqual({ kind: 'status', buttonMapRaw: null, paddles: {} });
  });
  it('other / empty / battery', () => {
    expect(parseRideMessage(u(0x15))).toEqual({ kind: 'other', opcode: 0x15 });
    expect(parseRideMessage(u(0x42, 1, 2))).toEqual({ kind: 'other', opcode: 0x42 });
    expect(parseRideMessage(u(0x19, 0x10, 0x55))).toEqual({ kind: 'battery', pct: 85 });
  });
});
describe('buttons / polarity', () => {
  it('decodes multiple', () => {
    expect([...buttonsFromMap(0xffff & ~0x1 & ~0x8000)].sort()).toEqual(['left', 'onOffR']);
  });
  it('flips when >8 pressed in early messages', () => {
    const d = new PolarityDetector();
    expect(d.feed(0x0000)).toBe(true);
    expect(d.decode(0x0000).size).toBe(0);
    expect(d.decode(0x0010)).toEqual(new Set(['a']));
    expect(d.feed(0x0000)).toBe(false);
  });
  it('does not flip normal traffic and stops checking after 3', () => {
    const d = new PolarityDetector();
    d.feed(0xffff); d.feed(0xffef); d.feed(0xffff);
    expect(d.feed(0x0000)).toBe(false);
    expect(d.flipped).toBe(false);
  });
});
describe('misc', () => {
  it('firmware', () => {
    expect(firmwareAtLeast('1.3.0', '1.3.0')).toBe(true);
    expect(firmwareAtLeast('1.2.9', '1.3.0')).toBe(false);
    expect(firmwareAtLeast('v2.0', '1.3.0')).toBe(true);
    expect(firmwareAtLeast('junk', '1.3.0')).toBe(false);
  });
  it('char fallback', () => {
    const exact = pickCharacteristics([{ uuid: RIDE_UUIDS.async, notify: true, indicate: false, write: false, writeNoResp: false }, { uuid: RIDE_UUIDS.syncRx, notify: false, indicate: false, write: false, writeNoResp: true }]);
    expect(exact.fallback).toEqual([]);
    const fb = pickCharacteristics([{ uuid: 'aaa', notify: true, indicate: false, write: false, writeNoResp: false }, { uuid: 'bbb', notify: false, indicate: false, write: true, writeNoResp: false }]);
    expect(fb.async).toBe('aaa'); expect(fb.syncRx).toBe('bbb');
  });
  it('RideOn', () => { expect(startsWithRideOn(u(0x52, 0x69, 0x64, 0x65, 0x4f, 0x6e, 1, 2))).toBe(true); expect(startsWithRideOn(u(1))).toBe(false); });
});

describe('parseRideMessage analog group layout (field 2 wrapping repeated field 1)', () => {
  it('reads both paddles from a field-2 group', () => {
    // 23 | 08 FF FF 03 | 12 0C ( 0A 04 08 00 10 C7 01? ) -- built below
    const left = [0x08, 0x00, 0x10, 0xc7, 0x01];      // loc 0, value -100
    const right = [0x08, 0x01, 0x10, 0x64];           // loc 1, value +50
    const group = [0x0a, left.length, ...left, 0x0a, right.length, ...right];
    const msg = new Uint8Array([0x23, 0x08, 0xff, 0xff, 0x03, 0x12, group.length, ...group]);
    const m = parseRideMessage(msg);
    expect(m.kind).toBe('status');
    if (m.kind !== 'status') return;
    expect(m.buttonMapRaw).toBe(0xffff);
    expect(m.paddles[0]).toBe(-100);
    expect(m.paddles[1]).toBe(50);
  });
  it('treats an empty press in a group as location 0 value 0, and ignores locations 2/3', () => {
    const up = [0x08, 0x02, 0x10, 0x14];
    const group = [0x0a, 0x00, 0x0a, up.length, ...up];
    const m = parseRideMessage(new Uint8Array([0x23, 0x08, 0xff, 0xff, 0x03, 0x12, group.length, ...group]));
    expect(m.kind === 'status' && m.paddles).toEqual({ 0: 0 });
  });
  it('flags a truncated group as malformed', () => {
    const m = parseRideMessage(new Uint8Array([0x23, 0x08, 0xff, 0xff, 0x03, 0x12, 0x06, 0x0a, 0x09, 0x08]));
    expect(m.kind).toBe('other');
  });
});
