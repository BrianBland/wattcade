import { afterEach, expect, it, vi } from 'vitest';
import { HeartRateMonitor } from './monitor';

afterEach(() => vi.useRealTimers());
it('stops a failed saved-watch setup without starting a background reconnect loop', async () => {
  vi.useFakeTimers();
  const device = new EventTarget() as BluetoothDevice;
  const server = { getPrimaryService: vi.fn().mockRejectedValue(new Error('watch unavailable')) };
  const connect = vi.fn().mockResolvedValue(server);
  const disconnect = vi.fn(() => device.dispatchEvent(new Event('gattserverdisconnected')));
  Object.assign(device, { id: 'offline-watch', gatt: { connect, disconnect } });
  await expect(HeartRateMonitor.connectDevice(device)).rejects.toThrow('watch unavailable');
  expect(connect).toHaveBeenCalledTimes(2); // one existing whole-setup retry
  expect(vi.getTimerCount()).toBe(0);
  device.dispatchEvent(new Event('gattserverdisconnected'));
  await vi.advanceTimersByTimeAsync(30000);
  expect(connect).toHaveBeenCalledTimes(2);
});
