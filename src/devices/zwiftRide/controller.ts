// Thin Web Bluetooth glue for the Zwift Ride V1 controller. Byte logic lives in codec.ts.
import type { ControllerDevice, ControllerRawState } from '../../contracts';
import { Attempt, ConnectionLifecycle, type ConnectionOptions } from '../bluetooth/lifecycle';
import {
  parseRideMessage, PolarityDetector, firmwareAtLeast, pickCharacteristics, startsWithRideOn,
  RIDE_ON, RIDE_UUIDS, type CharInfo,
} from './codec';

type StatusCb = (s: { connected: boolean; firmware?: string; battery?: number; warning?: string; detail?: string }) => void;

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

export class ZwiftRideController implements ControllerDevice {
  private stateCbs = new Set<(s: ControllerRawState) => void>();
  private statusCbs = new Set<StatusCb>();
  private logCbs = new Set<(line: string) => void>();
  private polarity = new PolarityDetector();
  private paddles: [number, number] = [0, 0];
  private buttons: ControllerRawState['buttons'] = new Set();
  private packets = 0; private lastPacketAt = 0; private lastStatusHex = '';
  private firmware?: string; private battery?: number; private warning?: string;
  private stopped = false;
  private lifecycle: ConnectionLifecycle;
  private server?: BluetoothRemoteGATTServer;
  private syncRx?: BluetoothRemoteGATTCharacteristic;
  private cleanups: Array<() => void> = [];

  private constructor(readonly device: BluetoothDevice, options: ConnectionOptions) {
    this.lifecycle = new ConnectionLifecycle(device, closing => { this.teardown(); if (closing) { this.stopped = true; device.removeEventListener('gattserverdisconnected', this.onDisconnected); } }, options);
    device.addEventListener('gattserverdisconnected', this.onDisconnected);
  }

  /** Must be called from a user gesture. */
  static async connect(options: ConnectionOptions = {}): Promise<ZwiftRideController> {
    const device = await requestRideDevice(); await options.beforeConnect?.();
    return ZwiftRideController.connectDevice(device, options);
  }
  static async connectDevice(device: BluetoothDevice, options: ConnectionOptions = {}, progress: (step: string) => void = () => {}): Promise<ZwiftRideController> {
    const c = new ZwiftRideController(device, options);
    try { await c.lifecycle.connect(a => c.setup(a), progress); } catch (e) { await c.disconnect(); throw e; }
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
    await this.lifecycle.close();
    this.emitStatus({ connected: false });
  }

  private log(s: string) { for (const cb of this.logCbs) cb(s); }
  private emitStatus(s: { connected: boolean; detail?: string }) {
    const full = { ...s, firmware: this.firmware, battery: this.battery, warning: this.warning };
    for (const cb of this.statusCbs) cb(full);
  }
  private teardown() { this.server = undefined; this.syncRx = undefined; for (const c of this.cleanups.splice(0)) { try { c(); } catch { /* ignore */ } } }

  private async setup(a: Attempt) {
    this.teardown();
    this.polarity = new PolarityDetector();
    const server = await a.step('connecting GATT', () => this.device.gatt!.connect(), 15000);
    this.server = server;
    const { svc, chars } = await this.findRideService(server, a);
    const infos: CharInfo[] = chars.map((c) => ({
      uuid: c.uuid, notify: c.properties.notify, indicate: c.properties.indicate,
      write: c.properties.write, writeNoResp: c.properties.writeWithoutResponse,
    }));
    const pick = pickCharacteristics(infos);
    this.log(`chars: ${infos.map((i) => i.uuid).join(', ')}`);
    if (pick.fallback.length) this.log('fallback characteristics: ' + pick.fallback.join(' '));
    const byUuid = (u?: string) => chars.find((c) => c.uuid.toLowerCase() === u?.toLowerCase());
    const asyncC = byUuid(pick.async); const txC = byUuid(pick.syncTx); const rxC = byUuid(pick.syncRx);
    if (!asyncC || !rxC) throw new Error('Zwift Ride: required characteristics not found');
    this.syncRx = rxC;

    let subscribed = true; this.cleanups.push(() => { subscribed = false; });
    const onAsync = (ev: Event) => { if (subscribed) this.onData(valueOf(ev), 'async'); };
    const onTx = (ev: Event) => { if (subscribed) this.onData(valueOf(ev), 'syncTx'); };
    asyncC.addEventListener('characteristicvaluechanged', onAsync);
    this.cleanups.push(() => asyncC.removeEventListener('characteristicvaluechanged', onAsync));
    await a.step('subscribing (controller)', () => asyncC.startNotifications());
    if (txC) {
      txC.addEventListener('characteristicvaluechanged', onTx);
      this.cleanups.push(() => txC.removeEventListener('characteristicvaluechanged', onTx));
      await a.step('subscribing (sync)', () => txC.startNotifications());
    }
    await a.step('starting controller stream', () => this.handshake());
    await this.readInfo(server, a);
    a.check();
    this.emitStatus({ connected: true });
  }

