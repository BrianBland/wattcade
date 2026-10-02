import { describe, expect, it, vi } from 'vitest';
import {
  encodeSetPower, encodeSetResistance, encodeSetSim, encodeRequestControl, encodeStart, parseControlPointResponse,
  parseIndoorBikeData, parsePowerRange, parseResistanceRange, resistancePctToRaw,
} from './codec';
import { ControlPointQueue } from './queue';
import { backoffDelayS, reconnectLoop } from './reconnect';

const dv = (...b: number[]) => new DataView(Uint8Array.from(b).buffer);

describe('parseIndoorBikeData', () => {
  it('speed only (flags 0)', () => {
    expect(parseIndoorBikeData(dv(0, 0, 0x10, 0x27))).toEqual({ speedKph: 100 });
  });
  it('speed + cadence + power', () => {
    // flags: bit2 cadence, bit6 power = 0x44
    const r = parseIndoorBikeData(dv(0x44, 0, 0xe8, 0x03, 0xb4, 0x00, 0xfa, 0x00));
    expect(r.speedKph).toBeCloseTo(10); expect(r.cadence).toBe(90); expect(r.power).toBe(250);
  });
  it('More-Data split: no speed, power only; then merge', () => {
    const a = parseIndoorBikeData(dv(0x41, 0, 0xc8, 0x00)); // bit0 set, bit6 power
    expect(a).toEqual({ power: 200 });
    const b = parseIndoorBikeData(dv(0x00, 0x02, 0x00, 0x00, 0x8c)); // flags 0x0200: speed then HR
    expect(b).toEqual({ speedKph: 0, hr: 0x8c });
    expect({ ...a, ...b }).toEqual({ power: 200, speedKph: 0, hr: 140 });
  });
  it('with resistance, energy, HR, elapsed', () => {
    const flags = 0x1 | 0x20 | 0x100 | 0x200 | 0x800; // no speed
    const r = parseIndoorBikeData(dv(flags & 0xff, flags >> 8, 0x0a, 0x00, 0x64, 0x00, 0x2c, 0x01, 0x05, 0x96, 0x3c, 0x00));
    expect(r).toEqual({ resistanceLevel: 10, energyKcal: 100, energyPerHour: 300, energyPerMin: 5, hr: 150, elapsedS: 60 });
  });
  it('negative power and truncation', () => {
    expect(parseIndoorBikeData(dv(0x41, 0, 0xff, 0xff)).power).toBe(-1);
    expect(parseIndoorBikeData(dv(0x44, 0, 0xe8, 0x03, 0xb4))).toEqual({ speedKph: 10 });
    expect(parseIndoorBikeData(dv(0x00))).toEqual({});
  });
  it('distance uint24', () => {
    expect(parseIndoorBikeData(dv(0x11, 0, 0x01, 0x02, 0x01)).distanceM).toBe(0x010201);
  });
});

describe('encoders', () => {
  it('sim test vector', () => {
    expect([...encodeSetSim(5.25, 0, 0.004, 0.51)]).toEqual([0x11, 0, 0, 0x0d, 0x02, 0x28, 0x33]);
  });
  it('negative grade', () => { expect([...encodeSetSim(-2)].slice(3, 5)).toEqual([0x38, 0xff]); });
  it('power', () => { expect([...encodeSetPower(250)]).toEqual([0x05, 0xfa, 0x00]); });
  it('resistance both forms', () => {
    expect([...encodeSetResistance(100, 'u8')]).toEqual([0x04, 100]);
    expect([...encodeSetResistance(300, 's16')]).toEqual([0x04, 0x2c, 0x01]);
    expect([...encodeSetResistance(999, 'u8')]).toEqual([0x04, 255]);
  });
  it('control/start', () => { expect([...encodeRequestControl()]).toEqual([0]); expect([...encodeStart()]).toEqual([7]); });
});

