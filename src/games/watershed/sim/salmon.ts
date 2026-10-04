// The salmon run: a reward for the river you carved. A school swims up *your* channel from the sea to the spring.
// Cadence is swim speed; steering (lane across the channel) dodges bears on the banks and diving eagles; high falls
// (ridges you didn't cut down) need a spin-up to leap. Each run opens with a camera intro during which the school
// holds still and no predators spawn. Pure and deterministic (rng injected).
//
// Lanes: lane −1..1 maps to x = centre + lane · halfWidth. The fish faces upstream (−y), so its RIGHT is −x (lane −).
// Steering input is in the fish's frame: `steer` > 0 / `nudge` > 0 = towards the fish's right.

import { SEA, type Terrain } from './terrain';

export interface Fish { lane: number; dy: number; dx: number; alive: boolean }
export interface Predator {
  id: number; kind: 'bear' | 'eagle';
  y: number;          // row where it strikes
  side: -1 | 1;       // bear: which bank (lane sign); eagle: unused
  lane: number;       // eagle: target lane
  t: number;          // seconds until the strike (estimate for bears)
  struck: number;     // seconds since the strike, -1 before
  enter: number;      // bear: 0 = still off in the woods, 1 = at the water's edge
  caught: number;     // fish taken by this strike
}
export interface SalmonParams {
  swimMin: number; swimMax: number;   // rows/s at cadNorm 0 / 1
  leapRpm: number;                    // cadence needed to leap falls
  fallsRise: number;                  // water-surface rise over 2 rows that counts as falls
  steerRate: number;                  // lanes/s (d-pad)
  shiftStep: number;                  // lanes per shifter click
  predatorGap: number;                // mean seconds between predators
  catchChance: number;                // chance a fish in a strike zone is taken
  introS: number;                     // first run's camera intro (school holds still)
  introNextS: number;                 // later runs' intro
  restartS: number;                   // pause at the spring before the next school sets off
}
export const DEFAULT_SALMON: SalmonParams = {
  swimMin: 0.5, swimMax: 2.2, leapRpm: 95, fallsRise: 1.6, steerRate: 2.2, shiftStep: 0.45, predatorGap: 11, catchChance: 0.55, introS: 9, introNextS: 4, restartS: 5,
};

export type SalmonCue =
  | { type: 'run'; fish: number } | { type: 'go'; run: number } | { type: 'home'; fish: number; lost: number } | { type: 'leap' } | { type: 'stuck' }
  | { type: 'warn'; kind: 'bear' | 'eagle' } | { type: 'strike'; kind: 'bear' | 'eagle'; caught: number };

const GOAL_Y = 4;

export class SalmonRun {
  active = false;
  run = 0; y = 0; lane = 0; fish: Fish[] = []; predators: Predator[] = [];
  home = 0; lost = 0; needLeap = false; leaping = false; stuck = false;
  intro = 0; introTotal = 0;
  /** River centreline x and half-width per row, from the water-depth grid (smoothed in time). */
  readonly px: Float32Array; readonly pw: Float32Array;
  private pathReady = false;
  private nextPred = 6; private predId = 0; private fallsState: 'none' | 'stuck' | 'leap' = 'none'; private restart = -1; private size = 0; private lostAtLaunch = 0;

  constructor(private t: Terrain, private rng: () => number) {
    this.px = new Float32Array(t.ny).fill(t.nx / 2); this.pw = new Float32Array(t.ny).fill(2);
    this.row = new Float32Array(t.nx);
  }

  /** Rows (ahead of the school, when last traced) where the channel forks. */
  forks: number[] = [];
  private row: Float32Array;

