// Thin Web Bluetooth glue for the Zwift Ride V1 controller. Byte logic lives in codec.ts.
import type { ControllerDevice, ControllerRawState } from '../../contracts';
import {
  parseRideMessage, PolarityDetector, firmwareAtLeast, pickCharacteristics, startsWithRideOn,
  RIDE_ON, RIDE_UUIDS, type CharInfo,
} from './codec';

type StatusCb = (s: { connected: boolean; firmware?: string; battery?: number; warning?: string }) => void;

// Bluefy rejects some request shapes immediately with a bare non-Error value (e.g. `2`). A plain name filter works but
// grants no services (getPrimaryService then fails "Unable to find service that satisfies request options"), and numeric
// optionalServices [0xfc82] were rejected, so try the full 128-bit string forms first. Rejects are immediate so the gesture survives.
export const RIDE_SERVICE_FC82 = '0000fc82-0000-1000-8000-00805f9b34fb';
export const RIDE_SERVICE_128 = '00000001-19ca-4651-86e5-fa29dcdd09d1';
export const RIDE_REQUEST_OPTIONS: RequestDeviceOptions = {
  filters: [{ namePrefix: 'Zwift' }], optionalServices: [RIDE_SERVICE_FC82, RIDE_SERVICE_128],
};
const RIDE_FALLBACK_OPTIONS: RequestDeviceOptions[] = [
  { filters: [{ namePrefix: 'Zwift' }], optionalServices: [RIDE_SERVICE_FC82] },
  { filters: [{ namePrefix: 'Zwift' }], optionalServices: [RIDE_SERVICE_128] },
  { filters: [{ namePrefix: 'Zwift' }] },
];
export async function requestRideDevice(): Promise<BluetoothDevice> {
  const errs: string[] = [];
  for (const opts of [RIDE_REQUEST_OPTIONS, ...RIDE_FALLBACK_OPTIONS]) {
    try { return await navigator.bluetooth.requestDevice(opts); }
    catch (e) {
      if ((e as { name?: string })?.name === 'NotFoundError') throw e; // user cancelled the picker
      errs.push(`${JSON.stringify(opts)} -> ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
    }
  }
  throw new Error('Could not open the Bluetooth picker. ' + errs.join(' | '));
}
const RIDE_SERVICE_CANDIDATES: BluetoothServiceUUID[] = [RIDE_SERVICE_FC82, RIDE_SERVICE_128];
const FW_WARNING = 'Ride V2 firmware (>=1.3.0) is locked to Zwift and may not work. Do not update the controller firmware through Zwift.';
const BACKOFF_S = [1, 2, 4, 8, 15];

export class ZwiftRideController implements ControllerDevice {
  private stateCbs = new Set<(s: ControllerRawState) => void>();
  private statusCbs = new Set<StatusCb>();
  private logCbs = new Set<(line: string) => void>();
  private polarity = new PolarityDetector();
  private paddles: [number, number] = [0, 0];
  private buttons: ControllerRawState['buttons'] = new Set();
  private packets = 0; private lastPacketAt = 0; private lastStatusHex = '';
  private firmware?: string; private battery?: number; private warning?: string;
  private stopped = false; private reconnecting = false;
  private server?: BluetoothRemoteGATTServer;
  private syncRx?: BluetoothRemoteGATTCharacteristic;
  private cleanups: Array<() => void> = [];

  private constructor(readonly device: BluetoothDevice) {
    device.addEventListener('gattserverdisconnected', this.onDisconnected);
  }

  /** Must be called from a user gesture. */
  static async connect(): Promise<ZwiftRideController> {
    return ZwiftRideController.connectDevice(await requestRideDevice());
  }
  static async connectDevice(device: BluetoothDevice): Promise<ZwiftRideController> {
    const c = new ZwiftRideController(device);
    try { await c.setup(); } catch (e) { await c.disconnect(); throw e; }
    return c;
  }

  onState(cb: (s: ControllerRawState) => void) { this.stateCbs.add(cb); return () => { this.stateCbs.delete(cb); }; }
  onStatus(cb: StatusCb) { this.statusCbs.add(cb); return () => { this.statusCbs.delete(cb); }; }
  onLog(cb: (line: string) => void) { this.logCbs.add(cb); return () => { this.logCbs.delete(cb); }; }
  stats() { return { packets: this.packets, lastPacketAt: this.lastPacketAt, lastStatusHex: this.lastStatusHex }; }
  get polarityFlipped() { return this.polarity.flipped; }

  async disconnect(): Promise<void> {
    this.stopped = true;
    this.device.removeEventListener('gattserverdisconnected', this.onDisconnected);
    this.teardown();
    try { this.server?.disconnect(); } catch { /* ignore */ }
    this.emitStatus({ connected: false });
  }

  private log(s: string) { for (const cb of this.logCbs) cb(s); }
  private emitStatus(s: { connected: boolean }) {
    const full = { ...s, firmware: this.firmware, battery: this.battery, warning: this.warning };
    for (const cb of this.statusCbs) cb(full);
  }
  private teardown() { for (const c of this.cleanups.splice(0)) { try { c(); } catch { /* ignore */ } } }

  private async setup() {
    this.teardown();
    this.polarity = new PolarityDetector();
    const server = await this.device.gatt!.connect();
    this.server = server;
    const { svc, chars } = await this.findRideService(server);
    const infos: CharInfo[] = chars.map((c) => ({
      uuid: c.uuid, notify: c.properties.notify, indicate: c.properties.indicate,
      write: c.properties.write, writeNoResp: c.properties.writeWithoutResponse,
    }));
    const pick = pickCharacteristics(infos);
    this.log(`chars: ${infos.map((i) => i.uuid).join(', ')}`);
    if (pick.fallback.length) this.log('fallback characteristics: ' + pick.fallback.join(' '));
    const byUuid = (u?: string) => chars.find((c) => c.uuid === u);
    const asyncC = byUuid(pick.async); const txC = byUuid(pick.syncTx); const rxC = byUuid(pick.syncRx);
    if (!asyncC || !rxC) throw new Error('Zwift Ride: required characteristics not found');
    this.syncRx = rxC;

    const onAsync = (ev: Event) => this.onData(valueOf(ev), 'async');
    const onTx = (ev: Event) => this.onData(valueOf(ev), 'syncTx');
    asyncC.addEventListener('characteristicvaluechanged', onAsync);
    this.cleanups.push(() => asyncC.removeEventListener('characteristicvaluechanged', onAsync));
    await asyncC.startNotifications();
    if (txC) {
      txC.addEventListener('characteristicvaluechanged', onTx);
      this.cleanups.push(() => txC.removeEventListener('characteristicvaluechanged', onTx));
      await txC.startNotifications();
    }
    await this.handshake();
    await this.readInfo(server);
    this.emitStatus({ connected: true });
  }

  /**
   * Firmware differs in how it exposes the Ride service: some expose 0xFC82 (what it advertises),
   * others the 128-bit 00000001-19ca-… service. Try both, then scan every service for 19ca characteristics.
   */
  private async findRideService(server: BluetoothRemoteGATTServer) {
    const tried: string[] = [];
    for (const id of RIDE_SERVICE_CANDIDATES) {
      try {
        const svc = await server.getPrimaryService(id);
        const chars = await svc.getCharacteristics();
        this.log(`using service ${svc.uuid}`);
        return { svc, chars };
      } catch (e) { tried.push(`${typeof id === 'number' ? '0x' + id.toString(16) : id}: ${String(e)}`); }
    }
    let services: BluetoothRemoteGATTService[] = [];
    try { services = await server.getPrimaryServices(); } catch (e) { tried.push('getPrimaryServices: ' + String(e)); }
    for (const svc of services) {
      try {
        const chars = await svc.getCharacteristics();
        if (chars.some((c) => c.uuid.includes('19ca-4651'))) { this.log(`using scanned service ${svc.uuid}`); return { svc, chars }; }
      } catch { /* not readable */ }
    }
    for (const t of tried) this.log('service lookup: ' + t);
    throw new Error(`Zwift Ride service not found on "${this.device.name ?? 'device'}" (services: ${services.map((s) => s.uuid).join(', ') || 'none visible'}). Capture details with /probe.html.`);
  }

  private async handshake() {
    const rx = this.syncRx!;
    if (rx.writeValueWithoutResponse) await rx.writeValueWithoutResponse(RIDE_ON as BufferSource);
    else await rx.writeValue(RIDE_ON as BufferSource);
  }
  /** Public so the UI can re-send if the device goes quiet. */
  async sendRideOn() { await this.handshake(); }

  private async readInfo(server: BluetoothRemoteGATTServer) {
    try {
      const di = await server.getPrimaryService(0x180a);
      const v = await (await di.getCharacteristic(0x2a26)).readValue();
      this.firmware = new TextDecoder().decode(v).replace(/\0/g, '').trim();
      if (firmwareAtLeast(this.firmware, '1.3.0')) this.warning = FW_WARNING;
    } catch (e) { this.log('firmware read failed: ' + String(e)); }
    try {
      const bs = await server.getPrimaryService(0x180f);
      this.battery = (await (await bs.getCharacteristic(0x2a19)).readValue()).getUint8(0);
    } catch (e) { this.log('battery read failed: ' + String(e)); }
  }

  private onData(dv: DataView, from: string) {
    const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
    this.packets++; this.lastPacketAt = Date.now();
    if (from === 'syncTx' || startsWithRideOn(bytes)) { this.log(`${from}: ${hex(bytes)}`); return; }
    const m = parseRideMessage(bytes);
    if (bytes[0] === 0x23) this.lastStatusHex = hex(bytes);
    if (m.kind === 'battery') { this.battery = m.pct; this.emitStatus({ connected: true }); return; }
    if (m.kind === 'other') { this.log(`other opcode 0x${m.opcode.toString(16)}${m.malformed ? ' (malformed)' : ''}: ${hex(bytes)}`); return; }
    if (m.buttonMapRaw !== null) {
      if (this.polarity.feed(m.buttonMapRaw)) this.log('polarity flipped (>8 buttons pressed at start)');
      this.buttons = this.polarity.decode(m.buttonMapRaw);
    }
    // proto3 omits zero values, so a missing paddle entry means 0.
    this.paddles = [m.paddles[0] ?? 0, m.paddles[1] ?? 0];
    const s: ControllerRawState = { buttons: this.buttons, paddleL: this.paddles[0], paddleR: this.paddles[1] };
    for (const cb of this.stateCbs) cb(s);
  }

  private onDisconnected = () => {
    if (this.stopped) return;
    this.emitStatus({ connected: false });
    void this.reconnectLoop();
  };
  private async reconnectLoop() {
    if (this.reconnecting) return;
    this.reconnecting = true;
    let attempt = 0;
    while (!this.stopped) {
      const wait = BACKOFF_S[Math.min(attempt, BACKOFF_S.length - 1)];
      this.log(`reconnect in ${wait}s`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      if (this.stopped) break;
      try { await this.setup(); this.log('reconnected'); break; }
      catch (e) { this.log('reconnect failed: ' + String(e)); attempt++; }
    }
    this.reconnecting = false;
  }
}

function valueOf(ev: Event): DataView { return (ev.target as BluetoothRemoteGATTCharacteristic).value!; }
function hex(b: Uint8Array) { return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' '); }
