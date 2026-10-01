import type { DeviceSample, HrDevice, Profile, TrainerCapabilities, TrainerCommand, TrainerDevice } from '../contracts';
import { SCRIPTS, type Script } from './scripts';

const G = 9.81, RHO = 1.2, WHEEL_M = 2.1, DRIVE_EFF = 0.975;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function gearRatio(gear: number): number { return 2.6 * Math.pow(1.12, gear - 6); }

export class FakeTrainer implements TrainerDevice {
  readonly kind = 'fake' as const;
  readonly capabilities: TrainerCapabilities = { sim: true, erg: true, resistance: true, resistanceRange: [0, 100, 1], powerRange: [0, 2000, 1] };
  command: TrainerCommand = { mode: 'sim', gradePct: 0 };
  power = 0; speedKph = 0;
  crr = 0.004; cda = 0.3; resistanceK = 1;
  private sampleCbs = new Set<(s: DeviceSample) => void>();
  private statusCbs = new Set<(s: { connected: boolean; detail?: string }) => void>();

  apply(cmd: TrainerCommand) { this.command = cmd; return Promise.resolve({ ok: true, result: 1 }); }
  onSample(cb: (s: DeviceSample) => void) { this.sampleCbs.add(cb); return () => { this.sampleCbs.delete(cb); }; }
  onStatus(cb: (s: { connected: boolean; detail?: string }) => void) { this.statusCbs.add(cb); return () => { this.statusCbs.delete(cb); }; }
  async disconnect() { this.statusCbs.forEach((c) => c({ connected: false })); }

  /** Advance the physics model by dt and emit a sample. */
  step(dt: number, cadence: number, env: { massKg: number; gear: number }, powerOverride?: number | null): DeviceSample {
    const v = (cadence / 60) * gearRatio(env.gear) * WHEEL_M; // m/s
    const c = this.command;
    let p: number;
    if (powerOverride != null) p = powerOverride;
    else if (cadence <= 0) p = 0;
    else if (c.mode === 'erg') {
      p = this.power + (c.watts - this.power) * (1 - Math.exp(-dt / 2));
    } else if (c.mode === 'resistance') {
      p = this.resistanceK * cadence * (1 + c.levelPct / 40);
    } else {
      const grade = c.mode === 'sim' ? c.gradePct : 0;
      const wind = c.mode === 'sim' ? c.windMps ?? 0 : 0;
      const crr = c.mode === 'sim' ? c.crr ?? this.crr : this.crr;
      const th = Math.atan(grade / 100);
      const va = v + wind;
      const F = env.massKg * G * (crr * Math.cos(th) + Math.sin(th)) + 0.5 * RHO * this.cda * va * Math.abs(va);
      p = Math.max(0, (F * v) / DRIVE_EFF);
    }
    this.power = p; this.speedKph = v * 3.6;
    const s: DeviceSample = {
      power: p, cadence, speedKph: this.speedKph,
      resistanceLevel: c.mode === 'resistance' ? c.levelPct : undefined,
    };
    this.sampleCbs.forEach((cb) => cb(s));
    return s;
  }
}

class FakeHr implements HrDevice {
  private cbs = new Set<(s: DeviceSample) => void>();
  onSample(cb: (s: DeviceSample) => void) { this.cbs.add(cb); return () => { this.cbs.delete(cb); }; }
  onStatus(_cb: (s: { connected: boolean }) => void) { return () => {}; }
  async disconnect() {}
  emit(hr: number) { this.cbs.forEach((c) => c({ hr })); }
}

export interface FakeEnv { profile: Readonly<Profile>; gear: number; hooks?: Record<string, unknown> }

/** Simulated rider: cadence/power from a script or manual controls; drives FakeTrainer + fake HR. */
export class FakeBike {
  readonly trainer = new FakeTrainer();
  readonly hr = new FakeHr();
  script: Script | null = null;
  manual: { cadence: number; power: number | null; hr: number | null } = { cadence: 0, power: null, hr: null };
  private t = 0; private hrState = 60; private seed: number;
  private rng: () => number;

  constructor(opts: { rng: () => number; seed?: number; script?: string | Script | null }) {
    this.rng = opts.rng; this.seed = opts.seed ?? 1;
    if (opts.script) this.useScript(opts.script);
  }
  get usesHooks(): boolean { return !!this.script?.usesHooks; }

  useScript(s: string | Script | null): void {
    if (typeof s === 'string') {
      const found = SCRIPTS[s];
      if (!found) throw new Error(`unknown fake-bike script "${s}" (have: ${Object.keys(SCRIPTS).join(', ')})`);
      this.script = found;
    } else this.script = s;
  }

  tick(dt: number, env: FakeEnv): void {
    this.t += dt;
    const p = env.profile;
    let cadence: number, power: number | null;
    if (this.script) {
      cadence = this.script.cadence(this.t);
      const f = this.script.powerFtp?.(this.t, { hooks: env.hooks, seed: this.seed });
      power = f === undefined ? null : f * p.ftp;
    } else { cadence = this.manual.cadence; power = this.manual.power; }
    const s = this.trainer.step(dt, cadence, { massKg: p.weightKg + 9, gear: env.gear }, power);
    // fake HR: 30 s lag toward a power-derived target, with seeded noise
    const target = 60 + (p.maxHr - 60) * clamp(((s.power ?? 0) / p.ftp) * 0.75, 0, 1);
    this.hrState += (target - this.hrState) * (1 - Math.exp(-dt / 30));
    const hr = this.manual.hr ?? this.hrState + (this.rng() - 0.5) * 2;
    this.hr.emit(hr);
  }
}