describe('responses and ranges', () => {
  it('parses response', () => {
    expect(parseControlPointResponse(dv(0x80, 0x05, 0x01))).toMatchObject({ requestOpcode: 5, result: 1, ok: true });
    expect(parseControlPointResponse(dv(0x80, 0x05, 0x05))!.ok).toBe(false);
    expect(parseControlPointResponse(dv(0x01, 0x05, 0x01))).toBeNull();
    expect(parseControlPointResponse(dv(0x80, 0x05))).toBeNull();
  });
  it('ranges', () => {
    const r = parseResistanceRange(dv(0, 0, 0xe8, 0x03, 0x0a, 0x00))!;
    expect(r[0]).toBe(0); expect(r[1]).toBeCloseTo(100); expect(r[2]).toBeCloseTo(1);
    expect(parsePowerRange(dv(0, 0, 0xe8, 0x07, 1, 0))).toEqual([0, 2024, 1]);
    expect(parseResistanceRange(dv(0, 0))).toBeUndefined();
    expect(resistancePctToRaw(50, [0, 100, 1])).toBe(500);
    expect(resistancePctToRaw(150, [0, 10, 0.1])).toBe(100);
  });
});

describe('ControlPointQueue', () => {
  const setup = () => {
    const writes: number[][] = [];
    const q = new ControlPointQueue(async b => { writes.push([...b]); }, 50);
    return { q, writes };
  };
  const tick = () => new Promise(r => setTimeout(r, 0));
  it('serializes and coalesces per opcode', async () => {
    const { q, writes } = setup();
    const p1 = q.send(encodeSetSim(1)); // goes out immediately
    const p2 = q.send(encodeSetPower(100));
    const p3 = q.send(encodeSetPower(200));
    const p4 = q.send(encodeSetSim(3));
    await tick();
    expect(writes.length).toBe(1);
    expect((await p2)).toMatchObject({ coalesced: true });
    q.onIndication(dv(0x80, 0x11, 1)); expect(await p1).toMatchObject({ ok: true });
    await tick();
    // queue order: setPower(200) then setSim(3)
    expect(writes.map(w => w[0])).toEqual([0x11, 0x05]);
    q.onIndication(dv(0x80, 0x05, 1)); expect(await p3).toMatchObject({ ok: true });
    await tick();
    expect(writes.map(w => w[0])).toEqual([0x11, 0x05, 0x11]);
    expect(writes[2][3]).toBe(3 * 100 & 0xff);
    q.onIndication(dv(0x80, 0x11, 1)); expect(await p4).toMatchObject({ ok: true });
  });
  it('times out and continues', async () => {
    const { q, writes } = setup();
    const p1 = q.send(encodeSetPower(100)); const p2 = q.send(encodeSetSim(0));
    expect(await p1).toMatchObject({ ok: false, timeout: true });
    await tick(); expect(writes.length).toBe(2);
    q.onIndication(dv(0x80, 0x11, 1)); expect(await p2).toMatchObject({ ok: true });
  });
  it('ignores mismatched indications; reset fails all', async () => {
    const { q } = setup();
    const p = q.send(encodeSetPower(100)); await tick();
    q.onIndication(dv(0x80, 0x11, 1));
    q.reset('x');
    expect(await p).toMatchObject({ ok: false, error: 'x' });
  });
});

describe('reconnect', () => {
  it('backoff schedule', () => { expect([0, 1, 2, 3, 4, 5, 9].map(backoffDelayS)).toEqual([1, 2, 4, 8, 15, 15, 15]); });
  it('retries until success', async () => {
    const delays: number[] = []; let n = 0;
    const ok = await reconnectLoop({
      cancelled: () => false, sleep: async ms => { delays.push(ms); },
      connect: async () => { if (++n < 4) throw new Error('no'); },
    });
    expect(ok).toBe(true); expect(delays).toEqual([1000, 2000, 4000, 8000]);
  });
  it('stops when cancelled', async () => {
    let c = false; const connect = vi.fn(async () => { throw new Error(); });
    const ok = await reconnectLoop({ cancelled: () => c, sleep: async () => { c = true; }, connect });
    expect(ok).toBe(false); expect(connect).not.toHaveBeenCalled();
  });
});