  /**
   * Trace the channel the school will swim, from the river mouth upstream, following real channels (not an average of
   * them): per row, the local depth maxima near the previous row's x are the candidate channels. At a fork the school
   * takes the branch on the side it is steering toward (lane > 0 = larger x), else the nearest. Smoothed in time.
   */
  updatePath(w: Float32Array): void {
    const { nx, ny, coastY } = this.t, r = this.row;
    const blur = (j: number) => { for (let i = 0; i < nx; i++) r[i] = (w[j * nx + Math.max(0, i - 1)] + 2 * w[j * nx + i] + w[j * nx + Math.min(nx - 1, i + 1)]) / 4; };
    blur(Math.min(ny - 1, coastY));
    let x = nx / 2, best = -1;
    for (let i = 0; i < nx; i++) if (r[i] > best) { best = r[i]; x = i; }
    const k = this.pathReady ? 0.6 : 1, forks: number[] = [];
    for (let j = ny - 1; j >= 0; j--) {
      let nxp = x, hw = 3;
      if (j <= coastY + 3) {
        blur(j);
        let cands: number[] = [];
        const scan = (span: number) => {
          const out: number[] = [];
          for (let i = Math.max(1, Math.floor(x - span)); i <= Math.min(nx - 2, Math.ceil(x + span)); i++) if (r[i] > 0.05 && r[i] >= r[i - 1] && r[i] >= r[i + 1]) out.push(i);
          return out;
        };
        cands = scan(7);
        if (!cands.length) {
          // lost the channel (a dry stretch): jump to the nearest water in the row rather than walking over dry land
          const wide = scan(25);
          if (wide.length) cands = [wide.reduce((a, c) => (Math.abs(c - x) < Math.abs(a - x) ? c : a))];
        }
        // group maxima closer than 3 cells (one channel, or a flat-topped one) and take each group's middle
        const ch: number[] = [];
        for (let n = 0; n < cands.length;) {
          let m = n; while (m + 1 < cands.length && cands[m + 1] - cands[m] < 3) m++;
          ch.push(Math.round((cands[n] + cands[m]) / 2)); n = m + 1;
        }
        if (ch.length > 1) forks.push(j);
        if (ch.length) {
          const lean = this.lane;
          nxp = ch.length > 1 && Math.abs(lean) > 0.3
            ? (lean > 0 ? Math.max(...ch) : Math.min(...ch))
            : ch.reduce((a, c) => (Math.abs(c - x) < Math.abs(a - x) ? c : a));
          let wet = 0; for (let i = nxp; i < nx && r[i] > 0.05; i++) wet++; for (let i = nxp - 1; i >= 0 && r[i] > 0.05; i--) wet++;
          hw = Math.max(1.5, Math.min(6, wet / 2));
        } else hw = 1.5;
      }
      this.px[j] += (nxp - this.px[j]) * k; this.pw[j] += (hw - this.pw[j]) * k;
      x = nxp;
    }
    this.forks = forks;
    this.pathReady = true;
  }

  /** Is there a fork within the next `rows` rows upstream of the school? */
  forkAhead(rows = 16): boolean { return this.forks.some((j) => j < this.y - 2 && j > this.y - rows); }

  private at(f: Float32Array, y: number): number {
    const j = Math.max(0, Math.min(this.t.ny - 1.001, y)), i = Math.floor(j);
    return f[i] + (f[i + 1] - f[i]) * (j - i);
  }
  /** Grid position of a point `lane` (−1..1 across the channel) at row y. */
  pos(y: number, lane: number): { x: number; y: number } {
    return { x: this.at(this.px, y) + lane * this.at(this.pw, y) * 0.8, y };
  }

  start(size: number, p: SalmonParams): void {
    this.active = true; this.size = size; this.run = 0; this.restart = -1;
    this.launch(p);
  }
  stop(): void { this.active = false; this.predators = []; this.restart = -1; }

  private launch(p: SalmonParams): void {
    this.introTotal = this.intro = this.run === 0 ? p.introS : p.introNextS;
    this.run++; this.lostAtLaunch = this.lost; this.y = this.t.ny - 6; this.fallsState = 'none'; this.lane = 0; this.predators = []; this.nextPred = 6;
    this.fish = [];
    for (let i = 0; i < this.size; i++) {
      const a = this.rng(), b = this.rng();
      this.fish.push({ lane: (a - 0.5) * 0.9, dx: (a - 0.5) * 0.9, dy: 1 + b * 4.5, alive: true });
    }
  }

  private surf(h: Float32Array, w: Float32Array, y: number): number {
    const p = this.pos(y, 0), { nx, ny } = this.t;
    const i = Math.max(0, Math.min(nx - 1, Math.round(p.x))), j = Math.max(0, Math.min(ny - 1, Math.round(y)));
    return Math.max(h[j * nx + i], SEA) + w[j * nx + i];
  }

