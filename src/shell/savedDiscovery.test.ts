import { afterEach, expect, it, vi } from 'vitest';
import { discoverSavedDevice } from './savedDiscovery';

afterEach(() => vi.useRealTimers());
function watch() {
  const device = new EventTarget() as BluetoothDevice;
  let signal: AbortSignal | undefined;
  const watchAdvertisements = vi.fn().mockImplementation((opts: { signal: AbortSignal }) => {
    signal = opts.signal; return Promise.resolve();
  });
  Object.assign(device, { watchAdvertisements });
  return { device, watchAdvertisements, signal: () => signal! };
}
it('waits for an advertisement, then aborts scanning and removes the listener', async () => {
  const w = watch(); const progress = vi.fn();
  const remove = vi.spyOn(w.device, 'removeEventListener');
  const done = vi.fn(); const pending = discoverSavedDevice(w.device, progress).then(done);
  await Promise.resolve(); expect(done).not.toHaveBeenCalled();
  w.device.dispatchEvent(new Event('advertisementreceived')); await pending;
  expect(progress).toHaveBeenCalledWith('Waiting for device advertisement');
  expect(w.signal().aborted).toBe(true); expect(remove).toHaveBeenCalledOnce();
});
it('times out an offline watch and cleans up scanning', async () => {
  vi.useFakeTimers(); const w = watch();
  const remove = vi.spyOn(w.device, 'removeEventListener');
  const result = expect(discoverSavedDevice(w.device, () => {})).rejects.toThrow('waiting for device advertisement');
  await vi.advanceTimersByTimeAsync(10000); await result;
  expect(w.signal().aborted).toBe(true); expect(remove).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it('cleans up and preserves a bare browser rejection', async () => {
  const w = watch(); w.watchAdvertisements.mockRejectedValueOnce(2);
  await expect(discoverSavedDevice(w.device, () => {})).rejects.toBe(2);
  expect(w.watchAdvertisements.mock.calls[0][0].signal.aborted).toBe(true);
});
it('skips discovery when the browser does not expose watchAdvertisements', async () => {
  const progress = vi.fn();
  await discoverSavedDevice({ id: 'watch' } as BluetoothDevice, progress);
  expect(progress).not.toHaveBeenCalled();
});
