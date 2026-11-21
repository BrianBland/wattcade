// River jobs: places on the map that need the river in a particular place and form, and the per-block objectives that
// ask for them. Pure and deterministic. The water sim stays the truth; this module only measures it (and, for beaver
// dams, raises the terrain, which the water then really has to erode away).
//
//  - Grist mill (overshot wheel), below the shallowest saddle of ridge 1: turns properly only with HEAVY water (grind).
//  - Sawmill (undershot wheel), below the deepest saddle of ridge 2 (on the natural route): FAST water only (spin).
//  - Millbrook, a village on a low terrace by the floodplain: floods unless the river has a channel deep enough.
//  - Fields around the side basin and on the coastal plain: grow while water runs beside them, ruined if drowned.
//  - Beavers dam a slow stretch during the still pools; fast water erodes the dam (it is real terrain).

import type { Terrain } from './terrain';
import type { GoalKind } from './levels';

export type ObjectiveKind = 'grist' | 'saw' | 'village' | 'dam' | 'fields';
export interface Mill { kind: 'grist' | 'saw'; x: number; y: number; spin: number; fit: number; output: number; fitS: number }
export interface Field { x: number; y: number; r: number; growth: number; wet: boolean; drowned: boolean; harvests: number }
/**
 * A dam is real terrain raised over `cells`. `beaver` = the free ride's random dam; `gate` = a campaign beaver gate the
 * rider placed (built at `rate` per second, set by the sim from time in the band); `log` = an old log dam a level starts with.
 */
export interface Dam { kind: 'beaver' | 'gate' | 'log'; x: number; y: number; build: number; height: number; rate: number; added: Float32Array; base: Float32Array; cells: Int32Array; broken: boolean; health: number }
/** Millbrook's levee: a ring of raised earth the villagers build (and patch) up to `build` × its full height. */
export interface Levee { build: number; height: number; cells: Int32Array; base: Float32Array }
export interface Objective { kind: ObjectiveKind | GoalKind; title: string; goal: string; progress: number; state: 'active' | 'done' | 'failed'; target: { x: number; y: number } | null }
export type JobCue = { type: 'objectiveDone'; kind: ObjectiveKind } | { type: 'objectiveFailed'; kind: ObjectiveKind } | { type: 'harvest' }
  | { type: 'beavers' } | { type: 'damBroken' } | { type: 'flooding' } | { type: 'millTurning'; kind: 'grist' | 'saw' };

export interface Particles { n: number; x: Float32Array; y: Float32Array; vx: Float32Array; vy: Float32Array; vol: Float32Array }

export class Jobs {
  mills: Mill[];
  village: { x: number; y: number; r: number; wet: number; floodS: number; floodBlockS: number };
  fields: Field[];
  dam: Dam | null = null;
  levee: Levee | null = null;
  objective: Objective | null = null;
  damsBroken = 0; harvests = 0; objectivesDone = 0;
  /** Field-seconds spent drowned (river phases). */
  drownedS = 0;
  /** Count Millbrook's flooding even without a village objective (campaign surges). */
  watchVillage = false;
  private acc = 0; private wasTurning = { grist: false, saw: false }; private floodCued = false;

