import type { ControllerDevice, ControllerRawState, HrDevice, TrainerCapabilities, TrainerCommand, TrainerDevice } from '../contracts';
import { BikeStateStore } from './bikeState';

export interface ControllerTarget { setControllerState(raw: ControllerRawState): void }

/** Attaches devices and routes their data into the BikeStateStore. */
export class DataHub {
  readonly store: BikeStateStore;
  private trainer: TrainerDevice | null = null;
  private offs: { trainer: Array<() => void>; hr: Array<() => void>; controller: Array<() => void> } = { trainer: [], hr: [], controller: [] };
  private hrDev: HrDevice | null = null; private ctlDev: ControllerDevice | null = null;
  private listeners = new Set<() => void>();
  controllerStatus: { connected: boolean; firmware?: string; battery?: number; warning?: string } = { connected: false };

  constructor(store: BikeStateStore = new BikeStateStore()) { this.store = store; }

  onChange(cb: () => void): () => void { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  private changed() { this.listeners.forEach((l) => l()); }

  attachTrainer(dev: TrainerDevice): () => void {
    this.detachTrainer();
    this.trainer = dev;
    const isFake = dev.kind === 'fake';
    const flag = (v: boolean) => { this.store.setConnected(isFake ? { fake: v } : { trainer: v }); this.changed(); };
    flag(true);
    this.offs.trainer.push(dev.onSample((s) => this.store.ingestTrainer(s)));
    this.offs.trainer.push(dev.onStatus((st) => flag(st.connected)));
    return () => { if (this.trainer === dev) this.detachTrainer(); };
  }
  detachTrainer(): void {
    this.offs.trainer.forEach((f) => f()); this.offs.trainer = [];
    if (this.trainer) this.store.setConnected(this.trainer.kind === 'fake' ? { fake: false } : { trainer: false });
    this.trainer = null; this.changed();
  }

  attachHr(dev: HrDevice, opts: { fake?: boolean } = {}): () => void {
    this.detachHr();
    this.hrDev = dev;
    const flag = (v: boolean) => { if (!opts.fake) this.store.setConnected({ hr: v }); this.changed(); };
    flag(true);
    this.offs.hr.push(dev.onSample((s) => this.store.ingestHr(s)));
    this.offs.hr.push(dev.onStatus((st) => flag(st.connected)));
    return () => { if (this.hrDev === dev) this.detachHr(); };
  }
  detachHr(): void {
    this.offs.hr.forEach((f) => f()); this.offs.hr = [];
    if (this.hrDev) this.store.setConnected({ hr: false });
    this.hrDev = null; this.changed();
  }

  attachController(dev: ControllerDevice, target: ControllerTarget): () => void {
    this.detachController();
    this.ctlDev = dev;
    this.store.setConnected({ controller: true }); this.changed();
    this.offs.controller.push(dev.onState((s) => target.setControllerState(s)));
    this.offs.controller.push(dev.onStatus((st) => {
      this.controllerStatus = st; this.store.setConnected({ controller: st.connected }); this.changed();
    }));
    return () => { if (this.ctlDev === dev) this.detachController(); };
  }
  detachController(): void {
    this.offs.controller.forEach((f) => f()); this.offs.controller = [];
    if (this.ctlDev) this.store.setConnected({ controller: false });
    this.ctlDev = null; this.changed();
  }

  capabilities(): TrainerCapabilities | null { return this.trainer?.capabilities ?? null; }
  hasRealDevices(): boolean { const c = this.store.get().connected; return c.trainer || c.hr || c.controller; }

  sendCommand(cmd: TrainerCommand): Promise<{ ok: boolean; result?: number; detail?: string }> {
    if (!this.trainer) return Promise.resolve({ ok: false, detail: 'no trainer' });
    return this.trainer.apply(cmd);
  }

  async disconnectAll(): Promise<void> {
    const t = this.trainer, h = this.hrDev, c = this.ctlDev;
    this.detachTrainer(); this.detachHr(); this.detachController();
    await Promise.allSettled([t?.disconnect(), h?.disconnect(), c?.disconnect()]);
  }
}
