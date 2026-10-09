import type { DeviceSample, HrDevice } from '../../contracts';
import { reconnectLoop } from '../ftms/reconnect';
import { setupWithRetry, withTimeout } from '../ftms/steps';
import { parseHeartRate } from './codec';

const STEP_MS = 8000;

const HR_SERVICE_FULL = '0000180d-0000-1000-8000-00805f9b34fb';
const HR_CHAR_FULL = '00002a37-0000-1000-8000-00805f9b34fb';

export class HeartRateMonitor implements HrDevice {
  private sampleCbs = new Set<(s: DeviceSample) => void>();
  private statusCbs = new Set<(s: { connected: boolean }) => void>();
  private packets = 0; private lastPacketAt = 0; private closed = false; private initializing = true;
  private onDisc = () => this.handleDisconnect();
  private onHr = (e: Event) => {
    const hr = parseHeartRate((e.target as BluetoothRemoteGATTCharacteristic).value!);
    if (hr === undefined) return;
    this.firstBeat?.(); this.packets++; this.lastPacketAt = performance.now();
    for (const cb of this.sampleCbs) cb({ hr });
  };
  private logCbs = new Set<(l: string) => void>();
  private firstBeat: (() => void) | null = null;
  private progress: (step: string) => void = () => {};
  private constructor(private device: BluetoothDevice) {}
  onLog(cb: (line: string) => void) { this.logCbs.add(cb); return () => { this.logCbs.delete(cb); }; }
  private log(l: string) { for (const cb of this.logCbs) cb(l); }
  private lastStep = '';
  private step(s: string) { this.lastStep = s; this.log(s); this.progress(s); }

  /** Must be called from a user gesture. */
  static async connect(onProgress?: (step: string) => void, onLog?: (line: string) => void): Promise<HeartRateMonitor> {
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
    return HeartRateMonitor.connectDevice(device, onProgress, onLog);
  }

  /** Connect an already-authorized device without opening the picker. */
  static async connectDevice(device: BluetoothDevice, onProgress?: (step: string) => void, onLog?: (line: string) => void): Promise<HeartRateMonitor> {
    const m = new HeartRateMonitor(device);
    if (onLog) m.onLog(onLog);
    if (onProgress) m.progress = onProgress;
    device.addEventListener('gattserverdisconnected', m.onDisc);
    try {
      await setupWithRetry(() => m.setup(), () => device.gatt?.disconnect(), l => m.log(l));
    } catch (e) {
      await m.disconnect();
      throw e instanceof Error ? e : new Error(`Heart rate connect failed at "${m.lastStep}": rejected with ${String(e)}`);
    } finally { m.initializing = false; m.progress = () => {}; }
    return m;
  }
  stats(): { packets: number; lastPacketAt: number } { return { packets: this.packets, lastPacketAt: this.lastPacketAt }; }
  get bluetoothDevice(): BluetoothDevice { return this.device; }
  get id(): string { return this.device.id; }
  get name(): string { return this.device.name ?? 'HR monitor'; }

  private async setup(): Promise<void> {
    this.step('connecting GATT');
    const server = await withTimeout(this.device.gatt!.connect(), STEP_MS, 'connecting GATT');
    this.step('finding HR service');
    const svc = await withTimeout(server.getPrimaryService(HR_SERVICE_FULL), STEP_MS, 'finding HR service');
    const ch = await withTimeout(svc.getCharacteristic(HR_CHAR_FULL), STEP_MS, 'finding HR characteristic');
    this.step('subscribing');
    // Listener first; on iOS startNotifications can be slow, so a first beat also counts as subscribed.
    const beat = new Promise<void>(r => { this.firstBeat = r; });
    ch.removeEventListener('characteristicvaluechanged', this.onHr);
    ch.addEventListener('characteristicvaluechanged', this.onHr);
    const started = ch.startNotifications().then(() => undefined);
    started.catch(() => {}); // swallow late rejection if the beat won the race
    try { await withTimeout(Promise.race([started, beat]), STEP_MS, 'subscribing'); }
    finally { this.firstBeat = null; }
    this.step('waiting for first beat'); // informational only: not awaited
    this.step('connected');
    this.emit(true);
  }
  private handleDisconnect(): void {
    if (this.initializing) return;
    this.emit(false);
    if (this.closed) return;
    void reconnectLoop({ cancelled: () => this.closed, connect: () => this.setup() });
  }
  private emit(connected: boolean) { for (const cb of this.statusCbs) cb({ connected }); }
  onSample(cb: (s: DeviceSample) => void) { this.sampleCbs.add(cb); return () => { this.sampleCbs.delete(cb); }; }
  onStatus(cb: (s: { connected: boolean }) => void) { this.statusCbs.add(cb); return () => { this.statusCbs.delete(cb); }; }
  async disconnect(): Promise<void> {
    this.closed = true;
    this.device.removeEventListener('gattserverdisconnected', this.onDisc);
    try { this.device.gatt?.disconnect(); } catch { /* ignore */ }
    this.emit(false);
  }
}