  /**
   * Firmware differs in how it exposes the Ride service: some expose 0xFC82 (what it advertises),
   * others the 128-bit 00000001-19ca-… service. Try both, then scan every service for 19ca characteristics.
   */
  private async findRideService(server: BluetoothRemoteGATTServer, a: Attempt) {
    const tried: string[] = [];
    for (const id of RIDE_SERVICE_CANDIDATES) {
      try {
        const svc = await a.step('finding controller service', () => server.getPrimaryService(id));
        const chars = await a.step('finding controller characteristics', () => svc.getCharacteristics());
        if (this.usable(chars)) { this.log(`using service ${svc.uuid}`); return { svc, chars }; }
        tried.push(`${svc.uuid}: no usable characteristics [${this.describe(chars)}]`);
      } catch (e) { tried.push(`${typeof id === 'number' ? '0x' + id.toString(16) : id}: ${String(e)}`); }
    }
    let services: BluetoothRemoteGATTService[] = [];
    try { services = await a.step('listing controller services', () => server.getPrimaryServices()); } catch (e) { tried.push('getPrimaryServices: ' + String(e)); }
    for (const svc of services) {
      try {
        const chars = await a.step('finding controller characteristics', () => svc.getCharacteristics());
        if (this.usable(chars)) { this.log(`using scanned service ${svc.uuid}`); return { svc, chars }; }
        tried.push(`${svc.uuid}: [${this.describe(chars)}]`);
      } catch (e) { tried.push(`${svc.uuid}: chars ${String(e)}`); }
    }
    for (const t of tried) this.log('service lookup: ' + t);
    throw new Error(`Zwift Ride service not usable on "${this.device.name ?? 'device'}" (visible services: ${services.map((s) => s.uuid).join(', ') || 'none'}; tried: ${tried.join(' | ')})`);
  }

  private usable(chars: BluetoothRemoteGATTCharacteristic[]): boolean {
    const p = pickCharacteristics(chars.map((c) => ({
      uuid: c.uuid, notify: c.properties.notify, indicate: c.properties.indicate,
      write: c.properties.write, writeNoResp: c.properties.writeWithoutResponse,
    })));
    return !!p.async && !!p.syncRx;
  }
  private describe(chars: BluetoothRemoteGATTCharacteristic[]): string {
    return chars.map((c) => `${c.uuid.slice(0, 8)}:${(['notify', 'indicate', 'write', 'writeWithoutResponse', 'read'] as const).filter((k) => c.properties[k]).join('+')}`).join(', ') || 'none';
  }

  private async handshake() {
    const rx = this.syncRx!;
    if (rx.writeValueWithoutResponse) await rx.writeValueWithoutResponse(RIDE_ON as BufferSource);
    else await rx.writeValue(RIDE_ON as BufferSource);
  }
  /** Public so the UI can re-send if the device goes quiet. */
  async sendRideOn() { if (!this.lifecycle.isReady || !this.syncRx) return; await this.handshake(); }

  private async readInfo(server: BluetoothRemoteGATTServer, a: Attempt) {
    try {
      const di = await a.step('finding device information', () => server.getPrimaryService(0x180a));
      const ch = await a.step('finding firmware', () => di.getCharacteristic(0x2a26));
      const v = await a.step('reading firmware', () => ch.readValue());
      this.firmware = new TextDecoder().decode(v).replace(/\0/g, '').trim();
      if (firmwareAtLeast(this.firmware, '1.3.0')) this.warning = FW_WARNING;
    } catch (e) { this.log('firmware read failed: ' + String(e)); }
    try {
      const bs = await a.step('finding battery service', () => server.getPrimaryService(0x180f));
      const ch = await a.step('finding battery', () => bs.getCharacteristic(0x2a19));
      this.battery = (await a.step('reading battery', () => ch.readValue())).getUint8(0);
    } catch (e) { this.log('battery read failed: ' + String(e)); }
  }

  private onData(dv: DataView, from: string) {
    if (this.stopped) return;
    const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
    this.packets++; this.lastPacketAt = Date.now();
    if (from === 'syncTx' || startsWithRideOn(bytes)) { this.log(`${from}: ${hex(bytes)}`); return; }
    const m = parseRideMessage(bytes);
    if (bytes[0] === 0x23) this.lastStatusHex = hex(bytes);
    if (m.kind === 'battery') { this.battery = m.pct; if (this.lifecycle.isReady) this.emitStatus({ connected: true }); return; }
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
    this.lifecycle.disconnected(); this.teardown();
    this.buttons = new Set(); this.paddles = [0, 0];
    for (const cb of this.stateCbs) cb({ buttons: this.buttons, paddleL: 0, paddleR: 0 });
    this.emitStatus({ connected: false, detail: 'Reconnecting' });
    this.lifecycle.recover(a => this.setup(a), detail => this.emitStatus({ connected: false, detail }));
  };
}

function valueOf(ev: Event): DataView { return (ev.target as BluetoothRemoteGATTCharacteristic).value!; }
function hex(b: Uint8Array) { return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' '); }
