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