  update(dt: number, w: Float32Array, inp: { cadence: number; cadNorm: number; steer: number; nudge: number; autopilot: boolean; mayRestart: boolean; sprint?: boolean }, p: SalmonParams): SalmonCue[] {
    const cues: SalmonCue[] = [];
    if (!this.active) return cues;
    if (this.restart >= 0) {
      this.restart -= dt;
      if (this.restart < 0) { if (inp.mayRestart) { this.launch(p); cues.push({ type: 'run', fish: this.size + 1 }); } else this.stop(); }
      return cues;
    }
    if (this.intro > 0) {
      this.intro = Math.max(0, this.intro - dt);
      if (this.intro === 0) cues.push({ type: 'go', run: this.run });
      return cues;
    }

    // steering
    let target = this.lane;
    if (inp.autopilot) {
      target = 0;
      for (const pr of this.predators) if (pr.struck < 0 && pr.t < 4) target = pr.kind === 'bear' ? -pr.side * 0.85 : pr.lane > 0 ? -0.8 : 0.8;
      this.lane += Math.max(-p.steerRate * dt, Math.min(p.steerRate * dt, target - this.lane));
    } else this.lane -= inp.steer * p.steerRate * dt + inp.nudge * p.shiftStep; // fish's right = lane −
    this.lane = Math.max(-1, Math.min(1, this.lane));
    for (const f of this.fish) f.lane += (this.lane + f.dx - f.lane) * (1 - Math.exp(-dt / 0.45));

    // swimming + falls
    const h = this.t.h;
    const rise = this.surf(h, w, this.y - 2) - this.surf(h, w, this.y);
    const falls = rise > p.fallsRise;
    this.needLeap = falls || this.surf(h, w, this.y - 5) - this.surf(h, w, this.y - 3) > p.fallsRise;
    let v = p.swimMin + (p.swimMax - p.swimMin) * inp.cadNorm;
    if (inp.sprint) v *= 1.8;
    if (inp.cadence < 20) v = 0;
    this.leaping = falls && inp.cadence >= p.leapRpm;
    this.stuck = falls && !this.leaping;
    if (this.stuck) v = 0;
    const fs = this.stuck ? 'stuck' : this.leaping ? 'leap' : 'none';
    if (fs !== this.fallsState && fs !== 'none') cues.push({ type: fs });
    this.fallsState = fs;
    this.y -= v * dt;

    // predators: each run is harder (more often, less warning, hungrier)
    const lvl = Math.min(3, this.run - 1);
    const eagleT = Math.max(1.8, 3 - 0.4 * lvl), catchP = Math.min(0.85, p.catchChance + 0.08 * lvl);
    this.nextPred -= dt;
    if (this.nextPred <= 0 && this.y > GOAL_Y + 14) {
      this.nextPred = p.predatorGap * Math.max(0.55, 1 - 0.15 * lvl) * (0.7 + 0.6 * this.rng());
      const kind: 'bear' | 'eagle' = this.rng() < 0.5 ? 'bear' : 'eagle';
      // bears charge in from the woods and arrive at the bank just before the school does
      const vv = Math.max(0.6, v);
      const ahead = kind === 'bear' ? vv * (3 + this.rng()) + 2 : Math.max(2, vv * eagleT);
      this.predators.push({ id: ++this.predId, kind, y: this.y - ahead, side: this.rng() < 0.5 ? -1 : 1, lane: this.lane, t: kind === 'eagle' ? eagleT : ahead / vv, struck: -1, caught: 0, enter: kind === 'eagle' ? 1 : 0 });
      cues.push({ type: 'warn', kind });
    }
    for (const pr of this.predators) {
      if (pr.kind === 'bear') pr.enter = pr.struck >= 0 ? Math.max(0, pr.enter - dt / 1.2 * (pr.struck > 0.6 ? 1 : 0)) : Math.min(1, pr.enter + dt / 1.8);
      if (pr.struck >= 0) { pr.struck += dt; continue; }
      if (pr.kind === 'eagle') pr.t -= dt; else pr.t = (this.y - pr.y) / Math.max(0.3, v);
      const strike = pr.kind === 'eagle' ? pr.t <= 0 : this.y <= pr.y + 0.5;
      if (!strike) continue;
      pr.struck = 0;
      for (const f of this.fish) {
        if (!f.alive) continue;
        const inZone = pr.kind === 'bear' ? pr.side * f.lane > 0.05 : Math.abs(f.lane - pr.lane) < 0.38 && Math.abs(this.y + f.dy - pr.y) < 3;
        if (inZone && this.rng() < catchP) { f.alive = false; pr.caught++; this.lost++; }
      }
      cues.push({ type: 'strike', kind: pr.kind, caught: pr.caught });
    }
    this.predators = this.predators.filter((pr) => pr.struck < (pr.kind === 'bear' ? 2 : 2.5));

    if (this.y <= GOAL_Y) {
      const n = this.fish.filter((f) => f.alive).length + 1;
      this.home += n; cues.push({ type: 'home', fish: n, lost: this.lost - this.lostAtLaunch });
      this.predators = []; this.restart = p.restartS;
    }
    return cues;
  }

  alive(): number { return this.fish.filter((f) => f.alive).length + 1; }

  /** Unit vector (grid) pointing upstream along the channel at row y. */
  heading(y: number): { x: number; y: number } {
    const a = this.pos(y + 3, 0), b = this.pos(y - 3, 0);
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l };
  }
}