  constructor(private t: Terrain) {
    const { nx, ny, saddles, ridges, side } = t;
    // saddles ranked by crest height (the cross-tilt matters as much as the notch depth). The grist mill sits behind the
    // second-lowest crest: the river doesn't take it by itself, but the current can tip it over (the highest can be
    // metres higher, out of reach)
    const crest = (s: { ridge: number; x: number }) => t.h[s.ridge * nx + s.x];
    const shallowest = (r: number) => { const q = saddles.filter((s) => s.ridge === r).sort((a, b) => crest(a) - crest(b)); return q[Math.min(1, q.length - 1)]; };
    // the grist mill is a routing puzzle (behind the saddle the river doesn't take by itself); the sawmill sits on the
    // natural route below ridge 2 and is a cadence puzzle (it wants fast water)
    const deepest = (r: number) => saddles.filter((s) => s.ridge === r).reduce((a, s) => (crest(s) < crest(a) ? s : a));   // the lowest crest: the natural route
    const g = shallowest(ridges[0]), sw = deepest(ridges[1]);
    this.mills = [
      { kind: 'grist', x: g.x, y: ridges[0] + 6, spin: 0, fit: 0, output: 0, fitS: 0 },
      { kind: 'saw', x: sw.x, y: ridges[1] + 6, spin: 0, fit: 0, output: 0, fitS: 0 },
    ];
    const vSide = side.x < nx / 2 ? 1 : -1;
    this.village = { x: Math.round(nx / 2 + vSide * 15), y: Math.round(ny * 0.66), r: 5, wet: 0, floodS: 0, floodBlockS: 0 };
    this.fields = [
      { x: side.x - 7, y: side.y - 6 }, { x: side.x + 7, y: side.y - 4 }, { x: side.x, y: side.y + 8 },
      { x: Math.round(nx * 0.3), y: Math.round(ny * 0.76) }, { x: Math.round(nx * 0.7), y: Math.round(ny * 0.76) },
    ].map((f) => ({ ...f, r: 3.5, growth: 0, wet: false, drowned: false, harvests: 0 }));
  }

  /** Start the objective for a river block (null for blocks without one). `blockS` = block length in seconds. */
  begin(kind: ObjectiveKind | null, blockS: number): void {
    if (!kind) { this.objective = null; return; }
    if (kind === 'dam' && !this.dam) kind = 'fields';
    const m = (k: 'grist' | 'saw') => this.mills.find((q) => q.kind === k)!;
    const o: Record<ObjectiveKind, [string, string, { x: number; y: number } | null]> = {
      grist: ['Turn the grist mill', 'Cut through to it, then grind: it needs heavy water', m('grist')],
      saw: ['Spin the sawmill', 'Reach it with fast water: spin!', m('saw')],
      village: ['Keep Millbrook dry', 'A deep channel holds the flood: grind it out', this.village],
      dam: ['Break the beaver dam', 'Fast water wears it away: spin hard (A: surge)', this.dam],
      fields: ['Water the fields', 'Steer the river beside the fields (not over them)', this.fields[0]],
    };
    const [title, goal, target] = o[kind];
    this.objective = { kind, title, goal, progress: 0, state: 'active', target: target ? { x: target.x, y: target.y } : null };
    this.blockS = blockS; this.village.floodBlockS = 0;
    for (const mm of this.mills) mm.fitS = 0;
    this.fieldsAtStart = this.harvests;
  }
  private blockS = 240; private fieldsAtStart = 0;

  /** Close the current objective at the end of its block. */
  end(): JobCue[] {
    const o = this.objective; if (!o || o.state !== 'active') return [];
    const ok = o.kind === 'village' ? this.village.floodBlockS < 10 : o.progress >= 1;
    o.state = ok ? 'done' : 'failed';
    if (ok) this.objectivesDone++;
    return [{ type: ok ? 'objectiveDone' : 'objectiveFailed', kind: o.kind as ObjectiveKind }];
  }

  /** Beavers move in: dam a deep, gently sloping (slow) stretch of the river below ridge 1. */
  beavers(w: Float32Array): JobCue[] {
    if (this.dam && !this.dam.broken) return [];
    const { nx, ny, ridges, coastY } = this.t;
    let best = -1, bx = 0, by = 0;
    for (let j = ridges[0] + 8; j < coastY - 6; j += 2) for (let i = 8; i < nx - 8; i += 2) {
      const d = w[j * nx + i];
      if (d < 0.25) continue;
      const k = j * nx + i, slope = Math.abs(this.t.h[k + nx] - this.t.h[k - nx]) / 2;
      const score = d - 1.5 * slope;
      if (score > best) { best = score; bx = i; by = j; }
    }
    if (best < 0) return [];
    const cells: number[] = [];
    for (let j = by - 1; j <= by + 1; j++) for (let i = bx - 5; i <= bx + 5; i++) if (i >= 0 && i < nx && j >= 0 && j < ny) cells.push(j * nx + i);
    this.dam = this.makeDam('beaver', bx, by, 5, 1.3, 1 / 25);
    return [{ type: 'beavers' }];
  }

