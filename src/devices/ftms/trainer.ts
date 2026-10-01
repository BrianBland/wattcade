// Thin Web Bluetooth glue for the KICKR CORE (FTMS). All byte work lives in codec.ts / queue.ts.
import type { DeviceSample, TrainerCapabilities, TrainerCommand, TrainerDevice } from '../../contracts';
import {
  CHAR, FTMS_SERVICE, OP, RESULT, encodeRequestControl, encodeSetPower, encodeSetResistance, encodeSetSim, encodeStart,
  parseIndoorBikeData, parsePowerRange, parseResistanceRange, resistancePctToRaw, type IndoorBikeData,
} from './codec';
import { ControlPointQueue } from './queue';
import { reconnectLoop } from './reconnect';

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
  private closed = false; private connected = false;
  private onDisc = () => this.handleDisconnect();
  private onBike = (e: Event) => this.handleBike((e.target as BluetoothRemoteGATTCharacteristic).value!);
  private onCp = (e: Event) => this.cp?.onIndication((e.target as BluetoothRemoteGATTCharacteristic).value!);

  private constructor(private device: BluetoothDevice) {}

  /** Must be called from a user gesture. */
  static async connect(): Promise<FtmsTrainer> {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [FTMS_SERVICE] }], optionalServices: [0x1818, 0x180a],
    });
    const t = new FtmsTrainer(device);
    device.addEventListener('gattserverdisconnected', t.onDisc);
    await t.setup();
    return t;
  }

  stats(): { packets: number; lastPacketAt: number } { return { packets: this.packets, lastPacketAt: this.lastPacketAt }; }
  get name(): string { return this.device.name ?? 'FTMS trainer'; }

  private async setup(): Promise<void> {
    const server = await this.device.gatt!.connect();
    const svc = await server.getPrimaryService(FTMS_SERVICE);
    const cpChar = await svc.getCharacteristic(CHAR.controlPoint);
    this.cpChar = cpChar;
    this.cp?.reset('reconnect');
    this.cp = new ControlPointQueue(b => cpChar.writeValueWithResponse(b as BufferSource));
    cpChar.addEventListener('characteristicvaluechanged', this.onCp);
    await cpChar.startNotifications();
    const bike = await svc.getCharacteristic(CHAR.indoorBikeData);
    bike.addEventListener('characteristicvaluechanged', this.onBike);
    await bike.startNotifications();
    await this.takeControl();
    await this.readCapabilities(svc);
    this.connected = true;
    this.emitStatus({ connected: true });
  }

  private async takeControl(): Promise<boolean> {
    const r = await this.cp!.send(encodeRequestControl());
    if (r.ok) await this.cp!.send(encodeStart());
    return r.ok;
  }

  private async readCapabilities(svc: BluetoothRemoteGATTService): Promise<void> {
    const caps: TrainerCapabilities = { sim: true, erg: true, resistance: true };
    try { const c = await svc.getCharacteristic(CHAR.resistanceRange); this.resRange = parseResistanceRange(await c.readValue()); }
    catch { caps.resistance = false; }
    if (this.resRange) caps.resistanceRange = this.resRange; else caps.resistance = false;
    try { const c = await svc.getCharacteristic(CHAR.powerRange); const p = parsePowerRange(await c.readValue()); if (p) caps.powerRange = p; }
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
    const r = await this.cp!.send(bytes);
    if (r.result === RESULT.notPermitted && !retried) {
      if (await this.takeControl()) return this.send(bytes, _op, value, true);
    }
    if (r.coalesced) return { ok: true, result: value, detail: 'coalesced' };
    return { ok: r.ok, result: r.ok ? value : undefined, detail: r.ok ? undefined : (r.error ?? (r.timeout ? 'timeout' : `result ${r.result}`)) };
  }

  private handleDisconnect(): void {
    this.connected = false; this.cp?.reset('disconnected');
    this.emitStatus({ connected: false, detail: this.closed ? 'closed' : 'reconnecting' });
    if (this.closed) return;
    void reconnectLoop({
      cancelled: () => this.closed,
      connect: () => this.setup(),
      onAttempt: (n, d) => this.emitStatus({ connected: false, detail: `reconnect #${n + 1} in ${d}s` }),
    });
  }

  private emitStatus(s: { connected: boolean; detail?: string }): void { for (const cb of this.statusCbs) cb(s); }
  onSample(cb: (s: DeviceSample) => void) { this.sampleCbs.add(cb); return () => { this.sampleCbs.delete(cb); }; }
  onStatus(cb: (s: { connected: boolean; detail?: string }) => void) { this.statusCbs.add(cb); return () => { this.statusCbs.delete(cb); }; }

  async disconnect(): Promise<void> {
    this.closed = true; this.connected = false;
    this.cp?.reset('closed');
    this.device.removeEventListener('gattserverdisconnected', this.onDisc);
    try { this.device.gatt?.disconnect(); } catch { /* ignore */ }
    this.emitStatus({ connected: false, detail: 'closed' });
  }
}
