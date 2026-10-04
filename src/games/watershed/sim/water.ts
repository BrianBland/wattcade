// Particle water + hydraulic erosion on the valley heightfield. Pure and deterministic (rng is injected).
//
// Each particle is a parcel of water (volume `vol`) moving in the plane. Every substep:
//  1. particles splat their volume into a depth grid `w` (bilinear),
//  2. each particle accelerates down the gradient of the free surface s = max(h, SEA) + pressure·w
//     (so water piles up, spreads and pools like a cheap shallow-water/SPH hybrid; a particle exerts no net force on itself),
//  3. friction (stronger in shallow water), move, wall bounce,
//  4. erosion/deposition: carrying capacity grows with speed, slope and volume; heavy parcels dig harder.
// Thermal slumping keeps carved banks from going vertical.

import { FLOOR, SEA, sample, type Terrain } from './terrain';

export interface WaterParams {
  gravity: number;        // accel per unit surface slope
  pressure: number;       // how strongly water depth pushes water apart (spreading/pooling)
  friction: number;       // base drag (1/s)
  shallowDrag: number;    // extra drag in thin water: shallowDrag / (depth + 0.1)
  vmax: number;           // speed cap, cells/s
  capacity: number;       // sediment carried per (vol · speed · slope)
  erode: number;          // pickup rate (1/s) toward capacity
  deposit: number;        // drop rate (1/s) above capacity
  minSlope: number;       // capacity floor on flats, so slow water still carries a little
  massExp: number;        // erosion ∝ (vol / refVol)^massExp: heavy parcels dig harder
  maxAge: number;         // seconds before a parcel soaks in / evaporates
  seaDrift: number;       // offshore current in the sea (cells/s²)
  seaLife: number;        // seconds a parcel survives once it reaches the sea
  talus: number;          // max soil height difference between neighbours before it slumps
  talusRock: number;      // same for hard rock
  slump: number;          // fraction of the excess moved per thermal pass
  dragExp: number;        // drag ∝ (vol / refVol)^dragExp: light parcels run faster
  depositExp: number;     // deposit rate ∝ (vol / refVol)^depositExp: light parcels keep silt suspended
  bedrock: number;        // cut depth (below the starting surface) at which erosion fades to 10 %
  brush: number;          // erosion/deposition brush radius, cells
}

export const DEFAULT_WATER: WaterParams = {
  gravity: 22, pressure: 1.2, friction: 0.5, shallowDrag: 0.25, vmax: 12,
  capacity: 0.9, erode: 0.2, deposit: 0.6, minSlope: 0.02, massExp: 1.4,
  maxAge: 75, seaDrift: 1.2, seaLife: 10, talus: 1.1, talusRock: 2.6, slump: 0.3,
  dragExp: 0.6, depositExp: 1.2, bedrock: 9, brush: 1.6,
};

/** Water emitted this step by the rider. */
export interface Emit {
  flow: number;       // volume per second
  dropVol: number;    // volume per parcel (big = heavy, slow, carving; small = light, fast, spraying)
  speed: number;      // initial downstream speed, cells/s
  sourceX: number;    // across-valley position of the spring
  spread: number;     // spawn spread across the valley, cells
  erodeMul: number;   // multiplier on erosion (cadence-in-band bonus)
  /** Rain: spawn parcels at rest anywhere in this disc (cells) instead of at the spring. */
  area?: { x: number; y: number; r: number; w?: number; h?: number };   // disc of radius r, or a w × h rectangle
  /** Several springs: each parcel picks one by share (sourceX is ignored when present). */
  sources?: Array<{ x: number; share: number }>;
}

export const REF_VOL = 0.35;

export interface WaterStats { eroded: number; deposited: number; toSea: number; spawned: number; dropped: number }