  private makeDam(kind: Dam['kind'], x: number, y: number, half: number, height: number, rate: number): Dam {
    const { nx, ny } = this.t, cells: number[] = [];
    for (let j = y - 1; j <= y + 1; j++) for (let i = x - half; i <= x + half; i++) if (i >= 0 && i < nx && j >= 0 && j < ny) cells.push(j * nx + i);
    return { kind, x, y, build: 0, height, rate, added: new Float32Array(cells.length), base: Float32Array.from(cells, (k) => this.t.h[k]), cells: Int32Array.from(cells), broken: false, health: 1 };
  }

  /** Take the standing dam down (whatever of it the water left), e.g. when the crew moves the gate. */
  removeDam(): void {
    const d = this.dam; if (!d) return;
    const { h } = this.t;
    d.cells.forEach((k, n) => { h[k] -= Math.max(0, Math.min(d.added[n], h[k] - d.base[n])); });
    this.dam = null;
  }

  /** Campaign: the beaver crew gates the saddle at (x, y) (replacing any gate already standing). Built at `rate`/s. */
  gate(x: number, y: number, height: number, rate: number): Dam {
    this.removeDam();
    this.dam = this.makeDam('gate', Math.round(x), Math.round(y), 6, height, rate);
    return this.dam;
  }

  /** Campaign: an old log dam, already standing (harder than beaver mud). */
  logDam(x: number, y: number, height: number, hard: number): Dam {
    this.removeDam();
    const d = this.dam = this.makeDam('log', Math.round(x), Math.round(y), 6, height, 0);
    const { h } = this.t;
    // it's part of the level's starting valley (h0 too), so it reads as ground, not as fresh deposit
    d.cells.forEach((k, n) => { h[k] += height; this.t.h0[k] += height; d.added[n] = height; this.t.hard[k] = Math.min(this.t.hard[k], hard); });
    d.build = 1;
    return d;
  }

  /** Campaign: lay out Millbrook's levee ring (nothing raised yet). */
  planLevee(height: number): Levee {
    const { nx } = this.t, v = this.village, cells: number[] = [];
    const r0 = v.r + 1.5, r1 = v.r + 3.2;
    for (let j = Math.floor(v.y - r1); j <= Math.ceil(v.y + r1); j++) for (let i = Math.floor(v.x - r1); i <= Math.ceil(v.x + r1); i++) {
      const d = Math.hypot(i - v.x, j - v.y);
      if (d >= r0 && d <= r1) cells.push(j * nx + i);
    }
    this.levee = { build: 0, height, cells: Int32Array.from(cells), base: Float32Array.from(cells, (k) => this.t.h[k]) };
    return this.levee;
  }

  /** The villagers raise (and patch) the levee: build grows by `grow`, and every cell is topped up toward its target. */
  workLevee(grow: number, dt: number): void {
    const L = this.levee; if (!L) return;
    L.build = Math.min(1, L.build + grow);
    const { h, hard } = this.t;
    L.cells.forEach((k, n) => {
      const top = L.base[n] + L.height * L.build;
      if (h[k] < top) { h[k] = Math.min(top, h[k] + dt * 0.8); hard[k] = Math.min(hard[k], 0.5); }
    });
  }

