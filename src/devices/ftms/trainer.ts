// Thin Web Bluetooth glue for the KICKR CORE (FTMS). All byte work lives in codec.ts / queue.ts.
import type { DeviceSample, TrainerCapabilities, TrainerCommand, TrainerDevice } from '../../contracts';
import {
  CHAR, FTMS_SERVICE, OP, RESULT, encodeRequestControl, encodeSetPower, encodeSetResistance, encodeSetSim, encodeStart,
  parseIndoorBikeData, parsePowerRange, parseResistanceRange, resistancePctToRaw, type IndoorBikeData,
} from './codec';
import { ControlPointQueue } from './queue';
import { Attempt, ConnectionLifecycle, type ConnectionOptions } from '../bluetooth/lifecycle';

const REFUSED = 'Trainer control refused — close Zwift, then reconnect';

type Apply = { ok: boolean; result?: number; detail?: string };

export class FtmsTrainer implements TrainerDevice {
  readonly kind = 'ftms' as const;
  capabilities: TrainerCapabilities = { sim: true, erg: true, resistance: true };
  private sampleCbs = new Set<(s: DeviceSample) => void>();
  private statusCbs = new Set<(s: { connected: boolean; detail?: string }) => void>();
  private latest: IndoorBikeData = {};
  private packets = 0; private lastPacketAt = 0;
  private cp: ControlPointQueue | null = null;
  private cpChar: BluetoothRemoteGATTCharacteristic | null = null;
  private resForm: 'u8' | 's16' = 'u8';
  private resRange: [number, number, number] | undefined;
  private connected = false;
  private lifecycle: ConnectionLifecycle;
  private bikeChar: BluetoothRemoteGATTCharacteristic | null = null;
  private onDisc = () => this.handleDisconnect();
  private onBike = (e: Event) => { if (!this.lifecycle.isClosed && e.target === this.bikeChar) this.handleBike((e.target as BluetoothRemoteGATTCharacteristic).value!); };
  private onCp = (e: Event) => { if (!this.lifecycle.isClosed && e.target === this.cpChar) this.cp?.onIndication((e.target as BluetoothRemoteGATTCharacteristic).value!); };

  private logCbs = new Set<(l: string) => void>();
  private progress: (step: string) => void = () => {};
  private constructor(private device: BluetoothDevice, options: ConnectionOptions) {
    this.lifecycle = new ConnectionLifecycle(device, closing => { this.teardown(); if (closing) device.removeEventListener('gattserverdisconnected', this.onDisc); }, options);
  }
  private teardown() {
    this.connected = false; this.hasControl = false; this.latest = {}; this.resRange = undefined;
    this.cp?.reset('closed'); this.cp = null;
    this.cpChar?.removeEventListener('characteristicvaluechanged', this.onCp); this.cpChar = null;
    this.bikeChar?.removeEventListener('characteristicvaluechanged', this.onBike); this.bikeChar = null;
  }
  onLog(cb: (line: string) => void) { this.logCbs.add(cb); return () => { this.logCbs.delete(cb); }; }
  private log(l: string) { for (const cb of this.logCbs) cb(l); }
  private step(s: string) { this.log(s); this.progress(s); }