export class Water {
  readonly max: number;
  n = 0;
  readonly x: Float32Array; readonly y: Float32Array;
  readonly vx: Float32Array; readonly vy: Float32Array;
  readonly vol: Float32Array; readonly sed: Float32Array; readonly age: Float32Array;
  /** Per-parcel size factors (vol/REF_VOL)^exp, cached at spawn: drag, deposit, dig. */
  private kDrag: Float32Array; private kDep: Float32Array; private kDig: Float32Array;
  private bk = new Int32Array(64); private bw = new Float32Array(64);
  /** Water depth per cell from the last splat. */
  readonly w: Float32Array;
  private gx: Float32Array; private gy: Float32Array; private s: Float32Array;
  private spawnAcc = 0;
  private thermalAcc = 0;
  stats: WaterStats = { eroded: 0, deposited: 0, toSea: 0, spawned: 0, dropped: 0 };
  /** Bumped whenever terrain heights change (renderers re-upload on change). */
  version = 0;

  constructor(readonly t: Terrain, private rng: () => number, max = 3000) {
    this.max = max;
    const f = () => new Float32Array(max);
    this.x = f(); this.y = f(); this.vx = f(); this.vy = f(); this.vol = f(); this.sed = f(); this.age = f();
    this.kDrag = f(); this.kDep = f(); this.kDig = f();
    const cells = t.nx * t.ny;
    this.w = new Float32Array(cells); this.gx = new Float32Array(cells); this.gy = new Float32Array(cells); this.s = new Float32Array(cells);
  }

  step(dt: number, emit: Emit, p: WaterParams, substeps = 2): void {
    this.spawn(dt, emit, p);
    const h = dt / substeps;
    for (let k = 0; k < substeps; k++) this.substep(h, emit.erodeMul, p);
    this.thermalAcc += dt;
    if (this.thermalAcc >= 0.2) { this.thermal(p); this.thermalAcc = 0; }
    this.version++;
  }

