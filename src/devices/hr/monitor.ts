import type { DeviceSample, HrDevice } from '../../contracts';
import { reconnectLoop } from '../ftms/reconnect';
import { parseHeartRate } from './codec';

export class HeartRateMonitor implements HrDevice {
  private sampleCbs = new Set<(s: DeviceSample) => void>();
  private statusCbs = new Set<(s: { connected: boolean }) => void>();
  private packets = 0; private lastPacketAt = 0; private closed = false;
  private onDisc = () => this.handleDisconnect();
  private onHr = (e: Event) => {
    const hr = parseHeartRate((e.target as BluetoothRemoteGATTCharacteristic).value!);
    if (hr === undefined) return;
    this.packets++; this.lastPacketAt = performance.now();
    for (const cb of this.sampleCbs) cb({ hr });
  };
  private constructor(private device: BluetoothDevice) {}

  /** Must be called from a user gesture. */
  static async connect(): Promise<HeartRateMonitor> {
    const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [0x180d] }] });
    const m = new HeartRateMonitor(device);
    device.addEventListener('gattserverdisconnected', m.onDisc);
    await m.setup();
    return m;
  }
  stats(): { packets: number; lastPacketAt: number } { return { packets: this.packets, lastPacketAt: this.lastPacketAt }; }
  get name(): string { return this.device.name ?? 'HR monitor'; }

  private async setup(): Promise<void> {
    const server = await this.device.gatt!.connect();
    const svc = await server.getPrimaryService(0x180d);
    const ch = await svc.getCharacteristic(0x2a37);
    ch.addEventListener('characteristicvaluechanged', this.onHr);
    await ch.startNotifications();
    this.emit(true);
  }
  private handleDisconnect(): void {
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