  /** Must be called from a user gesture. */
  static async connect(onProgress?: (step: string) => void, onLog?: (line: string) => void, options: ConnectionOptions = {}): Promise<FtmsTrainer> {
    // Same minimal request shape as the HR monitor (known to work in Bluefy); the extra optional services were unused.
    const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [FTMS_SERVICE] }] });
    await options.beforeConnect?.();
    return FtmsTrainer.connectDevice(device, onProgress, onLog, options);
  }

  /** Connect an already-authorized device without opening the picker. */
  static async connectDevice(device: BluetoothDevice, onProgress?: (step: string) => void, onLog?: (line: string) => void, options: ConnectionOptions = {}): Promise<FtmsTrainer> {
    const t = new FtmsTrainer(device, options);
    if (onLog) t.onLog(onLog);
    if (onProgress) t.progress = onProgress;
    device.addEventListener('gattserverdisconnected', t.onDisc);
    try {
      await t.lifecycle.connect(a => t.setup(a), step => t.step(step));
    } catch (e) {
      await t.disconnect();
      throw e;
    }
    return t;
  }

  stats(): { packets: number; lastPacketAt: number } { return { packets: this.packets, lastPacketAt: this.lastPacketAt }; }
  get id(): string { return this.device.id; }
  get name(): string { return this.device.name ?? 'FTMS trainer'; }

  private async setup(a: Attempt): Promise<void> {
    this.teardown();
    const server = await a.step('connecting GATT', () => this.device.gatt!.connect(), 15000);
    const svc = await a.step('finding FTMS service', () => server.getPrimaryService(FTMS_SERVICE));
    const cpChar = await a.step('finding control point', () => svc.getCharacteristic(CHAR.controlPoint));
    this.cpChar = cpChar;
    this.cp?.reset('reconnect');
    this.cp = new ControlPointQueue(b => cpChar.writeValueWithResponse(b as BufferSource));
    cpChar.addEventListener('characteristicvaluechanged', this.onCp);
    await a.step('subscribing (control point)', () => cpChar.startNotifications());
    const bike = await a.step('finding bike data', () => svc.getCharacteristic(CHAR.indoorBikeData));
    this.bikeChar = bike;
    bike.addEventListener('characteristicvaluechanged', this.onBike);
    await a.step('subscribing (bike data)', () => bike.startNotifications());
    const gotControl = await a.step('requesting control', () => this.takeControl());
    await this.readCapabilities(svc, a);
    a.check();
    this.step('connected');
    this.connected = true;
    this.emitStatus(gotControl ? { connected: true } : { connected: true, detail: REFUSED });
  }

  private hasControl = false;
  private async takeControl(): Promise<boolean> {
    const cp = this.cp;
    if (!cp) return false;
    const r = await cp.send(encodeRequestControl());
    if (this.cp !== cp || this.lifecycle.isClosed) return false;
    if (r.ok) await cp.send(encodeStart());
    if (this.cp !== cp || this.lifecycle.isClosed) return false;
    if (r.ok !== this.hasControl) {
      const was = this.hasControl; this.hasControl = r.ok;
      if (this.connected && !was && r.ok) this.emitStatus({ connected: true }); // clears the refused detail
    } 
    return r.ok;
  }

  private async readCapabilities(svc: BluetoothRemoteGATTService, a: Attempt): Promise<void> {
    const caps: TrainerCapabilities = { sim: true, erg: true, resistance: true };
    try { const c = await a.step('finding resistance range', () => svc.getCharacteristic(CHAR.resistanceRange)); this.resRange = parseResistanceRange(await a.step('reading resistance range', () => c.readValue())); }
    catch { caps.resistance = false; }
    if (this.resRange) caps.resistanceRange = this.resRange; else caps.resistance = false;
    try { const c = await a.step('finding power range', () => svc.getCharacteristic(CHAR.powerRange)); const p = parsePowerRange(await a.step('reading power range', () => c.readValue())); if (p) caps.powerRange = p; }
    catch { /* optional */ }
    this.capabilities = caps;
  }

  private handleBike(dv: DataView): void {
    this.packets++; this.lastPacketAt = performance.now();
    Object.assign(this.latest, parseIndoorBikeData(dv)); // split packets merge into the latest sample
    const { power, cadence, speedKph, hr, resistanceLevel } = this.latest;
    const s: DeviceSample = {};
    if (power !== undefined) s.power = power;
    if (cadence !== undefined) s.cadence = cadence;
    if (speedKph !== undefined) s.speedKph = speedKph;
    if (hr !== undefined) s.hr = hr;
    if (resistanceLevel !== undefined) s.resistanceLevel = resistanceLevel;
    for (const cb of this.sampleCbs) cb(s);
  }

  async apply(cmd: TrainerCommand): Promise<Apply> {
    if (!this.connected || !this.cp) return { ok: false, detail: 'not connected' };
    const cp = this.cp;
    if (!this.hasControl && cmd.mode !== 'none' && !(await this.takeControl())) {
      if (!this.connected || this.cp !== cp) return { ok: false, detail: 'not connected' };
      this.emitStatus({ connected: true, detail: REFUSED });
      return { ok: false, detail: 'control refused' };
    }
    if (!this.connected || this.cp !== cp) return { ok: false, detail: 'not connected' };
    switch (cmd.mode) {
      case 'none': return { ok: true, detail: 'noop' };
      case 'sim': return this.send(encodeSetSim(cmd.gradePct, cmd.windMps, cmd.crr, cmd.cw), OP.setSim, cmd.gradePct);
      case 'erg': return this.send(encodeSetPower(cmd.watts), OP.setPower, cmd.watts);
      case 'resistance': {
        if (!this.resRange) return { ok: false, detail: 'resistance range unknown' };
        const raw = resistancePctToRaw(cmd.levelPct, this.resRange);
        let r = await this.send(encodeSetResistance(raw, this.resForm), OP.setResistance, raw);
        if (!r.ok && r.result !== RESULT.notPermitted && r.result !== -1) {
          const other = this.resForm === 'u8' ? 's16' : 'u8';
          const r2 = await this.send(encodeSetResistance(raw, other), OP.setResistance, raw);
          if (r2.ok) this.resForm = other;
          r = r2;
        }
        return r;
      }
    }
  }

  private async send(bytes: Uint8Array, _op: number, value: number, retried = false): Promise<Apply> {
    const cp = this.cp;
    if (!cp || !this.connected) return { ok: false, detail: 'not connected' };
    const r = await cp.send(bytes);
    if (this.cp !== cp || !this.connected) return { ok: false, detail: 'not connected' };
    if (r.result === RESULT.notPermitted && !retried) {
      this.hasControl = false;
      if (await this.takeControl()) return this.send(bytes, _op, value, true);
    }
    if (r.coalesced) return { ok: true, result: value, detail: 'coalesced' };
    return { ok: r.ok, result: r.ok ? value : undefined, detail: r.ok ? undefined : (r.error ?? (r.timeout ? 'timeout' : `result ${r.result}`)) };
  }

  private handleDisconnect(): void {
    this.lifecycle.disconnected();
    this.teardown(); this.emitStatus({ connected: false, detail: 'reconnecting' });
    this.lifecycle.recover(a => this.setup(a), detail => { this.step(detail); this.emitStatus({ connected: false, detail }); });
  }

  private emitStatus(s: { connected: boolean; detail?: string }): void { for (const cb of this.statusCbs) cb(s); }
  onSample(cb: (s: DeviceSample) => void) { this.sampleCbs.add(cb); return () => { this.sampleCbs.delete(cb); }; }
  onStatus(cb: (s: { connected: boolean; detail?: string }) => void) { this.statusCbs.add(cb); return () => { this.statusCbs.delete(cb); }; }

  async disconnect(): Promise<void> {
    this.device.removeEventListener('gattserverdisconnected', this.onDisc);
    await this.lifecycle.close();
    this.emitStatus({ connected: false, detail: 'closed' });
  }
}
