import { describe, expect, it } from 'vitest';
import { makeRng } from '../../../core';
import { DEFAULT_SALMON, SalmonRun, type SalmonCue } from '../sim/salmon';
import { makeTerrain, NX, NY } from '../sim/terrain';

/** A straight river down the middle of a flat-ish valley, 1 deep. */
function setup(seed = 1) {
  const t = makeTerrain(seed);
  const w = new Float32Array(NX * NY);
  for (let j = 0; j < NY; j++) for (let i = NX / 2 - 3; i <= NX / 2 + 3; i++) w[j * NX + i] = 1;
  // flatten the ridges along the channel so there are no falls unless a test adds them
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) t.h[j * NX + i] = 20 * (1 - j / NY) - 2;
  const s = new SalmonRun(t, makeRng(seed));
  s.updatePath(w);
  return { t, w, s };
}
const P = { ...DEFAULT_SALMON, introS: 0, introNextS: 0 };
const run = (s: SalmonRun, w: Float32Array, secs: number, inp: Partial<Parameters<SalmonRun['update']>[2]> = {}) => {
  const cues: SalmonCue[] = [];
  for (let i = 0; i < secs * 30; i++) cues.push(...s.update(1 / 30, w, { cadence: 95, cadNorm: 0.7, steer: 0, nudge: 0, autopilot: false, mayRestart: false, ...inp }, P));
  return cues;
};

describe('salmon run', () => {
  it('traces the river centreline from the depth grid', () => {
    const { s } = setup();
    expect(s.px[40]).toBeCloseTo(NX / 2, 0);
    expect(s.pw[40]).toBeGreaterThanOrEqual(1.5);
  });
  it('swims upstream and gets home faster at higher cadence', () => {
    const a = setup(), b = setup();
    a.s.start(10, P); b.s.start(10, P);
    run(a.s, a.w, 30, { cadNorm: 1 }); run(b.s, b.w, 30, { cadNorm: 0.2 });
    expect(a.s.y).toBeLessThan(b.s.y);
    const cues = run(a.s, a.w, 120, { cadNorm: 1, autopilot: true });
    expect(cues.some((c) => c.type === 'home')).toBe(true);
    expect(a.s.home).toBeGreaterThan(0);
  });
  it('the autopilot dodges far better than holding the middle', () => {
    const a = setup(3), b = setup(3);
    a.s.start(16, P); b.s.start(16, P);
    run(a.s, a.w, 150, { autopilot: true }); run(b.s, b.w, 150);
    expect(a.s.lost).toBeLessThan(b.s.lost);
    expect(b.s.lost).toBeGreaterThan(0);
  });
  it('holds the school still through the camera intro, then says go', () => {
    const { w, s } = setup();
    s.start(5, DEFAULT_SALMON);
    const y0 = s.y;
    const cues: SalmonCue[] = [];
    for (let i = 0; i < 30 * (DEFAULT_SALMON.introS - 0.5); i++) cues.push(...s.update(1 / 30, w, { cadence: 95, cadNorm: 0.7, steer: 0, nudge: 0, autopilot: false, mayRestart: false }, DEFAULT_SALMON));
    expect(s.y).toBe(y0); expect(s.predators.length).toBe(0); expect(cues).toEqual([]);
    for (let i = 0; i < 30; i++) cues.push(...s.update(1 / 30, w, { cadence: 95, cadNorm: 0.7, steer: 0, nudge: 0, autopilot: false, mayRestart: false }, DEFAULT_SALMON));
    expect(cues).toContainEqual({ type: 'go', run: 1 });
    expect(s.y).toBeLessThan(y0);
  });
  it('steering is in the fish frame: right = towards lower x', () => {
    const { w, s } = setup();
    s.start(5, P);
    const x0 = s.pos(s.y, s.lane).x;
    run(s, w, 0.5, { steer: 1 });
    expect(s.pos(s.y, s.lane).x).toBeLessThan(x0);
    const l0 = s.lane;
    run(s, w, 1 / 30, { nudge: -1 });                       // a left-hood click darts towards the fish's left
    expect(s.lane).toBeCloseTo(Math.min(1, l0 + DEFAULT_SALMON.shiftStep), 5);
  });
  it('falls stop the school until the rider spins past leapRpm', () => {
    const { t, w, s } = setup();
    s.start(5, P);
    const wall = Math.round(s.y) - 8;
    for (let j = 0; j <= wall; j++) for (let i = 0; i < NX; i++) t.h[j * NX + i] += 6; // a 6-unit step upstream
    const cues = run(s, w, 20, { cadence: 85 });
    expect(cues.some((c) => c.type === 'stuck')).toBe(true);
    const stuckAt = s.y;
    run(s, w, 5, { cadence: 85 });
    expect(s.y).toBeCloseTo(stuckAt, 3);
    const more = run(s, w, 5, { cadence: 100 });
    expect(more.some((c) => c.type === 'leap')).toBe(true);
    expect(s.y).toBeLessThan(stuckAt - 1);
  });
});
