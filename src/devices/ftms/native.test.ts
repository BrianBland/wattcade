import { afterEach, expect, it, vi } from 'vitest';
import { FtmsTrainer } from './trainer';
import { CHAR, FTMS_SERVICE, OP } from './codec';
import { SHIFT_CHARS, SHIFT_SERVICES, encodeGear, encodeShiftHello } from '../zwiftTrainer/codec';

afterEach(() => vi.useRealTimers());
function fixture(supported = true) {
  const device = new EventTarget() as BluetoothDevice;
  const cp = new EventTarget() as BluetoothRemoteGATTCharacteristic;
  const bike = new EventTarget(); const response = new EventTarget();
  Object.assign(cp, { startNotifications: async () => cp });
  Object.assign(bike, { startNotifications: async () => bike });
  Object.assign(response, { startNotifications: async () => response });
  const order: string[] = [];
  const ftmsWrite = vi.fn(async (bytes: Uint8Array) => {
    order.push(`ftms:${bytes[0]}`);
    Object.assign(cp, { value: new DataView(Uint8Array.of(0x80, bytes[0], 1).buffer) });
    cp.dispatchEvent(new Event('characteristicvaluechanged'));
  });
  Object.assign(cp, { writeValueWithResponse: ftmsWrite });
  const nativeWrite = vi.fn(async (_bytes: Uint8Array) => { order.push('native'); });
  const writer = { properties: { write: true }, writeValueWithResponse: nativeWrite };
  const native = { getCharacteristic: async (uuid: string) => {
    if (uuid === SHIFT_CHARS.write) return writer;
    if (uuid === SHIFT_CHARS.response) return response;
    throw new Error('absent characteristic');
  } };
  const ftms = { getCharacteristic: async (uuid: BluetoothCharacteristicUUID) => {
    if (uuid === CHAR.controlPoint) return cp;
    if (uuid === CHAR.indoorBikeData) return bike;
    throw new Error('absent range');
  } };
  const server = { getPrimaryService: async (uuid: BluetoothServiceUUID) => {
    if (uuid === FTMS_SERVICE) return ftms;
    if (supported && SHIFT_SERVICES.includes(uuid as typeof SHIFT_SERVICES[number])) return native;
    throw new Error('service unavailable / permission not granted');
  } };
  const connect = vi.fn(async () => server);
  const disconnect = vi.fn(() => device.dispatchEvent(new Event('gattserverdisconnected')));
  Object.assign(device, { id: 'native-core', name: 'KICKR CORE', gatt: { connect, disconnect } });
  return { device, nativeWrite, ftmsWrite, order, connect, disconnect, response };
}
it('initializes native gearing on the FTMS connection, applies hills before ratios, and leaves ERG alone', async () => {
  const f = fixture(); const trainer = await FtmsTrainer.connectDevice(f.device);
  expect(trainer.capabilities.nativeShifting).toBe(true);
  expect(f.nativeWrite.mock.calls.map(([b]) => [...b])).toEqual([[...encodeShiftHello()], [...encodeGear(12)]]);
  f.order.length = 0; f.ftmsWrite.mockClear(); f.nativeWrite.mockClear();
  expect((await trainer.apply({ mode: 'sim', gradePct: 2, virtualGear: 14 })).ok).toBe(true);
  expect(f.order).toEqual(['ftms:17', 'native']);
  expect([...f.nativeWrite.mock.calls[0][0]]).toEqual([...encodeGear(14)]);
  await trainer.apply({ mode: 'sim', gradePct: 2, virtualGear: 15 });
  expect(f.ftmsWrite).toHaveBeenCalledTimes(1); expect(f.nativeWrite).toHaveBeenCalledTimes(2);
  await trainer.apply({ mode: 'erg', watts: 150 });
  expect(f.ftmsWrite.mock.calls.at(-1)![0][0]).toBe(OP.setPower); expect(f.nativeWrite).toHaveBeenCalledTimes(2);
  await trainer.apply({ mode: 'sim', gradePct: 2, virtualGear: 15 });
  expect(f.order.slice(-2)).toEqual(['ftms:17', 'native']); expect(f.nativeWrite).toHaveBeenCalledTimes(3);
  await trainer.disconnect();
});
it('retains FTMS-only support when native services are absent or not authorized', async () => {
  const f = fixture(false); const trainer = await FtmsTrainer.connectDevice(f.device);
  expect(trainer.capabilities.nativeShifting).toBe(false); expect(f.nativeWrite).not.toHaveBeenCalled();
  expect(await trainer.apply({ mode: 'sim', gradePct: 2 })).toMatchObject({ ok: true });
  expect(f.ftmsWrite.mock.calls.at(-1)![0][0]).toBe(OP.setSim);
  await trainer.disconnect();
});
it('reconnects in FTMS-only mode if native setup fails, after cleaning up the failed session', async () => {
  vi.useFakeTimers(); const f = fixture();
  f.nativeWrite.mockRejectedValueOnce(new Error('handshake rejected'));
  const connecting = FtmsTrainer.connectDevice(f.device);
  await vi.advanceTimersByTimeAsync(4000);
  const trainer = await connecting;
  expect(f.connect).toHaveBeenCalledTimes(2); expect(f.disconnect).toHaveBeenCalled();
  expect(trainer.capabilities.nativeShifting).toBe(false);
  expect(await trainer.apply({ mode: 'sim', gradePct: 0 })).toMatchObject({ ok: true });
  await trainer.disconnect();
});
it('coalesces rapid shifts and never overlaps FTMS and native writes', async () => {
  const f = fixture(); const trainer = await FtmsTrainer.connectDevice(f.device);
  let release!: () => void;
  f.nativeWrite.mockImplementationOnce(async () => { await new Promise<void>(r => { release = r; }); });
  const first = trainer.apply({ mode: 'sim', gradePct: 2, virtualGear: 13 });
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  const discarded = trainer.apply({ mode: 'sim', gradePct: 2, virtualGear: 14 });
  const last = trainer.apply({ mode: 'sim', gradePct: 2, virtualGear: 15 });
  expect(await discarded).toEqual({ ok: true, detail: 'superseded' });
  release(); await first; await last;
  expect([...f.nativeWrite.mock.calls.at(-1)![0]]).toEqual([...encodeGear(15)]);
  expect(f.nativeWrite.mock.calls.some(([b]) => [...b].join() === [...encodeGear(14)].join())).toBe(false);
  await trainer.disconnect();
});
it('restores native setup on reconnect and does not send queued commands from the old connection', async () => {
  vi.useFakeTimers(); const f = fixture(); const trainer = await FtmsTrainer.connectDevice(f.device);
  f.device.dispatchEvent(new Event('gattserverdisconnected'));
  expect(await trainer.apply({ mode: 'sim', gradePct: 5, virtualGear: 24 })).toMatchObject({ ok: false });
  await vi.advanceTimersByTimeAsync(3000);
  expect(f.connect).toHaveBeenCalledTimes(2);
  expect(f.nativeWrite.mock.calls.map(([b]) => [...b])).toEqual([[...encodeShiftHello()], [...encodeGear(12)], [...encodeShiftHello()], [...encodeGear(12)]]);
  await trainer.apply({ mode: 'sim', gradePct: 2, virtualGear: 14 });
  expect([...f.nativeWrite.mock.calls.at(-1)![0]]).toEqual([...encodeGear(14)]);
  await trainer.disconnect();
});
it('does not let a late shift from an old connection disconnect the recovered trainer', async () => {
  vi.useFakeTimers(); const f = fixture(); const trainer = await FtmsTrainer.connectDevice(f.device);
  let release!: () => void;
  f.nativeWrite.mockImplementationOnce(async () => { await new Promise<void>(r => { release = r; }); });
  const old = trainer.apply({ mode: 'sim', gradePct: 2, virtualGear: 14 });
  await vi.advanceTimersByTimeAsync(0); expect(release).toBeTypeOf('function');
  f.device.dispatchEvent(new Event('gattserverdisconnected'));
  await vi.advanceTimersByTimeAsync(3000); expect(f.connect).toHaveBeenCalledTimes(2);
  const current = trainer.apply({ mode: 'sim', gradePct: 2, virtualGear: 17 });
  release(); expect(await old).toMatchObject({ ok: false }); expect(await current).toMatchObject({ ok: true });
  expect(f.disconnect).not.toHaveBeenCalled();
  expect([...f.nativeWrite.mock.calls.at(-1)![0]]).toEqual([...encodeGear(17)]);
  await trainer.disconnect();
});
