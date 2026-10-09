import { withTimeout } from '../devices/ftms/steps';

/** getDevices() grants can need fresh discovery before GATT, notably after a Bluefy reload. */
export async function discoverSavedDevice(device: BluetoothDevice, progress: (step: string) => void): Promise<void> {
  // Browsers without advertisement support retain the existing direct GATT path.
  if (typeof device.watchAdvertisements !== 'function') return;
  progress('Waiting for device advertisement');
  const abort = new AbortController();
  let onAdvertisement: EventListener = () => {};
  const received = new Promise<void>(resolve => {
    onAdvertisement = () => resolve();
    device.addEventListener('advertisementreceived', onAdvertisement, { once: true });
  });
  try {
    await withTimeout(Promise.all([
      device.watchAdvertisements({ signal: abort.signal }), received,
    ]), 10000, 'waiting for device advertisement');
    progress('Connecting GATT');
  } finally {
    device.removeEventListener('advertisementreceived', onAdvertisement);
    abort.abort();
  }
}
