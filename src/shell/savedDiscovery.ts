import { serializeBluetooth, ConnectionCancelled, bluetoothLog } from '../devices/bluetooth/lifecycle';
import { withTimeout } from '../devices/ftms/steps';

/** getDevices() grants can need fresh discovery before GATT, notably after a Bluefy reload. */
export async function discoverSavedDevice(device: BluetoothDevice, progress: (step: string) => void, signal?: AbortSignal): Promise<void> {
  return serializeBluetooth(() => discover(device, progress, signal), signal);
}
async function discover(device: BluetoothDevice, progress: (step: string) => void, signal?: AbortSignal): Promise<void> {
  // Browsers without advertisement support retain the existing direct GATT path.
  if (typeof device.watchAdvertisements !== 'function') return;
  progress('Waiting for device advertisement');
  const abort = new AbortController();
  let rejectAbort: (e: Error) => void = () => {};
  const canceled = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const onCancel = () => { abort.abort(); rejectAbort(new ConnectionCancelled()); };
  signal?.addEventListener('abort', onCancel, { once: true });
  if (signal?.aborted) onCancel();
  bluetoothLog(`${device.name ?? 'BLE'} [${device.id}]: discovery started`);
  let onAdvertisement: EventListener = () => {};
  const received = new Promise<void>(resolve => {
    onAdvertisement = () => resolve();
    device.addEventListener('advertisementreceived', onAdvertisement, { once: true });
  });
  try {
    await withTimeout(Promise.race([canceled, Promise.all([
      device.watchAdvertisements({ signal: abort.signal }), received,
    ])]), 10000, 'waiting for device advertisement');
    bluetoothLog(`${device.name ?? 'BLE'}: advertisement received`);
    progress('Connecting GATT');
  } finally {
    signal?.removeEventListener('abort', onCancel);
    device.removeEventListener('advertisementreceived', onAdvertisement);
    abort.abort();
  }
}
