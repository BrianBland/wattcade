import type { BikeState, DeviceSample, Profile, Seconds, TrainerMode, Tuning } from '../contracts';

class RollAvg {
  private buf: number[] = []; private i = 0; private sum = 0;
  constructor(private n: number) {}
  push(v: number): number {
    if (this.buf.length < this.n) { this.buf.push(v); this.sum += v; }
    else { this.sum += v - this.buf[this.i]; this.buf[this.i] = v; this.i = (this.i + 1) % this.n; }
    return this.sum / this.buf.length;
  }
  reset(): void { this.buf = []; this.i = 0; this.sum = 0; }
  get size(): number { return this.buf.length; }
}

export function powerZoneOf(frac: number): BikeState['powerZone'] {
  if (frac < 0.55) return 1; if (frac < 0.76) return 2; if (frac < 0.91) return 3;
  if (frac < 1.06) return 4; if (frac < 1.21) return 5; if (frac <= 1.5) return 6; return 7;
}
export function hrZoneOf(frac: number): 1 | 2 | 3 | 4 | 5 {
  if (frac < 0.6) return 1; if (frac < 0.7) return 2; if (frac < 0.8) return 3; if (frac < 0.9) return 4; return 5;
}

const STALE_TRAINER_S = 3;
const STALE_HR_S = 5;

/** Holds the latest device data and derives BikeState once per fixed sim tick. */
export class BikeStateStore {
  private s: BikeState;
  private p3: RollAvg; private p10: RollAvg; private c3: RollAvg; private h5: RollAvg;
  private rawPower = 0; private rawCadence = 0; private rawSpeed = 0;
  private rawHr: number | null = null; private rawRes: number | null = null;
  private trainerAge = Infinity; private hrAge = Infinity;
  private sprintT = 0;
  private sprintFtp: () => number = () => 1.2;
  private dt0 = 1 / 30;

  constructor(dt = 1 / 30) {
    this.dt0 = dt;
    this.p3 = new RollAvg(Math.round(3 / dt)); this.p10 = new RollAvg(Math.round(10 / dt));
    this.c3 = new RollAvg(Math.round(3 / dt)); this.h5 = new RollAvg(Math.round(5 / dt));
    this.s = {
      t: 0, connected: { trainer: false, hr: false, controller: false, fake: false },
      raw: { power: 0, cadence: 0, speedKph: 0, hr: null, resistanceLevel: null, lastPacketAgeS: Infinity },
      power3s: 0, power10s: 0, cadence3s: 0, hr5s: null, crankRevs: 0,
      powerZone: 1, hrZone: null, effortZone: 1, ftpFraction: 0, sprinting: false, sprintCount: 0,
      kj: 0, activeSeconds: 0, gear: 6, trainerMode: 'none',
    };
  }

  bindTuning(t: Tuning): void { this.sprintFtp = t.num('sprintFtp', 1.2, 0.8, 3, 0.05, 'Sprint threshold as FTP fraction (power3s)'); }

  get(): Readonly<BikeState> { return this.s; }
  setConnected(c: Partial<BikeState['connected']>): void { Object.assign(this.s.connected, c); }
  setGear(g: number): void { this.s.gear = g; }
  setTrainerMode(m: TrainerMode): void { this.s.trainerMode = m; }

  ingestTrainer(x: DeviceSample): void {
    if (x.power !== undefined) this.rawPower = x.power;
    if (x.cadence !== undefined) this.rawCadence = x.cadence;
    if (x.speedKph !== undefined) this.rawSpeed = x.speedKph;
    if (x.resistanceLevel !== undefined) this.rawRes = x.resistanceLevel;
    if (x.hr !== undefined) { this.rawHr = x.hr; this.hrAge = 0; }
    this.trainerAge = 0;
  }
  ingestHr(x: DeviceSample): void {
    if (x.hr !== undefined) { this.rawHr = x.hr; this.hrAge = 0; }
  }

  tick(dt: Seconds, profile: Readonly<Profile>): Readonly<BikeState> {
    const s = this.s;
    s.t += dt; this.trainerAge += dt; this.hrAge += dt;
    const stale = this.trainerAge > STALE_TRAINER_S;
    const power = stale ? 0 : this.rawPower;
    const cad = stale ? 0 : this.rawCadence;
    const hrFresh = this.hrAge <= STALE_HR_S && this.rawHr !== null;
    s.raw = {
      power, cadence: cad, speedKph: stale ? 0 : this.rawSpeed, hr: hrFresh ? this.rawHr : null,
      resistanceLevel: this.rawRes, lastPacketAgeS: this.trainerAge,
    };
    s.power3s = this.p3.push(power); s.power10s = this.p10.push(power); s.cadence3s = this.c3.push(cad);
    if (hrFresh) s.hr5s = this.h5.push(this.rawHr!); else { this.h5.reset(); s.hr5s = null; }

    s.crankRevs += (cad / 60) * dt;
    s.kj += (power * dt) / 1000;
    if (cad > 20) s.activeSeconds += dt;

    const ftp = profile.ftp > 0 ? profile.ftp : 1;
    s.ftpFraction = s.power3s / ftp;
    s.powerZone = powerZoneOf(s.ftpFraction);
    s.hrZone = s.hr5s !== null && profile.maxHr > 0 ? hrZoneOf(s.hr5s / profile.maxHr) : null;
    const pz = Math.min(5, s.powerZone) as BikeState['effortZone'];
    const src = profile.settings.zoneSource;
    s.effortZone = src === 'power' ? pz : src === 'hr' ? (s.hrZone ?? pz) : (hrFresh && s.hrZone !== null ? s.hrZone : pz);

    if (s.ftpFraction >= this.sprintFtp()) {
      this.sprintT += dt;
      if (!s.sprinting && this.sprintT >= 2) { s.sprinting = true; s.sprintCount++; }
    } else { this.sprintT = 0; s.sprinting = false; }
    return s;
  }
}
