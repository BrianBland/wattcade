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
  const failed = expect(HeartRateMonitor.connectDevice(device)).rejects.toThrow('watch unavailable');
  await vi.advanceTimersByTimeAsync(10000); await failed;
  expect(connect).toHaveBeenCalledTimes(2); // one existing whole-setup retry
  expect(vi.getTimerCount()).toBe(0);
  device.dispatchEvent(new Event('gattserverdisconnected'));
  await vi.advanceTimersByTimeAsync(30000);
  expect(connect).toHaveBeenCalledTimes(2);
});

function liveWatch(id: string) {
  const device = new EventTarget() as BluetoothDevice;
  const ch = new EventTarget() as BluetoothRemoteGATTCharacteristic;
  const beat = () => {
    Object.assign(ch, { value: new DataView(Uint8Array.of(0, 75).buffer) });
    ch.dispatchEvent(new Event('characteristicvaluechanged'));
  };
  Object.assign(ch, { startNotifications: vi.fn(async () => { beat(); return ch; }) });
  const svc = { getCharacteristic: vi.fn(async () => ch) };
  const server = { getPrimaryService: vi.fn(async () => svc) };
  Object.assign(device, { id, gatt: { connect: vi.fn(async () => server), disconnect: vi.fn(() => device.dispatchEvent(new Event('gattserverdisconnected'))) } });
  return { device, ch, beat, server };
}
it('requires a valid HR packet and removes old subscriptions when reconnecting', async () => {
  vi.useFakeTimers(); const w = liveWatch('active');
  const monitor = await HeartRateMonitor.connectDevice(w.device);
  const samples = vi.fn(); monitor.onSample(samples);
  w.beat(); expect(samples).toHaveBeenCalledTimes(1);
  w.device.dispatchEvent(new Event('gattserverdisconnected'));
  w.device.dispatchEvent(new Event('gattserverdisconnected'));
  w.beat(); expect(samples).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(2000);
  expect(w.device.gatt!.connect).toHaveBeenCalledTimes(2);
  w.beat(); expect(samples).toHaveBeenCalledTimes(3); // one first beat, one explicit beat
  await monitor.disconnect(); w.beat(); expect(samples).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(60000); expect(w.device.gatt!.connect).toHaveBeenCalledTimes(2);
});
it('does not report connected when subscription succeeds but the watch sends no heart rate', async () => {
  vi.useFakeTimers(); const w = liveWatch('silent');
  vi.mocked(w.ch.startNotifications).mockResolvedValue(w.ch);
  const failed = expect(HeartRateMonitor.connectDevice(w.device)).rejects.toThrow('waiting for heart rate timed out');
  await vi.advanceTimersByTimeAsync(40000); await failed;
  expect(vi.getTimerCount()).toBe(0);
});
it('does not publish a late recovery result after disconnecting the monitor', async () => {
  vi.useFakeTimers(); const w = liveWatch('closed-recovery');
  const monitor = await HeartRateMonitor.connectDevice(w.device); const status = vi.fn(); monitor.onStatus(status);
  let resolve!: (server: BluetoothRemoteGATTServer) => void;
  vi.mocked(w.device.gatt!.connect).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  w.device.dispatchEvent(new Event('gattserverdisconnected'));
  await vi.advanceTimersByTimeAsync(2000); await monitor.disconnect();
  resolve(w.server as unknown as BluetoothRemoteGATTServer);
  await vi.advanceTimersByTimeAsync(3000);
  expect(status.mock.calls.every(([s]) => !s.connected)).toBe(true);
  expect(w.server.getPrimaryService).toHaveBeenCalledTimes(1);
});
