// Optional CORE native shifting channel on the FTMS trainer's existing GATT connection.
import { Attempt } from '../bluetooth/lifecycle';
import { withTimeout } from '../ftms/steps';
import { SHIFT_SERVICES, SHIFT_CHARS, encodeShiftHello, encodeGear } from './codec';

export const TRAINER_REQUEST_OPTIONS: RequestDeviceOptions = {
  filters: [{ services: ['00001826-0000-1000-8000-00805f9b34fb'] }],
  optionalServices: [...SHIFT_SERVICES],
};

export class NativeShifting {
  private closed = false;
  private listeners: Array<() => void> = [];
  private constructor(private writer: BluetoothRemoteGATTCharacteristic) {}
  static async discover(server: BluetoothRemoteGATTServer, a: Attempt, log: (s: string) => void): Promise<NativeShifting | null> {
    let service: BluetoothRemoteGATTService | undefined;
    for (const uuid of SHIFT_SERVICES) {
      try { service = await a.step('finding native shifting service', () => server.getPrimaryService(uuid)); break; }
      catch (e) { a.check(); if (/timed out/i.test(String(e))) throw e; }
    }
    if (!service) { log('Native shifting unavailable; using gradient gears. Select the trainer again to grant native service access if needed.'); return null; }
    // Finding the service is insufficient: require its exact command + response characteristics.
    const writer = await a.step('finding native shift writer', () => service!.getCharacteristic(SHIFT_CHARS.write));
    if (!writer.properties.write && !writer.properties.writeWithoutResponse) throw new Error('Native shift channel is not writable');
    const native = new NativeShifting(writer);
    try {
      const response = await a.step('finding native shift response', () => service!.getCharacteristic(SHIFT_CHARS.response));
      const changed = () => { if (!native.closed && response.value) log('Native shift response: ' + [...new Uint8Array(response.value.buffer, response.value.byteOffset, response.value.byteLength)].map(b => b.toString(16).padStart(2, '0')).join(' ')); };
      response.addEventListener('characteristicvaluechanged', changed);
      native.listeners.push(() => response.removeEventListener('characteristicvaluechanged', changed));
      await a.step('subscribing native shifting', () => response.startNotifications());
      await a.step('enabling native shifting', () => native.write(encodeShiftHello()));
      await a.step('setting initial native gear 12', () => native.setGear(12));
      log('Native shifting enabled: 24 gears, starting at 12');
      return native;
    } catch (e) { native.close(); throw e; }
  }
  async setGear(gear: number): Promise<void> { await this.write(encodeGear(gear)); }
  private async write(bytes: Uint8Array): Promise<void> {
    if (this.closed) throw new Error('Native shifting closed');
    const data = bytes as BufferSource;
    const work = this.writer.properties.write
      ? (typeof this.writer.writeValueWithResponse === 'function' ? this.writer.writeValueWithResponse(data) : this.writer.writeValue(data))
      : this.writer.writeValueWithoutResponse(data);
    await withTimeout(work, 5000, 'native shifting write');
    if (this.closed) throw new Error('Native shifting closed');
  }
  close(): void { this.closed = true; this.listeners.splice(0).forEach(fn => fn()); }
}
