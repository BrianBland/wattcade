import { afterEach, expect, it, vi } from 'vitest';
import { FtmsTrainer } from './trainer';

afterEach(() => vi.useRealTimers());
it('does not leave a recovering trainer behind when the factory fails', async () => {
  vi.useFakeTimers();
  const device = new EventTarget() as BluetoothDevice;
  const connect = vi.fn().mockRejectedValue(2);
  Object.assign(device, { id: 'failed-trainer', gatt: { connect, disconnect: vi.fn(() => device.dispatchEvent(new Event('gattserverdisconnected'))) } });
  const failed = expect(FtmsTrainer.connectDevice(device)).rejects.toBe(2);
  await vi.advanceTimersByTimeAsync(10000); await failed;
  expect(connect).toHaveBeenCalledTimes(2);
  device.dispatchEvent(new Event('gattserverdisconnected'));
  await vi.advanceTimersByTimeAsync(60000);
  expect(connect).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
});
it('cancels a pending native connection without proceeding to services when it settles late', async () => {
  vi.useFakeTimers(); const scope = new AbortController();
  const device = new EventTarget() as BluetoothDevice;
  let resolve!: (s: BluetoothRemoteGATTServer) => void;
  const connect = vi.fn(() => new Promise<BluetoothRemoteGATTServer>(r => { resolve = r; }));
  const server = { getPrimaryService: vi.fn() } as unknown as BluetoothRemoteGATTServer;
  Object.assign(device, { id: 'cancel-trainer', gatt: { connect, disconnect: vi.fn(() => device.dispatchEvent(new Event('gattserverdisconnected'))) } });
  const failed = expect(FtmsTrainer.connectDevice(device, undefined, undefined, { signal: scope.signal })).rejects.toThrow('canceled');
  await vi.advanceTimersByTimeAsync(0); scope.abort(); resolve(server);
  await vi.advanceTimersByTimeAsync(1000); await failed;
  expect(server.getPrimaryService).not.toHaveBeenCalled(); expect(connect).toHaveBeenCalledOnce();
});
it('does not publish connected from an in-flight control request after disconnect', async () => {
  vi.useFakeTimers();
  const device = new EventTarget() as BluetoothDevice;
  const cp = new EventTarget() as BluetoothRemoteGATTCharacteristic;
  const bike = new EventTarget() as BluetoothRemoteGATTCharacteristic;
  Object.assign(cp, { startNotifications: async () => cp, writeValueWithResponse: vi.fn(async (bytes: Uint8Array) => {
    Object.assign(cp, { value: new DataView(Uint8Array.of(0x80, bytes[0], 0x05).buffer) });
    cp.dispatchEvent(new Event('characteristicvaluechanged'));
  }) });
  Object.assign(bike, { startNotifications: async () => bike });
  const { CHAR } = await import('./codec');
  const svc = { getCharacteristic: async (uuid: BluetoothCharacteristicUUID) => {
    if (uuid === CHAR.controlPoint) return cp;
    if (uuid === CHAR.indoorBikeData) return bike;
    throw new Error('optional range absent');
  } };
  Object.assign(device, { id: 'control-close', gatt: { connect: async () => ({ getPrimaryService: async () => svc }), disconnect: () => device.dispatchEvent(new Event('gattserverdisconnected')) } });
  const trainer = await FtmsTrainer.connectDevice(device); const status = vi.fn(); trainer.onStatus(status);
  vi.mocked(cp.writeValueWithResponse).mockImplementationOnce(async () => {}); // no indication yet
  const applying = trainer.apply({ mode: 'erg', watts: 150 });
  await trainer.disconnect(); expect(await applying).toEqual({ ok: false, detail: 'not connected' });
  expect(status.mock.calls.every(([s]) => !s.connected)).toBe(true); expect(vi.getTimerCount()).toBe(0);
});
