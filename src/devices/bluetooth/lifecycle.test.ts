import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConnectionLifecycle, bluetoothLogText, serializeBluetooth } from './lifecycle';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const flush = () => vi.advanceTimersByTimeAsync(0);
function device(id: string) {
  return { id, name: id, gatt: { disconnect: vi.fn() } } as unknown as BluetoothDevice;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
it('serializes setup across devices while canceling queued work without starting it', async () => {
  const blocked = deferred<void>(); const order: string[] = [];
  const first = new ConnectionLifecycle(device('serial-a'), () => {});
  const second = new ConnectionLifecycle(device('serial-b'), () => {});
  const third = new ConnectionLifecycle(device('serial-c'), () => {});
  const a = first.connect(async () => { order.push('a'); await blocked.promise; });
  const b = second.connect(async () => { order.push('b'); });
  const canceled = expect(third.connect(async () => { order.push('c'); })).rejects.toThrow('canceled');
  await flush(); expect(order).toEqual(['a']);
  await third.close(); blocked.resolve(); await Promise.all([a, b, canceled]);
  expect(order).toEqual(['a', 'b']);
  await first.close(); await second.close();
});
it('runs one recovery sequence for repeated disconnect events and stops after bounded backoff', async () => {
  const life = new ConnectionLifecycle(device('recover'), () => {});
  await life.connect(async () => {});
  const setup = vi.fn(async () => { throw 2; }); const progress = vi.fn();
  life.disconnected(); life.recover(setup, progress); life.recover(setup, progress);
  await vi.advanceTimersByTimeAsync(1000); expect(setup).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(40000);
  expect(setup).toHaveBeenCalledTimes(4);
  expect(progress).toHaveBeenLastCalledWith('Reconnect failed — tap to retry');
  expect(vi.getTimerCount()).toBe(0); await life.close();
});
it('blocks another connect to the same device until a canceled native connect settles', async () => {
  const native = deferred<void>(); const d = device('late-gatt');
  const old = new ConnectionLifecycle(d, () => {}); let published = false;
  const stopped = expect(old.connect(async a => {
    await a.step('connecting GATT', () => native.promise);
    published = true;
  }, undefined, 0)).rejects.toThrow('canceled');
  await flush(); await old.close(); await vi.advanceTimersByTimeAsync(2500); await stopped;
  const next = new ConnectionLifecycle(d, () => {}); const setup = vi.fn(async () => {});
  const connecting = next.connect(setup, undefined, 0);
  await flush(); expect(setup).not.toHaveBeenCalled();
  // An unrelated device is not held indefinitely by a nonconforming bridge.
  await vi.advanceTimersByTimeAsync(5500);
  await expect(connecting).rejects.toThrow('still settling');
  const other = vi.fn(async () => {}); await serializeBluetooth(other); expect(other).toHaveBeenCalledOnce();
  native.resolve(); await flush(); expect(published).toBe(false);
  expect(bluetoothLogText()).toContain('connecting GATT: late completion');
  await next.connect(setup, undefined, 0); expect(setup).toHaveBeenCalledOnce(); await next.close();
});
it('times out native setup, requests disconnect, and preserves numeric bridge errors in logs', async () => {
  const d = device('timeout'); const life = new ConnectionLifecycle(d, () => {});
  const native = deferred<void>();
  const failed = expect(life.connect(a => a.step('connecting GATT', () => native.promise, 1000), undefined, 0)).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(3500); await failed;
  expect(d.gatt!.disconnect).toHaveBeenCalledOnce();
  native.resolve(); await flush(); await life.close();
  const numeric = new ConnectionLifecycle(device('numeric'), () => {});
  const rejected = expect(numeric.connect(a => a.step('connecting GATT', async () => { throw 2; }), undefined, 0)).rejects.toBe(2);
  await vi.advanceTimersByTimeAsync(500); await rejected;
  expect(bluetoothLogText()).toContain('rejected with 2 (number)'); await numeric.close();
});
