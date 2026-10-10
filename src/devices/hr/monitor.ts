import type { DeviceSample, HrDevice } from '../../contracts';
import { Attempt, ConnectionLifecycle, bluetoothLog, type ConnectionOptions } from '../bluetooth/lifecycle';
import { parseHeartRate } from './codec';

const HR_SERVICE_FULL = '0000180d-0000-1000-8000-00805f9b34fb';
const HR_CHAR_FULL = '00002a37-0000-1000-8000-00805f9b34fb';

export class HeartRateMonitor implements HrDevice {
  private sampleCbs = new Set<(s: DeviceSample) => void>();
  private statusCbs = new Set<(s: { connected: boolean }) => void>();
  private packets = 0; private lastPacketAt = 0;
  private lifecycle: ConnectionLifecycle;
  private characteristic?: BluetoothRemoteGATTCharacteristic;
  private onDisc = () => this.handleDisconnect();
  private onHr = (e: Event) => {
    if (this.lifecycle.isClosed || e.target !== this.characteristic) return;
    const hr = parseHeartRate((e.target as BluetoothRemoteGATTCharacteristic).value!);
    if (hr === undefined) return;
    if (this.firstBeat) bluetoothLog(`${this.name}: first valid HR packet`);
    this.firstBeat?.(); this.firstBeat = null; this.packets++; this.lastPacketAt = performance.now();
    for (const cb of this.sampleCbs) cb({ hr });
  };
  private logCbs = new Set<(l: string) => void>();
  private firstBeat: (() => void) | null = null;
  private progress: (step: string) => void = () => {};
  private constructor(private device: BluetoothDevice, options: ConnectionOptions) {
    this.lifecycle = new ConnectionLifecycle(device, closing => { this.teardown(); if (closing) device.removeEventListener('gattserverdisconnected', this.onDisc); }, options);
  }
  private teardown() {
    this.characteristic?.removeEventListener('characteristicvaluechanged', this.onHr);
    this.characteristic = undefined; this.firstBeat = null;
  }
  onLog(cb: (line: string) => void) { this.logCbs.add(cb); return () => { this.logCbs.delete(cb); }; }
  private log(l: string) { for (const cb of this.logCbs) cb(l); }
  private lastStep = '';
  private step(s: string) { this.lastStep = s; this.log(s); this.progress(s); }

  /** Must be called from a user gesture. */
  static async connect(onProgress?: (step: string) => void, onLog?: (line: string) => void, options: ConnectionOptions = {}): Promise<HeartRateMonitor> {
    // Bluefy sometimes rejects with a bare non-Error value (e.g. `2`); label it. Try the full-form UUID first, then 16-bit.
    let device: BluetoothDevice | undefined; const errs: string[] = [];
    for (const svc of [HR_SERVICE_FULL, 0x180d] as BluetoothServiceUUID[]) {
      try { device = await navigator.bluetooth.requestDevice({ filters: [{ services: [svc] }] }); break; }
      catch (e) {
        if ((e as { name?: string })?.name === 'NotFoundError') throw e; // user cancelled
        errs.push(`${svc}: ${e instanceof Error ? `${e.name}: ${e.message}` : `rejected with ${String(e)}`}`);
      }
    }
    if (!device) throw new Error('Heart rate picker failed (' + errs.join(' | ') + ')');
    await options.beforeConnect?.();
    return HeartRateMonitor.connectDevice(device, onProgress, onLog, options);
  }

  /** Connect an already-authorized device without opening the picker. */
  static async connectDevice(device: BluetoothDevice, onProgress?: (step: string) => void, onLog?: (line: string) => void, options: ConnectionOptions = {}): Promise<HeartRateMonitor> {
    const m = new HeartRateMonitor(device, options);
    if (onLog) m.onLog(onLog);
    if (onProgress) m.progress = onProgress;
    device.addEventListener('gattserverdisconnected', m.onDisc);
    try {
      await m.lifecycle.connect(a => m.setup(a), step => m.step(step));
    } catch (e) {
      await m.disconnect();
      throw e instanceof Error ? e : new Error(`Heart rate connect failed at "${m.lastStep}": rejected with ${String(e)}`);
    }
    return m;
  }
  stats(): { packets: number; lastPacketAt: number } { return { packets: this.packets, lastPacketAt: this.lastPacketAt }; }
  get bluetoothDevice(): BluetoothDevice { return this.device; }
  get id(): string { return this.device.id; }
  get name(): string { return this.device.name ?? 'HR monitor'; }

  private async setup(a: Attempt): Promise<void> {
    this.teardown();
    const server = await a.step('connecting GATT', () => this.device.gatt!.connect(), 15000);
    const svc = await a.step('finding HR service', () => server.getPrimaryService(HR_SERVICE_FULL));
    const ch = await a.step('finding HR characteristic', () => svc.getCharacteristic(HR_CHAR_FULL));
    this.characteristic = ch;
    const beat = new Promise<void>(resolve => { this.firstBeat = resolve; });
    ch.addEventListener('characteristicvaluechanged', this.onHr);
    // Some Bluefy versions deliver data before resolving startNotifications().
    await a.step('subscribing', () => {
      const subscription = ch.startNotifications();
      void subscription.then(() => a.log('notification subscription resolved'), e => a.log(`notification subscription rejected: ${String(e)}`));
      return Promise.race([subscription.then(() => undefined), beat]);
    });
    await a.step('waiting for heart rate', () => beat, 15000, false);
    a.check(); this.emit(true);
  }
  private handleDisconnect(): void {
    this.lifecycle.disconnected();
    this.teardown(); this.emit(false);
    this.lifecycle.recover(a => this.setup(a), step => this.step(step));
  }
  private emit(connected: boolean) { for (const cb of this.statusCbs) cb({ connected }); }
  onSample(cb: (s: DeviceSample) => void) { this.sampleCbs.add(cb); return () => { this.sampleCbs.delete(cb); }; }
  onStatus(cb: (s: { connected: boolean }) => void) { this.statusCbs.add(cb); return () => { this.statusCbs.delete(cb); }; }
  async disconnect(): Promise<void> {
    this.device.removeEventListener('gattserverdisconnected', this.onDisc);
    await this.lifecycle.close();
    this.emit(false);
  }
}
