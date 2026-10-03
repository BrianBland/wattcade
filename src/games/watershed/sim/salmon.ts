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
  }

  /** Re-trace the river from the depth grid: per row, the depth-weighted centre and wet half-width. */
  updatePath(w: Float32Array): void {
    const { nx, ny, coastY } = this.t;
    let lastX = this.pathReady ? this.px[2] : nx / 2;
    const k = this.pathReady ? 0.3 : 1;
    for (let j = 0; j < ny; j++) {
      let s = 0, sx = 0, wet = 0;
      for (let i = 0; i < nx; i++) { const d = w[j * nx + i]; if (d > 0.05) { s += d; sx += d * i; wet++; } }
      const x = s > 0.2 ? sx / s : lastX;
      const hw = j > coastY + 3 ? 3 : Math.max(1.5, Math.min(6, wet / 2));
      this.px[j] += (x - this.px[j]) * k; this.pw[j] += (hw - this.pw[j]) * k;
      lastX = this.px[j];
    }
    this.pathReady = true;
  }

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

    // predators
    this.nextPred -= dt;
    if (this.nextPred <= 0 && this.y > GOAL_Y + 14) {
      this.nextPred = p.predatorGap * (0.7 + 0.6 * this.rng());
      const kind: 'bear' | 'eagle' = this.rng() < 0.5 ? 'bear' : 'eagle';
      const ahead = kind === 'bear' ? 9 + 5 * this.rng() : Math.max(2, v * 3);
      this.predators.push({ id: ++this.predId, kind, y: this.y - ahead, side: this.rng() < 0.5 ? -1 : 1, lane: this.lane, t: kind === 'eagle' ? 3 : ahead / Math.max(0.3, v), struck: -1, caught: 0 });
      cues.push({ type: 'warn', kind });
    }
    for (const pr of this.predators) {
      if (pr.struck >= 0) { pr.struck += dt; continue; }
      if (pr.kind === 'eagle') pr.t -= dt; else pr.t = (this.y - pr.y) / Math.max(0.3, v);
      const strike = pr.kind === 'eagle' ? pr.t <= 0 : this.y <= pr.y + 0.5;
      if (!strike) continue;
      pr.struck = 0;
      for (const f of this.fish) {
        if (!f.alive) continue;
        const inZone = pr.kind === 'bear' ? pr.side * f.lane > 0.05 : Math.abs(f.lane - pr.lane) < 0.38 && Math.abs(this.y + f.dy - pr.y) < 3;
        if (inZone && this.rng() < p.catchChance) { f.alive = false; pr.caught++; this.lost++; }
      }
      cues.push({ type: 'strike', kind: pr.kind, caught: pr.caught });
    }
    this.predators = this.predators.filter((pr) => pr.struck < 2.5);

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
