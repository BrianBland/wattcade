// The sky half of the water cycle, before the river: Evaporation → Cloud → Rain. Pure and deterministic (rng injected).
//
//  - Evaporation: over the sea, steer a column of rising vapor into drifting patches of sunlight. Cadence and power
//    lift vapor; sunlight doubles it. Vapor becomes the cloud.
//  - Cloud: the cloud drifts inland up the valley; steer it across the valley to soak up cloudlets. Bigger cloud =
//    more rain later.
//  - Rain: the cloud hangs over the peaks; the sim spawns real water parcels under it (so streams form on their own).
//    Where it rained most is where the spring rises for the river.
//
// Steering is in the cloud's frame like the salmon run (it faces upstream, −y): steer/nudge > 0 = its right = −x.

export interface SkyParams {
  evapRate: number;        // vapor per second at 1.0 FTP, cadNorm 0.5, out of the sun
  sunBonus: number;        // multiplier inside a sunlit patch
  steerRate: number;       // cells/s (d-pad/paddles)
  shiftStep: number;       // cells per shifter click
  puffEvery: number;       // seconds between cloudlets
  puffSize: number;        // vapor per cloudlet
  refSize: number;         // cloud size that rains at 100 %
}
export const DEFAULT_SKY: SkyParams = { evapRate: 0.25, sunBonus: 2.2, steerRate: 14, shiftStep: 4, puffEvery: 7, puffSize: 3, refSize: 80 };

export interface SunSpot { x: number; r: number; phase: number; speed: number }
export interface Puff { id: number; x: number; y: number; size: number; state: 'ahead' | 'caught' | 'missed'; age: number }
export type SkyCue = { type: 'sunlit' } | { type: 'puff'; size: number } | { type: 'puffMissed' };

export class Sky {
  vapor = 0;
  /** Across-valley position of the vapor column (evaporation) / the cloud (cloud, rain). */
  x: number;
  /** Downstream position of the cloud. */
  y: number;
  size = 0;
  rained = 0;
  puffsCaught = 0; puffsMissed = 0;
  inSun = false;
  sun: SunSpot[] = [];
  puffs: Puff[] = [];
  private rainX = 0; private nextPuff = 1; private puffId = 0; private t = 0;

  constructor(private nx: number, private ny: number, private coastY: number, private rng: () => number) {
    this.x = nx / 2; this.y = coastY + 8;
    for (let k = 0; k < 3; k++) this.sun.push({ x: nx / 2, r: 5 + this.rng() * 2, phase: this.rng() * Math.PI * 2, speed: 0.05 + this.rng() * 0.06 });
  }

  /** The sea row the evaporation column stands on. */
  get seaY(): number { return Math.min(this.ny - 4, this.coastY + 10); }
  /** Cloud radius in cells (grows with size). */
  get radius(): number { return Math.min(14, 4 + Math.sqrt(Math.max(0, this.size)) * 0.9); }
  /** Rain multiplier from cloud size. */
  rainFactor(p: SkyParams): number { return Math.min(1.5, 0.5 + 0.5 * this.size / p.refSize); }
  /** Where the spring should rise: the rain-weighted mean x (centre if it never rained). */
  springX(): number { return this.rained > 0 ? this.rainX / this.rained : this.nx / 2; }

  private steer(dt: number, steer: number, nudge: number, target: number | null, p: SkyParams) {
    if (target !== null) this.x += Math.max(-p.steerRate * dt, Math.min(p.steerRate * dt, target - this.x));
    else this.x -= steer * p.steerRate * dt + nudge * p.shiftStep;
    this.x = Math.max(10, Math.min(this.nx - 10, this.x));
  }

  evaporate(dt: number, inp: { cadNorm: number; power: number; steer: number; nudge: number; autopilot: boolean }, p: SkyParams): SkyCue[] {
    this.t += dt;
    for (const s of this.sun) s.x = this.nx / 2 + Math.sin(this.t * s.speed + s.phase) * (this.nx / 2 - 14);
    const near = this.sun.reduce((a, s) => (Math.abs(s.x - this.x) < Math.abs(a.x - this.x) ? s : a));
    this.steer(dt, inp.steer, inp.nudge, inp.autopilot ? near.x : null, p);
    const was = this.inSun;
    this.inSun = Math.abs(near.x - this.x) < near.r;
    const rate = p.evapRate * Math.max(0, inp.power) * (0.6 + 0.8 * inp.cadNorm) * (this.inSun ? p.sunBonus : 1);
    this.vapor += rate * dt;
    this.size = this.vapor;
    this.y = this.seaY;
    return this.inSun && !was ? [{ type: 'sunlit' }] : [];
  }

  /** `k` = 0..1 progress through the cloud block (the cloud drifts from the coast to the peaks). */
  drift(dt: number, k: number, inp: { steer: number; nudge: number; autopilot: boolean; reach?: number }, p: SkyParams): SkyCue[] {
    const cues: SkyCue[] = [];
    this.t += dt;
    this.y = this.seaY + (10 - this.seaY) * Math.min(1, k);
    this.nextPuff -= dt;
    if (this.nextPuff <= 0 && this.y > 26) {
      this.nextPuff = p.puffEvery * (0.8 + 0.4 * this.rng());
      this.puffs.push({ id: ++this.puffId, x: 14 + this.rng() * (this.nx - 28), y: this.y - 24, size: p.puffSize * (0.7 + 0.6 * this.rng()), state: 'ahead', age: 0 });
    }
    const next = this.puffs.find((q) => q.state === 'ahead');
    this.steer(dt, inp.steer, inp.nudge, inp.autopilot ? (next ? next.x : this.nx / 2) : null, p);
    for (const q of this.puffs) {
      q.age += dt;
      if (q.state !== 'ahead' || this.y > q.y) continue;
      if (Math.abs(q.x - this.x) < (this.radius + 2) * (inp.reach ?? 1)) { q.state = 'caught'; this.size += q.size; this.puffsCaught++; cues.push({ type: 'puff', size: q.size }); }
      else { q.state = 'missed'; this.puffsMissed++; cues.push({ type: 'puffMissed' }); }
    }
    this.puffs = this.puffs.filter((q) => q.state === 'ahead' || q.age < 30);
    return cues;
  }

  /** Hang over the peaks and rain. Returns the rain footprint for the water sim (cells). */
  rain(dt: number, inp: { steer: number; nudge: number; autopilot: boolean; flow: number }, p: SkyParams): { x: number; y: number; r: number } {
    this.t += dt;
    this.y = 13 + 5 * Math.sin(this.t / 9);
    this.steer(dt, inp.steer, inp.nudge, inp.autopilot ? this.nx / 2 + 14 * Math.sin(this.t / 20) : null, p);
    const amt = inp.flow * dt;
    this.rained += amt; this.rainX += amt * this.x;
    this.size = Math.max(p.refSize * 0.3, this.size - amt * 0.15);
    return { x: this.x, y: this.y, r: Math.max(3, this.radius * 0.7) };
  }
}