  private spawn(dt: number, e: Emit, p: WaterParams): void {
    if (e.flow <= 0 || e.dropVol <= 0) return;
    // near the particle cap, emit bigger parcels instead of dropping water
    const fill = this.n / this.max;
    const vol = e.dropVol * (1 + 3 * Math.max(0, (fill - 0.8) / 0.2));
    this.spawnAcc += (e.flow * dt) / vol;
    const { nx } = this.t;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.n >= this.max) { this.stats.dropped++; continue; }
      const i = this.n++;
      const r1 = this.rng(), r2 = this.rng(), r3 = this.rng();
      if (e.area) {
        const ar = e.area;
        const ox = ar.w ? (r1 - 0.5) * ar.w : Math.cos(r1 * Math.PI * 2) * Math.sqrt(r2) * ar.r;
        const oy = ar.h ? (r2 - 0.5) * ar.h : Math.sin(r1 * Math.PI * 2) * Math.sqrt(r2) * ar.r;
        this.x[i] = Math.min(nx - 2, Math.max(1, ar.x + ox));
        this.y[i] = Math.min(this.t.ny - 2, Math.max(1, ar.y + oy));
        this.vx[i] = 0; this.vy[i] = (r3 - 0.5) * 0.5;
      } else {
        let sx = e.sourceX;
        if (e.sources && e.sources.length > 1) {
          let pick = this.rng(), k = 0;
          while (k < e.sources.length - 1 && pick > e.sources[k].share) { pick -= e.sources[k].share; k++; }
          sx = e.sources[k].x;
        } else if (e.sources?.length) sx = e.sources[0].x;
        this.x[i] = Math.min(nx - 2, Math.max(1, sx + (r1 - 0.5) * 2 * e.spread));
        this.y[i] = 1 + r2 * 2;
        this.vx[i] = (r3 - 0.5) * e.speed * 0.6;
        this.vy[i] = e.speed;
      }
      this.vol[i] = vol; this.sed[i] = 0; this.age[i] = 0;
      const rel = vol / REF_VOL;
      this.kDrag[i] = Math.pow(rel, p.dragExp); this.kDep[i] = Math.pow(rel, p.depositExp); this.kDig[i] = Math.pow(rel, p.massExp);
      this.stats.spawned++;
    }
  }

  private splat(): void {
    const { nx, ny } = this.t, w = this.w;
    w.fill(0);
    for (let p = 0; p < this.n; p++) {
      const x = Math.min(nx - 1.001, Math.max(0, this.x[p])), y = Math.min(ny - 1.001, Math.max(0, this.y[p]));
      const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, k = j * nx + i, v = this.vol[p];
      w[k] += v * (1 - fx) * (1 - fy); w[k + 1] += v * fx * (1 - fy);
      w[k + nx] += v * (1 - fx) * fy; w[k + nx + 1] += v * fx * fy;
    }
  }

  private gradients(pressure: number): void {
    const { nx, ny, h } = this.t, { w, s, gx, gy } = this;
    for (let k = 0; k < nx * ny; k++) s[k] = Math.max(h[k], SEA) + pressure * w[k];
    for (let j = 0; j < ny; j++) {
      const jm = j > 0 ? j - 1 : j, jp = j < ny - 1 ? j + 1 : j;
      for (let i = 0; i < nx; i++) {
        const im = i > 0 ? i - 1 : i, ip = i < nx - 1 ? i + 1 : i, k = j * nx + i;
        gx[k] = (s[j * nx + ip] - s[j * nx + im]) / (ip - im);
        gy[k] = (s[jp * nx + i] - s[jm * nx + i]) / (jp - jm);
      }
    }
  }

  private substep(dt: number, erodeMul: number, p: WaterParams): void {
    const t = this.t, { nx, ny } = t, hgt = t.h;
    this.splat();
    this.gradients(p.pressure);
    for (let q = 0; q < this.n; q++) {
      let x = this.x[q], y = this.y[q], vx = this.vx[q], vy = this.vy[q];
      const ax = -p.gravity * sample(this.gx, nx, ny, x, y), ay = -p.gravity * sample(this.gy, nx, ny, x, y);
      const ground = sample(hgt, nx, ny, x, y);
      const inSea = ground < SEA;
      const depth = inSea ? SEA - ground + sample(this.w, nx, ny, x, y) : sample(this.w, nx, ny, x, y);
      vx += ax * dt; vy += ay * dt + (inSea ? p.seaDrift * dt : 0);
      const drag = (p.friction + p.shallowDrag / (depth + 0.1) + (inSea ? 0.6 : 0)) * this.kDrag[q];
      const damp = 1 / (1 + drag * dt);
      vx *= damp; vy *= damp;
      let sp = Math.hypot(vx, vy);
      if (sp > p.vmax) { vx *= p.vmax / sp; vy *= p.vmax / sp; sp = p.vmax; }
      x += vx * dt; y += vy * dt;
      if (x < 0.5) { x = 0.5; vx = Math.abs(vx) * 0.3; }
      else if (x > nx - 1.5) { x = nx - 1.5; vx = -Math.abs(vx) * 0.3; }
      if (y < 0.5) { y = 0.5; vy = Math.abs(vy) * 0.3; }
      this.age[q] += dt;
      if (inSea && this.age[q] < p.maxAge - p.seaLife) this.age[q] = p.maxAge - p.seaLife;
      if (y > ny - 1.5) { this.stats.toSea += this.sed[q]; this.kill(q--); continue; }
      if (this.age[q] > p.maxAge) { this.drop(x, y, this.sed[q], p.brush); this.kill(q--); continue; }
      this.x[q] = x; this.y[q] = y; this.vx[q] = vx; this.vy[q] = vy;

      // erosion / deposition at the new position
      const gh = Math.hypot(sample(this.gx, nx, ny, x, y), sample(this.gy, nx, ny, x, y));
      const vol = this.vol[q];
      const cap = p.capacity * vol * sp * Math.max(gh, p.minSlope);
      const sed = this.sed[q];
      if (sed > cap) {
        const d = Math.min(sed, (sed - cap) * p.deposit * this.kDep[q] * dt);
        this.sed[q] = sed - d; this.drop(x, y, d, p.brush);
      } else if (!inSea) {
        const mass = this.kDig[q];
        const i = Math.floor(x), j = Math.floor(y);
        const k = j * nx + i;
        const hard = t.hard[k] * Math.max(0.1, 1 - (t.h0[k] - t.h[k]) / p.bedrock);
        let e = (cap - sed) * p.erode * dt * hard * mass * erodeMul;
        e = Math.min(e, 0.05, Math.max(0, ground - FLOOR));
        if (e > 0) { this.dig(x, y, e, p.brush); this.sed[q] = sed + e; }
      }
    }
  }

  /** Remove particle q (swap with the last). */
  private kill(q: number): void {
    const l = --this.n;
    if (q === l) return;
    this.x[q] = this.x[l]; this.y[q] = this.y[l]; this.vx[q] = this.vx[l]; this.vy[q] = this.vy[l];
    this.vol[q] = this.vol[l]; this.sed[q] = this.sed[l]; this.age[q] = this.age[l];
    this.kDrag[q] = this.kDrag[l]; this.kDep[q] = this.kDep[l]; this.kDig[q] = this.kDig[l];
  }

  /** Add `amt` (negative = remove) spread over a round brush of radius r around (x, y). */
  private addAt(x: number, y: number, amt: number, r: number): void {
    const { nx, ny, h } = this.t, bk = this.bk, bw = this.bw;
    const R = Math.min(3, Math.ceil(r)), ci = Math.round(x), cj = Math.round(y), r2 = r * r;
    let n = 0, sum = 0;
    for (let dj = -R; dj <= R; dj++) {
      const j = cj + dj; if (j < 0 || j >= ny) continue;
      const ddy = j - y;
      for (let di = -R; di <= R; di++) {
        const i = ci + di; if (i < 0 || i >= nx) continue;
        const ddx = i - x, d2 = ddx * ddx + ddy * ddy;
        if (d2 >= r2) continue;
        const wgt = r - Math.sqrt(d2);
        bk[n] = j * nx + i; bw[n++] = wgt; sum += wgt;
      }
    }
    if (sum <= 0) return;
    const k = amt / sum;
    for (let m = 0; m < n; m++) h[bk[m]] += bw[m] * k;
  }
  private drop(x: number, y: number, amt: number, r: number): void { if (amt > 0) { this.addAt(x, y, amt, r); this.stats.deposited += amt; } }
  private dig(x: number, y: number, amt: number, r: number): void { this.addAt(x, y, -amt, r); this.stats.eroded += amt; }

  /** Thermal erosion: move material down any neighbour step steeper than the talus angle. */
  private thermal(p: WaterParams): number {
    const { nx, ny, h, hard } = this.t;
    let moved = 0;
    const pair = (a: number, b: number) => {
      const d = h[a] - h[b];
      const hi = d > 0 ? a : b, lo = d > 0 ? b : a, ad = Math.abs(d);
      const tal = p.talusRock + (p.talus - p.talusRock) * Math.min(1, hard[hi]);
      if (ad <= tal) return;
      const m = p.slump * (ad - tal) * 0.5;
      h[hi] -= m; h[lo] += m; moved += m;
    };
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (i < nx - 1) pair(k, k + 1);
      if (j < ny - 1) pair(k, k + nx);
    }
    return moved;
  }

  /** Let freshly generated terrain slump to its talus angles, then make that the starting surface. */
  settle(p: WaterParams, maxPasses = 600): void {
    for (let i = 0; i < maxPasses && this.thermal(p) > 1e-3; i++);
    this.t.h0.set(this.t.h);
  }

  /** Total sediment currently suspended in the water. */
  suspended(): number { let s = 0; for (let q = 0; q < this.n; q++) s += this.sed[q]; return s; }
}
