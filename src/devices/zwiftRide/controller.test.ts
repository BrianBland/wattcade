import { afterEach, expect, it, vi } from 'vitest';
import { ZwiftRideController } from './controller';
import { RideControllerGroup } from './group';
import { RIDE_UUIDS } from './codec';

afterEach(() => vi.useRealTimers());
function ride(id: string) {
  const device = new EventTarget() as BluetoothDevice;
  const asyncCh = new EventTarget() as BluetoothRemoteGATTCharacteristic;
  Object.assign(asyncCh, { uuid: RIDE_UUIDS.async, properties: { notify: true }, startNotifications: vi.fn(async () => asyncCh) });
  const rx = { uuid: RIDE_UUIDS.syncRx, properties: { writeWithoutResponse: true }, writeValueWithoutResponse: vi.fn(async () => {}) };
  const svc = { getCharacteristics: vi.fn(async () => [asyncCh, rx]) };
  const server = { getPrimaryService: vi.fn(async (uuid: BluetoothServiceUUID) => { if (typeof uuid === 'number') throw new Error('optional service unavailable'); return svc; }) };
  Object.assign(device, { id, gatt: { connect: vi.fn(async () => server), disconnect: vi.fn(() => device.dispatchEvent(new Event('gattserverdisconnected'))) } });
  return { device, asyncCh, rx };
}
it('clears controller state on disconnect, recovers once, and stops when canceled', async () => {
  vi.useFakeTimers(); const r = ride('ride-recovery'); const controller = await ZwiftRideController.connectDevice(r.device);
  const states = vi.fn(); controller.onState(states); const group = new RideControllerGroup(); group.add(controller);
  expect(group.count).toBe(1);
  r.device.dispatchEvent(new Event('gattserverdisconnected')); r.device.dispatchEvent(new Event('gattserverdisconnected'));
  expect(group.count).toBe(0); expect(states).toHaveBeenLastCalledWith({ buttons: new Set(), paddleL: 0, paddleR: 0 });
  await vi.advanceTimersByTimeAsync(2000);
  expect(r.device.gatt!.connect).toHaveBeenCalledTimes(2); expect(group.count).toBe(1);
  expect(r.rx.writeValueWithoutResponse).toHaveBeenCalledTimes(2);
  await group.disconnect(); await vi.advanceTimersByTimeAsync(60000);
  expect(r.device.gatt!.connect).toHaveBeenCalledTimes(2);
});
it('closes a failed initial controller connection without orphan retries', async () => {
  vi.useFakeTimers(); const r = ride('ride-failure'); vi.mocked(r.device.gatt!.connect).mockRejectedValue(2);
  const failed = expect(ZwiftRideController.connectDevice(r.device)).rejects.toBe(2);
  await vi.advanceTimersByTimeAsync(10000); await failed;
  r.device.dispatchEvent(new Event('gattserverdisconnected')); await vi.advanceTimersByTimeAsync(60000);
  expect(r.device.gatt!.connect).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
});
it('replaces a failed offline side while retaining the working controller', async () => {
  vi.useFakeTimers(); const left = ride('replace-left'); const right = ride('keep-right');
  const original = vi.mocked(left.device.gatt!.connect).getMockImplementation()!;
  const group = new RideControllerGroup(); await group.addDevice(left.device); await group.addDevice(right.device);
  vi.mocked(left.device.gatt!.connect).mockRejectedValue(2);
  left.device.dispatchEvent(new Event('gattserverdisconnected')); await vi.advanceTimersByTimeAsync(40000);
  expect(group.count).toBe(1); expect(group.ids).toEqual(['replace-left', 'keep-right']);
  vi.mocked(left.device.gatt!.connect).mockImplementation(original); await group.addDevice(left.device);
  expect(group.count).toBe(2); expect(group.ids).toEqual(['keep-right', 'replace-left']);
  expect(right.device.gatt!.connect).toHaveBeenCalledOnce(); expect(right.device.gatt!.disconnect).not.toHaveBeenCalled();
  await group.disconnect();
});