  update(dt: number, p: Particles, w: Float32Array, nearW: (x: number, y: number) => number): JobCue[] {
    const cues: JobCue[] = [];
    const { nx, h, hard } = this.t;
    // beaver dam: build up (raising terrain), then track how much of it the water has worn away
    const dam = this.dam;
    if (dam && !dam.broken) {
      if (dam.build < 1 && dam.rate > 0) {
        const step = Math.min(1 - dam.build, dt * dam.rate);
        dam.build += step;
        dam.cells.forEach((k, n) => { const add = dam.height * step; h[k] += add; dam.added[n] += add; hard[k] = Math.min(hard[k], dam.kind === 'gate' ? 0.2 : 0.6); });
      }
      let left = 0, total = 0;
      dam.cells.forEach((k, n) => { total += dam.added[n]; left += Math.max(0, Math.min(dam.added[n], h[k] - dam.base[n])); });
      dam.health = total > 0 ? left / total : 1;
      if (dam.build >= 1 && dam.health < 0.5) { dam.broken = true; this.damsBroken++; cues.push({ type: 'damBroken' }); }
    }
    this.acc += dt;
    if (this.acc < 0.5) return this.progress(cues);
    const step = this.acc; this.acc = 0;
    // mills: who is passing the wheel, and are they the right kind of water?
    for (const m of this.mills) {
      let n = 0, vol = 0, sp = 0;
      for (let q = 0; q < p.n; q++) {
        const dx = p.x[q] - m.x, dy = p.y[q] - m.y;
        if (dx * dx + dy * dy > 12) continue;
        n++; vol += p.vol[q]; sp += Math.hypot(p.vx[q], p.vy[q]);
      }
      vol = n ? vol / n : 0; sp = n ? sp / n : 0;
      const enough = Math.min(1, n / 8);
      m.fit = m.kind === 'grist' ? enough * Math.min(1, Math.max(0, (vol - 0.3) / 0.14)) : enough * Math.min(1, Math.max(0, (sp - 3) / 2.5));
      m.spin = enough * (0.3 + 0.7 * m.fit);
      m.output += m.fit * step; m.fitS += m.fit * step;
      const turning = m.fit > 0.6;
      if (turning && !this.wasTurning[m.kind]) cues.push({ type: 'millTurning', kind: m.kind });
      this.wasTurning[m.kind] = turning;
    }
    // village: flooding when water stands among the houses
    const v = this.village;
    let wet = 0, cnt = 0;
    for (let j = v.y - v.r; j <= v.y + v.r; j++) for (let i = v.x - v.r; i <= v.x + v.r; i++) { wet += w[j * nx + i] ?? 0; cnt++; }
    v.wet = wet / cnt;
    if (v.wet > 0.12 && (this.objective?.kind === 'village' || this.watchVillage)) { v.floodS += step; v.floodBlockS += step; if (!this.floodCued) { this.floodCued = true; cues.push({ type: 'flooding' }); } } else this.floodCued = false;
    // fields: grow with water beside them, ruined while drowned
    for (const f of this.fields) {
      let own = 0, c = 0;
      for (let j = Math.round(f.y - f.r); j <= f.y + f.r; j++) for (let i = Math.round(f.x - f.r); i <= f.x + f.r; i++) { own += w[j * nx + i] ?? 0; c++; }
      own /= c;
      f.drowned = own > 0.15;
      f.wet = !f.drowned && nearW(f.x, f.y) > 0.08;
      if (f.drowned) { f.growth = Math.max(0, f.growth - step / 20); this.drownedS += step; }
      else if (f.wet) {
        f.growth += step / 120;
        if (f.growth >= 1) { f.growth = 0; f.harvests++; this.harvests++; cues.push({ type: 'harvest' }); }
      }
    }
    return this.progress(cues);
  }

  private progress(cues: JobCue[]): JobCue[] {
    const o = this.objective;
    if (!o || o.state !== 'active') return cues;
    const goalS = this.blockS * 0.35;
    if (o.kind === 'grist' || o.kind === 'saw') o.progress = Math.min(1, this.mills.find((m) => m.kind === o.kind)!.fitS / goalS);
    else if (o.kind === 'dam') o.progress = this.dam ? (this.dam.broken ? 1 : 1 - this.dam.health) : 0;
    else if (o.kind === 'fields') o.progress = Math.min(1, (this.harvests - this.fieldsAtStart) / 2 + this.fields.filter((f) => f.wet).length * 0.1);
    else if (o.kind === 'village') o.progress = Math.max(0, 1 - this.village.floodBlockS / 10);
    if (o.progress >= 1 && o.kind !== 'village') { o.state = 'done'; this.objectivesDone++; cues.push({ type: 'objectiveDone', kind: o.kind as ObjectiveKind }); }
    return cues;
  }
}
