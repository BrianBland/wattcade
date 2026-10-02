// The Ride's left and right controllers can show up as two BLE devices (e.g. two "Zwift SF2").
// RideControllerGroup connects to one or both and presents them as a single ControllerDevice.
import type { Button, ControllerDevice, ControllerRawState } from '../../contracts';
import { ZwiftRideController, requestRideDevice } from './controller';

type Status = { connected: boolean; firmware?: string; battery?: number; warning?: string };

/** Union of buttons; each paddle comes from whichever controller reports the larger deflection. */
export function mergeRideStates(states: ControllerRawState[]): ControllerRawState {
  const buttons = new Set<Button>();
  let paddleL = 0, paddleR = 0;
  for (const s of states) {
    for (const b of s.buttons) buttons.add(b);
    if (Math.abs(s.paddleL) > Math.abs(paddleL)) paddleL = s.paddleL;
    if (Math.abs(s.paddleR) > Math.abs(paddleR)) paddleR = s.paddleR;
  }
  return { buttons, paddleL, paddleR };
}

/** Combine per-controller statuses: connected if any is; lowest battery; firmwares joined. */
export function mergeRideStatuses(statuses: Status[]): Status {
  const firmwares = [...new Set(statuses.map((s) => s.firmware).filter(Boolean))];
  const batteries = statuses.map((s) => s.battery).filter((b): b is number => b !== undefined);
  return {
    connected: statuses.some((s) => s.connected),
    firmware: firmwares.length ? firmwares.join(' / ') : undefined,
    battery: batteries.length ? Math.min(...batteries) : undefined,
    warning: statuses.find((s) => s.warning)?.warning,
  };
}

export class RideControllerGroup implements ControllerDevice {
  private members: Array<{ dev: ZwiftRideController; state: ControllerRawState; status: Status; offs: Array<() => void> }> = [];
  private stateCbs = new Set<(s: ControllerRawState) => void>();
  private statusCbs = new Set<(s: Status) => void>();
  private logCbs = new Set<(line: string) => void>();

  get count() { return this.members.length; }
  get names() { return this.members.map((m) => m.dev.device.name ?? m.dev.device.id); }

  /** Must be called from a user gesture. Picking an already-connected controller is rejected. */
  async addFromPicker(): Promise<void> {
    const device = await requestRideDevice();
    if (this.members.some((m) => m.dev.device.id === device.id)) throw new Error('That controller is already connected — pick the other one.');
    this.add(await ZwiftRideController.connectDevice(device));
  }

  add(dev: ZwiftRideController): void {
    const m = { dev, state: { buttons: new Set<Button>(), paddleL: 0, paddleR: 0 } as ControllerRawState, status: { connected: true } as Status, offs: [] as Array<() => void> };
    const tag = `[${dev.device.name ?? 'ride'} ${this.members.length + 1}] `;
    m.offs.push(dev.onState((s) => { m.state = s; this.emitState(); }));
    m.offs.push(dev.onStatus((s) => { m.status = s; this.emitStatus(); }));
    m.offs.push(dev.onLog((l) => { for (const cb of this.logCbs) cb(tag + l); }));
    this.members.push(m);
    this.emitStatus();
  }

  onState(cb: (s: ControllerRawState) => void) { this.stateCbs.add(cb); return () => { this.stateCbs.delete(cb); }; }
  onStatus(cb: (s: Status) => void) { this.statusCbs.add(cb); return () => { this.statusCbs.delete(cb); }; }
  onLog(cb: (line: string) => void) { this.logCbs.add(cb); return () => { this.logCbs.delete(cb); }; }
  stats() {
    const st = this.members.map((m) => m.dev.stats());
    const latest = [...st].sort((a, b) => b.lastPacketAt - a.lastPacketAt);
    return {
      packets: st.reduce((a, s) => a + s.packets, 0),
      lastPacketAt: latest[0]?.lastPacketAt ?? 0,
      /** Last raw 0x23 status message per side, for diagnosing paddle/button layouts in the overlay. */
      lastStatusHex: st.map((s) => s.lastStatusHex || '--'),
    };
  }

  async disconnect(): Promise<void> {
    const ms = this.members.splice(0);
    for (const m of ms) { m.offs.forEach((f) => f()); await m.dev.disconnect(); }
    this.emitStatus();
  }

  private emitState() { const s = mergeRideStates(this.members.map((m) => m.state)); for (const cb of this.stateCbs) cb(s); }
  private emitStatus() { const s = mergeRideStatuses(this.members.map((m) => m.status)); for (const cb of this.statusCbs) cb(s); }
}
